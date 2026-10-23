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
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
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
import { analyzePageHtmlFast, getActualContentBottomPx } from './utils/word-editor.utils';
import { WordRibbonComponent } from './components/word-ribbon/word-ribbon.component';
import { WordTocSidebarComponent } from './components/word-toc-sidebar/word-toc-sidebar.component';
import { WordAiWriterModalComponent } from './components/word-ai-writer-modal/word-ai-writer-modal.component';
import { WordDocxBannerComponent } from './components/word-docx-banner/word-docx-banner.component';
import { WordStyleTemplatesModalComponent } from './components/word-style-templates-modal/word-style-templates-modal.component';
import { WordLatexModalComponent } from './components/word-latex-modal/word-latex-modal.component';

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
  fontName: 'Inter',
  fontSize: '11',
  indentLeftCm: 0,
  indentRightCm: 0,
  spaceBeforePt: 0,
  spaceAfterPt: 4,
  lineHeight: '1.15',
};

const DEFAULT_DOC_TITLE = 'Propuesta Estratégica 2025';

interface HistorySnapshot {
  pages: DocumentPage[];
  activePageIndex: number;
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
}

/**
 * Editor de documento multipágina (Word) standalone para Weave.
 * Orquesta la barra de herramientas, el lienzo multipágina contentEditable,
 * el panel de índice, los modales (IA, LaTeX, plantillas) y la persistencia
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
    WordTocSidebarComponent,
    WordAiWriterModalComponent,
    WordDocxBannerComponent,
    WordStyleTemplatesModalComponent,
    WordLatexModalComponent,
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
  readonly i18n = inject(I18nService);
  private readonly wordCompat = inject(WordCompatibilityService);
  private readonly latexRenderer = inject(LatexRendererService);
  private readonly imageStore = inject(ImageStoreService);

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
  readonly formats = signal<EditorActiveFormats>({ ...DEFAULT_FORMATS });

  readonly viewMode = signal<DocumentViewMode>('print');
  readonly focusMode = signal<boolean>(false);
  readonly darkMode = signal<boolean>(false);
  readonly pageMovement = signal<PageMovementMode>('vertical');
  readonly showRuler = signal<boolean>(true);
  readonly showGridlines = signal<boolean>(false);
  readonly showTocSidebar = signal<boolean>(true);
  readonly zoom = signal<number>(100);

  readonly statusMessage = signal<string>(
    'Word Studio Pro: Columnas por sección, Márgenes personalizados, Fórmulas LaTeX editables/eliminables y Modos de Vista'
  );
  readonly formatPainterActive = signal<boolean>(false);
  readonly copiedInlineStyle = signal<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
    foreColor: string;
  } | null>(null);
  readonly activeTableCell = signal<HTMLTableCellElement | null>(null);
  readonly aiModalOpen = signal<boolean>(false);
  readonly latexModalOpen = signal<boolean>(false);
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
      460,
      this.sheetHeightPx() -
        layout.margins.topPx -
        layout.margins.bottomPx -
        (layout.showHeaderFooter ? 76 : 16)
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

  private hydrated = false;
  private destroyed = false;
  private loadedNoteId: string | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingPayload: DocDataV2 | null = null;
  private pendingNoteId: string | null = null;
  private lastSavedJson = '';
  private querySubscriptions: { unsubscribe(): void }[] = [];
  private mapsDirty = false;

  private readonly handleSelectionChange = (): void => {
    this.updateSelectionFormats();
  };

  constructor() {
    effect(() => {
      const payload = this.collectDocData();
      if (!this.hydrated) return;
      this.scheduleAutoSave(payload);
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
        void this.flushSave().then(() => {
          this.loadedNoteId = newId;
          return this.hydrateFromNote();
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
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
    this.hydrated = false;

    const doc = (this.note?.docData ?? null) as DocDataV2 | null;
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

    const customTemplates =
      doc && Array.isArray(doc.customTemplates) ? doc.customTemplates : [];
    const templates = [...BUILTIN_STYLE_TEMPLATES, ...customTemplates];

    this.pages.set(pages);
    this.layoutConfig.set(layout);
    this.styleTemplates.set(templates);
    this.activeTemplateId.set(doc?.activeTemplateId || 'corporate-modern');
    this.docTitle.set(doc?.docTitle ?? (this.note?.title || DEFAULT_DOC_TITLE));

    this.viewMode.set(doc?.viewMode ?? 'print');
    this.focusMode.set(false);
    this.darkMode.set(doc?.darkMode ?? false);
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
    this.aiModalOpen.set(false);
    this.styleModalOpen.set(false);
    this.activeTab.set('home');

    this.undoStack = [];
    this.redoStack = [];

    const savedSlim = await this.buildSlimDocData(this.collectDocData());
    try {
      this.lastSavedJson = JSON.stringify(savedSlim);
    } catch {
      this.lastSavedJson = '';
    }
    this.hydrated = true;
  }

  /**
   * Convierte las imágenes embebidas (base64/blob) en referencias locales
   * `weave-img://<id>` para que el JSON persistido no cargue con imágenes.
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
    };
  }

  private scheduleAutoSave(payload: DocDataV2): void {
    if (this.destroyed) return;
    const targetNoteId = this.note?._id;
    if (!targetNoteId) return;
    this.pendingPayload = payload;
    this.pendingNoteId = targetNoteId;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => void this.flushSave(), 600);
  }

  private flushSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    const payload = this.pendingPayload;
    const targetNoteId = this.pendingNoteId;
    this.pendingPayload = null;
    this.pendingNoteId = null;
    if (!payload || !targetNoteId) return Promise.resolve();

    return this.persistDocData(payload, targetNoteId);
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
      id: p.id,
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
    const currentPages = this.pages();
    const targetPage = currentPages[pageIndex];
    if (!targetPage) return;
    const el = this.getPageBody(targetPage.id);
    if (!el) return;
    const liveHtml = el.innerHTML;
    if (liveHtml === targetPage.html) return;

    this.pages.update((prev) => {
      const next = [...prev];
      if (next[pageIndex]) {
        next[pageIndex] = { ...next[pageIndex], html: liveHtml };
      }
      return next;
    });
  }

  pushUndoSnapshot(overridePages?: DocumentPage[]): void {
    const snapshotPages = (overridePages || this.pages()).map((p) => ({
      id: p.id,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    this.undoStack.push({ pages: snapshotPages, activePageIndex: this.activePageIndex() });
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = [];
  }

  handleGlobalUndo(): void {
    if (this.undoStack.length > 0) {
      const currentSnapshot: HistorySnapshot = {
        pages: this.getLivePagesSnapshot(),
        activePageIndex: this.activePageIndex(),
      };
      this.redoStack.push(currentSnapshot);

      const previous = this.undoStack.pop()!;
      this.pages.set(previous.pages);
      this.activePageIndex.set(Math.min(previous.activePageIndex, previous.pages.length - 1));

      setTimeout(() => {
        previous.pages.forEach((p) => {
          const domEl = this.getPageBody(p.id);
          if (domEl) domEl.innerHTML = p.html;
        });
        const targetPage = previous.pages[previous.activePageIndex] || previous.pages[0];
        if (targetPage) {
          const activeEl = this.getPageBody(targetPage.id);
          activeEl?.focus();
        }
      }, 20);

      this.showToast(`Deshacer aplicado (${previous.pages.length} pág.)`);
      return;
    }
    document.execCommand('undo', false);
  }

  handleGlobalRedo(): void {
    if (this.redoStack.length > 0) {
      const currentSnapshot: HistorySnapshot = {
        pages: this.getLivePagesSnapshot(),
        activePageIndex: this.activePageIndex(),
      };
      this.undoStack.push(currentSnapshot);

      const nextState = this.redoStack.pop()!;
      this.pages.set(nextState.pages);
      this.activePageIndex.set(Math.min(nextState.activePageIndex, nextState.pages.length - 1));

      setTimeout(() => {
        nextState.pages.forEach((p) => {
          const domEl = this.getPageBody(p.id);
          if (domEl) domEl.innerHTML = p.html;
        });
      }, 20);

      this.showToast(`Rehacer aplicado (${nextState.pages.length} pág.)`);
      return;
    }
    document.execCommand('redo', false);
  }

  checkAndPaginateOverflow(pageIndex: number, preChangePagesSnapshot?: DocumentPage[]): void {
    if (this.viewMode() === 'web' || this.viewMode() === 'draft' || this.viewMode() === 'outline') return;
    const currentPages = this.pages();
    const currentPage = currentPages[pageIndex];
    if (!currentPage) return;
    const el = this.getPageBody(currentPage.id);
    if (!el) return;

    const scaleFactor = this.zoom() / 100;
    const effectiveMaxHeightPx = this.maxBodyContentHeightPx() * scaleFactor;
    const actualBottomPx = getActualContentBottomPx(el);

    if (actualBottomPx <= effectiveMaxHeightPx) return;

    if (el.children.length <= 1 && el.firstElementChild?.tagName !== 'TABLE') {
      const soleBlock = (el.firstElementChild as HTMLElement) || el;
      const fullText = soleBlock.innerText || '';
      if (fullText.length > 600) {
        const splitPos = Math.floor(fullText.length * 0.78);
        const spacePos = fullText.indexOf(' ', splitPos);
        if (spacePos !== -1) {
          const headText = fullText.slice(0, spacePos);
          const tailText = fullText.slice(spacePos + 1);
          soleBlock.innerText = headText;
          const newP = document.createElement('p');
          if (soleBlock !== el && soleBlock.getAttribute('style')) {
            newP.setAttribute('style', soleBlock.getAttribute('style') || '');
          }
          newP.innerText = tailText;
          el.appendChild(newP);
        }
      }
    }

    if (getActualContentBottomPx(el) <= effectiveMaxHeightPx) return;

    if (preChangePagesSnapshot) {
      this.undoStack.push({
        pages: preChangePagesSnapshot,
        activePageIndex: pageIndex,
      });
      this.redoStack = [];
    }

    const sel = window.getSelection();
    const anchorNode: Node | null = sel?.anchorNode || null;
    let cursorWasInMovedNodes = false;

    const movedNodesHtml: string[] = [];
    let safetyLoop = 0;

    while (getActualContentBottomPx(el) > effectiveMaxHeightPx && safetyLoop < 100) {
      safetyLoop++;
      const lastChild = el.lastElementChild as HTMLElement | null;
      if (!lastChild) break;

      if (lastChild.tagName === 'TABLE') {
        const tbody = lastChild.querySelector('tbody') || lastChild;
        const allRows = Array.from(tbody.querySelectorAll(':scope > tr'));

        if (allRows.length > 1) {
          const poppedRowsHtml: string[] = [];
          while (
            getActualContentBottomPx(el) > effectiveMaxHeightPx &&
            tbody.querySelectorAll(':scope > tr').length > 1
          ) {
            const currentRows = tbody.querySelectorAll(':scope > tr');
            const lastRow = currentRows[currentRows.length - 1];
            if (!lastRow) break;
            if (anchorNode && (lastRow === anchorNode || lastRow.contains(anchorNode))) {
              cursorWasInMovedNodes = true;
            }
            poppedRowsHtml.unshift(lastRow.outerHTML);
            lastRow.remove();
          }

          if (getActualContentBottomPx(el) > effectiveMaxHeightPx && el.children.length > 1) {
            const lastRow = tbody.querySelector(':scope > tr');
            if (lastRow) {
              if (anchorNode && (lastRow === anchorNode || lastRow.contains(anchorNode))) {
                cursorWasInMovedNodes = true;
              }
              poppedRowsHtml.unshift(lastRow.outerHTML);
            }
            const colgroupHtml = lastChild.querySelector('colgroup')?.outerHTML || '';
            const tableStyle = lastChild.getAttribute('style') || '';
            movedNodesHtml.unshift(
              `<table style="${tableStyle}">${colgroupHtml}<tbody>${poppedRowsHtml.join('')}</tbody></table>`
            );
            lastChild.remove();
          } else if (poppedRowsHtml.length > 0) {
            const colgroupHtml = lastChild.querySelector('colgroup')?.outerHTML || '';
            const tableStyle = lastChild.getAttribute('style') || '';
            movedNodesHtml.unshift(
              `<table style="${tableStyle}">${colgroupHtml}<tbody>${poppedRowsHtml.join('')}</tbody></table>`
            );
            break;
          } else {
            break;
          }
          continue;
        }
      }

      if (el.children.length <= 1) break;

      if (anchorNode && (lastChild === anchorNode || lastChild.contains(anchorNode))) {
        cursorWasInMovedNodes = true;
      }
      movedNodesHtml.unshift(lastChild.outerHTML);
      lastChild.remove();
    }

    if (movedNodesHtml.length === 0) return;

    const overflowHtml = movedNodesHtml.join('\n');
    const updatedCurrentHtml = el.innerHTML;
    const targetNextPageIndex = pageIndex + 1;
    const newGeneratedPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    this.pages.update((prev) => {
      const next = [...prev];
      next[pageIndex] = { ...next[pageIndex], html: updatedCurrentHtml };

      if (targetNextPageIndex < next.length) {
        const nextPageId = next[targetNextPageIndex].id;
        const nextEl = this.getPageBody(nextPageId);
        const existingNextHtml = nextEl ? nextEl.innerHTML : next[targetNextPageIndex].html;
        const isNextEmpty =
          existingNextHtml.replace(/<[^>]+>/g, '').trim().length === 0 &&
          !existingNextHtml.includes('<img');

        let combinedHtml = isNextEmpty ? overflowHtml : `${overflowHtml}\n${existingNextHtml}`;

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = combinedHtml;
        const firstTwo = Array.from(tempContainer.children);
        if (
          firstTwo.length >= 2 &&
          firstTwo[0].tagName === 'TABLE' &&
          firstTwo[1].tagName === 'TABLE'
        ) {
          const tbody1 = firstTwo[0].querySelector('tbody') || firstTwo[0];
          const tbody2 = firstTwo[1].querySelector('tbody') || firstTwo[1];
          const cols1 = firstTwo[0].querySelector('tr')?.children.length || 0;
          const cols2 = firstTwo[1].querySelector('tr')?.children.length || 0;
          if (cols1 > 0 && cols1 === cols2) {
            Array.from(tbody2.querySelectorAll(':scope > tr')).forEach((tr) => {
              tbody1.appendChild(tr);
            });
            firstTwo[1].remove();
            combinedHtml = tempContainer.innerHTML;
          }
        }

        if (nextEl) {
          nextEl.innerHTML = combinedHtml;
        }
        next[targetNextPageIndex] = { ...next[targetNextPageIndex], html: combinedHtml };
      } else {
        next.push({
          id: newGeneratedPageId,
          html: overflowHtml,
        });
      }

      return next;
    });

    if (cursorWasInMovedNodes) {
      this.activePageIndex.set(targetNextPageIndex);
      setTimeout(() => {
        const nextPageObj = this.pages()[targetNextPageIndex];
        const nextDomEl = nextPageObj
          ? this.getPageBody(nextPageObj.id)
          : this.getPageBody(newGeneratedPageId);
        if (nextDomEl) {
          nextDomEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const firstMovedChild = nextDomEl.firstElementChild as HTMLElement | null;
          this.placeCaretAtEnd(firstMovedChild || nextDomEl);
        }
      }, 50);
    }

    this.showToast(
      `Las filas o párrafos que excedían la Hoja ${pageIndex + 1} pasaron automáticamente a la Hoja ${
        targetNextPageIndex + 1
      }`
    );
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
    let inlineFontFamily = '';
    let inlineFontSizePt = '';
    let detectedIndentLeftCm = 0;
    let detectedIndentRightCm = 0;
    let detectedSpaceBeforePt = 0;
    let detectedSpaceAfterPt = 4;
    let detectedLineHeight = '1.15';
    let current: Node | null = anchorNode;

    while (current && current !== containerEl) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const el = current as HTMLElement;
        if (/^H[1-6]$/.test(el.tagName)) {
          headingTag = el.tagName;
        }
        if (el.tagName === 'TD' || el.tagName === 'TH') {
          foundCell = el as HTMLTableCellElement;
        }
        if (!inlineFontFamily && el.style?.fontFamily) {
          inlineFontFamily = el.style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        }
        if (!inlineFontSizePt && el.style?.fontSize) {
          const matchPt = el.style.fontSize.match(/([\d.]+)pt/i);
          if (matchPt) {
            inlineFontSizePt = String(Math.round(Number(matchPt[1]) * 10) / 10);
          }
        }
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV'].includes(el.tagName)) {
          if (el.style.marginLeft) {
            const mCm = el.style.marginLeft.match(/([\d.]+)cm/i);
            const mPt = el.style.marginLeft.match(/([\d.]+)pt/i);
            if (mCm) detectedIndentLeftCm = Number(mCm[1]);
            else if (mPt) detectedIndentLeftCm = Number((Number(mPt[1]) / 28.35).toFixed(2));
          }
          if (el.style.marginRight) {
            const mCm = el.style.marginRight.match(/([\d.]+)cm/i);
            const mPt = el.style.marginRight.match(/([\d.]+)pt/i);
            if (mCm) detectedIndentRightCm = Number(mCm[1]);
            else if (mPt) detectedIndentRightCm = Number((Number(mPt[1]) / 28.35).toFixed(2));
          }
          if (el.style.marginTop) {
            const mPt = el.style.marginTop.match(/([\d.]+)pt/i);
            if (mPt) detectedSpaceBeforePt = Math.round(Number(mPt[1]));
          }
          if (el.style.marginBottom) {
            const mPt = el.style.marginBottom.match(/([\d.]+)pt/i);
            if (mPt) detectedSpaceAfterPt = Math.round(Number(mPt[1]));
          }
          if (el.style.lineHeight) {
            detectedLineHeight = el.style.lineHeight;
          }
        }
      }
      current = current.parentNode;
    }

    this.activeTableCell.set(foundCell);

    try {
      const sizeCmd = document.queryCommandValue('fontSize');
      const sizeMap: Record<string, string> = {
        '1': '8',
        '2': '10',
        '3': '12',
        '4': '14',
        '5': '18',
        '6': '24',
        '7': '36',
      };
      const rawFont =
        inlineFontFamily ||
        (document.queryCommandValue('fontName') || 'Inter').replace(/['"]/g, '').split(',')[0].trim();

      this.formats.set({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        subscript: document.queryCommandState('subscript'),
        superscript: document.queryCommandState('superscript'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        heading: headingTag,
        fontName: rawFont || 'Inter',
        fontSize: inlineFontSizePt || sizeMap[sizeCmd] || '11',
        indentLeftCm: detectedIndentLeftCm,
        indentRightCm: detectedIndentRightCm,
        spaceBeforePt: detectedSpaceBeforePt,
        spaceAfterPt: detectedSpaceAfterPt,
        lineHeight: detectedLineHeight,
      });
    } catch {
      // Ignore queryCommand exceptions
    }
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
      id: p.id,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.getActivePageElement();
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
      id: p.id,
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
    indentLeftCm?: number;
    indentRightCm?: number;
    spaceBeforePt?: number;
    spaceAfterPt?: number;
  }): void {
    const activeEl = this.getActivePageElement();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !activeEl) return;

    let node: Node | null = sel.anchorNode;
    while (node && node !== activeEl) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV'].includes(el.tagName)) {
          if (patch.indentLeftCm !== undefined) el.style.marginLeft = `${patch.indentLeftCm}cm`;
          if (patch.indentRightCm !== undefined) el.style.marginRight = `${patch.indentRightCm}cm`;
          if (patch.spaceBeforePt !== undefined) el.style.marginTop = `${patch.spaceBeforePt}pt`;
          if (patch.spaceAfterPt !== undefined) el.style.marginBottom = `${patch.spaceAfterPt}pt`;
          this.commitPageDomToState(this.activePageIndex());
          this.checkAndPaginateOverflow(this.activePageIndex());
          this.updateSelectionFormats();
          return;
        }
      }
      node = node.parentNode;
    }
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

  handleApplyRuleToSelection(rule: ElementStyleRule): void {
    const activeEl = this.getActivePageElement();
    if (!activeEl) return;
    activeEl.focus();

    this.pushUndoSnapshot();
    document.execCommand('formatBlock', false, `<${rule.target}>`);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.anchorNode;
      while (node && node !== activeEl) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.tagName === rule.target) {
            el.style.fontFamily = `'${rule.fontFamily}', serif`;
            el.style.fontSize = `${rule.fontSizePt}pt`;
            el.style.textAlign = rule.align;
            el.style.fontWeight = rule.bold ? 'bold' : 'normal';
            el.style.fontStyle = rule.italic ? 'italic' : 'normal';
            el.style.textDecoration = rule.underline ? 'underline' : 'none';
            el.style.color = rule.color;
            el.style.lineHeight = String(rule.lineHeight);
            el.style.marginTop = `${rule.spaceBeforePt}pt`;
            el.style.marginBottom = `${rule.spaceAfterPt}pt`;
            el.style.textIndent = rule.firstLineIndentPt > 0 ? `${rule.firstLineIndentPt}pt` : '0pt';
            break;
          }
        }
        node = node.parentNode;
      }
    }

    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex());
    this.updateSelectionFormats();
    this.showToast(
      `Estilo aplicado: ${rule.label} (${rule.fontFamily} ${rule.fontSizePt}pt, ${rule.align})`
    );
  }

  handleApplyTemplateToDocument(template: StyleTemplate): void {
    this.pushUndoSnapshot();
    this.activeTemplateId.set(template.id);

    this.pages.update((prevPages) =>
      prevPages.map((page) => {
        const liveEl = this.getPageBody(page.id);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = liveEl ? liveEl.innerHTML : page.html;

        (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'] as StyleTargetTag[]).forEach((tag) => {
          const rule = template.rules[tag];
          if (!rule) return;
          tempDiv.querySelectorAll(tag.toLowerCase()).forEach((node) => {
            const el = node as HTMLElement;
            el.style.fontFamily = `'${rule.fontFamily}', serif`;
            el.style.fontSize = `${rule.fontSizePt}pt`;
            el.style.textAlign = rule.align;
            el.style.fontWeight = rule.bold ? 'bold' : 'normal';
            el.style.fontStyle = rule.italic ? 'italic' : 'normal';
            el.style.textDecoration = rule.underline ? 'underline' : 'none';
            el.style.color = rule.color;
            el.style.lineHeight = String(rule.lineHeight);
            el.style.marginTop = `${rule.spaceBeforePt}pt`;
            el.style.marginBottom = `${rule.spaceAfterPt}pt`;
            el.style.textIndent = rule.firstLineIndentPt > 0 ? `${rule.firstLineIndentPt}pt` : '0pt';

            if (tag !== 'P') {
              el.querySelectorAll('span').forEach((sp) => {
                sp.style.fontSize = '';
                sp.style.fontFamily = '';
              });
            }
          });
        });

        const updatedHtml = tempDiv.innerHTML;
        if (liveEl) {
          liveEl.innerHTML = updatedHtml;
        }
        return { ...page, html: updatedHtml };
      })
    );

    this.updateSelectionFormats();
    this.showToast(
      `Plantilla "${template.name}" aplicada a las ${this.pages().length} páginas del documento`
    );
  }

  handleSaveCustomTemplate(newTpl: StyleTemplate): void {
    this.styleTemplates.update((prev) => {
      const exists = prev.some((t) => t.id === newTpl.id);
      const updated = exists ? prev.map((t) => (t.id === newTpl.id ? newTpl : t)) : [...prev, newTpl];
      return updated;
    });
    this.activeTemplateId.set(newTpl.id);
  }

  handleDeleteCustomTemplate(id: string): void {
    this.styleTemplates.update((prev) => prev.filter((t) => t.id !== id));
    if (this.activeTemplateId() === id) {
      this.activeTemplateId.set(BUILTIN_STYLE_TEMPLATES[0].id);
    }
  }

  handleApplyFontSizePt(pt: string, fallbackCmd: string): void {
    const activeEl = this.getActivePageElement();
    activeEl?.focus();
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0 && activeEl) {
      let node: Node | null = sel.anchorNode;
      while (node && node !== activeEl) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (/^H[1-6]$/.test(el.tagName)) {
            el.style.fontSize = pt;
            break;
          }
        }
        node = node.parentNode;
      }
    }

    if (sel && !sel.isCollapsed) {
      document.execCommand('fontSize', false, fallbackCmd);
      if (activeEl) {
        activeEl.querySelectorAll('font[size]').forEach((fontNode) => {
          const span = document.createElement('span');
          span.style.fontSize = pt;
          span.innerHTML = fontNode.innerHTML;
          fontNode.replaceWith(span);
        });
      }
    } else {
      document.execCommand('fontSize', false, fallbackCmd);
    }
    this.commitPageDomToState(this.activePageIndex());
    this.checkAndPaginateOverflow(this.activePageIndex());
    this.updateSelectionFormats();
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
    };

    this.pages.update((prev) => {
      const synced = prev.map((p) => ({
        id: p.id,
        html: this.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      const next = [...synced];
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

    let currentBlock: HTMLElement | null =
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (sel.anchorNode as HTMLElement)
        : sel.anchorNode?.parentElement || null;

    while (currentBlock && currentBlock.parentElement !== activeEl) {
      currentBlock = currentBlock.parentElement;
    }

    if (!currentBlock) {
      this.handleAddNewPageAt(this.activePageIndex());
      return;
    }

    this.pushUndoSnapshot();

    const nodesToMove: string[] = [];
    let sibling = currentBlock.nextElementSibling;
    while (sibling) {
      const nextSibling = sibling.nextElementSibling;
      nodesToMove.push(sibling.outerHTML);
      sibling.remove();
      sibling = nextSibling;
    }

    const newPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPageHtml = nodesToMove.length > 0 ? nodesToMove.join('\n') : '<p><br/></p>';
    const insertAt = this.activePageIndex();

    this.pages.update((prev) => {
      const synced = prev.map((p) => ({
        id: p.id,
        html: this.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      const next = [...synced];
      next.splice(insertAt + 1, 0, { id: newPageId, html: newPageHtml });
      return next;
    });

    this.activePageIndex.set(insertAt + 1);
    this.showToast(`Salto de página insertado: contenido movido a la Página ${insertAt + 2}`);

    setTimeout(() => {
      const newEl = this.getPageBody(newPageId);
      if (newEl) {
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newEl.focus();
      }
    }, 80);
  }

  handleDeletePage(indexToDelete: number): void {
    if (this.pages().length <= 1) {
      this.showToast('El documento debe tener al menos 1 página');
      return;
    }
    this.pushUndoSnapshot();
    this.pages.update((prev) => {
      const synced = prev.map((p) => ({
        id: p.id,
        html: this.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      return synced.filter((_, idx) => idx !== indexToDelete);
    });
    this.activePageIndex.update((prev) => Math.max(0, prev - 1));
    this.showToast(`Página ${indexToDelete + 1} eliminada (Ctrl+Z para restaurar)`);
  }

  handleInsertTable(rows: number, cols: number): void {
    const preSnapshot = this.pages().map((p) => ({
      id: p.id,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.getActivePageElement();
    activeEl?.focus();
    let tableHtml = `<table><thead><tr>`;
    for (let c = 1; c <= cols; c++) {
      tableHtml += `<th>Encabezado ${c}</th>`;
    }
    tableHtml += `</tr></thead><tbody>`;
    for (let r = 1; r <= Math.max(1, rows - 1); r++) {
      tableHtml += `<tr>`;
      for (let c = 1; c <= cols; c++) {
        tableHtml += `<td>Dato ${r}.${c}</td>`;
      }
      tableHtml += `</tr>`;
    }
    tableHtml += `</tbody></table><p><br/></p>`;
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
        id: p.id,
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
    const url = window.prompt('Introduce la URL del enlace (ej. https://google.com):', 'https://');
    if (!url) return;
    const selection = window.getSelection()?.toString();
    if (selection) {
      this.executeCommand('createLink', url);
    } else {
      this.executeCommand(
        'insertHTML',
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      );
    }
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

  handleApplyLineHeight(lineHeight: string): void {
    const activeEl = this.getActivePageElement();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !activeEl) return;
    let node: Node | null = sel.anchorNode;
    while (node && node !== activeEl) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)) {
          el.style.lineHeight = lineHeight;
          this.showToast(`Interlineado ajustado a ${lineHeight}`);
          this.commitPageDomToState(this.activePageIndex());
          this.checkAndPaginateOverflow(this.activePageIndex());
          this.updateSelectionFormats();
          return;
        }
      }
      node = node.parentNode;
    }
  }

  handleCopyFormat(): void {
    if (this.formatPainterActive()) {
      this.formatPainterActive.set(false);
      this.copiedInlineStyle.set(null);
      return;
    }
    this.copiedInlineStyle.set({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      foreColor: document.queryCommandValue('foreColor'),
    });
    this.formatPainterActive.set(true);
    this.showToast('Formato copiado: selecciona texto para aplicarlo');
  }

  handleEditorMouseUp(e: MouseEvent): void {
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
        if (copied.bold !== document.queryCommandState('bold')) document.execCommand('bold');
        if (copied.italic !== document.queryCommandState('italic')) document.execCommand('italic');
        if (copied.underline !== document.queryCommandState('underline'))
          document.execCommand('underline');
        if (copied.foreColor) document.execCommand('foreColor', false, copied.foreColor);
        this.formatPainterActive.set(false);
        this.copiedInlineStyle.set(null);
        this.commitPageDomToState(this.activePageIndex());
        this.showToast('Formato aplicado');
      }
    }
  }

  handleInsertOrUpdateLatexFormula(latexCode: string): void {
    const preSnapshot = this.pages().map((p) => ({
      id: p.id,
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

  handleInsertGeneratedHtml(generatedHtml: string): void {
    const preSnapshot = this.pages().map((p) => ({
      id: p.id,
      html: this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.getActivePageElement();
    if (activeEl) {
      activeEl.focus();
      document.execCommand('insertHTML', false, `${generatedHtml}<p><br/></p>`);
      this.commitPageDomToState(this.activePageIndex());
      this.checkAndPaginateOverflow(this.activePageIndex(), preSnapshot);
      this.showToast(`Contenido generado con IA insertado en la Página ${this.activePageIndex() + 1}`);
    }
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
      this.pages.set(result.pages);
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
    this.executeCommand(event.command, event.value);
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
    const currentPages = this.pages();
    const preSnapshot = currentPages.map((p, idx) => ({
      id: p.id,
      html: idx === pageIndex ? p.html : this.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    this.commitPageDomToState(pageIndex);
    this.checkAndPaginateOverflow(pageIndex, preSnapshot);
  }

  onPageKeyDown(e: KeyboardEvent, pageIndex: number): void {
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
    void pageIndex;
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
