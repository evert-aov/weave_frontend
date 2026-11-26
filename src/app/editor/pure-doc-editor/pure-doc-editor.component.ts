import { LucideDynamicIcon, provideLucideIcons } from '../../shared/components/ng-lucide-icon.directive';
import { aiTableFields, aiTableInsertionFields, applyAiTableEdits } from './utils/ai-table-edit';
import {
  WORD_CONTROL_TARGET, applyWordControlPayload, wordControlField, type WordControlHost, } from './utils/ai-word-control';
import { WordCanvasEditorComponent } from './components/word-canvas-editor/word-canvas-editor.component';
import type { CanvasHistoryMeta } from './engine/canvas-edit-session';
import type { DocumentSelection } from './engine/document-model';
import { HybridPageDirective } from './engine/hybrid-page.directive';
import { styleTableElement } from './utils/table-styling-dom';
import { ProofreadingDirective } from '../../shared/directives/proofreading.directive';
import { ProofreadingControlComponent } from '../../shared/components/proofreading-control/proofreading-control.component';
import { WordTocController } from './controllers/word-toc.controller';
import { WordAcademicController } from './controllers/word-academic.controller';
import type { BibliographicSource } from './models/academic.model';
import type { AcademicSection } from './models/academic-sections.model';
import { WordAcademicPanelComponent } from './components/word-academic-panel/word-academic-panel.component';
import { WordCommentsPanelComponent } from './components/word-comments-panel/word-comments-panel.component';
import { WordInteractiveRulerComponent } from './components/word-interactive-ruler/word-interactive-ruler.component';
import { WordImagesController } from './controllers/word-images.controller';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { domTextFields, applyHtmlText } from '../../core/utils/ai-edit-text';
import { resolveDocumentPageSections } from './utils/page-section-layout';
import type { SectionPageConfig } from './models/word-document.model';
import {
  ChangeDetectionStrategy, Component, HostListener, Input, OnInit, AfterViewInit, AfterViewChecked, OnChanges, OnDestroy, SimpleChanges, ElementRef, ViewChild, ViewChildren, QueryList, ViewEncapsulation, inject, signal, input, untracked, computed, effect, ChangeDetectorRef, NgZone, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lucideFileText, lucideCheckCircle2, lucidePlus, lucideTrash2, lucideColumns, lucideRows, lucideDownload, lucideUpload, lucideFilePlus2, lucideChevronUp, lucideChevronDown, lucidePalette, lucideChevronsLeft, lucideChevronsRight, lucideMinimize2 } from '@ng-icons/lucide';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentFlowService } from './services/document-flow.service';
import {
  DocumentCommentThread,
  DocumentRevisionItem,
  DocxDocumentProperties,
  DocumentLayoutConfig,
  DocumentPage,
  DocumentStats,
  DocumentViewMode,
  EditorActiveFormats,
  ElementStyleRule,
  HeadingItem,
  PageMovementMode,
  RibbonTab,
  SectionColumnsPreset,
  StyleTargetTag,
  StyleTemplate,
  TableItem,
  TableStyleRule,
} from './models/word-document.model';
import {
  BUILTIN_STYLE_TEMPLATES,
  DEFAULT_LAYOUT_CONFIG,
  INITIAL_DOCUMENT_PAGES,
  PAPER_FORMAT_PRESETS,
} from './constants/word-document.constants';
import { WordPageAnalysisCache } from './utils/page-analysis-cache';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { DialogService } from '../../core/services/dialog.service';
import { WordRibbonComponent } from './components/word-ribbon/word-ribbon.component';
import {
  WordSearchPanelComponent,
  WordSearchAction,
  WordSearchConfig,
} from './components/word-search-panel/word-search-panel.component';
import { WordTocSidebarComponent } from './components/word-toc-sidebar/word-toc-sidebar.component';
import { WordDocxBannerComponent } from './components/word-docx-banner/word-docx-banner.component';
import {
  WordStyleTemplatesModalComponent,
} from './components/word-style-templates-modal/word-style-templates-modal.component';
import { WordLatexModalComponent } from './components/word-latex-modal/word-latex-modal.component';
import { WordSmartArtModalComponent } from './components/word-smartart-modal/word-smartart-modal.component';
import { WordIconsModalComponent } from './components/word-icons-modal/word-icons-modal.component';
import { SmartArtItem, WordArtPreset } from './models/word-insert.model';
import type { AnyDocData, HistorySnapshot, SerializedDocSectionModel, TableResizeState } from './models/word-editor-state.model';
import { DEFAULT_FORMATS, DEFAULT_DOC_TITLE } from './constants/word-editor.constants';
import { WordPersistenceController } from './controllers/word-persistence.controller';
import { WordFlowController } from './controllers/word-flow.controller';
import { WordFormattingController, clearFormattingInRange } from './controllers/word-formatting.controller';
import { WordLayoutController } from './controllers/word-layout.controller';
import { WordInputController } from './controllers/word-input.controller';
import { WordInsertController } from './controllers/word-insert.controller';
import { WordMediaController } from './controllers/word-media.controller';
import { WordTablesController } from './controllers/word-tables.controller';
import { WordNavigationController } from './controllers/word-navigation.controller';
import { WordSearchController } from './controllers/word-search.controller';
import { WordFilesController } from './controllers/word-files.controller';
import { WordReviewController } from './controllers/word-review.controller';
import type { WordEditorHooks } from './controllers/word-editor-hooks';

/**
 * Editor de documento multipágina (Word) standalone para Weave.
 * Orquesta la barra de herramientas, el lienzo multipágina contentEditable,
 * el panel de índice, los modales (LaTeX, plantillas) y la persistencia
 * en `note.docData` mediante `NotesService`.
 */
@Component({
  selector: 'app-pure-doc-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    WordCanvasEditorComponent, HybridPageDirective, ProofreadingDirective, ProofreadingControlComponent,
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    WordRibbonComponent,
    WordSearchPanelComponent,
    WordTocSidebarComponent,
    WordDocxBannerComponent,
    WordStyleTemplatesModalComponent,
    WordLatexModalComponent,
    WordSmartArtModalComponent,
    WordIconsModalComponent,
    WordAcademicPanelComponent,
    WordCommentsPanelComponent,
    WordInteractiveRulerComponent,
  ],
  providers: [
    provideLucideIcons({ lucideFileText,
      lucideCheckCircle2,
      lucidePlus,
      lucideTrash2,
      lucideColumns,
      lucideRows,
      lucideDownload,
      lucideUpload,
      lucideFilePlus2,
      lucideChevronUp,
      lucideChevronDown,
      lucidePalette,
      lucideChevronsLeft,
      lucideChevronsRight,
      lucideMinimize2 }),
  ],
  templateUrl: './pure-doc-editor.component.html',
  styleUrls: ['./pure-doc-editor.component.css'],
})
export class PureDocEditorComponent implements OnInit, AfterViewInit, AfterViewChecked, OnChanges, OnDestroy {
  readonly active = input(true);
  @Input({ required: true }) note!: Note;

  @ViewChild('mainScroll') mainScrollRef?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('imageFileInput') imageFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChildren('pageBody') pageBodyRefs?: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('headerEl') headerRefs?: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('footerEl') footerRefs?: QueryList<ElementRef<HTMLDivElement>>;

  private readonly notesService = inject(NotesService);
  private readonly rawI18n = inject(I18nService, { optional: true });
  readonly i18n = {
    t: (key: string, params?: Record<string, string | number>): string => {
      return this.rawI18n?.t ? this.rawI18n.t(key, params) : key;
    },
    currentLang: () => {
      return this.rawI18n?.currentLang ? this.rawI18n.currentLang() : 'es';
    }
  };
  private readonly wordCompat = inject(WordCompatibilityService);
  private readonly latexRenderer = inject(LatexRendererService);
  private readonly imageStore = inject(ImageStoreService);
  private readonly documentFlow = inject(DocumentFlowService);
  private readonly references = inject(DocumentReferenceService);
  private readonly dialogs = inject(DialogService);
  private readonly themeService = inject(ThemeService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef, { optional: true });

  // ---------------------------------------------------------------------------
  // Estado reactivo
  // ---------------------------------------------------------------------------
  readonly bibliographicSources = signal<BibliographicSource[]>([]);
  readonly docTitle = signal<string>(DEFAULT_DOC_TITLE);
  readonly pages = signal<DocumentPage[]>([...INITIAL_DOCUMENT_PAGES]);
  readonly layoutConfig = signal<DocumentLayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  readonly styleTemplates = signal<StyleTemplate[]>([...BUILTIN_STYLE_TEMPLATES]);
  readonly activeTemplateId = signal<string>('corporate-modern');
  readonly styleModalOpen = signal<boolean>(false);
  readonly selectedTableDesign = signal<{ rule: TableStyleRule; fixed: boolean } | undefined>(undefined);

  readonly activePageIndex = signal<number>(0);
  readonly docxProperties = signal<DocxDocumentProperties | null>(null);
  readonly importedTocEntries = signal<HeadingItem[]>([]);
  readonly activeTab = signal<RibbonTab>('home');
  readonly pdfExporting = signal(false);
  readonly pdfExportMessage = signal('');
  readonly pdfExportFailed = signal(false);
  readonly toastMessage = signal('');
  readonly toastTone = signal<'info' | 'success' | 'error'>('info');
  readonly activeFeedbackToast = computed<{
    text: string;
    tone: 'loading' | 'success' | 'error' | 'info';
    dismissible: boolean;
  } | null>(() => {
    const exportMsg = this.pdfExportMessage();
    if (exportMsg) {
      const tone = this.pdfExportFailed() ? 'error' : (this.pdfExporting() ? 'loading' : 'success');
      return { text: exportMsg, tone, dismissible: !this.pdfExporting() };
    }
    const toastMsg = this.toastMessage();
    if (toastMsg) {
      return { text: toastMsg, tone: this.toastTone(), dismissible: true };
    }
    return null;
  });
  readonly showFormattingMarks = signal(false);
  readonly headingNumbering = signal(false);
  readonly searchMode = signal<'find' | 'replace' | null>(null);
  readonly searchQuery = signal('');
  readonly replacementText = signal('');
  readonly searchCase = signal(false);
  readonly searchWholeWord = signal(false);
  readonly searchStatus = signal('');

  private get pendingTypingStyle(): Record<string, string> | null { return this.formattingController.pendingTypingStyle; }
  private set pendingTypingStyle(value: Record<string, string> | null) { this.formattingController.pendingTypingStyle = value; }

  readonly formats = signal<EditorActiveFormats>({ ...DEFAULT_FORMATS }, {
    equal: (previous, next) => (Object.keys(previous) as (keyof EditorActiveFormats)[]).every(key => previous[key] === next[key]),
  });

  readonly viewMode = signal<DocumentViewMode>('print');
  readonly focusMode = signal<boolean>(false);
  readonly darkMode = computed<boolean>(() => this.themeService?.isDark() ?? false);
  readonly darkCanvas = signal<boolean>(true);
  readonly pageMovement = signal<PageMovementMode>('vertical');
  readonly showRuler = signal<boolean>(true);
  readonly showGridlines = signal<boolean>(false);
  readonly showTocSidebar = signal<boolean>(true);
  readonly zoom = signal<number>(100);
  readonly comments = signal<DocumentCommentThread[]>([]);
  readonly commentsPanelOpen = signal<boolean>(false);
  readonly activeCommentId = signal<string | null>(null);
  readonly trackChangesEnabled = signal<boolean>(false);
  readonly hideCommentsOnExport = signal<boolean>(false);
  readonly revisions = signal<DocumentRevisionItem[]>([]);

