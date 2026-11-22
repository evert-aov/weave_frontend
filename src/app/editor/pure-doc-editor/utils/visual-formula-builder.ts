export interface VisualSlot {
  id: string;
  label: string;
  placeholder?: string;
  pieces: VisualPiece[];
}

export type BigOpCommand =
  | '\\sum'
  | '\\prod'
  | '\\int'
  | '\\iint'
  | '\\iiint'
  | '\\oint'
  | '\\lim';

export type MatrixEnv = 'pmatrix' | 'bmatrix' | 'vmatrix' | 'cases';

export type VisualPiece =
  | { id: string; kind: 'text'; value: string }
  | { id: string; kind: 'frac'; num: VisualSlot; den: VisualSlot }
  | { id: string; kind: 'sqrt'; index?: VisualSlot; body: VisualSlot }
  | { id: string; kind: 'script'; base: VisualSlot; sup?: VisualSlot; sub?: VisualSlot }
  | { id: string; kind: 'bigop'; op: BigOpCommand; lower?: VisualSlot; upper?: VisualSlot; body: VisualSlot }
  | { id: string; kind: 'group'; open: string; close: string; body: VisualSlot }
  | { id: string; kind: 'matrix'; env: MatrixEnv; rows: VisualSlot[][] };

export type VisualStructureKind =
  | 'frac'
  | 'sqrt'
  | 'nthroot'
  | 'sup'
  | 'sub'
  | 'subsup'
  | 'sum'
  | 'prod'
  | 'int'
  | 'defint'
  | 'lim'
  | 'paren'
  | 'bracket'
  | 'abs'
  | 'matrix2x2'
  | 'bmatrix2x2'
  | 'vmatrix3x3'
  | 'cases2';

let nextVisualId = 1;
export function genVisualId(prefix = 'vf'): string {
  return `${prefix}-${nextVisualId++}`;
}

export function createSlot(label = 'Expresión', placeholder = '...', initialText = ''): VisualSlot {
  return {
    id: genVisualId('slot'),
    label,
    placeholder,
    pieces: [{ id: genVisualId('txt'), kind: 'text', value: initialText }],
  };
}

/**
 * Bidirectional symbol map so non-technical users see readable Unicode (α, π, ±, ≤, →, ∞)
 * inside graphical inputs while producing canonical LaTeX commands.
 */
const UNICODE_TO_LATEX: readonly [string, string][] = [
  ['\\rightarrow', '→'],
  ['\\Rightarrow', '⇒'],
  ['\\Leftrightarrow', '⇔'],
  ['\\rightleftharpoons', '⇌'],
  ['\\mapsto', '↦'],
  ['\\varepsilon', 'ε'],
  ['\\alpha', 'α'],
  ['\\beta', 'β'],
  ['\\gamma', 'γ'],
  ['\\delta', 'δ'],
  ['\\epsilon', 'ϵ'],
  ['\\theta', 'θ'],
  ['\\lambda', 'λ'],
  ['\\mu', 'μ'],
  ['\\pi', 'π'],
  ['\\rho', 'ρ'],
  ['\\sigma', 'σ'],
  ['\\tau', 'τ'],
  ['\\phi', 'φ'],
  ['\\psi', 'ψ'],
  ['\\omega', 'ω'],
  ['\\Delta', 'Δ'],
  ['\\Sigma', 'Σ'],
  ['\\Omega', 'Ω'],
  ['\\Psi', 'Ψ'],
  ['\\partial', '∂'],
  ['\\nabla', '∇'],
  ['\\infty', '∞'],
  ['\\approx', '≈'],
  ['\\neq', '≠'],
  ['\\leq', '≤'],
  ['\\geq', '≥'],
  ['\\pm', '±'],
  ['\\mp', '∓'],
  ['\\times', '×'],
  ['\\div', '÷'],
  ['\\cdot', '·'],
  ['\\forall', '∀'],
  ['\\exists', '∃'],
  ['\\notin', '∉'],
  ['\\in', '∈'],
  ['\\cup', '∪'],
  ['\\cap', '∩'],
  ['\\subset', '⊂'],
  ['\\mathbb{R}', 'ℝ'],
  ['\\mathbb{N}', 'ℕ'],
  ['\\mathbb{Z}', 'ℤ'],
  ['\\hbar', 'ℏ'],
  ['\\degree', '°'],
];

