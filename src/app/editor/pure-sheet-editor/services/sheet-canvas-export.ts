import { CellStyle, Sheet, SheetGrid } from '../models/excel.model';
import {
  bindWorkbookFormulaContext,
  colIndexToLetter,
  evaluateCellValueCached,
  FormulaCalculationCache,
  getCellId,
  parseCellId,
} from './formula-engine.service';
import { callFunction } from './calc-functions';
import { parseNumericLiteral } from './calc-types';
import { GridAxis } from './grid-viewport';
import {
  SHEET_HEADER_COL_WIDTH,
  SHEET_HEADER_ROW_HEIGHT,
  SheetCanvasRenderer,
} from './sheet-canvas-renderer';
import { buildChartPlotState, extractChartDataFromGrid } from './chart-plot-builder';
import { paintEmbeddedChartCard } from './chart-canvas-renderer';
import { paintArtworkListOnCanvas } from './artwork-canvas-renderer';
import { paintInkCanvas, pointsBounds } from './ink-canvas-renderer';

export interface SheetRenderedCanvasPage {
  sheetId: string;
  sheetName: string;
  width: number;
  height: number;
  dataUrl: string;
  orientation?: 'portrait' | 'landscape';
}

export interface SheetCanvasExportOptions {
  scale?: number;
  gridlines?: boolean;
  headings?: boolean;
}

const DEFAULT_COL_WIDTH = 96;
const DEFAULT_ROW_HEIGHT = 24;
const BLOCK_DEFAULT_ROWS = 12;
const BLOCK_DEFAULT_COLS = 8;

