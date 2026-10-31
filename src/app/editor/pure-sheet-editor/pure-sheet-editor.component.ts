import { AiDocumentService } from '../../core/services/ai-document.service';
import { sheetAiAdapter } from '../../shared/utils/ai-sheet-adapter';
import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createUniver, LocaleType } from '@univerjs/presets';
import { merge } from '@univerjs/core';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace';
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link';
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing';

import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreEsES from '@univerjs/preset-sheets-core/locales/es-ES';
import UniverPresetSheetsSortEnUS from '@univerjs/preset-sheets-sort/locales/en-US';
import UniverPresetSheetsSortEsES from '@univerjs/preset-sheets-sort/locales/es-ES';
import UniverPresetSheetsFilterEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import UniverPresetSheetsFilterEsES from '@univerjs/preset-sheets-filter/locales/es-ES';
import UniverPresetSheetsConditionalFormattingEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US';
import UniverPresetSheetsConditionalFormattingEsES from '@univerjs/preset-sheets-conditional-formatting/locales/es-ES';
import UniverPresetSheetsDataValidationEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US';
import UniverPresetSheetsDataValidationEsES from '@univerjs/preset-sheets-data-validation/locales/es-ES';
import UniverPresetSheetsFindReplaceEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US';
import UniverPresetSheetsFindReplaceEsES from '@univerjs/preset-sheets-find-replace/locales/es-ES';
import UniverPresetSheetsHyperLinkEnUS from '@univerjs/preset-sheets-hyper-link/locales/en-US';
import UniverPresetSheetsHyperLinkEsES from '@univerjs/preset-sheets-hyper-link/locales/es-ES';
import UniverPresetSheetsDrawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US';
import UniverPresetSheetsDrawingEsES from '@univerjs/preset-sheets-drawing/locales/es-ES';
import { Note } from '../../core/models/note.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Editor Especializado Puro: Hoja de Cálculo (Univer Sheets).
 * Proporciona un espacio de trabajo completo de hoja de cálculo con barra de herramientas,
 * barra de fórmulas, pestañas múltiples de hoja, cálculo en vivo y autoguardado de libro.
 */
