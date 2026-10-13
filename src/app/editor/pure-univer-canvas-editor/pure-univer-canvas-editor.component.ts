import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createUniver, LocaleType } from '@univerjs/presets';
import { ICommandService, UniverInstanceType, merge } from '@univerjs/core';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverSlidesPlugin, PageType } from '@univerjs/slides';
import { UniverSlidesUIPlugin } from '@univerjs/slides-ui';

import UniverPresetDocsCoreEnUS from '@univerjs/preset-docs-core/locales/en-US';
import UniverPresetDocsCoreEsES from '@univerjs/preset-docs-core/locales/es-ES';
import UniverSlidesUIEnUS from '@univerjs/slides-ui/locale/en-US';
import UniverSlidesUIEsES from '@univerjs/slides-ui/locale/es-ES';

import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Editor Especializado Puro: Univer Canvas (Lienzo Gráfico y Dibujo de UniverJS).
 * Proporciona un lienzo de dibujo y gráficos infinito utilizando el motor de renderizado y dibujo
 * de UniverJS (Open Source Apache 2.0).
 */
@Component({
  selector: 'app-pure-univer-canvas-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './pure-univer-canvas-editor.component.html',
  styleUrls: ['./pure-univer-canvas-editor.component.scss'],
})
export class PureUniverCanvasEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild('canvasContainer', { static: true })
  canvasContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  private univerInstance: any = null;
  private univerAPI: any = null;
  private canvasUnit: any = null;
  private commandSubscription: any = null;
  private saveTimeout: any = null;
  private lastSavedSnapshotString = '';

  constructor() {
    effect(() => {
      this.notesService.documentZoom();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 80);
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initUniver();
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    if (this.commandSubscription && typeof this.commandSubscription.dispose === 'function') {
      this.commandSubscription.dispose();
    }
    if (this.univerInstance && typeof this.univerInstance.dispose === 'function') {
      this.univerInstance.dispose();
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
      this.note = { ...this.note, title: text };
      this.notesService.updateMeta({ title: text });
    }
  }

  onTitleEnter(event: Event): void {
    const el = event.target as HTMLElement;
    el.blur();
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.currentZoom() + 0.1) * 10) / 10, 2.0);
    this.currentZoom.set(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.currentZoom() - 0.1) * 10) / 10, 0.5);
    this.currentZoom.set(next);
  }

  resetZoom(): void {
    this.currentZoom.set(1.0);
  }

  toggleFullscreen(): void {
    const el =
      (this.canvasContainer?.nativeElement?.closest(
        '.pure-univer-canvas-workspace'
      ) as HTMLElement) || this.canvasContainer?.nativeElement;
    if (!document.fullscreenElement) {
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  private normalizeCanvasData(data: any, noteId: string, title?: string): any {
    if (
      !data ||
      typeof data !== 'object' ||
      !data.body ||
      !data.body.pages ||
      !data.body.pageOrder ||
      data.body.pageOrder.length === 0
    ) {
      const defaultPageId = `canvas-page-${noteId}-0`;
      return {
        id: `univer-canvas-${noteId}`,
        title: title || 'Nuevo Lienzo Univer',
        pageSize: {
          width: 1920,
          height: 1080,
        },
        body: {
          pages: {
            [defaultPageId]: {
              id: defaultPageId,
              pageType: PageType.SLIDE,
              zIndex: 0,
              title: 'Lienzo',
              description: '',
              pageBackgroundFill: {
                rgb: 'rgb(248,250,252)',
              },
              pageElements: {},
            },
          },
          pageOrder: [defaultPageId],
        },
      };
    }

    return {
      ...data,
      id: data.id || `univer-canvas-${noteId}`,
      title: title || data.title || 'Nuevo Lienzo Univer',
      pageSize: data.pageSize || { width: 1920, height: 1080 },
    };
  }

  private initUniver(): void {
    try {
      const containerEl = this.canvasContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const localesEnUS = merge({}, UniverPresetDocsCoreEnUS, UniverSlidesUIEnUS);
      const localesEsES = merge({}, UniverPresetDocsCoreEsES, UniverSlidesUIEsES);

      const { univer, univerAPI } = createUniver({
        locale: lang,
        locales: {
          [LocaleType.EN_US]: localesEnUS,
          [LocaleType.ES_ES]: localesEsES,
        },
        presets: [
          {
            plugins: [
              UniverRenderEnginePlugin,
              [
                UniverUIPlugin,
                {
                  container: containerEl,
                  header: true,
                  toolbar: true,
                  ribbonType: 'grid',
                },
              ],
              UniverDocsPlugin,
              UniverDocsUIPlugin,
              UniverDrawingPlugin,
              UniverSlidesPlugin,
              UniverSlidesUIPlugin,
            ],
          },
        ],
      });

      this.univerInstance = univer;
      this.univerAPI = univerAPI;

      const canvasData = this.normalizeCanvasData(this.note.docData, this.note._id, this.note.title);
      const unit = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, canvasData);
      this.canvasUnit = unit;

      const commandService = (univer as any)?.__getInjector?.()?.get(ICommandService);
      if (commandService && typeof commandService.onCommandExecuted === 'function') {
        this.commandSubscription = commandService.onCommandExecuted(() => {
          this.scheduleAutoSave(unit);
        });
      }
    } catch (err) {
      console.error('[PureUniverCanvasEditor] Error initializing Univer Canvas Open Source:', err);
    }
  }

  private scheduleAutoSave(unit?: any): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        const target = unit || this.canvasUnit;
        if (!target) return;

        const snapshot =
          (typeof target.getSnapshot === 'function' ? target.getSnapshot() : null) ||
          target.snapshot;

        if (snapshot) {
          const currentString = JSON.stringify(snapshot?.body || snapshot);
          if (currentString === this.lastSavedSnapshotString) {
            return;
          }
          this.lastSavedSnapshotString = currentString;
          this.notesService.updateDocData(snapshot);
        }
      } catch (e) {
        console.error('[PureUniverCanvasEditor] Error during auto-save:', e);
      }
    }, 600);
  }
}
