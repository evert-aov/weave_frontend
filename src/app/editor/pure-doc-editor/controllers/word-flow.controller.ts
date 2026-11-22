import { DomSnapshotCache } from '../utils/dom-snapshot-cache';
import { clearNaturalLineHeightCache } from '../utils/word-line-spacing';
import { createDocumentMeasurement } from '../utils/document-measurement';
import { ElementRef, QueryList } from '@angular/core';
import {
  markDocumentSelection,
  restoreDocumentSelection,
  withoutSelectionMarkers,
} from '../utils/document-selection';
import { DocumentPage } from '../models/word-document.model';
import { renumberHeadings } from '../utils/heading-numbering';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordFlowControllerHost = Pick<PureDocEditorComponent,
  | 'active'
  | 'activePageIndex'
  | 'clearObjectSelection'
  | 'refreshObjectOverlays'
  | 'isImageResizing'
  | 'documentReady'
  | 'footerRefs'
  | 'headerRefs'
  | 'headingNumbering'
  | 'layoutConfig'
  | 'mainScrollRef'
  | 'pageBodyRefs'
  | 'pages'
  | 'viewMode'>;
type WordFlowControllerHooks = Pick<WordEditorHooks,
  | 'collectDocData'
  | 'composing'
  | 'destroyed'
  | 'documentFlow'
  | 'scheduleAutoSave'
  | 'settleApaToc'>;

/** Flow behavior owned by one editor instance. */
export class WordFlowController {
  constructor(private readonly editor: WordFlowControllerHost, private readonly hooks: WordFlowControllerHooks) {}

  readonly snapshotCache = new DomSnapshotCache();

  private parsedBodiesMap = new Map<string, { html: string; body: HTMLDivElement }>();

  pageBodyMap = new Map<string, HTMLElement>();

  private headerMap = new Map<string, HTMLElement>();

  private footerMap = new Map<string, HTMLElement>();

  flowFrame: number | null = null;
  private inputTimer: ReturnType<typeof setTimeout> | null = null;
  private inputBurstStart = 0;
  private inputOnlyFlow = false;
  private readonly syncedHtml = new WeakMap<HTMLElement, string>();

  private syncElement(element: HTMLElement, html: string): void {
    if (this.syncedHtml.get(element) === html) return;
    if (element.innerHTML !== html) element.innerHTML = html;
    this.syncedHtml.set(element, html);
  }

  pendingRenderPages: DocumentPage[] | null = null;

  private pendingRenderNeedsFlow = false;

  lastFlowPages: DocumentPage[] | null = null;

  private lastFlowGeometry = '';

  bodyResizeObserver?: ResizeObserver;

  private observedBody: HTMLElement | null = null;

  readonly onFontsLoaded = () => { clearNaturalLineHeightCache(); this.invalidateDocumentFlow(); };

  readonly onAssetLoaded = () => { this.editor.refreshObjectOverlays(); this.invalidateDocumentFlow(); };

  rebuildMaps(): void {
    this.pageBodyMap = this.buildMap(this.editor.pageBodyRefs, 'data-page-body-id');
    this.snapshotCache.retain(this.pageBodyMap.values());
    this.headerMap = this.buildMap(this.editor.headerRefs, 'data-page-header-id');
    this.footerMap = this.buildMap(this.editor.footerRefs, 'data-page-footer-id');
    this.observeBodySize();
  }

