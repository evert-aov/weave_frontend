import { markDocumentSelection, restoreDocumentSelection } from './document-selection';

const PREFIX = '[data-word-heading-number]';
const HEADINGS = 'h1,h2,h3,h4,h5,h6';

/** Number a single outline across page hosts. Only generated prefixes are mutable. */
export function renumberHeadings(bodies: HTMLElement[], enabled: boolean): boolean {
  const counters = [0,0,0,0,0,0];
  const actions: (() => void)[] = [];
  for (const body of bodies) {
    body.querySelectorAll<HTMLElement>(PREFIX).forEach(prefix => {
      if (!enabled || !prefix.closest(HEADINGS)) actions.push(() => prefix.remove());
    });
    if (!enabled) continue;
    body.querySelectorAll<HTMLElement>(HEADINGS).forEach(heading => {
      const prefixes = Array.from(heading.querySelectorAll<HTMLElement>(PREFIX));
      if (heading.hasAttribute('data-word-continuation')) {
        prefixes.forEach(prefix => actions.push(() => prefix.remove())); return;
      }
      const level = Number(heading.tagName.slice(1));
      const walker = document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
      let title = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement?.closest(PREFIX)) title += node.textContent || '';
      }
      title = title.trim();
      // Existing imported/written numbering is content, never erase or duplicate it.
      const manual = title.match(/^(\d+(?:\.\d+)*)(?:\.)?\s+/);
      if (manual && manual[1].split('.').length === level) {
        const values = manual[1].split('.').map(Number);
        for (let index = 0; index < level; index++) counters[index] = values[index];
        counters.fill(0,level);
        prefixes.forEach(prefix => actions.push(() => prefix.remove())); return;
      }
      for (let index = 0; index < level - 1; index++) if (!counters[index]) counters[index] = 1;
      counters[level - 1]++; counters.fill(0,level);
      const number = counters.slice(0,level).join('.') + (level === 1 ? '.' : '') + ' ';
      const prefix = prefixes[0];
      prefixes.slice(1).forEach(extra => actions.push(() => extra.remove()));
      if (!prefix || prefix.textContent !== number || prefix.parentElement !== heading) actions.push(() => {
        const element = prefix ?? document.createElement('span');
        element.dataset['wordHeadingNumber'] = 'true';
        element.setAttribute('contenteditable','false');
        element.style.cssText = 'font:inherit;color:inherit;white-space:pre;margin-right:0.4em;';
        element.textContent = number;
        if (!prefix || element.parentElement !== heading) heading.prepend(element);
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
