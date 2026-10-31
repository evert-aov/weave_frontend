import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAlignCenter,
  LucideAlignJustify,
  LucideAlignLeft,
  LucideAlignRight,
  LucideArrowDownUp,
  LucideArrowLeftRight,
  LucideArrowRightToLine,
  LucideArrowUpDown,
  LucideBarChart3,
  LucideBold,
  LucideBookOpen,
  LucideChevronDown,
  LucideChevronUp,
  LucideCode,
  LucideColumns,
  LucideCornerDownLeft,
  LucideDownload,
  LucideDynamicIcon,
  LucideEraser,
  LucideFileCheck2,
  LucideFilePlus2,
  LucideFileText,
  LucideFrame,
  LucideGlobe,
  LucideHash,
  LucideImage,
  LucideIndentDecrease,
  LucideIndentIncrease,
  LucideItalic,
  LucideLink,
  LucideList,
  LucideListChecks,
  LucideListOrdered,
  LucideListTree,
  LucideMaximize,
  LucideMinus,
  LucideMoon,
  LucideMusic,
  LucidePaintBucket,
  LucidePaintbrush,
  LucidePalette,
  LucidePanelTop,
  LucidePrinter,
  LucideQuote,
  LucideRedo2,
  LucideRotateCw,
  LucideRuler,
  LucideScissors,
  LucideSliders,
  LucideSparkles,
  LucideStrikethrough,
  LucideSubscript,
  LucideSun,
  LucideSuperscript,
  LucideTable,
  LucideUnderline,
  LucideUndo2,
  LucideUpload,
  LucideVideo,
  LucideVolume2,
  LucideZoomIn,
  LucideZoomOut,
  provideLucideIcons,
} from '@lucide/angular';
import {
  DocumentLayoutConfig,
  DocumentViewMode,
  EditorActiveFormats,
  ElementStyleRule,
  PageBorderStyle,
  PageMarginsConfig,
  PageMovementMode,
  PaperFormatId,
  PaperFormatPreset,
  RibbonTab,
  SectionColumnsPreset,
  StyleTargetTag,
  StyleTemplate,
} from '../../models/word-document.model';
import {
  CODE_LANGUAGES,
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  MARGIN_PRESETS,
  PAPER_FORMAT_PRESETS,
  TEXT_COLORS,
} from '../../constants/word-document.constants';
import { WordHomeToolbarComponent } from '../word-home-toolbar/word-home-toolbar.component';
import { WordInsertToolbarComponent } from '../word-insert-toolbar/word-insert-toolbar.component';
import { WordDesignToolbarComponent } from '../word-design-toolbar/word-design-toolbar.component';
import { WordLayoutToolbarComponent } from '../word-layout-toolbar/word-layout-toolbar.component';
import { WordArtPreset } from '../../models/word-insert.model';
import { I18nService } from '../../../../core/services/i18n.service';

const PAPER_FORMAT_LIST: PaperFormatId[] = [
  'letter',
  'oficio',
  'legal',
  'a4',
  'executive',
  'a5',
  'b5',
  'a3',
  'tabloid',
];

const BORDER_STYLES_LIST: { id: PageBorderStyle; label: string; preview: string }[] = [
  { id: 'none', label: 'Sin borde de página', preview: 'Ninguno' },
  { id: 'solid', label: 'Cuadro simple continuo', preview: '───' },
  { id: 'double', label: 'Doble línea formal', preview: '═══' },
  { id: 'thick', label: 'Marco grueso ejecutivo', preview: '━━━' },
  { id: 'dashed', label: 'Línea discontinua', preview: ' - - - ' },
  { id: 'dotted', label: 'Línea punteada', preview: '······' },
];

