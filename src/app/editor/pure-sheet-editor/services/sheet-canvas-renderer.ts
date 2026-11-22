import {
  BorderEdge,
  BorderLineStyle,
  CellBorders,
  CellComment,
  CellData,
  CellStyle,
  CellValidationRule,
  ColumnFilters,
  ConditionalRule,
  FreezePanesConfig,
  IconSetStyle,
  MergeRegion,
  OutlineGroup,
  PageLayoutConfig,
  PresetStyle,
  SelectionRange,
  SheetGrid,
  SheetTable,
  SparklineConfig,
  SparklineType,
} from '../models/excel.model';
import {
  colIndexToLetter,
  evaluateCellValueCached,
  FormulaCalculationCache,
  getCellId,
  getCellSpill,
  interpolateColorScale,
} from './formula-engine.service';
import { parseNumericLiteral } from './calc-types';
import { GridAxis } from './grid-viewport';

export const SHEET_HEADER_COL_WIDTH = 40;
export const SHEET_HEADER_ROW_HEIGHT = 24;
export const SHEET_RESIZE_HIT_PX = 5;
export const SHEET_FILL_HANDLE_SIZE = 8;

export interface SheetCanvasPalette {
  cellBg: string;
  cellText: string;
  gridline: string;
  defaultBorder: string;
  headerBg: string;
  headerActiveBg: string;
  headerText: string;
  headerRowText: string;
  headerBorder: string;
  cornerTriangle: string;
  selectionFill: string;
  selectionStroke: string;
  traceFill: string;
  traceStroke: string;
  freezeLine: string;
}

export interface SheetAxisBand {
  index: number;
  start: number;
  size: number;
  frozen: boolean;
  selected: boolean;
}

export interface SheetRenderCell {
  col: number;
  row: number;
  endCol: number;
  endRow: number;
  colSpan: number;
  rowSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  frozenCol: boolean;
  frozenRow: boolean;
  text: string;
  raw: string;
  style?: CellStyle;
  resolvedBgColor?: string;
  resolvedTextColor?: string;
  resolvedBold?: boolean;
  dataBar?: { ratio: number; color: string } | null;
  iconIndicator?: { level: 'high' | 'mid' | 'low'; style: IconSetStyle } | null;
  hasComment?: boolean;
  hyperlink?: string;
  locked?: boolean;
  sparkline?: { type: SparklineType; values: number[]; color: string; showMarkers: boolean } | null;
  hasFilterButton?: boolean;
  filterActive?: boolean;
  hasValidationDropdown?: boolean;
  filteredOut?: boolean;
  isCheckbox?: boolean;
  checkboxChecked?: boolean;
  isNumeric?: boolean;
  overflowWidth?: number;
  inTable?: boolean;
  tableHeader?: boolean;
  isActive: boolean;
  isSelected: boolean;
  isTraced: boolean;
  sourceHighlight: Record<string, string> | null;
  borders?: CellBorders;
  skipTopBorder: boolean;
  skipLeftBorder: boolean;
}

export interface SheetFilterButtonRect {
  col: number;
  row: number;
  x: number;
  y: number;
  size: number;
}

export interface SheetOutlineButtonRect {
  axis: 'col' | 'row';
  groupIndex: number;
  start: number;
  end: number;
  collapsed: boolean;
  spanStartPx: number;
  spanEndPx: number;
  x: number;
  y: number;
  size: number;
}

export interface SheetHoveredHeader {
  kind: 'colHeader' | 'colResize' | 'rowHeader' | 'rowResize';
  index: number;
}

export interface SheetResizeGuide {
  type: 'col' | 'row';
  pos: number;
  size: number;
}

export interface SheetTableVisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
}

export interface SheetActiveEditorState {
  col: number;
  row: number;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  caretVisible?: boolean;
  style?: CellStyle;
}

export interface SheetCanvasFrame {
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  headerW: number;
  headerH: number;
  frozenCols: number;
  frozenRows: number;
  frozenWidth: number;
  frozenHeight: number;
  totalCols: number;
  totalRows: number;
  colBands: SheetAxisBand[];
  rowBands: SheetAxisBand[];
  cells: SheetRenderCell[];
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  fillHandleRect: { x: number; y: number; size: number } | null;
  spillRect: { x: number; y: number; width: number; height: number } | null;
  clipboardRect: { mode: 'copy' | 'cut'; x: number; y: number; width: number; height: number } | null;
  clipboardPhase: number;
  printAreaRect: { x: number; y: number; width: number; height: number } | null;
  pageBreakXs: number[];
  pageBreakYs: number[];
  hiddenColBreaks: number[];
  hiddenRowBreaks: number[];
  colOutlineButtons: SheetOutlineButtonRect[];
  rowOutlineButtons: SheetOutlineButtonRect[];
  sheetProtected: boolean;
  filterButtons: SheetFilterButtonRect[];
  validationButtons: SheetFilterButtonRect[];
  checkboxes: SheetFilterButtonRect[];
  commentCorners: SheetFilterButtonRect[];
  tableRects: SheetTableVisualRect[];
  activeResizeGuide: SheetResizeGuide | null;
  hoveredHeader: SheetHoveredHeader | null;
  activeEditor: SheetActiveEditorState | null;
  palette: SheetCanvasPalette;
  isDarkChrome: boolean;
  showGridlines: boolean;
  showHeadings: boolean;
  isEditing: boolean;
  isFillDragging: boolean;
}

export type SheetHitTarget =
  | { kind: 'corner' }
  | { kind: 'colResize'; col: number }
  | { kind: 'colHeader'; col: number }
  | { kind: 'rowResize'; row: number }
  | { kind: 'rowHeader'; row: number }
  | { kind: 'outlineToggle'; axis: 'col' | 'row'; groupIndex: number }
  | { kind: 'filterButton'; col: number; row: number }
  | { kind: 'validationButton'; col: number; row: number }
  | { kind: 'commentIndicator'; col: number; row: number }
  | { kind: 'checkbox'; col: number; row: number }
  | { kind: 'fillHandle' }
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'empty' };

export interface SheetCanvasBuildParams {
  grid: SheetGrid;
  calculationCache: FormulaCalculationCache;
  colAxis: GridAxis;
  rowAxis: GridAxis;
  totalCols: number;
  totalRows: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  selectedCell: { col: number; row: number };
  normalizedRange: { minCol: number; maxCol: number; minRow: number; maxRow: number };
  merges?: MergeRegion[];
  freezePanes?: FreezePanesConfig;
  colGroups?: OutlineGroup[];
  rowGroups?: OutlineGroup[];
  sheetProtected?: boolean;
  showHeadings: boolean;
  showGridlines: boolean;
  showFormulasInCells: boolean;
  isDarkChrome: boolean;
  isEditing: boolean;
  isFillDragging: boolean;
  conditionalRules?: ConditionalRule[];
  tables?: SheetTable[];
  validations?: Record<string, CellValidationRule>;
  comments?: Record<string, CellComment>;
  sparklines?: Record<string, SparklineConfig>;
  filtersEnabled?: boolean;
  columnFilters?: ColumnFilters;
  printArea?: SelectionRange | null;
  pageLayout?: PageLayoutConfig | null;
  clipboardRange?: {
    mode: 'copy' | 'cut';
    range: { minCol: number; maxCol: number; minRow: number; maxRow: number };
  } | null;
  clipboardPhase?: number;
  activeResize?: { type: 'col' | 'row'; index: number; size: number } | null;
  hoveredHeader?: SheetHoveredHeader | null;
  activeEditor?: SheetActiveEditorState | null;
  formatDisplay: (val: string | number, style?: CellStyle) => string;
  mergedRegion: (col: number, row: number) => MergeRegion | undefined;
  getEffectiveBorders: (col: number, row: number) => CellBorders | undefined;
  shouldSkipBorder: (col: number, row: number, edge: 'top' | 'left') => boolean;
  isTracedCell: (col: number, row: number) => boolean;
  getSourceHighlight: (col: number, row: number) => Record<string, string> | null;
}

export interface SheetHitTestParams {
  colAxis: GridAxis;
  rowAxis: GridAxis;
  totalCols: number;
  totalRows: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  showHeadings: boolean;
  freezePanes?: FreezePanesConfig;
  frame?: SheetCanvasFrame | null;
  mergedRegion: (col: number, row: number) => MergeRegion | undefined;
}

export function getSheetCanvasPalette(isDarkChrome: boolean): SheetCanvasPalette {
  return {
    // Editable cell area stays light in both light and dark modes (like Word document sheet).
    cellBg: '#ffffff',
    cellText: '#1e293b',
    gridline: '#e2e8f0',
    defaultBorder: '#000000',
    headerBg: isDarkChrome ? '#1e293b' : '#f1f5f9',
    headerActiveBg: isDarkChrome ? '#334155' : '#e2e8f0',
    headerText: isDarkChrome ? '#cbd5e1' : '#334155',
    headerRowText: isDarkChrome ? '#94a3b8' : '#475569',
    headerBorder: isDarkChrome ? '#334155' : '#cbd5e1',
    cornerTriangle: '#94a3b8',
    selectionFill: 'rgba(16, 185, 129, 0.20)',
    selectionStroke: '#059669',
    traceFill: 'rgba(245, 158, 11, 0.24)',
    traceStroke: '#f59e0b',
    freezeLine: '#94a3b8',
  };
}

interface ResolvedRuleStats {
  rule: ConditionalRule;
  minVal: number;
  maxVal: number;
  avgVal: number;
  duplicates: Set<string>;
}

const PRESET_VISUALS: Record<PresetStyle, { bgColor?: string; textColor?: string; bold?: boolean }> = {
  normal: {},
  bad: { bgColor: '#ffc7ce', textColor: '#9c0006' },
  good: { bgColor: '#c6efce', textColor: '#006100' },
  neutral: { bgColor: '#ffeb9c', textColor: '#9c6500' },
  calculation: { bgColor: '#f2f2f2', textColor: '#fa7d00', bold: true },
  check: { bgColor: '#a5a5a5', textColor: '#ffffff', bold: true },
};

export class SheetCanvasRenderer {
  private readonly textMeasureCache = new Map<string, number>();

