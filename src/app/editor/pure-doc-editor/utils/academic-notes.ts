import type { AcademicNote } from '../models/academic-sections.model';
import type { DocumentPage, StyleTemplate } from '../models/word-document.model';
import { academicParagraph } from './apa-objects';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';

export const NOTE_REFERENCE = '[data-word-note-id]';
export function academicNotes(bodies: HTMLElement[]): AcademicNote[] {
  const result: AcademicNote[] = [], seen = new Set<string>(); let footnote = 0, endnote = 0;
  bodies.forEach(body => body.querySelectorAll<HTMLElement>(NOTE_REFERENCE).forEach(ref => {
    const id = ref.dataset['wordNoteId']!;
    if (seen.has(id)) return; seen.add(id);
    const kind = ref.dataset['noteKind'] === 'endnote' ? 'endnote' : 'footnote';
    result.push({ id, kind, text: ref.dataset['noteContent'] || '', number: kind === 'footnote' ? ++footnote : ++endnote });
  }));
  return result;
}
export function noteList(notes: AcademicNote[], template: StyleTemplate, kind: 'footnote' | 'endnote'): HTMLElement {
  const root = document.createElement('div'); root.dataset['wordNoteList'] = kind;
  root.contentEditable = 'false';
  if (kind === 'footnote') { root.style.borderTop = '1px solid #000'; root.style.marginTop = '8pt'; root.style.paddingTop = '4pt'; }
  else {
    root.dataset['apaSection'] = 'endnotes';
    const title = document.createElement('p'); title.dataset['apaRole'] = 'heading'; title.textContent = 'Notas'; academicParagraph(title, template, 'heading'); root.append(title);
  }
  for (const note of notes.filter(n => n.kind === kind)) {
    const p = document.createElement('p'); p.dataset['noteEntryId'] = note.id; p.dataset['apaRole'] = kind;
    p.id = `note-${note.id}`; academicParagraph(p, template, kind);
    if (kind === 'endnote') p.contentEditable = 'false';
    const link = document.createElement('a'); link.href = `#note-call-${note.id}`; link.textContent = String(note.number); link.style.color = '#000'; link.style.textDecoration = 'none'; link.dataset['noteBacklink'] = 'true';
    p.append(link, ` ${note.text}`); p.style.whiteSpace = 'pre-wrap'; root.append(p);
  }
  return root;
}
export function renumberAcademicNotes(bodies: HTMLElement[]): AcademicNote[] {
  const notes = academicNotes(bodies), map = new Map(notes.map(note => [note.id, note]));
  bodies.forEach(body => body.querySelectorAll<HTMLElement>(NOTE_REFERENCE).forEach(ref => {
    const note = map.get(ref.dataset['wordNoteId']!); if (!note) return;
    ref.textContent = String(note.number); ref.id = `note-call-${note.id}`; ref.contentEditable = 'false';
    ref.style.verticalAlign = 'super'; ref.style.fontSize = '75%';
    ref.style.color = '#000'; ref.style.textDecoration = 'none';
    if (ref.tagName === 'A') ref.setAttribute('href', `#note-${note.id}`);
  }));
  bodies.forEach(body => body.querySelectorAll<HTMLElement>('[data-note-entry-id]').forEach(p => {
    const note = map.get(p.dataset['noteEntryId']!);
    if (!note) { p.remove(); return; }
    const number = p.querySelector('a');
    if (number) number.textContent = String(note.number);
  }));
  return notes;
}
/** Normalize before pagination, so deleting a call also removes its generated note. */
export function prepareNotePages(pages: DocumentPage[]): DocumentPage[] {
  if (!pages.some(page => /data-word-note-(?:id|list)/.test(page.html))) return pages;
  const bodies = pages.map(page => { const body = document.createElement('div'); body.innerHTML = page.html; return body; });
  const notes = renumberAcademicNotes(bodies);
  const endLists = bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-note-list="endnote"]')));
  if (endLists.length) {
    const ends = notes.filter(note => note.kind === 'endnote');
    if (ends.length) {
      const template = structuredClone(APA_STYLE_TEMPLATES[0]);
      const ref = bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>(NOTE_REFERENCE))).find(ref => ref.dataset['noteKind'] === 'endnote');
      template.rules.P.fontFamily = ref?.dataset['noteFont'] || template.rules.P.fontFamily;
      template.rules.P.fontSizePt = Number(ref?.dataset['noteFontSize']) || template.rules.P.fontSizePt;
      const fresh = noteList(ends, template, 'endnote');
      if (endLists[0].dataset['wordFlow']) fresh.dataset['wordFlow'] = endLists[0].dataset['wordFlow'];
      const entries = endLists.flatMap(list => Array.from(list.querySelectorAll<HTMLElement>('[data-note-entry-id]')));
      fresh.querySelectorAll<HTMLElement>('[data-note-entry-id]').forEach(p => {
        const old = entries.find(entry => entry.dataset['noteEntryId'] === p.dataset['noteEntryId']);
        if (old?.dataset['wordFlow']) p.dataset['wordFlow'] = old.dataset['wordFlow'];
      });
      endLists[0].replaceWith(fresh); endLists.slice(1).forEach(list => list.remove());
    } else endLists.forEach(list => list.remove());
  }
  bodies.forEach(body => body.querySelectorAll('[data-word-note-list="footnote"]').forEach(list => list.remove()));
  return pages.map((page, index) => ({ ...page, html: bodies[index].innerHTML }));
}
export function footnotesForBody(body: HTMLElement): HTMLElement | null {
  const refs = Array.from(body.querySelectorAll<HTMLElement>(NOTE_REFERENCE)).filter(ref => ref.dataset['noteKind'] !== 'endnote');
  if (!refs.length) return null;
  const seen = new Set<string>();
  const notes: AcademicNote[] = refs.flatMap(ref => {
    const id = ref.dataset['wordNoteId']!; if (seen.has(id)) return []; seen.add(id);
    return [{ id, kind: 'footnote', text: ref.dataset['noteContent'] || '', number: Number(ref.textContent) || 1 }];
  });
  const template = structuredClone(APA_STYLE_TEMPLATES[0]);
  const first = refs[0];
  template.rules.P.fontFamily = first.dataset['noteFont'] || template.rules.P.fontFamily;
  template.rules.P.fontSizePt = Number(first.dataset['noteFontSize']) || template.rules.P.fontSizePt;
  return noteList(notes, template, 'footnote');
}