@Component({
  selector: 'app-word-ribbon',
  standalone: true,
  imports: [
    CommonModule,
    LucideDynamicIcon,
    WordHomeToolbarComponent,
    WordInsertToolbarComponent,
    WordDesignToolbarComponent,
    WordLayoutToolbarComponent,
  ],
  providers: [
    provideLucideIcons(
      LucideUndo2,
      LucideRedo2,
      LucideEraser,
      LucidePaintBucket,
      LucideBold,
      LucideItalic,
      LucideUnderline,
      LucideStrikethrough,
      LucideAlignLeft,
      LucideAlignCenter,
      LucideAlignRight,
      LucideAlignJustify,
      LucideList,
      LucideListOrdered,
      LucideListChecks,
      LucideIndentIncrease,
      LucideIndentDecrease,
      LucideCode,
      LucideSubscript,
      LucideSuperscript,
      LucideImage,
      LucideMusic,
      LucideVideo,
      LucideFileText,
      LucideTable,
      LucideBarChart3,
      LucideLink,
      LucideQuote,
      LucideMinus,
      LucideChevronDown,
      LucideChevronUp,
      LucideUpload,
      LucideDownload,
      LucidePrinter,
      LucideListTree,
      LucideZoomIn,
      LucideZoomOut,
      LucideSparkles,
      LucideFileCheck2,
      LucideCornerDownLeft,
      LucideArrowUpDown,
      LucidePaintbrush,
      LucideFilePlus2,
      LucideScissors,
      LucideRuler,
      LucideFrame,
      LucidePanelTop,
      LucideRotateCw,
      LucideBookOpen,
      LucidePalette,
      LucideSliders,
      LucideArrowRightToLine,
      LucideColumns,
      LucideGlobe,
      LucideMaximize,
      LucideMoon,
      LucideSun,
      LucideArrowDownUp,
      LucideArrowLeftRight,
      LucideVolume2,
      LucideHash
    ),
  ],
  templateUrl: './word-ribbon.component.html',
  styleUrls: ['./word-ribbon.component.scss'],
})
export class WordRibbonComponent implements OnInit, OnChanges, OnDestroy {
  @Input() activeTab: RibbonTab = 'home';
  @Input() formats!: EditorActiveFormats;
  @Input() layoutConfig!: DocumentLayoutConfig;
  @Input() styleTemplates: StyleTemplate[] = [];
  @Input() activeTemplateId = '';
  @Input() formatPainterActive = false;
  @Input() showFormattingMarks = false;
  @Input() headingNumbering = false;
  @Output() captureSelection = new EventEmitter<void>();
  @Output() updateStyleFromSelection = new EventEmitter<StyleTargetTag>();
  @Input() viewMode: DocumentViewMode = 'print';
  @Input() focusMode = false;
  @Input() darkMode = false;
  @Input() darkCanvas = true;
  @Input() pageMovement: PageMovementMode = 'vertical';
  @Input() showRuler = false;
  @Input() showGridlines = false;
  @Input() showTocSidebar = false;
  @Input() zoom = 100;

  @Output() setActiveTab = new EventEmitter<RibbonTab>();
  @Output() updateLayout = new EventEmitter<(prev: DocumentLayoutConfig) => DocumentLayoutConfig>();
  @Output() focusHeaderArea = new EventEmitter<void>();
  @Output() applyTemplateToDocument = new EventEmitter<StyleTemplate>();
  @Output() applyRuleToSelection = new EventEmitter<ElementStyleRule>();
  @Output() openStyleModal = new EventEmitter<void>();
  @Output() openLatexModal = new EventEmitter<void>();
  @Output() insertTabCharacter = new EventEmitter<void>();
  @Output() command = new EventEmitter<{ command: string; value?: string }>();
  @Output() applyHeading = new EventEmitter<string>();
  @Output() applyFontSizePt = new EventEmitter<{ pt: string; cmd: string }>();
  @Output() insertTable = new EventEmitter<{ rows: number; cols: number }>();
  @Output() insertToc = new EventEmitter<void>();
  @Output() insertPageBreak = new EventEmitter<void>();
  @Output() addNewPage = new EventEmitter<void>();
  @Output() insertChecklist = new EventEmitter<void>();
  @Output() insertImage = new EventEmitter<void>();
  @Output() insertLink = new EventEmitter<void>();
  @Output() openIconsModal = new EventEmitter<void>();
  @Output() openSmartArtModal = new EventEmitter<void>();
  @Output() insertShapeHtml = new EventEmitter<string>();
  @Output() insert3dModel = new EventEmitter<void>();
  @Output() insertScreenshot = new EventEmitter<void>();
  @Output() insertComment = new EventEmitter<void>();
  @Output() focusFooterArea = new EventEmitter<void>();
  @Output() insertPageNumber = new EventEmitter<void>();
  @Output() insertTextBox = new EventEmitter<void>();
  @Output() insertWordArt = new EventEmitter<WordArtPreset>();
  @Output() insertDropCap = new EventEmitter<void>();
  @Output() insertSignatureLine = new EventEmitter<void>();
  @Output() insertDateTime = new EventEmitter<void>();
  @Output() insertSymbol = new EventEmitter<string>();
  @Output() insertDrawingCanvas = new EventEmitter<void>();
  @Output() insertDocumentReference = new EventEmitter<void>();
  @Output() insertBlockquote = new EventEmitter<void>();
  @Output() insertCodeBlock = new EventEmitter<string>();
  @Output() insertHorizontalRule = new EventEmitter<void>();
  @Output() insertCalloutBox = new EventEmitter<void>();
  @Output() insertChartTable = new EventEmitter<void>();
  @Output() insertAudioPlaceholder = new EventEmitter<void>();
  @Output() insertVideoPlaceholder = new EventEmitter<void>();
  @Output() applyLineHeight = new EventEmitter<string>();
  @Output() applySectionColumns = new EventEmitter<SectionColumnsPreset>();
  @Output() applyParagraphSpacingAndIndent = new EventEmitter<{
    indentLeftCm?: number;
    indentRightCm?: number;
    spaceBeforePt?: number;
    spaceAfterPt?: number;
  }>();
  @Output() copyFormat = new EventEmitter<void>();
  @Output() importClick = new EventEmitter<void>();
  @Output() exportWord = new EventEmitter<void>();
  @Output() exportHtml = new EventEmitter<void>();
  @Output() exportMarkdown = new EventEmitter<void>();
  @Output() exportTxt = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() readAloud = new EventEmitter<void>();
  @Output() setViewMode = new EventEmitter<DocumentViewMode>();
  @Output() setFocusMode = new EventEmitter<boolean>();
  @Output() setDarkMode = new EventEmitter<boolean>();
  @Output() setDarkCanvas = new EventEmitter<boolean>();
  @Output() setPageMovement = new EventEmitter<PageMovementMode>();
  @Output() setShowRuler = new EventEmitter<boolean>();
  @Output() setShowGridlines = new EventEmitter<boolean>();
  @Output() setShowTocSidebar = new EventEmitter<boolean>();
  @Output() setZoom = new EventEmitter<number>();

