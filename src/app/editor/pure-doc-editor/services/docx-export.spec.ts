import { DocxParserService } from './docx-parser.service';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createDocxBlob, createDocxFile } from './docx-export';
import { prepareDocxImages } from './docx-media';
import { DEFAULT_LAYOUT_CONFIG } from '../constants/word-document.constants';
import { APA_STYLE_TEMPLATES } from '../constants/apa-style-templates';
import { apaDocumentLayout } from '../utils/apa-layout';
import { normalizeApaHeadings } from '../utils/apa-headings';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=';
const uri = `data:image/png;base64,${png}`;
const layout = apaDocumentLayout(DEFAULT_LAYOUT_CONFIG, APA_STYLE_TEMPLATES[0]);
async function parts(blob: Blob) { return unzipSync(new Uint8Array(await blob.arrayBuffer())); }
function xmlPart(files: Record<string, Uint8Array>, name: string): Document {
  const value = strFromU8(files[name]); const doc = new DOMParser().parseFromString(value, 'application/xml'); expect(doc.querySelector('parsererror')).toBeNull(); return doc;
}
afterEach(() => vi.unstubAllGlobals());

describe('Complete DOCX package', () => {
  it('embeds the exact image bytes once and exports each occurrence with its dimensions and alt text', async () => {
    const files = await parts(createDocxBlob([{ id: 'a', html: `<p><img src="${uri}" alt="Universidad &amp; ciencia" style="width:80px;height:40px"></p><p><img src="${uri}" width="40" height="20"></p>` }], layout));
    expect(Object.keys(files).filter(name => name.startsWith('word/media/'))).toEqual(['word/media/image1.png']);
    expect(files['word/media/image1.png']).toEqual(Uint8Array.from(atob(png), c => c.charCodeAt(0)));
    const doc = xmlPart(files, 'word/document.xml');
    expect(doc.getElementsByTagName('w:drawing')).toHaveLength(2);
    expect(doc.getElementsByTagName('wp:extent')[0].getAttribute('cx')).toBe(String(80 * 9525));
    expect(doc.getElementsByTagName('wp:extent')[0].getAttribute('cy')).toBe(String(40 * 9525));
    expect(doc.getElementsByTagName('wp:docPr')[0].getAttribute('descr')).toBe('Universidad & ciencia');
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('Target="media/image1.png"');
    expect(strFromU8(files['[Content_Types].xml'])).toContain('ContentType="image/png"');
  });
  it('fetches an uploaded asset once, preserves bytes and fails visibly on missing assets', async () => {
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
    const fetcher = vi.fn(async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 })); vi.stubGlobal('fetch', fetcher);
    const pages = [{ id: 'a', html: '<p><img src="https://files.example/a.png"><img src="https://files.example/a.png"></p>' }];
    const blob = await createDocxFile(pages, layout); const files = await parts(blob);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(files['word/media/image1.png']).toEqual(bytes);
    fetcher.mockImplementation(async () => new Response('', { status: 404 }));
    await expect(createDocxFile(pages, layout)).rejects.toThrow('404');
  });
  it('rejects unsafe image protocols and never silently substitutes a remote image with alt text', async () => {
    await expect(prepareDocxImages([{ id: 'a', html: '<img src="javascript:alert(1)">' }])).rejects.toThrow('no compatible');
    expect(() => createDocxBlob([{ id: 'a', html: '<p><img src="https://example.org/missing.jpg" alt="No perder"></p>' }], layout)).toThrow('Falta una imagen');
  });
  it('exports native footnotes and endnotes, without duplicating generated preview notes in the body', async () => {
    const html = '<p>Texto<a data-word-note-id="f" data-note-kind="footnote" data-note-content="Aclaración al pie">1</a> y final<a data-word-note-id="e" data-note-kind="endnote" data-note-content="Explicación final">1</a></p><div data-word-note-list="footnote"><p>NO DUPLICAR</p></div>';
    const pages = [{ id: 'a', html }, { id: 'notes', html: '<div data-word-note-list="endnote" data-apa-section="endnotes">NO DUPLICAR</div>', breakBefore: 'manual' as const }, { id: 'app', html: '<div data-apa-section="appendix"><p>Apéndice</p></div>', breakBefore: 'manual' as const }];
    const files = await parts(createDocxBlob(pages, layout));
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).toContain('<w:footnoteReference w:id="1"/>'); expect(doc).toContain('<w:endnoteReference w:id="1"/>'); expect(doc).not.toContain('NO DUPLICAR');
    expect(strFromU8(files['word/footnotes.xml'])).toContain('Aclaración al pie'); expect(strFromU8(files['word/footnotes.xml'])).toContain('w:line="240"');
    expect(strFromU8(files['word/endnotes.xml'])).toContain('Explicación final'); expect(strFromU8(files['word/endnotes.xml'])).toContain('w:line="480"');
    expect(doc).toContain('<w:pos w:val="sectEnd"/>');
    for (const name of Object.keys(files).filter(name => name.endsWith('.xml') || name.endsWith('.rels'))) xmlPart(files, name);
  });
  it('preserves run-in heading emphasis, APA type, quote indentation and functioning DOI links', async () => {
    const root = document.createElement('div'); root.innerHTML = '<h4 id="method">Procedimiento</h4><p>El texto sigue en la misma línea.</p><blockquote style="margin-left:36pt;line-height:2"><p style="text-indent:0pt">Una cita. (Autor, 2024, p. 8)</p></blockquote><p style="margin-left:36pt;text-indent:-36pt;line-height:2"><i>Referencia.</i> <a href="https://doi.org/10.1234/test">https://doi.org/10.1234/test</a></p>';
    normalizeApaHeadings([root], APA_STYLE_TEMPLATES[0]);
    const files = await parts(createDocxBlob([{ id: 'a', html: root.innerHTML }], layout));
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).toContain('Procedimiento.'); expect(doc).toContain('<w:outlineLvl w:val="3"/>');
    expect(doc).toContain('w:left="720"'); expect(doc).toContain('w:hanging="720"');
    expect(doc).toContain('<w:hyperlink r:id="link1">'); expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('https://doi.org/10.1234/test');
    expect(strFromU8(files['word/styles.xml'])).toContain('w:ascii="Times New Roman"'); expect(strFromU8(files['word/settings.xml'])).toContain('<w:autoHyphenation w:val="0"/>');
  });
  it('reopens exported images, notes, run-in headings and APA page numbering without losing their content', async () => {
    const root = document.createElement('div'); root.innerHTML = `<h4 id="method">Método</h4><p>Texto de la investigación.</p><p><img src="${uri}" width="80" height="40" alt="Universidad"></p><p>Nota<a data-word-note-id="f" data-note-kind="footnote" data-note-content="Primera línea.&#10;Segunda línea.">1</a> y final<a data-word-note-id="e" data-note-kind="endnote" data-note-content="Explicación final.">1</a></p>`;
    normalizeApaHeadings([root], APA_STYLE_TEMPLATES[0]);
    const files = await parts(createDocxBlob([{ id: 'a', html: root.innerHTML }], layout));
    const parser = new DocxParserService();
    const archive = parser as unknown as { extractDocxArchiveContents(buffer: ArrayBuffer): Promise<unknown> };
    vi.spyOn(archive, 'extractDocxArchiveContents').mockResolvedValue({ xmlFiles: Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels')).map(([name, bytes]) => [name, strFromU8(bytes)])), mediaBlobUrls: { 'word/media/image1.png': uri } });
    const result = await parser.parseDocxFile({ name: 'apa.docx', arrayBuffer: async () => new ArrayBuffer(0) } as File);
    const body = document.createElement('div'); body.innerHTML = result.pages.map(p => p.html).join('');
    expect(body.querySelector('img')?.getAttribute('alt')).toBe('Universidad');
    expect(body.querySelector('img')?.style.width).toBe('80px'); expect(body.querySelector('img')?.style.height).toBe('40px');
    expect(body.querySelector('[data-word-note-id="docx-footnote-1"]')?.getAttribute('data-note-content')).toBe('Primera línea.\nSegunda línea.');
    expect(body.querySelector('[data-word-note-id="docx-endnote-1"]')?.getAttribute('data-note-content')).toBe('Explicación final.');
    expect(body.querySelector('[data-apa-heading-level="4"]')?.textContent).toBe('Método.');
    expect(body.querySelector('[data-apa-run-in="4"]')?.textContent).toContain('Texto de la investigación.');
    expect(result.detectedLayout.apa).toMatchObject({ mode: 'student', fontFamily: 'Times New Roman', fontSizePt: 12 });
  });

  it('keeps an image and its relationships in a non-APA header', async () => {
    const files = await parts(await createDocxFile([{ id: 'a', html: '<p>Texto</p>' }], { ...DEFAULT_LAYOUT_CONFIG, showHeaderFooter: true, headerHtml: `<p><img src="${uri}" width="30" height="30"> Cabecera</p>` }));
    expect(strFromU8(files['word/header1.xml'])).toContain('<w:drawing>');
    expect(strFromU8(files['word/_rels/header1.xml.rels'])).toContain('Target="media/image1.png"');
    expect(strFromU8(files['word/document.xml'])).toContain('r:id="generalHeader"');
  });

  it('rejoins automatically split paragraphs instead of exporting artificial paragraph breaks', async () => {
    const pages = [{ id: 'a', html: '<p data-word-flow="p">La investigación continúa </p>' }, { id: 'b', html: '<p data-word-flow="p" data-word-continuation="p">en la misma oración.</p>' }];
    const files = await parts(createDocxBlob(pages, layout));
    const doc = xmlPart(files, 'word/document.xml');
    expect(doc.getElementsByTagName('w:p')).toHaveLength(1);
    expect(doc.documentElement.textContent).toBe('La investigación continúa en la misma oración.');
    expect(doc.getElementsByTagName('w:br')).toHaveLength(0);
  });

  it('uses heading bookmarks, dotted leaders and PAGEREF fields for table-of-contents pages', async () => {
    const files = await parts(createDocxBlob([{ id: 'toc', html: '<div class="word-toc-page-section"><div class="word-toc-entry" data-toc-target-id="intro"><span>Introducción</span><span class="word-toc-dots"></span><span class="word-toc-page">2</span></div></div>' }, { id: 'body', html: '<h1 id="intro">Introducción</h1>', breakBefore: 'manual' }], layout));
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).toContain(' PAGEREF target_1 \\h '); expect(doc).toContain('w:leader="dot"'); expect(doc).toContain('<w:bookmarkStart w:id="1" w:name="target_1"/>');
    expect(doc).toContain('<w:hyperlink w:anchor="target_1">');
  });
});

