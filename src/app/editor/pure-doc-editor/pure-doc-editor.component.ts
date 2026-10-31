import { AiDocumentService } from '../../core/services/ai-document.service';
import { htmlTextFields, domTextFields, applyHtmlText } from '../../core/utils/ai-edit-text';
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
  computed,
  effect,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
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
import { caretAtBoundary, deleteAtContinuation, joinBoundaryBlocks, markDocumentSelection, restoreDocumentSelection, withoutSelectionMarkers } from './utils/document-selection';
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
import { renumberHeadings } from './utils/heading-numbering';
import { analyzePageHtmlFast } from './utils/word-editor.utils';
import { applyStyleRule, cssPoints, findDocumentText, selectedParagraphs, selectionStyle, selectionElement, scriptPosition, replaceParagraphTag } from './utils/document-formatting';
import { applyHomeCommand, applyInlineProperties, currentParagraph, inlineProperties, applyScript, scriptBaseSize } from './utils/home-editing';
import { clipboardTableHtml } from '../../shared/utils/clipboard-table';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { DialogService } from '../../core/services/dialog.service';
import { documentHref } from '../../core/utils/document-link';
import { WordRibbonComponent } from './components/word-ribbon/word-ribbon.component';
import { WordSearchPanelComponent, WordSearchAction, WordSearchConfig } from './components/word-search-panel/word-search-panel.component';
import { WordTocSidebarComponent } from './components/word-toc-sidebar/word-toc-sidebar.component';
import { WordDocxBannerComponent } from './components/word-docx-banner/word-docx-banner.component';
import { WordStyleTemplatesModalComponent } from './components/word-style-templates-modal/word-style-templates-modal.component';
import { WordLatexModalComponent } from './components/word-latex-modal/word-latex-modal.component';
import { WordSmartArtModalComponent } from './components/word-smartart-modal/word-smartart-modal.component';
import { WordIconsModalComponent } from './components/word-icons-modal/word-icons-modal.component';
import { SmartArtItem, WordArtPreset } from './models/word-insert.model';
import { ICON_SVG_PATHS } from './constants/word-insert.constants';

const DEFAULT_FORMATS: EditorActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  subscript: false,
  superscript: false,
  justifyLeft: true,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  heading: 'P',
  fontName: 'Times New Roman',
  fontSize: '11',
  indentLeftCm: 0,
  indentRightCm: 0,
  spaceBeforePt: 0,
  spaceAfterPt: 4,
  lineHeight: '1.15',
};

const DEFAULT_DOC_TITLE = 'Documento sin título';

interface HistorySnapshot {
  pages: DocumentPage[];
  activePageIndex: number;
  templates: StyleTemplate[];
  activeTemplateId: string;
  headingNumbering: boolean;
}

