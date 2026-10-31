import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { AiWriterService } from './services/ai-writer.service';
import { By } from '@angular/platform-browser';
import { WordStyleTemplatesModalComponent } from './components/word-style-templates-modal/word-style-templates-modal.component';
import { Note } from '../../core/models/note.model';

describe('Word Home through its real ribbon and editor template', () => {
  let fixture: ComponentFixture<PureDocEditorComponent>;
  beforeEach(async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    TestBed.configureTestingModule({ providers: [
      { provide: NotesService, useValue: { updateDocData: vi.fn() } },
      I18nService,
      { provide: WordCompatibilityService, useValue: {} },
      { provide: LatexRendererService, useValue: { renderLatexToHtml: () => '' } },
      { provide: AiWriterService, useValue: {} },
      { provide: ImageStoreService, useValue: { resolveImages: async (html: string) => html, externalizeImages: async (html: string) => html } },
    ] });
    fixture = TestBed.createComponent(PureDocEditorComponent);
    fixture.componentRef.setInput('note', { _id:'word', title:'Word',docType:'doc',docData:{ v:2,pages:[
      { id:'a',html:'<h1>Old first</h1><p id="sample" style="font-family:Arial Black;font-size:18pt;font-weight:900">Sample</p>' },
      { id:'b',html:'<h1>Old second</h1>',breakBefore:'manual' },
    ] } } as Note);
    fixture.detectChanges();
    for (let i=0;i<25;i++) await Promise.resolve();
    fixture.detectChanges();
  });
  afterEach(() => { fixture?.destroy(); window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });
  function click(label: string): void {
    const button = fixture.nativeElement.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.dispatchEvent(new MouseEvent('mousedown',{ bubbles:true,cancelable:true })); button.click(); fixture.detectChanges();
  }
  function selectSample(): void {
    const sample = fixture.nativeElement.querySelector('#sample') as HTMLElement;
    sample.closest<HTMLElement>('[data-page-body-id]')!.focus();
    const range = document.createRange(); range.selectNodeContents(sample);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  }
  it('updates H1 from the gallery menu and applies the same definition to another paragraph', () => {
    selectSample(); click('Opciones de H1');
    const update = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Actualizar H1'))!;
    update.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); update.click(); fixture.detectChanges();
    for (const heading of fixture.nativeElement.querySelectorAll('h1') as NodeListOf<HTMLElement>) {
      expect(heading.style.fontSize).toBe('18pt'); expect(heading.style.fontFamily).toContain('Arial Black');
    }
    selectSample(); click('Aplicar H1');
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('h1#sample').style.fontSize).toBe('18pt');
  });
  it('reloads the updated style in the designer and saves changes as one undo step', () => {
    selectSample(); fixture.componentInstance.handleUpdateStyleFromSelection('H1'); fixture.detectChanges();
    fixture.componentInstance.styleModalOpen.set(true); fixture.detectChanges();
    const modal = fixture.debugElement.query(By.directive(WordStyleTemplatesModalComponent)).componentInstance as WordStyleTemplatesModalComponent;
    expect(modal.currentRule().fontSizePt).toBe(18);
    modal.updateCurrentRule({ fontSizePt:22 }); modal.handleSaveAndApplyAll(); fixture.detectChanges();
    const editor = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('h1').style.fontSize).toBe('22pt');
    editor.handleGlobalUndo(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').style.fontSize).toBe('18pt');
    expect(editor.styleTemplates().find(template => template.id === editor.activeTemplateId())!.rules.H1.fontSizePt).toBe(18);
  });

  it('displays the selected nested font and keeps increasing its actual size', async () => {
    const sample = fixture.nativeElement.querySelector('#sample') as HTMLElement;
    sample.innerHTML = '<span style="font-family:Arial Black;font-size:18pt">Nested sample</span>';
    const editor = fixture.componentInstance;
    editor.commitPageDomToState(0);
    selectSample(); editor.updateSelectionFormats(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    const font = fixture.nativeElement.querySelector('select[aria-label="Familia tipográfica"]') as HTMLSelectElement;
    expect(font.selectedOptions[0].textContent).toBe('Arial Black');
    click('Aumentar tamaño de fuente');
    expect(window.getSelection()!.toString()).toBe('Nested sample');
    expect(editor.formats().fontSize).toBe('20');
    click('Aumentar tamaño de fuente'); expect(editor.formats().fontSize).toBe('22');
    click('Reducir tamaño de fuente'); expect(editor.formats().fontSize).toBe('20');
    await fixture.whenStable(); fixture.detectChanges();
    expect(font.selectedOptions[0].textContent).toBe('Arial Black');
  });

  it('applies a font chosen from the real selector and keeps the new value visible', async () => {
    selectSample(); fixture.componentInstance.updateSelectionFormats(); fixture.detectChanges(); await fixture.whenStable();
    const font = fixture.nativeElement.querySelector('select[aria-label="Familia tipográfica"]') as HTMLSelectElement;
    font.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); font.focus();
    const arial = Array.from(font.options).find(option=>option.textContent === 'Arial')!;
    font.value = arial.value; font.dispatchEvent(new Event('change',{bubbles:true}));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.formats().fontName).toBe('Arial');
    expect(font.selectedOptions[0].textContent).toBe('Arial');
    expect(window.getSelection()!.toString()).toBe('Sample');
  });

  it('switches the font selector when the caret moves between imported font runs', async () => {
    const sample = fixture.nativeElement.querySelector('#sample') as HTMLElement;
    sample.innerHTML = '<font face="Georgia">Legacy</font><span style="font-family:Courier New;font-size:14pt">Other</span>';
    fixture.componentInstance.commitPageDomToState(0);
    for (const [selector,expected] of [['font','Georgia'],['span','Courier New']]) {
      const range = document.createRange(); range.selectNodeContents(sample.querySelector(selector)!); range.collapse(false);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      const font = fixture.nativeElement.querySelector('select[aria-label="Familia tipográfica"]') as HTMLSelectElement;
      expect(font.selectedOptions[0].textContent).toBe(expected);
    }
  });

  it('applies subscript and superscript through the actual Home buttons and restores baseline', () => {
    selectSample(); click('Subíndice');
    expect(fixture.componentInstance.formats().subscript).toBe(true);
    expect(fixture.nativeElement.querySelector('#sample [data-word-script="sub"]')).toBeTruthy();
    click('Superíndice');
    expect(fixture.componentInstance.formats().subscript).toBe(false);
    expect(fixture.componentInstance.formats().superscript).toBe(true);
    click('Superíndice'); expect(fixture.componentInstance.formats().superscript).toBe(false);
    expect(fixture.componentInstance.formats().fontSize).toBe('18');
  });

  it('links numbered titles through Home while keeping semantic H1 and H2 styles', () => {
    click('Lista multinivel y títulos');
    const enable = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Títulos H1–H6:'))!;
    enable.click(); fixture.detectChanges();
    expect(Array.from(fixture.nativeElement.querySelectorAll('h1 [data-word-heading-number]') as NodeListOf<HTMLElement>).map(element=>element.textContent)).toEqual(['1. ','2. ']);
    selectSample(); click('Aplicar H2');
    expect(fixture.nativeElement.querySelector('h2#sample [data-word-heading-number]').textContent).toBe('1.1 ');
    expect(fixture.componentInstance.headings().map(heading=>heading.text)).toEqual(['1. Old first','1.1 Sample','2. Old second']);
  });

  it('opens and closes a working search panel through Home', () => {
    const find = Array.from(fixture.nativeElement.querySelectorAll('.editing-group button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.trim() === 'Buscar')!;
    find.click(); fixture.detectChanges();
    const query = fixture.nativeElement.querySelector('input[aria-label="Buscar en el documento"]') as HTMLInputElement;
    expect(document.activeElement).toBe(query);
    query.value = 'Old'; query.dispatchEvent(new Event('input',{bubbles:true})); fixture.detectChanges();
    click('Siguiente coincidencia'); expect(window.getSelection()!.toString()).toBe('Old');
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('1 de 2');
    click('Cerrar búsqueda'); expect(fixture.nativeElement.querySelector('app-word-search-panel')).toBeNull();
  });
});
