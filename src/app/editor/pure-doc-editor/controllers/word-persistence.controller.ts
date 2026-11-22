import { normalizeSources } from '../models/academic.model';
import {
  markDocumentSelection,
  restoreDocumentSelection,
  withoutSelectionMarkers,
} from '../utils/document-selection';
import { DocumentLayoutConfig, DocumentPage } from '../models/word-document.model';
import {
  BUILTIN_STYLE_TEMPLATES,
  DEFAULT_LAYOUT_CONFIG,
  INITIAL_DOCUMENT_PAGES,
} from '../constants/word-document.constants';
import type { AnyDocData, DocDataV2, HistorySnapshot } from '../models/word-editor-state.model';
import { mapModelSectionImages, normalizeLoadedDocData } from '../utils/doc-data-migration';
import { DEFAULT_DOC_TITLE } from '../constants/word-editor.constants';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordPersistenceControllerHost = Pick<PureDocEditorComponent,
  | 'active'
  | 'activePageIndex'
  | 'activeTab'
  | 'activeTableCell'
  | 'activeTemplateId'
  | 'bibliographicSources'
  | 'academic'
  | 'copiedInlineStyle'
  | 'comments'
  | 'commentsPanelOpen'
  | 'activeCommentId'
  | 'trackChangesEnabled'
  | 'hideCommentsOnExport'
  | 'revisions'
  | 'darkCanvas'
  | 'darkMode'
  | 'docTitle'
  | 'documentReady'
  | 'docxProperties'
  | 'editingLatexCode'
  | 'editingLatexElement'
  | 'focusMode'
  | 'formatPainterActive'
  | 'headingNumbering'
  | 'importedTocEntries'
  | 'latexModalOpen'
  | 'layoutConfig'
  | 'note'
  | 'pageMovement'
  | 'pages'
  | 'pendingScrollHeadingId'
  | 'searchMode'
  | 'searchQuery'
  | 'searchStatus'
  | 'showFormattingMarks'
  | 'showGridlines'
  | 'showRuler'
  | 'showTocSidebar'
  | 'styleModalOpen'
  | 'styleTemplates'
  | 'viewMode'
  | 'zoom'>;
type WordPersistenceControllerHooks = Pick<WordEditorHooks,
  | 'destroyed'
  | 'exportCanvasModelSections'
  | 'getLivePagesSnapshot'
  | 'imageStore'
  | 'lastFlowPages'
  | 'lastInputTime'
  | 'liveBodies'
  | 'notesService'
  | 'pendingRenderPages'
  | 'pendingTypingStyle'
  | 'renderDocumentPages'
  | 'samePages'
  | 'savedRange'
  | 'scheduleDocumentFlow'
  | 'setLoadedModelSections'
  | 'showToast'
  | 'syncInnerHtml'
  | 'themeService'>;

/** Persistence behavior owned by one editor instance. */
export class WordPersistenceController {
  constructor(private readonly editor: WordPersistenceControllerHost, private readonly hooks: WordPersistenceControllerHooks) {}