describe('Word fidelity regressions', () => {
  it('exports a flex-based TOC entry as one paragraph without HTML formatting line breaks', async () => {
    const files = await parts(createDocxBlob([{ id:'toc', html: `<div class="word-toc-page-section"><div class="word-toc-header">Índice de contenido</div>
      <div class="word-toc-entry" data-toc-target-id="intro" style="padding-left:14pt;line-height:32px;font-size:12pt">
        <div class="word-toc-title">Introducción</div>
        <div class="word-toc-dots"></div>
        <div class="word-toc-page">11</div>
      </div></div>` }, { id:'body', breakBefore:'manual', html:'<h2 id="intro">Introducción</h2><p>Contenido</p>' }], layout));
    const doc = xmlPart(files, 'word/document.xml');
    const rows = Array.from(doc.getElementsByTagName('w:p')).filter(p => p.getElementsByTagName('w:fldSimple').length);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Introducción'); expect(rows[0].textContent).toContain('11');
    expect(rows[0].getElementsByTagName('w:br')).toHaveLength(0);
    expect(doc.getElementsByTagName('w:instrText')[0].textContent).toContain('TOC \\o "1-5"');
    expect(doc.getElementsByTagName('w:fldChar')).toHaveLength(3);
    expect(strFromU8(files['word/styles.xml'])).toContain('w:styleId="TOC2"');
  });
  it('preserves column proportions, merged-cell widths, compact row metrics and cell padding', async () => {
    const files = await parts(createDocxBlob([{ id:'table', html:'<table><colgroup><col style="width:70%"><col style="width:10%"><col style="width:20%"></colgroup><tbody><tr><td colspan="2" style="padding:2px 6px"><p style="line-height:17.6px;margin:0pt">Integrantes</p></td><td>Registro</td></tr></tbody></table>' }], layout));
    const doc = xmlPart(files,'word/document.xml');
    expect(Array.from(doc.getElementsByTagName('w:gridCol')).map(col => col.getAttribute('w:w'))).toEqual(['6552','936','1872']);
    expect(doc.getElementsByTagName('w:tcW')[0].getAttribute('w:w')).toBe('7488');
    const spacing = doc.getElementsByTagName('w:spacing')[0];
    expect(spacing.getAttribute('w:lineRule')).toBe('exact'); expect(spacing.getAttribute('w:line')).toBe('264');
    expect(doc.getElementsByTagName('w:tblLayout')[0].getAttribute('w:type')).toBe('fixed');
    expect(doc.getElementsByTagName('w:tcMar')[0].getElementsByTagName('w:top')[0].getAttribute('w:w')).toBe('30');
  });
  it('exports empty BR paragraphs as one blank line and manual breaks on the next paragraph', async () => {
    const files = await parts(createDocxBlob([{ id:'first',html:'<p style="line-height:32px"><br></p><p>Texto</p>' }, { id:'next',breakBefore:'manual',html:'<p>Siguiente sección</p>' }],layout));
    const doc = xmlPart(files,'word/document.xml');
    expect(doc.getElementsByTagName('w:p')).toHaveLength(3);
    expect(doc.getElementsByTagName('w:br')).toHaveLength(0);
    expect(doc.getElementsByTagName('w:pageBreakBefore')).toHaveLength(1);
  });
});

