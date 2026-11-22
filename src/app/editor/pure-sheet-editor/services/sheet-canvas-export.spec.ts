import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderSheetBlockToCanvasImage,
  renderSheetWorkbookToCanvasPages,
} from './sheet-canvas-export';
import { PdfExportStrategy } from '../../../export/services/pdf-export.strategy';
import { DialogService } from '../../../core/services/dialog.service';
import { Note } from '../../../core/models/note.model';

interface CanvasSpyRecord {
  texts: string[];
  fillRects: number;
  strokes: number;
}

function installCanvasMock(): CanvasSpyRecord {
  const record: CanvasSpyRecord = { texts: [], fillRects: 0, strokes: 0 };
  const makeCtx = () => {
    const ctx: any = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(() => {
        record.strokes += 1;
      }),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      clearRect: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
      fillText: vi.fn((text: string) => record.texts.push(text)),
      fillRect: vi.fn(() => {
        record.fillRects += 1;
      }),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      globalAlpha: 1,
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetY: 0,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    };
    return ctx;
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeCtx());
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,MOCK_PNG');
  return record;
}

describe('sheet-canvas-export', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: DialogService, useValue: { notice: vi.fn() } }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders pure workbook grid sheets, chart sheets, artwork, and ink strokes onto shared Canvas surfaces', () => {
    const record = installCanvasMock();
    const pages = renderSheetWorkbookToCanvasPages({
      sheets: [
        {
          id: 's1',
          name: 'Ventas',
          type: 'grid',
          data: {
            A1: { raw: 'Producto', style: { bold: true } },
            B1: { raw: 'Total', style: { bold: true } },
            A2: { raw: 'Licencia' },
            B2: { raw: '250', style: { numberFormat: 'currency' } },
          },
          charts: [
            {
              id: 'chart-1',
              title: 'Resumen Ventas',
              category: 'column',
              subType: 'clusteredColumn',
              x: 220,
              y: 40,
              width: 340,
              height: 220,
              range: { startCol: 0, startRow: 0, endCol: 1, endRow: 1 },
            },
          ],
          artwork: [
            {
              id: 'art-1',
              kind: 'shape',
              itemId: 'rect',
              x: 40,
              y: 120,
              width: 80,
              height: 50,
              fillColor: '#dbeafe',
              strokeColor: '#1d4ed8',
            },
          ],
          inkStrokes: [
            {
              id: 'ink-1',
              penId: 'pen-1',
              color: '#ef4444',
              strokeWidth: 3,
              opacity: 1,
              points: [
                { x: 60, y: 80 },
                { x: 140, y: 110 },
              ],
            },
          ],
        },
        {
          id: 's2',
          name: 'Gráfico Anual',
          type: 'chart',
          data: {},
          charts: [
            {
              id: 'chart-sheet-1',
              title: 'Tendencia',
              category: 'line',
              subType: 'lineMarkers',
              x: 0,
              y: 0,
              width: 600,
              height: 400,
              range: { startCol: 0, startRow: 0, endCol: 1, endRow: 1 },
            },
          ],
        },
      ],
    });

    expect(pages.length).toBe(2);
    expect(pages[0].dataUrl).toBe('data:image/png;base64,MOCK_PNG');
    expect(record.texts).toContain('Producto');
    expect(record.texts).toContain('Licencia');
    expect(record.texts).toContain('Resumen Ventas');
    expect(record.texts).toContain('Tendencia');
    expect(record.strokes).toBeGreaterThan(0);
    expect(record.fillRects).toBeGreaterThan(0);
  });

  it('renders sheet-block content using Canvas', () => {
    const record = installCanvasMock();
    const rendered = renderSheetBlockToCanvasImage({
      data: {
        A1: { raw: 'Mes' },
        B1: { raw: 'Monto' },
        A2: { raw: 'Enero' },
        B2: { raw: '=100*2', style: { numberFormat: 'currency' } },
      },
    });

    expect(rendered).toBeTruthy();
    expect(rendered!.dataUrl).toBe('data:image/png;base64,MOCK_PNG');
    expect(record.texts).toContain('Enero');
    expect(record.texts.some((t) => t.includes('200'))).toBe(true);
  });

  it('exports pure sheet docs and sheet blocks via shared Canvas in PdfExportStrategy print mode', async () => {
    installCanvasMock();
    const strategy = TestBed.inject(PdfExportStrategy);

    let printedHtml = '';
    const mockWin = {
      document: {
        write: vi.fn((html: string) => {
          printedHtml += html;
        }),
        close: vi.fn(),
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWin as unknown as Window);

    const pureSheetNote = {
      _id: 'note-sheet',
      title: 'Libro Financiero',
      docType: 'sheet',
      docData: {
        sheets: [
          {
            id: 's1',
            name: 'Hoja 1',
            type: 'grid',
            data: { A1: { raw: 'Ingreso' }, B1: { raw: '500' } },
          },
        ],
      },
    } as unknown as Note;

    await strategy.export(pureSheetNote, { method: 'print' });

    expect(printedHtml).toContain('class="pdf-canvas-img"');
    expect(printedHtml).toContain('data:image/png;base64,MOCK_PNG');
    expect(printedHtml).not.toContain('<table class="pdf-sheet-table"');
  });

  it('omits hidden rows and hidden columns when exporting Canvas pages', () => {
    const record = installCanvasMock();
    const pages = renderSheetWorkbookToCanvasPages({
      sheets: [
        {
          id: 's-hidden',
          name: 'Ocultos',
          type: 'grid',
          hiddenCols: [1],
          hiddenRows: [1],
          data: {
            A1: { raw: 'VisibleA1' },
            B1: { raw: 'OcultoColB' },
            A2: { raw: 'OcultoFila2' },
            A3: { raw: 'VisibleA3' },
          },
        },
      ],
    });

    expect(pages.length).toBe(1);
    expect(record.texts).toContain('VisibleA1');
    expect(record.texts).toContain('VisibleA3');
    expect(record.texts).not.toContain('OcultoColB');
    expect(record.texts).not.toContain('OcultoFila2');
  });
});
