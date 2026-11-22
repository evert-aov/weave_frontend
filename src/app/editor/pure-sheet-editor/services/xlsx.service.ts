import {prepareXlsxReaderBuffer,XLSX_IMPORT_LIMITS,XlsxImportLimitError} from './xlsx-limits';
import { zipSync, strToU8 } from 'fflate';
import { exportChartMetadata, importChartMetadata, importDefinedNames, xlsxMetadata } from './xlsx-charts';
import {
  exportDrawingShapes,
  exportOutlineProperties,
  exportPivotTableMetadata,
  exportSparklineMetadata,
  importDrawingShapes,
  importPivotTableMetadata,
  importSparklineMetadata,
} from './xlsx-ooxml';
import type { Workbook, Cell, RowModel } from 'exceljs';
import { EXCEL_FUNCTIONS } from '../constants/excel.constants';
import { CellStyle, CellValidationRule, ConditionalRule, FloatingArtwork, IconSetStyle, OutlineGroup, PresetStyle, SelectionRange, Sheet, ValidationOperator } from '../models/excel.model';
import { bindWorkbookFormulaContext, evaluateCellValue, evaluateCellValueCached, getCellMatrix, getCellId, parseCellId, findWorksheetReferences, formatWorksheetReference, getCellSpill } from './formula-engine.service';
import { GridAxis } from './grid-viewport';

export function excelFormula(raw: string, modernPrefixes = false): string {
  const aliases = new Map(EXCEL_FUNCTIONS.map(f => [f.nameEs.toUpperCase(), f.nameEn]));
  const known = new Set(EXCEL_FUNCTIONS.map(f => f.nameEn));
  const modern: Record<string, string> = { XLOOKUP: '_xlfn.XLOOKUP', FILTER: '_xlfn._xlws.FILTER', SORT: '_xlfn._xlws.SORT', UNIQUE: '_xlfn.UNIQUE', SEQUENCE: '_xlfn.SEQUENCE', IFS: '_xlfn.IFS', IFNA: '_xlfn.IFNA', CONCAT: '_xlfn.CONCAT' };
  return raw.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|([A-ZÁÉÍÓÚÑ_][A-ZÁÉÍÓÚÑ0-9_.]*)\s*(?=\()|;/gi, (match, name) => {
    if (match.startsWith('"') || match.startsWith("'")) return match;
    if (match === ';') return ',';
    const key = name.toUpperCase().replace(/^_XLFN\.(?:_XLWS\.)?/, '');
    const canonical = aliases.get(key) || key;
    return known.has(canonical) ? modernPrefixes && modern[canonical] || canonical : name;
  });
}

