import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';

// Asegurar polyfill de process para librerías basadas en React en el navegador
if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: { NODE_ENV: 'production' } };
}

/**
 * Bloque de Pizarra y Dibujo con Excalidraw.
 * Renderiza la suite completa de Excalidraw en un contenedor responsive,
 * persistiendo los trazos y figuras vectoriales en MongoDB para continuar su edición.
 */
@Component({
  selector: 'app-canvas-block',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="excalidraw-block-container">
      <div #canvasMount class="excalidraw-mount-point"></div>
    </div>
  `,
  styles: [
    `
      .excalidraw-block-container {
        width: 100%;
        height: 520px;
        position: relative;
        border-radius: 9px;
        border: 1px solid var(--border-strong);
        overflow: hidden;
        background: var(--bg);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
      }
      .excalidraw-mount-point {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
      }
      ::ng-deep .excalidraw {
        height: 100% !important;
        width: 100% !important;
      }
    `,
  ],
})
export class CanvasBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('canvasMount', { static: true })
  canvasMount!: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  private reactRoot?: Root;
  private syncTimeout?: any;

  ngAfterViewInit(): void {
    const mountEl = this.canvasMount.nativeElement;
    this.reactRoot = createRoot(mountEl);

    const savedElements = this.block.content?.['elements'] || [];
    const savedAppState = this.block.content?.['appState'] || {};

    const computeElementsSignature = (els: readonly any[], bg: string) => {
      return (
        els.map((el) => `${el.id}:${el.version}:${el.isDeleted}`).join(',') +
        `|${bg}`
      );
    };

    let lastElementsSignature = computeElementsSignature(
      savedElements,
      savedAppState.viewBackgroundColor || '#ffffff',
    );

    const handleChange = (elements: readonly any[], appState: any) => {
      const bg = appState.viewBackgroundColor || '#ffffff';
      const currentSignature = computeElementsSignature(elements, bg);

      // Si los elementos y el color de fondo son idénticos, es solo un scroll/pan: ignorar
      if (currentSignature === lastElementsSignature) {
        return;
      }

      clearTimeout(this.syncTimeout);
      this.syncTimeout = setTimeout(() => {
        try {
          lastElementsSignature = currentSignature;
          const sanitizedAppState = {
            viewBackgroundColor: bg,
          };
          this.notesService.updateBlockContent(this.block.id, {
            elements: [...elements],
            appState: sanitizedAppState,
          });
        } catch (err) {
          console.error('Error saving Excalidraw snapshot:', err);
        }
      }, 1000);
    };

    // Renderizar Excalidraw con datos iniciales y tema
    this.reactRoot.render(
      React.createElement(Excalidraw, {
        initialData: {
          elements: savedElements,
          appState: {
            theme: this.themeService.isDark() ? 'dark' : 'light',
            viewBackgroundColor: this.themeService.isDark() ? '#111b2e' : '#ffffff',
            ...savedAppState,
          },
        },
        onChange: handleChange,
      }),
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.syncTimeout);
    if (this.reactRoot) {
      this.reactRoot.unmount();
    }
  }
}
