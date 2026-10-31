import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiDocumentService, AiEditorAdapter } from './ai-document.service';
import { AiService } from './ai.service';
import { NotesService } from './notes.service';
import { AiAssistantSidebarComponent } from '../../layout/ai-assistant-sidebar/ai-assistant-sidebar.component';
import { htmlTextFields, domTextFields, applyHtmlText, richTextHtml, cleanLatexSource, unwrapCodeFence } from '../utils/ai-edit-text';
import { sheetAiAdapter } from '../../shared/utils/ai-sheet-adapter';
import { slideAiAdapter } from '../../shared/utils/ai-slide-adapter';

describe('document edits from the main assistant', () => {
  const currentNote = signal<any>({ _id: 'a' });
  const isReadingMode = signal(false);
  let service: AiDocumentService;
  beforeEach(() => {
    currentNote.set({ _id: 'a' }); isReadingMode.set(false);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NotesService, useValue: { currentNote, isReadingMode } }] });
    service = TestBed.inject(AiDocumentService);
  });
  it('validates all replacements before writing and preserves concurrent edits', () => {
    const values = new Map([['first', 'uno'], ['second', 'dos']]);
    const apply = vi.fn((changes: Map<string, string>) => changes.forEach((v, k) => values.set(k, v)));
    const adapter: AiEditorAdapter = { owner: () => 'a', fields: () => [...values].map(([id, text]) => ({ id, text })), apply };
    service.register(adapter);
    const snapshot = service.capture(); values.set('second', 'manual');
    expect(() => service.apply(snapshot, [{ target: 'first', before: 'uno', after: 'one' }, { target: 'second', before: 'dos', after: 'two' }])).toThrow(/cambió/);
    expect(apply).not.toHaveBeenCalled(); expect(values.get('first')).toBe('uno');
    service.apply(service.capture(), [{ target: 'first', before: 'uno', after: '$&nuevo' }]);
    expect(values.get('first')).toBe('$&nuevo');
  });
  it('rejects other documents, reading mode and destroyed editors', () => {
    const apply = vi.fn();
    const unregister = service.register({ owner: () => 'a', fields: () => [{ id: 'text', text: 'hola' }], apply });
    const snapshot = service.capture(); const edits = [{ target: 'text', before: 'hola', after: 'adiós' }];
    currentNote.set({ _id: 'b' }); expect(() => service.apply(snapshot, edits)).toThrow();
    currentNote.set({ _id: 'a' }); isReadingMode.set(true); expect(() => service.apply(snapshot, edits)).toThrow();
    isReadingMode.set(false); unregister(); expect(() => service.apply(snapshot, edits)).toThrow();
    expect(apply).not.toHaveBeenCalled();
  });
  it('bounds document context before transport without removing unseen source', () => {
    let text = 'a'.repeat(50_000);
    service.register({ owner: () => 'a', fields: () => [{ id: 'latex', text }], apply: changes => { text = changes.get('latex')!; } });
    const snapshot = service.capture();
    expect(snapshot.targets[0].text.length).toBe(15_000); expect(snapshot.truncated).toBe(true);
    service.apply(snapshot, [{ target: 'latex', before: '', after: 'END' }]);
    expect(text).toBe('a'.repeat(50_000) + 'END');
  });
  it('reads readonly editor content and stops before materializing later document pages', () => {
    const body = document.createElement('div'); body.contentEditable = 'false';
    body.innerHTML = '<p>Texto legible</p><span contenteditable="false">Fórmula protegida</span>';
    expect([...domTextFields(body, 'page')].map(field => field.text)).toEqual(['Texto legible', '']);
    service.register({ owner: () => 'a', fields: function* () {
      yield { id: 'one', text: 'a'.repeat(15_000) };
      yield { id: 'two', text: 'b'.repeat(15_000) };
      yield { id: 'three', text: '' };
      throw new Error('Unnecessary page extraction');
    }, apply: () => {} });
    expect(service.capture().truncated).toBe(true);
  });
  it('changes HTML text while preserving formatting, images, tables and safe literal output', () => {
    const html = '<h2><b>Hola</b></h2><table><tbody><tr><td>Mundo</td></tr></tbody></table><img src="/image.png">';
    const fields = htmlTextFields(html, 'block:1');
    const next = applyHtmlText(html, 'block:1', new Map([[fields[0].id, '<script>bad()</script>'], ['block:1:append', 'Nuevo\nPárrafo']]));
    const body = new DOMParser().parseFromString(next, 'text/html').body;
    expect(body.querySelector('script')).toBeNull(); expect(body.querySelector('b')?.textContent).toBe('<script>bad()</script>');
    expect(body.querySelector('td')?.textContent).toBe('Mundo'); expect(body.querySelector('img')?.getAttribute('src')).toBe('/image.png');
    expect(body.querySelectorAll('p')).toHaveLength(2);
  });
  it('updates worksheet formulas through the live facade and saves its snapshot', () => {
    const setValue = vi.fn(); const persist = vi.fn();
    const sheet = { getSheetId: () => 's1', getRange: vi.fn(() => ({ setValue })) };
    const snapshot = { sheets: { s1: { cellData: { 0: { 0: { v: 12, s: 'bold' } } } } } };
    const book = { save: () => snapshot, getSheets: () => [sheet] };
    const adapter = sheetAiAdapter(() => 'a', () => book, persist);
    expect(Array.from(adapter.fields())[0]).toEqual({ id: 'cell:s1:1:1', text: '12' });
    adapter.apply(new Map([['cell:s1:1:1', '=SUM(B1:B3)']]));
    expect(setValue).toHaveBeenCalledWith({ f: '=SUM(B1:B3)', v: null, p: null }); expect(persist).toHaveBeenCalledWith(snapshot);
  });
  it('changes PPTX rich text segments and appends text without dropping images or selecting another slide', () => {
    const element = { id: 't', type: 'text', textSegments: [{ text: 'Hola', style: { bold: true } }, { text: ' mundo' }] };
    const viewer = { getSlides: () => [{ elements: [element, { id: 'img', type: 'image' }] }], getActiveSlideIndex: () => 2, setActiveSlideIndex: vi.fn(), updateElement: vi.fn() };
    const addText = vi.fn(); const persist = vi.fn();
    const adapter = slideAiAdapter(() => 'a', () => viewer, addText, persist);
    adapter.apply(new Map([['slide:1:t:0', 'Adiós'], ['slide:1:append', 'Más contenido']]));
    expect(viewer.updateElement).toHaveBeenCalledWith('t', { text: 'Adiós mundo', textSegments: [{ text: 'Adiós', style: { bold: true } }, { text: ' mundo' }] });
    expect(addText).toHaveBeenCalledWith(0, 'Más contenido'); expect(viewer.setActiveSlideIndex).toHaveBeenLastCalledWith(2); expect(persist).toHaveBeenCalled();
  });
  it('enables AI direct editing on Word and Excel documents without requiring topbar edit mode', async () => {
    let content = 'Texto inicial';
    service.register({ owner: () => currentNote()?._id, fields: () => [{ id: 'page:1:text:0', text: content }], apply: changes => { content = changes.get('page:1:text:0')!; } });
    isReadingMode.set(true);

    for (const docType of ['doc', 'sheet', 'slide'] as const) {
      currentNote.set({ _id: `n-${docType}`, title: docType, docType });
      expect(service.isReadingLocked()).toBe(false);
      const snapshot = service.capture();
      service.apply(snapshot, [{ target: 'page:1:text:0', before: content, after: `Editado ${docType}` }]);
      expect(content).toBe(`Editado ${docType}`);
    }

    const ai = TestBed.inject(AiService);
    const http = TestBed.inject(HttpTestingController);
    ai.isSidebarOpen.set(true);
    ai.includeDocumentContext.set(true);
    currentNote.set({ _id: 'block-1', title: 'Nota de bloques', docType: 'block' });

    const fixture = TestBed.createComponent(AiAssistantSidebarComponent);
    http.match(() => true).forEach(req => req.flush([]));
    fixture.detectChanges();
    await fixture.whenStable();

    const checkbox = () => fixture.nativeElement.querySelector('.ai-edit-mode input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Activa Editar en el documento para permitir cambios.');

    currentNote.set({ _id: 'word-1', title: 'Informe Word', docType: 'doc' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(checkbox().disabled).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Activa Editar en el documento para permitir cambios.');

    currentNote.set({ _id: 'excel-1', title: 'Libro Excel', docType: 'sheet' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(checkbox().disabled).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Activa Editar en el documento para permitir cambios.');
  });
  it('converts Markdown into each document native format instead of pasting raw Markdown syntax', () => {
    const wordNext = applyHtmlText('<p>Borrador</p>', 'page:p1', new Map([
      ['page:p1:text:0', '# Informe Anual\n\n## Objetivos\nLograr **crecimiento** y *calidad*.\n\n- Reducir costos\n- Aumentar ventas\n\n| Área | Meta |\n| --- | --- |\n| Ventas | +25% |'],
      ['page:p1:append', '```python\nprint("ok")\n```'],
    ]));
    const docBody = new DOMParser().parseFromString(wordNext, 'text/html').body;
    expect(docBody.querySelector('h1')?.textContent).toBe('Informe Anual');
    expect(docBody.querySelector('h2')?.textContent).toBe('Objetivos');
    expect(docBody.querySelector('strong')?.textContent).toBe('crecimiento');
    expect(docBody.querySelector('em')?.textContent).toBe('calidad');
    expect(Array.from(docBody.querySelectorAll('ul li'), el => el.textContent)).toEqual(['Reducir costos', 'Aumentar ventas']);
    expect(docBody.querySelector('table td')?.textContent).toBe('Ventas');
    expect(docBody.querySelector('pre code')?.getAttribute('data-lang')).toBe('python');
    expect(docBody.textContent).not.toContain('##');
    expect(docBody.textContent).not.toContain('**');

    const blockHtml = richTextHtml('### Conclusión\n1. **Primero**\n2. *Segundo*');
    const blockBody = new DOMParser().parseFromString(blockHtml, 'text/html').body;
    expect(blockBody.querySelector('h3')?.textContent).toBe('Conclusión');
    expect(blockBody.querySelector('ol strong')?.textContent).toBe('Primero');

    const setValue = vi.fn();
    const sheet = { getSheetId: () => 's1', getRange: vi.fn(() => ({ setValue })) };
    const book = { save: () => ({ sheets: { s1: { cellData: {} } } }), getSheets: () => [sheet] };
    const sheetAdapter = sheetAiAdapter(() => 'a', () => book, () => {});
    sheetAdapter.apply(new Map([
      ['cell:s1:1:1', '**Total General**'],
      ['cell:s1:1:2', '`=SUM(B2:B5)`'],
      ['cell:s1:1:3', '=C2*D2'],
      ['cell:s1:1:4', '**1500**'],
    ]));
    expect(setValue).toHaveBeenNthCalledWith(1, { v: 'Total General', f: null, p: null });
    expect(setValue).toHaveBeenNthCalledWith(2, { f: '=SUM(B2:B5)', v: null, p: null });
    expect(setValue).toHaveBeenNthCalledWith(3, { f: '=C2*D2', v: null, p: null });
    expect(setValue).toHaveBeenNthCalledWith(4, { v: 1500, f: null, p: null });

    const addText = vi.fn();
    const viewer = { getSlides: () => [{ elements: [] }], getActiveSlideIndex: () => 0, setActiveSlideIndex: vi.fn(), updateElement: vi.fn() };
    const slideAdapter = slideAiAdapter(() => 'a', () => viewer, addText, () => {});
    slideAdapter.apply(new Map([['slide:1:append', '## Resumen\n- **Meta** *anual*']]));
    expect(addText).toHaveBeenCalledWith(0, 'Resumen\n• Meta anual');

    expect(cleanLatexSource('```latex\n## Método\nTexto **clave**\n```', true)).toBe('\\subsection{Método}\nTexto \\textbf{clave}');
    expect(unwrapCodeFence('```mermaid\ngraph TD\nA-->B\n```')).toBe('graph TD\nA-->B');
  });
});
