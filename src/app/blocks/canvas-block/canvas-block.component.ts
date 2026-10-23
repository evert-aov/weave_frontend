import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  effect,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';

// Asegurar polyfill de process para librerías basadas en React en el navegador
if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: { NODE_ENV: 'production' } };
}

import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Bloque de Pizarra y Dibujo con Excalidraw.
 * Renderiza la suite completa de Excalidraw en un contenedor responsive,
 * persistiendo los trazos y figuras vectoriales en MongoDB para continuar su edición.
 */
@Component({
  selector: 'app-canvas-block',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './canvas-block.component.html',
  styleUrls: ['./canvas-block.component.scss'],
})
export class CanvasBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('canvasMount', { static: true })
  canvasMount!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

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
      if (this.excalidrawAPI && typeof this.excalidrawAPI.updateScene === 'function') {
        this.excalidrawAPI.updateScene({
          appState: {
            theme: isDark ? 'dark' : 'light',
          },
        });
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
    this.currentAppState = { ...(this.block.content?.['appState'] || {}) };

    // Limpiar color azul marino residual guardado previamente si estamos en tema claro
    if (!this.themeService.isDark() && this.currentAppState.viewBackgroundColor === '#111b2e') {
      delete this.currentAppState.viewBackgroundColor;
    }

    this.renderCanvas(
      this.notesService.isReadingMode(),
      this.themeService.isDark(),
    );

    // Centrar inicialmente el dibujo si existen trazos o figuras (sin distorsionar zoom)
    setTimeout(() => this.centerToContent(), 250);
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.currentZoom() + 0.15) * 100) / 100, 3.0);
    this.applyZoom(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.currentZoom() - 0.15) * 100) / 100, 0.3);
    this.applyZoom(next);
  }

  resetZoom(): void {
    this.applyZoom(1.0);
  }

  applyZoom(ratio: number): void {
    this.currentZoom.set(ratio);
    try {
      if (this.excalidrawAPI && typeof this.excalidrawAPI.updateScene === 'function') {
        this.excalidrawAPI.updateScene({
          appState: {
            zoom: { value: ratio },
          },
        });
      }
    } catch (e) {
      console.warn('[CanvasBlockComponent] Error applying zoom:', e);
    }
  }

  /**
   * Centra el viewport del lienzo hacia donde se encuentran los dibujos y figuras sin alterar zoom.
   */
  centerToContent(): void {
    try {
      if (this.excalidrawAPI && typeof this.excalidrawAPI.scrollToContent === 'function') {
        const nonDeletedElements = (this.currentElements || []).filter((el) => !el.isDeleted);
        if (nonDeletedElements.length > 0) {
          this.excalidrawAPI.scrollToContent(nonDeletedElements, {
            fitToViewport: false,
            animate: true,
            duration: 250,
          });
          this.currentZoom.set(1.0);
        }
      }
    } catch (e) {
      console.warn('[CanvasBlockComponent] Could not center to content:', e);
    }
  }

  private renderCanvas(isReading: boolean, isDark: boolean): void {
    if (!this.reactRoot) return;

    const computeElementsSignature = (els: readonly any[], bg?: string) => {
      return (
        els.map((el) => `${el.id}:${el.version}:${el.isDeleted}`).join(',') +
        `|${bg || ''}`
      );
    };

    let lastElementsSignature = computeElementsSignature(
      this.currentElements,
      this.currentAppState.viewBackgroundColor,
    );

    const handleChange = (elements: readonly any[], appState: any) => {
      this.currentElements = [...elements];
      this.currentAppState = { ...appState };
      if (appState?.zoom?.value && Math.abs(appState.zoom.value - this.currentZoom()) > 0.02) {
        this.currentZoom.set(Math.round(appState.zoom.value * 100) / 100);
      }
      const bg = appState.viewBackgroundColor;
      const currentSignature = computeElementsSignature(elements, bg);

      if (currentSignature === lastElementsSignature) {
        return;
      }

      clearTimeout(this.syncTimeout);
      this.syncTimeout = setTimeout(() => {
        try {
          lastElementsSignature = currentSignature;
          const sanitizedAppState: any = {};
          if (bg && bg !== '#111b2e') {
            sanitizedAppState.viewBackgroundColor = bg;
          }
          this.notesService.updateBlockContent(this.block.id, {
            elements: [...elements],
            appState: sanitizedAppState,
          });
        } catch (err) {
          console.error('Error saving Excalidraw snapshot:', err);
        }
      }, 1000);
    };

    const initialAppState: any = {
      ...this.currentAppState,
      theme: isDark ? 'dark' : 'light',
      viewModeEnabled: isReading,
    };
    if (!isDark && initialAppState.viewBackgroundColor === '#111b2e') {
      delete initialAppState.viewBackgroundColor;
    }

    this.reactRoot.render(
      React.createElement(Excalidraw, {
        excalidrawAPI: (api: any) => {
          this.excalidrawAPI = api;
        },
        theme: isDark ? 'dark' : 'light',
        viewModeEnabled: isReading,
        UIOptions: {
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: !isReading,
            export: { saveFileToDisk: true },
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: true,
          },
        },
        initialData: {
          elements: this.currentElements,
          appState: initialAppState,
          scrollToContent: false,
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
