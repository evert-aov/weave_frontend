import { describe, expect, it } from 'vitest';
import { CanvasEditSession } from '../engine/canvas-edit-session';
import { textNodes, type DocumentNode } from '../engine/document-model';
import { htmlToDocumentState, serializeDocumentNodes } from '../engine/document-model-dom';
import { resolveDefaultModelStyles } from '../engine/model-layout';
import { styleModelApaTable } from '../engine/model-academic';
import { BUILTIN_STYLE_TEMPLATES, DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { createDocxParts } from '../services/docx-export';
import { normalizeLoadedDocData } from './doc-data-migration';
import { DEFAULT_TABLE_STYLE, normalizeTableStyle, styleModelTable } from './table-styling';

const geometry = { width: 600, height: 800, top: 40, right: 40, bottom: 40, left: 40 };
const measure = (text: string) => ({ width: [...text].length * 7, ascent: 10, descent: 3 });
const apa = BUILTIN_STYLE_TEMPLATES.find(t => t.id === 'apa-times-12')!;
const rule = normalizeTableStyle({ ...DEFAULT_TABLE_STYLE, mode: 'custom', fontFamily: 'Georgia', fontSizePt: 10,
  lineHeight: 1.5, borderWidthPt: 2, borderColor: '#166534', cellPaddingPt: 6,
  headerBackgroundColor: '#172554', headerColor: '#ffffff', bandedRows: true, bandColor: '#dcfce7' });
const tableHtml = '<table id="target"><colgroup><col style="width:30%"><col style="width:70%"></colgroup><thead><tr><th><p>Nombre</p></th><th>Valor</th></tr></thead><tbody><tr><td colspan="2"><p><strong>Dato</strong> combinado</p></td></tr><tr><td><p>Segundo</p></td><td>20</td></tr></tbody></table>';
const elements = (nodes: readonly DocumentNode[]): Extract<DocumentNode, {kind:'element'}>[] => nodes.flatMap(n => n.kind === 'text' ? [] : [n, ...elements(n.children)]);
const table = (s: CanvasEditSession) => elements(s.engine.getSections()[0].model.state.roots).find(n => n.tag === 'table')!;
const selectTable = (s: CanvasEditSession) => { const pos = {nodeId: textNodes([table(s)])[0].id, offset: 0}; s.setSelection(0, {anchor: pos, focus: pos}); };
const session = () => { const s = new CanvasEditSession(geometry, {font: '16px "Arial"', lineHeight: 20}, measure); s.load([{id: 'p1', html: '<p>Texto fuera</p>' + tableHtml}]); return s; };

describe('independent Word table designs', () => {
  it('applies custom typography, colors, spacing, borders and padding in Canvas even under APA defaults', () => {
    const s = session(), original = table(s);
    const ids = textNodes([original]).map(t => t.id), content = textNodes([original]).map(t => t.text).join('');
    expect(s.applyTemplateToDocument({...apa, tableStyle: rule}, geometry, {font: '16px "Times New Roman"', lineHeight: 32, apaBorders: true})).toBe(true);
    const styled = table(s);
    expect(textNodes([styled]).map(t => t.id)).toEqual(ids);
    expect(textNodes([styled]).map(t => t.text).join('')).toBe(content);
    expect(elements([styled]).find(n => n.attributes['colspan'] === '2')).toBeTruthy();
    expect(styled.attributes['data-apa-table']).toBeUndefined();
    const styles = resolveDefaultModelStyles(s.engine.getSections()[0].model.state, {apaBorders:true});
    expect(styles.get(styled.id)).toMatchObject({apaBorders:false, border:0, padding:8, columns:[30,70]});
    const firstP = elements([styled]).find(n => n.tag === 'p')!;
    expect(styles.get(firstP.id)?.font).toContain('Georgia');
    expect(styles.get(firstP.id)?.lineHeight).toBeCloseTo(13.33 * 1.5 * 1.15, 1);
    const commands = s.displayLists.flatMap(p => p.commands);
    expect(commands.some(c => c.kind === 'rect' && c.color === '#172554')).toBe(true);
    expect(commands.some(c => c.kind === 'rect' && c.color === '#dcfce7')).toBe(true);
    expect(commands.some(c => c.kind === 'rect' && c.color === '#166534')).toBe(true);
    expect(commands.filter(c => c.kind === 'text' && c.color === '#ffffff').map(c => c.kind === 'text' ? c.text : '').join('')).toContain('Nombre');
  });

  it('fixes only the selected table, preserves it across template/APA caption changes and supports undo/redo', () => {
    const s = session(); selectTable(s);
    expect(s.applyTableStyle(rule, true)).toBe(true);
    const fixed = table(s);
    expect(s.getSelectedTableDesign()).toEqual({rule, fixed:true});
    expect(fixed.attributes['data-word-table-binding']).toBe('fixed');
    expect(styleModelApaTable(fixed, apa)).toBe(fixed);
    expect(s.applyTemplateToDocument(apa, geometry, {font:'16px serif', lineHeight:32, apaBorders:true})).toBe(true);
    expect(table(s)).toBe(fixed);
    s.updateStyleRuleAcrossDocument('P', apa.rules.P);
    expect(table(s)).toBe(fixed);
    s.undo(); s.undo(); s.undo();
    expect(table(s).attributes['data-word-table-binding']).toBeUndefined();
    s.undo(true);
    expect(table(s).attributes['data-word-table-binding']).toBe('fixed');
  });

  it('preserves inherited font metrics when changing the document to APA', () => {
    const s = session();
    const oldId = textNodes([table(s)])[0].id;
    const before = s.engine.getResolvedStyles(s.engine.getSections()[0].model.state).get(oldId)!;
    s.applyTemplateToDocument({...apa, tableStyle:{...rule, mode:'preserve'}}, geometry, {font:'30px "Times New Roman"', lineHeight:60, apaBorders:true});
    const after = s.engine.getResolvedStyles(s.engine.getSections()[0].model.state).get(oldId)!;
    expect(after.font).toBe(before.font);
    expect(after.lineHeight).toBeCloseTo(before.lineHeight, 1);
    expect(table(s).attributes['data-apa-table']).toBeUndefined();
  });

  it('uses the table design for inserted and pasted tables and persists fixed designs in native models', () => {
    const s = session(); s.selectAll(); s.delete(true);
    expect(s.insertTable(3, 2, true, 0, rule)).toBe(true);
    expect(table(s).attributes['data-word-table-style']).toBe('custom');
    selectTable(s); s.applyTableStyle(rule, true);
    const saved = {v:3, pages:s.pages, modelSections:s.exportSectionModels()};
    const normalized = normalizeLoadedDocData(JSON.parse(JSON.stringify(saved)));
    const restored = new CanvasEditSession(geometry, {apaBorders:true}, measure);
    restored.load(normalized.pages!, normalized.modelSections!);
    expect(table(restored).attributes['data-word-table-binding']).toBe('fixed');
    const pasted = new CanvasEditSession(geometry, {}, measure); pasted.load([{id:'empty', html:'<p></p>'}]);
    expect(pasted.pasteTable(tableHtml, true, 0, rule)).toBe(true);
    expect(table(pasted).attributes['data-word-table-style']).toBe('custom');
  });

  it('exports custom cell borders, font, colors, padding, line spacing and repeated headers to native DOCX', () => {
    const model = htmlToDocumentState(tableHtml).roots[0] as Extract<DocumentNode, {kind:'element'}>;
    const styled = styleModelTable(model, rule, 'fixed');
    const parts = createDocxParts([{id:'p', html:serializeDocumentNodes([styled])}], DEFAULT_LAYOUT_CONFIG, []);
    const xml = new DOMParser().parseFromString(parts['word/document.xml'] as string, 'application/xml');
    const borders = Array.from(xml.getElementsByTagName('w:tcBorders'));
    expect(borders.length).toBeGreaterThan(0);
    expect(borders[0].getElementsByTagName('w:top')[0].getAttribute('w:color')).toBe('166534');
    expect(borders[0].getElementsByTagName('w:top')[0].getAttribute('w:sz')).toBe('16');
    expect(xml.getElementsByTagName('w:shd')[0].getAttribute('w:fill')).toBe('172554');
    expect(xml.getElementsByTagName('w:tblHeader')).toHaveLength(1);
    expect(xml.getElementsByTagName('w:tcMar')[0].getElementsByTagName('w:top')[0].getAttribute('w:w')).toBe('120');
    expect(Array.from(xml.getElementsByTagName('w:spacing')).some(n => n.getAttribute('w:line') === '360')).toBe(true);
    expect(Array.from(xml.getElementsByTagName('w:rFonts')).some(n => n.getAttribute('w:ascii') === 'Georgia')).toBe(true);
    const noBorders = styleModelTable(model, {...rule, borders:'none', header:false, repeatHeader:false});
    const plain = createDocxParts([{id:'p', html:serializeDocumentNodes([noBorders])}], DEFAULT_LAYOUT_CONFIG, []);
    const plainXml = new DOMParser().parseFromString(plain['word/document.xml'] as string, 'application/xml');
    expect(plainXml.getElementsByTagName('w:tblHeader')).toHaveLength(0);
    expect(Array.from(plainXml.getElementsByTagName('w:tcBorders')).every(n => Array.from(n.children).every(b => b.getAttribute('w:val') === 'nil'))).toBe(true);
  });
});
