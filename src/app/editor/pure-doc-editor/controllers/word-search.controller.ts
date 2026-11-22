import {
  applyDomSearchHighlights,
  clearDomSearchHighlights,
  findDocumentText,
} from '../utils/document-formatting';
import { WordSearchAction, WordSearchConfig } from '../components/word-search-panel/word-search-panel.component';
import type { CanvasEditSession } from '../engine/canvas-edit-session';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordSearchControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'documentReady'
  | 'isReadMode'
  | 'pushUndoSnapshot'
  | 'rememberRibbonSelection'
  | 'replacementText'
  | 'searchCase'
  | 'searchMode'
  | 'searchQuery'
  | 'searchStatus'
  | 'searchWholeWord'> & {
    canvasEnabled?: () => boolean;
    canvasEditor?: { session?: CanvasEditSession | null; jump: (idx: number, y?: number) => void; publishNow: () => void; refresh?: () => void };
    scheduleCanvasAutoSave?: () => void;
    updateSelectionFormats?: () => void;
  };
type WordSearchControllerHooks = Pick<WordEditorHooks,
  | 'finishDocumentMutation'
  | 'getActivePageElement'
  | 'liveBodies'
  | 'restoreSelection'
  | 'savedRange'>;

/** Search behavior owned by one editor instance. */
export class WordSearchController {
  constructor(private readonly editor: WordSearchControllerHost, private readonly hooks: WordSearchControllerHooks) {}

  private searchMatchIndex = -1;

  private syncHighlights(refreshStatus = false): void {
    const query = this.editor.searchQuery();
    const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
    if (session && this.editor.canvasEditor) {
      if (!query || !this.editor.searchMode()) {
        session.clearSearchHighlights();
        this.editor.canvasEditor.refresh?.();
        return;
      }
      const matches = session.findMatches(query, this.editor.searchCase(), this.editor.searchWholeWord());
      const clampedIdx = this.searchMatchIndex >= 0 && this.searchMatchIndex < matches.length ? this.searchMatchIndex : -1;
      session.setSearchHighlights(matches, clampedIdx);
      this.editor.canvasEditor.refresh?.();
      if (refreshStatus) {
        this.editor.searchStatus.set(
          matches.length
            ? (clampedIdx >= 0 ? `${clampedIdx + 1} de ${matches.length} coincidencias` : `${matches.length} coincidencias`)
            : 'No se encontraron coincidencias',
        );
      }
      return;
    }

    const bodies = this.hooks.liveBodies();
    if (!query || !this.editor.searchMode()) {
      clearDomSearchHighlights(bodies);
      return;
    }
    clearDomSearchHighlights(bodies);
    const matches = findDocumentText(bodies, query, this.editor.searchCase(), this.editor.searchWholeWord());
    const clampedIdx = this.searchMatchIndex >= 0 && this.searchMatchIndex < matches.length ? this.searchMatchIndex : -1;
    applyDomSearchHighlights(bodies, matches, clampedIdx);
    if (refreshStatus) {
      this.editor.searchStatus.set(
        matches.length
          ? (clampedIdx >= 0 ? `${clampedIdx + 1} de ${matches.length} coincidencias` : `${matches.length} coincidencias`)
          : 'No se encontraron coincidencias',
      );
    }
  }

  openDocumentSearch(mode: 'find' | 'replace'): void {
    this.editor.rememberRibbonSelection();
    const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
    const text = session ? session.selectedText().trim() : window.getSelection()?.toString().trim();
    if (text && text.length <= 200) this.editor.searchQuery.set(text);
    this.editor.searchMode.set(mode); this.searchMatchIndex = -1; this.editor.searchStatus.set('');
    if (this.editor.searchQuery()) {
      this.syncHighlights(true);
    }
  }

  updateSearchConfig(patch: Partial<WordSearchConfig>): void {
    if (patch.query !== undefined) this.editor.searchQuery.set(patch.query);
    if (patch.replacement !== undefined) this.editor.replacementText.set(patch.replacement);
    if (patch.matchCase !== undefined) this.editor.searchCase.set(patch.matchCase);
    if (patch.wholeWord !== undefined) this.editor.searchWholeWord.set(patch.wholeWord);
    this.resetDocumentSearch();
    if (this.editor.searchMode()) {
      this.syncHighlights(Boolean(this.editor.searchQuery()));
    }
  }

  handleSearchAction(action: WordSearchAction): void {
    if (action === 'close') {
      this.searchMatchIndex = -1;
      this.editor.searchMode.set(null);
      const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
      if (session) {
        session.clearSearchHighlights();
        this.editor.canvasEditor?.refresh?.();
      } else {
        clearDomSearchHighlights(this.hooks.liveBodies());
      }
      this.hooks.restoreSelection();
    }
    else if (action === 'next' || action === 'previous') this.findNextMatch(action === 'previous');
    else this.replaceDocumentMatches(action === 'all');
  }

  resetDocumentSearch(): void {
    this.searchMatchIndex = -1;
    this.editor.searchStatus.set('');
    const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
    if (session) {
      session.clearSearchHighlights();
      this.editor.canvasEditor?.refresh?.();
    } else {
      clearDomSearchHighlights(this.hooks.liveBodies());
    }
  }

