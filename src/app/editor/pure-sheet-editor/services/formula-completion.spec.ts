import { completions, completeValue, formulaSignature } from './formula-completion';
import { Sheet } from '../models/excel.model';
const sheet: Sheet = { id: 's', name: 'Datos', type: 'grid', data: { A1: { raw: 'Laptop' }, A2: { raw: 'Lamp' }, B1: { raw: 'Other column' } }, workbookNames: { Ingresos: 'A1:A2' }, tables: [{ name: 'Ventas', columns: ['Producto','Importe'], hasHeaders: true, range: { startCol: 0, startRow: 0, endCol: 1, endRow: 3 } }] };
const suggest = (text: string, language: 'en' | 'es' = 'es') => completions(text, text.length, sheet.data, 0, 5, [sheet], sheet, language);
describe('Formula and column-text completion', () => {
  it('accepts Spanish/English prefixes and inserts canonical English function names', () => {
    const item = suggest('=BUSCARX')[0];
    expect(item.insert).toBe('XLOOKUP');
    expect(completeValue('=BUSCARX', item)).toEqual({ value: '=XLOOKUP()', caret: 9 });
    expect(formulaSignature('=SUM(PMT(', 9)).toContain('PMT(');
    expect(suggest('=IRR')[0].insert).toBe('IRR');
  });
  it('completes names, tables and their columns, without suggesting inside string literals', () => {
    expect(suggest('=Ing')[0].insert).toBe('Ingresos');
    expect(suggest('=Ven')[0].kind).toBe('table');
    expect(suggest('=Ventas[').map(i => i.label)).toEqual(['Producto','Importe']);
    expect(suggest('=Ventas[Imp')[0].insert).toBe('Importe');
    expect(suggest('=CONCAT("SU')).toEqual([]);
  });
  it('uses existing text from the same column and preserves the source capitalization', () => {
    expect(suggest('La').map(i => i.label)).toEqual(['Laptop','Lamp']);
    expect(completeValue('La', suggest('La')[0]).value).toBe('Laptop');
    expect(suggest('Other')).toEqual([]);
  });
});
