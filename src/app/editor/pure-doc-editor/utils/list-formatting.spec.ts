import { afterEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { BUILTIN_STYLE_TEMPLATES, DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { createDocxBlob } from '../services/docx-export';
import { applyTemplateLists } from './list-formatting';
import { APA_STYLE_TEMPLATES, APA_FONT_VARIANTS } from '../constants/apa-style-templates';

const apa = BUILTIN_STYLE_TEMPLATES.find(template => template.id === 'apa-times-12')!;
function body(html: string): HTMLElement {
  const el = document.createElement('div'); el.innerHTML = html; document.body.appendChild(el); return el;
}
afterEach(() => document.body.replaceChildren());

describe('APA list formatting and Word export', () => {
  it('normalizes imported run fonts inside bare and wrapped list items without changing text or emphasis', () => {
    const el = body('<ul><li><span style="font-family:Arial;font-size:14pt;line-height:1">Qué tan seguido </span><b>publican</b><font face="Arial" size="4"> y cuánto venden.</font></li><li><p style="font-family:Calibri;font-size:16pt"><span style="font-family:Arial">Otra frase.</span></p></li></ul>');
    const text = el.textContent;
    applyTemplateLists([el], apa);
    expect(el.textContent).toBe(text);
    expect(el.querySelector('b')!.textContent).toBe('publican');
    expect(el.querySelector<HTMLElement>('span')!.style.fontFamily).toBe('inherit');
    expect(el.querySelector<HTMLElement>('span')!.style.fontSize).toBe('inherit');
    expect(el.querySelector('font')!.hasAttribute('face')).toBe(false);
    expect(el.querySelector<HTMLElement>('li p')!.style.fontFamily).toBe('inherit');
  });
  it.each(APA_FONT_VARIANTS)('keeps $family $sizePt pt consistent in headings, paragraphs, lists and DOCX', async variant => {
    const template = APA_STYLE_TEMPLATES.find(item => item.id === variant.id)!;
    Object.values(template.rules).forEach(rule => {
      expect(rule.fontFamily).toBe(variant.family);
      expect(rule.fontSizePt).toBe(variant.sizePt);
      expect(rule.lineHeight).toBe(2);
    });
    const el = body('<ol><li>Primer paso.</li></ol><ul><li>frase corta</li></ul>');
    applyTemplateLists([el], template);
    expect(el.querySelector<HTMLElement>('li')!.style.fontFamily.replace(/["']/g, '')).toBe(variant.family);
    expect(el.querySelector<HTMLElement>('li')!.style.fontSize).toBe(`${variant.sizePt}pt`);
    const blob = createDocxBlob([{ id: 'a', html: el.innerHTML }], DEFAULT_LAYOUT_CONFIG);
    const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const doc = strFromU8(parts['word/document.xml']);
    expect(doc).toContain(`w:ascii="${variant.family}"`);
    expect(doc).toContain(`<w:sz w:val="${variant.sizePt * 2}"/>`);
    expect(doc).toContain('w:line="480"');
    expect(template.listRules).not.toBe(APA_STYLE_TEMPLATES.find(item => item.id !== variant.id)!.listRules);
  });
  it('formats wrapped items, preserves content, numbering starts and nested semantic lists', () => {
    const el = body('<ol start="3"><li><p style="text-indent:36pt;margin-bottom:8pt">Primero.</p></li><li>Segundo.<ul><li>frase (Autor, 2020)</li></ul></li></ol>');
    const text = el.textContent;
    applyTemplateLists([el], apa);
    expect(el.textContent).toBe(text);
    expect(el.querySelector('ol')!.start).toBe(3);
    expect(el.querySelector<HTMLElement>('ol')!.style.listStyleType).toBe('decimal');
    expect(el.querySelector<HTMLElement>('ul')!.style.listStyleType).toBe('disc');
    expect(el.querySelector<HTMLElement>('li')!.style.lineHeight).toBe('2');
    expect(el.querySelector<HTMLElement>('li p')!.style.textIndent).toBe('0pt');
    expect(el.querySelector<HTMLElement>('li p')!.style.marginBottom).toBe('0pt');
    expect(el.querySelectorAll('li')).toHaveLength(3);
  });

  it('keeps chosen bullets on subsequent edits and leaves templates without list rules alone', () => {
    const el = body('<ul style="list-style-type:square"><li>frase corta</li></ul>');
    applyTemplateLists([el], apa, true);
    expect(el.querySelector<HTMLElement>('ul')!.style.listStyleType).toBe('square');
    const html = el.innerHTML;
    applyTemplateLists([el], BUILTIN_STYLE_TEMPLATES.find(template => !template.listRules)!);
    expect(el.innerHTML).toBe(html);
  });

  it('exports real numbering, double spacing, hanging indents and separate nested list paragraphs', async () => {
    const el = body('<ol start="3"><li>Primer <b>paso.</b></li><li><p>Segundo paso.</p><ul><li>frase corta</li></ul>continuación</li></ol><table><tr><td><ol><li>En tabla.</li></ol></td></tr></table>');
    applyTemplateLists([el], apa);
    const blob = createDocxBlob([{ id: 'a', html: el.innerHTML }], DEFAULT_LAYOUT_CONFIG);
    const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const doc = strFromU8(parts['word/document.xml']);
    const numbering = strFromU8(parts['word/numbering.xml']);
    const parsed = new DOMParser().parseFromString(doc, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(doc).toContain('<w:numPr>');
    expect(doc).toContain('w:line="480"');
    expect(doc).toContain('w:left="1080" w:hanging="360"');
    expect(doc).toContain('Times New Roman');
    expect(doc).not.toContain('w:ascii="inherit"');
    expect(doc).toContain('w:val="24"');
    expect(numbering).toContain('<w:start w:val="3"/>');
    expect(numbering).toContain('<w:lvlText w:val="%1."/>');
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(doc.match(/frase corta/g)).toHaveLength(1);
    expect(doc).toContain('continuación');
    expect(doc).toContain('En tabla.');
    expect(strFromU8(parts['word/_rels/document.xml.rels'])).toContain('numbering.xml');
  });
});
