import { joinDocxFlowPages } from './docx-flow';
import type { DocumentLayoutConfig, DocumentPage } from '../models/word-document.model';
import { PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';
import { zipDocx, xml, WORD_NS, normalizeDocxProperties } from './docx-package';
import { DocxDocumentWriter, type DocxSectionRelIds } from './docx-document-writer';
import { DocxMedia, embeddedDocxImages, prepareDocxImages, type DocxImage } from './docx-media';
import { runProperties, textRun } from './docx-formatting';
import { groupDocumentSectionSpans } from '../utils/page-section-layout';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const drawingNamespaces = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function styles(writer: DocxDocumentWriter, apa: boolean): string {
  const font = runProperties(writer.style), line = apa ? 480 : 276;
  const headings = Array.from({ length: apa ? 5 : 6 }, (_, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${index+(writer.hasChapters?1:0)}"/><w:jc w:val="${apa && index === 0 && !writer.hasChapters ? 'center' : 'left'}"/><w:ind w:firstLine="${apa && index >= 3 ? 720 : 0}"/><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr><w:rPr>${runProperties({ ...writer.style, bold: true, italic: apa && [2,4].includes(index) })}</w:rPr></w:style>`).join('');
  const tocStyles = Array.from({ length: 6 }, (_, index) => `<w:style w:type="paragraph" w:styleId="TOC${index + 1}"><w:name w:val="toc ${index + 1}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepLines/><w:spacing w:before="${index === 0 ? 80 : 0}" w:after="0" w:line="${apa ? 480 : 312}" w:lineRule="auto"/><w:ind w:left="${index * 360}" w:firstLine="0"/></w:pPr><w:rPr>${runProperties({ ...writer.style, bold: index === 0 })}</w:rPr></w:style>`).join('');
  const noteStyles = ['Footnote','Endnote'].map(kind => `<w:style w:type="character" w:styleId="${kind}Reference"><w:name w:val="${kind} Reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="${kind}Text"><w:name w:val="${kind} Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="${kind === 'Footnote' ? 240 : line}" w:lineRule="auto"/></w:pPr><w:rPr>${runProperties({ ...writer.style, size: kind === 'Footnote' ? Math.max(8,writer.style.size - 2) : writer.style.size })}</w:rPr></w:style>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr>${font}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr><w:rPr>${font}</w:rPr></w:style><w:style w:type="paragraph" w:styleId="WeaveChapter"><w:name w:val="Capítulo"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:jc w:val="center"/></w:pPr><w:rPr>${runProperties({...writer.style,bold:true})}</w:rPr></w:style>${headings}${tocStyles}${noteStyles}<w:style w:type="paragraph" w:styleId="APAEndnotesHeading"><w:name w:val="Notas"/><w:basedOn w:val="Normal"/></w:style></w:styles>`;
}

export function createDocxParts(pages: DocumentPage[], layout: DocumentLayoutConfig, images: DocxImage[]): Record<string, string | Uint8Array> {
  pages = joinDocxFlowPages(pages);
  const preset = PAPER_FORMAT_PRESETS[layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
  const width = (layout.orientation === 'landscape' ? preset.heightPx : preset.widthPx) - layout.margins.leftPx - layout.margins.rightPx;
  const height = (layout.orientation === 'landscape' ? preset.widthPx : preset.heightPx) - layout.margins.topPx - layout.margins.bottomPx;
  const media = new DocxMedia(images, width, height), writer = new DocxDocumentWriter(pages, layout, media);
  const sectionSpans = groupDocumentSectionSpans(pages, layout);
  const sectionRels = new Map<number, DocxSectionRelIds>();
  const customRegionParts: Array<{ partName: string; tag: 'header' | 'footer'; relId: string; html: string }> = [];
  if (!layout.apa && layout.showHeaderFooter) {
    let customHeaderIdx = 2;
    let customFooterIdx = 2;
    for (const span of sectionSpans) {
      const info = span.firstPageInfo;
      const rel: DocxSectionRelIds = {};
      if (info.headerHtml !== layout.headerHtml && info.headerHtml) {
        const partName = `header${customHeaderIdx++}`;
        const relId = `secHeader${span.sectionIndex + 1}`;
        rel.headerRelId = relId;
        customRegionParts.push({ partName, tag: 'header', relId, html: info.headerHtml });
      }
      if (info.footerHtml !== layout.footerHtml && info.footerHtml) {
        const partName = `footer${customFooterIdx++}`;
        const relId = `secFooter${span.sectionIndex + 1}`;
        rel.footerRelId = relId;
        customRegionParts.push({ partName, tag: 'footer', relId, html: info.footerHtml });
      }
      if (rel.headerRelId || rel.footerRelId) sectionRels.set(span.sectionIndex, rel);
    }
  }
  const document = writer.document(sectionRels);
  const files: Record<string, string | Uint8Array> = { ...media.files, 'word/document.xml': document, 'word/numbering.xml': writer.numbering.xml, 'word/styles.xml': styles(writer, !!layout.apa) };
  const overrides = ['document:application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', 'styles:application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', 'numbering:application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', 'settings:application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'];
  const relationships = [`<Relationship Id="styles" Type="${OFFICE_REL}/styles" Target="styles.xml"/>`, `<Relationship Id="numbering" Type="${OFFICE_REL}/numbering" Target="numbering.xml"/>`, `<Relationship Id="settings" Type="${OFFICE_REL}/settings" Target="settings.xml"/>`];
  if (layout.apa) {
    const apa = layout.apa, professional = apa.mode === 'professional';
    const tab = `<w:tabs><w:tab w:val="right" w:pos="${Math.round(width * 15)}"/></w:tabs>`;
    const content = professional ? textRun(apa.runningHead.toLocaleUpperCase().slice(0, 50), writer.style) + '<w:r><w:tab/></w:r>' : '';
    files['word/header1.xml'] = `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${WORD_NS}"><w:p><w:pPr>${professional ? tab : '<w:jc w:val="right"/>'}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${content}<w:fldSimple w:instr=" PAGE ">${textRun('1', writer.style)}</w:fldSimple></w:p></w:hdr>`;
    overrides.push('header1:application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');
    relationships.push(`<Relationship Id="rId3" Type="${OFFICE_REL}/header" Target="header1.xml"/>`);
  }
  const extraRegionPartNames: string[] = [];
  if (!layout.apa && layout.showHeaderFooter) {
    for (const [tag, content, id] of [['header', layout.headerHtml, 'generalHeader'], ['footer', layout.footerHtml, 'generalFooter']] as const) {
      if (!content) continue;
      const root = tag === 'header' ? 'hdr' : 'ftr';
      files[`word/${tag}1.xml`] = `<?xml version="1.0" encoding="UTF-8"?><w:${root} xmlns:w="${WORD_NS}" ${drawingNamespaces}>${writer.fragment(content)}</w:${root}>`;
      overrides.push(`${tag}1:application/vnd.openxmlformats-officedocument.wordprocessingml.${tag}+xml`);
      relationships.push(`<Relationship Id="${id}" Type="${OFFICE_REL}/${tag}" Target="${tag}1.xml"/>`);
      extraRegionPartNames.push(`${tag}1`);
    }
    for (const item of customRegionParts) {
      const root = item.tag === 'header' ? 'hdr' : 'ftr';
      files[`word/${item.partName}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><w:${root} xmlns:w="${WORD_NS}" ${drawingNamespaces}>${writer.fragment(item.html)}</w:${root}>`;
      overrides.push(`${item.partName}:application/vnd.openxmlformats-officedocument.wordprocessingml.${item.tag}+xml`);
      relationships.push(`<Relationship Id="${item.relId}" Type="${OFFICE_REL}/${item.tag}" Target="${item.partName}.xml"/>`);
      extraRegionPartNames.push(item.partName);
    }
  }
  for (const kind of ['footnote', 'endnote'] as const) if (writer.notes.has(kind)) {
    const plural = `${kind}s`;
    files[`word/${plural}.xml`] = writer.notes.part(kind);
    overrides.push(`${plural}:application/vnd.openxmlformats-officedocument.wordprocessingml.${plural}+xml`);
    relationships.push(`<Relationship Id="${plural}" Type="${OFFICE_REL}/${plural}" Target="${plural}.xml"/>`);
  }
  files['word/settings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="${WORD_NS}"><w:autoHyphenation w:val="${layout.hyphenation ? 1 : 0}"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  files['word/_rels/document.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}">${relationships.join('')}${media.relationships}${writer.relationships}</Relationships>`;
  for (const part of extraRegionPartNames) if (!layout.apa && files[`word/${part}.xml`]) files[`word/_rels/${part}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}">${media.relationships}${writer.relationships}</Relationships>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${REL_NS}"><Relationship Id="document" Type="${OFFICE_REL}/officeDocument" Target="word/document.xml"/></Relationships>`;
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${media.contentTypes}${overrides.map(item => { const colon = item.indexOf(':'); return `<Override PartName="/word/${item.slice(0,colon)}.xml" ContentType="${item.slice(colon + 1)}"/>`; }).join('')}</Types>`;
  Object.keys(files).filter(name => name.endsWith('.xml') && typeof files[name] === 'string').forEach(name => files[name] = normalizeDocxProperties(files[name] as string));
  return files;
}
function docxBlob(bytes: Uint8Array): Blob { return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); }
function convertPageSvgsToImages(pages: DocumentPage[]): DocumentPage[] {
  if (typeof document === 'undefined') return pages;
  return pages.map(page => {
    if (!/<svg\b/i.test(page.html)) return page;
    const root = document.createElement('div');
    root.innerHTML = page.html;
    root.querySelectorAll('svg').forEach(svg => {
      const img = document.createElement('img');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      img.alt = svg.getAttribute('aria-label') || 'Ilustración';
      const width = svg.getAttribute('width');
      const height = svg.getAttribute('height');
      if (width) img.setAttribute('width', width);
      if (height) img.setAttribute('height', height);
      if (svg.getAttribute('style')) img.setAttribute('style', svg.getAttribute('style')!);
      svg.replaceWith(img);
    });
    return { ...page, html: root.innerHTML };
  });
}

/** Synchronous builder for prepared assets and structural tests. */
export function createDocxBlob(pages: DocumentPage[], layout: DocumentLayoutConfig, images: DocxImage[] = embeddedDocxImages([...pages, ...(!layout.apa && layout.showHeaderFooter ? [{ id: 'header', html: layout.headerHtml }, { id: 'footer', html: layout.footerHtml }] : [])])): Blob {
  return docxBlob(zipDocx(createDocxParts(pages, layout, images)));
}

/** Browser boundary: resolve local, blob, data and remote images before creating the package. */
export async function createDocxFile(pages: DocumentPage[], layout: DocumentLayoutConfig): Promise<Blob> {
  const headerPages = !layout.apa && layout.showHeaderFooter ? [{ id: 'header', html: layout.headerHtml }, { id: 'footer', html: layout.footerHtml }] : [];
  const prepared = convertPageSvgsToImages([...pages, ...headerPages]);
  const config = headerPages.length ? { ...layout, headerHtml: prepared[pages.length].html, footerHtml: prepared[pages.length + 1].html } : layout;
  const files = createDocxParts(prepared.slice(0, pages.length), config, await prepareDocxImages(prepared));
  const { zipSync, strToU8 } = await import('fflate');
  const archive: import('fflate').Zippable = {};
  Object.entries(files).forEach(([name, value]) => archive[name] = [typeof value === 'string' ? strToU8(value) : value, { level: typeof value === 'string' ? 6 : 0 }]);
  return docxBlob(zipSync(archive));
}
