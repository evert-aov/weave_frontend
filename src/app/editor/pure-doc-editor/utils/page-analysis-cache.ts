import type { DocumentPage } from '../models/word-document.model';
import { analyzePageHtmlFast } from './word-editor.utils';

/** Page objects are immutable; edits replace just the changed page. Index affects heading IDs. */
export class WordPageAnalysisCache {
  private readonly pages = new WeakMap<DocumentPage, { index: number; html: string; result: ReturnType<typeof analyzePageHtmlFast> }>();
  constructor(private readonly analyze = analyzePageHtmlFast) {}

  get(page: DocumentPage, index: number): ReturnType<typeof analyzePageHtmlFast> {
    const cached = this.pages.get(page);
    if (cached?.index === index && cached.html === page.html) return cached.result;
    const result = this.analyze(page.html, index);
    this.pages.set(page, { index, html: page.html, result });
    return result;
  }
}
