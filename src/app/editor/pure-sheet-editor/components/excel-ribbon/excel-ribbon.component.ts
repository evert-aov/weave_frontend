import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lucideClipboard, lucideScissors, lucideCopy, lucidePaintbrush, lucideBold, lucideItalic, lucideUnderline, lucideGrid, lucideFrame, lucideTable, lucideFileSpreadsheet, lucidePaintBucket, lucideType, lucideAlignLeft, lucideAlignCenter, lucideAlignRight, lucideWrapText, lucideCombine, lucideDollarSign, lucidePercent, lucidePlus, lucideTrash2, lucideEraser, lucideSigma, lucideArrowDown, lucideArrowRight, lucideArrowDownUp, lucideSearch, lucideChevronDown, lucideUndo2, lucideRedo2, lucideBarChart2, lucideTrendingUp, lucidePieChart, lucideSparkles, lucideMousePointer, lucideLasso, lucidePencil, lucideFileText, lucideCheck, lucideX, lucidePalette, lucideLayers, lucideSnowflake, lucideSun, lucideMoon, lucideLock, lucideRotateCw, lucidePanelLeft, lucideSave, lucideDownload, lucideSlidersHorizontal, lucideMaximize, lucideMinimize } from '@ng-icons/lucide';
import {
  BorderLineStyle,
  BorderPreset,
  CellBorders,
  CellStyle,
  ChartCategory,
  ChartSubType,
  DrawBorderMode,
  DrawToolId,
  EmbeddedChart,
  InkPenConfig,
  NumberFormat,
  PageLayoutConfig,
  PresetStyle,
  SelectionRange,
  TextAlign,
  VerticalAlign,
} from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';
import { ExcelBordersMenuComponent } from '../excel-borders-menu/excel-borders-menu.component';
import { ExcelInsertToolbarComponent } from '../excel-insert-toolbar/excel-insert-toolbar.component';
import { ExcelPageLayoutToolbarComponent } from '../excel-page-layout-toolbar/excel-page-layout-toolbar.component';
import { ExcelDrawToolbarComponent } from '../excel-draw-toolbar/excel-draw-toolbar.component';
import { ExcelFormulasToolbarComponent } from '../excel-formulas-toolbar/excel-formulas-toolbar.component';
import { ExcelViewToolbarComponent } from '../excel-view-toolbar/excel-view-toolbar.component';
import { ExcelDataToolbarComponent } from '../excel-data-toolbar/excel-data-toolbar.component';

@Component({
  selector: 'app-excel-ribbon',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    ExcelBordersMenuComponent,
    ExcelInsertToolbarComponent,
    ExcelPageLayoutToolbarComponent,
    ExcelDrawToolbarComponent,
    ExcelViewToolbarComponent,
    ExcelFormulasToolbarComponent,
    ExcelDataToolbarComponent,
  ],
  providers: [
    provideLucideIcons({ lucideClipboard,
      lucideScissors,
      lucideCopy,
      lucidePaintbrush,
      lucideBold,
      lucideItalic,
      lucideUnderline,
      lucideGrid,
      lucideFrame,
      lucideTable,
      lucideFileSpreadsheet,
      lucidePaintBucket,
      lucideType,
      lucideAlignLeft,
      lucideAlignCenter,
      lucideAlignRight,
      lucideWrapText,
      lucideCombine,
      lucideDollarSign,
      lucidePercent,
      lucidePlus,
      lucideTrash2,
      lucideEraser,
      lucideSigma,
      lucideArrowDown,
      lucideArrowRight,
      lucideArrowDownUp,
      lucideSearch,
      lucideChevronDown,
      lucideUndo2,
      lucideRedo2,
      lucideBarChart2,
      lucideTrendingUp,
      lucidePieChart,
      lucideSparkles,
      lucideMousePointer,
      lucideLasso,
      lucidePencil,
      lucideFileText,
      lucideCheck,
      lucideX,
      lucidePalette,
      lucideLayers,
      lucideSnowflake,
      lucideSun,
      lucideMoon,
      lucideLock,
      lucideRotateCw,
      lucidePanelLeft,
      lucideSave,
      lucideDownload,
      lucideSlidersHorizontal,
      lucideMaximize,
      lucideMinimize }),
  ],
  templateUrl: './excel-ribbon.component.html',
  styleUrls: ['./excel-ribbon.component.css'],
})
export class ExcelRibbonComponent {
  @Input() activeTab = 'Home';
  @Input() selectedChart: EmbeddedChart | null = null;
  @Input() activeCellStyle: CellStyle = {};
  @Input() selectionIsMerged = false;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() filterActive = false;
  @Input() pageLayout: PageLayoutConfig = {
    theme: 'office',
    margins: 'normal',
    orientation: 'portrait',
    size: 'letter',
    widthPages: 'Automatic',
    heightPages: 'Automatic',
    scale: 100,
    gridlinesPrint: true,
    headingsPrint: true,
  };
  @Input() showGridlines = true;
  @Input() showHeadings = true;
  @Input() showFormulaBar = true;
  @Input() activeDrawTool: DrawToolId = 'select';
  @Input() inkColor = '#000000';
  @Input() inkWidth = 2;
  @Input() drawBorderMode: DrawBorderMode = 'none';
  @Input() zoom = 100;
  @Input() inkToShape = false;
  @Input() isReplaying = false;
  @Input() hasStrokes = false;
  @Input() activeSheetType: 'grid' | 'chart' = 'grid';
  @Input() freezePanesConfig = { rows: 0, cols: 0 };
  @Input() sheetProtected = false;
  @Input() activeCellLocked = true;
  @Input() activeCellId = 'A1';
  @Input() selectedRangeLabel = '';
  @Output() configureChartAppearance = new EventEmitter<void>();
  @Output() configureChartData = new EventEmitter<void>();
  @Output() changeChartTitle = new EventEmitter<string>();
  @Output() useSelectedChartRange = new EventEmitter<void>();
  readonly chartPalettes: { id: 'excel' | 'monochrome' | 'warm' | 'cool'; es: string; en: string }[] = [
    { id: 'excel', es: 'Excel', en: 'Excel' }, { id: 'monochrome', es: 'Monocromático', en: 'Monochrome' },
    { id: 'warm', es: 'Cálido', en: 'Warm' }, { id: 'cool', es: 'Frío', en: 'Cool' },
  ];
  @Input() selectedRow = 0;
  @Input() selectedCol = 0;

