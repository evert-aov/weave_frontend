import { describe, it, expect } from 'vitest';
import {
  applyRegionRunColor,
  createRegionEditState,
  deleteRegion,
  insertRegionText,
  parseRegionHtmlToLines,
  serializeRegionLinesToHtml,
  setRegionAlignment,
  splitRegionLine,
  toggleRegionStyle,
} from './canvas-region-model';

describe('canvas-region-model', () => {
  it('parses and serializes formatted header/footer HTML without DOM APIs', () => {
    const html = '<p style="text-align: center"><strong><em><span style="color: #b91c1c">Encabezado</span></em></strong></p>';
    const lines = parseRegionHtmlToLines(html);
    expect(lines).toHaveLength(1);
    expect(lines[0].align).toBe('center');
    expect(lines[0].runs[0]).toEqual({ text: 'Encabezado', bold: true, italic: true, color: '#b91c1c' });
    const back = serializeRegionLinesToHtml(lines);
    expect(back).toContain('text-align: center');
    expect(back).toContain('<strong>');
    expect(back).toContain('#b91c1c');
  });

  it('supports pure-model typing, line splits, deletion, alignment, bold/italic/underline, and color', () => {
    let state = createRegionEditState('header', 0, '');
    state = insertRegionText(state, 'Universidad');
    state = splitRegionLine(state);
    state = insertRegionText(state, 'Capítulo 1');
    expect(state.lines).toHaveLength(2);

    state = deleteRegion(state, true); // deletes '1'
    expect(state.lines[1].runs.map((r) => r.text).join('')).toBe('Capítulo ');

    state = toggleRegionStyle(state, 'bold');
    state = setRegionAlignment(state, 'center');
    state = applyRegionRunColor(state, '#2563eb');

    const serialized = serializeRegionLinesToHtml(state.lines);
    expect(serialized).toContain('<strong>');
    expect(serialized).toContain('text-align: center');
    expect(serialized).toContain('#2563eb');
  });
});