  async hydrateFromNote(): Promise<void> {
    const version = ++this.hydrationVersion;
    const sourceNote = this.editor.note;
    this.editor.documentReady.set(false);
    this.hooks.pendingRenderPages = null;
    this.hooks.lastFlowPages = null;

    const doc = sourceNote?.docData ? normalizeLoadedDocData(sourceNote.docData) : null;
    const rawPages =
      doc && Array.isArray(doc.pages) && doc.pages.length > 0
        ? doc.pages.map((p) => ({ ...p }))
        : [...INITIAL_DOCUMENT_PAGES];

    const pages = await Promise.all(
      rawPages.map(async (p) => ({ ...p, html: await this.hooks.imageStore.resolveImages(p.html) }))
    );

    const modelSections = doc?.modelSections?.length
      ? await mapModelSectionImages(
          doc.modelSections,
          src => (this.hooks.imageStore.resolveImageSrc ? this.hooks.imageStore.resolveImageSrc(src) : Promise.resolve(src)),
        )
      : undefined;

    const baseLayout = doc?.layoutConfig
      ? { ...DEFAULT_LAYOUT_CONFIG, ...doc.layoutConfig }
      : { ...DEFAULT_LAYOUT_CONFIG };
    const layout: DocumentLayoutConfig = {
      ...baseLayout,
      headerHtml: await this.hooks.imageStore.resolveImages(baseLayout.headerHtml),
      footerHtml: await this.hooks.imageStore.resolveImages(baseLayout.footerHtml),
    };

    if (this.hooks.destroyed || version !== this.hydrationVersion || sourceNote?._id !== this.editor.note?._id) return;
    this.loadedNoteId = sourceNote?._id ?? null;

    const customTemplates =
      doc && Array.isArray(doc.customTemplates) ? doc.customTemplates : [];
    const templates = [...BUILTIN_STYLE_TEMPLATES, ...customTemplates];

    this.editor.academic.close();
    this.editor.bibliographicSources.set(normalizeSources(doc?.bibliographicSources));
    this.editor.headingNumbering.set(doc?.headingNumbering === true);
    this.editor.comments.set(Array.isArray(doc?.comments) ? doc.comments : []);
    this.editor.trackChangesEnabled.set(doc?.trackChangesEnabled === true);
    this.editor.hideCommentsOnExport.set(doc?.hideCommentsOnExport === true);
    this.editor.activeCommentId.set(null);
    this.editor.commentsPanelOpen.set(false);
    this.editor.revisions.set([]);
    this.hooks.setLoadedModelSections?.(modelSections);
    this.hooks.renderDocumentPages(pages);
    this.editor.layoutConfig.set(layout);
    this.editor.styleTemplates.set(templates);
    this.editor.activeTemplateId.set(doc?.activeTemplateId || 'corporate-modern');
    this.editor.docTitle.set(doc?.docTitle ?? (sourceNote?.title || DEFAULT_DOC_TITLE));

    this.editor.viewMode.set(doc?.viewMode ?? 'print');
    this.editor.focusMode.set(false);
    if (this.editor.active() && doc?.darkMode !== undefined && this.hooks.themeService && this.hooks.themeService.isDark() !== doc.darkMode) {
      this.hooks.themeService.setDark(doc.darkMode);
    }
    this.editor.darkCanvas.set(doc?.darkCanvas ?? true);
    this.editor.pageMovement.set(doc?.pageMovement ?? 'vertical');
    this.editor.showRuler.set(doc?.showRuler ?? true);
    this.editor.showGridlines.set(doc?.showGridlines ?? false);
    this.editor.showTocSidebar.set(true);
    this.editor.zoom.set(doc?.zoom ?? 100);

    this.editor.activePageIndex.set(0);
    this.editor.docxProperties.set(null);
    this.editor.importedTocEntries.set([]);
    this.editor.activeTableCell.set(null);
    this.editor.formatPainterActive.set(false);
    this.editor.copiedInlineStyle.set(null);
    this.editor.editingLatexElement.set(null);
    this.editor.editingLatexCode.set(undefined);
    this.editor.pendingScrollHeadingId.set(null);
    this.editor.latexModalOpen.set(false);
    this.editor.styleModalOpen.set(false);
    this.editor.activeTab.set('home');
    this.editor.showFormattingMarks.set(false);
    this.editor.searchMode.set(null);
    this.editor.searchQuery.set('');
    this.editor.searchStatus.set('');
    this.hooks.savedRange = null;
    this.hooks.pendingTypingStyle = null;

    this.undoStack = [];
    this.redoStack = [];

    const savedSlim = await this.buildSlimDocData(this.collectDocData());
    if (this.hooks.destroyed || version !== this.hydrationVersion || sourceNote?._id !== this.editor.note?._id) return;
    try {
      this.lastSavedJson = JSON.stringify(savedSlim);
    } catch {
      this.lastSavedJson = '';
    }
    this.editor.documentReady.set(true);
    this.hooks.syncInnerHtml();
    this.hooks.scheduleDocumentFlow();
  }

  private readonly slimPages = new WeakMap<DocumentPage, { html: string; result: Promise<string> }>();

