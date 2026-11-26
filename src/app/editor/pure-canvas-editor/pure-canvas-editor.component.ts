import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Editor Especializado Puro: Lienzo de Dibujo / Pizarra (Canvas).
 * Reservado para el motor de dibujo propio de Weave (Excalidraw removido).
 */
@Component({
  selector: 'app-pure-canvas-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pure-canvas-editor.component.html',
  styleUrls: ['./pure-canvas-editor.component.css'],
})
export class PureCanvasEditorComponent {
  @Input({ required: true }) note!: Note;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  formatSpacePath(space?: string): string {
    if (!space) return 'General';
    return space.split('/').join(' / ');
  }

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text && text !== this.note.title) {
      this.note = { ...this.note, title: text };
      this.notesService.updateMeta({ title: text });
    }
  }

  onTitleEnter(event: Event): void {
    const el = event.target as HTMLElement;
    el.blur();
  }

  zoomIn(): void {
    this.currentZoom.set(Math.min(Math.round((this.currentZoom() + 0.15) * 100) / 100, 3.0));
  }

  zoomOut(): void {
    this.currentZoom.set(Math.max(Math.round((this.currentZoom() - 0.15) * 100) / 100, 0.2));
  }

  resetZoom(): void {
    this.currentZoom.set(1.0);
  }

  centerToContent(): void {
    this.currentZoom.set(1.0);
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
}
