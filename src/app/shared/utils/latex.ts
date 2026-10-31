/** Display size shared by the LaTeX editor and visual export strategies. */
export const DEFAULT_LATEX_FONT_SIZE_PX = 11.5;
export const MIN_LATEX_FONT_SIZE_PX = 8;
export const MAX_LATEX_FONT_SIZE_PX = 96;
export type LatexAlignment = 'left' | 'center' | 'right';
export function normalizeLatexAlignment(value: unknown): LatexAlignment {
  return value === 'left' || value === 'right' ? value : 'center';
}

/** Full TeX documents and compiled diagram environments must be compiled, not passed to the math renderer. */
export function isLatexDocument(source: string): boolean {
  const active = source.replace(/\\.|%[^\n]*/g, match => match.startsWith('%') ? '' : match);
  return /(?:^\s*\\(?:documentclass|usepackage|RequirePackage)\b|\\begin\{(?:document|circuitikz|tikzpicture)\})/m.test(active);
}

export function normalizeLatexFontSize(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return DEFAULT_LATEX_FONT_SIZE_PX;
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_LATEX_FONT_SIZE_PX;
  return Math.round(Math.min(MAX_LATEX_FONT_SIZE_PX,Math.max(MIN_LATEX_FONT_SIZE_PX,size)) * 2) / 2;
}

/**
 * Adapta fórmulas KaTeX que contienen saltos de línea (\n) envolviéndolas
 * en el entorno \begin{gathered}...\end{gathered} y añadiendo \\ a cada línea,
 * permitiendo que KaTeX muestre ecuaciones apiladas verticalmente en lugar de una sola línea.
 */
export function formatMultiLineLatex(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/\\begin\{[a-zA-Z*]+\}/.test(trimmed) || /\\(?:newcommand|renewcommand|def|gdef)\b/.test(trimmed)) {
    return trimmed;
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1) {
    const joined = lines
      .map((l, i) => {
        if (i === lines.length - 1) return l;
        return l.endsWith('\\\\') ? l : `${l} \\\\`;
      })
      .join('\n');
    return `\\begin{gathered}\n${joined}\n\\end{gathered}`;
  }
  return trimmed;
}


/** Independent visual rows; nested environments, braces and macro definitions stay intact. */
export function splitLatexRows(source: string): string[] {
  if (!source.trim()) return [];
  if (/\\(?:newcommand|renewcommand|def|gdef)\b/.test(source)) return [source.trim()];
  const rows: string[] = [];
  let buffer = '', braces = 0, environments = 0;
  const flush = () => { if (buffer.trim()) rows.push(buffer.trim()); buffer = ''; };
  for (let i = 0; i < source.length; i++) {
    const rest = source.slice(i);
    const environment = /^\\(begin|end)\{[^}]+\}/.exec(rest);
    if (environment) {
      environments = Math.max(0, environments + (environment[1] === 'begin' ? 1 : -1));
      buffer += environment[0]; i += environment[0].length - 1; continue;
    }
    if (source[i] === '%' && (i === 0 || source[i - 1] !== '\\')) {
      const end = source.indexOf('\n', i);
      // Comments are removed but retain the newline as a row boundary.
      i = end === -1 ? source.length : end - 1; continue;
    }
    if (source[i] === '\\') {
      if (source[i + 1] === '\\' && braces === 0 && environments === 0) {
        flush(); i++;
        const spacing = /^\[[^\]]*\]/.exec(source.slice(i + 1));
        if (spacing) i += spacing[0].length;
        continue;
      }
      buffer += source[i];
      if (source[i + 1]) buffer += source[++i];
      continue;
    }
    if (source[i] === '{') braces++;
    if (source[i] === '}') braces = Math.max(0, braces - 1);
    if (source[i] === '\n' && braces === 0 && environments === 0) flush();
    else buffer += source[i];
  }
  flush(); return rows;
}

/** Preserve alignment of unchanged prefix/suffix when rows are inserted or deleted. */
export function reconcileLatexRowAlignments(before: string[], after: string[], values: unknown[]): (LatexAlignment | null)[] {
  const valid = (value: unknown): LatexAlignment | null =>
    value === 'left' || value === 'center' || value === 'right' ? value : null;
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(before.length, after.length) && before[prefix] === after[prefix]) prefix++;
  while (suffix < Math.min(before.length, after.length) - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  return after.map((_, index) => {
    if (index < prefix) return valid(values[index]);
    if (index >= after.length - suffix) return valid(values[before.length - after.length + index]);
    return index < before.length - suffix ? valid(values[index]) : null;
  });
}
