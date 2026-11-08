import { bindWorkbookFormulaContext, evaluateCellValue, evaluateCellValueCached, getCellMatrix } from './formula-engine.service';
import { Sheet, SheetGrid } from '../models/excel.model';
const calc = (formula: string, data: SheetGrid = {}) => evaluateCellValue('Z100', { ...data, Z100: { raw: formula } });

describe('Expanded Excel formula compatibility', () => {
  it('parses nested functions, comparisons, concatenation and lazy error branches', () => {
    expect(calc('=SUM(1,2)*2+IF(3>2,4,1/0)')).toBe(10);
    expect(calc('=IFERROR(1/0,"fallback")')).toBe('fallback');
    expect(calc('=SI.ERROR(BUSCARV(4,A1:B1,2,FALSE),"sin dato")', { A1: { raw: '1' }, B1: { raw: '10' } })).toBe('sin dato');
    expect(calc('=IFS(1>2,"a",2>1,"b")')).toBe('b');
    expect(calc('=LEFT("abc",1)&RIGHT("xyz",2)')).toBe('ayz');
  });
  it('supports lookup families and approximate legacy lookup modes', () => {
    const data = { A1: { raw: '10' }, A2: { raw: '20' }, A3: { raw: '30' }, B1: { raw: 'a' }, B2: { raw: 'b' }, B3: { raw: 'c' } };
    expect(calc('=VLOOKUP(25,A1:B3,2,TRUE)', data)).toBe('b');
    expect(calc('=VLOOKUP(25,A1:B3,2,FALSE)', data)).toBe('#N/A');
    expect(calc('=XLOOKUP(25,A1:A3,B1:B3,"missing",-1)', data)).toBe('b');
    expect(calc('=BUSCARX(99,A1:A3,B1:B3,"missing")', data)).toBe('missing');
    expect(calc('=INDEX(B1:B3,MATCH(20,A1:A3,0))', data)).toBe('b');
    expect(calc('=HLOOKUP(20,{10,20,30;100,200,300},2,FALSE)')).toBe(200);
  });
  it('evaluates multiple criteria, wildcards and complete columns without allocating empty cells', () => {
    const data = { A1: { raw: 'Apple' }, A2: { raw: 'Pear' }, A3: { raw: 'Apple' }, B1: { raw: '10' }, B2: { raw: '20' }, B3: { raw: '30' } };
    expect(calc('=SUMIFS(B:B,A:A,"App*",B:B,">15")', data)).toBe(30);
    expect(calc('=COUNTIFS(A:A,"Apple",B:B,">=10")', data)).toBe(2);
    expect(calc('=SUM(A:A)', { A1048576: { raw: '7' } })).toBe(7);
    expect(calc('=SUMIF(A:A,"Apple",B:B)', data)).toBe(40);
    expect(calc('=COUNTIF(A:A,"")', data)).toBe(1048573);
  });
  it('implements Excel date serials, month overflow and business days with holidays', () => {
    expect(calc('=DATE(2024,1,1)')).toBe(45292);
    expect(calc('=YEAR(DATE(2024,13,1))')).toBe(2025);
    expect(calc('=MONTH(EOMONTH(DATE(2024,1,2),1))')).toBe(2);
    expect(calc('=DAY(EOMONTH(DATE(2024,1,2),1))')).toBe(29);
    expect(calc('=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7),{45292})')).toBe(4);
    expect(calc('=TEXT(DATE(2024,2,3),"yyyy-mm-dd")')).toBe('2024-02-03');
  });
  it('implements NPV, IRR, present and future values with cash-flow signs', () => {
    expect(calc('=NPV(10%,3000,4200,6800)-10000')).toBeCloseTo(1307.287753568744, 7);
    expect(calc('=IRR({-100,60,60})')).toBeCloseTo(0.130662386291807, 9);
    expect(calc('=TIR({-100,-60})')).toBe('#¡NUM!');
    expect(calc('=PV(0,12,-100)')).toBe(1200);
    expect(calc('=FV(0,12,-100,-1000)')).toBe(2200);
    expect(calc('=PV(8%/12,10,PMT(8%/12,10,10000))')).toBeCloseTo(10000, 7);
  });
  it('implements text extraction, numeric formats and occurrence-specific substitution', () => {
    expect(calc('=IZQUIERDA("Weave",2)')).toBe('We');
    expect(calc('=MID("Weave",2,3)')).toBe('eav');
    expect(calc('=SUBSTITUTE("a-a-a","a","b",2)')).toBe('a-b-a');
    expect(calc('=TEXT(1234.5,"#,##0.00")')).toBe('1,234.50');
    expect(calc('=TEXT(0.125,"0.0%")')).toBe('12.5%');
  });
  it('spills array functions, supports spill references and reports obstructions', () => {
    const grid: SheetGrid = { A1: { raw: '=SEQUENCE(3,2,1,2)' }, D1: { raw: '=SUM(A1#)' } };
    const cache = new WeakMap();
    expect(evaluateCellValueCached('B3', grid, cache)).toBe(11);
    expect(evaluateCellValueCached('D1', grid, cache)).toBe(36);
    expect(getCellMatrix('A1', grid, cache)?.materialize()).toEqual([[1,3],[5,7],[9,11]]);
    expect(evaluateCellValue('A1', { A1: { raw: '=SEQUENCE(2)' }, A2: { raw: 'occupied' } })).toBe('#¡DESBORDAMIENTO!');
    const filtered: SheetGrid = { A1: { raw: '3' }, A2: { raw: '1' }, A3: { raw: '3' }, C1: { raw: '=SORT(UNIQUE(FILTER(A1:A3,A1:A3>1)))' } };
    expect(evaluateCellValue('C1', filtered)).toBe(3);
  });
  it('resolves defined names and structured table references across worksheets', () => {
    const sheets: Sheet[] = [
      { id: 's', name: 'Datos', type: 'grid', data: { A1: { raw: 'Producto' }, B1: { raw: 'Importe' }, A2: { raw: 'A' }, B2: { raw: '10' }, A3: { raw: 'B' }, B3: { raw: '20' }, C2: { raw: '=Ventas[@Importe]*2' } }, tables: [{ name: 'Ventas', columns: ['Producto','Importe'], range: { startCol: 0, endCol: 1, startRow: 0, endRow: 2 }, hasHeaders: true }], workbookNames: { Ingresos: "'Datos'!B2:B3", Tasa: '=0.1' } },
      { id: 'r', name: 'Resumen', type: 'grid', data: { A1: { raw: '=SUM(Ingresos)+SUM(Ventas[Importe])' }, A2: { raw: '=NPV(Tasa,Ingresos)' } } },
    ];
    bindWorkbookFormulaContext(sheets);
    expect(evaluateCellValue('A1', sheets[1].data)).toBe(60);
    expect(evaluateCellValue('C2', sheets[0].data)).toBe(20);
    expect(evaluateCellValue('A2', sheets[1].data)).toBeCloseTo(25.6198347107, 7);
  });
  it('preserves actual row offsets when looking up complete sparse columns', () => {
    const data = { A50: { raw: '25' }, B50: { raw: 'Found' }, A99: { raw: '30' }, B99: { raw: 'Later' } };
    expect(calc('=XLOOKUP(25,A:A,B:B)', data)).toBe('Found');
    expect(calc('=MATCH(25,A:A,0)', data)).toBe(50);
    expect(calc('=VLOOKUP(26,A:B,2,TRUE)', data)).toBe('Found');
    expect(calc('=XLOOKUP("00123",A1:A2,B1:B2)', { A1: { raw: '00123', xlsxType: 'text' }, A2: { raw: '123' }, B1: { raw: 'ID' }, B2: { raw: 'Number' } })).toBe('ID');
  });

});