  observeBodySize(): void {
    const first = this.getPageBody(this.editor.pages()[0]?.id);
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

  syncInnerHtml(): void {
    if (this.hooks.destroyed) return;
    if (this.pendingRenderPages) {
      const pending = this.pendingRenderPages;
      for (const page of pending) {
        const element = this.getPageBody(page.id);
        if (!element) continue;
        if (element === document.activeElement) {
          if (element.innerHTML !== page.html) element.innerHTML = page.html;
          this.syncedHtml.set(element, page.html);
        } else this.syncElement(element, page.html);
      }
      // Reused hosts (especially the focused page) must shrink immediately.
      // New page hosts arrive in the next Angular render; do not mix old DOM
      // with the new pagination or overwrite its selection bookmarks meanwhile.
      if (!pending.every(page => this.getPageBody(page.id))) return;
      const markerBodies = pending.filter(page => page.html.includes('<!--weave-selection-'))
        .map(page => this.getPageBody(page.id)!).filter(Boolean);
      const body = restoreDocumentSelection(markerBodies);
      this.pendingRenderPages = null;
      if (renumberHeadings(this.liveBodies(), this.editor.headingNumbering())) {
        this.editor.pages.set(this.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
      }
      if (body) {
        const index = this.editor.pages().findIndex((page) => page.id === body.dataset['pageBodyId']);
        if (index >= 0) this.editor.activePageIndex.set(index);
        this.scrollCaretIntoView();
      }
      if (this.pendingRenderNeedsFlow) this.scheduleDocumentFlow();
      this.pendingRenderNeedsFlow = false;
    }
    const currentPages = this.editor.pages();
    const layout = this.editor.layoutConfig();
    for (const page of currentPages) {
      const el = this.getPageBody(page.id);
      if (el && document.activeElement !== el) this.syncElement(el, page.html);
      const hEl = this.getHeaderEl(page.id);
      if (hEl && document.activeElement !== hEl) this.syncElement(hEl, layout.headerHtml);
      const fEl = this.getFooterEl(page.id);
      if (fEl && document.activeElement !== fEl) this.syncElement(fEl, layout.footerHtml);
    }
  }

  getLivePagesSnapshot(): DocumentPage[] {
    if (this.pendingRenderPages) return this.pendingRenderPages.map(page => ({ ...page }));
    const sessionPages = (this.editor as unknown as { canvasEditor?: { session?: { pages: DocumentPage[] } } }).canvasEditor?.session?.pages;
    const pages = sessionPages && sessionPages.length ? sessionPages : this.editor.pages();
    return pages.map((p) => {
      const body = this.getPageBody(p.id);
      if (body) {
        const html = this.snapshotCache.read(body);
        return { ...p, html };
      }
      const parsed = this.parsedBodiesMap.get(p.id);
      if (parsed) {
        return { ...p, html: parsed.body.innerHTML };
      }
      return { ...p };
    });
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

  getActivePageElement(): HTMLDivElement | null {
    const currentPages = this.editor.pages();
    const page = currentPages[this.editor.activePageIndex()] || currentPages[0];
    return page ? this.getPageBody(page.id) : null;
  }

  activePageHtml(): string {
    return this.getActivePageElement()?.innerHTML || '';
  }

  commitPageDomToState(pageIndex: number): void {
    if (this.pendingRenderPages) return;
    const currentPages = this.editor.pages();
    const targetPage = currentPages[pageIndex];
    if (!targetPage) return;
    const el = this.getPageBody(targetPage.id);
    if (!el) return;
    const liveHtml = withoutSelectionMarkers(el.innerHTML);
    this.syncedHtml.set(el, liveHtml);
    if (liveHtml === targetPage.html) return;

    this.editor.pages.update((prev) => {
      const next = [...prev];
      if (next[pageIndex]) {
        next[pageIndex] = { ...next[pageIndex], html: liveHtml };
      }
      return next;
    });
    if (this.editor.documentReady()) this.hooks.scheduleAutoSave(this.hooks.collectDocData());
  }

  checkAndPaginateOverflow(_pageIndex: number, _preChangePagesSnapshot?: DocumentPage[]): void {
    this.scheduleDocumentFlow();
  }

  scheduleDocumentFlow(deferInput = false): void {
    if (this.hooks.destroyed || !this.editor.active()) return;
    if (deferInput) {
      if (this.flowFrame !== null && !this.inputOnlyFlow) return;
      this.inputOnlyFlow = true;
      const now = Date.now();
      this.inputBurstStart ||= now;
      if (this.inputTimer !== null) clearTimeout(this.inputTimer);
      this.inputTimer = setTimeout(() => {
        this.inputTimer = null; this.inputBurstStart = 0;
        this.requestFlowFrame();
      }, Math.max(0, Math.min(120, 400 - (now - this.inputBurstStart))));
      return;
    }
    if (this.inputTimer !== null) clearTimeout(this.inputTimer);
    this.inputTimer = null; this.inputBurstStart = 0; this.inputOnlyFlow = false;
    this.requestFlowFrame();
  }

  private requestFlowFrame(): void {
    if (this.hooks.destroyed || this.flowFrame !== null) return;
    this.flowFrame = requestAnimationFrame(() => {
      this.flowFrame = null;
      this.reflowDocument();
    });
  }

  cancelScheduledFlow(): void {
    if (this.flowFrame !== null) cancelAnimationFrame(this.flowFrame);
    if (this.inputTimer !== null) clearTimeout(this.inputTimer);
    this.flowFrame = null; this.inputTimer = null; this.inputBurstStart = 0; this.inputOnlyFlow = false;
  }

  invalidateDocumentFlow(): void {
    this.lastFlowPages = null;
    this.scheduleDocumentFlow();
  }

  samePages(left: DocumentPage[], right: DocumentPage[] | null | undefined): boolean {
    return !!right && left.length === right.length && left.every((page, index) => {
      const previous = right[index];
      return previous.id === page.id && previous.html === page.html && previous.breakBefore === page.breakBefore;
    });
  }

  reflowDocument(sourcePages?: DocumentPage[]): boolean {
    if (!this.editor.active() || !this.editor.documentReady() || this.editor.isImageResizing || this.hooks.composing || (this.pendingRenderPages && !sourcePages)
      || !['print', 'read'].includes(this.editor.viewMode())) return false;
    const first = this.getPageBody(this.editor.pages()[0]?.id);
    // A page body narrower than this is a transient flex/layout collapse, not
    // usable document geometry. Measuring it would split every line into
    // single-character fragments and persist that broken pagination.
    if (!first || first.clientWidth < 200 || first.clientHeight === 0) return false;
    const styles = getComputedStyle(first);
    // Canvas visibility is presentation only, not a reason to repaginate the document.
    const layoutClasses = Array.from(first.classList).filter(name => name !== 'word-hybrid-source').join(' ');
    const geometry = [first.clientWidth, first.clientHeight, styles.font, styles.lineHeight,
      styles.hyphens, styles.overflowWrap, styles.whiteSpace, styles.letterSpacing, styles.wordSpacing, layoutClasses, first.lang, this.editor.viewMode()].join('|');
    const inputOnly = !sourcePages && this.inputOnlyFlow;
    this.inputOnlyFlow = false;
    const livePages = sourcePages || (inputOnly ? this.editor.pages() : this.getLivePagesSnapshot());
    // Observer notifications and Angular renders can follow the same edit. Reuse the settled
    // result before cloning/measuring DOM again; font/image load events explicitly invalidate it.
    if (!sourcePages && geometry === this.lastFlowGeometry && this.samePages(livePages, this.lastFlowPages)) { this.hooks.settleApaToc(); return true; }
    const canvas = createDocumentMeasurement(first);
    // Keep the measurement outside the transformed page stack (zoom scales DOM rects).
    document.body.appendChild(canvas);
    const bodies = this.liveBodies();
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    const selectedBodies = inputOnly && range ? bodies.filter(body => body.contains(range.startContainer) || body.contains(range.endContainer)) : bodies;
    if (!sourcePages) markDocumentSelection(selectedBodies);
    try {
      // clientHeight is unscaled CSS pixels, so zoom never changes pagination.
      const selected = new Set(selectedBodies);
      const snapshot = sourcePages || (inputOnly ? livePages.map(page => {
        const body = this.getPageBody(page.id);
        return body && selected.has(body) ? { ...page, html: body.innerHTML } : page;
      }) : this.getLivePagesSnapshot());
      const pages = this.hooks.documentFlow.paginateChangedSections(snapshot,
        geometry === this.lastFlowGeometry ? this.lastFlowPages : null, canvas, first.clientHeight);
      const current = this.editor.pages();
      const clean = pages.map((page, index) => {
        const html = withoutSelectionMarkers(page.html), old = current[index];
        return old?.id === page.id && old.html === html && old.breakBefore === page.breakBefore ? old : { ...page, html };
      });
      this.lastFlowPages = clean;
      this.lastFlowGeometry = geometry;
      if (sourcePages || !this.samePages(clean, current) || !this.samePages(clean, livePages)) this.renderDocumentPages(pages, false);
    } finally {
      if (!this.pendingRenderPages) restoreDocumentSelection(bodies);
      canvas.remove();
    }
    this.hooks.settleApaToc();
    return true;
  }

  liveBodies(): HTMLElement[] {
    const sessionPages = (this.editor as unknown as { canvasEditor?: { session?: { pages: DocumentPage[] } } }).canvasEditor?.session?.pages;
    const pages = sessionPages && sessionPages.length ? sessionPages : this.editor.pages();
    const validIds = new Set(pages.map(p => p.id));
    for (const id of this.parsedBodiesMap.keys()) {
      if (!validIds.has(id)) this.parsedBodiesMap.delete(id);
    }
    return pages.map((page) => {
      const live = this.getPageBody(page.id);
      if (live) return live;
      const cached = this.parsedBodiesMap.get(page.id);
      if (cached && (cached.html === page.html || cached.body.innerHTML === page.html)) {
        cached.html = page.html;
        return cached.body;
      }
      const div = document.createElement('div') as HTMLDivElement;
      div.setAttribute('data-page-body-id', page.id);
      div.innerHTML = page.html || '';
      this.parsedBodiesMap.set(page.id, { html: page.html, body: div });
      return div;
    });
  }

  private scrollCaretIntoView(): void {
    const viewport = this.editor.mainScrollRef?.nativeElement;
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

  renderDocumentPages(pages: DocumentPage[], reflowAfterRender = true): void {
    this.editor.clearObjectSelection();
    this.pendingRenderPages = pages;
    this.pendingRenderNeedsFlow = reflowAfterRender;
    const current = this.editor.pages();
    this.editor.pages.set(pages.map((page, index) => {
      const html = withoutSelectionMarkers(page.html), old = current[index];
      return old?.id === page.id && old.html === html && old.breakBefore === page.breakBefore ? old : { ...page, html };
    }));
    this.editor.activePageIndex.update((index) => Math.min(index, pages.length - 1));
    // Existing page hosts need no Angular DOM creation. Restore their HTML now,
    // including focused hosts, so undo cannot leave the previous appearance visible.
    // New hosts still wait for the view/query update handled by syncInnerHtml.
    this.syncInnerHtml();
  }
}