export function displayTextToLatex(display: string): string {
  let out = display;
  for (const [cmd, ch] of UNICODE_TO_LATEX) {
    if (!out.includes(ch)) continue;
    // Pad command with trailing space only when needed so following letters don't glue onto \alpha
    out = out.split(ch).join(`${cmd} `);
  }
  return out.replace(/\s{2,}/g, ' ');
}

export function latexTextToDisplay(latex: string): string {
  let out = latex;
  for (const [cmd, ch] of UNICODE_TO_LATEX) {
    const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match command boundary so \pi doesn't match inside \partial or \prod
    const pattern = new RegExp(`${escaped}(?![a-zA-Z])\\s?`, 'g');
    out = out.replace(pattern, ch);
  }
  return out.replace(/\\,/g, ' ').replace(/\\quad/g, '  ').trim();
}

export function createStructurePiece(kind: VisualStructureKind): {
  piece: VisualPiece;
  focusSlotId: string;
} {
  switch (kind) {
    case 'frac': {
      const num = createSlot('Numerador', 'a');
      const den = createSlot('Denominador', 'b');
      return { piece: { id: genVisualId('frac'), kind: 'frac', num, den }, focusSlotId: num.id };
    }
    case 'sqrt': {
      const body = createSlot('Radicando', 'x');
      return { piece: { id: genVisualId('sqrt'), kind: 'sqrt', body }, focusSlotId: body.id };
    }
    case 'nthroot': {
      const index = createSlot('Índice', 'n');
      const body = createSlot('Radicando', 'x');
      return { piece: { id: genVisualId('nthroot'), kind: 'sqrt', index, body }, focusSlotId: index.id };
    }
    case 'sup': {
      const base = createSlot('Base', 'x');
      const sup = createSlot('Exponente', '2');
      return { piece: { id: genVisualId('sup'), kind: 'script', base, sup }, focusSlotId: base.id };
    }
    case 'sub': {
      const base = createSlot('Base', 'x');
      const sub = createSlot('Subíndice', 'i');
      return { piece: { id: genVisualId('sub'), kind: 'script', base, sub }, focusSlotId: base.id };
    }
    case 'subsup': {
      const base = createSlot('Base', 'x');
      const sub = createSlot('Subíndice', 'i');
      const sup = createSlot('Exponente', '2');
      return { piece: { id: genVisualId('subsup'), kind: 'script', base, sub, sup }, focusSlotId: base.id };
    }
    case 'sum': {
      const lower = createSlot('Desde', 'i = 1');
      const upper = createSlot('Hasta', 'n');
      const body = createSlot('Término', 'x_i');
      return {
        piece: { id: genVisualId('sum'), kind: 'bigop', op: '\\sum', lower, upper, body },
        focusSlotId: lower.id,
      };
    }
    case 'prod': {
      const lower = createSlot('Desde', 'i = 1');
      const upper = createSlot('Hasta', 'n');
      const body = createSlot('Factor', 'x_i');
      return {
        piece: { id: genVisualId('prod'), kind: 'bigop', op: '\\prod', lower, upper, body },
        focusSlotId: lower.id,
      };
    }
    case 'int': {
      const body = createSlot('Integrando', 'f(x) dx');
      return {
        piece: { id: genVisualId('int'), kind: 'bigop', op: '\\int', body },
        focusSlotId: body.id,
      };
    }
    case 'defint': {
      const lower = createSlot('Límite inferior', 'a');
      const upper = createSlot('Límite superior', 'b');
      const body = createSlot('Integrando', 'f(x) dx');
      return {
        piece: { id: genVisualId('defint'), kind: 'bigop', op: '\\int', lower, upper, body },
        focusSlotId: lower.id,
      };
    }
    case 'lim': {
      const lower = createSlot('Tendencia', 'x → 0');
      const body = createSlot('Expresión', 'f(x)');
      return {
        piece: { id: genVisualId('lim'), kind: 'bigop', op: '\\lim', lower, body },
        focusSlotId: lower.id,
      };
    }
    case 'paren': {
      const body = createSlot('Contenido', 'a + b');
      return { piece: { id: genVisualId('grp'), kind: 'group', open: '(', close: ')', body }, focusSlotId: body.id };
    }
    case 'bracket': {
      const body = createSlot('Contenido', 'a + b');
      return { piece: { id: genVisualId('grp'), kind: 'group', open: '[', close: ']', body }, focusSlotId: body.id };
    }
    case 'abs': {
      const body = createSlot('Valor', 'x');
      return { piece: { id: genVisualId('grp'), kind: 'group', open: '|', close: '|', body }, focusSlotId: body.id };
    }
    case 'matrix2x2': {
      const r1c1 = createSlot('Fila 1, Col 1', 'a');
      const rows = [
        [r1c1, createSlot('Fila 1, Col 2', 'b')],
        [createSlot('Fila 2, Col 1', 'c'), createSlot('Fila 2, Col 2', 'd')],
      ];
      return { piece: { id: genVisualId('mat'), kind: 'matrix', env: 'pmatrix', rows }, focusSlotId: r1c1.id };
    }
    case 'bmatrix2x2': {
      const r1c1 = createSlot('Fila 1, Col 1', 'a₁₁');
      const rows = [
        [r1c1, createSlot('Fila 1, Col 2', 'a₁₂')],
        [createSlot('Fila 2, Col 1', 'a₂₁'), createSlot('Fila 2, Col 2', 'a₂₂')],
      ];
      return { piece: { id: genVisualId('mat'), kind: 'matrix', env: 'bmatrix', rows }, focusSlotId: r1c1.id };
    }
    case 'vmatrix3x3': {
      const r1c1 = createSlot('Fila 1, Col 1', '1');
      const rows = [
        [r1c1, createSlot('Fila 1, Col 2', '0'), createSlot('Fila 1, Col 3', '0')],
        [createSlot('Fila 2, Col 1', '0'), createSlot('Fila 2, Col 2', '1'), createSlot('Fila 2, Col 3', '0')],
        [createSlot('Fila 3, Col 1', '0'), createSlot('Fila 3, Col 2', '0'), createSlot('Fila 3, Col 3', '1')],
      ];
      return { piece: { id: genVisualId('mat'), kind: 'matrix', env: 'vmatrix', rows }, focusSlotId: r1c1.id };
    }
    case 'cases2': {
      const r1c1 = createSlot('Expresión 1', 'x²');
      const rows = [
        [r1c1, createSlot('Condición 1', 'x ≥ 0')],
        [createSlot('Expresión 2', '-x'), createSlot('Condición 2', 'x < 0')],
      ];
      return { piece: { id: genVisualId('cases'), kind: 'matrix', env: 'cases', rows }, focusSlotId: r1c1.id };
    }
  }
}

