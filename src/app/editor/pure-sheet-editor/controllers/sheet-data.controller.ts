import type { SheetEditorHooks } from './sheet-editor-hooks';
import { computed } from '@angular/core';
import { CellData, MergeRegion, PasteSpecialMode, SheetGrid } from '../models/excel.model';
import { cycleFormulaRefAtCursor, evaluateCellValue, evaluateCellValueCached, getSpillRegions, generateSmartFillSeries, getCellId, parseCellId, shiftFormulaReferences } from '../services/formula-engine.service';
import { cloneCellData, cloneCellStyle, parseHtmlTableFromClipboard, parseTsvFromClipboard, serializeRangeToClipboard, writeToSystemClipboard } from '../services/clipboard.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetDataControllerHost = Pick<PureSheetEditorComponent,
  | 'activeSheet'
  | 'cancelCellEdit'
  | 'cellEditorInput'
  | 'clipboard'
  | 'editingValue'
  | 'editorNotice'
  | 'fillSourceRange'
  | 'fillTargetRange'
  | 'filtersEnabled'
  | 'formulaBarInput'
  | 'gridContainer'
  | 'guardEditableCell'
  | 'guardEditableRange'
  | 'i18n'
  | 'isEditing'
  | 'isFillDragging'
  | 'normalizedRange'
  | 'scheduleAutoSave'
  | 'selectedCell'
  | 'selectionRange'
  | 'sheets'
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
    if (!this.editor.guardEditableRange(tgt.startCol, tgt.endCol, tgt.startRow, tgt.endRow)) return;

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
    if (!this.editor.guardEditableRange(minCol, maxCol, maxRow > minRow ? minRow + 1 : minRow, maxRow)) return;
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
    if (!this.editor.guardEditableRange(maxCol > minCol ? minCol + 1 : minCol, maxCol, minRow, maxRow)) return;
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

  async handleCopy(mode: 'copy' | 'cut' = 'copy'): Promise<void> {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    const grid = this.editor.activeSheet.data;
    const { tsv, html } = serializeRangeToClipboard(grid, minCol, maxCol, minRow, maxRow);

    const totalCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    if (totalCells <= 100000) {
      const cells: CellData[][] = [];
      for (let r = minRow; r <= maxRow; r++) {
        const rowCells: CellData[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          const cell = grid[getCellId(c, r)];
          rowCells.push(cell ? cloneCellData(cell) : { raw: '' });
        }
        cells.push(rowCells);
      }

      const merges = (this.editor.activeSheet.merges || [])
        .filter(m => m.startCol >= minCol && m.endCol <= maxCol && m.startRow >= minRow && m.endRow <= maxRow)
        .map(m => ({
          startCol: m.startCol - minCol,
          startRow: m.startRow - minRow,
          endCol: m.endCol - minCol,
          endRow: m.endRow - minRow,
        }));

      this.editor.clipboard.setInternalMatrix({
        mode,
        sheetId: this.editor.activeSheet.id,
        range: { minCol, maxCol, minRow, maxRow },
        cells,
        merges,
        tsvSignature: tsv,
      });
    }

    await writeToSystemClipboard(tsv, html);
  }

  async handleCut(): Promise<void> {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    if (!this.canReplaceSpillRange(minCol, minRow, maxCol, maxRow)) return;
    await this.handleCopy('cut');
    this.editor.updateCurrentGrid(prev => {
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const cell = parseCellId(id);
        if (cell && cell.col >= minCol && cell.col <= maxCol && cell.row >= minRow && cell.row <= maxRow) {
          delete next[id];
        }
      }
      return next;
    });
    if (this.editor.activeSheet.merges?.length) {
      this.editor.activeSheet.merges = this.editor.activeSheet.merges.filter(
        m => m.endCol < minCol || m.startCol > maxCol || m.endRow < minRow || m.startRow > maxRow
      );
    }
  }

  onGridPaste(event: ClipboardEvent): void {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (input && target !== this.editor.cellEditorInput?.nativeElement && target !== this.editor.formulaBarInput?.nativeElement) return;
    if (target?.isContentEditable) return;
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html'), text = data.getData('text/plain');
    const isWeaveHtml = html.includes('data-weave-sheet="1"');
    const internalMatch = (!html || isWeaveHtml) ? this.editor.clipboard.getMatchingInternalMatrix(text) : null;
    const table = parseHtmlTableFromClipboard(html);
    if (input && !internalMatch && !table && !/[\t\r\n]/.test(text)) return;

    if (internalMatch) {
      event.preventDefault(); event.stopPropagation();
      this.applyPastedCells(internalMatch.cells, internalMatch.merges);
      return;
    }

    this.editor.clipboard.clearIfExternalChange(text);
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

  applyPastedCells(matrix: CellData[][], merges?: MergeRegion[]): void {
    if (!matrix.length) return;
    const startCol = this.editor.selectedCell.col, startRow = this.editor.selectedCell.row;
    const width = Math.max(...matrix.map(row => row.length));
    const endCol = startCol + width - 1;
    const endRow = startRow + matrix.length - 1;
    if (!this.canReplaceSpillRange(startCol, startRow, endCol, endRow)) return;
    if (!this.editor.guardEditableRange(startCol, endCol, startRow, endRow)) return;
    this.editor.cancelCellEdit();
    if (merges?.length || this.editor.activeSheet.merges?.length) {
      const existingMerges = this.editor.activeSheet.merges || [];
      const retained = existingMerges.filter(
        m => m.endCol < startCol || m.startCol > endCol || m.endRow < startRow || m.startRow > endRow
      );
      const pastedMerges = (merges || []).map(m => ({
        startCol: startCol + m.startCol,
        startRow: startRow + m.startRow,
        endCol: startCol + m.endCol,
        endRow: startRow + m.endRow,
      }));
      if (pastedMerges.length || retained.length !== existingMerges.length) {
        this.editor.activeSheet.merges = [...retained, ...pastedMerges];
      }
    }
    this.editor.updateCurrentGrid(previous => {
      const next = { ...previous };
      matrix.forEach((row, rowIndex) => row.forEach((cell, colIndex) => next[getCellId(startCol + colIndex, startRow + rowIndex)] = cloneCellData(cell)));
      return next;
    });
    this.editor.selectionRange = { startCol, startRow, endCol, endRow };
    this.editor.gridContainer?.nativeElement?.focus({ preventScroll: true });
  }

  async handlePaste(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      const internal = this.editor.clipboard.getInternalMatrix();
      if (internal) this.applyPastedCells(internal.cells, internal.merges);
      return;
    }

    if (navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          let html = '';
          let plainText = '';
          if (item.types.includes('text/html')) {
            try {
              const htmlBlob = await item.getType('text/html');
              html = await htmlBlob.text();
            } catch {
              // Ignore HTML read failure and fall through to plain text
            }
          }
          if (item.types.includes('text/plain')) {
            try {
              const textBlob = await item.getType('text/plain');
              plainText = await textBlob.text();
            } catch {
              // Ignore text read failure
            }
          }

          const isWeaveHtml = html.includes('data-weave-sheet="1"');
          const internalMatch = (!html || isWeaveHtml) ? this.editor.clipboard.getMatchingInternalMatrix(plainText) : null;
          if (internalMatch) {
            this.applyPastedCells(internalMatch.cells, internalMatch.merges);
            return;
          }

          const table = html ? parseHtmlTableFromClipboard(html) : null;
          if (table && table.length > 0) {
            this.editor.clipboard.clearIfExternalChange(plainText);
            this.applyPastedCells(table);
            return;
          }

          if (plainText) {
            this.editor.clipboard.clearIfExternalChange(plainText);
            this.applyPastedCells(parseTsvFromClipboard(plainText));
            return;
          }
        }
      } catch {
        /* Async clipboard item reading failed or was denied; fall back to readText */
      }
    }

    if (navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        const internalMatch = this.editor.clipboard.getMatchingInternalMatrix(text);
        if (internalMatch) {
          this.applyPastedCells(internalMatch.cells, internalMatch.merges);
          return;
        }
        this.editor.clipboard.clearIfExternalChange(text);
        if (text) {
          this.applyPastedCells(parseTsvFromClipboard(text));
        }
        return;
      } catch {
        const internal = this.editor.clipboard.getInternalMatrix();
        if (internal) {
          this.applyPastedCells(internal.cells, internal.merges);
          return;
        }
        this.editor.editorNotice = 'Usa Ctrl+V para pegar (el navegador requiere acceso del teclado al portapapeles).';
        return;
      }
    }

    const internal = this.editor.clipboard.getInternalMatrix();
    if (internal) this.applyPastedCells(internal.cells, internal.merges);
  }

  async applyPasteSpecial(mode: PasteSpecialMode): Promise<void> {
    if (mode === 'all') {
      await this.handlePaste();
      return;
    }

    let matrix: CellData[][] | null = null;
    let merges: MergeRegion[] | undefined;
    let sourceGrid: SheetGrid | null = null;
    let sourceRangeMinCol = 0;
    let sourceRangeMinRow = 0;

    const internal = this.editor.clipboard.getInternalMatrix();
    if (internal) {
      matrix = internal.cells;
      merges = internal.merges;
      const srcSheet = this.editor.sheets.find(s => s.id === internal.sheetId) || this.editor.activeSheet;
      sourceGrid = srcSheet?.data || null;
      sourceRangeMinCol = internal.range.minCol;
      sourceRangeMinRow = internal.range.minRow;
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        const match = this.editor.clipboard.getMatchingInternalMatrix(text);
        if (match) {
          matrix = match.cells;
          merges = match.merges;
          const srcSheet = this.editor.sheets.find(s => s.id === match.sheetId) || this.editor.activeSheet;
          sourceGrid = srcSheet?.data || null;
          sourceRangeMinCol = match.range.minCol;
          sourceRangeMinRow = match.range.minRow;
        } else if (text) {
          matrix = parseTsvFromClipboard(text);
        }
      } catch {
        // Ignore clipboard errors when no external text is readable
      }
    }

    if (!matrix || !matrix.length) return;

    if (mode === 'transpose') {
      const rowCount = matrix.length;
      const colCount = Math.max(...matrix.map(r => r.length));
      const transposed: CellData[][] = Array.from({ length: colCount }, () => Array.from({ length: rowCount }, () => ({ raw: '' })));
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const cell = matrix[r]?.[c];
          if (cell) transposed[c][r] = cloneCellData(cell);
        }
      }
      const transposedMerges = merges?.map(m => ({
        startCol: m.startRow,
        startRow: m.startCol,
        endCol: m.endRow,
        endRow: m.endCol,
      }));
      this.applyPastedCells(transposed, transposedMerges);
      return;
    }

    const startCol = this.editor.selectedCell.col;
    const startRow = this.editor.selectedCell.row;
    const width = Math.max(...matrix.map(r => r.length));
    const endCol = startCol + width - 1;
    const endRow = startRow + matrix.length - 1;
    if (!this.canReplaceSpillRange(startCol, startRow, endCol, endRow)) return;
    if (!this.editor.guardEditableRange(startCol, endCol, startRow, endRow)) return;

    this.editor.cancelCellEdit();
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (let rIdx = 0; rIdx < matrix!.length; rIdx++) {
        const rowCells = matrix![rIdx];
        for (let cIdx = 0; cIdx < rowCells.length; cIdx++) {
          const srcCell = rowCells[cIdx] || { raw: '' };
          const dstId = getCellId(startCol + cIdx, startRow + rIdx);
          const existing = prev[dstId];
          if (mode === 'formats') {
            next[dstId] = {
              raw: existing?.raw ?? '',
              ...(srcCell.style ? { style: cloneCellStyle(srcCell.style) } : {}),
            };
          } else if (mode === 'formulas') {
            next[dstId] = {
              raw: srcCell.raw ?? '',
              ...(existing?.style ? { style: cloneCellStyle(existing.style) } : {}),
            };
          } else if (mode === 'values') {
            const rawStr = String(srcCell.raw ?? '');
            let resolved = rawStr;
            if (rawStr.startsWith('=') && sourceGrid) {
              const srcId = getCellId(sourceRangeMinCol + cIdx, sourceRangeMinRow + rIdx);
              const val = evaluateCellValueCached(srcId, sourceGrid, this.hooks.calculationCache);
              resolved = val === undefined || val === null ? '' : String(val);
            }
            next[dstId] = {
              raw: resolved,
              ...(existing?.style ? { style: cloneCellStyle(existing.style) } : {}),
            };
          }
        }
      }
      return next;
    });
    this.editor.selectionRange = { startCol, startRow, endCol, endRow };
    this.editor.gridContainer?.nativeElement?.focus({ preventScroll: true });
  }

  handleClearContent(): void {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    if (!this.canReplaceSpillRange(minCol, minRow, maxCol, maxRow)) return;
    if (!this.editor.guardEditableRange(minCol, maxCol, minRow, maxRow)) return;
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
          const cur = next[id];
          next[id] = {
            raw: 'FALSE',
            computed: 'FALSE',
            style: {
              ...(cur?.style || {}),
              checkbox: true,
              align: cur?.style?.align || 'center',
            },
          };
        }
      }
      return next;
    });
  }

  toggleCheckboxCells(cells: { col: number; row: number }[]): boolean {
    const grid = this.editor.activeSheet.data || {};
    const targets = cells.filter(({ col, row }) => Boolean(grid[getCellId(col, row)]?.style?.checkbox));
    if (!targets.length) return false;
    const editableTargets = targets.filter(({ col, row }) => this.editor.guardEditableCell(col, row));
    if (!editableTargets.length) return false;
    this.hooks.pushUndoSnapshot();
    this.editor.updateCurrentGrid((prev) => {
      const next = { ...prev };
      for (const { col, row } of editableTargets) {
        const id = getCellId(col, row);
        const cur = next[id];
        if (!cur?.style?.checkbox) continue;
        const nextVal = String(cur.raw ?? '').trim().toUpperCase() === 'TRUE' ? 'FALSE' : 'TRUE';
        next[id] = { ...cur, raw: nextVal, computed: nextVal };
      }
      return next;
    });
    return true;
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