  readonly statusMessage = signal<string>(
    'Word Studio Pro: Columnas por sección, Márgenes personalizados, Fórmulas LaTeX editables/eliminables y Modos de Vista'
  );
  readonly formatPainterActive = signal<boolean>(false);
  readonly copiedInlineStyle = signal<ElementStyleRule | null>(null);
  readonly activeTableCell = signal<HTMLTableCellElement | null>(null);
  readonly activeTableRowTopBorder = signal<boolean>(false);
  readonly activeTableVerticalAlign = signal<'top' | 'middle' | 'bottom'>('top');
  readonly activeTableRepeatHeader = signal<boolean>(true);
  readonly tableContextMenu = signal<{ x: number; y: number } | null>(null);
  readonly tableShadingSwatches = ['transparent', '#f8fafc', '#f1f5f9', '#dbeafe', '#fef3c7', '#dcfce7', '#fee2e2'];
  readonly latexModalOpen = signal<boolean>(false);
  readonly smartArtModalOpen = signal<boolean>(false);
  readonly iconsModalOpen = signal<boolean>(false);
  readonly editingLatexElement = signal<HTMLElement | null>(null);
  readonly editingLatexNodeId = signal<string | null>(null);
  readonly editingLatexCode = signal<string | undefined>(undefined);
  readonly pendingScrollHeadingId = signal<string | null>(null);

  private lastScrollTop = 0;
  private lastScrollLeft = 0;

  onMainScroll(): void {
    if (!this.active() || !this.mainScrollRef?.nativeElement) return;
    const el = this.mainScrollRef.nativeElement;
    if (el.scrollTop > 0) this.lastScrollTop = el.scrollTop;
    if (el.scrollLeft > 0) this.lastScrollLeft = el.scrollLeft;
  }

  readonly rulerTicks = Array.from({ length: 22 }, (_, i) => i);
  readonly lineNumberTicks = Array.from({ length: 42 }, (_, i) => i);

  // ---------------------------------------------------------------------------
  // Estado derivado
  // ---------------------------------------------------------------------------
  private readonly pageAnalysis = new WordPageAnalysisCache();
  private static canUseCanvas(): boolean {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext?.('2d');
  }
  readonly canvasEnabled = signal(PureDocEditorComponent.canUseCanvas());
  readonly loadedModelSections = signal<SerializedDocSectionModel[] | undefined>(undefined);
  @ViewChild(WordCanvasEditorComponent) canvasEditor?: WordCanvasEditorComponent;
  readonly canvasGeometry = computed(() => ({ width: this.sheetWidthPx(), height: this.sheetHeightPx(),
    top: this.pagePaddingTop(), right: this.pagePaddingRight(), bottom: this.pagePaddingBottom(), left: this.pagePaddingLeft() }));
  readonly canvasStyleTemplate = computed(() => this.styleTemplates().find(template => template.id === this.activeTemplateId()) || this.styleTemplates()[0]);
  readonly canvasDefaults = computed(() => {
    const apa = this.layoutConfig().apa;
    const tpl = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
    const pRule = tpl?.rules.P;
    const fontFamily = apa?.fontFamily || pRule?.fontFamily || 'Times New Roman';
    const fontSizePt = apa?.fontSizePt || pRule?.fontSizePt || 11;
    const fontPx = Math.round((fontSizePt * 96 / 72) * 100) / 100;
    const lineHeightRatio = apa ? 2 : (pRule?.lineHeight || 1.15);
    const lineHeight = Math.round(fontPx * lineHeightRatio * 1.15 * 100) / 100;
    const isApa = Boolean(apa) || tpl?.academicStyle === 'apa7';
    return {
      font: `${fontPx}px "${fontFamily}"`,
      lineHeight,
      apaBorders: isApa,
    };
  });
  acceptCanvasPages(pages: DocumentPage[]): void {
    if(!this.canvasEnabled())return;
    this.loadedModelSections.set(undefined);
    this.flowController.pendingRenderPages=null;
    this.pages.set(pages);
    if (this.trackChangesEnabled() || this.revisions().length > 0 || this.commentsPanelOpen()) {
      this.reviewController.refreshRevisions();
    }
  }
  canvasCheckpoint():void {
    if(this.canvasEnabled()&&this.canvasEditor?.session)return;
    this.persistenceController.pushUndoSnapshot(this.pages());
  }
  readonly analysis = computed(() => {
    const currentPages = this.pages();
    const allHeadings: HeadingItem[] = [];
    const allTables: TableItem[] = [];
    let totalWords = 0;
    let totalChars = 0;
    let totalParagraphs = 0;

    for (let i = 0; i < currentPages.length; i++) {
      const res = this.pageAnalysis.get(currentPages[i], i);
      allHeadings.push(...res.headings);
      allTables.push(...res.tables);
      totalWords += res.words;
      totalChars += res.chars;
      totalParagraphs += res.paragraphs;
    }

    const imported = this.importedTocEntries();
    const finalHeadings =
      allHeadings.length >= imported.length ? allHeadings : [...allHeadings, ...imported];

    const readingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));
    const stats: DocumentStats = {
      words: totalWords,
      characters: totalChars,
      paragraphs: totalParagraphs,
      readingTimeMinutes,
      pages: currentPages.length,
    };

