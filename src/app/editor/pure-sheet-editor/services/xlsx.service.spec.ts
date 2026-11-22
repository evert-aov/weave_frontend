import { readXlsx, writeXlsx, excelFormula } from './xlsx.service';
import { Sheet } from '../models/excel.model';

describe('XLSX workbook interoperability', () => {
  it('preserves merged perimeter styles without copying the master content into covered cells', async () => {
    const { Workbook } = await import('exceljs');
    const book = new Workbook(), ws = book.addWorksheet('Bordes');
    ws.getCell('A1').value = { formula: 'SUM(1,2)', result: 3 };
    ws.mergeCellsWithoutStyle('A1:C2');
    ws.getCell('A1').border = { top: { style: 'medium', color: { argb: 'FF123456' } } };
    ws.getCell('C1').border = { right: { style: 'thick', color: { argb: 'FF654321' } } };
    ws.getCell('A2').border = { bottom: { style: 'double', color: { argb: 'FFABCDEF' } } };
    const imported = await readXlsx(await book.xlsx.writeBuffer() as ArrayBuffer);
    const assertBorders = (sheet: Sheet) => {
      expect(sheet.data['A1'].raw).toBe('=SUM(1,2)');
      expect(sheet.data['C1'].raw).toBe('');
      expect(sheet.data['A2'].raw).toBe('');
      expect(sheet.data['C1'].style?.borders?.right).toEqual({ style: 'thick', color: '#654321' });
      expect(sheet.data['A2'].style?.borders?.bottom).toEqual({ style: 'double', color: '#ABCDEF' });
      expect(sheet.data['A1'].style?.borders?.top).toEqual({ style: 'medium', color: '#123456' });
    };
    assertBorders(imported[0]);
    assertBorders((await readXlsx((await writeXlsx(imported)).buffer as ArrayBuffer))[0]);
  });

  it('translates supported function aliases without changing strings or sheet names', () => {
    expect(excelFormula('PAGO(A1/12;24;1200)')).toBe('PMT(A1/12,24,1200)');
    expect(excelFormula(`SUMA('SUMA'!A1;SI(B1="SUMA(;";1;0))`)).toBe(`SUM('SUMA'!A1,IF(B1="SUMA(;",1,0))`);
  });

  it('round-trips multiple sheets, formulas, styles, merges, dimensions and freeze panes', async () => {
    const sheets: Sheet[] = [
      { id: 'a', name: 'Ventas 2026', type: 'grid', data: {
        A1: { raw: 'Importe', style: { bold: true, bgColor: '#123456', textColor: '#ffffff', wrapText: true, borders: { bottom: { style: 'double', color: '#ff0000' } } } },
        A2: { raw: '1250.25', style: { numberFormat: 'currency', decimals: 2 } },
        B2: { raw: '0.25', style: { numberFormat: 'percent' } },
        C2: { raw: '00123' }, E2: { raw: '1234', xlsxType: 'text' }, F2: { raw: '2026-11-07T00:00:00.000Z', xlsxType: 'date', style: { xlsxNumberFormat: 'yyyy-mm-dd' } }, D2: { raw: 'texto\ncon salto' },
        A3: { raw: '=SUMA(A2;10)' }, Z20: { raw: '', style: { bgColor: '#FFFF00' } },
      }, merges: [{ startCol: 0, startRow: 0, endCol: 2, endRow: 0 }], colWidths: { 0: 180 }, rowHeights: { 0: 40 }, freezePanes: { rows: 1, cols: 1 } },
      { id: 'b', name: 'Resumen', type: 'grid', data: { A1: { raw: "='Ventas 2026'!A2" } } },
    ];
    const bytes = await writeXlsx(sheets);
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    const imported = await readXlsx(bytes.buffer as ArrayBuffer, ['Ventas 2026']);
    expect(imported.map(s => s.name)).toEqual(['Ventas 2026 (2)', 'Resumen']);
    expect(imported[1].data['A1'].raw).toBe("='Ventas 2026 (2)'!A2");
    const sheet = imported[0];
    expect(sheet.data['A3'].raw).toBe('=SUM(A2,10)');
    expect(sheet.data['A2'].raw).toBe('1250.25');
    expect(sheet.data['C2'].raw).toBe('00123');
    expect(sheet.data['E2'].xlsxType).toBe('text');
    expect(sheet.data['F2'].raw).toBe('2026-11-07T00:00:00.000Z');
    expect(sheet.data['F2'].xlsxType).toBe('date');
    expect(sheet.data['D2'].raw).toBe('texto\ncon salto');
    expect(sheet.data['Z20'].style?.bgColor).toBe('#FFFF00');
    expect(sheet.data['A1'].style).toMatchObject({ bold: true, bgColor: '#123456', textColor: '#FFFFFF', wrapText: true, borders: { bottom: { style: 'double', color: '#FF0000' } } });
    expect(sheet.data['A2'].style).toMatchObject({ numberFormat: 'currency', decimals: 2 });
    expect(sheet.merges).toEqual(sheets[0].merges);
    expect(sheet.colWidths![0]).toBe(180);
    expect(sheet.rowHeights![0]).toBe(40);
    expect(sheet.freezePanes).toBeUndefined();
  }, 30000);

  it('always disables frozen worksheet view on export and ignores frozen views on import', async () => {
    const sheets: Sheet[] = [
      { id: 'a', name: 'Congelada', type: 'grid', data: { A1: { raw: 'Col' } }, freezePanes: { rows: 2, cols: 1 } },
    ];
    const bytes = await writeXlsx(sheets);
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    await book.xlsx.load(bytes.buffer as any);
    const views = book.worksheets[0].views || [];
    expect(views.some(v => v.state === 'frozen')).toBe(false);

    const frozenBook = new Workbook();
    const ws = frozenBook.addWorksheet('FrozenInput');
    ws.getCell('A1').value = 'Dato';
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
    const imported = await readXlsx(await frozenBook.xlsx.writeBuffer() as ArrayBuffer);
    expect(imported[0].freezePanes).toBeUndefined();
  });

  it('rejects malformed files', async () => {
    await expect(readXlsx(new TextEncoder().encode('invalid').buffer)).rejects.toThrow();
  });

  it('round-trips hidden rows/cols, tabColor, comments, validations, conditional rules, hyperlinks (sanitized), and textRotation', async () => {
    const sheets: Sheet[] = [
      {
        id: 'fidelity',
        name: 'Fidelidad',
        type: 'grid',
        tabColor: '#22C55E',
        hiddenCols: [1],
        hiddenRows: [2],
        freezePanes: { rows: 1, cols: 1 },
        data: {
          A1: { raw: 'Encabezado', style: { textRotation: 45, bold: true } },
          B1: { raw: 'OcultaB', style: { textRotation: -45 } },
          C1: { raw: 'Weave App', hyperlink: 'https://weave.app' },
          D1: { raw: 'Unsafe', hyperlink: 'javascript:alert(1)' },
          A2: { raw: '50' },
          A5: { raw: '50' },
        },
        comments: {
          A1: { text: 'Nota de auditoría' },
        },
        validations: {
          C2: { type: 'list', formula1: 'Norte,Sur', allowBlank: true, errorTitle: 'Lista', errorMessage: 'Elige región' },
          A2: { type: 'whole', operator: 'between', formula1: '1', formula2: '100', errorTitle: 'Rango', errorMessage: 'Entre 1 y 100' },
          D2: { type: 'date', operator: 'greaterOrEqual', formula1: '2026-01-01' },
        },
        conditionalRules: [
          { id: 'c1', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'greaterThan', value1: 20, presetStyle: 'good' },
          { id: 'c2', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'containsText', textValue: 'VIP', presetStyle: 'neutral' },
          { id: 'c3', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'duplicates', presetStyle: 'bad' },
          { id: 'c4', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'aboveAverage', presetStyle: 'good' },
          { id: 'c5', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'dataBar', dataBarColor: '#0ea5e9' },
          { id: 'c6', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'colorScale', colorScale: 'red-yellow-green' },
          { id: 'c7', range: { startCol: 0, startRow: 1, endCol: 0, endRow: 4 }, type: 'iconSet', iconSetStyle: 'arrows' },
        ],
      },
    ];

    const bytes = await writeXlsx(sheets);
    const reimported = await readXlsx(bytes.buffer as ArrayBuffer);
    const out = reimported[0];

    expect(out.tabColor).toBe('#22C55E');
    expect(out.freezePanes).toBeUndefined();
    expect(out.hiddenCols).toEqual([1]);
    expect(out.hiddenRows).toEqual([2]);
    expect(out.data['A1'].style?.textRotation).toBe(45);
    expect(out.data['B1'].style?.textRotation).toBe(-45);
    expect(out.data['C1'].raw).toBe('Weave App');
    expect(out.data['C1'].hyperlink).toBe('https://weave.app');
    expect(out.data['D1'].hyperlink).toBeUndefined();
    expect(out.comments?.['A1']?.text).toBe('Nota de auditoría');
    expect(out.validations?.['C2']).toMatchObject({ type: 'list', formula1: 'Norte,Sur', errorTitle: 'Lista', errorMessage: 'Elige región' });
    expect(out.validations?.['A2']).toMatchObject({ type: 'whole', operator: 'between', formula1: '1', formula2: '100' });
    expect(out.validations?.['D2']).toMatchObject({ type: 'date', operator: 'greaterOrEqual', formula1: '2026-01-01' });

    const types = (out.conditionalRules || []).map(r => r.type);
    expect(types).toContain('greaterThan');
    expect(types).toContain('containsText');
    expect(types).toContain('duplicates');
    expect(types).toContain('aboveAverage');
    expect(types).toContain('dataBar');
    expect(types).toContain('colorScale');
    expect(types).toContain('iconSet');
    expect(out.conditionalRules?.find(r => r.type === 'iconSet')?.iconSetStyle).toBe('arrows');
  }, 30000);

  it('round-trips sheet protection, unlocked cells, and collapsed/expanded row & column outline groups', async () => {
    const sheets: Sheet[] = [
      {
        id: 'prot',
        name: 'Protegida',
        type: 'grid',
        protected: true,
        rowGroups: [{ start: 1, end: 2, collapsed: true }],
        colGroups: [{ start: 1, end: 2 }],
        data: {
          A1: { raw: 'Bloqueado' },
          B1: { raw: 'Editable', style: { locked: false } },
          B2: { raw: 'Detalle 1' },
          C3: { raw: 'Detalle 2' },
        },
      },
    ];

    const bytes = await writeXlsx(sheets);
    const [out] = await readXlsx(bytes.buffer as ArrayBuffer);

    expect(out.protected).toBe(true);
    expect(out.data['A1'].style?.locked).toBeUndefined();
    expect(out.data['B1'].style?.locked).toBe(false);
    expect(out.rowGroups).toEqual([{ start: 1, end: 2, collapsed: true }]);
    expect(out.hiddenRows).toEqual([1, 2]);
    expect(out.colGroups).toEqual([{ start: 1, end: 2 }]);
    expect(out.hiddenCols).toBeUndefined();
  }, 30000);

  it('round-trips autoFilter flags and embedded PNG artwork via writeXlsx and readXlsx', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sheets: Sheet[] = [
      {
        id: 'flt',
        name: 'Filtros',
        type: 'grid',
        filtersEnabled: true,
        data: {
          A1: { raw: 'Region' },
          B1: { raw: 'Total' },
          A2: { raw: 'Norte' },
          B2: { raw: '50' },
        },
        artwork: [
          {
            id: 'img-1',
            kind: 'image',
            itemId: 'banner.png',
            imageDataUrl: `data:image/png;base64,${pngBase64}`,
            x: 126,
            y: 54,
            width: 140,
            height: 90,
          },
        ],
      },
    ];

    const bytes = await writeXlsx(sheets);
    const [out] = await readXlsx(bytes.buffer as ArrayBuffer);

    expect(out.filtersEnabled).toBe(true);
    expect(out.artwork).toHaveLength(1);
    expect(out.artwork![0].kind).toBe('image');
    expect(out.artwork![0].imageDataUrl).toContain(pngBase64);
    expect(Math.round(out.artwork![0].x)).toBe(126);
    expect(Math.round(out.artwork![0].y)).toBe(54);
    expect(out.artwork![0].width).toBe(140);
    expect(out.artwork![0].height).toBe(90);
  }, 30000);
});
