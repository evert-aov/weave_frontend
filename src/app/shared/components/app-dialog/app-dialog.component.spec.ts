import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDialogComponent } from './app-dialog.component';
import { DialogService } from '../../../core/services/dialog.service';
import { WorkspaceActionsService } from '../../../core/services/workspace-actions.service';
import { NotesService } from '../../../core/services/notes.service';
import { SpacesService } from '../../../core/services/spaces.service';
import { I18nService } from '../../../core/services/i18n.service';
import { environment } from '../../../../environments/environment';
import { Note } from '../../../core/models/note.model';
import { Space } from '../../../core/models/space.model';

@Component({ standalone: true, imports: [AppDialogComponent], template: `
  <button id="opener">New</button><main [attr.inert]="dialogs.request() ? '' : null">Workspace</main>
  @if (dialogs.request(); as request) { <app-dialog [request]="request" /> }
` })
class Host { readonly dialogs = inject(DialogService); }

describe('shared workspace dialogs', () => {
  let fixture: ComponentFixture<Host>, dialogs: DialogService, actions: WorkspaceActionsService, http: HttpTestingController, notes: NotesService;
  const api = environment.apiUrl;
  const folder: Space = { _id: 'folder', name: 'Course', path: 'University/Course', color: 'teal', userId: 'user' };
  const note = (id: string): Note => ({ _id: id, title: id, space: 'Research', userId: 'user', tags: [], blocks: [], docType: 'block' });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(I18nService).setLanguage('es');
    dialogs = TestBed.inject(DialogService); actions = TestBed.inject(WorkspaceActionsService);
    notes = TestBed.inject(NotesService); http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host); fixture.detectChanges();
  });
  afterEach(() => { dialogs.close(true); fixture.destroy(); http.verify(); });
  async function render(): Promise<void> {
    await Promise.resolve(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  async function enter(value: string): Promise<void> {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await render();
  }
  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }
  async function type(index = 0): Promise<void> {
    fixture.nativeElement.querySelectorAll('.dialog-choice')[index].click(); await render();
    expect(dialogs.request()?.kind).toBe('input');
  }

  it.each([['block', 0], ['doc', 1], ['latex', 2], ['sheet', 3], ['canvas', 4], ['slide', 5]] as const)(
    'asks for the type before the name and creates a named %s document in the chosen folder', async (docType, index) => {
      actions.createDocument(folder); await render();
      expect(fixture.nativeElement.querySelector('input')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.dialog-choice')).toHaveLength(6);
      http.expectNone({ method: 'POST', url: `${api}/notes` });
      await type(index);
      expect(fixture.nativeElement.textContent).toContain('Paso 2 de 2');
      await enter('  My document  '); submit();
      const request = http.expectOne({ method: 'POST', url: `${api}/notes` });
      expect(request.request.body.title).toBe('My document'); expect(request.request.body.docType).toBe(docType);
      expect(request.request.body.space).toBe(folder.path);
      if (docType === 'block') {
        const content = document.createElement('div'); content.innerHTML = request.request.body.blocks[0].content.html;
        expect(content.textContent).toBe('');
      }
      expect(dialogs.busy()).toBe(true);
      request.flush({ ...note('created'), ...request.request.body }); await render();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
      expect(notes.currentNote()?._id).toBe('created');
    },
  );

  it('validates blank names, supports going back and cancels without creating a file', async () => {
    actions.createDocument(); await render(); await type();
    await enter('   '); submit(); await render();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Escribe un nombre');
    http.expectNone({ method: 'POST', url: `${api}/notes` });
    fixture.nativeElement.querySelector('.dialog-back').click(); await render();
    expect(fixture.nativeElement.querySelectorAll('.dialog-choice')).toHaveLength(6);
    fixture.nativeElement.querySelector('[data-dialog-cancel]').click(); await render();
    expect(dialogs.request()).toBeNull();
  });

  it('keeps the name on API failure and prevents duplicate submissions while saving', async () => {
    actions.createDocument(); await render(); await type(); await enter('Retry me'); submit(); submit();
    const request = http.expectOne({ method: 'POST', url: `${api}/notes` });
    expect(dialogs.busy()).toBe(true); dialogs.close(); expect(dialogs.request()).not.toBeNull();
    await Promise.resolve();
    const dialog = fixture.nativeElement.querySelector('section') as HTMLElement;
    expect(document.activeElement).toBe(dialog);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); dialog.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    request.flush({}, { status: 500, statusText: 'Server error' }); await render();
    expect(dialogs.busy()).toBe(false); expect(fixture.nativeElement.querySelector('input').value).toBe('Retry me');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se pudo crear');
    submit(); const retry = http.expectOne({ method: 'POST', url: `${api}/notes` });
    retry.flush({ ...note('created'), ...retry.request.body }); await render(); expect(dialogs.request()).toBeNull();
  });

  it('creates a directory and a subdirectory through the same input component', async () => {
    actions.createDirectory(); await render(); await enter('Root'); submit();
    const root = http.expectOne({ method: 'POST', url: `${api}/spaces` });
    expect(root.request.body).toMatchObject({ name: 'Root', parentId: null });
    root.flush({ ...folder, _id: 'root', name: 'Root' }); await render();
    actions.createDirectory(folder); await render(); await enter('Subfolder'); submit();
    const child = http.expectOne({ method: 'POST', url: `${api}/spaces` });
    expect(child.request.body).toMatchObject({ name: 'Subfolder', parentId: folder._id, color: folder.color });
    child.flush({ ...folder, _id: 'child', name: 'Subfolder', parentId: folder._id }); await render();
  });

  it('rejects directory separators and renames with the existing name selected', async () => {
    actions.renameDirectory(folder); await render();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Course'); expect(document.activeElement).toBe(input);
    expect(input.selectionEnd! - input.selectionStart!).toBe('Course'.length);
    await enter('Invalid/name'); submit(); await render(); http.expectNone({ method: 'PUT', url: `${api}/spaces/folder` });
    expect(dialogs.error()).toContain('no puede contener');
    await enter('Renamed'); submit(); const request = http.expectOne({ method: 'PUT', url: `${api}/spaces/folder` });
    expect(request.request.body.name).toBe('Renamed'); request.flush({ ...folder, name: 'Renamed' }); await render();
  });

  it('confirms deletion of the captured document and keeps a different active file', async () => {
    notes.loadNoteById('a').subscribe(); http.expectOne(`${api}/notes/a`).flush(note('a'));
    actions.deleteDocument(note('a')); await render();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-dialog-cancel]'));
    http.expectNone({ method: 'DELETE', url: `${api}/notes/a` });
    notes.loadNoteById('b').subscribe(); http.expectOne(`${api}/notes/b`).flush(note('b'));
    submit(); http.expectOne({ method: 'DELETE', url: `${api}/notes/a` }).flush({ success: true }); await render();
    expect(notes.currentNote()?._id).toBe('b');
  });

  it('cancels deletion with Escape and does not issue a DELETE', async () => {
    actions.deleteDocument(note('a')); await render();
    fixture.nativeElement.querySelector('section').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await render(); expect(dialogs.request()).toBeNull(); http.expectNone({ method: 'DELETE', url: `${api}/notes/a` });
  });

  it('deletes the selected directory and removes its descendants from the visible tree', async () => {
    const spaces = TestBed.inject(SpacesService);
    spaces.spacesList.set([folder, { ...folder, _id: 'child', parentId: folder._id }, { ...folder, _id: 'other' }]);
    actions.deleteDirectory(folder); await render(); submit();
    http.expectOne({ method: 'DELETE', url: `${api}/spaces/folder` }).flush({ success: true }); await render();
    expect(spaces.spacesList().map((space) => space._id)).toEqual(['other']);
  });

  it('traps keyboard focus and restores the opener after cancellation', async () => {
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement; opener.focus();
    actions.createDirectory(); await render();
    expect(fixture.nativeElement.querySelector('main').hasAttribute('inert')).toBe(true);
    const controls = fixture.nativeElement.querySelectorAll('section button');
    const first = controls[0] as HTMLButtonElement, last = controls[controls.length - 1] as HTMLButtonElement;
    first.focus(); first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    dialogs.close(); await render(); expect(document.activeElement).toBe(opener);
  });
});
