import { Injectable } from '@angular/core';

/**
 * High-precision LaTeX-to-HTML Math Typesetting Engine for Word Studio Pro.
 * Renders fractions, partial derivatives, integrals with stacked limits, radicals,
 * matrices, accents (\dot, \vec, \hat, \bar), Greek letters, and chemical/physical notation
 * using inline-styled HTML that works both in the live editor and when exported to Microsoft Word.
 */

const GREEK_AND_SYMBOLS: Record<string, string> = {
  // Lowercase Greek
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',

  // Uppercase Greek
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',

  // Calculus & Physics Operators
  partial: '∂',
  nabla: '∇',
  infty: '∞',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  wp: '℘',
  aleph: 'ℵ',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  emptyset: '∅',
  varnothing: '∅',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  pm: '±',
  mp: '∓',
  times: '×',
  div: '÷',
  cdot: '·',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '∙',
  oplus: '⊕',
  ominus: '⊖',
  otimes: '⊗',
  odot: '⊙',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  cong: '≅',
  sim: '∼',
  simeq: '≃',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  perp: '⊥',
  parallel: '∥',
  angle: '∠',
  triangle: '△',
  therefore: '∴',
  because: '∵',

  // Arrows & Chemistry
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⟺',
  mapsto: '↦',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: '↕',
  rightleftharpoons: '⇌',
  leftharpoonsup: '↼',
  rightharpoonup: '⇀',
  longrightarrow: '⟶',
  longleftarrow: '⟵',
  Longrightarrow: '⟹',
  Longleftrightarrow: '⟺',

  // Dots & Misc
  cdots: '⋯',
  ldots: '…',
  vdots: '⋮',
  ddots: '⋱',
  degree: '°',
  prime: '′',
};

const BIG_OPERATORS: Record<string, string> = {
  int: '∫',
  iint: '∬',
  iiint: '∭',
  iiiint: '⨌',
  oint: '∮',
  oiint: '∯',
  oiiint: '∰',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  bigcup: '⋃',
  bigcap: '⋂',
  bigoplus: '⨁',
  bigotimes: '⨂',
  bigsqcup: '⨆',
  bigvee: '⋁',
  bigwedge: '⋀',
};

const ROMAN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'ln',
  'log',
  'exp',
  'lim',
  'sup',
  'inf',
  'max',
  'min',
  'det',
  'dim',
  'ker',
  'deg',
  'gcd',
  'Pr',
  'arg',
  'mod',
]);

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extracts a balanced `{...}` group starting at `startIndex` (where `src[startIndex] === '{'`).
 */
function readBraceGroup(src: string, startIndex: number): { content: string; nextIndex: number } {
  if (src[startIndex] !== '{') {
    return { content: '', nextIndex: startIndex };
  }
  let depth = 0;
  let i = startIndex;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return {
          content: src.slice(startIndex + 1, i),
          nextIndex: i + 1,
        };
      }
    }
    i++;
  }
  return {
    content: src.slice(startIndex + 1),
    nextIndex: src.length,
  };
}

/**
 * Extracts a single LaTeX argument (either `{...}` or a single command `\cmd` or a single character)
 * skipping leading whitespace.
 */
function readNextArgument(src: string, startIndex: number): { content: string; nextIndex: number } {
  let i = startIndex;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return { content: '', nextIndex: i };

  if (src[i] === '{') {
    return readBraceGroup(src, i);
  }
  if (src[i] === '\\') {
    let j = i + 1;
    while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
    if (j === i + 1 && j < src.length) j++; // single non-alpha command like \,
    return { content: src.slice(i, j), nextIndex: j };
  }
  return { content: src[i], nextIndex: i + 1 };
}

/**
 * Parses and renders a single line/expression of LaTeX into publication-grade HTML.
 */
