import { serializeModelPages } from './model-page-serialization';
import { DocumentPage, SectionPageConfig } from '../models/word-document.model';
import { sameSectionConfig } from '../utils/page-section-layout';
import { PageDisplayList } from './canvas-page-renderer';
import { caretForPosition, moveCaretVertically, selectionRectsForRange } from './canvas-caret';
import { hitTestPage, hitTestSelection } from './canvas-hit-test';
import { MeasureText, PageGeometry } from './document-layout';
import {
  applyDocumentOperation,
  DocumentModel,
  DocumentNode,
  DocumentOperation,
  DocumentPosition,
  DocumentSelection,
  DocumentState,
  textNodes,
} from './document-model';
import { documentStateToHtml, htmlToDocumentState, serializeDocumentNodes } from './document-model-dom';
import { createCanvasTextMeasurer, layoutModelDocument, resolveDefaultModelStyles, ResolvedLayoutStyle } from './model-layout';
import { CanvasPerfMonitor } from './canvas-perf';

export interface DocumentSectionState {
  id: string;
  breakBefore?: 'manual';
  sectionBreak?: 'nextPage';
  sectionConfig?: SectionPageConfig;
  model: DocumentModel;
  pages: DocumentPage[];
  displayLists: PageDisplayList[];
  laidOutRevision: number;
  pagesRevision?: number;
  geometryKey: string;
}

export interface EngineSectionSnapshot {
  id: string;
  breakBefore?: 'manual';
  sectionBreak?: 'nextPage';
  sectionConfig?: SectionPageConfig;
  state: DocumentState;
  pageIds: string[];
}

export interface ModelSearchMatch {
  sectionIndex: number;
  start: DocumentPosition;
  end: DocumentPosition;
  text: string;
}

const TOC_PAGE_RE = /\bword-toc-page-section\b|\bword-toc-entry\b|data-native-word-toc|data-word-toc=/;