async function workbook(): Promise<Workbook> {
  const module = await import('exceljs');
  return new (module.Workbook || module.default.Workbook)();
}
const themeColors = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
const color = (value: any, palette = themeColors): string | undefined => {
  const hex = value?.argb?.slice(-6) || (value?.theme !== undefined ? palette[value.theme] : undefined);
  if (!hex) return undefined;
  const tint = value.tint || 0;
  return '#' + hex.match(/../g)!.map((part: string) => {
    const component = parseInt(part, 16);
    return Math.round(tint < 0 ? component * (1 + tint) : component + (255 - component) * tint).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
};
const argb = (value: string) => ({ argb: `FF${value.replace('#', '').toUpperCase()}` });

function sanitizeHyperlink(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return undefined;
}

const VALIDATION_TO_XLSX_OP: Record<ValidationOperator, string> = {
  between: 'between',
  notBetween: 'notBetween',
  equalTo: 'equal',
  notEqualTo: 'notEqual',
  greaterThan: 'greaterThan',
  lessThan: 'lessThan',
  greaterOrEqual: 'greaterThanOrEqual',
  lessOrEqual: 'lessThanOrEqual',
};

const XLSX_TO_VALIDATION_OP: Record<string, ValidationOperator> = Object.fromEntries(
  Object.entries(VALIDATION_TO_XLSX_OP).map(([k, v]) => [v, k as ValidationOperator])
) as Record<string, ValidationOperator>;

const CF_PRESET_STYLES: Record<PresetStyle, { bg?: string; fg?: string; bold?: boolean }> = {
  normal: {},
  bad: { bg: '#FFC7CE', fg: '#9C0006' },
  good: { bg: '#C6EFCE', fg: '#006100' },
  neutral: { bg: '#FFEB9C', fg: '#9C6500' },
  calculation: { bg: '#F2F2F2', fg: '#FA7D00', bold: true },
  check: { bg: '#A5A5A5', fg: '#FFFFFF', bold: true },
};

function cfStyleForPreset(preset?: PresetStyle) {
  const vis = CF_PRESET_STYLES[preset || 'bad'];
  const style: any = {};
  if (vis.bg) style.fill = { type: 'pattern', pattern: 'solid', bgColor: argb(vis.bg) };
  if (vis.fg || vis.bold) style.font = { ...(vis.fg ? { color: argb(vis.fg) } : {}), ...(vis.bold ? { bold: true } : {}) };
  return style;
}

function inferPresetFromCfStyle(style: any, palette: string[]): PresetStyle {
  const bg = color(style?.fill?.bgColor || style?.fill?.fgColor, palette);
  if (!bg) return 'bad';
  const match = (Object.entries(CF_PRESET_STYLES) as [PresetStyle, { bg?: string }][]).find(([, vis]) => vis.bg === bg);
  if (match) return match[0];
  return 'bad';
}

function parseA1Range(ref: string): SelectionRange | undefined {
  const [a, b] = ref.split(':');
  const start = parseCellId(a);
  const end = parseCellId(b || a);
  if (!start || !end) return undefined;
  return {
    startCol: Math.min(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endCol: Math.max(start.col, end.col),
    endRow: Math.max(start.row, end.row),
  };
}

function formatA1Range(range: SelectionRange): string {
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);
  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);
  const start = getCellId(minCol, minRow);
  const end = getCellId(maxCol, maxRow);
  return start === end ? start : `${start}:${end}`;
}

function formatValidationOperand(type: string, val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? undefined : val.toISOString().slice(0, 10);
  const s = String(val);
  if (type === 'list' && s.startsWith('"') && s.endsWith('"') && s.length >= 2) return s.slice(1, -1);
  return s;
}

function readStyle(cell: Cell, palette: string[]): CellStyle {
  const f = cell.font || {}, a = cell.alignment || {}, s: CellStyle = {};
  if (f.name) s.fontFamily = f.name;
  if (f.size) s.fontSize = f.size;
  if (f.bold) s.bold = true;
  if (f.italic) s.italic = true;
  if (f.underline) s.underline = true;
  s.textColor = color(f.color, palette);
  if (cell.fill?.type === 'pattern') s.bgColor = color(cell.fill.fgColor, palette);
  if (['left', 'center', 'right'].includes(a.horizontal || '')) s.align = a.horizontal as CellStyle['align'];
  if (['top', 'middle', 'bottom'].includes(a.vertical || '')) s.verticalAlign = a.vertical as CellStyle['verticalAlign'];
  if (a.wrapText) s.wrapText = true;
  if (typeof a.textRotation === 'number' && a.textRotation !== 0) {
    s.textRotation = a.textRotation > 90 && a.textRotation <= 180 ? -(a.textRotation - 90) : Math.max(-90, Math.min(90, a.textRotation));
  }
  const fmt = cell.numFmt || '';
  if (fmt && fmt !== 'General') s.xlsxNumberFormat = fmt;
  const dateMask = fmt.replace(/"[^"]*"|\[[^\]]*\]/g, '');
  if (/[ymdhs]/i.test(dateMask) && !/General/i.test(dateMask)) s.numberFormat = /h|s/i.test(dateMask) ? 'datetime' : 'date';
  else if (fmt.includes('%')) s.numberFormat = 'percent';
  else if (/[$€£]/.test(fmt)) s.numberFormat = 'currency';
  else if (fmt.includes('#,##')) s.numberFormat = 'comma';
  const decimals = fmt.match(/\.([0#]+)/);
  if (decimals) s.decimals = decimals[1].length;
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const b = cell.border?.[edge];
    if (b?.style) (s.borders ||= {})[edge] = { style: ['thin', 'medium', 'thick', 'double', 'dashed', 'dotted'].includes(b.style) ? b.style as any : 'thin', color: color(b.color, palette) || '#000000' };
  }
  if ((cell as any).protection?.locked === false) s.locked = false;
  return s;
}

function buildOutlineGroups(indices: Set<number>, hiddenSet: Set<number>): OutlineGroup[] | undefined {
  if (!indices.size) return undefined;
  const sorted = Array.from(indices).sort((a, b) => a - b);
  const groups: OutlineGroup[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const pushGroup = (s: number, e: number) => {
    let allHidden = true;
    for (let i = s; i <= e; i++) {
      if (!hiddenSet.has(i)) { allHidden = false; break; }
    }
    groups.push({ start: s, end: e, ...(allHidden ? { collapsed: true } : {}) });
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      pushGroup(start, prev);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  pushGroup(start, prev);
  return groups.length ? groups : undefined;
}

export async function readXlsx(buffer: ArrayBuffer, existingNames: string[] = []): Promise<Sheet[]> {
  const book = await workbook();
  await book.xlsx.load(prepareXlsxReaderBuffer(buffer) as any);
  if (!book.worksheets.length) throw new Error('El archivo no contiene hojas.');
  const used = new Set(existingNames.map(name => name.toLowerCase()));
  const names = new Map<string, string>();
  for (const ws of book.worksheets) {
    let name = ws.name, suffix = 2;
    while (used.has(name.toLowerCase())) name = `${ws.name.slice(0, 25)} (${suffix++})`;
    used.add(name.toLowerCase()); names.set(ws.name.toLowerCase(), name);
  }
  const themeXml = (book.model as any).themes?.theme1;
  let palette = themeColors;
  if (themeXml) {
    // Theme colors are simple hex values; keep this decoder usable inside a Web Worker.
    const names = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
    palette = names.map((name, index) => {
      const block = String(themeXml).match(new RegExp(`<(?:[\\w]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${name}>`, 'i'))?.[1];
      return block?.match(/lastClr="([0-9a-f]{6})"/i)?.[1] || block?.match(/val="([0-9a-f]{6})"/i)?.[1] || themeColors[index];
    });
  }
  const rewrite = (formula: string) => {
    for (const ref of findWorksheetReferences(formula).reverse()) {
      const renamed = ref.sheetName && names.get(ref.sheetName.toLowerCase());
      if (renamed) formula = formula.slice(0, ref.index) + formatWorksheetReference(renamed, ref.start + (ref.end ? `:${ref.end}` : '')) + formula.slice(ref.index + ref.token.length);
    } return formula;
  };
  let count = 0;
  const sheets = book.worksheets.map(ws => {
    const sheet: Sheet = { id: crypto.randomUUID(), name: names.get(ws.name.toLowerCase())!, type: 'grid', data: {}, merges: [], colWidths: {}, rowHeights: {} };
    const tabColor = color((ws.properties as any)?.tabColor, palette);
    if (tabColor) sheet.tabColor = tabColor;
    if ((ws as any).sheetProtection?.sheet) sheet.protected = true;
    if ((ws as any).autoFilter) sheet.filtersEnabled = true;
    const hiddenRowSet = new Set<number>();
    const hiddenColSet = new Set<number>();
    const outlineRowSet = new Set<number>();
    const outlineColSet = new Set<number>();
    // Iterate stored cell models so blank formatted cells survive without filling sparse gaps.
    const rows = (ws.model as unknown as { rows: RowModel[] }).rows || [];
    const arrayRanges = rows.flatMap(row => row.cells.filter(cell => cell.formula && (cell as any).shareType === 'array' && (cell as any).ref).map(cell => {
      const [a, b] = String((cell as any).ref).split(':'); return { master: String(cell.address), start: parseCellId(a)!, end: parseCellId(b || a)! };
    }));
    for (const rowModel of rows) {
      const row = ws.getRow(rowModel.number);
      if (row.height) sheet.rowHeights![row.number - 1] = row.height * 4 / 3;
      if ((rowModel as any).hidden || row.hidden) hiddenRowSet.add(row.number - 1);
      if (((rowModel as any).outlineLevel ?? (row as any).outlineLevel ?? 0) >= 1) outlineRowSet.add(row.number - 1);
      for (const cellModel of rowModel.cells) {
        const cell = ws.getCell(String(cellModel.address));
        const mergedInterior = cell.isMerged && cell.master.address !== cell.address;
        const coordinates = parseCellId(cell.address)!;
        if (arrayRanges.some(range => cell.address !== range.master && coordinates.col >= range.start.col && coordinates.col <= range.end.col && coordinates.row >= range.start.row && coordinates.row <= range.end.row)) continue;
        if (++count > XLSX_IMPORT_LIMITS.cells) throw new XlsxImportLimitError('cells');
        // A merged interior resolves its value/formula through the master, but its
        // own style carries perimeter borders. Keep that style without duplicating content.
        const value = mergedInterior ? null : cell.value;
        const hyperlink = value && typeof value === 'object' && 'hyperlink' in value ? sanitizeHyperlink((value as any).hyperlink) : undefined;
        let raw: string;
        if (!mergedInterior && cell.formula) {
          raw = `=${excelFormula(cell.formula)}`;
          for (const ref of findWorksheetReferences(raw).reverse()) {
            const renamed = ref.sheetName && names.get(ref.sheetName.toLowerCase());
            if (renamed) raw = raw.slice(0, ref.index) + formatWorksheetReference(renamed, ref.start + (ref.end ? `:${ref.end}` : '')) + raw.slice(ref.index + ref.token.length);
          }
        } else if (value instanceof Date) raw = value.toISOString();
        else if (value && typeof value === 'object') {
          if ('richText' in value) raw = value.richText.map(run => run.text).join('');
          else if ('text' in value) {
            const inner = (value as any).text;
            raw = inner && typeof inner === 'object' && 'richText' in inner
              ? inner.richText.map((run: { text: string }) => run.text).join('')
              : String(inner ?? '');
          } else if ('error' in value) raw = String((value as any).error);
          else raw = '';
        }
        else raw = value == null ? '' : String(value);
        sheet.data[cell.address] = {
          raw,
          style: readStyle(cell, palette),
          ...(hyperlink ? { hyperlink } : {}),
          ...(value instanceof Date ? { xlsxType: 'date' as const } : typeof value === 'string' ? { xlsxType: 'text' as const } : {}),
        };
        const rawNote = (cell as any).note;
        const noteText = typeof rawNote === 'string'
          ? rawNote.trim()
          : Array.isArray(rawNote?.texts)
            ? rawNote.texts.map((t: { text?: string }) => t.text || '').join('').trim()
            : '';
        if (!mergedInterior && noteText) {
          (sheet.comments ||= {})[cell.address] = { text: noteText };
        }
      }
    }
    for (const [address, dv] of Object.entries(((ws as any).dataValidations?.model || {}) as Record<string, any>)) {
      if (!dv || !['list', 'whole', 'decimal', 'textLength', 'date'].includes(dv.type)) continue;
      if (++count > XLSX_IMPORT_LIMITS.cells) throw new XlsxImportLimitError('cells');
      const rule: CellValidationRule = {
        type: dv.type,
        ...(dv.operator && XLSX_TO_VALIDATION_OP[dv.operator] ? { operator: XLSX_TO_VALIDATION_OP[dv.operator] } : {}),
        ...(dv.formulae?.[0] !== undefined ? { formula1: formatValidationOperand(dv.type, dv.formulae[0]) } : {}),
        ...(dv.formulae?.[1] !== undefined ? { formula2: formatValidationOperand(dv.type, dv.formulae[1]) } : {}),
        ...(dv.allowBlank !== undefined ? { allowBlank: Boolean(dv.allowBlank) } : {}),
        ...(dv.type === 'list' ? { showDropdown: true } : {}),
        ...(dv.errorTitle ? { errorTitle: String(dv.errorTitle) } : {}),
        ...(dv.error ? { errorMessage: String(dv.error) } : {}),
      };
      (sheet.validations ||= {})[address] = rule;
    }
    (ws.columns || []).forEach((column, index) => {
      if (column.width) sheet.colWidths![index] = Math.round(column.width * 7 + 5);
      if ((column as any).hidden) hiddenColSet.add(index);
      if (((column as any).outlineLevel ?? 0) >= 1) outlineColSet.add(index);
    });
    if (hiddenColSet.size) sheet.hiddenCols = Array.from(hiddenColSet).sort((a, b) => a - b);
    if (hiddenRowSet.size) sheet.hiddenRows = Array.from(hiddenRowSet).sort((a, b) => a - b);
    const colGroups = buildOutlineGroups(outlineColSet, hiddenColSet);
    if (colGroups) sheet.colGroups = colGroups;
    const rowGroups = buildOutlineGroups(outlineRowSet, hiddenRowSet);
    if (rowGroups) sheet.rowGroups = rowGroups;
    for (const cfBlock of ((ws.model as any).conditionalFormattings || []) as { ref?: string; rules?: any[] }[]) {
      const range = cfBlock.ref ? parseA1Range(cfBlock.ref) : undefined;
      if (!range || !Array.isArray(cfBlock.rules)) continue;
      for (const r of cfBlock.rules) {
        let converted: ConditionalRule | undefined;
        const id = crypto.randomUUID();
        if (r.type === 'cellIs') {
          const opMap: Record<string, ConditionalRule['type']> = {
            greaterThan: 'greaterThan',
            lessThan: 'lessThan',
            between: 'between',
            equal: 'equalTo',
          };
          const mapped = opMap[r.operator];
          if (mapped) {
            const v1 = Number(r.formulae?.[0]);
            const v2 = r.formulae?.[1] !== undefined ? Number(r.formulae[1]) : undefined;
            converted = {
              id,
              range,
              type: mapped,
              ...(Number.isFinite(v1) ? { value1: v1 } : {}),
              ...(v2 !== undefined && Number.isFinite(v2) ? { value2: v2 } : {}),
              presetStyle: inferPresetFromCfStyle(r.style, palette),
            };
          }
        } else if (r.type === 'containsText') {
          const rawFormula = String(r.formulae?.[0] ?? r.text ?? '');
          const textVal = rawFormula.startsWith('"') && rawFormula.endsWith('"') ? rawFormula.slice(1, -1) : rawFormula;
          converted = { id, range, type: 'containsText', textValue: textVal, presetStyle: inferPresetFromCfStyle(r.style, palette) };
        } else if (r.type === 'expression' && /COUNTIF\([^,]+,[^)]+\)\s*>\s*1/i.test(String(r.formulae?.[0] || ''))) {
          converted = { id, range, type: 'duplicates', presetStyle: inferPresetFromCfStyle(r.style, palette) };
        } else if (r.type === 'aboveAverage' && r.aboveAverage !== false) {
          converted = { id, range, type: 'aboveAverage', presetStyle: inferPresetFromCfStyle(r.style, palette) };
        } else if (r.type === 'dataBar') {
          converted = { id, range, type: 'dataBar', dataBarColor: color(r.color, palette) || '#0ea5e9' };
        } else if (r.type === 'colorScale') {
          const first = color(r.color?.[0], palette) || '';
          const preset = first === '#F8696B' ? 'red-yellow-green' : first === '#3B82F6' || first === '#5A8AC6' ? 'blue-white-red' : 'green-yellow-red';
          converted = { id, range, type: 'colorScale', colorScale: preset };
        } else if (r.type === 'iconSet') {
          const iconSetStyle: IconSetStyle = String(r.iconSet || '').toLowerCase().includes('arrow') ? 'arrows' : 'trafficLights';
          converted = { id, range, type: 'iconSet', iconSetStyle };
        }
        if (converted) (sheet.conditionalRules ||= []).push(converted);
      }
    }
    for (const range of ws.model.merges || []) {
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)!;
      const col = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (match) sheet.merges!.push({ startCol: col(match[1]), startRow: +match[2] - 1, endCol: col(match[3]), endRow: +match[4] - 1 });
    }
    sheet.tables = (ws.getTables() as unknown as { model: { name: string; ref: string; tableRef: string; headerRow: boolean; totalsRow: boolean; columns: { name: string }[]; rows?: unknown[][] } }[]).map(table => {
      const m = table.model, reference = m.tableRef || m.ref, [first, last] = reference.split(':');
      const start = parseCellId(first), end = parseCellId(last || first);
      if (!start || !end) return null;
      return { name: m.name, columns: m.columns.map(c => c.name), hasHeaders: m.headerRow !== false, totalsRow: !!m.totalsRow,
        range: { startCol: start.col, endCol: end.col, startRow: start.row, endRow: end.row } };
    }).filter((table): table is NonNullable<typeof table> => !!table);
    readWorksheetImages(book, ws, sheet);
    return sheet;
  });
  const meta = xlsxMetadata(buffer);
  importDefinedNames(meta, sheets, names, rewrite);
  const report = importChartMetadata(meta, sheets, names, palette);
  importSparklineMetadata(meta, sheets, names);
  importPivotTableMetadata(meta, sheets, names);
  importDrawingShapes(meta, sheets, names);
  sheets[0].xlsxImportReport = { chartsImported: report.imported, chartsSkipped: report.skipped };
  return sheets;
}

function writeStyle(cell: Cell, s: CellStyle): void {
  cell.font = { name: s.fontFamily, size: s.fontSize, bold: s.bold, italic: s.italic, underline: s.underline, color: s.textColor ? argb(s.textColor) : undefined };
  cell.alignment = { horizontal: s.align, vertical: s.verticalAlign, wrapText: s.wrapText, ...(typeof s.textRotation === 'number' && s.textRotation !== 0 ? { textRotation: s.textRotation } : {}) };
  if (s.bgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(s.bgColor) };
  const decimal = (s.decimals ?? (s.numberFormat === 'currency' ? 2 : 0));
  const fraction = decimal ? '.' + '0'.repeat(Math.min(20, decimal)) : '';
  if (s.numberFormat && s.numberFormat !== 'general') cell.numFmt = (s.numberFormat === 'currency' ? '"$"#,##0' : s.numberFormat === 'comma' ? '#,##0' : '0') + fraction + (s.numberFormat === 'percent' ? '%' : '');
  if (s.numberFormat === 'date' || s.numberFormat === 'datetime') cell.numFmt = s.xlsxNumberFormat || (s.numberFormat === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss');
  if (s.xlsxNumberFormat && !s.numberFormat) cell.numFmt = s.xlsxNumberFormat;
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const b = s.borders?.[edge] || (s.border ? { style: 'thin' as const, color: '#000000' } : undefined);
    if (b) cell.border = { ...cell.border, [edge]: { style: b.style, color: argb(b.color) } };
  }
  if (s.locked === false) cell.protection = { locked: false };
}

export async function writeXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const book = await workbook();
  book.creator = 'Weave'; book.calcProperties.fullCalcOnLoad = true;
  bindWorkbookFormulaContext(sheets);
  const calculation = new WeakMap();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name, sheet.tabColor ? { properties: { tabColor: argb(sheet.tabColor) } } : undefined);
    for (const [address, data] of Object.entries(sheet.data)) {
      const cell = ws.getCell(address), raw = data.raw || '';
      if (!raw && !data.hyperlink) { const spill = getCellSpill(address, sheet.data, calculation); if (spill && spill.owner !== address) { if (data.style) writeStyle(cell, data.style); continue; } }
      const link = sanitizeHyperlink(data.hyperlink);
      if (raw.startsWith('=')) {
        const result = evaluateCellValueCached(address, sheet.data, calculation);
        const matrix = getCellMatrix(address, sheet.data, calculation), origin = parseCellId(address)!;
        cell.value = { formula: excelFormula(raw.slice(1), true), ...(String(result).startsWith('#') ? {} : { result: result as any }),
          ...(matrix ? { shareType: 'array' as const, ref: `${address}:${getCellId(origin.col + matrix.cols - 1, origin.row + matrix.rows - 1)}` } : {}) };
        if (matrix) for (let r = 0; r < matrix.rows; r++) for (let c = 0; c < matrix.cols; c++) if (r || c) ws.getCell(getCellId(origin.col + c, origin.row + r)).value = matrix.get(r, c);
      }
      else if (link) cell.value = { text: raw || link, hyperlink: link };
      else if (data.xlsxType === 'date' && /^\d{4}-\d{2}-\d{2}T/.test(raw) && !isNaN(Date.parse(raw))) cell.value = new Date(raw);
      else if (data.xlsxType === 'text') cell.value = raw;
      else if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) && !/^0\d/.test(raw)) cell.value = Number(raw);
      else if (/^(true|false)$/i.test(raw)) cell.value = raw.toLowerCase() === 'true';
      else cell.value = raw;
      if (data.style) writeStyle(cell, data.style);
    }
    for (const [address, comment] of Object.entries(sheet.comments || {})) {
      if (comment?.text) ws.getCell(address).note = comment.text;
    }
    for (const [address, dv] of Object.entries(sheet.validations || {})) {
      if (!dv || dv.type === 'any') continue;
      const formulae: any[] = [];
      if (dv.type === 'list') {
        const f1 = (dv.formula1 || '').trim();
        if (f1) formulae.push(f1.startsWith('=') ? f1 : `"${f1}"`);
      } else if (dv.type === 'date') {
        if (dv.formula1) formulae.push(new Date(dv.formula1));
        if (dv.formula2 && (dv.operator === 'between' || dv.operator === 'notBetween')) formulae.push(new Date(dv.formula2));
      } else {
        if (dv.formula1 !== undefined && dv.formula1 !== '') formulae.push(Number(dv.formula1));
        if (dv.formula2 !== undefined && dv.formula2 !== '' && (dv.operator === 'between' || dv.operator === 'notBetween')) formulae.push(Number(dv.formula2));
      }
      (ws.getCell(address) as any).dataValidation = {
        type: dv.type,
        ...(dv.operator && VALIDATION_TO_XLSX_OP[dv.operator] ? { operator: VALIDATION_TO_XLSX_OP[dv.operator] } : {}),
        ...(formulae.length ? { formulae } : {}),
        ...(dv.allowBlank !== undefined ? { allowBlank: dv.allowBlank } : {}),
        ...(dv.errorTitle || dv.errorMessage ? { showErrorMessage: true, ...(dv.errorTitle ? { errorTitle: dv.errorTitle } : {}), ...(dv.errorMessage ? { error: dv.errorMessage } : {}) } : {}),
      };
    }
    let cfPriority = 1;
    for (const rule of sheet.conditionalRules || []) {
      const ref = formatA1Range(rule.range);
      const style = cfStyleForPreset(rule.presetStyle);
      const rules: any[] = [];
      if (rule.type === 'greaterThan' || rule.type === 'lessThan' || rule.type === 'equalTo' || rule.type === 'between') {
        const op = rule.type === 'equalTo' ? 'equal' : rule.type;
        const formulae = rule.type === 'between' ? [rule.value1 ?? 0, rule.value2 ?? 0] : [rule.value1 ?? 0];
        rules.push({ type: 'cellIs', operator: op, priority: cfPriority++, formulae, style });
      } else if (rule.type === 'containsText' && rule.textValue) {
        rules.push({ type: 'containsText', operator: 'containsText', priority: cfPriority++, text: rule.textValue, formulae: [`"${rule.textValue}"`], style });
      } else if (rule.type === 'duplicates') {
        const minCol = Math.min(rule.range.startCol, rule.range.endCol);
        const maxCol = Math.max(rule.range.startCol, rule.range.endCol);
        const minRow = Math.min(rule.range.startRow, rule.range.endRow);
        const maxRow = Math.max(rule.range.startRow, rule.range.endRow);
        const tl = getCellId(minCol, minRow);
        const absRef = `$${getCellId(minCol, minRow).replace(/(\d+)$/, '$$$1')}:$${getCellId(maxCol, maxRow).replace(/(\d+)$/, '$$$1')}`;
        rules.push({ type: 'expression', priority: cfPriority++, formulae: [`COUNTIF(${absRef},${tl})>1`], style });
      } else if (rule.type === 'aboveAverage') {
        rules.push({ type: 'aboveAverage', priority: cfPriority++, aboveAverage: true, style });
      } else if (rule.type === 'dataBar') {
        rules.push({ type: 'dataBar', priority: cfPriority++, cfvo: [{ type: 'min' }, { type: 'max' }] });
      } else if (rule.type === 'colorScale') {
        const colors = rule.colorScale === 'red-yellow-green'
          ? ['FFF8696B', 'FFFFEB84', 'FF63BE7B']
          : rule.colorScale === 'blue-white-red'
            ? ['FF3B82F6', 'FFFFFFFF', 'FFEF4444']
            : ['FF63BE7B', 'FFFFEB84', 'FFF8696B'];
        rules.push({ type: 'colorScale', priority: cfPriority++, cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: colors.map(argbVal => ({ argb: argbVal })) });
      } else if (rule.type === 'iconSet') {
        rules.push({ type: 'iconSet', priority: cfPriority++, iconSet: rule.iconSetStyle === 'arrows' ? '3Arrows' : '3TrafficLights', cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }] });
      }
      if (rules.length) ws.addConditionalFormatting({ ref, rules });
    }
    for (const table of sheet.tables || []) {
      const snapshots = Object.keys(sheet.data).map(id => ({ id, value: ws.getCell(id).value, style: ws.getCell(id).style }));
      const first = table.range.startRow + (table.hasHeaders ? 1 : 0), last = table.range.endRow - (table.totalsRow ? 1 : 0);
      const rows = Array.from({ length: Math.max(0, last - first + 1) }, (_, r) => table.columns.map((_, c) => ws.getCell(getCellId(table.range.startCol + c, first + r)).value));
      ws.addTable({ name: table.name, ref: getCellId(table.range.startCol, table.range.startRow), headerRow: table.hasHeaders, totalsRow: !!table.totalsRow, columns: table.columns.map(name => ({ name })), rows });
      for (const snapshot of snapshots) { ws.getCell(snapshot.id).value = snapshot.value; ws.getCell(snapshot.id).style = snapshot.style; }
    }
    for (const [col, width] of Object.entries(sheet.colWidths || {})) ws.getColumn(+col + 1).width = Math.max(1, (width - 5) / 7);
    for (const col of sheet.hiddenCols || []) ws.getColumn(col + 1).hidden = true;
    for (const [row, height] of Object.entries(sheet.rowHeights || {})) ws.getRow(+row + 1).height = height * 3 / 4;
    for (const rowIdx of sheet.hiddenRows || []) {
      const row = ws.getRow(rowIdx + 1);
      if (!row.height) row.height = 18;
      row.hidden = true;
    }
    for (const group of sheet.colGroups || []) {
      for (let c = group.start; c <= group.end; c++) {
        const col = ws.getColumn(c + 1);
        (col as any).outlineLevel = 1;
        if (group.collapsed) col.hidden = true;
      }
    }
    for (const group of sheet.rowGroups || []) {
      for (let r = group.start; r <= group.end; r++) {
        const row = ws.getRow(r + 1);
        if (!row.height) row.height = 18;
        (row as any).outlineLevel = 1;
        if (group.collapsed) row.hidden = true;
      }
    }
    if (sheet.protected) {
      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        sort: false,
        autoFilter: false,
        formatCells: false,
      });
    }
    for (const merge of sheet.merges || []) ws.mergeCellsWithoutStyle(merge.startRow + 1, merge.startCol + 1, merge.endRow + 1, merge.endCol + 1);
    if (sheet.filtersEnabled) {
      let minCol = 0;
      let maxCol = 0;
      let maxRow = 0;
      let hasData = false;
      for (const id of Object.keys(sheet.data)) {
        const parsed = parseCellId(id);
        if (!parsed) continue;
        if (!hasData) {
          minCol = parsed.col;
          maxCol = parsed.col;
          maxRow = parsed.row;
          hasData = true;
        } else {
          minCol = Math.min(minCol, parsed.col);
          maxCol = Math.max(maxCol, parsed.col);
          maxRow = Math.max(maxRow, parsed.row);
        }
      }
      (ws as any).autoFilter = formatA1Range({ startCol: minCol, startRow: 0, endCol: maxCol, endRow: maxRow });
    }
    writeWorksheetImages(book, ws, sheet);
  }
  const output = new Uint8Array(await book.xlsx.writeBuffer());
  const names = sheets.flatMap((sheet, index) => [
    ...Object.entries(sheet.workbookNames || {}).map(([name, range]) => ({ name, range, scope: undefined as number | undefined })),
    ...Object.entries(sheet.definedNames || {}).map(([name, range]) => ({ name, range, scope: index as number | undefined })),
  ]);
  const hasCharts = sheets.some(s => Boolean(s.charts?.length));
  const hasSparklines = sheets.some(s => Boolean(s.sparklines && Object.keys(s.sparklines).length));
  const hasPivots = sheets.some(s => Boolean(s.pivotTables?.length));
  const hasGroups = sheets.some(s => Boolean(s.rowGroups?.length || s.colGroups?.length));
  const hasShapes = sheets.some(s => Boolean(s.artwork?.some(a => a.kind === 'shape')));
  if (!names.length && !hasCharts && !hasSparklines && !hasPivots && !hasGroups && !hasShapes) return output;
  const files = (await import('fflate')).unzipSync(output);
  if (names.length) {
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const definitions = '<definedNames>' + names.map(n => `<definedName name="${escape(n.name)}"${n.scope === undefined ? '' : ` localSheetId="${n.scope}"`}>${escape(excelFormula(n.range.replace(/^=/, ''), true))}</definedName>`).join('') + '</definedNames>';
    const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']).replace(/<definedNames[\s\S]*?<\/definedNames>/, '').replace('</workbook>', definitions + '</workbook>');
    files['xl/workbook.xml'] = strToU8(workbookXml);
  }
  if (hasCharts) {
    exportChartMetadata(files, sheets);
  }
  if (hasShapes) {
    exportDrawingShapes(files, sheets);
  }
  if (hasSparklines) {
    exportSparklineMetadata(files, sheets);
  }
  if (hasPivots) {
    exportPivotTableMetadata(files, sheets);
  }
  if (hasGroups) {
    exportOutlineProperties(files, sheets);
  }
  return zipSync(files);

}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function pxToFracIndex(px: number, axis: GridAxis): number {
  const clamped = Math.max(0, px);
  let idx = 0;
  while (idx < axis.count - 1 && axis.offset(idx + 1) <= clamped) idx++;
  const size = Math.max(1, axis.offset(idx + 1) - axis.offset(idx));
  return idx + (clamped - axis.offset(idx)) / size;
}

