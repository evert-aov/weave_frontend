import type { DocumentLayoutConfig, StyleTemplate } from '../models/word-document.model';
import { escapeAcademicHtml } from './apa-references';

/** APA 7 guide pp. 26–28. 96 CSS px = one inch = 2.54 cm. */
export function apaDocumentLayout(previous: DocumentLayoutConfig, template: StyleTemplate): DocumentLayoutConfig {
  return { ...previous, hyphenation: false, paperFormatId: 'letter', orientation: 'portrait',
    margins: { topPx: 96, rightPx: 96, bottomPx: 96, leftPx: 96, label: 'APA 7 · 2,54 cm' },
    pageColor: '#ffffff', pageBorder: { ...previous.pageBorder, style: 'none' }, showHeaderFooter: true,
    apa: { mode: previous.apa?.mode || 'student', runningHead: (previous.apa?.runningHead || '').toLocaleUpperCase().slice(0, 50),
      fontFamily: template.rules.P.fontFamily, fontSizePt: template.rules.P.fontSizePt } };
}
export function apaHeaderHtml(layout: DocumentLayoutConfig, page: number): string {
  if (!layout.apa) return '';
  const apa = layout.apa, e = escapeAcademicHtml;
  return `<header class="word-apa-header" style="position:absolute;top:48px;left:${layout.margins.leftPx}px;right:${layout.margins.rightPx}px;display:flex;justify-content:space-between;gap:12px;color:#000;background-color:transparent;font-family:${e(apa.fontFamily)};font-size:${apa.fontSizePt}pt;line-height:1;margin:0;padding:0;border:0"><span>${apa.mode === 'professional' ? e(apa.runningHead) : ''}</span><span>${page}</span></header>`;
}
