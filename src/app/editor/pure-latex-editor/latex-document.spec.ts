import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureLatexEditorComponent } from './pure-latex-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { Note } from '../../core/models/note.model';
import { environment } from '../../../environments/environment';

const note = (id: string, source = ''): Note => ({_id:id,userId:'user',title:'Física',docType:'latex',docData:{version:1,source},space:'Research',blocks:[],tags:[]});
describe('pure LaTeX document lifecycle', () => {
  let fixture: ComponentFixture<PureLatexEditorComponent>; let notes: NotesService; let http: HttpTestingController;
  const api = `${environment.apiUrl}/notes`;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    notes = TestBed.inject(NotesService); http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PureLatexEditorComponent);
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.useRealTimers(); });
  function load(value: Note): void {
    notes.loadNoteById(value._id).subscribe(); http.expectOne(`${api}/${value._id}`).flush(value);
    notes.isReadingMode.set(false); fixture.componentRef.setInput('note', value); fixture.detectChanges();
  }
  function input(value: string): void {
    const area = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    area.value = value; area.dispatchEvent(new Event('input',{bubbles:true})); fixture.detectChanges();
  }
  it('opens empty and saves typing to its owner before switching documents, without saving on open', async () => {
    load(note('one')); expect(fixture.componentInstance.source).toBe('');
    http.expectNone({method:'PUT',url:`${api}/one`});
    const source = '\\documentclass{article}\n\\begin{document}Física $\\frac{q}{r}$\\end{document}';
    input(source); expect(notes.currentNote()?.docData.source).toBe(source);
    load(note('two','otro'));
    await vi.advanceTimersByTimeAsync(900);
    const request = http.expectOne({method:'PUT',url:`${api}/one`}); expect(request.request.body.docData).toEqual({version:1,source});
    request.flush(note('one',source));
    expect(fixture.componentInstance.source).toBe('otro'); expect(notes.currentNote()?._id).toBe('two');
    load(note('one',source)); expect(fixture.componentInstance.source).toBe(source);
  });
  it('does not overwrite typing when an autosave echo supplies the same document identity', () => {
    load(note('one')); input('new text'); fixture.componentRef.setInput('note',note('one','old')); fixture.detectChanges();
    expect(fixture.componentInstance.source).toBe('new text');
  });
  it('keeps reading mode immutable and inserts the optional template only into an empty document', () => {
    load(note('one')); notes.isReadingMode.set(true); fixture.detectChanges();
    fixture.componentInstance.insertTemplate(); expect(fixture.componentInstance.source).toBe('');
    notes.isReadingMode.set(false); fixture.detectChanges(); fixture.componentInstance.insertTemplate(); fixture.detectChanges();
    expect(fixture.componentInstance.source).toContain('\\usepackage{amsmath,amssymb,geometry,multicol,booktabs,array}');
    input('personal'); fixture.componentInstance.insertTemplate(); expect(fixture.componentInstance.source).toBe('personal');
  });
  it('ignores file reads completing after the active document changes', async () => {
    load(note('one'));
    let resolve!: (value: string) => void;
    const input = {value:'file',files:[{name:'formula.tex',size:100,text:()=>new Promise<string>(r=>resolve=r)}]};
    const pending = fixture.componentInstance.importSource({target:input} as unknown as Event);
    load(note('two','second')); resolve('first'); await pending;
    expect(fixture.componentInstance.source).toBe('second'); expect(notes.currentNote()?.docData.source).toBe('second');
  });
  it('does not save a delayed file import after the editor has been destroyed', async () => {
    load(note('one'));
    let resolve!: (value: string) => void;
    const input = {value:'file',files:[{name:'formula.tex',size:100,text:()=>new Promise<string>(r=>resolve=r)}]};
    const pending = fixture.componentInstance.importSource({target:input} as unknown as Event);
    fixture.destroy(); resolve('late source'); await pending;
    expect(notes.currentNote()?.docData.source).toBe('');
    await vi.advanceTimersByTimeAsync(900); http.expectNone({method:'PUT',url:`${api}/one`});
  });
});