/** Compiles a VisualSlot tree into a clean LaTeX string. */
export function compileVisualSlot(slot: VisualSlot, forPreview = false): string {
  const compilePieces = (target: VisualSlot): string => {
    const parts: string[] = [];
    for (const p of target.pieces) {
      switch (p.kind) {
        case 'text': {
          const converted = displayTextToLatex(p.value).trim();
          if (converted) parts.push(converted);
          break;
        }
        case 'frac': {
          const num = compilePieces(p.num) || (forPreview ? '\\square' : 'a');
          const den = compilePieces(p.den) || (forPreview ? '\\square' : 'b');
          parts.push(`\\frac{${num}}{${den}}`);
          break;
        }
        case 'sqrt': {
          const body = compilePieces(p.body) || (forPreview ? '\\square' : 'x');
          if (p.index) {
            const idx = compilePieces(p.index) || (forPreview ? '\\square' : 'n');
            parts.push(`\\sqrt[${idx}]{${body}}`);
          } else {
            parts.push(`\\sqrt{${body}}`);
          }
          break;
        }
        case 'script': {
          const baseRaw = compilePieces(p.base) || (forPreview ? '\\square' : 'x');
          const base = baseRaw.length > 1 && !baseRaw.startsWith('(') && !baseRaw.startsWith('{') && !baseRaw.startsWith('\\')
            ? `{${baseRaw}}`
            : baseRaw;
          const sub = p.sub ? compilePieces(p.sub) : '';
          const sup = p.sup ? compilePieces(p.sup) : '';
          let res = base;
          if (p.sub) res += `_{${sub || (forPreview ? '\\square' : 'i')}}`;
          if (p.sup) res += `^{${sup || (forPreview ? '\\square' : '2')}}`;
          parts.push(res);
          break;
        }
        case 'bigop': {
          const lower = p.lower ? compilePieces(p.lower) : '';
          const upper = p.upper ? compilePieces(p.upper) : '';
          const body = compilePieces(p.body) || (forPreview ? '\\square' : '');
          let head: string = p.op;
          if (p.lower) head += `_{${lower || (forPreview ? '\\square' : '')}}`;
          if (p.upper) head += `^{${upper || (forPreview ? '\\square' : '')}}`;
          parts.push(body ? `${head} ${body}` : head);
          break;
        }
        case 'group': {
          const body = compilePieces(p.body) || (forPreview ? '\\square' : '');
          parts.push(`\\left${p.open} ${body} \\right${p.close}`);
          break;
        }
        case 'matrix': {
          const rowsTex = p.rows
            .map((row) =>
              row.map((cell) => compilePieces(cell) || (forPreview ? '\\square' : ' ')).join(' & ')
            )
            .join(' \\\\ ');
          parts.push(`\\begin{${p.env}} ${rowsTex} \\end{${p.env}}`);
          break;
        }
      }
    }
    return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
  };

  return compilePieces(slot);
}

