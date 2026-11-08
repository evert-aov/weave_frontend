import type { SheetEditorHooks } from './sheet-editor-hooks';
import { prepareImportedWorkbook } from '../services/workbook-import';
import { PageLayoutConfig, Sheet, SheetGrid } from '../models/excel.model';
import { SAMPLE_BUSINESS_DATA } from '../constants/excel.constants';
import { bindWorkbookFormulaContext, findWorksheetReferences, formatWorksheetReference, evaluateCellValue, evaluateCellValueCached, FormulaCalculationCache, getCellId, parseCellId } from '../services/formula-engine.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetWorkbookControllerHost = Pick<PureSheetEditorComponent,
  | 'activeRibbonTab'
  | 'activeSheet'
  | 'activeSheetId'
  | 'commitCellEdit'
  | 'i18n'
  | 'inkLayer'
  | 'normalizedRange'
  | 'note'
  | 'notesService'
  | 'referenceTrace'
  | 'selectedArtworkId'
  | 'selectedCell'
  | 'selectedChart'
  | 'selectedChartId'
  | 'selectionRange'
  | 'sheets'
  | 'xlsxBusy'
  | 'xlsxFailed'
  | 'xlsxNotice'>;
type SheetWorkbookControllerHooks = Pick<SheetEditorHooks,
  | 'isDestroyed'
  | 'stopInkReplay'
  | 'viewChanges'>;

/** Workbook behavior scoped to one editor instance. */
export class SheetWorkbookController {
  constructor(private readonly editor: SheetWorkbookControllerHost, private readonly hooks: SheetWorkbookControllerHooks) {}

  private undoStack: string[] = [];

  private redoStack: string[] = [];

  saveTimeout: ReturnType<typeof setTimeout> | null = null;

  loadedNoteId: string | null = null;

  private registeredSheets?: Sheet[];

  private registeredGrids: SheetGrid[] = [];

  private registeredNames: string[] = [];

  private registeredMetadata: unknown[][] = [];

  calculationCache: FormulaCalculationCache = new WeakMap();

  private workbookRevision = 0;

  ensureWorkbookContext(): void {
    if (this.registeredSheets === this.editor.sheets && this.registeredGrids.length === this.editor.sheets.length && this.editor.sheets.every((sheet, index) => sheet.data === this.registeredGrids[index] && sheet.name === this.registeredNames[index] && sheet.definedNames === this.registeredMetadata[index]?.[0] && sheet.workbookNames === this.registeredMetadata[index]?.[1] && sheet.tables === this.registeredMetadata[index]?.[2])) return;
    this.registeredMetadata = this.editor.sheets.map(s => [s.definedNames, s.workbookNames, s.tables]);
    this.calculationCache = new WeakMap(); this.registeredNames = this.editor.sheets.map(sheet => sheet.name);
    bindWorkbookFormulaContext(this.editor.sheets); this.registeredSheets = this.editor.sheets; this.registeredGrids = this.editor.sheets.map(sheet => sheet.data); this.workbookRevision++;
  }

  get formulaWorkbookRevision(): number { this.ensureWorkbookContext(); return this.workbookRevision; }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private statsKey = '';

  private statsValue = { average: '-', count: 0, numCount: 0, min: '-', max: '-', sum: '-' };

  get selectionStats() {
    const range = this.editor.normalizedRange;
    const key = `${this.editor.activeSheetId}:${this.formulaWorkbookRevision}:${range.minCol}:${range.maxCol}:${range.minRow}:${range.maxRow}`;
    if (key !== this.statsKey) { this.statsValue = this.computeSelectionStats(); this.statsKey = key; }
    return this.statsValue;
  }

  private computeSelectionStats(): { average: string; count: number; numCount: number; min: string; max: string; sum: string } {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    const nums: number[] = [];
    let count = 0;

    const grid = this.editor.activeSheet.data;
    const add = (id: string) => {
      const val = evaluateCellValueCached(id, grid, this.calculationCache);
      if (val !== '' && val !== null && val !== undefined) {
        count++; const num = Number(val); if (!isNaN(num)) nums.push(num);
      }
    };
    if ((maxRow - minRow + 1) * (maxCol - minCol + 1) <= 1000) {
      for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) add(getCellId(c, r));
    } else {
      for (const id of Object.keys(grid)) {
        const cell = parseCellId(id);
        if (cell && cell.col >= minCol && cell.col <= maxCol && cell.row >= minRow && cell.row <= maxRow) add(id);
      }
    }

