import type { SheetEditorHooks } from './sheet-editor-hooks';
import { GridAxis } from '../services/grid-viewport';
import { EmbeddedChart, FloatingArtwork, InkStroke, MergeRegion, SheetGrid } from '../models/excel.model';
import { getCalculatedExtent, parseCellId } from '../services/formula-engine.service';
import { TOTAL_ROWS, TOTAL_COLS, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '../constants/editor.constants';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';
import { isArtworkInViewport } from '../services/artwork-canvas-renderer';
import { isChartInViewport } from '../services/chart-canvas-renderer';
import { isStrokeInViewport } from '../services/ink-canvas-renderer';

type SheetViewportControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'activeSheetId'
  | 'currentZoom'
  | 'formulaWorkbookRevision'
  | 'gridContainer'
  | 'showHeadings'>;
type SheetViewportControllerHooks = Pick<SheetEditorHooks,
  | 'calculationCache'
  | 'isDestroyed'
  | 'scheduleCanvasRender'
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

  private layoutHiddenCols?: number[];

  private layoutHiddenRows?: number[];

  private colAxis = new GridAxis(TOTAL_COLS, DEFAULT_COL_WIDTH);

  private rowAxis = new GridAxis(TOTAL_ROWS, DEFAULT_ROW_HEIGHT);

  private viewportKey = '';

  private viewportValue = { rows: [] as number[], columns: [] as number[], top: 0, bottom: 0, left: 0, right: 0 };

  private scrollPositions = new Map<string, { top: number; left: number }>();

  private viewportSheetId = '';

  private pendingViewportRestore?: { top: number; left: number };

  private ensureGridLayout(): void {
    const sheet = this.editor.activeSheet;
    if (
      this.layoutGrid === sheet.data &&
      this.layoutWidths === sheet.colWidths &&
      this.layoutHeights === sheet.rowHeights &&
      this.layoutMerges === sheet.merges &&
      this.layoutHiddenCols === sheet.hiddenCols &&
      this.layoutHiddenRows === sheet.hiddenRows &&
      this.layoutRevision === this.editor.formulaWorkbookRevision
    ) return;
    this.layoutRevision = this.editor.formulaWorkbookRevision;
    this.layoutMerges = sheet.merges;
    this.layoutGrid = sheet.data;
    this.layoutWidths = sheet.colWidths;
    this.layoutHeights = sheet.rowHeights;
    this.layoutHiddenCols = sheet.hiddenCols;
    this.layoutHiddenRows = sheet.hiddenRows;
    this.colAxis = new GridAxis(this.totalCols, DEFAULT_COL_WIDTH, sheet.colWidths, sheet.hiddenCols || []);
    this.rowAxis = new GridAxis(this.totalRows, DEFAULT_ROW_HEIGHT, sheet.rowHeights, sheet.hiddenRows || []);
    this.viewportKey = '';
  }

  get inkCanvasWidth(): number { this.ensureGridLayout(); return this.colAxis.offset(this.totalCols) + (this.editor.showHeadings ? 40 : 0); }

  get inkCanvasHeight(): number { this.ensureGridLayout(); return this.rowAxis.offset(this.totalRows) + (this.editor.showHeadings ? 24 : 0); }

  private get zoom(): number {
    return this.editor.currentZoom() || 1;
  }

  get gridViewport() {
    this.ensureGridLayout();
    const element = this.editor.gridContainer?.nativeElement;
    const changedSheet = this.viewportSheetId !== this.editor.activeSheetId;
    const saved = this.scrollPositions.get(this.editor.activeSheetId) || { top: 0, left: 0 };
    if (changedSheet) {
      this.viewportSheetId = this.editor.activeSheetId;
      if (saved.top !== 0 || saved.left !== 0) {
        this.pendingViewportRestore = saved;
        const sheetId = this.editor.activeSheetId;
        // Restore after the new table extent has been rendered, including when leaving a chart sheet.
        setTimeout(() => {
          if (this.hooks.isDestroyed || this.editor.activeSheetId !== sheetId || this.pendingViewportRestore !== saved) return;
          const container = this.editor.gridContainer?.nativeElement;
          if (container) {
            const z = this.zoom;
            container.scrollTop = Math.round(saved.top * z);
            container.scrollLeft = Math.round(saved.left * z);
          }
          this.pendingViewportRestore = undefined;
          this.hooks.viewChanges?.markForCheck();
          this.hooks.scheduleCanvasRender?.();
        }, 0);
      } else {
        this.pendingViewportRestore = undefined;
        if (element) {
          element.scrollTop = 0;
          element.scrollLeft = 0;
        }
      }
    }
    const z = this.zoom;
    const top = this.pendingViewportRestore?.top ?? ((element?.scrollTop ?? 0) / z);
    const left = this.pendingViewportRestore?.left ?? ((element?.scrollLeft ?? 0) / z);
    const width = (element?.clientWidth || 1100) / z;
    const height = (element?.clientHeight || 600) / z;
    const key = `${this.editor.activeSheetId}:${top}:${left}:${width}:${height}:${z}:${this.editor.showHeadings}`;
    if (key !== this.viewportKey) {
      const rows = this.rowAxis.window(top, height, 6), cols = this.colAxis.window(left, width, 2);
      this.viewportValue = { rows: rows.indices, columns: cols.indices, top: rows.before, bottom: rows.after, left: cols.before, right: cols.after };
      this.viewportKey = key;
    }
    return this.viewportValue;
  }

  onGridScroll(): void {
    const element = this.editor.gridContainer?.nativeElement;
    if (element && !this.pendingViewportRestore) {
      const z = this.zoom;
      this.scrollPositions.set(this.editor.activeSheetId, { top: element.scrollTop / z, left: element.scrollLeft / z });
    }
  }

  revealCell(col: number, row: number): void {
    this.ensureGridLayout();
    const element = this.editor.gridContainer?.nativeElement;
    const z = this.zoom;
    const position = this.pendingViewportRestore || { top: (element?.scrollTop || 0) / z, left: (element?.scrollLeft || 0) / z };
    const width = (element?.clientWidth || 1100) / z;
    const height = (element?.clientHeight || 600) / z;
    const headerW = this.editor.showHeadings ? 40 : 0;
    const headerH = this.editor.showHeadings ? 24 : 0;
    const freeze = this.editor.activeSheet.freezePanes;
    const frozenCols = Math.max(0, Math.min(this.totalCols - 1, freeze?.cols ?? 0));
    const frozenRows = Math.max(0, Math.min(this.totalRows - 1, freeze?.rows ?? 0));
    const frozenW = frozenCols > 0 ? this.colAxis.offset(frozenCols) : 0;
    const frozenH = frozenRows > 0 ? this.rowAxis.offset(frozenRows) : 0;

    if (col >= frozenCols) {
      const colStartFromFreeze = this.colAxis.offset(col) - frozenW;
      const colEndFromFreeze = this.colAxis.offset(col + 1) - frozenW;
      const bodyW = Math.max(1, width - headerW - frozenW);
      if (colStartFromFreeze < position.left) position.left = Math.max(0, colStartFromFreeze);
      else if (colEndFromFreeze > position.left + bodyW) position.left = Math.max(0, colEndFromFreeze - bodyW);
    }

    if (row >= frozenRows) {
      const rowStartFromFreeze = this.rowAxis.offset(row) - frozenH;
      const rowEndFromFreeze = this.rowAxis.offset(row + 1) - frozenH;
      const bodyH = Math.max(1, height - headerH - frozenH);
      if (rowStartFromFreeze < position.top) position.top = Math.max(0, rowStartFromFreeze);
      else if (rowEndFromFreeze > position.top + bodyH) position.top = Math.max(0, rowEndFromFreeze - bodyH);
    }

    this.scrollPositions.set(this.editor.activeSheetId, position);
    if (element) {
      element.scrollLeft = Math.max(0, Math.round(position.left * z));
      element.scrollTop = Math.max(0, Math.round(position.top * z));
    }
    this.viewportKey = '';
    this.hooks.viewChanges?.markForCheck();
    this.hooks.scheduleCanvasRender?.();
  }

  /**
   * Preserves the visible top-left sheet coordinate when zoom changes so the
   * scroll container neither jumps nor loses its anchored cell position.
   */
  syncZoomScroll(logicalLeft: number, logicalTop: number, nextZoom: number): void {
    const safeLeft = Math.max(0, logicalLeft);
    const safeTop = Math.max(0, logicalTop);
    const z = nextZoom || 1;
    this.pendingViewportRestore = undefined;
    this.scrollPositions.set(this.editor.activeSheetId, { top: safeTop, left: safeLeft });
    this.viewportKey = '';

    const container = this.editor.gridContainer?.nativeElement;
    if (container) {
      const world = container.querySelector('.sheet-canvas-world') as HTMLElement | null;
      if (world) {
        world.style.width = `${Math.round(this.inkCanvasWidth * z)}px`;
        world.style.height = `${Math.round(this.inkCanvasHeight * z)}px`;
      }
      container.scrollLeft = Math.max(0, Math.round(safeLeft * z));
      container.scrollTop = Math.max(0, Math.round(safeTop * z));
    }
  }

  refreshViewport(): void {
    this.viewportKey = '';
    this.hooks.viewChanges?.markForCheck();
    this.hooks.scheduleCanvasRender?.();
  }

  resetScrollState(): void {
    this.scrollPositions.clear();
    this.viewportSheetId = '';
    this.pendingViewportRestore = undefined;
    this.viewportKey = '';
    const container = this.editor.gridContainer?.nativeElement;
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
  }

  getAxes(): { colAxis: GridAxis; rowAxis: GridAxis } {
    this.ensureGridLayout();
    return { colAxis: this.colAxis, rowAxis: this.rowAxis };
  }

  getColWidth(col: number): number {
    return this.editor.activeSheet.colWidths?.[col] ?? DEFAULT_COL_WIDTH;
  }

  getRowHeight(row: number): number {
    return this.editor.activeSheet.rowHeights?.[row] ?? DEFAULT_ROW_HEIGHT;
  }

  get scrollLeft(): number {
    return this.pendingViewportRestore?.left ?? ((this.editor.gridContainer?.nativeElement?.scrollLeft ?? 0) / this.zoom);
  }

  get scrollTop(): number {
    return this.pendingViewportRestore?.top ?? ((this.editor.gridContainer?.nativeElement?.scrollTop ?? 0) / this.zoom);
  }

  get viewportWidth(): number {
    return (this.editor.gridContainer?.nativeElement?.clientWidth || 1100) / this.zoom;
  }

  get viewportHeight(): number {
    return (this.editor.gridContainer?.nativeElement?.clientHeight || 600) / this.zoom;
  }

  get visibleCharts(): EmbeddedChart[] {
    const charts = this.editor.activeSheet.charts || [];
    if (!charts.length) return [];
    const sl = this.scrollLeft;
    const st = this.scrollTop;
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    return charts.filter((ch) => isChartInViewport(ch, sl, st, vw, vh));
  }

  get visibleArtwork(): FloatingArtwork[] {
    const artwork = this.editor.activeSheet.artwork || [];
    if (!artwork.length) return [];
    const sl = this.scrollLeft;
    const st = this.scrollTop;
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    return artwork.filter((item) => isArtworkInViewport(item, sl, st, vw, vh));
  }

  visibleInkStrokes(strokes: InkStroke[]): InkStroke[] {
    if (!strokes.length) return [];
    const sl = this.scrollLeft;
    const st = this.scrollTop;
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    return strokes.filter((s) => isStrokeInViewport(s, sl, st, vw, vh, 32));
  }
}
