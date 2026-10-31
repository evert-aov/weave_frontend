import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReferencesDirective } from './document-references.directive';
import { DocumentHistoryService } from '../../core/services/document-history.service';
import { DocumentNavigationService } from '../../core/services/document-navigation.service';
import { NotesService } from '../../core/services/notes.service';
import { Note } from '../../core/models/note.model';

const active = signal<Note | null>({ _id: 'a' } as Note);
const open = vi.fn(), back = vi.fn();
@Component({ standalone: true, imports: [DocumentReferencesDirective], template: `
  <div class="workspace-shell">
    <div appDocumentReferences [attr.data-document-id]="note()?._id">
      <div data-document-scroll><div data-page-body-id="page" contenteditable="true">
        <p>Source <a href="/?document=b"><b>Destination</b></a></p>
        <a class="external" href="https://example.test/">External</a>
      </div></div>
    </div>
    <textarea aria-label="Chat"></textarea>
  </div>` })
class Host { readonly note = active; }

describe('document reference interaction', () => {
  beforeEach(() => {
    open.mockReset(); back.mockReset(); active.set({ _id: 'a' } as Note);
    TestBed.configureTestingModule({ imports: [Host], providers: [
      { provide: NotesService, useValue: { currentNote: active, isReadingMode: signal(false), isLoadingNote: signal(false) } },
      { provide: DocumentNavigationService, useValue: { open, back } },
    ] });
    TestBed.inject(DocumentHistoryService).record('a');
  });
  afterEach(() => window.getSelection()?.removeAllRanges());
  function render() {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, body: root.querySelector<HTMLElement>('[contenteditable]')!, link: root.querySelector<HTMLAnchorElement>('a')! };
  }
  function key(target: HTMLElement, letter: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: letter, ctrlKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
  }
  it('follows an internal link with a normal click before the rich text engine handles it', () => {
    const { body, link } = render();
    const editorClick = vi.fn(); body.addEventListener('click', editorClick);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.querySelector('b')!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true); expect(editorClick).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('b');
    expect(TestBed.inject(DocumentHistoryService).current()?.position).toBeDefined();
  });
  it('opens the link under the caret with Ctrl+O and prevents the browser file dialog', () => {
    const { body, link } = render();
    const text = link.querySelector('b')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 3, text, 3);
    expect(key(body, 'o').defaultPrevented).toBe(true); expect(open).toHaveBeenCalledWith('b');
  });
  it('opens a hovered link with Ctrl+O even when no editor has focus', () => {
    const { link } = render();
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(key(document.body, 'o').defaultPrevented).toBe(true); expect(open).toHaveBeenCalledWith('b');
  });
  it('returns with Ctrl+I before the editor can toggle italic', () => {
    const { body, fixture } = render();
    const history = TestBed.inject(DocumentHistoryService);
    history.record('b'); active.set({ _id: 'b' } as Note); fixture.detectChanges();
    const italic = vi.fn(); body.addEventListener('keydown', italic);
    expect(key(body, 'i').defaultPrevented).toBe(true);
    expect(back).toHaveBeenCalledOnce(); expect(italic).not.toHaveBeenCalled();
  });
  it('allows returning immediately after navigation when focus is on the document body', () => {
    render(); TestBed.inject(DocumentHistoryService).record('b'); active.set({ _id: 'b' } as Note);
    expect(key(document.body, 'i').defaultPrevented).toBe(true); expect(back).toHaveBeenCalledOnce();
  });
  it('keeps chat shortcuts and ordinary editor shortcuts when no internal navigation applies', () => {
    const { root, body } = render();
    expect(key(body, 'o').defaultPrevented).toBe(false);
    expect(key(body, 'i').defaultPrevented).toBe(false);
    TestBed.inject(DocumentHistoryService).record('b');
    expect(key(root.querySelector('textarea')!, 'i').defaultPrevented).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });
  it('leaves external links to the existing editor behavior', () => {
    const { root } = render(); const external = root.querySelector<HTMLAnchorElement>('.external')!;
    const fallback = vi.fn((event: Event) => event.preventDefault()); external.addEventListener('click', fallback);
    external.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(fallback).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
  });
  it('does not intercept Vim navigation in a Monaco EditContext element', () => {
    const {root}=render();TestBed.inject(DocumentHistoryService).record('b');
    const monaco=document.createElement('div');monaco.className='monaco-editor';
    const editContext=document.createElement('div');editContext.tabIndex=0;monaco.appendChild(editContext);root.appendChild(monaco);
    expect(key(editContext,'i').defaultPrevented).toBe(false);expect(back).not.toHaveBeenCalled();
  });
  it('unregisters capture handlers when the workspace editor is destroyed', () => {
    const { fixture } = render(); TestBed.inject(DocumentHistoryService).record('b'); fixture.destroy();
    expect(key(document.body, 'i').defaultPrevented).toBe(false); expect(back).not.toHaveBeenCalled();
  });
});