  @Output() tabChange = new EventEmitter<string>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() copy = new EventEmitter<void>();
  @Output() cut = new EventEmitter<void>();
  @Output() paste = new EventEmitter<void>();
  @Output() togglePasteSpecial = new EventEmitter<void>();
  @Output() formatPainter = new EventEmitter<void>();

  @Output() styleChange = new EventEmitter<Partial<CellStyle>>();
  @Output() openBorders = new EventEmitter<void>();
  @Output() applyBorderPreset = new EventEmitter<{ preset: BorderPreset; lineStyle: BorderLineStyle; color: string }>();
  @Output() applyCustomBorders = new EventEmitter<CellBorders>();
  @Output() selectDrawMode = new EventEmitter<DrawBorderMode>();
  @Output() applyPresetStyle = new EventEmitter<PresetStyle>();
  @Output() toggleMerge = new EventEmitter<void>();
  @Output() openConditionalFormatting = new EventEmitter<void>();
  @Output() openSortFilter = new EventEmitter<void>();
  @Output() autoSum = new EventEmitter<string>();
  @Output() fillDown = new EventEmitter<void>();
  @Output() fillRight = new EventEmitter<void>();
  @Output() clearContent = new EventEmitter<void>();

  @Output() openChartModal = new EventEmitter<{ tab: 'recommended' | 'all'; category?: ChartCategory }>();
  @Output() insertChartDirectly = new EventEmitter<{ category: ChartCategory; subType: ChartSubType }>();
  @Output() insertCheckbox = new EventEmitter<void>();
  @Output() insertTable = new EventEmitter<void>();
  @Output() insertChartSheet = new EventEmitter<void>();

  @Output() setDrawTool = new EventEmitter<DrawToolId>();
  @Output() setInkColor = new EventEmitter<string>();
  @Output() setInkWidth = new EventEmitter<number>();
  @Output() addShape = new EventEmitter<'rectangle' | 'ellipse' | 'line'>();
  @Output() clearDrawings = new EventEmitter<void>();
  @Output() deleteDrawingStroke = new EventEmitter<string>();
  @Output() addPen = new EventEmitter<InkPenConfig>();
  @Output() toggleInkToShape = new EventEmitter<void>();
  @Output() openInkToMath = new EventEmitter<void>();
  @Output() replayInk = new EventEmitter<void>();
  @Output() undoInk = new EventEmitter<void>();
  @Output() redoInk = new EventEmitter<void>();
  @Output() clearAllInk = new EventEmitter<void>();

