import { array, binary, CalcArray, CalcError, checked, compare, criterion, fail, first, isError, LIMIT, map, number, numeric, Scalar, truth, Value, values, wildcard } from './calc-types';

export const FUNCTION_ALIASES: Record<string, string> = {
  SUMA: 'SUM', PROMEDIO: 'AVERAGE', CONTAR: 'COUNT', CONTARA: 'COUNTA', PRODUCTO: 'PRODUCT', RAIZ: 'SQRT', POTENCIA: 'POWER', REDONDEAR: 'ROUND',
  CONCATENAR: 'CONCAT', CONCATENATE: 'CONCAT', ESPACIOS: 'TRIM', MAYUSC: 'UPPER', MINUSC: 'LOWER', LARGO: 'LEN', HOY: 'TODAY', AHORA: 'NOW',
  'ALEATORIO.ENTRE': 'RANDBETWEEN', SI: 'IF', Y: 'AND', O: 'OR', NO: 'NOT', 'CONTAR.SI': 'COUNTIF', 'SUMAR.SI': 'SUMIF', BUSCARV: 'VLOOKUP',
  BUSCARH: 'HLOOKUP', BUSCARX: 'XLOOKUP', INDICE: 'INDEX', COINCIDIR: 'MATCH', 'SI.ERROR': 'IFERROR', 'SI.ND': 'IFNA', 'SI.CONJUNTO': 'IFS',
  'SUMAR.SI.CONJUNTO': 'SUMIFS', 'CONTAR.SI.CONJUNTO': 'COUNTIFS', 'PROMEDIO.SI': 'AVERAGEIF', 'PROMEDIO.SI.CONJUNTO': 'AVERAGEIFS',
  FECHA: 'DATE', 'AÑO': 'YEAR', MES: 'MONTH', DIA: 'DAY', 'FIN.MES': 'EOMONTH', 'DIAS.LAB': 'NETWORKDAYS', PAGO: 'PMT', VA: 'PV', VF: 'FV', VNA: 'NPV', TIR: 'IRR',
  IZQUIERDA: 'LEFT', DERECHA: 'RIGHT', EXTRAE: 'MID', TEXTO: 'TEXT', SUSTITUIR: 'SUBSTITUTE', VALOR: 'VALUE',
  FILTRAR: 'FILTER', ORDENAR: 'SORT', UNICOS: 'UNIQUE', SECUENCIA: 'SEQUENCE',
};
const EPOCH = Date.UTC(1899, 11, 31), DAY = 86400000;
export function dateSerial(date: Date): number { const days = (date.getTime() - EPOCH) / DAY; return days >= 60 ? days + 1 : days; }
function serialDate(value: Value): Date {
  const v = first(value); checked(v);
  if (typeof v === 'string' && !Number.isFinite(Number(v))) { const time = Date.parse(v); if (!Number.isFinite(time)) fail(); return new Date(time); }
  const n = number(v); if (n < 0) fail('#¡NUM!'); return new Date(EPOCH + (n >= 60 ? n - 1 : n) * DAY);
}
function safe(fn: () => Value): Value { try { return fn(); } catch (e) { return e instanceof CalcError ? e.code : '#¡VALOR!'; } }
function finite(value: number): number { return Number.isFinite(value) ? value : fail('#¡NUM!'); }
function scalarText(value: Value): string { const v = checked(first(value)); return typeof v === 'boolean' ? v ? 'TRUE' : 'FALSE' : String(v); }
function argumentCount(args: unknown[], min: number, max = Infinity): void { if (args.length < min || args.length > max) fail(); }
function sameShape(a: CalcArray, b: CalcArray): void { if (a.rows !== b.rows || a.cols !== b.cols) fail(); }
function matchingIndex(needle: Scalar, list: Scalar[], mode: number, reverse = false): number {
  const indexes = Array.from({ length: list.length }, (_, i) => i); if (reverse) indexes.reverse();
  const equal = mode === 2 ? (v: Scalar) => typeof v === 'string' && wildcard(String(needle)).test(v) : (v: Scalar) => typeof v === typeof needle && compare(v, needle) === 0;
  let approximate = -1;
  for (const i of indexes) {
    checked(list[i]); if (equal(list[i])) return i;
    if (mode === -1 && compare(list[i], needle) < 0 && (approximate < 0 || compare(list[i], list[approximate]) > 0)) approximate = i;
    if (mode === 1 && compare(list[i], needle) > 0 && (approximate < 0 || compare(list[i], list[approximate]) < 0)) approximate = i;
  }
  return approximate;
}
function lookupPosition(needle: Scalar, source: CalcArray, horizontal: boolean, mode: number, reverse = false): number {
  const length = horizontal ? source.cols : source.rows;
  let entries: { index: number; value: Scalar }[];
  if (source.sparse) {
    entries = [...source.sparse()].filter(([r, c]) => horizontal ? r === 0 : c === 0).map(([r, c, value]) => ({ index: horizontal ? c : r, value }));
    if (needle === '') {
      const occupied = new Set(entries.map(e => e.index)); let index = reverse ? length - 1 : 0;
      while (index >= 0 && index < length && occupied.has(index)) index += reverse ? -1 : 1;
      if (index >= 0 && index < length) entries.push({ index, value: '' });
    }
    entries.sort((a, b) => a.index - b.index);
  } else {
    if (length > LIMIT) fail('#¡NUM!');
    entries = Array.from({ length }, (_, index) => ({ index, value: source.get(horizontal ? 0 : index, horizontal ? index : 0) }));
  }
  const match = matchingIndex(needle, entries.map(e => e.value), mode, reverse); return match < 0 ? -1 : entries[match].index;
}
function countCriteria(ranges: CalcArray[], criteria: ((v: Scalar) => boolean)[], sum?: CalcArray): number {
  const base = ranges[0]; for (const r of ranges) sameShape(base, r); if (sum) sameShape(base, sum);
  const matches = (row: number, col: number) => ranges.every((r, i) => criteria[i](r.get(row, col)));
  if (sum?.sparse) {
    let result = 0; for (const [r, c, v] of sum.sparse()) if (matches(r, c)) { checked(v); if (v !== '' && Number.isFinite(Number(v))) result += Number(v); } return result;
  }
  if (ranges.every(r => !!r.sparse) && !sum) {
    const positions = new Set<string>(); for (const range of ranges) for (const [r, c] of range.sparse!()) positions.add(`${r}:${c}`);
    let count = criteria.every(test => test('')) ? base.rows * base.cols - positions.size : 0;
    for (const pos of positions) { const [r, c] = pos.split(':').map(Number); if (matches(r, c)) count++; } return count;
  }
  if (base.rows * base.cols > LIMIT) fail('#¡NUM!');
  let result = 0; for (let r = 0; r < base.rows; r++) for (let c = 0; c < base.cols; c++) if (matches(r, c)) result += sum ? number(sum.get(r, c)) : 1;
  return result;
}
export function financialPayment(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (type !== 0 && type !== 1) fail('#¡NUM!'); if (nper === 0) fail('#¡DIV/0!');
  if (!rate) return finite(-(pv + fv) / nper);
  const exponent = rate > -1 ? nper * Math.log1p(rate) : NaN;
  let numerator: number, denominator: number;
  if (exponent >= 0) { numerator = -rate * (pv + fv * Math.exp(-exponent)); denominator = (1 + rate * type) * -Math.expm1(-exponent); }
  else if (rate > -1) { numerator = -rate * (pv * Math.exp(exponent) + fv); denominator = (1 + rate * type) * Math.expm1(exponent); }
  else { const growth = Math.pow(1 + rate, nper); numerator = -rate * (pv * growth + fv); denominator = (1 + rate * type) * (growth - 1); }
  return denominator ? finite(numerator / denominator) : fail('#¡DIV/0!');
}
export function internalRate(flows: number[], guess = 0.1): number {
  if (!flows.some(v => v < 0) || !flows.some(v => v > 0) || guess <= -1) fail('#¡NUM!');
  const scale = Math.max(1, ...flows.slice(0, 1000).map(Math.abs));
  const normalized = flows.map(v => v / scale);
  const value = (x: number) => normalized.reduce((sum, amount, period) => sum + amount * Math.exp(-x * period), 0);
  let x = Math.log1p(guess);
  for (let iteration = 0; iteration < 100; iteration++) {
    const f = value(x), derivative = normalized.reduce((sum, amount, period) => sum - period * amount * Math.exp(-x * period), 0);
    if (Number.isFinite(f) && Math.abs(f) < 1e-10) return finite(Math.expm1(x));
    const next = x - f / derivative; if (!Number.isFinite(next) || next < -30 || next > 30) break;
    if (Math.abs(next - x) < 1e-12 && Math.abs(value(next)) < 1e-7) return finite(Math.expm1(next)); x = next;
  }
  // Search all brackets in log-rate space, choosing the root nearest the supplied guess.
  const brackets: [number, number][] = [];
  let a = -20, fa = value(a);
  for (let b = -19.9; b <= 20; b += 0.1) { const fb = value(b); if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0) brackets.push([a, b]); a = b; fa = fb; }
  brackets.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - Math.log1p(guess)) - Math.abs((b[0] + b[1]) / 2 - Math.log1p(guess)));
  if (!brackets.length) fail('#¡NUM!');
  [a, x] = brackets[0]; fa = value(a);
  for (let i = 0; i < 160; i++) { const middle = (a + x) / 2, fm = value(middle); if (Math.abs(fm) < 1e-10 || x - a < 1e-12) return finite(Math.expm1(middle)); if (fa * fm <= 0) x = middle; else { a = middle; fa = fm; } }
  fail('#¡NUM!');
}
function formatText(value: Value, mask: string): string {
  const scalar = checked(first(value));
  if (mask === '@') return String(scalar);
  const dateCode = mask.replace(/"[^"]*"|\[[^\]]*\]/g, '');
  if (/[ydhs]/i.test(dateCode) || (/m/i.test(dateCode) && !/[0#]/.test(dateCode))) {
    const date = serialDate(value), pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return mask.replace(/"(?:[^"]|"")*"|yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|ss|s/gi, (token, offset: number) => {
      if (token.startsWith('"')) return token.slice(1, -1).replace(/""/g, '"');
      const key = token.toLowerCase();
      if ((key === 'mm' || key === 'm') && (/h{1,2}:$/i.test(mask.slice(0, offset)) || /^:s/i.test(mask.slice(offset + token.length)))) return key === 'mm' ? pad(date.getUTCMinutes()) : String(date.getUTCMinutes());
      return key === 'yyyy' ? String(date.getUTCFullYear()) : key === 'yy' ? pad(date.getUTCFullYear() % 100) : key === 'mmmm' ? date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) : key === 'mmm' ? date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) : key === 'mm' ? pad(date.getUTCMonth() + 1) : key === 'm' ? String(date.getUTCMonth() + 1) : key === 'dd' ? pad(date.getUTCDate()) : key === 'd' ? String(date.getUTCDate()) : key === 'hh' ? pad(date.getUTCHours()) : key === 'h' ? String(date.getUTCHours()) : key === 'ss' ? pad(date.getUTCSeconds()) : String(date.getUTCSeconds());
    });
  }
  const n = number(value), part = mask.split(';')[n < 0 ? 1 : 0] || mask.split(';')[0], decimal = part.match(/\.([0#]+)/)?.[1] || '';
  const text = (part.includes('%') ? n * 100 : n).toLocaleString('en-US', { useGrouping: part.includes(','), minimumIntegerDigits: Math.min(21, part.split('.')[0].replace(/[^0]/g, '').length || 1), minimumFractionDigits: decimal.replace(/#/g, '').length, maximumFractionDigits: Math.min(20, decimal.length) });
  const prefix = part.match(/^[^0#.,]+/)?.[0]?.replace(/"/g, '') || '', suffix = part.match(/[^0#.,]+$/)?.[0]?.replace(/"/g, '') || '';
  return prefix + text + suffix;
}
export function callFunction(rawName: string, args: (() => Value)[]): Value {
  const name = FUNCTION_ALIASES[rawName] || rawName;
  const arg = (i: number, fallback: Value = '') => args[i] ? args[i]() : fallback;
  const num = (i: number, fallback = 0) => number(arg(i, fallback));
  const text = (i: number, fallback = '') => scalarText(arg(i, fallback));
  const all = () => args.flatMap(fn => numeric(fn()));
  const one = (fn: (v: Scalar) => Scalar) => map(arg(0), fn);
  switch (name) {
    case 'SUM': return all().reduce((a, b) => a + b, 0);
    case 'AVERAGE': { const v = all(); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : fail('#¡DIV/0!'); }
    case 'MIN': return all().reduce((a, b, i) => i ? Math.min(a, b) : b, 0);
    case 'MAX': return all().reduce((a, b, i) => i ? Math.max(a, b) : b, 0);
    case 'COUNT': return all().length;
    case 'COUNTA': return args.flatMap(fn => [...values(fn())]).filter(v => v !== '').length;
    case 'PRODUCT': return all().reduce((a, b) => a * b, 1);
    case 'ABS': return one(v => Math.abs(number(v)));
    case 'SQRT': return one(v => { const n = number(v); return n >= 0 ? Math.sqrt(n) : fail('#¡NUM!'); });
    case 'POWER': return binary(arg(0), arg(1), (a, b) => finite(Math.pow(number(a), number(b))));
    case 'ROUND': { const digits = Math.trunc(num(1)), factor = 10 ** digits; return one(v => Math.sign(number(v)) * Math.round(Math.abs(number(v)) * factor + Number.EPSILON) / factor); }
    case 'IF': {
      argumentCount(args, 1, 3); const condition = arg(0);
      if (!(condition instanceof CalcArray)) return truth(condition) ? arg(1, true) : arg(2, false);
      const yes = safe(() => arg(1, true)), no = safe(() => arg(2, false));
      return map(condition, (v, r, c) => first(truth(v) ? yes instanceof CalcArray ? yes.get(r, c) : yes : no instanceof CalcArray ? no.get(r, c) : no));
    }
    case 'IFERROR': case 'IFNA': {
      argumentCount(args, 2, 2); const result = safe(() => arg(0)); let fallback: Value | undefined;
      return map(result, (v, r, c) => {
        if (!isError(v) || (name === 'IFNA' && v !== '#N/A')) return v;
        fallback ??= arg(1); return fallback instanceof CalcArray ? fallback.get(fallback.rows === 1 ? 0 : r, fallback.cols === 1 ? 0 : c) : fallback;
      });
    }
    case 'IFS': {
      if (!args.length || args.length % 2) fail();
      const next = (index: number): Value => {
        if (index >= args.length) return '#N/A'; const condition = arg(index);
        if (!(condition instanceof CalcArray)) return truth(condition) ? arg(index + 1) : next(index + 2);
        const yes = safe(() => arg(index + 1)), no = safe(() => next(index + 2));
        return map(condition, (v, r, c) => { const choice = truth(v) ? yes : no; return choice instanceof CalcArray ? choice.get(choice.rows === 1 ? 0 : r, choice.cols === 1 ? 0 : c) : choice; });
      }; return next(0);
    }
    case 'AND': return args.every(fn => [...values(fn())].every(v => truth(v)));
    case 'OR': return args.some(fn => [...values(fn())].some(v => truth(v)));
    case 'NOT': return one(v => !truth(v));
    case 'SUMIF': case 'COUNTIF': case 'AVERAGEIF': {
      argumentCount(args, 2, 3); const range = array(arg(0)), test = criterion(first(arg(1))), target = args[2] ? array(arg(2)) : range;
      if (name === 'COUNTIF') return countCriteria([range], [test]);
      const total = countCriteria([range], [test], target);
      if (name === 'SUMIF') return total;
      const count = countCriteria([range, target], [test, v => v !== '' && !isError(v) && Number.isFinite(Number(v))]);
      return count ? total / count : fail('#¡DIV/0!');
    }
    case 'SUMIFS': case 'COUNTIFS': case 'AVERAGEIFS': {
      const offset = name === 'COUNTIFS' ? 0 : 1; if (args.length < offset + 2 || (args.length - offset) % 2) fail();
      const ranges: CalcArray[] = [], tests: ((v: Scalar) => boolean)[] = [];
      for (let i = offset; i < args.length; i += 2) { ranges.push(array(arg(i))); tests.push(criterion(first(arg(i + 1)))); }
      if (!offset) return countCriteria(ranges, tests);
      const target = array(arg(0)), total = countCriteria(ranges, tests, target);
      if (name === 'SUMIFS') return total;
      const count = countCriteria([...ranges, target], [...tests, v => v !== '' && !isError(v) && Number.isFinite(Number(v))]);
      return count ? total / count : fail('#¡DIV/0!');
    }
    case 'INDEX': {
      argumentCount(args, 2, 4); const source = array(arg(0)); let row = Math.trunc(num(1)), col = Math.trunc(num(2, 1));
      if (source.rows === 1 && args.length === 2) { col = row; row = 1; }
      if (row < 0 || col < 0 || row > source.rows || col > source.cols) fail('#¡REF!');
      if (!row || !col) return new CalcArray(row ? 1 : source.rows, col ? 1 : source.cols, (r, c) => source.get(row ? row - 1 : r, col ? col - 1 : c));
      return source.get(row - 1, col - 1);
    }
    case 'MATCH': {
      argumentCount(args, 2, 3); const source = array(arg(1)); if (source.rows !== 1 && source.cols !== 1) fail('#N/A');
      const mode = num(2, 1); if (![-1, 0, 1].includes(mode)) fail('#N/A');
      const i = lookupPosition(first(arg(0)), source, source.rows === 1, mode === 0 ? /[*?~]/.test(text(0)) ? 2 : 0 : -mode);
      return i >= 0 ? i + 1 : '#N/A';
    }
    case 'VLOOKUP': case 'HLOOKUP': {
      argumentCount(args, 3, 4); const source = array(arg(1)), horizontal = name === 'HLOOKUP', index = Math.trunc(num(2)) - 1;
      if (index < 0) fail(); if (index >= (horizontal ? source.rows : source.cols)) fail('#¡REF!');
      const approximate = truth(arg(3, true));
      const i = lookupPosition(first(arg(0)), source, horizontal, approximate ? -1 : /[*?~]/.test(text(0)) ? 2 : 0);
      return i < 0 ? '#N/A' : source.get(horizontal ? index : i, horizontal ? i : index);
    }
    case 'XLOOKUP': {
      argumentCount(args, 3, 6); const lookup = array(arg(1)), result = array(arg(2));
      if (lookup.rows !== 1 && lookup.cols !== 1) fail();
      const horizontal = lookup.rows === 1, mode = num(4), search = num(5, 1);
      if (![0, -1, 1, 2].includes(mode) || ![1, -1, 2, -2].includes(search)) fail();
      if (horizontal ? lookup.cols !== result.cols : lookup.rows !== result.rows) fail();
      const index = lookupPosition(first(arg(0)), lookup, horizontal, mode, search < 0);
      if (index < 0) return arg(3, '#N/A');
      if (horizontal && result.rows > 1) return new CalcArray(result.rows, 1, r => result.get(r, index));
      if (!horizontal && result.cols > 1) return new CalcArray(1, result.cols, (_, c) => result.get(index, c));
      return result.get(horizontal ? 0 : index, horizontal ? index : 0);
    }
    case 'PMT': argumentCount(args, 3, 5); return financialPayment(num(0), num(1), num(2), num(3), num(4));
    case 'FV': case 'PV': {
      argumentCount(args, 3, 5); const rate = num(0), n = num(1), payment = num(2), other = num(3), type = num(4);
      if (type !== 0 && type !== 1) fail('#¡NUM!'); if (!rate) return finite(-(other + payment * n));
      const growth = Math.pow(1 + rate, n), annuity = rate > -1 ? Math.expm1(n * Math.log1p(rate)) / rate : (growth - 1) / rate;
      return finite(name === 'FV' ? -(other * growth + payment * (1 + rate * type) * annuity) : -(other + payment * (1 + rate * type) * annuity) / growth);
    }
    case 'NPV': {
      argumentCount(args, 2); const rate = num(0); if (rate === -1) fail('#¡DIV/0!');
      const flows = args.slice(1).flatMap(fn => numeric(fn())); return finite(flows.reduce((sum, v, i) => sum + v / Math.pow(1 + rate, i + 1), 0));
    }
    case 'IRR': argumentCount(args, 1, 2); return internalRate(numeric(arg(0)), num(1, 0.1));
    case 'DATE': {
      argumentCount(args, 3, 3); let year = Math.trunc(num(0)); if (year >= 0 && year < 1900) year += 1900;
      if (year < 0 || year > 9999) fail('#¡NUM!'); return finite(dateSerial(new Date(Date.UTC(year, Math.trunc(num(1)) - 1, 1))) + Math.trunc(num(2)) - 1);
    }
    case 'YEAR': return serialDate(arg(0)).getUTCFullYear();
    case 'MONTH': return serialDate(arg(0)).getUTCMonth() + 1;
    case 'DAY': return first(arg(0)) === 60 ? 29 : serialDate(arg(0)).getUTCDate();
    case 'EOMONTH': { const date = serialDate(arg(0)), end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Math.trunc(num(1)) + 1, 0)); return end.getUTCFullYear() === 1900 && end.getUTCMonth() === 1 ? 60 : dateSerial(end); }
    case 'NETWORKDAYS': {
      argumentCount(args, 2, 3); let start = Math.floor(dateSerial(serialDate(arg(0)))), end = Math.floor(dateSerial(serialDate(arg(1)))); const sign = start <= end ? 1 : -1;
      if (sign < 0) [start, end] = [end, start]; if (end - start > 3660000) fail('#¡NUM!');
      const holidays = new Set([...values(arg(2))].filter(v => v !== '').map(v => Math.floor(dateSerial(serialDate(v)))));
      let count = 0; for (let d = start; d <= end; d++) { const weekday = serialDate(d).getUTCDay(); if (weekday && weekday !== 6 && !holidays.has(d)) count++; } return sign * count;
    }
    case 'TODAY': { const now = new Date(); return dateSerial(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))); }
    case 'NOW': { const now = new Date(); return dateSerial(new Date(now.getTime() - now.getTimezoneOffset() * 60000)); }
    case 'RANDBETWEEN': { const min = Math.ceil(num(0)), max = Math.floor(num(1)); if (min > max) fail('#¡NUM!'); return Math.floor(Math.random() * (max - min + 1)) + min; }
    case 'CONCAT': return args.flatMap(fn => [...values(fn())]).map(v => scalarText(v)).join('');
    case 'TRIM': return one(v => scalarText(v).trim().replace(/ +/g, ' '));
    case 'UPPER': return one(v => scalarText(v).toUpperCase());
    case 'LOWER': return one(v => scalarText(v).toLowerCase());
    case 'LEN': return one(v => scalarText(v).length);
    case 'LEFT': case 'RIGHT': { const count = Math.trunc(num(1, 1)); if (count < 0) fail(); return one(v => name === 'LEFT' ? scalarText(v).slice(0, count) : count ? scalarText(v).slice(-count) : ''); }
    case 'MID': { const start = Math.trunc(num(1)), count = Math.trunc(num(2)); if (start < 1 || count < 0) fail(); return one(v => scalarText(v).slice(start - 1, start - 1 + count)); }
    case 'SUBSTITUTE': {
      argumentCount(args, 3, 4); const source = text(0), old = text(1), replacement = text(2), instance = args[3] ? Math.trunc(num(3)) : undefined;
      if (instance !== undefined && instance <= 0) fail(); if (!old) return source; let count = 0;
      return source.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), match => { count++; return instance === undefined || count === instance ? replacement : match; });
    }
    case 'TEXT': argumentCount(args, 2, 2); return formatText(arg(0), text(1));
    case 'VALUE': { const s = text(0).replace(/[$€£,\s]/g, ''); return finite(Number(s.replace('%', '')) / (s.includes('%') ? 100 : 1)); }
    case 'SEQUENCE': {
      argumentCount(args, 1, 4); const rows = Math.trunc(num(0)), cols = Math.trunc(num(1, 1)), start = num(2, 1), step = num(3, 1);
      if (rows < 1 || cols < 1 || rows * cols > LIMIT) fail('#¡NUM!'); return new CalcArray(rows, cols, (r, c) => start + (r * cols + c) * step);
    }
    case 'FILTER': {
      argumentCount(args, 2, 3); const data = array(arg(0)), include = array(arg(1));
      const byRow = include.cols === 1 && include.rows === data.rows, byCol = include.rows === 1 && include.cols === data.cols;
      if (!byRow && !byCol) fail(); if (data.rows * data.cols > LIMIT) fail('#¡NUM!');
      const selected = Array.from({ length: byRow ? data.rows : data.cols }, (_, i) => i).filter(i => truth(include.get(byRow ? i : 0, byRow ? 0 : i)));
      if (!selected.length) return arg(2, '#¡CALC!');
      return new CalcArray(byRow ? selected.length : data.rows, byRow ? data.cols : selected.length, (r, c) => data.get(byRow ? selected[r] : r, byRow ? c : selected[c]));
    }
    case 'SORT': {
      argumentCount(args, 1, 4); const data = array(arg(0)), byCol = truth(arg(3, false)), index = Math.trunc(num(1, 1)) - 1, order = num(2, 1);
      if (index < 0 || index >= (byCol ? data.rows : data.cols) || ![1, -1].includes(order)) fail(); if (data.rows * data.cols > LIMIT) fail('#¡NUM!');
      const positions = Array.from({ length: byCol ? data.cols : data.rows }, (_, i) => i);
      positions.sort((a, b) => order * compare(data.get(byCol ? index : a, byCol ? a : index), data.get(byCol ? index : b, byCol ? b : index)));
      return new CalcArray(data.rows, data.cols, (r, c) => data.get(byCol ? r : positions[r], byCol ? positions[c] : c));
    }
    case 'UNIQUE': {
      argumentCount(args, 1, 3); const data = array(arg(0)), byCol = truth(arg(1, false)), exactlyOnce = truth(arg(2, false));
      if (data.rows * data.cols > LIMIT) fail('#¡NUM!'); const groups = new Map<string, { count: number; index: number }>();
      for (let i = 0; i < (byCol ? data.cols : data.rows); i++) {
        const key = JSON.stringify(Array.from({ length: byCol ? data.rows : data.cols }, (_, j) => String(data.get(byCol ? j : i, byCol ? i : j)).toLowerCase()));
        const group = groups.get(key); if (group) group.count++; else groups.set(key, { count: 1, index: i });
      }
      const positions = [...groups.values()].filter(g => !exactlyOnce || g.count === 1).map(g => g.index); if (!positions.length) return '#¡CALC!';
      return new CalcArray(byCol ? data.rows : positions.length, byCol ? positions.length : data.cols, (r, c) => data.get(byCol ? r : positions[r], byCol ? positions[c] : c));
    }
    default: return '#¿NOMBRE?';
  }
}
