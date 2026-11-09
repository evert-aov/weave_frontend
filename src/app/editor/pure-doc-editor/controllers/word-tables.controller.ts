import { applyApaObjects } from '../utils/apa-objects';
import { signal } from '@angular/core';
import { mergeTableCells, tableMergePlan, type TableMergePlan } from '../utils/table-cell-grid';
import { TableItem } from '../models/word-document.model';
import type { TableResizeState } from '../models/word-editor-state.model';
import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordTablesControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'activeTemplateId'
  | 'styleTemplates'
  | 'activeTableCell'
  | 'checkAndPaginateOverflow'
  | 'commitPageDomToState'
  | 'getPageBody'
  | 'isReadMode'
  | 'pages'
  | 'pushUndoSnapshot'>;
type WordTablesControllerHooks = Pick<WordEditorHooks,
  | 'collectDocData'
  | 'getActivePageElement'
  | 'scheduleAutoSave'
  | 'scheduleDocumentFlow'
  | 'showToast'>;

/** Tables behavior owned by one editor instance. */
export class WordTablesController {
  constructor(private readonly editor: WordTablesControllerHost, private readonly hooks: WordTablesControllerHooks) {}

  private selectedRange: { start: HTMLTableCellElement; end: HTMLTableCellElement } | null = null;
  readonly mergeBox = signal<{ left: number; top: number; width: number; height: number } | null>(null);
  private selectionDragAbort: AbortController | null = null;

  clearSelection(): void {
    this.selectionDragAbort?.abort(); this.selectionDragAbort = null;
    this.selectedRange = null; this.mergeBox.set(null);
  }

  selectCell(event: PointerEvent, pageIndex: number): boolean {
    const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>('td,th') : null;
    if (this.editor.isReadMode() || event.button !== 0) return false;
    if (event.shiftKey && cell) {
      const start = this.editor.activeTableCell();
      if (start && start.closest('table') === cell.closest('table')) {
        event.preventDefault(); event.stopPropagation();
        this.selectedRange = { start, end: cell };
        window.getSelection()?.removeAllRanges();
        this.editor.activePageIndex.set(pageIndex); this.refreshSelection(); return true;
      }
    }
    this.clearSelection();
    if (cell) {
      this.editor.activeTableCell.set(cell);
      this.editor.activePageIndex.set(pageIndex);
      // Native text selection does not reliably include empty table cells. Track
      // the cells crossed by the pointer while leaving single-cell editing native.
      const abort = new AbortController(); this.selectionDragAbort = abort;
      const update = (pointer: PointerEvent): void => {
        if (this.tableResizeState) return;
        const end = pointer.target instanceof Element ? pointer.target.closest<HTMLTableCellElement>('td,th') : null;
        if (!end || end.closest('table') !== cell.closest('table')) return;
        if (end !== cell || this.selectedRange) {
          this.selectedRange = { start: cell, end };
          window.getSelection()?.removeAllRanges();
          this.refreshSelection();
        }
      };
      document.addEventListener('pointermove', update, { signal: abort.signal });
      document.addEventListener('pointerup', pointer => {
        update(pointer); abort.abort(); this.selectionDragAbort = null;
      }, { once: true, signal: abort.signal });
      document.addEventListener('pointercancel', () => this.clearSelection(), { once: true, signal: abort.signal });
    }
    return false;
  }