  buildFrame(params: SheetCanvasBuildParams): SheetCanvasFrame {
    const headerW = params.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = params.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    const vw = Math.max(1, params.viewportWidth);
    const vh = Math.max(1, params.viewportHeight);

    const frozenCols = Math.max(0, Math.min(params.totalCols - 1, params.freezePanes?.cols ?? 0));
    const frozenRows = Math.max(0, Math.min(params.totalRows - 1, params.freezePanes?.rows ?? 0));
    const frozenWidth = frozenCols > 0 ? params.colAxis.offset(frozenCols) : 0;
    const frozenHeight = frozenRows > 0 ? params.rowAxis.offset(frozenRows) : 0;

    const scrollCols = params.colAxis.window(
      params.scrollLeft + frozenWidth,
      Math.max(1, vw - headerW - frozenWidth),
      1
    ).indices.filter(c => c >= frozenCols);

    const scrollRows = params.rowAxis.window(
      params.scrollTop + frozenHClamp(frozenHeight),
      Math.max(1, vh - headerH - frozenHeight),
      1
    ).indices.filter(r => r >= frozenRows);

    const { minCol, maxCol, minRow, maxRow } = params.normalizedRange;

    const colBands: SheetAxisBand[] = [];
    const hiddenColBreaks: number[] = [];
    for (let c = 0; c < frozenCols; c++) {
      const start = headerW + params.colAxis.offset(c);
      const size = params.colAxis.offset(c + 1) - params.colAxis.offset(c);
      if (size <= 0) continue;
      if (c > 0 && params.colAxis.isHidden(c - 1)) hiddenColBreaks.push(start);
      colBands.push({ index: c, start, size, frozen: true, selected: c >= minCol && c <= maxCol });
    }
    for (const c of scrollCols) {
      const start = headerW + params.colAxis.offset(c) - params.scrollLeft;
      const size = params.colAxis.offset(c + 1) - params.colAxis.offset(c);
      if (size <= 0) continue;
      if (c > 0 && params.colAxis.isHidden(c - 1)) hiddenColBreaks.push(start);
      colBands.push({ index: c, start, size, frozen: false, selected: c >= minCol && c <= maxCol });
    }

    const rowBands: SheetAxisBand[] = [];
    const hiddenRowBreaks: number[] = [];
    for (let r = 0; r < frozenRows; r++) {
      const start = headerH + params.rowAxis.offset(r);
      const size = params.rowAxis.offset(r + 1) - params.rowAxis.offset(r);
      if (size <= 0) continue;
      if (r > 0 && params.rowAxis.isHidden(r - 1)) hiddenRowBreaks.push(start);
      rowBands.push({ index: r, start, size, frozen: true, selected: r >= minRow && r <= maxRow });
    }
    for (const r of scrollRows) {
      const start = headerH + params.rowAxis.offset(r) - params.scrollTop;
      const size = params.rowAxis.offset(r + 1) - params.rowAxis.offset(r);
      if (size <= 0) continue;
      if (r > 0 && params.rowAxis.isHidden(r - 1)) hiddenRowBreaks.push(start);
      rowBands.push({ index: r, start, size, frozen: false, selected: r >= minRow && r <= maxRow });
    }

    const cells = this.collectVisibleCells(params, colBands, rowBands, frozenCols, frozenRows, headerW, headerH);
    const { selectionRect, fillHandleRect } = this.computeSelectionOverlay(
      params,
      headerW,
      headerH,
      frozenCols,
      frozenRows
    );

    const activeSpill = this.resolveActiveSpillRect(params, headerW, headerH, frozenCols, frozenRows);
    const clipboardRect = params.clipboardRange
      ? (() => {
          const rect = this.projectRangeRect(
            params,
            params.clipboardRange!.range.minCol,
            params.clipboardRange!.range.maxCol,
            params.clipboardRange!.range.minRow,
            params.clipboardRange!.range.maxRow,
            headerW,
            headerH,
            frozenCols,
            frozenRows
          );
          return rect ? { mode: params.clipboardRange!.mode, ...rect } : null;
        })()
      : null;

    const printAreaRect = params.printArea
      ? this.projectRangeRect(
          params,
          Math.min(params.printArea.startCol, params.printArea.endCol),
          Math.max(params.printArea.startCol, params.printArea.endCol),
          Math.min(params.printArea.startRow, params.printArea.endRow),
          Math.max(params.printArea.startRow, params.printArea.endRow),
          headerW,
          headerH,
          frozenCols,
          frozenRows
        )
      : null;

    const tableRects: SheetTableVisualRect[] = [];
    for (const table of params.tables || []) {
      const tMinCol = Math.min(table.range.startCol, table.range.endCol);
      const tMaxCol = Math.max(table.range.startCol, table.range.endCol);
      const tMinRow = Math.min(table.range.startRow, table.range.endRow);
      const tMaxRow = Math.max(table.range.startRow, table.range.endRow);
      const rect = this.projectRangeRect(params, tMinCol, tMaxCol, tMinRow, tMaxRow, headerW, headerH, frozenCols, frozenRows);
      if (rect) {
        const headerHeight = table.hasHeaders
          ? params.rowAxis.offset(tMinRow + 1) - params.rowAxis.offset(tMinRow)
          : 0;
        tableRects.push({ ...rect, headerHeight });
      }
    }

    let activeResizeGuide: SheetResizeGuide | null = null;
    if (params.activeResize) {
      if (params.activeResize.type === 'col') {
        const idx = params.activeResize.index;
        const pos =
          idx < frozenCols
            ? headerW + params.colAxis.offset(idx + 1)
            : headerW + params.colAxis.offset(idx + 1) - params.scrollLeft;
        activeResizeGuide = { type: 'col', pos, size: params.activeResize.size };
      } else {
        const idx = params.activeResize.index;
        const pos =
          idx < frozenRows
            ? headerH + params.rowAxis.offset(idx + 1)
            : headerH + params.rowAxis.offset(idx + 1) - params.scrollTop;
        activeResizeGuide = { type: 'row', pos, size: params.activeResize.size };
      }
    }

    const filterButtons: SheetFilterButtonRect[] = [];
    const validationButtons: SheetFilterButtonRect[] = [];
    const checkboxes: SheetFilterButtonRect[] = [];
    const commentCorners: SheetFilterButtonRect[] = [];
    for (const c of cells) {
      if (c.hasFilterButton) {
        const size = Math.min(14, Math.max(10, c.height - 8));
        filterButtons.push({
          col: c.col,
          row: c.row,
          x: c.x + c.width - size - 4,
          y: c.y + Math.round((c.height - size) / 2),
          size,
        });
      }
      if (c.hasValidationDropdown) {
        const size = Math.min(14, Math.max(10, c.height - 8));
        validationButtons.push({
          col: c.col,
          row: c.row,
          x: c.x + c.width - size - 4,
          y: c.y + Math.round((c.height - size) / 2),
          size,
        });
      }
      if (c.hasComment) {
        const size = 8;
        commentCorners.push({
          col: c.col,
          row: c.row,
          x: c.x + c.width - size,
          y: c.y,
          size,
        });
      }
      if (c.isCheckbox) {
        const size = Math.min(14, Math.max(10, c.height - 8));
        const align = c.style?.align || 'center';
        const bx =
          align === 'left'
            ? c.x + 8
            : align === 'right'
              ? c.x + c.width - size - 8
              : c.x + Math.round((c.width - size) / 2);
        checkboxes.push({
          col: c.col,
          row: c.row,
          x: bx,
          y: c.y + Math.round((c.height - size) / 2),
          size,
        });
      }
    }

    const { pageBreakXs, pageBreakYs } = this.computePageBreaks(
      params,
      colBands,
      rowBands,
      headerW,
      headerH,
      frozenCols,
      frozenRows
    );

    const colOutlineButtons = params.showHeadings
      ? this.computeOutlineButtons('col', params.colGroups, params.colAxis, headerW, headerH, frozenCols, frozenWidth, params.scrollLeft, vw, params.totalCols)
      : [];
    const rowOutlineButtons = params.showHeadings
      ? this.computeOutlineButtons('row', params.rowGroups, params.rowAxis, headerW, headerH, frozenRows, frozenHeight, params.scrollTop, vh, params.totalRows)
      : [];

    return {
      viewportWidth: vw,
      viewportHeight: vh,
      scrollLeft: params.scrollLeft,
      scrollTop: params.scrollTop,
      headerW,
      headerH,
      frozenCols,
      frozenRows,
      frozenWidth,
      frozenHeight,
      totalCols: params.totalCols,
      totalRows: params.totalRows,
      colBands,
      rowBands,
      cells,
      selectionRect,
      fillHandleRect,
      spillRect: activeSpill,
      clipboardRect,
      clipboardPhase: params.clipboardPhase ?? 0,
      printAreaRect,
      pageBreakXs,
      pageBreakYs,
      hiddenColBreaks,
      hiddenRowBreaks,
      colOutlineButtons,
      rowOutlineButtons,
      sheetProtected: Boolean(params.sheetProtected),
      filterButtons,
      validationButtons,
      checkboxes,
      commentCorners,
      tableRects,
      activeResizeGuide,
      hoveredHeader: params.hoveredHeader ?? null,
      activeEditor: params.activeEditor ?? null,
      palette: getSheetCanvasPalette(params.isDarkChrome),
      isDarkChrome: params.isDarkChrome,
      showGridlines: params.showGridlines,
      showHeadings: params.showHeadings,
      isEditing: params.isEditing,
      isFillDragging: params.isFillDragging,
    };
  }

  private computeOutlineButtons(
    axis: 'col' | 'row',
    groups: OutlineGroup[] | undefined,
    gridAxis: GridAxis,
    headerW: number,
    headerH: number,
    frozenCount: number,
    frozenExtent: number,
    scrollPos: number,
    viewportExtent: number,
    totalCount: number
  ): SheetOutlineButtonRect[] {
    if (!groups?.length) return [];
    const headerStart = axis === 'col' ? headerW : headerH;
    const size = 10;
    const toScreenPx = (index: number): number => {
      const clamped = Math.max(0, Math.min(totalCount, index));
      const world = gridAxis.offset(clamped);
      return clamped <= frozenCount ? headerStart + world : headerStart + world - scrollPos;
    };

    const result: SheetOutlineButtonRect[] = [];
    groups.forEach((group, groupIndex) => {
      const start = Math.max(0, Math.min(totalCount - 1, group.start));
      const end = Math.max(start, Math.min(totalCount - 1, group.end));
      const spanStartPx = toScreenPx(start);
      const spanEndPx = toScreenPx(end + 1);
      const collapsed = Boolean(group.collapsed);

      // Hide buttons belonging strictly to scrollable panes scrolled out behind frozen panes or past viewport.
      const anchor = collapsed ? spanStartPx : spanEndPx;
      if (start >= frozenCount && spanEndPx < headerStart + frozenExtent) return;
      if (spanStartPx > viewportExtent || anchor < headerStart - size) return;

      const clampedStart = Math.max(headerStart + 2, spanStartPx + 2);
      const btnMain = collapsed
        ? Math.max(headerStart + 2, Math.min(viewportExtent - size - 2, Math.round(spanStartPx - size / 2)))
        : Math.min(viewportExtent - size - 2, clampedStart);

      result.push({
        axis,
        groupIndex,
        start,
        end,
        collapsed,
        spanStartPx: Math.max(headerStart, spanStartPx),
        spanEndPx: Math.min(viewportExtent, spanEndPx),
        x: axis === 'col' ? btnMain : 2,
        y: axis === 'col' ? 2 : btnMain,
        size,
      });
    });
    return result;
  }

  private computePageBreaks(
    params: SheetCanvasBuildParams,
    colBands: SheetAxisBand[],
    rowBands: SheetAxisBand[],
    headerW: number,
    headerH: number,
    frozenCols: number,
    frozenRows: number
  ): { pageBreakXs: number[]; pageBreakYs: number[] } {
    if (!params.pageLayout?.showPageBreaks) {
      return { pageBreakXs: [], pageBreakYs: [] };
    }
    const isLandscape = params.pageLayout.orientation === 'landscape';
    const scale = Math.max(25, Math.min(200, params.pageLayout.scale || 100)) / 100;
    const baseW = isLandscape ? 980 : 680;
    const baseH = isLandscape ? 640 : 940;
    const pageW = baseW / scale;
    const pageH = baseH / scale;

    const pageBreakXs: number[] = [];
    for (const band of colBands) {
      if (band.index === 0) continue;
      const worldEnd = params.colAxis.offset(band.index);
      const prevWorldEnd = band.index > 0 ? params.colAxis.offset(band.index - 1) : 0;
      if (Math.floor(worldEnd / pageW) > Math.floor(prevWorldEnd / pageW)) {
        const x =
          band.index < frozenCols
            ? headerW + worldEnd
            : headerW + worldEnd - params.scrollLeft;
        pageBreakXs.push(x);
      }
    }

    const pageBreakYs: number[] = [];
    for (const band of rowBands) {
      if (band.index === 0) continue;
      const worldEnd = params.rowAxis.offset(band.index);
      const prevWorldEnd = band.index > 0 ? params.rowAxis.offset(band.index - 1) : 0;
      if (Math.floor(worldEnd / pageH) > Math.floor(prevWorldEnd / pageH)) {
        const y =
          band.index < frozenRows
            ? headerH + worldEnd
            : headerH + worldEnd - params.scrollTop;
        pageBreakYs.push(y);
      }
    }

    return { pageBreakXs, pageBreakYs };
  }

