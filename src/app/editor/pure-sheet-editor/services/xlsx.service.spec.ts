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
    expect(sheet.freezePanes).toEqual({ rows: 1, cols: 1 });
  }, 30000);

  it('rejects malformed files', async () => {
    await expect(readXlsx(new TextEncoder().encode('invalid').buffer)).rejects.toThrow();
  });
});
