import type { SheetEditorHooks } from './sheet-editor-hooks';
import { GridAxis } from '../services/grid-viewport';
import { MergeRegion, SheetGrid } from '../models/excel.model';
import { getCalculatedExtent, parseCellId } from '../services/formula-engine.service';
import { TOTAL_ROWS, TOTAL_COLS, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '../constants/editor.constants';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetViewportControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'activeSheetId'
  | 'formulaWorkbookRevision'
  | 'gridContainer'
  | 'showHeadings'>;
type SheetViewportControllerHooks = Pick<SheetEditorHooks,
  | 'calculationCache'
  | 'isDestroyed'
  | 'viewChanges'>;

/** Viewport behavior scoped to one editor instance. */
export class SheetViewportController {
  constructor(private readonly editor: SheetViewportControllerHost, private readonly hooks: SheetViewportControllerHooks) {}

  private boundsRevision = -1;

  private boundsGrid?: SheetGrid;

  private boundsMerges?: MergeRegion[];

  private readonly dimensionCache = new WeakMap<SheetGrid, { rows: number; cols: number; merges?: MergeRegion[]; revision: number }>();

  private gridDimensions = { rows: TOTAL_ROWS, cols: TOTAL_COLS };

  private refreshGridDimensions(): void {
    const grid = this.editor.activeSheet.data, revision = this.editor.formulaWorkbookRevision;
    if (grid === this.boundsGrid && this.boundsMerges === this.editor.activeSheet.merges && this.boundsRevision === revision) return;
    this.boundsRevision = revision;
    this.boundsGrid = grid; this.boundsMerges = this.editor.activeSheet.merges;
    const cached = this.dimensionCache.get(grid);
    if (cached && cached.merges === this.boundsMerges && cached.revision === revision) { this.gridDimensions = cached; return; }
    let rows = TOTAL_ROWS, cols = TOTAL_COLS;
    for (const id of Object.keys(grid)) {
      const cell = parseCellId(id);
      if (cell) { rows = Math.max(rows, cell.row + 1); cols = Math.max(cols, cell.col + 1); }
    }
    for (const m of this.boundsMerges || []) { rows = Math.max(rows, m.endRow + 1); cols = Math.max(cols, m.endCol + 1); }
    const spill = getCalculatedExtent(grid, this.hooks.calculationCache); rows = Math.max(rows, spill.rows); cols = Math.max(cols, spill.cols);
    this.gridDimensions = { rows, cols };
    this.dimensionCache.set(grid, { rows, cols, merges: this.boundsMerges, revision });
  }

  get totalRows(): number { this.refreshGridDimensions(); return this.gridDimensions.rows; }

  get totalCols(): number { this.refreshGridDimensions(); return this.gridDimensions.cols; }

  private layoutRevision = -1;

  private layoutGrid?: SheetGrid;

  private layoutMerges?: MergeRegion[];

  private layoutWidths?: Record<number, number>;

  private layoutHeights?: Record<number, number>;

  private colAxis = new GridAxis(TOTAL_COLS, DEFAULT_COL_WIDTH);

  private rowAxis = new GridAxis(TOTAL_ROWS, DEFAULT_ROW_HEIGHT);

  private viewportKey = '';

  private viewportValue = { rows: [] as number[], columns: [] as number[], top: 0, bottom: 0, left: 0, right: 0 };

  private scrollPositions = new Map<string, { top: number; left: number }>();

  private viewportSheetId = '';

  private pendingViewportRestore?: { top: number; left: number };

  private ensureGridLayout(): void {
    const sheet = this.editor.activeSheet;
    if (this.layoutGrid === sheet.data && this.layoutWidths === sheet.colWidths && this.layoutHeights === sheet.rowHeights && this.layoutMerges === sheet.merges && this.layoutRevision === this.editor.formulaWorkbookRevision) return;
    this.layoutRevision = this.editor.formulaWorkbookRevision;
    this.layoutMerges = sheet.merges; this.layoutGrid = sheet.data; this.layoutWidths = sheet.colWidths; this.layoutHeights = sheet.rowHeights;
    this.colAxis = new GridAxis(this.totalCols, DEFAULT_COL_WIDTH, sheet.colWidths);
    this.rowAxis = new GridAxis(this.totalRows, DEFAULT_ROW_HEIGHT, sheet.rowHeights);
    this.viewportKey = '';
  }

  get inkCanvasWidth(): number { this.ensureGridLayout(); return this.colAxis.offset(this.totalCols) + (this.editor.showHeadings ? 40 : 0); }

  get inkCanvasHeight(): number { this.ensureGridLayout(); return this.rowAxis.offset(this.totalRows) + (this.editor.showHeadings ? 24 : 0); }

  get gridViewport() {
    this.ensureGridLayout();
    const element = this.editor.gridContainer?.nativeElement;
    const changedSheet = this.viewportSheetId !== this.editor.activeSheetId;
    const saved = this.scrollPositions.get(this.editor.activeSheetId) || { top: 0, left: 0 };
    if (changedSheet) {
      this.viewportSheetId = this.editor.activeSheetId;
      this.pendingViewportRestore = saved;
      const sheetId = this.editor.activeSheetId;
      // Restore after the new table extent has been rendered, including when leaving a chart sheet.
      setTimeout(() => {
        if (this.hooks.isDestroyed || this.editor.activeSheetId !== sheetId || this.pendingViewportRestore !== saved) return;
        const container = this.editor.gridContainer?.nativeElement;
        if (container) { container.scrollTop = saved.top; container.scrollLeft = saved.left; }
        this.pendingViewportRestore = undefined;
        this.hooks.viewChanges?.markForCheck();
      }, 0);
    }
    const top = this.pendingViewportRestore?.top ?? element?.scrollTop ?? 0;
    const left = this.pendingViewportRestore?.left ?? element?.scrollLeft ?? 0;
    const width = element?.clientWidth || 1100, height = element?.clientHeight || 600;
    const key = `${this.editor.activeSheetId}:${top}:${left}:${width}:${height}:${this.editor.showHeadings}`;
    if (key !== this.viewportKey) {
      const rows = this.rowAxis.window(top, height, 6), cols = this.colAxis.window(left, width, 2);
      this.viewportValue = { rows: rows.indices, columns: cols.indices, top: rows.before, bottom: rows.after, left: cols.before, right: cols.after };
      this.viewportKey = key;
    }
    return this.viewportValue;
  }

  onGridScroll(): void {
    const element = this.editor.gridContainer?.nativeElement;
    if (element && !this.pendingViewportRestore) this.scrollPositions.set(this.editor.activeSheetId, { top: element.scrollTop, left: element.scrollLeft });
  }

  revealCell(col: number, row: number): void {
    this.ensureGridLayout();
    const element = this.editor.gridContainer?.nativeElement;
    const position = this.pendingViewportRestore || { top: element?.scrollTop || 0, left: element?.scrollLeft || 0 };
    const width = element?.clientWidth || 1100, height = element?.clientHeight || 600;
    const x = this.colAxis.offset(col), y = this.rowAxis.offset(row);
    const right = this.colAxis.offset(col + 1) + (this.editor.showHeadings ? 40 : 0);
    const bottom = this.rowAxis.offset(row + 1) + (this.editor.showHeadings ? 24 : 0);
    if (x < position.left) position.left = x;
    else if (right > position.left + width) position.left = Math.max(0, right - width);
    if (y < position.top) position.top = y;
    else if (bottom > position.top + height) position.top = Math.max(0, bottom - height);
    this.scrollPositions.set(this.editor.activeSheetId, position);
    if (element) { element.scrollLeft = position.left; element.scrollTop = position.top; }
    this.viewportKey = '';
    this.hooks.viewChanges?.markForCheck();
  }

  refreshViewport(): void { this.viewportKey = ''; this.hooks.viewChanges?.markForCheck(); }

  getColWidth(col: number): number {
    return this.editor.activeSheet.colWidths?.[col] ?? DEFAULT_COL_WIDTH;
  }

  getRowHeight(row: number): number {
    return this.editor.activeSheet.rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT;
  }

  private mergeViewportRows?: number[];

  private mergeViewportCols?: number[];

  private renderedMerges?: MergeRegion[];

  private mergeFragments = new Map<string, { hidden: boolean; col: number; row: number; colSpan: number; rowSpan: number; width: number; height: number }>();

  renderedMerge(col: number, row: number, viewport: { rows: number[]; columns: number[] }) {
    const merges = this.editor.activeSheet.merges;
    if (merges !== this.renderedMerges || viewport.rows !== this.mergeViewportRows || viewport.columns !== this.mergeViewportCols) {
      this.renderedMerges = merges; this.mergeViewportRows = viewport.rows; this.mergeViewportCols = viewport.columns;
      this.mergeFragments.clear(); this.ensureGridLayout();
      for (const m of merges || []) {
        const firstCol = Math.max(m.startCol, viewport.columns[0]), lastCol = Math.min(m.endCol, viewport.columns.at(-1)!);
        const firstRow = Math.max(m.startRow, viewport.rows[0]), lastRow = Math.min(m.endRow, viewport.rows.at(-1)!);
        if (firstCol > lastCol || firstRow > lastRow) continue;
        for (let r = firstRow; r <= lastRow; r++) for (let c = firstCol; c <= lastCol; c++) {
          this.mergeFragments.set(`${c}:${r}`, { hidden: c !== firstCol || r !== firstRow, col: m.startCol, row: m.startRow,
            colSpan: lastCol - firstCol + 1, rowSpan: lastRow - firstRow + 1,
            width: this.colAxis.offset(lastCol + 1) - this.colAxis.offset(firstCol), height: this.rowAxis.offset(lastRow + 1) - this.rowAxis.offset(firstRow) });
        }
      }
    }
    return this.mergeFragments.get(`${col}:${row}`) || { hidden: false, col, row, colSpan: 1, rowSpan: 1, width: this.getColWidth(col), height: this.getRowHeight(row) };
  }
}
