import {
  CanvasPageRenderer,
  type PageDisplayList,
  type PdfInternalLinkRect,
  type PdfOutlineHeading,
} from '../engine/canvas-page-renderer';
import { resolvePageDynamicTokens } from '../utils/page-section-layout';

/** Snapshot the laid out sheets without changing the editor's DOM or scroll position. */
export function snapshotWordSheets(sheets: HTMLElement[]): HTMLElement[] {
  return sheets.map(sheet => {
    const clone = sheet.cloneNode(true) as HTMLElement;
    const sourceNodes = [sheet, ...sheet.querySelectorAll('*')];
    const clonedNodes = [clone, ...clone.querySelectorAll('*')];
    sourceNodes.forEach((source, index) => {
      const target = clonedNodes[index] as HTMLElement | SVGElement;
      const computed = getComputedStyle(source);
      for (const property of Array.from(computed)) {
        target.style.setProperty(property, computed.getPropertyValue(property), 'important');
      }
      target.removeAttribute('id');
      target.removeAttribute('contenteditable');
      if (source instanceof HTMLImageElement) (target as HTMLImageElement).src = source.currentSrc || source.src;
    });
    clone.querySelectorAll('.no-print').forEach(element => element.remove());
    for (const [name, value] of Object.entries({ transform: 'none', zoom: '1', margin: '0', position: 'relative', top: '0', left: '0', boxShadow: 'none', outline: 'none', borderColor: 'transparent' })) {
      const property = name.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      clone.style.setProperty(property, value, 'important');
    }
    return clone;
  });
}

/** Every async resource has a deadline; export must never leave the UI pending forever. */
export async function pdfDeadline<T>(task: Promise<T>, label: string, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tiempo agotado: ${label}. Intenta exportar nuevamente.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer!); }
}

async function embedImages(sheet: HTMLElement): Promise<void> {
  await Promise.all(Array.from(sheet.querySelectorAll('img')).map(async image => {
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.removeAttribute('loading');
    if (image.src.startsWith('data:')) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(image.src, { signal: controller.signal });
      if (!response.ok) throw new Error('No se pudo cargar una imagen del documento.');
      const blob = await response.blob();
      image.src = await pdfDeadline(new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }), 'preparación de imagen');
    } finally { clearTimeout(timer); }
  }));
}

