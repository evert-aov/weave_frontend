import type { StyleTemplate } from '../models/word-document.model';

/** Lists keep their semantic structure, numbering starts, inline emphasis and text. */
export function applyTemplateLists(bodies: HTMLElement[], template: StyleTemplate, preserveMarker = true): void {
  if (!template.listRules) return;
  const normal = template.rules.P;
  bodies.forEach(body => body.querySelectorAll<HTMLElement>('ol,ul').forEach(list => {
    const rule = template.listRules![list.tagName === 'OL' ? 'ordered' : 'unordered'];
    const marker = preserveMarker && list.style.listStyleType ? list.style.listStyleType : rule.marker;
    Object.assign(list.style, {
      fontFamily: normal.fontFamily, fontSize: `${normal.fontSizePt}pt`, color: normal.color,
      textAlign: 'left', lineHeight: String(rule.lineHeight), textIndent: '0pt',
      marginTop: '0pt', marginBottom: '0pt', marginLeft: `${rule.indentLeftPt - rule.hangingIndentPt}pt`,
      paddingLeft: `${rule.hangingIndentPt}pt`, listStylePosition: 'outside', listStyleType: marker,
    });
    list.dataset['wordListIndent'] = String(rule.indentLeftPt);
    list.dataset['wordListHanging'] = String(rule.hangingIndentPt);
    list.querySelectorAll<HTMLElement>(':scope > li').forEach(item => {
      item.dataset['wordLineSpacing']=String(rule.lineHeight);
      const existingMarginLeft = item.style.marginLeft?.trim();
      const preservedMarginLeft =
        existingMarginLeft && parseFloat(existingMarginLeft) > 0 ? existingMarginLeft : '0pt';
      Object.assign(item.style, {
        fontFamily: normal.fontFamily, fontSize: `${normal.fontSizePt}pt`, color: normal.color,
        textAlign: 'left', lineHeight: String(rule.lineHeight), textIndent: '0pt',
        marginLeft: preservedMarginLeft, marginRight: '0pt', marginTop: `${rule.spaceBeforePt}pt`, marginBottom: `${rule.spaceAfterPt}pt`,
      });
      // Imported DOCX can keep the font on every run rather than on the LI/P.
      // Normalize typography, without removing emphasis, citations or characters.
      item.querySelectorAll<HTMLElement>('span,font,b,strong,i,em,u,s,strike,a,small,big').forEach(run => {
        run.style.fontFamily = 'inherit';
        run.style.fontSize = 'inherit';
        run.style.lineHeight = 'inherit';
        if (run.tagName === 'FONT') ['face', 'size'].forEach(attribute => run.removeAttribute(attribute));
      });
      item.querySelectorAll<HTMLElement>(':scope > p, :scope > div').forEach(paragraph => {
        paragraph.dataset['wordLineSpacing']=String(rule.lineHeight);
        Object.assign(paragraph.style, { fontFamily: 'inherit', fontSize: 'inherit', textIndent: '0pt', marginLeft: '0pt', marginRight: '0pt',
          marginTop: '0pt', marginBottom: '0pt', lineHeight: String(rule.lineHeight), textAlign: 'left' });
      });
    });
  }));
}
