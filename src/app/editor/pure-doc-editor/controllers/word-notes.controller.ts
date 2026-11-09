import { signal } from '@angular/core';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import type { StyleTemplate } from '../models/word-document.model';
import type { AcademicNote, AcademicNoteRequest } from '../models/academic-sections.model';
import { academicNotes, renumberAcademicNotes, noteList } from '../utils/academic-notes';
import { putAcademicSection } from '../utils/apa-sections';

type Host = Pick<PureDocEditorComponent, 'isReadMode' | 'documentReady' | 'pushUndoSnapshot' | 'activePageIndex'>;
type Hooks = Pick<WordEditorHooks, 'liveBodies' | 'prepareRibbonSelection' | 'finishDocumentMutation' | 'getLivePagesSnapshot' | 'renderDocumentPages' | 'scheduleAutoSave' | 'collectDocData'>;
export class WordNotesController {
  readonly items = signal<AcademicNote[]>([]);
  constructor(private readonly editor: Host, private readonly hooks: Hooks, private readonly template: () => StyleTemplate) {}
  refresh(): void { this.items.set(academicNotes(this.hooks.liveBodies())); }
  save(request: AcademicNoteRequest): boolean {
    if (!this.editor.documentReady() || this.editor.isReadMode() || !request.text.trim()) return false;
    const bodies = this.hooks.liveBodies(), template = this.template();
    let ref = request.id ? bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-note-id]'))).find(el => el.dataset['wordNoteId'] === request.id) : null;
    if (request.id && !ref) return false;
    let range: Range | null = null;
    if (!ref) {
      range = this.hooks.prepareRibbonSelection();
      if (!range) { const body = bodies[this.editor.activePageIndex()]; if (!body) return false; range = document.createRange(); range.selectNodeContents(body); range.collapse(false); }
      if (!bodies.some(body => body.contains(range!.startContainer) && body.contains(range!.endContainer))) return false;
    }
    this.editor.pushUndoSnapshot();
    if (!ref) {
      ref = document.createElement('a'); ref.dataset['wordNoteId'] = crypto.randomUUID();
      range!.collapse(false); range!.insertNode(ref); range!.setStartAfter(ref); range!.collapse(true);
      window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range!);
    }
    ref.dataset['noteKind'] = request.kind; ref.dataset['noteContent'] = request.text.trim();
    ref.dataset['noteFont'] = template.rules.P.fontFamily; ref.dataset['noteFontSize'] = String(template.rules.P.fontSizePt);
    renumberAcademicNotes(bodies); this.hooks.finishDocumentMutation();
    this.syncEndnotes(); this.refresh(); return true;
  }
  remove(id: string): void {
    if (this.editor.isReadMode()) return;
    this.editor.pushUndoSnapshot();
    this.hooks.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>('[data-word-note-id]').forEach(ref => { if (ref.dataset['wordNoteId'] === id) ref.remove(); }));
    renumberAcademicNotes(this.hooks.liveBodies()); this.hooks.finishDocumentMutation(); this.syncEndnotes(); this.refresh();
  }
  syncEndnotes(): void {
    const notes = academicNotes(this.hooks.liveBodies()).filter(note => note.kind === 'endnote');
    if (!notes.length) {
      const pages = this.hooks.getLivePagesSnapshot();
      if (!pages.some(page => page.html.includes('data-word-note-list="endnote"'))) return;
      const kept = pages.flatMap(page => {
        if (!page.html.includes('data-word-note-list="endnote"')) return [page];
        const body = document.createElement('div'); body.innerHTML = page.html;
        body.querySelectorAll('[data-word-note-list="endnote"]').forEach(list => list.remove());
        return body.textContent?.trim() || body.querySelector('img,table,svg') ? [{ ...page, html: body.innerHTML }] : [];
      });
      this.hooks.renderDocumentPages(kept.length ? kept : [{ id: crypto.randomUUID(), html: '<p><br></p>' }], true);
      this.hooks.scheduleAutoSave(this.hooks.collectDocData()); return;
    }
    const section = noteList(notes, this.template(), 'endnote');
    const result = putAcademicSection(this.hooks.getLivePagesSnapshot(), section.outerHTML, 'endnotes', 'notes');
    this.hooks.renderDocumentPages(result.pages, true); this.hooks.scheduleAutoSave(this.hooks.collectDocData());
  }
}
