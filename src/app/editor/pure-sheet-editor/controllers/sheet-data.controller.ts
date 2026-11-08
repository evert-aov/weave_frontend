import type { SheetEditorHooks } from './sheet-editor-hooks';
import { computed } from '@angular/core';
import { CellData, SheetGrid } from '../models/excel.model';
import { cycleFormulaRefAtCursor, evaluateCellValue, getSpillRegions, generateSmartFillSeries, getCellId, parseCellId, shiftFormulaReferences } from '../services/formula-engine.service';
import { parseHtmlTableFromClipboard, parseTsvFromClipboard, serializeRangeToClipboard, writeToSystemClipboard } from '../services/clipboard.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetDataControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'cancelCellEdit'
  | 'cellEditorInput'
  | 'editingValue'
  | 'editorNotice'
  | 'fillSourceRange'
  | 'fillTargetRange'
  | 'filtersEnabled'
  | 'formulaBarInput'
  | 'i18n'
  | 'isEditing'
  | 'isFillDragging'
  | 'normalizedRange'
  | 'scheduleAutoSave'
  | 'selectedCell'
  | 'selectionRange'
  | 'updateCurrentGrid'>;
type SheetDataControllerHooks = Pick<SheetEditorHooks,
  | 'calculationCache'
  | 'pushUndoSnapshot'>;

/** Data behavior scoped to one editor instance. */
export class SheetDataController {
  constructor(private readonly editor: SheetDataControllerHost, private readonly hooks: SheetDataControllerHooks) {}

  startFillDrag(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.editor.isFillDragging = true;
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.editor.fillSourceRange = {
      startCol: minCol,
      startRow: minRow,
      endCol: maxCol,
      endRow: maxRow,
    };
    this.editor.fillTargetRange = { ...this.editor.fillSourceRange };
  }

  executeSmartFill(): void {
    if (!this.editor.fillSourceRange || !this.editor.fillTargetRange) return;
    const src = this.editor.fillSourceRange;
    const tgt = this.editor.fillTargetRange;

    const extraRows = tgt.endRow - src.endRow;
    const extraCols = tgt.endCol - src.endCol;

    if (extraRows <= 0 && extraCols <= 0) return;

    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };

      if (extraRows > 0) {
        for (let c = src.startCol; c <= src.endCol; c++) {
          const seedCells: CellData[] = [];
          for (let r = src.startRow; r <= src.endRow; r++) {
            seedCells.push(prev[getCellId(c, r)] || { raw: '' });
          }
          const generated = generateSmartFillSeries(seedCells, extraRows, 'down');
          generated.forEach((cellData, idx) => {
            const targetRow = src.endRow + 1 + idx;
            next[getCellId(c, targetRow)] = cellData;
          });
        }
      } else if (extraCols > 0) {
        for (let r = src.startRow; r <= src.endRow; r++) {
          const seedCells: CellData[] = [];
          for (let c = src.startCol; c <= src.endCol; c++) {
            seedCells.push(prev[getCellId(c, r)] || { raw: '' });
          }
          const generated = generateSmartFillSeries(seedCells, extraCols, 'right');
          generated.forEach((cellData, idx) => {
            const targetCol = src.endCol + 1 + idx;
            next[getCellId(targetCol, r)] = cellData;
          });
        }
      }

