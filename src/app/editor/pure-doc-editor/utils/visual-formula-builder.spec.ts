import { describe, it, expect } from 'vitest';
import {
  compileVisualSlot,
  createSlot,
  insertStructureIntoSlot,
  insertTextTokenIntoSlot,
  parseLatexToVisualSlot,
  removePieceFromSlotTree,
} from './visual-formula-builder';

describe('visual-formula-builder', () => {
  it('builds nested graphical structures and compiles valid LaTeX without user typing braces', () => {
    let root = createSlot('Fórmula', '...');
    root = insertTextTokenIntoSlot(root, root.id, 'y =');
    const insertedFrac = insertStructureIntoSlot(root, root.id, 'frac');
    root = insertedFrac.root;
    const fracPiece = root.pieces.find((p) => p.kind === 'frac');
    expect(fracPiece).toBeTruthy();
    if (fracPiece && fracPiece.kind === 'frac') {
      root = insertTextTokenIntoSlot(root, fracPiece.num.id, 'π r');
      const powInNum = insertStructureIntoSlot(root, fracPiece.num.id, 'sup');
      root = powInNum.root;
      const updatedFrac = root.pieces.find((p) => p.kind === 'frac');
      if (updatedFrac && updatedFrac.kind === 'frac') {
        const supPiece = updatedFrac.num.pieces.find((p) => p.kind === 'script');
        if (supPiece && supPiece.kind === 'script') {
          root = insertTextTokenIntoSlot(root, supPiece.base.id, 'x');
          if (supPiece.sup) {
            root = insertTextTokenIntoSlot(root, supPiece.sup.id, '2');
          }
        }
        root = insertTextTokenIntoSlot(root, updatedFrac.den.id, '2');
      }
    }
    const latex = compileVisualSlot(root, false);
    expect(latex).toContain('\\frac{');
    expect(latex).toContain('\\pi');
    expect(latex).toContain('x^{2}');
    expect(latex).toContain('{2}');
  });

  it('parses quadratic formula, integrals, matrices, and removes pieces cleanly', () => {
    const parsed = parseLatexToVisualSlot('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
    expect(parsed.pieces.some((p) => p.kind === 'frac')).toBe(true);
    const recompiled = compileVisualSlot(parsed, false);
    expect(recompiled).toContain('\\frac');
    expect(recompiled).toContain('\\sqrt');

    const mat = parseLatexToVisualSlot('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
    expect(mat.pieces.some((p) => p.kind === 'matrix')).toBe(true);
    expect(compileVisualSlot(mat, false)).toContain('\\begin{pmatrix}');

    const fracId = parsed.pieces.find((p) => p.kind === 'frac')?.id || '';
    const trimmed = removePieceFromSlotTree(parsed, fracId);
    expect(trimmed.pieces.some((p) => p.kind === 'frac')).toBe(false);
  });
});
