import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { mergeTableCells, tableCellGrid, tableMergePlan, safeTableRowBreak } from './table-cell-grid';
import { createDocxBlob } from '../services/docx-export';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';

function table(html: string): HTMLTableElement {
  const el = document.createElement('table'); el.innerHTML = html; document.body.appendChild(el); return el;
}
afterEach(() => document.body.replaceChildren());

describe('Word merged table cells', () => {
  it('expands a selection to include existing merged cells and keeps every value', () => {
    const el = table('<tbody><tr><td colspan="2">A</td><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr></tbody>');
    const cells = Array.from(el.querySelectorAll('td'));
    const plan = tableMergePlan(el, [cells[0], cells[4]])!;
    const anchor = mergeTableCells(plan);
    expect(anchor.rowSpan).toBe(2); expect(anchor.colSpan).toBe(3);
    expect(anchor.textContent).toBe('ABCDE');
    expect(tableCellGrid(el).width).toBe(3);
    expect(safeTableRowBreak(el, 1)).toBe(0);
  });

  it('supports vertical merges across header/body groups and exports real DOCX spans', async () => {
    const el = table('<thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>C</td><td>D</td></tr></tbody>');
    const cells = Array.from(el.querySelectorAll<HTMLTableCellElement>('th,td'));
    mergeTableCells(tableMergePlan(el, cells)!);
    expect(el.tBodies).toHaveLength(1);
    expect(el.querySelector('th')!.textContent).toBe('ABCD');
    const blob = createDocxBlob([{ id: 'a', html: el.outerHTML }], DEFAULT_LAYOUT_CONFIG);
    const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(parts['word/document.xml']);
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:vMerge/>');
    expect(new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror')).toBeNull();
  });
});
