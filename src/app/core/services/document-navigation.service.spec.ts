import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { NotesService } from './notes.service';
import { DocumentNavigationService } from './document-navigation.service';
import { DocumentHistoryService } from './document-history.service';
import { environment } from '../../../environments/environment';
import { Note } from '../models/note.model';

describe('document navigation and jump history', () => {
  let navigation: DocumentNavigationService, notes: NotesService, history: DocumentHistoryService, http: HttpTestingController;
  const api = `${environment.apiUrl}/notes`;
  const note = (id: string): Note => ({ _id: id, userId: 'user', title: id, space: 'Folder', docType: 'doc', blocks: [], tags: [] });
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    navigation = TestBed.inject(DocumentNavigationService); notes = TestBed.inject(NotesService);
    history = TestBed.inject(DocumentHistoryService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function opened(id: string): void { http.expectOne(`${api}/${id}`).flush(note(id)); }

  it('opens references and navigates back and forward without adding duplicate history entries', () => {
    navigation.open('a'); opened('a'); navigation.open('b'); opened('b'); navigation.open('c'); opened('c');
    navigation.back(); opened('b'); navigation.back(); opened('a');
    expect(notes.currentNote()?._id).toBe('a');
    expect(history.canGoBack()).toBe(false); expect(history.canGoForward()).toBe(true);
    navigation.forward(); opened('b');
    expect(history.entries().map((entry) => entry.noteId)).toEqual(['a', 'b', 'c']);
    expect(history.index()).toBe(1);
    expect(notes.openTabs()).toHaveLength(3);
  });
  it('records file selection outside the link UI and truncates forward history on a new jump', () => {
    notes.loadNoteById('a').subscribe(); opened('a'); navigation.open('b'); opened('b');
    navigation.back(); opened('a'); navigation.open('c'); opened('c');
    expect(history.entries().map((entry) => entry.noteId)).toEqual(['a', 'c']);
    navigation.open('c'); http.expectNone(`${api}/c`);
    expect(history.entries()).toHaveLength(2);
  });
  it('keeps the current file and history when the target is missing or inaccessible', () => {
    navigation.open('a'); opened('a'); navigation.open('deleted');
    http.expectOne(`${api}/deleted`).flush({}, { status: 404, statusText: 'Not found' });
    expect(notes.currentNote()?._id).toBe('a'); expect(history.entries()).toHaveLength(1);
    expect(navigation.error()).toContain('No se pudo abrir');
  });
  it('loads only summaries for the picker without changing the selected file or directory', () => {
    navigation.open('a'); opened('a'); notes.activeSpace.set('Current folder');
    notes.listDocumentReferences().subscribe();
    http.expectOne(`${api}?view=summary`).flush([{ ...note('b'), blocks: undefined }]);
    expect(notes.currentNote()?._id).toBe('a'); expect(notes.activeSpace()).toBe('Current folder');
    expect(history.entries()).toHaveLength(1);
  });
  it('discards pending navigation and history after logout', () => {
    navigation.open('a'); opened('a'); navigation.open('b'); notes.clearState(); opened('b');
    expect(notes.currentNote()).toBeNull(); expect(history.entries()).toEqual([]);
  });
  it('preserves return positions, caps history and removes deleted destinations', () => {
    history.record('a'); history.remember('a', { scrollTop: 120, scrollLeft: 0, anchor: { kind: 'page', id: 'p1', offset: 6 } });
    history.record('b'); history.record('a', 0);
    expect(history.current()?.position?.scrollTop).toBe(120);
    for (let i = 0; i < 110; i++) history.record(`n-${i}`);
    expect(history.entries()).toHaveLength(100);
    history.remove('n-109'); expect(history.entries().some((entry) => entry.noteId === 'n-109')).toBe(false);
  });
});
