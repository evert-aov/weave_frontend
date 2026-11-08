import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfDeadline, renderWordPdf, snapshotWordSheets } from './word-pdf-export';

const pdfCalls = vi.hoisted(() => ({ addPage: vi.fn(), addImage: vi.fn(), deletePage: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: class {
  addPage = pdfCalls.addPage;
  addImage = pdfCalls.addImage;
  deletePage = pdfCalls.deletePage;
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
});