  findNextMatch(backwards = false): void {
    const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
    if (session && this.editor.canvasEditor) {
      const matches = session.findMatches(this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
      if (!matches.length) {
        session.clearSearchHighlights();
        this.editor.canvasEditor.refresh?.();
        this.editor.searchStatus.set(this.editor.searchQuery() ? 'No se encontraron coincidencias' : 'Escribe el texto que quieres buscar');
        return;
      }
      this.searchMatchIndex = this.searchMatchIndex < 0
        ? (backwards ? matches.length - 1 : 0)
        : (this.searchMatchIndex + (backwards ? -1 : 1) + matches.length) % matches.length;
      const match = matches[this.searchMatchIndex];
      session.setSearchHighlights(matches, this.searchMatchIndex);
      session.selectMatch(match);
      this.editor.activePageIndex.set(match.pageIndex);
      this.editor.canvasEditor.jump(match.pageIndex, match.y);
      this.editor.canvasEditor.refresh?.();
      this.editor.updateSelectionFormats?.();
      this.editor.searchStatus.set(`${this.searchMatchIndex + 1} de ${matches.length} coincidencias`);
      return;
    }

    const bodies = this.hooks.liveBodies();
    clearDomSearchHighlights(bodies);
    const matches = findDocumentText(bodies, this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
    if (!matches.length) { this.editor.searchStatus.set(this.editor.searchQuery() ? 'No se encontraron coincidencias' : 'Escribe el texto que quieres buscar'); return; }
    this.searchMatchIndex = this.searchMatchIndex < 0 ? (backwards ? matches.length - 1 : 0)
      : (this.searchMatchIndex + (backwards ? -1 : 1) + matches.length) % matches.length;
    const match = matches[this.searchMatchIndex];
    const domRange = match.range.cloneRange();
    applyDomSearchHighlights(bodies, matches, this.searchMatchIndex);
    this.editor.activePageIndex.set(match.pageIndex);
    this.hooks.getActivePageElement()?.focus();
    const activeMark = bodies[match.pageIndex]?.querySelector<HTMLElement>('[data-word-search-active="true"]');
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      if (activeMark) {
        const r = document.createRange();
        r.selectNodeContents(activeMark);
        sel.addRange(r);
      } else {
        sel.addRange(domRange);
      }
    }
    this.editor.rememberRibbonSelection();
    (activeMark ?? domRange.startContainer.parentElement)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    this.editor.searchStatus.set(`${this.searchMatchIndex + 1} de ${matches.length} coincidencias`);
  }

  replaceDocumentMatches(all = false): void {
    if (!this.editor.documentReady() || this.editor.isReadMode() || !this.editor.searchQuery()) return;
    const session = this.editor.canvasEnabled?.() ? this.editor.canvasEditor?.session : null;
    if (session && this.editor.canvasEditor) {
      const matches = session.findMatches(this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
      if (!matches.length) {
        session.clearSearchHighlights();
        this.editor.canvasEditor.refresh?.();
        this.editor.searchStatus.set('No se encontraron coincidencias');
        return;
      }
      if (all) {
        const count = session.replaceAllMatches(
          this.editor.searchQuery(),
          this.editor.replacementText(),
          this.editor.searchCase(),
          this.editor.searchWholeWord(),
        );
        session.clearSearchHighlights();
        this.editor.canvasEditor.publishNow();
        this.editor.scheduleCanvasAutoSave?.();
        this.editor.updateSelectionFormats?.();
        this.searchMatchIndex = -1;
        this.editor.searchStatus.set(`${count} reemplazos realizados`);
        return;
      }
      const curSel = session.selection;
      const idx = matches.findIndex(
        m =>
          curSel &&
          m.anchor.nodeId === curSel.anchor.nodeId &&
          m.anchor.offset === curSel.anchor.offset &&
          m.focus.nodeId === curSel.focus.nodeId &&
          m.focus.offset === curSel.focus.offset,
      );
      if (idx < 0) {
        this.findNextMatch();
        return;
      }
      if (session.replaceMatch(matches[idx], this.editor.replacementText())) {
        this.editor.activePageIndex.set(matches[idx].pageIndex);
        this.editor.canvasEditor.publishNow();
        this.editor.canvasEditor.jump(matches[idx].pageIndex, matches[idx].y);
        this.editor.scheduleCanvasAutoSave?.();
        this.editor.updateSelectionFormats?.();
      }
      this.searchMatchIndex = -1;
      this.syncHighlights(false);
      this.editor.searchStatus.set('1 reemplazos realizados');
      return;
    }

    const bodies = this.hooks.liveBodies();
    clearDomSearchHighlights(bodies);
    const matches = findDocumentText(bodies, this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
    if (!matches.length) { this.editor.searchStatus.set('No se encontraron coincidencias'); return; }
    const selection = window.getSelection();
    const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : this.hooks.savedRange;
    const index = matches.findIndex(match => selectedRange && match.range.compareBoundaryPoints(Range.START_TO_START, selectedRange) === 0 && match.range.compareBoundaryPoints(Range.END_TO_END, selectedRange) === 0);
    // Reemplazar primero localiza una coincidencia; nunca modifica texto que el usuario no vio.
    if (!all && index < 0) { this.findNextMatch(); return; }
    this.editor.pushUndoSnapshot();
    const replacements = all ? [...matches].reverse() : [matches[index]];
    for (const match of replacements) {
      match.range.deleteContents();
      const text = document.createTextNode(this.editor.replacementText());
      match.range.insertNode(text);
      match.range.selectNodeContents(text);
    }
    if (!all) {
      const range = replacements[0].range;
      this.editor.activePageIndex.set(replacements[0].pageIndex);
      selection?.removeAllRanges(); selection?.addRange(range);
    }
    this.hooks.finishDocumentMutation();
    this.searchMatchIndex = -1;
    this.editor.searchStatus.set(`${replacements.length} reemplazos realizados`);
  }
}
