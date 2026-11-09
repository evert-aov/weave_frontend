import type { DocumentPage } from '../models/word-document.model';
import { xml } from './docx-package';
export interface DocxImage { source: string; bytes: Uint8Array; extension: string; mime: string; width: number; height: number; }

function imageInfo(bytes: Uint8Array): Omit<DocxImage, 'source' | 'bytes'> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG') return { extension: 'png', mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') return { extension: 'gif', mime: 'image/gif', width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 255) { offset++; continue; }
      const marker = bytes[offset + 1]; if (marker === 216 || marker === 217 || marker === 0) { offset += 2; continue; }
      const size = view.getUint16(offset + 2); if (size < 2 || offset + size + 2 > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { extension: 'jpg', mime: 'image/jpeg', width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      offset += size + 2;
    }
  }
  if (bytes.length >= 26 && bytes[0] === 66 && bytes[1] === 77) return { extension: 'bmp', mime: 'image/bmp', width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  return null;
}
function dataImage(source: string): DocxImage | null {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(source); if (!match) return null;
  let bytes: Uint8Array;
  try { bytes = match[2] ? Uint8Array.from(atob(match[3].replace(/\s/g, '')), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3])); } catch { return null; }
  const info = imageInfo(bytes); return info ? { source, bytes, ...info } : null;
}
export function embeddedDocxImages(pages: DocumentPage[]): DocxImage[] {
  const images = new Map<string, DocxImage>();
  for (const page of pages) {
    if (!/<img\b/i.test(page.html)) continue;
    const body = document.createElement('div'); body.innerHTML = page.html;
    body.querySelectorAll('img').forEach(img => { const source = img.getAttribute('src') || ''; const image = dataImage(source); if (image) images.set(source, image); });
  }
  return [...images.values()];
}
async function rasterize(source: string): Promise<DocxImage> {
  const image = new Image(); image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ''; reject(new Error('Tiempo agotado al convertir una imagen para DOCX.')); }, 20000);
    image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo convertir una imagen para DOCX.')); }; image.src = source;
  });
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  if (!canvas.width || !canvas.height || canvas.width * canvas.height > 64000000) throw new Error('Dimensiones de imagen no válidas para exportar.');
  const context = canvas.getContext('2d'); if (!context) throw new Error('No se pudo preparar el lienzo de la imagen.');
  context.drawImage(image, 0, 0); const result = dataImage(canvas.toDataURL('image/png'));
  if (!result) throw new Error('No se pudo generar una imagen PNG para DOCX.'); return result;
}
/** Fetch each asset once. A failed image aborts export instead of silently losing the figure. */
export async function prepareDocxImages(pages: DocumentPage[]): Promise<DocxImage[]> {
  const sources = new Set<string>();
  pages.forEach(page => { if (!/<img\b/i.test(page.html)) return; const root = document.createElement('div'); root.innerHTML = page.html; root.querySelectorAll('img').forEach(img => { const src = img.getAttribute('src'); if (src) sources.add(src); }); });
  const result: DocxImage[] = [];
  // Bounded concurrency avoids memory spikes on documents with many photographs.
  const pending = [...sources];
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (pending.length) {
      const source = pending.shift()!; const embedded = dataImage(source); if (embedded) { result.push(embedded); continue; }
      let blob: Blob;
      if (source.startsWith('data:')) {
        const response = await fetch(source); blob = await response.blob();
      } else {
        const url = new URL(source, document.baseURI);
        if (!['http:', 'https:', 'blob:'].includes(url.protocol)) throw new Error('La imagen tiene una dirección no compatible con DOCX.');
        const response = await fetch(url.href, { credentials: url.origin === location.origin ? 'same-origin' : 'omit', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`No se pudo descargar una imagen (${response.status}).`);
        blob = await response.blob();
      }
      const bytes = new Uint8Array(await blob.arrayBuffer()), info = imageInfo(bytes);
      if (info) { result.push({ source, bytes, ...info }); continue; }
      const url = URL.createObjectURL(blob);
      try { const converted = await rasterize(url); result.push({ ...converted, source }); } finally { URL.revokeObjectURL(url); }
    }
  }));
  return result;
}
export class DocxMedia {
  private readonly assets = new Map<string, { image: DocxImage; id: string; path: string }>();
  private serial = 0;
  constructor(images: DocxImage[], private readonly maxWidth: number, private readonly maxHeight: number) {
    images.forEach((image, index) => this.assets.set(image.source, { image, id: `img${index + 1}`, path: `media/image${index + 1}.${image.extension}` }));
  }
  get files(): Record<string, Uint8Array> { return Object.fromEntries([...this.assets.values()].map(asset => [`word/${asset.path}`, asset.image.bytes])); }
  get relationships(): string { return [...this.assets.values()].map(asset => `<Relationship Id="${asset.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${asset.path}"/>`).join(''); }
  get contentTypes(): string { return [...new Map([...this.assets.values()].map(asset => [asset.image.extension, asset.image.mime]))].map(([extension, mime]) => `<Default Extension="${extension}" ContentType="${mime}"/>`).join(''); }
  drawing(img: HTMLImageElement, widthLimit = this.maxWidth): string {
    const source = img.getAttribute('src') || ''; if (!source) return '';
    const asset = this.assets.get(source); if (!asset) throw new Error('Falta una imagen en el archivo DOCX. Vuelve a intentar la exportación.');
    const dimension = (value: string, fallback: number, limit: number) => {
      const n = parseFloat(value); if (!Number.isFinite(n) || n <= 0) return fallback;
      return value.endsWith('%') ? limit * n / 100 : value.endsWith('pt') ? n * 96 / 72 : value.endsWith('cm') ? n * 96 / 2.54 : value.endsWith('in') ? n * 96 : n;
    };
    const ratio = asset.image.width / asset.image.height || 1;
    const widthValue = img.style.width || img.getAttribute('width') || '', heightValue = img.style.height || img.getAttribute('height') || '';
    let width = dimension(widthValue, asset.image.width || 320, widthLimit), height = dimension(heightValue, width / ratio, this.maxHeight);
    if (!widthValue && heightValue) width = height * ratio;
    const availableHeight = img.dataset['apaCaptioned'] === 'true' ? Math.max(100, this.maxHeight - 90) : this.maxHeight;
    const scale = Math.min(1, widthLimit / width, availableHeight / height); width *= scale; height *= scale;
    const cx = Math.round(width * 9525), cy = Math.round(height * 9525), id = ++this.serial;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagen ${id}" descr="${xml(img.alt || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Imagen ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${asset.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
}
