import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownBlockComponent } from './markdown-block.component';
import { NotesService } from '../../core/services/notes.service';
import { CodeMirrorRuntimeService } from '../../shared/markdown/codemirror-runtime.service';

describe('Markdown block persistence and fallback', () => {
  let fixture: ComponentFixture<MarkdownBlockComponent>;
  const save = vi.fn(), reading = signal(false), currentNote = signal({_id:'owner'});
  beforeEach(() => {
    vi.useFakeTimers(); save.mockReset(); reading.set(false); currentNote.set({_id:'owner'});
    TestBed.configureTestingModule({providers:[
      {provide:NotesService,useValue:{updateBlockContent:save,isReadingMode:reading,currentNote}},
      {provide:CodeMirrorRuntimeService,useValue:{load:()=>Promise.reject(new Error('offline'))}},
    ]});
    fixture=TestBed.createComponent(MarkdownBlockComponent);
    fixture.componentRef.setInput('block',{id:'text',type:'text',order:0,content:{format:'markdown',markdown:'# Guardado',html:'<h1>Guardado</h1>'}});
    fixture.detectChanges();
  });
  afterEach(()=>{fixture.destroy();vi.useRealTimers();});
  it('keeps the editor usable after runtime load failure and saves canonical source plus safe HTML', async()=>{
    await Promise.resolve();fixture.detectChanges();
    const textarea=fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# Guardado');
    textarea.value='## Nuevo\n\n**Contenido**';textarea.dispatchEvent(new Event('input'));fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(260);
    expect(save).toHaveBeenLastCalledWith('text',expect.objectContaining({format:'markdown',markdown:textarea.value,html:expect.stringContaining('<strong>Contenido</strong>')}),'owner');
  });
  it('flushes pending text to its owning document on destruction after navigation',()=>{
    fixture.componentInstance.changeSource('Última edición'); currentNote.set({_id:'other'}); fixture.destroy();
    expect(save).toHaveBeenCalledWith('text',expect.objectContaining({markdown:'Última edición'}),'owner');
  });
  it('switches back to rich text using the latest source, without a stale trailing save',async()=>{
    fixture.componentInstance.changeSource('**Final**'); fixture.componentInstance.useRichText();
    expect(save).toHaveBeenLastCalledWith('text',{format:'richtext',html:'<p><strong>Final</strong></p>\n'},'owner');
    const count=save.mock.calls.length; await vi.advanceTimersByTimeAsync(500); fixture.destroy(); expect(save).toHaveBeenCalledTimes(count);
  });
  it('provides a visible toolbar that formats the fallback selection and preserves ownership', async()=>{
    await Promise.resolve(); fixture.detectChanges();
    const textarea=fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value='Hola mundo'; textarea.dispatchEvent(new Event('input')); textarea.setSelectionRange(5,10);
    (fixture.nativeElement.querySelector('[aria-label="Negrita"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(fixture.componentInstance.source()).toBe('Hola **mundo**');
    expect(textarea.selectionStart).toBe(7); expect(textarea.selectionEnd).toBe(12);
    expect(save).toHaveBeenLastCalledWith('text',expect.objectContaining({markdown:'Hola **mundo**'}),'owner');
    expect(fixture.componentInstance.live()).toBe(true);
  });
  it('opens legacy HTML in live preview without persisting a migration during reading',()=>{
    fixture.destroy(); reading.set(true); save.mockClear();
    fixture=TestBed.createComponent(MarkdownBlockComponent);
    fixture.componentRef.setInput('block',{id:'text',type:'text',order:0,content:{html:'<h2>Title</h2><p>Body</p>'}});
    fixture.detectChanges();
    expect(fixture.componentInstance.live()).toBe(true); expect(fixture.componentInstance.source()).toBe('## Title\n\nBody');
    fixture.destroy(); expect(save).not.toHaveBeenCalled();
  });

  it('uses the latest rich HTML when reopening instead of stale retained Markdown',()=>{
    fixture.destroy(); save.mockClear();
    fixture=TestBed.createComponent(MarkdownBlockComponent);
    fixture.componentRef.setInput('block',{id:'text',type:'text',order:0,content:{format:'richtext',markdown:'Old',html:'<h2>Newest</h2>'}});
    fixture.detectChanges(); expect(fixture.componentInstance.source()).toBe('## Newest');
    const request = vi.spyOn(fixture.componentInstance.richTextRequested, 'emit');
    fixture.componentInstance.useRichText(); expect(request).toHaveBeenCalledOnce();
    expect(save).toHaveBeenLastCalledWith('text',expect.objectContaining({html:'<h2>Newest</h2>\n'}),'owner');
  });

  it('opens visual rich editing rather than wrapping hidden HTML with Markdown markers',()=>{
    fixture.componentInstance.changeSource('<table><tr><th colspan="2">Merged</th></tr></table>');
    const request = vi.spyOn(fixture.componentInstance.richTextRequested,'emit');
    fixture.componentInstance.format('bold');
    expect(request).toHaveBeenCalledOnce(); expect(fixture.componentInstance.source()).not.toContain('**');
  });

  it('does not mutate content in reading mode',()=>{
    reading.set(true);fixture.detectChanges();fixture.componentInstance.changeSource('bad');fixture.componentInstance.useRichText();
    expect(save).not.toHaveBeenCalled();expect(fixture.componentInstance.source()).toBe('# Guardado');
  });
});
