import {
  CellData,
  CellValidationRule,
  SelectionRange,
  Sheet,
  SheetGrid,
  ValidationOperator,
} from '../models/excel.model';
import {
  bindWorkbookFormulaContext,
  colIndexToLetter,
  evaluateCellValueCached,
  FormulaCalculationCache,
  getCellId,
  parseCellId,
  parseWorksheetReference,
} from './formula-engine.service';

export interface FindReplaceOptions {
  query: string;
  replaceWith: string;
  scope: 'sheet' | 'workbook';
  matchCase: boolean;
  wholeCell: boolean;
  searchIn: 'raw' | 'display' | 'both';
}

export interface FindMatch {
  sheetId: string;
  sheetName: string;
  col: number;
  row: number;
  cellId: string;
  raw: string;
  display: string;
}

export interface TextToColumnsDelimiters {
  comma: boolean;
  semicolon: boolean;
  tab: boolean;
  space: boolean;
  custom: string;
  treatConsecutiveAsOne: boolean;
}

export type PivotAggregation = 'sum' | 'count' | 'average' | 'min' | 'max';

export interface PivotTableConfig {
  range: SelectionRange;
  rowCol: number;
  colCol: number | null;
  valueCol: number;
  aggregation: PivotAggregation;
  destination: 'newSheet' | 'currentSheet';
  targetCell?: { col: number; row: number };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRange(range: SelectionRange) {
  return {
    minCol: Math.min(range.startCol, range.endCol),
    maxCol: Math.max(range.startCol, range.endCol),
    minRow: Math.min(range.startRow, range.endRow),
    maxRow: Math.max(range.startRow, range.endRow),
  };
}

function textMatches(candidate: string, query: string, matchCase: boolean, wholeCell: boolean): boolean {
  if (!query) return false;
  const lhs = matchCase ? candidate : candidate.toLowerCase();
  const rhs = matchCase ? query : query.toLowerCase();
  return wholeCell ? lhs === rhs : lhs.includes(rhs);
}

function evalGridCell(
  cellId: string,
  grid: SheetGrid,
  cache?: FormulaCalculationCache,
  sheets: Sheet[] = []
): string | number {
  if (sheets.length) bindWorkbookFormulaContext(sheets);
  return evaluateCellValueCached(cellId, grid, cache ?? new WeakMap());
}

function evaluateDisplay(
  cellId: string,
  sheet: Sheet,
  sheets: Sheet[],
  cache?: FormulaCalculationCache
): string {
  const val = evalGridCell(cellId, sheet.data, cache, sheets);
  return String(val ?? '');
}

export function findWorkbookMatches(
  sheets: Sheet[],
  activeSheetId: string,
  options: FindReplaceOptions,
  cache?: FormulaCalculationCache
): FindMatch[] {
  const query = options.query;
  if (!query) return [];
  const targets =
    options.scope === 'workbook'
      ? sheets.filter((s) => s.type === 'grid')
      : sheets.filter((s) => s.id === activeSheetId && s.type === 'grid');

  const matches: FindMatch[] = [];
  for (const sheet of targets) {
    const coords: { id: string; col: number; row: number }[] = [];
    for (const id of Object.keys(sheet.data || {})) {
      const parsed = parseCellId(id);
      if (parsed) coords.push({ id, col: parsed.col, row: parsed.row });
    }
    coords.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));

    for (const entry of coords) {
      const cell = sheet.data[entry.id];
      if (!cell) continue;
      const raw = String(cell.raw ?? '');
      const display = raw.startsWith('=')
        ? evaluateDisplay(entry.id, sheet, sheets, cache)
        : raw;

      const matched =
        (options.searchIn === 'raw' && textMatches(raw, query, options.matchCase, options.wholeCell)) ||
        (options.searchIn === 'display' && textMatches(display, query, options.matchCase, options.wholeCell)) ||
        (options.searchIn === 'both' &&
          (textMatches(raw, query, options.matchCase, options.wholeCell) ||
            textMatches(display, query, options.matchCase, options.wholeCell)));

      if (matched) {
        matches.push({
          sheetId: sheet.id,
          sheetName: sheet.name,
          col: entry.col,
          row: entry.row,
          cellId: entry.id,
          raw,
          display,
        });
      }
    }
  }
  return matches;
}

