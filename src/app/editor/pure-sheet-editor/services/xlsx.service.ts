import { zipSync, strToU8 } from 'fflate';
import { importChartMetadata, importDefinedNames, xlsxMetadata } from './xlsx-charts';
import type { Workbook, Cell, RowModel } from 'exceljs';
import { EXCEL_FUNCTIONS } from '../constants/excel.constants';
import { CellStyle, Sheet } from '../models/excel.model';
import { bindWorkbookFormulaContext, evaluateCellValue, evaluateCellValueCached, getCellMatrix, getCellId, parseCellId, findWorksheetReferences, formatWorksheetReference, getCellSpill } from './formula-engine.service';

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
  return s;
}

export async function readXlsx(buffer: ArrayBuffer, existingNames: string[] = []): Promise<Sheet[]> {
  const book = await workbook();
  await book.xlsx.load(buffer as any);
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
    // Iterate stored cell models so blank formatted cells survive without filling sparse gaps.
    const rows = (ws.model as unknown as { rows: RowModel[] }).rows || [];
    const arrayRanges = rows.flatMap(row => row.cells.filter(cell => cell.formula && (cell as any).shareType === 'array' && (cell as any).ref).map(cell => {
      const [a, b] = String((cell as any).ref).split(':'); return { master: String(cell.address), start: parseCellId(a)!, end: parseCellId(b || a)! };
    }));
    for (const rowModel of rows) {
      const row = ws.getRow(rowModel.number);
      if (row.height) sheet.rowHeights![row.number - 1] = row.height * 4 / 3;
      for (const cellModel of rowModel.cells) {
        const cell = ws.getCell(String(cellModel.address));
        const mergedInterior = cell.isMerged && cell.master.address !== cell.address;
        const coordinates = parseCellId(cell.address)!;
        if (arrayRanges.some(range => cell.address !== range.master && coordinates.col >= range.start.col && coordinates.col <= range.end.col && coordinates.row >= range.start.row && coordinates.row <= range.end.row)) continue;
        if (++count > 250000) throw new Error('El archivo supera el límite de 250.000 celdas importables.');
        // A merged interior resolves its value/formula through the master, but its
        // own style carries perimeter borders. Keep that style without duplicating content.
        const value = mergedInterior ? null : cell.value;
        let raw: string;
        if (!mergedInterior && cell.formula) {
          raw = `=${excelFormula(cell.formula)}`;
          for (const ref of findWorksheetReferences(raw).reverse()) {
            const renamed = ref.sheetName && names.get(ref.sheetName.toLowerCase());
            if (renamed) raw = raw.slice(0, ref.index) + formatWorksheetReference(renamed, ref.start + (ref.end ? `:${ref.end}` : '')) + raw.slice(ref.index + ref.token.length);
          }
        } else if (value instanceof Date) raw = value.toISOString();
        else if (value && typeof value === 'object') raw = 'richText' in value ? value.richText.map(run => run.text).join('') : 'text' in value ? value.text : 'error' in value ? value.error : '';
        else raw = value == null ? '' : String(value);
        sheet.data[cell.address] = { raw, style: readStyle(cell, palette), ...(value instanceof Date ? { xlsxType: 'date' as const } : typeof value === 'string' ? { xlsxType: 'text' as const } : {}) };
      }
    }
    (ws.columns || []).forEach((column, index) => { if (column.width) sheet.colWidths![index] = Math.round(column.width * 7 + 5); });
    for (const range of ws.model.merges || []) {
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)!;
      const col = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (match) sheet.merges!.push({ startCol: col(match[1]), startRow: +match[2] - 1, endCol: col(match[3]), endRow: +match[4] - 1 });
    }
    const frozen = (ws.views || []).find(view => view.state === 'frozen');
    if (frozen?.state === 'frozen') sheet.freezePanes = { rows: frozen.ySplit || 0, cols: frozen.xSplit || 0 };
    sheet.tables = (ws.getTables() as unknown as { model: { name: string; ref: string; tableRef: string; headerRow: boolean; totalsRow: boolean; columns: { name: string }[]; rows?: unknown[][] } }[]).map(table => {
      const m = table.model, reference = m.tableRef || m.ref, [first, last] = reference.split(':');
      const start = parseCellId(first), end = parseCellId(last || first);
      if (!start || !end) return null;
      return { name: m.name, columns: m.columns.map(c => c.name), hasHeaders: m.headerRow !== false, totalsRow: !!m.totalsRow,
        range: { startCol: start.col, endCol: end.col, startRow: start.row, endRow: end.row } };
    }).filter((table): table is NonNullable<typeof table> => !!table);
    return sheet;
  });
  const meta = xlsxMetadata(buffer);
  importDefinedNames(meta, sheets, names, rewrite);
  const report = importChartMetadata(meta, sheets, names, palette);
  sheets[0].xlsxImportReport = { chartsImported: report.imported, chartsSkipped: report.skipped };
  return sheets;
}