/** Render the styled XHTML directly, without another document clone or stylesheet reload. */
export async function rasterizeWordSheet(sheet: HTMLElement, width: number, height: number): Promise<HTMLCanvasElement> {
  const markup = new XMLSerializer().serializeToString(sheet);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${markup}</foreignObject></svg>`;
  const image = new Image();
  try {
    await pdfDeadline(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('El navegador no pudo dibujar la hoja para PDF.'));
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }), 'renderizado de la hoja');
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo crear la imagen del PDF.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    image.onload = image.onerror = null;
    image.src = '';
  }
}

export async function renderWordPdf(
  sheets: HTMLElement[],
  progress: (message: string) => void = () => {},
  navigation?: PdfNavigationData,
): Promise<Blob> {
  if (!sheets.length) throw new Error('No hay hojas listas para exportar.');
  progress('Preparando el generador PDF…');
  const { jsPDF } = await pdfDeadline(import('jspdf'), 'carga del generador PDF');
  const pdf = new jsPDF({ unit: 'pt', format: [1, 1], compress: true });
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index];
    const width = parseFloat(sheet.style.width), height = parseFloat(sheet.style.height);
    if (!(width > 0 && height > 0)) throw new Error('La hoja no tiene dimensiones válidas para PDF.');
    progress(`Exportando página ${index + 1} de ${sheets.length}…`);
    await embedImages(sheet);
    const canvas = await rasterizeWordSheet(sheet, width, height);
    try {
      const widthPt = width * 0.75, heightPt = height * 0.75;
      pdf.addPage([widthPt, heightPt], width > height ? 'landscape' : 'portrait');
      pdf.addImage(canvas, 'PNG', 0, 0, widthPt, heightPt, undefined, 'FAST');
    } finally { canvas.width = canvas.height = 0; }
    // Timers also advance when the tab is in the background, unlike animation frames.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  progress('Preparando la descarga…');
  pdf.deletePage(1);
  if (navigation) {
    applyPdfNavigation(pdf, sheets.length, navigation.linksByPage, navigation.headings);
  }
  return pdf.output('blob');
}

async function loadCanvasAsset(src: string): Promise<CanvasImageSource | null> {
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  try {
    await pdfDeadline(new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo cargar una imagen del documento.'));
      img.src = src;
    }), 'carga de imagen');
    return img.naturalWidth > 0 ? img : null;
  } catch {
    return null;
  }
}

export interface PdfNavigationData {
  linksByPage: PdfInternalLinkRect[][];
  headings: PdfOutlineHeading[];
}

export interface PdfNavigationTarget {
  setPage?: (pageNumber: number) => unknown;
  link?: (x: number, y: number, w: number, h: number, options: { pageNumber: number }) => unknown;
  outline?: {
    add?: (parent: unknown, title: string, options: { pageNumber: number }) => unknown;
  };
}

const PDF_PT_PER_PX = 0.75;

function normalizeDomHeadingText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInsideDomToc(el: Element): boolean {
  return Boolean(
    el.closest('.word-toc-page-section, .word-toc-entry, .word-toc-table, [data-word-flow*="toc"]'),
  );
}

/** Extracts clickable internal link rectangles and hierarchical outline headings from live DOM sheets before cloning. */
export function extractDomPdfNavigation(sheets: HTMLElement[]): PdfNavigationData {
  const linksByPage: PdfInternalLinkRect[][] = Array.from({ length: sheets.length }, () => []);
  const headings: PdfOutlineHeading[] = [];
  if (!sheets.length) return { linksByPage, headings };

  const pageById = new Map<string, number>();
  const pageByTitle = new Map<string, number>();
  const headingEntries: Array<{ normalized: string; pageIndex: number }> = [];

  sheets.forEach((sheet, pageIndex) => {
    sheet.querySelectorAll('[id], [data-word-object-id]').forEach(el => {
      if (isInsideDomToc(el)) return;
      const id = el.getAttribute('id') || el.getAttribute('data-word-object-id');
      if (id && !pageById.has(id)) pageById.set(id, pageIndex);
    });
    sheet
      .querySelectorAll('h1, h2, h3, h4, h5, h6, [data-apa-heading-level], [data-apa-run-in], .word-chapter-heading')
      .forEach(el => {
        if (isInsideDomToc(el)) return;
        const title = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!title) return;
        let level = 1;
        if (/^h[1-6]$/i.test(el.tagName)) level = Number(el.tagName.slice(1));
        else if (el.hasAttribute('data-apa-heading-level')) {
          level = Number(el.getAttribute('data-apa-heading-level')) || 1;
        } else if (el.hasAttribute('data-apa-run-in')) {
          level = Number(el.getAttribute('data-apa-run-in')) || 4;
        } else if (el.classList.contains('word-chapter-heading')) {
          level = 0;
        }
        level = Math.max(0, Math.min(6, level));
        headings.push({ title, level, pageIndex });
        const normalized = normalizeDomHeadingText(title);
        if (normalized && !pageByTitle.has(normalized)) {
          pageByTitle.set(normalized, pageIndex);
          headingEntries.push({ normalized, pageIndex });
        }
      });
  });

  const resolveDomTargetPage = (targetId?: string, title?: string, fallbackPage?: number): number | null => {
    if (targetId) {
      const cleanId = targetId.replace(/^#/, '');
      const hit = pageById.get(cleanId);
      if (hit !== undefined) return hit;
    }
    if (title) {
      const normalized = normalizeDomHeadingText(title);
      if (normalized) {
        const exact = pageByTitle.get(normalized);
        if (exact !== undefined) return exact;
        if (normalized.length >= 3) {
          const partial = headingEntries.find(
            entry =>
              entry.normalized.includes(normalized) ||
              (entry.normalized.length >= 3 && normalized.includes(entry.normalized)),
          );
          if (partial) return partial.pageIndex;
        }
      }
    }
    if (fallbackPage !== undefined && Number.isFinite(fallbackPage)) {
      return Math.max(0, Math.min(sheets.length - 1, Math.trunc(fallbackPage)));
    }
    return null;
  };

  sheets.forEach((sheet, pageIndex) => {
    const sheetRect = sheet.getBoundingClientRect();
    const seen = new Set<Element>();
    const addLinkForElement = (el: Element, targetPageIndex: number, title?: string): void => {
      const rect = el.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;
      linksByPage[pageIndex].push({
        x: rect.left - sheetRect.left,
        y: rect.top - sheetRect.top,
        width: rect.width,
        height: rect.height,
        targetPageIndex,
        ...(title ? { title } : {}),
      });
    };

    sheet.querySelectorAll('.word-toc-entry').forEach(entry => {
      seen.add(entry);
      const anchor = entry.querySelector('a[href^="#"]');
      const targetId =
        entry.getAttribute('data-toc-target-id') || anchor?.getAttribute('href')?.slice(1) || undefined;
      const titleEl = entry.querySelector('.word-toc-title');
      const title = (titleEl?.textContent || entry.textContent || '').replace(/\s+/g, ' ').trim();
      const attrPage = entry.getAttribute('data-toc-page');
      const parsedAttr = attrPage !== null && attrPage !== '' ? Number(attrPage) : NaN;
      const pageElText = entry.querySelector('.word-toc-page')?.textContent || '';
      const pageMatch = /(\d{1,5})/.exec(pageElText);
      const fallback = Number.isFinite(parsedAttr)
        ? parsedAttr
        : pageMatch
          ? Number(pageMatch[1]) - 1
          : undefined;
      const resolved = resolveDomTargetPage(targetId, title, fallback);
      if (resolved !== null) addLinkForElement(entry, resolved, title || undefined);
    });

    sheet.querySelectorAll('a[href^="#"]').forEach(anchor => {
      if (anchor.closest('.word-toc-entry') && seen.has(anchor.closest('.word-toc-entry')!)) return;
      const href = (anchor.getAttribute('href') || '').trim();
      if (href.length <= 1) return;
      const title = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
      const resolved = resolveDomTargetPage(href.slice(1), title);
      if (resolved !== null) addLinkForElement(anchor, resolved, title || undefined);
    });
  });

  return { linksByPage, headings };
}

/**
 * Adds clickable internal PDF link annotations and hierarchical PDF outline bookmarks.
 * Must be called after `pdf.deletePage(1)` so 1-based page numbers match the final document.
 */
export function applyPdfNavigation(
  pdf: PdfNavigationTarget,
  totalPages: number,
  linksByPage: readonly (readonly PdfInternalLinkRect[] | undefined)[],
  headings?: readonly PdfOutlineHeading[],
): void {
  if (totalPages <= 0) return;

  if (typeof pdf.setPage === 'function' && typeof pdf.link === 'function') {
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const links = linksByPage[pageIndex];
      if (!links?.length) continue;
      pdf.setPage(pageIndex + 1);
      for (const rect of links) {
        if (!(rect.width > 0 && rect.height > 0)) continue;
        const targetPageNumber = Math.max(1, Math.min(totalPages, Math.trunc(rect.targetPageIndex) + 1));
        pdf.link(
          rect.x * PDF_PT_PER_PX,
          rect.y * PDF_PT_PER_PX,
          rect.width * PDF_PT_PER_PX,
          rect.height * PDF_PT_PER_PX,
          { pageNumber: targetPageNumber },
        );
      }
    }
  }

  if (headings?.length && pdf.outline && typeof pdf.outline.add === 'function') {
    const stack: Array<{ level: number; item: unknown }> = [];
    for (const heading of headings) {
      const title = heading.title.trim();
      if (!title) continue;
      const level = Number.isFinite(heading.level) ? Math.max(0, Math.min(6, Math.trunc(heading.level))) : 1;
      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parent = stack.length ? stack[stack.length - 1].item : null;
      const targetPageNumber = Math.max(1, Math.min(totalPages, Math.trunc(heading.pageIndex) + 1));
      const item = pdf.outline.add(parent, title, { pageNumber: targetPageNumber });
      stack.push({ level, item });
    }
  }
}

/** Attaches Canvas display list TOC/anchor links and heading bookmarks onto a jsPDF document. */
export function applyCanvasPdfNavigation(
  pdf: PdfNavigationTarget,
  displayLists: readonly PageDisplayList[],
): void {
  applyPdfNavigation(
    pdf,
    displayLists.length,
    displayLists.map(list => list.pdfLinks),
    displayLists.find(list => list.pdfHeadings?.length)?.pdfHeadings,
  );
}

type ParsedPdfFont = {
  family: 'times' | 'helvetica' | 'courier';
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
  sizePt: number;
};

const parsedFontCache = new Map<string, ParsedPdfFont>();

function parseCanvasPdfFont(font: string): ParsedPdfFont {
  const cached = parsedFontCache.get(font);
  if (cached) return cached;
  const pxMatch = /(\d+(?:\.\d+)?)px/i.exec(font);
  const ptMatch = /(\d+(?:\.\d+)?)pt/i.exec(font);
  const sizePt = pxMatch ? Number(pxMatch[1]) * PDF_PT_PER_PX : ptMatch ? Number(ptMatch[1]) : 11;
  const bold = /\b(bold|[6-9]00)\b/i.test(font);
  const italic = /\b(italic|oblique)\b/i.test(font);
  const style: ParsedPdfFont['style'] = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
  let family: ParsedPdfFont['family'] = 'helvetica';
  if (/\b(courier|consolas|monaco|monospace|menlo)\b/i.test(font)) family = 'courier';
  else if (!/\bsans-serif\b/i.test(font) && /\b(times|georgia|garamond|palatino|cambria|serif)\b/i.test(font)) family = 'times';
  const result: ParsedPdfFont = { family, style, sizePt: Number.isFinite(sizePt) && sizePt > 0 ? Math.max(1, sizePt) : 11 };
  if (parsedFontCache.size < 256) parsedFontCache.set(font, result);
  return result;
}

function drawSearchablePdfTextLayer(
  pdf: {
    setFont?: (fontName: string, fontStyle?: string) => unknown;
    setFontSize?: (size: number) => unknown;
    text?: (text: string, x: number, y: number, options?: { baseline?: 'alphabetic'; renderingMode?: 'invisible' }) => unknown;
  },
  list: PageDisplayList,
): void {
  if (typeof pdf.text !== 'function') return;
  let lastFontKey = '';
  let lastSizePt = -1;
  let runText = '';
  let runFont = '';
  let runX = 0;
  let runY = 0;
  let runEndX = 0;

  const flushRun = (): void => {
    if (!runText) return;
    const { family, style, sizePt } = parseCanvasPdfFont(runFont);
    const fontKey = `${family}:${style}`;
    if (fontKey !== lastFontKey) {
      if (typeof pdf.setFont === 'function') pdf.setFont(family, style);
      lastFontKey = fontKey;
    }
    if (sizePt !== lastSizePt) {
      if (typeof pdf.setFontSize === 'function') pdf.setFontSize(sizePt);
      lastSizePt = sizePt;
    }
    pdf.text!(runText, runX * PDF_PT_PER_PX, runY * PDF_PT_PER_PX, {
      baseline: 'alphabetic',
      renderingMode: 'invisible',
    });
    runText = '';
  };

  for (const cmd of list.commands) {
    if (cmd.kind !== 'text' || !cmd.text) continue;
    const rawText =
      list.decorations && cmd.text.includes('{{')
        ? resolvePageDynamicTokens(
            cmd.text,
            list.decorations.formattedPageNumber || String(list.decorations.pageIndex + 1),
            list.decorations.formattedTotalPages || String(list.decorations.totalPages),
          )
        : cmd.text;
    const cmdFont = cmd.font || '';
    const cmdWidth = cmd.source?.width ?? cmd.advanceWidth ?? 0;
    const canCoalesce =
      Boolean(runText) &&
      cmdFont === runFont &&
      Math.abs(cmd.y - runY) <= 0.5 &&
      runEndX > runX &&
      cmdWidth > 0 &&
      Math.abs(cmd.x - runEndX) <= 2;

    if (canCoalesce) {
      runText += rawText;
      runEndX = cmd.x + cmdWidth;
      continue;
    }

    flushRun();
    runText = rawText;
    runFont = cmdFont;
    runX = cmd.x;
    runY = cmd.y;
    runEndX = cmdWidth > 0 ? cmd.x + cmdWidth : cmd.x;
  }
  flushRun();
}

export async function renderWordCanvasPdf(
  displayLists: PageDisplayList[],
  width: number,
  height: number,
  progress: (message: string) => void = () => {}
): Promise<Blob> {
  if (!displayLists.length) throw new Error('No hay hojas listas para exportar.');
  if (!(width > 0 && height > 0)) throw new Error('La hoja no tiene dimensiones válidas para PDF.');
  progress('Preparando el generador PDF…');
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const { jsPDF } = await pdfDeadline(import('jspdf'), 'carga del generador PDF');
  const pdf = new jsPDF({ unit: 'pt', format: [1, 1], compress: true });
  const renderer = new CanvasPageRenderer();
  const assetCache = new Map<string, CanvasImageSource | null>();
  const canvas = document.createElement('canvas');

  try {
    for (let index = 0; index < displayLists.length; index++) {
      progress(`Exportando página ${index + 1} de ${displayLists.length}…`);
      const list = displayLists[index];
      const pageWidth = list.width > 0 ? list.width : width;
      const pageHeight = list.height > 0 ? list.height : height;
      const pageWidthPt = pageWidth * PDF_PT_PER_PX;
      const pageHeightPt = pageHeight * PDF_PT_PER_PX;
      const pageOrientation = pageWidth > pageHeight ? 'landscape' : 'portrait';
      const assets = new Map<string, CanvasImageSource>();
      for (const cmd of list.commands) {
        if (cmd.kind !== 'image') continue;
        if (!assetCache.has(cmd.assetId)) {
          assetCache.set(cmd.assetId, await loadCanvasAsset(cmd.assetId));
        }
        const loaded = assetCache.get(cmd.assetId);
        if (loaded) assets.set(cmd.assetId, loaded);
      }

      renderer.render(canvas, { ...list, caret: undefined, selections: [], assets }, 1, 2);
      pdf.addPage([pageWidthPt, pageHeightPt], pageOrientation);
      const jpegDataUrl = typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/jpeg', 0.92) : '';
      if (typeof jpegDataUrl === 'string' && jpegDataUrl.startsWith('data:image/jpeg')) {
        pdf.addImage(jpegDataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST');
      } else {
        pdf.addImage(canvas, 'PNG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST');
      }
      drawSearchablePdfTextLayer(pdf, list);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally {
    canvas.width = canvas.height = 0;
  }
  progress('Preparando la descarga…');
  pdf.deletePage(1);
  applyCanvasPdfNavigation(pdf, displayLists);
  return pdf.output('blob');
}
