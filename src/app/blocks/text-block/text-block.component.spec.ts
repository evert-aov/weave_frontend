import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { TextBlockComponent } from './text-block.component';
import { NotesService } from '../../core/services/notes.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { NoteSummary } from '../../core/models/note.model';

describe('rich text tables', () => {
  let component: TextBlockComponent;
  const save = vi.fn();
  const reading = signal(false);

  beforeEach(() => {
    save.mockReset(); reading.set(false);
    TestBed.configureTestingModule({ providers: [
      { provide: NotesService, useValue: { updateBlockContent: save, isReadingMode: reading, currentNote: () => ({ _id: 'source' }) } },
      { provide: AuthService, useValue: { currentUser: () => null } },
      { provide: I18nService, useValue: { currentLang: () => 'es' } },
    ] });
    component = TestBed.runInInjectionContext(() => new TextBlockComponent());
    component.block = { id: 'text', type: 'text', order: 0, content: { html: '<p>Before</p>' } };
    const surface = document.createElement('div'); document.body.append(surface);
    component.editorElement = new ElementRef(surface);
  });

  afterEach(() => {
    component.ngOnDestroy();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  function start(html?: string): void {
    if (html) component.block.content['html'] = html;
    component.ngOnInit();
  }

  function paste(text: string, html = ''): void {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? html : type === 'text/plain' ? text : '' } });
    component.editor!.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }

  function selectCell(index = 0): void {
    const positions: number[] = [];
    component.editor!.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table_cell' || node.type.name === 'table_header') positions.push(pos);
    });
    component.editor!.commands.setTextSelection(positions[index] + 2);
  }

  it('previews the latest edit without replacing the editor, selection or undo history', () => {
    vi.useFakeTimers(); start();
    const editor = component.editor!;
    editor.commands.setTextSelection(7); editor.commands.insertContent(' latest');
    const html = editor.getHTML(), selection = editor.state.selection.toJSON();
    component.setPreview(true);
    expect(component.editor).toBe(editor); expect(component.isPreview()).toBe(true); expect(editor.isEditable).toBe(false);
    expect(editor.getHTML()).toBe(html);
    expect(save).toHaveBeenLastCalledWith('text',expect.objectContaining({format:'richtext',html}),'source');
    const calls = save.mock.calls.length; vi.advanceTimersByTime(700); expect(save).toHaveBeenCalledTimes(calls);
    component.setPreview(false);
    expect(editor.isEditable).toBe(true); expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.commands.undo()).toBe(true); expect(editor.getHTML()).not.toBe(html);
  });

  it('keeps Markdown documents readable and saves subsequent edits as canonical rich text', () => {
    vi.useFakeTimers();
    component.block.content = {format:'markdown',markdown:'## Actual\n\n[Link](/?document=target)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',html:'<p>stale</p>'};
    start();
    expect(component.editor!.getHTML()).toContain('<h2>Actual</h2>');
    expect(component.editor!.view.dom.querySelectorAll('th')).toHaveLength(2);
    expect(component.editor!.view.dom.querySelector('a')!.getAttribute('href')).toBe('/?document=target');
    component.setPreview(true); component.setPreview(false);
    expect(save).not.toHaveBeenCalled();
    component.editor!.commands.insertContent('Updated'); vi.advanceTimersByTime(500);
    expect(save).toHaveBeenLastCalledWith('text',expect.objectContaining({format:'richtext',html:expect.stringContaining('Updated')}),'source');
  });

  it('retains the latest HTML for rich-text documents even if old Markdown remains', () => {
    component.block.content = {format:'richtext',markdown:'old',html:'<p>Newest</p>'}; start();
    expect(component.editor!.getText()).toBe('Newest');
    component.setPreview(true); component.setPreview(false); expect(save).not.toHaveBeenCalled();
  });

  it('preserves merged cells in preview and blocks table editing until returning to edit', () => {
    start('<table><tr><th colspan="2">Merged</th></tr><tr><td>A</td><td>B</td></tr></table>');
    selectCell(); const html = component.editor!.getHTML(); component.setPreview(true);
    component.tableAction('deleteTable'); component.insertTable();
    expect(component.editor!.getHTML()).toBe(html); expect(component.editor!.view.dom.querySelector('[colspan="2"]')).toBeTruthy();
    component.setPreview(false); component.tableAction('deleteTable');
    expect(component.editor!.view.dom.querySelector('table')).toBeNull();
  });

  it('cannot enable editing from document reading mode', () => {
    reading.set(true); start(); component.setPreview(false); component.setPreview(true);
    expect(component.editor!.isEditable).toBe(false); expect(component.isPreview()).toBe(false); expect(save).not.toHaveBeenCalled();
  });

  it('shows rich editing controls and a rendered preview with no Vim or source editor', () => {
    const fixture = TestBed.createComponent(TextBlockComponent);
    fixture.componentRef.setInput('block', {id:'ui',type:'text',order:0,content:{html:'<h2>Heading</h2><p><strong>Content</strong></p>'}});
    fixture.detectChanges();
    try {
      const root = fixture.nativeElement as HTMLElement;
      const buttons = root.querySelectorAll<HTMLButtonElement>('.text-view-switch button');
      expect(root.querySelector('.trilium-top-toolbar')).toBeTruthy();
      expect(root.querySelector('textarea,.cm-editor')).toBeNull(); expect(root.textContent).not.toContain('Vim');
      buttons[1].click(); fixture.detectChanges();
      expect(root.querySelector('.trilium-top-toolbar')).toBeNull();
      expect(root.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('false');
      expect(root.querySelector('h2')!.textContent).toBe('Heading'); expect(root.querySelector('strong')!.textContent).toBe('Content');
      buttons[0].click(); fixture.detectChanges();
      expect(root.querySelector('.trilium-top-toolbar')).toBeTruthy();
      expect(root.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('true');
    } finally { fixture.destroy(); }
  });

  it('restores saved HTML tables with headers, formatting and merged cells', () => {
    start('<table><tr><th colspan="2">Header</th></tr><tr><td><strong>A</strong></td><td>B</td></tr></table>');
    expect(component.editor!.getHTML()).toContain('colspan="2"');
    expect(component.editor!.getHTML()).toContain('<strong>A</strong>');
    expect(component.editor!.view.dom.querySelectorAll('th')).toHaveLength(1);
    const saved = component.editor!.getHTML();
    component.editor!.commands.setContent(saved);
    const holder = document.createElement('div'); holder.innerHTML = saved;
    expect(component.editor!.view.dom.querySelector('table')!.outerHTML).toBe(holder.querySelector('table')!.outerHTML);
  });

  it('pastes HTML tables through the actual ProseMirror clipboard pipeline', () => {
    start();
    component.editor!.commands.setTextSelection(7);
    paste('Name\tAmount\nAna\t10', '<table><tr><th>Name</th><th>Amount</th></tr><tr><td>Ana</td><td>10</td></tr></table>');
    expect(component.editor!.view.dom.querySelectorAll('table')).toHaveLength(1);
    expect(component.editor!.view.dom.querySelectorAll('th')).toHaveLength(2);
    expect(component.editor!.getText()).toContain('Before');
    expect(component.editor!.getText()).toContain('Ana');
  });

  it.each(['Name\tAmount\nAna\t10', '| Name | Amount |\n| --- | --- |\n| Ana | 10 |'])('pastes textual tables as editable cells: %s', (text) => {
    start(); paste(text);
    expect(component.editor!.view.dom.querySelectorAll('table')).toHaveLength(1);
    expect(component.editor!.view.dom.querySelectorAll('td,th')).toHaveLength(4);
  });

  it('fills existing cells when pasting a spreadsheet grid rather than nesting another table', () => {
    start('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    selectCell(); paste('1\t2\n3\t4');
    expect(component.editor!.view.dom.querySelectorAll('table')).toHaveLength(1);
    expect(Array.from(component.editor!.view.dom.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual(['1', '2', '3', '4']);
  });

  it('fills existing cells when an HTML table is pasted into the current cell', () => {
    start('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    selectCell(); paste('1\t2', '<table><tr><td>1</td><td>2</td></tr></table>');
    expect(component.editor!.view.dom.querySelectorAll('table')).toHaveLength(1);
    expect(Array.from(component.editor!.view.dom.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual(['1', '2', 'C', 'D']);
  });

  it('keeps spreadsheet-looking text as code when the selection is in a code block', () => {
    start('<pre><code>Example</code></pre>');
    component.editor!.commands.setTextSelection(8);
    paste('1\t2\n3\t4');
    expect(component.editor!.view.dom.querySelector('table')).toBeNull();
    expect(component.editor!.getText()).toContain('1\t2\n3\t4');
  });

  it('edits table structure, supports cell merge/split and restores changes with undo', () => {
    start(); component.insertTable(); selectCell();
    component.tableAction('addRow'); component.tableAction('addColumn');
    expect(component.editor!.view.dom.querySelectorAll('tr')).toHaveLength(4);
    expect(component.editor!.view.dom.querySelector('tr')!.children).toHaveLength(4);
    component.tableAction('deleteRow'); component.tableAction('deleteColumn');
    expect(component.editor!.view.dom.querySelectorAll('tr')).toHaveLength(3);
    const cells: number[] = [];
    component.editor!.state.doc.descendants((node, pos) => { if (node.type.name === 'table_cell') cells.push(pos); });
    component.editor!.view.dispatch(component.editor!.state.tr.setSelection(CellSelection.create(component.editor!.state.doc, cells[0], cells[1])));
    component.tableAction('mergeCells');
    expect(component.editor!.view.dom.querySelector('[colspan="2"]')).not.toBeNull();
    component.tableAction('splitCell');
    expect(component.editor!.view.dom.querySelector('[colspan="2"]')).toBeNull();
    component.tableAction('deleteTable');
    expect(component.editor!.view.dom.querySelector('table')).toBeNull();
    component.editor!.commands.undo();
    expect(component.editor!.view.dom.querySelector('table')).not.toBeNull();
  });

  it('Tab moves across cells, adds a final row and Shift+Tab moves back', () => {
    start('<table><tr><td>A</td><td>B</td></tr></table>');
    selectCell();
    component.editor!.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(component.editor!.state.selection.$from.parent.textContent).toBe('B');
    component.editor!.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(component.editor!.view.dom.querySelectorAll('tr')).toHaveLength(2);
    component.editor!.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(component.editor!.state.selection.$from.parent.textContent).toBe('B');
  });

  it('persists table HTML using the existing block save and keeps it after reopening', () => {
    vi.useFakeTimers(); start(); paste('1\t2');
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledWith('text', expect.objectContaining({ html: expect.stringContaining('<table>') }), 'source');
    const stored = save.mock.calls.at(-1)![1].html;
    component.editor!.commands.setContent(stored);
    expect(component.editor!.view.dom.querySelectorAll('td')).toHaveLength(2);
  });

  it('flushes a pending table edit once when the text block is destroyed before the debounce', () => {
    vi.useFakeTimers(); start(); paste('1\t2');
    expect(save).not.toHaveBeenCalled();
    component.ngOnDestroy();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith('text', expect.objectContaining({ html: expect.stringContaining('<table>') }), 'source');
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledOnce();
  });

  it('renders tables in reading mode and disables table mutations', () => {
    reading.set(true);
    start('<table><tr><td>A</td><td>B</td></tr></table>');
    expect(component.editor!.isEditable).toBe(false);
    const before = component.editor!.getHTML();
    component.insertTable(); component.tableAction('deleteTable');
    expect(component.editor!.getHTML()).toBe(before);
  });

  it('inserts a persistent internal link and leaves subsequent typing outside the link', () => {
    start(); component.editor!.commands.setTextSelection(7);
    component.insertDocumentReference();
    TestBed.inject(DocumentReferenceService).choose({ _id: 'target', title: 'Related document' } as NoteSummary);
    const anchor = component.editor!.view.dom.querySelector('a')!;
    expect(anchor?.getAttribute('href')).toBe('/?document=target');
    expect(anchor?.textContent).toBe('Related document');
    component.editor!.commands.insertContent(' following text');
    expect(component.editor!.view.dom.querySelector('a')!.textContent).toBe('Related document');
    const saved = component.editor!.getHTML(); component.editor!.commands.setContent(saved);
    expect(component.editor!.view.dom.querySelector('a')!.getAttribute('href')).toBe('/?document=target');
  });

  it('applies a reference to selected text without replacing its label', () => {
    start('<p>Custom label</p>'); component.editor!.commands.setTextSelection({ from: 1, to: 13 });
    component.insertDocumentReference();
    TestBed.inject(DocumentReferenceService).choose({ _id: 'target', title: 'Other title' } as NoteSummary);
    expect(component.editor!.view.dom.querySelector('a')!.textContent).toBe('Custom label');
  });

  it('prevents the Tiptap link plugin from opening an internal reference in another window', () => {
    start('<p><a href="/?document=target">Reference</a> <a href="https://example.test/">External</a></p>');
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const links = component.editor!.view.dom.querySelectorAll('a');
      const click = (target: Element) => {
        const event = new MouseEvent('click', { button: 0 }); Object.defineProperty(event, 'target', { value: target });
        return component.editor!.view.someProp('handleClick', (handler) => handler(component.editor!.view, 2, event));
      };
      expect(click(links[0])).toBe(true); expect(openWindow).not.toHaveBeenCalled();
      expect(click(links[1])).toBe(true); expect(openWindow).toHaveBeenCalledOnce();
    } finally { openWindow.mockRestore(); }
  });
});
