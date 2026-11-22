import type { SheetEditorHooks } from './sheet-editor-hooks';
import { BorderEdge } from '../models/excel.model';
import { cycleFormulaRefAtCursor, getCellId, parseCellId } from '../services/formula-engine.service';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetInteractionControllerHost = Pick<PureSheetEditorComponent,
  | 'activeCellStyle'
  | 'activeSheet'
  | 'activeSheetId'
  | 'applyFormatPainter'
  | 'applyStyleChange'
  | 'cancelCellEdit'
  | 'cellEditorInput'
  | 'chartDataModalOpen'
  | 'clearCopiedFormat'
  | 'clipboard'
  | 'closeCellCommentEditor'
  | 'closeColumnFilterMenu'
  | 'closeHyperlinkEditor'
  | 'closePasteSpecialMenu'
  | 'closeSheetTabMenu'
  | 'closeValidationDropdown'
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
  | 'handlePaste'
  | 'handleRedo'
  | 'handleUndo'
  | 'hasCopiedFormat'
  | 'hasBlockingDataModal'
  | 'inkLayer'
  | 'isEditing'
  | 'isFillDragging'
  | 'isSelecting'
  | 'mergedRegion'
  | 'namesModalOpen'
  | 'normalizedRange'
  | 'openCellCommentEditor'
  | 'openCellHyperlink'
  | 'openFindReplaceModal'
  | 'openHyperlinkEditor'
  | 'removeArtwork'
  | 'resizingChart'
  | 'resizingCol'
  | 'resizingRow'
  | 'revealCell'
  | 'scheduleAutoSave'
  | 'selectedArtworkId'
  | 'selectedCell'
  | 'selectedChartId'
  | 'selectionRange'
  | 'settingsMenuOpen'
  | 'sheetListOpen'
  | 'startCellEdit'
  | 'syncZoomScroll'
  | 'togglePasteSpecialMenu'
  | 'toggleSelectedCheckboxes'
  | 'toggleValidationDropdown'
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
  | 'scheduleCanvasRender'
  | 'updateFormulaReference'
  | 'viewChanges'>;

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
      if (this.editor.hasCopiedFormat) {
        this.editor.applyFormatPainter();
      }
    } else {
      this.editor.selectedCell = { col, row };
      this.editor.selectionRange = merged ? { ...merged } : { startCol: col, startRow: row, endCol: col, endRow: row };
      this.editor.isSelecting = true;
      if ((event.ctrlKey || event.metaKey) && this.editor.activeSheet.data[getCellId(col, row)]?.hyperlink) {
        this.editor.isSelecting = false;
        this.editor.openCellHyperlink(col, row);
      }
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
    this.hooks.scheduleCanvasRender?.();
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
    this.hooks.scheduleCanvasRender?.();
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
    this.hooks.scheduleCanvasRender?.();
  }

  handleGlobalKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.editor.chartDataModalOpen || this.editor.namesModalOpen || this.editor.hasBlockingDataModal) return;
    if (event.target instanceof Element && event.target.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    if (this.hooks.handleFormulaArrow(event)) return;
    if (this.editor.isEditing && !this.editor.editingOnActiveSheet && !(event.target instanceof HTMLInputElement) && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault(); event.key === 'Enter' ? this.editor.commitCellEdit() : this.editor.cancelCellEdit(); return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      if (event.target === this.editor.cellEditorInput?.nativeElement) {
        if (event.key === 'Enter' && !event.altKey) {
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
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        event.shiftKey ? this.editor.handleRedo() : this.editor.handleUndo();
      } else if (key === 'y') {
        event.preventDefault();
        this.editor.handleRedo();
      } else if (key === 'c') {
        event.preventDefault();
        this.editor.handleCopy();
      } else if (key === 'x') {
        event.preventDefault();
        this.editor.handleCut();
      } else if (key === 'v') {
        if (!this.editor.isEditing) {
          event.preventDefault();
          if (event.shiftKey) {
            this.editor.togglePasteSpecialMenu();
          } else {
            void this.editor.handlePaste();
          }
        }
        return;
      } else if (key === 'b') {
        event.preventDefault();
        this.editor.applyStyleChange({ bold: !this.editor.activeCellStyle?.bold });
      } else if (key === 'i') {
        event.preventDefault();
        this.editor.applyStyleChange({ italic: !this.editor.activeCellStyle?.italic });
      } else if (key === 'u') {
        event.preventDefault();
        this.editor.applyStyleChange({ underline: !this.editor.activeCellStyle?.underline });
      } else if (key === 'a') {
        event.preventDefault();
        this.selectAllCells();
      } else if (key === 'd') {
        event.preventDefault();
        this.editor.handleFillDown();
      } else if (key === 'f') {
        event.preventDefault();
        this.editor.openFindReplaceModal(false);
      } else if (key === 'h') {
        event.preventDefault();
        this.editor.openFindReplaceModal(true);
      } else if (key === 'k') {
        event.preventDefault();
        this.editor.openHyperlinkEditor(this.editor.selectedCell.col, this.editor.selectedCell.row);
      } else if (key === 'r') {
        event.preventDefault();
        this.editor.handleFillRight();
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.jumpSelectionTo(0, 0, event.shiftKey);
      } else if (event.key === 'End') {
        event.preventDefault();
        const extent = this.findUsedExtent();
        this.jumpSelectionTo(extent.maxCol, extent.maxRow, event.shiftKey);
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
        if (event.altKey) {
          this.editor.toggleValidationDropdown(this.editor.selectedCell.col, this.editor.selectedCell.row);
        } else {
          this.moveSelection(0, 1, event.shiftKey);
        }
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
      case 'Home':
        event.preventDefault();
        this.jumpSelectionTo(0, this.editor.selectedCell.row, event.shiftKey);
        break;
      case 'End': {
        event.preventDefault();
        const targetCol = this.findLastColInRow(this.editor.selectedCell.row);
        this.jumpSelectionTo(targetCol, this.editor.selectedCell.row, event.shiftKey);
        break;
      }
      case 'PageDown':
        event.preventDefault();
        this.moveSelection(0, this.pageStepRows(), event.shiftKey);
        break;
      case 'PageUp':
        event.preventDefault();
        this.moveSelection(0, -this.pageStepRows(), event.shiftKey);
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
        if (event.shiftKey) {
          this.editor.openCellCommentEditor(this.editor.selectedCell.col, this.editor.selectedCell.row);
        } else {
          this.editor.startCellEdit();
        }
        break;
      case 'Escape':
        if (this.editor.hasCopiedFormat) {
          this.editor.clearCopiedFormat();
        }
        this.editor.closeColumnFilterMenu();
        this.editor.closeValidationDropdown();
        this.editor.closeCellCommentEditor();
        this.editor.closeHyperlinkEditor();
        this.editor.closePasteSpecialMenu();
        this.editor.closeSheetTabMenu();
        if (this.editor.clipboard.getInternalMatrix()) {
          this.editor.clipboard.clearInternalMatrix();
          this.hooks.scheduleCanvasRender?.();
        }
        break;
      default:
        if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
          if (this.editor.toggleSelectedCheckboxes()) {
            event.preventDefault();
            break;
          }
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          this.editor.startCellEdit(event.key);
        }
        break;
    }
  }

  handleGlobalMouseUp(): void {
    const wasSelectingCells = this.editor.isSelecting;
    const chartOrResizeChanged = Boolean(
      this.editor.draggingChart ||
      this.editor.resizingChart ||
      this.editor.resizingCol ||
      this.editor.resizingRow
    );
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

    if (wasSelectingCells && !this.editor.isEditing && this.editor.hasCopiedFormat) {
      this.editor.applyFormatPainter();
    }

    if (chartOrResizeChanged) {
      this.editor.scheduleAutoSave();
    }
    this.hooks.scheduleCanvasRender?.();
  }

  handleGlobalMouseMove(event: MouseEvent): void {
    const zoom = this.editor.currentZoom();

    if (this.editor.resizingCol) {
      const delta = (event.clientX - this.editor.resizingCol.startX) / zoom;
      const newWidth = Math.max(36, Math.min(450, Math.round(this.editor.resizingCol.startWidth + delta)));
      if (!this.editor.activeSheet.colWidths) this.editor.activeSheet.colWidths = {};
      this.editor.activeSheet.colWidths = { ...this.editor.activeSheet.colWidths, [this.editor.resizingCol.col]: newWidth };
      this.hooks.scheduleCanvasRender?.();
    } else if (this.editor.resizingRow) {
      const delta = (event.clientY - this.editor.resizingRow.startY) / zoom;
      const newHeight = Math.max(18, Math.min(300, Math.round(this.editor.resizingRow.startHeight + delta)));
      if (!this.editor.activeSheet.rowHeights) this.editor.activeSheet.rowHeights = {};
      this.editor.activeSheet.rowHeights = { ...this.editor.activeSheet.rowHeights, [this.editor.resizingRow.row]: newHeight };
      this.hooks.scheduleCanvasRender?.();
    } else if (this.editor.draggingChart) {
      const deltaX = (event.clientX - this.editor.draggingChart.startX) / zoom;
      const deltaY = (event.clientY - this.editor.draggingChart.startY) / zoom;
      const ch = this.editor.activeSheet.charts?.find((c) => c.id === this.editor.draggingChart!.id);
      if (ch) {
        ch.x = Math.max(0, Math.round(this.editor.draggingChart.origX + deltaX));
        ch.y = Math.max(0, Math.round(this.editor.draggingChart.origY + deltaY));
        this.hooks.scheduleCanvasRender?.();
      }
    } else if (this.editor.resizingChart) {
      const deltaX = (event.clientX - this.editor.resizingChart.startX) / zoom;
      const deltaY = (event.clientY - this.editor.resizingChart.startY) / zoom;
      const ch = this.editor.activeSheet.charts?.find((c) => c.id === this.editor.resizingChart!.id);
      if (ch) {
        const handle = this.editor.resizingChart.handle || 'se';
        const origX = this.editor.resizingChart.origX ?? (ch.x ?? 100);
        const origY = this.editor.resizingChart.origY ?? (ch.y ?? 80);
        const origW = this.editor.resizingChart.origW;
        const origH = this.editor.resizingChart.origH;

        if (handle === 'se') {
          ch.width = Math.max(200, Math.round(origW + deltaX));
          ch.height = Math.max(150, Math.round(origH + deltaY));
        } else if (handle === 'e') {
          ch.width = Math.max(200, Math.round(origW + deltaX));
        } else if (handle === 's') {
          ch.height = Math.max(150, Math.round(origH + deltaY));
        } else if (handle === 'sw') {
          const rawW = origW - deltaX;
          const newW = Math.max(200, Math.round(rawW));
          ch.x = Math.max(0, Math.round(origX + (origW - newW)));
          ch.width = newW;
          ch.height = Math.max(150, Math.round(origH + deltaY));
        } else if (handle === 'w') {
          const rawW = origW - deltaX;
          const newW = Math.max(200, Math.round(rawW));
          ch.x = Math.max(0, Math.round(origX + (origW - newW)));
          ch.width = newW;
        } else if (handle === 'ne') {
          ch.width = Math.max(200, Math.round(origW + deltaX));
          const rawH = origH - deltaY;
          const newH = Math.max(150, Math.round(rawH));
          ch.y = Math.max(0, Math.round(origY + (origH - newH)));
          ch.height = newH;
        } else if (handle === 'n') {
          const rawH = origH - deltaY;
          const newH = Math.max(150, Math.round(rawH));
          ch.y = Math.max(0, Math.round(origY + (origH - newH)));
          ch.height = newH;
        } else if (handle === 'nw') {
          const rawW = origW - deltaX;
          const newW = Math.max(200, Math.round(rawW));
          ch.x = Math.max(0, Math.round(origX + (origW - newW)));
          ch.width = newW;
          const rawH = origH - deltaY;
          const newH = Math.max(150, Math.round(rawH));
          ch.y = Math.max(0, Math.round(origY + (origH - newH)));
          ch.height = newH;
        }
        this.hooks.scheduleCanvasRender?.();
      }
    }
  }

  private stepVisibleIndex(cur: number, delta: number, max: number, hidden?: number[]): number {
    const hiddenSet = hidden?.length ? new Set(hidden) : null;
    if (!delta) return cur;
    const step = delta > 0 ? 1 : -1;
    let remaining = Math.abs(delta);
    let idx = cur;
    while (remaining > 0) {
      const next = idx + step;
      if (next < 0 || next > max) break;
      idx = next;
      if (!hiddenSet || !hiddenSet.has(idx)) {
        remaining -= 1;
      }
    }
    if (hiddenSet?.has(idx)) {
      let back = idx - step;
      while (back >= 0 && back <= max && hiddenSet.has(back)) back -= step;
      if (back >= 0 && back <= max && !hiddenSet.has(back)) return back;
      return cur;
    }
    return idx;
  }

  moveSelection(dCol: number, dRow: number, expand = false): void {
    const hiddenCols = this.editor.activeSheet.hiddenCols;
    const hiddenRows = this.editor.activeSheet.hiddenRows;
    if (expand) {
      const nextEndCol = this.stepVisibleIndex(this.editor.selectionRange.endCol, dCol, this.editor.totalCols - 1, hiddenCols);
      const nextEndRow = this.stepVisibleIndex(this.editor.selectionRange.endRow, dRow, this.editor.totalRows - 1, hiddenRows);
      this.editor.selectionRange = {
        ...this.editor.selectionRange,
        endCol: nextEndCol,
        endRow: nextEndRow,
      };
    } else {
      const current = this.editor.mergedRegion(this.editor.selectedCell.col, this.editor.selectedCell.row);
      const baseCol = dCol > 0 && current ? current.endCol : this.editor.selectedCell.col;
      const baseRow = dRow > 0 && current ? current.endRow : this.editor.selectedCell.row;
      let nextCol = this.stepVisibleIndex(baseCol, dCol, this.editor.totalCols - 1, hiddenCols);
      let nextRow = this.stepVisibleIndex(baseRow, dRow, this.editor.totalRows - 1, hiddenRows);
      const merged = this.editor.mergedRegion(nextCol, nextRow);
      if (merged) { nextCol = merged.startCol; nextRow = merged.startRow; }
      this.editor.selectedCell = { col: nextCol, row: nextRow };
      this.editor.selectionRange = merged ? { ...merged } : { startCol: nextCol, startRow: nextRow, endCol: nextCol, endRow: nextRow };
    }
    this.editor.revealCell(expand ? this.editor.selectionRange.endCol : this.editor.selectedCell.col, expand ? this.editor.selectionRange.endRow : this.editor.selectedCell.row);
    this.hooks.scheduleCanvasRender?.();
  }

  private jumpSelectionTo(col: number, row: number, expand = false): void {
    const targetCol = Math.max(0, Math.min(this.editor.totalCols - 1, col));
    const targetRow = Math.max(0, Math.min(this.editor.totalRows - 1, row));
    if (expand) {
      this.editor.selectionRange = this.hooks.expandMergedSelection({
        startCol: this.editor.selectedCell.col,
        startRow: this.editor.selectedCell.row,
        endCol: targetCol,
        endRow: targetRow,
      });
      this.editor.revealCell(targetCol, targetRow);
      this.hooks.scheduleCanvasRender?.();
      return;
    }
    const merged = this.editor.mergedRegion(targetCol, targetRow);
    const resolvedCol = merged ? merged.startCol : targetCol;
    const resolvedRow = merged ? merged.startRow : targetRow;
    this.editor.selectedCell = { col: resolvedCol, row: resolvedRow };
    this.editor.selectionRange = merged ? { ...merged } : { startCol: resolvedCol, startRow: resolvedRow, endCol: resolvedCol, endRow: resolvedRow };
    this.editor.revealCell(resolvedCol, resolvedRow);
    this.hooks.scheduleCanvasRender?.();
  }

  private pageStepRows(): number {
    const vh = this.editor.gridContainer?.nativeElement.clientHeight || 560;
    return Math.max(8, Math.floor((vh - 24) / 28));
  }

  private findUsedExtent(): { maxCol: number; maxRow: number } {
    let maxCol = 0;
    let maxRow = 0;
    for (const [id, cell] of Object.entries(this.editor.activeSheet.data || {})) {
      if (!cell || (String(cell.raw ?? '').trim() === '' && !cell.style)) continue;
      const parsed = parseCellId(id);
      if (!parsed) continue;
      if (parsed.col > maxCol) maxCol = parsed.col;
      if (parsed.row > maxRow) maxRow = parsed.row;
    }
    return { maxCol, maxRow };
  }

  private findLastColInRow(row: number): number {
    let maxCol = 0;
    for (const [id, cell] of Object.entries(this.editor.activeSheet.data || {})) {
      if (!cell || String(cell.raw ?? '').trim() === '') continue;
      const parsed = parseCellId(id);
      if (parsed && parsed.row === row && parsed.col > maxCol) {
        maxCol = parsed.col;
      }
    }
    return maxCol;
  }

  onGridWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    // Cancel browser page zoom, including when the sheet has reached its zoom limit.
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY < 0) this.zoomIn();
    else if (event.deltaY > 0) this.zoomOut();
  }

  private applyZoom(nextZoom: number): void {
    const oldZoom = this.editor.currentZoom() || 1;
    const clampedZoom = Math.max(0.5, Math.min(2.0, Math.round(nextZoom * 100) / 100));
    if (Math.abs(clampedZoom - oldZoom) < 0.001) return;

    const scrollEl = this.editor.gridContainer?.nativeElement;
    const logicalLeft = (scrollEl?.scrollLeft || 0) / oldZoom;
    const logicalTop = (scrollEl?.scrollTop || 0) / oldZoom;

    this.editor.currentZoom.set(clampedZoom);
    this.editor.syncZoomScroll(logicalLeft, logicalTop, clampedZoom);
    if (this.editor.inkLayer) {
      this.editor.inkLayer.zoom = clampedZoom;
    }
    this.hooks.viewChanges?.markForCheck();
    this.hooks.scheduleCanvasRender?.();
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.editor.currentZoom() + 0.1) * 10) / 10, 2.0);
    this.applyZoom(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.editor.currentZoom() - 0.1) * 10) / 10, 0.5);
    this.applyZoom(next);
  }

  resetZoom(): void {
    this.applyZoom(1.0);
  }

  handleChangeZoom(newPercent: number): void {
    const next = Math.max(0.5, Math.min(2.0, Math.round(newPercent) / 100));
    this.applyZoom(next);
  }

  onGlobalClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.header-dropdown-menu') && !target.closest('.header-dropdown-btn')) {
      this.editor.exportMenuOpen = false;
      this.editor.settingsMenuOpen = false;
    }
    if (!target.closest('.column-filter-popover')) {
      this.editor.closeColumnFilterMenu();
    }
    if (!target.closest('.validation-dropdown-popover')) {
      this.editor.closeValidationDropdown();
    }
    if (!target.closest('.cell-comment-popover')) {
      this.editor.closeCellCommentEditor();
    }
    if (!target.closest('.cell-hyperlink-popover')) {
      this.editor.closeHyperlinkEditor();
    }
    if (!target.closest('.paste-special-popover')) {
      this.editor.closePasteSpecialMenu();
    }
    if (!target.closest('.sheet-tab-context-menu')) {
      this.editor.closeSheetTabMenu();
    }
    if (!target.closest('.sheet-list-picker')) {
      this.editor.sheetListOpen = false;
    }
  }
}