export function computeReplacedCellRaw(
  raw: string,
  options: Pick<FindReplaceOptions, 'query' | 'replaceWith' | 'matchCase' | 'wholeCell'>
): string {
  if (!options.query) return raw;
  if (options.wholeCell) {
    return textMatches(raw, options.query, options.matchCase, true) ? options.replaceWith : raw;
  }
  const regex = new RegExp(escapeRegExp(options.query), options.matchCase ? 'g' : 'gi');
  return raw.replace(regex, options.replaceWith);
}

export function replaceAllWorkbookMatches(
  sheets: Sheet[],
  activeSheetId: string,
  options: FindReplaceOptions,
  cache?: FormulaCalculationCache
): { updatedGrids: Map<string, SheetGrid>; replacedCount: number } {
  const matches = findWorkbookMatches(sheets, activeSheetId, options, cache);
  const updatedGrids = new Map<string, SheetGrid>();
  let replacedCount = 0;

  for (const m of matches) {
    const sheet = sheets.find((s) => s.id === m.sheetId);
    if (!sheet) continue;
    let nextGrid = updatedGrids.get(m.sheetId);
    if (!nextGrid) {
      nextGrid = { ...(sheet.data || {}) };
      updatedGrids.set(m.sheetId, nextGrid);
    }
    const existing = nextGrid[m.cellId];
    if (!existing) continue;
    const raw = String(existing.raw ?? '');
    const nextRaw = computeReplacedCellRaw(raw, options);
    if (nextRaw !== raw || options.wholeCell) {
      nextGrid[m.cellId] = {
        ...existing,
        raw: nextRaw,
      };
      replacedCount += 1;
    }
  }

  return { updatedGrids, replacedCount };
}

export function resolveValidationListOptions(
  rule: CellValidationRule | undefined,
  activeSheet: Sheet,
  sheets: Sheet[],
  cache?: FormulaCalculationCache
): string[] {
  if (!rule || rule.type !== 'list' || !rule.formula1) return [];
  const source = rule.formula1.trim();
  if (!source) return [];

  if (source.startsWith('=')) {
    const parsed = parseWorksheetReference(source.slice(1).trim());
    if (parsed) {
      const targetSheet = parsed.sheetName
        ? sheets.find((s) => s.name.toLowerCase() === parsed.sheetName!.toLowerCase()) || activeSheet
        : activeSheet;
      const start = parseCellId(parsed.start);
      const end = parseCellId(parsed.end || parsed.start);
      if (start && end && targetSheet) {
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const values: string[] = [];
        const seen = new Set<string>();
        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const cellId = getCellId(c, r);
            const raw = targetSheet.data?.[cellId]?.raw;
            if (raw === undefined || raw === '') continue;
            const val = String(evalGridCell(cellId, targetSheet.data, cache, sheets) ?? '').trim();
            if (val !== '' && !seen.has(val)) {
              seen.add(val);
              values.push(val);
            }
          }
        }
        return values;
      }
    }
  }

  const separator = source.includes(';') && !source.includes(',') ? ';' : ',';
  const items: string[] = [];
  const seen = new Set<string>();
  for (const part of source.split(separator)) {
    const clean = part.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      items.push(clean);
    }
  }
  return items;
}

function compareNumericCondition(value: number, operator: ValidationOperator, v1: number, v2?: number): boolean {
  switch (operator) {
    case 'between':
      return v2 !== undefined ? value >= Math.min(v1, v2) && value <= Math.max(v1, v2) : false;
    case 'notBetween':
      return v2 !== undefined ? value < Math.min(v1, v2) || value > Math.max(v1, v2) : false;
    case 'equalTo':
      return value === v1;
    case 'notEqualTo':
      return value !== v1;
    case 'greaterThan':
      return value > v1;
    case 'lessThan':
      return value < v1;
    case 'greaterOrEqual':
      return value >= v1;
    case 'lessOrEqual':
      return value <= v1;
  }
}

