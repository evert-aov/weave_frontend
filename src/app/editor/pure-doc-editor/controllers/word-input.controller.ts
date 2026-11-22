import { applyModelStructuralInput, applyModelTextInput } from '../engine/model-text-input';
import {
  caretAtBoundary,
  deleteAtContinuation,
  joinBoundaryBlocks,
  markDocumentSelection,
  prepareParagraphJoin,
  withoutSelectionMarkers,
} from '../utils/document-selection';
import { renumberHeadings } from '../utils/heading-numbering';
import { applyScript } from '../utils/home-editing';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordInputControllerHost = Pick<PureDocEditorComponent,
  | 'executeCommand'
  | 'activePageIndex'
  | 'commitPageDomToState'
  | 'formats'
  | 'getPageBody'
  | 'handleGlobalRedo'
  | 'handleGlobalUndo'
  | 'handleInsertPageBreak'
  | 'handleInsertTabCharacter'
  | 'headingNumbering'
  | 'openDocumentSearch'
  | 'pages'
  | 'pushUndoSnapshot'
  | 'updateSelectionFormats'>;
type WordInputControllerHooks = Pick<WordEditorHooks,
  | 'applyActiveListRules'
  | 'collectDocData'
  | 'documentFlow'
  | 'finishDocumentMutation'
  | 'getLivePagesSnapshot'
  | 'liveBodies'
  | 'pendingRenderPages'
  | 'pendingTypingStyle'
  | 'redoStack'
  | 'reflowDocument'
  | 'renderDocumentPages'
  | 'scheduleAutoSave'
  | 'scheduleDocumentFlow'
  | 'undoStack'>;

/** Input behavior owned by one editor instance. */
export class WordInputController {
  constructor(private readonly editor: WordInputControllerHost, private readonly hooks: WordInputControllerHooks) {}

  composing = false;

  lastInputTime = 0;

  private lastInputType = '';

  onPageInput(e: Event, pageIndex: number): void {
    const body = e.currentTarget as HTMLDivElement | null;
    if (body && this.isEmptyEditableBody(body)) this.restoreEmptyEditableParagraph(body);
    if ((e as InputEvent).inputType === 'insertParagraph') {
      const anchor = window.getSelection()?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      const block = element?.closest('li') ?? element?.closest('p,h1,h2,h3,h4,h5,h6,blockquote,div');
      if (block && !block.hasAttribute('data-page-body-id')) block.removeAttribute('data-word-continuation');
      this.hooks.applyActiveListRules();
    }
    if (this.editor.headingNumbering() && renumberHeadings(this.hooks.liveBodies(), true)) {
      this.editor.pages.set(this.hooks.getLivePagesSnapshot().map(page => ({ ...page, html: withoutSelectionMarkers(page.html) })));
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    }
    this.editor.commitPageDomToState(pageIndex);
    this.editor.updateSelectionFormats();
    if (!(e as InputEvent).isComposing) {
      const structural = ['insertParagraph','insertLineBreak'].includes((e as InputEvent).inputType);
      this.hooks.scheduleDocumentFlow(!structural);
    }
  }

