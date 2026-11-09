import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { emptySource, normalizeSources, type BibliographicSource } from '../models/academic.model';
import { citationText, referenceHtml, sortedSources, sourceYear, referenceAuthors } from './apa-references';
import { academicObjects, applyApaObjects, academicParagraph } from './apa-objects';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { createDocxBlob } from '../services/docx-export';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
const apa = APA_STYLE_TEMPLATES[0];
const source = (patch: Partial<BibliographicSource> = {}): BibliographicSource => ({ ...emptySource(), id: 'one', title: 'Una investigación', year: '2024', authors: [{ family: 'García', given: 'María Elena' }], publisher: 'Editorial', ...patch });

describe('APA 7 academic objects and references', () => {
  it('formats one, two and three authors, narrative citations, missing dates and page locators', () => {
    const a = source();
    expect(citationText(a, [a], false, 'p. 25')).toBe('(García, 2024, p. 25)');
    a.authors.push({ family: 'Pérez', given: 'Ana' });
    expect(citationText(a, [a], true)).toBe('García y Pérez (2024)');
    expect(citationText(a, [a])).toBe('(García & Pérez, 2024)');
    a.authors.push({ family: 'López', given: 'Juan' }); a.year = '';
    expect(citationText(a, [a])).toBe('(García et al., s. f.)');
    expect(referenceAuthors(a)).toBe('García, M. E., Pérez, A., & López, J.');
  });
  it('sorts sources and disambiguates the same author/year consistently', () => {
    const a = source({ id: 'a', title: 'Zoología' }), b = source({ id: 'b', title: 'Botánica' });
    const z = source({ id: 'z', authors: [{ family: 'Zapata', given: 'Ana' }] });
    expect(sortedSources([z, a, b]).map(s => s.id)).toEqual(['b', 'a', 'z']);
    expect(sourceYear(a, [a, b])).toBe('2024b'); expect(sourceYear(b, [a, b])).toBe('2024a');
    expect(referenceHtml(a, [a, b])).toContain('(2024b)');
  });
  it('handles institutional and absent authors without inventing metadata', () => {
    const a = source({ authors: [], organization: 'Universidad', year: '' });
    expect(citationText(a, [a])).toBe('(Universidad, s. f.)');
    a.organization = ''; a.kind = 'web';
    expect(citationText(a, [a])).toBe('(“Una investigación”, s. f.)');
    expect(referenceHtml(a, [a])).toContain('<i>Una investigación</i>. (s. f.).');
  });
  it('uses all twenty authors, and first nineteen plus last for longer lists', () => {
    const a = source({ authors: Array.from({ length: 21 }, (_, i) => ({ family: `Autor${i + 1}`, given: 'Ana' })) });
    expect(referenceAuthors(a)).toContain('Autor19, A., … Autor21, A.');
    expect(referenceAuthors(a)).not.toContain('Autor20');
    a.authors.pop(); expect(referenceAuthors(a)).toContain('& Autor20, A.');
  });
  it('formats books, articles and theses and prefers safe DOI links over URLs', () => {
    const a = source({ edition: '2.ª ed.', doi: '10.1234/abcd', url: 'https://other.example' });
    expect(referenceHtml(a, [a])).toContain('<i>Una investigación</i> (2.ª ed.). Editorial.');
    expect(referenceHtml(a, [a])).toContain('https://doi.org/10.1234/abcd');
    expect(referenceHtml(a, [a])).not.toContain('other.example');
    const article = source({ kind: 'article', container: 'Revista', volume: '5', issue: '2', pages: '20–30' });
    expect(referenceHtml(article, [article])).toContain('Una investigación. <i>Revista</i>, <i>5</i>(2), 20–30.');
    const thesis = source({ kind: 'thesis', description: 'Tesis de grado', publisher: 'Universidad', container: 'Repositorio' });
    expect(referenceHtml(thesis, [thesis])).toContain('<i>Una investigación</i> [Tesis de grado, Universidad]. Repositorio.');
  });
  it('escapes untrusted source text and excludes unsafe links and duplicate stored ids', () => {
    const a = source({ title: '<img onerror="x">', url: 'javascript:alert(1)' });
    expect(referenceHtml(a, [a])).not.toContain('<img');
    expect(referenceHtml(a, [a])).not.toContain('href=');
    expect(normalizeSources([a, a, null, { id: 'bad' }])).toHaveLength(1);
  });
  it('styles tables with horizontal borders and captions with separate numbering for figures', () => {
    const body = document.createElement('div');
    body.innerHTML = '<table><thead><tr><th>Nombre</th><th>Valor</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table><p><img src="/x.jpg"></p>';
    const items = academicObjects([body]);
    expect(items.map(i => i.object.number)).toEqual([0, 0]);
    applyApaObjects([body], apa, { id: items[0].object.id, title: 'Resultados', note: 'Valores en Bs.', sourceId: '', attribution: '' });
    applyApaObjects([body], apa, { id: items[1].object.id, title: 'Distribución', note: '', sourceId: '', attribution: '' });
    expect(body.querySelectorAll('[data-apa-role="number"]')).toHaveLength(2);
    expect(body.querySelector('[data-apa-role="number"]')!.textContent).toBe('Tabla 1');
    expect(body.querySelector<HTMLElement>('[data-apa-role="title"]')!.style.fontStyle).toBe('italic');
    expect(body.querySelector<HTMLElement>('td')!.style.borderLeftStyle).toBe('none');
    expect(body.querySelector<HTMLElement>('th')!.style.borderBottomStyle).toBe('solid');
    expect(body.querySelector('[data-apa-role="note"]')!.textContent).toBe('Nota. Valores en Bs.');
    expect(body.querySelectorAll('img')).toHaveLength(1);
    const title = body.querySelector<HTMLElement>('[data-apa-role="title"]')!; title.textContent = 'Título editado';
    applyApaObjects([body], APA_STYLE_TEMPLATES[2]);
    expect(title.textContent).toBe('Título editado'); expect(title.style.fontSize).toBe('11pt');
    expect(body.querySelectorAll('[data-apa-role="number"]')).toHaveLength(2);
  });
  it('does not count an uncaptioned cover logo as a numbered figure', () => {
    const body = document.createElement('div'); body.innerHTML = '<p><img src="/logo.jpg"></p><p><img src="/chart.jpg"></p>';
    const figure = academicObjects([body])[1].object;
    applyApaObjects([body], apa, { id: figure.id, title: 'Resultados', note: '', sourceId: '', attribution: '' });
    expect(body.querySelector('[data-apa-role="number"]')!.textContent).toBe('Figura 1');
    expect(academicObjects([body]).map(item => item.object.number)).toEqual([0, 1]);
  });

  it.each(APA_STYLE_TEMPLATES)('uses the selected APA typography for tables, captions and references: $name', template => {
    const body = document.createElement('div'); body.innerHTML = '<table><tr><th>A</th></tr><tr><td>B</td></tr></table>';
    const object = academicObjects([body])[0].object;
    applyApaObjects([body], template, { id: object.id, title: 'Datos', note: 'Explicación.', sourceId: '', attribution: '' });
    const reference = document.createElement('p'); academicParagraph(reference, template, 'reference');
    expect(reference.style.fontSize).toBe(`${template.rules.P.fontSizePt}pt`);
    expect(reference.style.fontFamily.replace(/["']/g, '')).toBe(template.rules.P.fontFamily);
    expect(body.querySelector<HTMLElement>('td')!.style.fontSize).toBe(reference.style.fontSize);
    expect(body.querySelector<HTMLElement>('[data-apa-role="title"]')!.style.fontSize).toBe(reference.style.fontSize);
  });

  it('preserves surrounding text when captioning an inline image', () => {
    const body = document.createElement('div'); body.innerHTML = '<p>Antes <img src="/a.jpg"> después</p>';
    const object = academicObjects([body])[0].object;
    applyApaObjects([body], apa, { id: object.id, title: 'Mi figura', note: '', sourceId: '', attribution: '' });
    expect(body.children[0].textContent).toBe('Antes ');
    expect(body.children[body.children.length - 1].textContent).toBe(' después');
    expect(body.querySelector('p p')).toBeNull(); expect(body.querySelectorAll('img')).toHaveLength(1);
  });
  it('exports APA horizontal table rules and reference hanging indent to DOCX', async () => {
    const body = document.createElement('div'); body.innerHTML = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    applyApaObjects([body], apa);
    const ref = document.createElement('p'); ref.innerHTML = referenceHtml(source(), [source()]); academicParagraph(ref, apa, 'reference'); body.append(ref);
    const blob = createDocxBlob([{ id: 'a', html: body.innerHTML }], DEFAULT_LAYOUT_CONFIG);
    const doc = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml']);
    expect(doc).toContain('<w:insideV w:val="nil"'); expect(doc).toContain('<w:bottom w:val="single"');
    expect(doc).toContain('w:left="720" w:hanging="720"'); expect(doc).toContain('w:line="480"');
    expect(new DOMParser().parseFromString(doc, 'application/xml').querySelector('parsererror')).toBeNull();
  }, 20000);
});
