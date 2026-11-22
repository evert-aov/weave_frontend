import { describe, expect, it } from 'vitest';
import {
  bindWorkbookFormulaContext,
  evaluateCellValueCached,
  FormulaCalculationCache,
  getCellId,
} from './formula-engine.service';
import { Sheet, SheetGrid } from '../models/excel.model';

function measureBatch(ids: string[], grid: SheetGrid): { coldMs: number; cachedMs: number } {
  const cache: FormulaCalculationCache = new WeakMap();
  const t0 = performance.now();
  for (const id of ids) {
    evaluateCellValueCached(id, grid, cache);
  }
  const coldMs = performance.now() - t0;

  const t1 = performance.now();
  for (const id of ids) {
    evaluateCellValueCached(id, grid, cache);
  }
  const cachedMs = performance.now() - t1;

  return {
    coldMs: Number(coldMs.toFixed(2)),
    cachedMs: Number(cachedMs.toFixed(2)),
  };
}

describe('Formula engine main-thread latency benchmark', () => {
  it('measures cold and cached recalculation across small (100), medium (1,000), and heavy (5,000) formula workloads', () => {
    // 1. Small workload: 100 formulas
    const smallGrid: SheetGrid = {};
    const smallIds: string[] = [];
    for (let r = 0; r < 100; r++) {
      const srcId = getCellId(0, r);
      const calcId = getCellId(1, r);
      smallGrid[srcId] = { raw: String(r + 1) };
      smallGrid[calcId] = { raw: r === 0 ? `=${srcId}*1.16` : `=${srcId}+${getCellId(1, r - 1)}` };
      smallIds.push(calcId);
    }
    const smallTiming = measureBatch(smallIds, smallGrid);
    expect(Number(evaluateCellValueCached('B100', smallGrid, new WeakMap()))).toBeGreaterThan(5000);

    // 2. Medium workload: 1,000 formulas with SUMIF & cross-sheet references
    const sheet1Grid: SheetGrid = {};
    const sheet2Grid: SheetGrid = {};
    const mediumIds: string[] = [];
    const categories = ['Ops', 'Sales', 'R&D', 'HR'];
    for (let r = 0; r < 500; r++) {
      const cat = categories[r % categories.length];
      sheet1Grid[getCellId(0, r)] = { raw: cat };
      sheet1Grid[getCellId(1, r)] = { raw: String((r + 1) * 10) };
      const rowTotalId = getCellId(2, r);
      sheet1Grid[rowTotalId] = { raw: `=B${r + 1}*1.21` };
      mediumIds.push(rowTotalId);
    }
    for (let r = 0; r < 500; r++) {
      const cat = categories[r % categories.length];
      const crossId = getCellId(0, r);
      sheet2Grid[crossId] = { raw: `=SUMIF(Datos!A1:A500,"${cat}",Datos!C1:C500)+Datos!C${r + 1}` };
      mediumIds.push(crossId);
    }
    const sheets: Sheet[] = [
      { id: 's1', name: 'Datos', type: 'grid', data: sheet1Grid },
      { id: 's2', name: 'Resumen', type: 'grid', data: sheet2Grid },
    ];
    bindWorkbookFormulaContext(sheets);

    const medCache: FormulaCalculationCache = new WeakMap();
    const m0 = performance.now();
    for (let r = 0; r < 500; r++) evaluateCellValueCached(getCellId(2, r), sheet1Grid, medCache);
    for (let r = 0; r < 500; r++) evaluateCellValueCached(getCellId(0, r), sheet2Grid, medCache);
    const medColdMs = Number((performance.now() - m0).toFixed(2));

    const m1 = performance.now();
    for (let r = 0; r < 500; r++) evaluateCellValueCached(getCellId(2, r), sheet1Grid, medCache);
    for (let r = 0; r < 500; r++) evaluateCellValueCached(getCellId(0, r), sheet2Grid, medCache);
    const medCachedMs = Number((performance.now() - m1).toFixed(2));
    expect(Number(evaluateCellValueCached('A1', sheet2Grid, medCache))).toBeGreaterThan(0);

    // 3. Heavy workload: 5,000 formulas + dynamic SEQUENCE(500, 4)
    const heavyGrid: SheetGrid = {
      Z1: { raw: '=SEQUENCE(500,4,1,2)' },
    };
    const heavyIds: string[] = ['Z1'];
    for (let r = 0; r < 2500; r++) {
      const colA = getCellId(0, r);
      const colB = getCellId(1, r);
      const colC = getCellId(2, r);
      heavyGrid[colA] = { raw: String(r + 1) };
      heavyGrid[colB] = { raw: `=${colA}*2` };
      heavyGrid[colC] = { raw: `=IF(${colB}>1000, ${colB}+10, ${colB}-5)` };
      heavyIds.push(colB, colC);
    }
    const heavyTiming = measureBatch(heavyIds, heavyGrid);
    expect(evaluateCellValueCached('AC500', heavyGrid, new WeakMap())).toBe(3999);

    console.info(
      `[FormulaBenchmark] small(100): cold=${smallTiming.coldMs}ms cached=${smallTiming.cachedMs}ms | ` +
      `medium(1000 SUMIF+cross-sheet): cold=${medColdMs}ms cached=${medCachedMs}ms | ` +
      `heavy(5000+SEQUENCE): cold=${heavyTiming.coldMs}ms cached=${heavyTiming.cachedMs}ms`
    );

    expect(smallTiming.cachedMs).toBeLessThanOrEqual(smallTiming.coldMs + 5);
    expect(medCachedMs).toBeLessThanOrEqual(medColdMs + 5);
    expect(heavyTiming.cachedMs).toBeLessThanOrEqual(heavyTiming.coldMs + 5);
  });
});
