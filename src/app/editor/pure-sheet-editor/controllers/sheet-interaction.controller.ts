import type { SheetEditorHooks } from './sheet-editor-hooks';
import { BorderEdge } from '../models/excel.model';
import { cycleFormulaRefAtCursor, getCellId } from '../services/formula-engine.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetInteractionControllerHost = Pick<PureSheetEditorComponent,
  | 'activeCellStyle'
  | 'activeSheet'
  | 'activeSheetId'
  | 'applyStyleChange'
  | 'cancelCellEdit'
  | 'cellEditorInput'
  | 'chartDataModalOpen'
  | 'commitCellEdit'
  | 'currentZoom'
  | 'draggingChart'
  | 'drawBorderMode'
  | 'editingOnActiveSheet'
  | 'editingValue'
  | 'exportMenuOpen'
  | 'fillSourceRange'
  | 'fillTargetRange'
  | 'gridContainer'
  | 'handleClearContent'
  | 'handleCopy'
  | 'handleCut'
  | 'handleCycleF4'
  | 'handleFillDown'
  | 'handleFillRight'
  | 'handleRedo'
  | 'handleUndo'
  | 'inkLayer'
  | 'isEditing'
  | 'isFillDragging'
  | 'isSelecting'
  | 'mergedRegion'
  | 'namesModalOpen'
  | 'normalizedRange'
  | 'removeArtwork'
  | 'resizingChart'
  | 'resizingCol'
  | 'resizingRow'
  | 'revealCell'
  | 'selectedArtworkId'
  | 'selectedCell'
  | 'selectedChartId'
  | 'selectionRange'
  | 'settingsMenuOpen'
  | 'startCellEdit'
  | 'totalCols'
  | 'totalRows'
  | 'updateCurrentGrid'>;
type SheetInteractionControllerHooks = Pick<SheetEditorHooks,
  | 'beginFormulaReference'
  | 'executeSmartFill'
  | 'expandMergedSelection'
  | 'finishFormulaReference'
  | 'handleFormulaArrow'
  | 'pushUndoSnapshot'
  | 'referenceDrag'
  | 'updateFormulaReference'>;

/** Interaction behavior scoped to one editor instance. */
export class SheetInteractionController {
  constructor(private readonly editor: SheetInteractionControllerHost, private readonly hooks: SheetInteractionControllerHooks) {}

  isCellInSelection(col: number, row: number): boolean {
    const { minCol, maxCol, minRow, maxRow } = this.editor.normalizedRange;
    return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
  }

  isCellActive(col: number, row: number): boolean {
    return this.editor.selectedCell.col === col && this.editor.selectedCell.row === row;
  }

  isTopSelectionEdge(col: number, row: number): boolean {
    const { minCol, maxCol, minRow } = this.editor.normalizedRange;
    return row === minRow && col >= minCol && col <= maxCol;
  }

  isBottomSelectionEdge(col: number, row: number): boolean {
    const { minCol, maxCol, maxRow } = this.editor.normalizedRange;
    return (this.editor.mergedRegion(col, row)?.endRow ?? row) === maxRow && col >= minCol && col <= maxCol;
  }

  isLeftSelectionEdge(col: number, row: number): boolean {
    const { minRow, maxRow, minCol } = this.editor.normalizedRange;
    return col === minCol && row >= minRow && row <= maxRow;
  }

  isRightSelectionEdge(col: number, row: number): boolean {
    const { minRow, maxRow, maxCol } = this.editor.normalizedRange;
    return (this.editor.mergedRegion(col, row)?.endCol ?? col) === maxCol && row >= minRow && row <= maxRow;
  }

  isBottomRightSelectionCorner(col: number, row: number): boolean {
    const { maxCol, maxRow } = this.editor.normalizedRange;
    const merged = this.editor.mergedRegion(col, row);
    return (merged?.endCol ?? col) === maxCol && (merged?.endRow ?? row) === maxRow;
  }