/** Updates a slot immutably anywhere inside the slot tree. */
export function mapVisualSlot(
  slot: VisualSlot,
  targetSlotId: string,
  updater: (target: VisualSlot) => VisualSlot
): VisualSlot {
  if (slot.id === targetSlotId) {
    return updater(slot);
  }
  let changed = false;
  const nextPieces = slot.pieces.map((p) => {
    switch (p.kind) {
      case 'text':
        return p;
      case 'frac': {
        const num = mapVisualSlot(p.num, targetSlotId, updater);
        const den = mapVisualSlot(p.den, targetSlotId, updater);
        if (num !== p.num || den !== p.den) {
          changed = true;
          return { ...p, num, den };
        }
        return p;
      }
      case 'sqrt': {
        const index = p.index ? mapVisualSlot(p.index, targetSlotId, updater) : undefined;
        const body = mapVisualSlot(p.body, targetSlotId, updater);
        if (index !== p.index || body !== p.body) {
          changed = true;
          return { ...p, index, body };
        }
        return p;
      }
      case 'script': {
        const base = mapVisualSlot(p.base, targetSlotId, updater);
        const sub = p.sub ? mapVisualSlot(p.sub, targetSlotId, updater) : undefined;
        const sup = p.sup ? mapVisualSlot(p.sup, targetSlotId, updater) : undefined;
        if (base !== p.base || sub !== p.sub || sup !== p.sup) {
          changed = true;
          return { ...p, base, sub, sup };
        }
        return p;
      }
      case 'bigop': {
        const lower = p.lower ? mapVisualSlot(p.lower, targetSlotId, updater) : undefined;
        const upper = p.upper ? mapVisualSlot(p.upper, targetSlotId, updater) : undefined;
        const body = mapVisualSlot(p.body, targetSlotId, updater);
        if (lower !== p.lower || upper !== p.upper || body !== p.body) {
          changed = true;
          return { ...p, lower, upper, body };
        }
        return p;
      }
      case 'group': {
        const body = mapVisualSlot(p.body, targetSlotId, updater);
        if (body !== p.body) {
          changed = true;
          return { ...p, body };
        }
        return p;
      }
      case 'matrix': {
        let matChanged = false;
        const nextRows = p.rows.map((row) =>
          row.map((cell) => {
            const nextCell = mapVisualSlot(cell, targetSlotId, updater);
            if (nextCell !== cell) matChanged = true;
            return nextCell;
          })
        );
        if (matChanged) {
          changed = true;
          return { ...p, rows: nextRows };
        }
        return p;
      }
    }
  });
  return changed ? { ...slot, pieces: nextPieces } : slot;
}