  @ViewChild('toolbarRef') toolbarRef?: ElementRef<HTMLDivElement>;

  readonly i18n = inject(I18nService, { optional: true });
  readonly isCollapsed = signal<boolean>(false);

  t(key: string, paramsOrFallback?: Record<string, string | number> | string): string {
    if (typeof paramsOrFallback === 'string') {
      const val = this.i18n?.t ? this.i18n.t(key) : null;
      return val && val !== key ? val : paramsOrFallback;
    }
    return this.i18n?.t ? this.i18n.t(key, paramsOrFallback) : key;
  }

  readonly Math = Math;
  readonly Number = Number;
  readonly tabs: { id: RibbonTab; labelKey: string }[] = [
    { id: 'home', labelKey: 'word.tab.home' },
    { id: 'insert', labelKey: 'word.tab.insert' },
    { id: 'styles', labelKey: 'word.tab.styles' },
    { id: 'layout', labelKey: 'word.tab.layout' },
    { id: 'view', labelKey: 'word.tab.view' },
    { id: 'import', labelKey: 'word.tab.import' },
    { id: 'export', labelKey: 'word.tab.export' },
  ];
  readonly paperFormatList = PAPER_FORMAT_LIST;
  readonly borderStylesList = BORDER_STYLES_LIST;
  readonly marginPresets = Object.entries(MARGIN_PRESETS).map(([key, preset]) => ({ key, preset }));
  readonly fontFamilies = FONT_FAMILIES;
  readonly fontSizes = FONT_SIZES;
  readonly textColors = TEXT_COLORS;
  readonly highlightColors = HIGHLIGHT_COLORS;
  readonly codeLanguages = CODE_LANGUAGES;
  readonly headingTags: StyleTargetTag[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
  readonly quickRuleTags: StyleTargetTag[] = ['H1', 'H2', 'H3', 'P'];
  readonly lineHeights = ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5', '3.0'];
  readonly viewModes: { id: DocumentViewMode; labelKey: string; icon: string }[] = [
    { id: 'read', labelKey: 'word.view.read', icon: 'book-open' },
    { id: 'print', labelKey: 'word.view.print', icon: 'file-text' },
    { id: 'web', labelKey: 'word.view.web', icon: 'globe' },
    { id: 'outline', labelKey: 'word.view.outline', icon: 'list-tree' },
    { id: 'draft', labelKey: 'word.view.draft', icon: 'align-left' },
  ];
  readonly columnOptions: { id: SectionColumnsPreset; label: string; desc: string }[] = [
    { id: '1', label: 'Una columna (1)', desc: 'Restaurar sección a 1 columna' },
    { id: '2', label: 'Dos columnas (2)', desc: 'Divide la selección en 2 columnas iguales' },
    { id: '3', label: 'Tres columnas (3)', desc: 'Divide la selección en 3 columnas iguales' },
    { id: 'left', label: 'Izquierda más estrecha', desc: 'Columna izquierda 32% / derecha 68%' },
    { id: 'right', label: 'Derecha más estrecha', desc: 'Columna izquierda 68% / derecha 32%' },
  ];

  readonly openDropdown = signal<string | null>(null);
  readonly selectedCodeLang = signal<string>('JavaScript');
  readonly customMarginTopCm = signal<number>(0);
  readonly customMarginBottomCm = signal<number>(0);
  readonly customMarginLeftCm = signal<number>(0);
  readonly customMarginRightCm = signal<number>(0);

  private readonly handleClickOutside = (e: MouseEvent): void => {
    if (this.toolbarRef && !this.toolbarRef.nativeElement.contains(e.target as Node)) {
      this.openDropdown.set(null);
    }
  };

  ngOnInit(): void {
    this.syncCustomMargins();
    document.addEventListener('mousedown', this.handleClickOutside);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['layoutConfig']) {
      this.syncCustomMargins();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
  }

  get activePaperPreset(): PaperFormatPreset {
    return PAPER_FORMAT_PRESETS[this.layoutConfig.paperFormatId] || PAPER_FORMAT_PRESETS['letter'];
  }

  activePaperPresetFor(formatId: PaperFormatId): PaperFormatPreset {
    return PAPER_FORMAT_PRESETS[formatId];
  }

  get activeStyleTemplate(): StyleTemplate {
    return (
      this.styleTemplates.find((t) => t.id === this.activeTemplateId) || this.styleTemplates[0]
    );
  }

  private syncCustomMargins(): void {
    if (!this.layoutConfig) return;
    const toCm = (px: number) => Number((px / 28.35).toFixed(2));
    this.customMarginTopCm.set(toCm(this.layoutConfig.margins.topPx));
    this.customMarginBottomCm.set(toCm(this.layoutConfig.margins.bottomPx));
    this.customMarginLeftCm.set(toCm(this.layoutConfig.margins.leftPx));
    this.customMarginRightCm.set(toCm(this.layoutConfig.margins.rightPx));
  }

  toggleDropdown(name: string): void {
    this.openDropdown.update((prev) => (prev === name ? null : name));
  }

  keepSelection(e: Event): void {
    e.preventDefault();
  }

  toggleCollapse(event?: MouseEvent): void {
    if (event) {
      const target = event.target as HTMLElement;
      if (target?.closest?.('input, textarea, select')) return;
    }
    this.isCollapsed.update((c) => !c);
  }

  onTabsHeaderDblClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target?.closest?.('button.nav-panel-btn, button.collapse-toggle-btn')) return;
    this.toggleCollapse();
  }

  onPillDblClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target?.closest?.('button, input, select, textarea, .style-tile, .swatch')) {
      this.toggleCollapse();
    }
  }

  selectTab(tabId: RibbonTab): void {
    if (this.isCollapsed()) {
      this.isCollapsed.set(false);
    }
    this.setActiveTab.emit(tabId);
    this.openDropdown.set(null);
  }

  toggleNavPanel(): void {
    this.setShowTocSidebar.emit(!this.showTocSidebar);
  }

  execCommand(command: string, value?: string): void {
    this.command.emit({ command, value });
  }

  selectParagraph(): void {
    this.applyHeading.emit('P');
    this.openDropdown.set(null);
  }

  selectHeadingRule(rule: ElementStyleRule): void {
    this.applyRuleToSelection.emit(rule);
    this.openDropdown.set(null);
  }

  openStyleDesigner(): void {
    this.openDropdown.set(null);
    this.openStyleModal.emit();
  }

  selectFontFamily(value: string): void {
    this.command.emit({ command: 'fontName', value });
    this.openDropdown.set(null);
  }

  selectFontSize(pt: string, cmd: string): void {
    this.applyFontSizePt.emit({ pt, cmd });
    this.openDropdown.set(null);
  }

  applyForeColor(color: string): void {
    this.command.emit({ command: 'foreColor', value: color });
    this.openDropdown.set(null);
  }

  applyHiliteColor(color: string): void {
    this.command.emit({ command: 'hiliteColor', value: color });
    this.openDropdown.set(null);
  }

  selectLineHeight(lineHeight: string): void {
    this.applyLineHeight.emit(lineHeight);
    this.openDropdown.set(null);
  }

  insertLineBreak(): void {
    this.command.emit({ command: 'insertHTML', value: '<br/>' });
  }

  insertInlineCode(): void {
    const sel = window.getSelection()?.toString() || 'código';
    const code = document.createElement('code'); code.textContent = sel;
    this.command.emit({ command: 'insertHTML', value: code.outerHTML });
  }

  selectStyleTemplate(tpl: StyleTemplate): void {
    this.applyTemplateToDocument.emit(tpl);
  }

  selectTableSize(rows: number, cols: number): void {
    this.insertTable.emit({ rows, cols });
  }

  closeTablePicker(): void {
    this.openDropdown.set(null);
  }

  selectCodeLanguage(lang: string): void {
    this.selectedCodeLang.set(lang);
    this.insertCodeBlock.emit(lang);
    this.openDropdown.set(null);
  }

  applyColumns(preset: SectionColumnsPreset): void {
    this.applySectionColumns.emit(preset);
    this.openDropdown.set(null);
  }

  applyParagraphSpacing(spacingPt: number): void {
    this.applyParagraphSpacingAndIndent.emit({ spaceAfterPt: spacingPt });
  }

  applyFontPairing(font: string): void {
    this.command.emit({ command: 'fontName', value: font });
  }

  toggleOrientation(): void {
    this.updateLayout.emit((prev) => ({
      ...prev,
      orientation: prev.orientation === 'portrait' ? 'landscape' : 'portrait',
    }));
  }

  selectPaperFormat(formatId: PaperFormatId): void {
    this.updateLayout.emit((prev) => ({ ...prev, paperFormatId: formatId }));
    this.openDropdown.set(null);
  }

  selectMarginPreset(preset: PageMarginsConfig): void {
    this.updateLayout.emit((prev) => ({ ...prev, margins: preset }));
    this.openDropdown.set(null);
  }

  toggleLineNumbers(): void {
    this.updateLayout.emit((prev) => ({ ...prev, showLineNumbers: !prev.showLineNumbers }));
  }

  selectPageBorder(style: PageBorderStyle): void {
    this.updateLayout.emit((prev) => ({
      ...prev,
      pageBorder: { ...prev.pageBorder, style, top: true, bottom: true, left: true, right: true },
    }));
  }

  applyCustomMargins(event: Event): void {
    event.preventDefault();
    const toPx = (cm: number) => Math.max(14, Math.min(200, Math.round(cm * 28.35)));
    this.updateLayout.emit((prev) => ({
      ...prev,
      margins: {
        topPx: toPx(this.customMarginTopCm()),
        bottomPx: toPx(this.customMarginBottomCm()),
        leftPx: toPx(this.customMarginLeftCm()),
        rightPx: toPx(this.customMarginRightCm()),
        label: `Personalizado (${this.customMarginTopCm()} / ${this.customMarginLeftCm()} cm)`,
      },
    }));
    this.openDropdown.set(null);
  }

  applyIndentLeft(value: number | string): void {
    this.applyParagraphSpacingAndIndent.emit({ indentLeftCm: Math.max(0, Number(value)) });
  }

  applyIndentRight(value: number | string): void {
    this.applyParagraphSpacingAndIndent.emit({ indentRightCm: Math.max(0, Number(value)) });
  }

  applySpaceBefore(value: number | string): void {
    this.applyParagraphSpacingAndIndent.emit({ spaceBeforePt: Math.max(0, Number(value)) });
  }

  applySpaceAfter(value: number | string): void {
    this.applyParagraphSpacingAndIndent.emit({ spaceAfterPt: Math.max(0, Number(value)) });
  }

  selectViewMode(mode: DocumentViewMode): void {
    this.setViewMode.emit(mode);
  }

  toggleFocusMode(): void {
    this.setFocusMode.emit(!this.focusMode);
  }

  toggleDarkMode(): void {
    this.setDarkMode.emit(!this.darkMode);
  }

  toggleDarkCanvas(): void {
    this.setDarkCanvas.emit(!this.darkCanvas);
  }

  selectPageMovement(mode: PageMovementMode): void {
    this.setPageMovement.emit(mode);
  }

  toggleRuler(checked: boolean): void {
    this.setShowRuler.emit(checked);
  }

  toggleGridlines(checked: boolean): void {
    this.setShowGridlines.emit(checked);
  }

  toggleTocSidebar(checked: boolean): void {
    this.setShowTocSidebar.emit(checked);
  }

  zoomOut(): void {
    this.setZoom.emit(Math.max(50, this.zoom - 10));
  }

  zoomIn(): void {
    this.setZoom.emit(Math.min(160, this.zoom + 10));
  }

  applyZoomPreset(zoom: number, movement: PageMovementMode): void {
    this.setZoom.emit(zoom);
    this.setPageMovement.emit(movement);
  }
}