function fracIndexToPx(val: number, axis: GridAxis): number {
  const safe = Math.max(0, val);
  const idx = Math.floor(safe);
  const size = axis.offset(idx + 1) - axis.offset(idx);
  return axis.offset(idx) + (safe - idx) * size;
}

function readWorksheetImages(book: Workbook, ws: any, sheet: Sheet): void {
  const images = typeof ws.getImages === 'function' ? ws.getImages() : [];
  if (!images?.length) return;
  const mediaList = ((book.model as any)?.media || []) as { index: string | number; extension?: string; name?: string; buffer?: Uint8Array }[];
  if (!mediaList.length) return;
  const colAxis = new GridAxis(16384, 84, sheet.colWidths);
  const rowAxis = new GridAxis(1048576, 24, sheet.rowHeights);

  for (const img of images) {
    const media = mediaList.find(m => String(m.index) === String(img.imageId));
    if (!media?.buffer || media.buffer.byteLength > 8 * 1024 * 1024) continue;
    const rawExt = (media.extension || 'png').toLowerCase();
    const mimeExt = rawExt === 'jpg' ? 'jpeg' : ['png', 'jpeg', 'gif'].includes(rawExt) ? rawExt : '';
    if (!mimeExt) continue;
    const bytes = media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer);
    const dataUrl = `data:image/${mimeExt};base64,${uint8ToBase64(bytes)}`;
    const tl = img.range?.tl;
    const ext = img.range?.ext;
    const br = img.range?.br;
    const x = tl && typeof tl.col === 'number' ? fracIndexToPx(tl.col, colAxis) : 40;
    const y = tl && typeof tl.row === 'number' ? fracIndexToPx(tl.row, rowAxis) : 40;
    const width = ext?.width
      ? Math.max(24, Number(ext.width))
      : br && typeof br.col === 'number'
        ? Math.max(24, fracIndexToPx(br.col, colAxis) - x)
        : 200;
    const height = ext?.height
      ? Math.max(24, Number(ext.height))
      : br && typeof br.row === 'number'
        ? Math.max(24, fracIndexToPx(br.row, rowAxis) - y)
        : 150;
    const item: FloatingArtwork = {
      id: crypto.randomUUID(),
      kind: 'image',
      itemId: media.name || `imagen-${media.index}`,
      imageDataUrl: dataUrl,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width),
      height: Math.round(height),
    };
    (sheet.artwork ||= []).push(item);
  }
}

function writeWorksheetImages(book: Workbook, ws: any, sheet: Sheet): void {
  const images = (sheet.artwork || []).filter(art => art.kind === 'image' && art.imageDataUrl);
  if (!images.length) return;
  const colAxis = new GridAxis(16384, 84, sheet.colWidths);
  const rowAxis = new GridAxis(1048576, 24, sheet.rowHeights);

  for (const art of images) {
    const match = art.imageDataUrl!.match(/^data:image\/(png|jpeg|jpg|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) continue;
    const extension = (match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()) as 'png' | 'jpeg' | 'gif';
    const imageId = book.addImage({ base64: match[2], extension });
    ws.addImage(imageId, {
      tl: { col: pxToFracIndex(art.x, colAxis), row: pxToFracIndex(art.y, rowAxis) },
      ext: { width: Math.max(24, art.width), height: Math.max(24, art.height) },
    });
  }
}