  @Output() applySort = new EventEmitter<'asc' | 'desc'>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() insertRowAbove = new EventEmitter<void>();
  @Output() deleteRow = new EventEmitter<void>();
  @Output() insertColLeft = new EventEmitter<void>();
  @Output() deleteCol = new EventEmitter<void>();

  @Output() updatePageLayout = new EventEmitter<Partial<PageLayoutConfig>>();
  @Output() toggleGridlines = new EventEmitter<void>();
  @Output() toggleHeadings = new EventEmitter<void>();
  @Output() toggleFormulaBar = new EventEmitter<void>();
  @Output() freezePanes = new EventEmitter<{ rows: number; cols: number }>();
  @Output() unfreezePanes = new EventEmitter<void>();
  @Output() toggleSheetProtection = new EventEmitter<void>();
  @Output() toggleSelectionLocked = new EventEmitter<void>();
  @Output() groupOutline = new EventEmitter<'row' | 'col'>();
  @Output() ungroupOutline = new EventEmitter<'row' | 'col'>();
  @Input() inkPens: InkPenConfig[] = [];
  @Input() showFormulasInCells = false;
  @Output() insertFormula = new EventEmitter<string>();
  @Output() toggleShowFormulas = new EventEmitter<void>();
  @Output() traceReference = new EventEmitter<'precedents' | 'dependents'>();
  @Output() clearTrace = new EventEmitter<void>();
  @Output() editFormula = new EventEmitter<boolean>();
  @Output() recalculate = new EventEmitter<void>();
  @Output() changeChartType = new EventEmitter<void>();
  @Output() openShapes = new EventEmitter<void>();
  @Output() openIcons = new EventEmitter<void>();
  @Output() openNames = new EventEmitter<void>();
  @Output() openFunctionsDrawer = new EventEmitter<void>();
  @Output() openFindReplace = new EventEmitter<void>();
  @Input() hasColumnFilters = false;
  @Output() clearAllFilters = new EventEmitter<void>();
  @Output() openValidation = new EventEmitter<void>();
  @Output() openRemoveDuplicates = new EventEmitter<void>();
  @Output() openTextToColumns = new EventEmitter<void>();
  @Input() hasPivotTables = false;
  @Output() openPivotModal = new EventEmitter<void>();
  @Output() refreshPivot = new EventEmitter<void>();
  @Output() insertPicture = new EventEmitter<void>();
  @Output() openSparklineModal = new EventEmitter<void>();
  @Output() changeZoom = new EventEmitter<number>();
  @Output() setPrintArea = new EventEmitter<void>();
  @Output() clearPrintArea = new EventEmitter<void>();
  @Output() bringChartForward = new EventEmitter<void>();
  @Output() sendChartBackward = new EventEmitter<void>();
  @Output() selectNormalView = new EventEmitter<void>();
  @Output() selectChartView = new EventEmitter<void>();

  @Output() changeSelectedChartPalette = new EventEmitter<'excel' | 'monochrome' | 'warm' | 'cool'>();
  @Output() deleteSelectedChart = new EventEmitter<void>();

