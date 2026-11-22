import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  CellBorders,
  CellStyle,
  ClipboardMatrix,
  ColumnFilters,
  MergeRegion,
  Sheet,
} from '../../models/excel.model';
import { colIndexToLetter, FormulaCalculationCache, getCellId } from '../../services/formula-engine.service';
import { GridAxis } from '../../services/grid-viewport';
import {
  SheetActiveEditorState,
  SheetCanvasFrame,
  SheetCanvasRenderer,
  SheetHitTarget,
  SheetHoveredHeader,
} from '../../services/sheet-canvas-renderer';

export interface ExcelCanvasGridHost {
  readonly activeSheet: Sheet;
  readonly activeSheetId: string;
  readonly totalCols: number;
  readonly totalRows: number;
  readonly showHeadings: boolean;
  readonly showGridlines: boolean;
  readonly showFormulasInCells: boolean;
  readonly isEditing: boolean;
  readonly isSelecting: boolean;
  readonly isFillDragging: boolean;
  readonly selectedCell: { col: number; row: number };
  readonly normalizedRange: { minCol: number; maxCol: number; minRow: number; maxRow: number };
  readonly currentZoom: () => number;
  readonly isDarkMode: boolean;
  readonly gridViewport: { rows: number[]; columns: number[]; top: number; bottom: number; left: number; right: number };
  readonly calculationCache: FormulaCalculationCache;
  readonly activeClipboardMatrix?: ClipboardMatrix | null;
  readonly resizingCol?: { col: number; startX: number; startWidth: number } | null;
  readonly resizingRow?: { row: number; startY: number; startHeight: number } | null;
  readonly filtersEnabled?: boolean;
  readonly columnFilters?: ColumnFilters;
  readonly hasCopiedFormat?: boolean;
  readonly renderRevision?: number;
  readonly selectedChartId?: string | null;
  getGridAxes(): { colAxis: GridAxis; rowAxis: GridAxis };
  formatCellDisplay(val: string | number, style?: CellStyle): string;
  mergedRegion(col: number, row: number): MergeRegion | undefined;
  getEffectiveCellBorders(col: number, row: number): CellBorders | undefined;
  shouldSkipBorder(col: number, row: number, edge: 'top' | 'left'): boolean;
  isTracedCell(col: number, row: number): boolean;
  getSourceHighlight(col: number, row: number): Record<string, string> | null;
  getCellValue(col: number, row: number): string | number;
  onCellMouseDown(col: number, row: number, event: MouseEvent): void;
  onCellMouseEnter(col: number, row: number): void;
  onCellDoubleClick(col: number, row: number): void;
  openCellContextMenu(col: number, row: number, event: MouseEvent): void;
  selectEntireColumn(col: number, event: MouseEvent): void;
  selectEntireRow(row: number, event: MouseEvent): void;
  selectAllCells(): void;
  beginResizeCol(col: number, event: MouseEvent): void;
  beginResizeRow(row: number, event: MouseEvent): void;
  autoFitColumn?(col: number): void;
  autoFitRow?(row: number): void;
  startFillDrag(event: MouseEvent): void;
  toggleColumnFilterMenu?(col: number, event: MouseEvent): void;
  toggleValidationDropdown?(col: number, row: number, event?: MouseEvent): void;
  toggleCheckboxCell?(col: number, row: number): void;
  openCellCommentEditor?(col: number, row: number): void;
  hoverCommentCell?(cell: { col: number; row: number } | null): void;
  toggleOutlineGroup?(axis: 'col' | 'row', groupIndex: number): void;
  handleFloatingObjectMouseDown?(worldX: number, worldY: number, event: MouseEvent): boolean;
  handleFloatingObjectMouseMove?(worldX: number, worldY: number): { handled: boolean; cursor?: string };
  handleFloatingObjectDoubleClick?(worldX: number, worldY: number): boolean;
  clearFloatingObjectHover?(): void;
  readonly activeEditorState?: SheetActiveEditorState | null;
}

