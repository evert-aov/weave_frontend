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

  // Extract the primary font family (first token after the size) so fallback chains like
  // `"Calibri", "Times New Roman", serif` don't misclassify sans-serif headings as Times.
  const afterSize = font.replace(/^[\s\S]*?\d+(?:\.\d+)?(?:px|pt)(?:\s*\/\s*[\d.]+(?:px|pt|%)?)?\s*/i, '');
  const primaryFamily = (afterSize.split(',')[0] || font).replace(/["']/g, '').trim().toLowerCase();

  let family: ParsedPdfFont['family'] = 'helvetica';
  if (/\b(courier|consolas|monaco|monospace|menlo|jetbrains|fira\s*code|source\s*code)\b/i.test(primaryFamily)) {
    family = 'courier';
  } else if (/\b(calibri|arial|helvetica|inter|roboto|dm\s*sans|segoe|verdana|tahoma|open\s*sans|lato|montserrat|sans-serif)\b/i.test(primaryFamily)) {
    family = 'helvetica';
  } else if (/\b(times|georgia|garamond|palatino|cambria|book\s*antiqua|serif)\b/i.test(primaryFamily)) {
    family = 'times';
  } else if (/\b(courier|consolas|monaco|monospace|menlo)\b/i.test(font)) {
    family = 'courier';
  } else if (!/\bsans-serif\b/i.test(font) && /\b(times|georgia|garamond|palatino|cambria|serif)\b/i.test(font)) {
    family = 'times';
  }
  const result: ParsedPdfFont = { family, style, sizePt: Number.isFinite(sizePt) && sizePt > 0 ? Math.max(1, sizePt) : 11 };
  if (parsedFontCache.size < 256) parsedFontCache.set(font, result);
  return result;
}

interface ParsedRgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  navy: [0, 0, 128],
  silver: [192, 192, 192],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
};

function parseCssColorToRgb(raw?: string): ParsedRgb | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (!c || c === 'transparent' || c === 'none' || c === 'inherit' || c === 'initial' || c === 'unset' || c === 'auto') {
    return null;
  }
  if (NAMED_COLORS[c]) {
    const [r, g, b] = NAMED_COLORS[c];
    return { r, g, b, a: 1 };
  }
  const hex3 = /^#([0-9a-f]{3})$/.exec(c);
  if (hex3) {
    const h = hex3[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: 1,
    };
  }
  const hex6 = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (hex6) {
    const h = hex6[1];
    const a = hex6[2] ? parseInt(hex6[2], 16) / 255 : 1;
    if (a <= 0.01) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a,
    };
  }
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(c);
  if (rgbMatch) {
    const a = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1;
    if (!Number.isFinite(a) || a <= 0.01) return null;
    return {
      r: Math.min(255, Math.max(0, Math.round(Number(rgbMatch[1])))),
      g: Math.min(255, Math.max(0, Math.round(Number(rgbMatch[2])))),
      b: Math.min(255, Math.max(0, Math.round(Number(rgbMatch[3])))),
      a,
    };
  }
  return null;
}

async function loadPdfImageAsset(src: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  if (!src) return null;
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
    return { dataUrl: src, format: 'JPEG' };
  }
  if (src.startsWith('data:image/png')) {
    return { dataUrl: src, format: 'PNG' };
  }
  try {
    const response = await pdfDeadline(fetch(src), 'carga de imagen');
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(blob);
      });
      if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
        return { dataUrl, format: 'JPEG' };
      }
      if (dataUrl.startsWith('data:image/png')) {
        return { dataUrl, format: 'PNG' };
      }
    }
  } catch {
    // Fall back to HTMLImageElement + canvas conversion (e.g. WebP/GIF/SVG or test stub)
  }
  const img = await loadCanvasAsset(src);
  if (!img) return null;
  const htmlImg = img as HTMLImageElement;
  const w = htmlImg.naturalWidth || 1;
  const h = htmlImg.naturalHeight || 1;
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const ctx = temp.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = typeof temp.toDataURL === 'function' ? temp.toDataURL('image/png') : '';
  temp.width = temp.height = 0;
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png') ? { dataUrl, format: 'PNG' } : null;
}

