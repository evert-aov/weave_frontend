import { CalcArray, first, binary, checked, compare, fail, map, number, Scalar, Value } from './calc-types';
export type Node = { kind: 'literal'; value: Scalar } | { kind: 'reference'; name: string } | { kind: 'call'; name: string; args: Node[] } |
  { kind: 'binary'; op: string; left: Node; right: Node } | { kind: 'unary'; op: string; value: Node } | { kind: 'matrix'; rows: Node[][] };
interface Token { text: string; type: 'number' | 'string' | 'word' | 'symbol' | 'error'; }
const trees = new Map<string, Node>();
export function parseFormula(source: string): Node {
  const cached = trees.get(source); if (cached) return cached;
  const tokens: Token[] = []; let pos = 0;
  while (pos < source.length) {
    if (/\s/.test(source[pos])) { pos++; continue; }
    const rest = source.slice(pos); let match: RegExpMatchArray | null;
    if ((match = rest.match(/^"(?:[^"]|"")*"/))) { tokens.push({ text: match[0].slice(1, -1).replace(/""/g, '"'), type: 'string' }); pos += match[0].length; }
    else if ((match = rest.match(/^#(?:¡[^\s,;()]+|¿[^\s,;()]+|N\/A|[A-Z0-9/]+[!?])/i))) { tokens.push({ text: match[0], type: 'error' }); pos += match[0].length; }
    else if ((match = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?![\w!:$])/i))) { tokens.push({ text: match[0], type: 'number' }); pos += match[0].length; }
    else if (/^[A-ZÁÉÍÓÚÑ_$'@\u00c0-\uffff]/i.test(rest) || /^\d+:\d+/.test(rest)) {
      let text = '', bracket = 0, quote = false;
      while (pos < source.length) {
        const ch = source[pos];
        if (ch === "'") {
          text += ch; pos++;
          if (quote && source[pos] === "'") { text += source[pos++]; continue; }
          quote = !quote; continue;
        }
        if (!quote) {
          if (ch === '[') bracket++;
          else if (ch === ']') bracket--;
          else if (!bracket && /[\s()+\-*/^%=<>&,;{}]/.test(ch)) break;
        }
        text += ch; pos++;
      }
      if (!text || quote || bracket) fail();
      tokens.push({ text, type: 'word' });
    } else {
      const symbol = rest.match(/^(?:>=|<=|<>|!=|[()+\-*/^%=<>&,;{}])/);
      if (!symbol) fail(); tokens.push({ text: symbol[0], type: 'symbol' }); pos += symbol[0].length;
    }
  }
  let index = 0, depth = 0;
  const peek = () => tokens[index]?.text;
  const eat = (text: string) => { if (peek() !== text) fail(); index++; };
  const precedence: Record<string, number> = { '=': 1, '<>': 1, '!=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function expression(min = 0): Node {
    if (++depth > 128) fail('#¡NUM!');
    let left = atom();
    while (peek() === '%') { index++; left = { kind: 'unary', op: '%', value: left }; }
    while (precedence[peek()] !== undefined && precedence[peek()] >= min) {
      const op = tokens[index++].text, p = precedence[op];
      left = { kind: 'binary', op, left, right: expression(p + (op === '^' ? 0 : 1)) };
    }
    depth--; return left;
  }
  function atom(): Node {
    const token = tokens[index++]; if (!token) fail();
    if (token.type === 'number') return { kind: 'literal', value: Number(token.text) };
    if (token.type === 'string' || token.type === 'error') return { kind: 'literal', value: token.text };
    if (token.text === '+' || token.text === '-') return { kind: 'unary', op: token.text, value: expression(6) };
    if (token.text === '(') { const result = expression(); eat(')'); return result; }
    if (token.text === '{') {
      const rows: Node[][] = [[]];
      while (peek() !== '}') {
        rows.at(-1)!.push(expression());
        if (peek() === ';') { index++; rows.push([]); } else if (peek() === ',') index++; else break;
      }
      eat('}'); if (rows.some(row => row.length !== rows[0].length)) fail(); return { kind: 'matrix', rows };
    }
    if (token.type !== 'word') fail();
    if (peek() === '(') {
      index++; const args: Node[] = [];
      while (peek() !== ')') {
        if (peek() === ',' || peek() === ';') args.push({ kind: 'literal', value: '' }); else args.push(expression());
        if (peek() === ',' || peek() === ';') { index++; if (peek() === ')') args.push({ kind: 'literal', value: '' }); } else break;
      }
      eat(')'); return { kind: 'call', name: token.text.replace(/^_xlfn\.(?:_xlws\.)?/i, '').toUpperCase(), args };
    }
    if (/^(TRUE|VERDADERO|FALSE|FALSO)$/i.test(token.text)) return { kind: 'literal', value: /^(TRUE|VERDADERO)$/i.test(token.text) };
    return { kind: 'reference', name: token.text };
  }
  const tree = expression(); if (index !== tokens.length) fail();
  if (trees.size > 2000) trees.clear(); trees.set(source, tree); return tree;
}
export interface FormulaRuntime {
  reference(name: string): Value;
  call(name: string, args: (() => Value)[]): Value;
}
export function evaluateTree(node: Node, runtime: FormulaRuntime): Value {
  switch (node.kind) {
    case 'literal': return node.value;
    case 'reference': return runtime.reference(node.name);
    case 'call': return runtime.call(node.name, node.args.map(arg => () => evaluateTree(arg, runtime)));
    case 'matrix': return CalcArray.from(node.rows.map(row => row.map(v => first(evaluateTree(v, runtime)))));
    case 'unary': return map(evaluateTree(node.value, runtime), value => node.op === '%' ? number(value) / 100 : node.op === '-' ? -number(value) : number(value));
    case 'binary': return binary(evaluateTree(node.left, runtime), evaluateTree(node.right, runtime), (a, b) => {
      checked(a); checked(b);
      if (node.op === '&') return String(a) + String(b);
      if (['=', '<>', '!=', '>', '<', '>=', '<='].includes(node.op)) {
        const cmp = compare(a, b); return node.op === '=' ? cmp === 0 : node.op === '<>' || node.op === '!=' ? cmp !== 0 : node.op === '>' ? cmp > 0 : node.op === '<' ? cmp < 0 : node.op === '>=' ? cmp >= 0 : cmp <= 0;
      }
      const x = number(a), y = number(b);
      if (node.op === '/' && y === 0) fail('#¡DIV/0!');
      const value = node.op === '+' ? x + y : node.op === '-' ? x - y : node.op === '*' ? x * y : node.op === '/' ? x / y : Math.pow(x, y);
      return Number.isFinite(value) ? value : fail('#¡NUM!');
    });
  }
}

export function mayReturnArray(node: Node): boolean {
  switch (node.kind) {
    case 'literal': return false;
    case 'reference': return /[:[\]#]/.test(node.name) || !/^(?:'(?:[^']|'')+'!|[^!]+!)?\$?[A-Z]+\$?\d+$/i.test(node.name);
    case 'matrix': return node.rows.length > 1 || node.rows[0].length > 1;
    case 'binary': return mayReturnArray(node.left) || mayReturnArray(node.right);
    case 'unary': return mayReturnArray(node.value);
    case 'call':
      if (/^(FILTER|FILTRAR|SORT|ORDENAR|UNIQUE|UNICOS|SEQUENCE|SECUENCIA|XLOOKUP|BUSCARX|INDEX|INDICE)$/.test(node.name)) return true;
      return /^(IF|SI|IFERROR|SI.ERROR|IFNA|SI.ND|IFS|SI.CONJUNTO)$/.test(node.name) && node.args.some(mayReturnArray);
  }
}
