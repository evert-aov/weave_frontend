export type Scalar = string | number | boolean;
export type Value = Scalar | CalcArray;
export const LIMIT = 250000;
export class CalcError extends Error { constructor(readonly code: string) { super(code); } }
export function fail(code = '#¡VALOR!'): never { throw new CalcError(code); }
export const isError = (value: unknown): value is string => typeof value === 'string' && /^#(?:¡|¿|N\/A|REF!|VALUE!|NUM!|DIV\/0!|NAME\?|SPILL!|CALC!)/.test(value);
export const checked = (value: Scalar): Scalar => isError(value) ? fail(value) : value;
export function parseNumericLiteral(raw: string): { value: number; isPercent: boolean; isCurrency: boolean; decimals: number } | null {
  const s = raw.trim();
  if (!s) return null;

  let isPercent = false;
  let isCurrency = false;
  let body = s;

  if (body.endsWith('%')) {
    isPercent = true;
    body = body.slice(0, -1).trim();
  }
  const currMatch = body.match(/^([+-]?)\s*\$\s*([\s\S]+)$/);
  if (currMatch) {
    isCurrency = true;
    body = `${currMatch[1]}${currMatch[2].trim()}`;
  } else if (body.startsWith('$')) {
    isCurrency = true;
    body = body.slice(1).trim();
  }

  if (!/^[+-]?(?:\d[\d.,]*|[.,]\d+)$/.test(body) || !/\d/.test(body)) return null;

  let normalized = body;
  let decimals = 0;
  if (body.includes(',') && body.includes('.')) {
    const lastComma = body.lastIndexOf(',');
    const lastDot = body.lastIndexOf('.');
    if (lastComma > lastDot) {
      decimals = body.length - lastComma - 1;
      normalized = body.replace(/\./g, '').replace(',', '.');
    } else {
      decimals = body.length - lastDot - 1;
      normalized = body.replace(/,/g, '');
    }
  } else if (body.includes(',')) {
    if (/^[+-]?\d{1,3}(,\d{3})+$/.test(body) && !isPercent) {
      normalized = body.replace(/,/g, '');
    } else if ((body.match(/,/g)?.length || 0) === 1) {
      decimals = body.length - body.indexOf(',') - 1;
      normalized = body.replace(',', '.');
    } else {
      return null;
    }
  } else if (body.includes('.')) {
    if ((body.match(/\./g)?.length || 0) === 1) {
      decimals = body.length - body.indexOf('.') - 1;
    } else {
      return null;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const value = isPercent ? Number((parsed / 100).toPrecision(15)) : parsed;
  return { value, isPercent, isCurrency, decimals };
}

export const number = (value: Value): number => {
  const scalar = first(value); checked(scalar);
  if (scalar === 'VERDADERO' || scalar === 'TRUE' || scalar === true) return 1;
  if (scalar === 'FALSO' || scalar === 'FALSE' || scalar === false) return 0;
  if (typeof scalar === 'number') return Number.isFinite(scalar) ? scalar : fail();
  const s = String(scalar).trim();
  if (s === '') return 0;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const parsed = parseNumericLiteral(s);
  return parsed !== null ? parsed.value : fail();
};
export const truth = (value: Value): boolean => {
  const v = checked(first(value));
  return v !== '' && v !== false && v !== 0 && !/^(FALSE|FALSO)$/i.test(String(v));
};
export class CalcArray {
  origin?: { sheetName?: string; startCol: number; endCol: number; startRow: number; endRow: number };
  constructor(readonly rows: number, readonly cols: number, readonly get: (row: number, col: number) => Scalar,
    readonly sparse?: () => Iterable<[number, number, Scalar]>) {}
  static from(data: Scalar[][]): CalcArray {
    if (!data.length || !data[0]?.length) fail('#¡CALC!');
    return new CalcArray(data.length, data[0].length, (r, c) => data[r]?.[c] ?? '');
  }
  materialize(): Scalar[][] {
    if (this.rows * this.cols > LIMIT) fail('#¡NUM!');
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => this.get(r, c)));
  }
}
export const first = (value: Value): Scalar => value instanceof CalcArray ? value.get(0, 0) : value;
export const array = (value: Value): CalcArray => value instanceof CalcArray ? value : CalcArray.from([[value]]);
export function* values(value: Value): Generator<Scalar> {
  if (!(value instanceof CalcArray)) { yield value; return; }
  if (value.sparse) { for (const [, , v] of value.sparse()) yield v; return; }
  if (value.rows * value.cols > LIMIT) fail('#¡NUM!');
  for (let r = 0; r < value.rows; r++) for (let c = 0; c < value.cols; c++) yield value.get(r, c);
}
export const numeric = (value: Value): number[] => [...values(value)].flatMap(v => {
  checked(v);
  if (v === '' || typeof v === 'boolean' || v === 'VERDADERO' || v === 'FALSO' || v === 'TRUE' || v === 'FALSE') return [];
  if (typeof v === 'number') return Number.isFinite(v) ? [v] : [];
  const direct = Number(v);
  if (Number.isFinite(direct)) return [direct];
  const parsed = parseNumericLiteral(String(v));
  return parsed !== null ? [parsed.value] : [];
});
export function map(value: Value, fn: (v: Scalar, row: number, col: number) => Scalar): Value {
  if (!(value instanceof CalcArray)) return fn(value, 0, 0);
  if (value.rows * value.cols > LIMIT) fail('#¡NUM!');
  return new CalcArray(value.rows, value.cols, (r, c) => { try { return fn(value.get(r, c), r, c); } catch (e) { return e instanceof CalcError ? e.code : '#¡VALOR!'; } });
}
export function binary(a: Value, b: Value, fn: (x: Scalar, y: Scalar) => Scalar): Value {
  if (!(a instanceof CalcArray) && !(b instanceof CalcArray)) return fn(a, b);
  const x = array(a), y = array(b), rows = Math.max(x.rows, y.rows), cols = Math.max(x.cols, y.cols);
  if ((x.rows !== 1 && x.rows !== rows) || (y.rows !== 1 && y.rows !== rows) || (x.cols !== 1 && x.cols !== cols) || (y.cols !== 1 && y.cols !== cols)) fail();
  if (rows * cols > LIMIT) fail('#¡NUM!');
  return new CalcArray(rows, cols, (r, c) => { try { return fn(x.get(x.rows === 1 ? 0 : r, x.cols === 1 ? 0 : c), y.get(y.rows === 1 ? 0 : r, y.cols === 1 ? 0 : c)); } catch (e) { return e instanceof CalcError ? e.code : '#¡VALOR!'; } });
}
export function compare(a: Scalar, b: Scalar): number {
  checked(a); checked(b);
  if (a !== '' && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Math.sign(Number(a) - Number(b));
  const x = String(a).toLowerCase(), y = String(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0;
}
export function wildcard(pattern: string): RegExp {
  let result = '^';
  for (let i = 0; i < pattern.length; i++) {
    let ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length) { ch = pattern[++i]; result += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    else if (ch === '*') result += '.*'; else if (ch === '?') result += '.';
    else result += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(result + '$', 'i');
}
export function criterion(value: Scalar): (test: Scalar) => boolean {
  checked(value);
  const match = String(value).match(/^(>=|<=|<>|=|>|<)?([\s\S]*)$/)!;
  const op = match[1] || '=', expected = match[2];
  return test => {
    if (isError(test)) return false;
    const order = compare(test, expected);
    const equal = /[*?~]/.test(expected) ? wildcard(expected).test(String(test)) : order === 0;
    return op === '=' ? equal : op === '<>' ? !equal : op === '>' ? order > 0 : op === '<' ? order < 0 : op === '>=' ? order >= 0 : order <= 0;
  };
}
