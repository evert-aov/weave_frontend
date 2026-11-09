import { findDocumentText } from '../utils/document-formatting';
import { WordSearchAction, WordSearchConfig } from '../components/word-search-panel/word-search-panel.component';

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
  | 'searchWholeWord'>;
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

  openDocumentSearch(mode: 'find' | 'replace'): void {
    this.editor.rememberRibbonSelection();
    const text = window.getSelection()?.toString().trim();
    if (text && text.length <= 200) this.editor.searchQuery.set(text);
    this.editor.searchMode.set(mode); this.searchMatchIndex = -1; this.editor.searchStatus.set('');
  }

  updateSearchConfig(patch: Partial<WordSearchConfig>): void {
    if (patch.query !== undefined) this.editor.searchQuery.set(patch.query);
    if (patch.replacement !== undefined) this.editor.replacementText.set(patch.replacement);
    if (patch.matchCase !== undefined) this.editor.searchCase.set(patch.matchCase);
    if (patch.wholeWord !== undefined) this.editor.searchWholeWord.set(patch.wholeWord);
    this.resetDocumentSearch();
  }

  handleSearchAction(action: WordSearchAction): void {
    if (action === 'close') { this.editor.searchMode.set(null); this.hooks.restoreSelection(); }
    else if (action === 'next' || action === 'previous') this.findNextMatch(action === 'previous');
    else this.replaceDocumentMatches(action === 'all');
  }

  resetDocumentSearch(): void { this.searchMatchIndex = -1; this.editor.searchStatus.set(''); }

  findNextMatch(backwards = false): void {
    const matches = findDocumentText(this.hooks.liveBodies(), this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
    if (!matches.length) { this.editor.searchStatus.set(this.editor.searchQuery() ? 'No se encontraron coincidencias' : 'Escribe el texto que quieres buscar'); return; }
    this.searchMatchIndex = this.searchMatchIndex < 0 ? (backwards ? matches.length - 1 : 0)
      : (this.searchMatchIndex + (backwards ? -1 : 1) + matches.length) % matches.length;
    const match = matches[this.searchMatchIndex];
    this.editor.activePageIndex.set(match.pageIndex);
    this.hooks.getActivePageElement()?.focus();
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(match.range);
    this.editor.rememberRibbonSelection();
    match.range.startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    this.editor.searchStatus.set(`${this.searchMatchIndex + 1} de ${matches.length} coincidencias`);
  }

  replaceDocumentMatches(all = false): void {
    if (!this.editor.documentReady() || this.editor.isReadMode() || !this.editor.searchQuery()) return;
    const matches = findDocumentText(this.hooks.liveBodies(), this.editor.searchQuery(), this.editor.searchCase(), this.editor.searchWholeWord());
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
