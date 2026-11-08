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
import { BorderLineStyle, BorderPreset, CellBorders, CellData, CellStyle, ChartCategory, ChartSubType, ColumnFilters, DrawBorderMode, DrawToolId, EmbeddedChart, InkStroke, MergeRegion, NumberFormat, PageLayoutConfig, PresetStyle, SelectionRange, Sheet, SheetGrid } from './models/excel.model';
import { colIndexToLetter, evaluateCellValueCached, FormulaCalculationCache, getCellId } from './services/formula-engine.service';
import { ExcelArtworkPickerComponent } from './components/excel-artwork-picker/excel-artwork-picker.component';
import { ExcelFloatingArtworkComponent } from './components/excel-floating-artwork/excel-floating-artwork.component';
import { WordIconsModalComponent } from '../pure-doc-editor/components/word-icons-modal/word-icons-modal.component';
import { FloatingArtwork } from './models/excel.model';
import { ExcelInkLayerComponent } from './components/excel-ink-layer/excel-ink-layer.component';
import { DEFAULT_INK_PENS } from './components/excel-draw-toolbar/excel-draw-toolbar.component';
import { InkPenConfig } from './models/excel.model';
import { ExcelRibbonComponent } from './components/excel-ribbon/excel-ribbon.component';
import { ExcelChartSheetViewComponent } from './components/excel-chart-sheet-view/excel-chart-sheet-view.component';
import { ExcelChartRendererComponent } from './components/excel-chart-renderer/excel-chart-renderer.component';
import { ExcelConditionalModalComponent } from './components/excel-conditional-modal/excel-conditional-modal.component';
import { ExcelSortFilterMenuComponent } from './components/excel-sort-filter-menu/excel-sort-filter-menu.component';
import { ExcelChartDataModalComponent } from './components/excel-chart-data-modal/excel-chart-data-modal.component';
import { ChartAppearance, ChartDataConfig } from './models/excel.model';
import { ExcelChartModalComponent } from './components/excel-chart-modal/excel-chart-modal.component';
import { ExcelFunctionsDrawerComponent } from './components/excel-functions-drawer/excel-functions-drawer.component';
import { ExcelCellBordersComponent } from './components/excel-cell-borders/excel-cell-borders.component';
import { LucideDynamicIcon, provideLucideIcons, LucideSun, LucideMoon, LucideSparkles, LucideMessageSquare, LucideShare2, LucideLock, LucideCheck, LucideX, LucideChevronDown, LucidePlus, LucideSearch, LucideFileSpreadsheet, LucideBarChart2, LucidePanelLeft, LucideSave, LucideDownload, LucideSlidersHorizontal, LucideMaximize, LucideMinimize } from '@lucide/angular';
import { SheetViewportController } from './controllers/sheet-viewport.controller';
import { SheetFormattingController } from './controllers/sheet-formatting.controller';
import { SheetDataController } from './controllers/sheet-data.controller';
import { SheetChartsController } from './controllers/sheet-charts.controller';
import { SheetEditingController } from './controllers/sheet-editing.controller';
import { SheetInteractionController } from './controllers/sheet-interaction.controller';
import { SheetWorkbookController } from './controllers/sheet-workbook.controller';
import { SheetArtworkController } from './controllers/sheet-artwork.controller';
import type { SheetReferenceTarget, SheetReferenceTrace } from './models/editor-reference.model';

