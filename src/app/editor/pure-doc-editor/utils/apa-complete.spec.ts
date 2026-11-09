import { describe, it, expect } from 'vitest';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { normalizeApaHeadings } from './apa-headings';
import { analyzePageHtmlFast } from './word-editor.utils';
import { apaDocumentLayout } from './apa-layout';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { coverSection, abstractSection, putAcademicSection, styleApaSections } from './apa-sections';
import { academicObjects, applyApaObjects } from './apa-objects';
import { academicNotes, renumberAcademicNotes, footnotesForBody, prepareNotePages } from './academic-notes';
import { emptySource, BIBLIOGRAPHIC_KINDS, normalizeSources } from '../models/academic.model';
import { citationText, referenceHtml, renderCitationGroup, referenceEligible } from './apa-references';
const apa = APA_STYLE_TEMPLATES[0];
const root = (html: string) => { const body = document.createElement('div'); body.innerHTML = html; return body; };
const source = (id = 'a') => ({ ...emptySource(), id, title: 'Investigación', year: '2024', authors: [{ family: 'García', given: 'Ana' }] });

describe('Complete APA rules', () => {
  it.each(APA_STYLE_TEMPLATES)('has zero extra paragraph spacing and disables hyphenation: $name', template => {
    Object.values(template.rules).forEach(rule => { expect(rule.spaceBeforePt).toBe(0); expect(rule.spaceAfterPt).toBe(0); });
    expect(apaDocumentLayout({ ...DEFAULT_LAYOUT_CONFIG, hyphenation: true }, template).hyphenation).toBe(false);
  });
  it('turns H4/H5 into run-in headings without losing adjacent text, nested markup or index entries', () => {
    const body = root('<h1 id="top">Principal</h1><h4 id="four">Método <span>aplicado</span></h4><p>Primer párrafo.</p><p>Segundo párrafo.</p><h5>Detalle</h5><p>Más información.</p>');
    normalizeApaHeadings([body], apa);
    expect(body.querySelectorAll('h4,h5')).toHaveLength(0);
    expect(body.querySelector('[data-apa-run-in="4"]')!.textContent).toBe('Método aplicado. Primer párrafo.');
    expect(body.querySelector('[data-apa-heading-level="5"]')!.getAttribute('style')).toContain('italic');
    const headings = analyzePageHtmlFast(body.innerHTML, 0).headings;
    expect(headings.map(h => h.text)).toEqual(['Principal', 'Método aplicado.', 'Detalle.']);
    const text = body.textContent; normalizeApaHeadings([body], apa); expect(body.textContent).toBe(text);
    expect(body.querySelectorAll('p')).toHaveLength(3);
  });
  it('preserves body emphasis when updating a run-in heading', () => {
    const body = root('<h4>Método</h4><p>Texto <strong>importante</strong>.</p>'); normalizeApaHeadings([body], apa);
    expect(body.querySelector('strong')!.style.fontWeight).not.toBe('inherit');
    normalizeApaHeadings([body], apa); expect(body.querySelector('strong')!.style.fontWeight).not.toBe('inherit');
  });

  it('limits APA to five levels while retaining H6 text', () => {
    const body = root('<h6>Sexto</h6><p>Contenido</p>'); normalizeApaHeadings([body], apa);
    expect(body.querySelector('[data-apa-heading-level="5"]')!.textContent).toBe('Sexto.'); expect(body.textContent).toContain('Contenido');
  });
  it('builds student and professional covers and inserts an abstract after the cover', () => {
    const html = coverSection({ kind: 'cover', title: 'Trabajo', authors: 'Ana\nJuan', affiliations: 'Universidad', course: 'SW1', instructor: 'Docente', date: '8 de noviembre', authorNote: '', professional: false }, apa);
    expect(html).toContain('data-apa-role="cover-title"'); expect(html).toContain('SW1');
    const abstract = abstractSection({ kind: 'abstract', language: 'es', text: 'Un resumen\ncon información.', keywords: 'investigación, método' }, apa);
    const first = putAcademicSection([{ id: 'body', html: '<p>Contenido</p>' }], html, 'cover', 'start');
    const second = putAcademicSection(first.pages, abstract, 'abstract-es', 'abstract');
    expect(second.index).toBe(1); expect(second.pages).toHaveLength(3);
    expect(second.pages[2].html).toBe('<p>Contenido</p>');
    expect(root(abstract).querySelector<HTMLElement>('[data-apa-role="abstract"]')!.style.textIndent).toBe('0pt');
    expect(root(abstract).querySelector('i')!.textContent).toBe('Palabras clave:');
  });
  it('updates generated sections without deleting unrelated document content', () => {
    const pages = [{ id: 'a', html: '<div data-apa-section="cover"><p>Anterior</p></div><p>Conservar</p>' }];
    const result = putAcademicSection(pages, '<div data-apa-section="cover">Nueva</div>', 'cover', 'start');
    expect(result.pages.map(p => p.html).join('')).toContain('Conservar'); expect(result.pages.map(p => p.html).join('')).not.toContain('Anterior');
  });
  it('numbers appendices and their tables independently, including the single-table exception', () => {
    const body = root('<div data-apa-section="appendix" data-appendix-id="a"><p data-apa-role="appendix-label"></p><table data-apa-captioned="true" data-apa-title="Datos"><tr><td>A</td></tr></table></div><div data-apa-section="appendix" data-appendix-id="b"><p data-apa-role="appendix-label"></p><table data-apa-captioned="true" data-apa-title="Otros"><tr><td>B</td></tr></table></div>');
    styleApaSections([body], apa); applyApaObjects([body], apa);
    expect(Array.from(body.querySelectorAll('[data-apa-role="number"]')).map(p => p.textContent)).toEqual(['Tabla A1', 'Tabla B1']);
    expect(body.querySelector('[data-apa-role="appendix-label"]')!.textContent).toBe('Apéndice A');
    const single = body.firstElementChild as HTMLElement; single.dataset['appendixTableOnly'] = 'true'; applyApaObjects([body], apa);
    expect(single.querySelector('[data-apa-role="number"]')).toBeNull(); expect(academicObjects([body])[1].object.prefix).toBe('B');
  });
  it('numbers note calls across pages and generates smaller single-spaced footnotes only for their page', () => {
    const a = root('<p>Texto<a data-word-note-id="a" data-note-kind="footnote" data-note-content="Explicación"></a></p>');
    const b = root('<p>Otro<a data-word-note-id="b" data-note-kind="footnote" data-note-content="Segunda"></a><a data-word-note-id="c" data-note-kind="endnote" data-note-content="Final"></a></p>');
    renumberAcademicNotes([a,b]); expect(academicNotes([a,b]).map(n => n.number)).toEqual([1,2,1]);
    const list = footnotesForBody(b)!; expect(list.textContent).toBe('2 Segunda');
    expect(list.querySelector<HTMLElement>('p')!.style.fontSize).toBe('10pt'); expect(list.querySelector<HTMLElement>('p')!.style.lineHeight).toBe('1');
    b.append(list); const prepared = prepareNotePages([{ id: 'a', html: a.innerHTML }, { id: 'b', html: b.innerHTML }]);
    expect(prepared[1].html).not.toContain('data-word-note-list'); expect(prepared[1].html).toContain('data-note-content="Segunda"');
  });
  it.each(BIBLIOGRAPHIC_KINDS)('formats and round-trips the reference type %s', kind => {
    const work = { ...source(), kind, container: 'Contenedor', publisher: 'Editorial', url: 'https://example.org/work', description: 'Descripción' };
    expect(normalizeSources([work])[0].kind).toBe(kind);
    const html = referenceHtml(work, [work]);
    if (kind === 'personal') { expect(html).toBe(''); expect(referenceEligible(work)).toBe(false); }
    else { expect(html).toContain('2024'); expect(html).toContain('example.org/work'); expect(html).toContain('Investigación'); }
  });
  it('supports institutional abbreviations, secondary sources, grouped citations and personal communications', () => {
    const institution = { ...source('i'), authors: [], organization: 'Organización Mundial de la Salud', abbreviation: 'OMS' };
    expect(citationText(institution, [institution])).toBe('(Organización Mundial de la Salud [OMS], 2024)');
    expect(citationText(institution, [institution], false, '', { firstInstitution: false })).toBe('(OMS, 2024)');
    expect(citationText(source(), [source()], false, 'p. 2', { secondaryAuthor: 'López', secondaryYear: '1999' })).toContain('López, 1999, como se citó en García, 2024, p. 2');
    const span = document.createElement('span'); span.dataset['wordSourceIds'] = '["a","i"]';
    expect(renderCitationGroup(span, [source(), institution])).toContain('; ');
    const personal = { ...source(), kind: 'personal' as const, date: '8 de noviembre' };
    expect(citationText(personal, [personal])).toBe('(A. García, comunicación personal, 8 de noviembre de 2024)');
  });
});