  // Global & Weave integration actions
  @Output() save = new EventEmitter<void>();
  @Input() xlsxBusy = false;
  @Output() importXlsx = new EventEmitter<void>();
  @Output() exportXlsx = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<void>();
  @Output() openExportModal = new EventEmitter<void>();
  @Output() toggleAi = new EventEmitter<void>();
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() loadDemoData = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();
  @Output() toggleFullscreen = new EventEmitter<void>();
  @Output() openHyperlinkModal = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n?.t ? this.i18n.t(key, params) : key;
  }

  readonly fontFamilies = [
    'Segoe UI',
    'Calibri',
    'Arial',
    'Times New Roman',
    'Consolas',
    'JetBrains Mono',
    'Georgia',
  ];

  readonly fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

  get hasCustomChartColors(): boolean {
    return Object.values(this.selectedChart?.seriesColors || {}).some(color => /^#[0-9a-f]{6}$/i.test(color));
  }

  get ribbonTabs(): string[] {
    const tabs = [
      'File',
      'Home',
      'Insert',
      'Draw',
      'Page Layout',
      'Formulas',
      'Data',
      'View',
    ];
    if (this.selectedChart) {
      tabs.push('Chart Design');
    }
    return tabs;
  }

  getTabLabel(tab: string): string {
    const isEs = this.i18n.currentLang() === 'es';
    switch (tab) {
      case 'File':
        return isEs ? 'Archivo' : 'File';
      case 'Home':
        return isEs ? 'Inicio' : 'Home';
      case 'Insert':
        return isEs ? 'Insertar' : 'Insert';
      case 'Draw':
        return isEs ? 'Dibujar' : 'Draw';
      case 'Page Layout':
        return isEs ? 'Disposición' : 'Page Layout';
      case 'Formulas':
        return isEs ? 'Fórmulas' : 'Formulas';
      case 'Data':
        return isEs ? 'Datos' : 'Data';
      case 'View':
        return isEs ? 'Vista' : 'View';
      case 'Chart Design':
        return isEs ? 'Diseño de Gráfico' : 'Chart Design';
      default:
        return tab;
    }
  }

  toggleBold(): void {
    this.styleChange.emit({ bold: !this.activeCellStyle?.bold });
  }

  toggleItalic(): void {
    this.styleChange.emit({ italic: !this.activeCellStyle?.italic });
  }

  toggleUnderline(): void {
    this.styleChange.emit({ underline: !this.activeCellStyle?.underline });
  }

  toggleWrap(): void {
    this.styleChange.emit({ wrapText: !this.activeCellStyle?.wrapText });
  }

  setAlign(align: TextAlign): void {
    this.styleChange.emit({ align });
  }

  setVerticalAlign(verticalAlign: VerticalAlign): void {
    this.styleChange.emit({ verticalAlign });
  }

  setTextRotation(deg: string | number): void {
    const val = Number(deg);
    this.styleChange.emit({ textRotation: Number.isFinite(val) ? val : 0 });
  }

  setNumberFormat(format: NumberFormat): void {
    this.styleChange.emit({ numberFormat: format, xlsxNumberFormat: format === 'date' ? 'yyyy-mm-dd' : format === 'datetime' ? 'yyyy-mm-dd hh:mm:ss' : undefined });
  }

  adjustDecimals(delta: number): void {
    const current = this.activeCellStyle?.decimals ?? 2;
    const next = Math.max(0, Math.min(8, current + delta));
    this.styleChange.emit({ decimals: next });
  }

  adjustFontSize(delta: number): void {
    const current = this.activeCellStyle?.fontSize ?? 11;
    const next = Math.max(6, Math.min(72, current + delta));
    this.styleChange.emit({ fontSize: next });
  }

  bordersMenuOpen = false;
  isCollapsed = false;

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.bordersMenuOpen = false;
  }

  selectTab(tab: string): void {
    this.isCollapsed = false;
    this.tabChange.emit(tab);
  }
  borderLineColor = '#000000';
  userSelectedColor = false;
  borderLineStyle: BorderLineStyle = 'thin';

  get effectiveBorderLineColor(): string {
    if (this.userSelectedColor) return this.borderLineColor;
    return '#000000';
  }

  borderMenuPosition = { left: 0, top: 0 };

  toggleBordersMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      const trigger = event.currentTarget as HTMLElement;
      const rect = trigger.closest('.borders-dropdown-container')?.getBoundingClientRect();
      if (rect) this.borderMenuPosition = { left: rect.left, top: rect.bottom };
    }
    this.bordersMenuOpen = !this.bordersMenuOpen;
  }

  onSelectLineColor(color: string): void {
    this.borderLineColor = color;
    this.userSelectedColor = true;
  }

  onApplyBorderPreset(preset: BorderPreset): void {
    this.applyBorderPreset.emit({
      preset,
      lineStyle: this.borderLineStyle,
      color: this.effectiveBorderLineColor,
    });
    this.bordersMenuOpen = false;
  }

  onSelectDrawMode(mode: DrawBorderMode): void {
    this.drawBorderMode = mode;
    this.selectDrawMode.emit(mode);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.borders-dropdown-container') && !target.closest('.borders-menu-root')) {
      this.bordersMenuOpen = false;
    }
  }

  applyPreset(preset: PresetStyle): void {
    this.applyPresetStyle.emit(preset);
  }

  onFontFamilyChange(e: Event): void {
    const val = (e.target as HTMLSelectElement).value;
    this.styleChange.emit({ fontFamily: val });
  }

  onFontSizeChange(e: Event): void {
    const val = Number((e.target as HTMLSelectElement).value);
    this.styleChange.emit({ fontSize: val });
  }

  onColorChange(e: Event, type: 'textColor' | 'bgColor'): void {
    const val = (e.target as HTMLInputElement).value;
    this.styleChange.emit({ [type]: val });
  }
}
