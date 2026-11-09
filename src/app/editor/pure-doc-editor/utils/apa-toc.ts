import type { StyleTemplate } from '../models/word-document.model';

/** A neutral TOC compatible with the selected APA typography, without decorative spacing. */
export function styleApaTocHtml(html: string, template: StyleTemplate): string {
  const body = document.createElement('div'); body.innerHTML = html;
  body.querySelectorAll<HTMLElement>('.word-toc-page-section,.word-toc-entry,.word-toc-header,p').forEach(element => {
    Object.assign(element.style, { fontFamily: template.rules.P.fontFamily, fontSize: `${template.rules.P.fontSizePt}pt`,
      lineHeight: '2', color: '#000000', backgroundColor: 'transparent', marginTop: '0pt', marginBottom: '0pt',
      border: 'none', paddingTop: '0pt', paddingRight: '0pt', paddingBottom: '0pt', letterSpacing: 'normal', textTransform: 'none' });
    if (element.classList.contains('word-toc-entry')) element.style.fontWeight = 'normal';
    if (element.classList.contains('word-toc-header')) {
      element.textContent = 'Índice de contenido';
      element.style.fontWeight = 'bold'; element.style.textAlign = 'center'; element.style.paddingLeft = '0pt';
    }
    if (element.tagName === 'P') element.textContent = element.textContent?.replace(/H1[–-]H6/g, 'H1–H5') || '';
  });
  body.querySelectorAll<HTMLElement>('.word-toc-dots').forEach(dots => dots.style.borderBottomColor = '#000000');
  return body.innerHTML;
}