/** Ensures adjacent editable text slots surround structural pieces for natural cursor flow. */
export function normalizeSlotPieces(pieces: VisualPiece[]): VisualPiece[] {
  const out: VisualPiece[] = [];
  for (const p of pieces) {
    if (p.kind === 'text' && out.length > 0 && out[out.length - 1].kind === 'text') {
      const prev = out[out.length - 1] as Extract<VisualPiece, { kind: 'text' }>;
      out[out.length - 1] = {
        ...prev,
        value: [prev.value, p.value].filter(Boolean).join(' '),
      };
    } else {
      out.push(p);
    }
  }
  if (out.length === 0) {
    out.push({ id: genVisualId('txt'), kind: 'text', value: '' });
  }
  return out;
}

export function insertStructureIntoSlot(
  root: VisualSlot,
  targetSlotId: string,
  kind: VisualStructureKind,
  afterPieceId?: string
): { root: VisualSlot; focusSlotId: string } {
  const { piece, focusSlotId } = createStructurePiece(kind);
  const nextRoot = mapVisualSlot(root, targetSlotId, (slot) => {
    const pieces = [...slot.pieces];
    const insertIdx = afterPieceId
      ? Math.max(0, pieces.findIndex((p) => p.id === afterPieceId) + 1)
      : pieces.length;
    const trailingText: VisualPiece = { id: genVisualId('txt'), kind: 'text', value: '' };
    // Remove sole empty text placeholder when inserting a structural block
    if (pieces.length === 1 && pieces[0].kind === 'text' && !pieces[0].value.trim()) {
      return { ...slot, pieces: [piece, trailingText] };
    }
    pieces.splice(insertIdx, 0, piece, trailingText);
    return { ...slot, pieces: normalizeSlotPieces(pieces) };
  });
  return { root: nextRoot, focusSlotId };
}