function drawVectorPdfDecorations(pdf: any, list: PageDisplayList, pageWidthPt: number, pageHeightPt: number): void {
  const d = list.decorations;
  if (!d) return;
  const geom = d.geometry;
  const formattedPage = d.formattedPageNumber || String(d.pageIndex + 1);
  const formattedTotal = d.formattedTotalPages || String(d.totalPages);

  if (d.border && d.border.style !== 'none' && typeof pdf.line === 'function') {
    const b = d.border;
    const offsetPt = Math.max(0, b.offsetPx || 0) * PDF_PT_PER_PX;
    const strokePt = Math.max(0.75, b.widthPt || 1);
    const rgb = parseCssColorToRgb(b.color || '#1e293b') ?? { r: 30, g: 41, b: 59, a: 1 };
    if (typeof pdf.setDrawColor === 'function') pdf.setDrawColor(rgb.r, rgb.g, rgb.b);
    if (typeof pdf.setLineWidth === 'function') pdf.setLineWidth(strokePt);
    const x1 = offsetPt, y1 = offsetPt, x2 = pageWidthPt - offsetPt, y2 = pageHeightPt - offsetPt;
    if (b.top) pdf.line(x1, y1, x2, y1);
    if (b.bottom) pdf.line(x1, y2, x2, y2);
    if (b.left) pdf.line(x1, y1, x1, y2);
    if (b.right) pdf.line(x2, y1, x2, y2);
  }

  if (typeof pdf.text !== 'function') return;

  if (d.apa && !d.suppressHeaderFooter) {
    const apa = d.apa;
    const font = parseCanvasPdfFont(`${apa.fontSizePt}pt "${apa.fontFamily || 'Times New Roman'}"`);
    if (typeof pdf.setFont === 'function') pdf.setFont(font.family, 'normal');
    if (typeof pdf.setFontSize === 'function') pdf.setFontSize(font.sizePt);
    if (typeof pdf.setTextColor === 'function') pdf.setTextColor(0, 0, 0);
    const yPt = 48 * PDF_PT_PER_PX + font.sizePt;
    if (apa.mode === 'professional' && apa.runningHead) {
      pdf.text(toWinAnsiPdfText(apa.runningHead), geom.left * PDF_PT_PER_PX, yPt, { baseline: 'alphabetic' });
    }
    pdf.text(toWinAnsiPdfText(formattedPage), (list.width - geom.right) * PDF_PT_PER_PX, yPt, { baseline: 'alphabetic', align: 'right' });
  } else if (!d.suppressHeaderFooter && d.showHeaderFooter) {
    const muted = d.darkSheet ? { r: 148, g: 163, b: 184 } : { r: 100, g: 116, b: 139 };
    if (typeof pdf.setTextColor === 'function') pdf.setTextColor(muted.r, muted.g, muted.b);
    if (typeof pdf.setFont === 'function') pdf.setFont('helvetica', 'normal');
    if (typeof pdf.setFontSize === 'function') pdf.setFontSize(9);

    const headerY = Math.max(18, geom.top - 26) * PDF_PT_PER_PX + 9;
    const headerStr = d.headerLines?.length
      ? d.headerLines.map(l => l.runs.map(r => r.text).join('')).join(' ')
      : d.headerText || '';
    const resolvedHeader = headerStr.includes('{{')
      ? resolvePageDynamicTokens(headerStr, formattedPage, formattedTotal)
      : headerStr;
    if (resolvedHeader.trim()) {
      pdf.text(toWinAnsiPdfText(resolvedHeader.trim()), geom.left * PDF_PT_PER_PX, headerY, { baseline: 'alphabetic' });
    }

    const footerY = (list.height - Math.max(24, geom.bottom - 14)) * PDF_PT_PER_PX + 8;
    const footerStr = d.footerLines?.length
      ? d.footerLines.map(l => l.runs.map(r => r.text).join('')).join(' ')
      : d.footerText || '';
    const resolvedFooter = footerStr.includes('{{')
      ? resolvePageDynamicTokens(footerStr, formattedPage, formattedTotal)
      : footerStr;
    if (resolvedFooter.trim()) {
      pdf.text(toWinAnsiPdfText(resolvedFooter.trim()), geom.left * PDF_PT_PER_PX, footerY, { baseline: 'alphabetic' });
    }
    const pageNumLabel = `${d.pageLabel || 'Página'} ${formattedPage} ${d.ofLabel || 'de'} ${formattedTotal}`;
    if (typeof pdf.setFont === 'function') pdf.setFont('courier', 'normal');
    if (typeof pdf.setFontSize === 'function') pdf.setFontSize(8.25);
    pdf.text(toWinAnsiPdfText(pageNumLabel), (list.width - geom.right) * PDF_PT_PER_PX, footerY, { baseline: 'alphabetic', align: 'right' });
  }
}

