import * as katex from 'katex';
import { formatMultiLineLatex, normalizeLatexAlignment, splitLatexRows } from '../utils/latex';

/** Shared by the editor and HTML/PDF exports, with untrusted TeX disabled. */
export function renderFormula(source: string, content: Record<string, unknown>): string {
  if (!source.trim()) return '';
  const render = (text: string) => katex.renderToString(formatMultiLineLatex(text), {
    displayMode: true, throwOnError: false, trust: false, maxExpand: 1000,
  });
  if (content['alignByLine'] !== true) return render(source);
  const alignments = Array.isArray(content['lineAlignments']) ? content['lineAlignments'] : [];
  return splitLatexRows(source).map((row, index) => {
    const alignment = normalizeLatexAlignment(alignments[index] ?? content['alignment']);
    return `<div class="latex-equation-row" style="text-align: ${alignment};">${render(row)}</div>`;
  }).join('');
}
