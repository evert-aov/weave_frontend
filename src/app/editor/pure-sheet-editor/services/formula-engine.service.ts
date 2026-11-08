import { CalcArray, CalcError, fail, first, LIMIT, Value } from './calc-types';
import { evaluateTree, parseFormula, mayReturnArray, Node } from './formula-parser';
import { callFunction, dateSerial } from './calc-functions';
import { Injectable } from '@angular/core';
import { CellData, ConditionalRule, PresetStyle, Sheet, SheetGrid } from '../models/excel.model';

const workbookContexts = new WeakMap<SheetGrid, { sheets: Sheet[]; sheetId: string }>();
export function bindWorkbookFormulaContext(sheets: Sheet[]): void {
  for (const sheet of sheets) {
    const context = workbookContexts.get(sheet.data);
    if (context?.sheets !== sheets || context.sheetId !== sheet.id) workbookContexts.set(sheet.data, { sheets, sheetId: sheet.id });
  }
}

const SHEET_NAME_PATTERN = String.raw`(?:'(?:[^']|'')+'|[A-Z0-9_\u00c0-\uffff][A-Z0-9_.\u00c0-\uffff]*)`;
const CELL_PATTERN = String.raw`\$?[A-Z]+\$?[1-9]\d*`;
const COLUMN_PATTERN = String.raw`\$?[A-Z]+`;
const REFERENCE_PATTERN = `(?:(${SHEET_NAME_PATTERN})!)?(${CELL_PATTERN}|${COLUMN_PATTERN}(?=:))(?::(?:(${SHEET_NAME_PATTERN})!)?(${CELL_PATTERN}|${COLUMN_PATTERN}))?`;
export interface WorksheetFormulaReference { sheetName?: string; start: string; end?: string; token: string; index: number; }
const decodeSheetName = (name: string) => name.startsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name;
export function formatWorksheetReference(sheetName: string | undefined, reference: string): string {
  return sheetName === undefined ? reference : `'${sheetName.replace(/'/g, "''")}'!${reference}`;
}
export function findWorksheetReferences(formula: string): WorksheetFormulaReference[] {
  const masked = formula.replace(/"(?:[^"]|"")*"/g, text => ' '.repeat(text.length));
  const regex = new RegExp(`(?<![A-Z0-9_])${REFERENCE_PATTERN}(?![A-Z0-9_])`, 'gi');
  const references: WorksheetFormulaReference[] = [];
  for (const match of masked.matchAll(regex)) {
    const before = masked.slice(0, match.index);
    if ((before.match(/\[/g)?.length || 0) > (before.match(/\]/g)?.length || 0)) continue;
    if (masked[match.index! + match[0].length] === '(') continue;
    const sheetName = match[1] ? decodeSheetName(match[1]) : undefined;
    const endSheet = match[3] ? decodeSheetName(match[3]) : undefined;
    if (endSheet && endSheet.toLowerCase() !== sheetName?.toLowerCase()) continue;
    references.push({ sheetName, start: match[2].toUpperCase(), end: match[4]?.toUpperCase(), token: formula.slice(match.index, match.index! + match[0].length), index: match.index! });
  }
  return references;
}
export function parseWorksheetReference(reference: string): WorksheetFormulaReference | null {
  const value = reference.trim();
  const parsed = findWorksheetReferences(value)[0];
  return parsed && parsed.index === 0 && parsed.token.length === value.length ? parsed : null;
}

class FormulaReferenceError extends Error { constructor(readonly value: string) { super(value); } }

