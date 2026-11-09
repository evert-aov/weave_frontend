import { HeadingItem, TableItem } from '../models/word-document.model';
import { formatCleanHeadingTitle } from '../services/word-compatibility.service';

export function analyzePageHtmlFast(
  html: string,
  pageIndex: number
): {
  headings: HeadingItem[];
  tables: TableItem[];
  words: number;
  chars: number;
  paragraphs: number;
} {
  const headings: HeadingItem[] = [];
  const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  let hIdx = 0;

  while ((match = headingRegex.exec(html)) !== null) {
    hIdx++;
    const level = parseInt(match[1], 10) || 1;
    const attrs = match[2] || '';
    const innerHtml = match[3] || '';
    if (/\bdata-word-continuation\s*=/.test(attrs)) continue;
    const rawText = innerHtml
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    const cleanText = formatCleanHeadingTitle(rawText);

    if (!cleanText || cleanText.toUpperCase().includes('ÍNDICE DE CONTENIDO')) continue;

    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : `doc-heading-p${pageIndex + 1}-${hIdx}`;

    const sizeMatch = (attrs + innerHtml).match(/font-size:\s*([\d.]+)pt/i);
    headings.push({
      id,
      text: cleanText,
      level,
      pageIndex,
      fontSizePt: sizeMatch ? Number(sizeMatch[1]) : undefined,
    });
  }

  if (html.includes('data-apa-heading-level')) {
    // Only pages with run-in headings need DOM parsing; other pages retain the fast path.
    const root = document.createElement('div'); root.innerHTML = html; headings.length = 0;
    root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[data-apa-heading-level]').forEach((heading, index) => {
      if (heading.closest('[data-word-continuation],.word-toc-page-section,[data-native-word-toc]')) return;
      const text = formatCleanHeadingTitle(heading.textContent || '');
      if (text) headings.push({ id: heading.id || `doc-heading-p${pageIndex + 1}-${index + 1}`, text, level: Number(heading.dataset['apaHeadingLevel'] || heading.tagName.slice(1)), pageIndex });
    });
  }

  const tables: TableItem[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch: RegExpExecArray | null;
  let tIdx = 0;

  while ((tMatch = tableRegex.exec(html)) !== null) {
    const tableInner = tMatch[1] || '';
    const rowMatches = tableInner.match(/<tr\b/gi) || [];
    const rowsCount = rowMatches.length;

    const firstRowMatch = tableInner.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const firstRowInner = firstRowMatch ? firstRowMatch[1] : '';
    const colMatches = firstRowInner.match(/<(?:th|td)\b/gi) || [];
    const colsCount = Math.max(1, colMatches.length);

    const firstRowText = firstRowInner
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    tables.push({
      id: `doc-table-p${pageIndex + 1}-${tIdx + 1}`,
      title: firstRowText
        ? firstRowText.slice(0, 65)
        : `Tabla ${tIdx + 1} (Página ${pageIndex + 1})`,
      rows: rowsCount,
      cols: colsCount,
      pageIndex,
      tableIndexInPage: tIdx,
    });
    tIdx++;
  }

  const plainText = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#9;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = plainText ? plainText.split(' ').length : 0;
  const chars = plainText.length;
  const paragraphs = (html.match(/<(?:p|h[1-6]|li)\b/gi) || []).length;

  return { headings, tables, words, chars, paragraphs };
}

export function getActualContentBottomPx(containerEl: HTMLElement): number {
  const lastChild = containerEl.lastElementChild as HTMLElement | null;
  if (!lastChild) return 0;
  const containerRect = containerEl.getBoundingClientRect();
  const lastRect = lastChild.getBoundingClientRect();
  if (containerRect.height === 0) return 0;
  return lastRect.bottom - containerRect.top;
}