  private resolveActiveSpillRect(
    params: SheetCanvasBuildParams,
    headerW: number,
    headerH: number,
    frozenCols: number,
    frozenRows: number
  ): { x: number; y: number; width: number; height: number } | null {
    const activeId = getCellId(params.selectedCell.col, params.selectedCell.row);
    const spill = getCellSpill(activeId, params.grid, params.calculationCache);
    if (!spill || (spill.rows <= 1 && spill.cols <= 1)) return null;
    const match = spill.owner.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    let ownerCol = 0;
    for (let i = 0; i < match[1].length; i++) {
      ownerCol = ownerCol * 26 + (match[1].charCodeAt(i) - 64);
    }
    ownerCol -= 1;
    const ownerRow = parseInt(match[2], 10) - 1;
    return this.projectRangeRect(
      params,
      ownerCol,
      ownerCol + spill.cols - 1,
      ownerRow,
      ownerRow + spill.rows - 1,
      headerW,
      headerH,
      frozenCols,
      frozenRows
    );
  }

  private projectRangeRect(
    params: SheetCanvasBuildParams,
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
    headerW: number,
    headerH: number,
    frozenCols: number,
    frozenRows: number
  ): { x: number; y: number; width: number; height: number } | null {
    if (minCol > maxCol || minRow > maxRow) return null;
    const leftWorld = params.colAxis.offset(minCol);
    const rightWorld = params.colAxis.offset(maxCol + 1);
    const topWorld = params.rowAxis.offset(minRow);
    const bottomWorld = params.rowAxis.offset(maxRow + 1);

    const x1 = minCol < frozenCols ? headerW + leftWorld : headerW + leftWorld - params.scrollLeft;
    const x2 = maxCol < frozenCols ? headerW + rightWorld : headerW + rightWorld - params.scrollLeft;
    const y1 = minRow < frozenRows ? headerH + topWorld : headerH + topWorld - params.scrollTop;
    const y2 = maxRow < frozenRows ? headerH + bottomWorld : headerH + bottomWorld - params.scrollTop;

    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0 || height <= 0) return null;
    return { x: x1, y: y1, width, height };
  }

  private forEachRuleCellValue(
    rule: ConditionalRule,
    params: SheetCanvasBuildParams,
    visitor: (val: string | number) => void
  ): void {
    const minCol = Math.min(rule.range.startCol, rule.range.endCol);
    const maxCol = Math.max(rule.range.startCol, rule.range.endCol);
    const minRow = Math.min(rule.range.startRow, rule.range.endRow);
    const maxRow = Math.max(rule.range.startRow, rule.range.endRow);
    const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);

    if (area <= 2500) {
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          visitor(evaluateCellValueCached(getCellId(c, r), params.grid, params.calculationCache));
        }
      }
      return;
    }

    for (const id of Object.keys(params.grid)) {
      const match = id.match(/^([A-Z]+)(\d+)$/);
      if (!match) continue;
      let col = 0;
      for (let i = 0; i < match[1].length; i++) col = col * 26 + (match[1].charCodeAt(i) - 64);
      col -= 1;
      const row = parseInt(match[2], 10) - 1;
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
      visitor(evaluateCellValueCached(id, params.grid, params.calculationCache));
    }
  }

  private precomputeConditionalStats(params: SheetCanvasBuildParams): Map<ConditionalRule, ResolvedRuleStats> {
    const map = new Map<ConditionalRule, ResolvedRuleStats>();
    for (const rule of params.conditionalRules || []) {
      const needsNumericStats =
        rule.type === 'colorScale' ||
        rule.type === 'dataBar' ||
        rule.type === 'iconSet' ||
        rule.type === 'aboveAverage';
      const needsDupes = rule.type === 'duplicates';
      if (!needsNumericStats && !needsDupes) continue;

      let minVal = Infinity;
      let maxVal = -Infinity;
      let sum = 0;
      let count = 0;
      const seen = new Set<string>();
      const duplicates = new Set<string>();

      this.forEachRuleCellValue(rule, params, (v) => {
        if (needsNumericStats) {
          const n = typeof v === 'number' ? v : Number(v);
          if (v !== '' && !isNaN(n)) {
            if (n < minVal) minVal = n;
            if (n > maxVal) maxVal = n;
            sum += n;
            count += 1;
          }
        }
        if (needsDupes) {
          const key = String(v ?? '').trim().toLowerCase();
          if (key) {
            if (seen.has(key)) duplicates.add(key);
            else seen.add(key);
          }
        }
      });

      map.set(rule, {
        rule,
        minVal: count ? minVal : 0,
        maxVal: count ? maxVal : 0,
        avgVal: count ? sum / count : 0,
        duplicates,
      });
    }
    return map;
  }

  private resolveConditionalStyle(
    col: number,
    row: number,
    evaluated: string | number,
    rules: ConditionalRule[] | undefined,
    ruleStats: Map<ConditionalRule, ResolvedRuleStats>
  ): {
    bgColor?: string;
    textColor?: string;
    bold?: boolean;
    dataBar?: { ratio: number; color: string } | null;
    iconIndicator?: { level: 'high' | 'mid' | 'low'; style: IconSetStyle } | null;
  } | null {
    if (!rules?.length) return null;
    let bgColor: string | undefined;
    let textColor: string | undefined;
    let bold: boolean | undefined;
    let dataBar: { ratio: number; color: string } | null = null;
    let iconIndicator: { level: 'high' | 'mid' | 'low'; style: IconSetStyle } | null = null;
    let hasMatch = false;

    const numVal = typeof evaluated === 'number' ? evaluated : Number(evaluated);
    const isNumeric = evaluated !== '' && !isNaN(numVal);

    const applyPreset = (preset?: PresetStyle) => {
      const vis = PRESET_VISUALS[preset || 'good'];
      bgColor = vis.bgColor;
      textColor = vis.textColor;
      bold = vis.bold;
      hasMatch = true;
    };

    for (const rule of rules) {
      const minCol = Math.min(rule.range.startCol, rule.range.endCol);
      const maxCol = Math.max(rule.range.startCol, rule.range.endCol);
      const minRow = Math.min(rule.range.startRow, rule.range.endRow);
      const maxRow = Math.max(rule.range.startRow, rule.range.endRow);
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;

      if (rule.type === 'greaterThan' && isNumeric && rule.value1 !== undefined) {
        if (numVal > rule.value1) applyPreset(rule.presetStyle || 'good');
      } else if (rule.type === 'lessThan' && isNumeric && rule.value1 !== undefined) {
        if (numVal < rule.value1) applyPreset(rule.presetStyle || 'bad');
      } else if (rule.type === 'between' && isNumeric && rule.value1 !== undefined && rule.value2 !== undefined) {
        const low = Math.min(rule.value1, rule.value2);
        const high = Math.max(rule.value1, rule.value2);
        if (numVal >= low && numVal <= high) applyPreset(rule.presetStyle || 'neutral');
      } else if (rule.type === 'equalTo' && rule.textValue !== undefined) {
        if (String(evaluated).toLowerCase() === rule.textValue.trim().toLowerCase()) {
          applyPreset(rule.presetStyle || 'good');
        }
      } else if (rule.type === 'containsText' && rule.textValue) {
        const needle = rule.textValue.trim().toLowerCase();
        if (needle && String(evaluated).toLowerCase().includes(needle)) {
          applyPreset(rule.presetStyle || 'neutral');
        }
      } else if (rule.type === 'duplicates') {
        const key = String(evaluated ?? '').trim().toLowerCase();
        const stats = ruleStats.get(rule);
        if (key && stats?.duplicates.has(key)) {
          applyPreset(rule.presetStyle || 'bad');
        }
      } else if (rule.type === 'aboveAverage' && isNumeric) {
        const stats = ruleStats.get(rule);
        if (stats && numVal > stats.avgVal) {
          applyPreset(rule.presetStyle || 'good');
        }
      } else if (rule.type === 'colorScale' && isNumeric) {
        const stats = ruleStats.get(rule);
        if (stats && stats.minVal <= stats.maxVal) {
          const ratio = stats.maxVal === stats.minVal ? 0.5 : (numVal - stats.minVal) / (stats.maxVal - stats.minVal);
          const colors = interpolateColorScale(ratio, rule.colorScale || 'green-yellow-red');
          bgColor = colors.bg;
          textColor = colors.text;
          hasMatch = true;
        }
      } else if (rule.type === 'dataBar' && isNumeric) {
        const stats = ruleStats.get(rule);
        if (stats) {
          const baseline = stats.minVal < 0 ? stats.minVal : 0;
          const span = stats.maxVal - baseline;
          const ratio = span <= 0 ? (numVal > 0 ? 1 : 0) : Math.max(0.04, Math.min(1, (numVal - baseline) / span));
          dataBar = { ratio, color: rule.dataBarColor || '#10b981' };
          hasMatch = true;
        }
      } else if (rule.type === 'iconSet' && isNumeric) {
        const stats = ruleStats.get(rule);
        if (stats) {
          const ratio = stats.maxVal === stats.minVal ? 0.5 : (numVal - stats.minVal) / (stats.maxVal - stats.minVal);
          const level: 'high' | 'mid' | 'low' = ratio >= 0.67 ? 'high' : ratio >= 0.33 ? 'mid' : 'low';
          iconIndicator = { level, style: rule.iconSetStyle || 'trafficLights' };
          hasMatch = true;
        }
      }
    }
    return hasMatch ? { bgColor, textColor, bold, dataBar, iconIndicator } : null;
  }

  private resolveCellSparkline(
    config: SparklineConfig | undefined,
    params: SheetCanvasBuildParams
  ): { type: SparklineType; values: number[]; color: string; showMarkers: boolean } | null {
    if (!config) return null;
    const minCol = Math.min(config.sourceRange.startCol, config.sourceRange.endCol);
    const maxCol = Math.max(config.sourceRange.startCol, config.sourceRange.endCol);
    const minRow = Math.min(config.sourceRange.startRow, config.sourceRange.endRow);
    const maxRow = Math.max(config.sourceRange.startRow, config.sourceRange.endRow);
    const area = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    if (area > 500) return null;

    const values: number[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const v = evaluateCellValueCached(getCellId(c, r), params.grid, params.calculationCache);
        const n = typeof v === 'number' ? v : Number(v);
        if (v !== '' && Number.isFinite(n)) values.push(n);
      }
    }
    if (!values.length) return null;
    return {
      type: config.type,
      values,
      color: config.color || '#059669',
      showMarkers: config.showMarkers !== false,
    };
  }

  private collectVisibleCells(
    params: SheetCanvasBuildParams,
    colBands: SheetAxisBand[],
    rowBands: SheetAxisBand[],
    frozenCols: number,
    frozenRows: number,
    headerW: number,
    headerH: number
  ): SheetRenderCell[] {
    const colIndexPos = new Map<number, number>();
    colBands.forEach((b, i) => colIndexPos.set(b.index, i));
    const rowIndexPos = new Map<number, number>();
    rowBands.forEach((b, i) => rowIndexPos.set(b.index, i));

    const covered = new Set<string>();
    const cells: SheetRenderCell[] = [];
    const { minCol, maxCol, minRow, maxRow } = params.normalizedRange;
    const ruleStats = this.precomputeConditionalStats(params);
    const tables = params.tables || [];

    // Clipped merge anchors for all merges intersecting visible bands
    const visibleColStart = colBands[0]?.index ?? 0;
    const visibleColEnd = colBands[colBands.length - 1]?.index ?? -1;
    const visibleRowStart = rowBands[0]?.index ?? 0;
    const visibleRowEnd = rowBands[rowBands.length - 1]?.index ?? -1;

    const mergeRects = new Map<string, { anchorCol: number; anchorRow: number; endCol: number; endRow: number }>();
    for (const m of params.merges || []) {
      const firstCol = Math.max(m.startCol, visibleColStart);
      const lastCol = Math.min(m.endCol, visibleColEnd);
      const firstRow = Math.max(m.startRow, visibleRowStart);
      const lastRow = Math.min(m.endRow, visibleRowEnd);
      if (firstCol > lastCol || firstRow > lastRow) continue;

      for (let r = firstRow; r <= lastRow; r++) {
        for (let c = firstCol; c <= lastCol; c++) {
          if (!colIndexPos.has(c) || !rowIndexPos.has(r)) continue;
          if (c === firstCol && r === firstRow) {
            mergeRects.set(`${c}:${r}`, { anchorCol: m.startCol, anchorRow: m.startRow, endCol: lastCol, endRow: lastRow });
          } else {
            covered.add(`${c}:${r}`);
          }
        }
      }
    }

    for (const rBand of rowBands) {
      for (const cBand of colBands) {
        const key = `${cBand.index}:${rBand.index}`;
        if (covered.has(key)) continue;

        const mergeInfo = mergeRects.get(key);
        const cellCol = mergeInfo ? mergeInfo.anchorCol : cBand.index;
        const cellRow = mergeInfo ? mergeInfo.anchorRow : rBand.index;
        const endCol = mergeInfo ? mergeInfo.endCol : cBand.index;
        const endRow = mergeInfo ? mergeInfo.endRow : rBand.index;

        const width = params.colAxis.offset(endCol + 1) - params.colAxis.offset(cBand.index);
        const height = params.rowAxis.offset(endRow + 1) - params.rowAxis.offset(rBand.index);
        if (width <= 0 || height <= 0) continue;

        const id = getCellId(cellCol, cellRow);
        const cell: CellData | undefined = params.grid[id];
        const raw = cell?.raw || '';
        const evaluated = params.showFormulasInCells && raw.startsWith('=')
          ? raw
          : evaluateCellValueCached(id, params.grid, params.calculationCache);
        const inferredLiteral =
          !raw.startsWith('=') && !cell?.style?.numberFormat
            ? parseNumericLiteral(raw)
            : null;
        const effectiveStyle: CellStyle | undefined = inferredLiteral?.isPercent
          ? {
              ...(cell?.style || {}),
              numberFormat: 'percent',
              ...(inferredLiteral.decimals > 0 && cell?.style?.decimals === undefined
                ? { decimals: Math.min(8, inferredLiteral.decimals) }
                : {}),
            }
          : inferredLiteral?.isCurrency
            ? { ...(cell?.style || {}), numberFormat: 'currency' }
            : cell?.style;
        const text = params.formatDisplay(evaluated, effectiveStyle);

        const presetVis = cell?.style?.preset ? PRESET_VISUALS[cell.style.preset] : undefined;
        const condVis = this.resolveConditionalStyle(cellCol, cellRow, evaluated, params.conditionalRules, ruleStats);

        let inTable = false;
        let tableHeader = false;
        let tableBg: string | undefined;
        let tableText: string | undefined;
        for (const table of tables) {
          const tMinC = Math.min(table.range.startCol, table.range.endCol);
          const tMaxC = Math.max(table.range.startCol, table.range.endCol);
          const tMinR = Math.min(table.range.startRow, table.range.endRow);
          const tMaxR = Math.max(table.range.startRow, table.range.endRow);
          if (cellCol >= tMinC && cellCol <= tMaxC && cellRow >= tMinR && cellRow <= tMaxR) {
            inTable = true;
            if (table.hasHeaders && cellRow === tMinR) {
              tableHeader = true;
              tableBg = '#047857';
              tableText = '#ffffff';
            } else if ((cellRow - tMinR) % 2 === 1) {
              tableBg = '#f8fafc';
            }
            break;
          }
        }

        const hasFilterButton = Boolean(
          (tableHeader || (params.filtersEnabled && !tables.length && cellRow === 0)) && width >= 30
        );
        const filterActive = Boolean(params.columnFilters?.[cellCol]?.size);
        let filteredOut = false;
        if (cellRow > 0 && params.columnFilters) {
          for (const [fColStr, allowed] of Object.entries(params.columnFilters)) {
            if (!allowed || allowed.size === 0) continue;
            const fCol = Number(fColStr);
            const fId = getCellId(fCol, cellRow);
            const fCell = params.grid[fId];
            const fVal = fCell ? evaluateCellValueCached(fId, params.grid, params.calculationCache) : '';
            const strVal = String(fVal ?? '').trim();
            if (!allowed.has(strVal)) {
              filteredOut = true;
              break;
            }
          }
        }

        const resolvedBgColor = condVis?.bgColor || cell?.style?.bgColor || presetVis?.bgColor || tableBg;
        const resolvedTextColor = condVis?.textColor || cell?.style?.textColor || presetVis?.textColor || tableText || (cell?.hyperlink ? '#0369a1' : undefined);
        const resolvedBold = cell?.style?.bold ?? condVis?.bold ?? presetVis?.bold ?? tableHeader;

        const isActive = params.selectedCell.col === cellCol && params.selectedCell.row === cellRow;
        const isSelected = cellCol >= minCol && cellCol <= maxCol && cellRow >= minRow && cellRow <= maxRow;
        const validationRule = params.validations?.[id];
        const hasValidationDropdown = Boolean(
          isActive &&
            !hasFilterButton &&
            validationRule?.type === 'list' &&
            validationRule.showDropdown !== false &&
            width >= 26
        );

        const isCheckbox = Boolean(cell?.style?.checkbox);
        const checkboxChecked = String(evaluated ?? '').trim().toUpperCase() === 'TRUE';
        const isNumeric = !(params.showFormulasInCells && raw.startsWith('='))
          && typeof evaluated === 'number'
          && Number.isFinite(evaluated);
        const sparkline = this.resolveCellSparkline(params.sparklines?.[id], params);
        const hasComment = Boolean(params.comments?.[id]?.text?.trim());

        cells.push({
          col: cellCol,
          row: cellRow,
          endCol,
          endRow,
          colSpan: endCol - cBand.index + 1,
          rowSpan: endRow - rBand.index + 1,
          x: cBand.start,
          y: rBand.start,
          width,
          height,
          frozenCol: cBand.frozen && cBand.index < frozenCols,
          frozenRow: rBand.frozen && rBand.index < frozenRows,
          text,
          raw,
          style: cell?.style,
          resolvedBgColor,
          resolvedTextColor,
          resolvedBold,
          dataBar: condVis?.dataBar ?? null,
          iconIndicator: condVis?.iconIndicator ?? null,
          hasComment,
          hyperlink: cell?.hyperlink,
          locked: Boolean(params.sheetProtected) && cell?.style?.locked !== false,
          sparkline,
          hasFilterButton,
          filterActive,
          hasValidationDropdown,
          filteredOut,
          isCheckbox,
          checkboxChecked,
          isNumeric,
          inTable,
          tableHeader,
          isActive,
          isSelected,
          isTraced: params.isTracedCell(cellCol, cellRow),
          sourceHighlight: params.getSourceHighlight(cellCol, cellRow),
          borders: params.getEffectiveBorders(cellCol, cellRow),
          skipTopBorder: params.shouldSkipBorder(cellCol, cellRow, 'top'),
          skipLeftBorder: params.shouldSkipBorder(cellCol, cellRow, 'left'),
        });
      }
    }

    // Expand horizontal overflow width across empty neighboring right cells
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.text || cell.isCheckbox || cell.sparkline || cell.iconIndicator || cell.hasFilterButton || cell.style?.wrapText || cell.style?.textRotation) continue;
      if ((cell.style?.align || 'left') !== 'left' || cell.borders?.right) continue;
      let expandedW = cell.width;
      let expectedCol = cell.endCol + 1;
      for (let j = i + 1; j < cells.length; j++) {
        const next = cells[j];
        if (next.row !== cell.row) break;
        if (next.col !== expectedCol || next.frozenCol !== cell.frozenCol) break;
        if (next.text || next.isCheckbox || next.resolvedBgColor || next.hasFilterButton || next.borders?.left) break;
        expandedW += next.width;
        expectedCol = next.endCol + 1;
        if (next.borders?.right) break;
      }
      if (expandedW > cell.width) {
        cell.overflowWidth = expandedW;
      }
    }

    void headerW;
    void headerH;

    return cells;
  }

  private computeSelectionOverlay(
    params: SheetCanvasBuildParams,
    headerW: number,
    headerH: number,
    frozenCols: number,
    frozenRows: number
  ): {
    selectionRect: { x: number; y: number; width: number; height: number } | null;
    fillHandleRect: { x: number; y: number; size: number } | null;
  } {
    const { minCol, maxCol, minRow, maxRow } = params.normalizedRange;
    const cornerMerge = params.mergedRegion(maxCol, maxRow);
    const effMaxCol = cornerMerge ? Math.max(maxCol, cornerMerge.endCol) : maxCol;
    const effMaxRow = cornerMerge ? Math.max(maxRow, cornerMerge.endRow) : maxRow;

    const leftWorld = params.colAxis.offset(minCol);
    const rightWorld = params.colAxis.offset(effMaxCol + 1);
    const topWorld = params.rowAxis.offset(minRow);
    const bottomWorld = params.rowAxis.offset(effMaxRow + 1);

    const x1 = minCol < frozenCols ? headerW + leftWorld : headerW + leftWorld - params.scrollLeft;
    const x2 = effMaxCol < frozenCols ? headerW + rightWorld : headerW + rightWorld - params.scrollLeft;
    const y1 = minRow < frozenRows ? headerH + topWorld : headerH + topWorld - params.scrollTop;
    const y2 = effMaxRow < frozenRows ? headerH + bottomWorld : headerH + bottomWorld - params.scrollTop;

    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 0 || height <= 0) return { selectionRect: null, fillHandleRect: null };

    const selectionRect = { x: x1, y: y1, width, height };
    const fillHandleRect = params.isEditing
      ? null
      : {
          x: x2 - SHEET_FILL_HANDLE_SIZE / 2,
          y: y2 - SHEET_FILL_HANDLE_SIZE / 2,
          size: SHEET_FILL_HANDLE_SIZE,
        };

    return { selectionRect, fillHandleRect };
  }

  hitTest(localX: number, localY: number, params: SheetHitTestParams): SheetHitTarget {
    if (localX < 0 || localY < 0 || localX > params.viewportWidth || localY > params.viewportHeight) {
      return { kind: 'empty' };
    }

    const headerW = params.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = params.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    const frozenCols = Math.max(0, Math.min(params.totalCols - 1, params.freezePanes?.cols ?? 0));
    const frozenRows = Math.max(0, Math.min(params.totalRows - 1, params.freezePanes?.rows ?? 0));
    const frozenW = frozenCols > 0 ? params.colAxis.offset(frozenCols) : 0;
    const frozenH = frozenRows > 0 ? params.rowAxis.offset(frozenRows) : 0;

    const totalGridW = params.colAxis.offset(params.totalCols);
    const totalGridH = params.rowAxis.offset(params.totalRows);

    const resolveColWorldX = (x: number): number => {
      const rel = x - headerW;
      return rel < frozenW ? rel : rel + params.scrollLeft;
    };
    const resolveRowWorldY = (y: number): number => {
      const rel = y - headerH;
      return rel < frozenH ? rel : rel + params.scrollTop;
    };

    if (params.showHeadings) {
      if (localX < headerW && localY < headerH) {
        return { kind: 'corner' };
      }

      if (localY < headerH && localX >= headerW) {
        const colBtn = this.hitTestOutlineButton(params.frame?.colOutlineButtons, localX, localY);
        if (colBtn) return colBtn;
        const worldX = resolveColWorldX(localX);
        if (worldX < 0 || worldX > totalGridW) return { kind: 'empty' };
        const col = params.colAxis.indexAt(Math.min(Math.max(0, worldX), Math.max(0, totalGridW - 1)));
        const colStart = params.colAxis.offset(col);
        const colEnd = params.colAxis.offset(col + 1);
        if (Math.abs(colEnd - worldX) <= SHEET_RESIZE_HIT_PX) return { kind: 'colResize', col };
        if (col > 0 && Math.abs(worldX - colStart) <= SHEET_RESIZE_HIT_PX) {
          let prevCol = col - 1;
          while (prevCol >= 0 && params.colAxis.isHidden(prevCol)) prevCol -= 1;
          if (prevCol >= 0) return { kind: 'colResize', col: prevCol };
        }
        return { kind: 'colHeader', col };
      }

      if (localX < headerW && localY >= headerH) {
        const rowBtn = this.hitTestOutlineButton(params.frame?.rowOutlineButtons, localX, localY);
        if (rowBtn) return rowBtn;
        const worldY = resolveRowWorldY(localY);
        if (worldY < 0 || worldY > totalGridH) return { kind: 'empty' };
        const row = params.rowAxis.indexAt(Math.min(Math.max(0, worldY), Math.max(0, totalGridH - 1)));
        const rowStart = params.rowAxis.offset(row);
        const rowEnd = params.rowAxis.offset(row + 1);
        if (Math.abs(rowEnd - worldY) <= SHEET_RESIZE_HIT_PX) return { kind: 'rowResize', row };
        if (row > 0 && Math.abs(worldY - rowStart) <= SHEET_RESIZE_HIT_PX) {
          let prevRow = row - 1;
          while (prevRow >= 0 && params.rowAxis.isHidden(prevRow)) prevRow -= 1;
          if (prevRow >= 0) return { kind: 'rowResize', row: prevRow };
        }
        return { kind: 'rowHeader', row };
      }
    }

    const fh = params.frame?.fillHandleRect;
    if (fh) {
      const pad = 4;
      if (
        localX >= fh.x - pad &&
        localX <= fh.x + fh.size + pad &&
        localY >= fh.y - pad &&
        localY <= fh.y + fh.size + pad
      ) {
        return { kind: 'fillHandle' };
      }
    }

    for (const fb of params.frame?.filterButtons || []) {
      const pad = 2;
      if (
        localX >= fb.x - pad &&
        localX <= fb.x + fb.size + pad &&
        localY >= fb.y - pad &&
        localY <= fb.y + fb.size + pad
      ) {
        return { kind: 'filterButton', col: fb.col, row: fb.row };
      }
    }

    for (const vb of params.frame?.validationButtons || []) {
      const pad = 2;
      if (
        localX >= vb.x - pad &&
        localX <= vb.x + vb.size + pad &&
        localY >= vb.y - pad &&
        localY <= vb.y + vb.size + pad
      ) {
        return { kind: 'validationButton', col: vb.col, row: vb.row };
      }
    }

    for (const cb of params.frame?.checkboxes || []) {
      const pad = 3;
      if (
        localX >= cb.x - pad &&
        localX <= cb.x + cb.size + pad &&
        localY >= cb.y - pad &&
        localY <= cb.y + cb.size + pad
      ) {
        return { kind: 'checkbox', col: cb.col, row: cb.row };
      }
    }

    for (const cc of params.frame?.commentCorners || []) {
      const pad = 3;
      if (
        localX >= cc.x - pad &&
        localX <= cc.x + cc.size + pad &&
        localY >= cc.y - pad &&
        localY <= cc.y + cc.size + pad
      ) {
        return { kind: 'commentIndicator', col: cc.col, row: cc.row };
      }
    }

    const worldX = resolveColWorldX(localX);
    const worldY = resolveRowWorldY(localY);
    if (worldX < 0 || worldY < 0 || worldX >= totalGridW || worldY >= totalGridH) {
      return { kind: 'empty' };
    }

    const rawCol = params.colAxis.indexAt(worldX);
    const rawRow = params.rowAxis.indexAt(worldY);
    const merged = params.mergedRegion(rawCol, rawRow);
    return {
      kind: 'cell',
      col: merged ? merged.startCol : rawCol,
      row: merged ? merged.startRow : rawRow,
    };
  }

  paint(ctx: CanvasRenderingContext2D, frame: SheetCanvasFrame, dpr = 1): void {
    const { viewportWidth, viewportHeight, headerW, headerH, frozenWidth, frozenHeight, palette } = frame;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Editable cells surface is always white
    ctx.fillStyle = palette.cellBg;
    ctx.fillRect(headerW, headerH, Math.max(0, viewportWidth - headerW), Math.max(0, viewportHeight - headerH));

    // 2. Quadrant-clipped cell passes (scrollable body, frozen top, frozen left, frozen corner)
    const bodyX = headerW + frozenWidth;
    const bodyY = headerH + frozenHeight;
    const bodyW = Math.max(0, viewportWidth - bodyX);
    const bodyH = Math.max(0, viewportHeight - bodyY);

    this.paintQuadrant(ctx, frame, bodyX, bodyY, bodyW, bodyH, c => !c.frozenCol && !c.frozenRow);

    if (frame.frozenRows > 0 && frozenHeight > 0) {
      this.paintQuadrant(ctx, frame, bodyX, headerH, bodyW, frozenHeight, c => !c.frozenCol && c.frozenRow);
    }
    if (frame.frozenCols > 0 && frozenWidth > 0) {
      this.paintQuadrant(ctx, frame, headerW, bodyY, frozenWidth, bodyH, c => c.frozenCol && !c.frozenRow);
    }
    if (frame.frozenCols > 0 && frame.frozenRows > 0 && frozenWidth > 0 && frozenHeight > 0) {
      this.paintQuadrant(ctx, frame, headerW, headerH, frozenWidth, frozenHeight, c => c.frozenCol && c.frozenRow);
    }

    // 3. Freeze pane divider lines & subtle scroll depth shadows
    if (frame.frozenCols > 0 || frame.frozenRows > 0) {
      if (frame.frozenCols > 0 && frame.scrollLeft > 0) {
        const fx = headerW + frozenWidth;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.fillRect(fx, headerH, 4, Math.max(0, viewportHeight - headerH));
      }
      if (frame.frozenRows > 0 && frame.scrollTop > 0) {
        const fy = headerH + frozenHeight;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.fillRect(headerW, fy, Math.max(0, viewportWidth - headerW), 4);
      }

      ctx.strokeStyle = palette.freezeLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (frame.frozenCols > 0) {
        const fx = headerW + frozenWidth;
        ctx.moveTo(fx, headerH);
        ctx.lineTo(fx, viewportHeight);
      }
      if (frame.frozenRows > 0) {
        const fy = headerH + frozenHeight;
        ctx.moveTo(headerW, fy);
        ctx.lineTo(viewportWidth, fy);
      }
      ctx.stroke();
    }

    // 4. Headers & Corner (#) on top
    if (frame.showHeadings) {
      this.paintHeaders(ctx, frame);
    }

    // 5. Interactive column/row resize guide line + pixel dimension pill
    if (frame.activeResizeGuide) {
      this.paintResizeGuide(ctx, frame, frame.activeResizeGuide);
    }

    ctx.restore();
  }

  private paintResizeGuide(
    ctx: CanvasRenderingContext2D,
    frame: SheetCanvasFrame,
    guide: SheetResizeGuide
  ): void {
    const { viewportWidth, viewportHeight, headerW, headerH } = frame;
    ctx.save();
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    if (guide.type === 'col') {
      ctx.moveTo(guide.pos, 0);
      ctx.lineTo(guide.pos, viewportHeight);
    } else {
      ctx.moveTo(0, guide.pos);
      ctx.lineTo(viewportWidth, guide.pos);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const label = `${Math.round(guide.size)} px`;
    ctx.font = '600 11px Inter, system-ui, -apple-system, sans-serif';
    const textW = this.measureTextCached(ctx, ctx.font, label);
    const pillW = textW + 14;
    const pillH = 20;
    const pillX =
      guide.type === 'col'
        ? Math.max(headerW + 4, Math.min(viewportWidth - pillW - 4, guide.pos + 6))
        : Math.max(4, headerW + 8);
    const pillY =
      guide.type === 'col'
        ? Math.max(4, headerH + 6)
        : Math.max(headerH + 4, Math.min(viewportHeight - pillH - 4, guide.pos + 6));

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2);
    ctx.restore();
  }

  private paintQuadrant(
    ctx: CanvasRenderingContext2D,
    frame: SheetCanvasFrame,
    clipX: number,
    clipY: number,
    clipW: number,
    clipH: number,
    predicate: (cell: SheetRenderCell) => boolean
  ): void {
    if (clipW <= 0 || clipH <= 0) return;

    const cells = frame.cells.filter(predicate);
    const { palette } = frame;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();

    // Backgrounds & conditional data bars
    for (const cell of cells) {
      const bg = cell.resolvedBgColor;
      if (bg || cell.colSpan > 1 || cell.rowSpan > 1) {
        ctx.fillStyle = bg || palette.cellBg;
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
      }
      if (cell.dataBar) {
        this.paintDataBar(ctx, cell, cell.dataBar);
      }
    }

    // Batched light gridlines
    if (frame.showGridlines && cells.length > 0) {
      ctx.strokeStyle = palette.gridline;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const cell of cells) {
        const right = Math.round(cell.x + cell.width) - 0.5;
        const bottom = Math.round(cell.y + cell.height) - 0.5;
        ctx.moveTo(right, cell.y);
        ctx.lineTo(right, cell.y + cell.height);
        ctx.moveTo(cell.x, bottom);
        ctx.lineTo(cell.x + cell.width, bottom);
      }
      ctx.stroke();
    }

    // Structured table outlines
    for (const tr of frame.tableRects) {
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(tr.x + 0.5, tr.y + 0.5, Math.max(0, tr.width - 1), Math.max(0, tr.height - 1));
    }

    // Cell sparklines + checkboxes + icon sets + text + dropdown buttons
    let lastFont = '';
    for (const cell of cells) {
      if (cell.filteredOut) {
        ctx.save();
        ctx.globalAlpha = 0.28;
      }
      if (cell.sparkline) {
        this.paintSparklineCell(ctx, cell, cell.sparkline);
      } else if (cell.isCheckbox) {
        this.paintCheckboxCell(ctx, cell);
      } else {
        if (cell.iconIndicator) {
          this.paintCellIcon(ctx, cell, cell.iconIndicator);
        }
        if (cell.text) {
          lastFont = this.paintCellText(ctx, cell, palette.cellText, lastFont);
        }
      }
      if (cell.filteredOut) {
        ctx.restore();
      }
      if (cell.hasFilterButton) {
        this.paintDropdownButton(ctx, cell, Boolean(cell.filterActive));
      } else if (cell.hasValidationDropdown) {
        this.paintDropdownButton(ctx, cell, false, '#059669');
      }
    }

    // Custom borders & comment corner indicators
    for (const cell of cells) {
      if (cell.borders) {
        this.paintCellBorders(ctx, cell, palette.defaultBorder);
      }
      if (cell.hasComment) {
        this.paintCommentIndicator(ctx, cell);
      }
      if (frame.sheetProtected && cell.isActive && cell.locked && cell.width >= 24 && cell.height >= 16) {
        this.paintActiveLockIndicator(ctx, cell);
      }
    }

    // Non-active selection tint, chart/precedent source highlights & formula trace highlights
    for (const cell of cells) {
      if (cell.isSelected && !cell.isActive) {
        ctx.fillStyle = palette.selectionFill;
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
      }

      if (cell.sourceHighlight) {
        this.paintSourceHighlight(ctx, cell, cell.sourceHighlight);
      }

      if (cell.isTraced) {
        ctx.fillStyle = palette.traceFill;
        ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
        ctx.strokeStyle = palette.traceStroke;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(cell.x + 1.5, cell.y + 1.5, Math.max(0, cell.width - 3), Math.max(0, cell.height - 3));
      }
    }

    // Print area boundary & page breaks
    if (frame.printAreaRect) {
      const pa = frame.printAreaRect;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(pa.x + 0.5, pa.y + 0.5, Math.max(0, pa.width - 1), Math.max(0, pa.height - 1));
      ctx.setLineDash([]);
    }

    if (frame.pageBreakXs.length || frame.pageBreakYs.length) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (const x of frame.pageBreakXs) {
        if (x < clipX || x > clipX + clipW) continue;
        ctx.moveTo(x + 0.5, clipY);
        ctx.lineTo(x + 0.5, clipY + clipH);
      }
      for (const y of frame.pageBreakYs) {
        if (y < clipY || y > clipY + clipH) continue;
        ctx.moveTo(clipX, y + 0.5);
        ctx.lineTo(clipX + clipW, y + 0.5);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Dynamic array spill perimeter
    if (frame.spillRect) {
      const sp = frame.spillRect;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sp.x + 1, sp.y + 1, Math.max(0, sp.width - 2), Math.max(0, sp.height - 2));
      ctx.setLineDash([]);
    }

    // Clipboard copy/cut dashed border
    if (frame.clipboardRect) {
      const cb = frame.clipboardRect;
      ctx.strokeStyle = cb.mode === 'cut' ? '#0284c7' : '#059669';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.lineDashOffset = -(frame.clipboardPhase % 8);
      ctx.strokeRect(cb.x + 1, cb.y + 1, Math.max(0, cb.width - 2), Math.max(0, cb.height - 2));
      ctx.lineDashOffset = 0;
      ctx.setLineDash([]);
    }

    // Selection perimeter & autofill handle (clipped to this quadrant)
    if (frame.selectionRect) {
      const sr = frame.selectionRect;
      const intersectsQuad =
        sr.x < clipX + clipW &&
        sr.x + sr.width > clipX &&
        sr.y < clipY + clipH &&
        sr.y + sr.height > clipY;

      if (intersectsQuad || (frame.frozenCols === 0 && frame.frozenRows === 0)) {
        ctx.strokeStyle = palette.selectionStroke;
        ctx.lineWidth = 2;
        ctx.setLineDash(frame.isFillDragging ? [4, 3] : []);
        ctx.strokeRect(sr.x + 1, sr.y + 1, Math.max(0, sr.width - 2), Math.max(0, sr.height - 2));
        ctx.setLineDash([]);

        if (frame.fillHandleRect) {
          const fh = frame.fillHandleRect;
          ctx.fillStyle = palette.selectionStroke;
          ctx.fillRect(fh.x, fh.y, fh.size, fh.size);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(fh.x + 0.5, fh.y + 0.5, fh.size - 1, fh.size - 1);
        }
      }
    }

    if (frame.activeEditor) {
      const editorCell = cells.find((c) => c.col === frame.activeEditor!.col && c.row === frame.activeEditor!.row);
      if (editorCell) {
        this.paintActiveCellEditor(ctx, editorCell, frame.activeEditor);
      }
    }

    ctx.restore();
  }

  private paintActiveCellEditor(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    editor: SheetActiveEditorState
  ): void {
    const st = editor.style ?? cell.style;
    const fontSizePx = st?.fontSize ? Math.round(st.fontSize * (4 / 3)) : 12;
    const fontFamily = st?.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
    const font = `${st?.italic ? 'italic ' : ''}${st?.bold ? 'bold ' : ''}${fontSizePx}px ${fontFamily}`;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;
    ctx.strokeRect(cell.x + 1, cell.y + 1, Math.max(0, cell.width - 2), Math.max(0, cell.height - 2));

    ctx.beginPath();
    ctx.rect(cell.x + 2, cell.y + 2, Math.max(0, cell.width - 4), Math.max(0, cell.height - 4));
    ctx.clip();

    ctx.font = font;
    const padX = 8;
    const align = st?.align || 'left';
    const text = editor.value || '';
    const s0 = Math.max(0, Math.min(text.length, Math.min(editor.selectionStart, editor.selectionEnd)));
    const s1 = Math.max(0, Math.min(text.length, Math.max(editor.selectionStart, editor.selectionEnd)));
    const caretIdx = Math.max(0, Math.min(text.length, editor.selectionEnd));

    if (text.includes('\n')) {
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const lineHeight = Math.round(fontSizePx * 1.25);
      const rawLines = text.split(/\r?\n/);
      let charCursor = 0;
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const lineY = cell.y + 4 + i * lineHeight;
        const lineEnd = charCursor + line.length;
        if (lineY > cell.y + cell.height) break;
        const lineW = this.measureTextCached(ctx, font, line);
        const lineX =
          align === 'center'
            ? cell.x + Math.max(padX, (cell.width - lineW) / 2)
            : align === 'right'
              ? cell.x + cell.width - padX - lineW
              : cell.x + padX;
        if (s1 > charCursor && s0 < lineEnd) {
          const ls = Math.max(0, s0 - charCursor);
          const le = Math.min(line.length, s1 - charCursor);
          const startOff = this.measureTextCached(ctx, font, line.slice(0, ls));
          const endOff = this.measureTextCached(ctx, font, line.slice(0, le));
          ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
          ctx.fillRect(lineX + startOff, lineY, Math.max(2, endOff - startOff), lineHeight);
        }
        ctx.fillStyle = '#0f172a';
        ctx.fillText(line, lineX, lineY);
        if (editor.caretVisible !== false && caretIdx >= charCursor && caretIdx <= lineEnd) {
          const caretOff = this.measureTextCached(ctx, font, line.slice(0, caretIdx - charCursor));
          const caretX = Math.max(cell.x + 4, Math.min(cell.x + cell.width - 4, lineX + caretOff));
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(caretX, lineY);
          ctx.lineTo(caretX, lineY + lineHeight);
          ctx.stroke();
        }
        charCursor = lineEnd + 1;
      }
      ctx.restore();
      return;
    }

    ctx.textBaseline = 'middle';
    const fullW = this.measureTextCached(ctx, font, text);
    const boxW = Math.max(4, cell.width - padX * 2);
    let baseX = cell.x + padX;
    if (align === 'center') baseX = cell.x + Math.max(padX, (cell.width - fullW) / 2);
    else if (align === 'right') baseX = cell.x + cell.width - padX - fullW;
    else if (fullW > boxW) baseX = cell.x + cell.width - padX - fullW;

    if (s1 > s0) {
      const startOffset = this.measureTextCached(ctx, font, text.slice(0, s0));
      const endOffset = this.measureTextCached(ctx, font, text.slice(0, s1));
      ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
      ctx.fillRect(baseX + startOffset, cell.y + 4, Math.max(2, endOffset - startOffset), Math.max(10, cell.height - 8));
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(text, baseX, cell.y + cell.height / 2);

    if (editor.caretVisible !== false) {
      const caretOffset = this.measureTextCached(ctx, font, text.slice(0, caretIdx));
      const caretX = Math.max(cell.x + 4, Math.min(cell.x + cell.width - 4, baseX + caretOffset));
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(caretX, cell.y + 4);
      ctx.lineTo(caretX, cell.y + cell.height - 4);
      ctx.stroke();
    }

    ctx.restore();
  }

  private paintDropdownButton(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    highlighted: boolean,
    borderAccent = '#94a3b8'
  ): void {
    const btnSize = Math.min(14, Math.max(10, cell.height - 8));
    const bx = cell.x + cell.width - btnSize - 4;
    const by = cell.y + Math.round((cell.height - btnSize) / 2);
    ctx.save();
    ctx.fillStyle = highlighted ? '#059669' : 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = highlighted ? '#047857' : borderAccent;
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, btnSize, btnSize);
    ctx.strokeRect(bx + 0.5, by + 0.5, btnSize - 1, btnSize - 1);

    ctx.fillStyle = highlighted ? '#ffffff' : '#334155';
    ctx.beginPath();
    ctx.moveTo(bx + 3, by + 4);
    ctx.lineTo(bx + btnSize - 3, by + 4);
    ctx.lineTo(bx + btnSize / 2, by + btnSize - 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private paintCheckboxCell(ctx: CanvasRenderingContext2D, cell: SheetRenderCell): void {
    const size = Math.min(14, Math.max(10, cell.height - 8));
    const align = cell.style?.align || 'center';
    const bx =
      align === 'left'
        ? cell.x + 8
        : align === 'right'
          ? cell.x + cell.width - size - 8
          : cell.x + Math.round((cell.width - size) / 2);
    const by = cell.y + Math.round((cell.height - size) / 2);
    const checked = Boolean(cell.checkboxChecked);

    ctx.save();
    ctx.fillStyle = checked ? '#059669' : '#ffffff';
    ctx.strokeStyle = checked ? '#047857' : '#94a3b8';
    ctx.lineWidth = 1.25;
    ctx.fillRect(bx, by, size, size);
    ctx.strokeRect(bx + 0.5, by + 0.5, size - 1, size - 1);

    if (checked) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx + 2.5, by + size * 0.52);
      ctx.lineTo(bx + size * 0.43, by + size - 3.2);
      ctx.lineTo(bx + size - 2.5, by + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintDataBar(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    dataBar: { ratio: number; color: string }
  ): void {
    const innerW = Math.max(0, cell.width - 4);
    const barW = Math.max(2, Math.round(innerW * dataBar.ratio));
    const barH = Math.max(4, cell.height - 6);
    if (innerW <= 0 || barH <= 0) return;

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = dataBar.color;
    ctx.fillRect(cell.x + 2, cell.y + 3, barW, barH);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(cell.x + 2 + barW - 1.5, cell.y + 3, 1.5, barH);
    ctx.restore();
  }

  private paintCellIcon(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    icon: { level: 'high' | 'mid' | 'low'; style: IconSetStyle }
  ): void {
    if (cell.width < 22 || cell.height < 14) return;
    const cx = cell.x + 11;
    const cy = cell.y + cell.height / 2;
    const color =
      icon.level === 'high' ? '#16a34a' : icon.level === 'mid' ? '#d97706' : '#dc2626';

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (icon.style === 'arrows') {
      if (icon.level === 'high') {
        ctx.moveTo(cx, cy - 4.5);
        ctx.lineTo(cx + 4, cy + 3.5);
        ctx.lineTo(cx - 4, cy + 3.5);
      } else if (icon.level === 'mid') {
        ctx.moveTo(cx + 4.5, cy);
        ctx.lineTo(cx - 3.5, cy - 3.5);
        ctx.lineTo(cx - 3.5, cy + 3.5);
      } else {
        ctx.moveTo(cx, cy + 4.5);
        ctx.lineTo(cx + 4, cy - 3.5);
        ctx.lineTo(cx - 4, cy - 3.5);
      }
    } else {
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private paintCommentIndicator(ctx: CanvasRenderingContext2D, cell: SheetRenderCell): void {
    if (cell.width < 12 || cell.height < 10) return;
    const size = 6;
    const right = cell.x + cell.width - 0.5;
    const top = cell.y + 0.5;
    ctx.save();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(right - size, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private paintSparklineCell(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    sparkline: { type: SparklineType; values: number[]; color: string; showMarkers: boolean }
  ): void {
    const vals = sparkline.values;
    if (!vals.length) return;
    const padX = 5;
    const padY = 4;
    const plotW = Math.max(4, cell.width - padX * 2);
    const plotH = Math.max(4, cell.height - padY * 2);
    const left = cell.x + padX;
    const top = cell.y + padY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x + 1, cell.y + 1, Math.max(0, cell.width - 2), Math.max(0, cell.height - 2));
    ctx.clip();

    if (sparkline.type === 'winLoss') {
      const zeroY = top + plotH / 2;
      const barGap = 1.5;
      const barW = Math.max(2, (plotW - barGap * Math.max(0, vals.length - 1)) / vals.length);
      const halfH = Math.max(2, plotH / 2 - 1);
      vals.forEach((v, idx) => {
        if (v === 0) return;
        const bx = left + idx * (barW + barGap);
        ctx.fillStyle = v > 0 ? sparkline.color : '#ef4444';
        ctx.fillRect(bx, v > 0 ? zeroY - halfH : zeroY, barW, halfH);
      });
      ctx.restore();
      return;
    }

    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV;

    if (sparkline.type === 'column') {
      const baselineVal = minV < 0 && maxV > 0 ? 0 : minV;
      const effMin = Math.min(minV, baselineVal);
      const effMax = Math.max(maxV, baselineVal);
      const effSpan = effMax - effMin || 1;
      const zeroY = top + plotH - ((baselineVal - effMin) / effSpan) * plotH;
      const barGap = 1.5;
      const barW = Math.max(2, (plotW - barGap * Math.max(0, vals.length - 1)) / vals.length);
      vals.forEach((v, idx) => {
        const y = top + plotH - ((v - effMin) / effSpan) * plotH;
        const bx = left + idx * (barW + barGap);
        ctx.fillStyle = v < 0 ? '#ef4444' : sparkline.color;
        ctx.fillRect(bx, Math.min(y, zeroY), barW, Math.max(1.5, Math.abs(zeroY - y)));
      });
      ctx.restore();
      return;
    }

    const pts = vals.map((v, idx) => {
      const px = vals.length === 1 ? left + plotW / 2 : left + (idx / (vals.length - 1)) * plotW;
      const norm = span === 0 ? 0.5 : (v - minV) / span;
      const py = top + plotH - norm * plotH;
      return { x: px, y: py, v };
    });

    ctx.strokeStyle = sparkline.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    if (sparkline.showMarkers && pts.length > 0) {
      let minIdx = 0;
      let maxIdx = 0;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].v < pts[minIdx].v) minIdx = i;
        if (pts[i].v > pts[maxIdx].v) maxIdx = i;
      }
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(pts[minIdx].x, pts[minIdx].y, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(pts[maxIdx].x, pts[maxIdx].y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private paintCellText(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    defaultTextColor: string,
    lastFont: string
  ): string {
    const st = cell.style;
    const fontSizePx = st?.fontSize ? Math.round(st.fontSize * (4 / 3)) : 12;
    const fontFamily = st?.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
    const isBold = cell.resolvedBold ?? st?.bold;
    const font = `${st?.italic ? 'italic ' : ''}${isBold ? 'bold ' : ''}${fontSizePx}px ${fontFamily}`;

    const paintW = cell.overflowWidth ?? cell.width;
    ctx.save();
    ctx.beginPath();
    const rightReserve = cell.hasFilterButton ? 18 : 2;
    ctx.rect(cell.x + 1, cell.y + 1, Math.max(0, paintW - rightReserve), Math.max(0, cell.height - 2));
    ctx.clip();

    if (font !== lastFont) {
      ctx.font = font;
    }
    ctx.fillStyle = cell.resolvedTextColor || st?.textColor || defaultTextColor;

    const leftIconReserve = cell.iconIndicator ? 16 : 0;
    const padX = 8 + leftIconReserve;
    const maxW = Math.max(4, paintW - padX - (cell.hasFilterButton ? 22 : 8));
    const align = st?.align || 'left';
    const vAlign = st?.verticalAlign || 'middle';

    let drawX = cell.x + padX;
    if (align === 'center') drawX = cell.x + leftIconReserve / 2 + (cell.width - leftIconReserve - (cell.hasFilterButton ? 14 : 0)) / 2;
    else if (align === 'right') drawX = cell.x + cell.width - (cell.hasFilterButton ? 22 : 8);
    ctx.textAlign = align;

    const lineHeight = Math.round(fontSizePx * 1.25);
    const shouldUnderline = Boolean(st?.underline || cell.hyperlink);
    const rotation = typeof st?.textRotation === 'number' && st.textRotation !== 0 ? st.textRotation : 0;

    if (rotation) {
      const cleanText = cell.text.replace(/\r?\n/g, ' ');
      const diagMax = Math.max(maxW, Math.hypot(cell.width - 8, cell.height - 6));
      const displayLine = this.truncateToWidth(ctx, font, cleanText, diagMax);
      const cx = cell.x + cell.width / 2;
      const cy = cell.y + cell.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((-rotation * Math.PI) / 180);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayLine, 0, 0);
      if (shouldUnderline && displayLine) {
        const w = this.measureTextCached(ctx, font, displayLine);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w / 2, fontSizePx / 2);
        ctx.lineTo(w / 2, fontSizePx / 2);
        ctx.stroke();
      }
      ctx.restore();
      return font;
    }

    if (st?.wrapText || cell.text.includes('\n')) {
      const lines = st?.wrapText
        ? this.wrapTextLines(ctx, font, cell.text, maxW)
        : cell.text.split(/\r?\n/).map(line => this.truncateToWidth(ctx, font, line, maxW));
      const totalTextH = lines.length * lineHeight;
      let startY = cell.y + 4;
      if (vAlign === 'middle') startY = Math.max(cell.y + 3, cell.y + (cell.height - totalTextH) / 2);
      else if (vAlign === 'bottom') startY = Math.max(cell.y + 3, cell.y + cell.height - totalTextH - 3);
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight;
        if (ly > cell.y + cell.height) break;
        ctx.fillText(lines[i], drawX, ly);
        if (shouldUnderline && lines[i]) {
          const w = this.measureTextCached(ctx, font, lines[i]);
          const lineLeft = align === 'center' ? drawX - w / 2 : align === 'right' ? drawX - w : drawX;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineLeft, ly + fontSizePx);
          ctx.lineTo(lineLeft + w, ly + fontSizePx);
          ctx.stroke();
        }
      }
    } else {
      const cleanText = cell.text.replace(/\r?\n/g, ' ');
      let displayLine: string;
      if (cell.isNumeric && this.measureTextCached(ctx, font, cleanText) > maxW) {
        const hashW = Math.max(1, this.measureTextCached(ctx, font, '#'));
        displayLine = '#'.repeat(Math.max(1, Math.floor(maxW / hashW)));
      } else {
        displayLine = this.truncateToWidth(ctx, font, cleanText, maxW);
      }
      let drawY = cell.y + cell.height / 2;
      if (vAlign === 'top') {
        ctx.textBaseline = 'top';
        drawY = cell.y + 4;
      } else if (vAlign === 'bottom') {
        ctx.textBaseline = 'bottom';
        drawY = cell.y + cell.height - 4;
      } else {
        ctx.textBaseline = 'middle';
      }
      ctx.fillText(displayLine, drawX, drawY);

      if (shouldUnderline && displayLine) {
        const w = this.measureTextCached(ctx, font, displayLine);
        const lineLeft = align === 'center' ? drawX - w / 2 : align === 'right' ? drawX - w : drawX;
        const lineY = vAlign === 'top' ? drawY + fontSizePx : vAlign === 'bottom' ? drawY - 1 : drawY + fontSizePx / 2;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lineLeft, lineY);
        ctx.lineTo(lineLeft + w, lineY);
        ctx.stroke();
      }
    }

    ctx.restore();
    return font;
  }

  private paintCellBorders(ctx: CanvasRenderingContext2D, cell: SheetRenderCell, defaultColor: string): void {
    const { borders, x, y, width, height } = cell;
    if (!borders) return;
    if (borders.top && !cell.skipTopBorder) this.drawBorderLine(ctx, x, y + 0.5, x + width, y + 0.5, borders.top, defaultColor, true);
    if (borders.bottom) this.drawBorderLine(ctx, x, y + height - 0.5, x + width, y + height - 0.5, borders.bottom, defaultColor, true);
    if (borders.left && !cell.skipLeftBorder) this.drawBorderLine(ctx, x + 0.5, y, x + 0.5, y + height, borders.left, defaultColor, false);
    if (borders.right) this.drawBorderLine(ctx, x + width - 0.5, y, x + width - 0.5, y + height, borders.right, defaultColor, false);
  }

  private drawBorderLine(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    edge: BorderEdge,
    defaultColor: string,
    horizontal: boolean
  ): void {
    const style: BorderLineStyle = edge.style || 'thin';
    ctx.strokeStyle = edge.color || defaultColor;

    if (style === 'double') {
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const dx = horizontal ? 0 : 1.25;
      const dy = horizontal ? 1.25 : 0;
      ctx.beginPath();
      ctx.moveTo(x1 - dx, y1 - dy);
      ctx.lineTo(x2 - dx, y2 - dy);
      ctx.moveTo(x1 + dx, y1 + dy);
      ctx.lineTo(x2 + dx, y2 + dy);
      ctx.stroke();
      return;
    }

    ctx.lineWidth = style === 'thick' ? 3 : style === 'medium' ? 2 : 1;
    ctx.setLineDash(style === 'dashed' ? [4, 3] : style === 'dotted' ? [1.5, 2] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private paintSourceHighlight(
    ctx: CanvasRenderingContext2D,
    cell: SheetRenderCell,
    hl: Record<string, string>
  ): void {
    if (hl['backgroundColor']) {
      ctx.fillStyle = hl['backgroundColor'];
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    const drawEdge = (spec: string | undefined, x1: number, y1: number, x2: number, y2: number) => {
      if (!spec || spec === 'none') return;
      const color = spec.split(' ').pop() || '#2e75b6';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    drawEdge(hl['borderTop'], cell.x, cell.y + 1, cell.x + cell.width, cell.y + 1);
    drawEdge(hl['borderBottom'], cell.x, cell.y + cell.height - 1, cell.x + cell.width, cell.y + cell.height - 1);
    drawEdge(hl['borderLeft'], cell.x + 1, cell.y, cell.x + 1, cell.y + cell.height);
    drawEdge(hl['borderRight'], cell.x + cell.width - 1, cell.y, cell.x + cell.width - 1, cell.y + cell.height);
  }

  private paintHeaders(ctx: CanvasRenderingContext2D, frame: SheetCanvasFrame): void {
    const { headerW, headerH, viewportWidth, viewportHeight, palette, hoveredHeader } = frame;
    const hoverFill = frame.isDarkChrome ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.06)';

    // Column headers (A, B, C...)
    ctx.save();
    ctx.beginPath();
    ctx.rect(headerW, 0, Math.max(0, viewportWidth - headerW), headerH);
    ctx.clip();

    ctx.fillStyle = palette.headerBg;
    ctx.fillRect(headerW, 0, Math.max(0, viewportWidth - headerW), headerH);

    ctx.font = '500 12px Inter, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawColBand = (band: SheetAxisBand) => {
      if (band.selected) {
        ctx.fillStyle = palette.headerActiveBg;
        ctx.fillRect(band.start, 0, band.size, headerH);
      } else if (hoveredHeader?.kind === 'colHeader' && hoveredHeader.index === band.index) {
        ctx.fillStyle = hoverFill;
        ctx.fillRect(band.start, 0, band.size, headerH);
      }
      const resizeHovered = hoveredHeader?.kind === 'colResize' && hoveredHeader.index === band.index;
      ctx.strokeStyle = resizeHovered ? palette.selectionStroke : palette.headerBorder;
      ctx.lineWidth = resizeHovered ? 2 : 1;
      const right = Math.round(band.start + band.size) - 0.5;
      ctx.beginPath();
      ctx.moveTo(right, 0);
      ctx.lineTo(right, headerH);
      ctx.stroke();

      ctx.fillStyle = band.selected ? palette.selectionStroke : palette.headerText;
      ctx.fillText(colIndexToLetter(band.index), band.start + band.size / 2, headerH / 2);
    };

    for (const band of frame.colBands) {
      if (!band.frozen) drawColBand(band);
    }
    for (const band of frame.colBands) {
      if (band.frozen) drawColBand(band);
    }

    ctx.strokeStyle = palette.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headerW, headerH - 0.5);
    ctx.lineTo(viewportWidth, headerH - 0.5);
    ctx.stroke();

    if (frame.hiddenColBreaks.length > 0) {
      ctx.strokeStyle = palette.selectionStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const bx of frame.hiddenColBreaks) {
        ctx.moveTo(bx - 1.5, 3);
        ctx.lineTo(bx - 1.5, headerH - 3);
        ctx.moveTo(bx + 1.5, 3);
        ctx.lineTo(bx + 1.5, headerH - 3);
      }
      ctx.stroke();
    }
    this.paintOutlineButtons(ctx, frame.colOutlineButtons, palette);
    ctx.restore();

    // Row headers (1, 2, 3...)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headerH, headerW, Math.max(0, viewportHeight - headerH));
    ctx.clip();

    ctx.fillStyle = palette.headerBg;
    ctx.fillRect(0, headerH, headerW, Math.max(0, viewportHeight - headerH));

    ctx.font = '500 12px Inter, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawRowBand = (band: SheetAxisBand) => {
      if (band.selected) {
        ctx.fillStyle = palette.headerActiveBg;
        ctx.fillRect(0, band.start, headerW, band.size);
      } else if (hoveredHeader?.kind === 'rowHeader' && hoveredHeader.index === band.index) {
        ctx.fillStyle = hoverFill;
        ctx.fillRect(0, band.start, headerW, band.size);
      }
      const resizeHovered = hoveredHeader?.kind === 'rowResize' && hoveredHeader.index === band.index;
      ctx.strokeStyle = resizeHovered ? palette.selectionStroke : palette.headerBorder;
      ctx.lineWidth = resizeHovered ? 2 : 1;
      const bottom = Math.round(band.start + band.size) - 0.5;
      ctx.beginPath();
      ctx.moveTo(0, bottom);
      ctx.lineTo(headerW, bottom);
      ctx.stroke();

      ctx.fillStyle = band.selected ? palette.selectionStroke : palette.headerRowText;
      ctx.fillText(String(band.index + 1), headerW / 2, band.start + band.size / 2);
    };

    for (const band of frame.rowBands) {
      if (!band.frozen) drawRowBand(band);
    }
    for (const band of frame.rowBands) {
      if (band.frozen) drawRowBand(band);
    }

    ctx.strokeStyle = palette.headerBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headerW - 0.5, headerH);
    ctx.lineTo(headerW - 0.5, viewportHeight);
    ctx.stroke();

    if (frame.hiddenRowBreaks.length > 0) {
      ctx.strokeStyle = palette.selectionStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const by of frame.hiddenRowBreaks) {
        ctx.moveTo(3, by - 1.5);
        ctx.lineTo(headerW - 3, by - 1.5);
        ctx.moveTo(3, by + 1.5);
        ctx.lineTo(headerW - 3, by + 1.5);
      }
      ctx.stroke();
    }
    this.paintOutlineButtons(ctx, frame.rowOutlineButtons, palette);
    ctx.restore();

    // Top-left corner (#)
    ctx.fillStyle = palette.headerBg;
    ctx.fillRect(0, 0, headerW, headerH);
    ctx.strokeStyle = palette.headerBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, headerW - 1, headerH - 1);

    ctx.fillStyle = palette.cornerTriangle;
    ctx.beginPath();
    ctx.moveTo(headerW - 4, headerH - 4);
    ctx.lineTo(headerW - 12, headerH - 4);
    ctx.lineTo(headerW - 4, headerH - 12);
    ctx.closePath();
    ctx.fill();

    if (frame.sheetProtected) {
      this.paintCornerLockBadge(ctx);
    }
  }

  private hitTestOutlineButton(
    buttons: SheetOutlineButtonRect[] | undefined,
    localX: number,
    localY: number
  ): SheetHitTarget | null {
    if (!buttons?.length) return null;
    for (const btn of buttons) {
      if (
        localX >= btn.x - 2 &&
        localX <= btn.x + btn.size + 2 &&
        localY >= btn.y - 2 &&
        localY <= btn.y + btn.size + 2
      ) {
        return { kind: 'outlineToggle', axis: btn.axis, groupIndex: btn.groupIndex };
      }
    }
    return null;
  }

  private paintOutlineButtons(
    ctx: CanvasRenderingContext2D,
    buttons: SheetOutlineButtonRect[],
    palette: SheetCanvasPalette
  ): void {
    if (!buttons.length) return;
    for (const btn of buttons) {
      if (!btn.collapsed && btn.spanEndPx > btn.spanStartPx + btn.size) {
        ctx.strokeStyle = palette.selectionStroke;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        if (btn.axis === 'col') {
          const lineY = btn.y + btn.size / 2;
          ctx.moveTo(btn.x + btn.size, lineY);
          ctx.lineTo(btn.spanEndPx - 3, lineY);
          ctx.lineTo(btn.spanEndPx - 3, lineY + 4);
        } else {
          const lineX = btn.x + btn.size / 2;
          ctx.moveTo(lineX, btn.y + btn.size);
          ctx.lineTo(lineX, btn.spanEndPx - 3);
          ctx.lineTo(lineX + 4, btn.spanEndPx - 3);
        }
        ctx.stroke();
      }

      ctx.fillStyle = btn.collapsed ? palette.selectionStroke : palette.headerBg;
      ctx.strokeStyle = palette.selectionStroke;
      ctx.lineWidth = 1;
      ctx.fillRect(btn.x + 0.5, btn.y + 0.5, btn.size - 1, btn.size - 1);
      ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.size - 1, btn.size - 1);

      const cx = btn.x + btn.size / 2;
      const cy = btn.y + btn.size / 2;
      ctx.strokeStyle = btn.collapsed ? '#ffffff' : palette.selectionStroke;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx - 2.5, cy);
      ctx.lineTo(cx + 2.5, cy);
      if (btn.collapsed) {
        ctx.moveTo(cx, cy - 2.5);
        ctx.lineTo(cx, cy + 2.5);
      }
      ctx.stroke();
    }
  }

  private paintCornerLockBadge(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#d97706';
    ctx.fillStyle = '#d97706';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(10, 8.5, 2.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(6.5, 9, 7, 5.5);
    ctx.restore();
  }

  private paintActiveLockIndicator(ctx: CanvasRenderingContext2D, cell: SheetRenderCell): void {
    const bx = cell.x + 3;
    const by = cell.y + 3;
    ctx.save();
    ctx.strokeStyle = '#d97706';
    ctx.fillStyle = '#d97706';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx + 3, by + 2.2, 1.8, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(bx + 0.8, by + 2.6, 4.4, 3.6);
    ctx.restore();
  }

  computeAutoFitColumnWidth(params: {
    col: number;
    grid: SheetGrid;
    calculationCache: FormulaCalculationCache;
    formatDisplay: (val: string | number, style?: CellStyle) => string;
    ctx?: CanvasRenderingContext2D | null;
    mergedRegion?: (col: number, row: number) => MergeRegion | undefined;
  }): number {
    const colPrefix = colIndexToLetter(params.col);
    const measure = (font: string, text: string): number => {
      if (params.ctx) {
        params.ctx.font = font;
        return this.measureTextCached(params.ctx, font, text);
      }
      return text.length * 7.2;
    };
    let maxW = Math.max(44, measure('500 12px Inter, system-ui, -apple-system, sans-serif', colPrefix) + 24);
    for (const id of Object.keys(params.grid)) {
      const match = id.match(/^([A-Z]+)(\d+)$/);
      if (!match || match[1] !== colPrefix) continue;
      const row = parseInt(match[2], 10) - 1;
      const merged = params.mergedRegion?.(params.col, row);
      if (merged && (merged.endCol > merged.startCol || merged.startCol !== params.col)) continue;
      const cell = params.grid[id];
      const evaluated = evaluateCellValueCached(id, params.grid, params.calculationCache);
      const display = params.formatDisplay(evaluated, cell?.style);
      if (!display) continue;
      const st = cell?.style;
      const fontSizePx = st?.fontSize ? Math.round(st.fontSize * (4 / 3)) : 12;
      const fontFamily = st?.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
      const font = `${st?.italic ? 'italic ' : ''}${st?.bold ? 'bold ' : ''}${fontSizePx}px ${fontFamily}`;
      const longestLine = display.split(/\r?\n/).reduce((acc, line) => Math.max(acc, measure(font, line)), 0);
      maxW = Math.max(maxW, Math.ceil(longestLine) + 20);
    }
    return Math.max(44, Math.min(420, maxW));
  }

  computeAutoFitRowHeight(params: {
    row: number;
    grid: SheetGrid;
    calculationCache: FormulaCalculationCache;
    colAxis: GridAxis;
    formatDisplay: (val: string | number, style?: CellStyle) => string;
    ctx?: CanvasRenderingContext2D | null;
  }): number {
    const rowSuffix = String(params.row + 1);
    let maxH = 24;
    for (const id of Object.keys(params.grid)) {
      const match = id.match(/^([A-Z]+)(\d+)$/);
      if (!match || match[2] !== rowSuffix) continue;
      let col = 0;
      for (let i = 0; i < match[1].length; i++) col = col * 26 + (match[1].charCodeAt(i) - 64);
      col -= 1;
      const cell = params.grid[id];
      const evaluated = evaluateCellValueCached(id, params.grid, params.calculationCache);
      const display = params.formatDisplay(evaluated, cell?.style);
      if (!display) continue;
      const st = cell?.style;
      const fontSizePx = st?.fontSize ? Math.round(st.fontSize * (4 / 3)) : 12;
      const lineHeight = Math.round(fontSizePx * 1.25);
      const colW = params.colAxis.offset(col + 1) - params.colAxis.offset(col);
      let lineCount = display.split(/\r?\n/).length;
      if (st?.wrapText) {
        const fontFamily = st?.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
        const font = `${st?.italic ? 'italic ' : ''}${st?.bold ? 'bold ' : ''}${fontSizePx}px ${fontFamily}`;
        const maxW = Math.max(8, colW - 16);
        lineCount = params.ctx
          ? this.wrapTextLines(params.ctx, font, display, maxW).length
          : Math.max(lineCount, Math.ceil((display.length * 7.2) / maxW));
      }
      maxH = Math.max(maxH, lineCount * lineHeight + 8);
    }
    return Math.max(24, Math.min(240, maxH));
  }

  private measureTextCached(ctx: CanvasRenderingContext2D, font: string, text: string): number {
    const key = `${font}\0${text}`;
    const cached = this.textMeasureCache.get(key);
    if (cached !== undefined) return cached;
    if (this.textMeasureCache.size > 4000) this.textMeasureCache.clear();
    const width = ctx.measureText(text).width;
    this.textMeasureCache.set(key, width);
    return width;
  }

  private truncateToWidth(ctx: CanvasRenderingContext2D, font: string, text: string, maxW: number): string {
    if (this.measureTextCached(ctx, font, text) <= maxW) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.measureTextCached(ctx, font, text.slice(0, mid) + '…') <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return lo <= 0 ? '…' : text.slice(0, lo) + '…';
  }

  private wrapTextLines(ctx: CanvasRenderingContext2D, font: string, text: string, maxW: number): string[] {
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      const words = para.split(/\s+/);
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (this.measureTextCached(ctx, font, candidate) <= maxW) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  }
}

function frozenHClamp(val: number): number {
  return Math.max(0, val);
}
