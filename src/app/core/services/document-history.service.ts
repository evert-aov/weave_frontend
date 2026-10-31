import { Injectable, computed, signal } from '@angular/core';

export interface DocumentCaretPoint {
  kind: 'page' | 'block';
  id: string;
  offset: number;
}

export interface DocumentPosition {
  anchor?: DocumentCaretPoint;
  focus?: DocumentCaretPoint;
  scrollTop: number;
  scrollLeft: number;
  readingMode?: boolean;
}

export interface DocumentHistoryEntry {
  noteId: string;
  position?: DocumentPosition;
}

/** Historial de saltos de la sesión; separado de pestañas y del historial de edición. */
@Injectable({ providedIn: 'root' })
export class DocumentHistoryService {
  readonly entries = signal<DocumentHistoryEntry[]>([]);
  readonly index = signal(-1);
  readonly version = signal(0);
  readonly current = computed(() => this.entries()[this.index()] ?? null);
  readonly canGoBack = computed(() => this.index() > 0);
  readonly canGoForward = computed(() => this.index() >= 0 && this.index() < this.entries().length - 1);

  record(noteId: string, targetIndex?: number): void {
    if (targetIndex !== undefined && this.entries()[targetIndex]?.noteId === noteId) {
      this.index.set(targetIndex);
    } else {
      if (this.current()?.noteId === noteId) return;
      const entries = [...this.entries().slice(0, this.index() + 1), { noteId }].slice(-100);
      this.entries.set(entries);
      this.index.set(entries.length - 1);
    }
    this.version.update((value) => value + 1);
  }

  remember(noteId: string, position: DocumentPosition): void {
    if (this.current()?.noteId !== noteId) return;
    const index = this.index();
    this.entries.update((entries) => entries.map((entry, i) => i === index ? { ...entry, position } : entry));
  }

  remove(noteId: string): void {
    const old = this.entries();
    const nextIndex = old.slice(0, this.index() + 1).filter((entry) => entry.noteId !== noteId).length - 1;
    this.entries.set(old.filter((entry) => entry.noteId !== noteId));
    this.index.set(Math.max(-1, nextIndex));
    this.version.update((value) => value + 1);
  }

  clear(): void {
    this.entries.set([]); this.index.set(-1);
    this.version.update((value) => value + 1);
  }
}
