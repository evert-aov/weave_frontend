import { emptySource } from './models/academic.model';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentPage } from './models/word-document.model';
import { BUILTIN_STYLE_TEMPLATES } from './constants/word-document.constants';
import { findDocumentText, selectedParagraphs } from './utils/document-formatting';
import { WordStyleTemplatesModalComponent } from './components/word-style-templates-modal/word-style-templates-modal.component';
import type { DocDataV2 } from './models/word-editor-state.model';
import type { WordFlowController } from './controllers/word-flow.controller';
import { Note } from '../../core/models/note.model';

interface Internals {
  pageBodyMap: Map<string, HTMLElement>;
  syncInnerHtml(): void;
  collectDocData(): any;
  hydrateFromNote(): Promise<void>;
  documentReady: { set(value: boolean): void };
}

describe('Word Home and document-wide styles', () => {
  let editor: PureDocEditorComponent;
  let dom: Internals;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    TestBed.configureTestingModule({ providers: [
      { provide: NotesService, useValue: { updateDocData: vi.fn() } },
      { provide: I18nService, useValue: { t: (key: string) => key } },
      { provide: WordCompatibilityService, useValue: {} },
      { provide: LatexRendererService, useValue: {} },
      { provide: ImageStoreService, useValue: { resolveImages: async (html: string) => html, externalizeImages: async (html: string) => html } },
    ] });
    editor = TestBed.runInInjectionContext(() => new PureDocEditorComponent());
    dom = editor as unknown as Internals;
  });
  afterEach(() => {
    editor.ngOnDestroy(); document.body.replaceChildren();
    window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals();
  });
  function render(pages: DocumentPage[]): void {
    editor.pages.set(pages);
    for (const page of pages) {
      const body = document.createElement('div'); body.contentEditable = 'true'; body.tabIndex = 0;
      body.dataset['pageBodyId'] = page.id; body.innerHTML = page.html;
      body.style.cssText = 'font-family: Times New Roman; font-size: 12pt; line-height: 1.15';
      document.body.appendChild(body); dom.pageBodyMap.set(page.id, body);
    }
    dom.documentReady.set(true);
  }
  function node(selector: string): HTMLElement { return document.querySelector<HTMLElement>(selector)!; }
  function select(element: HTMLElement, start?: number, end?: number): Range {
    element.closest<HTMLElement>('[data-page-body-id]')!.focus();
    const range = document.createRange();
    if (start !== undefined) { range.setStart(element.firstChild!,start); range.setEnd(element.firstChild!, end ?? start); }
    else range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    return range;
  }
  function command(command: string, value?: string): void { editor.onRibbonCommand({ command, value }); }
  function activeRule() { return editor.styleTemplates().find(t => t.id === editor.activeTemplateId())!.rules.H1; }

  it('applies the remaining APA paragraph and heading rules including run-in H4/H5', () => {
    render([{ id: 'a', html: '<h1>Principal</h1><h4>Procedimiento</h4><p>El estudio <strong>continúa</strong> aquí.</p>' }]);
    editor.headingNumbering.set(true); editor.layoutConfig.update(layout => ({ ...layout, hyphenation: true }));
    editor.handleApplyTemplateToDocument(BUILTIN_STYLE_TEMPLATES.find(t => t.id === 'apa-times-12')!);
    expect(editor.headingNumbering()).toBe(false); expect(editor.layoutConfig().hyphenation).toBe(false);
    expect(node('[data-apa-run-in="4"]').textContent).toBe('Procedimiento. El estudio continúa aquí.');
    expect(node('h1').style.marginBottom).toBe('0pt');
    expect(node('[data-apa-run-in] strong').style.fontWeight).toBe('bold');
    expect(editor.headings().some(h => h.level === 4 && h.text === 'Procedimiento.')).toBe(true);
  });

  it('inserts a long direct quotation as an APA block and requires a locator', () => {
    render([{ id: 'a', html: '<p>Antes. Después.</p>' }]);
    const source = { ...emptySource(), id: 'quote', title: 'Libro', year: '2024', authors: [{ family: 'Autor', given: 'Ana' }] };
    editor.academic.save(source); select(node('p'), 7); editor.academic.show();
    const quoteText = Array.from({ length: 42 }, (_, i) => `palabra${i}`).join(' ');
    editor.academic.cite({ sourceId: 'quote', narrative: false, locator: '', quoteText });
    expect(editor.academic.error()).toBeTruthy(); expect(document.querySelector('blockquote')).toBeNull();
    editor.academic.cite({ sourceId: 'quote', narrative: false, locator: 'p. 8', quoteText });
    expect(node('blockquote').style.marginLeft).toBe('36pt');
    expect(node('blockquote').textContent).toContain('palabra41. (Autor, 2024, p. 8)');
    expect(document.body.textContent).toContain('Antes.'); expect(document.body.textContent).toContain('Después.');
    expect(node('blockquote p').style.lineHeight).toBe('2');
  });

  it('inserts, edits and removes notes with one reversible document operation', () => {
    render([{ id: 'a', html: '<p>Texto.</p>' }]); select(node('p'), 6); editor.academic.show('notes');
    editor.academic.saveNote({ kind: 'footnote', text: 'Aclaración importante.' });
    const ref = node('[data-word-note-id]');
    expect(ref.textContent).toBe('1'); expect(ref.dataset['noteContent']).toBe('Aclaración importante.');
    const id = ref.dataset['wordNoteId']!;
    editor.academic.notes.save({ id, kind: 'footnote', text: 'Nota editada.' });
    expect(ref.dataset['noteContent']).toBe('Nota editada.');
    editor.handleGlobalUndo(); expect(editor.pages()[0].html).toContain('Aclaración importante.');
    editor.academic.notes.remove(id); expect(editor.pages()[0].html).not.toContain('data-word-note-id');
  });

  it('applies APA page geometry and restores layout together with styles on undo and redo', () => {
    render([{ id: 'a', html: '<h1>Título</h1><p>Texto</p>' }]);
    const original = { ...editor.layoutConfig(), margins: { topPx: 40, rightPx: 50, bottomPx: 60, leftPx: 70, label: 'Custom' }, headerHtml: '<p>Anterior</p>' };
    editor.layoutConfig.set(original);
    editor.handleApplyTemplateToDocument(BUILTIN_STYLE_TEMPLATES.find(t => t.id === 'apa-arial-11')!);
    expect(editor.layoutConfig().apa).toMatchObject({ mode: 'student', fontFamily: 'Arial', fontSizePt: 11 });
    expect(editor.layoutConfig().margins.leftPx).toBe(96);
    expect(editor.maxBodyContentHeightPx()).toBe(editor.sheetHeightPx() - 192);
    expect(dom.collectDocData().layoutConfig.apa.mode).toBe('student');
    editor.handleGlobalUndo(); expect(editor.layoutConfig()).toEqual(original);
    editor.handleGlobalRedo(); expect(editor.layoutConfig().margins.leftPx).toBe(96);
  });

  it('supports professional APA running heads without replacing previous header content', () => {
    render([{ id: 'a', html: '<p>Texto</p>' }]);
    editor.layoutConfig.update(layout => ({ ...layout, headerHtml: '<p>Conservar</p>' }));
    editor.academic.pageSettings({ mode: 'professional', runningHead: 'Mi trabajo profesional' });
    expect(editor.layoutConfig().apa?.runningHead).toBe('MI TRABAJO PROFESIONAL');
    expect(editor.layoutConfig().headerHtml).toBe('<p>Conservar</p>');
    editor.handleGlobalUndo(); expect(editor.layoutConfig().apa).toBeUndefined();
  });

  it('updates an existing TOC from live headings and page positions, and supports undo', () => {
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.formatCleanHeadingTitle = WordCompatibilityService.prototype.formatCleanHeadingTitle;
    compatibility.buildSingleTocEntryHtml = WordCompatibilityService.prototype.buildSingleTocEntryHtml;
    compatibility.buildPaginatedTocPagesHtml = WordCompatibilityService.prototype.buildPaginatedTocPagesHtml;
    render([{ id: 'toc', html: '<div class="word-toc-page-section">Índice viejo</div>' }, { id: 'body', html: '<h1 id="intro">Introducción</h1>' }]);
    node('[data-page-body-id="body"]').insertAdjacentHTML('beforeend', '<h2>Nuevo apartado</h2>');
    editor.handleUpdateToc();
    expect(editor.pages()).toHaveLength(2);
    expect(editor.pages()[0].html).toContain('Nuevo apartado');
    expect(editor.pages()[0].html).toContain('data-toc-page="1"');
    expect(editor.pages()[0].html).not.toContain('Índice viejo');
    expect(editor.importedTocEntries()).toEqual([]);
    editor.handleGlobalUndo(); expect(editor.pages()[0].html).toContain('Índice viejo');
    expect(editor.pages()[1].html).toContain('Nuevo apartado');
  });

  it('refreshes and styles an existing TOC when applying APA within the same undo step', () => {
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.formatCleanHeadingTitle = WordCompatibilityService.prototype.formatCleanHeadingTitle;
    compatibility.buildSingleTocEntryHtml = WordCompatibilityService.prototype.buildSingleTocEntryHtml;
    compatibility.buildPaginatedTocPagesHtml = WordCompatibilityService.prototype.buildPaginatedTocPagesHtml;
    render([{ id: 'toc', html: '<div class="word-toc-page-section">Índice viejo</div>' }, { id: 'body', html: '<h1 id="intro">Introducción</h1><h2>Nuevo apartado</h2>' }]);
    editor.activePageIndex.set(1);
    editor.handleApplyTemplateToDocument(BUILTIN_STYLE_TEMPLATES.find(t => t.id === 'apa-arial-11')!);
    const toc = document.createElement('div'); toc.innerHTML = editor.pages()[0].html;
    const header = toc.querySelector<HTMLElement>('.word-toc-header')!;
    expect(header.textContent).toBe('Índice de contenido');
    expect(header.style.fontFamily).toBe('Arial');
    expect(header.style.fontSize).toBe('11pt');
    expect(header.style.lineHeight).toBe('2');
    expect(header.style.textTransform).toBe('none');
    expect(header.style.marginBottom).toBe('0pt');
    expect(toc.textContent).toContain('Nuevo apartado');
    expect(editor.pages()[0].html).toContain('data-toc-page="1"');
    expect(editor.activePageIndex()).toBe(1);
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toContain('Índice viejo');
    expect(editor.layoutConfig().apa).toBeUndefined();
  });

  it('does not create a TOC when applying APA to a document without one', () => {
    render([{ id: 'body', html: '<h1>Introducción</h1><p>Texto</p>' }]);
    editor.handleApplyTemplateToDocument(BUILTIN_STYLE_TEMPLATES.find(t => t.id === 'apa-times-12')!);
    expect(editor.pages()).toHaveLength(1);
    expect(editor.pages()[0].html).not.toContain('word-toc-page-section');
  });

  it('exposes later chapter headings before the AI target limit without changing node IDs', () => {
    render([{ id: 'first', html: '<h1>CAPÍTULO II</h1>' + '<p>Contenido extenso</p>'.repeat(2100) },
      { id: 'last', html: '<h2><b>2.4 </b>ANÁLISIS DE LA OFERTA</h2><h1>CAPÍTULO III</h1><p>Contenido final</p>' }]);
    const fields = [...(editor as unknown as { aiTextFields(): Generator<{ id: string; text: string }> }).aiTextFields()];
    expect(fields.slice(0, 2000).map(field => field.text)).toContain('CAPÍTULO III');
    expect(fields.find(field => field.text === '2.4 ')?.id).toBe('page:last:text:0');
    expect(fields.find(field => field.text === 'ANÁLISIS DE LA OFERTA')?.id).toBe('page:last:text:1');
    expect(new Set(fields.map(field => field.id)).size).toBe(fields.length);
  });

  it('automatically updates an imported index after a new heading without adding an undo step', () => {
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.formatCleanHeadingTitle = WordCompatibilityService.prototype.formatCleanHeadingTitle;
    compatibility.buildSingleTocEntryHtml = WordCompatibilityService.prototype.buildSingleTocEntryHtml;
    compatibility.buildPaginatedTocPagesHtml = WordCompatibilityService.prototype.buildPaginatedTocPagesHtml;
    render([{ id:'toc',html:'<div data-native-word-toc="true"><div class="word-toc-entry" style="font-family:Arial;font-size:12pt">Anterior</div></div>' }, {id:'body',html:'<h1 id="intro">Introducción</h1>'}]);
    const toc=(editor as unknown as {tocController:{afterFlow():void}}).tocController;
    toc.afterFlow();
    node('[data-page-body-id="body"]').insertAdjacentHTML('beforeend','<h2>Nuevo apartado</h2>');
    editor.commitPageDomToState(1);editor.activePageIndex.set(1);
    const undo=vi.spyOn(editor,'pushUndoSnapshot');toc.afterFlow();
    expect(editor.pages()[0].html).toContain('Nuevo apartado');
    expect(editor.pages()[0].html).toContain('Arial');expect(editor.activePageIndex()).toBe(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('checks Enter immediately instead of waiting for the ordinary typing debounce', () => {
    render([{id:'a',html:'<ul><li>Primero</li><li><br></li></ul>'}]);
    const scheduling=vi.spyOn(editor as unknown as {scheduleDocumentFlow(defer?:boolean):void},'scheduleDocumentFlow');
    editor.onPageInput(new InputEvent('input',{inputType:'insertParagraph'}),0);
    expect(scheduling).toHaveBeenCalledWith(false);
  });

  it('persists bibliographic sources, inserts citations at the saved cursor and undoes metadata changes', () => {
    render([{ id: 'a', html: '<p>Texto inicial.</p>' }]);
    select(node('p'), 6, 6); editor.academic.show();
    const source = { ...emptySource(), id: 'source', title: 'Investigación', year: '2024', authors: [{ family: 'García', given: 'Ana' }] };
    editor.academic.save(source);
    expect(dom.collectDocData().bibliographicSources).toEqual([source]);
    // Focus has left the editor; citation still uses the position captured by the ribbon.
    window.getSelection()?.removeAllRanges();
    editor.academic.cite({ sourceId: source.id, narrative: false, locator: 'p. 8' });
    expect(node('p').textContent).toBe('Texto (García, 2024, p. 8)inicial.');
    expect(document.activeElement).toBe(node('[data-page-body-id]'));
    expect(editor.pages()[0].html).toContain('data-word-source-id="source"');
    editor.academic.save({ ...source, year: '2025' });
    expect(node('[data-word-citation]').textContent).toBe('(García, 2025, p. 8)');
    editor.handleGlobalUndo();
    expect(editor.bibliographicSources()[0].year).toBe('2024');
    expect(editor.pages()[0].html).toContain('(García, 2024, p. 8)');
    editor.handleGlobalRedo();
    expect(editor.bibliographicSources()[0].year).toBe('2025');
  });

  it('generates references on a new manual page using cited sources only and prevents deleting used sources', () => {
    render([{ id: 'a', html: '<p>Texto.</p>' }]);
    const source = { ...emptySource(), id: 'used', title: 'Investigación', year: '2024', authors: [{ family: 'García', given: 'Ana' }] };
    editor.academic.save(source); editor.academic.save({ ...source, id: 'unused', title: 'Sin citar' });
    select(node('p'), 6); editor.academic.show();
    editor.academic.cite({ sourceId: source.id, narrative: true, locator: '' });
    editor.academic.remove('used');
    expect(editor.academic.error()).toBeTruthy(); expect(editor.bibliographicSources()).toHaveLength(2);
    editor.academic.bibliography();
    expect(editor.pages()).toHaveLength(2); expect(editor.pages()[1].breakBefore).toBe('manual');
    expect(editor.pages()[1].html).toContain('Referencias');
    expect(editor.pages()[1].html).toContain('text-indent: -36pt');
    expect(editor.pages()[1].html).toContain('Investigación'); expect(editor.pages()[1].html).not.toContain('Sin citar');
    editor.handleGlobalUndo(); expect(editor.pages()).toHaveLength(1);
  });

  it('restores sources on reopening and clears them when opening another document', async () => {
    const sources = [{ ...emptySource(), id: 'source', title: 'Libro' }];
    editor.note = { _id: 'academic', title: 'Trabajo', docData: { v: 2, pages: [{ id: 'a', html: '<p>Texto</p>' }], bibliographicSources: sources } } as Note;
    await dom.hydrateFromNote(); expect(editor.bibliographicSources()).toEqual(sources);
    editor.note = { _id: 'other', title: 'Otro', docData: { v: 2, pages: [{ id: 'b', html: '<p>Otro</p>' }] } } as Note;
    await dom.hydrateFromNote(); expect(editor.bibliographicSources()).toEqual([]);
  });

  it('resizes a selected image proportionally at document zoom and saves one undo step', () => {
    const original = '<p><img src="/uploads/example.jpg" style="width:100px;height:50px"></p>';
    render([{ id: 'a', html: original }]);
    editor.zoom.set(150);
    const image = node('img');
    Object.defineProperty(image.parentElement!, 'clientWidth', { value: 600 });
    image.getBoundingClientRect = () => ({ left: 10, top: 10, width: parseFloat(image.style.width) * 1.5, height: parseFloat(image.style.height) * 1.5 } as DOMRect);
    const select = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    image.dispatchEvent(select); editor.onPagePointerDown(select as PointerEvent, 0);
    expect(editor.imageResizeBox()!.width).toBe(150);
    editor.startImageResize(new MouseEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, cancelable: true }) as PointerEvent);
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 75, clientY: 37.5, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointerup'));
    expect(image.style.width).toBe('150px');
    expect(image.style.height).toBe('75px');
    expect(editor.pages()[0].html).toContain('150px');
    expect(editor.pages()[0].html).not.toContain('resize-handle');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
  });

  it('merges a rectangular Shift-click selection and preserves all cell content and undo', () => {
    const original = '<table><tbody><tr><td>A</td><td><b>B</b></td></tr><tr><td><a href="#source">C</a></td><td>D</td></tr></tbody></table>';
    render([{ id: 'a', html: original }]);
    const cells = Array.from(node('table').querySelectorAll('td'));
    editor.activeTableCell.set(cells[0]);
    const event = new MouseEvent('pointerdown', { button: 0, shiftKey: true, bubbles: true, cancelable: true });
    cells[3].dispatchEvent(event); editor.onPagePointerDown(event as PointerEvent, 0);
    expect(editor.canMergeTableCells()).toBe(true);
    editor.combineTableCells();
    const cell = node('td') as HTMLTableCellElement;
    expect(cell.colSpan).toBe(2); expect(cell.rowSpan).toBe(2);
    expect(cell.textContent).toBe('ABCD');
    expect(cell.querySelector('a')!.getAttribute('href')).toBe('#source');
    expect(node('table').querySelectorAll('td')).toHaveLength(1);
    expect(editor.pages()[0].html).toContain('rowspan="2"');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
  });

  it('selects empty cells by mouse drag without requiring a native text range', () => {
    render([{ id: 'a', html: '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table>' }]);
    const cells = Array.from(node('table').querySelectorAll('td'));
    const down = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    cells[0].dispatchEvent(down); editor.onPagePointerDown(down as PointerEvent, 0);
    expect(editor.canMergeTableCells()).toBe(false);
    cells[3].dispatchEvent(new MouseEvent('pointermove', { buttons: 1, bubbles: true }));
    cells[3].dispatchEvent(new MouseEvent('pointerup', { button: 0, bubbles: true }));
    expect(window.getSelection()?.isCollapsed).toBe(true);
    expect(editor.canMergeTableCells()).toBe(true);
    editor.combineTableCells();
    const merged = node('td') as HTMLTableCellElement;
    expect(merged.colSpan).toBe(2); expect(merged.rowSpan).toBe(2);
    expect(node('table').querySelectorAll('td')).toHaveLength(1);
  });

  it('merges a native multi-cell text selection and disables merging in read mode', () => {
    render([{ id: 'a', html: '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>' }]);
    select(node('table'));
    expect(editor.canMergeTableCells()).toBe(true);
    editor.viewMode.set('read');
    expect(editor.canMergeTableCells()).toBe(false);
    editor.combineTableCells();
    expect(node('table').querySelectorAll('td')).toHaveLength(2);
    editor.viewMode.set('print');
    editor.combineTableCells();
    expect((node('td') as HTMLTableCellElement).colSpan).toBe(2);
  });

  it.each(['addRow', 'addCol'] as const)('%s creates completely empty table cells and supports undo', action => {
    const original = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr id="source-row"><td id="source-cell" style="background-color:yellow"><a href="#ref">Existing</a></td><td>Value</td></tr></tbody></table>';
    render([{ id: 'a', html: original }]);
    editor.activeTableCell.set(node('tbody td') as HTMLTableCellElement);
    editor.modifyActiveTable(action);
    const table = node('table') as HTMLTableElement;
    const inserted = action === 'addRow' ? Array.from(table.rows[2].cells) : Array.from(table.rows).map(row => row.cells[1]);
    expect(inserted.every(cell => cell.textContent === '')).toBe(true);
    expect(inserted.every(cell => !cell.querySelector('a,img'))).toBe(true);
    expect(table.querySelectorAll('#source-cell')).toHaveLength(1);
    expect(table.querySelector('a')!.textContent).toBe('Existing');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
  });

  it.each(['ol', 'ul'])('removes %s markers while keeping one paragraph per imported item', tag => {
    const first = '<strong><span>Comprobantes</span><span> </span><span>y</span><span> </span><span>transferencias QR falsificadas:</span></strong><span> Vendedores que entregan sus productos.</span>';
    const original = `<${tag} style="font-family:Times New Roman;font-size:12pt;line-height:2"><li>${first}</li><li><b>Entregas:</b> artículos <a href="#source">defectuosos o robados.</a></li><li>Robos y asaltos.</li></${tag}>`;
    render([{ id: 'a', html: original }]);
    const body = node('[data-page-body-id]');
    const text = body.textContent;
    select(node(tag));
    command(tag === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    expect(body.querySelectorAll('ol,ul')).toHaveLength(0);
    expect(body.querySelectorAll(':scope > p')).toHaveLength(3);
    expect(body.textContent).toBe(text);
    expect(body.querySelector('p')!.textContent).toContain('Comprobantes y transferencias QR falsificadas: Vendedores');
    expect(body.querySelector('strong')!.textContent).toBe('Comprobantes y transferencias QR falsificadas:');
    expect(body.querySelector('a')!.getAttribute('href')).toBe('#source');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
    editor.handleGlobalRedo();
    expect(body.querySelectorAll(':scope > p')).toHaveLength(3);
  });

  it('splits a partially unlisted numbered list without changing the remaining items', () => {
    render([{ id: 'a', html: '<ol start="4"><li>First</li><li id="chosen"><p>Second <b>item.</b></p></li><li>Third</li></ol>' }]);
    select(node('#chosen p'));
    command('insertOrderedList');
    const body = node('[data-page-body-id]');
    expect(body.querySelectorAll(':scope > p')).toHaveLength(1);
    expect(body.querySelector('p')!.textContent).toBe('Second item.');
    const lists = body.querySelectorAll<HTMLOListElement>('ol');
    expect(lists).toHaveLength(2);
    expect(lists[0].start).toBe(4);
    expect(lists[1].start).toBe(6);
    expect(lists[0].textContent).toBe('First');
    expect(lists[1].textContent).toBe('Third');
  });

  it.each(['Backspace', 'Delete'])('%s joins imported paragraph runs without removing their spaces', key => {
    const prefix = 'demanda de servicios de seguridad y logística para el comercio ';
    const following = 'digital en Bolivia ha presentado una tendencia fuertemente positiva en los últimos años, impulsada por:';
    const runs = following.split(' ').map((word, index) => `${index ? '<span> </span>' : ''}<span>${word}</span>`).join('');
    const original = `<p id="before">${prefix}</p><p id="after">${runs}</p>`;
    render([{ id: 'a', html: original }]);
    if (key === 'Backspace') select(node('#after span'), 0, 0);
    else select(node('#before'), prefix.length, prefix.length);
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    editor.onPageKeyDown(event, 0);
    expect(event.defaultPrevented).toBe(true);
    expect(node('[data-page-body-id]').textContent).toBe(prefix + following);
    expect(node('[data-page-body-id]').querySelectorAll('p')).toHaveLength(1);
    expect(node('[data-page-body-id]').querySelectorAll('span span')).toHaveLength(0);
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
    editor.handleGlobalRedo();
    expect(node('[data-page-body-id]').textContent).toBe(prefix + following);
  });

  it('preserves spaces, links and emphasis when merging list items through beforeinput', () => {
    const original = '<ul><li id="before">comercio </li><li id="after"><b>digital</b><span> </span><a href="#ref">en Bolivia</a><span> </span>ha presentado una tendencia positiva.</li></ul>';
    render([{ id: 'a', html: original }]);
    select(node('#after b'), 0, 0);
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true });
    editor.onPageBeforeInput(event, 0);
    expect(event.defaultPrevented).toBe(true);
    expect(node('ul').querySelectorAll('li')).toHaveLength(1);
    expect(node('ul').textContent).toBe('comercio digital en Bolivia ha presentado una tendencia positiva.');
    expect(node('a').getAttribute('href')).toBe('#ref');
    expect(node('b').textContent).toBe('digital');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe(original);
  });

  it('does not serialize unchanged page DOM on repeated Angular checks', () => {
    render([{ id: 'a', html: '<p>First</p>' }, { id: 'b', html: '<p>Second</p>' }]);
    dom.syncInnerHtml();
    const other = node('[data-page-body-id="b"]');
    const reads = vi.spyOn(other, 'innerHTML', 'get');
    dom.syncInnerHtml(); dom.syncInnerHtml();
    editor.pages.update(pages => pages.map((page, index) => index ? page : { ...page, html: '<p>Edited</p>' }));
    dom.syncInnerHtml();
    expect(reads).not.toHaveBeenCalled();
    expect(other.textContent).toBe('Second');
  });

  it('groups continuous Backspace into one undo step', () => {
    render([{ id: 'a', html: '<p>abcdef</p>' }]);
    select(node('p'), 6, 6);
    const snapshots = vi.spyOn(editor, 'pushUndoSnapshot');
    editor.onPageBeforeInput(new InputEvent('beforeinput', { inputType: 'deleteContentBackward' }), 0);
    (node('p').firstChild as Text).deleteData(5, 1);
    editor.onPageBeforeInput(new InputEvent('beforeinput', { inputType: 'deleteContentBackward' }), 0);
    (node('p').firstChild as Text).deleteData(4, 1);
    editor.commitPageDomToState(0);
    expect(snapshots).toHaveBeenCalledTimes(1);
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toBe('<p>abcdef</p>');
  });

  it('coalesces typing layout with a bounded wait and cancels pending layout', () => {
    vi.useFakeTimers();
    const flow = (editor as unknown as { flowController: WordFlowController }).flowController;
    const frames = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', frames);
    flow.cancelScheduledFlow(); frames.mockClear();
    try {
      for (let i = 0; i < 20; i++) { flow.scheduleDocumentFlow(true); vi.advanceTimersByTime(20); }
      expect(frames).toHaveBeenCalledTimes(1);
      flow.cancelScheduledFlow(); frames.mockClear();
      flow.scheduleDocumentFlow(true);
      flow.cancelScheduledFlow();
      vi.advanceTimersByTime(500);
      expect(frames).not.toHaveBeenCalled();
    } finally { flow.cancelScheduledFlow(); vi.useRealTimers(); }
  });

  it('externalizes images again only for a changed page when saving', async () => {
    const persistence = (editor as unknown as { persistenceController: { buildSlimDocData(doc: DocDataV2): Promise<DocDataV2> } }).persistenceController;
    const externalize = vi.spyOn(TestBed.inject(ImageStoreService), 'externalizeImages');
    const first = { id: 'a', html: '<p>First</p>' }, other = { id: 'b', html: '<p>Other</p>' };
    await persistence.buildSlimDocData({ v: 2, pages: [first, other] });
    externalize.mockClear();
    const saved = await persistence.buildSlimDocData({ v: 2, pages: [{ ...first, html: '<p>Edited</p>' }, other] });
    expect(externalize).toHaveBeenCalledTimes(1);
    expect(saved.pages![1].html).toBe('<p>Other</p>');
  });

  it('isolates styles, DOM transactions and undo history between editor instances', () => {
    render([{ id: 'a', html: '<p>Documento uno.</p>' }]);
    const second = TestBed.runInInjectionContext(() => new PureDocEditorComponent());
    const secondDom = second as unknown as Internals;
    const secondBody = document.createElement('div');
    secondBody.dataset['pageBodyId'] = 'other';
    secondBody.innerHTML = '<p>Documento dos.</p>';
    document.body.appendChild(secondBody);
    second.pages.set([{ id: 'other', html: secondBody.innerHTML }]);
    secondDom.pageBodyMap.set('other', secondBody);
    secondDom.documentReady.set(true);
    try {
      select(node('[data-page-body-id="a"] p'));
      editor.handleApplyTemplateToDocument(BUILTIN_STYLE_TEMPLATES.find(template => template.id === 'apa-georgia-11')!);
      expect(second.activeTemplateId()).toBe('corporate-modern');
      expect(secondBody.innerHTML).toBe('<p>Documento dos.</p>');
      second.pushUndoSnapshot();
      secondBody.innerHTML = '<p>Edición del segundo documento.</p>';
      second.commitPageDomToState(0);
      second.handleGlobalUndo();
      expect(second.pages()[0].html).toBe('<p>Documento dos.</p>');
      expect(editor.activeTemplateId()).toBe('apa-georgia-11');
      editor.handleGlobalUndo();
      expect(editor.pages()[0].html).toBe('<p>Documento uno.</p>');
      expect(secondBody.textContent).toBe('Documento dos.');
    } finally {
      second.ngOnDestroy();
    }
  });

  it('preserves APA list rules when duplicating or saving a template', () => {
    const modal = TestBed.runInInjectionContext(() => new WordStyleTemplatesModalComponent());
    modal.templates = BUILTIN_STYLE_TEMPLATES;
    modal.activeTemplateId = 'apa-times-12';
    modal.ngOnInit();
    const duplicate = vi.spyOn(modal.saveCustomTemplate, 'emit');
    modal.handleCreateNewCustomTemplate();
    expect(duplicate.mock.calls[0][0]!.listRules).toEqual(BUILTIN_STYLE_TEMPLATES[0].listRules);
    expect(duplicate.mock.calls[0][0]!.listRules).not.toBe(BUILTIN_STYLE_TEMPLATES[0].listRules);
    const apply = vi.spyOn(modal.applyTemplateToDocument, 'emit');
    modal.handleSaveAndApplyAll();
    expect(apply.mock.calls[0][0]!.listRules?.ordered.marker).toBe('decimal');
  });

  it('keeps double spacing and zero paragraph indent for a new APA list item after Enter', () => {
    render([{ id: 'a', html: '<ul><li>frase corta</li></ul>' }]);
    editor.activeTemplateId.set('apa-times-12');
    node('ul').insertAdjacentHTML('beforeend', '<li><p style="text-indent:36pt;margin-bottom:8pt">otra frase</p></li>');
    select(node('ul li:last-child p'));
    const event = new InputEvent('input', { inputType: 'insertParagraph' });
    Object.defineProperty(event, 'currentTarget', { value: node('[data-page-body-id]') });
    editor.onPageInput(event, 0);
    expect(node('li:last-child').style.lineHeight).toBe('2');
    expect(node('li:last-child p').style.textIndent).toBe('0pt');
    expect(editor.pages()[0].html).toContain('word-list-indent');
  });

  it('applies APA lists across pages, preserves punctuation and supports undo', () => {
    render([{ id: 'a', html: '<p>Introducción.</p><ol start="4"><li>Primera oración.</li></ol>' },
      { id: 'b', html: '<ul><li>frase corta (Autor, 2020)</li></ul>' }]);
    const apa = BUILTIN_STYLE_TEMPLATES.find(template => template.id === 'apa-times-12')!;
    select(node('li'));
    editor.handleApplyTemplateToDocument(apa);
    expect(node('ol').style.listStyleType).toBe('decimal');
    expect(node('ul').style.listStyleType).toBe('disc');
    expect(node('li').style.lineHeight).toBe('2');
    expect(node('ul li').textContent).toBe('frase corta (Autor, 2020)');
    expect(editor.pages()[1].html).toContain('line-height: 2');
    editor.handleGlobalUndo();
    expect(editor.pages()[0].html).toContain('<ol start="4">');
    expect(editor.pages()[1].html).not.toContain('word-list-indent');
  });

  it('updates every H1 from formatted selected text, removes nested overrides, and keeps other levels and references', () => {
    render([
      { id:'a', html:'<h1 id="first" style="font-family:Times New Roman;font-size:12pt;font-weight:700"><font face="Times New Roman" size="3"><b>First</b></font></h1><p id="source"><span style="font-family:Arial Black;font-size:20pt;font-weight:900;color:rgb(180, 20, 40)">New appearance</span></p>' },
      { id:'b', breakBefore:'manual', html:'<h1 id="second"><span style="font-size:12pt;font-family:Times New Roman"><a href="/?document=other"><i>Second</i></a></span></h1><h2 id="untouched">Another level</h2>' },
    ]);
    const originalRule = JSON.stringify(BUILTIN_STYLE_TEMPLATES.find(template => template.id === 'corporate-modern')!.rules.H1);
    select(node('#source span')); editor.handleUpdateStyleFromSelection('H1');
    expect(activeRule().fontFamily).toBe('Arial Black'); expect(activeRule().fontSizePt).toBe(20);
    expect(activeRule().bold).toBe(true);
    for (const heading of [node('#first'),node('#second')]) {
      expect(heading.style.fontFamily).toContain('Arial Black'); expect(heading.style.fontSize).toBe('20pt');
      expect(heading.style.fontWeight).toBe('700');
      expect(heading.querySelector('font[size]')).toBeNull();
      for (const run of heading.querySelectorAll<HTMLElement>('span,b,i,font,a')) expect(run.style.fontSize).toBe('inherit');
    }
    expect(node('#second a').getAttribute('href')).toBe('/?document=other');
    expect(node('#untouched').getAttribute('style')).toBeNull();
    expect(window.getSelection()!.toString()).toBe('New appearance');
    expect(editor.pages()[1].breakBefore).toBe('manual');
    expect(dom.collectDocData().customTemplates).toHaveLength(1);
    expect(JSON.stringify(BUILTIN_STYLE_TEMPLATES.find(template => template.id === 'corporate-modern')!.rules.H1)).toBe(originalRule);
    expect(JSON.stringify(dom.collectDocData())).not.toContain('weave-selection');
  });

  it('undoes and redoes both style definitions and all page contents, including changes with no existing H1', () => {
    render([{ id:'a', html:'<p id="source" style="font-family:Arial;font-size:19pt">Sample</p>' }]);
    select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    const id = editor.activeTemplateId(); expect(activeRule().fontSizePt).toBe(19);
    editor.handleGlobalUndo(); dom.syncInnerHtml();
    expect(editor.activeTemplateId()).toBe('corporate-modern'); expect(dom.collectDocData().customTemplates).toHaveLength(0);
    editor.handleGlobalRedo(); dom.syncInnerHtml();
    expect(editor.activeTemplateId()).toBe(id); expect(activeRule().fontSizePt).toBe(19);
    select(node('#source')); editor.handleApplyHeading('H1');
    expect(document.querySelector('h1')!.style.fontSize).toBe('19pt');
    expect(document.querySelector('h1')!.textContent).toBe('Sample');
  });

  it('applies a style to every selected paragraph across pages and excludes the paragraph at an end boundary', () => {
    render([{ id:'a',html:'<p id="one">One</p><p id="two">Two</p>' },{ id:'b',html:'<p id="three">Three</p><p id="four">Four</p>' }]);
    const range = select(node('#one'));
    range.setEnd(node('#four').firstChild!,0);
    expect(selectedParagraphs([node('[data-page-body-id="a"]'),node('[data-page-body-id="b"]')],range).map(el => el.id)).toEqual(['one','two','three']);
    editor.handleApplyHeading('H2');
    expect(document.querySelectorAll('h2')).toHaveLength(3); expect(node('#four').tagName).toBe('P');
    expect(window.getSelection()!.toString()).toContain('Three');
  });

  it('reuses the document template when updating again and persists it after hydration', async () => {
    render([{ id:'a',html:'<p id="source" style="font-family:Arial;font-size:18pt">Sample</p><h1 id="heading">Title</h1>' }]);
    select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    node('#source').style.fontSize = '24pt'; select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    expect(editor.styleTemplates().filter(template => template.isCustom)).toHaveLength(1);
    const docData = dom.collectDocData();
    editor.note = { _id:'saved',title:'Saved',docType:'doc',docData } as Note;
    await dom.hydrateFromNote();
    expect(activeRule().fontSizePt).toBe(24);
    expect(node('#heading').style.fontSize).toBe('24pt');
  });

  it('changes an exact point size only in selected characters and preserves unrelated legacy font sizes', () => {
    render([{ id:'a',html:'<p id="source">abcdef</p><p><font id="untouched" size="7">Other text</font></p>' }]);
    select(node('#source'),1,4); command('fontSizePt','17.5');
    expect(node('#source span').textContent).toBe('bcd'); expect(node('#source span').style.fontSize).toBe('17.5pt');
    expect(node('#source').textContent).toBe('abcdef'); expect(node('#untouched').getAttribute('size')).toBe('7');
    expect(window.getSelection()!.toString()).toBe('bcd');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').innerHTML).toBe('abcdef');
  });

  it('restores the saved range after a ribbon input receives focus', () => {
    render([{ id:'a',html:'<p id="source">abcdef</p>' }]); select(node('#source'),2,5); editor.rememberRibbonSelection();
    const input = document.createElement('input'); document.body.appendChild(input); input.focus(); window.getSelection()!.removeAllRanges();
    command('fontName','Arial Black');
    expect(node('#source span').textContent).toBe('cde'); expect(node('#source span').style.fontFamily.replace(/["']/g,'')).toBe('Arial Black');
  });

  it('uses a chosen exact size for the next typed character without inserting placeholder content', () => {
    render([{ id:'a',html:'<p id="source">ABC</p>' }]); select(node('#source'),3);
    command('fontSizePt','17.5');
    expect(node('#source').innerHTML).toBe('ABC');
    const input = new InputEvent('beforeinput',{ inputType:'insertText',data:'z',cancelable:true });
    editor.onPageBeforeInput(input,0);
    expect(input.defaultPrevented).toBe(true); expect(node('#source').textContent).toBe('ABCz');
    expect(node('#source span').style.fontSize).toBe('17.5pt');
    expect(editor.pages()[0].html).not.toContain('\u200b');
    expect(window.getSelection()!.anchorOffset).toBe(1);
  });

  it.each([['justifyCenter','', 'textAlign','center'],['lineHeight','2','lineHeight','2'],['spaceBefore','12','marginTop','12pt'],['spaceAfter','0','marginBottom','0pt'],['paragraphShading','#bbf7d0','backgroundColor','rgb(187, 247, 208)'],['paragraphBorder','bottom','borderBottomWidth','1px'],['indent','','marginLeft','36pt']])('applies %s to every selected paragraph across pages', (name,value,property,expected) => {
    render([{id:'a',html:'<p id="one">One</p>'},{id:'b',html:'<p id="two">Two</p>'}]);
    const range = select(node('#one')); range.setEnd(node('#two').firstChild!,3);
    command(name,value);
    expect(node('#one').style.getPropertyValue(property.replace(/[A-Z]/g,letter => '-'+letter.toLowerCase()))).toBe(expected);
    expect(node('#two').style.getPropertyValue(property.replace(/[A-Z]/g,letter => '-'+letter.toLowerCase()))).toBe(expected);
    expect(editor.pages().every(page => !page.html.includes('weave-selection'))).toBe(true);
  });

  it('changes case across formatted runs without replacing links or interpreting HTML', () => {
    render([{id:'a',html:'<p id="source"><strong>hoLA </strong><a href="/?document=other">mUNdo</a> &lt;texto&gt;</p>'}]);
    select(node('#source')); command('changeCase','lower');
    expect(node('#source').textContent).toBe('hola mundo <texto>');
    expect(node('#source strong')).toBeTruthy(); expect(node('#source a').getAttribute('href')).toBe('/?document=other');
    expect(node('#source').querySelector('texto')).toBeNull();
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').textContent).toBe('hoLA mUNdo <texto>');
  });

  it('sorts selected sibling paragraphs naturally and preserves their markup and IDs', () => {
    render([{id:'a',html:'<p id="ten">Item 10</p><p id="two"><b>Item 2</b></p><p id="one">Item 1</p>'}]);
    select(node('[data-page-body-id]')); command('sortParagraphs','asc');
    expect(Array.from(node('[data-page-body-id]').children).map(element => element.id)).toEqual(['one','two','ten']);
    expect(node('#two b').textContent).toBe('Item 2');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('[data-page-body-id]').firstElementChild!.id).toBe('ten');
  });

  it('searches across inline formatting, supports case and whole words, and never crosses paragraph boundaries', () => {
    render([{id:'a',html:'<p>ca<strong>sa</strong> CASA casamiento</p><p>ca</p><p>sa</p>'}]);
    const bodies = [node('[data-page-body-id]')];
    expect(findDocumentText(bodies,'casa').map(match => match.range.toString())).toEqual(['casa','CASA','casa']);
    expect(findDocumentText(bodies,'casa',true,true)).toHaveLength(1);
    expect(findDocumentText(bodies,'casa',false,true)).toHaveLength(2);
  });

  it('finds and replaces across all pages with literal text and undoes the operation in one step', () => {
    render([{id:'a',html:'<p id="source">Find <b>this</b> text</p>'},{id:'b',html:'<p id="second">this text again</p>'}]);
    editor.searchQuery.set('this text'); editor.replacementText.set('<safe>');
    editor.findNextMatch(); expect(window.getSelection()!.toString()).toBe('this text');
    expect(editor.searchStatus()).toBe('1 de 2 coincidencias');
    editor.findNextMatch(); expect(editor.activePageIndex()).toBe(1);
    editor.replaceDocumentMatches(true);
    expect(node('#source').textContent).toBe('Find <safe>'); expect(node('#second').textContent).toBe('<safe> again');
    expect(document.querySelector('safe')).toBeNull(); expect(editor.searchStatus()).toBe('2 reemplazos realizados');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#source').textContent).toBe('Find this text'); expect(node('#second').textContent).toBe('this text again');
    editor.handleGlobalRedo(); dom.syncInnerHtml(); expect(node('#second').textContent).toBe('<safe> again');
  });

  it('locates before replacing a single result and permits an empty replacement', () => {
    render([{id:'a',html:'<p id="source">one two one</p>'}]); select(node('#source'),0);
    editor.searchQuery.set('one'); editor.replacementText.set('');
    editor.replaceDocumentMatches(); expect(node('#source').textContent).toBe('one two one');
    editor.replaceDocumentMatches(); expect(node('#source').textContent).toBe(' two one');
  });

  it('selects all pages, selects a paragraph and toggles marks without storing presentation state', () => {
    render([{id:'a',html:'<p id="one">One</p>'},{id:'b',html:'<p id="two">Two</p>'}]); select(node('#one'),1);
    command('selectAllDocument'); expect(window.getSelection()!.toString()).toContain('Two');
    select(node('#one'),1); command('selectCurrentParagraph'); expect(window.getSelection()!.toString()).toBe('One');
    command('toggleMarks'); expect(editor.showFormattingMarks()).toBe(true);
    expect(JSON.stringify(dom.collectDocData())).not.toContain('showFormattingMarks');
  });

  it('copies font family, exact size and emphasis with the format painter in one undoable operation', () => {
    render([{id:'a',html:'<p id="source" style="font-family:Arial Black;font-size:18pt;font-weight:900;font-style:italic;color:#a02040">Source</p><p id="target">Target</p>'}]);
    select(node('#source')); editor.handleCopyFormat(); expect(editor.formatPainterActive()).toBe(true);
    select(node('#target')); const event = new MouseEvent('mouseup');
    Object.defineProperty(event,'target',{value:node('#target')}); editor.handleEditorMouseUp(event);
    const run = node('#target span'); expect(run.style.fontFamily).toContain('Arial Black');
    expect(run.style.fontSize).toBe('18pt'); expect(run.style.fontWeight).toBe('700'); expect(run.style.fontStyle).toBe('italic');
    expect(editor.formatPainterActive()).toBe(false);
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(node('#target').innerHTML).toBe('Target');
  });

  it('keeps increasing the pending typing size on repeated clicks', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">Text</p>'}]); select(node('#source'),4);
    command('growFont'); command('growFont'); expect(editor.formats().fontSize).toBe('16');
    command('shrinkFont'); expect(editor.formats().fontSize).toBe('14');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'x',cancelable:true}),0);
    expect(node('#source span').style.fontSize).toBe('14pt');
  });

  it('clears only selected characters and retains the surrounding formatting', () => {
    render([{id:'a',html:'<p id="source" style="font-family:Arial Black;font-size:18pt;font-weight:900">abcdef</p>'}]);
    select(node('#source'),2,4); command('removeFormat');
    expect(node('#source').style.fontSize).toBe('18pt'); expect(node('#source span').textContent).toBe('cd');
    expect(node('#source span').style.fontSize).toBe('11pt'); expect(node('#source').textContent).toBe('abcdef');
  });

  it('searches regex punctuation literally and starts backwards navigation on the final match', () => {
    render([{id:'a',html:'<p>[a].* plus [a].*</p>'}]);
    editor.searchQuery.set('[a].*'); editor.findNextMatch(true);
    expect(editor.searchStatus()).toBe('2 de 2 coincidencias'); expect(window.getSelection()!.toString()).toBe('[a].*');
  });

  it('does not capture the temporary white display color of the dark sheet', () => {
    render([{id:'a',html:'<p id="source">Sample</p><h1>Title</h1>'}]);
    const sheet = document.createElement('div'); sheet.className = 'word-dark-sheet';
    node('[data-page-body-id]').before(sheet); sheet.appendChild(node('[data-page-body-id]'));
    node('#source').style.color = '#a02040'; select(node('#source')); editor.handleUpdateStyleFromSelection('H1');
    expect(activeRule().color).toBe('rgb(160, 32, 64)');
  });

  it.each(['subscript','superscript'])('applies %s to selected characters, switches modes, toggles off and preserves neighbors', (kind) => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">H2O</p>'}]); select(node('#source'),1,2);
    command(kind);
    expect(node('#source').textContent).toBe('H2O'); expect(window.getSelection()!.toString()).toBe('2');
    expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(true);
    expect(editor.formats().fontSize).toBe('9');
    command(kind); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(false);
    expect(editor.formats().fontSize).toBe('12'); expect(node('#source').textContent).toBe('H2O');
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(false);
    editor.updateSelectionFormats(); expect(editor.formats()[kind as 'subscript' | 'superscript']).toBe(true);
  });

  it('types an exponent after toggling at a caret and can return to the baseline', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">x</p>'}]); select(node('#source'),1);
    command('superscript');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'2',cancelable:true}),0);
    expect(node('#source').textContent).toBe('x2'); expect(editor.formats().superscript).toBe(true);
    command('superscript');
    editor.onPageBeforeInput(new InputEvent('beforeinput',{inputType:'insertText',data:'z',cancelable:true}),0);
    expect(node('#source').textContent).toBe('x2z'); expect(editor.formats().superscript).toBe(false);
    expect(editor.formats().fontSize).toBe('12');
  });

  it('continues heading numbering across pages, resets child levels, and restores it through undo and hydration', async () => {
    render([{id:'a',html:'<h1>Chapter</h1><h2>Section</h2><h3>Topic</h3>'},{id:'b',html:'<h2>Next section</h2><h1>Next chapter</h1><h2>Last section</h2>'}]);
    command('headingNumbering','on');
    const prefixes = () => Array.from(document.querySelectorAll('[data-word-heading-number]')).map(element=>element.textContent);
    expect(prefixes()).toEqual(['1. ','1.1 ','1.1.1 ','1.2 ','2. ','2.1 ']);
    expect(dom.collectDocData().headingNumbering).toBe(true);
    editor.handleGlobalUndo(); dom.syncInnerHtml(); expect(prefixes()).toEqual([]); expect(editor.headingNumbering()).toBe(false);
    editor.handleGlobalRedo(); dom.syncInnerHtml(); expect(prefixes()).toEqual(['1. ','1.1 ','1.1.1 ','1.2 ','2. ','2.1 ']);
    const data = dom.collectDocData(); editor.note = {_id:'saved',title:'Saved',docType:'doc',docData:data} as Note;
    await dom.hydrateFromNote(); expect(editor.headingNumbering()).toBe(true); expect(prefixes()).toHaveLength(6);
    command('headingNumbering','off'); expect(prefixes()).toEqual([]); expect(document.querySelectorAll('h1,h2,h3')).toHaveLength(6);
  });

  it('renumbers after inserting and deleting a heading without numbering its continuation twice', () => {
    render([{id:'a',html:'<h1>First</h1><h2 id="remove">Section</h2>'},{id:'b',html:'<h2 id="last">Last</h2><h2 data-word-continuation="same">continued text</h2>'}]);
    command('headingNumbering','on'); node('#remove').remove();
    editor.onPageInput(new InputEvent('input'),0);
    expect(node('#last [data-word-heading-number]').textContent).toBe('1.1 ');
    expect(node('h2[data-word-continuation]').querySelector('[data-word-heading-number]')).toBeNull();
    const first = node('h1'); const text = first.textContent;
    command('headingNumbering','on'); expect(first.textContent).toBe(text);
    expect(editor.headings().some(heading=>heading.text.includes('continued text'))).toBe(false);
  });

  it('drops a pending typing font when the caret moves to another text run', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">One</p><p id="other" style="font-family:Georgia;font-size:16pt">Other</p>'}]);
    select(node('#source'),3); command('fontName','Arial Black'); command('fontSizePt','18');
    expect(editor.formats().fontName).toBe('Arial Black');
    select(node('#other'),1); editor.updateSelectionFormats();
    expect(editor.formats().fontName).toBe('Georgia'); expect(editor.formats().fontSize).toBe('16');
  });

  it('preserves imported manual chapter numbers and normalizes a wrapped automatic prefix', () => {
    render([{id:'a',html:'<h1>5. Existing chapter</h1><h2 id="section">Section</h2><h1>Next</h1>'}]);
    command('headingNumbering','on');
    expect(node('#section [data-word-heading-number]').textContent).toBe('5.1 ');
    const heading = node('#section'); const prefix = heading.querySelector('[data-word-heading-number]')!;
    const wrapper = document.createElement('b'); prefix.replaceWith(wrapper); wrapper.appendChild(prefix);
    editor.onPageInput(new InputEvent('input'),0);
    expect(heading.querySelectorAll('[data-word-heading-number]')).toHaveLength(1);
    expect(heading.firstElementChild!.textContent).toBe('5.1 ');
    expect(Array.from(document.querySelectorAll('h1')).map(element=>element.textContent)).toEqual(['5. Existing chapter','6. Next']);
  });

  it('keeps a script active after changing the size of a nested run and toggles a legacy script off', () => {
    render([{id:'a',html:'<p id="source" style="font-size:12pt">H<span id="script" data-word-script="sub" data-word-base-size="12" style="vertical-align:sub;font-size:9pt"><b id="letter">2</b></span>O</p>'}]);
    select(node('#letter')); editor.updateSelectionFormats(); expect(editor.formats().subscript).toBe(true);
    command('fontSizePt','10'); expect(editor.formats().subscript).toBe(true);
    command('subscript'); expect(editor.formats().subscript).toBe(false);
    expect(editor.formats().fontSize).toBe('12'); expect(node('#source').textContent).toBe('H2O');
  });

  it('does not apply styles or formatting before hydration or in reading mode', () => {
    render([{id:'a',html:'<p id="source">Sample</p><h1>Title</h1>'}]); select(node('#source'));
    const original = editor.pages(); dom.documentReady.set(false);
    editor.handleUpdateStyleFromSelection('H1'); command('fontSizePt','20');
    expect(editor.pages()).toBe(original); expect(dom.collectDocData().customTemplates).toHaveLength(0);
    dom.documentReady.set(true); editor.viewMode.set('read'); editor.handleUpdateStyleFromSelection('H1'); command('paragraphBorder','all');
    expect(editor.pages()).toBe(original);
  });
});
