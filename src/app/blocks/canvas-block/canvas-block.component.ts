import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Bloque de Pizarra y Dibujo.
 * Reservado para el motor de dibujo propio de Weave (Excalidraw removido).
 */
@Component({
  selector: 'app-canvas-block',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './canvas-block.component.html',
  styleUrls: ['./canvas-block.component.css'],
})
export class CanvasBlockComponent {
  @Input({ required: true }) block!: Block;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  zoomIn(): void {
    const next = Math.min(Math.round((this.currentZoom() + 0.15) * 100) / 100, 3.0);
    this.currentZoom.set(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.currentZoom() - 0.15) * 100) / 100, 0.3);
    this.currentZoom.set(next);
  }

  resetZoom(): void {
    this.currentZoom.set(1.0);
  }

  centerToContent(): void {
    this.currentZoom.set(1.0);
  }
}
