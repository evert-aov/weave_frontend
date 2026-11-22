import { APA_HEADING_SELECTOR, headingLevel } from './apa-headings';
import type { DocumentPage, HeadingItem } from '../models/word-document.model';

export const TOC_SELECTOR =
  '.word-toc-page-section:not([data-word-list-of]),[data-native-word-toc="true"]:not([data-word-list-of]),[data-word-toc]:not([data-word-list-of])';
export const OBJECT_INDEX_SELECTOR = (kind: 'table' | 'figure'): string =>
  `.word-toc-page-section[data-word-list-of="${kind === 'table' ? 'tables' : 'figures'}"]`;
export const TOC_TITLE_RE = /^(?:índice(?: de contenido)?|contenido|tabla de contenido|table of contents)$/i;
export const TOC_INDENT_STEP_PT = 18;

/** Returns true when HTML contains a heading Table of Contents (excluding table/figure indexes). */
export function hasContentTocHtml(html: string): boolean {
  if (!/(?:word-toc-page-section|data-native-word-toc|data-word-toc=)/.test(html)) return false;
  if (!html.includes('data-word-list-of')) return true;
  if (typeof document !== 'undefined') {
    const host = document.createElement('div');
    host.innerHTML = html;
    return Boolean(host.querySelector(TOC_SELECTOR));
  }
  return /data-native-word-toc|data-word-toc=/.test(html);
}

/** Resolves the top-most heading level present so the shallowest level sits at zero indent. */
export function resolveTocBaseLevel(headings: readonly Pick<HeadingItem, 'level'>[]): number {
  if (!headings.length) return 1;
  return Math.min(...headings.map(h => h.level));
}

/** Computes indentation depth, point offset, and top-level status for a TOC entry. */
export function tocEntryLayout(level: number, baseLevel: number): {
  depth: number;
  indentPt: number;
  isTopLevel: boolean;
} {
  const depth = Math.max(0, level - baseLevel);
  return {
    depth,
    indentPt: depth * TOC_INDENT_STEP_PT,
    isTopLevel: depth === 0,
  };
}
const tocTitle = TOC_TITLE_RE;
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

export interface ObjectIndexEntry {
  id: string;
  label: string;
  pageIndex: number;
}

/** Builds paginated HTML sections for a Table or Figure index (`data-word-list-of="tables" | "figures"`). */
export function buildObjectIndexPagesHtml(
  kind: 'table' | 'figure',
  entries: readonly ObjectIndexEntry[],
  entriesPerPage = 24,
): string[] {
  const listAttr = kind === 'table' ? 'tables' : 'figures';
  const title = kind === 'table' ? 'ÍNDICE DE TABLAS' : 'ÍNDICE DE FIGURAS';
  const emptyMsg =
    kind === 'table'
      ? 'No se encontraron tablas en el documento.'
      : 'No se encontraron figuras o imágenes en el documento.';
  const perPage = Math.max(1, entriesPerPage);
  const slices: ObjectIndexEntry[][] = [];
  if (!entries.length) {
    slices.push([]);
  } else {
    let cursor = 0;
    while (cursor < entries.length) {
      const limit = slices.length === 0 ? Math.max(1, perPage - 2) : perPage;
      slices.push(entries.slice(cursor, cursor + limit));
      cursor += limit;
    }
  }
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return slices.map((slice, sliceIdx) => {
    const header =
      sliceIdx === 0
        ? `<div class="word-toc-header" contenteditable="false">${title}</div>`
        : '';
    const body = slice.length
      ? slice
          .map(item => {
            const p = item.pageIndex + 1;
            return `<div class="word-toc-entry" contenteditable="false" data-toc-target-id="${esc(item.id)}" data-toc-page="${item.pageIndex}" data-toc-level="1" style="padding-left: 0pt; font-weight: 400" title="${esc(item.label)} (Página ${p})"><span class="word-toc-title">${esc(item.label)}</span><span class="word-toc-dots"></span><span class="word-toc-page">${p}</span></div>`;
          })
          .join('')
      : `<p style="text-align: center; color: #64748b; font-style: italic">${emptyMsg}</p>`;
    return `<div class="word-toc-page-section word-object-index-section" contenteditable="false" data-word-list-of="${listAttr}">${header}${body}</div>`;
  });
}