export function colIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function colLetterToIndex(letter: string): number {
  let col = 0;
  const upper = letter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

export function getCellId(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

export function stripDollarSigns(ref: string): string {
  return ref.replace(/\$/g, '').trim().toUpperCase();
}

export function parseCellId(cellId: string): { col: number; row: number } | null {
  const clean = stripDollarSigns(cellId);
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    col: colLetterToIndex(match[1]),
    row: parseInt(match[2], 10) - 1,
  };
}

function toggleSingleRefF4(ref: string): string {
  const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
  if (!match) return ref;
  const [, colDollar, col, rowDollar, row] = match;
  const colUpper = col.toUpperCase();

  if (!colDollar && !rowDollar) {
    return `$${colUpper}$${row}`;
  }
  if (colDollar && rowDollar) {
    return `${colUpper}$${row}`;
  }
  if (!colDollar && rowDollar) {
    return `$${colUpper}${row}`;
  }
  return `${colUpper}${row}`;
}

export function cycleFormulaRefAtCursor(
  formula: string,
  cursorPos: number | null
): { formula: string; newCursorPos: number } {
  if (!formula.trim().startsWith('=')) {
    return { formula, newCursorPos: cursorPos ?? formula.length };
  }

  const pos = cursorPos ?? formula.length;
  const references = findWorksheetReferences(formula);
  if (!references.length) return { formula, newCursorPos: pos };
  const target = references.find(ref => pos >= ref.index && pos <= ref.index + ref.token.length) || references[references.length - 1];
  const cells = toggleSingleRefF4(target.start) + (target.end ? ':' + toggleSingleRefF4(target.end) : '');
  const toggled = formatWorksheetReference(target.sheetName, cells);
  const updatedFormula = formula.slice(0, target.index) + toggled + formula.slice(target.index + target.token.length);
  const newCursorPos = target.index + toggled.length;

  return { formula: updatedFormula, newCursorPos };
}

export function applyPointedReferenceToFormula(formula: string, newRef: string): string {
  const trimmedRight = formula.replace(/\s+$/, '');

  if (/([=+\-*/(,;:<>])\s*$/.test(trimmedRight)) {
    return `${formula}${newRef}`;
  }

  const trailingRefRegex = /(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/i;
  if (trailingRefRegex.test(trimmedRight)) {
    return trimmedRight.replace(trailingRefRegex, newRef);
  }

  return `${formula}${newRef}`;
}

export interface HighlightedFormulaRef {
  refText: string;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  color: string;
}

const FORMULA_REF_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
];

export function extractFormulaReferences(formula: string, visibleSheetName?: string, originSheetName?: string): HighlightedFormulaRef[] {
  if (!formula.trim().startsWith('=')) return [];
  return findWorksheetReferences(formula).flatMap((ref, index) => {
    const targetName = ref.sheetName || originSheetName;
    if (visibleSheetName && targetName && visibleSheetName.toLowerCase() !== targetName.toLowerCase()) return [];
    const first = parseCellId(ref.start) || (/^\$?[A-Z]+$/i.test(ref.start) ? { col: colLetterToIndex(ref.start.replace(/\$/g, '')), row: 0 } : null), last = parseCellId(ref.end || ref.start) || (/^\$?[A-Z]+$/i.test(ref.end || ref.start) ? { col: colLetterToIndex((ref.end || ref.start).replace(/\$/g, '')), row: 1048575 } : null);
    return first && last ? [{ refText: ref.token, minCol: Math.min(first.col, last.col), maxCol: Math.max(first.col, last.col), minRow: Math.min(first.row, last.row), maxRow: Math.max(first.row, last.row), color: FORMULA_REF_COLORS[index % FORMULA_REF_COLORS.length] }] : [];
  });
}

export function shiftFormulaReferences(
  raw: string,
  colOffset: number,
  rowOffset: number
): string {
  if (!raw || !raw.trim().startsWith('=')) {
    return raw;
  }

  const shift = (cell: string) => {
    if (/^\$?[A-Z]+$/i.test(cell)) return cell.startsWith('$') ? cell : colIndexToLetter(Math.max(0, colLetterToIndex(cell) + colOffset));
    return cell.replace(/(\$?)([A-Z]+)(\$?)(\d+)/i, (_, absCol, column, absRow, row) => {
    const col = absCol ? colLetterToIndex(column) : Math.max(0, colLetterToIndex(column) + colOffset);
    const nextRow = absRow ? Number(row) - 1 : Math.max(0, Number(row) - 1 + rowOffset);
    return `${absCol}${colIndexToLetter(col)}${absRow}${nextRow + 1}`;
  });
  };
  let result = raw;
  for (const ref of findWorksheetReferences(raw).reverse()) {
    const value = formatWorksheetReference(ref.sheetName, shift(ref.start) + (ref.end ? ':' + shift(ref.end) : ''));
    result = result.slice(0, ref.index) + value + result.slice(ref.index + ref.token.length);
  }
  return result;
}

const DAYS_FULL_PLAIN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAYS_FULL_ACCENTED = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DAYS_SHORT_PLAIN = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const DAYS_SHORT_ACCENTED = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const MONTHS_FULL = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function normalizeWord(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function applyCasingPattern(reference: string, target: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return target;
  if (trimmed === trimmed.toUpperCase()) {
    return target.toUpperCase();
  }
  if (trimmed[0] === trimmed[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
  }
  return target.toLowerCase();
}

function matchCyclicList(val: string): { list: string[]; index: number } | null {
  const norm = normalizeWord(val);
  const dayIdx = DAYS_FULL_PLAIN.indexOf(norm);
  if (dayIdx !== -1) return { list: DAYS_FULL_ACCENTED, index: dayIdx };

  const dayShortIdx = DAYS_SHORT_PLAIN.indexOf(norm);
  if (dayShortIdx !== -1) return { list: DAYS_SHORT_ACCENTED, index: dayShortIdx };

  const monthIdx = MONTHS_FULL.indexOf(norm);
  if (monthIdx !== -1) return { list: MONTHS_FULL, index: monthIdx };

  const monthShortIdx = MONTHS_SHORT.indexOf(norm);
  if (monthShortIdx !== -1) return { list: MONTHS_SHORT, index: monthShortIdx };

  return null;
}

export function generateSmartFillSeries(
  seedCells: CellData[],
  targetCount: number,
  direction: 'down' | 'right'
): CellData[] {
  if (seedCells.length === 0 || targetCount <= 0) return [];

  const nonEmptyRaw = seedCells.map((c) => (c?.raw ?? '').trim());

  const numericValues = nonEmptyRaw.map((r) =>
    r !== '' && !r.startsWith('=') && !isNaN(Number(r)) ? Number(r) : null
  );
  const allNumbers = numericValues.every((v) => v !== null) && numericValues.length > 0;

  if (allNumbers) {
    const nums = numericValues as number[];
    let step = 0;
    if (nums.length >= 2) {
      step = nums[1] - nums[0];
    }

    const lastNum = nums[nums.length - 1];
    const results: CellData[] = [];
    for (let i = 1; i <= targetCount; i++) {
      const styleTemplate = seedCells[(i - 1) % seedCells.length]?.style;
      const nextVal = nums.length >= 2 ? Number((lastNum + step * i).toFixed(6)) : lastNum;
      results.push({
        raw: String(nextVal),
        style: styleTemplate ? { ...styleTemplate } : undefined,
      });
    }
    return results;
  }

  const firstMatch = matchCyclicList(nonEmptyRaw[0]);
  if (firstMatch) {
    let step = 1;
    if (nonEmptyRaw.length >= 2) {
      const secondMatch = matchCyclicList(nonEmptyRaw[1]);
      if (secondMatch && secondMatch.list === firstMatch.list) {
        const diff =
          (secondMatch.index - firstMatch.index + firstMatch.list.length) % firstMatch.list.length;
        if (diff > 0) step = diff;
      }
    }
    const lastCellRaw = nonEmptyRaw[nonEmptyRaw.length - 1];
    const lastMatch = matchCyclicList(lastCellRaw) || firstMatch;
    const results: CellData[] = [];
    for (let i = 1; i <= targetCount; i++) {
      const nextIdx = (lastMatch.index + step * i) % firstMatch.list.length;
      const rawWord = applyCasingPattern(lastCellRaw || nonEmptyRaw[0], firstMatch.list[nextIdx]);
      const styleTemplate = seedCells[(i - 1) % seedCells.length]?.style;
      results.push({
        raw: rawWord,
        style: styleTemplate ? { ...styleTemplate } : undefined,
      });
    }
    return results;
  }

  const textNumRegex = /^(.*?)(\d+)$/;
  const firstTextMatch = nonEmptyRaw[0].match(textNumRegex);
  if (firstTextMatch && !nonEmptyRaw[0].startsWith('=')) {
    const prefix = firstTextMatch[1];
    const firstNum = parseInt(firstTextMatch[2], 10);
    let step = 1;
    let lastNum = firstNum;

    if (nonEmptyRaw.length >= 2) {
      const secondMatch = nonEmptyRaw[1].match(textNumRegex);
      if (secondMatch && secondMatch[1].toLowerCase() === prefix.toLowerCase()) {
        step = parseInt(secondMatch[2], 10) - firstNum;
      }
      const lastMatch = nonEmptyRaw[nonEmptyRaw.length - 1].match(textNumRegex);
      if (lastMatch) {
        lastNum = parseInt(lastMatch[2], 10);
      }
    }

    const results: CellData[] = [];
    for (let i = 1; i <= targetCount; i++) {
      const styleTemplate = seedCells[(i - 1) % seedCells.length]?.style;
      results.push({
        raw: `${prefix}${lastNum + step * i}`,
        style: styleTemplate ? { ...styleTemplate } : undefined,
      });
    }
    return results;
  }

  const results: CellData[] = [];
  const seedLen = seedCells.length;
  for (let i = 0; i < targetCount; i++) {
    const sourceIdx = i % seedLen;
    const sourceCell = seedCells[sourceIdx] || { raw: '' };
    const distanceFromSource = seedLen - sourceIdx + i;
    const colOffset = direction === 'right' ? distanceFromSource : 0;
    const rowOffset = direction === 'down' ? distanceFromSource : 0;

    results.push({
      raw: shiftFormulaReferences(sourceCell.raw, colOffset, rowOffset),
      style: sourceCell.style ? { ...sourceCell.style } : undefined,
    });
  }
  return results;
}

export function evaluateConditionalFormat(
  col: number,
  row: number,
  computedVal: string | number,
  grid: SheetGrid,
  rules?: ConditionalRule[]
): { preset?: PresetStyle; bgColor?: string; textColor?: string } | null {
  if (!rules || rules.length === 0) return null;

  let matchedResult: { preset?: PresetStyle; bgColor?: string; textColor?: string } | null = null;

  for (const rule of rules) {
    const minCol = Math.min(rule.range.startCol, rule.range.endCol);
    const maxCol = Math.max(rule.range.startCol, rule.range.endCol);
    const minRow = Math.min(rule.range.startRow, rule.range.endRow);
    const maxRow = Math.max(rule.range.startRow, rule.range.endRow);

    if (col < minCol || col > maxCol || row < minRow || row > maxRow) {
      continue;
    }

    const numVal = typeof computedVal === 'number' ? computedVal : Number(computedVal);
    const isNumeric = computedVal !== '' && !isNaN(numVal);

    if (rule.type === 'greaterThan' && isNumeric && rule.value1 !== undefined) {
      if (numVal > rule.value1) {
        matchedResult = { preset: rule.presetStyle || 'good' };
      }
    } else if (rule.type === 'lessThan' && isNumeric && rule.value1 !== undefined) {
      if (numVal < rule.value1) {
        matchedResult = { preset: rule.presetStyle || 'bad' };
      }
    } else if (
      rule.type === 'between' &&
      isNumeric &&
      rule.value1 !== undefined &&
      rule.value2 !== undefined
    ) {
      const low = Math.min(rule.value1, rule.value2);
      const high = Math.max(rule.value1, rule.value2);
      if (numVal >= low && numVal <= high) {
        matchedResult = { preset: rule.presetStyle || 'neutral' };
      }
    } else if (rule.type === 'equalTo' && rule.textValue !== undefined) {
      if (String(computedVal).toLowerCase() === rule.textValue.trim().toLowerCase()) {
        matchedResult = { preset: rule.presetStyle || 'good' };
      }
    } else if (rule.type === 'colorScale' && isNumeric) {
      const numsInRange: number[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const v = evaluateCellValue(getCellId(c, r), grid);
          const n = typeof v === 'number' ? v : Number(v);
          if (v !== '' && !isNaN(n)) {
            numsInRange.push(n);
          }
        }
      }
      if (numsInRange.length > 0) {
        const minVal = Math.min(...numsInRange);
        const maxVal = Math.max(...numsInRange);
        const ratio = maxVal === minVal ? 0.5 : (numVal - minVal) / (maxVal - minVal);
        const scaleColors = interpolateColorScale(
          ratio,
          rule.colorScale || 'green-yellow-red'
        );
        matchedResult = {
          bgColor: scaleColors.bg,
          textColor: scaleColors.text,
        };
      }
    }
  }

  return matchedResult;
}

function interpolateColorScale(
  ratio: number,
  preset: 'green-yellow-red' | 'red-yellow-green' | 'blue-white-red'
): { bg: string; text: string } {
  const clamped = Math.max(0, Math.min(1, ratio));

  let stops: [number, number, number][] = [
    [248, 105, 107],
    [255, 235, 132],
    [99, 190, 123],
  ];

  if (preset === 'red-yellow-green') {
    stops = [
      [99, 190, 123],
      [255, 235, 132],
      [248, 105, 107],
    ];
  } else if (preset === 'blue-white-red') {
    stops = [
      [90, 138, 198],
      [252, 252, 255],
      [248, 105, 107],
    ];
  }

  const [c1, c2, c3] = stops;
  let r: number;
  let g: number;
  let b: number;

  if (clamped < 0.5) {
    const t = clamped * 2;
    r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  } else {
    const t = (clamped - 0.5) * 2;
    r = Math.round(c2[0] + (c3[0] - c2[0]) * t);
    g = Math.round(c2[1] + (c3[1] - c2[1]) * t);
    b = Math.round(c2[2] + (c3[2] - c2[2]) * t);
  }

  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    text: '#111827',
  };
}

export function expandRange(rangeStr: string): string[] {
  const reference = parseWorksheetReference(rangeStr);
  if (!reference) return [];
  const start = parseCellId(reference.start), end = parseCellId(reference.end || reference.start);
  if (!start || !end) return [];
  if ((Math.abs(end.row - start.row) + 1) * (Math.abs(end.col - start.col) + 1) > 250000) throw new FormulaReferenceError('#¡NUM!');
  const cells: string[] = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col++) cells.push(formatWorksheetReference(reference.sheetName, getCellId(col, row)));
  }
  return cells;
}

