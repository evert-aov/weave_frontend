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
export function joinBoundaryBlocks(left: HTMLElement, right: HTMLElement): boolean {
  if (!left.childNodes.length || !right.childNodes.length) {
    left.appendChild(document.createComment(START));
    left.append(...Array.from(right.childNodes));
    return true;
  }
  const leftBlock = left.lastElementChild as HTMLElement | null;
  const rightBlock = right.firstElementChild as HTMLElement | null;
  const leftList = leftBlock?.matches('ol,ul') ? leftBlock : null;
  const rightList = rightBlock?.matches('ol,ul') ? rightBlock : null;
  const leaf = (block: HTMLElement | null, atStart: boolean): HTMLElement | null => {
    let current = block;
    while (current?.matches('div,li,blockquote,ol,ul')) {
      const nodes = Array.from(current.childNodes).filter(node => node.nodeType !== Node.COMMENT_NODE
        && !(node instanceof Text && !node.data.trim()));
      const edge = atStart ? nodes[0] : nodes.at(-1);
      if (!(edge instanceof HTMLElement) || !edge.matches('p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li,ol,ul')) break;
      current = edge;
    }
    return current;
  };
  const head = leaf(leftBlock, false), tail = leaf(rightBlock, true);
  const textBlocks = 'p,div,h1,h2,h3,h4,h5,h6,blockquote,pre,li';
  const editableTextBlock = (node: HTMLElement | null): node is HTMLElement => !!node
    && node.matches(textBlocks) && !node.closest('[contenteditable="false"]')
    && !node.querySelector('table,ol,ul,video,iframe');
  // Tables and atomic objects are navigation boundaries, not paragraph merges.
  // Reporting failure lets the caller move the caret instead of consuming Delete forever.
  if (!editableTextBlock(head) || !editableTextBlock(tail)) return false;
  if (head.innerHTML.toLowerCase() === '<br>') head.replaceChildren();
  head.appendChild(document.createComment(START));
  if (tail.innerHTML.toLowerCase() !== '<br>') head.append(...Array.from(tail.childNodes));
  let parent = tail.parentElement;
  tail.remove();
  while (parent && parent !== right && !parent.childNodes.length) {
    const next = parent.parentElement; parent.remove(); parent = next;
  }
  if (leftList && rightList && leftList.tagName === rightList.tagName) {
    leftList.append(...Array.from(rightList.childNodes));
    rightList.remove();
  } else if (rightList && !rightList.children.length) rightList.remove();
  left.append(...Array.from(right.childNodes));
  return true;
}

/** Prepare a same-page paragraph/list join without native contenteditable run normalization. */
export function prepareParagraphJoin(body: HTMLElement, backwards: boolean): {
  left: HTMLElement; right: HTMLElement; joined: HTMLElement;
} | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !body.contains(selection.anchorNode)) return null;
  const anchor = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
  let unit = anchor?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div') || null;
  while (unit && unit !== body && caretAtBoundary(unit, backwards)) {
    let adjacent = backwards ? unit.previousSibling : unit.nextSibling;
    while (adjacent && (adjacent.nodeType === Node.COMMENT_NODE || adjacent instanceof Text && !adjacent.data.trim())) {
      adjacent = backwards ? adjacent.previousSibling : adjacent.nextSibling;
    }
    if (adjacent instanceof HTMLElement) {
      const left = backwards ? adjacent : unit, right = backwards ? unit : adjacent;
      const joined = document.createElement('div'), following = document.createElement('div');
      joined.appendChild(left.cloneNode(true)); following.appendChild(right.cloneNode(true));
      return joinBoundaryBlocks(joined, following) ? { left, right, joined } : null;
    }
    if (adjacent) return null;
    const parent: HTMLElement | null = unit.parentElement;
    if (!parent?.matches('li,ul,ol,div,blockquote')) return null;
    unit = parent;
  }
  return null;
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
    if (!node.textContent?.length || node.parentElement?.closest('[contenteditable="false"],[data-word-heading-number]')) continue;
    const before = !!(node.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (backwards && before) candidate = node as Text;
    if (!backwards && !before) { candidate = node as Text; break; }
  }
  if (!candidate) return;
  const parts = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(candidate.data));
  const part = backwards ? parts.at(-1) : parts[0];
  if (part) candidate.deleteData(part.index, part.segment.length);
}
