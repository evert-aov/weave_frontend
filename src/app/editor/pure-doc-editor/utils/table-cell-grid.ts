export interface TableCellSlot {
  cell: HTMLTableCellElement; row: number; col: number; rows: number; cols: number;
}
export interface TableCellGrid { rows: TableCellSlot[][]; cells: TableCellSlot[]; width: number; }
export interface TableMergePlan { table: HTMLTableElement; cells: TableCellSlot[]; top: number; left: number; bottom: number; right: number; }

export function tableCellGrid(table: HTMLTableElement): TableCellGrid {
  const rows: TableCellSlot[][] = [], cells: TableCellSlot[] = [];
  const tableRows = Array.from(table.rows);
  tableRows.forEach((row, r) => {
    rows[r] ||= [];
    let c = 0;
    for (const cell of Array.from(row.cells)) {
      while (rows[r][c]) c++;
      const groupRows = tableRows.slice(r).filter(item => item.parentElement === row.parentElement).length;
      const slot = { cell, row: r, col: c, rows: Math.min(cell.rowSpan || groupRows, tableRows.length - r), cols: cell.colSpan || 1 };
      cells.push(slot);
      for (let y = r; y < r + slot.rows; y++) {
        rows[y] ||= [];
        for (let x = c; x < c + slot.cols; x++) rows[y][x] = slot;
      }
      c += slot.cols;
    }
  });
  return { rows, cells, width: Math.max(0, ...rows.map(row => row.length)) };
}

export function tableMergePlan(table: HTMLTableElement, selected: HTMLTableCellElement[]): TableMergePlan | null {
  const grid = tableCellGrid(table), chosen = grid.cells.filter(slot => selected.includes(slot.cell));
  if (chosen.length < 2) return null;
  let top = Math.min(...chosen.map(slot => slot.row)), left = Math.min(...chosen.map(slot => slot.col));
  let bottom = Math.max(...chosen.map(slot => slot.row + slot.rows - 1)), right = Math.max(...chosen.map(slot => slot.col + slot.cols - 1));
  let changed = true;
  while (changed) {
    changed = false;
    for (const slot of grid.cells) {
      if (slot.row > bottom || slot.row + slot.rows - 1 < top || slot.col > right || slot.col + slot.cols - 1 < left) continue;
      const bounds = [Math.min(top, slot.row), Math.min(left, slot.col), Math.max(bottom, slot.row + slot.rows - 1), Math.max(right, slot.col + slot.cols - 1)];
      if (bounds[0] !== top || bounds[1] !== left || bounds[2] !== bottom || bounds[3] !== right) {
        [top, left, bottom, right] = bounds; changed = true;
      }
    }
  }
  for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) if (!grid.rows[r]?.[c]) return null;
  return { table, cells: grid.cells.filter(slot => slot.row >= top && slot.row <= bottom && slot.col >= left && slot.col <= right), top, left, bottom, right };
}

export function mergeTableCells(plan: TableMergePlan): HTMLTableCellElement {
  const anchor = plan.cells.find(slot => slot.row === plan.top && slot.col === plan.left)!.cell;
  const rows = Array.from(plan.table.rows);
  const height = rows.slice(plan.top, plan.bottom + 1).reduce((sum, row) => sum + row.offsetHeight, 0);
  if (new Set(plan.cells.map(slot => slot.cell.parentElement!.parentElement)).size > 1) {
    // HTML rowspans cannot cross row groups. Keep TH elements, but unify the row group.
    const body = document.createElement('tbody'); rows[0].parentElement!.before(body);
    const groups = new Set(rows.map(row => row.parentElement!));
    rows.forEach(row => body.appendChild(row));
    groups.forEach(group => { if (!group.children.length) group.remove(); });
  }
  for (const slot of plan.cells) {
    if (slot.cell === anchor) continue;
    const cell = slot.cell;
    if (cell.textContent?.trim() || cell.querySelector('img,table,svg,video,iframe')) {
      const block = document.createElement(cell.querySelector('p,div,ul,ol,table') ? 'div' : 'p');
      block.style.margin = '0';
      for (const property of ['text-align', 'font-family', 'font-size', 'font-weight', 'font-style', 'color']) {
        const value = cell.style.getPropertyValue(property); if (value) block.style.setProperty(property, value);
      }
      block.append(...Array.from(cell.childNodes)); anchor.appendChild(block);
    }
    cell.remove();
  }
  anchor.rowSpan = plan.bottom - plan.top + 1; anchor.colSpan = plan.right - plan.left + 1;
  if (height) anchor.style.height = `${height}px`;
  return anchor;
}

/** A vertical merge must stay on one page, not be cut between its rows. */
export function safeTableRowBreak(table: HTMLTableElement, count: number): number {
  const grid = tableCellGrid(table);
  let previous = -1;
  while (previous !== count) {
    previous = count;
    for (const slot of grid.cells) if (slot.row < count && slot.row + slot.rows > count) count = slot.row;
  }
  return count;
}
