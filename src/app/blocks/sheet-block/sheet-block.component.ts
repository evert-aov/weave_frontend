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
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { createUniver, LocaleType } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreEsES from '@univerjs/preset-sheets-core/locales/es-ES';

/**
 * Bloque de Hoja de Cálculo Avanzado impulsado por Univer Sheets SDK.
 * Proporciona soporte nativo para fórmulas de cálculo reales (=SUM, =AVERAGE, etc.),
 * celdas combinadas, estilos tipográficos/colores, zoom dinámico (edición y lectura),
 * y ocultamiento total de cabeceras de filas y columnas en modo lectura.
 */
@Component({
  selector: 'app-sheet-block',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sheet-block.component.html',
  styleUrls: ['./sheet-block.component.scss'],
})
export class SheetBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('sheetContainer', { static: true })
  sheetContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly readingHeight = signal<number>(160);

  private univerInstance: any = null;
  private univerAPI: any = null;
  private saveTimeout: any = null;
  private commandSubscription: any = null;

  constructor() {
    this.updateReadingHeight();
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      this.notesService.documentZoom();
      this.updateHeadersVisibility(isReading);
      this.applyDocZoom(1.0);
      this.updateReadingHeight();
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 60);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 160);
    });
  }

  ngAfterViewInit(): void {
    this.initUniver();
    this.updateReadingHeight();
    setTimeout(() => {
      this.updateHeadersVisibility(this.notesService.isReadingMode());
      this.applyDocZoom(1.0);
      window.dispatchEvent(new Event('resize'));
    }, 120);
  }

  /**
   * Mantiene el motor vectorial de Univer Sheets en escala 1.0 (100%)
   * para que las celdas y fórmulas internas no se distorsionen con el zoom.
   */
  applyDocZoom(_zoomRatio?: number): void {
    try {
      if (this.univerAPI) {
        const activeWorkbook = this.univerAPI.getActiveWorkbook?.();
        const activeSheet = activeWorkbook?.getActiveSheet?.();
        if (activeSheet && typeof activeSheet.zoom === 'function') {
          activeSheet.zoom(1.0);
        }
      }
    } catch (e) {
      console.warn('[SheetBlockComponent] Could not set Univer zoom:', e);
    }
  }

  /**
   * Asegura que el canvas de Univer esté actualizado al alternar modos.
   */
  updateHeadersVisibility(_isReading: boolean): void {
    try {
      if (this.univerAPI) {
        const activeWorkbook = this.univerAPI.getActiveWorkbook?.();
        const activeSheet = activeWorkbook?.getActiveSheet?.();
        if (activeSheet) {
          if (typeof activeSheet.refreshCanvas === 'function') {
            activeSheet.refreshCanvas();
          }
        }
      }
    } catch (e) {
      console.warn('[SheetBlockComponent] Could not update headers visibility:', e);
    }
  }

  /**
   * Determina cuántas filas con contenido real o celdas combinadas existen en la hoja de cálculo.
   */
  getOccupiedRowsCount(): number {
    try {
      if (this.univerAPI) {
        const activeWorkbook = this.univerAPI.getActiveWorkbook?.();
        const activeSheet = activeWorkbook?.getActiveSheet?.();
        if (activeSheet && typeof activeSheet.getLastRow === 'function') {
          const lastRow = activeSheet.getLastRow();
          if (typeof lastRow === 'number' && lastRow >= 0) {
            return lastRow + 1;
          }
        }
      }
    } catch (e) {}

    try {
      const savedData = this.block?.content?.['workbookData'];
      if (savedData?.sheets) {
        const sheet = Object.values(savedData.sheets)[0] as any;
        const cellData = sheet?.cellData;
        let maxRow = 0;
        if (cellData && typeof cellData === 'object') {
          const rowKeys = Object.keys(cellData);
          rowKeys.forEach((r) => {
            const row = cellData[r];
            if (row && Object.values(row).some((c: any) => c?.v !== undefined && c?.v !== null && c?.v !== '')) {
              const rNum = Number(r);
              if (rNum > maxRow) maxRow = rNum;
            }
          });
        }
        if (sheet?.mergeData && Array.isArray(sheet.mergeData)) {
          sheet.mergeData.forEach((m: any) => {
            if (m.endRow > maxRow) maxRow = m.endRow;
          });
        }
        if (maxRow > 0) return maxRow + 1;
      }
    } catch (e) {}

    return 5;
  }

  /**
   * Calcula y actualiza la altura exacta necesaria para mostrar las celdas ocupadas.
   */
  updateReadingHeight(): void {
    const rows = this.getOccupiedRowsCount();
    // 26px cabecera de columnas + 24px por fila de datos + margen inferior
    const calculated = 26 + rows * 24 + 24;
    const clamped = Math.min(Math.max(calculated, 120), 560);
    this.readingHeight.set(clamped);
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
          const currentString = JSON.stringify(snapshot?.sheets || snapshot);
          if (currentString === this.lastSavedSnapshotString) {
            return;
          }
          this.lastSavedSnapshotString = currentString;
          this.notesService.updateBlockContent(this.block.id, {
            workbookData: snapshot,
          });
          this.updateReadingHeight();
        }
      } catch (err) {
        console.error('[SheetBlockComponent] Error saving workbook snapshot:', err);
      }
    }, 800);
  }
}
