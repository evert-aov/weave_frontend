import { tableCellGrid } from '../utils/table-cell-grid';
import { points } from './docx-formatting';

function parseColumnWidth(width: string): number {
  const trimmed = width.trim();
  if (!trimmed) return 0;
  return trimmed.endsWith('%') ? parseFloat(trimmed) : points(trimmed);
}

function unmergedCellWidths(table: HTMLTableElement, columns: number): number[] {
  const weights = Array.from({ length: columns }, () => 0);
  const grid = tableCellGrid(table);
  for (const row of grid.rows) {
    for (let colIndex = 0; colIndex < columns; colIndex++) {
      const slot = row[colIndex];
      if (!slot || slot.cols !== 1 || weights[colIndex] > 0) continue;
      const value = parseColumnWidth(slot.cell.style.width || slot.cell.getAttribute('width') || '');
      if (Number.isFinite(value) && value > 0) weights[colIndex] = value;
    }
    if (weights.every(width => width > 0)) return weights;
  }
  return [];
}

/** Colgroup conserva las proporciones importadas y los anchos editados, incluidas celdas combinadas. */
export function docxColumnWidths(table: HTMLTableElement, columns: number, totalTwips: number): number[] {
  const weights: number[] = [];
  for (const col of Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col, :scope > col'))) {
    const value = parseColumnWidth(col.style.width || col.getAttribute('width') || '');
    for (let span = 0; span < (col.span || 1); span++) weights.push(value);
  }
  const hasColgroup = weights.length === columns && weights.every(width => Number.isFinite(width) && width > 0);
  const cellWeights = hasColgroup ? [] : unmergedCellWidths(table, columns);
  const values = hasColgroup ? weights : cellWeights.length === columns ? cellWeights : Array.from({ length: columns }, () => 1);
  const sum = values.reduce((total, value) => total + value, 0);
  const result = values.map(value => Math.round(value / sum * totalTwips));
  result[result.length - 1] += totalTwips - result.reduce((total, value) => total + value, 0);
  return result;
}
