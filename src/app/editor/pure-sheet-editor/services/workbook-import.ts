import { Sheet } from '../models/excel.model';
/** Keep unrelated workbook names/tables intact when appending another XLSX workbook. */
export function prepareImportedWorkbook(imported: Sheet[], existing: Sheet[]): Record<string, string> {
  const existingNames = Object.fromEntries(existing.flatMap(s => Object.entries(s.workbookNames || {})));
  const incoming = Object.fromEntries(imported.flatMap(s => Object.entries(s.workbookNames || {})));
  const used = new Set([...Object.keys(existingNames), ...existing.flatMap(s => (s.tables || []).map(t => t.name))].map(n => n.toLowerCase()));
  const rename = new Map<string, string>(), tableRename = new Map<string, string>();
  const unique = (name: string) => { let candidate = name, suffix = 2; while (used.has(candidate.toLowerCase())) candidate = `${name.slice(0, 245)}_${suffix++}`; used.add(candidate.toLowerCase()); return candidate; };
  for (const name of Object.keys(incoming)) rename.set(name.toLowerCase(), unique(name));
  for (const table of imported.flatMap(s => s.tables || [])) tableRename.set(table.name.toLowerCase(), unique(table.name));
  function rewrite(formula: string, local: Record<string, string> = {}): string {
    const locals = new Set(Object.keys(local).map(n => n.toLowerCase()));
    let result = '', pos = 0, bracket = 0;
    while (pos < formula.length) {
      const ch = formula[pos];
      if (ch === '"' || ch === "'") {
        const quote = ch; result += formula[pos++];
        while (pos < formula.length) { const next = formula[pos++]; result += next; if (next === quote) { if (formula[pos] === quote) result += formula[pos++]; else break; } }
      } else if (ch === '[') { bracket++; result += formula[pos++]; }
      else if (ch === ']') { bracket--; result += formula[pos++]; }
      else if (!bracket && /[A-Z_\u00c0-\uffff]/i.test(ch)) {
        const word = formula.slice(pos).match(/^[A-Z_\u00c0-\uffff][\w.\u00c0-\uffff]*/i)![0], after = formula.slice(pos + word.length), key = word.toLowerCase();
        const replacement = after.startsWith('[') ? tableRename.get(key) : after.startsWith('!') || /^\s*\(/.test(after) || locals.has(key) ? undefined : rename.get(key);
        result += replacement || word; pos += word.length;
      } else result += formula[pos++];
    }
    return result;
  }
  const globals = { ...existingNames };
  for (const [name, value] of Object.entries(incoming)) globals[rename.get(name.toLowerCase())!] = rewrite(value);
  for (const sheet of imported) {
    for (const cell of Object.values(sheet.data)) if (cell.raw.startsWith('=')) cell.raw = rewrite(cell.raw, sheet.definedNames);
    sheet.definedNames = Object.fromEntries(Object.entries(sheet.definedNames || {}).map(([name, value]) => [name, rewrite(value, sheet.definedNames)]));
    if (sheet.tables) sheet.tables = sheet.tables.map(table => ({ ...table, name: tableRename.get(table.name.toLowerCase())! }));
    delete sheet.workbookNames;
  }
  return globals;
}
