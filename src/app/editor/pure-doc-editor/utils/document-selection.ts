const START = 'weave-selection-start';
const END = 'weave-selection-end';

/** Comments move with the HTML fragments but never become saved document content. */
export function markDocumentSelection(bodies: HTMLElement[]): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!bodies.some((body) => body.contains(range.startContainer))
    || !bodies.some((body) => body.contains(range.endContainer))) return false;
  let endMarker: Comment | null = null;
  if (!range.collapsed) {
    const end = range.cloneRange();
    end.collapse(false);
    endMarker = document.createComment(END);
    end.insertNode(endMarker);
  }
  const start = range.cloneRange();
  start.collapse(true);
  const startMarker = document.createComment(START);
  start.insertNode(startMarker);
  // DOM insertions can retarget the live selection at an element boundary. Rebuild
  // from the markers so subsequent commands keep the complete multi-page range.
  const marked = document.createRange();
  marked.setStartAfter(startMarker);
  if (endMarker) marked.setEndBefore(endMarker);
  else marked.collapse(true);
  selection.removeAllRanges();
  selection.addRange(marked);
  return true;
}

export function restoreDocumentSelection(bodies: HTMLElement[]): HTMLElement | null {
  let start: Comment | null = null;
  let end: Comment | null = null;
  let startBody: HTMLElement | null = null;
  for (const body of bodies) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent === START) { start = node as Comment; startBody = body; }
      if (node.textContent === END) end = node as Comment;
    }
  }
  if (!start) { end?.remove(); return null; }
  const range = document.createRange();
  range.setStartBefore(start);
  if (end) range.setEndBefore(end);
  else range.collapse(true);
  startBody?.focus({ preventScroll: true });
  start.remove();
  end?.remove();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return startBody;
}

export function withoutSelectionMarkers(html: string): string {
  return html.replace(/<!--weave-selection-(?:start|end)-->/g, '');
}

export function caretAtBoundary(body: HTMLElement, atStart: boolean): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !body.contains(selection.anchorNode)) return false;
  let node = selection.anchorNode!;
  let offset = selection.anchorOffset;
  const ignorable = (child: Node, parent: Node) => child.nodeType === Node.COMMENT_NODE
    || (child instanceof HTMLElement && child.hasAttribute('data-word-heading-number'))
    || (child instanceof Text && !child.length)
    || (child instanceof HTMLBRElement && parent instanceof HTMLElement
      && parent.matches('p,div,li') && parent.childNodes.length === 1);
  while (true) {
    if (node instanceof Text) {
      if (atStart ? offset !== 0 : offset !== node.length) return false;
    } else {
      const children = Array.from(node.childNodes);
      const between = atStart ? children.slice(0, offset) : children.slice(offset);
      if (between.some((child) => !ignorable(child, node))) return false;
    }
    if (node === body) return true;
    const parent = node.parentNode;
    if (!parent) return false;
    const index = Array.from(parent.childNodes).indexOf(node as ChildNode);
    offset = atStart ? index : index + 1;
    node = parent;
  }
}

/** Join the adjacent paragraphs at a physical page boundary, with a caret at their seam. */
export function joinBoundaryBlocks(left: HTMLElement, right: HTMLElement): void {
  let head = left.lastElementChild as HTMLElement | null;
  let tail = right.firstElementChild as HTMLElement | null;
  const marker = document.createComment(START);
  const textBlocks = 'p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li';
  if (head?.matches('ol,ul') && tail?.tagName === head.tagName) {
    const headList = head;
    const tailList = tail;
    head = headList.lastElementChild as HTMLElement | null;
    tail = tailList.firstElementChild as HTMLElement | null;
    if (head && tail) {
      head.appendChild(marker);
      if (head.innerHTML === '<br><!--weave-selection-start-->') head.firstChild?.remove();
      head.append(...Array.from(tail.childNodes));
      tail.remove();
      headList.append(...Array.from(tailList.childNodes));
      tailList.remove();
    }
  } else if (head?.matches(textBlocks) && tail?.matches(textBlocks)) {
    if (head.innerHTML.toLowerCase() === '<br>') head.replaceChildren();
    head.appendChild(marker);
    if (tail.innerHTML.toLowerCase() !== '<br>') head.append(...Array.from(tail.childNodes));
    tail.remove();
  } else {
    left.appendChild(marker);
  }
  left.append(...Array.from(right.childNodes));
}

/** Remove one grapheme at the seam of a paragraph continued on the next page. */
export function deleteAtContinuation(body: HTMLElement, backwards: boolean): void {
  const comments = document.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  let marker: Node | null = null;
  while ((marker = comments.nextNode())) if (marker.textContent === START) break;
  if (!marker) return;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let candidate: Text | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.length) continue;
    const before = !!(node.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (backwards && before) candidate = node as Text;
    if (!backwards && !before) { candidate = node as Text; break; }
  }
  if (!candidate) return;
  const parts = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(candidate.data));
  const part = backwards ? parts.at(-1) : parts[0];
  if (part) candidate.deleteData(part.index, part.segment.length);
}
