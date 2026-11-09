import { APA_HEADING_SELECTOR, headingLevel } from './apa-headings';
import type { DocumentPage, HeadingItem } from '../models/word-document.model';

export const TOC_SELECTOR = '.word-toc-page-section,[data-native-word-toc="true"],[data-word-toc]';
const tocTitle = /^(?:índice(?: de contenido)?|contenido|tabla de contenido|table of contents)$/i;
const meaningful = (body: HTMLElement): boolean => !!body.textContent?.replace(/\u00a0/g, ' ').trim() || !!body.querySelector('img,svg,table,video,hr');
function cleanToc(body: HTMLElement): void {
  body.querySelectorAll(TOC_SELECTOR).forEach(node => node.remove());
  body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(node => { if (tocTitle.test(node.textContent?.trim() || '')) node.remove(); });
}

/** Rebuild an existing TOC, preserving any surrounding document content and stable heading IDs. */
export function rebuildTableOfContents(
  pages: DocumentPage[], activeIndex: number, insert: boolean,
  build: (headings: HeadingItem[]) => string[],
): { pages: DocumentPage[]; index: number; headings: HeadingItem[]; found: boolean } {
  const content: DocumentPage[] = [];
  let position = -1, found = false;
  for (const page of pages) {
    const body = document.createElement('div'); body.innerHTML = page.html;
    const first = body.querySelector(TOC_SELECTOR);
    if (!first) { content.push({ ...page }); continue; }
    found = true;
    if (position < 0) {
      const before = document.createRange(); before.selectNodeContents(body); before.setEndBefore(first);
      const prefix = document.createElement('div'); prefix.append(before.cloneContents()); cleanToc(prefix);
      if (meaningful(prefix)) content.push({ ...page, html: prefix.innerHTML });
      position = content.length;
      const after = document.createRange(); after.selectNodeContents(body); after.setStartAfter(first);
      const suffix = document.createElement('div'); suffix.append(after.cloneContents()); cleanToc(suffix);
      if (meaningful(suffix)) content.push({ ...page, id: meaningful(prefix) ? crypto.randomUUID() : page.id, html: suffix.innerHTML });
    } else {
      cleanToc(body);
      if (meaningful(body)) content.push({ ...page, html: body.innerHTML });
    }
  }
  if (!found && !insert) return { pages, index: activeIndex, headings: [], found: false };
  if (position < 0) {
    const index = Math.max(0, Math.min(activeIndex, content.length - 1));
    const body = document.createElement('div'); body.innerHTML = content[index]?.html || '';
    if (!meaningful(body) && content.length) { content.splice(index, 1); position = index; }
    else position = Math.min(index + 1, content.length);
  }
  const headings: HeadingItem[] = [], ids = new Set<string>();
  for (let index = 0; index < content.length; index++) {
    const body = document.createElement('div'); body.innerHTML = content[index].html;
    body.querySelectorAll<HTMLElement>(APA_HEADING_SELECTOR).forEach(heading => {
      if (heading.closest(TOC_SELECTOR) || heading.closest('[data-word-continuation]')) return;
      const text = heading.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!text || tocTitle.test(text)) return;
      if (!heading.id || ids.has(heading.id)) heading.id = `heading-${crypto.randomUUID()}`;
      ids.add(heading.id);
      headings.push({ id: heading.id, text, level: headingLevel(heading), pageIndex: index });
    });
    content[index] = { ...content[index], html: body.innerHTML };
  }
  const count = build(headings).length;
  const shifted = headings.map(h => ({ ...h, pageIndex: h.pageIndex >= position ? h.pageIndex + count : h.pageIndex }));
  const group = crypto.randomUUID();
  const toc = build(shifted).map(html => {
    const body = document.createElement('div'); body.innerHTML = html;
    body.querySelector<HTMLElement>('.word-toc-page-section')?.setAttribute('data-word-toc', group);
    return { id: `toc-${crypto.randomUUID()}`, html: body.innerHTML, breakBefore: 'manual' as const };
  });
  if (content[position]) content[position] = { ...content[position], breakBefore: 'manual' };
  content.splice(position, 0, ...toc);
  return { pages: content, index: position, headings: shifted, found };
}
