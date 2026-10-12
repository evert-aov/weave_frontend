import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Excalidraw } from '@excalidraw/excalidraw';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { ThemeService } from '../../core/services/theme.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

if (typeof window !== 'undefined' && !(window as any).process) {
  (window as any).process = { env: { NODE_ENV: 'production' } };
}

/**
 * Editor Especializado Puro: Lienzo de Dibujo / Pizarra (Canvas).
 * Proporciona un espacio de trabajo completo de dibujo vectorial con Excalidraw
 * a pantalla completa con figuras geométricas, lápiz, flechas, texto y notas adhesivas.
 */
@Component({
  selector: 'app-pure-canvas-editor',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './pure-canvas-editor.component.html',
  styleUrls: ['./pure-canvas-editor.component.scss'],
})
export class PureCanvasEditorComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) note!: Note;
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
    });

    effect(() => {
      this.notesService.documentZoom();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 80);
    });
  }

  ngAfterViewInit(): void {
    const mountEl = this.canvasMount.nativeElement;
    this.reactRoot = createRoot(mountEl);
    this.currentElements = this.note.docData?.['elements'] || [];
    this.currentAppState = this.note.docData?.['appState'] || {};

    this.renderCanvas(
      this.notesService.isReadingMode(),
      this.themeService.isDark(),
    );

    setTimeout(() => this.centerToContent(), 250);
  }

  ngOnDestroy(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    if (this.reactRoot) {
      try {
        this.reactRoot.unmount();
      } catch (err) {
        console.warn('[PureCanvasEditor] React unmount warning:', err);
      }
    }
  }

  formatSpacePath(space?: string): string {
    if (!space) return 'General';
    return space.split('/').join(' / ');
  }

  onTitleBlur(event: FocusEvent): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    if (text && text !== this.note.title) {
      this.notesService.updateMeta({ title: text });
    }
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.currentZoom() + 0.15) * 100) / 100, 3.0);
    this.applyZoom(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.currentZoom() - 0.15) * 100) / 100, 0.2);
    this.applyZoom(next);
  }

  resetZoom(): void {
    this.applyZoom(1.0);
  }

  centerToContent(): void {
    if (!this.excalidrawAPI) return;
    try {
      if (typeof this.excalidrawAPI.scrollToContent === 'function') {
        this.excalidrawAPI.scrollToContent(this.currentElements, {
          fitToViewport: false,
          animate: true,
        });
      }
      this.currentZoom.set(1.0);
    } catch (e) {
      console.warn('[PureCanvasEditor] Center to content warning:', e);
    }
  }

  private applyZoom(zoomValue: number): void {
    this.currentZoom.set(zoomValue);
    if (!this.excalidrawAPI) return;
    try {
      const state = this.excalidrawAPI.getAppState?.() || {};
      this.excalidrawAPI.updateScene?.({
        appState: {
          ...state,
          zoom: { value: zoomValue },
        },
      });
    } catch (e) {
      console.warn('[PureCanvasEditor] Zoom apply warning:', e);
    }
  }

  private renderCanvas(isReading: boolean, isDark: boolean): void {
    if (!this.reactRoot) return;

    const excalidrawElement = React.createElement(Excalidraw, {
      excalidrawAPI: (api: any) => {
        this.excalidrawAPI = api;
      },
      initialData: {
        elements: this.currentElements,
        appState: {
          ...this.currentAppState,
          viewModeEnabled: isReading,
          theme: isDark ? 'dark' : 'light',
          zenModeEnabled: false,
          gridSize: 20,
        },
        scrollToContent: true,
      },
      viewModeEnabled: isReading,
      theme: isDark ? 'dark' : 'light',
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
      onChange: (elements: readonly any[], appState: any) => {
        if (isReading) return;
        this.currentElements = [...elements];
        this.currentAppState = {
          viewBackgroundColor: appState.viewBackgroundColor,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        };

        if (appState.zoom?.value) {
          this.currentZoom.set(Math.round(appState.zoom.value * 100) / 100);
        }

        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
        }
        this.syncTimeout = setTimeout(() => {
          this.notesService.updateDocData({
            elements: this.currentElements,
            appState: this.currentAppState,
          });
        }, 600);
      },
    });

    this.reactRoot.render(excalidrawElement);
  }
}
