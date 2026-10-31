import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { Note } from '../../core/models/note.model';
import { environment } from '../../../environments/environment';

describe('Word autosave through NotesService', () => {
  let fixture: ComponentFixture<PureDocEditorComponent>;
  let notes: NotesService;
  let http: HttpTestingController;
  const api = `${environment.apiUrl}/notes`;
  const note: Note = { _id: 'word-a', userId: 'user', title: 'Document', space: 'Research', docType: 'doc', blocks: [], tags: [], docData: null };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: I18nService, useValue: {} },
      { provide: WordCompatibilityService, useValue: {} },
      { provide: LatexRendererService, useValue: {} },
      { provide: ImageStoreService, useValue: {
        resolveImages: async (html: string) => html,
        externalizeImages: async (html: string) => html,
      } },
    ] });
    TestBed.overrideComponent(PureDocEditorComponent, { set: { template: `
      @for (page of pages(); track page.id; let index = $index) {
        <div #pageBody [attr.data-page-body-id]="page.id" contenteditable="true"
          (input)="onPageInput($event, index)" (blur)="commitPageDomToState(index)"></div>
      }
    ` } });
    notes = TestBed.inject(NotesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) { await Promise.resolve(); }
    fixture.detectChanges();
  }

  async function open(value: Note = note): Promise<void> {
    notes.loadNoteById(value._id).subscribe();
    http.expectOne(`${api}/${value._id}`).flush(value);
    fixture = TestBed.createComponent(PureDocEditorComponent);
    fixture.componentRef.setInput('note', value);
    fixture.detectChanges();
    await settle();
  }

  function type(html: string, detectChanges = true): void {
    const body = fixture.nativeElement.querySelector('[data-page-body-id]') as HTMLElement;
    body.focus(); body.innerHTML = html;
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    if (detectChanges) fixture.detectChanges();
  }

  async function save(html: string): Promise<Note> {
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({ method: 'PUT', url: `${api}/${note._id}` });
    expect(request.request.body.docData.pages[0].html).toBe(html);
    const saved = { ...note, ...request.request.body };
    request.flush(saved);
    await settle();
    return saved;
  }

  it('sends typed content to the API without importing a file and restores it when reopened', async () => {
    await open();
    type('<p>Written directly in Word</p>');
    const saved = await save('<p>Written directly in Word</p>');
    fixture.destroy();
    await open(saved);
    expect(fixture.componentInstance.note.docData.pages[0].html).toBe('<p>Written directly in Word</p>');
    expect(fixture.componentInstance.pages()[0].html).toBe('<p>Written directly in Word</p>');
    expect(fixture.componentInstance.getPageBody(fixture.componentInstance.pages()[0].id)).toBe(fixture.nativeElement.querySelector('[data-page-body-id]'));
    expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('[data-page-body-id]'));
    expect(fixture.nativeElement.querySelector('[data-page-body-id]').innerHTML).toBe('<p>Written directly in Word</p>');
  });

  it('saves an ordinary edit after opening a document that already contains text', async () => {
    await open({ ...note, docData: { v: 2, pages: [{ id: 'page', html: '<p>Original</p>' }] } });
    type('<p>Original and new text</p>');
    await save('<p>Original and new text</p>');
  });

  it('persists a document-wide heading definition and restores it for future headings after reopening', async () => {
    await open({ ...note, docData: { v: 2, pages: [
      { id: 'a', html: '<h1>First</h1><p id="sample" style="font-family:Arial Black;font-size:18pt;font-weight:900">New style</p>' },
      { id: 'b', html: '<h1>Second</h1>', breakBefore: 'manual' },
    ] } });
    const editor = fixture.componentInstance;
    const sample = fixture.nativeElement.querySelector('#sample') as HTMLElement;
    sample.closest<HTMLElement>('[data-page-body-id]')!.focus();
    const range = document.createRange(); range.selectNodeContents(sample);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    editor.handleUpdateStyleFromSelection('H1'); fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({ method: 'PUT', url: `${api}/${note._id}` });
    const data = request.request.body.docData;
    expect(data.customTemplates).toHaveLength(1);
    expect(data.customTemplates[0].rules.H1.fontFamily).toBe('Arial Black');
    expect(data.customTemplates[0].rules.H1.fontSizePt).toBe(18);
    for (const page of data.pages) {
      const holder = document.createElement('div'); holder.innerHTML = page.html;
      expect(holder.querySelector('h1')!.style.fontSize).toBe('18pt');
    }
    expect(JSON.stringify(data)).not.toContain('weave-selection');
    const saved = { ...note, ...request.request.body };
    request.flush(saved); await settle(); fixture.destroy();
    await open(saved);
    const reopened = fixture.componentInstance;
    const active = reopened.styleTemplates().find(template => template.id === reopened.activeTemplateId())!;
    expect(active.rules.H1.fontFamily).toBe('Arial Black');
    expect(active.rules.H1.fontSizePt).toBe(18);
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(2);
  });

  it('saves the heading outline mode and generated numbers and restores them on reopening', async () => {
    await open({ ...note, docData:{v:2,pages:[{id:'a',html:'<h1>Chapter</h1><h2>Section</h2>'},{id:'b',html:'<h2>Other</h2>'}]} });
    const editor = fixture.componentInstance;
    editor.onRibbonCommand({command:'headingNumbering',value:'on'}); fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({method:'PUT',url:`${api}/${note._id}`});
    expect(request.request.body.docData.headingNumbering).toBe(true);
    expect(request.request.body.docData.pages[1].html).toContain('1.2 ');
    const saved = {...note,...request.request.body}; request.flush(saved); await settle(); fixture.destroy();
    await open(saved);
    expect(fixture.componentInstance.headingNumbering()).toBe(true);
    expect(Array.from(fixture.nativeElement.querySelectorAll('[data-word-heading-number]') as NodeListOf<HTMLElement>).map(element=>element.textContent)).toEqual(['1. ','1.1 ','1.2 ']);
  });

  it('keeps an edit when the editor is destroyed before its debounce runs', async () => {
    await open();
    type('<p>Last edit before closing</p>');
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({ method: 'PUT', url: `${api}/${note._id}` });
    expect(request.request.body.docData.pages[0].html).toBe('<p>Last edit before closing</p>');
    request.flush({ ...note, ...request.request.body });
  });

  it('keeps the last input even when destroyed before the autosave effect runs', async () => {
    await open();
    type('<p>Immediately closed</p>', false);
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({ method: 'PUT', url: `${api}/${note._id}` });
    expect(request.request.body.docData.pages[0].html).toBe('<p>Immediately closed</p>');
    request.flush({ ...note, ...request.request.body });
  });

  it('saves to the original document after closing the last open tab', async () => {
    await open();
    type('<p>Closed last tab</p>');
    notes.currentNote.set(null);
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(1500);
    const request = http.expectOne({ method: 'PUT', url: `${api}/${note._id}` });
    expect(request.request.body.docData.pages[0].html).toBe('<p>Closed last tab</p>');
    request.flush({ ...note, ...request.request.body });
    expect(notes.currentNote()).toBeNull();
  });

  it('keeps both Word documents when changing tabs and typing again immediately', async () => {
    await open();
    type('<p>Document A</p>', false);
    const secondNote = { ...note, _id: 'word-b' };
    notes.loadNoteById(secondNote._id).subscribe(); http.expectOne(`${api}/word-b`).flush(secondNote);
    fixture.componentRef.setInput('note', secondNote);
    fixture.detectChanges(); await settle();
    type('<p>Document B</p>');
    await vi.advanceTimersByTimeAsync(1500);
    const first = http.expectOne({ method: 'PUT', url: `${api}/word-a` });
    const second = http.expectOne({ method: 'PUT', url: `${api}/word-b` });
    expect(first.request.body.docData.pages[0].html).toBe('<p>Document A</p>');
    expect(second.request.body.docData.pages[0].html).toBe('<p>Document B</p>');
    first.flush({ ...note, ...first.request.body });
    second.flush({ ...secondNote, ...second.request.body });
    expect(notes.currentNote()?._id).toBe('word-b');
  });

  it('saves pasted tables together with text and formatting without importing a file', async () => {
    await open();
    const html = '<p><strong>Pasted text</strong></p><table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>';
    type(html);
    await save(html);
  });

  it('saves undo and redo results instead of the previous DOM contents', async () => {
    await open();
    type('<p>First</p>');
    fixture.componentInstance.pushUndoSnapshot();
    type('<p>Second</p>');
    fixture.componentInstance.handleGlobalUndo(); fixture.detectChanges();
    await save('<p>First</p>');
    fixture.componentInstance.handleGlobalRedo(); fixture.detectChanges();
    await save('<p>Second</p>');
  });

  it('keeps saves in order while image preparation from an older edit is slow', async () => {
    await open();
    let release!: (html: string) => void;
    const slow = new Promise<string>((resolve) => { release = resolve; });
    const prepare = vi.spyOn(TestBed.inject(ImageStoreService), 'externalizeImages')
      .mockImplementation((html) => html === '<p>First</p>' ? slow : Promise.resolve(html));
    type('<p>First</p>');
    await vi.advanceTimersByTimeAsync(600);
    type('<p>Latest</p>');
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).not.toHaveBeenCalledWith('<p>Latest</p>');
    release('<p>First</p>'); await settle();
    await save('<p>Latest</p>');
  });
});