const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const UNICODE_TO_WINANSI: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u2194': '<->',
  '\u21d2': '=>',
  '\u21d0': '<=',
  '\u21d4': '<=>',
  '\u25e6': '-',
  '\u25aa': '-',
  '\u25ab': '-',
  '\u25b8': '>',
  '\u25b9': '>',
  '\u2023': '>',
  '\u25cf': '\u2022',
  '\u25cb': 'o',
  '\u2212': '-',
  '\u2010': '-',
  '\u2011': '-',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u2248': '~',
  '\u2713': 'v',
  '\u2714': 'v',
  '\u2717': 'x',
  '\u2718': 'x',
  '\u00a0': ' ',
  '\u200b': '',
  '\ufeff': '',
};

/**
 * Convierte símbolos Unicode fuera de WinAnsi/CP1252 para evitar que las fuentes Type1
 * integradas de jsPDF cambien a modo UTF-16 corrupto (espaciado doble o caracteres `%æ`).
 */
export function toWinAnsiPdfText(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const mapped = UNICODE_TO_WINANSI[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code <= 0xff || CP1252_EXTRA.has(code)) {
      out += ch;
    } else {
      const stripped = ch.normalize('NFKD').replace(/[^\x20-\xff]/g, '');
      out += stripped || '?';
    }
  }
  return out;
}

