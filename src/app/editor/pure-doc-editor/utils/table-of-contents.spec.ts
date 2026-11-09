import { describe, expect, it } from 'vitest';
import { rebuildTableOfContents } from './table-of-contents';
import type { DocumentPage, HeadingItem } from '../models/word-document.model';
import { escapeAcademicHtml } from './apa-references';
const build = (headings: HeadingItem[]) => {
  const chunks: string[] = [];
  for (let i = 0; i < Math.max(1, headings.length); i += 2) chunks.push(`<div class="word-toc-page-section">${headings.slice(i, i + 2).map(h => `<div class="word-toc-entry" data-toc-target-id="${escapeAcademicHtml(h.id)}" data-toc-page="${h.pageIndex}">${escapeAcademicHtml(h.text)}<span>${h.pageIndex + 1}</span></div>`).join('')}</div>`);
  return chunks;
};
const page = (id: string, html: string): DocumentPage => ({ id, html });

describe('Rebuild table of contents', () => {
  it('includes new H1–H6, removes stale entries and shifts pages by the actual new TOC length', () => {
    const input = [page('toc', build([{ id: 'gone', text: 'Deleted', level: 1, pageIndex: 1 }])[0]), page('body', '<h1 id="intro">Introducción</h1><h2>Nuevo apartado</h2><h6>Otro</h6><p>Texto</p>')];
    const result = rebuildTableOfContents(input, 1, false, build);
    expect(result.pages).toHaveLength(3);
    expect(result.headings.map(h => h.text)).toEqual(['Introducción', 'Nuevo apartado', 'Otro']);
    expect(result.headings.every(h => h.pageIndex === 2)).toBe(true);
    expect(result.pages.slice(0, 2).every(p => p.breakBefore === 'manual')).toBe(true);
    expect(result.pages[2].html).toContain('<p>Texto</p>');
    expect(result.pages[0].html).toContain('data-toc-page="2"');
    expect(result.pages[0].html).not.toContain('Deleted');
    const again = rebuildTableOfContents(result.pages, 2, false, build);
    expect(again.pages).toHaveLength(3); expect(again.headings.map(h => h.id)).toEqual(result.headings.map(h => h.id));
  });
  it('shrinks an index without leaving empty pages and keeps heading links stable', () => {
    const input = [page('toc1', '<div class="word-toc-page-section">Old 1</div><p><br></p>'), page('toc2', '<div class="word-toc-page-section">Old 2</div>'), page('text', '<h1 id="stable">Único título</h1>')];
    const result = rebuildTableOfContents(input, 2, false, build);
    expect(result.pages).toHaveLength(2); expect(result.headings[0]).toMatchObject({ id: 'stable', pageIndex: 1 });
    expect(result.pages[0].html).toContain('data-toc-page="1"');
  });
  it('updates imported native TOCs and preserves text before and after the index', () => {
    const input = [page('mixed', '<p>Antes</p><div class="toc-block" data-native-word-toc="true">Antiguo</div><h1 id="new">Sección</h1><p>Después</p>')];
    const result = rebuildTableOfContents(input, 0, false, build);
    expect(result.pages).toHaveLength(3); expect(result.index).toBe(1);
    expect(result.pages[0].html).toBe('<p>Antes</p>');
    expect(result.pages[2].html).toContain('<p>Después</p>'); expect(result.headings[0].pageIndex).toBe(2);
  });
  it('does not create an index on update when none exists', () => {
    const input = [page('body', '<h1>Hola</h1>')];
    const result = rebuildTableOfContents(input, 0, false, build);
    expect(result.found).toBe(false); expect(result.pages).toBe(input);
  });
  it('replaces an empty insertion page and excludes continuation fragments and duplicate heading ids', () => {
    const input = [page('empty', '<p><br></p>'), page('body', '<h1 id="dup">Primero</h1><h2 id="dup">Segundo</h2><h2 data-word-continuation="true">continuación</h2>')];
    const result = rebuildTableOfContents(input, 0, true, build);
    expect(result.pages).toHaveLength(2); expect(result.headings).toHaveLength(2);
    expect(new Set(result.headings.map(h => h.id)).size).toBe(2); expect(result.headings[0].pageIndex).toBe(1);
  });
});
