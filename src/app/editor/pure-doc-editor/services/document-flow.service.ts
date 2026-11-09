import { materializeWordLineSpacing } from '../utils/word-line-spacing';
import { prepareNotePages, footnotesForBody } from '../utils/academic-notes';
import { tableCellGrid } from '../utils/table-cell-grid';
import { Injectable } from '@angular/core';
import { DocumentPage } from '../models/word-document.model';

const FLOW = 'data-word-flow';
const CONTINUATION = 'data-word-continuation';
let sequence = 0;

/** A DOM-based paginator. The measuring canvas must have the editor's width and typography. */
@Injectable({ providedIn: 'root' })
export class DocumentFlowService {
  private readonly graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  /** Unchanged manual sections cannot exchange content with an edited section. */
  paginateChangedSections(pages: DocumentPage[], previous: DocumentPage[] | null, canvas: HTMLElement, height: number): DocumentPage[] {
    if (!previous || pages.length !== previous.length || pages.some((page, index) =>
      page.id !== previous[index].id || page.breakBefore !== previous[index].breakBefore)) {
      return this.paginate(pages, canvas, height);
    }
    const result: DocumentPage[] = [];
    for (let start = 0; start < pages.length;) {
      let end = start + 1;
      while (end < pages.length && pages[end].breakBefore !== 'manual') end++;
      const section = pages.slice(start, end);
      const changed = section.map((page, offset) => page.html !== previous[start + offset].html ? offset : -1).filter(offset => offset >= 0);
      if (!changed.length) result.push(...section);
      else if (section.some(page => /data-word-note-id|data-word-note-list/.test(page.html))) {
        // Note numbering and endnotes depend on the complete manual section.
        result.push(...this.paginate(section, canvas, height));
      } else {
        // Start one page earlier so deletion can pull content back. Grow only
        // until the outgoing page is unchanged: the remaining suffix is settled.
        const from = Math.max(0, changed[0] - 1);
        let until = Math.min(section.length, changed[changed.length - 1] + 3);
        let flowed: DocumentPage[];
        for (;;) {
          const window = section.slice(from, until);
          flowed = this.paginate(window, canvas, height);
          const last = flowed.at(-1), original = window.at(-1);
          if (until === section.length || flowed.length === window.length && last?.id === original?.id && last?.html === original?.html) break;
          until = Math.min(section.length, until + Math.max(2, until - from));
        }
        result.push(...section.slice(0, from), ...flowed, ...section.slice(until));
      }
      start = end;
    }
    return result;
  }
  paginate(
    pages: DocumentPage[],
    canvas: HTMLElement,
    height: number,
    measure: () => number = () => Math.max(canvas.getBoundingClientRect().height, canvas.scrollHeight),
  ): DocumentPage[] {
    if (!pages.length || height <= 0) return pages;
    pages = prepareNotePages(pages);
    const result: DocumentPage[] = [];
    const sections: DocumentPage[][] = [];
    for (const page of pages) {
      if (!sections.length || page.breakBefore === 'manual') sections.push([]);
      sections[sections.length - 1].push(page);
    }

    const hasNotes = pages.some(page => page.html.includes('data-word-note-id'));
    const fits = () => {
      const notes = hasNotes ? footnotesForBody(canvas) : null;
      if (notes) canvas.append(notes);
      // clientHeight es entero; dos line boxes de viñeta pueden sumar fracciones
      // que redondean a 1 px extra sin que el texto visible invada el margen.
      const fits = measure() <= height + 1;
      notes?.remove(); return fits;
    };
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
      // Rejoined pages can leave adjacent text nodes. Normalize them before the
      // word-boundary search so a second pagination cannot split the same word
      // differently simply because it crossed an earlier page boundary.
      source.normalize();
      canvas.replaceChildren(source);
      // Resolver sobre el contexto real antes de medir y fragmentar los párrafos.
      if(canvas.classList.contains('word-apa-body'))source.classList.add('word-apa-body');
      materializeWordLineSpacing(source);
      const queue = Array.from(source.childNodes);
      canvas.replaceChildren();
      let sectionPage = 0;
      const flush = () => {
        const notes = hasNotes ? footnotesForBody(canvas) : null; if (notes) canvas.append(notes);
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
        // APA numbers and titles travel with the object (or its first table rows).
        const objectId = node instanceof HTMLElement ? node.dataset['wordObjectId']
          || (node.dataset['apaRole'] !== 'note' ? node.dataset['apaCaptionFor'] : undefined)
          || node.querySelector<HTMLElement>('img[data-word-object-id]')?.dataset['wordObjectId'] : undefined;
        const captions: HTMLElement[] = [];
        let preceding = node.previousSibling;
        while (objectId && preceding instanceof HTMLElement && preceding.dataset['apaCaptionFor'] === objectId
          && ['number', 'title'].includes(preceding.dataset['apaRole'] || '')) {
          captions.unshift(preceding); preceding = preceding.previousSibling;
        }
        const captionOnly = captions.length > 0 && !preceding;
        if (captions.length && preceding) {
          node.remove(); captions.forEach(caption => caption.remove());
          queue.unshift(...captions, node); flush(); continue;
        }
        const tail = node instanceof HTMLElement ? this.splitElement(node, fits) : null;
        if (tail) {
          queue.unshift(tail);
          flush();
        } else if (hadContent && !captionOnly) {
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
    // Metadatos con orden estable, incluso si las notas se regeneran antes de repaginar.
    for (const block of [head,tail]) {
      const spacing=block.dataset['wordLineSpacing'];
      if(spacing){block.removeAttribute('data-word-line-spacing');block.dataset['wordLineSpacing']=spacing;}
    }
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
    const generatedEndnote = !!element.closest('[data-word-note-list="endnote"]');
    if (element.matches('img,br,hr,svg,video,iframe,tr,[data-note-backlink]')
      || !generatedEndnote && (element.matches('[contenteditable="false"]') || element.closest('[contenteditable="false"]'))) return null;
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
      // A Word word can span several formatted runs. Check the whole paragraph,
      // not just the text node that happened to overflow.
      if (element.matches('p,h1,h2,h3,h4,h5,h6,li,blockquote')) {
        const headText = element.textContent || '';
        const tailText = tail.textContent || '';
        if (/\S$/.test(headText) && /^\S/.test(tailText)) {
          const boundary = headText.search(/\S+$/);
          if (boundary === 0) {
            element.append(...Array.from(tail.childNodes));
            return null;
          }
          if (boundary > 0) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            let remaining = boundary;
            let textNode: Node | null;
            while ((textNode = walker.nextNode())) {
              const length = textNode.textContent?.length || 0;
              if (remaining <= length) {
                const range = document.createRange();
                range.selectNodeContents(element);
                range.setStart(textNode, remaining);
                tail.prepend(range.extractContents());
                break;
              }
              remaining -= length;
            }
          }
        }
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
    if (table.tBodies.length !== 1) return null;
    const body = table.tBodies[0];
    const rows = Array.from(body.rows);
    if (rows.length < 2) return null;
    const slots = tableCellGrid(table).cells;
    const offset = rows[0].rowIndex;
    body.replaceChildren();
    let count = 0;
    for (const row of rows) {
      body.appendChild(row);
      if (!fits()) { row.remove(); break; }
      count++;
    }
    if (count && count < rows.length) {
      let boundary = offset + count, previous = -1;
      while (previous !== boundary) {
        previous = boundary;
        for (const slot of slots) if (slot.row < boundary && slot.row + slot.rows > boundary) boundary = slot.row;
      }
      count = Math.max(0, boundary - offset);
      body.replaceChildren(...rows.slice(0, count));
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
