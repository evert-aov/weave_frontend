import { ProofreadingDirective } from '../../shared/directives/proofreading.directive';
import { ProofreadingControlComponent } from '../../shared/components/proofreading-control/proofreading-control.component';
import { WordTocController } from './controllers/word-toc.controller';
import { WordAcademicController } from './controllers/word-academic.controller';
import type { BibliographicSource } from './models/academic.model';
import { WordAcademicPanelComponent } from './components/word-academic-panel/word-academic-panel.component';
import { WordImagesController } from './controllers/word-images.controller';
import { AiDocumentService } from '../../core/services/ai-document.service';
import { domTextFields, applyHtmlText } from '../../core/utils/ai-edit-text';
import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  AfterViewChecked,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  ViewEncapsulation,
  inject,
  signal,
  input,
  untracked,
  computed,
  effect,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideFileText,
  LucideCheckCircle2,
  LucidePlus,
  LucideTrash2,
  LucideColumns,
  LucideRows,
  LucideDownload,
  LucideUpload,
  LucideFilePlus2,
  LucideChevronUp,
  LucideChevronDown,
  LucidePalette,
  LucideChevronsLeft,
  LucideChevronsRight,
  LucideMinimize2,
  provideLucideIcons,
} from '@lucide/angular';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentFlowService } from './services/document-flow.service';
import {
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
import type { HistorySnapshot, DocDataV2, TableResizeState } from './models/word-editor-state.model';
import { DEFAULT_FORMATS, DEFAULT_DOC_TITLE } from './constants/word-editor.constants';
import { WordPersistenceController } from './controllers/word-persistence.controller';
import { WordFlowController } from './controllers/word-flow.controller';
import { WordFormattingController } from './controllers/word-formatting.controller';
import { WordLayoutController } from './controllers/word-layout.controller';
import { WordInputController } from './controllers/word-input.controller';
import { WordInsertController } from './controllers/word-insert.controller';
import { WordMediaController } from './controllers/word-media.controller';
import { WordTablesController } from './controllers/word-tables.controller';
import { WordNavigationController } from './controllers/word-navigation.controller';
import { WordSearchController } from './controllers/word-search.controller';
import { WordFilesController } from './controllers/word-files.controller';
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
  encapsulation: ViewEncapsulation.None,
  imports: [
    ProofreadingDirective, ProofreadingControlComponent,
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
  ],
  providers: [
    provideLucideIcons(
      LucideFileText,
      LucideCheckCircle2,
      LucidePlus,
      LucideTrash2,
      LucideColumns,
      LucideRows,
      LucideDownload,
      LucideUpload,
      LucideFilePlus2,
      LucideChevronUp,
      LucideChevronDown,
      LucidePalette,
      LucideChevronsLeft,
      LucideChevronsRight,
      LucideMinimize2
    ),
  ],
  templateUrl: './pure-doc-editor.component.html',
  styleUrls: ['./pure-doc-editor.component.scss'],
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

  readonly activePageIndex = signal<number>(0);
  readonly docxProperties = signal<DocxDocumentProperties | null>(null);
  readonly importedTocEntries = signal<HeadingItem[]>([]);
  readonly activeTab = signal<RibbonTab>('home');
  readonly pdfExporting = signal(false);
  readonly pdfExportMessage = signal('');
  readonly pdfExportFailed = signal(false);
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

  readonly statusMessage = signal<string>(
    'Word Studio Pro: Columnas por sección, Márgenes personalizados, Fórmulas LaTeX editables/eliminables y Modos de Vista'
  );
  readonly formatPainterActive = signal<boolean>(false);
  readonly copiedInlineStyle = signal<ElementStyleRule | null>(null);
  readonly activeTableCell = signal<HTMLTableCellElement | null>(null);
  readonly latexModalOpen = signal<boolean>(false);
  readonly smartArtModalOpen = signal<boolean>(false);
  readonly iconsModalOpen = signal<boolean>(false);
  readonly editingLatexElement = signal<HTMLElement | null>(null);
  readonly editingLatexCode = signal<string | undefined>(undefined);
  readonly pendingScrollHeadingId = signal<string | null>(null);

  readonly rulerTicks = Array.from({ length: 22 }, (_, i) => i);
  readonly lineNumberTicks = Array.from({ length: 42 }, (_, i) => i);

  // ---------------------------------------------------------------------------
  // Estado derivado
  // ---------------------------------------------------------------------------
  private readonly pageAnalysis = new WordPageAnalysisCache();
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
      captureHistory: (...args) => this.captureHistory(...args),
      get cdr() { return editor.cdr; },
      collectDocData: (...args) => this.collectDocData(...args),
      get composing() { return editor.composing; },
      get destroyed() { return editor.destroyed; },
      set destroyed(value) { editor.destroyed = value; },
      get dialogs() { return editor.dialogs; },
      get documentFlow() { return editor.documentFlow; },
      finishDocumentMutation: (...args) => this.finishDocumentMutation(...args),
      getActivePageElement: (...args) => this.getActivePageElement(...args),
      getLivePagesSnapshot: (...args) => this.getLivePagesSnapshot(...args),
      get imageStore() { return editor.imageStore; },
      get lastFlowPages() { return editor.lastFlowPages; },
      set lastFlowPages(value) { editor.lastFlowPages = value; },
      get lastInputTime() { return editor.lastInputTime; },
      set lastInputTime(value) { editor.lastInputTime = value; },
      get latexRenderer() { return editor.latexRenderer; },
      liveBodies: (...args) => this.liveBodies(...args),
      get loadedNoteId() { return editor.loadedNoteId; },
      set loadedNoteId(value) { editor.loadedNoteId = value; },
      get notesService() { return editor.notesService; },
      get pendingRenderPages() { return editor.pendingRenderPages; },
      set pendingRenderPages(value) { editor.pendingRenderPages = value; },
      get pendingTypingStyle() { return editor.pendingTypingStyle; },
      set pendingTypingStyle(value) { editor.pendingTypingStyle = value; },
      prepareRibbonSelection: (...args) => this.prepareRibbonSelection(...args),
      get redoStack() { return editor.redoStack; },
      set redoStack(value) { editor.redoStack = value; },
      get references() { return editor.references; },
      refreshApaToc: () => this.tocController.refreshApa(),
      settleApaToc: () => this.tocController.afterFlow(),
      reflowDocument: (...args) => this.reflowDocument(...args),
      renderDocumentPages: (...args) => this.renderDocumentPages(...args),
      restoreSelection: (...args) => this.restoreSelection(...args),
      samePages: (...args) => this.samePages(...args),
      saveSelection: (...args) => this.saveSelection(...args),
      get savedRange() { return editor.savedRange; },
      set savedRange(value) { editor.savedRange = value; },
      scheduleAutoSave: (...args) => this.scheduleAutoSave(...args),
      scheduleDocumentFlow: (...args) => this.scheduleDocumentFlow(...args),
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
  private readonly onObjectViewportChange = () => {
    if (!this.active() || this.viewportFrame !== null) return;
    this.viewportFrame = requestAnimationFrame(() => {
      this.viewportFrame = null;
      if (this.active() && !this.destroyed) this.refreshObjectOverlays();
    });
  };

  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register({
    owner: () => this.active() && this.documentReady() ? this.loadedNoteId ?? undefined : undefined,
    fields: () => this.aiTextFields(),
    apply: values => {
      this.pushUndoSnapshot();
      const targets = [...values.keys()];
      const pages = this.getLivePagesSnapshot().map(page => targets.some(id => id.startsWith(`page:${page.id}:`))
        ? { ...page, html: applyHtmlText(page.html, `page:${page.id}`, values) } : page);
      this.renderDocumentPages(pages);
      this.captureLatestSave(); void this.flushSave();
    },
  });

  private *aiTextFields(): Generator<{ id: string; text: string }> {
    // Recorrer primero el esquema completo evita perder capítulos posteriores al agotar el presupuesto.
    for (const scope of ['headings', 'body'] as const) {
      for (const page of this.pages()) {
        const body = this.getPageBody(page.id) ?? new DOMParser().parseFromString(page.html, 'text/html').body;
        yield* domTextFields(body, `page:${page.id}`, scope);
      }
    }
  }

  constructor() {
    effect(() => {
      const active = this.active();
      untracked(() => {
        if (active) this.scheduleDocumentFlow();
        else { this.captureLatestSave(); void this.flushSave(); }
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
      if (newId && newId !== this.loadedNoteId) {
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

  // ---------------------------------------------------------------------------
  // Hidratación y persistencia
  // ---------------------------------------------------------------------------
  private hydrateFromNote(): Promise<void> { return this.persistenceController.hydrateFromNote(); }

  /**
   * Sube las imágenes embebidas y usa sus rutas permanentes en el JSON persistido.
   */

  private collectDocData(): DocDataV2 { return this.persistenceController.collectDocData(); }

  private scheduleAutoSave(payload: DocDataV2): void { return this.persistenceController.scheduleAutoSave(payload); }

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
  private getLivePagesSnapshot(): DocumentPage[] { return this.flowController.getLivePagesSnapshot(); }

  private showToast(msg: string): void {
    this.statusMessage.set(msg);
  }

  private getActivePageElement(): HTMLDivElement | null { return this.flowController.getActivePageElement(); }

  activePageHtml(): string { return this.flowController.activePageHtml(); }

  commitPageDomToState(pageIndex: number): void { return this.flowController.commitPageDomToState(pageIndex); }

  pushUndoSnapshot(overridePages?: DocumentPage[]): void { return this.persistenceController.pushUndoSnapshot(overridePages); }

  handleGlobalUndo(): void { return this.persistenceController.handleGlobalUndo(); }

  handleGlobalRedo(): void { return this.persistenceController.handleGlobalRedo(); }

  private captureHistory(): HistorySnapshot { return this.persistenceController.captureHistory(); }

  /** Input, formatting and layout changes share the same bidirectional flow transaction. */
  checkAndPaginateOverflow(_pageIndex: number, _preChangePagesSnapshot?: DocumentPage[]): void { return this.flowController.checkAndPaginateOverflow(_pageIndex, _preChangePagesSnapshot); }

  private scheduleDocumentFlow(deferInput = false): void { return this.flowController.scheduleDocumentFlow(deferInput); }

  private invalidateDocumentFlow(): void { return this.flowController.invalidateDocumentFlow(); }

  private samePages(left: DocumentPage[], right: DocumentPage[] | null | undefined): boolean { return this.flowController.samePages(left, right); }

  private reflowDocument(sourcePages?: DocumentPage[]): boolean { return this.flowController.reflowDocument(sourcePages); }

  private liveBodies(): HTMLElement[] { return this.flowController.liveBodies(); }

  private renderDocumentPages(pages: DocumentPage[], reflowAfterRender = true): void { return this.flowController.renderDocumentPages(pages, reflowAfterRender); }

  updateSelectionFormats(): void { return this.formattingController.updateSelectionFormats(); }

  handleInsertTabCharacter(): void { return this.formattingController.handleInsertTabCharacter(); }

  executeCommand(command: string, value?: string): void { return this.formattingController.executeCommand(command, value); }

  handleApplySectionColumns(preset: SectionColumnsPreset): void { return this.layoutController.handleApplySectionColumns(preset); }

  handleApplyParagraphSpacingAndIndent(patch: {
    indentLeftCm?: number; indentRightCm?: number; spaceBeforePt?: number; spaceAfterPt?: number;
  }): void { return this.layoutController.handleApplyParagraphSpacingAndIndent(patch); }

  handleReadAloud(): void { return this.navigationController.handleReadAloud(); }

  /** Preserve the document range while ribbon inputs take keyboard focus. */
  rememberRibbonSelection(): void { return this.formattingController.rememberRibbonSelection(); }

  private prepareRibbonSelection(): Range | null { return this.formattingController.prepareRibbonSelection(); }

  private finishDocumentMutation(): void { return this.formattingController.finishDocumentMutation(); }

  handleApplyRuleToSelection(rule: ElementStyleRule): void { return this.formattingController.handleApplyRuleToSelection(rule); }

  handleUpdateStyleFromSelection(tag: StyleTargetTag): void { return this.formattingController.handleUpdateStyleFromSelection(tag); }

  handleApplyTemplateToDocument(template: StyleTemplate): void { return this.formattingController.handleApplyTemplateToDocument(template); }

  handleSaveCustomTemplate(newTpl: StyleTemplate): void { return this.formattingController.handleSaveCustomTemplate(newTpl); }

  handleDeleteCustomTemplate(id: string): void { return this.formattingController.handleDeleteCustomTemplate(id); }

  handleApplyFontSizePt(pt: string, _fallbackCmd: string): void { return this.formattingController.handleApplyFontSizePt(pt, _fallbackCmd); }

  handleApplyHeading(tag: string): void { return this.formattingController.handleApplyHeading(tag); }

  handleAddNewPageAt(insertAfterIndex: number): void { return this.layoutController.handleAddNewPageAt(insertAfterIndex); }

  handleInsertPageBreak(): void { return this.layoutController.handleInsertPageBreak(); }

  handleDeletePage(indexToDelete: number): void { return this.layoutController.handleDeletePage(indexToDelete); }

  handleInsertTable(rows: number, cols: number): void { return this.tablesController.handleInsertTable(rows, cols); }

  handleUpdateToc(): void { this.tocController.update(); }
  handleInsertToc(): void { return this.tocController.update(true); }

  handleSelectHeadingInSidebar(id: string, pageIndex: number): void { return this.navigationController.handleSelectHeadingInSidebar(id, pageIndex); }

  handleSelectTableInSidebar(tbl: TableItem): void { return this.tablesController.handleSelectTableInSidebar(tbl); }

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

  insertHtmlAtCursorOrActivePage(html: string, keepInlineCaret = false): void { return this.insertController.insertHtmlAtCursorOrActivePage(html, keepInlineCaret); }

  handleInsertShapeHtml(shapeHtml: string): void { return this.mediaController.handleInsertShapeHtml(shapeHtml); }

  handleInsertSmartArt(item: SmartArtItem): void { return this.mediaController.handleInsertSmartArt(item); }

  handleInsertIcon(iconName: string): void { return this.mediaController.handleInsertIcon(iconName); }

  handleInsert3dModel(): void { return this.mediaController.handleInsert3dModel(); }

  handleInsertScreenshot(): void { return this.mediaController.handleInsertScreenshot(); }

  handleInsertComment(): void { return this.insertController.handleInsertComment(); }

  handleFocusFooterArea(): void { return this.navigationController.handleFocusFooterArea(); }

  handleInsertPageNumber(): void { return this.insertController.handleInsertPageNumber(); }

  handleInsertTextBox(): void { return this.insertController.handleInsertTextBox(); }

  handleInsertWordArt(preset: WordArtPreset): void { return this.insertController.handleInsertWordArt(preset); }

  handleInsertDropCap(): void { return this.insertController.handleInsertDropCap(); }

  handleInsertSignatureLine(): void { return this.insertController.handleInsertSignatureLine(); }

  handleInsertDateTime(): void { return this.insertController.handleInsertDateTime(); }

  handleInsertSymbol(symbol: string): void { return this.insertController.handleInsertSymbol(symbol); }

  handleInsertDrawingCanvas(): void { return this.insertController.handleInsertDrawingCanvas(); }

  handleApplyLineHeight(lineHeight: string): void { return this.formattingController.handleApplyLineHeight(lineHeight); }

  handleCopyFormat(): void { return this.formattingController.handleCopyFormat(); }

  handleEditorMouseUp(e: MouseEvent): void { this.mediaController.handleEditorMouseUp(e); this.tablesController.refreshSelection(); }

  handleInsertOrUpdateLatexFormula(latexCode: string): void { return this.mediaController.handleInsertOrUpdateLatexFormula(latexCode); }

  handleDeleteExistingLatexFormula(): void { return this.mediaController.handleDeleteExistingLatexFormula(); }

  updateTableResizeCursor(event: PointerEvent): void { return this.tablesController.updateTableResizeCursor(event); }

  startTableResize(event: PointerEvent, pageIndex: number): void { return this.tablesController.startTableResize(event, pageIndex); }

  modifyActiveTable(action: 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable'): void { return this.tablesController.modifyActiveTable(action); }

  handleFileImport(e: Event): Promise<void> { return this.filesController.handleFileImport(e); }

  jumpToPage(pageIdx: number): void { return this.navigationController.jumpToPage(pageIdx); }

  handleFocusHeaderArea(): void { return this.navigationController.handleFocusHeaderArea(); }

  handleUpdateLayout(updater: (prev: DocumentLayoutConfig) => DocumentLayoutConfig): void { return this.layoutController.handleUpdateLayout(updater); }

  handleSetDarkMode(dark: boolean): void { return this.layoutController.handleSetDarkMode(dark); }

  openLatexModal(): void { return this.mediaController.openLatexModal(); }

  onCloseLatexModal(): void { return this.mediaController.onCloseLatexModal(); }

  onRibbonCommand(event: { command: string; value?: string }): void { return this.formattingController.onRibbonCommand(event); }

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

  openFilePicker(): void { return this.navigationController.openFilePicker(); }

  exitFocusOrRead(): void { return this.navigationController.exitFocusOrRead(); }

  handleOutlineClick(h: HeadingItem): void { return this.navigationController.handleOutlineClick(h); }

  onDeletePageClick(e: Event, pageIndex: number): void { return this.navigationController.onDeletePageClick(e, pageIndex); }

  onDocTitleInput(e: Event): void { return this.navigationController.onDocTitleInput(e); }

  onPageNumberChange(e: Event): void { return this.navigationController.onPageNumberChange(e); }

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
  refreshObjectOverlays(): void { this.imagesController.refresh(); this.tablesController.refreshSelection(); }
  startImageResize(event: PointerEvent): void { this.imagesController.start(event); }
  canMergeTableCells(): boolean { return this.tablesController.canMergeCells(); }
  combineTableCells(): void { this.tablesController.combineCells(); }
  onPagePointerDown(event: PointerEvent, pageIndex: number): void {
    if (this.imagesController.select(event, pageIndex)) { this.tablesController.clearSelection(); return; }
    this.imagesController.clear();
    if (!this.tablesController.selectCell(event, pageIndex)) this.tablesController.startTableResize(event, pageIndex);
  }

}
