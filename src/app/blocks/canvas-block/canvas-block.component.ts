import { Component, Input, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { WeaveCanvasComponent } from '../../editor/pure-canvas-editor/components/weave-canvas/weave-canvas.component';
import type { CanvasSceneData } from '../../editor/pure-canvas-editor/engine/canvas-model';

/**
 * Bloque de Pizarra y Dibujo.
 * Impulsado por el motor HTML5 Canvas 2D nativo y ligero de Weave.
 */
@Component({
  selector: 'app-canvas-block',
  standalone: true,
  imports: [CommonModule, IconComponent, WeaveCanvasComponent],
  templateUrl: './canvas-block.component.html',
  styleUrls: ['./canvas-block.component.css'],
})
export class CanvasBlockComponent {
  @Input({ required: true }) block!: Block;

  @ViewChild(WeaveCanvasComponent) canvasRef?: WeaveCanvasComponent;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  onSceneChange(scene: CanvasSceneData): void {
    if (!this.block?.id) return;
    if (typeof scene.appState?.zoom === 'number') {
      this.currentZoom.set(scene.appState.zoom);
    }
    this.notesService.updateBlockContent(this.block.id, {
      snapshot: scene,
      elements: scene.elements,
      appState: scene.appState,
    });
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
}
