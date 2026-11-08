import { DocumentLayoutConfig, DocumentPage } from '../models/word-document.model';
import { PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function run(text: string, props = ''): string {
  if (!text) return '';
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function inline(node: Node, props = ''): string {
  if (node.nodeType === Node.TEXT_NODE) return run(node.textContent ?? '', props);
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '<w:r><w:br/></w:r>';
  let next = props;
  if (['B', 'STRONG'].includes(node.tagName)) next += '<w:b/>';
  if (['I', 'EM'].includes(node.tagName)) next += '<w:i/>';
  if (node.tagName === 'U' || node.style.textDecoration.includes('underline')) next += '<w:u w:val="single"/>';
  if (['S', 'STRIKE', 'DEL'].includes(node.tagName)) next += '<w:strike/>';
  if (node.tagName === 'SUP') next += '<w:vertAlign w:val="superscript"/>';
  if (node.tagName === 'SUB') next += '<w:vertAlign w:val="subscript"/>';
  const color = node.style.color.match(/#([0-9a-f]{6})/i)?.[1];
  if (color) next += `<w:color w:val="${color}"/>`;
  const size = node.style.fontSize.match(/([\d.]+)(pt|px)/i);
  if (size) next += `<w:sz w:val="${Math.round(Number(size[1]) * (size[2].toLowerCase() === 'px' ? 0.75 : 1) * 2)}"/>`;
  if (node.tagName === 'IMG') return run(node.getAttribute('alt') || '[Imagen]', props);
  if (node.tagName === 'SVG') return run('[Icono]', props);
  return Array.from(node.childNodes).map(child => inline(child, next)).join('');
}

function paragraph(element: HTMLElement, textPrefix = ''): string {
  const heading = /^H([1-6])$/.exec(element.tagName);
  const pPr = heading ? `<w:pStyle w:val="Heading${heading[1]}"/>` : '';
  const content = textPrefix + Array.from(element.childNodes).map(node => inline(node)).join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content || '<w:r><w:t></w:t></w:r>'}</w:p>`;
}

function cellBlocks(cell: HTMLElement): string {
  const blocks = Array.from(cell.children).filter(child => /^(P|DIV|H[1-6]|UL|OL|TABLE)$/.test(child.tagName));
  if (!blocks.length) return paragraph(cell);
  return blocks.map(child => child.tagName === 'TABLE'
    ? table(child as HTMLTableElement)
    : child.tagName === 'UL' || child.tagName === 'OL'
      ? Array.from(child.querySelectorAll<HTMLElement>(':scope > li')).map(li => paragraph(li, '• ')).join('')
      : paragraph(child as HTMLElement)).join('') || paragraph(cell);
}

function table(element: HTMLTableElement): string {
  const rows = Array.from(element.rows);
  const cols = Math.max(1, ...rows.map(row => row.cells.length));
  const grid = Array.from({ length: cols }, () => '<w:gridCol w:w="1800"/>').join('');
  const borders = ['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');
  const body = rows.map(row => `<w:tr>${Array.from(row.cells).map(cell => `<w:tc><w:tcPr><w:tcW w:w="1800" w:type="auto"/></w:tcPr>${cellBlocks(cell)}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function blocks(element: HTMLElement): string {
  if (element.tagName === 'TABLE') return table(element as HTMLTableElement);
  if (element.tagName === 'UL' || element.tagName === 'OL') {
    return Array.from(element.querySelectorAll<HTMLElement>(':scope > li')).map((li, index) => paragraph(li, element.tagName === 'OL' ? `${index + 1}. ` : '• ')).join('');
  }
  if (element.tagName === 'DIV' && !element.matches('[contenteditable="false"]')) {
    const children = Array.from(element.children).filter(child => /^(P|DIV|H[1-6]|UL|OL|TABLE)$/.test(child.tagName));
    if (children.length) return children.map(child => blocks(child as HTMLElement)).join('');
  }
  return paragraph(element);
}

function documentXml(pages: DocumentPage[], layout: DocumentLayoutConfig): string {
  const content = pages.map((page, index) => {
    const parsed = new DOMParser().parseFromString(`<body>${page.html}</body>`, 'text/html');
    const body = Array.from(parsed.body.childNodes).map(node => {
      if (node instanceof HTMLElement && /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(node.tagName)) return blocks(node);
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return `<w:p>${inline(node)}</w:p>`;
      return '';
    }).join('');
    return (index ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + body;
  }).join('');
  const preset = PAPER_FORMAT_PRESETS[layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
  const widthCm = layout.orientation === 'landscape' ? preset.heightCm : preset.widthCm;
  const heightCm = layout.orientation === 'landscape' ? preset.widthCm : preset.heightCm;
  const width = Math.round(widthCm * 567);
  const height = Math.round(heightCm * 567);
  const margin = (px: number) => Math.round(px / 96 * 1440);
  const orient = layout.orientation === 'landscape' ? ' w:orient="landscape"' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${content}<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${orient}/><w:pgMar w:top="${margin(layout.margins.topPx)}" w:right="${margin(layout.margins.rightPx)}" w:bottom="${margin(layout.margins.bottomPx)}" w:left="${margin(layout.margins.leftPx)}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a small uncompressed ZIP package, sufficient for the OpenXML DOCX parts. */
function zipStore(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const nameBytes = encoder.encode(name), data = encoder.encode(value), crc = crc32(data);
    const head = new Uint8Array(30 + nameBytes.length), view = new DataView(head.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true); view.setUint16(8, 0, true);
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, nameBytes.length, true);
    head.set(nameBytes, 30); local.push(head, data);
    const record = new Uint8Array(46 + nameBytes.length), cv = new DataView(record.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    record.set(nameBytes, 46); central.push(record); offset += head.length + data.length;
  }
  const centralBytes = central.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, central.length, true); endView.setUint16(10, central.length, true);
  endView.setUint32(12, centralBytes, true); endView.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralBytes + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}

export function createDocxBlob(pages: DocumentPage[], layout: DocumentLayoutConfig): Blob {
  const contentTypes = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr></w:style>${Array.from({ length: 6 }, (_, i) => `<w:style w:type="paragraph" w:styleId="Heading${i + 1}"><w:name w:val="heading ${i + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${32 - i * 2}"/></w:rPr></w:style>`).join('')}</w:styles>`;
  const parts = zipStore({ '[Content_Types].xml': contentTypes, '_rels/.rels': rels, 'word/document.xml': documentXml(pages, layout), 'word/_rels/document.xml.rels': docRels, 'word/styles.xml': styles });
  const bytes = parts.buffer.slice(parts.byteOffset, parts.byteOffset + parts.byteLength) as ArrayBuffer;
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