function parseLatexExpression(src: string): string {
  let out = '';
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      out += ' ';
      i++;
      continue;
    }

    // Braced group {...}
    if (ch === '{') {
      const group = readBraceGroup(src, i);
      out += parseLatexExpression(group.content);
      i = group.nextIndex;
      continue;
    }

    // Superscript ^ or Subscript _ (when not attached to a big operator)
    if (ch === '^' || ch === '_') {
      let supHtml = '';
      let subHtml = '';

      while (i < src.length && (src[i] === '^' || src[i] === '_')) {
        const kind = src[i];
        i++;
        const arg = readNextArgument(src, i);
        i = arg.nextIndex;
        if (kind === '^') supHtml = parseLatexExpression(arg.content);
        else subHtml = parseLatexExpression(arg.content);
        while (i < src.length && /\s/.test(src[i])) i++;
      }

      if (supHtml && subHtml) {
        out += `<span style="display:inline-flex; flex-direction:column; vertical-align:middle; font-size:0.72em; line-height:1.05; margin-left:1px; text-align:left;">
          <span style="margin-bottom:1px;">${supHtml}</span>
          <span>${subHtml}</span>
        </span>`;
      } else if (supHtml) {
        out += `<sup style="font-size:0.74em; line-height:0; vertical-align:super;">${supHtml}</sup>`;
      } else if (subHtml) {
        out += `<sub style="font-size:0.74em; line-height:0; vertical-align:sub;">${subHtml}</sub>`;
      }
      continue;
    }

    // LaTeX Command starting with \
    if (ch === '\\') {
      i++;
      if (i >= src.length) break;

      // Spacing & escaped characters: \, \; \: \! \{ \} \%
      const nextCh = src[i];
      if (nextCh === ',' || nextCh === ':' || nextCh === ';') {
        out += '<span style="display:inline-block; width:0.28em;"></span>';
        i++;
        continue;
      }
      if (nextCh === '!') {
        i++;
        continue;
      }
      if (nextCh === ' ') {
        out += '&nbsp;';
        i++;
        continue;
      }
      if (nextCh === '{' || nextCh === '}' || nextCh === '%' || nextCh === '$') {
        out += escapeHtmlText(nextCh);
        i++;
        continue;
      }

      // Read alphabetical command name
      let cmdStart = i;
      while (i < src.length && /[A-Za-z]/.test(src[i])) i++;
      const cmd = src.slice(cmdStart, i);

      if (!cmd) {
        out += escapeHtmlText(src[i] || '');
        i++;
        continue;
      }

      // \left and \right sizing delimiters
      if (cmd === 'left' || cmd === 'right') {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (i < src.length) {
          if (src[i] === '.') {
            i++; // invisible delimiter \left. or \right.
          } else if (src[i] === '\\' && (src[i + 1] === '{' || src[i + 1] === '}')) {
            out += `<span style="font-size:1.22em; vertical-align:middle; font-style:normal;">${src[i + 1]}</span>`;
            i += 2;
          } else {
            out += `<span style="font-size:1.22em; vertical-align:middle; font-style:normal;">${escapeHtmlText(src[i])}</span>`;
            i++;
          }
        }
        continue;
      }

      // \frac{num}{den} or \dfrac{num}{den} or \tfrac{num}{den}
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const numArg = readNextArgument(src, i);
        const denArg = readNextArgument(src, numArg.nextIndex);
        i = denArg.nextIndex;
        const numHtml = parseLatexExpression(numArg.content);
        const denHtml = parseLatexExpression(denArg.content);
        out += `<span style="display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle; margin:0 3px; font-size:0.94em; line-height:1.1;">
          <span style="border-bottom:1.3px solid currentColor; padding:0 4px 2px 4px; text-align:center; width:100%;">${numHtml}</span>
          <span style="padding:2px 4px 0 4px; text-align:center; width:100%;">${denHtml}</span>
        </span>`;
        continue;
      }

      // \binom{n}{k}
      if (cmd === 'binom') {
        const topArg = readNextArgument(src, i);
        const botArg = readNextArgument(src, topArg.nextIndex);
        i = botArg.nextIndex;
        out += `<span style="display:inline-flex; align-items:center; vertical-align:middle; margin:0 2px;">
          <span style="font-size:1.45em; font-style:normal; line-height:1;">(</span>
          <span style="display:inline-flex; flex-direction:column; align-items:center; font-size:0.88em; padding:0 2px;">
            <span>${parseLatexExpression(topArg.content)}</span>
            <span>${parseLatexExpression(botArg.content)}</span>
          </span>
          <span style="font-size:1.45em; font-style:normal; line-height:1;">)</span>
        </span>`;
        continue;
      }

      // \sqrt[n]{x} or \sqrt{x}
      if (cmd === 'sqrt') {
        while (i < src.length && /\s/.test(src[i])) i++;
        let rootIndexHtml = '';
        if (src[i] === '[') {
          const closeBracket = src.indexOf(']', i + 1);
          if (closeBracket !== -1) {
            rootIndexHtml = parseLatexExpression(src.slice(i + 1, closeBracket));
            i = closeBracket + 1;
          }
        }
        const radArg = readNextArgument(src, i);
        i = radArg.nextIndex;
        const innerHtml = parseLatexExpression(radArg.content);
        out += `<span style="display:inline-flex; align-items:baseline; vertical-align:middle; margin:0 2px;">
          ${rootIndexHtml ? `<sup style="font-size:0.65em; margin-right:-3px; vertical-align:0.6em;">${rootIndexHtml}</sup>` : ''}
          <span style="font-size:1.2em; font-style:normal; line-height:1;">√</span>
          <span style="border-top:1.2px solid currentColor; padding:1px 3px 0 2px;">${innerHtml}</span>
        </span>`;
        continue;
      }

      // Accents: \dot{q}, \ddot{q}, \vec{v}, \hat{x}, \bar{x}, \tilde{x}, \overline{AB}
      if (
        cmd === 'dot' ||
        cmd === 'ddot' ||
        cmd === 'vec' ||
        cmd === 'hat' ||
        cmd === 'bar' ||
        cmd === 'tilde' ||
        cmd === 'overline'
      ) {
        const arg = readNextArgument(src, i);
        i = arg.nextIndex;
        const baseHtml = parseLatexExpression(arg.content);

        if (cmd === 'overline' || cmd === 'bar') {
          out += `<span style="border-top:1.2px solid currentColor; padding-top:1px; display:inline-block; line-height:1.05;">${baseHtml}</span>`;
        } else {
          const markMap: Record<string, string> = {
            dot: '˙',
            ddot: '¨',
            vec: '→',
            hat: '^',
            tilde: '~',
          };
          const accentChar = markMap[cmd] || '˙';
          out += `<span style="display:inline-flex; flex-direction:column; align-items:center; vertical-align:baseline; line-height:1; position:relative;">
            <span style="font-size:0.7em; line-height:0.45; margin-bottom:1px; font-style:normal;">${accentChar}</span>
            <span>${baseHtml}</span>
          </span>`;
        }
        continue;
      }

      // Text / Font commands: \text{...}, \mathrm{...}, \mathbf{...}, \mathbb{...}, \mathcal{...}
      if (
        cmd === 'text' ||
        cmd === 'mathrm' ||
        cmd === 'mathbf' ||
        cmd === 'mathit' ||
        cmd === 'mathbb' ||
        cmd === 'mathcal'
      ) {
        const arg = readNextArgument(src, i);
        i = arg.nextIndex;
        const inner = parseLatexExpression(arg.content);
        if (cmd === 'mathbf') {
          out += `<strong style="font-style:normal; font-weight:700;">${inner}</strong>`;
        } else if (cmd === 'mathbb') {
          out += `<span style="font-family: 'Times New Roman', serif; font-weight:700; font-style:normal; letter-spacing:0.03em;">${inner}</span>`;
        } else {
          out += `<span style="font-style:normal;">${inner}</span>`;
        }
        continue;
      }

      // Chemical / Labeled Arrows: \xrightarrow[sub]{sup} or \xleftarrow{sup}
      if (cmd === 'xrightarrow' || cmd === 'xleftarrow') {
        while (i < src.length && /\s/.test(src[i])) i++;
        let belowHtml = '';
        if (src[i] === '[') {
          const closeB = src.indexOf(']', i + 1);
          if (closeB !== -1) {
            belowHtml = parseLatexExpression(src.slice(i + 1, closeB));
            i = closeB + 1;
          }
        }
        const aboveArg = readNextArgument(src, i);
        i = aboveArg.nextIndex;
        const aboveHtml = parseLatexExpression(aboveArg.content);
        const arrowSym = cmd === 'xrightarrow' ? '⟶' : '⟵';
        out += `<span style="display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle; margin:0 4px; line-height:1;">
          <span style="font-size:0.7em; margin-bottom:-2px;">${aboveHtml}</span>
          <span style="font-size:1.2em; font-style:normal;">${arrowSym}</span>
          ${belowHtml ? `<span style="font-size:0.7em; margin-top:-2px;">${belowHtml}</span>` : ''}
        </span>`;
        continue;
      }

      // Environments: \begin{pmatrix | bmatrix | vmatrix | Bmatrix | matrix | cases | aligned}
      if (cmd === 'begin') {
        const envArg = readNextArgument(src, i);
        i = envArg.nextIndex;
        const envName = envArg.content.trim();
        const endToken = `\\end{${envName}}`;
        const endIdx = src.indexOf(endToken, i);
        if (endIdx !== -1) {
          const bodyContent = src.slice(i, endIdx);
          i = endIdx + endToken.length;

          const rows = bodyContent
            .split(/\\\\/)
            .map((r) => r.trim())
            .filter(Boolean);

          const tableRowsHtml = rows
            .map((r) => {
              const cells = r.split('&').map((c) => parseLatexExpression(c.trim()));
              return `<tr>${cells
                .map(
                  (cHtml) =>
                    `<td style="border:none !important; padding:2px 6px !important; text-align:center; vertical-align:middle;">${cHtml}</td>`
                )
                .join('')}</tr>`;
            })
            .join('');

          let leftDelim = '';
          let rightDelim = '';
          if (envName === 'pmatrix') {
            leftDelim = '(';
            rightDelim = ')';
          } else if (envName === 'bmatrix') {
            leftDelim = '[';
            rightDelim = ']';
          } else if (envName === 'Bmatrix') {
            leftDelim = '{';
            rightDelim = '}';
          } else if (envName === 'vmatrix') {
            leftDelim = '|';
            rightDelim = '|';
          } else if (envName === 'cases') {
            leftDelim = '{';
            rightDelim = '';
          }

          out += `<span style="display:inline-flex; align-items:center; vertical-align:middle; margin:0 4px;">
            ${leftDelim ? `<span style="font-size:${rows.length > 2 ? '2.2em' : '1.65em'}; font-style:normal; font-weight:300; line-height:1;">${leftDelim}</span>` : ''}
            <table style="display:inline-table; width:auto !important; border:none !important; margin:0 2px !important; border-collapse:collapse;">
              <tbody>${tableRowsHtml}</tbody>
            </table>
            ${rightDelim ? `<span style="font-size:${rows.length > 2 ? '2.2em' : '1.65em'}; font-style:normal; font-weight:300; line-height:1;">${rightDelim}</span>` : ''}
          </span>`;
          continue;
        }
      }

      // Big Operators (\int, \iint, \iiint, \oint, \sum, \prod, \lim) with optional \limits, _sub, ^sup
      if (BIG_OPERATORS[cmd] || cmd === 'lim') {
        const isLim = cmd === 'lim';
        const opSymbol = isLim ? 'lim' : BIG_OPERATORS[cmd];
        let forceStackedLimits = isLim || cmd === 'sum' || cmd === 'prod';

        while (i < src.length && /\s/.test(src[i])) i++;
        if (src.slice(i, i + 7) === '\\limits') {
          forceStackedLimits = true;
          i += 7;
        } else if (src.slice(i, i + 9) === '\\nolimits') {
          forceStackedLimits = false;
          i += 9;
        }

        let subHtml = '';
        let supHtml = '';
        while (i < src.length) {
          while (i < src.length && /\s/.test(src[i])) i++;
          if (src[i] === '_' || src[i] === '^') {
            const kind = src[i];
            i++;
            const arg = readNextArgument(src, i);
            i = arg.nextIndex;
            if (kind === '_') subHtml = parseLatexExpression(arg.content);
            else supHtml = parseLatexExpression(arg.content);
          } else {
            break;
          }
        }

        const opSpan = isLim
          ? `<span style="font-style:normal; font-size:1em;">lim</span>`
          : `<span style="font-style:normal; font-size:1.55em; line-height:1; font-family:'Times New Roman', serif;">${opSymbol}</span>`;

        if (forceStackedLimits && (subHtml || supHtml)) {
          out += `<span style="display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle; margin:0 3px; line-height:1.05;">
            ${supHtml ? `<span style="font-size:0.68em; margin-bottom:1px;">${supHtml}</span>` : ''}
            ${opSpan}
            ${subHtml ? `<span style="font-size:0.68em; margin-top:1px;">${subHtml}</span>` : ''}
          </span>`;
        } else if (subHtml || supHtml) {
          out += `<span style="display:inline-flex; align-items:center; vertical-align:middle; margin:0 2px;">
            ${opSpan}
            <span style="display:inline-flex; flex-direction:column; justify-content:space-between; font-size:0.68em; line-height:1.05; margin-left:1px; height:1.9em;">
              <span>${supHtml || '&nbsp;'}</span>
              <span>${subHtml || '&nbsp;'}</span>
            </span>
          </span>`;
        } else {
          out += `<span style="margin:0 2px; vertical-align:middle;">${opSpan}</span>`;
        }
        continue;
      }

      // Standard Roman functions: \sin, \cos, \ln, \log, etc.
      if (ROMAN_FUNCTIONS.has(cmd)) {
        out += `<span style="font-style:normal; margin-right:2px;">${cmd}</span>`;
        continue;
      }

      // Greek letters & math symbols
      if (GREEK_AND_SYMBOLS[cmd]) {
        const sym = GREEK_AND_SYMBOLS[cmd];
        const isItalicGreek = /^[α-ωϑϕϖϱςϵ]$/.test(sym);
        out += `<span style="font-style:${isItalicGreek ? 'italic' : 'normal'}; margin:0 1px;">${sym}</span>`;
        continue;
      }

      // Fallback for unknown command
      out += `<span style="font-style:normal;">${escapeHtmlText(cmd)}</span>`;
      continue;
    }

    // Operators +, -, =, <, > get slight horizontal breathing room
    if (ch === '+' || ch === '-' || ch === '=') {
      out += `<span style="font-style:normal; margin:0 3px;">${ch === '-' ? '−' : ch}</span>`;
      i++;
      continue;
    }

    // Numbers & parentheses/brackets render upright (normal)
    if (/[0-9()[\]|.,:;!/]/.test(ch)) {
      out += `<span style="font-style:normal;">${escapeHtmlText(ch)}</span>`;
      i++;
      continue;
    }

    // Latin variables render in mathematical italic serif
    out += `<span style="font-style:italic;">${escapeHtmlText(ch)}</span>`;
    i++;
  }

  return out;
}