    return { headings: finalHeadings, tables: allTables, stats };
  });

  readonly headings = computed(() => this.analysis().headings);
  readonly tables = computed(() => this.analysis().tables);
  readonly stats = computed(() => this.analysis().stats);

  readonly isReadMode = computed(() => this.viewMode() === 'read');
  readonly resolvedPageSections = computed(() => resolveDocumentPageSections(this.pages(), this.layoutConfig()));
  readonly activeSectionInfo = computed(() => {
    const resolved = this.resolvedPageSections();
    return resolved[this.activePageIndex()] ?? resolved[0] ?? null;
  });

  readonly activePaperPreset = computed(
    () => PAPER_FORMAT_PRESETS[this.layoutConfig().paperFormatId] || PAPER_FORMAT_PRESETS['letter']
  );

  private readonly baseWidthPx = computed(() => {
    const layout = this.layoutConfig();
    return layout.paperFormatId === 'custom' && layout.customWidthPx
      ? layout.customWidthPx
      : this.activePaperPreset().widthPx;
  });

  private readonly baseHeightPx = computed(() => {
    const layout = this.layoutConfig();
    return layout.paperFormatId === 'custom' && layout.customHeightPx
      ? layout.customHeightPx
      : this.activePaperPreset().heightPx;
  });

  readonly sheetWidthPx = computed(() => {
    if (this.viewMode() === 'web') return 1080;
    return this.layoutConfig().orientation === 'landscape'
      ? Math.max(this.baseWidthPx(), this.baseHeightPx())
      : Math.min(this.baseWidthPx(), this.baseHeightPx());
  });

  readonly sheetHeightPx = computed(() => {
    if (this.viewMode() === 'web' || this.viewMode() === 'draft') return 780;
    return this.layoutConfig().orientation === 'landscape'
      ? Math.min(this.baseWidthPx(), this.baseHeightPx())
      : Math.max(this.baseWidthPx(), this.baseHeightPx());
  });

  readonly maxBodyContentHeightPx = computed(() => {
    const layout = this.layoutConfig();
    return Math.max(
      40,
      this.sheetHeightPx() -
        layout.margins.topPx -
        layout.margins.bottomPx -
        (layout.showHeaderFooter && !layout.apa && this.viewMode() === 'print' ? 76 : 0)
    );
  });

  // ---------------------------------------------------------------------------
  // Estado interno
  // ---------------------------------------------------------------------------
  private get pageBodyMap(): typeof this.flowController.pageBodyMap { return this.flowController.pageBodyMap; }

  private get undoStack(): HistorySnapshot[] { return this.persistenceController.undoStack; }
  private set undoStack(value: HistorySnapshot[]) { this.persistenceController.undoStack = value; }
  private get redoStack(): HistorySnapshot[] { return this.persistenceController.redoStack; }
  private set redoStack(value: HistorySnapshot[]) { this.persistenceController.redoStack = value; }

  readonly documentReady = signal(false);
  private get hydrationVersion(): typeof this.persistenceController.hydrationVersion { return this.persistenceController.hydrationVersion; }
  private set hydrationVersion(value: typeof this.persistenceController.hydrationVersion) { this.persistenceController.hydrationVersion = value; }
  private destroyed = false;
  private get loadedNoteId(): string | null { return this.persistenceController.loadedNoteId; }
  private set loadedNoteId(value: string | null) { this.persistenceController.loadedNoteId = value; }
  private get saveTimeout(): ReturnType<typeof setTimeout> | null { return this.persistenceController.saveTimeout; }
  private set saveTimeout(value: ReturnType<typeof setTimeout> | null) { this.persistenceController.saveTimeout = value; }

  private querySubscriptions: { unsubscribe(): void }[] = [];
  private mapsDirty = false;
  private get flowFrame(): number | null { return this.flowController.flowFrame; }
  private get pendingRenderPages(): DocumentPage[] | null { return this.flowController.pendingRenderPages; }
  private set pendingRenderPages(value: DocumentPage[] | null) { this.flowController.pendingRenderPages = value; }

  private get tableResizeState(): TableResizeState | null { return this.tablesController.tableResizeState; }
  private set tableResizeState(value: TableResizeState | null) { this.tablesController.tableResizeState = value; }
  private get tableResizeAbort(): AbortController | null { return this.tablesController.tableResizeAbort; }
  private set tableResizeAbort(value: AbortController | null) { this.tablesController.tableResizeAbort = value; }
  private get lastFlowPages(): DocumentPage[] | null { return this.flowController.lastFlowPages; }
  private set lastFlowPages(value: DocumentPage[] | null) { this.flowController.lastFlowPages = value; }

  private get composing(): typeof this.inputController.composing { return this.inputController.composing; }
  private get lastInputTime(): typeof this.inputController.lastInputTime { return this.inputController.lastInputTime; }
  private set lastInputTime(value: typeof this.inputController.lastInputTime) { this.inputController.lastInputTime = value; }

  private get bodyResizeObserver(): ResizeObserver | undefined { return this.flowController.bodyResizeObserver; }
  private set bodyResizeObserver(value: ResizeObserver | undefined) { this.flowController.bodyResizeObserver = value; }

  private get onFontsLoaded(): typeof this.flowController.onFontsLoaded { return this.flowController.onFontsLoaded; }
  private get onAssetLoaded(): typeof this.flowController.onAssetLoaded { return this.flowController.onAssetLoaded; }

  private readonly eventZone = inject(NgZone);
  private selectionFrame: number | null = null;
  private viewportFrame: number | null = null;
  private savedCanvasSelection: { section: number; selection: DocumentSelection | null } | null = null;
  private readonly handleSelectionChange = (): void => {
    if (!this.active() || this.selectionFrame !== null) return;
    this.selectionFrame = requestAnimationFrame(() => {
      this.selectionFrame = null;
      if (this.active() && !this.destroyed) this.updateSelectionFormats();
    });
  };

  // Controllers share live state through typed ports and remain scoped to this editor.
  private readonly controllerHooks: WordEditorHooks = (() => {
    const editor = this;
    return {
      applyActiveListRules: (...args) => this.applyActiveListRules(...args),
      applyPendingScroll: (...args) => this.applyPendingScroll(...args),
      canvasMeta: () => this.captureCanvasMeta(),
      canvasMode: () => this.canvasEnabled() && !!this.canvasEditor?.session,
      canvasSession: () => (this.canvasEnabled() ? this.canvasEditor?.session : undefined),
      captureHistory: (...args) => this.captureHistory(...args),
      get cdr() { return editor.cdr; },
      collectDocData: (...args) => this.collectDocData(...args),
      commitCanvasMetaLayout: () => {
        if (!this.canvasEnabled() || !this.canvasEditor?.session) return;
        this.canvasEditor.publishNow(
          this.canvasGeometry(),
          this.canvasDefaults(),
          this.canvasStyleTemplate(),
          this.headingNumbering(),
        );
        this.updateSelectionFormats();
        this.scheduleAutoSave(this.collectDocData());
      },
      commitCanvasModelMutation: (options) => {
        if (!this.canvasEnabled() || !this.canvasEditor?.session) return;
        this.canvasEditor.publishNow(
          this.canvasGeometry(),
          this.canvasDefaults(),
          this.canvasStyleTemplate(),
          this.headingNumbering(),
        );
        if (options?.activePageIndex !== undefined) {
          this.activePageIndex.set(options.activePageIndex);
        }
        this.updateSelectionFormats();
        this.scheduleAutoSave(this.collectDocData());
      },
      get composing() { return editor.composing; },
      get destroyed() { return editor.destroyed; },
      set destroyed(value) { editor.destroyed = value; },
      get dialogs() { return editor.dialogs; },
      get documentFlow() { return editor.documentFlow; },
      ensureCanvasObjectIds: () => { this.canvasEditor?.session?.assignMissingObjectIds?.(); },
      exportCanvasModelSections: () =>
        this.canvasEnabled() ? this.canvasEditor?.session?.exportSectionModels?.() : undefined,
      finishDocumentMutation: (...args) => this.finishDocumentMutation(...args),
      focusCanvas: () => { this.canvasEditor?.focus?.(); },
      getActivePageElement: (...args) => this.getActivePageElement(...args),
      getCanvasReadableText: (pageIndex) =>
        this.canvasEnabled()
          ? (this.canvasEditor?.session?.getReadableText?.(pageIndex) ?? null)
          : null,
      getLivePagesSnapshot: (...args) => this.getLivePagesSnapshot(...args),
      get imageStore() { return editor.imageStore; },
      get lastFlowPages() { return editor.lastFlowPages; },
      set lastFlowPages(value) { editor.lastFlowPages = value; },
      get lastInputTime() { return editor.lastInputTime; },
      set lastInputTime(value) { editor.lastInputTime = value; },
      get latexRenderer() { return editor.latexRenderer; },
      hasSelection: () => {
        if (this.canvasEnabled() && this.canvasEditor?.session) {
          return Boolean(this.canvasEditor.session.selection);
        }
        const sel = window.getSelection();
        return Boolean(sel && sel.rangeCount > 0);
      },
      liveBodies: (...args) => this.liveBodies(...args),
      insertCanvasHtml: (html, keepInlineCaret) => {
        const session = this.canvasEditor?.session;
        if (!this.canvasEnabled() || !session) return false;
        const ok = session.insertHtml(html, keepInlineCaret, this.activePageIndex());
        if (ok) {
          this.canvasEditor!.publishNow();
          this.updateSelectionFormats();
        }
        return ok;
      },
      get loadedNoteId() { return editor.loadedNoteId; },
      set loadedNoteId(value) { editor.loadedNoteId = value; },
      get notesService() { return editor.notesService; },
      get pendingRenderPages() { return editor.pendingRenderPages; },
      set pendingRenderPages(value) { editor.pendingRenderPages = value; },
      get pendingTypingStyle() { return editor.pendingTypingStyle; },
      set pendingTypingStyle(value) { editor.pendingTypingStyle = value; },
      prepareRibbonSelection: (...args) => this.prepareRibbonSelection(...args),
      pushCanvasMetaHistory: () => {
        this.canvasEditor?.session?.pushMetaSnapshot(this.captureCanvasMeta());
      },
      get redoStack() { return editor.redoStack; },
      set redoStack(value) { editor.redoStack = value; },
      get references() { return editor.references; },
      refreshApaToc: () => this.tocController.refreshApa(),
      settleApaToc: () => this.tocController.afterFlow(),
      reflowDocument: (...args) => this.reflowDocument(...args),
      renderDocumentPages: (...args) => this.renderDocumentPages(...args),
      restoreSelection: (...args) => {
        if (this.canvasEnabled() && this.canvasEditor?.session) {
          if (this.savedCanvasSelection) {
            this.canvasEditor.session.setSelection(
              this.savedCanvasSelection.section,
              this.savedCanvasSelection.selection,
            );
            this.savedCanvasSelection = null;
          }
          return;
        }
        return this.restoreSelection(...args);
      },
      samePages: (...args) => this.samePages(...args),
      saveSelection: (...args) => {
        if (this.canvasEnabled() && this.canvasEditor?.session) {
          this.savedCanvasSelection = {
            section: this.canvasEditor.session.section,
            selection: this.canvasEditor.session.selection,
          };
          return;
        }
        return this.saveSelection(...args);
      },
      get savedRange() { return editor.savedRange; },
      set savedRange(value) { editor.savedRange = value; },
      scheduleAutoSave: (...args) => this.scheduleAutoSave(...args),
      scheduleDocumentFlow: (...args) => this.scheduleDocumentFlow(...args),
      selectedText: () => {
        if (this.canvasEnabled() && this.canvasEditor?.session) {
          return this.canvasEditor.session.selectedText();
        }
        return window.getSelection()?.toString() || '';
      },
      setLoadedModelSections: (sections) => this.loadedModelSections.set(sections),
      showToast: (...args) => this.showToast(...args),
      syncInnerHtml: (...args) => this.syncInnerHtml(...args),
      get themeService() { return editor.themeService; },
      get undoStack() { return editor.undoStack; },
      set undoStack(value) { editor.undoStack = value; },
      get wordCompat() { return editor.wordCompat; },
    };
  })();

  private readonly persistenceController = new WordPersistenceController(this, this.controllerHooks);
  private readonly flowController = new WordFlowController(this, this.controllerHooks);
  private readonly formattingController = new WordFormattingController(this, this.controllerHooks);
  private readonly layoutController = new WordLayoutController(this, this.controllerHooks);
  private readonly inputController = new WordInputController(this, this.controllerHooks);
  private readonly insertController = new WordInsertController(this, this.controllerHooks);
  private readonly mediaController = new WordMediaController(this, this.controllerHooks);
  private readonly tablesController = new WordTablesController(this, this.controllerHooks);
  private readonly navigationController = new WordNavigationController(this, this.controllerHooks);
  private readonly searchController = new WordSearchController(this, this.controllerHooks);
  private readonly filesController = new WordFilesController(this, this.controllerHooks);
  private readonly tocController = new WordTocController(this, this.controllerHooks);
  readonly academic = new WordAcademicController(this, this.controllerHooks);
  private readonly imagesController = new WordImagesController(this, this.controllerHooks);
  readonly reviewController = new WordReviewController({
    canvasEditor: () => this.canvasEditor,
    canvasEnabled: () => this.canvasEnabled(),
    isReadMode: () => this.isReadMode(),
    activePageIndex: () => this.activePageIndex(),
    pages: () => this.pages(),
    setPages: (pages) => this.pages.set(pages),
    comments: () => this.comments(),
    setComments: (next) => this.comments.set(next),
    commentsPanelOpen: () => this.commentsPanelOpen(),
    setCommentsPanelOpen: (open) => this.commentsPanelOpen.set(open),
    activeCommentId: () => this.activeCommentId(),
    setActiveCommentId: (id) => this.activeCommentId.set(id),
    trackChangesEnabled: () => this.trackChangesEnabled(),
    setTrackChangesEnabled: (enabled) => this.trackChangesEnabled.set(enabled),
    hideCommentsOnExport: () => this.hideCommentsOnExport(),
    setHideCommentsOnExport: (hide) => this.hideCommentsOnExport.set(hide),
    revisions: () => this.revisions(),
    setRevisions: (items) => this.revisions.set(items),
    mainScrollRef: () => this.mainScrollRef,
    liveBodies: () => this.liveBodies(),
    syncDomBodiesFromPages: (pages) => this.renderDocumentPages(pages),
    jumpToPage: (pageIndex) => this.jumpToPage(pageIndex),
    showToast: (msg) => this.showToast(msg),
    setStatusMessage: (msg) => this.statusMessage.set(msg),
    scheduleAutoSave: () => this.scheduleAutoSave(this.collectDocData()),
  });
  private readonly onObjectViewportChange = () => {
    if (!this.active() || this.viewportFrame !== null) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = null;
      if (this.active() && !this.destroyed) this.refreshObjectOverlays();
    });
  };

  private buildWordControlHost(): WordControlHost {
    return {
      renameDocument: title => {
        this.docTitle.set(title);
      },
      updateLayout: updater => {
        this.handleUpdateLayout(updater);
      },
      applyTemplateById: (templateId, customTemplate) => {
        const existing = this.styleTemplates().find(t => t.id === templateId || t.name.toLowerCase() === templateId.toLowerCase());
        const base = existing || this.styleTemplates()[0];
        if (!base) return false;
        const resolved: StyleTemplate = customTemplate
          ? {
              ...base,
              ...customTemplate,
              id: customTemplate.id || existing?.id || `ai-tpl-${Date.now().toString(36)}`,
              name: customTemplate.name || existing?.name || 'Plantilla IA',
              isCustom: existing ? existing.isCustom : true,
              rules: { ...base.rules, ...(customTemplate.rules || {}) },
            }
          : existing!;
        if (!resolved) return false;
        this.handleApplyTemplateToDocument(resolved);
        return true;
      },
      setHeadingNumbering: enabled => {
        this.onRibbonCommand({ command: 'headingNumbering', value: enabled ? 'on' : 'off' });
      },
      insertOrUpdateFormula: (latex, nodeId, _afterNodeId, pageIndex) => {
        this.editingLatexNodeId.set(nodeId ?? null);
        if (typeof pageIndex === 'number' && Number.isFinite(pageIndex)) {
          this.activePageIndex.set(Math.max(0, Math.min(this.pages().length - 1, Math.floor(pageIndex))));
        }
        this.handleInsertOrUpdateLatexFormula(latex);
        return true;
      },
      deleteFormula: nodeId => {
        this.editingLatexNodeId.set(nodeId);
        this.handleDeleteExistingLatexFormula();
        return true;
      },
      updateToc: insertIfMissing => {
        this.tocController.update(insertIfMissing);
      },
      addOrUpdateSource: source => {
        this.academic.save({
          id: source.id || `src-${Date.now().toString(36)}`,
          kind: source.kind || 'article',
          authors: source.authors || [],
          organization: '',
          year: '',
          date: '',
          title: '',
          container: '',
          publisher: '',
          volume: '',
          issue: '',
          pages: '',
          edition: '',
          description: '',
          doi: '',
          url: '',
          accessed: '',
          editors: '',
          translators: '',
          originalYear: '',
          version: '',
          platform: '',
          role: '',
          number: '',
          location: '',
          abbreviation: '',
          handle: '',
          ...source,
        });
      },
      removeSource: sourceId => {
        this.academic.remove(sourceId);
      },
      insertCitation: request => {
        this.academic.cite(request);
      },
      insertBibliography: () => {
        this.academic.bibliography();
      },
      updateAcademic: () => {
        this.academic.update();
      },
      applyCaption: request => {
        this.academic.caption(request);
      },
      insertAcademicSection: request => {
        this.academic.insertSection(request);
      },
      addAcademicNote: request => {
        this.academic.saveNote(request);
      },
      addBlankPage: afterIndex => {
        const idx = typeof afterIndex === 'number' && Number.isFinite(afterIndex)
          ? Math.max(0, Math.min(this.pages().length - 1, Math.floor(afterIndex)))
          : Math.max(0, this.pages().length - 1);
        this.handleAddNewPageAt(idx);
        return true;
      },
      insertPageBreak: atIndex => {
        if (typeof atIndex === 'number' && Number.isFinite(atIndex)) {
          this.activePageIndex.set(Math.max(0, Math.min(this.pages().length - 1, Math.floor(atIndex))));
        }
        this.handleInsertPageBreak();
        return true;
      },
      buildFormulaHtml: latex => this.latexRenderer.buildDocumentFormulaBlockHtml(latex),
    };
  }

  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register({
    owner: () => this.documentReady() ? this.loadedNoteId ?? undefined : undefined,
    fields: () => this.aiTextFields(),
    apply: values => {
      const session = this.canvasEnabled() ? this.canvasEditor?.session : undefined;
      const controlRaw = values.get(WORD_CONTROL_TARGET);
      if (session) {
        const hasModelTargets = [...values.keys()].some(id => id.startsWith('model:') || id.startsWith('model-table:') || id.startsWith('model-insert:'));
        const modelApplied = hasModelTargets && session.applyAiEdits(values, this.canvasStyleTemplate());
        if (controlRaw !== undefined) {
          applyWordControlPayload(
            controlRaw,
            session.getSectionsSnapshot(),
            updated => session.commitAiSectionRoots(updated),
            this.buildWordControlHost(),
          );
          this.canvasEditor!.publishNow(
            this.canvasGeometry(),
            this.canvasDefaults(),
            this.canvasStyleTemplate(),
            this.headingNumbering(),
          );
          this.updateSelectionFormats();
          this.captureLatestSave();
          void this.flushSave();
          return;
        }
        if (modelApplied) {
          this.canvasEditor!.publishNow();
          this.captureLatestSave();
          void this.flushSave();
          return;
        }
        const source = session.pages;
        const targets = [...values.keys()];
        const textPages = source.map(page => targets.some(id => id.startsWith(`page:${page.id}:`))
          ? { ...page, html: applyHtmlText(page.html, `page:${page.id}`, values) } : page);
        const pages = applyAiTableEdits(textPages, values, this.canvasStyleTemplate());
        session.replacePagesWithHistory(pages);
        this.canvasEditor!.publishNow();
      } else {
        const source = this.getLivePagesSnapshot();
        const targets = [...values.keys()];
        const hasNonControl = targets.some(id => id !== WORD_CONTROL_TARGET);
        if (hasNonControl) {
          const textPages = source.map(page => targets.some(id => id.startsWith(`page:${page.id}:`))
            ? { ...page, html: applyHtmlText(page.html, `page:${page.id}`, values) } : page);
          const pages = applyAiTableEdits(textPages, values, this.canvasStyleTemplate());
          this.pushUndoSnapshot();
          this.renderDocumentPages(pages);
        }
        if (controlRaw !== undefined) {
          applyWordControlPayload(controlRaw, [], () => {}, this.buildWordControlHost());
        }
      }
      this.captureLatestSave();
      void this.flushSave();
    },
  });

  private *aiTextFields(): Generator<{ id: string; text: string }> {
    const session = this.canvasEnabled() ? this.canvasEditor?.session : undefined;
    yield wordControlField({
      noteId: this.loadedNoteId ?? undefined,
      title: this.docTitle(),
      layoutConfig: this.layoutConfig(),
      activeTemplateId: this.activeTemplateId(),
      styleTemplates: this.styleTemplates(),
      headingNumbering: this.headingNumbering(),
      activePageIndex: this.activePageIndex(),
      pageCount: this.pages().length,
      sections: session?.getSectionsSnapshot(),
      bibliographicSources: this.bibliographicSources(),
      academicObjects: this.academic.objects(),
      apaIssues: this.academic.issues(),
    });
    if (session) {
      yield* session.getAiTextFields();
      return;
    }
    const pages = this.pages();
    // La estructura de tablas precede al texto para que no quede fuera del extracto.
    yield* aiTableFields(pages);
    yield* aiTableInsertionFields(pages);
    for (const scope of ['headings', 'body'] as const) {
      for (const page of pages) {
        const body = this.getPageBody(page.id) ?? new DOMParser().parseFromString(page.html, 'text/html').body;
        yield* domTextFields(body, `page:${page.id}`, scope);
      }
    }
  }

  constructor() {
    effect(() => {
      const active = this.active();
      untracked(() => {
        if (active) {
          this.scheduleDocumentFlow();
          if (this.lastScrollTop > 0 || this.lastScrollLeft > 0) {
            const targetTop = this.lastScrollTop;
            const targetLeft = this.lastScrollLeft;
            const applyScroll = () => {
              if (!this.active() || !this.mainScrollRef?.nativeElement) return;
              this.mainScrollRef.nativeElement.scrollTop = targetTop;
              this.mainScrollRef.nativeElement.scrollLeft = targetLeft;
              if (this.canvasEditor) {
                this.canvasEditor.refresh();
              }
            };
            requestAnimationFrame(applyScroll);
            setTimeout(applyScroll, 40);
          }
        } else {
          if (this.mainScrollRef?.nativeElement && this.mainScrollRef.nativeElement.scrollTop > 0) {
            this.lastScrollTop = this.mainScrollRef.nativeElement.scrollTop;
            this.lastScrollLeft = this.mainScrollRef.nativeElement.scrollLeft;
          }
          this.captureLatestSave();
          void this.flushSave();
        }
      });
    });
    effect(() => {
      if (!this.active()) return;
      const payload = this.collectDocData();
      if (!this.documentReady()) return;
      this.scheduleAutoSave(payload);
    });
    effect(() => {
      this.layoutConfig();
      this.viewMode();
      this.scheduleDocumentFlow();
    });
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------------
  ngOnInit(): void {
    this.loadedNoteId = this.note?._id || null;
    void this.hydrateFromNote();
    if (typeof document !== 'undefined') {
      this.eventZone.runOutsideAngular(() => document.addEventListener('selectionchange', this.handleSelectionChange));
    }
  }

  ngAfterViewInit(): void {
    this.rebuildMaps();
    const subscribe = (list?: QueryList<ElementRef<HTMLDivElement>>): void => {
      if (!list) return;
      this.querySubscriptions.push(
        list.changes.subscribe(() => {
          this.mapsDirty = true;
          this.rebuildMaps();
          this.syncInnerHtml();
        })
      );
    };
    subscribe(this.pageBodyRefs);
    subscribe(this.headerRefs);
    subscribe(this.footerRefs);
    this.syncInnerHtml();
    if (typeof ResizeObserver !== 'undefined') {
      this.bodyResizeObserver = new ResizeObserver(() => this.scheduleDocumentFlow());
      this.observeBodySize();
    }
    document.fonts?.addEventListener('loadingdone', this.onFontsLoaded);
    this.mainScrollRef?.nativeElement.addEventListener('load', this.onAssetLoaded, true);
    this.eventZone.runOutsideAngular(() => {
      window.addEventListener('resize', this.onObjectViewportChange);
      this.mainScrollRef?.nativeElement.addEventListener('scroll', this.onObjectViewportChange, { passive: true });
    });
  }

  ngAfterViewChecked(): void {
    if (this.mapsDirty) {
      this.mapsDirty = false;
      this.rebuildMaps();
    }
    this.syncInnerHtml();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['note'] && !changes['note'].firstChange) {
      const newId = this.note?._id;
      this.canvasEnabled.set(PureDocEditorComponent.canUseCanvas());
      if (newId && newId !== this.loadedNoteId) {
        this.clearToast();
        this.filesController.clearExportFeedback();
        this.captureLatestSave();
        this.documentReady.set(false);
        void this.flushSave().then(() => {
          if (this.destroyed) return;
          this.loadedNoteId = newId;
          return this.hydrateFromNote();
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterAi();
    this.captureLatestSave();
    this.destroyed = true;
    this.tableResizeAbort?.abort();
    this.tableResizeAbort = null;
    this.tableResizeState = null;
    document.body.style.cursor = '';
    this.hydrationVersion++;
    this.clearToast();
    this.filesController.clearExportFeedback();
    this.flowController.cancelScheduledFlow();
    this.flowController.snapshotCache.destroy();
    if (this.selectionFrame !== null) cancelAnimationFrame(this.selectionFrame);
    if (this.viewportFrame !== null) cancelAnimationFrame(this.viewportFrame);
    this.mainScrollRef?.nativeElement.removeEventListener('scroll', this.onObjectViewportChange);
    this.navigationController.cancelZoom();
    this.clearObjectSelection();
    window.removeEventListener('resize', this.onObjectViewportChange);
    this.bodyResizeObserver?.disconnect();
    document.fonts?.removeEventListener('loadingdone', this.onFontsLoaded);
    this.mainScrollRef?.nativeElement.removeEventListener('load', this.onAssetLoaded, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('selectionchange', this.handleSelectionChange);
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    void this.flushSave();
    this.querySubscriptions.forEach((sub) => sub.unsubscribe());
    this.querySubscriptions = [];
  }

  handleCanvasLinkClick(href: string): void {
    const trimmed = href.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#')) {
      const targetId = trimmed.slice(1);
      if (!targetId) return;
      const heading = this.headings().find(h => h.id === targetId);
      const pageIdx = heading?.pageIndex ?? this.pages().findIndex(p => p.html.includes(`id="${targetId}"`));
      const targetIdx = Math.max(0, Math.min(this.pages().length - 1, pageIdx >= 0 ? pageIdx : this.activePageIndex()));
      this.activePageIndex.set(targetIdx);
      if (this.canvasEnabled()) {
        const canvasPage = this.mainScrollRef?.nativeElement.querySelector<HTMLElement>(`[data-canvas-index="${targetIdx}"]`);
        canvasPage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      this.navigationController.handleSelectHeadingInSidebar(targetId, targetIdx);
      return;
    }
    try {
      const url = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
      if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
        window.open(url.href, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Ignore malformed URI targets.
    }
  }

  // ---------------------------------------------------------------------------
  // Hidratación y persistencia
  // ---------------------------------------------------------------------------
  private hydrateFromNote(): Promise<void> { return this.persistenceController.hydrateFromNote(); }

  /**
   * Sube las imágenes embebidas y usa sus rutas permanentes en el JSON persistido.
   */

  private collectDocData(): AnyDocData { return this.persistenceController.collectDocData(); }

  private scheduleAutoSave(payload: AnyDocData): void { return this.persistenceController.scheduleAutoSave(payload); }

  /** Captura la última edición aunque Angular todavía no haya ejecutado el efecto. */
  private captureLatestSave(): void { return this.persistenceController.captureLatestSave(); }

  private flushSave(): Promise<void> { return this.persistenceController.flushSave(); }

  // ---------------------------------------------------------------------------
  // Refs / DOM
  // ---------------------------------------------------------------------------
  private rebuildMaps(): void { return this.flowController.rebuildMaps(); }

  private observeBodySize(): void { return this.flowController.observeBodySize(); }

  getPageBody(id: string): HTMLDivElement | null { return this.flowController.getPageBody(id); }

  getHeaderEl(id: string): HTMLDivElement | null { return this.flowController.getHeaderEl(id); }

  getFooterEl(id: string): HTMLDivElement | null { return this.flowController.getFooterEl(id); }

  private syncInnerHtml(): void { return this.flowController.syncInnerHtml(); }

  // ---------------------------------------------------------------------------
  // Utilidades de página
  // ---------------------------------------------------------------------------
  private getLivePagesSnapshot(): DocumentPage[] {
    if (this.canvasEnabled()) {
      const sessionPages = this.canvasEditor?.session?.pages;
      if (sessionPages && sessionPages.length) return sessionPages;
      const marked = this.canvasEditor?.markedPages?.();
      if (marked && marked.length) return marked;
      if (this.pages()?.length) return this.pages();
    }
    return this.flowController.getLivePagesSnapshot() || this.pages() || [];
  }

  private static readonly TOAST_HIDE_MS = 3500;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private inferToastTone(message: string): 'info' | 'success' | 'error' {
    const trimmed = message.trim();
    if (/^(?:error|no se pudo|no hay|tu navegador no|el documento debe|falta|no es posible)/i.test(trimmed)) {
      return 'error';
    }
    if (/(?:aplicad[oa]s?|exportad[oa]s?|importad[oa]s?|insertad[oa]s?|eliminad[oa]s?|actualizad[oa]s?|generad[oa]s?|guardad[oa]s?|combinad[oa]s?|restaurad[oa]s?|detenid[oa])/i.test(trimmed)) {
      return 'success';
    }
    return 'info';
  }

  private clearToastTimer(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  clearToast(): void {
    this.clearToastTimer();
    this.toastMessage.set('');
    this.cdr?.markForCheck();
  }

  private showToast(msg: string, tone?: 'info' | 'success' | 'error'): void {
    this.statusMessage.set(msg);
    this.clearToastTimer();
    if (!this.pdfExporting() && this.pdfExportMessage()) {
      this.filesController.clearExportFeedback();
    }
    this.toastTone.set(tone ?? this.inferToastTone(msg));
    this.toastMessage.set(msg);
    this.cdr?.markForCheck();
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.toastMessage.set('');
      this.cdr?.markForCheck();
    }, PureDocEditorComponent.TOAST_HIDE_MS);
  }

  private getActivePageElement(): HTMLDivElement | null { return this.flowController.getActivePageElement(); }

  activePageHtml(): string { return this.flowController.activePageHtml(); }

  commitPageDomToState(pageIndex: number): void { return this.flowController.commitPageDomToState(pageIndex); }

  pushUndoSnapshot(overridePages?: DocumentPage[]): void { return this.persistenceController.pushUndoSnapshot(overridePages); }

  private captureCanvasMeta(): CanvasHistoryMeta {
    return {
      activeTemplateId: this.activeTemplateId(),
      headingNumbering: this.headingNumbering(),
      layoutConfig: this.layoutConfig(),
      templates: this.styleTemplates(),
      bibliographicSources: [...this.bibliographicSources()],
    };
  }

  private applyCanvasMeta(meta?: CanvasHistoryMeta): void {
    if (!meta) return;
    if (meta.templates) this.styleTemplates.set([...meta.templates]);
    if (meta.activeTemplateId) this.activeTemplateId.set(meta.activeTemplateId);
    if (meta.headingNumbering !== undefined) this.headingNumbering.set(meta.headingNumbering);
    if (meta.layoutConfig) this.layoutConfig.set(meta.layoutConfig as DocumentLayoutConfig);
    if (meta.bibliographicSources) this.bibliographicSources.set([...meta.bibliographicSources]);
  }

  handleGlobalUndo(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session?.canUndo?.()) {
      const res = this.canvasEditor.session.undoWithMeta(false, this.captureCanvasMeta());
      if (res.ok) {
        this.applyCanvasMeta(res.meta);
        this.canvasEditor.publishNow(this.canvasGeometry(), this.canvasDefaults(), this.canvasStyleTemplate(), this.headingNumbering());
        this.updateSelectionFormats();
        this.showToast(`Deshacer aplicado (${this.pages().length} pág.)`);
        return;
      }
    }
    return this.persistenceController.handleGlobalUndo();
  }

  handleGlobalRedo(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session?.canRedo?.()) {
      const res = this.canvasEditor.session.undoWithMeta(true, this.captureCanvasMeta());
      if (res.ok) {
        this.applyCanvasMeta(res.meta);
        this.canvasEditor.publishNow(this.canvasGeometry(), this.canvasDefaults(), this.canvasStyleTemplate(), this.headingNumbering());
        this.updateSelectionFormats();
        this.showToast(`Rehacer aplicado (${this.pages().length} pág.)`);
        return;
      }
    }
    return this.persistenceController.handleGlobalRedo();
  }

  private captureHistory(): HistorySnapshot { return this.persistenceController.captureHistory(); }

  /** Input, formatting and layout changes share the same bidirectional flow transaction. */
  checkAndPaginateOverflow(_pageIndex: number, _preChangePagesSnapshot?: DocumentPage[]): void { return this.flowController.checkAndPaginateOverflow(_pageIndex, _preChangePagesSnapshot); }

  private scheduleDocumentFlow(deferInput = false): void { if(this.canvasEnabled()&&this.canvasEditor?.session)return;return this.flowController.scheduleDocumentFlow(deferInput); }

  private invalidateDocumentFlow(): void { return this.flowController.invalidateDocumentFlow(); }

  private samePages(left: DocumentPage[], right: DocumentPage[] | null | undefined): boolean { return this.flowController.samePages(left, right); }

  private reflowDocument(sourcePages?: DocumentPage[]): boolean { if(this.canvasEnabled()&&this.canvasEditor?.session&&!sourcePages)return true;return this.flowController.reflowDocument(sourcePages); }

  private liveBodies(): HTMLElement[] {
    const domBodies = this.flowController.liveBodies();
    if (domBodies.length > 0 || !this.canvasEnabled()) return domBodies;
    const pages = this.canvasEditor?.session?.pages || this.pages();
    return pages.map(p => {
      const div = document.createElement('div');
      div.className = 'word-page-body';
      div.dataset['pageBodyId'] = p.id;
      div.innerHTML = p.html || '';
      return div;
    });
  }

  private renderDocumentPages(pages: DocumentPage[], reflowAfterRender = true): void { return this.flowController.renderDocumentPages(pages, reflowAfterRender); }

  private canvasTableCellPlaceholder: HTMLTableCellElement | null = null;

  updateSelectionFormats(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.formatPainterActive() && this.copiedInlineStyle()) {
        const copied = this.copiedInlineStyle()!;
        const sel = this.canvasEditor.session.selection;
        if (sel && (sel.anchor.nodeId !== sel.focus.nodeId || sel.anchor.offset !== sel.focus.offset)) {
          const patch: Record<string, string> = {
            'font-family': copied.fontFamily,
            'font-size': `${copied.fontSizePt}pt`,
            'font-weight': copied.bold ? 'bold' : 'normal',
            'font-style': copied.italic ? 'italic' : 'normal',
            'text-decoration': copied.underline ? 'underline' : 'none',
          };
          this.canvasEditor.session.applyInlineStyle(patch);
          this.canvasEditor.publishNow();
          this.formatPainterActive.set(false);
          this.copiedInlineStyle.set(null);
          this.showToast('Formato aplicado');
        }
      }
      const ctx = this.canvasEditor.session.getSelectionContext();
      if (!ctx) return;
      this.formats.set(ctx.formats);
      if (ctx.table) {
        if (!this.canvasTableCellPlaceholder && typeof document !== 'undefined') {
          this.canvasTableCellPlaceholder = document.createElement('td');
        }
        if (this.activeTableCell() !== this.canvasTableCellPlaceholder) {
          this.activeTableCell.set(this.canvasTableCellPlaceholder);
        }
        this.activeTableRowTopBorder.set(Boolean(ctx.table.rowHasTopBorder));
        this.activeTableVerticalAlign.set(ctx.table.verticalAlign || 'top');
        this.activeTableRepeatHeader.set(ctx.table.repeatHeader !== false);
      } else {
        if (this.activeTableCell() !== null) {
          this.activeTableCell.set(null);
        }
        this.activeTableRowTopBorder.set(false);
        this.activeTableVerticalAlign.set('top');
        this.activeTableRepeatHeader.set(true);
      }
      return;
    }
    return this.formattingController.updateSelectionFormats();
  }

  handleInsertTabCharacter(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (!this.canvasEditor.session.selection) {
        this.canvasEditor.session.ensureSelection(this.activePageIndex());
      }
      if (this.canvasEditor.session.insert('\u00A0\u00A0\u00A0\u00A0')) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.formattingController.handleInsertTabCharacter();
  }

  private applyRemoveFormatCanvas(): void {
    const base = (this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0])?.rules.P;
    const session = this.canvasEditor?.session;
    if (!base || !session) return;
    if (session.removeFormat(base, this.activePageIndex(), this.captureCanvasMeta())) {
      this.canvasEditor!.publishNow(
        this.canvasGeometry(),
        this.canvasDefaults(),
        this.canvasStyleTemplate(),
        this.headingNumbering(),
      );
      this.updateSelectionFormats();
      this.scheduleAutoSave(this.collectDocData());
    }
  }

  executeCommand(command: string, value?: string): void {
    if (command === 'undo' || command === 'redo') return this.formattingController.executeCommand(command, value);
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const session = this.canvasEditor.session;
      const image=this.canvasEditor.selectedImage();
      if(image&&['justifyLeft','justifyCenter','justifyRight','justifyFull'].includes(command)) {
        const align=command==='justifyCenter'?'center':command==='justifyRight'?'right':'left';
        if(session.alignImage(image.nodeId,align)){this.canvasEditor.publishNow();this.formats.update(f=>({...f,justifyLeft:align==='left',justifyCenter:align==='center',justifyRight:align==='right',justifyFull:false}));return;}
      }
      if (command === 'createLink' && value) {
        const session = this.canvasEditor?.session;
        if (session?.createLink(value, this.activePageIndex(), this.captureCanvasMeta())) {
          this.canvasEditor!.publishNow(
            this.canvasGeometry(),
            this.canvasDefaults(),
            this.canvasStyleTemplate(),
            this.headingNumbering(),
          );
          this.updateSelectionFormats();
          this.scheduleAutoSave(this.collectDocData());
        }
        return;
      }
      if (command === 'removeFormat') {
        this.applyRemoveFormatCanvas();
        return;
      }
      if (command === 'formatBlock' && value) {
        const normalizedTag = value.replace(/[<>]/g, '').toUpperCase() as StyleTargetTag;
        const template = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
        const rule = template?.rules[normalizedTag];
        if (rule) {
          this.handleApplyRuleToSelection(rule);
        }
        return;
      }
      let handled = false;
      if (['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'].includes(command)) {
        handled = session.toggleInlineCommand(command as any);
      } else if (command === 'insertUnorderedList') {
        handled = session.toggleList('ul', undefined, this.canvasStyleTemplate());
      } else if (command === 'insertOrderedList') {
        handled = session.toggleList('ol', undefined, this.canvasStyleTemplate());
      } else if (command === 'insertHTML' && value) {
        handled = session.insertHtml(value, false, this.activePageIndex());
      } else if (command === 'insertHorizontalRule') {
        handled = session.insertHtml('<hr/><p><br/></p>', false, this.activePageIndex());
      } else if (command === 'foreColor' && value) {
        handled = session.applyInlineStyle({ color: value });
      } else if ((command === 'hiliteColor' || command === 'backColor') && value) {
        handled = session.applyInlineStyle({ 'background-color': value });
      } else if (command === 'fontName' && value) {
        handled = session.applyInlineStyle({ 'font-family': value });
      } else if (command === 'justifyLeft') {
        handled = session.applyBlockStylePatch({ 'text-align': 'left' });
      } else if (command === 'justifyCenter') {
        handled = session.applyBlockStylePatch({ 'text-align': 'center' });
      } else if (command === 'justifyRight') {
        handled = session.applyBlockStylePatch({ 'text-align': 'right' });
      } else if (command === 'justifyFull') {
        handled = session.applyBlockStylePatch({ 'text-align': 'justify' });
      }
      if (handled) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.formattingController.executeCommand(command, value);
  }

  handleApplySectionColumns(preset: SectionColumnsPreset): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const res = this.canvasEditor.session.applySectionColumns(preset);
      if (res.applied) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      if (res.message) this.showToast(res.message);
      return;
    }
    return this.layoutController.handleApplySectionColumns(preset);
  }

  handleApplyParagraphSpacingAndIndent(patch: {
    indentLeftCm?: number; indentRightCm?: number; firstLineIndentPt?: number; spaceBeforePt?: number; spaceAfterPt?: number;
  }): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const stylePatch: Record<string, string | null> = {};
      if (patch.indentLeftCm !== undefined) stylePatch['margin-left'] = `${Math.round((patch.indentLeftCm / 2.54) * 72 * 100) / 100}pt`;
      if (patch.indentRightCm !== undefined) stylePatch['margin-right'] = `${Math.round((patch.indentRightCm / 2.54) * 72 * 100) / 100}pt`;
      if (patch.firstLineIndentPt !== undefined) stylePatch['text-indent'] = `${patch.firstLineIndentPt}pt`;
      if (patch.spaceBeforePt !== undefined) stylePatch['margin-top'] = `${patch.spaceBeforePt}pt`;
      if (patch.spaceAfterPt !== undefined) stylePatch['margin-bottom'] = `${patch.spaceAfterPt}pt`;
      if (this.canvasEditor.session.applyBlockStylePatch(stylePatch)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.layoutController.handleApplyParagraphSpacingAndIndent(patch);
  }

  handleReadAloud(): void { return this.navigationController.handleReadAloud(); }

  /** Preserve the document range while ribbon inputs take keyboard focus. */
  rememberRibbonSelection(): void { if (this.canvasEnabled() && this.canvasEditor?.session) return; return this.formattingController.rememberRibbonSelection(); }

  private prepareRibbonSelection(): Range | null {
    if (this.canvasEnabled() && this.canvasEditor?.session) return null;
    return this.formattingController.prepareRibbonSelection();
  }

  private finishDocumentMutation(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) return;
    this.formattingController.finishDocumentMutation();
  }

  handleApplyRuleToSelection(rule: ElementStyleRule): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const template = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
      if (this.canvasEditor.session.applyBlockRule(rule, template)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast(`Estilo aplicado: ${rule.label}`);
      }
      return;
    }
    return this.formattingController.handleApplyRuleToSelection(rule);
  }

  handleUpdateStyleFromSelection(tag: StyleTargetTag): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const session = this.canvasEditor.session;
      const active = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
      const rule = session.selectionStyleRule(active.rules[tag]);
      if (!rule) {
        this.showToast('Selecciona texto del documento para actualizar el estilo');
        return;
      }
      const template: StyleTemplate = {
        ...active,
        id: active.isCustom ? active.id : 'document-styles',
        name: active.isCustom ? active.name : 'Estilos del documento',
        isCustom: true,
        rules: { ...active.rules, [tag]: rule },
      };
      this.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
      this.activeTemplateId.set(template.id);
      const count = session.updateStyleRuleAcrossDocument(tag, rule);
      this.canvasEditor.publishNow();
      this.updateSelectionFormats();
      this.showToast(`${tag === 'P' ? 'Normal' : tag} actualizado en ${count} párrafos; se usará también en los nuevos`);
      return;
    }
    return this.formattingController.handleUpdateStyleFromSelection(tag);
  }

  handleApplyTemplateToDocument(template: StyleTemplate): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (!this.documentReady() || this.isReadMode()) return;
      if (!this.canvasEditor.session.applyTemplateToDocument) return;
      const currentMeta = this.captureCanvasMeta();
      if (template.isCustom) {
        this.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
      }
      this.activeTemplateId.set(template.id);
      if (template.academicStyle === 'apa7') {
        this.headingNumbering.set(false);
        this.layoutConfig.update(layout => ({
          ...layout,
          hyphenation: false,
          paperFormatId: 'letter',
          orientation: 'portrait',
          margins: { topPx: 96, rightPx: 96, bottomPx: 96, leftPx: 96, label: 'APA 7 · 2,54 cm' },
          pageColor: '#ffffff',
          pageBorder: { ...layout.pageBorder, style: 'none' },
          showHeaderFooter: true,
          apa: {
            mode: layout.apa?.mode || 'student',
            runningHead: (layout.apa?.runningHead || '').toLocaleUpperCase().slice(0, 50),
            fontFamily: template.rules.P.fontFamily,
            fontSizePt: template.rules.P.fontSizePt,
          },
        }));
      } else if (this.layoutConfig().apa) {
        this.layoutConfig.update(layout => ({ ...layout, apa: undefined }));
      }
      const nextGeometry = this.canvasGeometry();
      const nextDefaults = this.canvasDefaults();
      if (this.canvasEditor.session.applyTemplateToDocument(template, nextGeometry, nextDefaults, currentMeta)) {
        this.canvasEditor.publishNow(nextGeometry, nextDefaults, template, this.headingNumbering());
        this.updateSelectionFormats();
        this.cdr?.detectChanges();
        this.showToast(`Plantilla "${template.name}" aplicada a todo el documento`);
      }
      return;
    }
    return this.formattingController.handleApplyTemplateToDocument(template);
  }

  openStyleDesigner(): void {
    this.selectedTableDesign.set(this.canvasEnabled() ? this.canvasEditor?.session?.getSelectedTableDesign() : undefined);
    this.styleModalOpen.set(true);
  }

  handleApplyTableStyleToSelection(change: { rule: TableStyleRule; fixed: boolean }): void {
    if (!this.documentReady() || this.isReadMode()) return;
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.applyTableStyle(change.rule, change.fixed)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast('Diseño aplicado a la tabla seleccionada');
      }
      return;
    }
    const table = this.activeTableCell()?.closest('table');
    if (!table) return;
    this.pushUndoSnapshot();
    styleTableElement(table, change.rule, change.fixed ? 'fixed' : 'template');
    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex());
  }

  handleSaveCustomTemplate(newTpl: StyleTemplate): void { return this.formattingController.handleSaveCustomTemplate(newTpl); }

  handleDeleteCustomTemplate(id: string): void { return this.formattingController.handleDeleteCustomTemplate(id); }

  handleApplyFontSizePt(pt: string, _fallbackCmd: string): void {
    const size = parseFloat(pt);
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (Number.isFinite(size) && size >= 1 && size <= 400 && this.canvasEditor.session.applyInlineStyle({ 'font-size': `${size}pt` })) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.formattingController.handleApplyFontSizePt(pt, _fallbackCmd);
  }

  handleApplyHeading(tag: string): void {
    if(tag==='CHAPTER'){
      if(this.canvasEnabled()&&this.canvasEditor?.session){if(this.canvasEditor.session.applyChapter()){this.canvasEditor.publishNow();this.updateSelectionFormats();}return;}
      this.formattingController.handleApplyHeading('H1');const range=window.getSelection()?.rangeCount?window.getSelection()!.getRangeAt(0):null;const element=range?.startContainer instanceof Element?range.startContainer:range?.startContainer.parentElement;const heading=element?.closest('h1');if(heading){heading.setAttribute('data-word-chapter','true');heading.querySelectorAll('[data-word-heading-number]').forEach(n=>n.remove());this.finishDocumentMutation();}
      return;
    }
    const activeTpl = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
    const rule = activeTpl?.rules[tag as StyleTargetTag];
    if (rule) {
      this.handleApplyRuleToSelection(rule);
      return;
    }
    if (this.canvasEnabled() && this.canvasEditor?.session) return;
    return this.formattingController.handleApplyHeading(tag);
  }

  handleAddNewPageAt(insertAfterIndex: number): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const meta = this.captureCanvasMeta();
      if (this.canvasEditor.session.addNewPageAt(insertAfterIndex, meta)) {
        const next = this.canvasEditor.session.pages;
        this.pages.set(next);
        this.canvasEditor.publishNow();
        const nextActive = Math.min(insertAfterIndex + 1, next.length - 1);
        this.activePageIndex.set(nextActive);
        this.canvasEditor.jump(nextActive, 0);
        this.updateSelectionFormats();
        this.showToast(`Página insertada en la posición ${nextActive + 1}`);
      }
      return;
    }
    return this.layoutController.handleAddNewPageAt(insertAfterIndex);
  }

  handleInsertPageBreak(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const meta = this.captureCanvasMeta();
      const currentIdx = this.activePageIndex();
      if (this.canvasEditor.session.insertPageBreak(currentIdx, meta)) {
        const next = this.canvasEditor.session.pages;
        this.pages.set(next);
        this.canvasEditor.publishNow();
        const nextActive = Math.min(currentIdx + 1, next.length - 1);
        this.activePageIndex.set(nextActive);
        this.canvasEditor.jump(nextActive, 0);
        this.updateSelectionFormats();
        this.showToast(`Salto de página insertado (Página ${nextActive + 1})`);
      }
      return;
    }
    return this.layoutController.handleInsertPageBreak();
  }

  handleInsertSectionBreak(sectionConfig: SectionPageConfig = {}): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const meta = this.captureCanvasMeta();
      const currentIdx = this.activePageIndex();
      const cleanConfig = Object.keys(sectionConfig).length ? sectionConfig : undefined;
      if (this.canvasEditor.session.insertSectionBreak(currentIdx, cleanConfig, meta)) {
        const next = this.canvasEditor.session.pages;
        this.pages.set(next);
        this.canvasEditor.publishNow();
        const nextActive = Math.min(currentIdx + 1, next.length - 1);
        this.activePageIndex.set(nextActive);
        this.canvasEditor.jump(nextActive, 0);
        this.updateSelectionFormats();
        this.showToast(`Salto de sección insertado en Página ${nextActive + 1}`);
      }
      return;
    }
    return this.layoutController.handleInsertSectionBreak(sectionConfig);
  }

  handleUpdateSectionConfig(patch: Partial<SectionPageConfig>, targetPageIndex?: number): void {
    const pageIdx = targetPageIndex ?? this.activePageIndex();
    const resolved = this.resolvedPageSections();
    const sectionIdx = resolved[pageIdx]?.sectionIndex ?? 0;
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const meta = this.captureCanvasMeta();
      if (this.canvasEditor.session.updateSectionConfig(pageIdx, patch, meta)) {
        this.pages.set(this.canvasEditor.session.pages);
        this.canvasEditor.publishNow();
        if (sectionIdx === 0 && patch.differentFirstPage !== undefined) {
          this.handleUpdateLayout(prev => ({ ...prev, differentFirstPage: patch.differentFirstPage }));
        }
        this.updateSelectionFormats();
        this.showToast(`Configuración de la sección ${sectionIdx + 1} actualizada`);
      }
      return;
    }
    return this.layoutController.handleUpdateSectionConfig(patch, pageIdx);
  }

  handleDeletePage(indexToDelete: number): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const currentPages = this.canvasEditor.markedPages();
      if (currentPages.length <= 1) {
        this.showToast('El documento debe tener al menos 1 página');
        return;
      }
      if (indexToDelete < 0 || indexToDelete >= currentPages.length) return;
      const meta = this.captureCanvasMeta();
      const ok = this.canvasEditor.session.deletePage(indexToDelete, meta);
      if (ok) {
        const next = this.canvasEditor.session.pages;
        this.pages.set(next);
        this.canvasEditor.publishNow();
        const active = this.activePageIndex();
        const nextActive = Math.min(active > indexToDelete ? active - 1 : active, next.length - 1);
        this.activePageIndex.set(nextActive);
        this.canvasEditor.jump(nextActive, 0);
        this.updateSelectionFormats();
        this.showToast(`Página ${indexToDelete + 1} eliminada (Ctrl+Z para restaurar)`);
      }
      return;
    }
    return this.layoutController.handleDeletePage(indexToDelete);
  }

  handleInsertTable(rows: number, cols: number): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const template = this.styleTemplates().find(t => t.id === this.activeTemplateId());
      const isApa7 = template?.academicStyle === 'apa7' || Boolean(this.layoutConfig().apa);
      if (this.canvasEditor.session.insertTable(rows, cols, isApa7, this.activePageIndex(), template?.tableStyle)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast(`Tabla de ${cols} × ${rows} insertada en Página ${this.activePageIndex() + 1}`);
      }
      return;
    }
    return this.tablesController.handleInsertTable(rows, cols);
  }

  handleUpdateToc(): void {
    this.tocController.update();
  }

  handleInsertToc(): void {
    this.tocController.update(true);
  }

  handleInsertObjectIndex(kind: 'table' | 'figure'): void {
    this.tocController.updateObjectIndex(kind, true);
  }

  handleOpenAcademic(section?: AcademicSection): void {
    this.academic.show(section);
  }

  handleUpdateAcademic(): void {
    this.academic.update();
  }

  handleInsertBibliography(): void {
    this.academic.show();
    this.academic.bibliography();
  }

  handleCanvasTocNavigate(hit: { targetId?: string; pageIndex?: number; title?: string }): void {
    const liveHeading = hit.targetId ? this.headings().find(h => h.id === hit.targetId) : undefined;
    const title = hit.title || liveHeading?.text;
    const fallbackPage = liveHeading?.pageIndex ?? hit.pageIndex ?? 0;
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const loc = this.canvasEditor.session.findHeadingLocation(hit.targetId, title, fallbackPage);
      this.activePageIndex.set(loc.pageIndex);
      this.canvasEditor.jump(loc.pageIndex, loc.y);
      this.updateSelectionFormats();
      this.showToast(`Navegando a "${title || 'sección'}" en la Página ${loc.pageIndex + 1}`);
      return;
    }
    this.handleSelectHeadingInSidebar(hit.targetId || '', fallbackPage);
  }

  handleSelectHeadingInSidebar(id: string, pageIndex: number): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const liveHeading = this.headings().find(h => h.id === id);
      const loc = this.canvasEditor.session.findHeadingLocation(id, liveHeading?.text, pageIndex);
      this.activePageIndex.set(loc.pageIndex);
      this.canvasEditor.jump(loc.pageIndex, loc.y);
      this.updateSelectionFormats();
      return;
    }
    return this.navigationController.handleSelectHeadingInSidebar(id, pageIndex);
  }

  handleSelectTableInSidebar(tbl: TableItem): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const loc = this.canvasEditor.session.findTableLocation(tbl.pageIndex, tbl.tableIndexInPage, tbl.title);
      this.activePageIndex.set(loc.pageIndex);
      this.canvasEditor.jump(loc.pageIndex, loc.y);
      this.updateSelectionFormats();
      this.showToast(`Mostrando "${tbl.title}" en la Página ${loc.pageIndex + 1}`);
      return;
    }
    return this.tablesController.handleSelectTableInSidebar(tbl);
  }

  private applyPendingScroll(headingId: string): void { return this.navigationController.applyPendingScroll(headingId); }

  handleInsertChecklist(): void { return this.insertController.handleInsertChecklist(); }

  handleInsertImage(): void { return this.mediaController.handleInsertImage(); }

  handleImageFileSelected(e: Event): Promise<void> { return this.mediaController.handleImageFileSelected(e); }

  uploadAndInsertImageFile(file: File, pageIndex?: number): Promise<void> { return this.mediaController.uploadAndInsertImageFile(file, pageIndex); }

  onPagePaste(e: ClipboardEvent, pageIndex: number): Promise<void> { return this.mediaController.onPagePaste(e, pageIndex); }

  onPageDragOver(e: DragEvent): void { return this.mediaController.onPageDragOver(e); }

  onPageDrop(e: DragEvent, pageIndex: number): Promise<void> { return this.mediaController.onPageDrop(e, pageIndex); }

  private get savedRange(): Range | null { return this.formattingController.savedRange; }
  private set savedRange(value: Range | null) { this.formattingController.savedRange = value; }

  private saveSelection(): void { return this.formattingController.saveSelection(); }

  private restoreSelection(): void { return this.formattingController.restoreSelection(); }

  handleInsertLink(): void { return this.insertController.handleInsertLink(); }

  handleInsertDocumentReference(): void { return this.insertController.handleInsertDocumentReference(); }

  handleInsertBlockquote(): void { return this.insertController.handleInsertBlockquote(); }

  handleInsertCodeBlock(lang: string): void { return this.insertController.handleInsertCodeBlock(lang); }

  handleInsertCalloutBox(): void { return this.insertController.handleInsertCalloutBox(); }

  handleInsertChartTable(): void { return this.insertController.handleInsertChartTable(); }

  handleInsertAudioPlaceholder(): void { return this.insertController.handleInsertAudioPlaceholder(); }

  handleInsertVideoPlaceholder(): void { return this.insertController.handleInsertVideoPlaceholder(); }

  insertHtmlAtCursorOrActivePage(html: string, keepInlineCaret = false): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.insertHtml(html, keepInlineCaret, this.activePageIndex())) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.insertController.insertHtmlAtCursorOrActivePage(html, keepInlineCaret);
  }

  handleInsertShapeHtml(shapeHtml: string): void { return this.mediaController.handleInsertShapeHtml(shapeHtml); }

  handleInsertSmartArt(item: SmartArtItem): void { return this.mediaController.handleInsertSmartArt(item); }

  handleInsertIcon(iconName: string): void { return this.mediaController.handleInsertIcon(iconName); }

  handleInsert3dModel(): void { return this.mediaController.handleInsert3dModel(); }

  handleInsertScreenshot(): void { return this.mediaController.handleInsertScreenshot(); }

  handleInsertComment(): void { return this.insertController.handleInsertComment(); }

  openNewCommentPanel(): void { this.reviewController.openNewComment(); }
  toggleCommentsPanel(): void { this.reviewController.toggleCommentsPanel(); }
  createComment(text: string, author?: string) { return this.reviewController.createComment(text, author); }
  replyToComment(commentId: string, text: string, author?: string): boolean { return this.reviewController.replyToComment(commentId, text, author); }
  resolveComment(commentId: string, resolved = true): boolean { return this.reviewController.resolveComment(commentId, resolved); }
  deleteComment(commentId: string): boolean { return this.reviewController.deleteComment(commentId); }
  selectComment(commentId: string): void { this.reviewController.selectComment(commentId); }
  toggleTrackChanges(enabled?: boolean): void { this.reviewController.toggleTrackChanges(enabled); }
  toggleHideCommentsOnExport(hide?: boolean): void { this.reviewController.toggleHideCommentsOnExport(hide); }
  acceptRevision(revId: string): boolean { return this.reviewController.acceptRevision(revId); }
  rejectRevision(revId: string): boolean { return this.reviewController.rejectRevision(revId); }
  acceptAllRevisions(): boolean { return this.reviewController.acceptAllRevisions(); }
  rejectAllRevisions(): boolean { return this.reviewController.rejectAllRevisions(); }
  jumpToRevision(revId: string): void { this.reviewController.jumpToRevision(revId); }

  handleFocusFooterArea(): void {
    if (this.canvasEnabled() && this.canvasEditor) {
      this.handleUpdateLayout(prev => ({ ...prev, showHeaderFooter: true }));
      this.canvasEditor.openHeaderFooterEditor('footer', this.activePageIndex());
      return;
    }
    return this.navigationController.handleFocusFooterArea();
  }

  handleInsertPageNumber(): void { return this.insertController.handleInsertPageNumber(); }

  handleInsertTextBox(): void { return this.insertController.handleInsertTextBox(); }

  handleInsertNote(): void { return this.insertController.handleInsertNote(); }

  handleInsertWordArt(preset: WordArtPreset): void { return this.insertController.handleInsertWordArt(preset); }

  handleInsertDropCap(): void { return this.insertController.handleInsertDropCap(); }

  handleInsertSignatureLine(): void { return this.insertController.handleInsertSignatureLine(); }

  handleInsertDateTime(): void { return this.insertController.handleInsertDateTime(); }

  handleInsertSymbol(symbol: string): void { return this.insertController.handleInsertSymbol(symbol); }

  handleInsertDrawingCanvas(): void { return this.insertController.handleInsertDrawingCanvas(); }

  handleApplyLineHeight(lineHeight: string): void { this.onRibbonCommand({ command: 'lineHeight', value: lineHeight }); }

  handleCopyFormat(): void {
    if (this.formatPainterActive()) {
      this.formatPainterActive.set(false);
      this.copiedInlineStyle.set(null);
      return;
    }
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const ctx = this.canvasEditor.session.getSelectionContext();
      if (!ctx) return;
      const template = this.styleTemplates().find(t => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
      const headingRule = template.rules[ctx.formats.heading as StyleTargetTag] || template.rules.P;
      const rule: ElementStyleRule = {
        ...headingRule,
        fontFamily: ctx.formats.fontName || headingRule.fontFamily,
        fontSizePt: parseFloat(ctx.formats.fontSize) || headingRule.fontSizePt,
        bold: ctx.formats.bold,
        italic: ctx.formats.italic,
        underline: ctx.formats.underline,
        color: '#000000',
        align: ctx.formats.justifyCenter ? 'center' : ctx.formats.justifyRight ? 'right' : ctx.formats.justifyFull ? 'justify' : 'left',
        lineHeight: parseFloat(ctx.formats.lineHeight) || headingRule.lineHeight,
      };
      this.copiedInlineStyle.set(rule);
      this.formatPainterActive.set(true);
      this.showToast('Formato copiado: selecciona texto para aplicarlo');
      return;
    }
    return this.formattingController.handleCopyFormat();
  }

  handleEditorMouseUp(e: MouseEvent): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) return;
    this.mediaController.handleEditorMouseUp(e);
    this.tablesController.refreshSelection();
  }

  handleCanvasLatexEdit(hit: { nodeId: string; latex: string }): void {
    this.editingLatexElement.set(null);
    this.editingLatexNodeId.set(hit.nodeId);
    this.editingLatexCode.set(hit.latex);
    this.latexModalOpen.set(true);
    this.showToast(`Editando fórmula LaTeX existente: ${hit.latex}`);
  }

  handleInsertOrUpdateLatexFormula(latexCode: string): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const formulaHtml = this.latexRenderer.buildDocumentFormulaBlockHtml(latexCode);
      const editingId = this.editingLatexNodeId();
      if (this.canvasEditor.session.insertOrUpdateLatexFormula(formulaHtml, editingId, this.activePageIndex())) {
        this.editingLatexNodeId.set(null);
        this.editingLatexElement.set(null);
        this.editingLatexCode.set(undefined);
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast(
          editingId
            ? 'Fórmula LaTeX actualizada en la página'
            : `Fórmula LaTeX insertada en la Página ${this.activePageIndex() + 1} (haz clic sobre ella para editarla o eliminarla)`
        );
        return;
      }
    }
    return this.mediaController.handleInsertOrUpdateLatexFormula(latexCode);
  }

  handleDeleteExistingLatexFormula(): void {
    const editingId = this.editingLatexNodeId();
    if (this.canvasEnabled() && this.canvasEditor?.session && editingId) {
      if (this.canvasEditor.session.deleteLatexFormula(editingId)) {
        this.editingLatexNodeId.set(null);
        this.editingLatexElement.set(null);
        this.editingLatexCode.set(undefined);
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast('Fórmula LaTeX eliminada del documento (Ctrl+Z para restaurar)');
        return;
      }
    }
    return this.mediaController.handleDeleteExistingLatexFormula();
  }

  updateTableResizeCursor(event: PointerEvent): void { return this.tablesController.updateTableResizeCursor(event); }

  startTableResize(event: PointerEvent, pageIndex: number): void { return this.tablesController.startTableResize(event, pageIndex); }

  modifyActiveTable(
    action: 'addRow' | 'addRowAbove' | 'addRowBelow' | 'addCol' | 'addColLeft' | 'addColRight' | 'delRow' | 'delCol' | 'delTable' | 'splitCell',
  ): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.modifyTable(action)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      return;
    }
    return this.tablesController.modifyActiveTable(action);
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseTableContextMenu(): void {
    if (this.tableContextMenu()) {
      this.tableContextMenu.set(null);
    }
  }

  openTableContextMenu(clientX: number, clientY: number): void {
    if (this.isReadMode()) return;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = Math.max(8, Math.min(clientX, vw - 240));
    const y = Math.max(8, Math.min(clientY, vh - 360));
    this.tableContextMenu.set({ x, y });
  }

  closeTableContextMenu(): void {
    this.tableContextMenu.set(null);
  }

  onPageDomContextMenu(event: MouseEvent, pageIndex: number): void {
    if (this.isReadMode()) return;
    const target = event.target as HTMLElement | null;
    const cell = target?.closest('td, th') as HTMLTableCellElement | null;
    if (!cell) return;
    event.preventDefault();
    this.activePageIndex.set(pageIndex);
    this.activeTableCell.set(cell);
    const vAlign = cell.style.verticalAlign;
    this.activeTableVerticalAlign.set(vAlign === 'middle' || vAlign === 'bottom' ? vAlign : 'top');
    const tbl = cell.closest('table') as HTMLTableElement | null;
    this.activeTableRepeatHeader.set(tbl?.dataset['repeatHeader'] !== 'false');
    this.openTableContextMenu(event.clientX, event.clientY);
  }

  runContextTableAction(
    action: 'addRowAbove' | 'addRowBelow' | 'addColLeft' | 'addColRight' | 'delRow' | 'delCol' | 'delTable' | 'splitCell',
  ): void {
    this.modifyActiveTable(action);
    this.closeTableContextMenu();
  }

  setTableCellBackground(color: string | null): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.setTableCellBackground(color)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      this.closeTableContextMenu();
      return;
    }
    this.tablesController.setCellBackground(color);
    this.closeTableContextMenu();
  }

  setTableCellVerticalAlign(align: 'top' | 'middle' | 'bottom'): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.setTableCellVerticalAlign(align)) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
      }
      this.closeTableContextMenu();
      return;
    }
    this.tablesController.setCellVerticalAlign(align);
    this.activeTableVerticalAlign.set(align);
    this.closeTableContextMenu();
  }

  toggleTableHeaderRepeat(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.toggleTableHeaderRepeat()) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast(
          this.activeTableRepeatHeader()
            ? 'Encabezado repetido automáticamente en cada página'
            : 'Repetición de encabezado desactivada en esta tabla',
        );
      }
      this.closeTableContextMenu();
      return;
    }
    const enabled = this.tablesController.toggleHeaderRepeat();
    this.activeTableRepeatHeader.set(enabled);
    this.showToast(
      enabled
        ? 'Encabezado repetido automáticamente en cada página'
        : 'Repetición de encabezado desactivada en esta tabla',
    );
    this.closeTableContextMenu();
  }

  toggleTableRowTopBorder(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.toggleTableRowTopBorder()) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast(
          this.activeTableRowTopBorder()
            ? 'Borde superior agregado a la fila de la tabla'
            : 'Borde superior quitado de la fila de la tabla',
        );
      }
      return;
    }
    const enabled = this.tablesController.toggleRowTopBorder();
    this.activeTableRowTopBorder.set(enabled);
  }

  handleFileImport(e: Event): Promise<void> { return this.filesController.handleFileImport(e); }

  jumpToPage(pageIdx: number): void { if(this.canvasEnabled()&&this.canvasEditor?.session){this.activePageIndex.set(pageIdx);this.canvasEditor.jump(pageIdx);return;}return this.navigationController.jumpToPage(pageIdx); }

  handleFocusHeaderArea(): void {
    if (this.canvasEnabled() && this.canvasEditor) {
      this.handleUpdateLayout(prev => ({ ...prev, showHeaderFooter: true }));
      this.canvasEditor.openHeaderFooterEditor('header', this.activePageIndex());
      return;
    }
    return this.navigationController.handleFocusHeaderArea();
  }

  handleCanvasHeaderFooterChange(patch: {
    headerHtml?: string;
    footerHtml?: string;
    differentFirstPage?: boolean;
    pageIndex?: number;
  }): void {
    const { differentFirstPage, pageIndex, headerHtml, footerHtml } = patch;
    if (differentFirstPage !== undefined) {
      this.handleUpdateSectionConfig({ differentFirstPage }, pageIndex);
    }
    if (headerHtml !== undefined || footerHtml !== undefined) {
      const idx = pageIndex ?? this.activePageIndex();
      const info = this.resolvedPageSections()[idx];
      const pages = this.pages();
      const hasSectionOverride =
        info &&
        info.sectionIndex > 0 &&
        ((headerHtml !== undefined && pages.find((_p, i) => i === idx || this.resolvedPageSections()[i]?.sectionIndex === info.sectionIndex)?.sectionConfig?.headerHtml !== undefined) ||
          (footerHtml !== undefined && pages.find((_p, i) => i === idx || this.resolvedPageSections()[i]?.sectionIndex === info.sectionIndex)?.sectionConfig?.footerHtml !== undefined));
      if (hasSectionOverride) {
        this.handleUpdateSectionConfig({
          ...(headerHtml !== undefined ? { headerHtml } : {}),
          ...(footerHtml !== undefined ? { footerHtml } : {}),
        }, idx);
      } else {
        this.handleUpdateLayout(prev => ({
          ...prev,
          ...(headerHtml !== undefined ? { headerHtml } : {}),
          ...(footerHtml !== undefined ? { footerHtml } : {}),
        }));
      }
    }
  }

  handleUpdateLayout(updater: (prev: DocumentLayoutConfig) => DocumentLayoutConfig): void { return this.layoutController.handleUpdateLayout(updater); }

  handleSetDarkMode(dark: boolean): void { return this.layoutController.handleSetDarkMode(dark); }

  openLatexModal(): void { this.editingLatexNodeId.set(null); return this.mediaController.openLatexModal(); }

  onCloseLatexModal(): void { this.editingLatexNodeId.set(null); return this.mediaController.onCloseLatexModal(); }

  onRibbonCommand(event: { command: string; value?: string }): void {
    if(event.command==='chapter'){this.handleApplyHeading('CHAPTER');return;}
    const { command, value } = event;
    if (['undo', 'redo', 'toggleMarks', 'find', 'replace'].includes(command)) {
      return this.formattingController.onRibbonCommand(event);
    }
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      const session = this.canvasEditor.session;
      if (command === 'headingNumbering') {
        if (!this.documentReady() || this.isReadMode()) return;
        session.pushMetaSnapshot(this.captureCanvasMeta());
        this.headingNumbering.set(value === 'on');
        this.canvasEditor.publishNow(
          this.canvasGeometry(),
          this.canvasDefaults(),
          this.canvasStyleTemplate(),
          this.headingNumbering(),
        );
        this.updateSelectionFormats();
        this.scheduleAutoSave(this.collectDocData());
        this.showToast(
          value === 'on'
            ? 'Títulos H1–H6 vinculados a la numeración 1, 1.1, 1.1.1'
            : 'Numeración automática de títulos desactivada',
        );
        return;
      }
      if (command === 'removeFormat') {
        if (!this.documentReady() || this.isReadMode()) return;
        this.applyRemoveFormatCanvas();
        return;
      }
      if (['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript', 'insertUnorderedList', 'insertOrderedList', 'foreColor', 'hiliteColor', 'backColor', 'fontName', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'insertHTML', 'createLink', 'formatBlock', 'insertHorizontalRule'].includes(command)) {
        this.executeCommand(command, value);
        return;
      }
      if (command === 'listStyle' && value) {
        if (session.applyListStyle(value, this.canvasStyleTemplate())) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          return;
        }
      }
      if (command === 'fontSizePt' || command === 'growFont' || command === 'shrinkFont') {
        const presets = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
        const current = parseFloat(this.formats().fontSize) || 11;
        const size = command === 'fontSizePt' ? Number(value) : command === 'growFont'
          ? presets.find(s => s > current) ?? Math.min(400, current + 2)
          : [...presets].reverse().find(s => s < current) ?? Math.max(1, current - 1);
        this.handleApplyFontSizePt(String(size), '7');
        return;
      }
      if (command === 'lineHeight' && value) {
        if (session.applyBlockStylePatch({ 'line-height': value }, { 'data-word-line-spacing': value })) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          return;
        }
      }
      if (command === 'spaceBefore' && value !== undefined) {
        if (session.applyBlockStylePatch({ 'margin-top': `${parseFloat(value) || 0}pt` })) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          return;
        }
      }
      if (command === 'spaceAfter' && value !== undefined) {
        if (session.applyBlockStylePatch({ 'margin-bottom': `${parseFloat(value) || 0}pt` })) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          return;
        }
      }
      if (command === 'indent' || command === 'outdent') {
        if (session.adjustBlockIndent(command === 'indent' ? 24 : -24)) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          return;
        }
      }
      if (command === 'selectAllDocument') {
        session.selectAll();
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        return;
      }
      if (command === 'selectCurrentParagraph') {
        if (session.selectCurrentParagraph()) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'selectPage') {
        if (session.selectPage(this.activePageIndex())) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'changeCase' && value) {
        if (session.changeCase(value)) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'textEffect') {
        if (session.applyTextEffect(value || 'none')) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'paragraphShading') {
        if (session.applyBlockStylePatch({ 'background-color': value || 'transparent' })) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'paragraphBorder') {
        const borderPatch: Record<string, string | null> = {
          border: null,
          'border-top': null,
          'border-bottom': null,
        };
        if (value === 'all') borderPatch['border'] = '1px solid currentColor';
        else if (value === 'top') borderPatch['border-top'] = '1px solid currentColor';
        else if (value === 'bottom') borderPatch['border-bottom'] = '1px solid currentColor';
        if (session.applyBlockStylePatch(borderPatch)) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'sortParagraphs') {
        if (session.sortSelectedParagraphs(value === 'desc' ? 'desc' : 'asc')) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'multilevelList') {
        if (session.applyMultilevelList()) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
        }
        return;
      }
      if (command === 'restartListNumbering') {
        if (session.restartListNumbering(1)) {
          this.canvasEditor.publishNow();
          this.updateSelectionFormats();
          this.showToast('Numeración de lista reiniciada en 1');
        }
        return;
      }
      return;
    }
    return this.formattingController.onRibbonCommand(event);
  }

  openDocumentSearch(mode: 'find' | 'replace'): void { return this.searchController.openDocumentSearch(mode); }

  updateSearchConfig(patch: Partial<WordSearchConfig>): void { return this.searchController.updateSearchConfig(patch); }

  handleSearchAction(action: WordSearchAction): void { return this.searchController.handleSearchAction(action); }

  resetDocumentSearch(): void { return this.searchController.resetDocumentSearch(); }

  findNextMatch(backwards = false): void { return this.searchController.findNextMatch(backwards); }

  replaceDocumentMatches(all = false): void { return this.searchController.replaceDocumentMatches(all); }

  exportWord(): Promise<void> { return this.filesController.exportWord(); }

  exportLegacyDoc(): Promise<void> { return this.filesController.exportLegacyDoc(); }

  exportPdf(): Promise<void> { return this.filesController.exportPdf(); }

  exportHtml(): Promise<void> { return this.filesController.exportHtml(); }

  exportMarkdown(): void { return this.filesController.exportMarkdown(); }

  exportTxt(): void { return this.filesController.exportTxt(); }

  exportWordFromHeader(): Promise<void> { return this.filesController.exportWordFromHeader(); }

  dismissExportFeedback(): void {
    this.filesController.clearExportFeedback();
    this.clearToast();
  }

  openFilePicker(): void { return this.navigationController.openFilePicker(); }

  exitFocusOrRead(): void { return this.navigationController.exitFocusOrRead(); }

  handleOutlineClick(h: HeadingItem): void {
    this.viewMode.set('print');
    setTimeout(() => this.handleSelectHeadingInSidebar(h.id, h.pageIndex), 0);
  }

  onDeletePageClick(e: Event, pageIndex: number): void { return this.navigationController.onDeletePageClick(e, pageIndex); }

  onDocTitleInput(e: Event): void { return this.navigationController.onDocTitleInput(e); }

  onPageNumberChange(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) this.jumpToPage(val - 1);
  }

  onZoomInput(e: Event): void { return this.navigationController.onZoomInput(e); }
  setDocumentZoom(percent: number): void { this.navigationController.setDocumentZoom(percent); }
  onPageWheel(event: WheelEvent): void { this.navigationController.onPageWheel(event); }

  onHeaderInput(e: Event): void { return this.layoutController.onHeaderInput(e); }

  onFooterInput(e: Event): void { return this.layoutController.onFooterInput(e); }

  private applyActiveListRules(): void { return this.formattingController.applyActiveListRules(); }

  onPageInput(e: Event, pageIndex: number): void { return this.inputController.onPageInput(e, pageIndex); }

  onPageBeforeInput(event: Event, pageIndex: number): void { return this.inputController.onPageBeforeInput(event, pageIndex); }

  onPageCompositionStart(): void { return this.inputController.onPageCompositionStart(); }

  onPageCompositionEnd(pageIndex: number): void { return this.inputController.onPageCompositionEnd(pageIndex); }

  onPageKeyDown(e: KeyboardEvent, pageIndex: number): void { if (e.key === 'Escape') this.clearObjectSelection(); return this.inputController.onPageKeyDown(e, pageIndex); }

  /** Keep contentEditable's empty state as a real paragraph after Ctrl+A + Delete. */

  activeTableToolsVisible(): boolean { return this.tablesController.activeTableToolsVisible(); }

  pagePaddingTop(): number { return this.layoutController.pagePaddingTop(); }

  pagePaddingRight(): number { return this.layoutController.pagePaddingRight(); }

  pagePaddingBottom(): number { return this.layoutController.pagePaddingBottom(); }

  pagePaddingLeft(): number { return this.layoutController.pagePaddingLeft(); }

  maxOf(a: number, b: number): number {
    return Math.max(a, b);
  }
  get imageResizeBox() { return this.imagesController.box; }
  get tableMergeBox() { return this.tablesController.mergeBox; }
  get isImageResizing(): boolean { return this.imagesController.resizing; }
  clearObjectSelection(): void { this.imagesController.clear(); this.tablesController.clearSelection(); }
  refreshObjectOverlays(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) return;
    this.imagesController.refresh();
    this.tablesController.refreshSelection();
  }
  startImageResize(event: PointerEvent): void { this.imagesController.start(event); }
  canMergeTableCells(): boolean {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      return this.canvasEditor.session.canMergeTableCells();
    }
    return this.tablesController.canMergeCells();
  }
  combineTableCells(): void {
    if (this.canvasEnabled() && this.canvasEditor?.session) {
      if (this.canvasEditor.session.mergeSelectedTableCells()) {
        this.canvasEditor.publishNow();
        this.updateSelectionFormats();
        this.showToast('Celdas combinadas');
        return;
      }
    }
    this.tablesController.combineCells();
  }
  onPagePointerDown(event: PointerEvent, pageIndex: number): void {
    if (this.imagesController.select(event, pageIndex)) { this.tablesController.clearSelection(); return; }
    this.imagesController.clear();
    if (!this.tablesController.selectCell(event, pageIndex)) this.tablesController.startTableResize(event, pageIndex);
  }

}
