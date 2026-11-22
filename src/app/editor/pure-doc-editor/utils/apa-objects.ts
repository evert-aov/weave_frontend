import type { AcademicObject, CaptionRequest } from '../models/academic.model';
import type { StyleTemplate } from '../models/word-document.model';
import { styleTableElement } from './table-styling-dom';

/** Clear imported fills and colored runs, retaining the colors inside actual illustrations. */
function plainAcademicColors(root: HTMLElement): void {
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    if (element.matches('img,svg') || element.closest('svg')) continue;
    element.removeAttribute('bgcolor'); element.removeAttribute('color');
    element.style.removeProperty('background');
    element.style.backgroundColor = 'transparent'; element.style.backgroundImage = 'none'; element.style.color = '#000000';
    element.style.removeProperty('text-shadow');
  }
}

export function academicObjects(bodies: HTMLElement[]): { element: HTMLElement; object: AcademicObject }[] {
  let table = 0, figure = 0;
  const appendixCounts = new Map<string, { table: number; figure: number }>();
  const appendixTotal = new Set(bodies.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('[data-appendix-id]')).map(el => el.dataset['appendixId']))).size;
  const seen = new Set<string>();
  const titles = new Map(bodies.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('[data-apa-role="title"]'))).map(p => [p.dataset['apaCaptionFor'], p.textContent]));
  return bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('table,img')).flatMap(element => {
    if (element.closest('td,th') && element.tagName === 'TABLE') return [];
    if (element.dataset['wordContinuation']) return [];
    const id = element.dataset['wordObjectId'] ||= crypto.randomUUID();
    if (seen.has(id)) return []; seen.add(id);
    const kind = element.tagName === 'TABLE' ? 'table' : 'figure';
    const title = titles.get(id);
    const numbered = element.dataset['apaCaptioned'] === 'true';
    const appendix = element.closest<HTMLElement>('[data-appendix-id]');
    const prefix = appendix?.dataset['appendixLetter'] || '';
    const count = appendix ? appendixCounts.get(appendix.dataset['appendixId']!) || { table: 0, figure: 0 } : null;
    if (count) appendixCounts.set(appendix!.dataset['appendixId']!, count);
    const number = numbered ? count ? ++count[kind] : kind === 'table' ? ++table : ++figure : 0;
    return [{ element, object: { id, kind, number, prefix, appendixLabel: appendix?.dataset['appendixTableOnly'] === 'true' && kind === 'table' ? appendixTotal === 1 ? 'Apéndice' : `Apéndice ${prefix}` : undefined,
      title: title ?? element.dataset['apaTitle'] ?? '', note: element.dataset['apaNote'] || '',
      sourceId: element.dataset['apaSource'] || '', attribution: element.dataset['apaAttribution'] || '' } }];
  }));
}
export function academicParagraph(element: HTMLElement, template: StyleTemplate, role: string): void {
  plainAcademicColors(element);
  const rule = template.rules.P;
  Object.assign(element.style, { fontFamily: rule.fontFamily, fontSize: `${rule.fontSizePt}pt`, color: '#000000',
    lineHeight: '2', marginTop: '0pt', marginBottom: '0pt', marginLeft: role === 'reference' ? '36pt' : '0pt',
    textIndent: role === 'reference' ? '-36pt' : '0pt', textAlign: role === 'heading' ? 'center' : 'left',
    fontWeight: ['number', 'heading'].includes(role) ? 'bold' : 'normal', fontStyle: role === 'title' ? 'italic' : 'normal', textDecoration: 'none' });
  element.querySelectorAll<HTMLElement>('i,em').forEach(run => run.style.fontStyle = 'italic');
  element.querySelectorAll<HTMLElement>('b,strong').forEach(run => run.style.fontWeight = 'bold');
  if (role.startsWith('cover-')) element.style.textAlign = 'center';
  if (role === 'cover-title') { element.style.fontWeight = 'bold'; element.style.marginBottom = `${rule.fontSizePt * 2}pt`; }
  if (role === 'author-note-heading') { element.style.textAlign = 'center'; element.style.fontWeight = 'bold'; element.style.marginTop = `${rule.fontSizePt * 2}pt`; }
  if (['author-note', 'keywords', 'appendix-body'].includes(role)) element.style.textIndent = '36pt';
  if (role === 'appendix-label' || role === 'appendix-title') { element.style.textAlign = 'center'; element.style.fontWeight = 'bold'; }
  if (role === 'footnote') { element.style.lineHeight = '1'; element.style.fontSize = `${Math.max(8, rule.fontSizePt - 2)}pt`; }
  if (role === 'endnote') element.style.textIndent = '36pt';
}
function styleTable(table: HTMLTableElement, template: StyleTemplate): void {
  if (table.dataset['wordTableBinding'] === 'fixed') return;
  if (template.tableStyle && template.tableStyle.mode !== 'inherit') { styleTableElement(table, template.tableStyle); return; }
  plainAcademicColors(table);
  table.style.backgroundColor = '#ffffff';
  table.querySelectorAll<HTMLElement>('thead,tbody,tfoot,tr,colgroup,col').forEach(element => element.style.border = 'none');
  table.querySelectorAll<HTMLElement>('span,font,b,strong,i,em,a,small,big').forEach(run => {
    run.style.fontFamily = 'inherit'; run.style.fontSize = 'inherit';
    if (run.tagName === 'FONT') { run.removeAttribute('face'); run.removeAttribute('size'); }
  });
  table.dataset['apaTable'] = 'true';
  Object.assign(table.style, { border: 'none', borderCollapse: 'collapse', borderTop: '1px solid #000', borderBottom: '1px solid #000',
    fontFamily: template.rules.P.fontFamily, fontSize: `${template.rules.P.fontSizePt}pt`, lineHeight: '1.1', maxWidth: '100%' });
  for (const row of Array.from(table.rows)) {
    const header = row.parentElement?.tagName === 'THEAD' || row.rowIndex === 0;
    for (const cell of Array.from(row.cells)) {
      Object.assign(cell.style, { border: 'none', borderBottom: header ? '1px solid #000' : 'none',
        borderTop: (row.parentElement?.tagName === 'TFOOT' || cell.dataset['wordTopBorder'] === 'true') ? '1px solid #000' : 'none',
        textAlign: header ? 'center' : 'left', fontFamily: template.rules.P.fontFamily,
        fontSize: `${template.rules.P.fontSizePt}pt`, lineHeight: '1.1', padding: '2px 4px' });
      cell.querySelectorAll<HTMLElement>('p').forEach(p => {
        academicParagraph(p, template, 'body');
        p.style.margin = '0pt';
        p.style.textIndent = '0pt';
        p.style.lineHeight = '1.1';
        p.style.textAlign = cell.style.textAlign;
      });
    }
  }
}
export function academicObjectLabel(object: AcademicObject): string {
  return object.appendixLabel || `${object.kind === 'table' ? 'Tabla' : 'Figura'} ${object.prefix || ''}${object.number || ''}`.trim();
}
function objectNote(object: AcademicObject, template: StyleTemplate): HTMLElement | null {
  if (!object.note.trim() && !object.attribution.trim()) return null;
  const note = document.createElement('p'); note.dataset['apaCaptionFor'] = object.id; note.dataset['apaRole'] = 'note';
  academicParagraph(note, template, 'note'); const label = document.createElement('i'); label.textContent = 'Nota.';
  note.append(label, ` ${[object.note.trim(), object.attribution.trim()].filter(Boolean).join(' ')}`);
  if (object.sourceId) note.dataset['wordSourceId'] = object.sourceId;
  return note;
}
/** Number/title are separate editable paragraphs so the flow engine can paginate tables. */
export function applyApaObjects(bodies: HTMLElement[], template: StyleTemplate, caption?: CaptionRequest): void {
  const items = academicObjects(bodies);
  let tableNumber = 0, figureNumber = 0;
  const appendixCounts = new Map<string, { table: number; figure: number }>();
  const associated = bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-apa-caption-for]')));
  const objectIds = new Set(items.map(item => item.object.id));
  associated.filter(p => !objectIds.has(p.dataset['apaCaptionFor'] || '')).forEach(p => p.remove());
  for (const { element, object } of items) {
    if (element.tagName === 'TABLE') styleTable(element as HTMLTableElement, template);
    else element.style.maxWidth = '100%';
    if (caption?.id === object.id) {
      element.dataset['apaTitle'] = caption.title; element.dataset['apaNote'] = caption.note;
      element.dataset['apaSource'] = caption.sourceId; element.dataset['apaAttribution'] = caption.attribution;
      element.dataset['apaCaptioned'] = 'true';
      Object.assign(object, caption);
    }
    const appendix = element.closest<HTMLElement>('[data-appendix-id]');
    object.prefix = appendix?.dataset['appendixLetter'] || '';
    if (appendix?.dataset['appendixTableOnly'] === 'true' && object.kind === 'table') {
      associated.filter(p => p.dataset['apaCaptionFor'] === object.id).forEach(p => p.remove());
      element.dataset['apaCaptioned'] = 'false';
      const note = objectNote(object, template); if (note) element.after(note); continue;
    }
    if (element.dataset['apaCaptioned'] !== 'true') continue;
    if (appendix) {
      const key = appendix.dataset['appendixId']!;
      const counts = appendixCounts.get(key) || { table: 0, figure: 0 };
      object.number = ++counts[object.kind]; appendixCounts.set(key, counts);
    } else object.number = object.kind === 'table' ? ++tableNumber : ++figureNumber;
    const existing = associated.filter(p => p.dataset['apaCaptionFor'] === object.id);
    if (existing.length && caption?.id !== object.id) {
      existing.forEach(p => {
        if (p.dataset['apaRole'] === 'number') p.textContent = `${object.kind === 'table' ? 'Tabla' : 'Figura'} ${object.prefix}${object.number}`;
        academicParagraph(p, template, p.dataset['apaRole'] || 'note');
      });
      element.dataset['apaTitle'] = object.title;
      continue;
    }
    // An image may share a paragraph with text. Split at the image rather than
    // inserting invalid paragraph children or moving surrounding text.
    if (element.tagName === 'IMG' && element.parentElement?.tagName === 'P') {
      const paragraph = element.parentElement;
      if (paragraph.textContent?.trim() || paragraph.querySelectorAll('img').length > 1) {
        const tail = document.createRange(); tail.setStartAfter(element); tail.setEnd(paragraph, paragraph.childNodes.length);
        const trailing = paragraph.cloneNode(false) as HTMLElement; trailing.append(tail.extractContents());
        trailing.removeAttribute('id');
        const imageParagraph = paragraph.cloneNode(false) as HTMLElement; imageParagraph.removeAttribute('id');
        imageParagraph.append(element); paragraph.after(imageParagraph);
        if (trailing.hasChildNodes()) imageParagraph.after(trailing);
      }
    }
    const anchor = element.tagName === 'IMG' && element.parentElement?.tagName === 'P' ? element.parentElement : element;
    if (anchor !== element) academicParagraph(anchor, template, 'figure');
    associated.filter(p => p.dataset['apaCaptionFor'] === object.id).forEach(p => p.remove());
    const number = document.createElement('p'), title = document.createElement('p');
    for (const [p, role] of [[number, 'number'], [title, 'title']] as const) {
      p.dataset['apaCaptionFor'] = object.id; p.dataset['apaRole'] = role; academicParagraph(p, template, role);
    }
    number.textContent = `${object.kind === 'table' ? 'Tabla' : 'Figura'} ${object.prefix}${object.number}`;
    title.textContent = object.title; if (!object.title) title.append(document.createElement('br'));
    number.style.breakAfter = 'avoid'; title.style.breakAfter = 'avoid';
    anchor.before(number, title);
    const note = objectNote(object, template); if (note) anchor.after(note);
  }
  // Generic paragraph formatting must not replace reference/caption rules.
  bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-apa-role]').forEach(p => academicParagraph(p, template, p.dataset['apaRole']!)));
  const references = academicObjects(bodies);
  bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-word-object-reference]').forEach(span => {
    const object = references.find(item => item.object.id === span.dataset['wordObjectReference'])?.object;
    span.textContent = object ? academicObjectLabel(object) : '[Referencia a objeto eliminado]';
  }));
}
