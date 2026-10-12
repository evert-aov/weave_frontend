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
  template: `
    <div class="univer-sheet-block" [class.reading-mode]="notesService.isReadingMode()">
      <!-- Barra superior de información del bloque -->
      <div class="sheet-toolbar-strip" [class.reading-mode]="notesService.isReadingMode()">
        <div class="sheet-info-group">
          <span class="badge-icon">📊</span>
          <span class="badge-title">
            {{ i18n.currentLang() === 'es' ? 'Hoja de Cálculo' : 'Spreadsheet' }}
          </span>
          @if (!notesService.isReadingMode()) {
            <span class="badge-subtitle">
              {{ i18n.currentLang() === 'es' ? 'Cálculos matemáticos reales en vivo' : 'Live real-time formulas & computing' }}
            </span>
          }
        </div>
      </div>

      <div
        class="sheet-container-wrapper"
        [style.height.px]="notesService.isReadingMode() ? readingHeight() : 460"
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
        transition: border-color 0.15s ease;
      }
      .sheet-toolbar-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px;
        background: var(--panel);
        border-bottom: 1px solid var(--border);
        font-size: 11.5px;
        user-select: none;
      }
      .sheet-toolbar-strip.reading-mode {
        padding: 4px 12px;
        background: color-mix(in srgb, var(--panel) 75%, transparent);
        font-size: 11px;
      }
      .sheet-info-group {
        display: flex;
        align-items: center;
        gap: 8px;
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
      .sheet-zoom-controls {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 4px;
      }
      .zoom-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .zoom-btn:hover {
        background: var(--soft);
        color: var(--text);
      }
      .zoom-btn:active {
        transform: scale(0.92);
      }
      .zoom-display-btn {
        padding: 1px 6px;
        border: none;
        background: transparent;
        color: var(--text);
        font-size: 10.5px;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.12s ease;
      }
      .zoom-display-btn:hover {
        background: var(--soft);
        color: var(--accent);
      }
      .sheet-container-wrapper {
        position: relative;
        width: 100%;
        background: var(--bg);
        overflow: hidden;
        transition: height 0.18s ease;
      }
      .univer-container {
        width: 100%;
        height: 100%;
        position: relative;
      }
      /* Modo Lectura: Ocultar barras de herramientas, fórmulas y pies de Univer */
      .univer-sheet-block.reading-mode {
        box-shadow: none;
        margin: 6px 0;
      }
      ::ng-deep .univer-sheet-block.reading-mode header[data-u-comp='headerbar'],
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='toolbar'],
      ::ng-deep .univer-sheet-block.reading-mode .univer-toolbar {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] {
        grid-template-rows: 0px 1fr !important;
      }
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] > header,
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='formula-bar'] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      ::ng-deep .univer-sheet-block.reading-mode section.univer-grid-rows-\[auto_1fr\] > section,
      ::ng-deep .univer-sheet-block.reading-mode [data-range-selector='true'] {
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        display: block !important;
        visibility: visible !important;
      }
      ::ng-deep .univer-sheet-block.reading-mode footer,
      ::ng-deep .univer-sheet-block.reading-mode [data-u-comp='footer'] {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
      }
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

  readonly readingHeight = signal<number>(160);

  private univerInstance: any = null;
  private univerAPI: any = null;
  private saveTimeout: any = null;
  private commandSubscription: any = null;

  constructor() {
    this.updateReadingHeight();
    effect(() => {
      const isReading = this.notesService.isReadingMode();
      this.updateHeadersVisibility(isReading);
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
      window.dispatchEvent(new Event('resize'));
    }, 120);
  }

  /**
   * Oculta o muestra los nombres de columnas (A, B, C...) y números de filas (1, 2, 3...)
   * según si se encuentra en modo lectura o edición.
   */
  updateHeadersVisibility(isReading: boolean): void {
    try {
      if (this.univerAPI) {
        const activeWorkbook = this.univerAPI.getActiveWorkbook?.();
        const activeSheet = activeWorkbook?.getActiveSheet?.();
        if (activeSheet) {
          if (typeof activeSheet.setRowHeaderWidth === 'function') {
            activeSheet.setRowHeaderWidth(isReading ? 0 : 46);
          }
          if (typeof activeSheet.setColumnHeaderHeight === 'function') {
            activeSheet.setColumnHeaderHeight(isReading ? 0 : 24);
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
    const isReading = this.notesService.isReadingMode();
    const headerHeight = isReading ? 0 : 26;
    const basePadding = 18;
    const calculated = headerHeight + rows * 24 + basePadding;
    const clamped = Math.min(Math.max(calculated, 90), 560);
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
