export const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const xml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index; for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
/** Binary-safe OpenXML ZIP. Keeping it dependency-free preserves the editor's lazy boundary. */
export function zipDocx(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const n = encoder.encode(name), data = typeof value === 'string' ? encoder.encode(value) : value, crc = crc32(data);
    const head = new Uint8Array(30 + n.length), view = new DataView(head.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, n.length, true); head.set(n, 30);
    local.push(head, data);
    const record = new Uint8Array(46 + n.length), cv = new DataView(record.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); record.set(n, 46);
    central.push(record); offset += head.length + data.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer), size = central.reduce((sum, bytes) => sum + bytes.length, 0);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22); let cursor = 0;
  for (const bytes of [...local, ...central, end]) { result.set(bytes, cursor); cursor += bytes.length; }
  return result;
}

const paragraphOrder = ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
const runOrder = ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath','rPrChange'];
const cellOrder = ['cnfStyle','tcW','gridSpan','hMerge','vMerge','tcBorders','shd','noWrap','tcMar','textDirection','tcFitText','vAlign','hideMark','headers','tcPrChange'];
function orderedProperties(body: string, order: string[]): string {
  const children = new Map<string,string>();
  const pattern = /<w:([A-Za-z0-9]+)\b[^>]*\/>|<w:([A-Za-z0-9]+)\b[^>]*>[\s\S]*?<\/w:\2>/g;
  for (const match of body.matchAll(pattern)) children.set(match[1] || match[2], match[0]);
  return [...children].sort(([a],[b]) => (order.indexOf(a) < 0 ? 1000 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 1000 : order.indexOf(b))).map(([,value]) => value).join('');
}
/** OpenXML property sequences are ordered by schema, even when composed in different modules. */
export function normalizeDocxProperties(source: string): string {
  return source.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_, body: string) => `<w:rPr>${orderedProperties(body,runOrder)}</w:rPr>`)
    .replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (_, body: string) => `<w:pPr>${orderedProperties(body,paragraphOrder)}</w:pPr>`)
    .replace(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g, (_, body: string) => `<w:tcPr>${orderedProperties(body,cellOrder)}</w:tcPr>`);
}
