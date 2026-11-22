import { describe, expect, it } from 'vitest';
import { applyWorkbookOperations, workbookControlField } from './ai-workbook-control';
import type { Sheet } from '../../editor/pure-sheet-editor/models/excel.model';

function sampleWorkbook(): { activeSheetId: string; sheets: Sheet[] } {
  return {
    activeSheetId: 's1',
    sheets: [
      {
        id: 's1',
        name: 'Ventas',
        type: 'grid',
        data: {
          A1: { raw: 'Producto' },
          B1: { raw: 'Unidades' },
          A2: { raw: 'Beta' },
          B2: { raw: '10' },
          A3: { raw: 'Alfa' },
          B3: { raw: '20' },
        },
        conditionalRules: [],
        colWidths: {},
        rowHeights: {},
        charts: [],
        merges: [],
      },
    ],
  };
}

describe('ai-workbook-control advanced operations', () => {
  it('exposes dimensions, conditionalRules and extended operations in workbookControlField', () => {
    const book = sampleWorkbook();
    book.sheets[0].colWidths = { 0: 140 };
    book.sheets[0].rowHeights = { 0: 28 };
    const field = workbookControlField(book);
    const parsed = JSON.parse(field.text);

    expect(field.id).toBe('workbook:control');
    expect(parsed.sheets[0].colWidths).toEqual({ 0: 140 });
    expect(parsed.sheets[0].rowHeights).toEqual({ 0: 28 });
    expect(parsed.operations.some((op: string) => op.startsWith('setRangeStyle('))).toBe(true);
    expect(parsed.operations.some((op: string) => op.startsWith('upsertChart('))).toBe(true);
  });

  it('applies setRangeStyle with outside borders, fillRange numeric sequences, sortRange and findReplace', () => {
    const book = sampleWorkbook();
    const updated = applyWorkbookOperations(
      book,
      JSON.stringify({
        operations: [
          {
            type: 'setRangeStyle',
            sheetId: 's1',
            range: 'A1:B1',
            style: { bold: true, bgColor: '#1e3a8a', textColor: '#ffffff' },
            borderPreset: 'outside',
            borderColor: '#0f172a',
          },
          { type: 'sortRange', sheetId: 's1', range: 'A1:B3', column: 'B', direction: 'desc', hasHeaders: true },
          { type: 'findReplace', sheetId: 's1', query: 'Alfa', replacement: 'Alfa Pro', matchCase: false },
          { type: 'setDimensions', sheetId: 's1', colWidths: { A: 180, B: 120 }, rowHeights: { 0: 32 } },
          { type: 'fillRange', sheetId: 's1', range: 'B2:B4', direction: 'down' },
        ],
      }),
    );

    const sheet = updated.sheets[0];
    expect(sheet.data['A1']?.style?.bold).toBe(true);
    expect(sheet.data['A1']?.style?.borders?.top?.style).toBe('thin');
    expect(sheet.data['A1']?.style?.borders?.left?.style).toBe('thin');
    expect(sheet.data['B1']?.style?.borders?.right?.style).toBe('thin');

    // Sorted descending on column B with header preserved in row 1
    expect(sheet.data['A2']?.raw).toBe('Alfa Pro');
    expect(sheet.data['B2']?.raw).toBe('20');
    expect(sheet.data['B3']?.raw).toBe('10');
    // Arithmetic sequence step -10 continued into B4
    expect(sheet.data['B4']?.raw).toBe('0');

    expect(sheet.colWidths?.[0]).toBe(180);
    expect(sheet.colWidths?.[1]).toBe(120);
    expect(sheet.rowHeights?.[0]).toBe(32);
  });

  it('creates/updates/removes charts, conditional rules, merges and clearRange modes', () => {
    const book = sampleWorkbook();
    const withObjects = applyWorkbookOperations(
      book,
      JSON.stringify({
        operations: [
          { type: 'mergeCells', sheetId: 's1', range: 'C1:D1' },
          {
            type: 'upsertChart',
            sheetId: 's1',
            chart: { id: 'c-sales', category: 'column', subType: 'clusteredColumn', title: 'Ventas', range: 'A1:B3' },
          },
          {
            type: 'addConditionalRule',
            sheetId: 's1',
            rule: { id: 'cond-1', range: 'B2:B3', operator: 'gt', value1: '15', backgroundColor: '#dcfce7' },
          },
          { type: 'clearRange', sheetId: 's1', range: 'A3:B3', mode: 'values' },
        ],
      }),
    );

    const sheet = withObjects.sheets[0];
    expect(sheet.merges).toHaveLength(1);
    expect(sheet.charts).toHaveLength(1);
    expect(sheet.charts![0].title).toBe('Ventas');
    expect(sheet.conditionalRules).toHaveLength(1);
    expect(sheet.data['A3']?.raw).toBe('');

    const cleaned = applyWorkbookOperations(
      withObjects,
      JSON.stringify({
        operations: [
          { type: 'removeChart', sheetId: 's1', chartId: 'c-sales' },
          { type: 'removeConditionalRule', sheetId: 's1', ruleId: 'cond-1' },
          { type: 'unmergeCells', sheetId: 's1', range: 'C1:D1' },
        ],
      }),
    );
    expect(cleaned.sheets[0].charts).toHaveLength(0);
    expect(cleaned.sheets[0].conditionalRules).toHaveLength(0);
    expect(cleaned.sheets[0].merges).toHaveLength(0);
  });
});
