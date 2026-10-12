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
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core';
import UniverPresetDocsCoreEnUS from '@univerjs/preset-docs-core/locales/en-US';
import UniverPresetDocsCoreEsES from '@univerjs/preset-docs-core/locales/es-ES';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Editor Especializado Puro: Documento de Texto / Word (Univer Docs).
 * Ofrece un espacio de trabajo completo de procesador de textos formal estilo Word
 * con diseño de página, barra de herramientas completa de formato tipográfico y guardado en tiempo real.
 */
@Component({
  selector: 'app-pure-doc-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './pure-doc-editor.component.html',
  styleUrls: ['./pure-doc-editor.component.scss'],
})
export class PureDocEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild('docContainer', { static: true })
  docContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  private univerInstance: any = null;
  private univerAPI: any = null;
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
      this.notesService.updateMeta({ title: text });
    }
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

  private initUniver(): void {
    try {
      const containerEl = this.docContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const { univer, univerAPI } = createUniver({
        locale: lang,
        locales: {
          [LocaleType.EN_US]: UniverPresetDocsCoreEnUS,
          [LocaleType.ES_ES]: UniverPresetDocsCoreEsES,
        },
        presets: [
          UniverDocsCorePreset({
            container: containerEl,
            header: true,
            toolbar: true,
          }),
        ],
      });

      this.univerInstance = univer;
      this.univerAPI = univerAPI;

      let doc: any = null;
      const savedData = this.note.docData;

      if (savedData && typeof savedData === 'object' && Object.keys(savedData).length > 0) {
        doc = univerAPI.createDocument(savedData);
      } else {
        const initialDocData = {
          id: `doc-${this.note._id}`,
          title: this.note.title || 'Documento',
          body: {
            dataStream: `${this.note.title || 'Nuevo Documento'}\r\nComienza a redactar tu contenido aquí con el procesador formal de Univer Docs...\r\n`,
            paragraphs: [
              { paragraphId: 'p1', startIndex: 0, paragraphStyle: { headingId: 'k1' } },
              { paragraphId: 'p2', startIndex: (this.note.title || 'Nuevo Documento').length + 2 },
            ],
          },
        };
        doc = univerAPI.createDocument(initialDocData as any);
      }

      if (univerAPI && typeof (univerAPI as any).onCommandExecuted === 'function') {
        this.commandSubscription = (univerAPI as any).onCommandExecuted(() => {
          this.scheduleAutoSave();
        });
      }
    } catch (err) {
      console.error('[PureDocEditor] Error initializing Univer Docs:', err);
    }
  }

  private scheduleAutoSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        if (!this.univerAPI) return;
        const activeDoc = this.univerAPI.getActiveDocument?.();
        if (activeDoc) {
          const snapshot =
            activeDoc.getDocumentDataModel?.()?.getSnapshot?.() ||
            (activeDoc as any).getSnapshot?.();

          if (snapshot) {
            const currentString = JSON.stringify(snapshot?.body || snapshot);
            if (currentString === this.lastSavedSnapshotString) {
              return;
            }
            this.lastSavedSnapshotString = currentString;
            this.notesService.updateDocData(snapshot);
          }
        }
      } catch (e) {
        console.error('[PureDocEditor] Error during auto-save:', e);
      }
    }, 600);
  }
}
