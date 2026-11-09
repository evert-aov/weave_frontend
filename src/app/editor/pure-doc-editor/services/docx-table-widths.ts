import { points } from './docx-formatting';
/** Colgroup conserva las proporciones importadas y los anchos editados, incluidas celdas combinadas. */
export function docxColumnWidths(table: HTMLTableElement, columns: number, totalTwips: number): number[] {
  const weights: number[] = [];
  for (const col of Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'))) {
    const width = col.style.width || col.getAttribute('width') || '';
    const value = width.endsWith('%') ? parseFloat(width) : points(width);
    for (let span = 0; span < (col.span || 1); span++) weights.push(value);
  }
  const valid = weights.length === columns && weights.every(width => Number.isFinite(width) && width > 0);
  const values = valid ? weights : Array.from({ length: columns }, () => 1);
  const sum = values.reduce((total, value) => total + value, 0);
  const result = values.map(value => Math.round(value / sum * totalTwips));
  result[result.length - 1] += totalTwips - result.reduce((total, value) => total + value, 0);
  return result;
}