  onPageBeforeInput(event: Event, pageIndex: number): void {
    const e = event as InputEvent;
    if (e.isComposing) return;
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      if (e.inputType === 'historyUndo') this.editor.handleGlobalUndo();
      else this.editor.handleGlobalRedo();
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
    if ((e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')
      && this.deleteParagraphBoundary(pageIndex, e.inputType === 'deleteContentBackward')) {
      e.preventDefault(); return;
    }
    if (this.hooks.pendingTypingStyle && e.inputType === 'insertText' && e.data !== null && !this.hooks.pendingRenderPages) {
      const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
      const body = this.editor.getPageBody(this.editor.pages()[pageIndex]?.id);
      if (range && body?.contains(range.startContainer)) {
        e.preventDefault(); this.editor.pushUndoSnapshot();
        range.deleteContents();
        const span = document.createElement('span');
        Object.assign(span.style, this.hooks.pendingTypingStyle);
        const text = document.createTextNode(e.data); span.appendChild(text); range.insertNode(span);
        const position = this.hooks.pendingTypingStyle['verticalAlign'];
        if (position === 'sub' || position === 'super' || position === 'baseline') {
          range.selectNodeContents(text);
          applyScript(this.hooks.liveBodies(),range,position,Number(this.editor.formats().fontSize));
        }
        range.setStart(text, text.length); range.collapse(true);
        window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
        this.hooks.pendingTypingStyle = null;
        this.hooks.finishDocumentMutation(); return;
      }
    }
    const now = Date.now();
    const grouped = ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(e.inputType);
    if (!grouped || this.lastInputType !== e.inputType || now - this.lastInputTime > 800) {
      this.editor.pushUndoSnapshot();
    }
    this.lastInputTime = now;
    this.lastInputType = e.inputType;
    const body = this.editor.getPageBody(this.editor.pages()[pageIndex]?.id);
    if (body && !this.hooks.pendingRenderPages) {
      if (applyModelTextInput(body, e)) return;
      if (['insertParagraph', 'deleteContentBackward', 'deleteContentForward'].includes(e.inputType)) {
        applyModelStructuralInput(body, e);
      }
    }
  }

  onPageCompositionStart(): void {
    this.editor.pushUndoSnapshot();
    this.composing = true;
  }

  onPageCompositionEnd(pageIndex: number): void {
    this.composing = false;
    this.editor.commitPageDomToState(pageIndex);
    this.hooks.scheduleDocumentFlow();
  }

  private deleteAcrossPageBoundary(pageIndex: number, backwards: boolean): boolean {
    const page = this.editor.pages()[pageIndex];
    const body = page && this.editor.getPageBody(page.id);
    if (!body || !caretAtBoundary(body, backwards)) return false;
    const leftIndex = backwards ? pageIndex - 1 : pageIndex;
    const pages = this.hooks.getLivePagesSnapshot();
    if (leftIndex < 0 || leftIndex + 1 >= pages.length) return false;
    const liveLeft = this.editor.getPageBody(pages[leftIndex].id);
    const liveRight = this.editor.getPageBody(pages[leftIndex + 1].id);
    if (!liveLeft || !liveRight) return false;
    // Join detached copies so a whole following page is never painted below the current sheet.
    const left = liveLeft.cloneNode(true) as HTMLElement;
    const right = liveRight.cloneNode(true) as HTMLElement;
    const manual = pages[leftIndex + 1].breakBefore === 'manual';
    const head = left.lastElementChild?.matches('ol,ul') ? left.lastElementChild.lastElementChild : left.lastElementChild;
    const tail = right.firstElementChild?.matches('ol,ul') ? right.firstElementChild.firstElementChild : right.firstElementChild;
    const continued = !!head && !!tail && this.hooks.documentFlow.areContinuations(head as HTMLElement, tail as HTMLElement);
    if (!manual && !joinBoundaryBlocks(left, right)) {
      // Preserve table/atomic structure and hand the next deletion to the browser
      // on the adjacent side, rather than repeatedly rebuilding identical pages.
      const target = backwards ? liveLeft : liveRight;
      target.focus({ preventScroll: true });
      this.editor.activePageIndex.set(backwards ? leftIndex : leftIndex + 1);
      const caret = document.createRange();
      caret.selectNodeContents(target); caret.collapse(!backwards);
      window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(caret);
      this.lastInputTime = 0;
      return true;
    }
    this.editor.pushUndoSnapshot();
    this.lastInputTime = 0;
    if (manual) {
      markDocumentSelection(this.hooks.liveBodies());
      left.innerHTML = liveLeft.innerHTML;
      right.innerHTML = liveRight.innerHTML;
      delete pages[leftIndex + 1].breakBefore;
      pages[leftIndex].html = left.innerHTML;
      pages[leftIndex + 1].html = right.innerHTML;
    } else {
      if (continued) deleteAtContinuation(left, backwards);
      pages[leftIndex].html = left.innerHTML;
      pages.splice(leftIndex + 1, 1);
    }
    // Pagination and publication form one transaction at a physical page boundary.
    if (!this.hooks.reflowDocument(pages)) {
      this.hooks.renderDocumentPages(pages);
      this.hooks.scheduleDocumentFlow();
    }
    return true;
  }

  private deleteParagraphBoundary(pageIndex: number, backwards: boolean): boolean {
    const page = this.editor.pages()[pageIndex], body = page && this.editor.getPageBody(page.id);
    if (!body || this.hooks.pendingRenderPages) return false;
    const plan = prepareParagraphJoin(body, backwards);
    if (!plan) return false;
    this.editor.pushUndoSnapshot(); this.lastInputTime = 0;
    plan.left.replaceWith(...Array.from(plan.joined.childNodes));
    plan.right.remove();
    this.hooks.finishDocumentMutation();
    return true;
  }

  onPageKeyDown(e: KeyboardEvent, pageIndex: number): void {
    if (e.isComposing) return;
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&['b','i'].includes(e.key.toLowerCase())){
      const body=this.editor.getPageBody(this.editor.pages()[pageIndex]?.id);
      if(body?.getAttribute('contenteditable')==='true'){
        e.preventDefault();this.editor.executeCommand(e.key.toLowerCase()==='b'?'bold':'italic');return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && ['f','h'].includes(e.key.toLowerCase())) {
      e.preventDefault(); this.editor.openDocumentSearch(e.key.toLowerCase() === 'h' ? 'replace' : 'find'); return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Backspace','Delete'].includes(e.key)) this.hooks.pendingTypingStyle = null;
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
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey
      && this.deleteParagraphBoundary(pageIndex, e.key === 'Backspace')) {
      e.preventDefault(); return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) this.lastInputTime = 0;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const backwards = e.key === 'ArrowLeft';
      const body = this.editor.getPageBody(this.editor.pages()[pageIndex]?.id);
      const adjacent = this.editor.pages()[pageIndex + (backwards ? -1 : 1)];
      const target = adjacent && this.editor.getPageBody(adjacent.id);
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
      this.editor.handleInsertPageBreak();
      return;
    }
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      if (e.shiftKey) {
        if (this.hooks.redoStack.length > 0) {
          e.preventDefault();
          this.editor.handleGlobalRedo();
          return;
        }
      } else if (this.hooks.undoStack.length > 0) {
        e.preventDefault();
        this.editor.handleGlobalUndo();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      if (this.hooks.redoStack.length > 0) {
        e.preventDefault();
        this.editor.handleGlobalRedo();
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.editor.handleInsertTabCharacter();
    }
  }

  private clearEntirelySelectedPage(pageIndex: number): boolean {
    const selection = window.getSelection();
    const page = this.editor.pages()[pageIndex];
    const body = page && this.editor.getPageBody(page.id);
    if (!selection?.rangeCount || selection.isCollapsed || !body) return false;
    const selectedRange = selection.getRangeAt(0);
    if (!body.contains(selectedRange.startContainer) || !body.contains(selectedRange.endContainer)) return false;

    const bodyRange = document.createRange();
    bodyRange.selectNodeContents(body);
    // Compare the body boundary points against the selection's boundaries.
    const coversBody = selectedRange.compareBoundaryPoints(Range.START_TO_START, bodyRange) <= 0
      && selectedRange.compareBoundaryPoints(Range.END_TO_END, bodyRange) >= 0;
    if (!coversBody) return false;

    this.editor.pushUndoSnapshot();
    this.restoreEmptyEditableParagraph(body);
    const paragraph = body.firstElementChild!;
    const caret = document.createRange();
    caret.setStart(paragraph, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    this.hooks.finishDocumentMutation();
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
}