  private externalizePage(page: DocumentPage): Promise<string> {
    const cached = this.slimPages.get(page);
    if (cached?.html === page.html) return cached.result;
    const result = this.hooks.imageStore.externalizeImages(page.html).catch(error => {
      this.slimPages.delete(page); throw error;
    });
    this.slimPages.set(page, { html: page.html, result });
    return result;
  }

  private async buildSlimDocData(doc: AnyDocData): Promise<AnyDocData> {
    const pages = await Promise.all(
      (doc.pages ?? []).map(async (p) => ({
        ...p,
        html: await this.externalizePage(p),
      }))
    );

    const layoutConfig = doc.layoutConfig
      ? {
          ...doc.layoutConfig,
          headerHtml: await this.hooks.imageStore.externalizeImages(doc.layoutConfig.headerHtml),
          footerHtml: await this.hooks.imageStore.externalizeImages(doc.layoutConfig.footerHtml),
        }
      : doc.layoutConfig;

    if (doc.v === 3 && doc.modelSections?.length) {
      const modelSections = await mapModelSectionImages(
        doc.modelSections,
        src => (this.hooks.imageStore.externalizeImageSrc ? this.hooks.imageStore.externalizeImageSrc(src) : Promise.resolve(src)),
      );
      return { ...doc, pages, layoutConfig, modelSections };
    }

    return { ...doc, pages, layoutConfig };
  }

  collectDocData(): AnyDocData {
    const customTemplates = this.editor.styleTemplates().filter((t) => t.isCustom);
    const modelSections = this.hooks.exportCanvasModelSections?.();
    const base: Omit<DocDataV2, 'v'> = {
      bibliographicSources: this.editor.bibliographicSources(),
      docTitle: this.editor.docTitle(),
      pages: this.editor.pages(),
      layoutConfig: this.editor.layoutConfig(),
      customTemplates,
      activeTemplateId: this.editor.activeTemplateId(),
      viewMode: this.editor.viewMode(),
      pageMovement: this.editor.pageMovement(),
      showRuler: this.editor.showRuler(),
      showGridlines: this.editor.showGridlines(),
      zoom: this.editor.zoom(),
      darkMode: this.editor.darkMode(),
      darkCanvas: this.editor.darkCanvas(),
      headingNumbering: this.editor.headingNumbering(),
      comments: this.editor.comments(),
      trackChangesEnabled: this.editor.trackChangesEnabled(),
      hideCommentsOnExport: this.editor.hideCommentsOnExport(),
    };
    return modelSections?.length
      ? { v: 3, ...base, modelSections }
      : { v: 2, ...base };
  }

