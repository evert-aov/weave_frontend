import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReferencePickerComponent } from './document-reference-picker.component';
import { DocumentReferenceService } from '../../../core/services/document-reference.service';
import { NotesService } from '../../../core/services/notes.service';
import { NoteSummary } from '../../../core/models/note.model';

describe('document reference picker', () => {
  let response: Subject<NoteSummary[]>;
  let references: DocumentReferenceService;
  const choose = vi.fn(), cancel = vi.fn();
  const note = (id: string, title: string, space = 'Folder'): NoteSummary => ({ _id: id, title, space, userId: 'user', tags: [], docType: 'doc' });
  beforeEach(() => {
    response = new Subject(); choose.mockReset(); cancel.mockReset();
    TestBed.configureTestingModule({ imports: [DocumentReferencePickerComponent], providers: [
      { provide: NotesService, useValue: { listDocumentReferences: () => response } },
    ] });
    references = TestBed.inject(DocumentReferenceService); references.open('source', choose, cancel);
  });
  function render() {
    const fixture = TestBed.createComponent(DocumentReferencePickerComponent); fixture.detectChanges(); return fixture;
  }
  it('searches metadata by name and directory and inserts the selected destination', () => {
    const fixture = render();
    response.next([note('source', 'Source'), note('b', 'Budget', 'Projects/2026'), note('c', 'Report')]);
    fixture.componentInstance.query.set('projects'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.reference-result')).toHaveLength(1);
    fixture.nativeElement.querySelector('.reference-result').click();
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ _id: 'b' }));
    expect(references.request()).toBeNull();
  });
  it('supports Enter to select and Escape to cancel', () => {
    const fixture = render(); response.next([note('b', 'Target')]); fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(choose).toHaveBeenCalledOnce();
    references.open('source', choose, cancel); fixture.detectChanges();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(cancel).toHaveBeenCalledOnce(); expect(references.request()).toBeNull();
  });
  it('shows a load error and cleans up the pending request on close', () => {
    const fixture = render(); response.error(new Error('offline')); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar');
    fixture.destroy(); expect(response.observed).toBe(false);
  });
});