/** High-FPS HiDPI Canvas surface for the Excel grid and headers. */
@Component({
  selector: 'app-excel-canvas-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #sheetCanvas
      class="block select-none"
      role="application"
      [attr.aria-label]="gridA11ySummary"
      [style.cursor]="cursorStyle()"
      (mousedown)="onMouseDown($event)"
      (dblclick)="onDoubleClick($event)"
      (contextmenu)="onContextMenu($event)"
    ></canvas>
    <div
      class="sr-only"
      role="row"
      [attr.aria-rowindex]="host.selectedCell.row + 1"
    >
      <div
        id="sheet-a11y-active-cell"
        role="gridcell"
        aria-selected="true"
        aria-live="polite"
        [attr.aria-readonly]="isActiveCellLocked ? 'true' : null"
        [attr.aria-colindex]="host.selectedCell.col + 1"
        [attr.data-active-cell]="activeCellId"
      >{{ activeCellA11yLabel }}</div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 0;
      height: 0;
      overflow: visible;
    }
    canvas {
      display: block;
      touch-action: pan-x pan-y;
    }
  `],
})
export class ExcelCanvasGridComponent implements AfterViewInit, AfterViewChecked, OnChanges, OnDestroy {
  @Input({ required: true }) host!: ExcelCanvasGridHost;
  @Input() scrollContainer?: HTMLElement | null;
  @Input() renderRevision = 0;

  @ViewChild('sheetCanvas', { static: true }) private canvasRef?: ElementRef<HTMLCanvasElement>;

  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly renderer = new SheetCanvasRenderer();
  readonly cursorStyle = signal<string>('cell');
  readonly lastFrame = signal<SheetCanvasFrame | null>(null);

  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundScrollEl: HTMLElement | null = null;
  private lastHoverCell: { col: number; row: number } | null = null;
  private hoveredHeader: SheetHoveredHeader | null = null;
  private dragAutoScrollTimer: ReturnType<typeof setInterval> | null = null;
  private clipboardAnimTimer: ReturnType<typeof setInterval> | null = null;
  private clipboardPhase = 0;
  private lastDragClientPos: { clientX: number; clientY: number } | null = null;
  private lastRenderSignature: unknown[] | null = null;
  paintCount = 0;
  private disposed = false;

  private readonly onExternalScroll = () => {
    this.scheduleRender();
  };

  private readonly onCanvasMouseLeave = () => {
    if (this.hoveredHeader) {
      this.hoveredHeader = null;
      this.scheduleRender();
    }
    this.host?.hoverCommentCell?.(null);
    this.host?.clearFloatingObjectHover?.();
    this.cursorStyle.set(this.host?.hasCopiedFormat ? 'crosshair' : 'cell');
  };

  private readonly onWindowDragMove = (event: MouseEvent) => {
    if (!this.host.isSelecting && !this.host.isFillDragging) {
      this.stopDragTracking();
      return;
    }
    this.lastDragClientPos = { clientX: event.clientX, clientY: event.clientY };
    this.updateSelectionFromPointer(event.clientX, event.clientY);
  };

  private readonly onWindowDragEnd = () => {
    this.stopDragTracking();
    this.renderNow(true);
  };

  private readonly onCanvasMouseMove = (event: MouseEvent) => {
    const pos = this.pointerToViewport(event);
    const hit = this.hitTest(pos.x, pos.y);

    if (this.host.isSelecting || this.host.isFillDragging) {
      if (hit.kind === 'cell') {
        if (!this.lastHoverCell || this.lastHoverCell.col !== hit.col || this.lastHoverCell.row !== hit.row) {
          this.lastHoverCell = { col: hit.col, row: hit.row };
          this.ngZone.run(() => {
            this.host.onCellMouseEnter(hit.col, hit.row);
            this.renderNow(true);
          });
        }
      }
      return;
    }

    this.lastHoverCell = null;
    if (!this.host.isEditing && this.host.handleFloatingObjectMouseMove) {
      const scrollEl = this.scrollContainer;
      const zoom = this.host.currentZoom() || 1;
      const worldX = pos.x + (scrollEl?.scrollLeft || 0) / zoom;
      const worldY = pos.y + (scrollEl?.scrollTop || 0) / zoom;
      const objHover = this.host.handleFloatingObjectMouseMove(worldX, worldY);
      if (objHover.handled) {
        if (this.hoveredHeader) {
          this.hoveredHeader = null;
          this.scheduleRender();
        }
        const cursor = objHover.cursor || 'default';
        if (cursor !== this.cursorStyle()) {
          this.ngZone.run(() => this.cursorStyle.set(cursor));
        }
        return;
      }
    }

    const nextHover = this.hoverHeaderForHit(hit);
    if (
      nextHover?.kind !== this.hoveredHeader?.kind ||
      nextHover?.index !== this.hoveredHeader?.index
    ) {
      this.hoveredHeader = nextHover;
      this.scheduleRender();
    }

    const nextCursor = this.cursorForHit(hit);
    if (nextCursor !== this.cursorStyle()) {
      this.ngZone.run(() => this.cursorStyle.set(nextCursor));
    }

    if (this.host?.hoverCommentCell) {
      if (hit.kind === 'commentIndicator' || (hit.kind === 'cell' && this.host.activeSheet.comments?.[getCellId(hit.col, hit.row)])) {
        this.host.hoverCommentCell({ col: hit.col, row: hit.row });
      } else {
        this.host.hoverCommentCell(null);
      }
    }
  };

  get activeCellId(): string {
    return getCellId(this.host.selectedCell.col, this.host.selectedCell.row);
  }

  get isActiveCellLocked(): boolean {
    const sheet = this.host.activeSheet;
    if (!sheet?.protected) return false;
    return sheet.data[this.activeCellId]?.style?.locked !== false;
  }

  get gridA11ySummary(): string {
    const sheetName = this.host.activeSheet?.name || 'Hoja';
    return `${sheetName}, ${this.activeCellA11yLabel}`;
  }

  get activeCellA11yLabel(): string {
    const sheet = this.host.activeSheet;
    const { col, row } = this.host.selectedCell;
    const cellData = sheet.data[this.activeCellId];
    const val = this.host.getCellValue(col, row);
    const formatted = this.host.formatCellDisplay(val, cellData?.style);
    const parts = [`${colIndexToLetter(col)}${row + 1}: ${formatted || 'vacío'}`];

    if (cellData?.raw?.startsWith('=')) {
      parts.push(`fórmula ${cellData.raw}`);
    }
    if (cellData?.hyperlink) {
      parts.push(`enlace ${cellData.hyperlink}`);
    }
    if (cellData?.style?.checkbox) {
      parts.push(
        cellData.raw === 'TRUE' || String(val).toUpperCase() === 'TRUE'
          ? 'casilla marcada'
          : 'casilla sin marcar'
      );
    }
    if (sheet.protected) {
      parts.push(cellData?.style?.locked === false ? 'celda desbloqueada en hoja protegida' : 'protegida de solo lectura');
    }
    const validation = sheet.validations?.[this.activeCellId];
    if (validation) {
      parts.push(validation.type === 'list' ? 'con lista desplegable de validación' : 'con validación de datos');
    }
    const freeze = sheet.freezePanes;
    if (freeze && (col < (freeze.cols || 0) || row < (freeze.rows || 0))) {
      parts.push('panel inmovilizado');
    }
    if (sheet.rowGroups?.some(g => row >= g.start && row <= g.end)) {
      parts.push('en grupo de filas');
    }
    if (sheet.colGroups?.some(g => col >= g.start && col <= g.end)) {
      parts.push('en grupo de columnas');
    }
    const merge = this.host.mergedRegion(col, row);
    if (merge) {
      parts.push(
        `combinada ${colIndexToLetter(merge.startCol)}${merge.startRow + 1}:${colIndexToLetter(merge.endCol)}${merge.endRow + 1}`
      );
    }
    if (this.host.isEditing && this.host.activeEditorState) {
      parts.push(`editando "${this.host.activeEditorState.value}"`);
    }
    const comment = sheet.comments?.[this.activeCellId];
    if (comment?.text) {
      parts.push(`nota ${comment.text}`);
    }
    if (this.host.selectedChartId) {
      const selectedChart = sheet.charts?.find(c => c.id === this.host.selectedChartId);
      if (selectedChart) {
        parts.push(`gráfico seleccionado ${selectedChart.chartTitle || selectedChart.title}`);
      }
    }
    const r = this.host.normalizedRange;
    if (r.minCol !== r.maxCol || r.minRow !== r.maxRow) {
      parts.push(
        `rango seleccionado ${colIndexToLetter(r.minCol)}${r.minRow + 1}:${colIndexToLetter(r.maxCol)}${r.maxRow + 1}`
      );
    }
    return parts.join(', ');
  }

  ngAfterViewInit(): void {
    this.bindScrollContainer();
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      this.ngZone.runOutsideAngular(() => {
        canvas.addEventListener('mousemove', this.onCanvasMouseMove, { passive: true });
        canvas.addEventListener('mouseleave', this.onCanvasMouseLeave, { passive: true });
      });
    }
    this.renderNow(true);
  }

  ngOnChanges(): void {
    this.invalidateFrame();
    this.bindScrollContainer();
    this.renderNow(true);
  }

  ngAfterViewChecked(): void {
    this.bindScrollContainer();
    this.renderNow(false);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.stopDragTracking();
    this.stopClipboardAnimation();
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbindScrollContainer();
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('mousemove', this.onCanvasMouseMove);
      canvas.removeEventListener('mouseleave', this.onCanvasMouseLeave);
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private bindScrollContainer(): void {
    const el = this.scrollContainer || null;
    if (el === this.boundScrollEl) return;
    this.unbindScrollContainer();
    this.boundScrollEl = el;
    if (!el) return;

    this.ngZone.runOutsideAngular(() => {
      el.addEventListener('scroll', this.onExternalScroll, { passive: true });
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
        this.resizeObserver.observe(el);
      }
    });
  }

  private unbindScrollContainer(): void {
    if (this.boundScrollEl) {
      this.boundScrollEl.removeEventListener('scroll', this.onExternalScroll);
      this.boundScrollEl = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  invalidateFrame(): void {
    this.lastRenderSignature = null;
  }

  scheduleRender(): void {
    if (this.disposed) return;
    this.invalidateFrame();
    this.cdr.markForCheck();
    if (typeof requestAnimationFrame === 'undefined') {
      this.renderNow(true);
      return;
    }
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.disposed) this.renderNow(true);
    });
  }

  renderNow(force = false): SheetCanvasFrame | null {
    if (this.disposed || !this.host) return null;
    if (force) {
      this.cdr.markForCheck();
    }

    // Keep per-sheet scroll restoration active
    void this.host.gridViewport;

    const scrollEl = this.scrollContainer;
    const zoom = this.host.currentZoom() || 1;
    const cssViewportWidth = scrollEl?.clientWidth || 1100;
    const cssViewportHeight = scrollEl?.clientHeight || 600;
    const viewportWidth = cssViewportWidth / zoom;
    const viewportHeight = cssViewportHeight / zoom;
    const scrollLeft = (scrollEl?.scrollLeft || 0) / zoom;
    const scrollTop = (scrollEl?.scrollTop || 0) / zoom;

    const { colAxis, rowAxis } = this.host.getGridAxes();
    const sheet = this.host.activeSheet;
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    const activeCellKey = getCellId(this.host.selectedCell.col, this.host.selectedCell.row);
    const clipboard = this.host.activeClipboardMatrix;
    const resizingCol = this.host.resizingCol;
    const resizingRow = this.host.resizingRow;
    const activeEditor = this.host.activeEditorState ?? null;

    const signature: unknown[] = [
      viewportWidth,
      viewportHeight,
      scrollLeft,
      scrollTop,
      dpr,
      zoom,
      this.host.activeSheetId,
      sheet,
      sheet.data,
      sheet.data[activeCellKey],
      sheet.colWidths,
      resizingCol ? sheet.colWidths?.[resizingCol.col] : -1,
      sheet.rowHeights,
      resizingRow ? sheet.rowHeights?.[resizingRow.row] : -1,
      sheet.merges,
      sheet.freezePanes,
      sheet.protected,
      sheet.colGroups,
      sheet.rowGroups,
      sheet.conditionalRules,
      sheet.tables,
      sheet.validations,
      sheet.comments,
      sheet.sparklines,
      sheet.hiddenCols,
      sheet.hiddenRows,
      sheet.pageLayout,
      colAxis,
      rowAxis,
      this.host.totalCols,
      this.host.totalRows,
      this.host.selectedCell.col,
      this.host.selectedCell.row,
      this.host.normalizedRange.minCol,
      this.host.normalizedRange.maxCol,
      this.host.normalizedRange.minRow,
      this.host.normalizedRange.maxRow,
      this.host.showHeadings,
      this.host.showGridlines,
      this.host.showFormulasInCells,
      this.host.isDarkMode,
      this.host.isEditing,
      this.host.isFillDragging,
      this.host.filtersEnabled,
      this.host.columnFilters,
      this.host.hasCopiedFormat,
      this.host.renderRevision ?? 0,
      this.host.calculationCache,
      clipboard,
      clipboard ? this.clipboardPhase : 0,
      resizingCol?.col ?? -1,
      resizingRow?.row ?? -1,
      this.hoveredHeader?.kind ?? '',
      this.hoveredHeader?.index ?? -1,
      activeEditor?.col ?? -1,
      activeEditor?.row ?? -1,
      activeEditor?.value ?? '',
      activeEditor?.selectionStart ?? 0,
      activeEditor?.selectionEnd ?? 0,
    ];

    if (!force && this.lastRenderSignature && this.lastFrame() && this.signaturesEqual(this.lastRenderSignature, signature)) {
      return this.lastFrame();
    }
    this.lastRenderSignature = signature;

    const clipboardRange =
      clipboard && clipboard.sheetId === this.host.activeSheetId
        ? { mode: clipboard.mode, range: clipboard.range }
        : null;
    this.syncClipboardAnimation(Boolean(clipboardRange));
    const activeResize = resizingCol
      ? { type: 'col' as const, index: resizingCol.col, size: sheet.colWidths?.[resizingCol.col] ?? resizingCol.startWidth }
      : resizingRow
        ? { type: 'row' as const, index: resizingRow.row, size: sheet.rowHeights?.[resizingRow.row] ?? resizingRow.startHeight }
        : null;

    const frame = this.renderer.buildFrame({
      grid: sheet.data,
      calculationCache: this.host.calculationCache,
      colAxis,
      rowAxis,
      totalCols: this.host.totalCols,
      totalRows: this.host.totalRows,
      scrollLeft,
      scrollTop,
      viewportWidth,
      viewportHeight,
      selectedCell: this.host.selectedCell,
      normalizedRange: this.host.normalizedRange,
      merges: sheet.merges,
      freezePanes: sheet.freezePanes,
      colGroups: sheet.colGroups,
      rowGroups: sheet.rowGroups,
      sheetProtected: Boolean(sheet.protected),
      showHeadings: this.host.showHeadings,
      showGridlines: this.host.showGridlines,
      showFormulasInCells: this.host.showFormulasInCells,
      isDarkChrome: this.host.isDarkMode,
      isEditing: this.host.isEditing,
      isFillDragging: this.host.isFillDragging,
      conditionalRules: sheet.conditionalRules,
      tables: sheet.tables,
      validations: sheet.validations,
      comments: sheet.comments,
      sparklines: sheet.sparklines,
      filtersEnabled: this.host.filtersEnabled,
      columnFilters: this.host.columnFilters,
      printArea: sheet.pageLayout?.printArea,
      pageLayout: sheet.pageLayout,
      clipboardRange,
      clipboardPhase: this.clipboardPhase,
      activeResize,
      hoveredHeader: this.hoveredHeader,
      activeEditor,
      formatDisplay: (val, style) => this.host.formatCellDisplay(val, style),
      mergedRegion: (col, row) => this.host.mergedRegion(col, row),
      getEffectiveBorders: (col, row) => this.host.getEffectiveCellBorders(col, row),
      shouldSkipBorder: (col, row, edge) => this.host.shouldSkipBorder(col, row, edge),
      isTracedCell: (col, row) => this.host.isTracedCell(col, row),
      getSourceHighlight: (col, row) => this.host.getSourceHighlight(col, row),
    });

    this.lastFrame.set(frame);
    this.paintCount += 1;

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const backingScale = dpr * zoom;
      const targetW = Math.max(1, Math.round(cssViewportWidth * dpr));
      const targetH = Math.max(1, Math.round(cssViewportHeight * dpr));

      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      canvas.style.width = `${cssViewportWidth}px`;
      canvas.style.height = `${cssViewportHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.renderer.paint(ctx, frame, backingScale);
      }
    }

    return frame;
  }

  private signaturesEqual(a: unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  hitTest(localX: number, localY: number): SheetHitTarget {
    const scrollEl = this.scrollContainer;
    const zoom = this.host.currentZoom() || 1;
    const { colAxis, rowAxis } = this.host.getGridAxes();
    return this.renderer.hitTest(localX, localY, {
      colAxis,
      rowAxis,
      totalCols: this.host.totalCols,
      totalRows: this.host.totalRows,
      scrollLeft: (scrollEl?.scrollLeft || 0) / zoom,
      scrollTop: (scrollEl?.scrollTop || 0) / zoom,
      viewportWidth: (scrollEl?.clientWidth || 1100) / zoom,
      viewportHeight: (scrollEl?.clientHeight || 600) / zoom,
      showHeadings: this.host.showHeadings,
      freezePanes: this.host.activeSheet.freezePanes,
      frame: this.lastFrame(),
      mergedRegion: (col, row) => this.host.mergedRegion(col, row),
    });
  }

  onMouseDown(event: MouseEvent): void {
    const pos = this.pointerToViewport(event);
    const scrollEl = this.scrollContainer;
    const zoom = this.host.currentZoom() || 1;
    if (event.button === 0 && this.host.handleFloatingObjectMouseDown) {
      const worldX = pos.x + (scrollEl?.scrollLeft || 0) / zoom;
      const worldY = pos.y + (scrollEl?.scrollTop || 0) / zoom;
      if (this.host.handleFloatingObjectMouseDown(worldX, worldY, event)) {
        this.renderNow(true);
        return;
      }
    }
    const hit = this.hitTest(pos.x, pos.y);
    this.lastHoverCell = null;

    switch (hit.kind) {
      case 'corner':
        this.host.selectAllCells();
        break;
      case 'colResize':
        this.host.beginResizeCol(hit.col, event);
        break;
      case 'colHeader':
        this.host.selectEntireColumn(hit.col, event);
        break;
      case 'rowResize':
        this.host.beginResizeRow(hit.row, event);
        break;
      case 'rowHeader':
        this.host.selectEntireRow(hit.row, event);
        break;
      case 'outlineToggle':
        this.host.toggleOutlineGroup?.(hit.axis, hit.groupIndex);
        break;
      case 'filterButton':
        this.host.toggleColumnFilterMenu?.(hit.col, event);
        break;
      case 'validationButton':
        this.host.toggleValidationDropdown?.(hit.col, hit.row, event);
        break;
      case 'commentIndicator':
        this.host.openCellCommentEditor?.(hit.col, hit.row);
        break;
      case 'checkbox':
        this.host.onCellMouseDown(hit.col, hit.row, event);
        this.host.toggleCheckboxCell?.(hit.col, hit.row);
        break;
      case 'fillHandle':
        this.host.startFillDrag(event);
        this.startDragTracking();
        break;
      case 'cell':
        this.host.onCellMouseDown(hit.col, hit.row, event);
        if (this.host.isSelecting) this.startDragTracking();
        break;
      case 'empty':
        break;
    }
    this.renderNow(true);
  }

  onDoubleClick(event: MouseEvent): void {
    const pos = this.pointerToViewport(event);
    const scrollEl = this.scrollContainer;
    const zoom = this.host.currentZoom() || 1;
    if (this.host.handleFloatingObjectDoubleClick) {
      const worldX = pos.x + (scrollEl?.scrollLeft || 0) / zoom;
      const worldY = pos.y + (scrollEl?.scrollTop || 0) / zoom;
      if (this.host.handleFloatingObjectDoubleClick(worldX, worldY)) {
        return;
      }
    }
    const hit = this.hitTest(pos.x, pos.y);
    if (hit.kind === 'colResize') {
      this.host.autoFitColumn?.(hit.col);
      this.renderNow(true);
    } else if (hit.kind === 'rowResize') {
      this.host.autoFitRow?.(hit.row);
      this.renderNow(true);
    } else if (hit.kind === 'cell') {
      this.host.onCellDoubleClick(hit.col, hit.row);
      this.renderNow(true);
    }
  }

  onContextMenu(event: MouseEvent): void {
    const pos = this.pointerToViewport(event);
    const hit = this.hitTest(pos.x, pos.y);
    if (hit.kind === 'cell') {
      this.host.openCellContextMenu(hit.col, hit.row, event);
      this.renderNow(true);
    } else if (hit.kind === 'colHeader') {
      this.host.selectEntireColumn(hit.col, event);
      this.host.openCellContextMenu(hit.col, 0, event);
      this.renderNow(true);
    } else if (hit.kind === 'rowHeader') {
      this.host.selectEntireRow(hit.row, event);
      this.host.openCellContextMenu(0, hit.row, event);
      this.renderNow(true);
    }
  }

  measureAutoFitColumnWidth(col: number): number {
    const ctx = this.canvasRef?.nativeElement?.getContext('2d') ?? null;
    return this.renderer.computeAutoFitColumnWidth({
      col,
      grid: this.host.activeSheet.data,
      calculationCache: this.host.calculationCache,
      formatDisplay: (val, style) => this.host.formatCellDisplay(val, style),
      ctx,
      mergedRegion: (c, r) => this.host.mergedRegion(c, r),
    });
  }

  measureAutoFitRowHeight(row: number): number {
    const ctx = this.canvasRef?.nativeElement?.getContext('2d') ?? null;
    const { colAxis } = this.host.getGridAxes();
    return this.renderer.computeAutoFitRowHeight({
      row,
      grid: this.host.activeSheet.data,
      calculationCache: this.host.calculationCache,
      colAxis,
      formatDisplay: (val, style) => this.host.formatCellDisplay(val, style),
      ctx,
    });
  }

  private syncClipboardAnimation(active: boolean): void {
    if (!active) {
      this.stopClipboardAnimation();
      return;
    }
    if (this.clipboardAnimTimer || typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      this.clipboardAnimTimer = setInterval(() => {
        if (this.disposed || !this.host?.activeClipboardMatrix) {
          this.stopClipboardAnimation();
          return;
        }
        this.clipboardPhase = (this.clipboardPhase + 1) % 8;
        this.renderNow(true);
      }, 120);
    });
  }

  private stopClipboardAnimation(): void {
    if (this.clipboardAnimTimer) {
      clearInterval(this.clipboardAnimTimer);
      this.clipboardAnimTimer = null;
    }
    this.clipboardPhase = 0;
  }

  private startDragTracking(): void {
    if (typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('mousemove', this.onWindowDragMove, { passive: true });
      window.addEventListener('mouseup', this.onWindowDragEnd, { passive: true });
      if (!this.dragAutoScrollTimer) {
        this.dragAutoScrollTimer = setInterval(() => {
          if (!this.host.isSelecting && !this.host.isFillDragging) {
            this.stopDragTracking();
            return;
          }
          if (this.lastDragClientPos) {
            this.performEdgeAutoScroll(this.lastDragClientPos.clientX, this.lastDragClientPos.clientY);
          }
        }, 48);
      }
    });
  }

  private stopDragTracking(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', this.onWindowDragMove);
      window.removeEventListener('mouseup', this.onWindowDragEnd);
    }
    if (this.dragAutoScrollTimer) {
      clearInterval(this.dragAutoScrollTimer);
      this.dragAutoScrollTimer = null;
    }
    this.lastDragClientPos = null;
  }

  private performEdgeAutoScroll(clientX: number, clientY: number): void {
    const canvas = this.canvasRef?.nativeElement;
    const scrollEl = this.scrollContainer;
    if (!canvas || !scrollEl) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const zoom = this.host.currentZoom() || 1;
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    const margin = 24;
    let dx = 0;
    let dy = 0;

    if (x > rect.width / zoom - margin) dx = Math.min(36, Math.max(8, Math.round((x - (rect.width / zoom - margin)) / 2)));
    else if (x < 40) dx = -Math.min(36, Math.max(8, Math.round((40 - x) / 2)));

    if (y > rect.height / zoom - margin) dy = Math.min(36, Math.max(8, Math.round((y - (rect.height / zoom - margin)) / 2)));
    else if (y < 24) dy = -Math.min(36, Math.max(8, Math.round((24 - y) / 2)));

    if (dx !== 0 || dy !== 0) {
      scrollEl.scrollLeft = Math.max(0, scrollEl.scrollLeft + Math.round(dx * zoom));
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + Math.round(dy * zoom));
      this.updateSelectionFromPointer(clientX, clientY);
    }
  }

  private updateSelectionFromPointer(clientX: number, clientY: number): void {
    const canvas = this.canvasRef?.nativeElement;
    const zoom = this.host.currentZoom() || 1;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scrollEl = this.scrollContainer;
    const vw = (scrollEl?.clientWidth || 1100) / zoom;
    const vh = (scrollEl?.clientHeight || 600) / zoom;
    const rawX = rect.width > 0 ? (clientX - rect.left) / zoom : clientX / zoom;
    const rawY = rect.height > 0 ? (clientY - rect.top) / zoom : clientY / zoom;
    const clampedX = Math.max(this.host.showHeadings ? 41 : 1, Math.min(vw - 2, rawX));
    const clampedY = Math.max(this.host.showHeadings ? 25 : 1, Math.min(vh - 2, rawY));
    const hit = this.hitTest(clampedX, clampedY);
    if (hit.kind === 'cell') {
      if (!this.lastHoverCell || this.lastHoverCell.col !== hit.col || this.lastHoverCell.row !== hit.row) {
        this.lastHoverCell = { col: hit.col, row: hit.row };
        this.ngZone.run(() => {
          this.host.onCellMouseEnter(hit.col, hit.row);
          this.renderNow();
        });
      }
    }
  }

  private hoverHeaderForHit(hit: SheetHitTarget): SheetHoveredHeader | null {
    switch (hit.kind) {
      case 'colHeader':
        return { kind: 'colHeader', index: hit.col };
      case 'colResize':
        return { kind: 'colResize', index: hit.col };
      case 'rowHeader':
        return { kind: 'rowHeader', index: hit.row };
      case 'rowResize':
        return { kind: 'rowResize', index: hit.row };
      default:
        return null;
    }
  }

  private pointerToViewport(event: MouseEvent): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement;
    const zoom = this.host.currentZoom() || 1;
    if (!canvas) return { x: event.clientX / zoom, y: event.clientY / zoom };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return {
        x: event.offsetX || event.clientX / zoom,
        y: event.offsetY || event.clientY / zoom,
      };
    }
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  }

  private cursorForHit(hit: SheetHitTarget): string {
    switch (hit.kind) {
      case 'colResize':
        return 'col-resize';
      case 'rowResize':
        return 'row-resize';
      case 'fillHandle':
        return 'crosshair';
      case 'corner':
      case 'colHeader':
      case 'rowHeader':
      case 'filterButton':
      case 'validationButton':
      case 'commentIndicator':
      case 'checkbox':
      case 'outlineToggle':
        return 'pointer';
      case 'cell':
        return this.host?.hasCopiedFormat ? 'crosshair' : 'cell';
      default:
        return 'default';
    }
  }
}