  onCellMouseDown(col: number, row: number, event: MouseEvent): void {
    this.editor.selectedArtworkId = null;
    this.editor.inkLayer?.clearSelection();
    if (event.button !== 0) return;
    const merged = this.editor.mergedRegion(col, row);
    if (merged) { col = merged.startCol; row = merged.startRow; }
    if (this.hooks.beginFormulaReference(col, row, event)) return;
    const clickedSheetId = this.editor.activeSheetId;
    this.editor.commitCellEdit();
    this.editor.activeSheetId = clickedSheetId;
    this.editor.selectedChartId = null;

    if (this.editor.drawBorderMode !== 'none') {
      const stdEdge: BorderEdge = { style: 'thin', color: '#000000' };
      this.hooks.pushUndoSnapshot();
      this.editor.updateCurrentGrid((prev) => {
        const next = { ...prev };
        const id = getCellId(col, row);
        const cell = next[id] || { raw: '' };
        if (this.editor.drawBorderMode === 'eraseBorder') {
          next[id] = { ...cell, style: { ...(cell.style || {}), borders: {} } };
        } else {
          next[id] = {
            ...cell,
            style: {
              ...(cell.style || {}),
              borders: { top: stdEdge, bottom: stdEdge, left: stdEdge, right: stdEdge },
            },
          };
        }
        return next;
      });
      return;
    }

    if (!this.editor.isEditing) {
      event.preventDefault();
      this.editor.gridContainer?.nativeElement.focus({ preventScroll: true });
    }

    if (event.shiftKey) {
      this.editor.selectionRange = this.hooks.expandMergedSelection({ startCol: this.editor.selectedCell.col, startRow: this.editor.selectedCell.row, endCol: col, endRow: row });
    } else {
      this.editor.selectedCell = { col, row };
      this.editor.selectionRange = merged ? { ...merged } : { startCol: col, startRow: row, endCol: col, endRow: row };
      this.editor.isSelecting = true;
    }
  }

  onCellMouseEnter(col: number, row: number): void {
    if (this.hooks.referenceDrag) { this.hooks.updateFormulaReference(col, row); return; }
    if (this.editor.isSelecting) {
      this.editor.selectionRange = this.hooks.expandMergedSelection({ startCol: this.editor.selectedCell.col, startRow: this.editor.selectedCell.row, endCol: col, endRow: row });
    } else if (this.editor.isFillDragging && this.editor.fillSourceRange) {
      this.editor.fillTargetRange = {
        ...this.editor.fillSourceRange,
        endCol: Math.max(this.editor.fillSourceRange.endCol, col),
        endRow: Math.max(this.editor.fillSourceRange.endRow, row),
      };
      this.editor.selectionRange = {
        startCol: this.editor.fillSourceRange.startCol,
        startRow: this.editor.fillSourceRange.startRow,
        endCol: Math.max(this.editor.fillSourceRange.endCol, col),
        endRow: Math.max(this.editor.fillSourceRange.endRow, row),
      };
    }
  }

  onCellDoubleClick(col: number, row: number): void {
    const merged = this.editor.mergedRegion(col, row);
    if (merged) { col = merged.startCol; row = merged.startRow; }
    if (this.editor.isEditing && this.editor.editingValue.trim().startsWith('=')) return;
    this.editor.selectedCell = { col, row };
    this.editor.selectionRange = merged ? { ...merged } : { startCol: col, startRow: row, endCol: col, endRow: row };
    this.editor.startCellEdit();
  }

  selectEntireColumn(col: number, event: MouseEvent): void {
    if (this.hooks.beginFormulaReference(col, 0, event)) { this.hooks.updateFormulaReference(col, this.editor.totalRows - 1); this.hooks.finishFormulaReference(); return; }
    this.editor.selectedChartId = null; this.editor.selectedArtworkId = null; this.editor.inkLayer?.clearSelection();
    this.editor.commitCellEdit();
    this.editor.selectedCell = { col, row: 0 };
    this.editor.selectionRange = {
      startCol: col,
      startRow: 0,
      endCol: col,
      endRow: this.editor.totalRows - 1,
    };
  }

  selectEntireRow(row: number, event: MouseEvent): void {
    if (this.hooks.beginFormulaReference(0, row, event)) { this.hooks.updateFormulaReference(this.editor.totalCols - 1, row); this.hooks.finishFormulaReference(); return; }
    this.editor.selectedChartId = null; this.editor.selectedArtworkId = null; this.editor.inkLayer?.clearSelection();
    this.editor.commitCellEdit();
    this.editor.selectedCell = { col: 0, row };
    this.editor.selectionRange = {
      startCol: 0,
      startRow: row,
      endCol: this.editor.totalCols - 1,
      endRow: row,
    };
  }

  selectAllCells(): void {
    this.editor.selectedChartId = null; this.editor.selectedArtworkId = null; this.editor.inkLayer?.clearSelection();
    this.editor.commitCellEdit();
    this.editor.selectedCell = { col: 0, row: 0 };
    this.editor.selectionRange = {
      startCol: 0,
      startRow: 0,
      endCol: this.editor.totalCols - 1,
      endRow: this.editor.totalRows - 1,
    };
  }

  handleGlobalKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.editor.chartDataModalOpen || this.editor.namesModalOpen) return;
    if (event.target instanceof Element && event.target.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    if (this.hooks.handleFormulaArrow(event)) return;
    if (this.editor.isEditing && !this.editor.editingOnActiveSheet && !(event.target instanceof HTMLInputElement) && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault(); event.key === 'Enter' ? this.editor.commitCellEdit() : this.editor.cancelCellEdit(); return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      if (event.target === this.editor.cellEditorInput?.nativeElement) {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.editor.commitCellEdit();
          this.moveSelection(0, 1);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          this.editor.commitCellEdit();
          this.moveSelection(1, 0);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.editor.cancelCellEdit();
        } else if (event.key === 'F4') {
          event.preventDefault();
          const input = this.editor.cellEditorInput?.nativeElement;
          const pos = input?.selectionStart ?? null;
          const { formula, newCursorPos } = cycleFormulaRefAtCursor(this.editor.editingValue, pos);
          this.editor.editingValue = formula;
          setTimeout(() => input?.setSelectionRange(newCursorPos, newCursorPos), 0);
        }
      }
      return;
    }

    if (this.editor.isEditing) return;

    if (this.editor.inkLayer?.selectionBounds && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault(); this.editor.inkLayer.removeSelected(); return;
    }

    if (this.editor.selectedArtworkId && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault(); this.editor.removeArtwork(this.editor.selectedArtworkId); return;
    }
    if (this.editor.selectedArtworkId && event.key === 'Escape') {
      this.editor.selectedArtworkId = null; return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'z') {
        event.preventDefault();
        event.shiftKey ? this.editor.handleRedo() : this.editor.handleUndo();
      } else if (event.key === 'y') {
        event.preventDefault();
        this.editor.handleRedo();
      } else if (event.key === 'c') {
        event.preventDefault();
        this.editor.handleCopy();
      } else if (event.key === 'x') {
        event.preventDefault();
        this.editor.handleCut();
      } else if (event.key === 'v') {
        return; // Allow the browser to deliver HTML and TSV through the native paste event.
      } else if (event.key === 'b') {
        event.preventDefault();
        this.editor.applyStyleChange({ bold: !this.editor.activeCellStyle?.bold });
      } else if (event.key === 'i') {
        event.preventDefault();
        this.editor.applyStyleChange({ italic: !this.editor.activeCellStyle?.italic });
      } else if (event.key === 'u') {
        event.preventDefault();
        this.editor.applyStyleChange({ underline: !this.editor.activeCellStyle?.underline });
      } else if (event.key === 'a') {
        event.preventDefault();
        this.selectAllCells();
      } else if (event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        this.editor.handleFillDown();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        this.editor.handleFillRight();
      }
      return;
    }

    switch (event.key) {
      case 'F4':
        event.preventDefault();
        this.editor.handleCycleF4();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(0, 1, event.shiftKey);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(0, -1, event.shiftKey);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.moveSelection(1, 0, event.shiftKey);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveSelection(-1, 0, event.shiftKey);
        break;
      case 'Tab':
        event.preventDefault();
        this.moveSelection(event.shiftKey ? -1 : 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        this.moveSelection(0, event.shiftKey ? -1 : 1);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.editor.handleClearContent();
        break;
      case 'F2':
        event.preventDefault();
        this.editor.startCellEdit();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          this.editor.startCellEdit(event.key);
        }
        break;
    }
  }

  handleGlobalMouseUp(): void {
    this.hooks.finishFormulaReference();
    this.editor.isSelecting = false;
    this.editor.resizingCol = null;
    this.editor.resizingRow = null;
    this.editor.draggingChart = null;
    this.editor.resizingChart = null;

    if (this.editor.isFillDragging && this.editor.fillSourceRange && this.editor.fillTargetRange) {
      this.hooks.executeSmartFill();
      this.editor.isFillDragging = false;
      this.editor.fillSourceRange = null;
      this.editor.fillTargetRange = null;
    }
  }

  handleGlobalMouseMove(event: MouseEvent): void {
    const zoom = this.editor.currentZoom();

    if (this.editor.resizingCol) {
      const delta = (event.clientX - this.editor.resizingCol.startX) / zoom;
      const newWidth = Math.max(36, Math.min(450, Math.round(this.editor.resizingCol.startWidth + delta)));
      if (!this.editor.activeSheet.colWidths) this.editor.activeSheet.colWidths = {};
      this.editor.activeSheet.colWidths = { ...this.editor.activeSheet.colWidths, [this.editor.resizingCol.col]: newWidth };
    } else if (this.editor.resizingRow) {
      const delta = (event.clientY - this.editor.resizingRow.startY) / zoom;
      const newHeight = Math.max(18, Math.min(300, Math.round(this.editor.resizingRow.startHeight + delta)));
      if (!this.editor.activeSheet.rowHeights) this.editor.activeSheet.rowHeights = {};
      this.editor.activeSheet.rowHeights = { ...this.editor.activeSheet.rowHeights, [this.editor.resizingRow.row]: newHeight };
    } else if (this.editor.draggingChart) {
      const deltaX = (event.clientX - this.editor.draggingChart.startX) / zoom;
      const deltaY = (event.clientY - this.editor.draggingChart.startY) / zoom;
      const ch = this.editor.activeSheet.charts?.find((c) => c.id === this.editor.draggingChart!.id);
      if (ch) {
        ch.x = Math.max(0, Math.round(this.editor.draggingChart.origX + deltaX));
        ch.y = Math.max(0, Math.round(this.editor.draggingChart.origY + deltaY));
      }
    } else if (this.editor.resizingChart) {
      const deltaW = (event.clientX - this.editor.resizingChart.startX) / zoom;
      const deltaH = (event.clientY - this.editor.resizingChart.startY) / zoom;
      const ch = this.editor.activeSheet.charts?.find((c) => c.id === this.editor.resizingChart!.id);
      if (ch) {
        ch.width = Math.max(200, Math.round(this.editor.resizingChart.origW + deltaW));
        ch.height = Math.max(150, Math.round(this.editor.resizingChart.origH + deltaH));
      }
    }
  }

  moveSelection(dCol: number, dRow: number, expand = false): void {
    if (expand) {
      const nextEndCol = Math.max(0, Math.min(this.editor.totalCols - 1, this.editor.selectionRange.endCol + dCol));
      const nextEndRow = Math.max(0, Math.min(this.editor.totalRows - 1, this.editor.selectionRange.endRow + dRow));
      this.editor.selectionRange = {
        ...this.editor.selectionRange,
        endCol: nextEndCol,
        endRow: nextEndRow,
      };
    } else {
      const current = this.editor.mergedRegion(this.editor.selectedCell.col, this.editor.selectedCell.row);
      let nextCol = Math.max(0, Math.min(this.editor.totalCols - 1, (dCol > 0 && current ? current.endCol : this.editor.selectedCell.col) + dCol));
      let nextRow = Math.max(0, Math.min(this.editor.totalRows - 1, (dRow > 0 && current ? current.endRow : this.editor.selectedCell.row) + dRow));
      const merged = this.editor.mergedRegion(nextCol, nextRow);
      if (merged) { nextCol = merged.startCol; nextRow = merged.startRow; }
      this.editor.selectedCell = { col: nextCol, row: nextRow };
      this.editor.selectionRange = merged ? { ...merged } : { startCol: nextCol, startRow: nextRow, endCol: nextCol, endRow: nextRow };
    }
    this.editor.revealCell(expand ? this.editor.selectionRange.endCol : this.editor.selectedCell.col, expand ? this.editor.selectionRange.endRow : this.editor.selectedCell.row);
  }

  onGridWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    // Cancel browser page zoom, including when the sheet has reached its zoom limit.
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY < 0) this.zoomIn();
    else if (event.deltaY > 0) this.zoomOut();
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.editor.currentZoom() + 0.1) * 10) / 10, 2.0);
    this.editor.currentZoom.set(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.editor.currentZoom() - 0.1) * 10) / 10, 0.5);
    this.editor.currentZoom.set(next);
  }

  resetZoom(): void {
    this.editor.currentZoom.set(1.0);
  }

  handleChangeZoom(newPercent: number): void {
    const next = Math.max(0.5, Math.min(2.0, Math.round(newPercent) / 100));
    this.editor.currentZoom.set(next);
  }

  onGlobalClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.header-dropdown-menu') && !target.closest('.header-dropdown-btn')) {
      this.editor.exportMenuOpen = false;
      this.editor.settingsMenuOpen = false;
    }
  }
}
