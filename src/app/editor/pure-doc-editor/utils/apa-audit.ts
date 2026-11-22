import type { DocumentLayoutConfig, DocumentPage } from '../models/word-document.model';
import type { BibliographicSource } from '../models/academic.model';
import type { ApaIssue } from '../models/academic-sections.model';
import { APA_HEADING_SELECTOR, headingLevel } from './apa-headings';
import { wordCount } from './academic-insertion';
import { citationSourceIds } from './apa-references';

/** Checks mechanical APA rules; the meaning and academic quality remain author decisions. */
export function auditApaDocument(pages: DocumentPage[], layout: DocumentLayoutConfig, numbered: boolean, sources: BibliographicSource[]): ApaIssue[] {
  const issues: ApaIssue[] = [], add = (page: number, message: string) => { if (!issues.some(i => i.page === page && i.message === message)) issues.push({ page, message }); };
  if (layout.paperFormatId !== 'letter' || Object.values({ top: layout.margins.topPx, right: layout.margins.rightPx, bottom: layout.margins.bottomPx, left: layout.margins.leftPx }).some(value => value !== 96)) add(0, 'audit_page');
  if (layout.hyphenation) add(0, 'audit_hyphenation');
  if (numbered) add(0, 'audit_numbering');
  let previous = 0;
  const headingRecords: { level: number; page: number }[] = [];
  pages.forEach((page, index) => {
    const hasHeadings = /<h[1-6]/i.test(page.html);
    const hasAuditAttrs = /data-(?:apa|word)/i.test(page.html);
    const hasStyles = /margin/i.test(page.html);
    if (!hasHeadings && !hasAuditAttrs && !hasStyles) return;

    const body = document.createElement('div'); body.innerHTML = page.html;
    if (hasHeadings) {
      body.querySelectorAll<HTMLElement>(APA_HEADING_SELECTOR).forEach(h => {
        if (h.closest('[data-word-continuation],.word-toc-page-section,[data-native-word-toc]')) return;
        const level = headingLevel(h); if (level > 5 || level > previous + 1) add(index, 'audit_hierarchy');
        if (/^\s*(?:\d+[.)]|[IVX]+[.)])\s/.test(h.textContent || '')) add(index, 'audit_typed_numbering');
        previous = level; headingRecords.push({ level, page: index });
      });
      if (/<h[4-6]/i.test(page.html)) {
        body.querySelectorAll<HTMLElement>('h4,h5,h6').forEach(() => add(index, 'audit_run_in'));
      }
    }
    if (hasStyles) {
      body.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5').forEach(p => {
        if (p.closest('[data-word-note-list],[data-apa-section="cover"]')) return;
        if (parseFloat(p.style.marginTop) > 0 || parseFloat(p.style.marginBottom) > 0) add(index, 'audit_spacing');
      });
    }
    if (hasAuditAttrs) {
      body.querySelectorAll<HTMLElement>('[data-apa-role="abstract"]').forEach(p => { if (wordCount(p.textContent || '') < 150 || wordCount(p.textContent || '') > 250) add(index, 'audit_abstract'); });
      body.querySelectorAll<HTMLElement>('[data-word-citation]').forEach(cite => {
        if (citationSourceIds(cite).some(id => !sources.some(s => s.id === id))) add(index, 'audit_missing_source');
        if (cite.closest('[data-apa-quote],[data-apa-short-quote]') && !cite.dataset['locator']) add(index, 'audit_locator');
      });
      body.querySelectorAll<HTMLElement>('[data-apa-captioned="true"]').forEach(object => {
        if (!object.dataset['apaTitle']?.trim()) add(index, 'audit_caption');
        if (object.dataset['apaSource'] && !object.dataset['apaAttribution']?.trim()) add(index, 'audit_attribution');
      });
    }
  });
  for (let i = 0; i < headingRecords.length; i++) {
    const parent = headingRecords[i]; let direct = 0;
    for (let j = i + 1; j < headingRecords.length && headingRecords[j].level > parent.level; j++) if (headingRecords[j].level === parent.level + 1) direct++;
    if (direct === 1) add(parent.page, 'audit_single_heading');
  }
  return issues;
}
