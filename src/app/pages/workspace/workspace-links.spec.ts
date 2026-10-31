import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceComponent } from './workspace.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { environment } from '../../../environments/environment';
import { Note } from '../../core/models/note.model';

@Component({ standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

describe('workspace document deep links', () => {
  const api = `${environment.apiUrl}/notes`;
  let http: HttpTestingController, router: Router, notes: NotesService;
  const note = (id: string): Note => ({ _id: id, userId: 'user', title: id, space: 'Folder', blocks: [], tags: [], docType: 'doc' });
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [
      provideRouter([{ path: '', component: WorkspaceComponent }]), provideHttpClient(), provideHttpClientTesting(),
      { provide: I18nService, useValue: {} },
    ] });
    // Se comprueba la coordinación de ruta y servicio sin montar los motores especializados.
    TestBed.overrideComponent(WorkspaceComponent, { set: { template: '', imports: [] } });
    await TestBed.compileComponents();
    http = TestBed.inject(HttpTestingController); router = TestBed.inject(Router); notes = TestBed.inject(NotesService);
  });
  afterEach(() => http?.verify());
  it('opens the document specified in a copied URL and updates the URL after another file is selected', async () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    await router.navigateByUrl('/?document=a');
    http.expectOne(`${api}/a`).flush(note('a')); fixture.detectChanges(); await fixture.whenStable();
    expect(notes.currentNote()?._id).toBe('a');
    notes.loadNoteById('b').subscribe(); http.expectOne(`${api}/b`).flush(note('b'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(router.url).toBe('/?document=b');
  });
  it('does not replace a requested URL with the previous file while loading', async () => {
    const fixture = TestBed.createComponent(Host); fixture.detectChanges();
    await router.navigateByUrl('/?document=a'); http.expectOne(`${api}/a`).flush(note('a'));
    fixture.detectChanges(); await fixture.whenStable();
    await router.navigateByUrl('/?document=b');
    expect(notes.currentNote()?._id).toBe('a'); expect(router.url).toBe('/?document=b');
    http.expectOne(`${api}/b`).flush(note('b')); fixture.detectChanges(); await fixture.whenStable();
    expect(notes.currentNote()?._id).toBe('b'); expect(router.url).toBe('/?document=b');
    notes.currentNote.set(null); fixture.detectChanges(); await fixture.whenStable();
    expect(router.url).toBe('/');
  });
});
