import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PureDocEditorComponent } from './pure-doc-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WordCompatibilityService } from './services/word-compatibility.service';
import { LatexRendererService } from './services/latex-renderer.service';
import { ImageStoreService } from './services/image-store.service';
import { DocumentPage } from './models/word-document.model';
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
      { provide: LatexRendererService, useValue: {} },
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
    delete (document as unknown as { execCommand?: unknown }).execCommand;
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
    vi.unstubAllGlobals();
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
    expect(key.defaultPrevented).toBe(false);
    expect(editor.pages()).toHaveLength(2);
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
    dom.invalidateDocumentFlow();
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(2);
    Object.defineProperty(first, 'clientWidth', { value: 400 });
    dom.reflowDocument();
    expect(paginate).toHaveBeenCalledTimes(3);
  });
});
