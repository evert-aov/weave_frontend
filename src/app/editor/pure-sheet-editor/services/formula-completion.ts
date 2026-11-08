import { EXCEL_FUNCTIONS } from '../constants/excel.constants';
import { Sheet, SheetGrid } from '../models/excel.model';
import { parseCellId } from './formula-engine.service';
export interface Completion { label: string; insert: string; kind: 'function' | 'text' | 'name' | 'table'; start: number; end: number; detail: string; }
const columnTexts = new WeakMap<SheetGrid, Map<string, string[]>>();
export function completions(value: string, caret: number, grid: SheetGrid, column: number, row: number, sheets: Sheet[], current: Sheet, language: 'es' | 'en'): Completion[] {
  const prefix = value.slice(0, caret);
  if (!value.startsWith('=')) {
    if (!value.trim()) return [];
    let columns = columnTexts.get(grid); if (!columns) { columns = new Map(); columnTexts.set(grid, columns); }
    const columnKey = `${column}:${row}`;
    let texts = columns.get(columnKey);
    if (!texts) { texts = [...new Set(Object.keys(grid).filter(id => { const cell = parseCellId(id); return cell?.col === column && cell.row !== row; }).map(id => grid[id].raw).filter(raw => raw && !raw.startsWith('=') && !Number.isFinite(Number(raw))))]; columns.set(columnKey, texts); }
    return texts.filter(text => text.toLowerCase().startsWith(value.toLowerCase()) && text.toLowerCase() !== value.toLowerCase()).slice(0, 8).map(text => ({ label: text, insert: text, kind: 'text', start: 0, end: value.length, detail: '' }));
  }
  if ((prefix.replace(/""/g, '').match(/"/g)?.length || 0) % 2) return [];
  // Complete structured column names after a table opening bracket.
  const structured = prefix.match(/([A-Z_\w.\u00c0-\uffff]+)\[(@?)([^\]]*)$/i);
  if (structured) {
    const table = sheets.flatMap(s => s.tables || []).find(t => t.name.toLowerCase() === structured[1].toLowerCase());
    return (table?.columns || []).filter(name => name.toUpperCase().startsWith(structured[3].toUpperCase())).slice(0, 10).map(name => ({ label: name, insert: name, kind: 'name', start: caret - structured[3].length, end: caret, detail: table!.name }));
  }
  const match = prefix.match(/[A-Z_\u00c0-\uffff][\w.\u00c0-\uffff]*$/i); if (!match) return [];
  const token = match[0].toUpperCase(), start = caret - match[0].length;
  const result: Completion[] = EXCEL_FUNCTIONS.filter(fn => fn.nameEn.startsWith(token) || fn.nameEs.startsWith(token)).map(fn => ({ label: language === 'es' ? `${fn.nameEn}${fn.nameEs !== fn.nameEn ? ' · ' + fn.nameEs : ''}` : fn.nameEn, insert: fn.nameEn, kind: 'function', start, end: caret, detail: fn.syntax }));
  const names = new Set([...Object.keys(current.definedNames || {}), ...sheets.flatMap(s => Object.keys(s.workbookNames || {}))]);
  for (const name of names) if (name.toUpperCase().startsWith(token)) result.push({ label: name, insert: name, kind: 'name', start, end: caret, detail: language === 'es' ? 'Nombre definido' : 'Defined name' });
  for (const table of sheets.flatMap(s => s.tables || [])) if (table.name.toUpperCase().startsWith(token)) result.push({ label: table.name, insert: table.name, kind: 'table', start, end: caret, detail: language === 'es' ? 'Tabla' : 'Table' });
  return result.slice(0, 12);
}
export function completeValue(value: string, completion: Completion): { value: string; caret: number } {
  const before = value.slice(0, completion.start), after = value.slice(completion.end);
  if (completion.kind === 'function') {
    if (after.startsWith('(')) return { value: before + completion.insert + after, caret: before.length + completion.insert.length + 1 };
    return { value: before + completion.insert + '(' + (after.includes(')') ? after : ')' + after), caret: before.length + completion.insert.length + 1 };
  }
  if (completion.kind === 'table') return { value: before + completion.insert + '[]' + after, caret: before.length + completion.insert.length + 1 };
  return { value: before + completion.insert + after, caret: before.length + completion.insert.length };
}
export function formulaSignature(value: string, caret: number): string {
  const match = value.slice(0, caret).match(/([A-Z_\u00c0-\uffff][\w.\u00c0-\uffff]*)\([^()]*$/i);
  if (!match) return '';
  return EXCEL_FUNCTIONS.find(fn => fn.nameEn === match[1].toUpperCase() || fn.nameEs === match[1].toUpperCase())?.syntax || '';
}