    if (nums.length === 0) {
      return { average: '-', count, numCount: 0, min: '-', max: '-', sum: '-' };
    }

    const sumVal = nums.reduce((acc, n) => acc + n, 0);
    const avgVal = sumVal / nums.length;
    const minVal = nums.reduce((min, n) => Math.min(min, n), Infinity);
    const maxVal = nums.reduce((max, n) => Math.max(max, n), -Infinity);

    return {
      average: avgVal.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      count,
      numCount: nums.length,
      min: minVal.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      max: maxVal.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      sum: sumVal.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    };
  }

  loadNoteData(): void {
    const doc = this.editor.note?.docData;
    if (doc && Array.isArray(doc.sheets) && doc.sheets.length > 0) {
      this.editor.sheets = JSON.parse(JSON.stringify(doc.sheets));
      this.editor.activeSheetId = doc.activeSheetId || this.editor.sheets[0].id;
    } else if (doc && typeof doc === 'object' && doc.data) {
      // Single grid doc
      this.editor.sheets = [{ id: 'sheet1', name: 'Sheet1', type: 'grid', data: doc.data }];
      this.editor.activeSheetId = 'sheet1';
    } else {
      // Initial default sheets with sample business data
      this.editor.sheets = [
        {
          id: 'sheet1',
          name: 'Sheet1',
          type: 'grid',
          data: { ...SAMPLE_BUSINESS_DATA },
          pageLayout: {
            theme: 'office',
            margins: 'normal',
            orientation: 'portrait',
            size: 'letter',
            widthPages: 'Automatic',
            heightPages: 'Automatic',
            scale: 100,
            gridlinesPrint: true,
            headingsPrint: true,
          },
        },
        {
          id: 'chart1',
          name: 'Chart1',
          type: 'chart',
          data: {},
        },
      ];
      this.editor.activeSheetId = 'sheet1';
    }
    this.undoStack = [];
    this.redoStack = [];
  }

  pushUndoSnapshot(): void {
    const snap = JSON.stringify({ sheets: this.editor.sheets, activeSheetId: this.editor.activeSheetId });
    this.undoStack.push(snap);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  handleUndo(): void {
    if (!this.canUndo) return;
    const current = JSON.stringify({ sheets: this.editor.sheets, activeSheetId: this.editor.activeSheetId });
    this.redoStack.push(current);
    const prevSnap = this.undoStack.pop()!;
    const state = JSON.parse(prevSnap);
    this.editor.sheets = state.sheets;
    this.editor.activeSheetId = state.activeSheetId;
    if (!this.editor.selectedChart) this.editor.selectedChartId = null;
    this.scheduleAutoSave();
  }

  handleRedo(): void {
    if (!this.canRedo) return;
    const current = JSON.stringify({ sheets: this.editor.sheets, activeSheetId: this.editor.activeSheetId });
    this.undoStack.push(current);
    const nextSnap = this.redoStack.pop()!;
    const state = JSON.parse(nextSnap);
    this.editor.sheets = state.sheets;
    this.editor.activeSheetId = state.activeSheetId;
    if (!this.editor.selectedChart) this.editor.selectedChartId = null;
    this.scheduleAutoSave();
  }

  scheduleAutoSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      if (!this.hooks.isDestroyed && this.editor.note?._id) {
        this.editor.notesService.updateDocData(
          {
            sheets: this.editor.sheets,
            activeSheetId: this.editor.activeSheetId,
          },
          this.editor.note._id
        );
      }
    }, 400);
  }

  updateCurrentGrid(mutator: (grid: SheetGrid) => SheetGrid): void {
    this.pushUndoSnapshot();
    const sheet = this.editor.activeSheet;
    sheet.data = mutator(sheet.data);
    this.scheduleAutoSave();
  }

  addNewSheet(): void {
    this.pushUndoSnapshot();
    const num = this.editor.sheets.filter((s) => s.type === 'grid').length + 1;
    const newSheet: Sheet = {
      id: `sheet-${Date.now()}`,
      name: `Sheet${num}`,
      type: 'grid',
      data: {},
      colWidths: {},
      rowHeights: {},
    };
    this.editor.sheets.push(newSheet);
    this.editor.activeSheetId = newSheet.id;
    this.scheduleAutoSave();
  }

  addNewChartSheet(): void {
    this.pushUndoSnapshot();
    const num = this.editor.sheets.filter((s) => s.type === 'chart').length + 1;
    const newSheet: Sheet = {
      id: `chart-${crypto.randomUUID()}`,
      name: `Chart${num}`,
      type: 'chart',
      data: {},
    };
    this.editor.sheets.push(newSheet);
    this.editor.activeSheetId = newSheet.id;
    this.scheduleAutoSave();
  }

  onSheetNameKeyDown(event: KeyboardEvent, sheet: Sheet): void {
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      if (event.key === 'Escape') element.textContent = sheet.name;
      element.blur();
    }
  }

  finishSheetRename(sheet: Sheet, event: FocusEvent): void {
    const element = event.currentTarget as HTMLElement;
    this.renameSheet(sheet, element.textContent || '');
    element.textContent = sheet.name;
  }

  renameSheet(sheet: Sheet, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === sheet.name) return;
    this.editor.commitCellEdit();
    this.pushUndoSnapshot();
    const oldName = sheet.name;
    for (const target of this.editor.sheets) {
      let next: SheetGrid | undefined;
      for (const [id, cell] of Object.entries(target.data)) {
        if (!cell.raw.startsWith('=')) continue;
        let formula = cell.raw;
        for (const ref of findWorksheetReferences(cell.raw).reverse()) {
          if (ref.sheetName?.toLowerCase() !== oldName.toLowerCase()) continue;
          formula = formula.slice(0, ref.index) + formatWorksheetReference(trimmed, ref.start + (ref.end ? ':' + ref.end : '')) + formula.slice(ref.index + ref.token.length);
        }
        if (formula !== cell.raw) { next ||= { ...target.data }; next[id] = { ...cell, raw: formula }; }
      }
      if (next) target.data = next;
      for (const key of ['definedNames', 'workbookNames'] as const) if (target[key]) {
        target[key] = Object.fromEntries(Object.entries(target[key]!).map(([name, raw]) => {
          let formula = raw;
          for (const ref of findWorksheetReferences(raw).reverse()) if (ref.sheetName?.toLowerCase() === oldName.toLowerCase()) formula = formula.slice(0, ref.index) + formatWorksheetReference(trimmed, ref.start + (ref.end ? ':' + ref.end : '')) + formula.slice(ref.index + ref.token.length);
          return [name, formula];
        }));
      }
    }
    sheet.name = trimmed; this.editor.referenceTrace = null;
    this.scheduleAutoSave();
  }

  deleteSheet(sheetId: string): void {
    if (this.editor.sheets.length <= 1) return;
    this.pushUndoSnapshot();
    this.editor.sheets = this.editor.sheets.filter((s) => s.id !== sheetId); this.editor.referenceTrace = null;
    if (this.editor.activeSheetId === sheetId) {
      this.editor.activeSheetId = this.editor.sheets[0].id;
    }
    this.scheduleAutoSave();
  }

  loadSampleBusinessData(): void {
    this.pushUndoSnapshot();
    const sheet1 = this.editor.sheets.find((s) => s.type === 'grid');
    if (sheet1) {
      sheet1.data = { ...sheet1.data, ...SAMPLE_BUSINESS_DATA };
    }
    this.scheduleAutoSave();
  }

  async importXlsxFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file || this.editor.xlsxBusy) return;
    this.editor.xlsxFailed = false; this.editor.xlsxNotice = '';
    if (!/\.xlsx$/i.test(file.name) || file.size > 25 * 1024 * 1024) {
      this.editor.xlsxFailed = true; this.editor.xlsxNotice = this.editor.i18n.t('excel.xlsx.size'); return;
    }
    this.editor.commitCellEdit(); this.editor.xlsxBusy = true;
    const noteId = this.editor.note?._id;
    try {
      const { importXlsxWorkbook } = await import('../services/xlsx-import');
      const sheets = await importXlsxWorkbook(await file.arrayBuffer(), this.editor.sheets.map(sheet => sheet.name));
      if (this.hooks.isDestroyed || this.editor.note?._id !== noteId) return;
      this.pushUndoSnapshot(); this.hooks.stopInkReplay(); this.editor.inkLayer?.clearSelection();
      this.editor.sheets[0].workbookNames = prepareImportedWorkbook(sheets, this.editor.sheets);
      this.editor.sheets = [...this.editor.sheets, ...sheets]; this.editor.activeSheetId = sheets[0].id;
      this.editor.selectedChartId = null; this.editor.selectedArtworkId = null; this.editor.referenceTrace = null;
      this.editor.selectedCell = { col: 0, row: 0 };
      this.editor.selectionRange = { startCol: 0, endCol: 0, startRow: 0, endRow: 0 };
      this.editor.activeRibbonTab = 'Home'; this.scheduleAutoSave();
      this.editor.xlsxNotice = this.editor.i18n.t('excel.xlsx.imported', { sheets: sheets.length, charts: sheets[0].xlsxImportReport?.chartsImported || 0, skipped: sheets[0].xlsxImportReport?.chartsSkipped || 0 });
    } catch {
      this.editor.xlsxFailed = true; this.editor.xlsxNotice = this.editor.i18n.t('excel.xlsx.failed_import');
    } finally { this.editor.xlsxBusy = false; this.hooks.viewChanges?.markForCheck(); }
  }

  async exportXlsxFile(): Promise<void> {
    if (this.editor.xlsxBusy) return;
    this.editor.commitCellEdit(); this.editor.xlsxBusy = true; this.editor.xlsxFailed = false; this.editor.xlsxNotice = '';
    const sheets = JSON.parse(JSON.stringify(this.editor.sheets)) as Sheet[];
    const filename = (this.editor.note.title || 'Libro').replace(/[\\/:*?"<>|]/g, '_');
    try {
      const { writeXlsx } = await import('../services/xlsx.service');
      const bytes = await writeXlsx(sheets);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.editor.xlsxNotice = this.editor.i18n.t('excel.xlsx.exported');
    } catch {
      this.editor.xlsxFailed = true; this.editor.xlsxNotice = this.editor.i18n.t('excel.xlsx.failed_export');
    } finally { this.editor.xlsxBusy = false; this.hooks.viewChanges?.markForCheck(); }
  }

  exportCsv(): void {
    const sheet = this.editor.activeSheet;
    let maxCol = 0;
    let maxRow = 0;
    for (const cellId of Object.keys(sheet.data)) {
      const parsed = parseCellId(cellId);
      if (parsed) {
        if (parsed.col > maxCol) maxCol = parsed.col;
        if (parsed.row > maxRow) maxRow = parsed.row;
      }
    }
    maxCol = Math.max(maxCol, 5);
    maxRow = Math.max(maxRow, 10);

    const rows: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const rowVals: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const val = evaluateCellValue(getCellId(c, r), sheet.data);
        const str = String(val ?? '').replace(/"/g, '""');
        rowVals.push(str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str);
      }
      rows.push(rowVals.join(','));
    }

    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.editor.note.title || 'Hoja_de_calculo'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  handleUpdatePageLayout(layout: Partial<PageLayoutConfig>): void {
    this.pushUndoSnapshot();
    this.editor.activeSheet.pageLayout = {
      ...(this.editor.activeSheet.pageLayout || {
        theme: 'office',
        margins: 'normal',
        orientation: 'portrait',
        size: 'letter',
        widthPages: 'Automatic',
        heightPages: 'Automatic',
        scale: 100,
        gridlinesPrint: true,
        headingsPrint: true,
      }),
      ...layout,
    };
    this.scheduleAutoSave();
  }

  handleSetPrintAreaFromSelection(): void {
    const minCol = Math.min(this.editor.selectionRange.startCol, this.editor.selectionRange.endCol);
    const maxCol = Math.max(this.editor.selectionRange.startCol, this.editor.selectionRange.endCol);
    const minRow = Math.min(this.editor.selectionRange.startRow, this.editor.selectionRange.endRow);
    const maxRow = Math.max(this.editor.selectionRange.startRow, this.editor.selectionRange.endRow);
    this.handleUpdatePageLayout({
      printArea: { startCol: minCol, startRow: minRow, endCol: maxCol, endRow: maxRow },
    });
  }

  handleClearPrintArea(): void {
    this.handleUpdatePageLayout({ printArea: null });
  }

  handleSetFreezePanes(cfg: { rows: number; cols: number }): void {
    this.pushUndoSnapshot();
    this.editor.activeSheet.freezePanes = cfg;
    this.scheduleAutoSave();
  }

  handleUnfreezePanes(): void {
    this.pushUndoSnapshot();
    this.editor.activeSheet.freezePanes = { rows: 0, cols: 0 };
    this.scheduleAutoSave();
  }
}