/** Inserts or updates the Table Index or Figure Index across live DOM `DocumentPage`s. */
export function rebuildObjectIndexInDomPages(
  pages: DocumentPage[],
  kind: 'table' | 'figure',
  activeIndex: number,
  insert: boolean,
  entriesPerPage = 24,
): { pages: DocumentPage[]; index: number; entries: ObjectIndexEntry[]; found: boolean } {
  const selector = OBJECT_INDEX_SELECTOR(kind);
  const content: DocumentPage[] = [];
  let position = -1;
  let found = false;

  const stripIndex = (body: HTMLElement) => {
    body.querySelectorAll(selector).forEach(node => node.remove());
  };

  for (const page of pages) {
    const body = document.createElement('div');
    body.innerHTML = page.html;
    const first = body.querySelector(selector);
    if (!first) {
      content.push({ ...page });
      continue;
    }
    found = true;
    if (position < 0) {
      const before = document.createRange();
      before.selectNodeContents(body);
      before.setEndBefore(first);
      const prefix = document.createElement('div');
      prefix.append(before.cloneContents());
      stripIndex(prefix);
      if (meaningful(prefix)) content.push({ ...page, html: prefix.innerHTML });
      position = content.length;
      const after = document.createRange();
      after.selectNodeContents(body);
      after.setStartAfter(first);
      const suffix = document.createElement('div');
      suffix.append(after.cloneContents());
      stripIndex(suffix);
      if (meaningful(suffix)) content.push({ ...page, id: meaningful(prefix) ? crypto.randomUUID() : page.id, html: suffix.innerHTML });
    } else {
      stripIndex(body);
      if (meaningful(body)) content.push({ ...page, html: body.innerHTML });
    }
  }

  if (!found && !insert) return { pages, index: activeIndex, entries: [], found: false };
  if (position < 0) {
    const tocPos = content.findIndex(p => hasContentTocHtml(p.html));
    const figIdxPos = kind === 'table'
      ? content.findIndex(p => p.html.includes('data-word-list-of="figures"'))
      : -1;
    if (tocPos >= 0) {
      let lastToc = tocPos;
      while (lastToc + 1 < content.length && hasContentTocHtml(content[lastToc + 1].html)) lastToc++;
      position = kind === 'figure'
        ? (() => {
            let t = lastToc;
            while (t + 1 < content.length && content[t + 1].html.includes('data-word-list-of="tables"')) t++;
            return t + 1;
          })()
        : lastToc + 1;
    } else if (figIdxPos >= 0) {
      position = figIdxPos;
    } else {
      const idx = Math.max(0, Math.min(activeIndex, content.length - 1));
      const body = document.createElement('div');
      body.innerHTML = content[idx]?.html || '';
      if (!meaningful(body) && content.length) {
        content.splice(idx, 1);
        position = idx;
      } else {
        position = Math.min(idx + 1, content.length);
      }
    }
  }

  const tagSelector = kind === 'table' ? 'table' : 'img';
  const rawObjects: Array<ObjectIndexEntry & { captioned: boolean }> = [];
  const usedIds = new Set<string>();
  const prefixWord = kind === 'table' ? 'Tabla' : 'Figura';

  for (let pIdx = 0; pIdx < content.length; pIdx++) {
    const body = document.createElement('div');
    body.innerHTML = content[pIdx].html;
    const captionByTarget = new Map<string, string>();
    body.querySelectorAll<HTMLElement>('[data-apa-role="title"][data-apa-caption-for]').forEach(cap => {
      const target = cap.dataset['apaCaptionFor'] || '';
      const text = cap.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (target && text) captionByTarget.set(target, text);
    });

    body.querySelectorAll<HTMLElement>(tagSelector).forEach(el => {
      if (el.closest(TOC_SELECTOR) || el.closest('[data-word-list-of]') || el.closest('[data-word-continuation]')) return;
      if (kind === 'table' && el.parentElement?.closest('table')) return;
      let id = el.getAttribute('data-word-object-id') || el.id || '';
      if (!id || usedIds.has(id)) {
        id = `${kind}-${crypto.randomUUID()}`;
        el.setAttribute('data-word-object-id', id);
      }
      if (!el.id) el.id = id;
      usedIds.add(id);

      const figCaption =
        kind === 'figure'
          ? el.closest('figure')?.querySelector('figcaption')?.textContent?.replace(/\s+/g, ' ').trim() || ''
          : el.querySelector('caption')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const rawTitle = (captionByTarget.get(id) || el.getAttribute('data-apa-title') || figCaption || '').trim();
      const captioned = el.getAttribute('data-apa-captioned') === 'true' || Boolean(rawTitle);
      rawObjects.push({ id, label: rawTitle, pageIndex: pIdx, captioned });
    });
    content[pIdx] = { ...content[pIdx], html: body.innerHTML };
  }

  const anyCaptioned = rawObjects.some(o => o.captioned);
  const selected = anyCaptioned ? rawObjects.filter(o => o.captioned) : rawObjects;
  const entries: ObjectIndexEntry[] = selected.map((item, i) => {
    const clean = item.label.replace(new RegExp(`^${prefixWord}\\s+\\d+(?:[:.\\s-]+|$)`, 'i'), '').trim();
    const label = clean ? `${prefixWord} ${i + 1}: ${clean}` : `${prefixWord} ${i + 1}`;
    return { id: item.id, label, pageIndex: item.pageIndex };
  });

  const initialCount = buildObjectIndexPagesHtml(kind, entries, entriesPerPage).length;
  const shifted = entries.map(e => ({ ...e, pageIndex: e.pageIndex >= position ? e.pageIndex + initialCount : e.pageIndex }));
  const builtPages = buildObjectIndexPagesHtml(kind, shifted, entriesPerPage).map(html => ({
    id: `idx-${kind}-${crypto.randomUUID()}`,
    html,
    breakBefore: 'manual' as const,
  }));

  if (content[position]) content[position] = { ...content[position], breakBefore: 'manual' };
  content.splice(position, 0, ...builtPages);
  return { pages: content, index: position, entries: shifted, found };
}