function writeStyle(cell: Cell, s: CellStyle): void {
  cell.font = { name: s.fontFamily, size: s.fontSize, bold: s.bold, italic: s.italic, underline: s.underline, color: s.textColor ? argb(s.textColor) : undefined };
  cell.alignment = { horizontal: s.align, vertical: s.verticalAlign, wrapText: s.wrapText };
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
}

export async function writeXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const book = await workbook();
  book.creator = 'Weave'; book.calcProperties.fullCalcOnLoad = true;
  bindWorkbookFormulaContext(sheets);
  const calculation = new WeakMap();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name);
    for (const [address, data] of Object.entries(sheet.data)) {
      const cell = ws.getCell(address), raw = data.raw || '';
      if (!raw) { const spill = getCellSpill(address, sheet.data, calculation); if (spill && spill.owner !== address) { if (data.style) writeStyle(cell, data.style); continue; } }
      if (raw.startsWith('=')) {
        const result = evaluateCellValueCached(address, sheet.data, calculation);
        const matrix = getCellMatrix(address, sheet.data, calculation), origin = parseCellId(address)!;
        cell.value = { formula: excelFormula(raw.slice(1), true), ...(String(result).startsWith('#') ? {} : { result: result as any }),
          ...(matrix ? { shareType: 'array' as const, ref: `${address}:${getCellId(origin.col + matrix.cols - 1, origin.row + matrix.rows - 1)}` } : {}) };
        if (matrix) for (let r = 0; r < matrix.rows; r++) for (let c = 0; c < matrix.cols; c++) if (r || c) ws.getCell(getCellId(origin.col + c, origin.row + r)).value = matrix.get(r, c);
      }
      else if (data.xlsxType === 'date' && /^\d{4}-\d{2}-\d{2}T/.test(raw) && !isNaN(Date.parse(raw))) cell.value = new Date(raw);
      else if (data.xlsxType === 'text') cell.value = raw;
      else if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) && !/^0\d/.test(raw)) cell.value = Number(raw);
      else if (/^(true|false)$/i.test(raw)) cell.value = raw.toLowerCase() === 'true';
      else cell.value = raw;
      if (data.style) writeStyle(cell, data.style);
    }
    for (const table of sheet.tables || []) {
      const snapshots = Object.keys(sheet.data).map(id => ({ id, value: ws.getCell(id).value, style: ws.getCell(id).style }));
      const first = table.range.startRow + (table.hasHeaders ? 1 : 0), last = table.range.endRow - (table.totalsRow ? 1 : 0);
      const rows = Array.from({ length: Math.max(0, last - first + 1) }, (_, r) => table.columns.map((_, c) => ws.getCell(getCellId(table.range.startCol + c, first + r)).value));
      ws.addTable({ name: table.name, ref: getCellId(table.range.startCol, table.range.startRow), headerRow: table.hasHeaders, totalsRow: !!table.totalsRow, columns: table.columns.map(name => ({ name })), rows });
      for (const snapshot of snapshots) { ws.getCell(snapshot.id).value = snapshot.value; ws.getCell(snapshot.id).style = snapshot.style; }
    }
    for (const [col, width] of Object.entries(sheet.colWidths || {})) ws.getColumn(+col + 1).width = Math.max(1, (width - 5) / 7);
    for (const [row, height] of Object.entries(sheet.rowHeights || {})) ws.getRow(+row + 1).height = height * 3 / 4;
    for (const merge of sheet.merges || []) ws.mergeCellsWithoutStyle(merge.startRow + 1, merge.startCol + 1, merge.endRow + 1, merge.endCol + 1);
    if (sheet.freezePanes) ws.views = [{ state: 'frozen', xSplit: sheet.freezePanes.cols, ySplit: sheet.freezePanes.rows }];
  }
  const output = new Uint8Array(await book.xlsx.writeBuffer());
  const names = sheets.flatMap((sheet, index) => [
    ...Object.entries(sheet.workbookNames || {}).map(([name, range]) => ({ name, range, scope: undefined as number | undefined })),
    ...Object.entries(sheet.definedNames || {}).map(([name, range]) => ({ name, range, scope: index as number | undefined })),
  ]);
  if (!names.length) return output;
  const files = (await import('fflate')).unzipSync(output);
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const definitions = '<definedNames>' + names.map(n => `<definedName name="${escape(n.name)}"${n.scope === undefined ? '' : ` localSheetId="${n.scope}"`}>${escape(excelFormula(n.range.replace(/^=/, ''), true))}</definedName>`).join('') + '</definedNames>';
  const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']).replace(/<definedNames[\s\S]*?<\/definedNames>/, '').replace('</workbook>', definitions + '</workbook>');
  files['xl/workbook.xml'] = strToU8(workbookXml);
  return zipSync(files);

}