export function validateCellValue(
  rawValue: string,
  rule: CellValidationRule | undefined,
  activeSheet: Sheet,
  sheets: Sheet[],
  cache?: FormulaCalculationCache,
  lang: 'es' | 'en' = 'es'
): { valid: boolean; title?: string; message?: string } {
  if (!rule || rule.type === 'any') return { valid: true };
  const trimmed = rawValue.trim();
  if (trimmed === '') {
    if (rule.allowBlank !== false) return { valid: true };
    return {
      valid: false,
      title: rule.errorTitle || (lang === 'es' ? 'Valor requerido' : 'Value required'),
      message: rule.errorMessage || (lang === 'es' ? 'Esta celda no permite valores vacíos.' : 'This cell cannot be left blank.'),
    };
  }

  // Formulas compute dynamically; skip strict literal input rejection if user enters a formula
  if (trimmed.startsWith('=')) return { valid: true };

  const fail = (fallbackEs: string, fallbackEn: string) => ({
    valid: false,
    title: rule.errorTitle || (lang === 'es' ? 'Valor no válido' : 'Invalid value'),
    message: rule.errorMessage || (lang === 'es' ? fallbackEs : fallbackEn),
  });

  if (rule.type === 'list') {
    const options = resolveValidationListOptions(rule, activeSheet, sheets, cache);
    if (!options.length || options.includes(trimmed)) return { valid: true };
    return fail(
      `El valor debe ser una de las opciones permitidas (${options.slice(0, 5).join(', ')}${options.length > 5 ? '...' : ''}).`,
      `Value must match one of the allowed list options.`
    );
  }

  const operator: ValidationOperator = rule.operator || 'between';

  if (rule.type === 'whole' || rule.type === 'decimal') {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return fail('Introduce un número válido.', 'Enter a valid number.');
    }
    if (rule.type === 'whole' && !Number.isInteger(num)) {
      return fail('Introduce un número entero.', 'Enter a whole number.');
    }
    const v1 = Number(rule.formula1 ?? '');
    const v2 = rule.formula2 !== undefined && rule.formula2 !== '' ? Number(rule.formula2) : undefined;
    if (!Number.isFinite(v1)) return { valid: true };
    if (!compareNumericCondition(num, operator, v1, v2)) {
      return fail('El número está fuera de la regla de validación configurada.', 'The number violates the configured validation rule.');
    }
    return { valid: true };
  }

  if (rule.type === 'textLength') {
    const len = trimmed.length;
    const v1 = Number(rule.formula1 ?? '');
    const v2 = rule.formula2 !== undefined && rule.formula2 !== '' ? Number(rule.formula2) : undefined;
    if (!Number.isFinite(v1)) return { valid: true };
    if (!compareNumericCondition(len, operator, v1, v2)) {
      return fail('La longitud del texto no cumple la regla de validación.', 'Text length violates the configured validation rule.');
    }
    return { valid: true };
  }

  if (rule.type === 'date') {
    const ts = Date.parse(trimmed);
    if (!Number.isFinite(ts)) {
      return fail('Introduce una fecha válida (por ejemplo AAAA-MM-DD).', 'Enter a valid date (for example YYYY-MM-DD).');
    }
    const t1 = Date.parse((rule.formula1 || '').trim());
    const t2 = rule.formula2 ? Date.parse(rule.formula2.trim()) : undefined;
    if (!Number.isFinite(t1)) return { valid: true };
    if (!compareNumericCondition(ts, operator, t1, Number.isFinite(t2) ? t2 : undefined)) {
      return fail('La fecha no cumple la regla de validación configurada.', 'Date violates the configured validation rule.');
    }
    return { valid: true };
  }

  return { valid: true };
}

