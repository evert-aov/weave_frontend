import { describe, expect, it, vi } from 'vitest';
import { GridAxis } from './grid-viewport';
import { SheetCanvasRenderer, SHEET_HEADER_COL_WIDTH, SHEET_HEADER_ROW_HEIGHT } from './sheet-canvas-renderer';
import { CellBorders, MergeRegion, SheetGrid } from '../models/excel.model';

function createBuildInput(overrides: Partial<Parameters<SheetCanvasRenderer['buildFrame']>[0]> = {}) {
  const colAxis = overrides.colAxis ?? new GridAxis(26, 84);
  const rowAxis = overrides.rowAxis ?? new GridAxis(100, 24);
  const grid: SheetGrid = overrides.grid ?? {
    A1: { raw: 'Ingresos', style: { bold: true, bgColor: '#fef08a', textColor: '#1e293b' } },
    B1: { raw: '1500' },
  };
  const merges: MergeRegion[] = overrides.merges ?? [];
  return {
    grid,
    calculationCache: new WeakMap(),
    colAxis,
    rowAxis,
    totalCols: overrides.totalCols ?? 26,
    totalRows: overrides.totalRows ?? 100,
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 900,
    viewportHeight: 500,
    selectedCell: { col: 0, row: 0 },
    normalizedRange: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 },
    merges,
    showHeadings: true,
    showGridlines: true,
    showFormulasInCells: false,
    isDarkChrome: false,
    isEditing: false,
    isFillDragging: false,
    formatDisplay: (v: string | number) => String(v ?? ''),
    mergedRegion: (col: number, row: number) =>
      merges.find(m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow),
    getEffectiveBorders: (): CellBorders | undefined => undefined,
    shouldSkipBorder: () => false,
    isTracedCell: () => false,
    getSourceHighlight: () => null,
    ...overrides,
  };
}

