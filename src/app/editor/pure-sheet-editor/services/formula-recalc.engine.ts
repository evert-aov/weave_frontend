import type { Sheet, SheetGrid, SheetTable } from '../models/excel.model';
import { bindWorkbookFormulaContext, evaluateCellValueCached, FormulaCalculationCache } from './formula-engine.service';

export interface FormulaRecalcCellSnapshot {
  raw: string;
  xlsxType?: 'text' | 'date';
}

export interface FormulaRecalcSheetSnapshot {
  id: string;
  name: string;
  type: 'grid' | 'chart';
  data: Record<string, FormulaRecalcCellSnapshot>;
  definedNames?: Record<string, string>;
  workbookNames?: Record<string, string>;
  tables?: SheetTable[];
}

export interface FormulaRecalcRequest {
  revision: number;
  sheets: FormulaRecalcSheetSnapshot[];
  sheetIds?: string[];
}

export interface FormulaRecalcResult {
  revision: number;
  computedBySheet: Record<string, Array<[string, string | number]>>;
  error?: string;
}

/** Returns true if at least one cell in any grid starts with a formula token (`=`). */
export function hasWorkbookFormulas(sheets: readonly Sheet[]): boolean {
  for (const sheet of sheets) {
    for (const key of Object.keys(sheet.data)) {
      if (sheet.data[key]?.raw?.trim().startsWith('=')) return true;
    }
  }
  return false;
}

/** Extracts a lightweight, structured-clone-safe snapshot containing only formula-relevant fields. */
export function buildFormulaRecalcSnapshot(sheets: readonly Sheet[]): FormulaRecalcSheetSnapshot[] {
  return sheets.map((sheet) => {
    const compactData: Record<string, FormulaRecalcCellSnapshot> = {};
    for (const [id, cell] of Object.entries(sheet.data)) {
      if (!cell || cell.raw === '') continue;
      compactData[id] = cell.xlsxType ? { raw: cell.raw, xlsxType: cell.xlsxType } : { raw: cell.raw };
    }
    return {
      id: sheet.id,
      name: sheet.name,
      type: sheet.type,
      data: compactData,
      ...(sheet.definedNames ? { definedNames: sheet.definedNames } : {}),
      ...(sheet.workbookNames ? { workbookNames: sheet.workbookNames } : {}),
      ...(sheet.tables ? { tables: sheet.tables } : {}),
    };
  });
}

/** Evaluates all formula cells across target sheets using the shared formula engine DAG evaluator. */
export function computeWorkbookFormulas(
  snapshot: FormulaRecalcSheetSnapshot[],
  revision: number,
  sheetIds?: string[],
): FormulaRecalcResult {
  const sheets = snapshot as unknown as Sheet[];
  bindWorkbookFormulaContext(sheets);
  const cache: FormulaCalculationCache = new WeakMap();
  const targetSet = sheetIds?.length ? new Set(sheetIds) : null;
  const computedBySheet: Record<string, Array<[string, string | number]>> = {};

  for (const sheet of sheets) {
    if (targetSet && !targetSet.has(sheet.id)) continue;
    const entries: Array<[string, string | number]> = [];
    const grid = sheet.data as SheetGrid;
    for (const cellId of Object.keys(grid)) {
      const cell = grid[cellId];
      if (!cell?.raw?.trim().startsWith('=')) continue;
      entries.push([cellId, evaluateCellValueCached(cellId, grid, cache)]);
    }
    if (entries.length) {
      computedBySheet[sheet.id] = entries;
    }
  }

  return { revision, computedBySheet };
}