describe('continuous TOC pagination in Word',()=>{
  it('removes generated TOC page boundaries and continuation headings, retaining the break before body text',async()=>{
    const entry=(name:string)=>`<div class="word-toc-entry"><span class="word-toc-title">${name}</span><span class="word-toc-dots"></span><span class="word-toc-page">5</span></div>`;
    const files=await parts(createDocxBlob([
      {id:'toc1',html:`<div class="word-toc-page-section" data-word-toc="same"><div class="word-toc-header">Índice</div>${entry('Primero')}</div><p><br></p>`},
      {id:'toc2',breakBefore:'manual',html:`<div class="word-toc-page-section" data-word-toc="same"><div class="word-toc-header">Índice (continuación)</div>${entry('Segundo')}</div><p><br></p>`},
      {id:'body',breakBefore:'manual',html:'<h1>Capítulo</h1>'},
    ],layout));
    const doc=xmlPart(files,'word/document.xml');expect(doc.getElementsByTagName('w:pageBreakBefore')).toHaveLength(1);
    expect(doc.documentElement.textContent).not.toContain('(continuación)');expect(doc.getElementsByTagName('w:keepLines')).toHaveLength(2);
    expect(doc.getElementsByTagName('w:p')).toHaveLength(4);
  });
});

describe('native double spacing after taking a live snapshot',()=>{
  it('exports logical double spacing as auto 480 rather than fixed-height pixels',async()=>{
    const files=await parts(createDocxBlob([{id:'a',html:'<p data-word-line-spacing="2" style="font-size:12pt;line-height:37px">Texto a doble espacio</p>'}],layout));
    const doc=xmlPart(files,'word/document.xml');const spacing=doc.getElementsByTagName('w:spacing')[0];
    expect(spacing.getAttribute('w:line')).toBe('480');expect(spacing.getAttribute('w:lineRule')).toBe('auto');
    const margins=doc.getElementsByTagName('w:pgMar')[0];expect(margins.getAttribute('w:top')).toBe('1440');expect(margins.getAttribute('w:left')).toBe('1440');
  });
});
