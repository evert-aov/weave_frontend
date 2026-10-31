import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NotesService } from './notes.service';
import { Note, NoteSummary } from '../models/note.model';
import { environment } from '../../../environments/environment';

describe('progressive note loading', () => {
  let service: NotesService;
  let http: HttpTestingController;
  const api = `${environment.apiUrl}/notes`;
  const summary: NoteSummary = { _id: 'n1', userId: 'u1', title: 'Sheet', space: 'Research', docType: 'sheet', tags: [] };
  const fullNote: Note = { ...summary, blocks: [], docData: { sheets: {} } };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { try { http.verify(); } finally { vi.useRealTimers(); } });

  it('lists a directory without opening a file, then hydrates only an explicitly selected note', () => {
    service.loadNotes().subscribe();
    const list = http.expectOne(`${api}?view=summary&space=Research`);
    list.flush([summary, { ...summary, _id: 'n2' }]);
    expect(service.notesList()).toHaveLength(2);
    expect(service.currentNote()).toBeNull();
    expect(service.isLoadingNote()).toBe(false);
    expect(service.openTabs()).toEqual([]);
    http.expectNone(`${api}/n1`);
    http.expectNone(`${api}/n2`);
    service.loadNoteById('n1').subscribe();
    http.expectOne(`${api}/n1`).flush(fullNote);
    expect(service.currentNote()?.docData).toEqual({ sheets: {} });
    expect(service.isLoadingNote()).toBe(false);
    expect(service.notesList()[0]).not.toHaveProperty('docData');
  });

  it.each([
    { notes: [] as NoteSummary[] },
    { notes: [{ ...summary, _id: 'other', space: 'Other' }] },
  ])(
    'keeps the open document and tabs when browsing a different directory ($notes)', ({ notes }) => {
      service.loadNoteById('n1').subscribe();
      http.expectOne(`${api}/n1`).flush(fullNote);
      service.loadNotes('Other').subscribe();
      http.expectOne(`${api}?view=summary&space=Other`).flush(notes);
      expect(service.currentNote()?._id).toBe('n1');
      expect(service.openTabs().map((tab) => tab.noteId)).toEqual(['n1']);
      http.expectNone(`${api}/other`);
    },
  );

  it('does not allow a slow previous request to replace the newest selected note', () => {
    service.loadNoteById('n1').subscribe();
    service.loadNoteById('n2').subscribe();
    http.expectOne(`${api}/n2`).flush({ ...fullNote, _id: 'n2' });
    http.expectOne(`${api}/n1`).flush(fullNote);
    expect(service.currentNote()?._id).toBe('n2');
  });

  it('ignores pending responses after logout', () => {
    service.loadNoteById('n1').subscribe();
    service.clearState();
    http.expectOne(`${api}/n1`).flush(fullNote);
    expect(service.currentNote()).toBeNull();
    expect(service.openTabs()).toEqual([]);
  });

  it('does not start a document request from an obsolete list after logout', () => {
    service.loadNotes().subscribe();
    service.clearState();
    http.expectOne(`${api}?view=summary&space=Research`).flush([summary]);
    http.expectNone(`${api}/n1`);
    expect(service.notesList()).toEqual([]);
    expect(service.currentNote()).toBeNull();
    expect(service.isLoadingList()).toBe(false);
  });

  it('does not turn navigation-only metadata into an editable document on a late editor event', () => {
    service.notesList.set([summary]);
    service.currentNote.set({ ...fullNote, _id: 'n2' });
    service.updateDocData({ sheets: { changed: true } }, 'n1');
    expect(service.currentNote()?.docData).toEqual(fullNote.docData);
    expect(service.saveStatus()).toBe('saved');
  });

  it('stops exposing a deleted document while the neighboring tab is being fetched', () => {
    service.loadNoteById('n1').subscribe();
    http.expectOne(`${api}/n1`).flush(fullNote);
    service.openTab({ ...fullNote, _id: 'n2' });
    service.deleteCurrentNote().subscribe();
    http.expectOne({ method: 'DELETE', url: `${api}/n1` }).flush({ success: true });
    expect(service.currentNote()).toBeNull();
    service.updateDocData({ deleted: true }, 'n1');
    expect(service.saveStatus()).toBe('saved');
    http.expectOne(`${api}/n2`).flush({ ...fullNote, _id: 'n2' });
    expect(service.currentNote()?._id).toBe('n2');
  });

  it('saves both documents when edits from two tabs arrive during the same debounce', async () => {
    vi.useFakeTimers();
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ pages: [{ html: '<p>First document</p>' }] }, 'n1');
    service.loadNoteById('n2').subscribe(); http.expectOne(`${api}/n2`).flush({ ...fullNote, _id: 'n2' });
    service.updateDocData({ pages: [{ html: '<p>Second document</p>' }] }, 'n2');
    await vi.advanceTimersByTimeAsync(800);
    const first = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    const second = http.expectOne({ method: 'PUT', url: `${api}/n2` });
    expect(first.request.body.docData.pages[0].html).toBe('<p>First document</p>');
    expect(second.request.body.docData.pages[0].html).toBe('<p>Second document</p>');
    second.flush({ ...fullNote, _id: 'n2', ...second.request.body });
    first.flush({ ...fullNote, ...first.request.body });
    expect(service.currentNote()?._id).toBe('n2');
    expect(service.currentNote()?.docData.pages[0].html).toBe('<p>Second document</p>');
  });

  it('does not replace a newer local edit with an older save response', async () => {
    vi.useFakeTimers();
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ text: 'First' }, 'n1');
    await vi.advanceTimersByTimeAsync(800);
    const first = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    service.updateDocData({ text: 'Latest' }, 'n1');
    first.flush({ ...fullNote, ...first.request.body });
    expect(service.currentNote()?.docData).toEqual({ text: 'Latest' });
    expect(service.saveStatus()).not.toBe('saved');
    await vi.advanceTimersByTimeAsync(800);
    const second = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    second.flush({ ...fullNote, ...second.request.body });
    expect(service.saveStatus()).toBe('saved');
  });

  it('finishes a write before starting the next write for the same document', async () => {
    vi.useFakeTimers();
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ text: 'First' }, 'n1');
    await vi.advanceTimersByTimeAsync(800);
    const first = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    service.updateDocData({ text: 'Latest' }, 'n1');
    await vi.advanceTimersByTimeAsync(800);
    expect(first.cancelled).toBe(false);
    http.expectNone({ method: 'PUT', url: `${api}/n1` });
    first.flush({ ...fullNote, ...first.request.body });
    const second = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    expect(second.request.body.docData).toEqual({ text: 'Latest' });
    second.flush({ ...fullNote, ...second.request.body });
    expect(service.currentNote()?.docData).toEqual({ text: 'Latest' });
  });

  it('preserves pending edits when reopening a tab before the API has saved them', async () => {
    vi.useFakeTimers();
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ text: 'Latest' }, 'n1');
    service.currentNote.set(null);
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    expect(service.currentNote()?.docData).toEqual({ text: 'Latest' });
    await vi.advanceTimersByTimeAsync(800);
    const request = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    request.flush({ ...fullNote, ...request.request.body });
    expect(service.saveStatus()).toBe('saved');
  });

  it('discards pending writes and responses when the user session is cleared', async () => {
    vi.useFakeTimers();
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ text: 'Pending' }, 'n1');
    service.clearState();
    await vi.advanceTimersByTimeAsync(800);
    http.expectNone({ method: 'PUT', url: `${api}/n1` });
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(fullNote);
    service.updateDocData({ text: 'New session' }, 'n1');
    await vi.advanceTimersByTimeAsync(800);
    const request = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    service.clearState();
    expect(request.cancelled).toBe(true);
    expect(service.currentNote()).toBeNull();
  });

  it('saves a rich text block to its source file when a reference already opened another document', async () => {
    vi.useFakeTimers();
    const source = { ...fullNote, docType: 'block' as const, blocks: [{ id: 'block-a', type: 'text' as const, order: 0, content: { html: '<p>Before</p>' } }] };
    service.loadNoteById('n1').subscribe(); http.expectOne(`${api}/n1`).flush(source);
    service.loadNoteById('n2').subscribe(); http.expectOne(`${api}/n2`).flush({ ...fullNote, _id: 'n2' });
    service.updateBlockContent('block-a', { html: '<p><a href="/?document=n2">Destination</a></p>' }, 'n1');
    await vi.advanceTimersByTimeAsync(800);
    const request = http.expectOne({ method: 'PUT', url: `${api}/n1` });
    expect(request.request.body.blocks[0].content.html).toContain('/?document=n2');
    request.flush({ ...source, ...request.request.body });
    expect(service.currentNote()?._id).toBe('n2');
  });
});
