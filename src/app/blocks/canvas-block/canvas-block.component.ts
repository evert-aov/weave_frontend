import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  effect,
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
  templateUrl: './canvas-block.component.html',
  styleUrls: ['./canvas-block.component.scss'],
})
export class CanvasBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('canvasMount', { static: true })
  canvasMount!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  private reactRoot?: Root;
  private syncTimeout?: any;
  private currentElements: any[] = [];
  private currentAppState: any = {};
  private excalidrawAPI: any = null;

  constructor() {
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      const isDark = this.themeService.isDark();
      if (this.reactRoot) {
        this.renderCanvas(isReading, isDark);
      }
      if (isReading) {
        // Al pasar a modo lectura, centrar suavemente hacia el contenido dibujado
        setTimeout(() => this.centerToContent(), 120);
        setTimeout(() => this.centerToContent(), 300);
      }
    });

    effect(() => {
      this.notesService.documentZoom();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 60);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 160);
    });
  }

  ngAfterViewInit(): void {
    const mountEl = this.canvasMount.nativeElement;
    this.reactRoot = createRoot(mountEl);
    this.currentElements = this.block.content?.['elements'] || [];
    this.currentAppState = this.block.content?.['appState'] || {};

    this.renderCanvas(
      this.notesService.isReadingMode(),
      this.themeService.isDark(),
    );

    // Centrar inicialmente el dibujo si existen trazos o figuras
    setTimeout(() => this.centerToContent(), 250);
  }

  /**
   * Centra el viewport del lienzo hacia donde se encuentran los dibujos y figuras.
   */
  centerToContent(): void {
    try {
      if (this.excalidrawAPI && typeof this.excalidrawAPI.scrollToContent === 'function') {
        const nonDeletedElements = (this.currentElements || []).filter((el) => !el.isDeleted);
        if (nonDeletedElements.length > 0) {
          this.excalidrawAPI.scrollToContent(nonDeletedElements, {
            fitToViewport: true,
            viewportZoomFactor: 0.85,
            animate: true,
            duration: 250,
          });
        }
      }
    } catch (e) {
      console.warn('[CanvasBlockComponent] Could not center to content:', e);
    }
  }

  private renderCanvas(isReading: boolean, isDark: boolean): void {
    if (!this.reactRoot) return;

    const computeElementsSignature = (els: readonly any[], bg: string) => {
      return (
        els.map((el) => `${el.id}:${el.version}:${el.isDeleted}`).join(',') +
        `|${bg}`
      );
    };

    let lastElementsSignature = computeElementsSignature(
      this.currentElements,
      this.currentAppState.viewBackgroundColor || (isDark ? '#111b2e' : '#ffffff'),
    );

    const handleChange = (elements: readonly any[], appState: any) => {
      this.currentElements = [...elements];
      this.currentAppState = { ...appState };
      const bg = appState.viewBackgroundColor || (isDark ? '#111b2e' : '#ffffff');
      const currentSignature = computeElementsSignature(elements, bg);

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

    this.reactRoot.render(
      React.createElement(Excalidraw, {
        excalidrawAPI: (api: any) => {
          this.excalidrawAPI = api;
        },
        viewModeEnabled: isReading,
        initialData: {
          elements: this.currentElements,
          appState: {
            theme: isDark ? 'dark' : 'light',
            viewBackgroundColor: isDark ? '#111b2e' : '#ffffff',
            ...this.currentAppState,
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
