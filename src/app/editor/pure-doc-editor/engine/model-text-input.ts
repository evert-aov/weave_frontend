import { applyDocumentOperation, findNodeById, textNodes } from './document-model';
import { DocumentModelDomAdapter } from './document-model-dom';

function textEndpoint(node: Node | null, offset: number): { node: Text; offset: number } | null {
  if (node instanceof Text) return { node, offset };
  if (!(node instanceof Element) || offset < 0 || offset > node.childNodes.length) return null;
  const next = node.childNodes[offset], previous = node.childNodes[offset - 1];
  for (const [candidate, atEnd] of [[next, false], [previous, true]] as const) {
    if (!candidate) continue;
    if (candidate instanceof Text) {
      if (!atEnd && !candidate.length && previous instanceof Text) return { node: previous, offset: previous.length };
      return { node: candidate, offset: atEnd ? candidate.length : 0 };
    }
    const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
    let found = walker.nextNode() as Text | null;
    if (atEnd) {
      let current: Node | null;
      while ((current = walker.nextNode())) found = current as Text;
    }
    if (found) return { node: found, offset: atEnd ? found.length : 0 };
  }
  return null;
}

const EDITABLE_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote';

/** Transitional input: logical transaction, minimal DOM patch, existing editor save/undo. */
export function applyModelTextInput(body: HTMLElement, event: InputEvent): boolean {
  if (body.getAttribute('contenteditable') !== 'true') return false;
  if (event.defaultPrevented || !event.cancelable || event.isComposing) return false;
  if (!['insertText', 'deleteContentBackward', 'deleteContentForward', 'deleteByCut'].includes(event.inputType)) return false;
  if (event.inputType === 'insertText' && (event.data === null || /[\r\n]/.test(event.data))) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;

  // Handle typing into an empty block (<p><br></p> or <p></p>)
  if (event.inputType === 'insertText' && selection.isCollapsed && selection.anchorNode instanceof HTMLElement) {
    const emptyBlock = selection.anchorNode.closest(EDITABLE_BLOCK_SELECTOR);
    if (
      emptyBlock instanceof HTMLElement &&
      body.contains(emptyBlock) &&
      !emptyBlock.closest('[contenteditable="false"]') &&
      (emptyBlock.childNodes.length === 0 || (emptyBlock.childNodes.length === 1 && emptyBlock.firstElementChild?.tagName === 'BR'))
    ) {
      const textNode = document.createTextNode(event.data!);
      emptyBlock.replaceChildren(textNode);
      window.getSelection()?.setBaseAndExtent(textNode, textNode.length, textNode, textNode.length);
      event.preventDefault();
      body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: event.inputType, data: event.data }));
      return true;
    }
  }

  const anchor = textEndpoint(selection.anchorNode, selection.anchorOffset);
  const focus = textEndpoint(selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return false;
  if (anchor.node.parentElement?.closest('[contenteditable="false"]') || focus.node.parentElement?.closest('[contenteditable="false"]')) return false;
  const block = anchor.node.parentElement?.closest(EDITABLE_BLOCK_SELECTOR);
  if (!(block instanceof HTMLElement) || !body.contains(block) || focus.node.parentElement?.closest(EDITABLE_BLOCK_SELECTOR) !== block) return false;
  // Inline objects and immutable fields require structural transactions.
  if (block.querySelector('img,br,svg,math,[contenteditable="false"],input')) return false;
  const adapter = new DocumentModelDomAdapter();
  try {
    const state = adapter.capture(block);
    const a = adapter.position(anchor.node, anchor.offset), f = adapter.position(focus.node, focus.offset);
    if (!a || !f) return false;
    const range = { anchor: a, focus: f };
    if (selection.isCollapsed && event.inputType !== 'insertText') {
      if (event.inputType === 'deleteByCut') return false;
      const text = anchor.node.data, offset = anchor.offset;
      const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
      if (event.inputType === 'deleteContentBackward') {
        if (!offset) return false;
        range.anchor = { ...range.anchor, offset: segments.containing(offset - 1)!.index };
      } else {
        if (offset === text.length) return false;
        const segment = segments.containing(offset)!;
        range.focus = { ...range.focus, offset: segment.index + segment.segment.length };
      }
    }
    const next = applyDocumentOperation(state, {
      type: 'replaceText',
      selection: range,
      text: event.inputType === 'insertText' ? event.data! : '',
    });
    if (!adapter.applyTextState(state, next)) return false;
    event.preventDefault();
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: event.inputType, data: event.data }));
    return true;
  } catch {
    return false;
  } finally {
    adapter.clear();
  }
}

/**
 * Structural model input handler for paragraph splitting (`insertParagraph`) and
 * cross-block range replacement/merging via `DocumentModel` and `DocumentModelDomAdapter`.
 */
export function applyModelStructuralInput(body: HTMLElement, event: InputEvent): boolean {
  if (body.getAttribute('contenteditable') !== 'true') return false;
  if (event.defaultPrevented || !event.cancelable || event.isComposing) return false;
  if (!['insertParagraph', 'deleteContentBackward', 'deleteContentForward', 'insertText'].includes(event.inputType)) return false;
  if (body.querySelector('img,svg,math,[contenteditable="false"],input,table')) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const adapter = new DocumentModelDomAdapter();
  try {
    const state = adapter.capture(body);
    if (!state.selection) return false;
    const { anchor, focus } = state.selection;
    const isCollapsed = anchor.nodeId === focus.nodeId && anchor.offset === focus.offset;
    let next = state;
    if (event.inputType === 'insertParagraph') {
      if (!isCollapsed) {
        next = applyDocumentOperation(next, { type: 'replaceText', selection: { anchor, focus }, text: '' });
      }
      const splitPos = next.selection?.focus ?? anchor;
      next = applyDocumentOperation(next, { type: 'splitBlock', position: splitPos });
    } else if (!isCollapsed) {
      const replacement = event.inputType === 'insertText' ? (event.data ?? '') : '';
      next = applyDocumentOperation(next, { type: 'replaceText', selection: { anchor, focus }, text: replacement });
    } else {
      // Collapsed boundary deletion between adjacent blocks
      const leaves = textNodes(state.roots);
      const leafIndex = leaves.findIndex(l => l.id === anchor.nodeId);
      if (event.inputType === 'deleteContentBackward' && anchor.offset === 0 && leafIndex > 0) {
        const prevLeaf = leaves[leafIndex - 1];
        next = applyDocumentOperation(next, {
          type: 'replaceText',
          selection: { anchor: { nodeId: prevLeaf.id, offset: prevLeaf.text.length }, focus: anchor },
          text: '',
        });
      } else if (event.inputType === 'deleteContentForward' && leafIndex >= 0 && anchor.offset === leaves[leafIndex].text.length && leafIndex + 1 < leaves.length) {
        const nextLeaf = leaves[leafIndex + 1];
        next = applyDocumentOperation(next, {
          type: 'replaceText',
          selection: { anchor, focus: { nodeId: nextLeaf.id, offset: 0 } },
          text: '',
        });
      } else {
        const targetNode = findNodeById(state.roots, anchor.nodeId);
        if (!targetNode) return false;
        return false;
      }
    }
    if (!adapter.applyState(body, state, next)) return false;
    event.preventDefault();
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: event.inputType, data: event.data }));
    return true;
  } catch {
    return false;
  } finally {
    adapter.clear();
  }
}