  scheduleAutoSave(payload: AnyDocData): void {
    if (this.hooks.destroyed) return;
    const targetNoteId = this.loadedNoteId;
    if (!targetNoteId) return;
    this.pendingPayload = payload;
    this.pendingNoteId = targetNoteId;
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => void this.flushSave(), 600);
  }

  captureLatestSave(): void {
    if (!this.editor.documentReady() || this.hooks.destroyed) return;
    const payload = this.collectDocData();
    if (!this.hooks.pendingRenderPages) {
      payload.pages = this.hooks.getLivePagesSnapshot().map((page) => ({ ...page, html: withoutSelectionMarkers(page.html) }));
    }
    this.scheduleAutoSave(payload);
  }

  flushSave(): Promise<void> {
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

  private async persistDocData(payload: AnyDocData, targetNoteId: string): Promise<void> {
    const slim = await this.buildSlimDocData(payload);

    let json = '';
    try {
      json = JSON.stringify(slim);
    } catch {
      return;
    }
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    this.hooks.notesService.updateDocData(slim, targetNoteId);
  }

  hydrationVersion = 0;

  loadedNoteId: string | null = null;

  saveTimeout: ReturnType<typeof setTimeout> | null = null;

  private pendingPayload: AnyDocData | null = null;

  private pendingNoteId: string | null = null;

  private saveInFlight: Promise<void> | null = null;

  private lastSavedJson = '';

  undoStack: HistorySnapshot[] = [];

  redoStack: HistorySnapshot[] = [];

  pushUndoSnapshot(overridePages?: DocumentPage[]): void {
    const marked = !overridePages && markDocumentSelection(this.hooks.liveBodies());
    const snapshotPages = overridePages?.map((page) => ({ ...page })) ?? this.hooks.getLivePagesSnapshot();
    if (marked) restoreDocumentSelection(this.hooks.liveBodies());
    const last = this.undoStack.at(-1);
    if (this.hooks.samePages(snapshotPages, last?.pages) && last?.templates === this.editor.styleTemplates()
      && last.activeTemplateId === this.editor.activeTemplateId() && last.headingNumbering === this.editor.headingNumbering() && last.bibliographicSources === this.editor.bibliographicSources() && last.layoutConfig === this.editor.layoutConfig() && last.importedTocEntries === this.editor.importedTocEntries()) return;
    this.undoStack.push({ pages: snapshotPages, activePageIndex: this.editor.activePageIndex(),
      templates: this.editor.styleTemplates(), activeTemplateId: this.editor.activeTemplateId(), headingNumbering: this.editor.headingNumbering(), bibliographicSources: this.editor.bibliographicSources(), layoutConfig: this.editor.layoutConfig(), importedTocEntries: this.editor.importedTocEntries() });
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = [];
  }

  handleGlobalUndo(): void {
    if (this.undoStack.length > 0) {
      const currentSnapshot = this.captureHistory();
      this.redoStack.push(currentSnapshot);

      const previous = this.undoStack.pop()!;
      this.editor.bibliographicSources.set(previous.bibliographicSources || []);
      if (previous.importedTocEntries) this.editor.importedTocEntries.set(previous.importedTocEntries);
      if (previous.layoutConfig) this.editor.layoutConfig.set(previous.layoutConfig);
      this.editor.headingNumbering.set(previous.headingNumbering);
      this.editor.styleTemplates.set(previous.templates);
      this.editor.activeTemplateId.set(previous.activeTemplateId);
      this.hooks.renderDocumentPages(previous.pages);
      this.editor.activePageIndex.set(Math.min(previous.activePageIndex, previous.pages.length - 1));
      this.hooks.lastInputTime = 0;

      this.hooks.showToast(`Deshacer aplicado (${previous.pages.length} pág.)`);
      return;
    }
    document.execCommand('undo', false);
  }

  handleGlobalRedo(): void {
    if (this.redoStack.length > 0) {
      const currentSnapshot = this.captureHistory();
      this.undoStack.push(currentSnapshot);

      const nextState = this.redoStack.pop()!;
      this.editor.bibliographicSources.set(nextState.bibliographicSources || []);
      if (nextState.importedTocEntries) this.editor.importedTocEntries.set(nextState.importedTocEntries);
      if (nextState.layoutConfig) this.editor.layoutConfig.set(nextState.layoutConfig);
      this.editor.headingNumbering.set(nextState.headingNumbering);
      this.editor.styleTemplates.set(nextState.templates);
      this.editor.activeTemplateId.set(nextState.activeTemplateId);
      this.hooks.renderDocumentPages(nextState.pages);
      this.editor.activePageIndex.set(Math.min(nextState.activePageIndex, nextState.pages.length - 1));
      this.hooks.lastInputTime = 0;

      this.hooks.showToast(`Rehacer aplicado (${nextState.pages.length} pág.)`);
      return;
    }
    document.execCommand('redo', false);
  }

  captureHistory(): HistorySnapshot {
    const marked = markDocumentSelection(this.hooks.liveBodies());
    const pages = this.hooks.getLivePagesSnapshot();
    if (marked) restoreDocumentSelection(this.hooks.liveBodies());
    return { pages, activePageIndex: this.editor.activePageIndex(), templates: this.editor.styleTemplates(), activeTemplateId: this.editor.activeTemplateId(), headingNumbering: this.editor.headingNumbering(), bibliographicSources: this.editor.bibliographicSources(), layoutConfig: this.editor.layoutConfig(), importedTocEntries: this.editor.importedTocEntries() };
  }
}
