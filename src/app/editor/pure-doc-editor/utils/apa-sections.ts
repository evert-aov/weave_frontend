import type { DocumentPage, StyleTemplate } from '../models/word-document.model';
import type { AbstractRequest, CoverRequest } from '../models/academic-sections.model';
import { academicParagraph } from './apa-objects';

export function sectionParagraph(text: string, role: string, template: StyleTemplate): HTMLParagraphElement {
  const p = document.createElement('p'); p.dataset['apaRole'] = role; p.textContent = text;
  academicParagraph(p, template, role); return p;
}
export function coverSection(request: CoverRequest, template: StyleTemplate): string {
  const root = document.createElement('div'); root.dataset['apaSection'] = 'cover'; root.style.paddingTop = '64px';
  root.append(sectionParagraph(request.title, 'cover-title', template));
  for (const [value, role] of [[request.authors, 'cover-author'], [request.affiliations, 'cover-affiliation'],
    [request.course, 'cover-detail'], [request.instructor, 'cover-detail'], [request.date, 'cover-detail']] as const) {
    if (request.professional && role === 'cover-detail' && value !== request.date) continue;
    value.split('\n').filter(line => line.trim()).forEach(line => root.append(sectionParagraph(line.trim(), role, template)));
  }
  if (request.professional && request.authorNote.trim()) {
    root.append(sectionParagraph('Nota del autor', 'author-note-heading', template));
    request.authorNote.split(/\n+/).filter(Boolean).forEach(line => root.append(sectionParagraph(line, 'author-note', template)));
  }
  return root.outerHTML;
}
export function abstractSection(request: AbstractRequest, template: StyleTemplate): string {
  const root = document.createElement('div'); root.dataset['apaSection'] = `abstract-${request.language}`;
  root.append(sectionParagraph(request.language === 'es' ? 'Resumen' : 'Abstract', 'heading', template));
  root.append(sectionParagraph(request.text.replace(/\s+/g, ' ').trim(), 'abstract', template));
  if (request.keywords.trim()) {
    const p = sectionParagraph('', 'keywords', template), label = document.createElement('i');
    label.textContent = request.language === 'es' ? 'Palabras clave:' : 'Keywords:';
    p.append(label, ` ${request.keywords.trim()}`); root.append(p);
  }
  return root.outerHTML;
}
/** Insert/update a generated section; other content on its pages is retained. */
export function putAcademicSection(pages: DocumentPage[], html: string, key: string, position: 'start' | 'abstract' | 'end' | 'notes'): { pages: DocumentPage[]; index: number } {
  const result: DocumentPage[] = []; let existing = -1;
  for (const page of pages) {
    if (!page.html.includes('data-apa-section')) { result.push(page); continue; }
    const root = document.createElement('div'); root.innerHTML = page.html;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-apa-section]')).filter(el => el.dataset['apaSection'] === key);
    if (sections.length) { if (existing < 0) existing = result.length; sections.forEach(el => el.remove()); }
    if (root.textContent?.trim() || root.querySelector('img,table,svg')) result.push({ ...page, html: root.innerHTML });
  }
  let index = existing;
  if (index < 0) {
    if (position === 'start') index = 0;
    else if (position === 'abstract') {
      index = 0;
      while (index < result.length && /data-apa-section="(?:cover|abstract-[^"]+)"/.test(result[index].html)) index++;
    } else if (position === 'notes') {
      index = result.findIndex(page => /data-apa-section="appendix"/.test(page.html));
      if (index < 0) index = result.length;
    } else index = result.length;
  }
  if (result.length === 1 && !result[0].html.replace(/<[^>]+>/g, '').trim() && !result[0].html.includes('<img')) result.splice(0, 1);
  index = Math.min(index, result.length);
  result.splice(index, 0, { id: crypto.randomUUID(), html, breakBefore: 'manual' });
  if (result[index + 1]) result[index + 1] = { ...result[index + 1], breakBefore: 'manual' };
  return { pages: result, index };
}
export function styleApaSections(bodies: HTMLElement[], template: StyleTemplate): void {
  const appendixIds = new Map<string, string>();
  bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-apa-section="appendix"]').forEach(root => {
    const id = root.dataset['appendixId'] ||= crypto.randomUUID();
    if (!appendixIds.has(id)) appendixIds.set(id, appendixLetter(appendixIds.size));
  }));
  bodies.forEach(body => {
    body.querySelectorAll<HTMLElement>('[data-word-note-id]').forEach(ref => { ref.dataset['noteFont'] = template.rules.P.fontFamily; ref.dataset['noteFontSize'] = String(template.rules.P.fontSizePt); });
    body.querySelectorAll<HTMLElement>('[data-apa-role]').forEach(element => academicParagraph(element, template, element.dataset['apaRole']!));
    body.querySelectorAll<HTMLElement>('[data-apa-section="appendix"]').forEach(root => {
      const letter = appendixIds.get(root.dataset['appendixId']!)!;
      root.dataset['appendixLetter'] = letter;
      const label = root.querySelector<HTMLElement>('[data-apa-role="appendix-label"]');
      if (label && !root.hasAttribute('data-word-continuation')) label.textContent = appendixIds.size === 1 ? 'Apéndice' : `Apéndice ${letter}`;
    });
  });
}
export function appendixLetter(index: number): string {
  let result = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}
