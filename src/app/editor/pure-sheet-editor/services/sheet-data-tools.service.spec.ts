import { describe, expect, it } from 'vitest';
import { Sheet } from '../models/excel.model';
import { FormulaCalculationCache } from './formula-engine.service';
import {
  applyTextToColumns,
  buildPivotTableMatrix,
  findWorkbookMatches,
  previewTextToColumns,
  removeDuplicatesFromRange,
  replaceAllWorkbookMatches,
  resolveValidationListOptions,
  validateCellValue,
} from './sheet-data-tools.service';

describe('sheet-data-tools.service', () => {
  it('finds and replaces matches across a single sheet or entire workbook', () => {
    const sheets: Sheet[] = [
      {
        id: 's1',
        name: 'Ventas',
        type: 'grid',
        data: {
          A1: { raw: 'Producto Norte' },
          B1: { raw: '=10+20' },
          A2: { raw: 'norte centro' },
        },
      },
      {
        id: 's2',
        name: 'Resumen',
        type: 'grid',
        data: {
          C3: { raw: 'Zona NORTE' },
        },
      },
    ];
    const cache: FormulaCalculationCache = new WeakMap();

    const singleSheetMatches = findWorkbookMatches(
      sheets,
      's1',
      { query: 'norte', replaceWith: 'Sur', scope: 'sheet', matchCase: false, wholeCell: false, searchIn: 'both' },
      cache
    );
    expect(singleSheetMatches.map((m) => `${m.sheetId}:${m.cellId}`)).toEqual(['s1:A1', 's1:A2']);

    const formulaDisplayMatches = findWorkbookMatches(
      sheets,
      's1',
      { query: '30', replaceWith: '', scope: 'sheet', matchCase: false, wholeCell: true, searchIn: 'display' },
      cache
    );
    expect(formulaDisplayMatches.map((m) => m.cellId)).toEqual(['B1']);

    const replacedAll = replaceAllWorkbookMatches(
      sheets,
      's1',
      { query: 'Norte', replaceWith: 'Sur', scope: 'workbook', matchCase: false, wholeCell: false, searchIn: 'raw' },
      cache
    );
    expect(replacedAll.replacedCount).toBe(3);
    expect(replacedAll.updatedGrids.get('s1')?.['A1'].raw).toBe('Producto Sur');
    expect(replacedAll.updatedGrids.get('s1')?.['A2'].raw).toBe('Sur centro');
    expect(replacedAll.updatedGrids.get('s2')?.['C3'].raw).toBe('Zona Sur');
  });

  it('resolves list options from inline strings or cell ranges and validates inputs', () => {
    const sheets: Sheet[] = [
      {
        id: 's1',
        name: 'Principal',
        type: 'grid',
        data: { A1: { raw: 'Aprobado' } },
      },
      {
        id: 's2',
        name: 'Catalogo',
        type: 'grid',
        data: {
          A1: { raw: 'Borrador' },
          A2: { raw: 'Pendiente' },
          A3: { raw: 'Aprobado' },
        },
      },
    ];
    const cache: FormulaCalculationCache = new WeakMap();

    expect(
      resolveValidationListOptions(
        { type: 'list', formula1: 'Alto, Medio, Bajo, Alto' },
        sheets[0],
        sheets,
        cache
      )
    ).toEqual(['Alto', 'Medio', 'Bajo']);

    const rangeRule = { type: 'list' as const, formula1: '=Catalogo!A1:A3' };
    expect(resolveValidationListOptions(rangeRule, sheets[0], sheets, cache)).toEqual([
      'Borrador',
      'Pendiente',
      'Aprobado',
    ]);
    expect(validateCellValue('Pendiente', rangeRule, sheets[0], sheets, cache, 'es').valid).toBe(true);
    expect(validateCellValue('Otro', rangeRule, sheets[0], sheets, cache, 'es').valid).toBe(false);

    const intRule = { type: 'whole' as const, operator: 'between' as const, formula1: '1', formula2: '10', allowBlank: false };
    expect(validateCellValue('5', intRule, sheets[0], sheets, cache).valid).toBe(true);
    expect(validateCellValue('5.5', intRule, sheets[0], sheets, cache).valid).toBe(false);
    expect(validateCellValue('12', intRule, sheets[0], sheets, cache).valid).toBe(false);
    expect(validateCellValue('', intRule, sheets[0], sheets, cache).valid).toBe(false);
  });

  it('removes duplicate rows within selected columns while preserving headers', () => {
    const grid = {
      A1: { raw: 'Ciudad' },
      B1: { raw: 'Monto' },
      A2: { raw: 'Lima' },
      B2: { raw: '100' },
      A3: { raw: 'Cusco' },
      B3: { raw: '200' },
      A4: { raw: 'lima' },
      B4: { raw: '999' },
    };

    const result = removeDuplicatesFromRange(
      grid,
      { startCol: 0, startRow: 0, endCol: 1, endRow: 3 },
      [0],
      true
    );

    expect(result.removedCount).toBe(1);
    expect(result.remainingCount).toBe(2);
    expect(result.nextGrid['A1'].raw).toBe('Ciudad');
    expect(result.nextGrid['A2'].raw).toBe('Lima');
    expect(result.nextGrid['A3'].raw).toBe('Cusco');
    expect(result.nextGrid['A4']).toBeUndefined();
    expect(result.nextGrid['B4']).toBeUndefined();
  });

  it('previews and splits delimited text across adjacent columns', () => {
    const grid = {
      A1: { raw: 'Ana; Ventas; 1200' },
      A2: { raw: 'Luis; Finanzas; 950' },
    };
    const delimiters = {
      comma: false,
      semicolon: true,
      tab: false,
      space: false,
      custom: '',
      treatConsecutiveAsOne: false,
    };
    const range = { startCol: 0, startRow: 0, endCol: 0, endRow: 1 };

    expect(previewTextToColumns(grid, range, delimiters)).toEqual([
      ['Ana', 'Ventas', '1200'],
      ['Luis', 'Finanzas', '950'],
    ]);

    const applied = applyTextToColumns(grid, range, delimiters);
    expect(applied.rowsProcessed).toBe(2);
    expect(applied.columnsWritten).toBe(3);
    expect(applied.nextGrid['A1'].raw).toBe('Ana');
    expect(applied.nextGrid['B1'].raw).toBe('Ventas');
    expect(applied.nextGrid['C1'].raw).toBe('1200');
    expect(applied.nextGrid['C2'].raw).toBe('950');
  });

  it('builds 1D and 2D pivot table summaries with grand totals', () => {
    const grid = {
      A1: { raw: 'Categoria' },
      B1: { raw: 'Trimestre' },
      C1: { raw: 'Total' },
      A2: { raw: 'Hardware' },
      B2: { raw: 'Q1' },
      C2: { raw: '100' },
      A3: { raw: 'Hardware' },
      B3: { raw: 'Q2' },
      C3: { raw: '150' },
      A4: { raw: 'Software' },
      B4: { raw: 'Q1' },
      C4: { raw: '200' },
    };

    const pivot = buildPivotTableMatrix(
      grid,
      {
        range: { startCol: 0, startRow: 0, endCol: 2, endRow: 3 },
        rowCol: 0,
        colCol: 1,
        valueCol: 2,
        aggregation: 'sum',
        destination: 'newSheet',
      },
      [],
      undefined,
      undefined,
      'es'
    );

    expect(pivot.matrix.map((r) => r.map((c) => c.raw))).toEqual([
      ['Categoria', 'Q1', 'Q2', 'Total general'],
      ['Hardware', '100', '150', '250'],
      ['Software', '200', '', '200'],
      ['Total general', '300', '150', '450'],
    ]);
  });
});
