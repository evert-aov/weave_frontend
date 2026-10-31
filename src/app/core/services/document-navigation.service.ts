import { Injectable, inject, signal } from '@angular/core';
import { NotesService } from './notes.service';
import { DocumentHistoryService } from './document-history.service';
import { isDocumentId } from '../utils/document-link';

@Injectable({ providedIn: 'root' })
export class DocumentNavigationService {
  private readonly notes = inject(NotesService);
  readonly history = inject(DocumentHistoryService);
  readonly error = signal('');
  private requestVersion = 0;

  open(noteId: string, historyIndex?: number): void {
    if (!isDocumentId(noteId)) return;
    this.error.set('');
    const version = ++this.requestVersion;
    if (noteId === this.notes.currentNote()?._id) return;
    this.notes.loadNoteById(noteId, historyIndex).subscribe({
      error: () => {
        if (version === this.requestVersion) this.error.set('No se pudo abrir el documento. Puede haber sido eliminado o no tienes acceso.');
      },
    });
  }

  back(): void {
    if (!this.history.canGoBack()) return;
    const index = this.history.index() - 1;
    this.open(this.history.entries()[index].noteId, index);
  }

  forward(): void {
    if (!this.history.canGoForward()) return;
    const index = this.history.index() + 1;
    this.open(this.history.entries()[index].noteId, index);
  }
}