export function formatSheetCellDisplay(val: string | number, style?: CellStyle): string {
  if (val === '' || val === null || val === undefined) return '';
  const directNum = typeof val === 'number' ? val : Number(val);
  const parsedLit = Number.isNaN(directNum) && typeof val === 'string' ? parseNumericLiteral(val) : null;
  const num = !Number.isNaN(directNum) ? directNum : (parsedLit?.value ?? NaN);
  const isNum = !Number.isNaN(num) && val !== '';

  if (isNum && (style?.numberFormat === 'date' || style?.numberFormat === 'datetime')) {
    try {
      return String(callFunction('TEXT', [() => num, () => (style.numberFormat === 'datetime' ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd')]));
    } catch {
      return String(val);
    }
  }
  if (isNum && style?.xlsxNumberFormat && /[ymdhs]/i.test(style.xlsxNumberFormat.replace(/"[^"]*"|\[[^\]]*\]/g, ''))) {
    try {
      return String(callFunction('TEXT', [() => num, () => style.xlsxNumberFormat!]));
    } catch {
      return String(val);
    }
  }
  if (isNum && style?.numberFormat === 'currency') {
    const dec = style.decimals ?? 2;
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  if (isNum && style?.numberFormat === 'percent') {
    const minDec = style.decimals ?? 0;
    const maxDec = style.decimals ?? 2;
    return (num * 100).toLocaleString(undefined, { minimumFractionDigits: minDec, maximumFractionDigits: maxDec }) + '%';
  }
  if (isNum && style?.numberFormat === 'comma') {
    const dec = style.decimals ?? 2;
    return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  if (typeof val === 'number') {
    return Number(val.toFixed(4)).toString();
  }
  return String(val);
}

function buildAxesForSheet(sheet: Sheet, totalCols: number, totalRows: number) {
  const colAxis = new GridAxis(totalCols, DEFAULT_COL_WIDTH, sheet.colWidths || {}, sheet.hiddenCols || []);
  const rowAxis = new GridAxis(totalRows, DEFAULT_ROW_HEIGHT, sheet.rowHeights || {}, sheet.hiddenRows || []);
  return { colAxis, rowAxis };
}

function formatChartRangeLabel(chart: { range?: { startCol: number; startRow: number; endCol: number; endRow: number } }): string {
  if (!chart.range) return '';
  const c0 = Math.min(chart.range.startCol, chart.range.endCol);
  const c1 = Math.max(chart.range.startCol, chart.range.endCol);
  const r0 = Math.min(chart.range.startRow, chart.range.endRow);
  const r1 = Math.max(chart.range.startRow, chart.range.endRow);
  return `${colIndexToLetter(c0)}${r0 + 1}:${colIndexToLetter(c1)}${r1 + 1}`;
}

function computeExportRange(sheet: Sheet, minCols = 4, minRows = 6) {
  const printArea = sheet.pageLayout?.printArea;
  if (printArea) {
    const minCol = Math.max(0, Math.min(printArea.startCol, printArea.endCol));
    const maxCol = Math.max(minCol, printArea.startCol, printArea.endCol);
    const minRow = Math.max(0, Math.min(printArea.startRow, printArea.endRow));
    const maxRow = Math.max(minRow, printArea.startRow, printArea.endRow);
    return { minCol, maxCol, minRow, maxRow, extraRightPx: 0, extraBottomPx: 0 };
  }

  let maxCol = minCols - 1;
  let maxRow = minRows - 1;
  const cache: FormulaCalculationCache = new WeakMap();

  for (const [cellId, cell] of Object.entries(sheet.data || {})) {
    const hasRaw = cell?.raw !== undefined && cell.raw !== '';
    const hasBg = Boolean(cell?.style?.bgColor);
    const hasBorders = Boolean(cell?.style?.borders && Object.keys(cell.style.borders).length > 0);
    if (!hasRaw && !hasBg && !hasBorders) continue;
    const pos = parseCellId(cellId);
    if (!pos) continue;
    if (pos.col > maxCol) maxCol = pos.col;
    if (pos.row > maxRow) maxRow = pos.row;
    void evaluateCellValueCached(cellId, sheet.data, cache);
  }

  for (const m of sheet.merges || []) {
    if (m.endCol > maxCol) maxCol = m.endCol;
    if (m.endRow > maxRow) maxRow = m.endRow;
  }
  for (const tbl of sheet.tables || []) {
    if (tbl.range.endCol > maxCol) maxCol = tbl.range.endCol;
    if (tbl.range.endRow > maxRow) maxRow = tbl.range.endRow;
  }

  let maxObjX = 0;
  let maxObjY = 0;
  for (const ch of sheet.charts || []) {
    maxObjX = Math.max(maxObjX, ch.x + ch.width + 16);
    maxObjY = Math.max(maxObjY, ch.y + ch.height + 16);
  }
  for (const art of sheet.artwork || []) {
    maxObjX = Math.max(maxObjX, art.x + art.width + 16);
    maxObjY = Math.max(maxObjY, art.y + art.height + 16);
  }
  for (const stroke of sheet.inkStrokes || []) {
    if (!stroke.points.length) continue;
    const b = pointsBounds(stroke.points);
    maxObjX = Math.max(maxObjX, b.x + b.width + stroke.strokeWidth + 16);
    maxObjY = Math.max(maxObjY, b.y + b.height + stroke.strokeWidth + 16);
  }

  return {
    minCol: 0,
    maxCol: Math.min(256, maxCol),
    minRow: 0,
    maxRow: Math.min(2000, maxRow),
    extraRightPx: maxObjX,
    extraBottomPx: maxObjY,
  };
}

function createExportCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

function renderChartSheetToCanvasPage(
  sheet: Sheet,
  allSheets: Sheet[],
  options: SheetCanvasExportOptions
): SheetRenderedCanvasPage | null {
  const chart = sheet.charts?.[0];
  if (!chart) return null;
  const sourceSheet = allSheets.find((s) => s.type === 'grid' && Object.keys(s.data || {}).length > 0) || allSheets[0];
  const sourceGrid = sourceSheet?.data || sheet.data || {};

  const width = 860;
  const height = 520;
  const scale = options.scale ?? 2;
  const created = createExportCanvas(width * scale, height * scale);
  if (!created) return null;
  const { canvas, ctx } = created;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const data = extractChartDataFromGrid(sourceGrid, chart.range, chart.dataConfig);
  const plotState = buildChartPlotState(sourceGrid, chart, false, width - 48, height - 96);
  paintEmbeddedChartCard(ctx, {
    chart: { ...chart, x: 8, y: 8, width: width - 16, height: height - 16 },
    typeLabel: chart.title || sheet.name,
    rangeLabel: formatChartRangeLabel(chart),
    plotState,
    legendKeys: data.seriesKeys,
    selected: false,
    isDark: false,
    offsetX: 0,
    offsetY: 0,
    interactiveButtons: false,
  });
  ctx.restore();

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    orientation: sheet.pageLayout?.orientation || 'landscape',
  };
}

export function renderSheetToCanvasDataUrl(
  sheet: Sheet,
  allSheets: Sheet[],
  options: SheetCanvasExportOptions = {}
): SheetRenderedCanvasPage | null {
  if (sheet.type === 'chart') {
    return renderChartSheetToCanvasPage(sheet, allSheets, options);
  }

  const showGridlines = options.gridlines ?? sheet.pageLayout?.gridlinesPrint ?? true;
  const showHeadings = options.headings ?? sheet.pageLayout?.headingsPrint ?? true;
  const bounds = computeExportRange(sheet);
  const totalCols = Math.max(bounds.maxCol + 1, 1);
  const totalRows = Math.max(bounds.maxRow + 1, 1);
  const { colAxis, rowAxis } = buildAxesForSheet(sheet, totalCols, totalRows);

  const scrollLeft = colAxis.offset(bounds.minCol);
  const scrollTop = rowAxis.offset(bounds.minRow);
  const cellsW = colAxis.offset(bounds.maxCol + 1) - scrollLeft;
  const cellsH = rowAxis.offset(bounds.maxRow + 1) - scrollTop;

  const headerW = showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
  const headerH = showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;

  const extraObjW = bounds.extraRightPx > 0 ? Math.max(0, bounds.extraRightPx - scrollLeft) : 0;
  const extraObjH = bounds.extraBottomPx > 0 ? Math.max(0, bounds.extraBottomPx - scrollTop) : 0;

  const viewportWidth = Math.max(120, Math.min(2400, Math.max(headerW + cellsW, extraObjW)));
  const viewportHeight = Math.max(80, Math.min(3200, Math.max(headerH + cellsH, extraObjH)));

  const scale = options.scale ?? 2;
  const created = createExportCanvas(viewportWidth * scale, viewportHeight * scale);
  if (!created) return null;
  const { canvas, ctx } = created;

  const renderer = new SheetCanvasRenderer();
  const cache: FormulaCalculationCache = new WeakMap();
  const data = sheet.data || {};
  const merges = sheet.merges || [];

  const frame = renderer.buildFrame({
    grid: data,
    calculationCache: cache,
    colAxis,
    rowAxis,
    totalCols,
    totalRows,
    scrollLeft,
    scrollTop,
    viewportWidth,
    viewportHeight,
    selectedCell: { col: -1, row: -1 },
    normalizedRange: { minCol: 0, maxCol: -1, minRow: 0, maxRow: -1 },
    merges,
    freezePanes: undefined,
    showHeadings,
    showGridlines,
    showFormulasInCells: false,
    isDarkChrome: false,
    isEditing: false,
    isFillDragging: false,
    filtersEnabled: false,
    conditionalRules: sheet.conditionalRules,
    tables: sheet.tables,
    formatDisplay: (val, style) => formatSheetCellDisplay(val, style),
    mergedRegion: (col, row) =>
      merges.find((m) => col >= m.startCol && col <= m.endCol && row >= m.startRow && row <= m.endRow),
    getEffectiveBorders: (col, row) => data[getCellId(col, row)]?.style?.borders,
    shouldSkipBorder: () => false,
    isTracedCell: () => false,
    getSourceHighlight: () => null,
  });

  renderer.paint(ctx, frame, scale);

  // Paint Canvas floating layers (artwork, charts, ink) onto the exported sheet canvas
  const shiftX = (showHeadings ? 0 : -SHEET_HEADER_COL_WIDTH) - scrollLeft;
  const shiftY = (showHeadings ? 0 : -SHEET_HEADER_ROW_HEIGHT) - scrollTop;

  if (sheet.artwork?.length) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(headerW, headerH, viewportWidth - headerW, viewportHeight - headerH);
    ctx.clip();
    ctx.translate(shiftX, shiftY);
    paintArtworkListOnCanvas(ctx, sheet.artwork, null, { isDark: false, interactiveButtons: false });
    ctx.restore();
  }

  if (sheet.charts?.length) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(headerW, headerH, viewportWidth - headerW, viewportHeight - headerH);
    ctx.clip();
    ctx.translate(shiftX, shiftY);
    for (const chart of sheet.charts) {
      const plotW = Math.max(120, chart.width - 24);
      const plotH = Math.max(80, chart.height - 84);
      const extracted = extractChartDataFromGrid(data, chart.range, chart.dataConfig);
      const plotState = buildChartPlotState(data, chart, false, plotW, plotH);
      paintEmbeddedChartCard(ctx, {
        chart,
        typeLabel: chart.title,
        rangeLabel: formatChartRangeLabel(chart),
        plotState,
        legendKeys: extracted.seriesKeys,
        selected: false,
        isDark: false,
        offsetX: 0,
        offsetY: 0,
        interactiveButtons: false,
      });
    }
    ctx.restore();
  }

  if (sheet.inkStrokes?.length) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(headerW, headerH, viewportWidth - headerW, viewportHeight - headerH);
    ctx.clip();
    paintInkCanvas(ctx, {
      strokes: sheet.inkStrokes,
      draft: null,
      selectedIds: [],
      selectionBounds: null,
      lasso: null,
      width: viewportWidth + SHEET_HEADER_COL_WIDTH,
      height: viewportHeight + SHEET_HEADER_ROW_HEIGHT,
      scrollLeft: scrollLeft + (showHeadings ? 0 : SHEET_HEADER_COL_WIDTH),
      scrollTop: scrollTop + (showHeadings ? 0 : SHEET_HEADER_ROW_HEIGHT),
      dpr: 1,
      interactiveButtons: false,
    });
    ctx.restore();
  }

  return {
    sheetId: sheet.id,
    sheetName: sheet.name,
    width: viewportWidth,
    height: viewportHeight,
    dataUrl: canvas.toDataURL('image/png'),
    orientation: sheet.pageLayout?.orientation,
  };
}

export function renderSheetWorkbookToCanvasPages(
  docData: unknown,
  options: SheetCanvasExportOptions = {}
): SheetRenderedCanvasPage[] {
  if (!docData || typeof docData !== 'object') return [];
  const raw = docData as { sheets?: Sheet[]; data?: SheetGrid };

  let sheets: Sheet[] = [];
  if (Array.isArray(raw.sheets) && raw.sheets.length > 0) {
    sheets = raw.sheets;
  } else if (raw.data && typeof raw.data === 'object') {
    sheets = [{ id: 'sheet-1', name: 'Hoja 1', type: 'grid', data: raw.data }];
  }

  if (sheets.length === 0) return [];
  bindWorkbookFormulaContext(sheets);

  const pages: SheetRenderedCanvasPage[] = [];
  for (const sheet of sheets) {
    const rendered = renderSheetToCanvasDataUrl(sheet, sheets, options);
    if (rendered) pages.push(rendered);
  }
  return pages;
}

export function renderSheetBlockToCanvasImage(
  content: Record<string, unknown> | undefined,
  options: SheetCanvasExportOptions = {}
): SheetRenderedCanvasPage | null {
  if (!content) return null;
  const grid = (content['data'] || (content['workbookData'] as { data?: SheetGrid } | undefined)?.data) as
    | SheetGrid
    | undefined;
  if (!grid || typeof grid !== 'object') return null;

  let maxCol = BLOCK_DEFAULT_COLS - 1;
  let maxRow = BLOCK_DEFAULT_ROWS - 1;
  for (const id of Object.keys(grid)) {
    const pos = parseCellId(id);
    if (pos) {
      if (pos.col > maxCol) maxCol = pos.col;
      if (pos.row > maxRow) maxRow = pos.row;
    }
  }

  const sheet: Sheet = {
    id: 'block-sheet',
    name: 'Hoja',
    type: 'grid',
    data: grid,
    pageLayout: {
      theme: 'office',
      margins: 'normal',
      orientation: 'portrait',
      size: 'a4',
      widthPages: 'auto',
      heightPages: 'auto',
      scale: 100,
      gridlinesPrint: true,
      headingsPrint: true,
    },
  };
  return renderSheetToCanvasDataUrl(sheet, [sheet], {
    scale: options.scale ?? 2,
    gridlines: true,
    headings: true,
  });
}