describe('SheetCanvasRenderer', () => {
  it('keeps visible cell count bounded even for maximum Excel grid dimensions', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(16384, 84);
    const rowAxis = new GridAxis(1048576, 24);
    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 16384,
        totalRows: 1048576,
        grid: { A1: { raw: 'Inicio' }, XFD1048576: { raw: 'Final' } },
        scrollLeft: 16383 * 84,
        scrollTop: 1048575 * 24,
      })
    );

    expect(frame.cells.length).toBeLessThan(1000);
    const farCell = frame.cells.find(c => c.col === 16383 && c.row === 1048575);
    expect(farCell?.text).toBe('Final');
  });

  it('keeps editable cells light in dark mode while darkening headers', () => {
    const renderer = new SheetCanvasRenderer();
    const frame = renderer.buildFrame(createBuildInput({ isDarkChrome: true }));

    expect(frame.isDarkChrome).toBe(true);
    expect(frame.palette.cellBg).toBe('#ffffff');
    expect(frame.palette.cellText).toBe('#1e293b');
    expect(frame.palette.gridline).toBe('#e2e8f0');
    expect(frame.palette.defaultBorder).toBe('#000000');
    expect(frame.palette.headerBg).toBe('#1e293b');
    expect(frame.palette.headerText).toBe('#cbd5e1');
  });

  it('hit-tests corner, headers, resize handles, fill handle, and merged cells accurately', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(26, 84);
    const rowAxis = new GridAxis(100, 24);
    const merges: MergeRegion[] = [{ startCol: 0, startRow: 0, endCol: 1, endRow: 1 }];
    const frame = renderer.buildFrame(createBuildInput({ colAxis, rowAxis, merges }));

    const hitParams = {
      colAxis,
      rowAxis,
      totalCols: 26,
      totalRows: 100,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 900,
      viewportHeight: 500,
      showHeadings: true,
      frame,
      mergedRegion: (col: number, row: number) =>
        merges.find(m => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow),
    };

    expect(renderer.hitTest(10, 10, hitParams)).toEqual({ kind: 'corner' });
    expect(renderer.hitTest(SHEET_HEADER_COL_WIDTH + 40, 10, hitParams)).toEqual({ kind: 'colHeader', col: 0 });
    expect(renderer.hitTest(SHEET_HEADER_COL_WIDTH + 84, 10, hitParams)).toEqual({ kind: 'colResize', col: 0 });
    expect(renderer.hitTest(15, SHEET_HEADER_ROW_HEIGHT + 12, hitParams)).toEqual({ kind: 'rowHeader', row: 0 });
    expect(renderer.hitTest(15, SHEET_HEADER_ROW_HEIGHT + 24, hitParams)).toEqual({ kind: 'rowResize', row: 0 });
    // Clicking covered cell B2 inside A1:B2 merge resolves to merge anchor (0, 0)
    expect(renderer.hitTest(SHEET_HEADER_COL_WIDTH + 100, SHEET_HEADER_ROW_HEIGHT + 30, hitParams)).toEqual({
      kind: 'cell',
      col: 0,
      row: 0,
    });
    // Fill handle sits at bottom-right of merged A1:B2 selection (x = 40 + 84*2 = 208, y = 24 + 24*2 = 72)
    expect(renderer.hitTest(SHEET_HEADER_COL_WIDTH + 84 * 2, SHEET_HEADER_ROW_HEIGHT + 24 * 2, hitParams)).toEqual({
      kind: 'fillHandle',
    });
  });

  it('paints white cell background, text, borders, and dark headers onto Canvas 2D context', () => {
    const renderer = new SheetCanvasRenderer();
    const frame = renderer.buildFrame(
      createBuildInput({
        isDarkChrome: true,
        getEffectiveBorders: (c, r) =>
          c === 0 && r === 0 ? { bottom: { style: 'double', color: '#000000' } } : undefined,
      })
    );

    const fillCalls: { style: string | CanvasGradient | CanvasPattern; x: number; y: number }[] = [];
    const textCalls: string[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((t: string) => textCalls.push(t)),
      fillRect: vi.fn((x: number, y: number) => fillCalls.push({ style: ctx.fillStyle, x, y })),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    renderer.paint(ctx, frame, 2);

    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    // Editable area cleared with white even when dark chrome is true
    expect(fillCalls.some(c => c.style === '#ffffff' && c.x === SHEET_HEADER_COL_WIDTH && c.y === SHEET_HEADER_ROW_HEIGHT)).toBe(true);
    // Headers painted dark (#1e293b)
    expect(fillCalls.some(c => c.style === '#1e293b' && c.x === 0 && c.y === 0)).toBe(true);
    expect(textCalls).toContain('Ingresos');
    expect(textCalls).toContain('1500');
    expect(textCalls).toContain('A');
    expect(textCalls).toContain('1');
  });

  it('resolves Phase 2 visuals: conditional formatting, presets, tables, print area, clipboard, spill range, and resize guide', () => {
    const renderer = new SheetCanvasRenderer();
    const frame = renderer.buildFrame(
      createBuildInput({
        grid: {
          A1: { raw: 'Header' },
          A2: { raw: '100' },
          B1: { raw: '20', style: { preset: 'bad' } },
          C1: { raw: '10' },
          C2: { raw: '50' },
          D1: { raw: '=SEQUENCE(2,2)' },
        },
        selectedCell: { col: 3, row: 0 },
        normalizedRange: { minCol: 3, maxCol: 3, minRow: 0, maxRow: 0 },
        conditionalRules: [
          {
            id: 'r1',
            type: 'greaterThan',
            value1: 50,
            presetStyle: 'good',
            range: { startCol: 0, startRow: 1, endCol: 0, endRow: 1 },
          },
          {
            id: 'r2',
            type: 'colorScale',
            colorScale: 'green-yellow-red',
            range: { startCol: 2, startRow: 0, endCol: 2, endRow: 1 },
          },
        ],
        tables: [
          {
            name: 'Ventas',
            range: { startCol: 0, startRow: 0, endCol: 0, endRow: 1 },
            columns: ['Header'],
            hasHeaders: true,
          },
        ],
        printArea: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 },
        clipboardRange: {
          mode: 'copy',
          range: { minCol: 0, maxCol: 1, minRow: 0, maxRow: 0 },
        },
        activeResize: { type: 'col', index: 0, size: 120 },
        hoveredHeader: { kind: 'colHeader', index: 1 },
      })
    );

    const a1 = frame.cells.find(c => c.col === 0 && c.row === 0)!;
    const a2 = frame.cells.find(c => c.col === 0 && c.row === 1)!;
    const b1 = frame.cells.find(c => c.col === 1 && c.row === 0)!;
    const c1 = frame.cells.find(c => c.col === 2 && c.row === 0)!;

    expect(a1.tableHeader).toBe(true);
    expect(a1.hasFilterButton).toBe(true);
    expect(a1.resolvedBgColor).toBe('#047857');
    expect(a2.resolvedBgColor).toBe('#c6efce'); // conditional good preset
    expect(b1.resolvedBgColor).toBe('#ffc7ce'); // cell preset bad
    expect(c1.resolvedBgColor).toMatch(/^rgb\(/); // colorScale evaluated
    expect(frame.tableRects.length).toBe(1);
    expect(frame.printAreaRect).toBeTruthy();
    expect(frame.clipboardRect?.mode).toBe('copy');
    expect(frame.spillRect).toBeTruthy();
    expect(frame.activeResizeGuide).toEqual({
      type: 'col',
      pos: SHEET_HEADER_COL_WIDTH + 84,
      size: 120,
    });
    expect(frame.hoveredHeader).toEqual({ kind: 'colHeader', index: 1 });

    // Source highlight borders ignore 'none' specs safely
    const strokeColors: (string | CanvasGradient | CanvasPattern)[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(() => strokeColors.push(ctx.strokeStyle)),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const hlFrame = renderer.buildFrame(
      createBuildInput({
        getSourceHighlight: (c, r) =>
          c === 0 && r === 0
            ? { backgroundColor: '#dbeafe', borderTop: '2px solid #2563eb', borderBottom: 'none', borderLeft: 'none', borderRight: 'none' }
            : null,
      })
    );
    renderer.paint(ctx, hlFrame, 1);
    expect(strokeColors).toContain('#2563eb');
    expect(strokeColors).not.toContain('none');
  });

  it('computes auto-fit column width and row height accurately', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(26, 84);
    const grid: SheetGrid = {
      A1: { raw: 'Nombre muy largo de categoría financiera', style: { bold: true, fontSize: 12 } },
      A2: { raw: 'Primera línea segunda línea tercera línea bastante extensa', style: { wrapText: true } },
    };
    const autoColW = renderer.computeAutoFitColumnWidth({
      col: 0,
      grid,
      calculationCache: new WeakMap(),
      formatDisplay: v => String(v ?? ''),
    });
    const autoRowH = renderer.computeAutoFitRowHeight({
      row: 1,
      grid,
      calculationCache: new WeakMap(),
      colAxis,
      formatDisplay: v => String(v ?? ''),
    });

    expect(autoColW).toBeGreaterThan(84);
    expect(autoColW).toBeLessThanOrEqual(420);
    expect(autoRowH).toBeGreaterThan(24);
    expect(autoRowH).toBeLessThanOrEqual(240);
  });

  it('hit-tests filter buttons, marks filteredOut rows, and computes page break coordinates', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(20, 84);
    const rowAxis = new GridAxis(50, 24);
    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 20,
        totalRows: 50,
        viewportWidth: 1100,
        viewportHeight: 600,
        filtersEnabled: true,
        columnFilters: { 0: new Set(['Aprobado']) },
        pageLayout: {
          theme: 'office',
          margins: 'normal',
          orientation: 'portrait',
          size: 'letter',
          widthPages: 'Automatic',
          heightPages: 'Automatic',
          scale: 100,
          gridlinesPrint: true,
          headingsPrint: true,
          showPageBreaks: true,
        },
        grid: {
          A1: { raw: 'Estado' },
          A2: { raw: 'Aprobado' },
          A3: { raw: 'Pendiente' },
        },
      })
    );

    expect(frame.filterButtons.length).toBeGreaterThan(0);
    const firstBtn = frame.filterButtons[0];
    const hit = renderer.hitTest(firstBtn.x + firstBtn.size / 2, firstBtn.y + firstBtn.size / 2, {
      colAxis,
      rowAxis,
      totalCols: 20,
      totalRows: 50,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 1100,
      viewportHeight: 600,
      showHeadings: true,
      frame,
      mergedRegion: () => undefined,
    });
    expect(hit).toEqual({ kind: 'filterButton', col: 0, row: 0 });

    const a2 = frame.cells.find(c => c.col === 0 && c.row === 1);
    const a3 = frame.cells.find(c => c.col === 0 && c.row === 2);
    expect(a2?.filteredOut).toBe(false);
    expect(a3?.filteredOut).toBe(true);

    expect(frame.pageBreakXs.length).toBeGreaterThan(0);
  });

  it('expands horizontal overflow width across empty neighboring cells and hit-tests Canvas checkboxes', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(10, 84);
    const rowAxis = new GridAxis(10, 24);
    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 10,
        totalRows: 10,
        grid: {
          A1: { raw: 'Título largo que desborda sobre celdas vacías' },
          D1: { raw: 'Tope' },
          A2: { raw: 'TRUE', style: { checkbox: true, align: 'center' } },
        },
      })
    );

    const a1 = frame.cells.find(c => c.col === 0 && c.row === 0);
    // Overflows B1 and C1, stopping cleanly before populated D1
    expect(a1?.overflowWidth).toBe(84 * 3);

    expect(frame.checkboxes.length).toBe(1);
    const cb = frame.checkboxes[0];
    const hit = renderer.hitTest(cb.x + cb.size / 2, cb.y + cb.size / 2, {
      colAxis,
      rowAxis,
      totalCols: 10,
      totalRows: 10,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 1100,
      viewportHeight: 600,
      showHeadings: true,
      frame,
      mergedRegion: () => undefined,
    });
    expect(hit).toEqual({ kind: 'checkbox', col: 0, row: 1 });
  });

  it('paints ### indicator when formatted numeric value exceeds narrow column width', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(5, 36);
    const rowAxis = new GridAxis(5, 24);
    const drawnTexts: string[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((t: string) => drawnTexts.push(t)),
      fillRect: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 5,
        totalRows: 5,
        grid: {
          A1: { raw: '1234567890' },
          B1: { raw: 'Texto largo en celda angosta' },
        },
      })
    );

    const a1 = frame.cells.find(c => c.col === 0 && c.row === 0);
    expect(a1?.isNumeric).toBe(true);
    renderer.paint(ctx, frame, 1);
    expect(drawnTexts.some(t => /^#+$/.test(t))).toBe(true);
    expect(drawnTexts).not.toContain('1234567890');
  });

  it('paints active inline editor text, selection highlight, and caret on Canvas', () => {
    const renderer = new SheetCanvasRenderer();
    const drawnTexts: string[] = [];
    const fillRects: Array<{ x: number; y: number; w: number; h: number; style: string | CanvasGradient | CanvasPattern }> = [];
    const strokes: Array<{ style: string | CanvasGradient | CanvasPattern; lineWidth: number }> = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(() => strokes.push({ style: ctx.strokeStyle, lineWidth: ctx.lineWidth })),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((t: string) => drawnTexts.push(t)),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
        fillRects.push({ x, y, w, h, style: ctx.fillStyle })
      ),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const frame = renderer.buildFrame(
      createBuildInput({
        isEditing: true,
        isDarkChrome: true,
        activeEditor: {
          col: 0,
          row: 0,
          value: '=SUM(A2:A5)',
          selectionStart: 1,
          selectionEnd: 4,
          caretVisible: true,
        },
      })
    );

    expect(frame.activeEditor?.value).toBe('=SUM(A2:A5)');
    renderer.paint(ctx, frame, 1);
    expect(drawnTexts).toContain('=SUM(A2:A5)');
    // Selection highlight rect + emerald 1.5px caret stroke painted in Canvas active editor layer
    expect(fillRects.some(r => r.style === 'rgba(16, 185, 129, 0.28)' && r.w > 0)).toBe(true);
    expect(strokes.some(s => s.style === '#059669' && s.lineWidth === 1.5)).toBe(true);
  });

  it('builds and paints Stage 2 conditional rules (dataBar, iconSet, containsText, duplicates, aboveAverage), comments, and sparklines', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(10, 84);
    const rowAxis = new GridAxis(10, 24);
    const arcs: Array<{ x: number; y: number; r: number }> = [];
    const fillRects: Array<{ x: number; y: number; w: number; h: number; style: unknown }> = [];
    const strokes: Array<{ style: unknown; lineWidth: number }> = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(() => strokes.push({ style: ctx.strokeStyle, lineWidth: ctx.lineWidth })),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn(),
      fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
        fillRects.push({ x, y, w, h, style: ctx.fillStyle })
      ),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 10,
        totalRows: 10,
        viewportWidth: 900,
        viewportHeight: 400,
        grid: {
          A1: { raw: '10' },
          A2: { raw: '50' },
          A3: { raw: '90' },
          B1: { raw: '20' },
          B2: { raw: '20' },
          C1: { raw: 'Alerta roja' },
        },
        conditionalRules: [
          {
            id: 'db',
            range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
            type: 'dataBar',
            dataBarColor: '#0284c7',
          },
          {
            id: 'ic',
            range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
            type: 'iconSet',
            iconSetStyle: 'trafficLights',
          },
          {
            id: 'aa',
            range: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
            type: 'aboveAverage',
            presetStyle: 'good',
          },
          {
            id: 'dup',
            range: { startCol: 1, startRow: 0, endCol: 1, endRow: 1 },
            type: 'duplicates',
            presetStyle: 'bad',
          },
          {
            id: 'txt',
            range: { startCol: 2, startRow: 0, endCol: 2, endRow: 0 },
            type: 'containsText',
            textValue: 'roja',
            presetStyle: 'neutral',
          },
        ],
        comments: {
          A1: { text: 'Revisar umbral', author: 'Usuario' },
        },
        sparklines: {
          D1: {
            type: 'line',
            sourceRange: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
            color: '#059669',
            showMarkers: true,
          },
          D2: {
            type: 'column',
            sourceRange: { startCol: 0, startRow: 0, endCol: 0, endRow: 2 },
            color: '#0284c7',
          },
        },
      })
    );

    const a1 = frame.cells.find(c => c.col === 0 && c.row === 0)!;
    const a3 = frame.cells.find(c => c.col === 0 && c.row === 2)!;
    const b1 = frame.cells.find(c => c.col === 1 && c.row === 0)!;
    const c1 = frame.cells.find(c => c.col === 2 && c.row === 0)!;
    const d1 = frame.cells.find(c => c.col === 3 && c.row === 0)!;

    expect(a1.dataBar?.ratio).toBeCloseTo(0.111, 2);
    expect(a1.iconIndicator?.level).toBe('low');
    expect(a1.hasComment).toBe(true);
    expect(a3.dataBar?.ratio).toBe(1);
    expect(a3.iconIndicator?.level).toBe('high');
    expect(a3.resolvedBgColor).toBe('#c6efce'); // aboveAverage good preset (90 > avg 50)
    expect(b1.resolvedBgColor).toBe('#ffc7ce'); // duplicates bad preset
    expect(c1.resolvedBgColor).toBe('#ffeb9c'); // containsText neutral preset
    expect(d1.sparkline?.values).toEqual([10, 50, 90]);
    expect(frame.commentCorners.length).toBe(1);

    const corner = frame.commentCorners[0];
    const hit = renderer.hitTest(corner.x + corner.size - 2, corner.y + 2, {
      colAxis,
      rowAxis,
      totalCols: 10,
      totalRows: 10,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 900,
      viewportHeight: 400,
      showHeadings: true,
      mergedRegion: () => undefined,
      frame,
    });
    expect(hit).toEqual({ kind: 'commentIndicator', col: 0, row: 0 });

    renderer.paint(ctx, frame, 1);
    expect(arcs.length).toBeGreaterThanOrEqual(3); // trafficLights icons + sparkline markers
    expect(strokes.some(s => s.style === '#059669')).toBe(true);
    expect(fillRects.some(r => r.style === '#0284c7')).toBe(true);
  });

  it('omits hidden rows/columns, emits header seam breaks, and paints multiline text & multiline inline editor on Canvas', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(6, 84, {}, [1]);
    const rowAxis = new GridAxis(6, 24, { 0: 44 }, [2]);
    const drawnTexts: string[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((t: string) => drawnTexts.push(t)),
      fillRect: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 6,
        totalRows: 6,
        viewportWidth: 600,
        viewportHeight: 300,
        isEditing: true,
        grid: {
          A1: { raw: 'Linea 1\nLinea 2' },
          B1: { raw: 'OcultaB' },
          C1: { raw: 'VisibleC' },
          A3: { raw: 'OcultaFila3' },
        },
        activeEditor: {
          col: 2,
          row: 0,
          value: 'Edit1\nEdit2',
          selectionStart: 0,
          selectionEnd: 5,
          caretVisible: true,
        },
      })
    );

    expect(frame.colBands.some(b => b.index === 1)).toBe(false);
    expect(frame.rowBands.some(b => b.index === 2)).toBe(false);
    expect(frame.hiddenColBreaks).toEqual([SHEET_HEADER_COL_WIDTH + 84]);
    expect(frame.hiddenRowBreaks).toEqual([SHEET_HEADER_ROW_HEIGHT + 44 + 24]);
    expect(frame.cells.some(c => c.col === 1 || c.row === 2)).toBe(false);

    renderer.paint(ctx, frame, 1);
    expect(drawnTexts).toContain('Linea 1');
    expect(drawnTexts).toContain('Linea 2');
    expect(drawnTexts).toContain('Edit1');
    expect(drawnTexts).toContain('Edit2');
  });

  it('paints textRotation with canvas transform and hyperlinks with blue underline on Canvas', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(4, 96);
    const rowAxis = new GridAxis(4, 48);
    const rotations: number[] = [];
    const fillColors: string[] = [];
    const strokeCalls: number[] = [];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn((rad: number) => rotations.push(rad)),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(() => strokeCalls.push(1)),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((_t: string) => { fillColors.push(String(ctx.fillStyle)); }),
      fillRect: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 4,
        totalRows: 4,
        grid: {
          A1: { raw: 'Diagonal', style: { textRotation: 45 } },
          B1: { raw: 'Docs', hyperlink: 'https://weave.app' },
        },
      })
    );

    renderer.paint(ctx, frame, 1);
    expect(rotations.length).toBeGreaterThan(0);
    expect(rotations[0]).toBeCloseTo((-45 * Math.PI) / 180, 5);
    expect(fillColors).toContain('#0369a1');
    expect(strokeCalls.length).toBeGreaterThan(0);
  });

  it('builds outline group buttons, hit-tests outline toggles before resize, and tracks sheetProtected', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(6, 96);
    const rowAxis = new GridAxis(6, 28, {}, [1, 2]);
    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 6,
        totalRows: 6,
        colGroups: [{ start: 1, end: 2, collapsed: false }],
        rowGroups: [{ start: 1, end: 2, collapsed: true }],
        sheetProtected: true,
        grid: {
          A1: { raw: 'Locked' },
          B1: { raw: 'Open', style: { locked: false } },
        },
      })
    );

    expect(frame.sheetProtected).toBe(true);
    expect(frame.cells.find(c => c.col === 0 && c.row === 0)?.locked).toBe(true);
    expect(frame.cells.find(c => c.col === 1 && c.row === 0)?.locked).toBe(false);
    expect(frame.colOutlineButtons.length).toBe(1);
    expect(frame.rowOutlineButtons.length).toBe(1);
    expect(frame.rowOutlineButtons[0].collapsed).toBe(true);

    const colBtn = frame.colOutlineButtons[0];
    const colHit = renderer.hitTest(colBtn.x + 2, colBtn.y + 2, {
      colAxis,
      rowAxis,
      totalCols: 6,
      totalRows: 6,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 800,
      viewportHeight: 600,
      showHeadings: true,
      frame,
      mergedRegion: () => undefined,
    });
    expect(colHit).toEqual({ kind: 'outlineToggle', axis: 'col', groupIndex: 0 });

    const rowBtn = frame.rowOutlineButtons[0];
    const rowHit = renderer.hitTest(rowBtn.x + 2, rowBtn.y + 2, {
      colAxis,
      rowAxis,
      totalCols: 6,
      totalRows: 6,
      scrollLeft: 0,
      scrollTop: 0,
      viewportWidth: 800,
      viewportHeight: 600,
      showHeadings: true,
      frame,
      mergedRegion: () => undefined,
    });
    expect(rowHit).toEqual({ kind: 'outlineToggle', axis: 'row', groupIndex: 0 });
  });

  it('applies ctx.font on every cell even when consecutive cells share the same bold font across save/restore', () => {
    const renderer = new SheetCanvasRenderer();
    const colAxis = new GridAxis(6, 84);
    const rowAxis = new GridAxis(8, 24);
    const fontStack: string[] = [];
    const drawn: Array<{ text: string; font: string }> = [];
    const ctx = {
      save: vi.fn(() => {
        fontStack.push(ctx.font);
      }),
      restore: vi.fn(() => {
        ctx.font = fontStack.pop() ?? '10px sans-serif';
      }),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      lineDashOffset: 0,
      fill: vi.fn(),
      measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
      fillText: vi.fn((text: string) => {
        drawn.push({ text, font: ctx.font });
      }),
      fillRect: vi.fn(),
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '10px sans-serif',
      textAlign: 'left',
      textBaseline: 'middle',
    } as unknown as CanvasRenderingContext2D;

    const boldStyle = { bold: true, fontFamily: 'Segoe UI', fontSize: 8 };
    const frame = renderer.buildFrame(
      createBuildInput({
        colAxis,
        rowAxis,
        totalCols: 6,
        totalRows: 8,
        grid: {
          A1: { raw: '500', style: boldStyle },
          A2: { raw: '1000', style: boldStyle },
          A3: { raw: '2000', style: boldStyle },
          A4: { raw: 'SALDO', style: { fontFamily: 'Segoe UI', fontSize: 8 } },
          B4: { raw: '-350', style: boldStyle },
          A6: { raw: 'Le quedo debiendo 350 Bs', style: boldStyle },
        },
      })
    );

    renderer.paint(ctx, frame, 1);

    const fontFor = (text: string) => drawn.find(d => d.text === text)?.font;
    expect(fontFor('500')).toBe('bold 11px Segoe UI');
    expect(fontFor('1000')).toBe('bold 11px Segoe UI');
    expect(fontFor('2000')).toBe('bold 11px Segoe UI');
    expect(fontFor('SALDO')).toBe('11px Segoe UI');
    expect(fontFor('-350')).toBe('bold 11px Segoe UI');
    expect(fontFor('Le quedo debiendo 350 Bs')).toBe('bold 11px Segoe UI');
  });
});