export function insertTextTokenIntoSlot(
  root: VisualSlot,
  targetSlotId: string,
  token: string,
  pieceId?: string
): VisualSlot {
  const displayToken = latexTextToDisplay(token) || token;
  return mapVisualSlot(root, targetSlotId, (slot) => {
    const pieces = [...slot.pieces];
    const targetIdx = pieceId
      ? pieces.findIndex((p) => p.id === pieceId && p.kind === 'text')
      : pieces.map((p, idx) => (p.kind === 'text' ? idx : -1)).filter((i) => i >= 0).pop() ?? -1;
    if (targetIdx >= 0) {
      const targetPiece = pieces[targetIdx] as Extract<VisualPiece, { kind: 'text' }>;
      const cur = targetPiece.value;
      const needsSpace = cur.length > 0 && !/[\s(+\-×÷=]$/.test(cur);
      pieces[targetIdx] = {
        ...targetPiece,
        value: `${cur}${needsSpace ? ' ' : ''}${displayToken}`,
      };
      return { ...slot, pieces };
    }
    return {
      ...slot,
      pieces: normalizeSlotPieces([...pieces, { id: genVisualId('txt'), kind: 'text', value: displayToken }]),
    };
  });
}

export function removePieceFromSlotTree(root: VisualSlot, pieceId: string): VisualSlot {
  const removeInSlot = (slot: VisualSlot): VisualSlot => {
    const filtered = slot.pieces.filter((p) => p.id !== pieceId);
    if (filtered.length !== slot.pieces.length) {
      return { ...slot, pieces: normalizeSlotPieces(filtered) };
    }
    let changed = false;
    const nextPieces = slot.pieces.map((p) => {
      switch (p.kind) {
        case 'text':
          return p;
        case 'frac': {
          const num = removeInSlot(p.num);
          const den = removeInSlot(p.den);
          if (num !== p.num || den !== p.den) {
            changed = true;
            return { ...p, num, den };
          }
          return p;
        }
        case 'sqrt': {
          const index = p.index ? removeInSlot(p.index) : undefined;
          const body = removeInSlot(p.body);
          if (index !== p.index || body !== p.body) {
            changed = true;
            return { ...p, index, body };
          }
          return p;
        }
        case 'script': {
          const base = removeInSlot(p.base);
          const sub = p.sub ? removeInSlot(p.sub) : undefined;
          const sup = p.sup ? removeInSlot(p.sup) : undefined;
          if (base !== p.base || sub !== p.sub || sup !== p.sup) {
            changed = true;
            return { ...p, base, sub, sup };
          }
          return p;
        }
        case 'bigop': {
          const lower = p.lower ? removeInSlot(p.lower) : undefined;
          const upper = p.upper ? removeInSlot(p.upper) : undefined;
          const body = removeInSlot(p.body);
          if (lower !== p.lower || upper !== p.upper || body !== p.body) {
            changed = true;
            return { ...p, lower, upper, body };
          }
          return p;
        }
        case 'group': {
          const body = removeInSlot(p.body);
          if (body !== p.body) {
            changed = true;
            return { ...p, body };
          }
          return p;
        }
        case 'matrix': {
          let matChanged = false;
          const nextRows = p.rows.map((row) =>
            row.map((cell) => {
              const nc = removeInSlot(cell);
              if (nc !== cell) matChanged = true;
              return nc;
            })
          );
          if (matChanged) {
            changed = true;
            return { ...p, rows: nextRows };
          }
          return p;
        }
      }
    });
    return changed ? { ...slot, pieces: nextPieces } : slot;
  };
  return removeInSlot(root);
}

/** Parses common LaTeX expressions into editable graphical slots; preserves unknown fragments verbatim. */
export function parseLatexToVisualSlot(rawLatex: string, label = 'Fórmula'): VisualSlot {
  const input = (rawLatex || '').trim();
  if (!input) {
    return createSlot(label, 'Escribe aquí o elige un bloque...', '');
  }

  let pos = 0;

  const skipWs = (): void => {
    while (pos < input.length && /\s/.test(input[pos])) pos++;
  };

  const readBracedGroup = (): string => {
    skipWs();
    if (pos >= input.length) return '';
    if (input[pos] !== '{') {
      if (input[pos] === '\\') {
        const start = pos++;
        while (pos < input.length && /[a-zA-Z]/.test(input[pos])) pos++;
        return input.slice(start, pos);
      }
      return input[pos++];
    }
    pos++; // skip '{'
    let depth = 1;
    const start = pos;
    while (pos < input.length && depth > 0) {
      if (input[pos] === '\\' && pos + 1 < input.length) {
        pos += 2;
        continue;
      }
      if (input[pos] === '{') depth++;
      else if (input[pos] === '}') depth--;
      pos++;
    }
    return input.slice(start, Math.max(start, pos - 1)).trim();
  };

  const readBracketGroup = (): string | null => {
    skipWs();
    if (input[pos] !== '[') return null;
    pos++; // skip '['
    let depth = 1;
    const start = pos;
    while (pos < input.length && depth > 0) {
      if (input[pos] === '[') depth++;
      else if (input[pos] === ']') depth--;
      pos++;
    }
    return input.slice(start, Math.max(start, pos - 1)).trim();
  };

  const pieces: VisualPiece[] = [];
  let textBuf = '';
  const flushText = (): void => {
    const cleaned = latexTextToDisplay(textBuf);
    if (cleaned) {
      pieces.push({ id: genVisualId('txt'), kind: 'text', value: cleaned });
    }
    textBuf = '';
  };

  while (pos < input.length) {
    const ch = input[pos];

    // Commands
    if (ch === '\\') {
      if (input.startsWith('\\frac', pos) || input.startsWith('\\dfrac', pos) || input.startsWith('\\tfrac', pos)) {
        flushText();
        pos += input.startsWith('\\frac', pos) ? 5 : 6;
        const numTex = readBracedGroup();
        const denTex = readBracedGroup();
        pieces.push({
          id: genVisualId('frac'),
          kind: 'frac',
          num: parseLatexToVisualSlot(numTex, 'Numerador'),
          den: parseLatexToVisualSlot(denTex, 'Denominador'),
        });
        continue;
      }

      if (input.startsWith('\\sqrt', pos) && !/[a-zA-Z]/.test(input[pos + 5] || '')) {
        flushText();
        pos += 5;
        const idxTex = readBracketGroup();
        const bodyTex = readBracedGroup();
        pieces.push({
          id: genVisualId('sqrt'),
          kind: 'sqrt',
          ...(idxTex !== null ? { index: parseLatexToVisualSlot(idxTex, 'Índice') } : {}),
          body: parseLatexToVisualSlot(bodyTex, 'Radicando'),
        });
        continue;
      }

      const bigOps: BigOpCommand[] = ['\\iiint', '\\iint', '\\oint', '\\int', '\\sum', '\\prod', '\\lim'];
      const matchedBigOp = bigOps.find(
        (cmd) => input.startsWith(cmd, pos) && !/[a-zA-Z]/.test(input[pos + cmd.length] || '')
      );
      if (matchedBigOp) {
        flushText();
        pos += matchedBigOp.length;
        skipWs();
        if (input.startsWith('\\limits', pos)) {
          pos += 7;
        }
        let lower: VisualSlot | undefined;
        let upper: VisualSlot | undefined;
        for (let k = 0; k < 2; k++) {
          skipWs();
          if (input[pos] === '_') {
            pos++;
            lower = parseLatexToVisualSlot(readBracedGroup(), matchedBigOp === '\\lim' ? 'Tendencia' : 'Límite inferior');
          } else if (input[pos] === '^') {
            pos++;
            upper = parseLatexToVisualSlot(readBracedGroup(), 'Límite superior');
          }
        }
        skipWs();
        const rest = input.slice(pos).trim();
        // Capture remaining expression on this level as integrand/body
        pos = input.length;
        pieces.push({
          id: genVisualId('bigop'),
          kind: 'bigop',
          op: matchedBigOp,
          ...(lower ? { lower } : {}),
          ...(upper ? { upper } : {}),
          body: parseLatexToVisualSlot(rest, 'Expresión'),
        });
        continue;
      }

      if (input.startsWith('\\begin{', pos)) {
        const closeBrace = input.indexOf('}', pos + 7);
        const env = closeBrace > -1 ? input.slice(pos + 7, closeBrace).trim() : '';
        const endMarker = `\\end{${env}}`;
        const endIdx = input.indexOf(endMarker, closeBrace + 1);
        if (
          closeBrace > -1 &&
          endIdx > -1 &&
          (env === 'pmatrix' || env === 'bmatrix' || env === 'vmatrix' || env === 'cases')
        ) {
          flushText();
          const inner = input.slice(closeBrace + 1, endIdx).trim();
          pos = endIdx + endMarker.length;
          const rows = inner
            .split('\\\\')
            .map((r) =>
              r
                .split('&')
                .map((cell, ci) => parseLatexToVisualSlot(cell.trim(), `Celda ${ci + 1}`))
            );
          pieces.push({ id: genVisualId('mat'), kind: 'matrix', env, rows });
          continue;
        }
      }

      if (input.startsWith('\\left', pos)) {
        const afterLeft = pos + 5;
        let openDelim = input[afterLeft];
        let step = 1;
        if (openDelim === '\\' && input[afterLeft + 1] === '{') {
          openDelim = '\\{';
          step = 2;
        }
        const closeMap: Record<string, string> = { '(': ')', '[': ']', '\\{': '\\}', '|': '|' };
        const closeDelim = closeMap[openDelim];
        if (closeDelim) {
          let searchPos = afterLeft + step;
          let depth = 1;
          while (searchPos < input.length && depth > 0) {
            if (input.startsWith('\\left', searchPos)) {
              depth++;
              searchPos += 5;
              continue;
            }
            if (input.startsWith('\\right', searchPos)) {
              depth--;
              if (depth === 0) break;
              searchPos += 6;
              continue;
            }
            searchPos++;
          }
          if (depth === 0) {
            const inner = input.slice(afterLeft + step, searchPos).trim();
            const rightDelimLen = closeDelim.length;
            pos = searchPos + 6 + rightDelimLen;
            flushText();
            pieces.push({
              id: genVisualId('grp'),
              kind: 'group',
              open: openDelim,
              close: closeDelim,
              body: parseLatexToVisualSlot(inner, 'Contenido'),
            });
            continue;
          }
        }
      }

      // Generic backslash command -> buffer it
      const start = pos++;
      while (pos < input.length && /[a-zA-Z]/.test(input[pos])) pos++;
      if (pos === start + 1 && pos < input.length) pos++;
      textBuf += input.slice(start, pos);
      continue;
    }

    // Subscripts / Superscripts attached to trailing text/group
    if ((ch === '^' || ch === '_') && (textBuf.trim().length > 0 || pieces.length > 0)) {
      let baseSlot: VisualSlot;
      if (textBuf.trim().length > 0) {
        const trimmed = textBuf.trimEnd();
        const match = trimmed.match(/^(.*?)([a-zA-Z0-9α-ωΑ-Ω\]\)]+)$/);
        const prefix = match ? match[1] : '';
        const baseToken = match ? match[2] : trimmed;
        textBuf = prefix;
        flushText();
        baseSlot = createSlot('Base', 'x', latexTextToDisplay(baseToken));
      } else {
        const prevPiece = pieces.pop()!;
        baseSlot = { id: genVisualId('slot'), label: 'Base', placeholder: 'x', pieces: [prevPiece] };
      }

      let sub: VisualSlot | undefined;
      let sup: VisualSlot | undefined;
      for (let k = 0; k < 2; k++) {
        skipWs();
        if (input[pos] === '_') {
          pos++;
          sub = parseLatexToVisualSlot(readBracedGroup(), 'Subíndice');
        } else if (input[pos] === '^') {
          pos++;
          sup = parseLatexToVisualSlot(readBracedGroup(), 'Exponente');
        }
      }
      pieces.push({
        id: genVisualId('script'),
        kind: 'script',
        base: baseSlot,
        ...(sub ? { sub } : {}),
        ...(sup ? { sup } : {}),
      });
      continue;
    }

    textBuf += ch;
    pos++;
  }

  flushText();
  return {
    id: genVisualId('slot'),
    label,
    placeholder: '...',
    pieces: normalizeSlotPieces(pieces),
  };
}