function splitTopLevelArgs(argsStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  let inSheetName = false;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === "'" && !inQuotes) {
      if (inSheetName && argsStr[i + 1] === "'") { current += "''"; i++; continue; }
      inSheetName = !inSheetName; current += ch; continue;
    }
    if (inSheetName) { current += ch; continue; }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes) {
      if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if ((ch === ',' || ch === ';') && depth === 0) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    result.push(current.trim());
  }
  return result;
}

export type FormulaCalculationCache = WeakMap<SheetGrid, Map<string, string | number>>;
let activeCalculationCache: FormulaCalculationCache | undefined;
/** A synchronous calculation session shared by dependencies, isolated to one workbook revision. */
export function evaluateCellValueCached(cellId: string, grid: SheetGrid, cache: FormulaCalculationCache): string | number {
  const previous = activeCalculationCache;
  activeCalculationCache = cache;
  try { return evaluateCellValue(cellId, grid); }
  finally { activeCalculationCache = previous; }
}

interface SpillState { matrices: Map<string, CalcArray>; cells: Map<string, { owner: string; value: string | number }>; initialized: boolean; }
const spillStates = new WeakMap<FormulaCalculationCache, WeakMap<SheetGrid, SpillState>>();
const dynamicIndexes = new WeakMap<SheetGrid, string[]>();
function stateFor(grid: SheetGrid): SpillState {
  let states = spillStates.get(activeCalculationCache!);
  if (!states) { states = new WeakMap(); spillStates.set(activeCalculationCache!, states); }
  let state = states.get(grid);
  if (!state) { state = { matrices: new Map(), cells: new Map(), initialized: false }; states.set(grid, state); }
  return state;
}
function scalar(value: Value): string | number { const v = first(value); return typeof v === 'boolean' ? v ? 'VERDADERO' : 'FALSO' : v; }
function installSpill(id: string, matrix: CalcArray, grid: SheetGrid): string | number {
  if (matrix.rows * matrix.cols > LIMIT) return '#¡NUM!';
  const origin = parseCellId(id); if (!origin || origin.row + matrix.rows > 1048576 || origin.col + matrix.cols > 16384) return '#¡DESBORDAMIENTO!';
  const state = stateFor(grid), sheet = workbookContexts.get(grid)?.sheets.find(s => s.data === grid);
  const overlaps = (r: { startCol: number; endCol: number; startRow: number; endRow: number }) => r.startCol < origin.col + matrix.cols && r.endCol >= origin.col && r.startRow < origin.row + matrix.rows && r.endRow >= origin.row;
  if (sheet?.merges?.some(overlaps) || sheet?.tables?.some(table => overlaps(table.range))) return '#¡DESBORDAMIENTO!';
  for (let r = 0; r < matrix.rows; r++) for (let c = 0; c < matrix.cols; c++) {
    const cellId = getCellId(origin.col + c, origin.row + r);
    if ((cellId !== id && grid[cellId]?.raw) || (state.cells.has(cellId) && state.cells.get(cellId)!.owner !== id)) return '#¡DESBORDAMIENTO!';
  }
  // Materialize once; lazy arrays must not re-enter a completed dependency path later.
  const materialized = CalcArray.from(matrix.materialize());
  materialized.origin = { sheetName: sheet?.name, startCol: origin.col, endCol: origin.col + matrix.cols - 1, startRow: origin.row, endRow: origin.row + matrix.rows - 1 };
  state.matrices.set(id, materialized);
  for (let r = 0; r < matrix.rows; r++) for (let c = 0; c < matrix.cols; c++) state.cells.set(getCellId(origin.col + c, origin.row + r), { owner: id, value: scalar(materialized.get(r, c)) });
  return scalar(materialized);
}
function initializeSpills(grid: SheetGrid, visited: Set<string>): void {
  const state = stateFor(grid); if (state.initialized) return; state.initialized = true;
  let candidates = dynamicIndexes.get(grid);
  if (!candidates) {
    candidates = Object.keys(grid).filter(id => {
      const raw = grid[id]?.raw || '';
      if (!raw.startsWith('=')) return false;
      try { return mayReturnArray(parseFormula(raw.slice(1))); } catch { return false; }
    }); dynamicIndexes.set(grid, candidates);
  }
  for (const id of candidates) if (!visited.has(`${workbookContexts.get(grid)?.sheetId || ''}!${id}`)) evaluateCellValue(id, grid, new Set(visited));
}
export function getSpillRegions(grid: SheetGrid, cache: FormulaCalculationCache): { owner: string; rows: number; cols: number }[] {
  const previous = activeCalculationCache; activeCalculationCache = cache;
  try { initializeSpills(grid, new Set()); return [...stateFor(grid).matrices].map(([owner, matrix]) => ({ owner, rows: matrix.rows, cols: matrix.cols })); }
  finally { activeCalculationCache = previous; }
}
export function getCalculatedExtent(grid: SheetGrid, cache: FormulaCalculationCache): { rows: number; cols: number } {
  const previous = activeCalculationCache; activeCalculationCache = cache;
  try {
    initializeSpills(grid, new Set()); let rows = 0, cols = 0;
    for (const [id, matrix] of stateFor(grid).matrices) { const origin = parseCellId(id)!; rows = Math.max(rows, origin.row + matrix.rows); cols = Math.max(cols, origin.col + matrix.cols); }
    return { rows, cols };
  } finally { activeCalculationCache = previous; }
}
export function getCellSpill(cellId: string, grid: SheetGrid, cache: FormulaCalculationCache): { owner: string; rows: number; cols: number } | null {
  const previous = activeCalculationCache; activeCalculationCache = cache;
  try { initializeSpills(grid, new Set()); const state = stateFor(grid), entry = state.cells.get(cellId); if (!entry) return null; const matrix = state.matrices.get(entry.owner)!; return { owner: entry.owner, rows: matrix.rows, cols: matrix.cols }; }
  finally { activeCalculationCache = previous; }
}
export function getCellMatrix(cellId: string, grid: SheetGrid, cache: FormulaCalculationCache): CalcArray | undefined {
  evaluateCellValueCached(cellId, grid, cache);
  const previous = activeCalculationCache; activeCalculationCache = cache;
  try { return stateFor(grid).matrices.get(cellId); } finally { activeCalculationCache = previous; }
}
export function evaluateCellValue(cellId: string, grid: SheetGrid, visited: Set<string> = new Set()): string | number {
  if (!activeCalculationCache) return evaluateCellValueCached(cellId, grid, new WeakMap());
  const reference = parseWorksheetReference(cellId);
  if (reference?.sheetName) {
    const sheet = workbookContexts.get(grid)?.sheets.find(s => s.name.toLowerCase() === reference.sheetName!.toLowerCase());
    return sheet ? evaluateCellValue(reference.start, sheet.data, visited) : '#¡REF!';
  }
  const id = stripDollarSigns(cellId).toUpperCase(), context = workbookContexts.get(grid), key = `${context?.sheetId || ''}!${id}`;
  if (visited.has(key)) return '#¡REF!'; if (visited.size >= 128) return '#¡NUM!';
  let cache = activeCalculationCache.get(grid); if (!cache) { cache = new Map(); activeCalculationCache.set(grid, cache); }
  if (cache.has(id)) return cache.get(id)!;
  const cell = grid[id];
  if (!cell?.raw) {
    initializeSpills(grid, visited);
    return stateFor(grid).cells.get(id)?.value ?? '';
  }
  const raw = cell.raw.trim();
  if (!raw.startsWith('=')) {
    if (cell.xlsxType === 'date') return dateSerial(new Date(raw));
    return cell.xlsxType === 'text' ? raw : Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : raw;
  }
  visited.add(key);
  try {
    const result = evaluateFormulaValue(raw.slice(1), grid, visited, id);
    const value = result instanceof CalcArray ? installSpill(id, result, grid) : scalar(result);
    cache.set(id, value); return value;
  } catch (error) { const value = error instanceof CalcError ? error.code : '#¡VALOR!'; cache.set(id, value); return value; }
  finally { visited.delete(key); }
}
const gridEntries = new WeakMap<SheetGrid, { id: string; row: number; col: number }[]>();
function entries(grid: SheetGrid) {
  let result = gridEntries.get(grid);
  if (!result) { result = Object.keys(grid).map(id => ({ id, ...parseCellId(id)! })).filter(item => item.row !== undefined); gridEntries.set(grid, result); }
  return result;
}
function rangeValue(name: string, grid: SheetGrid, visited: Set<string>, originId: string): Value {
  const context = workbookContexts.get(grid), sheets = context?.sheets || [], current = sheets.find(s => s.data === grid);
  // Structured references, including column groups, headers/totals, and the current table row.
  const structured = name.match(/^([\w.\u00c0-\uffff]*)\[([\s\S]+)\]$/);
  if (structured) {
    const tableName = structured[1], selector = structured[2], origin = parseCellId(originId)!;
    let owner = current, table = current?.tables?.find(t => !tableName && origin.col >= t.range.startCol && origin.col <= t.range.endCol && origin.row >= t.range.startRow && origin.row <= t.range.endRow);
    if (tableName) for (const sheet of sheets) { const found = sheet.tables?.find(t => t.name.toLowerCase() === tableName.toLowerCase()); if (found) { owner = sheet; table = found; break; } }
    if (!table || !owner) fail('#¡REF!');
    let startRow = table.range.startRow + (table.hasHeaders ? 1 : 0), endRow = table.range.endRow - (table.totalsRow ? 1 : 0);
    if (/#(?:ALL|TODO)/i.test(selector)) { startRow = table.range.startRow; endRow = table.range.endRow; }
    else if (/#(?:HEADERS|ENCABEZADOS)/i.test(selector)) startRow = endRow = table.range.startRow;
    else if (/#(?:TOTALS|TOTALES)/i.test(selector)) { if (!table.totalsRow) fail('#¡REF!'); startRow = endRow = table.range.endRow; }
    else if (selector.includes('@') || /#(?:THIS ROW|ESTA FILA)/i.test(selector)) { if (owner !== current || origin.row < startRow || origin.row > endRow) fail('#¡VALOR!'); startRow = endRow = origin.row; }
    const parts = selector.replace(/#(?:ALL|TODO|HEADERS|ENCABEZADOS|TOTALS|TOTALES|DATA|DATOS|THIS ROW|ESTA FILA)/gi, '').replace(/@/g, '').split(/\]\s*[:;,]\s*\[/).map(part => part.replace(/[\[\],]/g, '').trim()).filter(Boolean);
    let startCol = table.range.startCol, endCol = table.range.endCol;
    if (parts.length) {
      const indexes = parts.map(part => table!.columns.findIndex(c => c.toLowerCase() === part.toLowerCase())); if (indexes.some(i => i < 0)) fail('#¡REF!');
      startCol += indexes[0]; endCol = table.range.startCol + indexes.at(-1)!;
    }
    if ((selector.includes('@') || /#(?:THIS ROW|ESTA FILA)/i.test(selector)) && startCol === endCol) return evaluateCellValue(getCellId(startCol, startRow), owner.data, visited);
    return makeRange(owner.data, startCol, endCol, startRow, endRow, visited);
  }
  if (!name.includes('[') && workbookContexts.get(grid)?.sheets.some(s => s.tables?.some(t => t.name.toLowerCase() === name.toLowerCase()))) return rangeValue(name + '[#Data]', grid, visited, originId);
  const qualified = name.match(/^(?:('(?:[^']|'')+'|[^!]+)!)?([\s\S]+)$/)!;
  let target = current, targetGrid = grid, token = qualified[2];
  if (qualified[1]) { const sheetName = decodeSheetName(qualified[1]); target = sheets.find(s => s.name.toLowerCase() === sheetName.toLowerCase()); if (!target) fail('#¡REF!'); targetGrid = target.data; }
  if (token.endsWith('#')) {
    const id = token.slice(0, -1).replace(/\$/g, '').toUpperCase(); evaluateCellValue(id, targetGrid, visited);
    return stateFor(targetGrid).matrices.get(id) || fail('#¡REF!');
  }
  token = token.replace(/^@/, '');
  const named = Object.entries(target?.definedNames || {}).find(([key]) => key.toLowerCase() === token.toLowerCase()) || sheets.flatMap(s => Object.entries(s.workbookNames || {})).find(([key]) => key.toLowerCase() === token.toLowerCase());
  if (named) {
    const key = `name:${target?.id || ''}:${named[0].toLowerCase()}`; if (visited.has(key)) fail('#¡REF!');
    const next = new Set(visited); next.add(key); return evaluateFormulaValue(named[1].replace(/^=/, ''), targetGrid, next, originId);
  }
  const cells = token.match(/^(\$?[A-Z]+\$?[1-9]\d*)(?::(\$?[A-Z]+\$?[1-9]\d*))?$/i);
  if (cells) {
    if (!cells[2]) return evaluateCellValue(cells[1], targetGrid, visited);
    const start = parseCellId(cells[1].toUpperCase())!, end = parseCellId(cells[2].toUpperCase())!;
    return makeRange(targetGrid, Math.min(start.col, end.col), Math.max(start.col, end.col), Math.min(start.row, end.row), Math.max(start.row, end.row), visited);
  }
  const columns = token.match(/^\$?([A-Z]+):\$?([A-Z]+)$/i);
  if (columns) { const a = colLetterToIndex(columns[1].toUpperCase()), b = colLetterToIndex(columns[2].toUpperCase()); return makeRange(targetGrid, Math.min(a, b), Math.max(a, b), 0, 1048575, visited, true); }
  const rows = token.match(/^\$?([1-9]\d*):\$?([1-9]\d*)$/);
  if (rows) return makeRange(targetGrid, 0, 16383, +rows[1] - 1, +rows[2] - 1, visited, true);
  fail('#¿NOMBRE?');
}
function makeRange(grid: SheetGrid, startCol: number, endCol: number, startRow: number, endRow: number, visited: Set<string>, full = false): CalcArray {
  if (startCol < 0 || startRow < 0 || endCol > 16383 || endRow > 1048575 || endRow < startRow || endCol < startCol) fail('#¡REF!');
  const rows = endRow - startRow + 1, cols = endCol - startCol + 1;
  if (!full && rows * cols > LIMIT) fail('#¡NUM!');
  const range = new CalcArray(rows, cols, (r, c) => evaluateCellValue(getCellId(startCol + c, startRow + r), grid, new Set(visited)), function* () {
    initializeSpills(grid, visited);
    for (const cell of entries(grid)) if (cell.col >= startCol && cell.col <= endCol && cell.row >= startRow && cell.row <= endRow && grid[cell.id]?.raw !== '') yield [cell.row - startRow, cell.col - startCol, evaluateCellValue(cell.id, grid, new Set(visited))] as [number, number, string | number];
    // Previously calculated spill children are not part of the persisted grid.
    for (const [id, entry] of stateFor(grid).cells) {
      if (grid[id]?.raw) continue; const cell = parseCellId(id)!;
      if (cell.col >= startCol && cell.col <= endCol && cell.row >= startRow && cell.row <= endRow) yield [cell.row - startRow, cell.col - startCol, entry.value] as [number, number, string | number];
    }
  });
  const context = workbookContexts.get(grid), owner = context?.sheets.find(sheet => sheet.data === grid);
  range.origin = { sheetName: owner?.name, startCol, endCol, startRow, endRow }; return range;
}
export function resolvedFormulaReferences(formula: string, grid: SheetGrid, originId = 'A1'): { sheetName?: string; start: string; end?: string; token: string }[] {
  const output: { sheetName?: string; start: string; end?: string; token: string }[] = [];
  const previous = activeCalculationCache; if (!previous) activeCalculationCache = new WeakMap();
  const context = workbookContexts.get(grid), current = context?.sheets.find(sheet => sheet.data === grid), visitedNames = new Set<string>();
  const visit = (node: Node) => {
    if (node.kind === 'reference') {
      const direct = parseWorksheetReference(node.name);
      if (direct && parseCellId(direct.start)) { output.push(direct); return; }
      const named = Object.entries(current?.definedNames || {}).find(([name]) => name.toLowerCase() === node.name.toLowerCase()) || context?.sheets.flatMap(sheet => Object.entries(sheet.workbookNames || {})).find(([name]) => name.toLowerCase() === node.name.toLowerCase());
      if (named && !visitedNames.has(named[0].toLowerCase())) { visitedNames.add(named[0].toLowerCase()); try { visit(parseFormula(named[1].replace(/^=/, ''))); } catch {} return; }
      try {
        const value = rangeValue(node.name, grid, new Set(), originId);
        if (value instanceof CalcArray && value.origin) {
          const o = value.origin; output.push({ sheetName: o.sheetName, start: getCellId(o.startCol, o.startRow), end: getCellId(o.endCol, o.endRow), token: node.name });
        }
      } catch {}
    } else if (node.kind === 'call') node.args.forEach(visit);
    else if (node.kind === 'binary') { visit(node.left); visit(node.right); }
    else if (node.kind === 'unary') visit(node.value);
    else if (node.kind === 'matrix') node.rows.flat().forEach(visit);
  };
  try { visit(parseFormula(formula.replace(/^=/, ''))); return output; }
  catch { return findWorksheetReferences(formula); }
  finally { activeCalculationCache = previous; }
}
function evaluateFormulaValue(expr: string, grid: SheetGrid, visited: Set<string>, originId = 'A1'): Value {
  return evaluateTree(parseFormula(expr), { reference: name => rangeValue(name, grid, visited, originId), call: callFunction });
}
export function evaluateExpression(expr: string, grid: SheetGrid, visited: Set<string>): string | number {
  const previous = activeCalculationCache; if (!previous) activeCalculationCache = new WeakMap();
  try { return scalar(evaluateFormulaValue(expr, grid, visited)); }
  catch (error) { return error instanceof CalcError ? error.code : '#¡VALOR!'; }
  finally { activeCalculationCache = previous; }
}

@Injectable({ providedIn: 'root' })
export class FormulaEngineService {
  colIndexToLetter = colIndexToLetter;
  colLetterToIndex = colLetterToIndex;
  getCellId = getCellId;
  parseCellId = parseCellId;
  evaluateCellValue = evaluateCellValue;
  evaluateExpression = evaluateExpression;
  evaluateConditionalFormat = evaluateConditionalFormat;
  generateSmartFillSeries = generateSmartFillSeries;
  shiftFormulaReferences = shiftFormulaReferences;
  extractFormulaReferences = extractFormulaReferences;
  cycleFormulaRefAtCursor = cycleFormulaRefAtCursor;
  applyPointedReferenceToFormula = applyPointedReferenceToFormula;
  expandRange = expandRange;
}
