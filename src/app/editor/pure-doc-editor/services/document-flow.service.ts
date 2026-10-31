import { Injectable } from '@angular/core';
import { DocumentPage } from '../models/word-document.model';

const FLOW = 'data-word-flow';
const CONTINUATION = 'data-word-continuation';
let sequence = 0;

/** A DOM-based paginator. The measuring canvas must have the editor's width and typography. */
@Injectable({ providedIn: 'root' })
export class DocumentFlowService {
  private readonly graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  paginate(
    pages: DocumentPage[],
    canvas: HTMLElement,
    height: number,
    measure: () => number = () => canvas.getBoundingClientRect().height,
  ): DocumentPage[] {
    if (!pages.length || height <= 0) return pages;
    const result: DocumentPage[] = [];
    const sections: DocumentPage[][] = [];
    for (const page of pages) {
      if (!sections.length || page.breakBefore === 'manual') sections.push([]);
      sections[sections.length - 1].push(page);
    }

    const fits = () => measure() <= height + 0.5;
    for (const section of sections) {
      const source = document.createElement('div');
      for (const page of section) {
        const fragment = document.createElement('div');
        fragment.innerHTML = page.html;
        this.appendJoined(source, fragment);
      }
      // Browsers can put text or bare inline elements directly in a contenteditable, without a paragraph wrapper.
      for (const node of Array.from(source.childNodes)) {
        if (node.nodeType === Node.COMMENT_NODE) continue;
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent?.trim() && !node.textContent?.includes('\u00a0')) { node.remove(); continue; }
          const paragraph = document.createElement('p');
          source.replaceChild(paragraph, node);
          paragraph.appendChild(node);
        } else if (node instanceof HTMLElement && node.matches('span, svg, a, strong, em, b, i, u, s, code, sub, sup')) {
          const paragraph = document.createElement('p');
          source.replaceChild(paragraph, node);
          paragraph.appendChild(node);
        }
      }
      const queue = Array.from(source.childNodes);
      canvas.replaceChildren();
      let sectionPage = 0;
      const flush = () => {
        const old = section[sectionPage];
        result.push({
          id: old?.id ?? `flow-page-${Date.now().toString(36)}-${++sequence}`,
          html: canvas.innerHTML || '<p><br></p>',
          ...(sectionPage === 0 && section[0].breakBefore ? { breakBefore: 'manual' as const } : {}),
        });
        sectionPage++;
        canvas.replaceChildren();
      };
      while (queue.length) {
        const node = queue.shift()!;
        const hadContent = this.hasContent(canvas);
        canvas.appendChild(node);
        if (fits()) continue;
        const tail = node instanceof HTMLElement ? this.splitElement(node, fits) : null;
        if (tail) {
          queue.unshift(tail);
          flush();
        } else if (hadContent) {
          node.remove();
          queue.unshift(node);
          flush();
        }
        // An indivisible object taller than a page is retained, never dropped or looped forever.
      }
      if (canvas.childNodes.length || sectionPage === 0) flush();
    }
    canvas.replaceChildren();
    return result;
  }

  /** Reassemble only fragments produced from the same block; unrelated tables/lists stay separate. */
  appendJoined(target: HTMLElement, source: HTMLElement): void {
    while (source.firstChild) {
      const first = source.firstChild;
      const last = target.lastChild;
      // A caret can sit exactly between two fragments, outside either paragraph.
      // Move that bookmark inside the block before joining, preserving the same logical position.
      if (first instanceof Comment && last instanceof HTMLElement) {
        let next: Node | null = first.nextSibling;
        while (next instanceof Comment) next = next.nextSibling;
        if (next instanceof HTMLElement && this.areContinuations(last, next)) {
          last.appendChild(first);
          continue;
        }
      }
      if (last instanceof Comment && first instanceof HTMLElement) {
        const previous = target.lastElementChild as HTMLElement | null;
        if (previous && this.areContinuations(previous, first)) {
          const comments: Comment[] = [];
          while (target.lastChild instanceof Comment) comments.unshift(target.removeChild(target.lastChild));
          previous.append(...comments);
          continue;
        }
      }
      if (first instanceof HTMLElement && last instanceof HTMLElement && this.areContinuations(last, first)) {
        source.removeChild(first);
        first.querySelectorAll('[data-word-repeat]').forEach((node) => node.remove());
        this.appendJoined(last, first);
      } else {
        target.appendChild(first);
      }
    }
  }

  areContinuations(left: HTMLElement, right: HTMLElement): boolean {
    return left.tagName === right.tagName && !!left.getAttribute(FLOW)
      && left.getAttribute(FLOW) === right.getAttribute(CONTINUATION);
  }

  linkContinuation(head: HTMLElement, tail: HTMLElement): void {
    this.markSplit(head, tail);
  }

  private hasContent(element: HTMLElement): boolean {
    return Array.from(element.childNodes).some((node) => node.nodeType !== Node.COMMENT_NODE
      && (node.nodeType !== Node.TEXT_NODE || !!node.textContent?.length));
  }

  private markSplit(head: HTMLElement, tail: HTMLElement): void {
    const id = head.getAttribute(FLOW) ?? `block-${Date.now().toString(36)}-${++sequence}`;
    head.setAttribute(FLOW, id);
    tail.setAttribute(FLOW, id);
    tail.setAttribute(CONTINUATION, id);
    tail.removeAttribute('id');
    if (head.tagName === 'OL') {
      const items = Array.from(head.children).filter((el) => el.tagName === 'LI');
      const start = Number(head.getAttribute('start') ?? 1);
      const step = head.hasAttribute('reversed') ? -1 : 1;
      let ordinal = start;
      for (const item of items) {
        ordinal = Number(item.getAttribute('value') ?? ordinal) + step;
      }
      if (tail.firstElementChild?.hasAttribute(CONTINUATION)) ordinal -= step;
      tail.setAttribute('start', String(ordinal));
    }
  }

  private splitElement(element: HTMLElement, fits: () => boolean): HTMLElement | null {
    if (element.matches('img,br,hr,svg,video,iframe,[contenteditable="false"],tr')
      || element.closest('[contenteditable="false"]')) return null;
    if (element.tagName === 'TABLE') return this.splitTable(element as HTMLTableElement, fits);
    const children = Array.from(element.childNodes);
    if (!children.length) return null;
    const tail = element.cloneNode(false) as HTMLElement;
    element.replaceChildren();
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      element.appendChild(child);
      if (fits()) continue;
      let remainder: Node | null = null;
      if (child instanceof Text) remainder = this.splitText(child, fits);
      else if (child instanceof HTMLElement) remainder = this.splitElement(child, fits);
      if (remainder) {
        tail.appendChild(remainder);
      } else {
        child.remove();
        tail.appendChild(child);
      }
      tail.append(...children.slice(index + 1));
      if (!this.hasContent(element)) {
        element.append(...Array.from(tail.childNodes));
        return null;
      }
      this.markSplit(element, tail);
      return tail;
    }
    return null;
  }

  private splitText(text: Text, fits: () => boolean): Text | null {
    const original = text.data;
    // Seek only the boundaries probed by the binary search. Expanding the entire remainder
    // into a grapheme array for every page makes long paragraphs costly in CPU and memory.
    const segments = this.graphemeSegmenter.segment(original);
    let low = 0;
    let high = original.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const segment = segments.containing(middle - 1)!;
      const end = segment.index + segment.segment.length;
      text.data = original.slice(0, end);
      if (fits()) low = end;
      else high = segment.index;
    }
    let offset = low;
    // Prefer a word boundary, preserving the whitespace itself and every original character.
    let boundary = offset;
    while (boundary > 0 && !/\s/.test(original[boundary - 1])) boundary--;
    if (boundary > 0) offset = boundary;
    if (offset === 0 || offset === original.length) {
      text.data = original;
      return null;
    }
    text.data = original.slice(0, offset);
    return document.createTextNode(original.slice(offset));
  }

  private splitTable(table: HTMLTableElement, fits: () => boolean): HTMLElement | null {
    // Cells spanning rows and individual rows stay intact.
    if (table.querySelector('[rowspan]:not([rowspan="1"])') || table.tBodies.length !== 1) return null;
    const body = table.tBodies[0];
    const rows = Array.from(body.rows);
    if (rows.length < 2) return null;
    body.replaceChildren();
    let count = 0;
    for (const row of rows) {
      body.appendChild(row);
      if (!fits()) { row.remove(); break; }
      count++;
    }
    if (!count || count === rows.length) {
      body.replaceChildren(...rows);
      return null;
    }
    const tail = table.cloneNode(false) as HTMLTableElement;
    for (const child of Array.from(table.children)) {
      if (child === body || child.tagName === 'CAPTION') continue;
      const copy = child.cloneNode(true) as HTMLElement;
      copy.setAttribute('data-word-repeat', 'true');
      tail.appendChild(copy);
    }
    const tailBody = body.cloneNode(false) as HTMLElement;
    tailBody.append(...rows.slice(count));
    tail.appendChild(tailBody);
    this.markSplit(body, tailBody);
    this.markSplit(table, tail);
    return tail;
  }
}