interface DocDataV2 {
  v: 2;
  docTitle?: string;
  pages?: DocumentPage[];
  layoutConfig?: DocumentLayoutConfig;
  customTemplates?: StyleTemplate[];
  activeTemplateId?: string;
  viewMode?: DocumentViewMode;
  pageMovement?: PageMovementMode;
  showRuler?: boolean;
  showGridlines?: boolean;
  zoom?: number;
  darkMode?: boolean;
  darkCanvas?: boolean;
  headingNumbering?: boolean;
}

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
  readonly showFormattingMarks = signal(false);
  readonly headingNumbering = signal(false);
  readonly searchMode = signal<'find' | 'replace' | null>(null);
  readonly searchQuery = signal('');
  readonly replacementText = signal('');
  readonly searchCase = signal(false);
  readonly searchWholeWord = signal(false);
  readonly searchStatus = signal('');
  private searchMatchIndex = -1;
  private pendingTypingStyle: Record<string, string> | null = null;
  private pendingTypingRange: Range | null = null;
  readonly formats = signal<EditorActiveFormats>({ ...DEFAULT_FORMATS });

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
  readonly analysis = computed(() => {
    const currentPages = this.pages();
    const allHeadings: HeadingItem[] = [];
    const allTables: TableItem[] = [];
    let totalWords = 0;
    let totalChars = 0;
    let totalParagraphs = 0;

    for (let i = 0; i < currentPages.length; i++) {
      const res = analyzePageHtmlFast(currentPages[i].html, i);
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
        (layout.showHeaderFooter && this.viewMode() === 'print' ? 76 : 0)
    );
  });

  // ---------------------------------------------------------------------------
  // Estado interno
  // ---------------------------------------------------------------------------
  private pageBodyMap = new Map<string, HTMLElement>();
  private headerMap = new Map<string, HTMLElement>();
  private footerMap = new Map<string, HTMLElement>();

  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  readonly documentReady = signal(false);
  private hydrationVersion = 0;
  private destroyed = false;
  private loadedNoteId: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingPayload: DocDataV2 | null = null;
  private pendingNoteId: string | null = null;
  private saveInFlight: Promise<void> | null = null;
  private lastSavedJson = '';
  private querySubscriptions: { unsubscribe(): void }[] = [];
  private mapsDirty = false;
  private flowFrame: number | null = null;
  private pendingRenderPages: DocumentPage[] | null = null;
  private pendingRenderNeedsFlow = false;
  private lastFlowPages: DocumentPage[] | null = null;
  private lastFlowGeometry = '';
  private composing = false;
  private lastInputTime = 0;
  private lastInputType = '';
  private bodyResizeObserver?: ResizeObserver;
  private observedBody: HTMLElement | null = null;
  private readonly onFontsLoaded = () => this.invalidateDocumentFlow();
  private readonly onAssetLoaded = () => this.invalidateDocumentFlow();

  private readonly handleSelectionChange = (): void => {
    this.updateSelectionFormats();
  };

  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register({
    owner: () => this.documentReady() ? this.loadedNoteId ?? undefined : undefined,
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
    for (const page of this.pages()) {
      const body = this.getPageBody(page.id);
      yield* body ? domTextFields(body, `page:${page.id}`) : htmlTextFields(page.html, `page:${page.id}`);
    }
  }

  constructor() {
    effect(() => {
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
      document.addEventListener('selectionchange', this.handleSelectionChange);
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
    this.hydrationVersion++;
    if (this.flowFrame !== null) cancelAnimationFrame(this.flowFrame);
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
  private async hydrateFromNote(): Promise<void> {
    const version = ++this.hydrationVersion;
    const sourceNote = this.note;
    this.documentReady.set(false);
    this.pendingRenderPages = null;
    this.lastFlowPages = null;

    const doc = (sourceNote?.docData ?? null) as DocDataV2 | null;
    const rawPages =
      doc && Array.isArray(doc.pages) && doc.pages.length > 0
        ? doc.pages.map((p) => ({ ...p }))
        : [...INITIAL_DOCUMENT_PAGES];

    const pages = await Promise.all(
      rawPages.map(async (p) => ({ ...p, html: await this.imageStore.resolveImages(p.html) }))
    );

    const baseLayout = doc?.layoutConfig
      ? { ...DEFAULT_LAYOUT_CONFIG, ...doc.layoutConfig }
      : { ...DEFAULT_LAYOUT_CONFIG };
    const layout: DocumentLayoutConfig = {
      ...baseLayout,
      headerHtml: await this.imageStore.resolveImages(baseLayout.headerHtml),
      footerHtml: await this.imageStore.resolveImages(baseLayout.footerHtml),
    };

    if (this.destroyed || version !== this.hydrationVersion || sourceNote?._id !== this.note?._id) return;
    this.loadedNoteId = sourceNote?._id ?? null;

    const customTemplates =
      doc && Array.isArray(doc.customTemplates) ? doc.customTemplates : [];
    const templates = [...BUILTIN_STYLE_TEMPLATES, ...customTemplates];

    this.headingNumbering.set(doc?.headingNumbering === true);
    this.renderDocumentPages(pages);
    this.layoutConfig.set(layout);
    this.styleTemplates.set(templates);
    this.activeTemplateId.set(doc?.activeTemplateId || 'corporate-modern');
    this.docTitle.set(doc?.docTitle ?? (sourceNote?.title || DEFAULT_DOC_TITLE));

    this.viewMode.set(doc?.viewMode ?? 'print');
    this.focusMode.set(false);
    if (doc?.darkMode !== undefined && this.themeService && this.themeService.isDark() !== doc.darkMode) {
      this.themeService.setDark(doc.darkMode);
    }
    this.darkCanvas.set(doc?.darkCanvas ?? true);
    this.pageMovement.set(doc?.pageMovement ?? 'vertical');
    this.showRuler.set(doc?.showRuler ?? true);
    this.showGridlines.set(doc?.showGridlines ?? false);
    this.showTocSidebar.set(true);
    this.zoom.set(doc?.zoom ?? 100);

    this.activePageIndex.set(0);
    this.docxProperties.set(null);
    this.importedTocEntries.set([]);
    this.activeTableCell.set(null);
    this.formatPainterActive.set(false);
    this.copiedInlineStyle.set(null);
    this.editingLatexElement.set(null);
    this.editingLatexCode.set(undefined);
    this.pendingScrollHeadingId.set(null);
    this.latexModalOpen.set(false);
    this.styleModalOpen.set(false);
    this.activeTab.set('home');
    this.showFormattingMarks.set(false);
    this.searchMode.set(null);
    this.searchQuery.set('');
    this.searchStatus.set('');
    this.savedRange = null;
    this.pendingTypingStyle = null;

    this.undoStack = [];
    this.redoStack = [];

    const savedSlim = await this.buildSlimDocData(this.collectDocData());
    if (this.destroyed || version !== this.hydrationVersion || sourceNote?._id !== this.note?._id) return;
    try {
      this.lastSavedJson = JSON.stringify(savedSlim);
    } catch {
      this.lastSavedJson = '';
    }
    this.documentReady.set(true);
    this.syncInnerHtml();
    this.scheduleDocumentFlow();
  }

  /**
   * Sube las imágenes embebidas y usa sus rutas permanentes en el JSON persistido.
   */
  private async buildSlimDocData(doc: DocDataV2): Promise<DocDataV2> {
    const pages = await Promise.all(
      (doc.pages ?? []).map(async (p) => ({
        ...p,
        html: await this.imageStore.externalizeImages(p.html),
      }))
    );

    const layoutConfig = doc.layoutConfig
      ? {
          ...doc.layoutConfig,
          headerHtml: await this.imageStore.externalizeImages(doc.layoutConfig.headerHtml),
          footerHtml: await this.imageStore.externalizeImages(doc.layoutConfig.footerHtml),
        }
      : doc.layoutConfig;

    return { ...doc, pages, layoutConfig };
  }

  private collectDocData(): DocDataV2 {
    const customTemplates = this.styleTemplates().filter((t) => t.isCustom);
    return {
      v: 2,
      docTitle: this.docTitle(),
      pages: this.pages(),
      layoutConfig: this.layoutConfig(),
      customTemplates,
      activeTemplateId: this.activeTemplateId(),
      viewMode: this.viewMode(),
      pageMovement: this.pageMovement(),
      showRuler: this.showRuler(),
      showGridlines: this.showGridlines(),
      zoom: this.zoom(),
      darkMode: this.darkMode(),
      darkCanvas: this.darkCanvas(),
      headingNumbering: this.headingNumbering(),
    };
  }

  private scheduleAutoSave(payload: DocDataV2): void {
    if (this.destroyed) return;
    const targetNoteId = this.loadedNoteId;
    if (!targetNoteId) return;
    this.pendingPayload = payload;
    this.pendingNoteId = targetNoteId;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => void this.flushSave(), 600);
  }

  /** Captura la última edición aunque Angular todavía no haya ejecutado el efecto. */
  private captureLatestSave(): void {
    if (!this.documentReady() || this.destroyed) return;
    const payload = this.collectDocData();
    if (!this.pendingRenderPages) {
      payload.pages = this.getLivePagesSnapshot().map((page) => ({ ...page, html: withoutSelectionMarkers(page.html) }));
    }
    this.scheduleAutoSave(payload);
  }

  private flushSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.saveInFlight) return this.saveInFlight.then(() => this.flushSave());
    const payload = this.pendingPayload;
    const targetNoteId = this.pendingNoteId;
    this.pendingPayload = null;
    this.pendingNoteId = null;
    if (!payload || !targetNoteId) return Promise.resolve();

    this.saveInFlight = this.persistDocData(payload, targetNoteId).finally(() => { this.saveInFlight = null; });
    return this.saveInFlight;
  }

  private async persistDocData(payload: DocDataV2, targetNoteId: string): Promise<void> {
    const slim = await this.buildSlimDocData(payload);

    let json = '';
    try {
      json = JSON.stringify(slim);
    } catch {
      return;
    }
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    this.notesService.updateDocData(slim, targetNoteId);
  }

  // ---------------------------------------------------------------------------
  // Refs / DOM
  // ---------------------------------------------------------------------------
  private rebuildMaps(): void {
    this.pageBodyMap = this.buildMap(this.pageBodyRefs, 'data-page-body-id');
    this.headerMap = this.buildMap(this.headerRefs, 'data-page-header-id');
    this.footerMap = this.buildMap(this.footerRefs, 'data-page-footer-id');
    this.observeBodySize();
  }

  private observeBodySize(): void {
    const first = this.getPageBody(this.pages()[0]?.id);
    if (first === this.observedBody || !this.bodyResizeObserver) return;
    this.bodyResizeObserver.disconnect();
    this.observedBody = first;
    if (first) this.bodyResizeObserver?.observe(first);
  }

  private buildMap(
    list: QueryList<ElementRef<HTMLDivElement>> | undefined,
    attr: string
  ): Map<string, HTMLElement> {
    const map = new Map<string, HTMLElement>();
    if (!list) return map;
    list.forEach((ref) => {
      const id = ref.nativeElement.getAttribute(attr);
      if (id) map.set(id, ref.nativeElement);
    });
    return map;
  }

  getPageBody(id: string): HTMLDivElement | null {
    return (this.pageBodyMap.get(id) as HTMLDivElement | undefined) ?? null;
  }

  getHeaderEl(id: string): HTMLDivElement | null {
    return (this.headerMap.get(id) as HTMLDivElement | undefined) ?? null;
  }

  getFooterEl(id: string): HTMLDivElement | null {
    return (this.footerMap.get(id) as HTMLDivElement | undefined) ?? null;
  }

  private syncInnerHtml(): void {
    if (this.destroyed) return;
    if (this.pendingRenderPages && this.pendingRenderPages.every((page) => this.getPageBody(page.id))) {
      const pending = this.pendingRenderPages;
      for (const page of pending) {
        const element = this.getPageBody(page.id)!;
        if (element.innerHTML !== page.html) element.innerHTML = page.html;
      }
      const body = restoreDocumentSelection(this.liveBodies());
      this.pendingRenderPages = null;
      if (renumberHeadings(this.liveBodies(), this.headingNumbering())) {
        this.pages.set(this.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
      }
      if (body) {
        const index = this.pages().findIndex((page) => page.id === body.dataset['pageBodyId']);
        if (index >= 0) this.activePageIndex.set(index);
        this.scrollCaretIntoView();
      }
      if (this.pendingRenderNeedsFlow) this.scheduleDocumentFlow();
      this.pendingRenderNeedsFlow = false;
    }
    const currentPages = this.pages();
    const layout = this.layoutConfig();
    for (const page of currentPages) {
      const el = this.getPageBody(page.id);
      if (el && document.activeElement !== el && el.innerHTML !== page.html) {
        el.innerHTML = page.html;
      }
      const hEl = this.getHeaderEl(page.id);
      if (hEl && document.activeElement !== hEl && hEl.innerHTML !== layout.headerHtml) {
        hEl.innerHTML = layout.headerHtml;
      }
      const fEl = this.getFooterEl(page.id);
      if (fEl && document.activeElement !== fEl && fEl.innerHTML !== layout.footerHtml) {
        fEl.innerHTML = layout.footerHtml;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades de página
  // ---------------------------------------------------------------------------
  private getLivePagesSnapshot(): DocumentPage[] {
    return this.pages().map((p) => ({
      ...p,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
  }

  private showToast(msg: string): void {
    this.statusMessage.set(msg);
  }

  private placeCaretAtEnd(element: HTMLElement): void {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  private getActivePageElement(): HTMLDivElement | null {
    const currentPages = this.pages();
    const page = currentPages[this.activePageIndex()] || currentPages[0];
    return page ? this.getPageBody(page.id) : null;
  }

  activePageHtml(): string {
    return this.getActivePageElement()?.innerHTML || '';
  }

  commitPageDomToState(pageIndex: number): void {
    if (this.pendingRenderPages) return;
    const currentPages = this.pages();
    const targetPage = currentPages[pageIndex];
    if (!targetPage) return;
    const el = this.getPageBody(targetPage.id);
    if (!el) return;
    const liveHtml = withoutSelectionMarkers(el.innerHTML);
    if (liveHtml === targetPage.html) return;

    this.pages.update((prev) => {
      const next = [...prev];
      if (next[pageIndex]) {
        next[pageIndex] = { ...next[pageIndex], html: liveHtml };
      }
      return next;
    });
    if (this.documentReady()) this.scheduleAutoSave(this.collectDocData());
  }

  pushUndoSnapshot(overridePages?: DocumentPage[]): void {
    const marked = !overridePages && markDocumentSelection(this.liveBodies());
    const snapshotPages = overridePages?.map((page) => ({ ...page })) ?? this.getLivePagesSnapshot();
    if (marked) restoreDocumentSelection(this.liveBodies());
    const last = this.undoStack.at(-1);
    if (this.samePages(snapshotPages, last?.pages) && last?.templates === this.styleTemplates()
      && last.activeTemplateId === this.activeTemplateId() && last.headingNumbering === this.headingNumbering()) return;
    this.undoStack.push({ pages: snapshotPages, activePageIndex: this.activePageIndex(),
      templates: this.styleTemplates(), activeTemplateId: this.activeTemplateId(), headingNumbering: this.headingNumbering() });
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = [];
  }

  handleGlobalUndo(): void {
    if (this.undoStack.length > 0) {
      const currentSnapshot = this.captureHistory();
      this.redoStack.push(currentSnapshot);

      const previous = this.undoStack.pop()!;
      this.headingNumbering.set(previous.headingNumbering);
      this.styleTemplates.set(previous.templates);
      this.activeTemplateId.set(previous.activeTemplateId);
      this.renderDocumentPages(previous.pages);
      this.activePageIndex.set(Math.min(previous.activePageIndex, previous.pages.length - 1));
      this.lastInputTime = 0;

      this.showToast(`Deshacer aplicado (${previous.pages.length} pág.)`);
      return;
    }
    document.execCommand('undo', false);
  }

  handleGlobalRedo(): void {
    if (this.redoStack.length > 0) {
      const currentSnapshot = this.captureHistory();
      this.undoStack.push(currentSnapshot);

      const nextState = this.redoStack.pop()!;
      this.headingNumbering.set(nextState.headingNumbering);
      this.styleTemplates.set(nextState.templates);
      this.activeTemplateId.set(nextState.activeTemplateId);
      this.renderDocumentPages(nextState.pages);
      this.activePageIndex.set(Math.min(nextState.activePageIndex, nextState.pages.length - 1));
      this.lastInputTime = 0;

      this.showToast(`Rehacer aplicado (${nextState.pages.length} pág.)`);
      return;
    }
    document.execCommand('redo', false);
  }

  private captureHistory(): HistorySnapshot {
    const marked = markDocumentSelection(this.liveBodies());
    const pages = this.getLivePagesSnapshot();
    if (marked) restoreDocumentSelection(this.liveBodies());
    return { pages, activePageIndex: this.activePageIndex(), templates: this.styleTemplates(), activeTemplateId: this.activeTemplateId(), headingNumbering: this.headingNumbering() };
  }

  /** Input, formatting and layout changes share the same bidirectional flow transaction. */
  checkAndPaginateOverflow(_pageIndex: number, _preChangePagesSnapshot?: DocumentPage[]): void {
    this.scheduleDocumentFlow();
  }

  private scheduleDocumentFlow(): void {
    if (this.destroyed || this.flowFrame !== null) return;
    this.flowFrame = requestAnimationFrame(() => {
      this.flowFrame = null;
      this.reflowDocument();
    });
  }

  private invalidateDocumentFlow(): void {
    this.lastFlowPages = null;
    this.scheduleDocumentFlow();
  }

  private samePages(left: DocumentPage[], right: DocumentPage[] | null | undefined): boolean {
    return !!right && left.length === right.length && left.every((page, index) => {
      const previous = right[index];
      return previous.id === page.id && previous.html === page.html && previous.breakBefore === page.breakBefore;
    });
  }

  private reflowDocument(): void {
    if (!this.documentReady() || this.composing || this.pendingRenderPages
      || !['print', 'read'].includes(this.viewMode())) return;
    const first = this.getPageBody(this.pages()[0]?.id);
    // A page body narrower than this is a transient flex/layout collapse, not
    // usable document geometry. Measuring it would split every line into
    // single-character fragments and persist that broken pagination.
    if (!first || first.clientWidth < 200 || first.clientHeight === 0) return;
    const styles = getComputedStyle(first);
    const geometry = [first.clientWidth, first.clientHeight, styles.font, styles.lineHeight,
      styles.hyphens, styles.overflowWrap, this.viewMode()].join('|');
    const livePages = this.getLivePagesSnapshot();
    // Observer notifications and Angular renders can follow the same edit. Reuse the settled
    // result before cloning/measuring DOM again; font/image load events explicitly invalidate it.
    if (geometry === this.lastFlowGeometry && this.samePages(livePages, this.lastFlowPages)) return;
    const canvas = document.createElement('div');
    canvas.className = 'word-editor-canvas word-flow-measure';
    canvas.style.cssText = `position:fixed;left:-100000px;top:0;width:${first.clientWidth}px;`
      + 'height:auto;min-height:0;display:flow-root;visibility:hidden;pointer-events:none;';
    canvas.style.font = styles.font;
    canvas.style.lineHeight = styles.lineHeight;
    canvas.style.hyphens = styles.hyphens;
    canvas.style.overflowWrap = styles.overflowWrap;
    // Keep the measurement outside the transformed page stack (zoom scales DOM rects).
    document.body.appendChild(canvas);
    const bodies = this.liveBodies();
    markDocumentSelection(bodies);
    try {
      // clientHeight is unscaled CSS pixels, so zoom never changes pagination.
      const pages = this.documentFlow.paginate(this.getLivePagesSnapshot(), canvas, first.clientHeight);
      const current = this.pages();
      const clean = pages.map((page) => ({ ...page, html: withoutSelectionMarkers(page.html) }));
      this.lastFlowPages = clean;
      this.lastFlowGeometry = geometry;
      if (!this.samePages(clean, current)) this.renderDocumentPages(pages, false);
    } finally {
      if (!this.pendingRenderPages) restoreDocumentSelection(bodies);
      canvas.remove();
    }
  }

  private liveBodies(): HTMLElement[] {
    return this.pages().map((page) => this.getPageBody(page.id)).filter((el): el is HTMLDivElement => !!el);
  }

  private scrollCaretIntoView(): void {
    const viewport = this.mainScrollRef?.nativeElement;
    const selection = window.getSelection();
    if (!viewport || !selection?.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (typeof range.getBoundingClientRect !== 'function') return;
    const caret = range.getBoundingClientRect();
    if (!caret.height) return;
    const bounds = viewport.getBoundingClientRect();
    if (caret.bottom > bounds.bottom - 24) viewport.scrollTop += caret.bottom - bounds.bottom + 24;
    else if (caret.top < bounds.top + 24) viewport.scrollTop += caret.top - bounds.top - 24;
  }

  private renderDocumentPages(pages: DocumentPage[], reflowAfterRender = true): void {
    this.pendingRenderPages = pages;
    this.pendingRenderNeedsFlow = reflowAfterRender;
    this.pages.set(pages.map((page) => ({ ...page, html: withoutSelectionMarkers(page.html) })));
    this.activePageIndex.update((index) => Math.min(index, pages.length - 1));
    // Existing page hosts need no Angular DOM creation. Restore their HTML now,
    // including focused hosts, so undo cannot leave the previous appearance visible.
    // New hosts still wait for the view/query update handled by syncInnerHtml.
    this.syncInnerHtml();
  }

  updateSelectionFormats(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchorNode = sel.anchorNode;
    if (!anchorNode) return;

    const currentPages = this.pages();
    let matchedPageIdx = -1;
    let containerEl: HTMLDivElement | null = null;

    for (let idx = 0; idx < currentPages.length; idx++) {
      const p = currentPages[idx];
      if (!p) continue;
      const bodyEl = this.getPageBody(p.id);
      const headEl = this.getHeaderEl(p.id);
      const footEl = this.getFooterEl(p.id);
      if (bodyEl && bodyEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = bodyEl;
        break;
      } else if (headEl && headEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = headEl;
        break;
      } else if (footEl && footEl.contains(anchorNode)) {
        matchedPageIdx = idx;
        containerEl = footEl;
        break;
      }
    }

    if (matchedPageIdx === -1 || !containerEl) return;
    if (matchedPageIdx !== this.activePageIndex()) {
      this.activePageIndex.set(matchedPageIdx);
    }

    let headingTag = 'P';
    let foundCell: HTMLTableCellElement | null = null;
    const liveRange = sel.getRangeAt(0);
    if (this.pendingTypingStyle && this.pendingTypingRange
      && (!liveRange.collapsed || liveRange.compareBoundaryPoints(Range.START_TO_START,this.pendingTypingRange) !== 0)) {
      this.pendingTypingStyle = null; this.pendingTypingRange = null;
    }
    const sample = selectionElement(liveRange);
    let current: Node | null = sample;
    while (current && current !== containerEl) {
      if (current instanceof HTMLElement) {
        if (/^H[1-6]$/.test(current.tagName)) headingTag = current.tagName;
        if (current.tagName === 'TD' || current.tagName === 'TH') foundCell = current as HTMLTableCellElement;
      }
      current = current.parentNode;
    }

    this.activeTableCell.set(foundCell);

    const range = sel.getRangeAt(0);
    const template = this.styleTemplates().find(item => item.id === this.activeTemplateId()) || this.styleTemplates()[0];
    const rule = selectionStyle(range, template.rules[headingTag as StyleTargetTag]);
    const position = this.pendingTypingStyle?.['verticalAlign'] || scriptPosition(sample);
    this.formats.set({
      bold: rule.bold, italic: rule.italic, underline: rule.underline,
      strikeThrough: rule.strikeThrough ?? false, subscript: position === 'sub', superscript: position === 'super',
      justifyLeft: rule.align === 'left', justifyCenter: rule.align === 'center',
      justifyRight: rule.align === 'right', justifyFull: rule.align === 'justify',
      insertUnorderedList: !!(anchorNode instanceof Element ? anchorNode : anchorNode.parentElement)?.closest('ul'),
      insertOrderedList: !!(anchorNode instanceof Element ? anchorNode : anchorNode.parentElement)?.closest('ol'),
      heading: headingTag, fontName: this.pendingTypingStyle?.['fontFamily']?.replace(/["']/g, '').split(',')[0].trim() || rule.fontFamily,
      fontSize: this.pendingTypingStyle?.['fontSize'] ? String(parseFloat(this.pendingTypingStyle['fontSize'])) : String(rule.fontSizePt),
      indentLeftCm: Number(((rule.indentLeftPt ?? 0) / 72 * 2.54).toFixed(2)),
      indentRightCm: Number(((rule.indentRightPt ?? 0) / 72 * 2.54).toFixed(2)),
      spaceBeforePt: rule.spaceBeforePt, spaceAfterPt: rule.spaceAfterPt, lineHeight: String(rule.lineHeight),
    });
  }

  handleInsertTabCharacter(): void {
    const activeEl = this.getActivePageElement();
    activeEl?.focus();
    document.execCommand(
      'insertHTML',
      false,
      '<span class="docx-tab" style="display:inline-block; width: 36pt; white-space: pre;">&#9;</span>'
    );
    this.commitPageDomToState(this.activePageIndex());
  }

  executeCommand(command: string, value?: string): void {
    if (command === 'undo') {
      this.handleGlobalUndo();
      return;
    }
    if (command === 'redo') {
      this.handleGlobalRedo();
      return;
    }
    const preSnapshot = this.pages().map((p) => ({
      ...p,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.getActivePageElement();
    this.pushUndoSnapshot();
    activeEl?.focus();
    document.execCommand(command, false, value);
    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
    this.updateSelectionFormats();
  }

  handleApplySectionColumns(preset: SectionColumnsPreset): void {
    const activeEl = this.getActivePageElement();
    if (!activeEl) return;
    activeEl.focus();

    const preSnapshot = this.pages().map((p) => ({
      ...p,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    this.pushUndoSnapshot(preSnapshot);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    let existingColBlock: HTMLElement | null = null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== activeEl) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).classList.contains('word-columns-section')
      ) {
        existingColBlock = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (preset === '1') {
      if (existingColBlock) {
        existingColBlock.style.columnCount = '';
        existingColBlock.style.columnGap = '';
        existingColBlock.style.columnRule = '';
        existingColBlock.style.display = 'block';
        existingColBlock.style.gridTemplateColumns = '';
        existingColBlock.classList.remove('word-columns-section');
        this.commitPageDomToState(this.activePageIndex());
        this.showToast('Sección restaurada a 1 sola columna');
      } else {
        this.showToast('La sección actual ya está en 1 columna');
      }
      return;
    }

    const buildColumnStyles = (colType: SectionColumnsPreset): string => {
      if (colType === '2') {
        return 'column-count: 2; column-gap: 24pt; column-rule: 1px solid #cbd5e1;';
      }
      if (colType === '3') {
        return 'column-count: 3; column-gap: 18pt; column-rule: 1px solid #cbd5e1;';
      }
      if (colType === 'left') {
        return 'display: grid; grid-template-columns: 1fr 2fr; gap: 20pt; align-items: start;';
      }
      return 'display: grid; grid-template-columns: 2fr 1fr; gap: 20pt; align-items: start;';
    };

    if (existingColBlock && (preset === '2' || preset === '3')) {
      existingColBlock.style.display = 'block';
      existingColBlock.style.gridTemplateColumns = '';
      existingColBlock.style.columnCount = preset;
      existingColBlock.style.columnGap = preset === '2' ? '24pt' : '18pt';
      existingColBlock.style.columnRule = '1px solid #cbd5e1';
      this.commitPageDomToState(this.activePageIndex());
      this.showToast(`Sección actualizada a ${preset} columnas`);
      return;
    }

    const range = sel.getRangeAt(0);
    const hasSelection = !sel.isCollapsed && activeEl.contains(range.commonAncestorContainer);

    if (hasSelection) {
      const fragment = range.extractContents();
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);
      const selectedHtml = tempDiv.innerHTML.trim();

      let wrappedHtml = '';
      if (preset === 'left' || preset === 'right') {
        wrappedHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">
          <div style="border-right: 1px solid #e2e8f0; padding-right: 12pt;">${selectedHtml}</div>
          <div><p>Escribe aquí el contenido de la segunda columna de esta sección...</p></div>
        </div><p><br/></p>`;
      } else {
        wrappedHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">${
          selectedHtml.includes('<p') ? selectedHtml : `<p>${selectedHtml}</p>`
        }</div><p><br/></p>`;
      }

      document.execCommand('insertHTML', false, wrappedHtml);
    } else {
      let sampleSectionHtml = '';
      if (preset === 'left' || preset === 'right') {
        sampleSectionHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">
          <div style="border-right: 1px solid #e2e8f0; padding-right: 12pt;"><p><strong>Columna 1 (Sección):</strong> Escribe o pega aquí el contenido de la primera columna.</p></div>
          <div><p><strong>Columna 2 (Sección):</strong> Escribe o pega aquí el contenido de la segunda columna.</p></div>
        </div><p><br/></p>`;
      } else {
        const numCols = Number(preset);
        const sampleParagraphs = Array.from({ length: numCols })
          .map(
            (_, i) =>
              `<p><strong>Columna ${i + 1} de la sección:</strong> Escribe aquí el texto que fluirá automáticamente entre las ${numCols} columnas de esta sección sin afectar el resto del documento.</p>`
          )
          .join('');
        sampleSectionHtml = `<div class="word-columns-section" style="${buildColumnStyles(
          preset
        )}">${sampleParagraphs}</div><p><br/></p>`;
      }
      document.execCommand('insertHTML', false, sampleSectionHtml);
    }

    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
    this.showToast(`Sección dividida en columnas (${preset}) sin afectar el resto del documento`);
  }

  handleApplyParagraphSpacingAndIndent(patch: {
    indentLeftCm?: number; indentRightCm?: number; spaceBeforePt?: number; spaceAfterPt?: number;
  }): void {
    const range = this.prepareRibbonSelection();
    if (!range) return;
    this.pushUndoSnapshot();
    selectedParagraphs(this.liveBodies(), range).forEach(element => {
      if (patch.indentLeftCm !== undefined) element.style.marginLeft = `${patch.indentLeftCm}cm`;
      if (patch.indentRightCm !== undefined) element.style.marginRight = `${patch.indentRightCm}cm`;
      if (patch.spaceBeforePt !== undefined) element.style.marginTop = `${patch.spaceBeforePt}pt`;
      if (patch.spaceAfterPt !== undefined) element.style.marginBottom = `${patch.spaceAfterPt}pt`;
    });
    this.finishDocumentMutation();
  }

  handleReadAloud(): void {
    if (!('speechSynthesis' in window)) {
      this.showToast('Tu navegador no soporta lectura en voz alta');
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      this.showToast('Lectura en voz alta detenida');
      return;
    }
    const activeEl = this.getActivePageElement();
    const textToRead = window.getSelection()?.toString().trim() || activeEl?.innerText?.trim() || '';
    if (!textToRead) {
      this.showToast('No hay texto en la página actual para leer');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    window.speechSynthesis.speak(utterance);
    this.showToast(
      `Lector Inmersivo leyendo Página ${this.activePageIndex() + 1} (haz clic de nuevo para detener)`
    );
  }

  /** Preserve the document range while ribbon inputs take keyboard focus. */
  rememberRibbonSelection(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (this.liveBodies().some(body => body.contains(range.startContainer))
      && this.liveBodies().some(body => body.contains(range.endContainer))) this.savedRange = range.cloneRange();
  }

  private prepareRibbonSelection(): Range | null {
    if (!this.documentReady() || this.isReadMode() || this.pendingRenderPages) return null;
    const bodies = this.liveBodies();
    const selection = window.getSelection();
    const current = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const owned = (range: Range | null): range is Range => !!range && bodies.some(body => body.contains(range.startContainer))
      && bodies.some(body => body.contains(range.endContainer));
    const range = owned(current) ? current.cloneRange() : owned(this.savedRange) ? this.savedRange.cloneRange() : null;
    if (!range || !selection) return null;
    const index = bodies.findIndex(body => body.contains(range.startContainer));
    this.activePageIndex.set(index);
    bodies[index].focus();
    selection.removeAllRanges(); selection.addRange(range);
    this.savedRange = null;
    return range;
  }

  private setPendingTypingStyle(properties: Record<string,string>): void {
    this.pendingTypingStyle = { ...this.pendingTypingStyle, ...properties };
    const selection = window.getSelection();
    this.pendingTypingRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  }

  private finishDocumentMutation(): void {
    restoreDocumentSelection(this.liveBodies());
    renumberHeadings(this.liveBodies(), this.headingNumbering());
    this.pages.set(this.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
    this.scheduleAutoSave(this.collectDocData());
    this.scheduleDocumentFlow();
    this.updateSelectionFormats();
  }

  handleApplyRuleToSelection(rule: ElementStyleRule): void {
    const range = this.prepareRibbonSelection();
    if (!range) return;
    const blocks = selectedParagraphs(this.liveBodies(), range);
    this.pendingTypingStyle = null;
    this.pushUndoSnapshot();
    if (!blocks.length) {
      document.execCommand('formatBlock', false, `<${rule.target}>`);
      const block = currentParagraph(window.getSelection()!.getRangeAt(0));
      if (block) blocks.push(block);
    }
    markDocumentSelection(this.liveBodies());
    blocks.forEach(block => {
      // A list item remains inside its list; place the paragraph style inside it.
      if (block.tagName === 'LI') {
        const child = document.createElement(rule.target.toLowerCase());
        while (block.firstChild) child.appendChild(block.firstChild);
        block.appendChild(child); applyStyleRule(child, rule);
      } else applyStyleRule(replaceParagraphTag(block, rule.target), rule);
    });
    this.finishDocumentMutation();
    this.showToast(`Estilo aplicado: ${rule.label}`);
  }

  handleUpdateStyleFromSelection(tag: StyleTargetTag): void {
    const range = this.prepareRibbonSelection();
    if (!range) { this.showToast('Selecciona texto del documento para actualizar el estilo'); return; }
    const active = this.styleTemplates().find(template => template.id === this.activeTemplateId()) || this.styleTemplates()[0];
    const rule = selectionStyle(range, active.rules[tag]);
    this.pushUndoSnapshot();
    // Built-in presets are immutable. The modified definition belongs to this document.
    const template: StyleTemplate = {
      ...active, id: active.isCustom ? active.id : 'document-styles',
      name: active.isCustom ? active.name : 'Estilos del documento', isCustom: true,
      rules: { ...active.rules, [tag]: rule },
    };
    this.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
    this.activeTemplateId.set(template.id);
    markDocumentSelection(this.liveBodies());
    let count = 0;
    this.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>(tag.toLowerCase()).forEach(element => {
      applyStyleRule(element, rule); count++;
    }));
    this.finishDocumentMutation();
    this.showToast(`${tag === 'P' ? 'Normal' : tag} actualizado en ${count} párrafos; se usará también en los nuevos`);
  }

  handleApplyTemplateToDocument(template: StyleTemplate): void {
    if (!this.documentReady() || this.isReadMode()) return;
    this.prepareRibbonSelection();
    this.pushUndoSnapshot();
    if (template.isCustom) this.styleTemplates.update(templates => [...templates.filter(item => item.id !== template.id), template]);
    this.activeTemplateId.set(template.id);
    markDocumentSelection(this.liveBodies());
    this.liveBodies().forEach(body => {
      (['P','H1','H2','H3','H4','H5','H6'] as StyleTargetTag[]).forEach(tag => {
        body.querySelectorAll<HTMLElement>(tag.toLowerCase()).forEach(element => applyStyleRule(element, template.rules[tag]));
      });
    });
    this.finishDocumentMutation();
    this.showToast(`Plantilla "${template.name}" aplicada a todo el documento`);
  }

  handleSaveCustomTemplate(newTpl: StyleTemplate): void {
    this.pushUndoSnapshot();
    this.styleTemplates.update((prev) => {
      const exists = prev.some((t) => t.id === newTpl.id);
      const updated = exists ? prev.map((t) => (t.id === newTpl.id ? newTpl : t)) : [...prev, newTpl];
      return updated;
    });
    this.activeTemplateId.set(newTpl.id);
  }

  handleDeleteCustomTemplate(id: string): void {
    this.pushUndoSnapshot();
    this.styleTemplates.update((prev) => prev.filter((t) => t.id !== id));
    if (this.activeTemplateId() === id) {
      this.activeTemplateId.set(BUILTIN_STYLE_TEMPLATES[0].id);
    }
  }

  handleApplyFontSizePt(pt: string, _fallbackCmd: string): void {
    const size = parseFloat(pt);
    if (!Number.isFinite(size) || size < 1 || size > 400) return;
    const range = this.prepareRibbonSelection();
    if (!range) return;
    if (!range.collapsed) this.pushUndoSnapshot();
    if (range.collapsed) {
      this.setPendingTypingStyle({ fontSize: `${size}pt` });
    } else {
      markDocumentSelection(this.liveBodies());
      applyInlineProperties(this.liveBodies(), window.getSelection()!.getRangeAt(0), { fontSize: `${size}pt` });
    }
    this.finishDocumentMutation();
  }

  handleApplyHeading(tag: string): void {
    const activeTpl =
      this.styleTemplates().find((t) => t.id === this.activeTemplateId()) || this.styleTemplates()[0];
    const rule = activeTpl?.rules[tag as StyleTargetTag];
    if (rule) {
      this.handleApplyRuleToSelection(rule);
    } else {
      const activeEl = this.getActivePageElement();
      activeEl?.focus();
      document.execCommand('formatBlock', false, `<${tag}>`);
      this.commitPageDomToState(this.activePageIndex());
      this.checkAndPaginateOverflow(this.activePageIndex());
      this.updateSelectionFormats();
    }
  }

  handleAddNewPageAt(insertAfterIndex: number): void {
    this.pushUndoSnapshot();
    const newPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPage: DocumentPage = {
      id: newPageId,
      html: `<p><br/></p>`,
      breakBefore: 'manual',
    };

    this.pages.update((prev) => {
      const synced = prev.map((p) => ({
        ...p,
        html: this.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      const next = [...synced];
      if (next[insertAfterIndex + 1]) next[insertAfterIndex + 1] = { ...next[insertAfterIndex + 1], breakBefore: 'manual' };
      next.splice(insertAfterIndex + 1, 0, newPage);
      return next;
    });

    this.activePageIndex.set(insertAfterIndex + 1);
    this.showToast(
      `Página ${insertAfterIndex + 2} (${this.activePaperPreset().name}) añadida (Ctrl+Z para deshacer)`
    );

    setTimeout(() => {
      const newEl = this.getPageBody(newPageId);
      if (newEl) {
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newEl.focus();
      }
    }, 80);
  }

  handleInsertPageBreak(): void {
    const activeEl = this.getActivePageElement();
    if (!activeEl) {
      this.handleAddNewPageAt(this.activePageIndex());
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !activeEl.contains(sel.anchorNode)) {
      this.handleAddNewPageAt(this.activePageIndex());
      return;
    }

    this.pushUndoSnapshot();
    const selectionRange = sel.getRangeAt(0);
    selectionRange.deleteContents();
    const trailing = selectionRange.cloneRange();
    trailing.setEnd(activeEl, activeEl.childNodes.length);
    const fragment = trailing.extractContents();
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    const head = activeEl.lastElementChild as HTMLElement | null;
    const tail = holder.firstElementChild as HTMLElement | null;
    if (head && tail && head.tagName === tail.tagName && head.contains(selectionRange.startContainer)) {
      this.documentFlow.linkContinuation(head, tail);
    }
    if (!activeEl.innerHTML) activeEl.innerHTML = '<p><br></p>';
    if (!holder.innerHTML) holder.innerHTML = '<p><br></p>';
    // Put the caret at the exact beginning of the new page, including an empty paragraph.
    const caretHost = holder.firstElementChild ?? holder;
    caretHost.insertBefore(document.createComment('weave-selection-start'), caretHost.firstChild);
    const pages = this.getLivePagesSnapshot();
    const insertAt = this.activePageIndex();
    pages.splice(insertAt + 1, 0, {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      html: holder.innerHTML,
      breakBefore: 'manual',
    });
    this.renderDocumentPages(pages);
    this.activePageIndex.set(insertAt + 1);
    this.scheduleDocumentFlow();
    this.showToast('Salto de página insertado');
  }

  handleDeletePage(indexToDelete: number): void {
    if (this.pages().length <= 1) {
      this.showToast('El documento debe tener al menos 1 página');
      return;
    }
    if (indexToDelete < 0 || indexToDelete >= this.pages().length) return;
    const snapshot = this.captureHistory();
    this.pushUndoSnapshot(snapshot.pages);
    const next = snapshot.pages.filter((_, index) => index !== indexToDelete);
    this.renderDocumentPages(next);
    const active = snapshot.activePageIndex;
    this.activePageIndex.set(Math.min(active > indexToDelete ? active - 1 : active, next.length - 1));
    this.showToast(`Página ${indexToDelete + 1} eliminada (Ctrl+Z para restaurar)`);
  }

  handleInsertTable(rows: number, cols: number): void {
    const preSnapshot = this.pages().map((p) => ({
      ...p,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.getActivePageElement();
    activeEl?.focus();
    let tableHtml = `<table><thead><tr>`;
    for (let c = 1; c <= cols; c++) {
      tableHtml += `<th><br/></th>`;
    }
    tableHtml += `</tr></thead>`;
    if (rows > 1) {
      tableHtml += `<tbody>`;
      for (let r = 1; r < rows; r++) {
        tableHtml += `<tr>`;
        for (let c = 1; c <= cols; c++) {
          tableHtml += `<td><br/></td>`;
        }
        tableHtml += `</tr>`;
      }
      tableHtml += `</tbody>`;
    }
    tableHtml += `</table><p><br/></p>`;
    document.execCommand('insertHTML', false, tableHtml);
    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
    this.showToast(`Tabla de ${cols} × ${rows} insertada en Página ${this.activePageIndex() + 1}`);
  }

  handleInsertToc(): void {
    this.pushUndoSnapshot();

    const entriesPerPage = Math.max(18, Math.floor((this.maxBodyContentHeightPx() - 80) / 26));
    const currentPages = this.pages();
    const activeIdx = this.activePageIndex();
    const currentPageObj = currentPages[activeIdx] || currentPages[0];
    const currentDomEl = currentPageObj ? this.getPageBody(currentPageObj.id) : null;
    const currentHtml = currentDomEl ? currentDomEl.innerHTML : currentPageObj?.html || '';
    const isCurrentPageEmpty =
      currentHtml.replace(/<[^>]+>/g, '').trim().length === 0 && !currentHtml.includes('<img');

    const headings = this.headings();
    const prelimTocPages = this.wordCompat.buildPaginatedTocPagesHtml(headings, entriesPerPage, 0);
    const numNewPagesInserted = isCurrentPageEmpty
      ? Math.max(0, prelimTocPages.length - 1)
      : prelimTocPages.length;

    const adjustedHeadings = headings.map((h) => ({
      ...h,
      pageIndex:
        h.pageIndex > activeIdx || (!isCurrentPageEmpty && h.pageIndex === activeIdx)
          ? h.pageIndex + numNewPagesInserted
          : h.pageIndex,
    }));

    const finalTocPagesHtml = this.wordCompat.buildPaginatedTocPagesHtml(
      adjustedHeadings,
      entriesPerPage,
      0
    );

    this.pages.update((prev) => {
      const synced = prev.map((p) => ({
        ...p,
        html: this.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      const next = [...synced];

      if (isCurrentPageEmpty) {
        next[activeIdx] = {
          ...next[activeIdx],
          html: finalTocPagesHtml[0],
        };
        if (currentDomEl) {
          currentDomEl.innerHTML = finalTocPagesHtml[0];
        }
        const continuationPages: DocumentPage[] = finalTocPagesHtml.slice(1).map((html, idx) => ({
          id: `toc-page-${Date.now()}-${idx + 1}`,
          html,
        }));
        if (continuationPages.length > 0) {
          next.splice(activeIdx + 1, 0, ...continuationPages);
        }
      } else {
        const newTocPages: DocumentPage[] = finalTocPagesHtml.map((html, idx) => ({
          id: `toc-page-${Date.now()}-${idx + 1}`,
          html,
        }));
        next.splice(activeIdx + 1, 0, ...newTocPages);
      }

      return next;
    });

    const targetViewPage = isCurrentPageEmpty ? activeIdx : activeIdx + 1;
    this.activePageIndex.set(targetViewPage);
    setTimeout(() => {
      this.jumpToPage(targetViewPage);
    }, 50);

    this.showToast(
      `Índice de Contenido (${headings.length} secciones) generado en ${finalTocPagesHtml.length} página(s) completas sin scroll interno.`
    );
  }

  handleSelectHeadingInSidebar(id: string, pageIndex: number): void {
    const clamped = Math.max(0, Math.min(this.pages().length - 1, pageIndex));
    this.activePageIndex.set(clamped);
    this.applyPendingScroll(id);
  }

  handleSelectTableInSidebar(tbl: TableItem): void {
    const clamped = Math.max(0, Math.min(this.pages().length - 1, tbl.pageIndex));
    this.activePageIndex.set(clamped);
    setTimeout(() => {
      const targetPage = this.pages()[clamped];
      if (!targetPage) return;
      const pageEl = this.getPageBody(targetPage.id);
      if (!pageEl) return;
      const tableEls = pageEl.querySelectorAll('table');
      const targetTableEl = tableEls[tbl.tableIndexInPage] || tableEls[0];
      if (targetTableEl) {
        targetTableEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetTableEl.classList.add('ring-2', 'ring-blue-500', 'transition-all');
        setTimeout(() => {
          targetTableEl.classList.remove('ring-2', 'ring-blue-500');
        }, 1600);
      } else {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      this.showToast(`Mostrando "${tbl.title}" en la Página ${clamped + 1}`);
    }, 40);
  }

  private applyPendingScroll(headingId: string): void {
    this.pendingScrollHeadingId.set(headingId);
    setTimeout(() => {
      const el = document.getElementById(headingId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-yellow-100/80', 'transition-colors', 'rounded');
        setTimeout(() => {
          el.classList.remove('bg-yellow-100/80');
        }, 1400);
      } else {
        const activePage = this.pages()[this.activePageIndex()];
        if (activePage) {
          const pageEl = this.getPageBody(activePage.id);
          pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      this.pendingScrollHeadingId.set(null);
    }, 50);
  }

  handleInsertChecklist(): void {
    const html = `
      <ul style="list-style: none; padding-left: 0.5rem;">
        <li><label><input type="checkbox" style="margin-right: 8px;" /> Tarea pendiente 1</label></li>
        <li><label><input type="checkbox" style="margin-right: 8px;" /> Tarea pendiente 2</label></li>
      </ul><p><br/></p>
    `;
    this.executeCommand('insertHTML', html);
  }

  handleInsertImage(): void {
    this.saveSelection();
    this.imageFileInputRef?.nativeElement.click();
  }

  async handleImageFileSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Por favor selecciona un archivo de imagen válido');
      return;
    }

    await this.uploadAndInsertImageFile(file);
  }

  async uploadAndInsertImageFile(file: File, pageIndex?: number): Promise<void> {
    const targetIdx = pageIndex ?? this.activePageIndex();
    this.activePageIndex.set(targetIdx);
    this.showToast('Subiendo imagen al servidor...');

    try {
      const res = await firstValueFrom(this.notesService.uploadImage(file));
      const displayUrl = this.imageStore.toDisplayUrl(res.url);

      const figureHtml = `<figure style="margin: 1.5rem auto; text-align: center; max-width: 100%;"><img src="${displayUrl}" alt="${file.name}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: inline-block;" /><figcaption style="font-size: 0.8rem; color: #64748b; text-align: center; margin-top: 6px; font-style: italic;">Figura: ${file.name}</figcaption></figure><p><br/></p>`;

      this.restoreSelection();
      const activeEl = this.getPageBody(this.pages()[targetIdx]?.id) || this.getActivePageElement();

      if (activeEl) {
        activeEl.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
          document.execCommand('insertHTML', false, figureHtml);
        } else {
          activeEl.insertAdjacentHTML('beforeend', figureHtml);
        }
        this.commitPageDomToState(targetIdx);
        this.checkAndPaginateOverflow(targetIdx);
        this.scheduleAutoSave(this.collectDocData());
        this.showToast('Imagen persistida físicamente en servidor con éxito');
      }
    } catch (err) {
      console.error('[PureDocEditor] Error subiendo imagen:', err);
      this.showToast('Error al subir la imagen al servidor');
    }
  }

  async onPagePaste(e: ClipboardEvent, pageIndex: number): Promise<void> {
    if (this.isReadMode()) return;
    const clipboard = e.clipboardData;
    const html = clipboardTableHtml(clipboard?.getData('text/html') ?? '', clipboard?.getData('text/plain') ?? '');
    if (html) {
      e.preventDefault();
      this.activePageIndex.set(pageIndex);
      // Antes de mirar imágenes: Excel/Word pueden incluir una vista previa de la misma tabla.
      this.executeCommand('insertHTML', html + (/<\/table>\s*$/i.test(html) ? '<p><br></p>' : ''));
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          this.activePageIndex.set(pageIndex);
          await this.uploadAndInsertImageFile(file, pageIndex);
        }
        return;
      }
    }
  }

  onPageDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async onPageDrop(e: DragEvent, pageIndex: number): Promise<void> {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        this.activePageIndex.set(pageIndex);
        await this.uploadAndInsertImageFile(file, pageIndex);
        return;
      }
    }
  }

  private savedRange: Range | null = null;

  private saveSelection(): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  private restoreSelection(): void {
    const activeEl = this.getActivePageElement();
    if (activeEl) {
      activeEl.focus();
    }
    if (this.savedRange) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
      }
      this.savedRange = null;
    }
  }

  handleInsertLink(): void {
    if (this.isReadMode()) return;
    const sourceId = this.loadedNoteId;
    this.saveSelection();
    this.dialogs.open({
      kind: 'input', title: 'Insertar enlace', label: 'Dirección del enlace', initialValue: 'https://', maxLength: 2048,
      submitLabel: 'Insertar enlace', icon: 'paperclip',
      validate: (value) => {
        try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value, window.location.origin).protocol) ? null : 'Introduce un enlace válido.'; }
        catch { return 'Introduce un enlace válido.'; }
      },
      onCancel: () => { if (!this.destroyed && this.loadedNoteId === sourceId) this.restoreSelection(); },
      onSubmit: (url) => {
        if (this.destroyed || this.loadedNoteId !== sourceId) return;
        this.restoreSelection();
        if (window.getSelection()?.toString()) this.executeCommand('createLink', url);
        else {
          const anchor = document.createElement('a');
          anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = url;
          this.executeCommand('insertHTML', anchor.outerHTML);
        }
      },
    });
  }

  handleInsertDocumentReference(): void {
    if (!this.documentReady() || this.isReadMode() || !this.loadedNoteId) return;
    const sourceId = this.loadedNoteId;
    this.saveSelection();
    this.references.open(sourceId, (note) => {
      if (this.destroyed || this.loadedNoteId !== sourceId) return;
      this.restoreSelection();
      const href = documentHref(note._id);
      if (window.getSelection()?.toString()) this.executeCommand('createLink', href);
      else {
        const anchor = document.createElement('a');
        anchor.setAttribute('href', href); anchor.textContent = note.title || 'Sin título';
        this.executeCommand('insertHTML', anchor.outerHTML);
      }
    }, () => { if (!this.destroyed && this.loadedNoteId === sourceId) this.restoreSelection(); });
  }

  handleInsertBlockquote(): void {
    const selectedText =
      window.getSelection()?.toString() || 'Escribe aquí tu cita destacada...';
    this.executeCommand('insertHTML', `<blockquote>${selectedText}</blockquote><p><br/></p>`);
  }

  handleInsertCodeBlock(lang: string): void {
    const codeHtml = `<pre><code data-lang="${lang}">// Código ${lang}\nfunction ejemplo() {\n  return "Hola Mundo";\n}</code></pre><p><br/></p>`;
    this.executeCommand('insertHTML', codeHtml);
  }

  handleInsertCalloutBox(): void {
    const calloutHtml = `
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; margin: 12px 0;">
        <strong>Nota Importante:</strong> Escribe aquí los detalles clave o advertencias de esta sección.
      </div><p><br/></p>
    `;
    this.executeCommand('insertHTML', calloutHtml);
  }

  handleInsertChartTable(): void {
    const chartHtml = `
      <table>
        <thead>
          <tr>
            <th>Indicador (KPI)</th>
            <th>Q1</th>
            <th>Q2</th>
            <th>Progreso Visual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Adopción de Clientes</strong></td>
            <td>64%</td>
            <td>88%</td>
            <td><div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;"><div style="background:#2563eb;height:10px;width:88%;border-radius:4px;"></div></div></td>
          </tr>
          <tr>
            <td><strong>Eficiencia Operativa</strong></td>
            <td>72%</td>
            <td>94%</td>
            <td><div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;"><div style="background:#16a34a;height:10px;width:94%;border-radius:4px;"></div></div></td>
          </tr>
        </tbody>
      </table><p><br/></p>
    `;
    this.executeCommand('insertHTML', chartHtml);
  }

  handleInsertAudioPlaceholder(): void {
    const html = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;margin:10px 0;">
        <span>🎵</span>
        <div>
          <div style="font-weight:600;font-size:13px;">Archivo de Audio Adjunto</div>
          <div style="font-size:11px;color:#64748b;">Grabación_Reunión_Ejecutiva.mp3</div>
        </div>
      </div><p><br/></p>
    `;
    this.executeCommand('insertHTML', html);
  }

  handleInsertVideoPlaceholder(): void {
    const html = `
      <div style="padding:16px;background:#0f172a;color:#f8fafc;border-radius:8px;margin:12px 0;text-align:center;">
        <div style="font-size:14px;font-weight:600;">🎬 Bloque Multimedia de Video</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Presentación_Corporativa_2025.mp4</div>
      </div><p><br/></p>
    `;
    this.executeCommand('insertHTML', html);
  }

  insertHtmlAtCursorOrActivePage(html: string, keepInlineCaret = false): void {
    this.pushUndoSnapshot();
    const range = this.prepareRibbonSelection();
    const activeEl = this.getActivePageElement();
    if (!activeEl) return;

    let targetRange: Range | null = range;
    const sel = window.getSelection();
    if (!targetRange && sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
      targetRange = sel.getRangeAt(0);
    }

    let insertedNode: Node | null = null;
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const fragment = template.content;
    const lastChild = fragment.lastChild;

    if (keepInlineCaret) {
      const inlineBlocks = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,th,td';
      const anchor = targetRange?.startContainer;
      const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
      let block = anchorElement?.closest<HTMLElement>(inlineBlocks) ?? null;
      if (!block || !activeEl.contains(block)) {
        block = Array.from(activeEl.querySelectorAll<HTMLElement>(inlineBlocks)).at(-1) ?? null;
      }
      if (!block) {
        block = document.createElement('p');
        activeEl.appendChild(block);
      }
      if (block.innerHTML.toLowerCase() === '<br>') block.replaceChildren();

      const inlineRange = targetRange && block.contains(targetRange.startContainer)
        && block.contains(targetRange.endContainer)
        ? targetRange
        : document.createRange();
      if (inlineRange !== targetRange) {
        inlineRange.selectNodeContents(block);
        inlineRange.collapse(false);
      }
      inlineRange.deleteContents();
      inlineRange.insertNode(fragment);
      if (lastChild) {
        const caret = document.createRange();
        caret.setStartAfter(lastChild);
        caret.collapse(true);
        activeEl.focus({ preventScroll: true });
        sel?.removeAllRanges();
        sel?.addRange(caret);
      }
      this.pendingRenderPages = null;
      this.commitPageDomToState(this.activePageIndex());
      this.scheduleAutoSave(this.collectDocData());
      this.scheduleDocumentFlow();
      return;
    }

    if (targetRange && activeEl.contains(targetRange.commonAncestorContainer)) {
      targetRange.deleteContents();
      targetRange.insertNode(fragment);
      if (lastChild) {
        insertedNode = lastChild;
        const newRange = document.createRange();
        newRange.setStartAfter(lastChild);
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    } else {
      if (
        activeEl.childNodes.length === 1 &&
        activeEl.firstElementChild?.tagName === 'P' &&
        !activeEl.firstElementChild.textContent?.trim()
      ) {
        activeEl.replaceChildren(fragment);
      } else {
        activeEl.appendChild(fragment);
      }
      if (lastChild && activeEl.contains(lastChild)) {
        insertedNode = lastChild;
        const newRange = document.createRange();
        newRange.setStartAfter(lastChild);
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    }

    this.pendingRenderPages = null;
    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex());
    this.scheduleAutoSave(this.collectDocData());
    this.scheduleDocumentFlow();

    setTimeout(() => {
      if (insertedNode instanceof HTMLElement) {
        insertedNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (insertedNode?.parentElement) {
        insertedNode.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 40);
  }

  handleInsertShapeHtml(shapeHtml: string): void {
    const wrappedHtml = `<div class="word-shape-wrapper" style="margin:14px 0;text-align:center;">${shapeHtml}</div><p><br/></p>`;
    this.insertHtmlAtCursorOrActivePage(wrappedHtml);
    this.showToast('Forma insertada con éxito');
  }

  handleInsertSmartArt(item: SmartArtItem): void {
    this.smartArtModalOpen.set(false);
    this.insertHtmlAtCursorOrActivePage(item.generateHtml());
    this.showToast(`SmartArt "${item.name}" insertado con éxito`);
  }

  handleInsertIcon(iconName: string): void {
    this.iconsModalOpen.set(false);
    const svgPath = ICON_SVG_PATHS[iconName] || '<circle cx="12" cy="12" r="10"/><path d="m12 8v8m-4-4h8"/>';
    const iconHtml = `<span class="word-icon-inline" contenteditable="false"><svg class="word-doc-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></span>&nbsp;`;
    this.insertHtmlAtCursorOrActivePage(iconHtml, true);
    this.showToast(`Icono "${iconName}" insertado`);
  }

  handleInsert3dModel(): void {
    const modelHtml = `
      <div class="word-3d-model-container" contenteditable="false" style="display:inline-block;margin:12px;padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;text-align:center;">
        <svg width="120" height="110" viewBox="0 0 120 110">
          <polygon points="60,10 110,35 60,60 10,35" fill="#93c5fd" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="10,35 60,60 60,105 10,80" fill="#60a5fa" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="110,35 60,60 60,105 110,80" fill="#2563eb" stroke="#1d4ed8" stroke-width="2.5"/>
        </svg>
        <div contenteditable="true" style="font-size:12px;font-weight:bold;color:#1e293b;margin-top:6px;outline:none;">[Modelo 3D Isométrico]</div>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(modelHtml);
    this.showToast('Modelo 3D insertado');
  }

  handleInsertScreenshot(): void {
    const figureHtml = `
      <figure class="word-screenshot-placeholder" contenteditable="false" style="margin:16px auto;text-align:center;max-width:100%;border:1.5px dashed #94a3b8;border-radius:8px;padding:16px;background:#f8fafc;">
        <div style="font-size:24px;margin-bottom:6px;">📸</div>
        <div contenteditable="true" style="font-weight:600;font-size:13px;color:#334155;outline:none;">Captura de Pantalla</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">(Pega una imagen con Ctrl+V o arrastra una imagen aquí)</div>
      </figure><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(figureHtml);
    this.showToast('Área de captura de pantalla insertada');
  }

  handleInsertComment(): void {
    const commentHtml = `
      <span class="word-comment-badge" contenteditable="false" style="background:#fef9c3;border:1px solid #eab308;color:#713f12;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:0 4px;display:inline-flex;align-items:center;gap:4px;">
        💬 Comentario: <span contenteditable="true" style="font-weight:normal;outline:none;min-width:40px;">Escribe tu nota aquí</span>
      </span>&nbsp;
    `;
    this.insertHtmlAtCursorOrActivePage(commentHtml);
    this.showToast('Comentario insertado');
  }

  handleFocusFooterArea(): void {
    const activePage = this.getActivePageElement();
    if (activePage) {
      activePage.scrollTop = activePage.scrollHeight;
      activePage.focus();
      this.showToast('Pie de página enfocado');
    }
  }

  handleInsertPageNumber(): void {
    const pageNumHtml = `
      <span class="word-page-number" contenteditable="false" style="font-weight:600;color:#2563eb;background:#eff6ff;padding:1px 6px;border-radius:3px;">
        Pág. {{page}}
      </span>&nbsp;
    `;
    this.insertHtmlAtCursorOrActivePage(pageNumHtml);
    this.showToast('Número de página insertado');
  }

  handleInsertTextBox(): void {
    this.handleInsertCalloutBox();
  }

  handleInsertWordArt(preset: WordArtPreset): void {
    const wordArtHtml = `
      <div class="wordart-heading" contenteditable="true" style="${preset.cssStyle} margin:16px 0; text-align:center; outline:none;">
        ${preset.sampleText}
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(wordArtHtml);
    this.showToast(`WordArt "${preset.name}" insertado`);
  }

  handleInsertDropCap(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const selectedText = sel.toString();
    const firstChar = selectedText ? selectedText.charAt(0) : 'A';
    const dropCapHtml = `<span style="float:left;font-size:3.2em;line-height:0.8;margin-right:8px;font-weight:bold;color:#1e3a8a;font-family:serif;">${firstChar}</span>`;
    this.insertHtmlAtCursorOrActivePage(dropCapHtml);
    this.showToast('Letra capital insertada');
  }

  handleInsertSignatureLine(): void {
    const sigHtml = `
      <div style="margin:28px 0 16px;max-width:280px;text-align:center;">
        <div style="border-top:1.5px solid #334155;margin-bottom:6px;"></div>
        <div contenteditable="true" style="font-weight:600;font-size:13px;color:#1e293b;outline:none;">Firma del Responsable</div>
        <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Nombre / Cargo / Institución</div>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(sigHtml);
    this.showToast('Línea de firma insertada');
  }

  handleInsertDateTime(): void {
    const nowStr = new Date().toLocaleDateString(undefined, {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    this.insertHtmlAtCursorOrActivePage(`<span>${nowStr}</span>&nbsp;`);
    this.showToast('Fecha y hora insertadas');
  }

  handleInsertSymbol(symbol: string): void {
    this.insertHtmlAtCursorOrActivePage(`<span>${symbol}</span>&nbsp;`);
    this.showToast(`Símbolo ${symbol} insertado`);
  }

  handleInsertDrawingCanvas(): void {
    const canvasHtml = `
      <div class="word-drawing-canvas" contenteditable="false" style="border:2px dashed #93c5fd;border-radius:8px;padding:20px;margin:16px 0;background:#f0f9ff;min-height:120px;text-align:center;">
        <div style="font-size:11px;color:#0284c7;font-weight:bold;margin-bottom:8px;">[ Lienzo de Dibujo ]</div>
        <div contenteditable="true" style="font-size:12px;color:#475569;outline:none;">Coloca formas o diagramas aquí dentro.</div>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(canvasHtml);
    this.showToast('Nuevo lienzo de dibujo insertado');
  }

  handleApplyLineHeight(lineHeight: string): void {
    this.onRibbonCommand({ command: 'lineHeight', value: lineHeight });
  }

  handleCopyFormat(): void {
    if (this.formatPainterActive()) {
      this.formatPainterActive.set(false);
      this.copiedInlineStyle.set(null);
      return;
    }
    const range = this.prepareRibbonSelection();
    if (!range) return;
    const template = this.styleTemplates().find(item => item.id === this.activeTemplateId()) || this.styleTemplates()[0];
    this.copiedInlineStyle.set(selectionStyle(range, template.rules.P));
    this.formatPainterActive.set(true);
    this.showToast('Formato copiado: selecciona texto para aplicarlo');
  }

  handleEditorMouseUp(e: MouseEvent): void {
    this.lastInputTime = 0;
    this.pendingTypingStyle = null;
    const targetEl = e.target as HTMLElement | null;

    const latexBlockEl = targetEl?.closest('.word-latex-formula') as HTMLElement | null;
    if (latexBlockEl) {
      const encodedLatex = latexBlockEl.getAttribute('data-latex') || '';
      const decodedLatex = encodedLatex ? decodeURIComponent(encodedLatex) : '';
      this.editingLatexElement.set(latexBlockEl);
      this.editingLatexCode.set(decodedLatex);
      this.latexModalOpen.set(true);
      return;
    }

    const tocEntryEl = targetEl?.closest('.word-toc-entry') as HTMLElement | null;
    if (tocEntryEl) {
      const targetHeadingId = tocEntryEl.getAttribute('data-toc-target-id');
      const targetPageAttr = tocEntryEl.getAttribute('data-toc-page');
      const liveHeading = this.headings().find((h) => h.id === targetHeadingId);
      const targetPageIndex = liveHeading
        ? liveHeading.pageIndex
        : targetPageAttr !== null
        ? parseInt(targetPageAttr, 10)
        : 0;

      if (!isNaN(targetPageIndex)) {
        this.activePageIndex.set(Math.max(0, Math.min(this.pages().length - 1, targetPageIndex)));
        if (targetHeadingId) {
          this.applyPendingScroll(targetHeadingId);
        }
        this.showToast(
          `Navegando a "${liveHeading?.text || 'sección'}" en la Página ${targetPageIndex + 1}`
        );
        return;
      }
    }

    this.updateSelectionFormats();
    if (this.formatPainterActive() && this.copiedInlineStyle()) {
      const copied = this.copiedInlineStyle()!;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        this.pushUndoSnapshot();
        markDocumentSelection(this.liveBodies());
        applyInlineProperties(this.liveBodies(), window.getSelection()!.getRangeAt(0), inlineProperties(copied));
        this.formatPainterActive.set(false);
        this.copiedInlineStyle.set(null);
        this.finishDocumentMutation();
        this.showToast('Formato aplicado');
      }
    }
  }

  handleInsertOrUpdateLatexFormula(latexCode: string): void {
    const preSnapshot = this.pages().map((p) => ({
      ...p,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));

    const editingEl = this.editingLatexElement();
    if (editingEl) {
      this.pushUndoSnapshot(preSnapshot);
      editingEl.setAttribute('data-latex', encodeURIComponent(latexCode.trim()));
      editingEl.innerHTML = this.latexRenderer.renderLatexToHtml(latexCode);
      this.editingLatexElement.set(null);
      this.editingLatexCode.set(undefined);
      this.commitPageDomToState(this.activePageIndex());
      this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
      this.showToast('Fórmula LaTeX actualizada en la página');
      return;
    }

    const activeEl = this.getActivePageElement();
    if (activeEl) {
      this.pushUndoSnapshot(preSnapshot);
      activeEl.focus();
      const formulaHtml = this.latexRenderer.buildDocumentFormulaBlockHtml(latexCode);
      document.execCommand('insertHTML', false, formulaHtml);
      this.commitPageDomToState(this.activePageIndex());
      this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
      this.showToast(
        `Fórmula LaTeX insertada en la Página ${this.activePageIndex() + 1} (haz clic sobre ella para editarla o eliminarla)`
      );
    }
  }

  handleDeleteExistingLatexFormula(): void {
    const editingEl = this.editingLatexElement();
    if (!editingEl) return;
    this.pushUndoSnapshot();
    editingEl.remove();
    this.editingLatexElement.set(null);
    this.editingLatexCode.set(undefined);
    this.commitPageDomToState(this.activePageIndex());
    this.showToast('Fórmula LaTeX eliminada del documento (Ctrl+Z para restaurar)');
  }

  modifyActiveTable(action: 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable'): void {
    const activeTableCell = this.activeTableCell();
    if (!activeTableCell) return;
    const row = activeTableCell.parentElement as HTMLTableRowElement | null;
    const table = activeTableCell.closest('table');
    if (!row || !table) return;

    this.pushUndoSnapshot();
    const colIndex = Array.from(row.children).indexOf(activeTableCell);

    if (action === 'addRow') {
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      Array.from(newRow.children).forEach((cell) => {
        cell.innerHTML = 'Nuevo dato';
      });
      row.parentElement?.insertBefore(newRow, row.nextSibling);
    } else if (action === 'addCol') {
      table.querySelectorAll('tr').forEach((tr) => {
        const isHeader = tr.parentElement?.tagName === 'THEAD';
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.innerHTML = isHeader ? 'Columna' : 'Dato';
        const refCell = tr.children[colIndex];
        if (refCell && refCell.nextSibling) {
          tr.insertBefore(cell, refCell.nextSibling);
        } else {
          tr.appendChild(cell);
        }
      });
    } else if (action === 'delRow') {
      const allRows = table.querySelectorAll('tr');
      if (allRows.length <= 1) {
        table.remove();
        this.activeTableCell.set(null);
      } else {
        row.remove();
      }
    } else if (action === 'delCol') {
      const totalCols = row.children.length;
      if (totalCols <= 1) {
        table.remove();
        this.activeTableCell.set(null);
      } else {
        table.querySelectorAll('tr').forEach((tr) => {
          if (tr.children[colIndex]) {
            tr.children[colIndex].remove();
          }
        });
      }
    } else if (action === 'delTable') {
      table.remove();
      this.activeTableCell.set(null);
    }

    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex());
  }

  async handleFileImport(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.showToast(
        `Analizando e importando "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`
      );
      this.undoStack = [];
      this.redoStack = [];

      const result = await this.wordCompat.parseImportedFile(file);
      this.docTitle.set(result.title);
      this.renderDocumentPages(result.pages);
      this.scheduleDocumentFlow();
      this.importedTocEntries.set(result.extractedTocHeadings || []);
      this.activePageIndex.set(0);

      if (result.detectedLayout) {
        this.handleUpdateLayout(() => result.detectedLayout!);
      }

      if (result.docxProperties) {
        this.docxProperties.set(result.docxProperties);
        this.formats.update((prev) => ({
          ...prev,
          fontName: result.docxProperties!.defaultFontFamily,
          fontSize: String(Math.round(result.docxProperties!.defaultFontSizePt)),
        }));
        const hc = result.docxProperties.headingCounts;
        const totalDetectedH = hc.h1 + hc.h2 + hc.h3 + hc.h4 + hc.h5 + hc.h6;
        this.showToast(
          `Importado: ${result.pages.length} páginas · ${totalDetectedH} encabezados · Tablas ajustadas al alto real de cada página`
        );
      } else {
        this.docxProperties.set(null);
        this.showToast(`Archivo "${file.name}" importado en ${result.pages.length} página(s)`);
      }

      this.mainScrollRef?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al importar el archivo';
      this.showToast(msg);
    } finally {
      input.value = '';
    }
  }

  jumpToPage(pageIdx: number): void {
    const clamped = Math.max(0, Math.min(this.pages().length - 1, pageIdx));
    this.activePageIndex.set(clamped);
    setTimeout(() => {
      const target = this.pages()[clamped];
      if (!target) return;
      const el = this.getPageBody(target.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  handleFocusHeaderArea(): void {
    this.handleUpdateLayout((prev) => ({ ...prev, showHeaderFooter: true }));
    setTimeout(() => {
      const currentPage = this.pages()[this.activePageIndex()] || this.pages()[0];
      if (currentPage) {
        const hEl = this.getHeaderEl(currentPage.id);
        if (hEl) {
          hEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          hEl.focus();
        }
      }
    }, 60);
  }

  handleUpdateLayout(updater: (prev: DocumentLayoutConfig) => DocumentLayoutConfig): void {
    this.layoutConfig.update((prev) => updater(prev));
    this.cdr?.markForCheck();
    if (this.documentReady()) {
      this.scheduleAutoSave(this.collectDocData());
    }
  }

  handleSetDarkMode(dark: boolean): void {
    if (this.themeService && this.themeService.isDark() !== dark) {
      this.themeService.setDark(dark);
    }
  }

  openLatexModal(): void {
    this.editingLatexElement.set(null);
    this.editingLatexCode.set(undefined);
    this.latexModalOpen.set(true);
  }

  onCloseLatexModal(): void {
    this.latexModalOpen.set(false);
    this.editingLatexElement.set(null);
    this.editingLatexCode.set(undefined);
  }

  onRibbonCommand(event: { command: string; value?: string }): void {
    const { command, value } = event;
    if (command === 'undo' || command === 'redo') { this.executeCommand(command); return; }
    if (command === 'toggleMarks') { this.showFormattingMarks.update(current => !current); return; }
    if (command === 'find' || command === 'replace') { this.openDocumentSearch(command); return; }
    if (command === 'headingNumbering') {
      if (!this.documentReady() || this.isReadMode()) return;
      this.pushUndoSnapshot(); this.headingNumbering.set(value === 'on');
      this.finishDocumentMutation();
      this.showToast(value === 'on' ? 'Títulos H1–H6 vinculados a la numeración 1, 1.1, 1.1.1' : 'Numeración automática de títulos desactivada');
      return;
    }
    const range = this.prepareRibbonSelection();
    if (!range) { this.showToast('Coloca el cursor o selecciona texto dentro del documento'); return; }
    if (['selectAllDocument','selectCurrentParagraph','selectPage'].includes(command)) {
      const selection = window.getSelection()!;
      if (command === 'selectAllDocument') {
        const bodies = this.liveBodies();
        range.setStart(bodies[0], 0); range.setEnd(bodies.at(-1)!, bodies.at(-1)!.childNodes.length);
      } else range.selectNodeContents(command === 'selectPage' ? this.getActivePageElement()! : currentParagraph(range) || this.getActivePageElement()!);
      selection.removeAllRanges(); selection.addRange(range); this.rememberRibbonSelection(); return;
    }
    if (command === 'subscript' || command === 'superscript') {
      const sample = selectionElement(range);
      const target = command === 'subscript' ? 'sub' : 'super';
      const current = this.pendingTypingStyle?.['verticalAlign'] || scriptPosition(sample);
      const mode = current === target ? 'baseline' : target;
      const template = this.styleTemplates().find(item => item.id === this.activeTemplateId()) || this.styleTemplates()[0];
      const font = selectionStyle(range,template.rules.P);
      const base = scriptBaseSize(sample,font.fontSizePt);
      if (range.collapsed) {
        this.setPendingTypingStyle({ verticalAlign:mode, fontSize:`${mode === 'baseline' ? base : base*.75}pt` });
        this.updateSelectionFormats();
      } else {
        this.pushUndoSnapshot(); markDocumentSelection(this.liveBodies());
        applyScript(this.liveBodies(),window.getSelection()!.getRangeAt(0),mode,base);
        this.finishDocumentMutation();
      }
      return;
    }
    if (command === 'fontSizePt' || command === 'growFont' || command === 'shrinkFont') {
      const presets = [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72];
      const current = this.pendingTypingStyle?.['fontSize'] ? parseFloat(this.pendingTypingStyle['fontSize'])
        : selectionStyle(range,(this.styleTemplates().find(item => item.id === this.activeTemplateId()) || this.styleTemplates()[0]).rules.P).fontSizePt;
      const size = command === 'fontSizePt' ? Number(value) : command === 'growFont'
        ? presets.find(size => size > current) ?? Math.min(400,current + 2)
        : [...presets].reverse().find(size => size < current) ?? Math.max(1,current - 1);
      this.handleApplyFontSizePt(String(size), '7'); return;
    }
    const custom = ['changeCase','textEffect','lineHeight','spaceBefore','spaceAfter','paragraphShading','paragraphBorder',
      'sortParagraphs','listStyle','multilevelList','indent','outdent','justifyLeft','justifyCenter','justifyRight','justifyFull'];
    if (custom.includes(command)) {
      this.pushUndoSnapshot();
      markDocumentSelection(this.liveBodies());
      const updated = applyHomeCommand(command, value, this.liveBodies(), window.getSelection()!.getRangeAt(0));
      this.finishDocumentMutation();
      if (!updated) this.showToast(command === 'sortParagraphs' ? 'Selecciona al menos dos párrafos consecutivos de la misma sección' : 'Selecciona texto o párrafos para aplicar esta función');
      return;
    }
    if (command === 'removeFormat') {
      this.pushUndoSnapshot();
      const blocks = selectedParagraphs(this.liveBodies(), range);
      const base = this.styleTemplates().find(t => t.id === this.activeTemplateId())!.rules.P;
      markDocumentSelection(this.liveBodies());
      if (!range.collapsed && range.toString() !== blocks.map(block => block.textContent).join('')) {
        applyInlineProperties(this.liveBodies(), window.getSelection()!.getRangeAt(0), { ...inlineProperties(base), textShadow: 'none', webkitTextStroke: '0px' });
      } else blocks.forEach(block => {
        const normal = block.tagName === 'LI' ? block : replaceParagraphTag(block, 'P');
        normal.removeAttribute('style'); applyStyleRule(normal, base);
        normal.querySelectorAll<HTMLElement>('[style]').forEach(run => { run.style.textShadow = 'none'; run.style.webkitTextStroke = '0px'; });
      });
      this.finishDocumentMutation(); return;
    }
    if (command === 'fontName' && range.collapsed) {
      this.setPendingTypingStyle({ fontFamily: value || 'Arial' });
      this.formats.update(formats => ({ ...formats, fontName: (value || 'Arial').replace(/["']/g, '').split(',')[0] }));
      return;
    }
    if (command === 'fontName' && !range.collapsed) {
      this.pushUndoSnapshot(); markDocumentSelection(this.liveBodies());
      applyInlineProperties(this.liveBodies(), window.getSelection()!.getRangeAt(0), { fontFamily: value || 'Arial' });
      this.finishDocumentMutation(); return;
    }
    this.executeCommand(command, value);
  }

  openDocumentSearch(mode: 'find' | 'replace'): void {
    this.rememberRibbonSelection();
    const text = window.getSelection()?.toString().trim();
    if (text && text.length <= 200) this.searchQuery.set(text);
    this.searchMode.set(mode); this.searchMatchIndex = -1; this.searchStatus.set('');
  }

  updateSearchConfig(patch: Partial<WordSearchConfig>): void {
    if (patch.query !== undefined) this.searchQuery.set(patch.query);
    if (patch.replacement !== undefined) this.replacementText.set(patch.replacement);
    if (patch.matchCase !== undefined) this.searchCase.set(patch.matchCase);
    if (patch.wholeWord !== undefined) this.searchWholeWord.set(patch.wholeWord);
    this.resetDocumentSearch();
  }

  handleSearchAction(action: WordSearchAction): void {
    if (action === 'close') { this.searchMode.set(null); this.restoreSelection(); }
    else if (action === 'next' || action === 'previous') this.findNextMatch(action === 'previous');
    else this.replaceDocumentMatches(action === 'all');
  }

  resetDocumentSearch(): void { this.searchMatchIndex = -1; this.searchStatus.set(''); }

  findNextMatch(backwards = false): void {
    const matches = findDocumentText(this.liveBodies(), this.searchQuery(), this.searchCase(), this.searchWholeWord());
    if (!matches.length) { this.searchStatus.set(this.searchQuery() ? 'No se encontraron coincidencias' : 'Escribe el texto que quieres buscar'); return; }
    this.searchMatchIndex = this.searchMatchIndex < 0 ? (backwards ? matches.length - 1 : 0)
      : (this.searchMatchIndex + (backwards ? -1 : 1) + matches.length) % matches.length;
    const match = matches[this.searchMatchIndex];
    this.activePageIndex.set(match.pageIndex);
    this.getActivePageElement()?.focus();
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(match.range);
    this.rememberRibbonSelection();
    match.range.startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    this.searchStatus.set(`${this.searchMatchIndex + 1} de ${matches.length} coincidencias`);
  }

  replaceDocumentMatches(all = false): void {
    if (!this.documentReady() || this.isReadMode() || !this.searchQuery()) return;
    const matches = findDocumentText(this.liveBodies(), this.searchQuery(), this.searchCase(), this.searchWholeWord());
    if (!matches.length) { this.searchStatus.set('No se encontraron coincidencias'); return; }
    const selection = window.getSelection();
    const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : this.savedRange;
    const index = matches.findIndex(match => selectedRange && match.range.compareBoundaryPoints(Range.START_TO_START, selectedRange) === 0 && match.range.compareBoundaryPoints(Range.END_TO_END, selectedRange) === 0);
    // Reemplazar primero localiza una coincidencia; nunca modifica texto que el usuario no vio.
    if (!all && index < 0) { this.findNextMatch(); return; }
    this.pushUndoSnapshot();
    const replacements = all ? [...matches].reverse() : [matches[index]];
    for (const match of replacements) {
      match.range.deleteContents();
      const text = document.createTextNode(this.replacementText());
      match.range.insertNode(text);
      match.range.selectNodeContents(text);
    }
    if (!all) {
      const range = replacements[0].range;
      this.activePageIndex.set(replacements[0].pageIndex);
      selection?.removeAllRanges(); selection?.addRange(range);
    }
    this.finishDocumentMutation();
    this.searchMatchIndex = -1;
    this.searchStatus.set(`${replacements.length} reemplazos realizados`);
  }

  printDoc(): void {
    window.print();
  }

  async exportWord(): Promise<void> {
    this.showToast('Exportando a Microsoft Word (.doc)...');
    const snapshot = this.getLivePagesSnapshot();
    await this.wordCompat.exportToWordDoc(this.docTitle(), snapshot, this.layoutConfig());
    this.showToast(`Exportado como "${this.docTitle()}.doc" (${this.activePaperPreset().name})`);
  }

  async exportHtml(): Promise<void> {
    const snapshot = this.getLivePagesSnapshot();
    await this.wordCompat.exportToHtmlFile(this.docTitle(), snapshot, this.layoutConfig());
    this.showToast(`Exportado como "${this.docTitle()}.html"`);
  }

  exportMarkdown(): void {
    const snapshot = this.getLivePagesSnapshot();
    this.wordCompat.exportToMarkdown(this.docTitle(), snapshot);
    this.showToast(`Exportado como "${this.docTitle()}.md"`);
  }

  exportTxt(): void {
    const snapshot = this.getLivePagesSnapshot();
    const allText = snapshot
      .map((p, i) => {
        const clean = p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return `--- PÁGINA ${i + 1} ---\n${clean}`;
      })
      .join('\n\n');
    this.wordCompat.exportToPlainText(this.docTitle(), allText);
    this.showToast(`Exportado como "${this.docTitle()}.txt"`);
  }

  async exportWordFromHeader(): Promise<void> {
    this.showToast('Preparando archivo .DOC multipágina para descarga...');
    const snapshot = this.getLivePagesSnapshot();
    await this.wordCompat.exportToWordDoc(this.docTitle(), snapshot, this.layoutConfig());
    this.showToast(
      `Documento "${this.docTitle()}.doc" (${this.activePaperPreset().name}, ${snapshot.length} pág.) exportado para Word`
    );
  }

  openFilePicker(): void {
    this.fileInputRef?.nativeElement.click();
  }

  exitFocusOrRead(): void {
    this.focusMode.set(false);
    if (this.isReadMode()) this.viewMode.set('print');
  }

  handleOutlineClick(h: HeadingItem): void {
    this.viewMode.set('print');
    this.handleSelectHeadingInSidebar(h.id, h.pageIndex);
  }

  onDeletePageClick(e: Event, pageIndex: number): void {
    e.stopPropagation();
    this.handleDeletePage(pageIndex);
  }

  onDocTitleInput(e: Event): void {
    this.docTitle.set((e.target as HTMLInputElement).value);
  }

  onPageNumberChange(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) this.jumpToPage(val - 1);
  }

  onZoomInput(e: Event): void {
    this.zoom.set(Number((e.target as HTMLInputElement).value));
  }

  onHeaderInput(e: Event): void {
    const newHtml = (e.target as HTMLElement).innerHTML;
    this.handleUpdateLayout((prev) => ({ ...prev, headerHtml: newHtml }));
  }

  onFooterInput(e: Event): void {
    const newHtml = (e.target as HTMLElement).innerHTML;
    this.handleUpdateLayout((prev) => ({ ...prev, footerHtml: newHtml }));
  }

  onPageInput(e: Event, pageIndex: number): void {
    const body = e.currentTarget as HTMLDivElement | null;
    if (body && this.isEmptyEditableBody(body)) this.restoreEmptyEditableParagraph(body);
    if ((e as InputEvent).inputType === 'insertParagraph') {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      const block = element?.closest('li') ?? element?.closest('p,h1,h2,h3,h4,h5,h6,blockquote,div');
      if (block && !block.hasAttribute('data-page-body-id')) block.removeAttribute('data-word-continuation');
    }
    if (renumberHeadings(this.liveBodies(),this.headingNumbering())) {
      this.pages.set(this.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
      this.scheduleAutoSave(this.collectDocData());
    }
    this.commitPageDomToState(pageIndex);
    this.updateSelectionFormats();
    if (!(e as InputEvent).isComposing) this.scheduleDocumentFlow();
  }

  onPageBeforeInput(event: Event, pageIndex: number): void {
    const e = event as InputEvent;
    if (e.isComposing) return;
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      if (e.inputType === 'historyUndo') this.handleGlobalUndo();
      else this.handleGlobalRedo();
      return;
    }
    if ((e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward'
      || e.inputType === 'deleteByCut') && this.clearEntirelySelectedPage(pageIndex)) {
      e.preventDefault();
      return;
    }
    if ((e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')
      && this.deleteAcrossPageBoundary(pageIndex, e.inputType === 'deleteContentBackward')) {
      e.preventDefault();
      return;
    }
    if (this.pendingTypingStyle && e.inputType === 'insertText' && e.data !== null && !this.pendingRenderPages) {
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
      const body = this.getPageBody(this.pages()[pageIndex]?.id);
      if (range && body?.contains(range.startContainer)) {
        e.preventDefault(); this.pushUndoSnapshot();
        range.deleteContents();
        const span = document.createElement('span');
        Object.assign(span.style, this.pendingTypingStyle);
        const text = document.createTextNode(e.data); span.appendChild(text); range.insertNode(span);
        const position = this.pendingTypingStyle['verticalAlign'];
        if (position === 'sub' || position === 'super' || position === 'baseline') {
          range.selectNodeContents(text);
          applyScript(this.liveBodies(),range,position,Number(this.formats().fontSize));
        }
        range.setStart(text, text.length); range.collapse(true);
        window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
        this.pendingTypingStyle = null;
        this.finishDocumentMutation(); return;
      }
    }
    const now = Date.now();
    if (e.inputType !== 'insertText' || this.lastInputType !== e.inputType || now - this.lastInputTime > 800) {
      this.pushUndoSnapshot();
    }
    this.lastInputTime = now;
    this.lastInputType = e.inputType;
  }

  onPageCompositionStart(): void {
    this.pushUndoSnapshot();
    this.composing = true;
  }

  onPageCompositionEnd(pageIndex: number): void {
    this.composing = false;
    this.commitPageDomToState(pageIndex);
    this.scheduleDocumentFlow();
  }

  private deleteAcrossPageBoundary(pageIndex: number, backwards: boolean): boolean {
    const page = this.pages()[pageIndex];
    const body = page && this.getPageBody(page.id);
    if (!body || !caretAtBoundary(body, backwards)) return false;
    const leftIndex = backwards ? pageIndex - 1 : pageIndex;
    const pages = this.getLivePagesSnapshot();
    if (leftIndex < 0 || leftIndex + 1 >= pages.length) return false;
    const left = this.getPageBody(pages[leftIndex].id);
    const right = this.getPageBody(pages[leftIndex + 1].id);
    if (!left || !right) return false;
    this.pushUndoSnapshot();
    this.lastInputTime = 0;
    const manual = pages[leftIndex + 1].breakBefore === 'manual';
    const continued = !!left.lastElementChild && !!right.firstElementChild
      && this.documentFlow.areContinuations(left.lastElementChild as HTMLElement, right.firstElementChild as HTMLElement);
    if (manual) {
      markDocumentSelection(this.liveBodies());
      delete pages[leftIndex + 1].breakBefore;
      pages[leftIndex].html = left.innerHTML;
      pages[leftIndex + 1].html = right.innerHTML;
    } else {
      joinBoundaryBlocks(left, right);
      if (continued) deleteAtContinuation(left, backwards);
      pages[leftIndex].html = left.innerHTML;
      pages.splice(leftIndex + 1, 1);
    }
    this.renderDocumentPages(pages);
    this.scheduleDocumentFlow();
    return true;
  }

  onPageKeyDown(e: KeyboardEvent, pageIndex: number): void {
    if (e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && ['f','h'].includes(e.key.toLowerCase())) {
      e.preventDefault(); this.openDocumentSearch(e.key.toLowerCase() === 'h' ? 'replace' : 'find'); return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Backspace','Delete'].includes(e.key)) this.pendingTypingStyle = null;
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey
      && this.clearEntirelySelectedPage(pageIndex)) {
      e.preventDefault();
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey
      && this.deleteAcrossPageBoundary(pageIndex, e.key === 'Backspace')) {
      e.preventDefault();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) this.lastInputTime = 0;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const backwards = e.key === 'ArrowLeft';
      const body = this.getPageBody(this.pages()[pageIndex]?.id);
      const adjacent = this.pages()[pageIndex + (backwards ? -1 : 1)];
      const target = adjacent && this.getPageBody(adjacent.id);
      if (body && target && caretAtBoundary(body, backwards)) {
        e.preventDefault();
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(!backwards);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.handleInsertPageBreak();
      return;
    }
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      if (e.shiftKey) {
        if (this.redoStack.length > 0) {
          e.preventDefault();
          this.handleGlobalRedo();
          return;
        }
      } else if (this.undoStack.length > 0) {
        e.preventDefault();
        this.handleGlobalUndo();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      if (this.redoStack.length > 0) {
        e.preventDefault();
        this.handleGlobalRedo();
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.handleInsertTabCharacter();
    }
  }

  /** Keep contentEditable's empty state as a real paragraph after Ctrl+A + Delete. */
  private clearEntirelySelectedPage(pageIndex: number): boolean {
    const selection = window.getSelection();
    const page = this.pages()[pageIndex];
    const body = page && this.getPageBody(page.id);
    if (!selection?.rangeCount || selection.isCollapsed || !body) return false;
    const selectedRange = selection.getRangeAt(0);
    if (!body.contains(selectedRange.startContainer) || !body.contains(selectedRange.endContainer)) return false;

    const bodyRange = document.createRange();
    bodyRange.selectNodeContents(body);
    // Compare the body boundary points against the selection's boundaries.
    const coversBody = selectedRange.compareBoundaryPoints(Range.START_TO_START, bodyRange) <= 0
      && selectedRange.compareBoundaryPoints(Range.END_TO_END, bodyRange) >= 0;
    if (!coversBody) return false;

    this.pushUndoSnapshot();
    this.restoreEmptyEditableParagraph(body);
    const paragraph = body.firstElementChild!;
    const caret = document.createRange();
    caret.setStart(paragraph, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    this.finishDocumentMutation();
    return true;
  }

  private isEmptyEditableBody(body: HTMLElement): boolean {
    if (body.querySelector('img,table,svg,video,iframe,hr,[contenteditable="false"]')) return false;
    return !body.textContent;
  }

  private restoreEmptyEditableParagraph(body: HTMLElement): void {
    if (body.childElementCount === 1 && body.firstElementChild?.matches('p')
      && body.firstElementChild.innerHTML.toLowerCase() === '<br>') return;
    body.replaceChildren(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
  }

  activeTableToolsVisible(): boolean {
    return this.activeTableCell() !== null && !this.isReadMode();
  }

  pagePaddingTop(): number {
    return this.viewMode() === 'draft' ? 32 : this.layoutConfig().margins.topPx;
  }

  pagePaddingRight(): number {
    return this.viewMode() === 'draft' ? 36 : this.layoutConfig().margins.rightPx;
  }

  pagePaddingBottom(): number {
    return this.viewMode() === 'draft' ? 32 : this.layoutConfig().margins.bottomPx;
  }

  pagePaddingLeft(): number {
    const layout = this.layoutConfig();
    return this.viewMode() === 'draft'
      ? 36
      : layout.margins.leftPx + (layout.showLineNumbers ? 28 : 0);
  }

  maxOf(a: number, b: number): number {
    return Math.max(a, b);
  }
}
