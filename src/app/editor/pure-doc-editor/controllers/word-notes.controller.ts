import { signal } from '@angular/core';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';
import type { DocumentPage, StyleTemplate } from '../models/word-document.model';
import type { AcademicNote, AcademicNoteRequest } from '../models/academic-sections.model';
import { academicNotes, renumberAcademicNotes, noteList } from '../utils/academic-notes';
import { putAcademicSection } from '../utils/apa-sections';

type Host = Pick<PureDocEditorComponent, 'isReadMode' | 'documentReady' | 'pushUndoSnapshot' | 'activePageIndex'>;
type Hooks = Pick<
  WordEditorHooks,
  | 'liveBodies'
  | 'prepareRibbonSelection'
  | 'finishDocumentMutation'
  | 'getLivePagesSnapshot'
  | 'renderDocumentPages'
  | 'scheduleAutoSave'
  | 'collectDocData'
  | 'canvasMode'
  | 'canvasMeta'
  | 'canvasSession'
  | 'commitCanvasModelMutation'
>;

export function buildEndnoteSyncPages(
  bodies: HTMLElement[],
  pages: DocumentPage[],
  template: StyleTemplate,
): { pages: DocumentPage[]; changed: boolean } {
  const notes = academicNotes(bodies).filter(note => note.kind === 'endnote');
  if (!notes.length) {
    if (!pages.some(page => page.html.includes('data-word-note-list="endnote"'))) {
      return { pages, changed: false };
    }
    const kept = pages.flatMap(page => {
      if (!page.html.includes('data-word-note-list="endnote"')) return [page];
      const body = document.createElement('div');
      body.innerHTML = page.html;
      body.querySelectorAll('[data-word-note-list="endnote"]').forEach(list => list.remove());
      return body.textContent?.trim() || body.querySelector('img,table,svg')
        ? [{ ...page, html: body.innerHTML }]
        : [];
    });
    return {
      pages: kept.length ? kept : [{ id: crypto.randomUUID(), html: '<p><br></p>' }],
      changed: true,
    };
  }
  const section = noteList(notes, template, 'endnote');
  const result = putAcademicSection(pages, section.outerHTML, 'endnotes', 'notes');
  return { pages: result.pages, changed: true };
}

export class WordNotesController {
  readonly items = signal<AcademicNote[]>([]);
  constructor(private readonly editor: Host, private readonly hooks: Hooks, private readonly template: () => StyleTemplate) {}

  refresh(): void {
    const session = this.hooks.canvasMode?.() ? this.hooks.canvasSession?.() : undefined;
    if (session && typeof session.getAcademicNotes === 'function') {
      this.items.set(session.getAcademicNotes());
      return;
    }
    this.items.set(academicNotes(this.hooks.liveBodies()));
  }

  private applyNoteSaveInBodies(
    bodies: HTMLElement[],
    range: Range | null,
    request: AcademicNoteRequest,
    template: StyleTemplate,
    doc: Document,
    onInserted?: (ref: HTMLElement) => void,
  ): boolean {
    let ref = request.id
      ? bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-note-id]'))).find(el => el.dataset['wordNoteId'] === request.id)
      : null;
    if (request.id && !ref) return false;
    if (!ref) {
      if (!range || !bodies.some(body => body.contains(range.startContainer) && body.contains(range.endContainer))) {
        return false;
      }
      ref = doc.createElement('a');
      ref.dataset['wordNoteId'] = crypto.randomUUID();
      range.collapse(false);
      range.insertNode(ref);
      onInserted?.(ref);
    }
    ref.dataset['noteKind'] = request.kind;
    ref.dataset['noteContent'] = request.text.trim();
    ref.dataset['noteFont'] = template.rules.P.fontFamily;
    ref.dataset['noteFontSize'] = String(template.rules.P.fontSizePt);
    renumberAcademicNotes(bodies);
    return true;
  }

  save(request: AcademicNoteRequest): boolean {
    if (!this.editor.documentReady() || this.editor.isReadMode() || !request.text.trim()) return false;
    const template = this.template();
    const session = this.hooks.canvasMode?.() ? this.hooks.canvasSession?.() : undefined;
    if (session) {
      const ok = session.saveAcademicNote(request, template, this.editor.activePageIndex(), this.hooks.canvasMeta?.());
      if (ok) {
        this.hooks.commitCanvasModelMutation?.();
        this.refresh();
      }
      return ok;
    }

    const bodies = this.hooks.liveBodies();
    const existing = request.id
      ? bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('[data-word-note-id]'))).find(el => el.dataset['wordNoteId'] === request.id)
      : null;
    if (request.id && !existing) return false;
    let range: Range | null = null;
    if (!existing) {
      range = this.hooks.prepareRibbonSelection();
      if (!range) {
        const body = bodies[this.editor.activePageIndex()];
        if (!body) return false;
        range = document.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
      }
      if (!bodies.some(body => body.contains(range!.startContainer) && body.contains(range!.endContainer))) return false;
    }
    this.editor.pushUndoSnapshot();
    this.applyNoteSaveInBodies(bodies, range, request, template, document, ref => {
      range!.setStartAfter(ref);
      range!.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range!);
    });
    this.hooks.finishDocumentMutation();
    this.syncEndnotes();
    this.refresh();
    return true;
  }

  remove(id: string): void {
    if (this.editor.isReadMode()) return;
    const session = this.hooks.canvasMode?.() ? this.hooks.canvasSession?.() : undefined;
    if (session) {
      if (session.removeAcademicNote(id, this.template(), this.hooks.canvasMeta?.())) {
        this.hooks.commitCanvasModelMutation?.();
      }
      this.refresh();
      return;
    }
    this.editor.pushUndoSnapshot();
    this.hooks.liveBodies().forEach(body => body.querySelectorAll<HTMLElement>('[data-word-note-id]').forEach(ref => { if (ref.dataset['wordNoteId'] === id) ref.remove(); }));
    renumberAcademicNotes(this.hooks.liveBodies());
    this.hooks.finishDocumentMutation();
    this.syncEndnotes();
    this.refresh();
  }

  syncEndnotes(): void {
    const session = this.hooks.canvasMode?.() ? this.hooks.canvasSession?.() : undefined;
    if (session) {
      if (session.syncAcademicEndnotes(this.template(), this.hooks.canvasMeta?.())) {
        this.hooks.commitCanvasModelMutation?.();
      }
      return;
    }
    const synced = buildEndnoteSyncPages(this.hooks.liveBodies(), this.hooks.getLivePagesSnapshot(), this.template());
    if (!synced.changed) return;
    this.hooks.renderDocumentPages(synced.pages, true);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
  }
}
