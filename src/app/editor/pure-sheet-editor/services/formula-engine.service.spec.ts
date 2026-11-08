import { describe, it, expect } from 'vitest';
import {
  bindWorkbookFormulaContext,
  findWorksheetReferences,
  colIndexToLetter,
  colLetterToIndex,
  getCellId,
  parseCellId,
  stripDollarSigns,
  cycleFormulaRefAtCursor,
  shiftFormulaReferences,
  applyPointedReferenceToFormula,
  generateSmartFillSeries,
  evaluateCellValue,
  evaluateCellValueCached,
  FormulaCalculationCache,
  evaluateConditionalFormat,
} from './formula-engine.service';
import { Sheet, SheetGrid } from '../models/excel.model';

describe('FormulaEngineService', () => {
  describe('Column & Cell Coordinates', () => {
    it('converts column index to letter and back', () => {
      expect(colIndexToLetter(0)).toBe('A');
      expect(colIndexToLetter(25)).toBe('Z');
      expect(colIndexToLetter(26)).toBe('AA');
      expect(colIndexToLetter(27)).toBe('AB');
      expect(colIndexToLetter(51)).toBe('AZ');
      expect(colIndexToLetter(52)).toBe('BA');

      for (let i = 0; i <= 100; i++) {
        const letter = colIndexToLetter(i);
        expect(colLetterToIndex(letter)).toBe(i);
      }
    });

    it('formats and parses cell IDs properly', () => {
      expect(getCellId(0, 0)).toBe('A1');
      expect(getCellId(2, 4)).toBe('C5');
      expect(getCellId(25, 99)).toBe('Z100');

      expect(parseCellId('A1')).toEqual({ col: 0, row: 0 });
      expect(parseCellId('C5')).toEqual({ col: 2, row: 4 });
      expect(parseCellId('$B$10')).toEqual({ col: 1, row: 9 });
      expect(parseCellId('invalid')).toBeNull();
    });

    it('strips dollar signs from cell coordinates', () => {
      expect(stripDollarSigns('$A$1')).toBe('A1');
      expect(stripDollarSigns('$B2')).toBe('B2');
      expect(stripDollarSigns('C$3')).toBe('C3');
      expect(stripDollarSigns('d4')).toBe('D4');
    });
  });

  describe('F4 Reference Cycling', () => {
    it('cycles reference through absolute, row-locked, col-locked and relative', () => {
      // Relative -> Full absolute ($A$1)
      let res = cycleFormulaRefAtCursor('=A1', 3);
      expect(res.formula).toBe('=$A$1');

      // Full absolute -> Row locked (A$1)
      res = cycleFormulaRefAtCursor(res.formula, res.newCursorPos);
      expect(res.formula).toBe('=A$1');

      // Row locked -> Col locked ($A1)
      res = cycleFormulaRefAtCursor(res.formula, res.newCursorPos);
      expect(res.formula).toBe('=$A1');

      // Col locked -> Relative (A1)
      res = cycleFormulaRefAtCursor(res.formula, res.newCursorPos);
      expect(res.formula).toBe('=A1');
    });

    it('handles range references cycling', () => {
      const res = cycleFormulaRefAtCursor('=SUM(A1:B2)', 7);
      expect(res.formula).toBe('=SUM($A$1:$B$2)');
    });
  });

  describe('Formula Shifting', () => {
    it('shifts relative references with delta offsets', () => {
      expect(shiftFormulaReferences('=A1+B2', 1, 1)).toBe('=B2+C3');
      expect(shiftFormulaReferences('=A1*2', 2, 0)).toBe('=C1*2');
      expect(shiftFormulaReferences('=A1*2', 0, 3)).toBe('=A4*2');
    });

    it('preserves absolute references when shifting', () => {
      expect(shiftFormulaReferences('=$A$1+B2', 2, 2)).toBe('=$A$1+D4');
      expect(shiftFormulaReferences('=A$1+$B2', 1, 1)).toBe('=B$1+$B3');
    });
  });

  describe('Pointed Reference Insertion', () => {
    it('replaces active operand or appends pointed cell', () => {
      expect(applyPointedReferenceToFormula('=', 'B4')).toBe('=B4');
      expect(applyPointedReferenceToFormula('=SUM(', 'C1:C10')).toBe('=SUM(C1:C10');
      expect(applyPointedReferenceToFormula('=A1+', 'B2')).toBe('=A1+B2');
    });
  });

  describe('Smart Fill Series', () => {
    it('generates arithmetic number progression', () => {
      const series = generateSmartFillSeries(
        [{ raw: '10' }, { raw: '20' }],
        3,
        'down'
      );
      expect(series.map((c) => c.raw)).toEqual(['30', '40', '50']);
    });

    it('increments single alphanumeric pattern (e.g., Item 1 -> Item 2)', () => {
      const series = generateSmartFillSeries(
        [{ raw: 'Q1' }],
        3,
        'down'
      );
      expect(series.map((c) => c.raw)).toEqual(['Q2', 'Q3', 'Q4']);
    });

    it('cycles month names in Spanish', () => {
      const series = generateSmartFillSeries(
        [{ raw: 'Enero' }, { raw: 'Febrero' }],
        2,
        'down'
      );
      expect(series.map((c) => c.raw)).toEqual(['Marzo', 'Abril']);
    });

    it('shifts formulas automatically when dragging downwards', () => {
      const series = generateSmartFillSeries(
        [{ raw: '=A1+B1' }],
        2,
        'down'
      );
      expect(series.map((c) => c.raw)).toEqual(['=A2+B2', '=A3+B3']);
    });
  });

  describe('evaluateCellValue', () => {
    it('returns empty string for empty cells and literal values for text/numbers', () => {
      const grid: SheetGrid = {
        A1: { raw: 'Hello World' },
        B1: { raw: '42' },
        C1: { raw: '' },
      };
      expect(evaluateCellValue('A1', grid)).toBe('Hello World');
      expect(evaluateCellValue('B1', grid)).toBe(42);
      expect(evaluateCellValue('C1', grid)).toBe('');
      expect(evaluateCellValue('D1', grid)).toBe('');
    });

    it('evaluates basic arithmetic expressions', () => {
      const grid: SheetGrid = {
        A1: { raw: '=10 + 20 * 2' },
        A2: { raw: '=(10 + 20) * 2' },
        A3: { raw: '=100 / 4 - 5' },
        A4: { raw: '=2 ^ 3' },
      };
      expect(evaluateCellValue('A1', grid)).toBe(50);
      expect(evaluateCellValue('A2', grid)).toBe(60);
      expect(evaluateCellValue('A3', grid)).toBe(20);
      expect(evaluateCellValue('A4', grid)).toBe(8);
    });

    it('evaluates cell references and ranges with SUM, AVERAGE, MIN, MAX', () => {
      const grid: SheetGrid = {
        A1: { raw: '10' },
        A2: { raw: '20' },
        A3: { raw: '30' },
        B1: { raw: '=SUM(A1:A3)' },
        B2: { raw: '=AVERAGE(A1:A3)' },
        B3: { raw: '=MIN(A1:A3)' },
        B4: { raw: '=MAX(A1:A3)' },
        B5: { raw: '=COUNT(A1:A3)' },
      };
      expect(evaluateCellValue('B1', grid)).toBe(60);
      expect(evaluateCellValue('B2', grid)).toBe(20);
      expect(evaluateCellValue('B3', grid)).toBe(10);
      expect(evaluateCellValue('B4', grid)).toBe(30);
      expect(evaluateCellValue('B5', grid)).toBe(3);
    });

    it('supports Spanish formula aliases SUMA, PROMEDIO, CONTAR', () => {
      const grid: SheetGrid = {
        A1: { raw: '5' },
        A2: { raw: '15' },
        B1: { raw: '=SUMA(A1:A2)' },
        B2: { raw: '=PROMEDIO(A1:A2)' },
      };
      expect(evaluateCellValue('B1', grid)).toBe(20);
      expect(evaluateCellValue('B2', grid)).toBe(10);
    });

    it('evaluates IF (SI) conditional statements', () => {
      const grid: SheetGrid = {
        A1: { raw: '85' },
        B1: { raw: '=IF(A1 >= 60, "Aprobado", "Reprobado")' },
        B2: { raw: '=SI(A1 < 50, "Bajo", "Alto")' },
      };
      expect(evaluateCellValue('B1', grid)).toBe('Aprobado');
      expect(evaluateCellValue('B2', grid)).toBe('Alto');
    });

    it('evaluates string functions: CONCATENATE, UPPER, LOWER, TRIM, LEN', () => {
      const grid: SheetGrid = {
        A1: { raw: '  weave  ' },
        B1: { raw: '=TRIM(A1)' },
        B2: { raw: '=UPPER(B1)' },
        B3: { raw: '=LOWER("EXCEL")' },
        B4: { raw: '=LEN("Antigravity")' },
      };
      expect(evaluateCellValue('B1', grid)).toBe('weave');
      expect(evaluateCellValue('B2', grid)).toBe('WEAVE');
      expect(evaluateCellValue('B3', grid)).toBe('excel');
      expect(evaluateCellValue('B4', grid)).toBe(11);
    });

    it('evaluates VLOOKUP (BUSCARV)', () => {
      const grid: SheetGrid = {
        A1: { raw: '101' },
        B1: { raw: 'Teclado' },
        A2: { raw: '102' },
        B2: { raw: 'Mouse' },
        A3: { raw: '103' },
        B3: { raw: 'Monitor' },
        C1: { raw: '=VLOOKUP(102, A1:B3, 2, FALSE)' },
        C2: { raw: '=BUSCARV(103, A1:B3, 2, FALSE)' },
      };
      expect(evaluateCellValue('C1', grid)).toBe('Mouse');
      expect(evaluateCellValue('C2', grid)).toBe('Monitor');
    });

    it('detects circular references and returns #¡REF!', () => {
      const grid: SheetGrid = {
        A1: { raw: '=B1 + 1' },
        B1: { raw: '=A1 + 1' },
      };
      expect(evaluateCellValue('A1', grid)).toBe('#¡REF!');
    });
  });

  describe('evaluateConditionalFormat', () => {
    it('applies greaterThan and lessThan rules correctly', () => {
      const grid: SheetGrid = {
        A1: { raw: '150' },
        A2: { raw: '50' },
      };
      const rules = [
        {
          id: 'r1',
          type: 'greaterThan' as const,
          value1: 100,
          presetStyle: 'good' as const,
          range: { startCol: 0, startRow: 0, endCol: 0, endRow: 1 },
        },
        {
          id: 'r2',
          type: 'lessThan' as const,
          value1: 80,
          presetStyle: 'bad' as const,
          range: { startCol: 0, startRow: 0, endCol: 0, endRow: 1 },
        },
      ];

      const resA1 = evaluateConditionalFormat(0, 0, 150, grid, rules);
      expect(resA1?.preset).toBe('good');

      const resA2 = evaluateConditionalFormat(0, 1, 50, grid, rules);
      expect(resA2?.preset).toBe('bad');
    });

    it('applies equalTo rule for text matching', () => {
      const grid: SheetGrid = { A1: { raw: 'Aprobado' } };
      const rules = [
        {
          id: 'r3',
          type: 'equalTo' as const,
          textValue: 'Aprobado',
          presetStyle: 'good' as const,
          range: { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
        },
      ];
      const res = evaluateConditionalFormat(0, 0, 'Aprobado', grid, rules);
      expect(res?.preset).toBe('good');
    });
  });
});

describe('Cross-sheet workbook formulas', () => {
  function workbook(): Sheet[] {
    const sheets: Sheet[] = [
      { id: 'summary', name: 'Resumen', type: 'grid', data: {} },
      { id: 'sales', name: 'Ventas', type: 'grid', data: { A1: { raw: 'Laptop' }, B1: { raw: '10' }, A2: { raw: 'Mouse' }, B2: { raw: '20' } } },
      { id: 'quoted', name: "O'Brien, S.A.", type: 'grid', data: { A1: { raw: '2' }, A2: { raw: '3' } } },
    ];
    bindWorkbookFormulaContext(sheets); return sheets;
  }
  it('evaluates direct, arithmetic, ranged and lookup references to other worksheets', () => {
    const sheets = workbook(), grid = sheets[0].data;
    grid['A1'] = { raw: '=Ventas!B1' };
    grid['A2'] = { raw: '=Ventas!B1+Ventas!B2*2' };
    grid['A3'] = { raw: '=SUMA(Ventas!B1:B2)' };
    grid['A4'] = { raw: '=BUSCARV("Mouse",Ventas!A1:B2,2,FALSO)' };
    expect(evaluateCellValue('A1', grid)).toBe(10);
    expect(evaluateCellValue('A2', grid)).toBe(50);
    expect(evaluateCellValue('A3', grid)).toBe(30);
    expect(evaluateCellValue('A4', grid)).toBe(20);
  });
  it('supports sheet names containing spaces, apostrophes and argument separators', () => {
    const sheets = workbook();
    sheets[0].data['A1'] = { raw: "=SUMA('O''Brien, S.A.'!A1:A2)" };
    expect(evaluateCellValue('A1', sheets[0].data)).toBe(5);
    expect(findWorksheetReferences('=CONCAT("Ventas!A1",Ventas!B2)').map(ref => ref.token)).toEqual(['Ventas!B2']);
  });
  it('distinguishes cells with the same address on separate sheets and detects cross-sheet cycles', () => {
    const sheets = workbook();
    sheets[0].data['A1'] = { raw: '=Ventas!B1' };
    sheets[1].data['A1'] = { raw: '=Resumen!A1' };
    expect(evaluateCellValue('A1', sheets[1].data)).toBe(10);
    sheets[1].data['B1'] = { raw: '=Resumen!A1' };
    expect(evaluateCellValue('A1', sheets[0].data)).toBe('#¡REF!');
  });
  it('reports missing referenced worksheets instead of silently returning a zero aggregate', () => {
    const sheets = workbook(); sheets[0].data['A1'] = { raw: '=SUMA(Inexistente!A1:A2)' };
    expect(evaluateCellValue('A1', sheets[0].data)).toBe('#¡REF!');
  });
  it('does not alter worksheet names when cycling F4 or shifting copied formulas', () => {
    expect(cycleFormulaRefAtCursor('=Sheet1!A1', null).formula).toBe("='Sheet1'!$A$1");
    expect(shiftFormulaReferences('=Sheet1!A1+$A$1+"A1"', 1, 1)).toBe("='Sheet1'!B2+$A$1+\"A1\"");
  });
  it('reuses dependency results within a workbook revision and recalculates with a fresh cache', () => {
    let reads = 0;
    const grid: SheetGrid = { A1: { get raw() { reads++; return '2'; } }, B1: { raw: '=A1+A1' }, C1: { raw: '=B1+B1' } };
    const cache: FormulaCalculationCache = new WeakMap();
    expect(evaluateCellValueCached('C1', grid, cache)).toBe(8);
    const firstReads = reads;
    expect(evaluateCellValueCached('C1', grid, cache)).toBe(8);
    expect(reads).toBe(firstReads);
    grid['A1'] = { raw: '3' };
    expect(evaluateCellValueCached('C1', grid, new WeakMap())).toBe(12);
  });
  it('allows repeated sibling references without reporting a false cycle', () => {
    expect(evaluateCellValue('B1', { A1: { raw: '=2+1' }, B1: { raw: '=POTENCIA(A1,A1)' } })).toBe(27);
  });
  it('bounds oversized ranges and excessive dependency depth', () => {
    expect(evaluateCellValue('A1', { A1: { raw: '=SUM(B1:B1048576)' } })).toBe('#¡NUM!');
    const grid: SheetGrid = {};
    for (let row = 1; row < 300; row++) grid[`A${row}`] = { raw: `=A${row + 1}` };
    expect(evaluateCellValue('A1', grid)).toBe('#¡NUM!');
  });

  describe('PMT / PAGO', () => {
    const calculate = (formula: string, cells: SheetGrid = {}) => evaluateCellValue('Z1', { ...cells, Z1: { raw: formula } });
    it('matches the Excel loan example with a percentage rate and full argument precision', () => {
      expect(calculate('=PMT(8%/12,10,10000)')).toBeCloseTo(-1037.03208935916, 9);
      expect(calculate('=PMT(8%/12,10,10000,0,1)')).toBeCloseTo(-1030.16432717798, 9);
      expect(calculate('=PAGO(8%/12;10;10000)')).toBeCloseTo(-1037.03208935916, 9);
      expect(calculate('=PMT(0,12,1200)')).toBe(-100);
      expect(calculate('=PMT(0,12,1200,600,1)')).toBe(-150);
    });
    it('supports referenced arguments, future values, signs and omitted optional arguments', () => {
      expect(calculate('=PMT(A1/12,B1,C1)', { A1: { raw: '0.08' }, B1: { raw: '10' }, C1: { raw: '-10000' } })).toBeCloseTo(1037.03208935916, 9);
      expect(calculate('=PMT(0.01,12,0,1200)')).toBeCloseTo(-94.61854641401, 8);
      expect(calculate('=PMT(8%/12,10,10000,,1)')).toBeCloseTo(-1030.16432717798, 9);
    });
    it('handles tiny rates without cancellation and does not round intermediate arithmetic', () => {
      expect(calculate('=PMT(0.000000000000000001,24,1200)')).toBeCloseTo(-50, 10);
      expect(calculate('=1/3')).toBe(1 / 3);
      expect(calculate('=PMT(0.1,100000,1000)')).toBeCloseTo(-100, 10);
    });
    it('reports invalid arguments and preserves reference errors', () => {
      expect(calculate('=PMT(0.01,0,1000)')).toBe('#¡DIV/0!');
      expect(calculate('=PMT(0.01,12,1000,0,2)')).toBe('#¡NUM!');
      expect(calculate('=PMT("texto",12,1000)')).toBe('#¡VALOR!');
      expect(calculate('=PMT(0.01,12)')).toBe('#¡VALOR!');
      expect(calculate('=PMT(0.01,12,1000,0,0,5)')).toBe('#¡VALOR!');
      expect(calculate('=PMT(Falta!A1,12,1000)')).toBe('#¡REF!');
    });
  });

});