function drawVectorPdfTextLayer(
  pdf: any,
  list: PageDisplayList,
): void {
  if (typeof pdf.text !== 'function') return;
  let lastFontKey = '';
  let lastSizePt = -1;
  let lastColorKey = '';
  let runText = '';
  let runFont = '';
  let runColor = '';
  let runX = 0;
  let runY = 0;
  let runEndX = 0;

  const flushRun = (): void => {
    if (!runText) return;
    const safeText = toWinAnsiPdfText(runText);
    runText = '';
    if (!safeText) return;

    const { family, style, sizePt } = parseCanvasPdfFont(runFont);
    const fontKey = `${family}:${style}`;
    if (fontKey !== lastFontKey) {
      if (typeof pdf.setFont === 'function') pdf.setFont(family, style);
      lastFontKey = fontKey;
    }

    let effectiveSizePt = sizePt;
    let charSpace: number | undefined;
    const targetWidthPt = runEndX > runX ? (runEndX - runX) * PDF_PT_PER_PX : 0;

    if (targetWidthPt > 0 && typeof pdf.getTextWidth === 'function') {
      if (effectiveSizePt !== lastSizePt) {
        if (typeof pdf.setFontSize === 'function') pdf.setFontSize(effectiveSizePt);
        lastSizePt = effectiveSizePt;
      }
      const actualWidthPt = Number(pdf.getTextWidth(safeText)) || 0;
      if (actualWidthPt > targetWidthPt * 1.02) {
        effectiveSizePt = Math.max(sizePt * 0.72, sizePt * (targetWidthPt / actualWidthPt));
      } else if (actualWidthPt > 0 && actualWidthPt < targetWidthPt * 0.98 && safeText.length > 1) {
        const extra = (targetWidthPt - actualWidthPt) / (safeText.length - 1);
        if (extra > 0.02) charSpace = Math.min(1.6, extra);
      }
    }

    if (effectiveSizePt !== lastSizePt) {
      if (typeof pdf.setFontSize === 'function') pdf.setFontSize(effectiveSizePt);
      lastSizePt = effectiveSizePt;
    }
    const rgb = parseCssColorToRgb(runColor) ?? { r: 15, g: 23, b: 42, a: 1 };
    const colorKey = `${rgb.r},${rgb.g},${rgb.b}`;
    if (colorKey !== lastColorKey) {
      if (typeof pdf.setTextColor === 'function') pdf.setTextColor(rgb.r, rgb.g, rgb.b);
      lastColorKey = colorKey;
    }
    const textOpts: Record<string, unknown> = { baseline: 'alphabetic' };
    if (charSpace !== undefined) textOpts['charSpace'] = Number(charSpace.toFixed(3));
    pdf.text(safeText, runX * PDF_PT_PER_PX, runY * PDF_PT_PER_PX, textOpts);
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
    const cmdColor = cmd.color || '#0f172a';
    const cmdWidth = cmd.source?.width ?? cmd.advanceWidth ?? 0;
    const canCoalesce =
      Boolean(runText) &&
      cmdFont === runFont &&
      cmdColor === runColor &&
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
    runColor = cmdColor;
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
  const pdf: any = new jsPDF({ unit: 'pt', format: [1, 1], compress: true });
  const assetCache = new Map<string, { dataUrl: string; format: 'PNG' | 'JPEG' } | null>();

  const isBgRect = (cmd: PageDisplayList['commands'][number]): boolean =>
    cmd.kind === 'rect' && cmd.width > 4 && cmd.height > 4;

  const drawRect = (x: number, y: number, w: number, h: number, color: string) => {
    if (w <= 0 || h <= 0 || typeof pdf.rect !== 'function') return;
    const rgb = parseCssColorToRgb(color);
    if (!rgb) return;
    if (typeof pdf.setFillColor === 'function') pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    pdf.rect(x * PDF_PT_PER_PX, y * PDF_PT_PER_PX, w * PDF_PT_PER_PX, h * PDF_PT_PER_PX, 'F');
  };

  for (let index = 0; index < displayLists.length; index++) {
    progress(`Exportando página ${index + 1} de ${displayLists.length}…`);
    const list = displayLists[index];
    const pageWidth = list.width > 0 ? list.width : width;
    const pageHeight = list.height > 0 ? list.height : height;
    const pageWidthPt = pageWidth * PDF_PT_PER_PX;
    const pageHeightPt = pageHeight * PDF_PT_PER_PX;
    const pageOrientation = pageWidth > pageHeight ? 'landscape' : 'portrait';

    pdf.addPage([pageWidthPt, pageHeightPt], pageOrientation);

    // 1. Page background fill (if non-white)
    const bgColor = list.backgroundColor || (list.decorations?.darkSheet ? '#18181b' : '');
    if (bgColor && bgColor !== '#fff' && bgColor !== '#ffffff') {
      drawRect(0, 0, pageWidth, pageHeight, bgColor);
    }

    // 2. Decorations (page border, header, footer, page numbers)
    drawVectorPdfDecorations(pdf, list, pageWidthPt, pageHeightPt);

    // 3. Background fills (table cells, callouts, highlights)
    for (const cmd of list.commands) {
      if (cmd.kind === 'rect' && isBgRect(cmd)) {
        drawRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.color);
      }
    }

    // 4. Embedded images (deduplicated by assetId alias)
    for (const cmd of list.commands) {
      if (cmd.kind !== 'image') continue;
      if (!assetCache.has(cmd.assetId)) {
        assetCache.set(cmd.assetId, await loadPdfImageAsset(cmd.assetId));
      }
      const asset = assetCache.get(cmd.assetId);
      if (asset) {
        pdf.addImage(
          asset.dataUrl,
          asset.format,
          cmd.x * PDF_PT_PER_PX,
          cmd.y * PDF_PT_PER_PX,
          cmd.width * PDF_PT_PER_PX,
          cmd.height * PDF_PT_PER_PX,
          cmd.assetId,
          'MEDIUM',
        );
      }
    }

    // 5. Thin vector rectangles (table borders, underlines, horizontal rules)
    for (const cmd of list.commands) {
      if (cmd.kind === 'rect' && !isBgRect(cmd)) {
        drawRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.color);
      }
    }

    // 6. Crisp native vector text (100% selectable & searchable)
    drawVectorPdfTextLayer(pdf, list);

    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  progress('Preparando la descarga…');
  pdf.deletePage(1);
  applyCanvasPdfNavigation(pdf, displayLists);
  return pdf.output('blob');
}
