import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatexBlockComponent } from './latex-block.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { Note } from '../../core/models/note.model';
import { Block } from '../../core/models/block.model';
import { environment } from '../../../environments/environment';

const block = (formula = '',fontSizePx?: unknown): Block => ({ id:'formula',type:'latex',order:0,content:{formula,...(fontSizePx === undefined ? {} : {fontSizePx})} });
const note = (blocks: Block[],id='latex-note'): Note => ({_id:id,userId:'user',title:'LaTeX',space:'Research',docType:'block',tags:[],blocks});

describe('LaTeX formula size and empty blocks', () => {
  let fixture: ComponentFixture<LatexBlockComponent> | undefined;
  let notes: NotesService;
  let http: HttpTestingController;
  const api = `${environment.apiUrl}/notes`;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:I18nService,useValue:{currentLang:()=> 'es'}}]});
    notes = TestBed.inject(NotesService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { fixture?.destroy(); http.verify(); vi.useRealTimers(); });
  function load(value: Note): void {
    notes.loadNoteById(value._id).subscribe(); http.expectOne(`${api}/${value._id}`).flush(value); notes.isReadingMode.set(false);
  }
  function mount(value: Block): void {
    fixture = TestBed.createComponent(LatexBlockComponent); fixture.componentRef.setInput('block',value); fixture.detectChanges();
  }
  async function edit(): Promise<void> {
    fixture!.componentInstance.showToolbox.set(false);
    (fixture!.nativeElement.querySelector('.latex-display-card') as HTMLElement).click(); fixture!.detectChanges();
    await vi.advanceTimersByTimeAsync(45); fixture!.detectChanges();
  }
  function size(value: string): void {
    const input = fixture!.nativeElement.querySelector('input[type=number]') as HTMLInputElement;
    input.value = value; input.dispatchEvent(new Event('change',{bubbles:true})); fixture!.detectChanges();
  }
  async function saved(): Promise<Note> {
    await vi.advanceTimersByTimeAsync(900);
    const request = http.expectOne({method:'PUT',url:`${api}/latex-note`});
    const value = {...notes.currentNote()!,...request.request.body}; request.flush(value); return value;
  }

  it('creates an empty LaTeX block without a demo or generated formula', () => {
    load(note([])); notes.addBlock('latex');
    const added = notes.currentNote()!.blocks[0]; expect(added.content['formula']).toBe(''); mount(added);
    expect(fixture!.componentInstance.rawFormula).toBe('');
    expect(fixture!.nativeElement.querySelector('.main-display').textContent).toBe('');
    expect(fixture!.nativeElement.querySelector('.main-display .katex')).toBeNull();
  });

  it('preserves existing formulas and uses the old default size when no size was saved', () => {
    const value = block('x^2'); load(note([value])); mount(value);
    expect(fixture!.componentInstance.rawFormula).toBe('x^2');
    expect(fixture!.nativeElement.querySelector('.main-display').style.fontSize).toBe('11.5px');
    expect(fixture!.nativeElement.querySelector('.main-display').style.textAlign).toBe('center');
    expect(fixture!.nativeElement.querySelector('.main-display .katex')).toBeTruthy();
    http.expectNone({method:'PUT',url:`${api}/latex-note`});
  });

  it('aligns the live formula, persists alignment and restores it in reading mode', async () => {
    const value = block('x^2'); load(note([value])); mount(value); await edit();
    const button = fixture!.nativeElement.querySelector('[aria-label="Alinear a la derecha"]') as HTMLButtonElement;
    button.click(); fixture!.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(fixture!.nativeElement.querySelector('.live-preview-box .math-render-surface').style.textAlign).toBe('right');
    const persisted = await saved(); expect(persisted.blocks[0].content['alignment']).toBe('right');
    fixture!.destroy(); fixture=undefined;load(persisted);notes.isReadingMode.set(true);mount(persisted.blocks[0]);
    expect(fixture!.nativeElement.querySelector('.main-display').style.textAlign).toBe('right');
    fixture!.componentInstance.setAlignment('left');expect(fixture!.componentInstance.alignment()).toBe('right');
  });

  it('saves independent row alignment and retains it after insertion and reopening', async () => {
    const value = block('a=1\nb=2'); load(note([value])); mount(value); await edit();
    const component = fixture!.componentInstance;
    component.setAlignByLine(true); component.setLineAlignment(0,'left'); component.setLineAlignment(1,'right');
    component.onSourceChange('new=0\na=1\nb=2'); fixture!.detectChanges();
    expect(component.lineAlignments()).toEqual([null,'left','right']);
    const persisted = await saved();
    expect(persisted.blocks[0].content).toMatchObject({alignByLine:true,lineAlignments:[null,'left','right']});
    fixture!.destroy(); fixture=undefined; load(persisted); notes.isReadingMode.set(true); mount(persisted.blocks[0]);
    const rows = Array.from(fixture!.nativeElement.querySelectorAll('.main-display .latex-equation-row')) as HTMLElement[];
    expect(rows.map(row=>row.style.textAlign)).toEqual(['center','left','right']);
  });

  it('resizes the live formula, saves through NotesService and keeps the size after reopening', async () => {
    const value = block('x^2'); load(note([value])); mount(value); await edit();
    size('24');
    expect(fixture!.nativeElement.querySelector('.live-preview-box .math-render-surface').style.fontSize).toBe('24px');
    expect(fixture!.nativeElement.querySelector('.live-preview-box .katex')).toBeTruthy();
    const persisted = await saved();
    expect(persisted.blocks[0].content).toMatchObject({formula:'x^2',fontSizePx:24});
    fixture!.destroy(); fixture = undefined;
    load(persisted); mount(persisted.blocks[0]);
    expect(fixture!.nativeElement.querySelector('.main-display').style.fontSize).toBe('24px');
    expect(fixture!.nativeElement.querySelector('.main-display .katex')).toBeTruthy();
  });

  it('supports increase/decrease controls and keeps edits open when focusing the numeric field', async () => {
    const value = block('a+b',16); load(note([value])); mount(value); await edit();
    const textarea = fixture!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const input = fixture!.nativeElement.querySelector('input[type=number]') as HTMLInputElement;
    textarea.dispatchEvent(new FocusEvent('blur',{relatedTarget:input})); fixture!.detectChanges();
    expect(fixture!.componentInstance.isEditing()).toBe(true);
    (fixture!.nativeElement.querySelector('[aria-label="Aumentar tamaño de fórmula"]') as HTMLButtonElement).click(); fixture!.detectChanges();
    expect(input.value).toBe('18');
    (fixture!.nativeElement.querySelector('[aria-label="Reducir tamaño de fórmula"]') as HTMLButtonElement).click(); fixture!.detectChanges();
    expect(input.value).toBe('16');
    (fixture!.nativeElement.querySelector('.done-btn') as HTMLButtonElement).click(); fixture!.detectChanges();
    await vi.advanceTimersByTimeAsync(35); fixture!.detectChanges();
    expect(fixture!.nativeElement.querySelector('.main-display').style.fontSize).toBe('16px');
    await saved();
  });

  it('bounds committed sizes and retains the last valid value when the field is empty', async () => {
    const value = block('x',16); load(note([value])); mount(value); await edit();
    size(''); expect(fixture!.componentInstance.fontSizePx()).toBe(16);
    size('200'); expect(fixture!.componentInstance.fontSizePx()).toBe(96);
    size('2'); expect(fixture!.componentInstance.fontSizePx()).toBe(8);
    size('17.5'); expect(fixture!.componentInstance.fontSizePx()).toBe(17.5);
    const persisted = await saved(); expect(persisted.blocks[0].content['fontSizePx']).toBe(17.5);
  });

  it('does not replace a cleared formula with the example when reopened', async () => {
    const value = block('a+b',20); load(note([value])); mount(value); await edit();
    fixture!.componentInstance.clearFormula(); fixture!.componentInstance.saveAndPreview(); fixture!.detectChanges();
    await vi.advanceTimersByTimeAsync(35); fixture!.detectChanges();
    expect(fixture!.nativeElement.querySelector('.main-display').textContent).toBe('');
    const persisted = await saved(); expect(persisted.blocks[0].content).toMatchObject({formula:'',fontSizePx:20});
    fixture!.destroy(); fixture=undefined; load(persisted); mount(persisted.blocks[0]);
    expect(fixture!.componentInstance.rawFormula).toBe('');
  });

  it('retains the last formula and size in the original document after changing tabs', async () => {
    const value = block('x',16); load(note([value])); mount(value); await edit(); size('28');
    fixture!.componentInstance.rawFormula = 'x^3'; fixture!.componentInstance.onFormulaInput();
    load(note([block('Other',10)],'other'));
    fixture!.destroy(); fixture = undefined;
    expect(notes.currentNote()!.blocks[0].content).toMatchObject({formula:'Other',fontSizePx:10});
    await vi.advanceTimersByTimeAsync(900);
    const request = http.expectOne({method:'PUT',url:`${api}/latex-note`});
    expect(request.request.body.blocks[0].content).toMatchObject({formula:'x^3',fontSizePx:28});
    request.flush({...note([value]),...request.request.body});
    http.expectNone({method:'PUT',url:`${api}/other`});
  });

  it('shows the saved size in reading mode and rejects editing', async () => {
    const value = block('x',32); load(note([value])); notes.isReadingMode.set(true); mount(value);
    fixture!.componentInstance.enableEdit(); fixture!.componentInstance.setFontSize(48); fixture!.detectChanges();
    expect(fixture!.nativeElement.querySelector('input')).toBeNull();
    expect(fixture!.nativeElement.querySelector('.main-display').style.fontSize).toBe('32px');
    await vi.advanceTimersByTimeAsync(900); http.expectNone({method:'PUT',url:`${api}/latex-note`});
  });

  it('detects a full document on paste, enables advanced preview and persists the source unchanged', async () => {
    const value = block(); load(note([value])); mount(value); await edit();
    const source = '\\documentclass{article}\n\\begin{document}Física\\end{document}';
    const area = fixture!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    area.value = source; area.dispatchEvent(new Event('input',{bubbles:true})); fixture!.detectChanges();
    expect(fixture!.componentInstance.documentMode()).toBe(true);
    expect(fixture!.nativeElement.querySelector('app-latex-preview')).toBeTruthy();
    expect(fixture!.nativeElement.querySelector('.live-preview-box')).toBeNull();
    fixture!.componentInstance.saveAndPreview(); fixture!.detectChanges();
    const persisted = await saved(); expect(persisted.blocks[0].content).toMatchObject({formula:source,mode:'document'});
  });

  it('auto-switches circuitikz environments in a block to PDF document compilation mode', async () => {
    const value = block(); load(note([value])); mount(value); await edit();
    const source = '\\begin{circuitikz}\n  \\draw (0,0) to[R, l=<10\\ohm>] (3,0);\n\\end{circuitikz}';
    const area = fixture!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    area.value = source; area.dispatchEvent(new Event('input',{bubbles:true})); fixture!.detectChanges();
    expect(fixture!.componentInstance.documentMode()).toBe(true);
    expect(fixture!.nativeElement.querySelector('app-latex-preview')).toBeTruthy();
    fixture!.componentInstance.saveAndPreview(); fixture!.detectChanges();
    const persisted = await saved(); expect(persisted.blocks[0].content).toMatchObject({formula:source,mode:'document'});
  });
});
