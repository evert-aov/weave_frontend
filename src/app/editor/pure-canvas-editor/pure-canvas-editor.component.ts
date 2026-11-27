import { Component, Input, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { WeaveCanvasComponent } from './components/weave-canvas/weave-canvas.component';
import type { CanvasSceneData } from './engine/canvas-model';

/**
 * Editor Especializado Puro: Lienzo de Dibujo / Pizarra (Canvas).
 * Impulsado por el motor HTML5 Canvas 2D nativo y ligero de Weave.
 */
@Component({
  selector: 'app-pure-canvas-editor',
  standalone: true,
  imports: [CommonModule, WeaveCanvasComponent],
  templateUrl: './pure-canvas-editor.component.html',
  styleUrls: ['./pure-canvas-editor.component.css'],
})
export class PureCanvasEditorComponent {
  @Input({ required: true }) note!: Note;

  @ViewChild(WeaveCanvasComponent) canvasRef?: WeaveCanvasComponent;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  onSceneChange(scene: CanvasSceneData): void {
    if (!this.note?._id) return;
    if (typeof scene.appState?.zoom === 'number') {
      this.currentZoom.set(scene.appState.zoom);
    }
    this.notesService.updateDocData(scene, this.note._id);
  }

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
    this.canvasRef?.zoomIn();
    if (this.canvasRef) this.currentZoom.set(this.canvasRef.zoom());
  }

  zoomOut(): void {
    this.canvasRef?.zoomOut();
    if (this.canvasRef) this.currentZoom.set(this.canvasRef.zoom());
  }

  resetZoom(): void {
    this.canvasRef?.resetZoom();
    this.currentZoom.set(1.0);
  }

  centerToContent(): void {
    this.canvasRef?.centerToContent();
    if (this.canvasRef) this.currentZoom.set(this.canvasRef.zoom());
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
}
