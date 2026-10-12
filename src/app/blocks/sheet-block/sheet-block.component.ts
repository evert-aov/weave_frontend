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
 * Proporciona soporte nativo para fórmulas de cálculo reales (=SUM, =AVERAGE, =IF, etc.),
 * inserción/edición ilimitada de filas y columnas, barra de fórmulas interactiva
 * y persistencia automática de snapshots del libro de trabajo.
 */
@Component({
  selector: 'app-sheet-block',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="univer-sheet-block" [class.reading-mode]="notesService.isReadingMode()">
      @if (!notesService.isReadingMode()) {
        <div class="sheet-header-badge">
          <span class="badge-icon">📊</span>
          <span class="badge-title">
            {{ i18n.currentLang() === 'es' ? 'Hoja de Cálculo Univer' : 'Univer Spreadsheet' }}
          </span>
          <span class="badge-subtitle">
            {{ i18n.currentLang() === 'es' ? 'Cálculos matemáticos reales en vivo' : 'Live real-time formulas & computing' }}
          </span>
        </div>
      }

      <div
        class="sheet-container-wrapper"
        [style.height.px]="notesService.isReadingMode() ? readingHeight() : 440"
      >
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
        transition: height 0.18s ease;
      }
      .univer-container {
        width: 100%;
        height: 100%;
        position: relative;
      }
      /* Modo Lectura: Ocultar barra superior (Start, Formulas, View), barra de fórmulas y pie preservando el canvas de celdas */
      .univer-sheet-block.reading-mode {
        box-shadow: none;
        margin: 6px 0;
      }
      /* Ocultar barra superior / ribbon (Start, Formulas, View, etc.) */
      ::ng-deep .univer-sheet-block.reading-mode header[data-u-comp='headerbar'],
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='toolbar'],
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='headerbar'],
      ::ng-deep .univer-sheet-block.reading-mode .univer-toolbar {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
      /* Barra de fórmulas: Colapsar a 0 sin romper el layout grid del canvas */
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] {
        grid-template-rows: 0px 1fr !important;
      }
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] > header,
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='formula-bar'] {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        overflow: hidden !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* Garantizar que el contenedor del canvas tome todo el ancho (100%) y alto disponible */
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] > section,
      ::ng-deep .univer-sheet-block.reading-mode [data-range-selector='true'] {
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        display: block !important;
        visibility: visible !important;
      }
      /* Ocultar pie de página (tabs de hojas, zoom, etc.) en modo lectura */
      ::ng-deep .univer-sheet-block.reading-mode footer,
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='footer'] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
      /* Garantizar que el canvas de dibujo de Univer y sus celdas permanezcan visibles */
      ::ng-deep .univer-sheet-block.reading-mode canvas[data-u-comp='render-canvas'],
      ::ng-deep .univer-sheet-block.reading-mode canvas {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
    `,
  ],
})
export class SheetBlockComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild('sheetContainer', { static: true })
  sheetContainer!: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly readingHeight = signal<number>(180);

  private univerInstance: any = null;
  private univerAPI: any = null;
  private saveTimeout: any = null;
  private commandSubscription: any = null;

  constructor() {
    this.updateReadingHeight();
    effect(() => {
      // Registrar la dependencia reactiva del modo lectura
      const isReading = this.notesService.isReadingMode();
      this.updateReadingHeight();
      // Notificar a Univer y al navegador para recalcular dimensiones de canvas
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 150);
    });
  }

  ngAfterViewInit(): void {
    this.initUniver();
    this.updateReadingHeight();
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  /**
   * Determina cuántas filas con contenido real existen en la hoja de cálculo.
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
        if (cellData && typeof cellData === 'object') {
          const rowKeys = Object.keys(cellData);
          const validRows = rowKeys.filter((r) => {
            const row = cellData[r];
            return (
              row &&
              Object.values(row).some(
                (c: any) => c?.v !== undefined && c?.v !== null && c?.v !== ''
              )
            );
          });
          if (validRows.length > 0) {
            return Math.max(...validRows.map(Number)) + 1;
          }
        }
      }
    } catch (e) {}

    return 5;
  }

  /**
   * Calcula y actualiza la altura exacta necesaria para mostrar únicamente las celdas con datos.
   */
  updateReadingHeight(): void {
    const rows = this.getOccupiedRowsCount();
    // 26px cabecera de columnas (A, B, C...) + 24px por fila de datos + 22px margen y bordes
    const calculated = 26 + rows * 24 + 22;
    // Acotar entre 110px y 520px (con scroll si excede)
    const clamped = Math.min(Math.max(calculated, 110), 520);
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
          // Comparar si las celdas o estructura de las hojas sufrieron modificaciones reales
          const currentString = JSON.stringify(snapshot?.sheets || snapshot);
          if (currentString === this.lastSavedSnapshotString) {
            return; // Solo fue un desplazamiento (scroll), zoom o cambio de celda activa
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
