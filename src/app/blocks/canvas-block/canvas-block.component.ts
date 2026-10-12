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
  template: `
    <div class="excalidraw-block-container" [class.reading-mode]="notesService.isReadingMode()">
      <div
        #canvasMount
        class="excalidraw-mount-point"
        [style.zoom]="1 / notesService.documentZoom()"
        [style.width.%]="100 * notesService.documentZoom()"
        [style.height.%]="100 * notesService.documentZoom()"
      ></div>
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
        transition: height 0.2s ease, border-color 0.2s ease;
      }
      .excalidraw-block-container.reading-mode {
        height: 460px;
        box-shadow: none;
        border: 1px solid var(--border);
        margin: 6px 0;
      }
      .excalidraw-mount-point {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
      }
      ::ng-deep .excalidraw {
        height: 100% !important;
        width: 100% !important;
      }
      /* Modo Lectura: Ocultar barra de herramientas de dibujo y controles de edición */
      ::ng-deep .excalidraw-block-container.reading-mode .App-toolbar,
      ::ng-deep .excalidraw-block-container.reading-mode .layer-ui__wrapper .zen-mode-transition,
      ::ng-deep .excalidraw-block-container.reading-mode .App-bottom-bar,
      ::ng-deep .excalidraw-block-container.reading-mode .help-icon,
      ::ng-deep .excalidraw-block-container.reading-mode .dropdown-menu-button {
        display: none !important;
      }
    `,
  ],
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

  constructor() {
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      const isDark = this.themeService.isDark();
      if (this.reactRoot) {
        this.renderCanvas(isReading, isDark);
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
