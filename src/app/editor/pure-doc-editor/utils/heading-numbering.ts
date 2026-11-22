import { HeadingOutlineCounter } from './heading-outline-counter';
import { markDocumentSelection, restoreDocumentSelection } from './document-selection';

const PREFIX = '[data-word-heading-number]';
const HEADINGS = 'h1,h2,h3,h4,h5,h6,p[data-apa-run-in]';

/** Number a single outline across page hosts. Only generated prefixes are mutable. */
export function renumberHeadings(bodies: HTMLElement[], enabled: boolean): boolean {
  const outline = new HeadingOutlineCounter();
  const actions: (() => void)[] = [];
  for (const body of bodies) {
    body.querySelectorAll<HTMLElement>(PREFIX).forEach(prefix => {
      if (!enabled || !prefix.closest(HEADINGS)) actions.push(() => prefix.remove());
    });
    if (!enabled) continue;
    body.querySelectorAll<HTMLElement>(HEADINGS).forEach(heading => {
      const prefixes = Array.from(heading.querySelectorAll<HTMLElement>(PREFIX));
      const walker = document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
      let title = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement?.closest(PREFIX)) title += node.textContent || '';
      }
      const hasTitle = title.replace(/[\u200b-\u200d\ufeff]/g, '').trim().length > 0;
      if (hasTitle && heading.hasAttribute('data-word-chapter') && !heading.hasAttribute('data-word-continuation')) outline.startChapter();
      if (!hasTitle || heading.hasAttribute('data-word-chapter') || heading.hasAttribute('data-word-continuation')) {
        prefixes.forEach(prefix => actions.push(() => prefix.remove())); return;
      }
      const level = heading.hasAttribute('data-apa-run-in')
        ? Math.min(6, Math.max(1, Number(heading.getAttribute('data-apa-run-in')) || 4))
        : Number(heading.tagName.slice(1));
      const oldPrefixLength = outline.chapterPrefixLength(title);
      if (oldPrefixLength) actions.push(() => {
        // Selection bookmarks can split text runs before actions are executed.
        const textWalker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        let remaining = oldPrefixLength;
        for (let node = textWalker.nextNode(); node && remaining; node = textWalker.nextNode()) {
          if (node.parentElement?.closest(PREFIX)) continue;
          const text = node as Text;
          const count = Math.min(remaining, text.data.length);
          text.data = text.data.slice(count);
          remaining -= count;
        }
      });
      title = title.trim();
      const number = outline.next(level, title);
      if (number === null) {
        prefixes.forEach(prefix => actions.push(() => prefix.remove())); return;
      }
      const prefix = prefixes[0];
      prefixes.slice(1).forEach(extra => actions.push(() => extra.remove()));
      const target = heading.querySelector<HTMLElement>('[data-apa-heading-level]') ?? heading;
      if (!prefix || prefix.textContent !== number || prefix.parentElement !== target) actions.push(() => {
        const element = prefix ?? document.createElement('span');
        element.dataset['wordHeadingNumber'] = 'true';
        element.setAttribute('contenteditable','false');
        element.style.cssText = 'font:inherit;color:inherit;white-space:pre;margin-right:0.4em;';
        element.textContent = number;
        if (!prefix || element.parentElement !== target) target.prepend(element);
      });
    });
  }
  if (!actions.length) return false;
  const marked = markDocumentSelection(bodies);
  actions.forEach(action => action());
  if (marked) {
    // A newly inserted prefix is outside the editable title, including its first caret.
    for (const body of bodies) {
      const walker = document.createTreeWalker(body,NodeFilter.SHOW_COMMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent !== 'weave-selection-start') continue;
        const heading = node.parentElement?.closest(HEADINGS);
        const prefix = heading?.querySelector(PREFIX);
        if (prefix && (node.compareDocumentPosition(prefix) & Node.DOCUMENT_POSITION_FOLLOWING)) prefix.after(node);
      }
    }
    restoreDocumentSelection(bodies);
  }
  return true;
}