      return next;
    });
  }

  handleFillDown(): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      if (maxRow > minRow) {
        for (let c = minCol; c <= maxCol; c++) {
          const sourceId = getCellId(c, minRow);
          const sourceCell = prev[sourceId] || { raw: '' };
          for (let r = minRow + 1; r <= maxRow; r++) {
            const targetId = getCellId(c, r);
            const rowOffset = r - minRow;
            const shiftedRaw = shiftFormulaReferences(sourceCell.raw, 0, rowOffset);
            next[targetId] = {
              raw: shiftedRaw,
              style: sourceCell.style ? { ...sourceCell.style } : undefined,
            };
          }
        }
      } else if (minRow > 0) {
        for (let c = minCol; c <= maxCol; c++) {
          const sourceId = getCellId(c, minRow - 1);
          const sourceCell = prev[sourceId] || { raw: '' };
          const targetId = getCellId(c, minRow);
          const shiftedRaw = shiftFormulaReferences(sourceCell.raw, 0, 1);
          next[targetId] = {
            raw: shiftedRaw,
            style: sourceCell.style ? { ...sourceCell.style } : undefined,
          };
        }
      }
      return next;
    });
  }

  handleFillRight(): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      if (maxCol > minCol) {
        for (let r = minRow; r <= maxRow; r++) {
          const sourceId = getCellId(minCol, r);
          const sourceCell = prev[sourceId] || { raw: '' };
          for (let c = minCol + 1; c <= maxCol; c++) {
            const targetId = getCellId(c, r);
            const colOffset = c - minCol;
            const shiftedRaw = shiftFormulaReferences(sourceCell.raw, colOffset, 0);
            next[targetId] = {
              raw: shiftedRaw,
              style: sourceCell.style ? { ...sourceCell.style } : undefined,
            };
          }
        }
      } else if (minCol > 0) {
        for (let r = minRow; r <= maxRow; r++) {
          const sourceId = getCellId(minCol - 1, r);
          const sourceCell = prev[sourceId] || { raw: '' };
          const targetId = getCellId(minCol, r);
          const shiftedRaw = shiftFormulaReferences(sourceCell.raw, 1, 0);
          next[targetId] = {
            raw: shiftedRaw,
            style: sourceCell.style ? { ...sourceCell.style } : undefined,
          };
        }
      }
      return next;
    });
  }

  handleCycleF4(): void {
    if (this.editor.isEditing) {
      const input = this.editor.cellEditorInput?.nativeElement;
      const pos = input?.selectionStart ?? null;
      const { formula, newCursorPos } = cycleFormulaRefAtCursor(this.editor.editingValue, pos);
      this.editor.editingValue = formula;
      setTimeout(() => input?.setSelectionRange(newCursorPos, newCursorPos), 0);
    } else {
      const cellId = getCellId(this.editor.selectedCell.col, this.editor.selectedCell.row);
      const raw = this.editor.activeSheet.data[cellId]?.raw || '';
      if (raw.startsWith('=')) {
        const { formula } = cycleFormulaRefAtCursor(raw, null);
        this.editor.updateCurrentGrid((prev) => ({
          ...prev,
          [cellId]: { ...(prev[cellId] || { raw: '' }), raw: formula },
        }));
      }
    }
  }

  async handleCopy(): Promise<void> {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    const { tsv, html } = serializeRangeToClipboard(this.editor.activeSheet.data, minCol, maxCol, minRow, maxRow);
    await writeToSystemClipboard(tsv, html);
  }

  async handleCut(): Promise<void> {
    await this.handleCopy();
    this.handleClearContent();
  }

  onGridPaste(event: ClipboardEvent): void {
    const target = event.target as HTMLElement | null;
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (input && target !== this.editor.cellEditorInput?.nativeElement && target !== this.editor.formulaBarInput?.nativeElement) return;
    if (target?.isContentEditable) return;
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html'), text = data.getData('text/plain');
    const table = parseHtmlTableFromClipboard(html);
    if (input && !table && !/[\t\r\n]/.test(text)) return;
    const matrix = table || parseTsvFromClipboard(text);
    if (!matrix.length) return;
    event.preventDefault(); event.stopPropagation();
    this.applyPastedCells(matrix);
  }

  private canReplaceSpillRange(startCol: number, startRow: number, endCol: number, endRow: number): boolean {
    const grid = this.editor.activeSheet.data;
    for (const spill of getSpillRegions(grid, this.hooks.calculationCache)) {
      const owner = parseCellId(spill.owner);
      if (!owner) continue;
      if (owner.col > endCol || owner.col + spill.cols - 1 < startCol || owner.row > endRow || owner.row + spill.rows - 1 < startRow) continue;
      if (owner.col < startCol || owner.col > endCol || owner.row < startRow || owner.row > endRow) { this.editor.editorNotice = this.editor.i18n.t('excel.spill.edit_anchor', { cell: spill.owner }); return false; }
    }
    return true;
  }

  applyPastedCells(matrix: CellData[][]): void {
    if (!matrix.length) return;
    const startCol = this.editor.selectedCell.col, startRow = this.editor.selectedCell.row;
    if (!this.canReplaceSpillRange(startCol, startRow, startCol + Math.max(...matrix.map(row => row.length)) - 1, startRow + matrix.length - 1)) return;
    this.editor.cancelCellEdit();
    this.editor.updateCurrentGrid(previous => {
      const next = { ...previous };
      matrix.forEach((row, rowIndex) => row.forEach((cell, colIndex) => next[getCellId(startCol + colIndex, startRow + rowIndex)] = { ...cell, style: cell.style ? { ...cell.style } : undefined }));
      return next;
    });
    this.editor.selectionRange = { startCol, startRow, endCol: startCol + Math.max(...matrix.map(row => row.length)) - 1, endRow: startRow + matrix.length - 1 };
  }

  async handlePaste(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    if (navigator.clipboard.read) {
      try {
        for (const item of await navigator.clipboard.read()) {
          if (!item.types.includes('text/html')) continue;
          const table = parseHtmlTableFromClipboard(await (await item.getType('text/html')).text());
          if (table) { this.applyPastedCells(table); return; }
        }
      } catch { /* Native paste remains available when browser clipboard reads are restricted. */ }
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) this.applyPastedCells(parseTsvFromClipboard(text));
    } catch { /* Ctrl+V uses the native clipboard event and does not need clipboard read permission. */ }
  }

  handleClearContent(): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    if (!this.canReplaceSpillRange(minCol, minRow, maxCol, maxRow)) return;
    this.editor.updateCurrentGrid(prev => {
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const cell = parseCellId(id);
        if (cell && cell.col >= minCol && cell.col <= maxCol && cell.row >= minRow && cell.row <= maxRow) next[id] = { ...prev[id], raw: '' };
      }
      return next;
    });
  }

  handleAutoSum(func = 'SUMA'): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    const name = this.editor.i18n.currentLang() === 'es' ? func : func === 'SUMA' ? 'SUM' : func;
    const rangeStr = `${getCellId(minCol, minRow)}:${getCellId(maxCol, maxRow)}`;
    const formulaStr = `=${name}(${rangeStr})`;

    const targetRow = maxRow + 1;
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let c = minCol; c <= maxCol; c++) {
        const cRangeStr = `${getCellId(c, minRow)}:${getCellId(c, maxRow)}`;
        next[getCellId(c, targetRow)] = {
          raw: `=${name}(${cRangeStr})`,
          style: { bold: true },
        };
      }
      return next;
    });
    this.editor.selectedCell = { col: minCol, row: targetRow };
  }

  handleSortAsc(): void {
    this.sortRange('asc');
  }

  handleSortDesc(): void {
    this.sortRange('desc');
  }

  private sortRange(direction: 'asc' | 'desc'): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    if (minRow >= maxRow) return;

    const sortCol = this.editor.selectedCell.col;

    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      const rowsToSort: { row: number; val: string | number; cells: Record<number, CellData | undefined> }[] = [];

      for (let r = minRow; r <= maxRow; r++) {
        const val = evaluateCellValue(getCellId(sortCol, r), prev);
        const cells: Record<number, CellData | undefined> = {};
        for (let c = minCol; c <= maxCol; c++) {
          cells[c] = prev[getCellId(c, r)];
        }
        rowsToSort.push({ row: r, val, cells });
      }

      rowsToSort.sort((a, b) => {
        const aNum = Number(a.val);
        const bNum = Number(b.val);
        const bothNum = !isNaN(aNum) && !isNaN(bNum) && a.val !== '' && b.val !== '';

        if (bothNum) {
          return direction === 'asc' ? aNum - bNum : bNum - aNum;
        }
        const strA = String(a.val).toLowerCase();
        const strB = String(b.val).toLowerCase();
        return direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });

      rowsToSort.forEach((sortedRow, idx) => {
        const targetRow = minRow + idx;
        for (let c = minCol; c <= maxCol; c++) {
          const cell = sortedRow.cells[c];
          if (cell) {
            next[getCellId(c, targetRow)] = cell;
          } else {
            delete next[getCellId(c, targetRow)];
          }
        }
      });

      return next;
    });
  }

  handleInsertCheckbox(): void {
    this.hooks.pushUndoSnapshot();
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const id = getCellId(c, r);
          next[id] = { raw: 'FALSE', computed: 'FALSE' };
        }
      }
      return next;
    });
  }

  handleInsertRowAbove(): void {
    this.hooks.pushUndoSnapshot();
    const targetRow = this.editor.selectedCell.row;
    this.editor.updateCurrentGrid((prev) => {
      const next: SheetGrid = {};
      for (const [cellId, cell] of Object.entries(prev)) {
        const parsed = parseCellId(cellId);
        if (!parsed) continue;
        if (parsed.row >= targetRow) {
          next[getCellId(parsed.col, parsed.row + 1)] = cell;
        } else {
          next[cellId] = cell;
        }
      }
      return next;
    });
  }

  handleDeleteRow(): void {
    this.hooks.pushUndoSnapshot();
    const targetRow = this.editor.selectedCell.row;
    this.editor.updateCurrentGrid((prev) => {
      const next: SheetGrid = {};
      for (const [cellId, cell] of Object.entries(prev)) {
        const parsed = parseCellId(cellId);
        if (!parsed) continue;
        if (parsed.row === targetRow) {
          // row deleted
        } else if (parsed.row > targetRow) {
          next[getCellId(parsed.col, parsed.row - 1)] = cell;
        } else {
          next[cellId] = cell;
        }
      }
      return next;
    });
  }

  handleInsertColLeft(): void {
    this.hooks.pushUndoSnapshot();
    const targetCol = this.editor.selectedCell.col;
    this.editor.updateCurrentGrid((prev) => {
      const next: SheetGrid = {};
      for (const [cellId, cell] of Object.entries(prev)) {
        const parsed = parseCellId(cellId);
        if (!parsed) continue;
        if (parsed.col >= targetCol) {
          next[getCellId(parsed.col + 1, parsed.row)] = cell;
        } else {
          next[cellId] = cell;
        }
      }
      return next;
    });
  }

  handleDeleteCol(): void {
    this.hooks.pushUndoSnapshot();
    const targetCol = this.editor.selectedCell.col;
    this.editor.updateCurrentGrid((prev) => {
      const next: SheetGrid = {};
      for (const [cellId, cell] of Object.entries(prev)) {
        const parsed = parseCellId(cellId);
        if (!parsed) continue;
        if (parsed.col === targetCol) {
          // col deleted
        } else if (parsed.col > targetCol) {
          next[getCellId(parsed.col - 1, parsed.row)] = cell;
        } else {
          next[cellId] = cell;
        }
      }
      return next;
    });
  }

  handleApplySort(direction: 'asc' | 'desc'): void {
    this.sortRange(direction);
  }

  handleToggleFilter(): void {
    this.editor.filtersEnabled = !this.editor.filtersEnabled;
    this.editor.scheduleAutoSave();
  }
}
