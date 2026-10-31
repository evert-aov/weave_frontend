import { Injectable, signal } from '@angular/core';
import { NoteSummary } from '../models/note.model';

interface ReferenceRequest {
  sourceId: string;
  select: (note: NoteSummary) => void;
  cancel: () => void;
}

/** Coordina el selector compartido sin acoplar Word con el motor Tiptap. */
@Injectable({ providedIn: 'root' })
export class DocumentReferenceService {
  readonly request = signal<ReferenceRequest | null>(null);

  open(sourceId: string, select: ReferenceRequest['select'], cancel: () => void = () => {}): void {
    if (this.request()) return;
    this.request.set({ sourceId, select, cancel });
  }

  choose(note: NoteSummary): void {
    const request = this.request();
    this.request.set(null);
    request?.select(note);
  }

  close(): void {
    const request = this.request();
    this.request.set(null);
    request?.cancel();
  }
}
