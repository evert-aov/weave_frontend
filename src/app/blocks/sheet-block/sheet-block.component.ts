import {
  Component,
  Input,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { createUniver, LocaleType } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreEsES from '@univerjs/preset-sheets-core/locales/es-ES';

/**
 * Bloque de Hoja de Cálculo Avanzado impulsado por Univer Sheets SDK.
 * Proporciona soporte nativo para fórmulas de cálculo reales (=SUM, =AVERAGE, =IF, etc.),
 * inserción/edición ilimitada de filas y columnas, barra de fórmulas interactiva
 * y persistencia automática de snapshots del libro de trabajo.
 */
@Component({
  selector: 'app-sheet-block',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="univer-sheet-block">
      <div class="sheet-header-badge">
        <span class="badge-icon">📊</span>
        <span class="badge-title">
          {{ i18n.currentLang() === 'es' ? 'Hoja de Cálculo Univer' : 'Univer Spreadsheet' }}
        </span>
        <span class="badge-subtitle">
          {{ i18n.currentLang() === 'es' ? 'Cálculos matemáticos reales en vivo' : 'Live real-time formulas & computing' }}
        </span>
      </div>

      <div class="sheet-container-wrapper">
        <div #sheetContainer class="univer-container"></div>
      </div>
    </div>
  `,
  styles: [
    `
      .univer-sheet-block {
        width: 100%;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: var(--bg);
        margin: 10px 0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      }
      .sheet-header-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        font-size: 11.5px;
      }
      .badge-icon {
        font-size: 13px;
      }
      .badge-title {
        font-weight: 600;
        color: var(--text);
      }
      .badge-subtitle {
        color: var(--muted);
        font-size: 10.5px;
      }
      .sheet-container-wrapper {
        position: relative;
        width: 100%;
        height: 440px;
        background: var(--bg);
        overflow: hidden;
      }
      .univer-container {
        width: 100%;
        height: 100%;
        position: relative;
      }
    `,
  ],
})
export class SheetBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('sheetContainer', { static: true })
  sheetContainer!: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  private univerInstance: any = null;
  private univerAPI: any = null;
  private saveTimeout: any = null;
  private commandSubscription: any = null;

  ngAfterViewInit(): void {
    this.initUniver();
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

  private initUniver(): void {
    try {
      const containerEl = this.sheetContainer.nativeElement;
      const lang = this.i18n.currentLang() === 'es' ? LocaleType.ES_ES : LocaleType.EN_US;

      const { univer, univerAPI } = createUniver({
        locale: lang,
        locales: {
          [LocaleType.EN_US]: UniverPresetSheetsCoreEnUS,
          [LocaleType.ES_ES]: UniverPresetSheetsCoreEsES,
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerEl,
            header: true,
            toolbar: true,
            formulaBar: true,
            footer: {
              sheetBar: true,
              statisticBar: true,
            },
          }),
        ],
      });

      this.univerInstance = univer;
      this.univerAPI = univerAPI;

      let workbook: any = null;
      const savedData = this.block.content?.['workbookData'];

      if (savedData && typeof savedData === 'object' && Object.keys(savedData).length > 0) {
        workbook = univerAPI.createWorkbook(savedData);
      } else {
        const initialWorkbookData = {
          id: `wb-${this.block.id}`,
          name: 'Sheet 1',
          sheets: {
            'sheet-01': {
              id: 'sheet-01',
              name: 'Sheet1',
              rowCount: 30,
              columnCount: 15,
              cellData: {
                0: {
                  0: { v: 'Item', t: 1 },
                  1: { v: 'Qty', t: 1 },
                  2: { v: 'Unit Price', t: 1 },
                  3: { v: 'Subtotal', t: 1 },
                },
                1: {
                  0: { v: 'Widget A', t: 1 },
                  1: { v: 12, t: 2 },
                  2: { v: 18.5, t: 2 },
                  3: { f: '=B2*C2', v: 222, t: 2 },
                },
                2: {
                  0: { v: 'Widget B', t: 1 },
                  1: { v: 8, t: 2 },
                  2: { v: 45, t: 2 },
                  3: { f: '=B3*C3', v: 360, t: 2 },
                },
                3: {
                  0: { v: 'Widget C', t: 1 },
                  1: { v: 15, t: 2 },
                  2: { v: 22, t: 2 },
                  3: { f: '=B4*C4', v: 330, t: 2 },
                },
                4: {
                  0: { v: 'Total / Promedio', t: 1 },
                  1: { f: '=SUM(B2:B4)', v: 35, t: 2 },
                  2: { f: '=AVERAGE(C2:C4)', v: 28.5, t: 2 },
                  3: { f: '=SUM(D2:D4)', v: 912, t: 2 },
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
    } catch (err) {
      console.error('[SheetBlockComponent] Error initializing Univer Sheets:', err);
    }
  }

  private lastSavedSnapshotString = '';

  private scheduleAutoSave(workbook: any): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        if (workbook && typeof workbook.save === 'function') {
          const snapshot = workbook.save();
          // Comparar si las celdas o estructura de las hojas sufrieron modificaciones reales
          const currentString = JSON.stringify(snapshot?.sheets || snapshot);
          if (currentString === this.lastSavedSnapshotString) {
            return; // Solo fue un desplazamiento (scroll), zoom o cambio de celda activa
          }
          this.lastSavedSnapshotString = currentString;
          this.notesService.updateBlockContent(this.block.id, {
            workbookData: snapshot,
          });
        }
      } catch (err) {
        console.error('[SheetBlockComponent] Error saving workbook snapshot:', err);
      }
    }, 800);
  }
}
