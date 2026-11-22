import type { DocumentPage } from '../models/word-document.model';

/** Editor-generated page fragments become original paragraphs/lists/tables in Word. */
export function joinDocxFlowPages(pages: DocumentPage[]): DocumentPage[] {
  const joined: { page: DocumentPage; root: HTMLElement }[] = [];
  const append = (target: HTMLElement, fragment: HTMLElement): void => {
    while (fragment.firstChild) {
      const first = fragment.firstChild, last = target.lastChild;
      if (first instanceof HTMLElement && last instanceof HTMLElement && first.tagName === last.tagName
        && last.dataset['wordFlow'] && first.dataset['wordContinuation'] === last.dataset['wordFlow']) {
        first.querySelectorAll('[data-word-repeat]').forEach(node => node.remove());
        fragment.removeChild(first); append(last, first);
      } else target.append(first);
    }
  };
  let previousToc = '';
  pages.forEach(page => {
    const fragment = document.createElement('div'); fragment.innerHTML = page.html;
    fragment.querySelectorAll('[data-word-note-list="footnote"]').forEach(node => node.remove());
    Array.from(fragment.childNodes).filter(node => node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()).forEach(node => node.remove());
    const toc = fragment.querySelector<HTMLElement>('.word-toc-page-section[data-word-toc]');
    const group = toc?.dataset['wordToc'] || '';
    const continuationToc = !!group && group === previousToc;
    if (group) {
      if (continuationToc) toc!.querySelectorAll('.word-toc-header').forEach(node => node.remove());
      Array.from(fragment.children).filter(node => node.tagName === 'P' && !node.textContent?.trim() && !node.querySelector('img,svg,table')).forEach(node => node.remove());
    }
    previousToc = group;
    if (!joined.length || (page.breakBefore === 'manual' || page.sectionBreak === 'nextPage') && !continuationToc) joined.push({ page: { ...page }, root: document.createElement('div') });
    append(joined[joined.length - 1].root, fragment);
  });
  return joined.map(({ page, root }) => { root.normalize(); return { ...page, html: root.innerHTML }; });
}
