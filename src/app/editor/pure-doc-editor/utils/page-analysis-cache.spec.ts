import { describe, expect, it, vi } from 'vitest';
import { WordPageAnalysisCache } from './page-analysis-cache';
import { analyzePageHtmlFast } from './word-editor.utils';

it('analyzes only the changed page in a 200-page document and invalidates indexes after reordering', () => {
  const analyze = vi.fn(analyzePageHtmlFast), cache = new WordPageAnalysisCache(analyze);
  const pages = Array.from({ length: 200 }, (_, i) => ({ id: String(i), html: `<h1>Title ${i}</h1><p>Body text</p>` }));
  pages.forEach((page, index) => cache.get(page, index));
  expect(analyze).toHaveBeenCalledTimes(200);
  analyze.mockClear();
  const edited = pages.map((page, index) => index === 100 ? { ...page, html: '<h1>Changed</h1><p>New text</p>' } : page);
  edited.forEach((page, index) => cache.get(page, index));
  expect(analyze).toHaveBeenCalledTimes(1);
  expect(cache.get(edited[100], 100).headings[0].text).toBe('Changed');
  expect(cache.get(edited[0], 1).headings[0].pageIndex).toBe(1);
  expect(analyze).toHaveBeenCalledTimes(2);
});
