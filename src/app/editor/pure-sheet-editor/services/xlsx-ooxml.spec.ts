import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Sheet } from '../models/excel.model';
import { readXlsx, writeXlsx } from './xlsx.service';

describe('xlsx-ooxml native OOXML round-trip (audit parity)', () => {
  it('round-trips sparklines, native PivotTables, vector shapes, outlinePr, images, charts, autoFilter, hyperlinks and protection', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sheets: Sheet[] = [
      {
        id: 'data-sheet',
        name: 'Datos',
        type: 'grid',
        tabColor: '#10B981',
        filtersEnabled: true,
        protected: true,
        rowGroups: [{ start: 1, end: 2, collapsed: false }],
        colGroups: [{ start: 0, end: 1 }],
        definedNames: { MetaMensual: '=$B$2' },
        data: {
          A1: { raw: 'Region' },
          B1: { raw: 'Q1' },
          C1: { raw: 'Q2' },
          D1: { raw: 'Trend' },
          A2: { raw: 'Norte', hyperlink: 'https://weave.app', style: { textRotation: 45, locked: false } },
          B2: { raw: '100' },
          C2: { raw: '150' },
          A3: { raw: 'Sur' },
          B3: { raw: '200' },
          C3: { raw: '120' },
          A4: { raw: 'Total' },
          B4: { raw: '=SUM(B2:B3)' },
          C4: { raw: '=SUM(C2:C3)' },
        },
        comments: { B2: { text: 'Dato validado' } },
        validations: { A2: { type: 'list', formula1: 'Norte,Sur', showDropdown: true } },
        conditionalRules: [
          { id: 'cf-1', range: { startCol: 1, startRow: 1, endCol: 2, endRow: 2 }, type: 'greaterThan', value1: 110, presetStyle: 'good' },
        ],
        sparklines: {
          D2: { type: 'line', sourceRange: { startCol: 1, startRow: 1, endCol: 2, endRow: 1 }, color: '#10B981', showMarkers: true },
          D3: { type: 'winLoss', sourceRange: { startCol: 1, startRow: 2, endCol: 2, endRow: 2 }, color: '#EF4444' },
        },
        artwork: [
          {
            id: 'img-1',
            kind: 'image',
            itemId: 'logo.png',
            imageDataUrl: `data:image/png;base64,${pngBase64}`,
            x: 84,
            y: 48,
            width: 96,
            height: 64,
          },
          {
            id: 'shp-1',
            kind: 'shape',
            itemId: 'block-arrow-right',
            x: 252,
            y: 48,
            width: 120,
            height: 48,
          },
        ],
        charts: [
          {
            id: 'c-1',
            title: 'column',
            chartTitle: 'Comparativo',
            category: 'column',
            subType: 'clusteredColumn',
            range: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 },
            dataConfig: { orientation: 'column', xColumn: 0, seriesColumns: [1, 2], hasHeaders: true, seriesNames: { 1: 'Q1', 2: 'Q2' } },
            appearance: { titlePosition: 'top', titleAlign: 'center', legendPosition: 'bottom' },
            x: 420,
            y: 24,
            width: 360,
            height: 220,
          },
        ],
      },
      {
        id: 'pivot-sheet',
        name: 'Resumen',
        type: 'grid',
        data: {
          A1: { raw: 'Region' },
          B1: { raw: 'Suma de Q1' },
          A2: { raw: 'Norte' },
          B2: { raw: '100' },
          A3: { raw: 'Sur' },
          B3: { raw: '200' },
        },
        pivotTables: [
          {
            id: 'pt-1',
            name: 'TablaDinamica1',
            sourceSheetId: 'data-sheet',
            range: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 },
            rowCol: 0,
            colCol: null,
            valueCol: 1,
            aggregation: 'sum',
            targetRange: { startCol: 0, startRow: 0, endCol: 1, endRow: 2 },
          },
        ],
      },
    ];

    const bytes = await writeXlsx(sheets);
    const files = unzipSync(bytes);

    expect(files['xl/pivotTables/pivotTable1.xml']).toBeDefined();
    expect(files['xl/pivotCache/pivotCacheDefinition1.xml']).toBeDefined();
    expect(files['xl/pivotCache/pivotCacheRecords1.xml']).toBeDefined();
    expect(strFromU8(files['xl/workbook.xml'])).toContain('<pivotCache ');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('<x14:sparklineGroups');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('<outlinePr summaryBelow="1" summaryRight="1"/>');
    expect(strFromU8(files['xl/drawings/drawing1.xml'])).toContain('<xdr:sp ');
    expect(strFromU8(files['xl/drawings/drawing1.xml'])).toContain('<c:chart ');

    const imported = await readXlsx(bytes.buffer as ArrayBuffer);
    const [dataOut, pivotOut] = imported;

    expect(dataOut.filtersEnabled).toBe(true);
    expect(dataOut.protected).toBe(true);
    expect(dataOut.data['A2'].hyperlink).toBe('https://weave.app');
    expect(dataOut.data['A2'].style?.textRotation).toBe(45);
    expect(dataOut.data['A2'].style?.locked).toBe(false);
    expect(dataOut.sparklines?.['D2']).toEqual({
      type: 'line',
      sourceRange: { startCol: 1, startRow: 1, endCol: 2, endRow: 1 },
      color: '#10B981',
      showMarkers: true,
    });
    expect(dataOut.sparklines?.['D3']).toEqual({
      type: 'winLoss',
      sourceRange: { startCol: 1, startRow: 2, endCol: 2, endRow: 2 },
      color: '#EF4444',
    });
    expect(dataOut.charts).toHaveLength(1);
    expect(dataOut.artwork?.some(a => a.kind === 'image')).toBe(true);
    expect(dataOut.artwork?.some(a => a.kind === 'shape' && a.itemId === 'block-arrow-right')).toBe(true);

    expect(pivotOut.pivotTables).toHaveLength(1);
    expect(pivotOut.pivotTables![0]).toMatchObject({
      name: 'TablaDinamica1',
      sourceSheetId: dataOut.id,
      range: { startCol: 0, startRow: 0, endCol: 2, endRow: 2 },
      rowCol: 0,
      colCol: null,
      valueCol: 1,
      aggregation: 'sum',
      targetRange: { startCol: 0, startRow: 0, endCol: 1, endRow: 2 },
    });
  }, 30000);
});