export function removeDuplicatesFromRange(
  grid: SheetGrid,
  range: SelectionRange,
  keyColumns: number[],
  hasHeaders: boolean,
  sheets: Sheet[] = [],
  activeSheet?: Sheet,
  cache?: FormulaCalculationCache
): { nextGrid: SheetGrid; removedCount: number; remainingCount: number } {
  const { minCol, maxCol, minRow, maxRow } = normalizeRange(range);
  const cols = keyColumns.length
    ? keyColumns.filter((c) => c >= minCol && c <= maxCol)
    : Array.from({ length: maxCol - minCol + 1 }, (_, idx) => minCol + idx);

  const dataStartRow = hasHeaders ? minRow + 1 : minRow;
  if (dataStartRow > maxRow || !cols.length) {
    return { nextGrid: { ...grid }, removedCount: 0, remainingCount: 0 };
  }

  const seen = new Set<string>();
  const keptRows: (CellData | undefined)[][] = [];
  let removedCount = 0;

  for (let r = dataStartRow; r <= maxRow; r++) {
    const keyParts: string[] = [];
    let rowEmpty = true;
    for (let c = minCol; c <= maxCol; c++) {
      if ((grid[getCellId(c, r)]?.raw ?? '') !== '') rowEmpty = false;
    }

    for (const c of cols) {
      const id = getCellId(c, r);
      const val = activeSheet
        ? evalGridCell(id, grid, cache, sheets)
        : (grid[id]?.raw ?? '');
      keyParts.push(String(val ?? '').trim().toLowerCase());
    }

    const rowData: (CellData | undefined)[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      rowData.push(grid[getCellId(c, r)]);
    }

    if (rowEmpty) {
      keptRows.push(rowData);
      continue;
    }

    const signature = JSON.stringify(keyParts);
    if (seen.has(signature)) {
      removedCount += 1;
    } else {
      seen.add(signature);
      keptRows.push(rowData);
    }
  }

  const nextGrid: SheetGrid = { ...grid };
  for (let r = dataStartRow; r <= maxRow; r++) {
    const keptIdx = r - dataStartRow;
    const rowData = keptIdx < keptRows.length ? keptRows[keptIdx] : null;
    for (let c = minCol; c <= maxCol; c++) {
      const id = getCellId(c, r);
      const cell = rowData ? rowData[c - minCol] : undefined;
      if (cell) nextGrid[id] = { ...cell, style: cell.style ? { ...cell.style } : undefined };
      else delete nextGrid[id];
    }
  }

  return {
    nextGrid,
    removedCount,
    remainingCount: keptRows.filter((row) => row.some((cell) => (cell?.raw ?? '') !== '')).length,
  };
}

export function splitTextByDelimiters(text: string, options: TextToColumnsDelimiters): string[] {
  const separators: string[] = [];
  if (options.comma) separators.push(',');
  if (options.semicolon) separators.push(';');
  if (options.tab) separators.push('\t');
  if (options.space) separators.push(' ');
  if (options.custom) {
    for (const ch of options.custom) {
      if (!separators.includes(ch)) separators.push(ch);
    }
  }
  if (!separators.length) return [text];
  const escaped = separators.map((s) => escapeRegExp(s)).join('');
  const pattern = options.treatConsecutiveAsOne ? `[${escaped}]+` : `[${escaped}]`;
  return text.split(new RegExp(pattern)).map((part) => part.trim());
}

export function previewTextToColumns(
  grid: SheetGrid,
  range: SelectionRange,
  options: TextToColumnsDelimiters,
  maxRows = 6,
  sheets: Sheet[] = [],
  activeSheet?: Sheet,
  cache?: FormulaCalculationCache
): string[][] {
  const { minCol, minRow, maxRow } = normalizeRange(range);
  const rows: string[][] = [];
  const limit = Math.min(maxRow, minRow + maxRows - 1);
  for (let r = minRow; r <= limit; r++) {
    const id = getCellId(minCol, r);
    const raw = grid[id]?.raw ?? '';
    const display =
      raw.startsWith('=') && activeSheet
        ? String(evalGridCell(id, grid, cache, sheets) ?? '')
        : raw;
    rows.push(splitTextByDelimiters(display, options));
  }
  return rows;
}

export function applyTextToColumns(
  grid: SheetGrid,
  range: SelectionRange,
  options: TextToColumnsDelimiters,
  sheets: Sheet[] = [],
  activeSheet?: Sheet,
  cache?: FormulaCalculationCache
): { nextGrid: SheetGrid; rowsProcessed: number; columnsWritten: number } {
  const { minCol, minRow, maxRow } = normalizeRange(range);
  const nextGrid: SheetGrid = { ...grid };
  let rowsProcessed = 0;
  let columnsWritten = 1;

  for (let r = minRow; r <= maxRow; r++) {
    const sourceId = getCellId(minCol, r);
    const sourceCell = grid[sourceId];
    const raw = sourceCell?.raw ?? '';
    if (!raw) continue;
    const text =
      raw.startsWith('=') && activeSheet
        ? String(evalGridCell(sourceId, grid, cache, sheets) ?? '')
        : raw;
    const parts = splitTextByDelimiters(text, options);
    columnsWritten = Math.max(columnsWritten, parts.length);
    rowsProcessed += 1;
    parts.forEach((part, offset) => {
      const targetId = getCellId(minCol + offset, r);
      const baseStyle = offset === 0 ? sourceCell?.style : nextGrid[targetId]?.style;
      nextGrid[targetId] = {
        ...(nextGrid[targetId] || {}),
        raw: part,
        ...(baseStyle ? { style: { ...baseStyle } } : {}),
      };
    });
  }

  return { nextGrid, rowsProcessed, columnsWritten };
}

