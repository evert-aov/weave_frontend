import type { DocumentPage, DocumentLayoutConfig } from '../models/word-document.model';
import { escapeAcademicHtml as e } from '../utils/apa-references';
import { academicNotes, footnotesForBody, noteList, renumberAcademicNotes } from '../utils/academic-notes';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';

export class DocxNoteImport {
  private readonly entries = new Map<string, string>();
  constructor(files: Record<string, string>) {
    for (const kind of ['footnote', 'endnote'] as const) {
      const source = files[`word/${kind}s.xml`]; if (!source) continue;
      const doc = new DOMParser().parseFromString(source, 'application/xml');
      Array.from(doc.getElementsByTagNameNS('*', kind)).forEach(note => {
        const id = note.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'id') || note.getAttribute('w:id') || '';
        if (Number(id) < 1) return;
        const paragraphs = Array.from(note.getElementsByTagNameNS('*','p')).filter(p => !Array.from(p.getElementsByTagNameNS('*','pStyle')).some(style => (style.getAttribute('w:val') || style.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','val')) === 'APAEndnotesHeading')).map(p => {
          let text = ''; const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT); let node: Node | null;
          while ((node = walker.nextNode())) { const el = node as Element; if (el.localName === 't') text += el.textContent || ''; else if (el.localName === 'br') text += '\n'; else if (el.localName === 'tab') text += '\t'; }
          return text;
        });
        this.entries.set(`${kind}-${id}`, paragraphs.join('\n').trim());
      });
    }
  }
  reference(kind: 'footnote' | 'endnote', id: string, font: string, size: number): string {
    const text = this.entries.get(`${kind}-${id}`); if (text === undefined) return '';
    const uid = `docx-${kind}-${id}`;
    return `<a id="note-call-${uid}" href="#note-${uid}" data-word-note-id="${uid}" data-note-kind="${kind}" data-note-content="${e(text)}" data-note-font="${e(font)}" data-note-font-size="${size}" contenteditable="false" style="vertical-align:super;font-size:75%">${e(id)}</a>`;
  }
  finish(pages: DocumentPage[], font: string, size: number): void {
    if (!this.entries.size) return;
    const roots = pages.map(page => { const root = document.createElement('div'); root.innerHTML = page.html; return root; });
    renumberAcademicNotes(roots);
    roots.forEach((root, index) => { const notes = footnotesForBody(root); if (notes) root.append(notes); pages[index].html = root.innerHTML; });
    const endnotes = academicNotes(roots).filter(note => note.kind === 'endnote');
    if (endnotes.length) {
      const template = structuredClone(APA_STYLE_TEMPLATES[0]); template.rules.P.fontFamily = font; template.rules.P.fontSizePt = size;
      pages.push({ id: crypto.randomUUID(), html: noteList(endnotes, template, 'endnote').outerHTML, breakBefore: 'manual' });
    }
  }
}
/** Recognize the simple APA student/professional PAGE header emitted by the exporter. */
export function detectImportedApa(layout: DocumentLayoutConfig, files: Record<string, string>, font: string, size: number): void {
  if (!APA_STYLE_TEMPLATES.some(t => t.rules.P.fontFamily === font && t.rules.P.fontSizePt === size)) return;
  if (layout.paperFormatId !== 'letter' || [layout.margins.topPx,layout.margins.rightPx,layout.margins.bottomPx,layout.margins.leftPx].some(n => Math.abs(n - 96) > 1)) return;
  const header = Object.keys(files).find(key => /^word\/header\d+\.xml$/.test(key)); if (!header) return;
  const doc = new DOMParser().parseFromString(files[header], 'application/xml');
  const field = Array.from(doc.getElementsByTagNameNS('*','fldSimple')).find(el => /^(?:\s*)PAGE(?:\s|$)/i.test(el.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','instr') || el.getAttribute('w:instr') || ''));
  if (!field) return; field.remove();
  const title = Array.from(doc.getElementsByTagNameNS('*','t')).map(t => t.textContent || '').join('').trim();
  if (title.length > 50 || title !== title.toLocaleUpperCase()) return;
  layout.apa = { mode: title ? 'professional' : 'student', runningHead: title, fontFamily: font, fontSizePt: size }; layout.hyphenation = false;
}
