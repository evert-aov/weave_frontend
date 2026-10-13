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
 * Editor Especializado Puro: Presentaciones / Diapositivas (Univer Slides 100% Open Source).
 * Proporciona un espacio de trabajo de diapositivas con barra de herramientas Ribbon,
 * panel lateral de miniaturas de diapositivas, inserción de formas, cajas de texto, imágenes
 * y autoguardado en tiempo real sin dependencias comerciales Pro.
 */
@Component({
  selector: 'app-pure-slide-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './pure-slide-editor.component.html',
  styleUrls: ['./pure-slide-editor.component.scss'],
})
export class PureSlideEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild('slideContainer', { static: true })
  slideContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  private univerInstance: any = null;
  private univerAPI: any = null;
  private slideUnit: any = null;
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
    const el = this.slideContainer?.nativeElement?.closest('.pure-slide-workspace') as HTMLElement || this.slideContainer?.nativeElement;
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

  private normalizeSlideData(data: any, noteId: string, title?: string): any {
    if (
      !data ||
      typeof data !== 'object' ||
      !data.body ||
      !data.body.pages ||
      !data.body.pageOrder ||
      data.body.pageOrder.length === 0
    ) {
      const defaultPageId = `page-${noteId}-0`;
      return {
        id: `slide-${noteId}`,
        title: title || 'Nueva Presentación',
        pageSize: {
          width: 960,
          height: 540,
        },
        body: {
          pages: {
            [defaultPageId]: {
              id: defaultPageId,
              pageType: PageType.SLIDE,
              zIndex: 0,
              title: 'Diapositiva 1',
              description: '',
              pageBackgroundFill: {
                rgb: 'rgb(255,255,255)',
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
      id: data.id || `slide-${noteId}`,
      title: title || data.title || 'Nueva Presentación',
      pageSize: data.pageSize || { width: 960, height: 540 },
    };
  }

  private initUniver(): void {
    try {
      const containerEl = this.slideContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const localesEnUS = merge(
        {},
        UniverPresetDocsCoreEnUS,
        UniverSlidesUIEnUS
      );

      const localesEsES = merge(
        {},
        UniverPresetDocsCoreEsES,
        UniverSlidesUIEsES
      );

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

      const slideData = this.normalizeSlideData(this.note.docData, this.note._id, this.note.title);
      const slideUnit = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, slideData);
      this.slideUnit = slideUnit;

      const commandService = (univer as any)?.__getInjector?.()?.get(ICommandService);
      if (commandService && typeof commandService.onCommandExecuted === 'function') {
        this.commandSubscription = commandService.onCommandExecuted((commandInfo: any) => {
          this.scheduleAutoSave(slideUnit);
        });
      }
    } catch (err) {
      console.error('[PureSlideEditor] Error initializing Univer Slides Open Source:', err);
    }
  }

  private scheduleAutoSave(slideUnit?: any): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        const target = slideUnit || this.slideUnit;
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
        console.error('[PureSlideEditor] Error during auto-save:', e);
      }
    }, 600);
  }
}
