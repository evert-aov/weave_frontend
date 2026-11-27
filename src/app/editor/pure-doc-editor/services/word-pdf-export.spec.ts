import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasEditSession } from '../engine/canvas-edit-session';
import { attachCanvasPdfNavigation } from '../engine/canvas-pdf-links';
import { pdfDeadline, renderWordCanvasPdf, renderWordPdf, snapshotWordSheets, toWinAnsiPdfText } from './word-pdf-export';

const pdfCalls = vi.hoisted(() => {
  const outlineAdd = vi.fn((_parent: unknown, title: string, options: { pageNumber: number }) => ({
    title,
    options,
    children: [],
  }));
  return {
    addPage: vi.fn(),
    addImage: vi.fn(),
    deletePage: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    text: vi.fn(),
    setPage: vi.fn(),
    link: vi.fn(),
    outlineAdd,
  };
});
vi.mock('jspdf', () => ({ jsPDF: class {
  addPage = pdfCalls.addPage;
  addImage = pdfCalls.addImage;
  deletePage = pdfCalls.deletePage;
  setFont = pdfCalls.setFont;
  setFontSize = pdfCalls.setFontSize;
  setTextColor = pdfCalls.setTextColor;
  setFillColor = pdfCalls.setFillColor;
  setDrawColor = pdfCalls.setDrawColor;
  setLineWidth = pdfCalls.setLineWidth;
  rect = pdfCalls.rect;
  line = pdfCalls.line;
  text = pdfCalls.text;
  setPage = pdfCalls.setPage;
  link = pdfCalls.link;
  outline = { add: pdfCalls.outlineAdd };
  output() { return new Blob(['%PDF-1.4']); }
} }));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Word PDF layout snapshot', () => {
  it('preserves sheet and table dimensions without mutating the zoomed editable document', () => {
    const host = document.createElement('div');
    host.style.transform = 'scale(1.5)';
    host.innerHTML = '<section style="width:816px;height:1056px;padding:48px;box-sizing:border-box"><button class="no-print">Eliminar</button><table style="width:600px"><tr style="height:27px"><td contenteditable="true" style="padding:2px 4px;width:120px"><p style="margin:0;line-height:16px">10:00</p></td></tr></table></section>';
    document.body.append(host);
    const sheet = host.firstElementChild as HTMLElement;
    const original = host.outerHTML;
    const [clone] = snapshotWordSheets([sheet]);
    expect(clone.style.width).toBe('816px');
    expect(clone.style.height).toBe('1056px');
    for (const selector of ['table', 'tr', 'td', 'p']) {
      const source = sheet.querySelector(selector)!;
      const copy = clone.querySelector(selector) as HTMLElement;
      for (const property of ['width', 'height', 'padding-top', 'padding-bottom', 'line-height']) {
        expect(copy.style.getPropertyValue(property)).toBe(getComputedStyle(source).getPropertyValue(property));
      }
    }
    expect(clone.querySelector('.no-print')).toBeNull();
    expect(clone.querySelector('[contenteditable]')).toBeNull();
    expect(host.outerHTML).toBe(original);
  });

  it('finishes a multipage export without waiting for animation frames or loading app stylesheets', async () => {
    vi.stubGlobal('requestAnimationFrame', () => { throw new Error('background tab cannot advance'); });
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(),
    } as any);
    const sheets = Array.from({ length: 2 }, () => {
      const sheet = document.createElement('section');
      sheet.style.cssText = 'width:816px;height:1056px';
      return sheet;
    });
    const progress = vi.fn();
    const pdf = await renderWordPdf(sheets, progress);
    expect(pdf.size).toBeGreaterThan(0);
    expect(pdfCalls.addPage).toHaveBeenCalledTimes(2);
    expect(pdfCalls.addPage).toHaveBeenCalledWith([612, 792], 'portrait');
    expect(pdfCalls.addImage).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith('Exportando página 2 de 2…');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('reports a rejected browser image load instead of waiting forever', async () => {
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); }
    });
    const sheet = document.createElement('section');
    sheet.style.cssText = 'width:816px;height:1056px';
    await expect(renderWordPdf([sheet])).rejects.toThrow('El navegador no pudo dibujar');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('bounds an unresponsive resource and clears its timeout', async () => {
    vi.useFakeTimers();
    const pending = pdfDeadline(new Promise(() => {}), 'imagen', 100);
    const assertion = expect(pending).rejects.toThrow('Tiempo agotado: imagen');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders Canvas display lists with an invisible searchable/selectable PDF text layer', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      textBaseline: 'alphabetic',
    } as any);
    const progress = vi.fn();
    const pdf = await renderWordCanvasPdf(
      [
        {
          id: 'p1',
          revision: 1,
          width: 816,
          height: 1056,
          commands: [
            { kind: 'text', text: 'Capítulo 1', x: 96, y: 120, font: 'bold 16px "Times New Roman"', color: '#000' },
            { kind: 'text', text: 'Contenido APA.', x: 96, y: 160, font: 'italic 16px Arial', color: '#000' },
          ],
        },
        {
          id: 'p2',
          revision: 1,
          width: 816,
          height: 1056,
          commands: [
            { kind: 'text', text: 'Segunda página', x: 96, y: 120, font: '12px "Courier New", monospace', color: '#000' },
          ],
        },
      ],
      816,
      1056,
      progress,
    );
    expect(pdf.size).toBeGreaterThan(0);
    expect(pdfCalls.addPage).toHaveBeenCalledTimes(2);
    expect(pdfCalls.addImage).not.toHaveBeenCalled();
    expect(pdfCalls.setFont).toHaveBeenNthCalledWith(1, 'times', 'bold');
    expect(pdfCalls.setFont).toHaveBeenNthCalledWith(2, 'helvetica', 'italic');
    expect(pdfCalls.setFont).toHaveBeenNthCalledWith(3, 'courier', 'normal');
    expect(pdfCalls.setFontSize).toHaveBeenCalledWith(12);
    expect(pdfCalls.setFontSize).toHaveBeenCalledWith(9);
    expect(pdfCalls.text).toHaveBeenNthCalledWith(1, 'Capítulo 1', 72, 90, { baseline: 'alphabetic' });
    expect(pdfCalls.text).toHaveBeenNthCalledWith(2, 'Contenido APA.', 72, 120, { baseline: 'alphabetic' });
    expect(pdfCalls.text).toHaveBeenNthCalledWith(3, 'Segunda página', 72, 90, { baseline: 'alphabetic' });
    expect(progress).toHaveBeenCalledWith('Exportando página 2 de 2…');
  });

  it('adds clickable PDF TOC/anchor links and hierarchical outline bookmarks after deletePage(1)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      textBaseline: 'alphabetic',
    } as any);

    const geometry = { width: 400, height: 140, top: 10, right: 10, bottom: 10, left: 10 };
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(geometry, { font: '10px serif', lineHeight: 14 }, measure);
    session.load([
      {
        id: 'toc-sec',
        html:
          '<div class="word-toc-page-section">' +
          '<p class="word-toc-header">Índice</p>' +
          '<p class="word-toc-entry" data-toc-target-id="h-intro" data-toc-page="99">' +
          '<span class="word-toc-title">1. Introducción</span>' +
          '<span class="word-toc-page">100</span>' +
          '</p>' +
          '<table class="word-toc-table"><tr><td><a href="#h-method">1.1 Método ..... 99</a></td></tr></table>' +
          '</div>',
      },
      {
        id: 'body-1',
        breakBefore: 'manual',
        html:
          '<h1 id="h-intro">1. Introducción</h1>' +
          '<p>Ir a <a href="#h-detail">detalle</a>.</p>' +
          '<h2 id="h-method">1.1 Método</h2>',
      },
      {
        id: 'body-2',
        breakBefore: 'manual',
        html: '<h3 id="h-detail">1.1.1 Detalle experimental</h3><p>Texto de cierre.</p>',
      },
    ]);

    const enriched = attachCanvasPdfNavigation(session.displayLists, session.engine.getSections());
    expect(enriched.length).toBeGreaterThanOrEqual(3);
    const introPageIdx = enriched[0].pdfLinks?.find(l => l.title?.includes('Introducción'))?.targetPageIndex;
    const detailPageIdx = enriched[0].pdfLinks?.find(l => l.title?.includes('Método'))?.targetPageIndex;
    expect(introPageIdx).toBeGreaterThanOrEqual(1);
    expect(detailPageIdx).toBeGreaterThanOrEqual(introPageIdx!);

    await renderWordCanvasPdf(enriched, geometry.width, geometry.height);

    expect(pdfCalls.deletePage).toHaveBeenCalledWith(1);
    const deleteOrder = pdfCalls.deletePage.mock.invocationCallOrder[0];
    expect(pdfCalls.setPage).toHaveBeenCalledWith(1);
    expect(pdfCalls.setPage.mock.invocationCallOrder[0]).toBeGreaterThan(deleteOrder);

    // Coordinates are converted px -> pt (0.75) and target pages are 1-based live pages
    const introLink = enriched[0].pdfLinks!.find(l => l.title?.includes('Introducción'))!;
    expect(pdfCalls.link).toHaveBeenCalledWith(
      introLink.x * 0.75,
      introLink.y * 0.75,
      introLink.width * 0.75,
      introLink.height * 0.75,
      { pageNumber: introPageIdx! + 1 },
    );
    const linkTargets = pdfCalls.link.mock.calls.map(c => (c[4] as { pageNumber: number }).pageNumber);
    expect(linkTargets).toContain(introPageIdx! + 1);
    expect(linkTargets).toContain(enriched.length);

    // Hierarchical bookmarks: H1 (null) -> H2 (H1 item) -> H3 (H2 item)
    expect(pdfCalls.outlineAdd).toHaveBeenCalledTimes(3);
    const [h1Call, h2Call, h3Call] = pdfCalls.outlineAdd.mock.calls;
    expect(h1Call[0]).toBeNull();
    expect(h1Call[1]).toBe('1. Introducción');
    expect(h1Call[2]).toEqual({ pageNumber: introPageIdx! + 1 });

    expect(h2Call[0]).toEqual(pdfCalls.outlineAdd.mock.results[0].value);
    expect(h2Call[1]).toBe('1.1 Método');

    expect(h3Call[0]).toEqual(pdfCalls.outlineAdd.mock.results[1].value);
    expect(h3Call[1]).toBe('1.1.1 Detalle experimental');
    expect(h3Call[2]).toEqual({ pageNumber: enriched.length });
    expect(pdfCalls.outlineAdd.mock.invocationCallOrder[0]).toBeGreaterThan(deleteOrder);
  });

  it('coalesces contiguous same-line glyphs in the PDF text layer instead of emitting one text call per character', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      textBaseline: 'alphabetic',
    } as any);

    await renderWordCanvasPdf(
      [
        {
          id: 'p1',
          revision: 1,
          width: 400,
          height: 300,
          commands: [
            { kind: 'text', text: 'H', x: 40, y: 80, font: '12px "Times New Roman"', color: '#000', source: { start: { nodeId: 't1', offset: 0 }, end: { nodeId: 't1', offset: 1 }, top: 68, width: 8, height: 14 } },
            { kind: 'text', text: 'o', x: 48, y: 80, font: '12px "Times New Roman"', color: '#000', source: { start: { nodeId: 't1', offset: 1 }, end: { nodeId: 't1', offset: 2 }, top: 68, width: 8, height: 14 } },
            { kind: 'text', text: 'l', x: 56, y: 80, font: '12px "Times New Roman"', color: '#000', source: { start: { nodeId: 't1', offset: 2 }, end: { nodeId: 't1', offset: 3 }, top: 68, width: 4, height: 14 } },
            { kind: 'text', text: 'a', x: 60, y: 80, font: '12px "Times New Roman"', color: '#000', source: { start: { nodeId: 't1', offset: 3 }, end: { nodeId: 't1', offset: 4 }, top: 68, width: 8, height: 14 } },
            { kind: 'text', text: '12', x: 300, y: 80, font: '12px "Times New Roman"', color: '#000', source: { start: { nodeId: 't2', offset: 0 }, end: { nodeId: 't2', offset: 2 }, top: 68, width: 14, height: 14 } },
          ],
        },
      ],
      400,
      300,
    );

    expect(pdfCalls.text).toHaveBeenCalledTimes(2);
    expect(pdfCalls.text).toHaveBeenNthCalledWith(1, 'Hola', 30, 60, { baseline: 'alphabetic' });
    expect(pdfCalls.text).toHaveBeenNthCalledWith(2, '12', 225, 60, { baseline: 'alphabetic' });
  });

  it('adds clickable PDF links, outline bookmarks for Table/Figure indexes, and searchable bottom-of-page footnotes', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      textBaseline: 'alphabetic',
    } as any);

    const geometry = { width: 595, height: 842, top: 60, right: 60, bottom: 60, left: 60 };
    const session = new CanvasEditSession(
      geometry,
      { font: '12px "Times New Roman"', lineHeight: 20 },
      (txt: string) => ({ width: [...txt].length * 6, ascent: 10, descent: 3 }),
    );
    session.load([
      {
        id: 'body-1',
        html:
          '<h1>1. Análisis</h1>' +
          '<p>Texto con nota.<a data-word-note-id="fn-pdf-1" data-note-kind="footnote" data-note-content="Nota visible en PDF.">1</a></p>' +
          '<table id="tbl-a" data-word-object-id="tbl-a" data-apa-captioned="true" data-apa-title="Resultados A"><thead><tr><th>C1</th></tr></thead><tbody><tr><td>10</td></tr></tbody></table>',
      },
      {
        id: 'body-2',
        breakBefore: 'manual',
        html:
          '<figure><img id="fig-a" data-word-object-id="fig-a" src="fig.png" width="120" height="80"><figcaption>Figura 1: Flujo de datos</figcaption></figure>',
      },
    ]);

    session.rebuildObjectIndex('table', true, 0);
    session.rebuildObjectIndex('figure', true, 0);
    const enriched = attachCanvasPdfNavigation(session.displayLists, session.engine.getSections());

    const FakeImage = class {
      crossOrigin = '';
      naturalWidth = 120;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    };
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
    try {
      await renderWordCanvasPdf(enriched, geometry.width, geometry.height);
    } finally {
      vi.unstubAllGlobals();
    }

    // Table Index (p1) & Figure Index (p2) have clickable pdfLinks to live table/figure pages
    expect(enriched[0].pdfLinks?.some(l => l.title?.includes('Resultados A') && l.targetPageIndex === 2)).toBe(true);
    expect(enriched[1].pdfLinks?.some(l => l.title?.includes('Flujo de datos') && l.targetPageIndex === 3)).toBe(true);

    // Outline includes parent Table/Figure index bookmarks + nested object entries
    const outlineTitles = pdfCalls.outlineAdd.mock.calls.map(c => c[1] as string);
    expect(outlineTitles.some(t => /índice de tablas/i.test(t))).toBe(true);
    expect(outlineTitles.some(t => /índice de figuras/i.test(t))).toBe(true);
    expect(outlineTitles.some(t => t.includes('Resultados A'))).toBe(true);
    expect(outlineTitles.some(t => t.includes('Flujo de datos'))).toBe(true);

    // Bottom-of-page footnote text is rendered into the searchable PDF text layer
    const renderedPdfTexts = pdfCalls.text.mock.calls.map(c => c[0] as string).join(' ');
    expect(renderedPdfTexts).toContain('Nota visible en PDF.');
  });

  it('transliterates non-WinAnsi Unicode symbols so jsPDF Type1 fonts never corrupt code blocks or nested bullets', () => {
    expect(toWinAnsiPdfText('[Comunicación] → [Planeación]')).toBe('[Comunicación] -> [Planeación]');
    expect(toWinAnsiPdfText('◦ Roles: Product Owner')).toBe('- Roles: Product Owner');
    expect(toWinAnsiPdfText('• Scrum — versión “1.0”')).toBe('• Scrum — versión “1.0”');
  });
});
