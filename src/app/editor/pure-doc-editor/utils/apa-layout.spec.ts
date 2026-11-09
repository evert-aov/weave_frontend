import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { apaDocumentLayout, apaHeaderHtml } from './apa-layout';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { applyApaObjects } from './apa-objects';
import { createDocxBlob } from '../services/docx-export';

describe('APA page layout and table colors', () => {
  it.each(APA_STYLE_TEMPLATES)('applies Letter, one-inch margins and the selected font: $name', template => {
    const layout = apaDocumentLayout({ ...DEFAULT_LAYOUT_CONFIG, headerHtml: '<p>Encabezado anterior</p>', footerHtml: '<p>Pie anterior</p>' }, template);
    expect(layout.paperFormatId).toBe('letter'); expect(layout.orientation).toBe('portrait');
    expect([layout.margins.topPx, layout.margins.bottomPx, layout.margins.leftPx, layout.margins.rightPx]).toEqual([96, 96, 96, 96]);
    expect(layout.apa).toMatchObject({ mode: 'student', fontFamily: template.rules.P.fontFamily, fontSizePt: template.rules.P.fontSizePt });
    expect(layout.headerHtml).toContain('anterior'); expect(layout.footerHtml).toContain('anterior');
    expect(apaHeaderHtml(layout, 1)).toContain('<span>1</span>'); expect(apaHeaderHtml(layout, 2)).toContain('<span>2</span>');
  });
  it('clears imported colors, fills and legacy font tags, while retaining illustration colors', () => {
    const body = document.createElement('div'); body.innerHTML = '<table bgcolor="blue" style="background:red;color:yellow"><tbody style="background:orange"><tr bgcolor="green"><th style="background:purple;color:white"><font color="red" face="Arial">Título</font></th></tr><tr><td bgcolor="pink"><p><span style="color:red!important;background:yellow!important">Dato</span></p><svg><path fill="red"/></svg></td></tr></tbody></table>';
    applyApaObjects([body], APA_STYLE_TEMPLATES[0]);
    const table = body.querySelector('table')!;
    expect(table.style.backgroundColor).toBe('rgb(255, 255, 255)');
    for (const run of Array.from(table.querySelectorAll<HTMLElement>('tbody,tr,td,th,p,font,span'))) {
      expect(run.style.color).toBe('rgb(0, 0, 0)'); expect(run.hasAttribute('bgcolor')).toBe(false);
      expect(run.style.backgroundColor).toBe('transparent');
    }
    expect(body.querySelector('font')!.hasAttribute('color')).toBe(false);
    expect(body.querySelector('path')!.getAttribute('fill')).toBe('red');
  });
  it('exports a real repeated PAGE field, including page one, with professional running head', async () => {
    const base = apaDocumentLayout(DEFAULT_LAYOUT_CONFIG, APA_STYLE_TEMPLATES[2]);
    const layout = { ...base, apa: { ...base.apa!, mode: 'professional' as const, runningHead: 'TÍTULO ABREVIADO' } };
    const blob = createDocxBlob([{ id: '1', html: '<p>Portada</p>' }, { id: '2', html: '<p>Texto</p>' }], layout);
    const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const doc = strFromU8(parts['word/document.xml']), header = strFromU8(parts['word/header1.xml']);
    expect(doc).toContain('w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"');
    expect(doc).toContain('<w:headerReference w:type="default" r:id="rId3"/>'); expect(doc).toContain('<w:pgNumType w:start="1"/>');
    expect(header).toContain('w:instr=" PAGE "'); expect(header).toContain('TÍTULO ABREVIADO'); expect(header).toContain('w:ascii="Arial"');
    expect(strFromU8(parts['word/_rels/document.xml.rels'])).toContain('Target="header1.xml"');
    expect(new DOMParser().parseFromString(header, 'application/xml').querySelector('parsererror')).toBeNull();
  });
});
