import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { CanvasEditSession } from './engine/canvas-edit-session';
import { textNodes } from './engine/document-model';
import { emptySource } from './models/academic.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentPage } from './models/word-document.model';
import { SMARTART_ITEMS } from './constants/word-insert.constants';
import { DocumentFlowService } from './services/document-flow.service';
import { Note } from '../../core/models/note.model';
import { NoteSummary } from '../../core/models/note.model';
import { DocumentReferenceService } from '../../core/services/document-reference.service';

interface EditorDom {
  pageBodyMap: Map<string, HTMLElement>;
  syncInnerHtml(): void;
  hydrateFromNote(): Promise<void>;
  documentReady: { set(ready: boolean): void };
  reflowDocument(): void;
  invalidateDocumentFlow(): void;
  observeBodySize(): void;
  renderDocumentPages(pages: DocumentPage[], reflow?: boolean): void;
  getLivePagesSnapshot(): DocumentPage[];
  bodyResizeObserver: ResizeObserver;
}

describe('Word editing across pages', () => {
  let editor: PureDocEditorComponent;
  let dom: EditorDom;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    TestBed.configureTestingModule({ providers: [
      { provide: NotesService, useValue: { updateDocData: vi.fn() } },
      { provide: I18nService, useValue: {} },
      { provide: WordCompatibilityService, useValue: {} },
      { provide: LatexRendererService, useValue: {
        buildDocumentFormulaBlockHtml: (latex: string) => `<div class="word-latex-formula" data-latex="${latex}">${latex}</div>`,
      } },
      { provide: ImageStoreService, useValue: {
        resolveImages: async (html: string) => html,
        externalizeImages: async (html: string) => html,
      } },
    ] });
    editor = TestBed.runInInjectionContext(() => new PureDocEditorComponent());
    dom = editor as unknown as EditorDom;
  });

  afterEach(() => {
    editor.ngOnDestroy();
    vi.useRealTimers();
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
    vi.unstubAllGlobals();
  });

  it('prevents duplicate PDF exports and releases the busy state after download', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.exportToPdf = vi.fn(() => pending);
    const exporting = editor.exportPdf();
    expect(editor.pdfExporting()).toBe(true);
    await editor.exportPdf();
    expect(compatibility.exportToPdf).toHaveBeenCalledTimes(1);
    finish();
    await exporting;
    expect(editor.pdfExporting()).toBe(false);
    expect(editor.pdfExportMessage()).toContain('Descarga iniciada');
  });

  it('releases the PDF button and exposes failures to the visible status message', async () => {
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.exportToPdf = vi.fn().mockRejectedValue(new Error('Tiempo agotado: imagen'));
    await editor.exportPdf();
    expect(editor.pdfExporting()).toBe(false);
    expect(editor.pdfExportFailed()).toBe(true);
    expect(editor.pdfExportMessage()).toContain('Tiempo agotado: imagen');
  });

  it('auto-clears PDF and other export status messages after a timeout', async () => {
    vi.useFakeTimers();
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.exportToPdf = vi.fn().mockResolvedValue(undefined);
    compatibility.exportToDocxFile = vi.fn().mockResolvedValue(undefined);
    compatibility.exportToWordDoc = vi.fn().mockResolvedValue(undefined);
    compatibility.exportToHtmlFile = vi.fn().mockResolvedValue(undefined);
    compatibility.exportToMarkdown = vi.fn();
    compatibility.exportToPlainText = vi.fn();

    await editor.exportPdf();
    expect(editor.pdfExportMessage()).toContain('Descarga iniciada');
    await vi.advanceTimersByTimeAsync(3999);
    expect(editor.pdfExportMessage()).toContain('Descarga iniciada');
    await vi.advanceTimersByTimeAsync(1);
    expect(editor.pdfExportMessage()).toBe('');

    await editor.exportWord();
    expect(editor.pdfExportMessage()).toContain('.docx');
    await vi.advanceTimersByTimeAsync(4000);
    expect(editor.pdfExportMessage()).toBe('');

    await editor.exportLegacyDoc();
    expect(editor.pdfExportMessage()).toContain('.doc');
    await vi.advanceTimersByTimeAsync(4000);
    expect(editor.pdfExportMessage()).toBe('');

    await editor.exportHtml();
    expect(editor.pdfExportMessage()).toContain('.html');
    await vi.advanceTimersByTimeAsync(4000);
    expect(editor.pdfExportMessage()).toBe('');

    editor.exportMarkdown();
    expect(editor.pdfExportMessage()).toContain('.md');
    await vi.advanceTimersByTimeAsync(4000);
    expect(editor.pdfExportMessage()).toBe('');

    editor.exportTxt();
    expect(editor.pdfExportMessage()).toContain('.txt');
    editor.dismissExportFeedback();
    expect(editor.pdfExportMessage()).toBe('');
  });

  it('auto-clears failed export messages after 6 seconds without truncating early', async () => {
    vi.useFakeTimers();
    const compatibility = TestBed.inject(WordCompatibilityService);
    compatibility.exportToPdf = vi.fn().mockRejectedValue(new Error('Fallo de prueba'));

    await editor.exportPdf();
    expect(editor.pdfExportFailed()).toBe(true);
    expect(editor.pdfExportMessage()).toContain('Fallo de prueba');

    await vi.advanceTimersByTimeAsync(5000);
    expect(editor.pdfExportMessage()).toContain('Fallo de prueba');
    await vi.advanceTimersByTimeAsync(1000);
    expect(editor.pdfExportMessage()).toBe('');
    expect(editor.pdfExportFailed()).toBe(false);
  });

  it('surfaces general showToast notifications via activeFeedbackToast and auto-clears after 3.5s', async () => {
    vi.useFakeTimers();
    const internal = editor as unknown as {
      showToast: (msg: string, tone?: 'info' | 'success' | 'error') => void;
    };

    expect(editor.activeFeedbackToast()).toBeNull();
    internal.showToast('Salto de página insertado');
    expect(editor.statusMessage()).toBe('Salto de página insertado');
    expect(editor.activeFeedbackToast()).toEqual({
      text: 'Salto de página insertado',
      tone: 'success',
      dismissible: true,
    });

    await vi.advanceTimersByTimeAsync(3499);
    expect(editor.activeFeedbackToast()?.text).toBe('Salto de página insertado');
    await vi.advanceTimersByTimeAsync(1);
    expect(editor.activeFeedbackToast()).toBeNull();

    internal.showToast('No se pudo aplicar el formato', 'error');
    expect(editor.activeFeedbackToast()).toEqual({
      text: 'No se pudo aplicar el formato',
      tone: 'error',
      dismissible: true,
    });
    editor.dismissExportFeedback();
    expect(editor.activeFeedbackToast()).toBeNull();
  });

  function render(pages: DocumentPage[]): void {
    editor.pages.set(pages);
    updateBodies();
  }

  function updateBodies(): void {
    for (const page of editor.pages()) {
      if (dom.pageBodyMap.has(page.id)) continue;
      const body = document.createElement('div');
      body.setAttribute('contenteditable', 'true');
      body.dataset['pageBodyId'] = page.id;
      body.innerHTML = page.html;
      document.body.appendChild(body);
      dom.pageBodyMap.set(page.id, body);
    }
    dom.syncInnerHtml();
  }

  function caret(id: string, start: boolean): void {
    const body = editor.getPageBody(id)!;
    body.focus();
    const range = document.createRange();
    range.selectNodeContents(body.firstElementChild ?? body);
    range.collapse(start);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }

  it('shrinks a focused page immediately while newly paginated page hosts are still being created', () => {
    render([{ id: 'a', html: '<p>Primera parte. Segunda parte.</p>' }]);
    const first = editor.getPageBody('a')!;
    first.focus();
    const pages = [{ id: 'a', html: '<p>Primera parte.</p>' }, { id: 'new', html: '<p>Segunda parte.</p>' }];
    dom.renderDocumentPages(pages, false);
    expect(first.innerHTML).toBe('<p>Primera parte.</p>');
    expect(dom.getLivePagesSnapshot()).toEqual(pages);
    updateBodies();
    expect(editor.getPageBody('new')!.textContent).toBe('Segunda parte.');
    expect(editor.getPageBody('a')!.textContent).toBe('Primera parte.');
  });

  it('repairs stale focused DOM even when the resulting pagination already matches the saved model', () => {
    const pages = [{ id: 'a', html: '<p>Primera parte.</p>' }, { id: 'b', html: '<p>Segunda parte.</p>' }];
    render(pages);
    const first = editor.getPageBody('a')!;
    first.focus();
    first.innerHTML = '<p>Primera parte. Segunda parte.</p>';
    Object.defineProperties(first, { clientWidth: { value: 300 }, clientHeight: { value: 200 } });
    dom.documentReady.set(true);
    vi.spyOn(TestBed.inject(DocumentFlowService), 'paginate').mockReturnValue(pages);
    dom.reflowDocument();
    expect(first.textContent).toBe('Primera parte.');
    expect(editor.getPageBody('b')!.textContent).toBe('Segunda parte.');
  });

  it.each(['Backspace', 'Delete'])('%s pulls the next page into free space without publishing an overflowing merged page', key => {
    const rightText = ' world one two three four five six seven eight nine ten eleven twelve';
    const initial = [{ id: 'a', html: '<p>Hello</p>' }, { id: 'b', html: `<p>${rightText}</p>` }];
    render(initial);
    const first = editor.getPageBody('a')!;
    Object.defineProperties(first, { clientWidth: { value: 300 }, clientHeight: { value: 30 } });
    dom.documentReady.set(true);
    const flow = TestBed.inject(DocumentFlowService);
    const paginate = flow.paginate.bind(flow);
    vi.spyOn(flow, 'paginate').mockImplementation((pages, canvas, height) => {
      // The complete merged text must only exist on the detached measuring canvas.
      expect(first.textContent).toBe('Hello');
      return paginate(pages, canvas, height, () => Math.ceil((canvas.textContent?.length || 0) / 10) * 10);
    });
    caret(key === 'Delete' ? 'a' : 'b', key === 'Backspace');
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    editor.onPageKeyDown(event, key === 'Delete' ? 0 : 1);
    expect(event.defaultPrevented).toBe(true);
    expect(first.textContent!.length).toBeLessThanOrEqual(30);
    expect(editor.pages().length).toBeGreaterThan(1);
    updateBodies();
    const joined = editor.pages().map(page => editor.getPageBody(page.id)!.textContent).join('');
    expect(joined).toBe('Hello' + rightText);
    expect(window.getSelection()?.anchorNode?.parentElement?.closest('[data-page-body-id]')).toBe(first);
    editor.handleGlobalUndo(); updateBodies();
    expect(editor.pages().map(page => page.html)).toEqual(initial.map(page => page.html));
  });

  function tablePaste(html: string, text: string, items: unknown[] = []): ClipboardEvent {
    const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: {
      getData: (type: string) => type === 'text/html' ? html : text, items,
    } });
    return event;
  }

  function mockHtmlInsertion(): void {
    // JSDOM no implementa execCommand: se comprueba la transacción con inserción DOM determinista.
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn((command, _ui, html) => {
      if (command !== 'insertHTML') return false;
      const range = window.getSelection()!.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      const last = fragment.lastChild!;
      range.insertNode(fragment);
      range.setStartAfter(last); range.collapse(true);
      return true;
    }) });
  }

  it('inserts an internal document reference at the saved caret and escapes the document title', async () => {
    editor.note = { _id: 'source', title: 'Source', docData: { v: 2, pages: [{ id: 'a', html: '<p>Source text</p>' }] } } as Note;
    await dom.hydrateFromNote(); updateBodies(); caret('a', false); mockHtmlInsertion();
    editor.handleInsertDocumentReference();
    window.getSelection()?.removeAllRanges();
    TestBed.inject(DocumentReferenceService).choose({ _id: 'target', title: '<img src=x onerror=bad>' } as NoteSummary);
    const link = editor.getPageBody('a')!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/?document=target');
    expect(link.textContent).toBe('<img src=x onerror=bad>');
    expect(link.querySelector('img')).toBeNull();
    expect(editor.pages()[0].html).toContain('/?document=target');
    editor.handleGlobalUndo(); updateBodies();
    expect(editor.getPageBody('a')!.querySelector('a')).toBeNull();
  });

  it('restores the selected text before applying a reference with createLink', async () => {
    editor.note = { _id: 'source', docData: { v: 2, pages: [{ id: 'a', html: '<p>Custom label</p>' }] } } as Note;
    await dom.hydrateFromNote(); updateBodies();
    const range = document.createRange(); range.selectNodeContents(editor.getPageBody('a')!.querySelector('p')!);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    const command = vi.fn(() => true); Object.defineProperty(document, 'execCommand', { configurable: true, value: command });
    editor.handleInsertDocumentReference(); window.getSelection()?.removeAllRanges();
    TestBed.inject(DocumentReferenceService).choose({ _id: 'target', title: 'Target' } as NoteSummary);
    expect(command).toHaveBeenCalledWith('createLink', false, '/?document=target');
    expect(window.getSelection()!.toString()).toBe('Custom label');
  });

  it('pastes editable HTML tables before considering an image preview and undo restores prior content', async () => {
    render([{ id: 'a', html: '<p>Before</p>' }]); caret('a', false);
    mockHtmlInsertion();
    const preview = { type: 'image/png', getAsFile: vi.fn() };
    const event = tablePaste('<table><tr><th colspan="2">Header</th></tr><tr><td>A</td><td>B</td></tr></table>', 'A\tB', [preview]);
    await editor.onPagePaste(event, 0);
    expect(event.defaultPrevented).toBe(true);
    expect(preview.getAsFile).not.toHaveBeenCalled();
    expect(editor.getPageBody('a')!.querySelector('th')!.colSpan).toBe(2);
    expect(editor.pages()[0].html).toContain('<table');
    editor.handleGlobalUndo(); updateBodies();
    expect(editor.pages()[0].html).toBe('<p>Before</p>');
    editor.handleGlobalRedo(); updateBodies();
    expect(editor.getPageBody('a')!.querySelectorAll('td')).toHaveLength(2);
  });

  it.each(['1\t2\n3\t4', '| A | B |\n| --- | --- |\n| 1 | 2 |'])('detects a textual table and commits it to the correct Word page: %s', async (text) => {
    render([{ id: 'a', html: '<p>First</p>' }, { id: 'b', html: '<p>Second</p>' }]);
    caret('b', false); mockHtmlInsertion();
    const event = tablePaste('', text);
    await editor.onPagePaste(event, 1);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.activePageIndex()).toBe(1);
    expect(editor.pages()[0].html).toBe('<p>First</p>');
    expect(editor.getPageBody('b')!.querySelectorAll('td,th')).toHaveLength(4);
  });

  it('keeps ordinary text and image-only paste behavior, and respects reading mode', async () => {
    render([{ id: 'a', html: '<p>Before</p>' }]); caret('a', false);
    const text = tablePaste('', 'A paragraph with no columns');
    await editor.onPagePaste(text, 0);
    expect(text.defaultPrevented).toBe(false);
    const image = { type: 'image/png', getAsFile: vi.fn(() => null) };
    const event = tablePaste('', '', [image]);
    await editor.onPagePaste(event, 0);
    expect(event.defaultPrevented).toBe(true);
    expect(image.getAsFile).toHaveBeenCalledOnce();
    editor.viewMode.set('read');
    const read = tablePaste('', '1\t2');
    await editor.onPagePaste(read, 0);
    expect(read.defaultPrevented).toBe(false);
    expect(editor.pages()[0].html).toBe('<p>Before</p>');
  });

  it('Backspace joins adjacent paragraphs and undo/redo restores both pages and the caret', () => {
    render([{ id: 'a', html: '<p>Hello</p>' }, { id: 'b', html: '<p>World</p>' }]);
    editor.activePageIndex.set(1);
    caret('b', true);
    const key = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
    editor.onPageKeyDown(key, 1);
    updateBodies();
    expect(key.defaultPrevented).toBe(true);
    expect(editor.pages()).toHaveLength(1);
    expect(editor.getPageBody('a')!.textContent).toBe('HelloWorld');
    expect(editor.pages()[0].html).not.toContain('weave-selection');

    editor.handleGlobalUndo();
    updateBodies();
    expect(editor.pages()).toHaveLength(2);
    expect(editor.getPageBody('b')!.textContent).toBe('World');
    expect(editor.getPageBody('b')!.contains(window.getSelection()!.anchorNode)).toBe(true);
    editor.handleGlobalRedo();
    updateBodies();
    expect(editor.pages()).toHaveLength(1);
    expect(editor.getPageBody('a')!.textContent).toBe('HelloWorld');
  });

  it.each([
    ['Backspace', '<ul><li><p>Hello</p></li></ul>', '<p>World</p>'],
    ['Delete', '<ul><li><p>Hello</p></li></ul>', '<p>World</p>'],
    ['Backspace', '<p>Hello</p>', '<ul><li><p>World</p></li><li>Keep</li></ul>'],
    ['Delete', '<p>Hello</p>', '<ul><li><p>World</p></li><li>Keep</li></ul>'],
    ['Backspace', '<ul><li>Hello</li></ul>', '<ol><li>World</li><li>Keep</li></ol>'],
    ['Delete', '<ul><li>Hello</li></ul>', '<ol><li>World</li><li>Keep</li></ol>'],
  ])('%s merges a list/paragraph page boundary without getting stuck', (key, left, right) => {
    render([{ id: 'a', html: left }, { id: 'b', html: right }]);
    const backwards = key === 'Backspace';
    caret(backwards ? 'b' : 'a', backwards);
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    editor.onPageKeyDown(event, backwards ? 1 : 0);
    updateBodies();
    expect(event.defaultPrevented).toBe(true);
    const body = editor.getPageBody('a')!;
    expect(body.textContent).toBe('HelloWorld' + (right.includes('Keep') ? 'Keep' : ''));
    expect(body.querySelector('p,li')!.textContent).toContain('HelloWorld');
    editor.handleGlobalUndo(); updateBodies();
    expect(editor.pages().map(page => page.html)).toEqual([left, right]);
  });

  it.each(['Backspace', 'Delete'])('%s at a table boundary moves the caret and permits native deletion on the next key', key => {
    const table = '<table><tbody><tr><td>Cell</td></tr></tbody></table>';
    const backwards = key === 'Backspace';
    const initial = [{ id: 'a', html: backwards ? table : '<p>Hello</p>' }, { id: 'b', html: backwards ? '<p>World</p>' : table }];
    render(initial);
    caret(backwards ? 'b' : 'a', backwards);
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    editor.onPageKeyDown(event, backwards ? 1 : 0);
    expect(event.defaultPrevented).toBe(true);
    const target = editor.getPageBody(backwards ? 'a' : 'b')!;
    expect(target.contains(window.getSelection()!.anchorNode)).toBe(true);
    const next = new KeyboardEvent('keydown', { key, cancelable: true });
    editor.onPageKeyDown(next, backwards ? 0 : 1);
    expect(next.defaultPrevented).toBe(false);
    expect(editor.pages()).toEqual(initial);
  });

  it.each(['Backspace', 'Delete'])('%s removes one character at an automatic paragraph continuation', (keyName) => {
    render([
      { id: 'a', html: '<p data-word-flow="paragraph">Hello</p>' },
      { id: 'b', html: '<p data-word-flow="paragraph" data-word-continuation="paragraph">World</p>' },
    ]);
    const backwards = keyName === 'Backspace';
    caret(backwards ? 'b' : 'a', backwards);
    const key = new KeyboardEvent('keydown', { key: keyName, cancelable: true });
    editor.onPageKeyDown(key, backwards ? 1 : 0);
    updateBodies();
    expect(editor.getPageBody('a')!.textContent).toBe(backwards ? 'HellWorld' : 'Helloorld');
  });

  it('deletes only the explicit break when Backspace starts a manually separated page', () => {
    render([
      { id: 'a', html: '<p>Hello</p>' },
      { id: 'b', html: '<p>World</p>', breakBefore: 'manual' },
    ]);
    caret('b', true);
    editor.onPageKeyDown(new KeyboardEvent('keydown', { key: 'Backspace' }), 1);
    updateBodies();
    expect(editor.pages()[1].breakBefore).toBeUndefined();
    expect(editor.pages().map((p) => p.html).join('')).toContain('Hello');
    expect(editor.getPageBody('b')!.textContent).toBe('World');
    expect(editor.pages().some((p) => p.html.includes('weave-selection'))).toBe(false);
  });

  it('inserts a manual page break at the exact caret inside formatted text', () => {
    render([{ id: 'a', html: '<p><b>Hello world</b></p><p>Next paragraph</p>' }]);
    const body = editor.getPageBody('a')!;
    const range = document.createRange();
    range.setStart(body.querySelector('b')!.firstChild!, 6);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    editor.handleInsertPageBreak();
    updateBodies();
    expect(editor.pages()).toHaveLength(2);
    expect(editor.getPageBody('a')!.textContent).toBe('Hello ');
    const next = editor.pages()[1];
    expect(next.breakBefore).toBe('manual');
    expect(editor.getPageBody(next.id)!.textContent).toBe('worldNext paragraph');
    expect(editor.getPageBody(next.id)!.querySelector('b')!.textContent).toBe('world');
  });

  it('keeps the pre-edit override snapshot instead of overwriting it from the modified DOM', () => {
    render([{ id: 'a', html: '<p>Before</p>', breakBefore: 'manual' }]);
    editor.getPageBody('a')!.innerHTML = '<p>After</p>';
    editor.pushUndoSnapshot([{ id: 'a', html: '<p>Before</p>', breakBefore: 'manual' }]);
    editor.handleGlobalUndo();
    updateBodies();
    expect(editor.pages()[0].html).toBe('<p>Before</p>');
    expect(editor.pages()[0].breakBefore).toBe('manual');
  });

  it('does not jump to the previous page when there is still a blank paragraph before the caret', () => {
    render([{ id: 'a', html: '<p>Previous page</p>' }, { id: 'b', html: '<p><br></p><p>Text</p>' }]);
    const range = document.createRange();
    range.setStart(editor.getPageBody('b')!.lastChild!.firstChild!, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const key = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
    editor.onPageKeyDown(key, 1);
    expect(key.defaultPrevented).toBe(true);
    expect(editor.pages()).toHaveLength(2);
    expect(editor.getPageBody('a')!.textContent).toBe('Previous page');
    expect(editor.getPageBody('b')!.innerHTML).toBe('<p>Text</p>');
    expect(editor.getPageBody('b')!.contains(window.getSelection()!.anchorNode)).toBe(true);
  });

  it('Enter in a continued list item creates a distinct item instead of rejoining it', () => {
    render([{ id: 'a', html: '<ol><li data-word-flow="item">Before</li><li data-word-flow="item" data-word-continuation="item"><p>New item</p></li></ol>' }]);
    const range = document.createRange();
    range.setStart(editor.getPageBody('a')!.querySelector('p')!.firstChild!, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    editor.onPageInput(new InputEvent('input', { inputType: 'insertParagraph' }), 0);
    expect(editor.getPageBody('a')!.querySelector('li:last-child')!.hasAttribute('data-word-continuation')).toBe(false);
  });

  it('starts a new Word document with one empty page, header and footer', async () => {
    editor.note = { _id: 'new', title: 'My document', docType: 'doc', docData: null } as Note;
    await dom.hydrateFromNote();
    expect(editor.docTitle()).toBe('My document');
    expect(editor.pages()).toHaveLength(1);
    const holder = document.createElement('div');
    holder.innerHTML = editor.pages()[0].html;
    expect(holder.textContent).toBe('');
    expect(holder.querySelector('p')).toBeTruthy();
    expect(editor.layoutConfig().headerHtml).toBe('');
    expect(editor.layoutConfig().footerHtml).toBe('');
  });

  it('preserves an existing document and its own header when opened', async () => {
    editor.note = { _id: 'existing', title: 'Existing', docType: 'doc', docData: {
      v: 2, pages: [{ id: 'saved', html: '<p>Saved content</p>' }],
      layoutConfig: { headerHtml: '<p>My header</p>', footerHtml: '<p>My footer</p>' },
    } } as Note;
    await dom.hydrateFromNote();
    expect(editor.pages()[0].html).toBe('<p>Saved content</p>');
    expect(editor.layoutConfig().headerHtml).toBe('<p>My header</p>');
    expect(editor.layoutConfig().footerHtml).toBe('<p>My footer</p>');
  });

  it('does not reconnect the size observer when the first page is unchanged', () => {
    render([{ id: 'a', html: '<p>A</p>' }, { id: 'b', html: '<p>B</p>' }]);
    const observe = vi.fn();
    const disconnect = vi.fn();
    dom.bodyResizeObserver = { observe, disconnect } as unknown as ResizeObserver;
    dom.observeBodySize();
    dom.observeBodySize();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    editor.pages.set([{ id: 'b', html: '<p>B</p>' }]);
    dom.observeBodySize();
    dom.observeBodySize();
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('settles after deleting a page without repeatedly paginating or rewriting unaffected pages', () => {
    render([
      { id: 'a', html: '<p>A</p>' },
      { id: 'b', html: '<p>B</p>', breakBefore: 'manual' },
      { id: 'c', html: '<p>C</p>', breakBefore: 'manual' },
    ]);
    const first = editor.getPageBody('a')!;
    Object.defineProperties(first, {
      clientWidth: { value: 300, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    dom.documentReady.set(true);
    const paginate = vi.spyOn(TestBed.inject(DocumentFlowService), 'paginate');
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(1);
    const writeHtml = vi.spyOn(first, 'innerHTML', 'set');
    editor.handleDeletePage(1);
    updateBodies();
    dom.reflowDocument();
    updateBodies();
    for (let tick = 0; tick < 5; tick++) { dom.syncInnerHtml(); dom.reflowDocument(); }
    expect(paginate).toHaveBeenCalledTimes(2);
    expect(writeHtml).not.toHaveBeenCalled();
    expect(editor.pages().map((page) => page.id)).toEqual(['a', 'c']);
    expect(editor.activePageIndex()).toBe(0);
    editor.handleGlobalUndo();
    updateBodies();
    expect(editor.pages().map((page) => page.id)).toEqual(['a', 'b', 'c']);
  });

  it('invalidates settled pagination on font/image load and when the useful page size changes', () => {
    render([{ id: 'a', html: '<p>A</p>' }]);
    const first = editor.getPageBody('a')!;
    Object.defineProperties(first, {
      clientWidth: { value: 300, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    dom.documentReady.set(true);
    const paginate = vi.spyOn(TestBed.inject(DocumentFlowService), 'paginate');
    dom.reflowDocument();
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 8; i++) {
      first.classList.toggle('word-hybrid-source');
      dom.reflowDocument();
    }
    expect(paginate).toHaveBeenCalledTimes(1);
    dom.invalidateDocumentFlow();
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(2);
    Object.defineProperty(first, 'clientWidth', { value: 400 });
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(3);
  });

  it('keeps Canvas mode enabled when switching ribbon tabs or capturing ribbon selection', () => {
    editor.canvasEnabled.set(true);
    editor.canvasEditor = {
      session: { pages: [], sections: [], activeSection: 0, selection: null } as unknown,
      markedPages: vi.fn(() => editor.pages()),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.rememberRibbonSelection();
    editor.activeTab.set('insert');
    editor.rememberRibbonSelection();
    editor.activeTab.set('styles');

    expect('leaveCanvas' in editor).toBe(false);
    expect(editor.canvasEnabled()).toBe(true);
  });

  it('applies headings, detects formats/tables, and navigates TOC directly in Canvas mode without leaving Canvas', () => {
    const applyBlockRule = vi.fn(() => true);
    const findHeadingLocation = vi.fn(() => ({ pageIndex: 2, y: 120 }));
    const findTableLocation = vi.fn(() => ({ pageIndex: 3, y: 80 }));
    const getSelectionContext = vi.fn(() => ({
      formats: {
        ...editor.formats(),
        heading: 'H2',
        bold: true,
        fontName: 'Times New Roman',
        fontSize: '14',
      },
      table: { tableId: 't1', rowId: 'r1', cellId: 'c1' },
      tocEntry: null,
    }));
    const publishNow = vi.fn();
    const jump = vi.fn();
    editor.canvasEnabled.set(true);
    editor.canvasEditor = {
      session: {
        applyBlockRule,
        findHeadingLocation,
        findTableLocation,
        getSelectionContext,
      } as unknown,
      publishNow,
      jump,
      markedPages: vi.fn(() => editor.pages()),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.handleApplyHeading('H2');
    expect(applyBlockRule).toHaveBeenCalled();
    expect(publishNow).toHaveBeenCalled();
    expect(editor.canvasEnabled()).toBe(true);
    expect(editor.formats().heading).toBe('H2');
    expect(editor.formats().bold).toBe(true);
    expect(editor.activeTableCell()).not.toBeNull();

    editor.handleCanvasTocNavigate({ targetId: 'heading-1', pageIndex: 2, title: 'Introducción' });
    expect(findHeadingLocation).toHaveBeenCalledWith('heading-1', 'Introducción', 2);
    expect(jump).toHaveBeenCalledWith(2, 120);
    expect(editor.activePageIndex()).toBe(2);

    editor.handleSelectTableInSidebar({ id: 'tbl-1', title: 'Integrantes', rows: 4, cols: 3, pageIndex: 3, tableIndexInPage: 0 });
    expect(findTableLocation).toHaveBeenCalledWith(3, 0, 'Integrantes');
    expect(jump).toHaveBeenCalledWith(3, 80);
    expect(editor.activePageIndex()).toBe(3);
  });

  it('inserts tables and inserts/updates/deletes LaTeX formulas directly in Canvas mode without leaving Canvas', () => {
    const insertTable = vi.fn(() => true);
    const insertOrUpdateLatexFormula = vi.fn(() => true);
    const deleteLatexFormula = vi.fn(() => true);
    const getSelectionContext = vi.fn(() => ({
      formats: editor.formats(),
      table: { tableId: 't1', rowId: 'r1', cellId: 'c1' },
      tocEntry: null,
    }));
    const publishNow = vi.fn();
    editor.canvasEnabled.set(true);
    editor.canvasEditor = {
      session: {
        insertTable,
        insertOrUpdateLatexFormula,
        deleteLatexFormula,
        getSelectionContext,
      } as unknown,
      publishNow,
      markedPages: vi.fn(() => editor.pages()),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.handleInsertTable(3, 4);
    expect(insertTable).toHaveBeenCalledWith(3, 4, expect.any(Boolean), 0, undefined);
    expect(publishNow).toHaveBeenCalledTimes(1);
    expect(editor.canvasEnabled()).toBe(true);
    expect(editor.activeTableCell()).not.toBeNull();

    editor.handleInsertOrUpdateLatexFormula('\\frac{a}{b}');
    expect(insertOrUpdateLatexFormula).toHaveBeenCalledWith(expect.stringContaining('word-latex-formula'), null, 0);
    expect(publishNow).toHaveBeenCalledTimes(2);
    expect(editor.canvasEnabled()).toBe(true);

    editor.handleCanvasLatexEdit({ nodeId: 'formula-node-1', latex: '\\frac{a}{b}' });
    expect(editor.editingLatexNodeId()).toBe('formula-node-1');
    expect(editor.editingLatexCode()).toBe('\\frac{a}{b}');
    expect(editor.latexModalOpen()).toBe(true);

    editor.handleInsertOrUpdateLatexFormula('E=mc^2');
    expect(insertOrUpdateLatexFormula).toHaveBeenCalledWith(expect.stringContaining('word-latex-formula'), 'formula-node-1', 0);
    expect(editor.editingLatexNodeId()).toBeNull();

    editor.handleCanvasLatexEdit({ nodeId: 'formula-node-2', latex: 'E=mc^2' });
    editor.handleDeleteExistingLatexFormula();
    expect(deleteLatexFormula).toHaveBeenCalledWith('formula-node-2');
    expect(editor.editingLatexNodeId()).toBeNull();
    expect(editor.canvasEnabled()).toBe(true);
  });

  it('switches design templates (APA Times 12 <-> APA Arial 11) and runs Undo/Redo directly in Canvas mode without leaving Canvas', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const applyTemplateToDocument = vi.fn(() => true);
    const canUndo = vi.fn(() => true);
    const canRedo = vi.fn(() => true);
    const undoWithMeta = vi.fn((redo: boolean) => ({
      ok: true,
      meta: { activeTemplateId: redo ? 'apa-arial-11' : 'apa-times-12' },
    }));
    const publishNow = vi.fn();
    editor.canvasEditor = {
      session: {
        applyTemplateToDocument,
        canUndo,
        canRedo,
        undoWithMeta,
        getSelectionContext: vi.fn(() => null),
      } as unknown,
      publishNow,
      markedPages: vi.fn(() => editor.pages()),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    const apaTimes = editor.styleTemplates().find(t => t.id === 'apa-times-12')!;
    const apaArial = editor.styleTemplates().find(t => t.id === 'apa-arial-11')!;

    editor.handleApplyTemplateToDocument(apaTimes);
    expect(editor.activeTemplateId()).toBe('apa-times-12');
    expect(editor.layoutConfig().apa?.fontFamily).toBe('Times New Roman');
    expect(editor.layoutConfig().apa?.fontSizePt).toBe(12);
    expect(applyTemplateToDocument).toHaveBeenCalledTimes(1);

    editor.handleApplyTemplateToDocument(apaArial);
    expect(editor.activeTemplateId()).toBe('apa-arial-11');
    expect(editor.layoutConfig().apa?.fontFamily).toBe('Arial');
    expect(editor.layoutConfig().apa?.fontSizePt).toBe(11);
    expect(applyTemplateToDocument).toHaveBeenCalledTimes(2);

    editor.handleGlobalUndo();
    expect(undoWithMeta).toHaveBeenCalledWith(false, expect.any(Object));
    expect(editor.activeTemplateId()).toBe('apa-times-12');

    editor.handleGlobalRedo();
    expect(undoWithMeta).toHaveBeenCalledWith(true, expect.any(Object));
    expect(editor.activeTemplateId()).toBe('apa-arial-11');
    expect(editor.canvasEnabled()).toBe(true);
  });

  it('detects tables and figures from Canvas pages when opening References in Canvas mode', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const canvasPages = [
      { id: 'p1', html: '<p>Introducción</p><table data-word-object-id="t1" data-apa-captioned="true" data-apa-title="Tabla 1"><tbody><tr><td>Celda</td></tr></tbody></table>' },
      { id: 'p2', html: '<p>Resultados</p><img data-word-object-id="f1" data-apa-captioned="true" data-apa-title="Figura 1" src="test.png" />' },
    ];
    editor.canvasEditor = {
      session: {
        pages: canvasPages,
        load: vi.fn(),
      } as unknown,
      publishNow: vi.fn(),
      markedPages: vi.fn(() => canvasPages),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.handleOpenAcademic('objects');
    expect(editor.academic.open()).toBe(true);
    expect(editor.academic.section()).toBe('objects');
    expect(editor.academic.objects().length).toBe(2);
    expect(editor.academic.objects()[0].id).toBe('t1');
    expect(editor.academic.objects()[0].kind).toBe('table');
    expect(editor.academic.objects()[1].id).toBe('f1');
    expect(editor.academic.objects()[1].kind).toBe('figure');
    editor.academic.close();
  });

  it('executes APA citations, bibliography, captions, notes, sections, and undo natively in Canvas mode without leaving Canvas', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession({ width: 600, height: 800, top: 72, right: 72, bottom: 72, left: 72 }, { font: '16px "Times New Roman"', lineHeight: 24 }, measure);
    session.load([{ id: 'p1', html: '<p>Estudio previo</p><table><tbody><tr><td>Dato</td></tr></tbody></table>' }]);
    const firstLeaf = textNodes(session.engine.getSections()[0].model.state.roots)[0];
    session.setSelection(0, { anchor: { nodeId: firstLeaf.id, offset: firstLeaf.text.length }, focus: { nodeId: firstLeaf.id, offset: firstLeaf.text.length } });

    const publishNow = vi.fn();
    const focus = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow,
      focus,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.academic.show('sources');
    editor.academic.save({
      ...emptySource(),
      id: 's1', kind: 'book',
      authors: [{ family: 'Gómez', given: 'Luis' }],
      year: '2021',
      title: 'Canvas Editorial',
      publisher: 'Alfa',
    });
    expect(editor.bibliographicSources()).toHaveLength(1);

    editor.academic.cite({
      sourceId: 's1', additionalIds: [], narrative: false, locator: 'p. 12',
      quoteText: '', quoteEnding: false, secondaryAuthor: '', secondaryYear: '',
    });
    expect(session.pages.map(p => p.html).join('')).toContain('Gómez, 2021, p. 12');

    editor.academic.bibliography();
    expect(session.pages.length).toBeGreaterThanOrEqual(2);
    expect(session.pages.map(p => p.html).join('')).toContain('Referencias');

    editor.handleOpenAcademic('objects');
    const tblId = editor.academic.objects()[0]?.id;
    expect(tblId).toBeTruthy();
    editor.academic.caption({ id: tblId!, title: 'Resultados', note: 'Fuente propia', sourceId: '', attribution: '' });
    expect(session.pages[0].html).toContain('Tabla 1');

    editor.academic.saveNote({ kind: 'endnote', text: 'Nota final Canvas' });
    expect(session.pages.map(p => p.html).join('')).toContain('Nota final Canvas');

    editor.academic.insertSection({
      kind: 'cover', title: 'Tesis', authors: 'Ana', affiliations: 'Univ',
      course: '', instructor: '', date: '2026', authorNote: '', professional: false,
    });
    expect(session.pages[0].html).toContain('data-apa-section="cover"');
    expect(editor.canvasEnabled()).toBe(true);

    editor.handleGlobalUndo();
    expect(session.pages[0].html).not.toContain('data-apa-section="cover"');
    expect(editor.canvasEnabled()).toBe(true);
    expect(publishNow).toHaveBeenCalled();
  });

  it('inserts and updates TOC natively in Canvas without DOM measurement or resetting undo stack', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 600, height: 800, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<h1>Capitulo Inicial</h1><p>Contenido base</p>' }]);
    const publishNow = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow,
      focus: vi.fn(),
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    const loadSpy = vi.spyOn(session, 'load');

    editor.handleInsertToc();
    const afterInsert = session.pages.map((p) => p.html).join('');
    expect(afterInsert).toContain('word-toc-page-section');
    expect(afterInsert).toContain('Capitulo Inicial');
    expect(loadSpy).not.toHaveBeenCalled();
    expect(editor.canvasEnabled()).toBe(true);

    const matches = session.findMatches('Capitulo Inicial', true, true);
    expect(matches.length).toBeGreaterThan(0);
    expect(session.replaceMatch(matches[0], 'Capitulo Actualizado')).toBe(true);

    editor.handleUpdateToc();
    const afterUpdate = session.pages.map((p) => p.html).join('');
    expect(afterUpdate).toContain('Capitulo Actualizado');
    expect(loadSpy).not.toHaveBeenCalled();

    editor.handleGlobalUndo();
    expect(session.pages.map((p) => p.html).join('')).toContain('Capitulo Inicial');
    expect(publishNow).toHaveBeenCalled();
  });

  it('executes secondary commands and inserts natively in Canvas without leaving Canvas', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 600, height: 800, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<h1><span style="color:#ff0000;font-weight:bold">Texto base</span></h1>' }]);
    const publishNow = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow,
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    const loadSpy = vi.spyOn(session, 'load');

    editor.onRibbonCommand({ command: 'headingNumbering', value: 'on' });
    expect(editor.headingNumbering()).toBe(true);

    session.selectAll();
    editor.onRibbonCommand({ command: 'removeFormat' });
    expect(session.pages[0].html).toContain('<p');
    expect(session.pages[0].html).not.toContain('<h1');

    session.selectAll();
    editor.executeCommand('createLink', 'https://weave.example/doc');
    expect(session.pages[0].html).toContain('href="https://weave.example/doc"');

    session.selectAll();
    editor.handleInsertBlockquote();
    expect(session.pages[0].html).toContain('<blockquote');

    editor.handleInsertChecklist();
    editor.handleInsertComment();
    editor.handleInsertSymbol('Ω');
    editor.handleInsertDropCap();

    const html = session.pages.map((p) => p.html).join('');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('word-comment-badge');
    expect(html).toContain('Ω');
    expect(html).toContain('float:left');
    expect(editor.canvasEnabled()).toBe(true);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('preserves and restores scroll position across scroll events', () => {
    const scroller = document.createElement('div');
    scroller.scrollTop = 750;
    scroller.scrollLeft = 50;
    editor.mainScrollRef = { nativeElement: scroller };
    editor.onMainScroll();
    expect((editor as unknown as { lastScrollTop: number }).lastScrollTop).toBe(750);
    expect((editor as unknown as { lastScrollLeft: number }).lastScrollLeft).toBe(50);
  });

  it('keeps Canvas surface active in web/draft views, reads aloud from Canvas model, and applies AI model edits without DOMParser', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 600, height: 800, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<h1>Encabezado</h1><p>Texto legible en Canvas</p>' }]);
    const publishNow = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow,
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];

    editor.viewMode.set('web');
    expect(editor.canvasEnabled()).toBe(true);
    editor.viewMode.set('draft');
    expect(editor.canvasEnabled()).toBe(true);

    const originalSpeech = window.speechSynthesis;
    const speakSpy = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speaking: false, speak: speakSpy, cancel: vi.fn() },
    });
    const originalUtterance = globalThis.SpeechSynthesisUtterance;
    globalThis.SpeechSynthesisUtterance = function (this: { text: string; lang: string }, text: string) {
      this.text = text;
      this.lang = '';
    } as unknown as typeof SpeechSynthesisUtterance;

    try {
      editor.handleReadAloud();
      expect(speakSpy).toHaveBeenCalledTimes(1);
      expect(speakSpy.mock.calls[0][0].text).toContain('Texto legible en Canvas');
    } finally {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: originalSpeech });
      globalThis.SpeechSynthesisUtterance = originalUtterance;
    }

    const aiFields = Array.from((editor as unknown as { aiTextFields(): Iterable<{ id: string; text: string }> }).aiTextFields());
    expect(aiFields.some(f => f.id.startsWith('model:'))).toBe(true);
  });

  it('inserts section breaks with roman/arabic restarts and per-section landscape orientation in Canvas mode', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 816, height: 1056, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<p>Portada</p>' }]);
    const publishNow = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow,
      jump: vi.fn(),
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);
    editor.activePageIndex.set(0);

    editor.handleUpdateSectionConfig({ differentFirstPage: true }, 0);
    editor.handleInsertSectionBreak({ pageNumberFormat: 'roman-lower', restartPageNumbering: 1 });
    editor.handleInsertSectionBreak({ pageNumberFormat: 'decimal', restartPageNumbering: 1, orientation: 'landscape' });

    const sections = editor.resolvedPageSections();
    expect(sections).toHaveLength(3);
    expect(sections[0].suppressHeaderFooter).toBe(true);
    expect(sections[1].formattedPageNumber).toBe('i');
    expect(sections[2].formattedPageNumber).toBe('1');
    expect(sections[2].orientation).toBe('landscape');

    // Display list for section 3 must have landscape dimensions while section 1 stays portrait
    const dls = session.displayLists;
    expect(dls[0].width).toBeLessThan(dls[0].height);
    expect(dls[2].width).toBeGreaterThan(dls[2].height);
  });

  it('inserts TextBox, Comment, Audio, Video, Screenshot, Icon and SmartArt with vector SVGs and zero emojis in Canvas mode', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 816, height: 1056, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<p>Documento inicial</p>' }]);
    editor.canvasEditor = {
      session,
      publishNow: vi.fn(),
      jump: vi.fn(),
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);

    editor.handleInsertTextBox();
    editor.handleInsertComment();
    editor.handleInsertAudioPlaceholder();
    editor.handleInsertVideoPlaceholder();
    editor.handleInsertScreenshot();
    editor.handleInsertIcon('star');
    editor.handleInsert3dModel();
    SMARTART_ITEMS.forEach(item => editor.handleInsertSmartArt(item));

    const combinedHtml = session.pages.map(p => p.html).join('');
    expect(combinedHtml).toContain('word-textbox');
    expect(combinedHtml).toContain('word-comment-badge');
    expect(combinedHtml).toContain('<svg');
    expect(combinedHtml).not.toMatch(/[📊📷💡🎵🎬💬📸✍]/u);

    // Every inserted SVG icon/shape/placeholder must lay out into Canvas draw commands without throwing
    expect(session.displayLists.length).toBeGreaterThanOrEqual(1);
    const allCmds = session.displayLists.flatMap(dl => dl.commands);
    expect(allCmds.some(c => c.kind === 'image' && c.assetId.startsWith('data:image/svg+xml'))).toBe(true);
  });

  it('opens right-click table context menu and applies splitCell, verticalAlign, shading and repeatHeader in Canvas mode', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 7, ascent: 8, descent: 2 });
    const session = new CanvasEditSession(
      { width: 816, height: 1056, top: 72, right: 72, bottom: 72, left: 72 },
      { font: '16px "Times New Roman"', lineHeight: 24 },
      measure,
    );
    session.load([{ id: 'p1', html: '<table><thead><tr><th>Col 1</th><th>Col 2</th></tr></thead><tbody><tr><td>D1</td><td>D2</td></tr></tbody></table>' }]);
    const d1Leaf = textNodes(session.engine.getSections()[0].model.state.roots).find(t => t.text === 'D1')!;
    session.setSelection(0, { anchor: { nodeId: d1Leaf.id, offset: 0 }, focus: { nodeId: d1Leaf.id, offset: 0 } });
    editor.canvasEditor = {
      session,
      publishNow: vi.fn(),
      jump: vi.fn(),
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);
    editor.updateSelectionFormats();

    editor.openTableContextMenu(140, 180);
    expect(editor.tableContextMenu()).toEqual({ x: 140, y: 180 });
    editor.onEscapeCloseTableContextMenu();
    expect(editor.tableContextMenu()).toBeNull();

    editor.openTableContextMenu(140, 180);
    editor.setTableCellVerticalAlign('middle');
    editor.setTableCellBackground('#dbeafe');
    editor.toggleTableHeaderRepeat();
    expect(editor.tableContextMenu()).toBeNull();
    expect(editor.activeTableVerticalAlign()).toBe('middle');
    expect(editor.activeTableRepeatHeader()).toBe(false);
    expect(session.pages[0].html).toContain('background-color: #dbeafe');
    expect(session.pages[0].html).toContain('vertical-align: middle');
    expect(session.pages[0].html).toContain('data-repeat-header="false"');

    editor.openTableContextMenu(140, 180);
    editor.runContextTableAction('splitCell');
    expect(editor.tableContextMenu()).toBeNull();
    expect(session.pages[0].html).toContain('colspan="2"');
  });

  it('inserts and navigates Table Index and Figure Index in Canvas mode without leaving Canvas', () => {
    editor.documentReady.set(true);
    editor.canvasEnabled.set(true);
    const measure = (s: string) => ({ width: [...s].length * 6, ascent: 9, descent: 3 });
    const session = new CanvasEditSession(
      { width: 600, height: 800, top: 60, right: 60, bottom: 60, left: 60 },
      { font: '14px "Times New Roman"', lineHeight: 20 },
      measure,
    );
    session.load([
      {
        id: 'sec-1',
        html:
          '<table id="tbl-idx" data-word-object-id="tbl-idx" data-apa-captioned="true" data-apa-title="Métricas"><thead><tr><th>K</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>' +
          '<figure><img id="fig-idx" data-word-object-id="fig-idx" src="a.png" width="120" height="80"><figcaption>Figura 1: Diagrama</figcaption></figure>',
      },
    ]);
    const jump = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow: vi.fn(),
      jump,
      focus: vi.fn(),
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);

    editor.handleInsertObjectIndex('table');
    expect(session.pages[0].html).toContain('data-word-list-of="tables"');
    expect(session.pages[0].html).toContain('Métricas');

    editor.handleInsertObjectIndex('figure');
    expect(session.pages[1].html).toContain('data-word-list-of="figures"');
    expect(session.pages[1].html).toContain('Diagrama');

    editor.handleCanvasTocNavigate({ targetId: 'fig-idx', pageIndex: 2, title: 'Figura 1: Diagrama' });
    expect(jump).toHaveBeenCalledWith(2, expect.any(Number));
    expect(editor.activePageIndex()).toBe(2);
    expect(editor.canvasEnabled()).toBe(true);
  });

  it('manages anchored comments, track changes accept/reject, hide-on-export, and persistence (Fase 6)', async () => {
    editor.canvasEnabled.set(true);
    const session = new CanvasEditSession(editor.canvasGeometry(), editor.canvasDefaults());
    session.load([{ id: 'p-rev', html: '<p>Contrato vigente de prueba</p>' }]);
    const leaves = textNodes(session.engine.getSections()[0].model.state.roots);
    session.setSelection(0, {
      anchor: { nodeId: leaves[0].id, offset: 0 },
      focus: { nodeId: leaves[0].id, offset: 8 },
    });

    editor.canvasEditor = {
      session,
      publishNow: vi.fn(),
      refresh: vi.fn(),
      focus: vi.fn(),
      scale: () => 1,
      pageTopFor: (idx: number) => idx * 900,
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
      exportDisplayLists: (opts?: { hideComments?: boolean }) => {
        const fakeCtrl = opts;
        void fakeCtrl;
        return session.displayLists;
      },
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);

    const thread = editor.createComment('Validar término legal', 'Evert');
    expect(thread).toBeTruthy();
    expect(thread?.quote).toBe('Contrato');
    expect(editor.comments().length).toBe(1);
    expect(editor.commentsPanelOpen()).toBe(true);
    expect(session.pages[0].html).toContain(`data-word-comment-id="${thread!.id}"`);

    expect(editor.replyToComment(thread!.id, 'Listo', 'Ana')).toBe(true);
    expect(editor.comments()[0].replies.length).toBe(1);
    expect(editor.resolveComment(thread!.id, true)).toBe(true);
    expect(editor.comments()[0].resolved).toBe(true);

    // Export HTML hides comment markup without altering live editor pages when hideCommentsOnExport is true
    const compatibility = TestBed.inject(WordCompatibilityService);
    const htmlExportSpy = vi.fn().mockResolvedValue(undefined);
    compatibility.exportToHtmlFile = htmlExportSpy;
    editor.toggleHideCommentsOnExport(true);
    await editor.exportHtml();
    expect(htmlExportSpy).toHaveBeenCalled();
    const exportedPages = htmlExportSpy.mock.calls.at(-1)?.[1] as { html: string }[];
    expect(exportedPages[0].html).not.toContain('data-word-comment-id');
    expect(exportedPages[0].html).toContain('Contrato vigente de prueba');
    expect(session.pages[0].html).toContain('data-word-comment-id');

    // Track changes insertion & acceptAllRevisions
    editor.toggleTrackChanges(true);
    expect(session.trackChangesEnabled).toBe(true);
    const updatedLeaves = textNodes(session.engine.getSections()[0].model.state.roots);
    const lastLeaf = updatedLeaves[updatedLeaves.length - 1];
    session.setSelection(0, {
      anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
      focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
    });
    session.insert(' final');
    editor.reviewController.refreshRevisions();
    expect(editor.revisions().length).toBe(1);
    expect(editor.acceptAllRevisions()).toBe(true);
    expect(editor.revisions().length).toBe(0);
    expect(session.getReadableText()).toContain('final');

    // Persistence roundtrip preserves comments + flags
    const saved = (editor as unknown as { collectDocData: () => any }).collectDocData();
    expect(saved.comments?.length).toBe(1);
    expect(saved.trackChangesEnabled).toBe(true);
    expect(saved.hideCommentsOnExport).toBe(true);

    editor.note = { _id: 'note-rev', docData: saved } as any;
    await (editor as unknown as { hydrateFromNote: () => Promise<void> }).hydrateFromNote();
    expect(editor.comments().length).toBe(1);
    expect(editor.comments()[0].replies[0].text).toBe('Listo');
    expect(editor.trackChangesEnabled()).toBe(true);
    expect(editor.hideCommentsOnExport()).toBe(true);
  });

  it('highlights all search matches in Canvas and applies interactive ruler APA 36pt indents (Fase 7)', () => {
    editor.canvasEnabled.set(true);
    const session = new CanvasEditSession(editor.canvasGeometry(), editor.canvasDefaults());
    session.load([{ id: 'p-f7', html: '<p>Contrato uno y Contrato dos y Contrato tres.</p>' }]);
    const leaves = textNodes(session.engine.getSections()[0].model.state.roots);
    session.setSelection(0, { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[0].id, offset: 0 } });

    const refresh = vi.fn();
    editor.canvasEditor = {
      session,
      publishNow: vi.fn(),
      refresh,
      jump: vi.fn(),
      focus: vi.fn(),
      scale: () => 1,
      pageTopFor: (idx: number) => idx * 900,
      selectedImage: () => null,
      markedPages: () => session.engine.getMarkedPages(),
    } as unknown as PureDocEditorComponent['canvasEditor'];
    editor.pages.set(session.pages);

    editor.openDocumentSearch('find');
    editor.updateSearchConfig({ query: 'Contrato' });
    let overlaid = session.overlay(session.displayLists[0]);
    expect(overlaid.searchHighlights?.length).toBe(3);
    expect(overlaid.activeSearchHighlight).toBeUndefined();

    editor.handleSearchAction('next');
    overlaid = session.overlay(session.displayLists[0]);
    expect(overlaid.searchHighlights?.length).toBe(3);
    expect(overlaid.activeSearchHighlight).toBeTruthy();
    expect(editor.searchStatus()).toContain('1 de 3');

    editor.handleSearchAction('next');
    expect(editor.searchStatus()).toContain('2 de 3');

    editor.handleSearchAction('close');
    expect(session.overlay(session.displayLists[0]).searchHighlights).toBeUndefined();

    // Interactive ruler first-line / APA hanging indent
    editor.handleApplyParagraphSpacingAndIndent({ indentLeftCm: 1.27, firstLineIndentPt: -36 });
    expect(session.pages[0].html).toContain('text-indent: -36pt');
    expect(editor.formats().firstLineIndentPt).toBe(-36);
  });
});