  private mergePlan(): TableMergePlan | null {
    if (this.selectedRange) {
      const { start, end } = this.selectedRange, table = start.closest('table');
      return table && start.isConnected && end.closest('table') === table ? tableMergePlan(table, [start, end]) : null;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0), node = range.startContainer;
    const table = (node instanceof Element ? node : node.parentElement)?.closest('table');
    if (!table || !(table instanceof HTMLTableElement) || !table.contains(range.endContainer)) return null;
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('td,th')).filter(cell => {
      if (cell.closest('table') !== table) return false;
      const content = document.createRange(); content.selectNodeContents(cell);
      return range.compareBoundaryPoints(Range.END_TO_START, content) < 0 && range.compareBoundaryPoints(Range.START_TO_END, content) > 0;
    });
    return tableMergePlan(table, cells);
  }

  canMergeCells(): boolean { return !this.editor.isReadMode() && !!this.mergePlan(); }

  refreshSelection(): void {
    const plan = this.mergePlan();
    if (!plan) { this.mergeBox.set(null); return; }
    const bounds = plan.cells.map(slot => slot.cell.getBoundingClientRect());
    const left = Math.min(...bounds.map(rect => rect.left)), top = Math.min(...bounds.map(rect => rect.top));
    this.mergeBox.set({ left, top, width: Math.max(...bounds.map(rect => rect.right)) - left, height: Math.max(...bounds.map(rect => rect.bottom)) - top });
  }

  combineCells(): void {
    if (this.editor.isReadMode()) return;
    const plan = this.mergePlan();
    if (!plan) return;
    this.editor.pushUndoSnapshot();
    const cell = mergeTableCells(plan);
    this.clearSelection(); this.editor.activeTableCell.set(cell);
    const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex());
  }

  tableResizeState: TableResizeState | null = null;

  tableResizeAbort: AbortController | null = null;

  handleInsertTable(rows: number, cols: number): void {
    const preSnapshot = this.editor.pages().map((p) => ({
      ...p,
      html: this.editor.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    const activeEl = this.hooks.getActivePageElement();
    activeEl?.focus();
    let tableHtml = `<table><thead><tr>`;
    for (let c = 1; c <= cols; c++) {
      tableHtml += `<th><br/></th>`;
    }
    tableHtml += `</tr></thead>`;
    if (rows > 1) {
      tableHtml += `<tbody>`;
      for (let r = 1; r < rows; r++) {
        tableHtml += `<tr>`;
        for (let c = 1; c <= cols; c++) {
          tableHtml += `<td><br/></td>`;
        }
        tableHtml += `</tr>`;
      }
      tableHtml += `</tbody>`;
    }
    tableHtml += `</table><p><br/></p>`;
    document.execCommand('insertHTML', false, tableHtml);
    const template = this.editor.styleTemplates().find(t => t.id === this.editor.activeTemplateId());
    if (template?.academicStyle === 'apa7' && activeEl) applyApaObjects([activeEl], template);
    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex(), preSnapshot);
    this.hooks.showToast(`Tabla de ${cols} × ${rows} insertada en Página ${this.editor.activePageIndex() + 1}`);
  }

  handleSelectTableInSidebar(tbl: TableItem): void {
    const clamped = Math.max(0, Math.min(this.editor.pages().length - 1, tbl.pageIndex));
    this.editor.activePageIndex.set(clamped);
    setTimeout(() => {
      const targetPage = this.editor.pages()[clamped];
      if (!targetPage) return;
      const pageEl = this.editor.getPageBody(targetPage.id);
      if (!pageEl) return;
      const tableEls = pageEl.querySelectorAll('table');
      const targetTableEl = tableEls[tbl.tableIndexInPage] || tableEls[0];
      if (targetTableEl) {
        targetTableEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetTableEl.classList.add('ring-2', 'ring-blue-500', 'transition-all');
        setTimeout(() => {
          targetTableEl.classList.remove('ring-2', 'ring-blue-500');
        }, 1600);
      } else {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      this.hooks.showToast(`Mostrando "${tbl.title}" en la Página ${clamped + 1}`);
    }, 40);
  }

  updateTableResizeCursor(event: PointerEvent): void {
    if (this.tableResizeState) return;
    const target = event.target instanceof Element ? event.target.closest('td,th') as HTMLTableCellElement | null : null;
    if (!target) { document.body.style.cursor = ''; return; }
    const rect = target.getBoundingClientRect();
    const nearRight = rect.right - event.clientX <= 7;
    const nearBottom = rect.bottom - event.clientY <= 7;
    document.body.style.cursor = nearBottom && (!nearRight || rect.bottom - event.clientY < rect.right - event.clientX)
      ? 'row-resize' : nearRight ? 'col-resize' : '';
  }

  startTableResize(event: PointerEvent, pageIndex: number): void {
    if (event.button !== 0 || this.editor.isReadMode()) return;
    const target = event.target instanceof Element ? event.target.closest('td,th') as HTMLTableCellElement | null : null;
    const row = target?.parentElement as HTMLTableRowElement | null;
    const table = target?.closest('table') as HTMLTableElement | null;
    if (!target || !row || !table) return;
    const rect = target.getBoundingClientRect();
    const rightDistance = rect.right - event.clientX;
    const bottomDistance = rect.bottom - event.clientY;
    if (rightDistance > 7 && bottomDistance > 7) return;

    const resizeRow = bottomDistance <= 7 && (rightDistance > 7 || bottomDistance <= rightDistance);
    const tableRect = table.getBoundingClientRect();
    if (tableRect.width <= 0) return;
    const firstRow = table.rows[0];
    const columnCount = Math.max(1, ...Array.from(table.rows, item => item.cells.length));
    const columnWidths = Array.from({ length: columnCount }, (_, index) =>
      ((firstRow?.cells[index]?.getBoundingClientRect().width ?? tableRect.width / columnCount) / tableRect.width) * 100);
    const cellIndex = Array.from(row.cells).indexOf(target);
    const resizeIndex = resizeRow ? row.rowIndex : Math.min(cellIndex, columnCount - 1);

    this.editor.pushUndoSnapshot();
    this.editor.activeTableCell.set(target);
    this.tableResizeState = {
      pageIndex, table, row, cell: target, mode: resizeRow ? 'row' : 'column', index: resizeIndex,
      startX: event.clientX, startY: event.clientY, tableWidth: tableRect.width,
      rowHeight: row.getBoundingClientRect().height, columnWidths,
    };
    event.preventDefault();
    event.stopPropagation();
    document.body.style.cursor = resizeRow ? 'row-resize' : 'col-resize';
    this.tableResizeAbort?.abort();
    this.tableResizeAbort = new AbortController();
    document.addEventListener('pointermove', this.moveTableResize, { signal: this.tableResizeAbort.signal });
    document.addEventListener('pointerup', this.endTableResize, { once: true, signal: this.tableResizeAbort.signal });
    document.addEventListener('pointercancel', this.endTableResize, { once: true, signal: this.tableResizeAbort.signal });
  }

  private readonly moveTableResize = (event: PointerEvent): void => {
    const resize = this.tableResizeState;
    if (!resize) return;
    event.preventDefault();
    if (resize.mode === 'row') {
      resize.row.style.height = `${Math.max(24, resize.rowHeight + event.clientY - resize.startY)}px`;
      return;
    }
    const count = resize.columnWidths.length;
    const neighbor = resize.index < count - 1 ? resize.index + 1 : resize.index - 1;
    if (neighbor < 0) return;
    const delta = (event.clientX - resize.startX) / resize.tableWidth * 100;
    const targetWidth = Math.max(4, Math.min(resize.columnWidths[resize.index] + resize.columnWidths[neighbor] - 4,
      resize.columnWidths[resize.index] + delta));
    const widths = [...resize.columnWidths];
    widths[neighbor] += widths[resize.index] - targetWidth;
    widths[resize.index] = targetWidth;
    let colgroup = Array.from(resize.table.children).find(child => child.tagName === 'COLGROUP') as HTMLTableColElement | undefined;
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      resize.table.insertBefore(colgroup, resize.table.firstChild);
      for (let index = 0; index < count; index++) colgroup.appendChild(document.createElement('col'));
    }
    while (colgroup.children.length < count) colgroup.appendChild(document.createElement('col'));
    widths.forEach((width, index) => (colgroup!.children[index] as HTMLTableColElement).style.width = `${width}%`);
    resize.table.style.tableLayout = 'fixed';
    resize.table.style.width = '100%';
  };

  private readonly endTableResize = (): void => {
    const resize = this.tableResizeState;
    if (!resize) return;
    this.tableResizeState = null;
    this.tableResizeAbort?.abort();
    this.tableResizeAbort = null;
    document.body.style.cursor = '';
    this.editor.commitPageDomToState(resize.pageIndex);
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    this.hooks.scheduleDocumentFlow();
  };

  modifyActiveTable(action: 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable'): void {
    const activeTableCell = this.editor.activeTableCell();
    if (!activeTableCell) return;
    const row = activeTableCell.parentElement as HTMLTableRowElement | null;
    const table = activeTableCell.closest('table');
    if (!row || !table) return;

    this.editor.pushUndoSnapshot();
    const colIndex = Array.from(row.children).indexOf(activeTableCell);

    if (action === 'addRow') {
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      for (const attribute of ['id', 'data-word-flow', 'data-word-continuation', 'data-word-repeat']) newRow.removeAttribute(attribute);
      Array.from(newRow.children).forEach((cell) => {
        for (const attribute of ['id', 'data-word-flow', 'data-word-continuation', 'data-word-repeat']) cell.removeAttribute(attribute);
        cell.replaceChildren(document.createElement('br'));
      });
      row.parentElement?.insertBefore(newRow, row.nextSibling);
    } else if (action === 'addCol') {
      Array.from(table.rows).forEach((tr) => {
        const isHeader = tr.parentElement?.tagName === 'THEAD';
        const cell = document.createElement(isHeader ? 'th' : 'td');
        cell.appendChild(document.createElement('br'));
        const refCell = tr.children[colIndex];
        if (refCell && refCell.nextSibling) {
          tr.insertBefore(cell, refCell.nextSibling);
        } else {
          tr.appendChild(cell);
        }
      });
    } else if (action === 'delRow') {
      const allRows = table.querySelectorAll('tr');
      if (allRows.length <= 1) {
        table.remove();
        this.editor.activeTableCell.set(null);
      } else {
        row.remove();
      }
    } else if (action === 'delCol') {
      const totalCols = row.children.length;
      if (totalCols <= 1) {
        table.remove();
        this.editor.activeTableCell.set(null);
      } else {
        table.querySelectorAll('tr').forEach((tr) => {
          if (tr.children[colIndex]) {
            tr.children[colIndex].remove();
          }
        });
      }
    } else if (action === 'delTable') {
      table.remove();
      this.editor.activeTableCell.set(null);
    }

    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex());
  }

  activeTableToolsVisible(): boolean {
    return this.editor.activeTableCell() !== null && !this.editor.isReadMode();
  }
}