/**
 * Renders a single or multi-line LaTeX string (separated by `\\` or newlines) into HTML.
 */
@Injectable({ providedIn: 'root' })
export class LatexRendererService {
  renderLatexToHtml(latexCode: string): string {
  const cleaned = (latexCode || '')
    .trim()
    .replace(/^\$\$|\$\$$/g, '')
    .replace(/^\$|\$$/g, '');

  if (!cleaned) {
    return '<span style="color:#94a3b8; font-style:italic; font-family:Inter, sans-serif; font-size:10pt;">Escribe o selecciona una fórmula LaTeX...</span>';
  }

  // Split top-level lines separated by \\ (outside \begin...\end environments)
  const lines: string[] = [];
  let current = '';
  let envDepth = 0;
  let i = 0;

  while (i < cleaned.length) {
    if (cleaned.slice(i, i + 6) === '\\begin') {
      envDepth++;
    } else if (cleaned.slice(i, i + 4) === '\\end') {
      envDepth = Math.max(0, envDepth - 1);
    }

    if (envDepth === 0 && cleaned[i] === '\\' && cleaned[i + 1] === '\\') {
      lines.push(current.trim());
      current = '';
      i += 2;
      continue;
    }
    current += cleaned[i];
    i++;
  }
  if (current.trim()) {
    lines.push(current.trim());
  }

  const renderedLines = lines.map(
    (line) =>
      `<div style="margin: 3px 0; display:flex; align-items:center; justify-content:center; flex-wrap:wrap;">${parseLatexExpression(
        line
      )}</div>`
  );

  return `<div style="font-family: 'Cambria Math', 'Latin Modern Math', 'Times New Roman', Times, serif; font-size: 13.5pt; color: #0f172a; line-height: 1.4; text-align: center;">${renderedLines.join(
    ''
  )}</div>`;
}

/**
 * Wraps the rendered LaTeX HTML in a document-ready block element that stores the source
 * LaTeX in `data-latex` so clicking the formula in the page re-opens it in the LaTeX editor.
 */
  buildDocumentFormulaBlockHtml(latexCode: string): string {
    const encodedLatex = encodeURIComponent(latexCode.trim());
    const innerMathHtml = this.renderLatexToHtml(latexCode);
    return `<div class="word-latex-formula" contenteditable="false" data-latex="${encodedLatex}" title="Haz clic para editar esta fórmula LaTeX">${innerMathHtml}</div><p><br/></p>`;
  }
}
