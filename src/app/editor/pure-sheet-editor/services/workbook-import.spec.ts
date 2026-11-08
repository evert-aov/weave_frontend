import { prepareImportedWorkbook } from './workbook-import';
import { Sheet } from '../models/excel.model';
it('renames colliding workbook names and tables without rewriting strings or column names', () => {
  const existing: Sheet[] = [{ id: 'a', name: 'A', type: 'grid', data: {}, workbookNames: { Tasa: '0.1' }, tables: [{ name: 'Ventas', columns: ['Tasa'], hasHeaders: true, range: { startCol: 0, endCol: 0, startRow: 0, endRow: 2 } }] }];
  const imported: Sheet[] = [{ id: 'b', name: 'B', type: 'grid', data: { A1: { raw: '=Tasa*SUM(Ventas[Tasa])' }, A2: { raw: '=CONCAT("Tasa",Tasa)' } }, workbookNames: { Tasa: '0.2' }, tables: [{ name: 'Ventas', columns: ['Tasa'], hasHeaders: true, range: { startCol: 0, endCol: 0, startRow: 4, endRow: 8 } }] }];
  expect(prepareImportedWorkbook(imported, existing)).toEqual({ Tasa: '0.1', Tasa_2: '0.2' });
  expect(imported[0].tables![0].name).toBe('Ventas_2');
  expect(imported[0].data['A1'].raw).toBe('=Tasa_2*SUM(Ventas_2[Tasa])');
  expect(imported[0].data['A2'].raw).toBe('=CONCAT("Tasa",Tasa_2)');
  expect(existing[0].workbookNames!['Tasa']).toBe('0.1');
});