export function extractPivotHeaders(
  grid: SheetGrid,
  range: SelectionRange,
  sheets: Sheet[] = [],
  activeSheet?: Sheet,
  cache?: FormulaCalculationCache
): { col: number; label: string }[] {
  const { minCol, maxCol, minRow } = normalizeRange(range);
  const headers: { col: number; label: string }[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    const id = getCellId(c, minRow);
    const raw = activeSheet
      ? String(evalGridCell(id, grid, cache, sheets) ?? '').trim()
      : String(grid[id]?.raw ?? '').trim();
    headers.push({
      col: c,
      label: raw || `Columna ${colIndexToLetter(c)}`,
    });
  }
  return headers;
}

function aggregateBucket(values: number[], totalEntries: number, mode: PivotAggregation): number | '' {
  if (mode === 'count') return totalEntries;
  if (!values.length) return '';
  if (mode === 'sum') return values.reduce((a, b) => a + b, 0);
  if (mode === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
  if (mode === 'min') return Math.min(...values);
  return Math.max(...values);
}

function formatPivotNumber(val: number | ''): string {
  if (val === '') return '';
  const rounded = Math.abs(val - Math.round(val)) < 1e-9 ? Math.round(val) : Math.round(val * 100) / 100;
  return String(rounded);
}

export function buildPivotTableMatrix(
  grid: SheetGrid,
  config: PivotTableConfig,
  sheets: Sheet[] = [],
  activeSheet?: Sheet,
  cache?: FormulaCalculationCache,
  lang: 'es' | 'en' = 'es'
): { matrix: CellData[][]; colWidths: Record<number, number>; rowLabelsCount: number; colLabelsCount: number } {
  const { minRow, maxRow } = normalizeRange(config.range);
  const headers = extractPivotHeaders(grid, config.range, sheets, activeSheet, cache);
  const rowHeaderLabel = headers.find((h) => h.col === config.rowCol)?.label || colIndexToLetter(config.rowCol);
  const valHeaderLabel = headers.find((h) => h.col === config.valueCol)?.label || colIndexToLetter(config.valueCol);

  const aggPrefixMap: Record<PivotAggregation, string> =
    lang === 'es'
      ? { sum: 'Suma de', count: 'Cuenta de', average: 'Promedio de', min: 'Mín de', max: 'Máx de' }
      : { sum: 'Sum of', count: 'Count of', average: 'Average of', min: 'Min of', max: 'Max of' };

  const rowKeys: string[] = [];
  const rowSeen = new Set<string>();
  const colKeys: string[] = [];
  const colSeen = new Set<string>();

  interface Bucket {
    nums: number[];
    count: number;
  }
  const buckets = new Map<string, Bucket>();
  const rowTotals = new Map<string, Bucket>();
  const colTotals = new Map<string, Bucket>();
  const grandTotal: Bucket = { nums: [], count: 0 };

  const addSample = (bucket: Bucket, rawVal: string | number) => {
    const str = String(rawVal ?? '').trim();
    if (str !== '') bucket.count += 1;
    const num = typeof rawVal === 'number' ? rawVal : Number(str.replace(/,/g, ''));
    if (str !== '' && Number.isFinite(num)) bucket.nums.push(num);
  };

  const getOrCreateBucket = (map: Map<string, Bucket>, key: string): Bucket => {
    let b = map.get(key);
    if (!b) {
      b = { nums: [], count: 0 };
      map.set(key, b);
    }
    return b;
  };

  for (let r = minRow + 1; r <= maxRow; r++) {
    const rowId = getCellId(config.rowCol, r);
    const rowRaw = activeSheet
      ? evalGridCell(rowId, grid, cache, sheets)
      : (grid[rowId]?.raw ?? '');
    const rowKey = String(rowRaw ?? '').trim() || (lang === 'es' ? '(En blanco)' : '(Blank)');

    const valId = getCellId(config.valueCol, r);
    const valRaw = activeSheet
      ? evalGridCell(valId, grid, cache, sheets)
      : (grid[valId]?.raw ?? '');

    if (!rowSeen.has(rowKey)) {
      rowSeen.add(rowKey);
      rowKeys.push(rowKey);
    }

    const rowBucket = getOrCreateBucket(rowTotals, rowKey);
    addSample(rowBucket, valRaw);
    addSample(grandTotal, valRaw);

    if (config.colCol !== null) {
      const colId = getCellId(config.colCol, r);
      const colRaw = activeSheet
        ? evalGridCell(colId, grid, cache, sheets)
        : (grid[colId]?.raw ?? '');
      const colKey = String(colRaw ?? '').trim() || (lang === 'es' ? '(En blanco)' : '(Blank)');
      if (!colSeen.has(colKey)) {
        colSeen.add(colKey);
        colKeys.push(colKey);
      }
      addSample(getOrCreateBucket(buckets, `${rowKey}\u0000${colKey}`), valRaw);
      addSample(getOrCreateBucket(colTotals, colKey), valRaw);
    }
  }

  const headerStyle = { bold: true, bgColor: '#e2e8f0', textColor: '#0f172a', border: true };
  const totalStyle = { bold: true, bgColor: '#f1f5f9', textColor: '#0f172a', border: true };
  const bodyStyle = { border: true };
  const numStyle = { border: true, align: 'right' as const, numberFormat: 'comma' as const };
  const totalNumStyle = { ...totalStyle, align: 'right' as const, numberFormat: 'comma' as const };
  const grandLabel = lang === 'es' ? 'Total general' : 'Grand Total';

  const matrix: CellData[][] = [];
  if (config.colCol === null) {
    matrix.push([
      { raw: rowHeaderLabel, style: headerStyle },
      { raw: `${aggPrefixMap[config.aggregation]} ${valHeaderLabel}`, style: headerStyle },
    ]);
    for (const rk of rowKeys) {
      const b = rowTotals.get(rk) || { nums: [], count: 0 };
      matrix.push([
        { raw: rk, style: bodyStyle },
        { raw: formatPivotNumber(aggregateBucket(b.nums, b.count, config.aggregation)), style: numStyle },
      ]);
    }
    matrix.push([
      { raw: grandLabel, style: totalStyle },
      { raw: formatPivotNumber(aggregateBucket(grandTotal.nums, grandTotal.count, config.aggregation)), style: totalNumStyle },
    ]);
  } else {
    matrix.push([
      { raw: rowHeaderLabel, style: headerStyle },
      ...colKeys.map((ck) => ({ raw: ck, style: headerStyle })),
      { raw: grandLabel, style: headerStyle },
    ]);
    for (const rk of rowKeys) {
      const rowCells: CellData[] = [{ raw: rk, style: bodyStyle }];
      for (const ck of colKeys) {
        const b = buckets.get(`${rk}\u0000${ck}`) || { nums: [], count: 0 };
        rowCells.push({
          raw: formatPivotNumber(aggregateBucket(b.nums, b.count, config.aggregation)),
          style: numStyle,
        });
      }
      const rb = rowTotals.get(rk) || { nums: [], count: 0 };
      rowCells.push({
        raw: formatPivotNumber(aggregateBucket(rb.nums, rb.count, config.aggregation)),
        style: totalNumStyle,
      });
      matrix.push(rowCells);
    }
    matrix.push([
      { raw: grandLabel, style: totalStyle },
      ...colKeys.map((ck) => {
        const cb = colTotals.get(ck) || { nums: [], count: 0 };
        return {
          raw: formatPivotNumber(aggregateBucket(cb.nums, cb.count, config.aggregation)),
          style: totalNumStyle,
        };
      }),
      {
        raw: formatPivotNumber(aggregateBucket(grandTotal.nums, grandTotal.count, config.aggregation)),
        style: totalNumStyle,
      },
    ]);
  }

  const colWidths: Record<number, number> = {};
  const colCount = matrix[0]?.length || 0;
  for (let c = 0; c < colCount; c++) {
    let maxLen = 10;
    for (const row of matrix) {
      maxLen = Math.max(maxLen, (row[c]?.raw || '').length);
    }
    colWidths[c] = Math.min(260, Math.max(96, maxLen * 8 + 20));
  }

  return {
    matrix,
    colWidths,
    rowLabelsCount: rowKeys.length,
    colLabelsCount: colKeys.length,
  };
}
