import type { DocumentPage } from '../models/word-document.model';
import type { AcademicNote } from '../models/academic-sections.model';
import { academicNotes } from '../utils/academic-notes';
import { WORD_NS } from './docx-package';
import { textRun, runProperties, type DocxRunStyle } from './docx-formatting';
export class DocxNotes {
  readonly notes: AcademicNote[];
  private readonly ids = new Map<string, number>();
  constructor(pages: DocumentPage[], private readonly style: DocxRunStyle) {
    const bodies = pages.map(page => { const body = document.createElement('div'); body.innerHTML = page.html; return body; });
    this.notes = academicNotes(bodies); let foot = 0, end = 0;
    this.notes.forEach(note => this.ids.set(note.id, note.kind === 'footnote' ? ++foot : ++end));
  }
  has(kind: 'footnote' | 'endnote'): boolean { return this.notes.some(note => note.kind === kind); }
  reference(element: HTMLElement): string {
    const note = this.notes.find(n => n.id === element.dataset['wordNoteId']); if (!note) return '';
    return `<w:r><w:rPr><w:rStyle w:val="${note.kind === 'footnote' ? 'FootnoteReference' : 'EndnoteReference'}"/><w:vertAlign w:val="superscript"/></w:rPr><w:${note.kind}Reference w:id="${this.ids.get(note.id)}"/></w:r>`;
  }
  part(kind: 'footnote' | 'endnote'): string {
    const plural = kind === 'footnote' ? 'footnotes' : 'endnotes', smaller = kind === 'footnote';
    const style: DocxRunStyle = { ...this.style, size: smaller ? Math.max(8, this.style.size - 2) : this.style.size };
    const separator = `<w:${kind} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${kind}><w:${kind} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${kind}>`;
    const notes = this.notes.filter(note => note.kind === kind).map((note, index) => `<w:${kind} w:id="${this.ids.get(note.id)}">${!smaller && index === 0 ? `<w:p><w:pPr><w:pStyle w:val="APAEndnotesHeading"/><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr>${textRun('Notas', { ...this.style, bold: true })}</w:p>` : ''}<w:p><w:pPr><w:pStyle w:val="${smaller ? 'FootnoteText' : 'EndnoteText'}"/><w:spacing w:before="0" w:after="0" w:line="${smaller ? 240 : 480}" w:lineRule="auto"/>${smaller ? '' : '<w:ind w:firstLine="720"/>'}</w:pPr><w:r><w:rPr>${runProperties(style)}</w:rPr><w:${kind}Ref/></w:r><w:r><w:tab/></w:r>${textRun(note.text, style)}</w:p></w:${kind}>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><w:${plural} xmlns:w="${WORD_NS}">${separator}${notes}</w:${plural}>`;
  }
}
