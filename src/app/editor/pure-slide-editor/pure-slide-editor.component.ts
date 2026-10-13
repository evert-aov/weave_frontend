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

import { UniverShapePlugin } from '@univerjs-pro/engine-shape';
import { UniverShapeEditorPlugin } from '@univerjs-pro/shape-editor';
import { UniverShapeEditorUIPlugin } from '@univerjs-pro/shape-editor-ui';
import { UniverSlidesPlugin, getSlidesEmptySnapshot } from '@univerjs-pro/slides';
import { UniverSlidesUIPlugin } from '@univerjs-pro/slides-ui';

import UniverPresetDocsCoreEnUS from '@univerjs/preset-docs-core/locales/en-US';
import UniverPresetDocsCoreEsES from '@univerjs/preset-docs-core/locales/es-ES';
import UniverProSlidesUIEnUS from '@univerjs-pro/slides-ui/locale/en-US';
import UniverProSlidesUIEsES from '@univerjs-pro/slides-ui/locale/es-ES';
import UniverProShapeEditorUIEnUS from '@univerjs-pro/shape-editor-ui/locale/en-US';
import UniverProShapeEditorUIEsES from '@univerjs-pro/shape-editor-ui/locale/es-ES';

import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Editor Especializado Puro: Presentaciones / Diapositivas (Univer Slides Pro).
 * Proporciona el entorno completo de diapositivas estilo PowerPoint:
 * cinta Ribbon con herramientas avanzadas (temas, transiciones, SmartArt, formas, cajas de texto),
 * regla milimétrica, guías de alineación inteligentes, panel de miniaturas y autoguardado en tiempo real.
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

  private normalizeSlideData(data: any, noteId: string, title?: string): any {
    if (
      !data ||
      typeof data !== 'object' ||
      !data.slides ||
      !data.slideOrder ||
      !Array.isArray(data.slideOrder) ||
      data.slideOrder.length === 0
    ) {
      const emptySnapshot = getSlidesEmptySnapshot();
      emptySnapshot.id = `slide-${noteId}`;
      emptySnapshot.name = title || 'Nueva Presentación';
      return emptySnapshot;
    }

    return {
      ...data,
      id: data.id || `slide-${noteId}`,
      name: title || data.name || 'Nueva Presentación',
    };
  }

  private initUniver(): void {
    try {
      const containerEl = this.slideContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const localesEnUS = merge(
        {},
        UniverPresetDocsCoreEnUS,
        UniverProSlidesUIEnUS,
        UniverProShapeEditorUIEnUS
      );

      const localesEsES = merge(
        {},
        UniverPresetDocsCoreEsES,
        UniverProSlidesUIEsES,
        UniverProShapeEditorUIEsES
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
              UniverShapePlugin,
              UniverShapeEditorPlugin,
              UniverShapeEditorUIPlugin,
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
      console.error('[PureSlideEditor] Error initializing Univer Slides Pro:', err);
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
          const currentString = JSON.stringify(snapshot?.slides || snapshot);
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
