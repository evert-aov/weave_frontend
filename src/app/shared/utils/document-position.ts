import { DocumentCaretPoint, DocumentPosition } from '../../core/services/document-history.service';

function editableForPoint(host: HTMLElement, point: DocumentCaretPoint): HTMLElement | null {
  const selector = point.kind === 'page' ? '[data-page-body-id]' : '[data-block-id]';
  const attribute = point.kind === 'page' ? 'data-page-body-id' : 'data-block-id';
  const container = Array.from(host.querySelectorAll<HTMLElement>(selector)).find((el) => el.getAttribute(attribute) === point.id);
  if (!container) return null;
  return point.kind === 'page' ? container : container.querySelector<HTMLElement>('[contenteditable]');
}

function caretPoint(host: HTMLElement, node: Node | null, offset: number): DocumentCaretPoint | undefined {
  const element = node instanceof Element ? node : node?.parentElement;
  const page = element?.closest<HTMLElement>('[data-page-body-id]');
  const block = element?.closest<HTMLElement>('[data-block-id]');
  const container = page ?? block;
  if (!node || !container || !host.contains(container)) return undefined;
  const editable = page ?? block?.querySelector<HTMLElement>('[contenteditable]');
  if (!editable?.contains(node)) return undefined;
  const prefix = document.createRange();
  prefix.selectNodeContents(editable); prefix.setEnd(node, offset);
  return { kind: page ? 'page' : 'block', id: container.getAttribute(page ? 'data-page-body-id' : 'data-block-id')!, offset: prefix.toString().length };
}

export function captureDocumentPosition(host: HTMLElement): DocumentPosition {
  const selection = window.getSelection();
  const scroller = host.querySelector<HTMLElement>('[data-document-scroll]');
  return {
    anchor: caretPoint(host, selection?.anchorNode ?? null, selection?.anchorOffset ?? 0),
    focus: caretPoint(host, selection?.focusNode ?? null, selection?.focusOffset ?? 0),
    scrollTop: scroller?.scrollTop ?? 0, scrollLeft: scroller?.scrollLeft ?? 0,
  };
}

function resolvePoint(element: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return { node: element, offset: element.childNodes.length };
}

/** Devuelve false mientras Angular o el motor del documento todavía no montaron el destino. */
export function restoreDocumentPosition(host: HTMLElement, position: DocumentPosition): boolean {
  const scroller = host.querySelector<HTMLElement>('[data-document-scroll]');
  if (!scroller || scroller.getAttribute('data-word-ready') === 'false') return false;
  if (position.anchor && position.focus) {
    const anchor = editableForPoint(host, position.anchor);
    const focus = editableForPoint(host, position.focus);
    if (!anchor || !focus) return false;
    const start = resolvePoint(anchor, position.anchor.offset);
    const end = resolvePoint(focus, position.focus.offset);
    anchor.focus({ preventScroll: true });
    window.getSelection()?.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
  }
  scroller.scrollTop = position.scrollTop; scroller.scrollLeft = position.scrollLeft;
  return true;
}

export function documentAnchorAtSelection(host: HTMLElement): HTMLAnchorElement | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const node = selection.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  const anchor = element?.closest<HTMLAnchorElement>('a[href]');
  return anchor && host.contains(anchor) ? anchor : null;
}