function tocSectionKind(html: string): 'toc' | 'tables' | 'figures' | null {
  if (!TOC_PAGE_RE.test(html)) return null;
  if (/data-word-list-of=["']tables["']/.test(html)) return 'tables';
  if (/data-word-list-of=["']figures["']/.test(html)) return 'figures';
  return 'toc';
}

function mergeContinuationElements(target: HTMLElement, incoming: HTMLElement): void {
  incoming.querySelectorAll('[data-word-repeat]').forEach(n => n.remove());
  while (incoming.firstChild) {
    const child = incoming.firstChild;
    if (
      child instanceof HTMLElement &&
      child.classList.contains('word-toc-header') &&
      target.querySelector('.word-toc-header')
    ) {
      incoming.removeChild(child);
      continue;
    }
    const last = target.lastElementChild as HTMLElement | null;
    if (
      child instanceof HTMLElement &&
      last &&
      child.tagName === last.tagName &&
      last.getAttribute('data-word-flow') &&
      last.getAttribute('data-word-flow') === child.getAttribute('data-word-continuation')
    ) {
      incoming.removeChild(child);
      mergeContinuationElements(last, child);
    } else {
      target.appendChild(child);
    }
  }
}

function joinSectionHtml(pages: readonly DocumentPage[]): string {
  const container = document.createElement('div');
  for (const page of pages) {
    const fragment = document.createElement('div');
    fragment.innerHTML = page.html;
    while (fragment.firstChild) {
      const first = fragment.firstChild;
      if (first.nodeType === Node.TEXT_NODE && !first.textContent?.trim()) {
        fragment.removeChild(first);
        continue;
      }
      const listAttr = first instanceof HTMLElement ? first.getAttribute('data-word-list-of') : null;
      const existingToc = listAttr
        ? container.querySelector<HTMLElement>(`.word-toc-page-section[data-word-list-of="${listAttr}"]`)
        : container.querySelector<HTMLElement>('.word-toc-page-section:not([data-word-list-of])');
      if (
        first instanceof HTMLElement &&
        existingToc &&
        (first.classList.contains('word-toc-page-section') || (!listAttr && first.hasAttribute('data-native-word-toc')))
      ) {
        fragment.removeChild(first);
        mergeContinuationElements(existingToc, first);
        continue;
      }
      if (
        first instanceof HTMLElement &&
        existingToc &&
        first.tagName === 'P' &&
        !first.textContent?.replace(/\u00a0/g, ' ').trim() &&
        !first.querySelector('img,table,svg')
      ) {
        fragment.removeChild(first);
        continue;
      }
      const last = container.lastElementChild as HTMLElement | null;
      if (
        first instanceof HTMLElement &&
        last &&
        first.tagName === last.tagName &&
        last.getAttribute('data-word-flow') &&
        last.getAttribute('data-word-flow') === first.getAttribute('data-word-continuation')
      ) {
        fragment.removeChild(first);
        mergeContinuationElements(last, first);
      } else {
        container.appendChild(first);
      }
    }
  }
  container.normalize();
  return container.innerHTML || '<p><br></p>';
}

function geometrySignature(geometry: PageGeometry): string {
  return `${geometry.width}:${geometry.height}:${geometry.top}:${geometry.right}:${geometry.bottom}:${geometry.left}`;
}

function sectionGeometryFor(base: PageGeometry, config?: SectionPageConfig): PageGeometry {
  if (!config?.orientation) return base;
  const maxDim = Math.max(base.width, base.height);
  const minDim = Math.min(base.width, base.height);
  const width = config.orientation === 'landscape' ? maxDim : minDim;
  const height = config.orientation === 'landscape' ? minDim : maxDim;
  if (width === base.width && height === base.height) return base;
  return { ...base, width, height };
}

/**
 * Authoritative multi-page document model and incremental Canvas layout coordinator.
 * Connects DocumentModel -> layoutModelDocument -> PageDisplayList[] -> CanvasPageRenderer.
 */
export class DocumentCanvasEngine {
  private sections: DocumentSectionState[] = [];
  private measurer: MeasureText;
  private defaultStyle: Partial<ResolvedLayoutStyle>;
  readonly perf = new CanvasPerfMonitor();

  constructor(
    measure?: MeasureText,
    defaultStyle: Partial<ResolvedLayoutStyle> = {},
  ) {
    this.measurer = measure ?? createCanvasTextMeasurer();
    this.defaultStyle = defaultStyle;
  }

  getSections(): readonly DocumentSectionState[] {
    return this.sections;
  }

  getDefaultStyle(): Partial<ResolvedLayoutStyle> {
    return this.defaultStyle;
  }

  getResolvedStyles(state: DocumentState): ReadonlyMap<string, ResolvedLayoutStyle> {
    return resolveDefaultModelStyles(state, this.defaultStyle);
  }

  getPages(): DocumentPage[] {
    for (const section of this.sections) {
      if (section.pagesRevision !== section.laidOutRevision) {
        this.deriveSectionPages(section);
      }
    }
    return this.sections.flatMap(s => s.pages);
  }

  getDisplayLists(): PageDisplayList[] {
    return this.sections.flatMap(s => s.displayLists);
  }

  getDisplayListByPageId(pageId: string): PageDisplayList | undefined {
    for (const section of this.sections) {
      const found = section.displayLists.find(d => d.id === pageId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Synchronizes the engine with the editor's `DocumentPage[]`, preserving unchanged manual sections
   * and incrementally laying out only modified sections.
   */
  syncPages(
    pages: readonly DocumentPage[],
    geometry: PageGeometry,
    preloadedModels?: readonly EngineSectionSnapshot[],
  ): PageDisplayList[] {
    const t0 = this.perf.now();
    const grouped: DocumentPage[][] = [];
    for (const page of pages) {
      const prevGroup = grouped.at(-1);
      const prevPage = prevGroup?.at(-1);
      const prevTocKind = prevPage ? tocSectionKind(prevPage.html) : null;
      const currTocKind = tocSectionKind(page.html);
      const continueTocSection = prevTocKind !== null && prevTocKind === currTocKind;
      const transitionFromToc = prevTocKind !== null && prevTocKind !== currTocKind;
      if (!prevGroup || ((page.breakBefore === 'manual' || page.sectionBreak === 'nextPage' || transitionFromToc) && !continueTocSection)) {
        grouped.push([]);
      }
      grouped[grouped.length - 1].push(
        (transitionFromToc || page.sectionBreak === 'nextPage') && page.breakBefore !== 'manual'
          ? { ...page, breakBefore: 'manual' }
          : page,
      );
    }

    const nextSections: DocumentSectionState[] = [];

    let activeLogicalConfig: SectionPageConfig | undefined;
    for (let i = 0; i < grouped.length; i++) {
      const group = grouped[i];
      const sectionId = group[0].id;
      const preloaded =
        !this.sections.length && preloadedModels
          ? preloadedModels.find(
              m =>
                m.pageIds.length === group.length &&
                m.pageIds.every((pid, pIdx) => pid === group[pIdx].id),
            )
          : undefined;
      const groupSectionBreak = preloaded?.sectionBreak ?? group[0].sectionBreak;
      const groupSectionConfig = preloaded?.sectionConfig ?? group[0].sectionConfig;
      if (i === 0 || groupSectionBreak === 'nextPage') {
        activeLogicalConfig = groupSectionConfig;
      }
      const effectiveGeom = sectionGeometryFor(geometry, activeLogicalConfig);
      const gKey = geometrySignature(effectiveGeom);

      const existing = this.sections[i];
      const samePages =
        existing &&
        existing.sectionBreak === groupSectionBreak &&
        sameSectionConfig(existing.sectionConfig, groupSectionConfig) &&
        existing.pages.length === group.length &&
        existing.pages.every((p, idx) => p.id === group[idx].id && p.html === group[idx].html && p.breakBefore === group[idx].breakBefore && p.sectionBreak === group[idx].sectionBreak && sameSectionConfig(p.sectionConfig, group[idx].sectionConfig));

      if (samePages && existing.geometryKey === gKey && existing.laidOutRevision === existing.model.state.revision) {
        nextSections.push(existing);
        continue;
      }

      const state = preloaded
        ? preloaded.state
        : htmlToDocumentState(joinSectionHtml(group), existing ? existing.model.state.revision + 1 : 1, `sec-${i}`);
      const model = new DocumentModel(state);

      const sectionState: DocumentSectionState = {
        id: preloaded?.id || sectionId,
        ...((preloaded?.breakBefore ?? group[0].breakBefore) === 'manual' ? { breakBefore: 'manual' as const } : {}),
        ...(groupSectionBreak ? { sectionBreak: groupSectionBreak } : {}),
        ...(groupSectionConfig ? { sectionConfig: groupSectionConfig } : {}),
        model,
        pages: group.map(p => ({ ...p })),
        displayLists: [],
        laidOutRevision: -1,
        geometryKey: gKey,
      };
      this.layoutSection(sectionState, effectiveGeom, group.map(p => p.id), !preloaded);
      if (preloaded) sectionState.pagesRevision = sectionState.laidOutRevision;
      nextSections.push(sectionState);
    }

    this.sections = nextSections;
    const lists = this.getDisplayLists();
    this.perf.record('sync', this.perf.now() - t0, undefined, lists.length);
    return lists;
    return this.getDisplayLists();
  }

  private logicalConfigForSectionIndex(sectionIndex: number): SectionPageConfig | undefined {
    let active: SectionPageConfig | undefined;
    for (let i = 0; i <= sectionIndex && i < this.sections.length; i++) {
      const sec = this.sections[i];
      if (i === 0 || sec.sectionBreak === 'nextPage') {
        active = sec.sectionConfig;
      }
    }
    return active;
  }

  /** Applies a logical operation to a section and incrementally updates its derived pages and display lists. */
  applyOperation(sectionIndex: number, operation: DocumentOperation, geometry: PageGeometry): PageDisplayList[] {
    const section = this.sections[sectionIndex];
    if (!section) throw new Error('Invalid section index');
    const next = applyDocumentOperation(section.model.state, operation);
    return this.commitSectionState(sectionIndex, next, geometry);
  }

  commitSectionState(sectionIndex: number, next: DocumentState, geometry: PageGeometry): PageDisplayList[] {
    const section = this.sections[sectionIndex];
    if (!section) throw new Error('Invalid section index');
    const effectiveGeom = sectionGeometryFor(geometry, this.logicalConfigForSectionIndex(sectionIndex));
    const candidate = { ...section, model: new DocumentModel(next) };
    // Layout is validated before committing either content or history.
    this.layoutSection(candidate, effectiveGeom, section.displayLists.map(p => p.id), false);
    section.model.commit(next);
    Object.assign(section, { pages: candidate.pages, displayLists: candidate.displayLists,
      laidOutRevision: candidate.laidOutRevision, pagesRevision: candidate.pagesRevision, geometryKey: candidate.geometryKey });
    return section.displayLists;
  }

  undo(sectionIndex: number, geometry: PageGeometry): boolean {
    const section = this.sections[sectionIndex];
    if (!section || !section.model.undo()) return false;
    this.layoutSection(section, sectionGeometryFor(geometry, this.logicalConfigForSectionIndex(sectionIndex)), section.displayLists.map(p => p.id), false);
    return true;
  }

  redo(sectionIndex: number, geometry: PageGeometry): boolean {
    const section = this.sections[sectionIndex];
    if (!section || !section.model.redo()) return false;
    this.layoutSection(section, sectionGeometryFor(geometry, this.logicalConfigForSectionIndex(sectionIndex)), section.displayLists.map(p => p.id), false);
    return true;
  }

  setSelection(sectionIndex: number, selection: DocumentSelection | null): void {
    const section = this.sections[sectionIndex];
    if (section) section.model.state = { ...section.model.state, selection };
  }

  snapshot(): EngineSectionSnapshot[] {
    return this.sections.map(section => ({
      id: section.id,
      breakBefore: section.breakBefore,
      ...(section.sectionBreak ? { sectionBreak: section.sectionBreak } : {}),
      ...(section.sectionConfig ? { sectionConfig: section.sectionConfig } : {}),
      state: section.model.state,
      pageIds: section.displayLists.map(p => p.id),
    }));
  }

  restore(states: readonly (EngineSectionSnapshot | DocumentState)[], geometry: PageGeometry, defaults?: Partial<ResolvedLayoutStyle>): void {
    const defaultsChanged = defaults !== undefined && JSON.stringify(defaults) !== JSON.stringify(this.defaultStyle);
    if (defaults !== undefined) this.defaultStyle = defaults;
    const isSectionSnapshots = states.length > 0 && typeof states[0] === 'object' && states[0] !== null && 'state' in states[0];
    if (isSectionSnapshots) {
      const secSnaps = states as readonly EngineSectionSnapshot[];
      let activeLogicalConfig: SectionPageConfig | undefined;
      this.sections = secSnaps.map((snap, i) => {
        if (i === 0 || snap.sectionBreak === 'nextPage') {
          activeLogicalConfig = snap.sectionConfig;
        }
        const effectiveGeom = sectionGeometryFor(geometry, activeLogicalConfig);
        const gKey = geometrySignature(effectiveGeom);
        const existing = this.sections.find(s => s.id === snap.id);
        if (
          existing &&
          (existing.breakBefore ?? undefined) === (snap.breakBefore ?? undefined) &&
          (existing.sectionBreak ?? undefined) === (snap.sectionBreak ?? undefined) &&
          sameSectionConfig(existing.sectionConfig, snap.sectionConfig) &&
          existing.model.state === snap.state &&
          existing.geometryKey === gKey &&
          !defaultsChanged
        ) {
          return existing;
        }
        const candidate: DocumentSectionState = {
          id: snap.id,
          ...(snap.breakBefore ? { breakBefore: snap.breakBefore } : {}),
          ...(snap.sectionBreak ? { sectionBreak: snap.sectionBreak } : {}),
          ...(snap.sectionConfig ? { sectionConfig: snap.sectionConfig } : {}),
          model: new DocumentModel(snap.state),
          pages: [],
          displayLists: [],
          laidOutRevision: -1,
          geometryKey: gKey,
        };
        this.layoutSection(candidate, effectiveGeom, snap.pageIds, false);
        return candidate;
      });
      return;
    }
    if (states.length !== this.sections.length) throw new Error('Section structure changed');
    const docStates = states as readonly DocumentState[];
    const next = this.sections.map((section, i) => {
      const effectiveGeom = sectionGeometryFor(geometry, this.logicalConfigForSectionIndex(i));
      const gKey = geometrySignature(effectiveGeom);
      if (section.model.state === docStates[i] && section.geometryKey === gKey && !defaultsChanged) {
        return section;
      }
      const candidate = { ...section, model: new DocumentModel(docStates[i]) };
      this.layoutSection(candidate, effectiveGeom, section.displayLists.map(p => p.id), false);
      return candidate;
    });
    this.sections = next;
  }

  reconfigure(geometry: PageGeometry, defaults: Partial<ResolvedLayoutStyle>): void {
    const previous = this.defaultStyle;
    try {
      this.restore(this.snapshot(), geometry, defaults);
    } catch (error) {
      this.defaultStyle = previous;
      throw error;
    }
  }

  getMarkedPages(): DocumentPage[] {
    return this.sections.flatMap(section => {
      const html=serializeModelPages(section.model.state,section.displayLists,true);
      return section.displayLists.map((dl,i)=>({
        id: dl.id,
        html: html[i],
        ...(i === 0 && section.breakBefore === 'manual' ? { breakBefore: 'manual' as const } : {}),
        ...(i === 0 && section.sectionBreak === 'nextPage' ? { sectionBreak: 'nextPage' as const } : {}),
        ...(i === 0 && section.sectionConfig ? { sectionConfig: section.sectionConfig } : {}),
      }));
    });
  }

  getSourcePages(): DocumentPage[] {
    return this.sections.map(section => ({
      id: section.id,
      html: documentStateToHtml(section.model.state),
      ...(section.breakBefore ? { breakBefore: section.breakBefore } : {}),
      ...(section.sectionBreak ? { sectionBreak: section.sectionBreak } : {}),
      ...(section.sectionConfig ? { sectionConfig: section.sectionConfig } : {}),
    }));
  }

  /** Resolves hit-testing on a laid-out page without touching the DOM. */
  hitTest(pageId: string, x: number, y: number): DocumentPosition | null {
    const page = this.getDisplayListByPageId(pageId);
    return page ? hitTestPage(page, x, y) : null;
  }

  /** Resolves pointer drag selection on a laid-out page without touching the DOM. */
  selectByPointer(
    pageId: string,
    anchorPoint: { x: number; y: number },
    focusPoint: { x: number; y: number },
  ): DocumentSelection | null {
    const page = this.getDisplayListByPageId(pageId);
    return page ? hitTestSelection(page, anchorPoint, focusPoint) : null;
  }

  /** Moves caret vertically across lines within a laid-out page. */
  navigateVertically(
    pageId: string,
    position: DocumentPosition,
    direction: -1 | 1,
    preferredX?: number,
  ): { position: DocumentPosition; x: number } | null {
    const page = this.getDisplayListByPageId(pageId);
    return page ? moveCaretVertically(page, position, direction, preferredX) : null;
  }

  /** Searches text across the authoritative DocumentModel of all sections. */
  findText(
    query: string,
    options?: { matchCase?: boolean; wholeWord?: boolean },
  ): ModelSearchMatch[] {
    if (!query) return [];
    const flags = options?.matchCase ? 'g' : 'gi';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = options?.wholeWord ? `\\b${escaped}\\b` : escaped;
    const regex = new RegExp(pattern, flags);
    const matches: ModelSearchMatch[] = [];

    this.sections.forEach((section, sectionIndex) => {
      for (const leaf of textNodes(section.model.state.roots)) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(leaf.text)) !== null) {
          matches.push({
            sectionIndex,
            start: { nodeId: leaf.id, offset: match.index },
            end: { nodeId: leaf.id, offset: match.index + match[0].length },
            text: match[0],
          });
          if (!match[0].length) regex.lastIndex++;
        }
      }
    });
    return matches;
  }

  /** Replaces all matches of `query` with `replacement` across all sections in the model. */
  replaceAll(
    query: string,
    replacement: string,
    geometry: PageGeometry,
    options?: { matchCase?: boolean; wholeWord?: boolean },
  ): number {
    const matches = this.findText(query, options);
    if (!matches.length) return 0;
    // Apply from end to start so offsets within the same text node remain valid.
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const section = this.sections[m.sectionIndex];
      section.model.state = applyDocumentOperation(section.model.state, {
        type: 'replaceText',
        selection: { anchor: m.start, focus: m.end },
        text: replacement,
      });
    }
    const touched = new Set(matches.map(m => m.sectionIndex));
    for (const idx of touched) {
      const section = this.sections[idx];
      this.layoutSection(section, sectionGeometryFor(geometry, this.logicalConfigForSectionIndex(idx)), section.pages.map(p => p.id), true);
    }
    return matches.length;
  }

  /** Measures a synthetic DocumentState directly into PageDisplayList[] without any HTML string conversion. */
  measureStateDisplayLists(state: DocumentState, geometry: PageGeometry): PageDisplayList[] {
    const styles = resolveDefaultModelStyles(state, this.defaultStyle);
    return layoutModelDocument(state, geometry, this.measurer, styles, {
      allowOversized: true,
    });
  }

  private layoutSection(
    section: DocumentSectionState,
    geometry: PageGeometry,
    existingPageIds: readonly string[],
    deriveHtml = false,
  ): void {
    const t0 = this.perf.now();
    const state = section.model.state;
    const styles = resolveDefaultModelStyles(state, this.defaultStyle);
    const rawPages = layoutModelDocument(state, geometry, this.measurer, styles, {
      allowOversized: true,
      pageIds: existingPageIds,
    });
    const sel = state.selection;
    const isCollapsed = sel && sel.anchor.nodeId === sel.focus.nodeId && sel.anchor.offset === sel.focus.offset;
    const previousLists = section.displayLists;
    const previousPages = section.pages;

    section.displayLists = rawPages.map((page, index) => {
      const id = existingPageIds[index] ?? `${section.id}-p${index + 1}`;
      const caret = sel ? caretForPosition(page, sel.focus) : undefined;
      const selections = sel && !isCollapsed ? selectionRectsForRange(page, sel) : undefined;
      const prev = previousLists[index];
      // Reuse previous display list reference if commands, caret, and selections are identical
      if (
        prev &&
        prev.id === id &&
        prev.width === page.width &&
        prev.height === page.height &&
        !caret &&
        !prev.caret &&
        !selections?.length &&
        !prev.selections?.length &&
        prev.commands.length === page.commands.length &&
        prev.commands.every((cmd, cIdx) => cmd === page.commands[cIdx])
      ) {
        return prev;
      }
      return {
        ...page,
        id,
        ...(caret ? { caret } : {}),
        ...(selections?.length ? { selections } : {}),
      };
    });

    // Undo/redo can revisit a revision number with different cached HTML.
    // The new display lists always invalidate the derived page projection.
    section.pagesRevision = undefined;
    section.laidOutRevision = state.revision;
    section.geometryKey = geometrySignature(geometry);
    if (deriveHtml) {
      this.deriveSectionPages(section, previousPages);
    }
    this.perf.record('layout', this.perf.now() - t0, textNodes(state.roots).length, section.displayLists.length);
  }

  private deriveSectionPages(section: DocumentSectionState, previousPages = section.pages): void {
    const state = section.model.state;
    const htmlPages = serializeModelPages(state, section.displayLists);
    section.pages = section.displayLists.map((dl, index) => {
      const html = htmlPages[index];
      const breakBefore = index === 0 && section.breakBefore === 'manual' ? ('manual' as const) : undefined;
      const sectionBreak = index === 0 && section.sectionBreak === 'nextPage' ? ('nextPage' as const) : undefined;
      const sectionConfig = index === 0 ? section.sectionConfig : undefined;
      const prevPage = previousPages[index];
      if (
        prevPage &&
        prevPage.id === dl.id &&
        prevPage.html === html &&
        prevPage.breakBefore === breakBefore &&
        prevPage.sectionBreak === sectionBreak &&
        sameSectionConfig(prevPage.sectionConfig, sectionConfig)
      ) {
        return prevPage;
      }
      return {
        id: dl.id,
        html,
        ...(breakBefore ? { breakBefore } : {}),
        ...(sectionBreak ? { sectionBreak } : {}),
        ...(sectionConfig ? { sectionConfig } : {}),
      };
    });
    section.pagesRevision = section.laidOutRevision;
  }
}