@Component({
  selector: 'app-pure-sheet-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './pure-sheet-editor.component.html',
  styleUrls: ['./pure-sheet-editor.component.scss'],
})
export class PureSheetEditorComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) note!: Note;
  @ViewChild('sheetContainer', { static: true })
  sheetContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly currentZoom = signal<number>(1.0);
  readonly Math = Math;

  private univerInstance: any = null;
  private univerAPI: any = null;
  private commandSubscription: any = null;
  private saveTimeout: any = null;
  private lastSavedSnapshotString = '';
  private loadedNoteId: string | null = null;
  private isDestroyed = false;

  private readonly aiReadyOwner = signal<string | undefined>(undefined);
  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register(sheetAiAdapter(
    () => this.aiReadyOwner(), () => this.univerAPI?.getActiveWorkbook(),
    snapshot => { clearTimeout(this.saveTimeout); this.notesService.updateDocData(snapshot, this.loadedNoteId ?? undefined); }, () => '',
  ));

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
    this.loadedNoteId = this.note?._id || null;
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.initUniver();
      }
    }, 50);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['note'] && !changes['note'].firstChange) {
      const newId = this.note?._id;
      if (newId && newId !== this.loadedNoteId) {
        this.loadedNoteId = newId;
        this.resetAndReload();
      }
    }
  }

  ngOnDestroy(): void {
    this.unregisterAi();
    this.isDestroyed = true;
    this.destroyUniver();
  }

  private resetAndReload(): void {
    this.destroyUniver();
    if (!this.isDestroyed) {
      setTimeout(() => {
        if (!this.isDestroyed && this.loadedNoteId === this.note?._id) {
          this.initUniver();
        }
      }, 50);
    }
  }

  private destroyUniver(): void {
    this.aiReadyOwner.set(undefined);
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.commandSubscription && typeof this.commandSubscription.dispose === 'function') {
      try {
        this.commandSubscription.dispose();
      } catch {}
      this.commandSubscription = null;
    }
    if (this.univerInstance && typeof this.univerInstance.dispose === 'function') {
      try {
        this.univerInstance.dispose();
      } catch {}
      this.univerInstance = null;
    }
    this.univerAPI = null;
    if (this.sheetContainer?.nativeElement) {
      this.sheetContainer.nativeElement.innerHTML = '';
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

  toggleFullscreen(): void {
    const el = this.sheetContainer?.nativeElement?.closest('.pure-sheet-workspace') as HTMLElement || this.sheetContainer?.nativeElement;
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

  private applyZoom(zoomVal: number): void {
    this.currentZoom.set(zoomVal);
    try {
      if (this.univerAPI) {
        const activeWorkbook = this.univerAPI.getActiveWorkbook?.();
        const activeSheet = activeWorkbook?.getActiveSheet?.();
        if (activeSheet && typeof activeSheet.setZoom === 'function') {
          activeSheet.setZoom(zoomVal);
        }
      }
    } catch (e) {
      console.warn('[PureSheetEditor] Zoom apply warning:', e);
    }
  }

  private initUniver(): void {
    try {
      const containerEl = this.sheetContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const localesEnUS = merge(
        {},
        UniverPresetSheetsCoreEnUS,
        UniverPresetSheetsSortEnUS,
        UniverPresetSheetsFilterEnUS,
        UniverPresetSheetsConditionalFormattingEnUS,
        UniverPresetSheetsDataValidationEnUS,
        UniverPresetSheetsFindReplaceEnUS,
        UniverPresetSheetsHyperLinkEnUS,
        UniverPresetSheetsDrawingEnUS
      );

      const localesEsES = merge(
        {},
        UniverPresetSheetsCoreEsES,
        UniverPresetSheetsSortEsES,
        UniverPresetSheetsFilterEsES,
        UniverPresetSheetsConditionalFormattingEsES,
        UniverPresetSheetsDataValidationEsES,
        UniverPresetSheetsFindReplaceEsES,
        UniverPresetSheetsHyperLinkEsES,
        UniverPresetSheetsDrawingEsES
      );

      const { univer, univerAPI } = createUniver({
        locale: lang,
        locales: {
          [LocaleType.EN_US]: localesEnUS,
          [LocaleType.ES_ES]: localesEsES,
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerEl,
            header: true,
            toolbar: true,
            ribbonType: 'grid',
            formulaBar: true,
            footer: {
              sheetBar: true,
              statisticBar: true,
            },
          }),
          UniverSheetsDrawingPreset(),
          UniverSheetsSortPreset(),
          UniverSheetsFilterPreset(),
          UniverSheetsConditionalFormattingPreset(),
          UniverSheetsDataValidationPreset(),
          UniverSheetsFindReplacePreset(),
          UniverSheetsHyperLinkPreset(),
        ],
      });

      this.univerInstance = univer;
      this.univerAPI = univerAPI;

      let workbook: any = null;
      const savedData = this.note.docData;

      if (savedData && typeof savedData === 'object' && Object.keys(savedData).length > 0) {
        workbook = univerAPI.createWorkbook(savedData);
      } else {
        const initialWorkbookData = {
          id: `wb-${this.note._id}`,
          name: this.note.title || 'Hoja 1',
          sheets: {
            'sheet-01': {
              id: 'sheet-01',
              name: 'Hoja 1',
              rowCount: 50,
              columnCount: 20,
              cellData: {
                0: {
                  0: { v: 'Código', t: 1 },
                  1: { v: 'Concepto', t: 1 },
                  2: { v: 'Cantidad', t: 1 },
                  3: { v: 'Precio Unitario', t: 1 },
                  4: { v: 'Total', t: 1 },
                },
                1: {
                  0: { v: 'PRD-001', t: 1 },
                  1: { v: 'Licencia Weave Pro', t: 1 },
                  2: { v: 5, t: 2 },
                  3: { v: 24.5, t: 2 },
                  4: { f: '=C2*D2', v: 122.5, t: 2 },
                },
                2: {
                  0: { v: 'PRD-002', t: 1 },
                  1: { v: 'Servidor Colaborativo', t: 1 },
                  2: { v: 2, t: 2 },
                  3: { v: 80.0, t: 2 },
                  4: { f: '=C3*D3', v: 160.0, t: 2 },
                },
                3: {
                  0: { v: 'RESUMEN', t: 1 },
                  1: { v: 'Total Facturado', t: 1 },
                  2: { f: '=SUM(C2:C3)', v: 7, t: 2 },
                  3: { v: '-', t: 1 },
                  4: { f: '=SUM(E2:E3)', v: 282.5, t: 2 },
                },
              },
            },
          },
        };
        workbook = univerAPI.createWorkbook(initialWorkbookData);
      }

      if (workbook && typeof workbook.onCommandExecuted === 'function') {
        this.commandSubscription = workbook.onCommandExecuted(() => {
          this.scheduleAutoSave(workbook);
        });
      }
      this.aiReadyOwner.set(this.loadedNoteId ?? undefined);
    } catch (err) {
      console.error('[PureSheetEditor] Error initializing Univer Sheets:', err);
    }
  }

  private scheduleAutoSave(workbook: any): void {
    if (this.isDestroyed || !this.note?._id) return;
    const targetNoteId = this.note._id;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      if (this.isDestroyed || this.note?._id !== targetNoteId) return;
      try {
        if (workbook && typeof workbook.save === 'function') {
          const snapshot = workbook.save();
          const currentString = JSON.stringify(snapshot?.sheets || snapshot);
          if (currentString === this.lastSavedSnapshotString) {
            return;
          }
          this.lastSavedSnapshotString = currentString;
          this.notesService.updateDocData(snapshot, targetNoteId);
        }
      } catch (e) {
        console.error('[PureSheetEditor] Error during auto-save:', e);
      }
    }, 600);
  }
}
