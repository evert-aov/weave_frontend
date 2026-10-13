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
    this.applyZoom(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.currentZoom() - 0.1) * 10) / 10, 0.5);
    this.applyZoom(next);
  }

  resetZoom(): void {
    this.applyZoom(1.0);
  }

  private applyZoom(zoomVal: number): void {
    this.currentZoom.set(zoomVal);
    try {
      if (this.univerAPI) {
        const activeDoc = this.univerAPI.getActiveDocument?.();
        const docId = activeDoc?.getId?.();
        (this.univerAPI as any).executeCommand('doc.command.set-zoom-ratio', {
          zoomRatio: zoomVal,
          documentId: docId,
        });
      }
    } catch (e) {
      console.warn('[PureDocEditor] Zoom apply warning:', e);
    }
  }

  private normalizeDocData(data: any, noteId: string, title?: string): any {
    if (!data || typeof data !== 'object' || !data.body || !data.body.dataStream) {
      return {
        id: `doc-${noteId}`,
        title: title || 'Nuevo Documento',
        body: {
          dataStream: '\r\n',
          textRuns: [],
          paragraphs: [
            {
              startIndex: 0,
              paragraphId: `p-${noteId}-0`,
              paragraphStyle: {},
            },
          ],
          sectionBreaks: [
            {
              startIndex: 1,
              sectionId: `s-${noteId}-0`,
            },
          ],
        },
        documentStyle: {
          pageSize: {
            width: 794,
            height: 1124,
          },
          documentFlavor: 1,
          marginTop: 72,
          marginBottom: 72,
          marginRight: 72,
          marginLeft: 72,
        },
      };
    }

    const body = { ...data.body };
    let stream = body.dataStream;
    if (typeof stream !== 'string' || stream.length === 0) {
      stream = '\r\n';
    } else {
      if (!stream.endsWith('\r\n')) {
        if (stream.endsWith('\r')) stream += '\n';
        else if (stream.endsWith('\n')) stream = stream.slice(0, -1) + '\r\n';
        else stream += '\r\n';
      }
    }
    body.dataStream = stream;

    const returnIndices: number[] = [];
    for (let i = 0; i < stream.length; i++) {
      if (stream[i] === '\r') {
        returnIndices.push(i);
      }
    }

    if (returnIndices.length === 0) {
      body.dataStream = '\r\n';
      body.paragraphs = [{ startIndex: 0, paragraphId: `p-${noteId}-0`, paragraphStyle: {} }];
      body.sectionBreaks = [{ startIndex: 1, sectionId: `s-${noteId}-0` }];
    } else {
      const validParagraphs = Array.isArray(body.paragraphs) ? body.paragraphs : [];
      body.paragraphs = returnIndices.map((retIdx, idx) => {
        const existing = validParagraphs[idx] || {};
        return {
          ...existing,
          startIndex: retIdx,
          paragraphId: existing.paragraphId || `p-${noteId}-${idx}`,
          paragraphStyle: existing.paragraphStyle || {},
        };
      });

      const maxSectionIndex = stream.length - 1;
      if (
        !Array.isArray(body.sectionBreaks) ||
        body.sectionBreaks.length === 0 ||
        body.sectionBreaks.some((sb: any) => sb.startIndex > maxSectionIndex)
      ) {
        body.sectionBreaks = [
          {
            startIndex: maxSectionIndex,
            sectionId: `s-${noteId}-0`,
          },
        ];
      }
    }

    if (!Array.isArray(body.textRuns)) {
      body.textRuns = [];
    }

    return {
      ...data,
      id: data.id || `doc-${noteId}`,
      title: title || data.title || 'Nuevo Documento',
      body,
      documentStyle: {
        pageSize: {
          width: 794,
          height: 1124,
        },
        documentFlavor: 1,
        marginTop: 72,
        marginBottom: 72,
        marginRight: 72,
        marginLeft: 72,
        ...(data.documentStyle || {}),
      },
    };
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

      const docDataToLoad = this.normalizeDocData(this.note.docData, this.note._id, this.note.title);
      univerAPI.createDocument(docDataToLoad);

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
