import { describe, expect, it } from 'vitest';
import { splitLatexRows, reconcileLatexRowAlignments } from '../utils/latex';
import { renderFormula } from './render-formula';

describe('independent LaTeX rows', () => {
  it('splits top-level Enter and TeX line breaks, ignoring comments', () => {
    expect(splitLatexRows('x=1 % note\ny=2\\\\[4pt] z=3')).toEqual(['x=1','y=2','z=3']);
    expect(splitLatexRows('')).toEqual([]);
  });
  it('keeps braces, escaped percent and nested environments intact', () => {
    const matrix = '\\begin{pmatrix}\n1&2\\\\\n3&4\n\\end{pmatrix}';
    expect(splitLatexRows('\\frac{1\n+2}{3}\n' + matrix + '\nx=5\\%')).toEqual(['\\frac{1\n+2}{3}',matrix,'x=5\\%']);
  });
  it('does not split macros that would otherwise lose shared definitions', () => {
    const source = '\\newcommand{\\sq}[1]{#1^2}\n\\sq{x}\n\\sq{y}';
    expect(splitLatexRows(source)).toEqual([source]);
  });
  it('preserves suffix alignment when inserting and deleting rows', () => {
    expect(reconcileLatexRowAlignments(['a','b'], ['new','a','b'], ['left','right'])).toEqual([null,'left','right']);
    expect(reconcileLatexRowAlignments(['a','b','c'], ['a','c'], ['left','center','right'])).toEqual(['left','right']);
    expect(reconcileLatexRowAlignments(['a','b'], ['a2','b'], ['left','right'])).toEqual(['left','right']);
  });
  it('renders inherited and explicit alignment safely without changing the formula', () => {
    const element = document.createElement('div');
    element.innerHTML = renderFormula('a=1\nb=2\nc=3', {alignByLine:true,alignment:'right',lineAlignments:['left','center','bad" onclick="']});
    const rows = Array.from(element.querySelectorAll<HTMLElement>('.latex-equation-row'));
    expect(rows.map(row=>row.style.textAlign)).toEqual(['left','center','center']);
    expect(rows.every(row=>row.querySelector('.katex'))).toBe(true);
    element.innerHTML = renderFormula('a=1\nb=2', {alignByLine:true,alignment:'right',lineAlignments:['left',null]});
    expect(element.lastElementChild!.getAttribute('style')).toContain('right');
    expect(renderFormula('', {alignByLine:true})).toBe('');
  });
});