@Component({
  selector: 'app-pure-sheet-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    ExcelRibbonComponent, ExcelInkLayerComponent, ExcelArtworkPickerComponent, ExcelFloatingArtworkComponent, WordIconsModalComponent,
    ExcelChartSheetViewComponent,
    ExcelChartRendererComponent,
    ExcelConditionalModalComponent,
    ExcelSortFilterMenuComponent,
    ExcelChartModalComponent, ExcelChartDataModalComponent,
    ExcelNamesModalComponent,
    ExcelFunctionsDrawerComponent,
    ExcelCellBordersComponent,
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
      LucidePlus,
      LucideSearch,
      LucideFileSpreadsheet,
      LucideBarChart2,
      LucidePanelLeft,
      LucideSave,
      LucideDownload,
      LucideSlidersHorizontal,
      LucideMaximize,
      LucideMinimize
    ),
  ],
  templateUrl: './pure-sheet-editor.component.html',
  styleUrls: ['./pure-sheet-editor.component.scss'],
})
export class PureSheetEditorComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) note!: Note;

  @ViewChild('gridContainer') gridContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cellEditorInput') cellEditorInput?: ElementRef<HTMLInputElement>;
  @ViewChild('formulaBarInput') formulaBarInput?: ElementRef<HTMLInputElement>;

  private readonly viewChanges = inject(ChangeDetectorRef, { optional: true });
  readonly notesService = inject(NotesService);
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  readonly aiService = inject(AiService);
  private readonly aiDocuments = inject(AiDocumentService);

  // Weave top bar & menu states
  exportMenuOpen = false;
  exportModalOpen = false;
  settingsMenuOpen = false;
  copiedLinkNotice = false;
  private copiedFormat: CellStyle | null = null;

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
  get gridViewport(): { rows: number[]; columns: number[]; top: number; bottom: number; left: number; right: number } { return this.viewport.gridViewport; }
  onGridScroll(): void { return this.viewport.onGridScroll(); }
  revealCell(col: number, row: number): void { return this.viewport.revealCell(col, row); }
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
  refreshCompletions(input: HTMLInputElement): void { return this.editing.refreshCompletions(input); }
  onCellEditorInput(event: Event): void { return this.editing.onCellEditorInput(event); }
  onEditorKeyUp(event: KeyboardEvent): void { return this.editing.onEditorKeyUp(event); }
  closeCompletions(): void { return this.editing.closeCompletions(); }
  acceptCompletion(index = this.completionIndex): void { return this.editing.acceptCompletion(index); }
  onCellEditorKeyDown(event: KeyboardEvent): void { return this.editing.onCellEditorKeyDown(event); }
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

  private get referenceDrag(): { col: number; row: number; prefix: string; suffix: string; caret: number; input?: HTMLInputElement } | undefined { return this.editing.referenceDrag; }

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
  resizingChart: { id: string; startX: number; startY: number; origW: number; origH: number } | null = null;

  // Filters
  filtersEnabled = false;
  columnFilters: ColumnFilters = {};
  openFilterCol: number | null = null;

  // Drawing ink strokes
  currentDraftStroke: InkStroke | null = null;

  // Modals state
  conditionalModalOpen = false;
  sortFilterModalOpen = false;
  chartModalOpen = false;
  chartModalTab: 'recommended' | 'all' = 'all';
  chartModalCat?: ChartCategory;
  chartSourceRange?: SelectionRange;
  chartEditingId: string | null = null;
  functionsDrawerOpen = false;

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
    this.loadNoteData();
    this.registerAiAdapter();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['note']) {
      const newId = this.note?._id;
      if (newId && newId !== this.loadedNoteId) {
        this.loadedNoteId = newId;
        this.loadNoteData();
        this.registerAiAdapter();
      }
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopInkReplay();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.unregisterAi?.();
  }

  private get calculationCache(): FormulaCalculationCache { return this.workbook.calculationCache; }

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

  get normalizedRange(): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
    return {
      minCol: Math.min(this.selectionRange.startCol, this.selectionRange.endCol),
      maxCol: Math.max(this.selectionRange.startCol, this.selectionRange.endCol),
      minRow: Math.min(this.selectionRange.startRow, this.selectionRange.endRow),
      maxRow: Math.max(this.selectionRange.startRow, this.selectionRange.endRow),
    };
  }

  get selectionStats(): { average: string; count: number; numCount: number; min: string; max: string; sum: string } { return this.workbook.selectionStats; }

  get colLetters(): string[] {
    return Array.from({ length: this.totalCols }, (_, idx) => colIndexToLetter(idx));
  }

  get rowIndices(): number[] {
    return Array.from({ length: this.totalRows }, (_, idx) => idx);
  }

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
          this.scheduleAutoSave();
        }
      )
    );
  }

  private pushUndoSnapshot(): void { return this.workbook.pushUndoSnapshot(); }

  handleUndo(): void { return this.workbook.handleUndo(); }

  handleRedo(): void { return this.workbook.handleRedo(); }

  scheduleAutoSave(): void { return this.workbook.scheduleAutoSave(); }

  updateCurrentGrid(mutator: (grid: SheetGrid) => SheetGrid): void { return this.workbook.updateCurrentGrid(mutator); }

  // --- SHEET TABS MANAGEMENT ---

  switchSheet(id: string): void { return this.editing.switchSheet(id); }

  addNewSheet(): void { return this.workbook.addNewSheet(); }

  addNewChartSheet(): void { return this.workbook.addNewChartSheet(); }

  onSheetNameKeyDown(event: KeyboardEvent, sheet: Sheet): void { return this.workbook.onSheetNameKeyDown(event, sheet); }
  finishSheetRename(sheet: Sheet, event: FocusEvent): void { return this.workbook.finishSheetRename(sheet, event); }

  renameSheet(sheet: Sheet, newName: string): void { return this.workbook.renameSheet(sheet, newName); }

  deleteSheet(sheetId: string): void { return this.workbook.deleteSheet(sheetId); }

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

  recalculateSheet(): void { this.updateCurrentGrid(grid => ({ ...grid })); }

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

  renderedMerge(col: number, row: number, viewport: { rows: number[]; columns: number[] }): { hidden: boolean; col: number; row: number; colSpan: number; rowSpan: number; width: number; height: number } { return this.viewport.renderedMerge(col, row, viewport); }
  toggleMerge(): void { return this.formatting.toggleMerge(); }

  handleFillDown(): void { return this.data.handleFillDown(); }

  handleFillRight(): void { return this.data.handleFillRight(); }

  handleCycleF4(): void { return this.data.handleCycleF4(); }

  getPresetClasses(preset?: PresetStyle): string { return this.formatting.getPresetClasses(preset); }

  handleCopy(): Promise<void> { return this.data.handleCopy(); }

  handleCut(): Promise<void> { return this.data.handleCut(); }

  onGridPaste(event: ClipboardEvent): void { return this.data.onGridPaste(event); }

  applyPastedCells(matrix: CellData[][]): void { return this.data.applyPastedCells(matrix); }

  handlePaste(): Promise<void> { return this.data.handlePaste(); }

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

  handleFormatPainter(): void {
    this.copiedFormat = { ...this.activeCellStyle };
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
    };
  })();

  private readonly viewport = new SheetViewportController(this, this.controllerHooks);
  private readonly formatting = new SheetFormattingController(this, this.controllerHooks);
  private readonly data = new SheetDataController(this, this.controllerHooks);
  private readonly charts = new SheetChartsController(this, this.controllerHooks);
  private readonly editing = new SheetEditingController(this, this.controllerHooks);
  private readonly interaction = new SheetInteractionController(this, this.controllerHooks);
  private readonly workbook = new SheetWorkbookController(this, this.controllerHooks);
  private readonly artwork = new SheetArtworkController(this, this.controllerHooks);
}
