import {ExcelCellContextMenuComponent,CellInsertAction} from './components/excel-cell-context-menu/excel-cell-context-menu.component';
import {applyWorkbookOperations} from '../../shared/utils/ai-workbook-control';
import type { SheetEditorHooks } from './controllers/sheet-editor-hooks';
import { Completion } from './services/formula-completion';
import { ExcelNamesModalComponent } from './components/excel-names-modal/excel-names-modal.component';
import { Component, ChangeDetectorRef, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ElementRef, ViewChild, HostListener, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { AiService } from '../../core/services/ai.service';
import { ExportModalComponent } from '../../export/components/export-modal/export-modal.component';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { sheetAiAdapter } from '../../shared/utils/ai-sheet-adapter';
import { BorderLineStyle, BorderPreset, CellBorders, CellData, CellStyle, CellValidationRule, ChartCategory, ChartSubType, ClipboardMatrix, ColumnFilters, ConditionalRule, DrawBorderMode, DrawToolId, EmbeddedChart, InkStroke, MergeRegion, NumberFormat, OutlineGroup, PageLayoutConfig, PasteSpecialMode, PivotTableDefinition, PresetStyle, SelectionRange, Sheet, SheetGrid, SparklineConfig } from './models/excel.model';
import { colIndexToLetter, evaluateCellValueCached, FormulaCalculationCache, getCellId, parseCellId } from './services/formula-engine.service';
import { cloneCellStyle, SpreadsheetClipboardService } from './services/clipboard.service';
import { ExcelArtworkPickerComponent } from './components/excel-artwork-picker/excel-artwork-picker.component';
import { WordIconsModalComponent } from '../pure-doc-editor/components/word-icons-modal/word-icons-modal.component';
import { FloatingArtwork } from './models/excel.model';
import { ExcelInkLayerComponent } from './components/excel-ink-layer/excel-ink-layer.component';
import { DEFAULT_INK_PENS } from './components/excel-draw-toolbar/excel-draw-toolbar.component';
import { InkPenConfig } from './models/excel.model';
import { ExcelRibbonComponent } from './components/excel-ribbon/excel-ribbon.component';
import { ExcelChartSheetViewComponent } from './components/excel-chart-sheet-view/excel-chart-sheet-view.component';
import { ExcelConditionalModalComponent } from './components/excel-conditional-modal/excel-conditional-modal.component';
import { ExcelSortFilterMenuComponent } from './components/excel-sort-filter-menu/excel-sort-filter-menu.component';
import { ExcelChartDataModalComponent } from './components/excel-chart-data-modal/excel-chart-data-modal.component';
import { ChartAppearance, ChartDataConfig } from './models/excel.model';
import { ExcelChartModalComponent } from './components/excel-chart-modal/excel-chart-modal.component';
import { ExcelFunctionsDrawerComponent } from './components/excel-functions-drawer/excel-functions-drawer.component';
import { ExcelFindReplaceModalComponent } from './components/excel-find-replace-modal/excel-find-replace-modal.component';
import { ExcelDataValidationModalComponent } from './components/excel-data-validation-modal/excel-data-validation-modal.component';
import { ExcelRemoveDuplicatesModalComponent } from './components/excel-remove-duplicates-modal/excel-remove-duplicates-modal.component';
import { ExcelTextToColumnsModalComponent } from './components/excel-text-to-columns-modal/excel-text-to-columns-modal.component';
import { ExcelPivotModalComponent } from './components/excel-pivot-modal/excel-pivot-modal.component';
import { ExcelSparklineModalComponent } from './components/excel-sparkline-modal/excel-sparkline-modal.component';
import {
  applyTextToColumns,
  buildPivotTableMatrix,
  computeReplacedCellRaw,
  extractPivotHeaders,
  FindMatch,
  FindReplaceOptions,
  findWorkbookMatches,
  PivotTableConfig,
  removeDuplicatesFromRange,
  replaceAllWorkbookMatches,
  resolveValidationListOptions,
  TextToColumnsDelimiters,
} from './services/sheet-data-tools.service';
import { ExcelCanvasGridComponent, ExcelCanvasGridHost } from './components/excel-canvas-grid/excel-canvas-grid.component';
import { CanvasObjectsLayerHost, ExcelCanvasObjectsLayerComponent } from './components/excel-canvas-objects-layer/excel-canvas-objects-layer.component';
import { GridAxis } from './services/grid-viewport';
import { SHEET_HEADER_COL_WIDTH, SHEET_HEADER_ROW_HEIGHT, SheetActiveEditorState } from './services/sheet-canvas-renderer';
import { LucideDynamicIcon, provideLucideIcons, LucideSun, LucideMoon, LucideSparkles, LucideMessageSquare, LucideShare2, LucideLock, LucideCheck, LucideX, LucideChevronDown, LucideChevronUp, LucidePlus, LucideSearch, LucideFileSpreadsheet, LucideBarChart2, LucidePanelLeft, LucideSave, LucideDownload, LucideSlidersHorizontal, LucideMaximize, LucideMinimize, LucideList } from '@lucide/angular';
import { SheetViewportController } from './controllers/sheet-viewport.controller';
import { SheetFormattingController } from './controllers/sheet-formatting.controller';
import { SheetDataController } from './controllers/sheet-data.controller';
import { SheetChartsController } from './controllers/sheet-charts.controller';
import { SheetEditingController } from './controllers/sheet-editing.controller';
import { SheetInteractionController } from './controllers/sheet-interaction.controller';
import { SheetWorkbookController } from './controllers/sheet-workbook.controller';
import { SheetArtworkController } from './controllers/sheet-artwork.controller';
import { FormulaRecalcClient } from './services/formula-recalc-client';
import { FormulaRecalcResult, hasWorkbookFormulas } from './services/formula-recalc.engine';
import type { SheetReferenceTarget, SheetReferenceTrace } from './models/editor-reference.model';

@Component({
  selector: 'app-pure-sheet-editor',
  standalone: true,
  imports: [
    ExcelCellContextMenuComponent, CommonModule,
    FormsModule,
    LucideDynamicIcon,
    ExcelRibbonComponent, ExcelInkLayerComponent, ExcelArtworkPickerComponent, WordIconsModalComponent,
    ExcelChartSheetViewComponent,
    ExcelConditionalModalComponent,
    ExcelSortFilterMenuComponent,
    ExcelChartModalComponent, ExcelChartDataModalComponent,
    ExcelNamesModalComponent,
    ExcelFunctionsDrawerComponent,
    ExcelFindReplaceModalComponent,
    ExcelDataValidationModalComponent,
    ExcelRemoveDuplicatesModalComponent,
    ExcelTextToColumnsModalComponent,
    ExcelPivotModalComponent,
    ExcelSparklineModalComponent,
    ExcelCanvasGridComponent,
    ExcelCanvasObjectsLayerComponent,
    ExportModalComponent,
  ],
  providers: [
    provideLucideIcons(
      LucideSun,
      LucideMoon,
      LucideSparkles,
      LucideMessageSquare,
      LucideShare2,
      LucideLock,
      LucideCheck,
      LucideX,
      LucideChevronDown,
      LucideChevronUp,
      LucidePlus,
      LucideSearch,
      LucideFileSpreadsheet,
      LucideBarChart2,
      LucidePanelLeft,
      LucideSave,
      LucideDownload,
      LucideSlidersHorizontal,
      LucideMaximize,
      LucideMinimize,
      LucideList
    ),
  ],
  templateUrl: './pure-sheet-editor.component.html',
  styleUrls: ['./pure-sheet-editor.component.scss'],
})
export class PureSheetEditorComponent implements ExcelCanvasGridHost, CanvasObjectsLayerHost, OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) note!: Note;

  @ViewChild('gridContainer') gridContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cellEditorInput') cellEditorInput?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;
  @ViewChild('formulaBarInput') formulaBarInput?: ElementRef<HTMLInputElement>;
  @ViewChild('sheetTabsScroll') sheetTabsScroll?: ElementRef<HTMLDivElement>;
  @ViewChild(ExcelCanvasGridComponent) canvasGrid?: ExcelCanvasGridComponent;
  @ViewChild(ExcelCanvasObjectsLayerComponent) objectsLayer?: ExcelCanvasObjectsLayerComponent;

  private readonly viewChanges = inject(ChangeDetectorRef, { optional: true });
  readonly notesService = inject(NotesService);
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  readonly aiService = inject(AiService);
  readonly clipboard = inject(SpreadsheetClipboardService);
  private readonly aiDocuments = inject(AiDocumentService);

  // Weave top bar & menu states
  exportMenuOpen = false;
  exportModalOpen = false;
  settingsMenuOpen = false;
  sheetListOpen = false;
  copiedLinkNotice = false;
  private copiedFormat: CellStyle | null = null;
  renderRevision = 0;

  get hasCopiedFormat(): boolean {
    return this.copiedFormat !== null;
  }

  get totalRows(): number { return this.viewport.totalRows; }
  get totalCols(): number { return this.viewport.totalCols; }
  readonly Math = Math;
  readonly colIndexToLetter = colIndexToLetter;

  // Active Ribbon Tab & Tools
  activeRibbonTab = 'Home';
  @ViewChild(ExcelInkLayerComponent) inkLayer?: ExcelInkLayerComponent;
  inkPens = DEFAULT_INK_PENS.map(pen => ({ ...pen }));
  activeDrawTool: DrawToolId = 'select';
  get currentInkPen(): InkPenConfig | undefined { return this.artwork.currentInkPen; }

  get inkCanvasWidth(): number { return this.viewport.inkCanvasWidth; }
  get inkCanvasHeight(): number { return this.viewport.inkCanvasHeight; }
  get scrollLeft(): number { return this.viewport.scrollLeft; }
  get scrollTop(): number { return this.viewport.scrollTop; }
  get viewportWidth(): number { return this.viewport.viewportWidth; }
  get viewportHeight(): number { return this.viewport.viewportHeight; }
  get visibleCharts(): EmbeddedChart[] { return this.viewport.visibleCharts; }
  get visibleArtwork(): FloatingArtwork[] { return this.viewport.visibleArtwork; }
  get gridViewport(): { rows: number[]; columns: number[]; top: number; bottom: number; left: number; right: number } { return this.viewport.gridViewport; }
  onGridScroll(): void {
    this.cellContextMenu = null;
    if (this.isEditing && (this.activeSheet.freezePanes?.cols || this.activeSheet.freezePanes?.rows)) {
      this.viewChanges?.markForCheck();
    }
    this.viewport.onGridScroll();
    this.objectsLayer?.renderNow();
    this.inkLayer?.paintCanvas();
  }
  revealCell(col: number, row: number): void { return this.viewport.revealCell(col, row); }
  syncZoomScroll(logicalLeft: number, logicalTop: number, nextZoom: number): void {
    this.viewport.syncZoomScroll(logicalLeft, logicalTop, nextZoom);
  }
  @HostListener('window:resize')
  refreshViewport(): void { return this.viewport.refreshViewport(); }
  addInkPen(pen: InkPenConfig): void { return this.artwork.addInkPen(pen); }
  commitInkStrokes(strokes: InkStroke[]): void { return this.artwork.commitInkStrokes(strokes); }
  selectInk(): void { return this.artwork.selectInk(); }

  inkColor = '#000000';
  inkWidth = 2;
  inkToShape = false;
  replayStrokeCount: number | null = null;

  get displayedInkStrokes(): InkStroke[] { return this.artwork.displayedInkStrokes; }
  private stopInkReplay(): void { return this.artwork.stopInkReplay(); }

  isReplaying = false;

  // Display toggles
  showGridlines = true;
  showHeadings = true;
  showFormulaBar = true;

  // Zoom
  readonly currentZoom = signal<number>(1.0);

  // Sheets state
  sheets: Sheet[] = [];
  activeSheetId = 'sheet1';

  // Selection
  selectedCell: { col: number; row: number } = { col: 0, row: 0 };
  selectionRange: SelectionRange = { startCol: 0, startRow: 0, endCol: 0, endRow: 0 };
  isSelecting = false;
  drawBorderMode: DrawBorderMode = 'none';

  completionItems: Completion[] = [];
  completionIndex = 0;
  completionLeft = 0;
  completionTop = 0;
  completionSignature = '';

  editorNotice = '';
  refreshCompletions(input: HTMLInputElement | HTMLTextAreaElement): void { return this.editing.refreshCompletions(input); }
  onCellEditorInput(event: Event): void {
    this.editing.onCellEditorInput(event);
    this.canvasGrid?.scheduleRender();
  }
  onEditorKeyUp(event: KeyboardEvent): void {
    this.editing.onEditorKeyUp(event);
    this.canvasGrid?.scheduleRender();
  }
  closeCompletions(): void { return this.editing.closeCompletions(); }
  acceptCompletion(index = this.completionIndex): void { return this.editing.acceptCompletion(index); }
  onCellEditorKeyDown(event: KeyboardEvent): void { return this.editing.onCellEditorKeyDown(event); }
  onFormulaEditorPointerDown(): void { this.editing.onFormulaEditorPointerDown(); }
  onFormulaBarFocus(): void { this.editing.onFormulaBarFocus(); }
  onCompletionKeyDown(event: KeyboardEvent): boolean { return this.editing.onCompletionKeyDown(event); }
  namesModalOpen = false;
  namesError = '';
  get selectionReference(): string { return this.editing.selectionReference; }
  openNames(): void { return this.editing.openNames(); }

  saveDefinedName(change: { name: string; reference: string; scope: string }): void { return this.editing.saveDefinedName(change); }
  removeDefinedName(change: { name: string; scope: string; sheetId: string }): void { return this.editing.removeDefinedName(change); }
  createStructuredTable(change: { name: string; headers: boolean }): void { return this.editing.createStructuredTable(change); }
  removeStructuredTable(name: string): void { return this.editing.removeStructuredTable(name); }
  insertDefinedName(name: string): void { return this.editing.insertDefinedName(name); }
  chartGrid(chart?: EmbeddedChart | null): SheetGrid { return this.charts.chartGrid(chart); }

  // Inline Cell Editing
  isEditing = false;
  editingValue = '';
  editOrigin?: { sheetId: string; col: number; row: number };

  get editingIsMultiline(): boolean {
    return this.editingValue.includes('\n');
  }

  get editingLineCount(): number {
    return Math.max(1, this.editingValue.split(/\r?\n/).length);
  }

  private get referenceDrag(): { col: number; row: number; prefix: string; suffix: string; caret: number; input?: HTMLInputElement | HTMLTextAreaElement } | undefined { return this.editing.referenceDrag; }

  // Dragging autofill handle
  isFillDragging = false;
  fillSourceRange: SelectionRange | null = null;
  fillTargetRange: SelectionRange | null = null;

  // Resizing columns & rows
  resizingCol: { col: number; startX: number; startWidth: number } | null = null;
  resizingRow: { row: number; startY: number; startHeight: number } | null = null;

  // Dragging & Resizing embedded charts
  private selectedChartIdValue: string | null = null;
  get selectedChartId(): string | null { return this.selectedChartIdValue; }
  set selectedChartId(id: string | null) {
    this.selectedChartIdValue = id;
    if (!id && this.activeRibbonTab === 'Chart Design') this.activeRibbonTab = 'Home';
  }
  draggingChart: { id: string; startX: number; startY: number; origX: number; origY: number } | null = null;
  resizingChart: {
    id: string;
    handle?: 'se' | 'sw' | 'ne' | 'nw' | 's' | 'e' | 'w' | 'n';
    startX: number;
    startY: number;
    origX?: number;
    origY?: number;
    origW: number;
    origH: number;
  } | null = null;

  // Filters & in-cell validation dropdowns
  private pendingFiltersEnabled?: boolean;
  get filtersEnabled(): boolean {
    if (!this.loadedNoteId && this.pendingFiltersEnabled !== undefined) {
      return this.pendingFiltersEnabled;
    }
    return Boolean(this.activeSheet?.filtersEnabled);
  }
  set filtersEnabled(value: boolean) {
    if (!this.loadedNoteId) {
      this.pendingFiltersEnabled = value;
      return;
    }
    if (this.activeSheet) {
      this.activeSheet.filtersEnabled = value;
      this.renderRevision += 1;
      this.canvasGrid?.renderNow(true);
    }
  }
  columnFilters: ColumnFilters = {};
  openFilterCol: number | null = null;
  filterMenuState: { col: number; left: number; top: number; options: string[] } | null = null;
  validationMenuState: { col: number; row: number; left: number; top: number; width: number; options: string[] } | null = null;
  commentEditorState: { col: number; row: number; cellId: string; text: string; left: number; top: number } | null = null;
  hoveredCommentState: { cellId: string; author?: string; text: string; left: number; top: number } | null = null;
  hyperlinkEditorState: { col: number; row: number; cellId: string; url: string; label: string; error?: string; left: number; top: number } | null = null;
  pasteSpecialMenu: { left: number; top: number } | null = null;
  sheetTabMenu: { sheetId: string; x: number; y: number } | null = null;
  readonly sheetTabColorPalette = ['#10b981', '#0284c7', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Drawing ink strokes
  currentDraftStroke: InkStroke | null = null;

  // Modals state
  conditionalModalOpen = false;
  sparklineModalOpen = false;
  sortFilterModalOpen = false;
  chartModalOpen = false;
  chartModalTab: 'recommended' | 'all' = 'all';
  chartModalCat?: ChartCategory;
  chartSourceRange?: SelectionRange;
  chartEditingId: string | null = null;
  functionsDrawerOpen = false;
  findReplaceModalOpen = false;
  findReplaceFocusReplace = false;
  findReplaceMatches: FindMatch[] = [];
  findReplaceActiveIndex = 0;
  findReplaceStatus = '';
  dataValidationModalOpen = false;
  removeDuplicatesModalOpen = false;
  textToColumnsModalOpen = false;
  pivotModalOpen = false;

  get hasBlockingDataModal(): boolean {
    return (
      this.findReplaceModalOpen ||
      this.dataValidationModalOpen ||
      this.removeDuplicatesModalOpen ||
      this.textToColumnsModalOpen ||
      this.pivotModalOpen ||
      this.sparklineModalOpen ||
      this.conditionalModalOpen
    );
  }

  get hasActiveColumnFilters(): boolean {
    return Object.values(this.columnFilters || {}).some((s) => s && s.size > 0);
  }

  // Undo / Redo history

  private get saveTimeout(): ReturnType<typeof setTimeout> | null { return this.workbook.saveTimeout; }
  private get loadedNoteId(): string | null { return this.workbook.loadedNoteId; }
  private set loadedNoteId(value: string | null) { this.workbook.loadedNoteId = value; }
  private isDestroyed = false;

  private unregisterAi?: () => void;

  constructor() {
    effect(() => {
      this.notesService.documentZoom();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    });
  }

  ngOnInit(): void {
    this.loadedNoteId = this.note?._id || null;
    this.loadNoteData();
    if (this.pendingFiltersEnabled !== undefined && this.activeSheet) {
      this.activeSheet.filtersEnabled = this.pendingFiltersEnabled;
      this.pendingFiltersEnabled = undefined;
    }
    this.registerAiAdapter();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['note']) {
      const newId = this.note?._id;this.cellContextMenu=null;
      if (newId && newId !== this.loadedNoteId) {
        if (this.loadedNoteId && this.saveTimeout) {
          this.workbook.flushAutoSave(this.loadedNoteId);
        }
        this.loadedNoteId = newId;
        this.viewport.resetScrollState();
        this.loadNoteData();
        if (this.pendingFiltersEnabled !== undefined && this.activeSheet) {
          this.activeSheet.filtersEnabled = this.pendingFiltersEnabled;
          this.pendingFiltersEnabled = undefined;
        }
        this.registerAiAdapter();
        this.renderRevision += 1;
        this.canvasGrid?.renderNow(true);
        this.scheduleBackgroundRecalc();
      }
    }
  }

  ngOnDestroy(): void {
    this.workbook.flushAutoSave();
    this.isDestroyed = true;
    this.formulaRecalc.terminate();
    this.stopInkReplay();
    this.unregisterAi?.();
  }

  get calculationCache(): FormulaCalculationCache { return this.workbook.calculationCache; }
  get activeClipboardMatrix(): ClipboardMatrix | null { return this.clipboard.getInternalMatrix(); }
  get isDarkMode(): boolean { return this.themeService.isDark(); }
  getGridAxes(): { colAxis: GridAxis; rowAxis: GridAxis } { return this.viewport.getAxes(); }

  get activeCellEditorStyle(): { textAlign: string; fontWeight: string; fontStyle: string; fontSizePx: number; fontFamily: string } {
    const st = this.activeCellStyle;
    const z = this.currentZoom() || 1;
    const basePx = st.fontSize ? Math.round(st.fontSize * (4 / 3)) : 12;
    return {
      textAlign: st.align || 'left',
      fontWeight: st.bold ? '700' : '400',
      fontStyle: st.italic ? 'italic' : 'normal',
      fontSizePx: Math.max(8, Math.round(basePx * z)),
      fontFamily: st.fontFamily || 'Inter, system-ui, -apple-system, sans-serif',
    };
  }

  get activeCellEditorBox(): { left: number; top: number; width: number; height: number } {
    const { colAxis, rowAxis } = this.viewport.getAxes();
    const z = this.currentZoom() || 1;
    const headerW = this.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = this.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    const merged = this.mergedRegion(this.selectedCell.col, this.selectedCell.row);
    const col = merged ? merged.startCol : this.selectedCell.col;
    const row = merged ? merged.startRow : this.selectedCell.row;
    const endCol = merged ? merged.endCol : col;
    const endRow = merged ? merged.endRow : row;
    const freeze = this.activeSheet.freezePanes;
    const scrollEl = this.gridContainer?.nativeElement;
    const scrollLeft = col < (freeze?.cols ?? 0) ? (scrollEl?.scrollLeft || 0) : 0;
    const scrollTop = row < (freeze?.rows ?? 0) ? (scrollEl?.scrollTop || 0) : 0;
    return {
      left: Math.round((headerW + colAxis.offset(col)) * z + scrollLeft),
      top: Math.round((headerH + rowAxis.offset(row)) * z + scrollTop),
      width: Math.round((colAxis.offset(endCol + 1) - colAxis.offset(col)) * z),
      height: Math.round((rowAxis.offset(endRow + 1) - rowAxis.offset(row)) * z),
    };
  }

  private ensureWorkbookContext(): void { return this.workbook.ensureWorkbookContext(); }
  get formulaWorkbookRevision(): number { return this.workbook.formulaWorkbookRevision; }
  get editingOnActiveSheet(): boolean { return this.editing.editingOnActiveSheet; }
  get formulaOriginLabel(): string { return this.editing.formulaOriginLabel; }

  returnToFormulaOrigin(): void { return this.editing.returnToFormulaOrigin(); }

  get activeSheet(): Sheet {
    this.ensureWorkbookContext();
    const s = this.sheets.find((item) => item.id === this.activeSheetId);
    return s || this.sheets[0] || { id: 'sheet1', name: 'Sheet1', type: 'grid', data: {} };
  }

  get activeCellStyle(): CellStyle {
    const cellId = getCellId(this.selectedCell.col, this.selectedCell.row);
    return this.activeSheet.data[cellId]?.style || {};
  }

  get selectedChart(): EmbeddedChart | null {
    if (!this.selectedChartId) return null;
    return this.activeSheet.charts?.find((ch) => ch.id === this.selectedChartId) || null;
  }

  get canUndo(): boolean { return this.workbook.canUndo; }

  get canRedo(): boolean { return this.workbook.canRedo; }

  get activeCellIdDisplay(): string {
    return getCellId(this.selectedCell.col, this.selectedCell.row);
  }

  get activeCellRawFormula(): string {
    if (this.isEditing) return this.editingValue;
    const cellId = getCellId(this.selectedCell.col, this.selectedCell.row);
    return this.activeSheet.data[cellId]?.raw || '';
  }

  get activeEditorState(): SheetActiveEditorState | null {
    if (!this.isEditing || !this.editingOnActiveSheet) return null;
    const input = this.cellEditorInput?.nativeElement;
    const value = this.editingValue ?? '';
    const selectionStart = input?.selectionStart ?? value.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    return {
      col: this.selectedCell.col,
      row: this.selectedCell.row,
      value,
      selectionStart,
      selectionEnd,
      caretVisible: true,
      style: this.activeCellStyle,
    };
  }

  get normalizedRange(): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
    return {
      minCol: Math.min(this.selectionRange.startCol, this.selectionRange.endCol),
      maxCol: Math.max(this.selectionRange.startCol, this.selectionRange.endCol),
      minRow: Math.min(this.selectionRange.startRow, this.selectionRange.endRow),
      maxRow: Math.max(this.selectionRange.startRow, this.selectionRange.endRow),
    };
  }

  get selectionStats(): { average: string; count: number; numCount: number; min: string; max: string; sum: string } { return this.workbook.selectionStats; }

  // --- DATA LOADING & PERSISTENCE ---

  private loadNoteData(): void { return this.workbook.loadNoteData(); }

  private registerAiAdapter(): void {
    this.unregisterAi?.();
    this.unregisterAi = this.aiDocuments.register(
      sheetAiAdapter(
        () => this.note?._id,
        () => ({ sheets: this.sheets, activeSheetId: this.activeSheetId }),
        (snapshot) => {
          this.pushUndoSnapshot();
          if (snapshot.sheets) {
            this.sheets = snapshot.sheets;
          }
          if(snapshot.activeSheetId)this.activeSheetId=snapshot.activeSheetId;
          this.scheduleAutoSave();
        }
      )
    );
  }

  pushUndoSnapshot(): void { return this.workbook.pushUndoSnapshot(); }

  handleUndo(): void {
    this.workbook.handleUndo();
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  handleRedo(): void {
    this.workbook.handleRedo();
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  scheduleAutoSave(): void {
    this.renderRevision += 1;
    return this.workbook.scheduleAutoSave();
  }

  flushAutoSave(): void { return this.workbook.flushAutoSave(); }

  saveCurrentDocument(): void {
    this.flushAutoSave();
    this.notesService.saveCurrentNote();
  }

  beginDragChart(ch: EmbeddedChart, event: MouseEvent): void {
    event.stopPropagation();
    this.pushUndoSnapshot();
    this.selectedChartId = ch.id;
    this.selectedArtworkId = null;
    this.inkLayer?.clearSelection();
    this.draggingChart = {
      id: ch.id,
      startX: event.clientX,
      startY: event.clientY,
      origX: ch.x ?? 100,
      origY: ch.y ?? 80,
    };
  }

  beginResizeChart(ch: EmbeddedChart, handle: 'se' | 'sw' | 'ne' | 'nw' | 's' | 'e' | 'w' | 'n', event: MouseEvent): void {
    event.stopPropagation();
    this.pushUndoSnapshot();
    this.resizingChart = {
      id: ch.id,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origX: ch.x ?? 100,
      origY: ch.y ?? 80,
      origW: ch.width ?? 480,
      origH: ch.height ?? 300,
    };
  }

  beginResizeCol(col: number, event: MouseEvent): void {
    event.stopPropagation();
    this.pushUndoSnapshot();
    this.resizingCol = { col, startX: event.clientX, startWidth: this.getColWidth(col) };
  }

  beginResizeRow(row: number, event: MouseEvent): void {
    event.stopPropagation();
    this.pushUndoSnapshot();
    this.resizingRow = { row, startY: event.clientY, startHeight: this.getRowHeight(row) };
  }

  autoFitColumn(col: number): void {
    const width =
      this.canvasGrid?.measureAutoFitColumnWidth(col) ??
      44;
    if (this.activeSheet.colWidths?.[col] === width) return;
    this.pushUndoSnapshot();
    this.activeSheet.colWidths = { ...(this.activeSheet.colWidths || {}), [col]: width };
    this.scheduleAutoSave();
    this.canvasGrid?.scheduleRender();
  }

  autoFitRow(row: number): void {
    const height =
      this.canvasGrid?.measureAutoFitRowHeight(row) ??
      24;
    if (this.activeSheet.rowHeights?.[row] === height) return;
    this.pushUndoSnapshot();
    this.activeSheet.rowHeights = { ...(this.activeSheet.rowHeights || {}), [row]: height };
    this.scheduleAutoSave();
    this.canvasGrid?.scheduleRender();
  }

  updateCurrentGrid(mutator: (grid: SheetGrid) => SheetGrid): void { return this.workbook.updateCurrentGrid(mutator); }

  // --- SHEET TABS MANAGEMENT ---

  toggleSheetList(event?: MouseEvent): void {
    event?.stopPropagation();
    this.sheetListOpen = !this.sheetListOpen;
  }

  selectSheetFromList(id: string): void {
    this.sheetListOpen = false;
    this.switchSheet(id);
  }

  onSheetTabsWheel(event: WheelEvent): void {
    const container = this.sheetTabsScroll?.nativeElement;
    if (!container) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta !== 0) {
      event.preventDefault();
      container.scrollLeft += delta;
    }
  }

  private scrollActiveSheetTabIntoView(sheetId: string): void {
    setTimeout(() => {
      const container = this.sheetTabsScroll?.nativeElement;
      if (!container) return;
      const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(sheetId) : sheetId;
      const tab = container.querySelector(`[data-sheet-id="${escapedId}"]`) as HTMLElement | null;
      if (tab && typeof tab.scrollIntoView === 'function') {
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }, 0);
  }

  switchSheet(id: string): void {
    this.cellContextMenu = null;
    this.sheetListOpen = false;
    this.sheetTabMenu = null;
    this.pasteSpecialMenu = null;
    this.commentEditorState = null;
    this.hoveredCommentState = null;
    this.hyperlinkEditorState = null;
    this.editing.switchSheet(id);
    this.scrollActiveSheetTabIntoView(id);
  }

  addNewSheet(): void {
    this.sheetListOpen = false;
    this.workbook.addNewSheet();
    this.scrollActiveSheetTabIntoView(this.activeSheetId);
  }

  addNewChartSheet(): void {
    this.sheetListOpen = false;
    this.workbook.addNewChartSheet();
    this.scrollActiveSheetTabIntoView(this.activeSheetId);
  }

  onSheetNameKeyDown(event: KeyboardEvent, sheet: Sheet): void { return this.workbook.onSheetNameKeyDown(event, sheet); }
  finishSheetRename(sheet: Sheet, event: FocusEvent): void { return this.workbook.finishSheetRename(sheet, event); }

  renameSheet(sheet: Sheet, newName: string): void { return this.workbook.renameSheet(sheet, newName); }

  deleteSheet(sheetId: string): void {
    this.closeSheetTabMenu();
    this.workbook.deleteSheet(sheetId);
  }

  duplicateSheet(sheetId: string): void {
    this.closeSheetTabMenu();
    this.workbook.duplicateSheet(sheetId);
    this.scrollActiveSheetTabIntoView(this.activeSheetId);
  }

  moveSheet(sheetId: string, direction: -1 | 1): void {
    this.workbook.moveSheet(sheetId, direction);
    this.scrollActiveSheetTabIntoView(sheetId);
  }

  setSheetTabColor(sheetId: string, color?: string): void {
    this.workbook.setSheetTabColor(sheetId, color);
  }

  get sheetTabMenuSheet(): Sheet | undefined {
    return this.sheetTabMenu ? this.sheets.find((s) => s.id === this.sheetTabMenu!.sheetId) : undefined;
  }

  get sheetTabMenuIndex(): number {
    return this.sheetTabMenu ? this.sheets.findIndex((s) => s.id === this.sheetTabMenu!.sheetId) : -1;
  }

  openSheetTabMenu(sheet: Sheet, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.sheetListOpen = false;
    const x = Math.max(8, Math.min(event.clientX || 16, window.innerWidth - 220));
    const y = Math.max(8, Math.min((event.clientY || window.innerHeight - 60) - 210, window.innerHeight - 220));
    this.sheetTabMenu = { sheetId: sheet.id, x, y };
    this.viewChanges?.markForCheck();
  }

  closeSheetTabMenu(): void {
    if (!this.sheetTabMenu) return;
    this.sheetTabMenu = null;
    this.viewChanges?.markForCheck();
  }

  loadSampleBusinessData(): void { return this.workbook.loadSampleBusinessData(); }

  // --- GRID MEASUREMENTS & CELLS ---

  getColWidth(col: number): number { return this.viewport.getColWidth(col); }

  getRowHeight(row: number): number { return this.viewport.getRowHeight(row); }

  getCell(col: number, row: number): CellData | undefined {
    return this.activeSheet.data[getCellId(col, row)];
  }

  shapesPickerOpen = false;
  iconsPickerOpen = false;
  selectedArtworkId: string | null = null;

  insertArtwork(kind: 'shape' | 'icon', itemId: string): void { return this.artwork.insertArtwork(kind, itemId); }

  beginArtworkChange(): void { return this.artwork.beginArtworkChange(); }
  updateArtwork(item: FloatingArtwork, geometry: Pick<FloatingArtwork, 'x' | 'y' | 'width' | 'height'>): void { return this.artwork.updateArtwork(item, geometry); }
  finishArtworkChange(): void { return this.artwork.finishArtworkChange(); }
  removeArtwork(id: string): void { return this.artwork.removeArtwork(id); }

  showFormulasInCells = false;

  referenceTrace: SheetReferenceTrace | null = null;
  traceFormulaReferences(direction: 'precedents' | 'dependents' = 'precedents'): void { return this.editing.traceFormulaReferences(direction); }

  navigateToReference(target: SheetReferenceTarget): void { return this.editing.navigateToReference(target); }
  returnFromTrace(): void { return this.editing.returnFromTrace(); }

  isTracedCell(col: number, row: number): boolean { return this.editing.isTracedCell(col, row); }

  handleFormulaEditing(edit: boolean): void {
    if (edit) this.startCellEdit();
    else this.isEditing = false;
  }

  recalculateSheet(): void {
    this.updateCurrentGrid(grid => ({ ...grid }));
  }

  scheduleBackgroundRecalc(): void {
    if (this.isDestroyed || !hasWorkbookFormulas(this.sheets)) return;
    const revision = this.formulaWorkbookRevision;
    this.formulaRecalc.schedule(revision, this.sheets, (result) => this.applyBackgroundRecalc(result));
  }

  private applyBackgroundRecalc(result: FormulaRecalcResult): void {
    if (this.isDestroyed || result.revision !== this.formulaWorkbookRevision) return;
    let updated = false;
    for (const sheet of this.sheets) {
      const entries = result.computedBySheet[sheet.id];
      if (!entries?.length) continue;
      let cache = this.calculationCache.get(sheet.data);
      if (!cache) {
        cache = new Map();
        this.calculationCache.set(sheet.data, cache);
      }
      for (const [cellId, val] of entries) {
        cache.set(cellId, val);
        const cell = sheet.data[cellId];
        if (cell && cell.computed !== val) {
          cell.computed = val;
          updated = true;
        }
      }
    }
    if (updated) {
      this.canvasGrid?.scheduleRender();
    }
  }

  getCellValue(col: number, row: number): string | number {
    const id = getCellId(col, row);
    const grid = this.activeSheet.data;
    return evaluateCellValueCached(id, grid, this.calculationCache);
  }

  formatCellDisplay(val: string | number, style?: CellStyle): string { return this.formatting.formatCellDisplay(val, style); }

  isCellInSelection(col: number, row: number): boolean { return this.interaction.isCellInSelection(col, row); }

  isCellActive(col: number, row: number): boolean { return this.interaction.isCellActive(col, row); }

  isTopSelectionEdge(col: number, row: number): boolean { return this.interaction.isTopSelectionEdge(col, row); }

  isBottomSelectionEdge(col: number, row: number): boolean { return this.interaction.isBottomSelectionEdge(col, row); }

  isLeftSelectionEdge(col: number, row: number): boolean { return this.interaction.isLeftSelectionEdge(col, row); }

  isRightSelectionEdge(col: number, row: number): boolean { return this.interaction.isRightSelectionEdge(col, row); }

  isBottomRightSelectionCorner(col: number, row: number): boolean { return this.interaction.isBottomRightSelectionCorner(col, row); }

  // --- SELECTION & NAVIGATION ---

  onCellMouseDown(col: number, row: number, event: MouseEvent): void { return this.interaction.onCellMouseDown(col, row, event); }

  onCellMouseEnter(col: number, row: number): void { return this.interaction.onCellMouseEnter(col, row); }

  onCellDoubleClick(col: number, row: number): void { return this.interaction.onCellDoubleClick(col, row); }

  selectEntireColumn(col: number, event: MouseEvent): void { return this.interaction.selectEntireColumn(col, event); }

  selectEntireRow(row: number, event: MouseEvent): void { return this.interaction.selectEntireRow(row, event); }

  selectAllCells(): void { return this.interaction.selectAllCells(); }

  // --- CELL EDITING ---

  private handleFormulaArrow(event: KeyboardEvent): boolean { return this.editing.handleFormulaArrow(event); }

  private beginFormulaReference(col: number, row: number, event: MouseEvent): boolean { return this.editing.beginFormulaReference(col, row, event); }

  private updateFormulaReference(col: number, row: number): void { return this.editing.updateFormulaReference(col, row); }

  private finishFormulaReference(): void { return this.editing.finishFormulaReference(); }

  startCellEdit(initialChar?: string): void { return this.editing.startCellEdit(initialChar); }

  commitCellEdit(): void { return this.editing.commitCellEdit(); }

  cancelCellEdit(): void { return this.editing.cancelCellEdit(); }

  onFormulaBarChange(val: string): void { return this.editing.onFormulaBarChange(val); }

  onFormulaBarKeyDown(event: KeyboardEvent): void { return this.editing.onFormulaBarKeyDown(event); }

  // --- KEYBOARD SHORTCUTS & NAVIGATION ---

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeyDown(event: KeyboardEvent): void { return this.interaction.handleGlobalKeyDown(event); }

  @HostListener('window:mouseup')
  handleGlobalMouseUp(): void { return this.interaction.handleGlobalMouseUp(); }

  @HostListener('window:mousemove', ['$event'])
  handleGlobalMouseMove(event: MouseEvent): void { return this.interaction.handleGlobalMouseMove(event); }

  moveSelection(dCol: number, dRow: number, expand = false): void { return this.interaction.moveSelection(dCol, dRow, expand); }

  // --- SMART AUTOFILL DRAG ---

  startFillDrag(event: MouseEvent): void { return this.data.startFillDrag(event); }

  private executeSmartFill(): void { return this.data.executeSmartFill(); }

  // --- STYLING & FORMATTING ---

  applyStyleChange(patch: Partial<CellStyle>): void { return this.formatting.applyStyleChange(patch); }

  getEffectiveCellBorders(col: number, row: number): CellBorders | undefined { return this.formatting.getEffectiveCellBorders(col, row); }

  shouldSkipBorder(col: number, row: number, edge: 'top' | 'left'): boolean { return this.formatting.shouldSkipBorder(col, row, edge); }

  applyCustomBorders(borders: CellBorders): void { return this.formatting.applyCustomBorders(borders); }

  getCellBorder(col: number, row: number, edge: 'top' | 'bottom' | 'left' | 'right'): string { return this.formatting.getCellBorder(col, row, edge); }

  applyBorderPreset(event: { preset: BorderPreset; lineStyle: BorderLineStyle; color: string }): void { return this.formatting.applyBorderPreset(event); }

  mergedRegion(col: number, row: number): MergeRegion | undefined { return this.formatting.mergedRegion(col, row); }
  private expandMergedSelection(range: SelectionRange): SelectionRange { return this.formatting.expandMergedSelection(range); }
  get selectionIsMerged(): boolean { return this.formatting.selectionIsMerged; }

  toggleMerge(): void { return this.formatting.toggleMerge(); }

  handleFillDown(): void { return this.data.handleFillDown(); }

  handleFillRight(): void { return this.data.handleFillRight(); }

  handleCycleF4(): void { return this.data.handleCycleF4(); }

  handleCopy(): Promise<void> { return this.data.handleCopy(); }

  handleCut(): Promise<void> { return this.data.handleCut(); }

  @HostListener('window:paste', ['$event'])
  onGridPaste(event: ClipboardEvent): void { return this.data.onGridPaste(event); }

  applyPastedCells(matrix: CellData[][], merges?: MergeRegion[]): void { return this.data.applyPastedCells(matrix, merges); }

  handlePaste(): Promise<void> { return this.data.handlePaste(); }

  togglePasteSpecialMenu(): void {
    if (this.pasteSpecialMenu) {
      this.closePasteSpecialMenu();
      return;
    }
    if (this.activeSheet.type !== 'grid') return;
    const { left, top } = this.getCellPopoverOrigin(this.selectedCell.col, this.selectedCell.row);
    this.pasteSpecialMenu = { left, top };
    this.viewChanges?.markForCheck();
  }

  closePasteSpecialMenu(): void {
    if (!this.pasteSpecialMenu) return;
    this.pasteSpecialMenu = null;
    this.viewChanges?.markForCheck();
  }

  applyPasteSpecial(mode: PasteSpecialMode): Promise<void> {
    this.pasteSpecialMenu = null;
    this.viewChanges?.markForCheck();
    return this.data.applyPasteSpecial(mode);
  }

  hideSelectedRows(): void {
    const { minRow, maxRow } = this.normalizedRange;
    const existing = new Set(this.activeSheet.hiddenRows || []);
    for (let r = minRow; r <= maxRow; r++) existing.add(r);
    if (existing.size >= this.totalRows) return;
    this.pushUndoSnapshot();
    this.activeSheet.hiddenRows = Array.from(existing).sort((a, b) => a - b);
    if (existing.has(this.selectedCell.row)) {
      let next = maxRow + 1;
      while (next < this.totalRows && existing.has(next)) next += 1;
      if (next >= this.totalRows) {
        next = minRow - 1;
        while (next >= 0 && existing.has(next)) next -= 1;
      }
      if (next >= 0 && next < this.totalRows) {
        this.selectedCell = { col: this.selectedCell.col, row: next };
        this.selectionRange = { startCol: this.selectedCell.col, endCol: this.selectedCell.col, startRow: next, endRow: next };
      }
    }
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  unhideRows(): void {
    if (!this.activeSheet.hiddenRows?.length) return;
    this.pushUndoSnapshot();
    this.activeSheet.hiddenRows = undefined;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  hideSelectedCols(): void {
    const { minCol, maxCol } = this.normalizedRange;
    const existing = new Set(this.activeSheet.hiddenCols || []);
    for (let c = minCol; c <= maxCol; c++) existing.add(c);
    if (existing.size >= this.totalCols) return;
    this.pushUndoSnapshot();
    this.activeSheet.hiddenCols = Array.from(existing).sort((a, b) => a - b);
    if (existing.has(this.selectedCell.col)) {
      let next = maxCol + 1;
      while (next < this.totalCols && existing.has(next)) next += 1;
      if (next >= this.totalCols) {
        next = minCol - 1;
        while (next >= 0 && existing.has(next)) next -= 1;
      }
      if (next >= 0 && next < this.totalCols) {
        this.selectedCell = { col: next, row: this.selectedCell.row };
        this.selectionRange = { startCol: next, endCol: next, startRow: this.selectedCell.row, endRow: this.selectedCell.row };
      }
    }
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  unhideCols(): void {
    if (!this.activeSheet.hiddenCols?.length) return;
    this.pushUndoSnapshot();
    this.activeSheet.hiddenCols = undefined;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  // --- PROTECTION & OUTLINE GROUPS ---

  get activeCellLocked(): boolean {
    const cell = this.activeSheet.data?.[getCellId(this.selectedCell.col, this.selectedCell.row)];
    return cell?.style?.locked !== false;
  }

  isCellLocked(col: number, row: number): boolean {
    const sheet = this.activeSheet;
    if (!sheet.protected) return false;
    const cell = sheet.data?.[getCellId(col, row)];
    return cell?.style?.locked !== false;
  }

  guardEditableCell(col: number, row: number): boolean {
    if (!this.isCellLocked(col, row)) return true;
    this.editorNotice =
      this.i18n.currentLang() === 'es'
        ? 'La hoja está protegida: desbloquea la celda o quita la protección.'
        : 'Sheet is protected: unlock the cell or unprotect the sheet.';
    this.viewChanges?.markForCheck();
    return false;
  }

  guardEditableRange(minCol: number, maxCol: number, minRow: number, maxRow: number): boolean {
    const sheet = this.activeSheet;
    if (!sheet.protected) return true;
    const grid = sheet.data || {};
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (grid[getCellId(c, r)]?.style?.locked !== false) {
          return this.guardEditableCell(c, r);
        }
      }
    }
    return true;
  }

  toggleSheetProtection(): void {
    this.pushUndoSnapshot();
    this.activeSheet.protected = !this.activeSheet.protected;
    this.editorNotice = '';
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  toggleSelectionLocked(): void {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    if (!this.guardEditableRange(minCol, maxCol, minRow, maxRow)) return;
    const lockNext = !this.activeCellLocked;
    this.pushUndoSnapshot();
    this.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cur = next[id] || { raw: '' };
          const style: CellStyle = { ...(cur.style || {}) };
          if (lockNext) {
            delete style.locked;
          } else {
            style.locked = false;
          }
          next[id] = {
            ...cur,
            style: Object.keys(style).length ? style : undefined,
          };
        }
      }
      return next;
    });
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  groupSelection(axis: 'row' | 'col'): void {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    const start = axis === 'col' ? minCol : minRow;
    const end = axis === 'col' ? maxCol : maxRow;
    const key = axis === 'col' ? 'colGroups' : 'rowGroups';
    const existing = this.activeSheet[key] ? [...this.activeSheet[key]!] : [];
    if (existing.some((g) => g.start === start && g.end === end)) return;
    this.pushUndoSnapshot();
    existing.push({ start, end, collapsed: false });
    existing.sort((a, b) => a.start - b.start || a.end - b.end);
    this.activeSheet[key] = existing;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  ungroupSelection(axis: 'row' | 'col'): void {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    const selStart = axis === 'col' ? minCol : minRow;
    const selEnd = axis === 'col' ? maxCol : maxRow;
    const key = axis === 'col' ? 'colGroups' : 'rowGroups';
    const existing = this.activeSheet[key] || [];
    if (!existing.length) return;
    const removed = existing.filter((g) => g.end >= selStart && g.start <= selEnd);
    if (!removed.length) return;
    const remaining = existing.filter((g) => g.end < selStart || g.start > selEnd);
    this.pushUndoSnapshot();
    this.activeSheet[key] = remaining.length ? remaining : undefined;
    for (const g of removed) {
      if (g.collapsed) {
        this.applyOutlineHiddenState(axis, g.start, g.end, false, remaining);
      }
    }
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  toggleOutlineGroup(axis: 'row' | 'col', groupIndex: number): void {
    const key = axis === 'col' ? 'colGroups' : 'rowGroups';
    const groups = this.activeSheet[key];
    if (!groups || !groups[groupIndex]) return;
    this.pushUndoSnapshot();
    const nextGroups = groups.map((g, idx) =>
      idx === groupIndex ? { ...g, collapsed: !g.collapsed } : g
    );
    const toggled = nextGroups[groupIndex];
    this.activeSheet[key] = nextGroups;
    this.applyOutlineHiddenState(axis, toggled.start, toggled.end, Boolean(toggled.collapsed), nextGroups);
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  private applyOutlineHiddenState(
    axis: 'row' | 'col',
    start: number,
    end: number,
    collapsed: boolean,
    groups: OutlineGroup[]
  ): void {
    const hiddenKey = axis === 'col' ? 'hiddenCols' : 'hiddenRows';
    const hidden = new Set(this.activeSheet[hiddenKey] || []);
    const limit = axis === 'col' ? this.totalCols : this.totalRows;
    if (collapsed) {
      for (let i = start; i <= end; i++) hidden.add(i);
      if (hidden.size >= limit) return;
      const activeIdx = axis === 'col' ? this.selectedCell.col : this.selectedCell.row;
      if (hidden.has(activeIdx)) {
        let next = end + 1;
        while (next < limit && hidden.has(next)) next += 1;
        if (next >= limit) {
          next = start - 1;
          while (next >= 0 && hidden.has(next)) next -= 1;
        }
        if (next >= 0 && next < limit) {
          this.selectedCell =
            axis === 'col' ? { col: next, row: this.selectedCell.row } : { col: this.selectedCell.col, row: next };
          this.selectionRange = {
            startCol: this.selectedCell.col,
            endCol: this.selectedCell.col,
            startRow: this.selectedCell.row,
            endRow: this.selectedCell.row,
          };
        }
      }
    } else {
      for (let i = start; i <= end; i++) {
        const coveredByAnotherCollapsed = groups.some((g) => g.collapsed && i >= g.start && i <= g.end);
        if (!coveredByAnotherCollapsed) hidden.delete(i);
      }
    }
    this.activeSheet[hiddenKey] = hidden.size ? Array.from(hidden).sort((a, b) => a - b) : undefined;
  }

  handleClearContent(): void { return this.data.handleClearContent(); }

  handleAutoSum(func = 'SUMA'): void { return this.data.handleAutoSum(func); }

  // --- SORTING ---

  handleSortAsc(): void { return this.data.handleSortAsc(); }

  handleSortDesc(): void { return this.data.handleSortDesc(); }

  // --- CHARTS ---

  getChartRangeString(range?: SelectionRange): string { return this.charts.getChartRangeString(range); }

  openSelectedChartType(): void { return this.charts.openSelectedChartType(); }

  openChangeChartType(ch: EmbeddedChart, event: MouseEvent): void { return this.charts.openChangeChartType(ch, event); }

  handleInsertCheckbox(): void { return this.data.handleInsertCheckbox(); }

  insertChartFromSelection(event: { category: ChartCategory; subType: ChartSubType }): void { return this.charts.insertChartFromSelection(event); }

  onChartModalSelect(event: { category: ChartCategory; subType: ChartSubType }): void { return this.charts.onChartModalSelect(event); }

  deleteSelectedChart(): void { return this.charts.deleteSelectedChart(); }

  selectChartOnly(id: string): void {
    this.selectedChartId = id;
    this.selectedArtworkId = null;
  }

  selectArtworkOnly(id: string): void {
    this.selectedArtworkId = id;
    this.selectedChartId = null;
  }

  clearInkSelection(): void {
    this.inkLayer?.clearSelection();
  }

  deleteChartById(id: string): void {
    this.selectedChartId = id;
    this.deleteSelectedChart();
  }

  openChartDataModal(ch: EmbeddedChart): void {
    this.configureChartData(ch, 'data');
  }

  handleFloatingObjectMouseDown(worldX: number, worldY: number, event: MouseEvent): boolean {
    if (this.objectsLayer?.handleWorldMouseDown(worldX, worldY, event)) {
      return true;
    }
    if (this.inkLayer?.trySelectStrokeAtWorld(worldX, worldY, event as unknown as PointerEvent)) {
      this.selectedChartId = null;
      this.selectedArtworkId = null;
      return true;
    }
    return false;
  }

  handleFloatingObjectMouseMove(worldX: number, worldY: number): { handled: boolean; cursor?: string } {
    return this.objectsLayer?.handleWorldMouseMove(worldX, worldY) ?? { handled: false };
  }

  handleFloatingObjectDoubleClick(worldX: number, worldY: number): boolean {
    return this.objectsLayer?.handleWorldDoubleClick(worldX, worldY) ?? false;
  }

  clearFloatingObjectHover(): void {
    this.objectsLayer?.clearHover();
  }

  chartDataModalOpen = false;
  chartDataModalTab: 'data' | 'appearance' = 'data';
  configureChartData(chart = this.selectedChart, tab: 'data' | 'appearance' = 'data'): void { return this.charts.configureChartData(chart, tab); }
  applyChartData(event: { range: SelectionRange; config: ChartDataConfig; appearance?: ChartAppearance; chartTitle?: string; subType?: ChartSubType; dataEdited?: boolean; seriesColors?: Record<string, string> }): void { return this.charts.applyChartData(event); }

  getChartTypeLabel(chart: EmbeddedChart): string { return this.charts.getChartTypeLabel(chart); }

  changeChartTitle(title: string): void { return this.charts.changeChartTitle(title); }

  getSourceHighlight(col: number, row: number): Record<string, string> | null { return this.charts.getSourceHighlight(col, row); }

  useSelectedChartRange(): void { return this.charts.useSelectedChartRange(); }

  changeSelectedChartPalette(palette: 'excel' | 'monochrome' | 'warm' | 'cool'): void { return this.charts.changeSelectedChartPalette(palette); }

  // --- ZOOM ---

  onGridWheel(event: WheelEvent): void { return this.interaction.onGridWheel(event); }

  zoomIn(): void { return this.interaction.zoomIn(); }

  zoomOut(): void { return this.interaction.zoomOut(); }

  resetZoom(): void { return this.interaction.resetZoom(); }

  // --- TITLE EDITING ---

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text && text !== this.note.title) {
      this.note = { ...this.note, title: text };
      this.notesService.updateMeta({ title: text });
    }
  }

  onTitleEnter(event: Event): void {
    (event.target as HTMLElement).blur();
  }

  // --- WEAVE INTEGRATION & GLOBAL ACTIONS ---

  toggleSidebar(): void {
    this.notesService.toggleSidebar();
  }

  toggleAi(): void {
    this.aiService.toggleSidebar();
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  copyDocumentLink(): void {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/?document=${this.note._id}`;
    navigator.clipboard?.writeText(url).then(() => {
      this.copiedLinkNotice = true;
      setTimeout(() => (this.copiedLinkNotice = false), 2500);
    });
  }

  xlsxBusy = false;
  xlsxNotice = '';
  xlsxFailed = false;

  importXlsxFile(event: Event): Promise<void> { return this.workbook.importXlsxFile(event); }

  exportXlsxFile(): Promise<void> { return this.workbook.exportXlsxFile(); }

  exportCsv(): void { return this.workbook.exportCsv(); }

  // --- RIBBON ACTION ROUTING ---

  handleUpdatePageLayout(layout: Partial<PageLayoutConfig>): void { return this.workbook.handleUpdatePageLayout(layout); }

  handleChangeZoom(newPercent: number): void { return this.interaction.handleChangeZoom(newPercent); }

  handleSetPrintAreaFromSelection(): void { return this.workbook.handleSetPrintAreaFromSelection(); }

  handleClearPrintArea(): void { return this.workbook.handleClearPrintArea(); }

  handleBringChartForward(): void { return this.charts.handleBringChartForward(); }

  handleSendChartBackward(): void { return this.charts.handleSendChartBackward(); }

  handleSetFreezePanes(cfg: { rows: number; cols: number }): void { return this.workbook.handleSetFreezePanes(cfg); }

  handleUnfreezePanes(): void { return this.workbook.handleUnfreezePanes(); }

  handleToggleInkToShape(): void { return this.artwork.handleToggleInkToShape(); }

  handleReplayInk(): void { return this.artwork.handleReplayInk(); }

  handleDeleteStroke(strokeId: string): void { return this.artwork.handleDeleteStroke(strokeId); }

  handleClearDrawings(): void { return this.artwork.handleClearDrawings(); }

  toggleCheckboxCell(col: number, row: number): void {
    if (this.data.toggleCheckboxCells([{ col, row }])) {
      this.canvasGrid?.renderNow(true);
    }
  }

  toggleSelectedCheckboxes(): boolean {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    const coords: { col: number; row: number }[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        coords.push({ col: c, row: r });
      }
    }
    const changed = this.data.toggleCheckboxCells(coords);
    if (changed) {
      this.canvasGrid?.renderNow(true);
    }
    return changed;
  }

  handleFormatPainter(): void {
    const cloned = cloneCellStyle(this.activeCellStyle);
    this.copiedFormat = cloned ?? {};
    this.canvasGrid?.renderNow(true);
  }

  applyFormatPainter(): void {
    if (!this.copiedFormat) return;
    const styleCopy = cloneCellStyle(this.copiedFormat) || {};
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    if (!this.guardEditableRange(minCol, maxCol, minRow, maxRow)) return;
    this.pushUndoSnapshot();
    this.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          const cur = next[id] || { raw: '' };
          next[id] = { ...cur, style: cloneCellStyle(styleCopy) };
        }
      }
      return next;
    });
    this.copiedFormat = null;
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  clearCopiedFormat(): void {
    if (!this.copiedFormat) return;
    this.copiedFormat = null;
    this.canvasGrid?.renderNow(true);
  }

  toggleGridlines(): void {
    this.showGridlines = !this.showGridlines;
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  toggleHeadings(): void {
    this.showHeadings = !this.showHeadings;
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  toggleShowFormulas(): void {
    this.showFormulasInCells = !this.showFormulasInCells;
    this.renderRevision += 1;
    this.canvasGrid?.renderNow(true);
  }

  toggleColumnFilterMenu(col: number, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.filterMenuState?.col === col) {
      this.closeColumnFilterMenu();
      return;
    }
    const vals = new Set<string>();
    const grid = this.activeSheet.data || {};
    for (const [id, cell] of Object.entries(grid)) {
      const parsed = parseCellId(id);
      if (!parsed || parsed.col !== col || parsed.row === 0) continue;
      if (!cell || String(cell.raw ?? '').trim() === '') continue;
      const evaluated = evaluateCellValueCached(id, grid, this.calculationCache);
      const label = String(evaluated ?? '').trim();
      if (label !== '') vals.add(label);
    }
    const options = Array.from(vals).sort((a, b) => a.localeCompare(b));
    const { colAxis, rowAxis } = this.getGridAxes();
    const headerW = this.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = this.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    const z = this.currentZoom() || 1;
    const left = Math.max(8, Math.round((headerW + colAxis.offset(col)) * z));
    const top = Math.round((headerH + rowAxis.offset(1)) * z);
    this.openFilterCol = col;
    this.filterMenuState = { col, left, top, options };
  }

  closeColumnFilterMenu(): void {
    this.openFilterCol = null;
    this.filterMenuState = null;
  }

  isFilterValueChecked(col: number, val: string): boolean {
    const activeSet = this.columnFilters[col];
    return !activeSet || activeSet.size === 0 ? true : activeSet.has(val);
  }

  toggleFilterOption(col: number, val: string): void {
    const allOptions = this.filterMenuState?.col === col ? this.filterMenuState.options : [];
    const current = this.columnFilters[col];
    const nextSet = new Set<string>(current && current.size > 0 ? current : allOptions);
    if (nextSet.has(val)) {
      nextSet.delete(val);
    } else {
      nextSet.add(val);
    }
    const nextFilters: ColumnFilters = { ...this.columnFilters };
    if (nextSet.size === 0 || (allOptions.length > 0 && nextSet.size >= allOptions.length)) {
      delete nextFilters[col];
    } else {
      nextFilters[col] = nextSet;
    }
    this.columnFilters = nextFilters;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
  }

  clearColumnFilter(col: number): void {
    if (!this.columnFilters[col]) {
      this.closeColumnFilterMenu();
      return;
    }
    const nextFilters: ColumnFilters = { ...this.columnFilters };
    delete nextFilters[col];
    this.columnFilters = nextFilters;
    this.scheduleAutoSave();
    this.closeColumnFilterMenu();
    this.canvasGrid?.renderNow(true);
  }

  clearAllColumnFilters(): void {
    this.columnFilters = {};
    this.closeColumnFilterMenu();
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
  }

  // --- STAGE 1 DATA & QUERY TOOLS ---

  get activeValidationRule(): CellValidationRule | undefined {
    const id = getCellId(this.selectedCell.col, this.selectedCell.row);
    return this.activeSheet.validations?.[id];
  }

  get removeDuplicateColumns(): { col: number; label: string }[] {
    return extractPivotHeaders(
      this.activeSheet.data,
      this.selectionRange,
      this.sheets,
      this.activeSheet,
      this.calculationCache
    );
  }

  openFindReplaceModal(focusReplace = false): void {
    this.commitCellEdit();
    this.findReplaceFocusReplace = focusReplace;
    this.findReplaceStatus = '';
    this.findReplaceMatches = [];
    this.findReplaceActiveIndex = 0;
    this.findReplaceModalOpen = true;
    this.viewChanges?.markForCheck();
  }

  updateFindSearch(options: FindReplaceOptions): void {
    this.findReplaceStatus = '';
    this.findReplaceMatches = findWorkbookMatches(this.sheets, this.activeSheetId, options, this.calculationCache);
    this.findReplaceActiveIndex = 0;
  }

  private focusMatch(match: FindMatch): void {
    if (match.sheetId !== this.activeSheetId) {
      this.switchSheet(match.sheetId);
    }
    this.selectedCell = { col: match.col, row: match.row };
    this.selectionRange = { startCol: match.col, startRow: match.row, endCol: match.col, endRow: match.row };
    this.revealCell(match.col, match.row);
    this.canvasGrid?.renderNow(true);
  }

  stepFindMatch(options: FindReplaceOptions, step: 1 | -1): void {
    this.findReplaceStatus = '';
    const matches = findWorkbookMatches(this.sheets, this.activeSheetId, options, this.calculationCache);
    this.findReplaceMatches = matches;
    if (!matches.length) {
      this.findReplaceActiveIndex = 0;
      return;
    }
    this.findReplaceActiveIndex = (this.findReplaceActiveIndex + step + matches.length) % matches.length;
    this.focusMatch(matches[this.findReplaceActiveIndex]);
  }

  replaceCurrentFindMatch(options: FindReplaceOptions): void {
    if (!this.findReplaceMatches.length) {
      this.updateFindSearch(options);
    }
    const target = this.findReplaceMatches[this.findReplaceActiveIndex];
    if (!target) return;
    const sheet = this.sheets.find((s) => s.id === target.sheetId);
    const cell = sheet?.data?.[target.cellId];
    if (!sheet || !cell) return;

    this.pushUndoSnapshot();
    const nextRaw = computeReplacedCellRaw(String(cell.raw ?? ''), options);
    sheet.data = {
      ...sheet.data,
      [target.cellId]: { ...cell, raw: nextRaw },
    };
    this.ensureWorkbookContext();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);

    const remaining = findWorkbookMatches(this.sheets, this.activeSheetId, options, this.calculationCache);
    this.findReplaceMatches = remaining;
    if (remaining.length) {
      this.findReplaceActiveIndex = this.findReplaceActiveIndex % remaining.length;
      this.focusMatch(remaining[this.findReplaceActiveIndex]);
    } else {
      this.findReplaceActiveIndex = 0;
    }
    this.findReplaceStatus = this.i18n.currentLang() === 'es' ? '1 coincidencia reemplazada.' : '1 match replaced.';
  }

  replaceAllFindMatches(options: FindReplaceOptions): void {
    const { updatedGrids, replacedCount } = replaceAllWorkbookMatches(
      this.sheets,
      this.activeSheetId,
      options,
      this.calculationCache
    );
    if (!replacedCount) {
      this.findReplaceMatches = [];
      this.findReplaceActiveIndex = 0;
      this.findReplaceStatus = this.i18n.currentLang() === 'es' ? 'No se encontraron coincidencias.' : 'No matches found.';
      return;
    }

    this.pushUndoSnapshot();
    for (const [sheetId, nextGrid] of updatedGrids.entries()) {
      const sheet = this.sheets.find((s) => s.id === sheetId);
      if (sheet) sheet.data = nextGrid;
    }
    this.ensureWorkbookContext();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.findReplaceMatches = findWorkbookMatches(this.sheets, this.activeSheetId, options, this.calculationCache);
    this.findReplaceActiveIndex = 0;
    this.findReplaceStatus =
      this.i18n.currentLang() === 'es'
        ? `Se reemplazaron ${replacedCount} coincidencias.`
        : `Replaced ${replacedCount} matches.`;
  }

  applyDataValidationRule(rule: CellValidationRule | null): void {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    const area = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    if (area > 50000) {
      this.editorNotice =
        this.i18n.currentLang() === 'es'
          ? 'Selecciona un rango más pequeño (máx. 50,000 celdas) para aplicar validación.'
          : 'Select a smaller range (max 50,000 cells) for validation.';
      return;
    }
    this.pushUndoSnapshot();
    const nextValidations = { ...(this.activeSheet.validations || {}) };
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const id = getCellId(c, r);
        if (rule) nextValidations[id] = { ...rule };
        else delete nextValidations[id];
      }
    }
    this.activeSheet.validations = Object.keys(nextValidations).length ? nextValidations : undefined;
    this.closeValidationDropdown();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
  }

  toggleValidationDropdown(col: number, row: number, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.validationMenuState?.col === col && this.validationMenuState?.row === row) {
      this.closeValidationDropdown();
      return;
    }
    const id = getCellId(col, row);
    const rule = this.activeSheet.validations?.[id];
    if (!rule || rule.type !== 'list' || rule.showDropdown === false) {
      this.closeValidationDropdown();
      return;
    }
    const options = resolveValidationListOptions(rule, this.activeSheet, this.sheets, this.calculationCache);
    if (!options.length) {
      this.closeValidationDropdown();
      return;
    }
    this.selectedCell = { col, row };
    this.selectionRange = { startCol: col, startRow: row, endCol: col, endRow: row };
    const { colAxis, rowAxis } = this.getGridAxes();
    const headerW = this.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = this.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    const width = Math.max(140, Math.min(260, colAxis.offset(col + 1) - colAxis.offset(col)));
    const left = Math.max(8, headerW + colAxis.offset(col));
    const top = headerH + rowAxis.offset(row + 1);
    this.validationMenuState = { col, row, left, top, width, options };
    this.viewChanges?.markForCheck();
  }

  closeValidationDropdown(): void {
    this.validationMenuState = null;
    this.viewChanges?.markForCheck();
  }

  // --- STAGE 2: CONDITIONAL FORMATTING, CANVAS SPARKLINES & CELL COMMENTS ---

  addConditionalRule(rule: ConditionalRule): void {
    this.pushUndoSnapshot();
    this.activeSheet.conditionalRules = (this.activeSheet.conditionalRules || []).concat(rule);
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  removeConditionalRule(id: string): void {
    const current = this.activeSheet.conditionalRules || [];
    if (!current.some((rule) => rule.id === id)) return;
    this.pushUndoSnapshot();
    this.activeSheet.conditionalRules = current.filter((rule) => rule.id !== id);
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  clearConditionalRules(): void {
    if (!this.activeSheet.conditionalRules?.length) return;
    this.pushUndoSnapshot();
    this.activeSheet.conditionalRules = [];
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  get sparklineInitialTargetCell(): string {
    const { minCol, maxCol, minRow, maxRow } = this.normalizedRange;
    if (minCol === maxCol && minRow === maxRow) {
      return getCellId(minCol, minRow);
    }
    return getCellId(Math.min(this.totalCols - 1, maxCol + 1), minRow);
  }

  get sparklineExistingConfig(): SparklineConfig | undefined {
    return this.activeSheet.sparklines?.[this.sparklineInitialTargetCell];
  }

  openSparklineModal(): void {
    this.commitCellEdit();
    this.sparklineModalOpen = true;
    this.viewChanges?.markForCheck();
  }

  applySparkline(event: { targetCellId: string; config: SparklineConfig }): void {
    this.pushUndoSnapshot();
    this.activeSheet.sparklines = {
      ...(this.activeSheet.sparklines || {}),
      [event.targetCellId]: { ...event.config },
    };
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  removeSparkline(targetCellId: string): void {
    if (!this.activeSheet.sparklines?.[targetCellId]) return;
    this.pushUndoSnapshot();
    const next = { ...this.activeSheet.sparklines };
    delete next[targetCellId];
    this.activeSheet.sparklines = Object.keys(next).length ? next : undefined;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  private getCellPopoverOrigin(col: number, row: number): { left: number; top: number } {
    const { colAxis, rowAxis } = this.getGridAxes();
    const headerW = this.showHeadings ? SHEET_HEADER_COL_WIDTH : 0;
    const headerH = this.showHeadings ? SHEET_HEADER_ROW_HEIGHT : 0;
    return {
      left: Math.max(8, headerW + colAxis.offset(col + 1) + 4),
      top: Math.max(8, headerH + rowAxis.offset(row)),
    };
  }

  openCellCommentEditor(col: number, row: number): void {
    this.commitCellEdit();
    this.closeColumnFilterMenu();
    this.closeValidationDropdown();
    this.hoveredCommentState = null;
    this.selectedCell = { col, row };
    this.selectionRange = { startCol: col, startRow: row, endCol: col, endRow: row };
    const cellId = getCellId(col, row);
    const existing = this.activeSheet.comments?.[cellId];
    const { left, top } = this.getCellPopoverOrigin(col, row);
    this.commentEditorState = {
      col,
      row,
      cellId,
      text: existing?.text ?? '',
      left,
      top,
    };
    this.viewChanges?.markForCheck();
    setTimeout(() => {
      const textarea = this.gridContainer?.nativeElement?.querySelector<HTMLTextAreaElement>('[data-testid="cell-comment-input"]');
      textarea?.focus();
    }, 0);
  }

  saveCellComment(): void {
    const state = this.commentEditorState;
    if (!state) return;
    const trimmed = state.text.trim();
    if (!trimmed) {
      this.deleteCellComment(state.col, state.row);
      return;
    }
    this.pushUndoSnapshot();
    this.activeSheet.comments = {
      ...(this.activeSheet.comments || {}),
      [state.cellId]: {
        text: trimmed,
        author: 'Usuario',
        updatedAt: new Date().toISOString(),
      },
    };
    this.commentEditorState = null;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  deleteCellComment(col: number, row: number): void {
    const cellId = getCellId(col, row);
    this.hoveredCommentState = null;
    if (this.commentEditorState?.cellId === cellId) {
      this.commentEditorState = null;
    }
    if (!this.activeSheet.comments?.[cellId]) {
      this.viewChanges?.markForCheck();
      return;
    }
    this.pushUndoSnapshot();
    const next = { ...this.activeSheet.comments };
    delete next[cellId];
    this.activeSheet.comments = Object.keys(next).length ? next : undefined;
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  closeCellCommentEditor(): void {
    if (!this.commentEditorState) return;
    this.commentEditorState = null;
    this.viewChanges?.markForCheck();
  }

  openHyperlinkEditor(col = this.selectedCell.col, row = this.selectedCell.row): void {
    this.commitCellEdit();
    this.closeColumnFilterMenu();
    this.closeValidationDropdown();
    this.closeCellCommentEditor();
    this.hoveredCommentState = null;
    this.selectedCell = { col, row };
    this.selectionRange = { startCol: col, startRow: row, endCol: col, endRow: row };
    const cellId = getCellId(col, row);
    const existing = this.activeSheet.data[cellId];
    const { left, top } = this.getCellPopoverOrigin(col, row);
    this.hyperlinkEditorState = {
      col,
      row,
      cellId,
      url: existing?.hyperlink ?? '',
      label: existing?.raw ?? '',
      left,
      top,
    };
    this.viewChanges?.markForCheck();
    setTimeout(() => {
      const input = this.gridContainer?.nativeElement?.querySelector<HTMLInputElement>('[data-testid="hyperlink-url-input"]');
      input?.focus();
    }, 0);
  }

  saveCellHyperlink(): void {
    const state = this.hyperlinkEditorState;
    if (!state) return;
    const rawUrl = state.url.trim();
    if (!rawUrl) {
      this.removeCellHyperlink(state.col, state.row);
      return;
    }
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    if (!/^(https?:\/\/|mailto:)/i.test(candidate)) {
      state.error = this.i18n.currentLang() === 'es'
        ? 'Usa un enlace válido (https://, http:// o mailto:).'
        : 'Use a valid URL (https://, http:// or mailto:).';
      this.viewChanges?.markForCheck();
      return;
    }
    const label = state.label.trim() || candidate;
    this.updateCurrentGrid((prev) => ({
      ...prev,
      [state.cellId]: {
        ...(prev[state.cellId] || {}),
        raw: label,
        hyperlink: candidate,
      },
    }));
    this.hyperlinkEditorState = null;
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  removeCellHyperlink(col = this.selectedCell.col, row = this.selectedCell.row): void {
    const cellId = getCellId(col, row);
    if (this.hyperlinkEditorState?.cellId === cellId) {
      this.hyperlinkEditorState = null;
    }
    if (!this.activeSheet.data[cellId]?.hyperlink) {
      this.viewChanges?.markForCheck();
      return;
    }
    this.updateCurrentGrid((prev) => {
      const cur = prev[cellId];
      if (!cur) return prev;
      const nextCell = { ...cur };
      delete nextCell.hyperlink;
      return { ...prev, [cellId]: nextCell };
    });
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  closeHyperlinkEditor(): void {
    if (!this.hyperlinkEditorState) return;
    this.hyperlinkEditorState = null;
    this.viewChanges?.markForCheck();
  }

  openCellHyperlink(col = this.selectedCell.col, row = this.selectedCell.row): void {
    const cellId = getCellId(col, row);
    const url = this.activeSheet.data[cellId]?.hyperlink;
    if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  hoverCommentCell(cell: { col: number; row: number } | null): void {
    if (!cell || this.commentEditorState) {
      if (this.hoveredCommentState) {
        this.hoveredCommentState = null;
        this.viewChanges?.markForCheck();
      }
      return;
    }
    const cellId = getCellId(cell.col, cell.row);
    const comment = this.activeSheet.comments?.[cellId];
    if (!comment) {
      if (this.hoveredCommentState) {
        this.hoveredCommentState = null;
        this.viewChanges?.markForCheck();
      }
      return;
    }
    if (this.hoveredCommentState?.cellId === cellId) return;
    const { left, top } = this.getCellPopoverOrigin(cell.col, cell.row);
    this.hoveredCommentState = {
      cellId,
      author: comment.author,
      text: comment.text,
      left,
      top,
    };
    this.viewChanges?.markForCheck();
  }

  selectValidationOption(option: string): void {
    const state = this.validationMenuState;
    if (!state) return;
    const id = getCellId(state.col, state.row);
    this.updateCurrentGrid((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), raw: option },
    }));
    this.editorNotice = '';
    this.closeValidationDropdown();
    this.canvasGrid?.renderNow(true);
    this.viewChanges?.markForCheck();
  }

  applyRemoveDuplicates(event: { columns: number[]; hasHeaders: boolean }): void {
    const result = removeDuplicatesFromRange(
      this.activeSheet.data,
      this.selectionRange,
      event.columns,
      event.hasHeaders,
      this.sheets,
      this.activeSheet,
      this.calculationCache
    );
    if (result.removedCount > 0) {
      this.pushUndoSnapshot();
      this.activeSheet.data = result.nextGrid;
      this.ensureWorkbookContext();
      this.renderRevision += 1;
      this.scheduleAutoSave();
      this.canvasGrid?.renderNow(true);
    }
    this.editorNotice =
      this.i18n.currentLang() === 'es'
        ? `Se eliminaron ${result.removedCount} filas duplicadas (${result.remainingCount} valores únicos conservados).`
        : `Removed ${result.removedCount} duplicate rows (${result.remainingCount} unique values kept).`;
  }

  applyTextToColumnsTool(delimiters: TextToColumnsDelimiters): void {
    const result = applyTextToColumns(
      this.activeSheet.data,
      this.selectionRange,
      delimiters,
      this.sheets,
      this.activeSheet,
      this.calculationCache
    );
    if (result.rowsProcessed === 0) return;
    this.pushUndoSnapshot();
    this.activeSheet.data = result.nextGrid;
    this.ensureWorkbookContext();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    this.editorNotice =
      this.i18n.currentLang() === 'es'
        ? `Texto dividido en ${result.columnsWritten} columnas (${result.rowsProcessed} filas).`
        : `Split text across ${result.columnsWritten} columns (${result.rowsProcessed} rows).`;
  }

  get hasPivotTables(): boolean {
    return Boolean(this.activeSheet?.pivotTables?.length);
  }

  refreshPivotTables(targetSheet: Sheet = this.activeSheet): void {
    const pivots = targetSheet?.pivotTables;
    if (!pivots?.length) return;
    const lang = this.i18n.currentLang() === 'es' ? 'es' : 'en';
    this.pushUndoSnapshot();
    const nextGrid: SheetGrid = { ...targetSheet.data };
    const colWidths = { ...(targetSheet.colWidths || {}) };
    let refreshed = 0;

    for (const pt of pivots) {
      const sourceSheet = this.sheets.find((s) => s.id === pt.sourceSheetId) || targetSheet;
      const result = buildPivotTableMatrix(
        sourceSheet.data,
        {
          range: pt.range,
          rowCol: pt.rowCol,
          colCol: pt.colCol,
          valueCol: pt.valueCol,
          aggregation: pt.aggregation,
          destination: 'currentSheet',
        },
        this.sheets,
        sourceSheet,
        this.calculationCache,
        lang
      );
      if (!result.matrix.length) continue;
      for (let r = pt.targetRange.startRow; r <= pt.targetRange.endRow; r++) {
        for (let c = pt.targetRange.startCol; c <= pt.targetRange.endCol; c++) {
          delete nextGrid[getCellId(c, r)];
        }
      }
      const startCol = pt.targetRange.startCol;
      const startRow = pt.targetRange.startRow;
      result.matrix.forEach((row, rIdx) =>
        row.forEach((cell, cIdx) => {
          nextGrid[getCellId(startCol + cIdx, startRow + rIdx)] = cell;
        })
      );
      for (const [cIdxStr, width] of Object.entries(result.colWidths)) {
        colWidths[startCol + Number(cIdxStr)] = width;
      }
      pt.targetRange = {
        startCol,
        startRow,
        endCol: startCol + Math.max(0, (result.matrix[0]?.length || 1) - 1),
        endRow: startRow + Math.max(0, result.matrix.length - 1),
      };
      refreshed += 1;
    }

    targetSheet.data = nextGrid;
    targetSheet.colWidths = colWidths;
    this.ensureWorkbookContext();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
    if (refreshed > 0) {
      this.editorNotice =
        lang === 'es'
          ? 'Tabla dinámica actualizada.'
          : 'PivotTable refreshed.';
    }
  }

  applyPivotTable(config: PivotTableConfig): void {
    const lang = this.i18n.currentLang() === 'es' ? 'es' : 'en';
    const sourceSheet = this.activeSheet;
    const result = buildPivotTableMatrix(
      sourceSheet.data,
      config,
      this.sheets,
      sourceSheet,
      this.calculationCache,
      lang
    );
    if (!result.matrix.length) return;
    this.pushUndoSnapshot();

    const makePivotDef = (targetRange: SelectionRange, existingCount: number): PivotTableDefinition => ({
      id: `pivot-${crypto.randomUUID()}`,
      name: `TablaDinamica${existingCount + 1}`,
      sourceSheetId: sourceSheet.id,
      range: { ...config.range },
      rowCol: config.rowCol,
      colCol: config.colCol,
      valueCol: config.valueCol,
      aggregation: config.aggregation,
      targetRange,
    });

    if (config.destination === 'newSheet') {
      const baseName = lang === 'es' ? 'Tabla dinámica' : 'PivotTable';
      let idx = 1;
      const usedNames = new Set(this.sheets.map((s) => s.name.toLowerCase()));
      while (usedNames.has(`${baseName} ${idx}`.toLowerCase())) idx += 1;
      const newSheetId = `sheet-pivot-${Date.now()}-${idx}`;
      const newGrid: SheetGrid = {};
      result.matrix.forEach((row, rIdx) =>
        row.forEach((cell, cIdx) => {
          newGrid[getCellId(cIdx, rIdx)] = cell;
        })
      );
      const targetRange: SelectionRange = {
        startCol: 0,
        startRow: 0,
        endCol: Math.max(0, (result.matrix[0]?.length || 1) - 1),
        endRow: Math.max(0, result.matrix.length - 1),
      };
      const newSheet: Sheet = {
        id: newSheetId,
        name: `${baseName} ${idx}`,
        type: 'grid',
        data: newGrid,
        colWidths: result.colWidths,
        pivotTables: [makePivotDef(targetRange, 0)],
      };
      this.sheets = [...this.sheets, newSheet];
      this.activeSheetId = newSheetId;
      this.selectedCell = { col: 0, row: 0 };
      this.selectionRange = targetRange;
      this.scrollActiveSheetTabIntoView(newSheetId);
    } else {
      const startCol = Math.max(config.range.startCol, config.range.endCol) + 2;
      const startRow = Math.min(config.range.startRow, config.range.endRow);
      const nextGrid: SheetGrid = { ...sourceSheet.data };
      result.matrix.forEach((row, rIdx) =>
        row.forEach((cell, cIdx) => {
          nextGrid[getCellId(startCol + cIdx, startRow + rIdx)] = cell;
        })
      );
      sourceSheet.data = nextGrid;
      const colWidths = { ...(sourceSheet.colWidths || {}) };
      for (const [cIdxStr, width] of Object.entries(result.colWidths)) {
        colWidths[startCol + Number(cIdxStr)] = width;
      }
      sourceSheet.colWidths = colWidths;
      const targetRange: SelectionRange = {
        startCol,
        startRow,
        endCol: startCol + Math.max(0, (result.matrix[0]?.length || 1) - 1),
        endRow: startRow + Math.max(0, result.matrix.length - 1),
      };
      sourceSheet.pivotTables = [...(sourceSheet.pivotTables || []), makePivotDef(targetRange, sourceSheet.pivotTables?.length || 0)];
      this.selectedCell = { col: startCol, row: startRow };
      this.selectionRange = targetRange;
    }

    this.ensureWorkbookContext();
    this.renderRevision += 1;
    this.scheduleAutoSave();
    this.canvasGrid?.renderNow(true);
  }

  onPictureFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.editorNotice =
        this.i18n.currentLang() === 'es'
          ? 'La imagen supera el límite de 5 MB.'
          : 'Image exceeds the 5 MB limit.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      if (typeof Image !== 'undefined') {
        const probe = new Image();
        probe.onload = () => {
          const maxW = 320;
          const ratio = probe.naturalWidth > 0 ? Math.min(1, maxW / probe.naturalWidth) : 1;
          const w = probe.naturalWidth > 0 ? Math.round(probe.naturalWidth * ratio) : 220;
          const h = probe.naturalHeight > 0 ? Math.round(probe.naturalHeight * ratio) : 160;
          this.artwork.insertImageArtwork(dataUrl, file.name, w, h);
        };
        probe.onerror = () => this.artwork.insertImageArtwork(dataUrl, file.name, 220, 160);
        probe.src = dataUrl;
      } else {
        this.artwork.insertImageArtwork(dataUrl, file.name, 220, 160);
      }
    };
    reader.readAsDataURL(file);
  }

  cellContextMenu:{x:number;y:number;col:number;row:number;sheetId:string}|null=null;
  cellContextError='';
  openCellContextMenu(col:number,row:number,event:MouseEvent):void {
    event.preventDefault();event.stopPropagation();const sheetId=this.activeSheetId;this.commitCellEdit();this.activeSheetId=sheetId;this.isSelecting=false;
    this.selectedCell={col,row};this.selectionRange={startCol:col,endCol:col,startRow:row,endRow:row};
    this.selectedChartId=null;this.selectedArtworkId=null;this.cellContextError='';
    const rect=(event.currentTarget as HTMLElement)?.getBoundingClientRect();
    this.cellContextMenu={x:event.clientX||rect?.left||0,y:event.clientY||rect?.bottom||0,col,row,sheetId:this.activeSheetId};
    this.viewChanges?.markForCheck();
  }
  closeCellContextMenu():void {this.cellContextMenu=null;this.viewChanges?.markForCheck();this.gridContainer?.nativeElement.focus({preventScroll:true});}
  insertFromCellContext(action:CellInsertAction):void {
    const target=this.cellContextMenu;if(!target)return;
    this.cellContextMenu=null;
    if (action === 'commentEdit') {
      this.openCellCommentEditor(target.col, target.row);
      return;
    }
    if (action === 'commentDelete') {
      this.deleteCellComment(target.col, target.row);
      return;
    }
    if (action === 'hyperlinkEdit') {
      this.openHyperlinkEditor(target.col, target.row);
      return;
    }
    if (action === 'hyperlinkOpen') {
      this.openCellHyperlink(target.col, target.row);
      return;
    }
    if (action === 'hyperlinkRemove') {
      this.removeCellHyperlink(target.col, target.row);
      return;
    }
    if (action === 'hideRow') {
      this.hideSelectedRows();
      return;
    }
    if (action === 'unhideRows') {
      this.unhideRows();
      return;
    }
    if (action === 'hideCol') {
      this.hideSelectedCols();
      return;
    }
    if (action === 'unhideCols') {
      this.unhideCols();
      return;
    }
    try{
      const isRow=action==='rowAbove'||action==='rowBelow';
      const index=isRow?target.row+(action==='rowBelow'?1:0):target.col+(action==='columnRight'?1:0);
      const next=applyWorkbookOperations({sheets:this.sheets,activeSheetId:this.activeSheetId},JSON.stringify({operations:[{type:isRow?'insertRows':'insertColumns',sheetId:target.sheetId,index,count:1}]}));
      this.pushUndoSnapshot();this.sheets=next.sheets;this.activeSheetId=target.sheetId;
      this.referenceTrace=null;this.renderRevision += 1;this.scheduleAutoSave();this.canvasGrid?.renderNow(true);
    }catch {this.cellContextError=this.i18n.t('excel.context.failed');}
    this.gridContainer?.nativeElement.focus({preventScroll:true});
  }

  handleInsertRowAbove(): void { return this.data.handleInsertRowAbove(); }

  handleDeleteRow(): void { return this.data.handleDeleteRow(); }

  handleInsertColLeft(): void { return this.data.handleInsertColLeft(); }

  handleDeleteCol(): void { return this.data.handleDeleteCol(); }

  handleOpenChartModal(event: { tab: 'recommended' | 'all'; category?: ChartCategory }): void { return this.charts.handleOpenChartModal(event); }

  handleInsertTable(): void { this.openNames(); }

  handleInsertChartSheet(): void {
    this.addNewChartSheet();
  }

  setDrawTool(tool: DrawToolId): void { return this.artwork.setDrawTool(tool); }

  setInkColor(color: string): void { return this.artwork.setInkColor(color); }

  setInkWidth(width: number): void { return this.artwork.setInkWidth(width); }

  handleApplySort(direction: 'asc' | 'desc'): void { return this.data.handleApplySort(direction); }

  handleToggleFilter(): void { return this.data.handleToggleFilter(); }

  handleApplyNumberFormat(format: NumberFormat): void { return this.formatting.handleApplyNumberFormat(format); }

  handleApplyPresetStyle(styleName: PresetStyle): void { return this.formatting.handleApplyPresetStyle(styleName); }

  @HostListener('document:mousedown', ['$event'])
  onGlobalClickOutside(event: MouseEvent): void { return this.interaction.onGlobalClickOutside(event); }

  // Each controller is scoped to this editor; the adapters read live shared state.
  private readonly controllerHooks: SheetEditorHooks = (() => {
    const editor = this;
    return {
      get calculationCache() { return editor.calculationCache; },
      get isDestroyed() { return editor.isDestroyed; },
      get viewChanges() { return editor.viewChanges; },
      get referenceDrag() { return editor.referenceDrag; },
      pushUndoSnapshot: () => this.pushUndoSnapshot(),
      stopInkReplay: () => this.stopInkReplay(),
      beginFormulaReference: (col, row, event) => this.beginFormulaReference(col, row, event),
      executeSmartFill: () => this.executeSmartFill(),
      expandMergedSelection: range => this.expandMergedSelection(range),
      finishFormulaReference: () => this.finishFormulaReference(),
      handleFormulaArrow: event => this.handleFormulaArrow(event),
      updateFormulaReference: (col, row) => this.updateFormulaReference(col, row),
      scheduleCanvasRender: () => {
        this.canvasGrid?.renderNow(true);
        this.objectsLayer?.renderNow();
        this.inkLayer?.paintCanvas();
      },
      scheduleFormulaRecalc: () => this.scheduleBackgroundRecalc(),
    };
  })();

  private readonly formulaRecalc = new FormulaRecalcClient();

  private readonly viewport = new SheetViewportController(this, this.controllerHooks);
  private readonly formatting = new SheetFormattingController(this, this.controllerHooks);
  private readonly data = new SheetDataController(this, this.controllerHooks);
  private readonly charts = new SheetChartsController(this, this.controllerHooks);
  private readonly editing = new SheetEditingController(this, this.controllerHooks);
  private readonly interaction = new SheetInteractionController(this, this.controllerHooks);
  private readonly workbook = new SheetWorkbookController(this, this.controllerHooks);
  private readonly artwork = new SheetArtworkController(this, this.controllerHooks);
}
