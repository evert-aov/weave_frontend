import { Injectable } from '@angular/core';
import {
  DocxDocumentProperties,
  DocumentLayoutConfig,
  DocumentPage,
  HeadingItem,
  PageBorderConfig,
  PageBorderStyle,
  PageMarginsConfig,
  PageOrientation,
  PaperFormatId,
} from '../models/word-document.model';
import { DEFAULT_LAYOUT_CONFIG, PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';

interface ZipEntry {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const activeMediaBlobUrls: string[] = [];
const blobUrlToBlobMap = new Map<string, Blob>();







interface StyleDefinition {
  id: string;
  name: string;
  basedOn?: string;
  headingLevel?: number; // 1..6
  tocLevel?: number; // 1..6 if style is TOC 1..6 / TDC 1..6 / Tabla de contenido
  isTocHeading?: boolean;
  numId?: string;
  ilvl?: number;
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: string;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineHeightMultiple?: number;
  firstLineIndentPt?: number;
  leftIndentPt?: number;
}














interface NumberingLevelDef {
  ilvl: number;
  start: number;
  numFmt: string;
  lvlText: string;
  pStyle?: string;
}

interface NumberingEngine {
  getListType: (numId: string, ilvl: number) => 'ol' | 'ul';
  isMultiLevelOutline: (numId: string, ilvl: number) => boolean;
  getLinkedHeadingLevelForStyle: (styleId: string) => { numId: string; ilvl: number } | undefined;
  formatNextNumberPrefix: (numId: string, ilvl: number) => string;
}








@Injectable({ providedIn: 'root' })
export class DocxParserService {
  revokePreviousDocxMediaUrls(): void {
    while (activeMediaBlobUrls.length > 0) {
      const url = activeMediaBlobUrls.pop();
      if (url) {
        URL.revokeObjectURL(url);
        blobUrlToBlobMap.delete(url);
      }
    }
  }
  async convertBlobUrlsInHtmlToBase64(html: string): Promise<string> {
    if (!html.includes('blob:')) return html;
    let updated = html;
    for (const [blobUrl, blob] of blobUrlToBlobMap.entries()) {
      if (updated.includes(blobUrl)) {
        const b64 = await this.blobToDataUrl(blob);
        updated = updated.split(blobUrl).join(b64);
      }
    }
    return updated;
  }
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  private async inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Tu navegador no soporta DecompressionStream para descomprimir archivos .docx');
    }
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressed as BufferSource);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }

    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
  private getMimeTypeFromFilename(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    return 'image/png';
  }
  private async extractDocxArchiveContents(buffer: ArrayBuffer): Promise<{
    xmlFiles: Record<string, string>;
    mediaBlobUrls: Record<string, string>;
  }> {
    this.revokePreviousDocxMediaUrls();

    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let eocdOffset = -1;
    const minEocdOffset = Math.max(0, buffer.byteLength - 65557);
    for (let i = buffer.byteLength - 22; i >= minEocdOffset; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('El archivo no es un paquete .docx (OpenXML ZIP) válido.');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);

    const entries: ZipEntry[] = [];
    let ptr = centralDirOffset;
    const decoder = new TextDecoder('utf-8');

    for (let i = 0; i < totalEntries; i++) {
      if (ptr + 46 > buffer.byteLength || view.getUint32(ptr, true) !== 0x02014b50) {
        break;
      }
      const compressionMethod = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const uncompressedSize = view.getUint32(ptr + 24, true);
      const fileNameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);

      const filename = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
      entries.push({
        filename,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });

      ptr += 46 + fileNameLen + extraLen + commentLen;
    }

    const xmlFiles: Record<string, string> = {};
    const mediaBlobUrls: Record<string, string> = {};

    const isXmlTarget = (name: string) =>
      name === 'word/document.xml' ||
      name === 'word/styles.xml' ||
      name === 'word/numbering.xml' ||
      name === 'word/fontTable.xml' ||
      name === 'word/_rels/document.xml.rels' ||
      name === 'docProps/app.xml' ||
      name === 'docProps/core.xml' ||
      /^word\/theme\/theme\d*\.xml$/i.test(name) ||
      /^word\/header\d*\.xml$/i.test(name) ||
      /^word\/footer\d*\.xml$/i.test(name);

    const isRenderableMediaTarget = (name: string) =>
      /^word\/media\/.+\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);

    for (const entry of entries) {
      const wantXml = isXmlTarget(entry.filename);
      const wantMedia = isRenderableMediaTarget(entry.filename);
      if (!wantXml && !wantMedia) continue;

      const localOffset = entry.localHeaderOffset;
      if (view.getUint32(localOffset, true) !== 0x04034b50) continue;

      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressedData = bytes.subarray(dataStart, dataStart + entry.compressedSize);

      let rawBytes: Uint8Array | null = null;
      if (entry.compressionMethod === 0) {
        rawBytes = compressedData;
      } else if (entry.compressionMethod === 8) {
        rawBytes = await this.inflateRawBytes(compressedData);
      }

      if (!rawBytes) continue;

      if (wantXml) {
        xmlFiles[entry.filename] = decoder.decode(rawBytes);
      } else if (wantMedia) {
        const mime = this.getMimeTypeFromFilename(entry.filename);
        const blob = new Blob([rawBytes as unknown as BlobPart], { type: mime });
        const objectUrl = URL.createObjectURL(blob);
        activeMediaBlobUrls.push(objectUrl);
        blobUrlToBlobMap.set(objectUrl, blob);
        mediaBlobUrls[entry.filename] = objectUrl;
      }
    }

    return { xmlFiles, mediaBlobUrls };
  }
  private findDirectChild(parent: Element | null, localName: string): Element | null {
    if (!parent) return null;
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].localName === localName) {
        return children[i];
      }
    }
    return null;
  }
  private findDirectChildren(parent: Element | null, localName: string): Element[] {
    const result: Element[] = [];
    if (!parent) return result;
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].localName === localName) {
        result.push(children[i]);
      }
    }
    return result;
  }
  private findFirstDescendant(parent: Element | Document | null, localName: string): Element | null {
    if (!parent) return null;
    const children = parent.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.localName === localName) return child;
      const found = this.findFirstDescendant(child, localName);
      if (found) return found;
    }
    return null;
  }
  private findAllDescendants(parent: Element | Document | null, localName: string): Element[] {
    const results: Element[] = [];
    if (!parent) return results;
    const walk = (node: Element | Document) => {
      const ch = node.children;
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        if (c.localName === localName) {
          results.push(c);
        }
        walk(c);
      }
    };
    walk(parent);
    return results;
  }
  private getAttrByLocalName(el: Element | null, localName: string): string | null {
    if (!el) return null;
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].localName === localName) {
        return attrs[i].value;
      }
    }
    return null;
  }
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  private matchPaperFormatFromTwips(
    rawWTwips: number,
    rawHTwips: number,
    orientAttr: string | null
  ): {
    formatId: PaperFormatId;
    orientation: PageOrientation;
    widthPx: number;
    heightPx: number;
    label: string;
  } {
    const isLandscape = orientAttr === 'landscape' || rawWTwips > rawHTwips;
    const normW = Math.min(rawWTwips, rawHTwips);
    const normH = Math.max(rawWTwips, rawHTwips);

    const candidates: PaperFormatId[] = [
      'letter',
      'oficio',
      'legal',
      'a4',
      'executive',
      'a5',
      'b5',
      'a3',
      'tabloid',
    ];

    let bestId: PaperFormatId = 'custom';
    let minDiff = Infinity;

    for (const id of candidates) {
      const preset = PAPER_FORMAT_PRESETS[id];
      const diff = Math.abs(preset.widthTwips - normW) + Math.abs(preset.heightTwips - normH);
      if (diff < minDiff && diff <= 460) {
        minDiff = diff;
        bestId = id;
      }
    }

    const wCm = ((rawWTwips / 1440) * 2.54).toFixed(2);
    const hCm = ((rawHTwips / 1440) * 2.54).toFixed(2);
    const widthPx = Math.round(rawWTwips / 15);
    const heightPx = Math.round(rawHTwips / 15);

    if (bestId !== 'custom') {
      const preset = PAPER_FORMAT_PRESETS[bestId];
      return {
        formatId: bestId,
        orientation: isLandscape ? 'landscape' : 'portrait',
        widthPx: isLandscape ? preset.heightPx : preset.widthPx,
        heightPx: isLandscape ? preset.widthPx : preset.heightPx,
        label: `${preset.name} (${wCm} × ${hCm} cm · ${isLandscape ? 'Horizontal' : 'Vertical'})`,
      };
    }

    return {
      formatId: 'custom',
      orientation: isLandscape ? 'landscape' : 'portrait',
      widthPx: Math.max(480, Math.min(1650, widthPx)),
      heightPx: Math.max(600, Math.min(2000, heightPx)),
      label: `Personalizado (${wCm} × ${hCm} cm · ${isLandscape ? 'Horizontal' : 'Vertical'})`,
    };
  }
  private extractPageMarginsFromSectPr(sectPrEl: Element | null): PageMarginsConfig {
    const pgMarEl = this.findDirectChild(sectPrEl, 'pgMar');
    if (!pgMarEl) {
      return DEFAULT_LAYOUT_CONFIG.margins;
    }

    const topTwips = Number(this.getAttrByLocalName(pgMarEl, 'top') || 1440);
    const rightTwips = Number(this.getAttrByLocalName(pgMarEl, 'right') || 1440);
    const bottomTwips = Number(this.getAttrByLocalName(pgMarEl, 'bottom') || 1440);
    const leftTwips = Number(this.getAttrByLocalName(pgMarEl, 'left') || 1440);

    const toPx = (tw: number) => Math.max(24, Math.min(140, Math.round(tw / 15)));
    const topCm = ((Math.abs(topTwips) / 1440) * 2.54).toFixed(1);
    const leftCm = ((Math.abs(leftTwips) / 1440) * 2.54).toFixed(1);

    return {
      topPx: toPx(Math.abs(topTwips)),
      rightPx: toPx(Math.abs(rightTwips)),
      bottomPx: toPx(Math.abs(bottomTwips)),
      leftPx: toPx(Math.abs(leftTwips)),
      label: `Detectado .docx (Sup: ${topCm}cm, Izq: ${leftCm}cm)`,
    };
  }
  private extractPageBordersFromSectPr(sectPrEl: Element | null): PageBorderConfig {
    const pgBordersEl = this.findDirectChild(sectPrEl, 'pgBorders');
    if (!pgBordersEl) {
      return DEFAULT_LAYOUT_CONFIG.pageBorder;
    }

    const topEl = this.findDirectChild(pgBordersEl, 'top');
    const bottomEl = this.findDirectChild(pgBordersEl, 'bottom');
    const leftEl = this.findDirectChild(pgBordersEl, 'left');
    const rightEl = this.findDirectChild(pgBordersEl, 'right');

    const activeSides = [topEl, bottomEl, leftEl, rightEl].filter((el) => {
      const val = this.getAttrByLocalName(el, 'val');
      return el && val && val !== 'none' && val !== 'nil';
    });

    if (activeSides.length === 0) {
      return DEFAULT_LAYOUT_CONFIG.pageBorder;
    }

    const sampleSide = activeSides[0]!;
    const rawVal = (this.getAttrByLocalName(sampleSide, 'val') || 'single').toLowerCase();
    const rawSz = Number(this.getAttrByLocalName(sampleSide, 'sz') || 8);
    const rawColor = this.getAttrByLocalName(sampleSide, 'color') || '334155';

    let style: PageBorderStyle = 'solid';
    if (rawVal.includes('double') || rawVal.includes('triple')) style = 'double';
    else if (rawVal.includes('dash')) style = 'dashed';
    else if (rawVal.includes('dot')) style = 'dotted';
    else if (rawVal.includes('thick')) style = 'thick';

    const widthPt = Math.max(1, Math.min(8, Math.round(rawSz / 8)));
    const color =
      rawColor !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(rawColor) ? `#${rawColor}` : '#1e293b';

    const hasSide = (el: Element | null) => {
      const v = this.getAttrByLocalName(el, 'val');
      return Boolean(el && v && v !== 'none' && v !== 'nil');
    };

    return {
      style,
      color,
      widthPt,
      offsetPx: 18,
      top: hasSide(topEl),
      bottom: hasSide(bottomEl),
      left: hasSide(leftEl),
      right: hasSide(rightEl),
    };
  }
  private parseHeaderOrFooterXml(xmlString?: string): string {
    if (!xmlString) return '';
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    const root = xmlDoc.documentElement;
    if (!root) return '';
    const pNodes = this.findAllDescendants(root, 'p');
    const fragments: string[] = [];

    for (const p of pNodes) {
      let visibleText = '';
      const tNodes = this.findAllDescendants(p, 't');
      for (const t of tNodes) {
        visibleText += t.textContent || '';
      }
      const text = visibleText.trim();
      if (!text || /^\d+$/.test(text)) continue;

      const pPr = this.findDirectChild(p, 'pPr');
      const jcEl = this.findDirectChild(pPr, 'jc');
      const jcVal = this.getAttrByLocalName(jcEl, 'val');
      let align = 'left';
      if (jcVal === 'center') align = 'center';
      else if (jcVal === 'right' || jcVal === 'end') align = 'right';

      fragments.push(
        `<div style="text-align: ${align}; color: #475569; font-size: 9.5pt;">${this.escapeHtml(text)}</div>`
      );
    }

    return fragments.join('');
  }
  private extractSpacingAndIndentationFromPPr(pPr: Element | null): {
    spaceBeforePt?: number;
    spaceAfterPt?: number;
    lineHeightCss?: string;
    firstLineIndentPt?: number;
    leftIndentPt?: number;
    rightIndentPt?: number;
    align?: string;
    hasDotLeaderTab?: boolean;
    tabPositionsPt?: number[];
  } {
    if (!pPr) return {};

    let spaceBeforePt: number | undefined;
    let spaceAfterPt: number | undefined;
    let lineHeightCss: string | undefined;
    let firstLineIndentPt: number | undefined;
    let leftIndentPt: number | undefined;
    let rightIndentPt: number | undefined;
    let align: string | undefined;
    let hasDotLeaderTab = false;
    const tabPositionsPt: number[] = [];

    const jcEl = this.findDirectChild(pPr, 'jc');
    const jcVal = this.getAttrByLocalName(jcEl, 'val');
    if (jcVal === 'center') align = 'center';
    else if (jcVal === 'right' || jcVal === 'end') align = 'right';
    else if (jcVal === 'both' || jcVal === 'distribute') align = 'justify';
    else if (jcVal === 'left' || jcVal === 'start') align = 'left';

    const tabsEl = this.findDirectChild(pPr, 'tabs');
    if (tabsEl) {
      const tabList = this.findDirectChildren(tabsEl, 'tab');
      for (const tb of tabList) {
        const leader = this.getAttrByLocalName(tb, 'leader');
        if (leader === 'dot' || leader === 'hyphen' || leader === 'underscore') {
          hasDotLeaderTab = true;
        }
        const posVal = Number(this.getAttrByLocalName(tb, 'pos') || 0);
        if (posVal > 0) {
          tabPositionsPt.push(Math.round(posVal / 20));
        }
      }
    }

    const spacingEl = this.findDirectChild(pPr, 'spacing');
    if (spacingEl) {
      const beforeVal = this.getAttrByLocalName(spacingEl, 'before');
      if (beforeVal && !isNaN(Number(beforeVal))) {
        spaceBeforePt = Math.round((Number(beforeVal) / 20) * 10) / 10;
      }
      const afterVal = this.getAttrByLocalName(spacingEl, 'after');
      if (afterVal && !isNaN(Number(afterVal))) {
        spaceAfterPt = Math.round((Number(afterVal) / 20) * 10) / 10;
      }
      const lineVal = this.getAttrByLocalName(spacingEl, 'line');
      const lineRule = this.getAttrByLocalName(spacingEl, 'lineRule') || 'auto';
      if (lineVal && !isNaN(Number(lineVal)) && Number(lineVal) > 0) {
        const num = Number(lineVal);
        if (lineRule === 'exact' || lineRule === 'atLeast') {
          const pt = Math.round((num / 20) * 10) / 10;
          lineHeightCss = `${pt}pt`;
        } else {
          const mult = Math.max(1, Math.min(3.5, Math.round((num / 240) * 100) / 100));
          lineHeightCss = String(mult);
        }
      }
    }

    const indEl = this.findDirectChild(pPr, 'ind');
    if (indEl) {
      const firstLine = this.getAttrByLocalName(indEl, 'firstLine');
      const hanging = this.getAttrByLocalName(indEl, 'hanging');
      const left = this.getAttrByLocalName(indEl, 'left') || this.getAttrByLocalName(indEl, 'start');
      const right = this.getAttrByLocalName(indEl, 'right') || this.getAttrByLocalName(indEl, 'end');

      if (firstLine && !isNaN(Number(firstLine))) {
        firstLineIndentPt = Math.round((Number(firstLine) / 20) * 10) / 10;
      } else if (hanging && !isNaN(Number(hanging))) {
        firstLineIndentPt = -Math.round((Number(hanging) / 20) * 10) / 10;
      }
      if (left && !isNaN(Number(left))) {
        leftIndentPt = Math.round((Number(left) / 20) * 10) / 10;
      }
      if (right && !isNaN(Number(right))) {
        rightIndentPt = Math.round((Number(right) / 20) * 10) / 10;
      }
    }

    return {
      spaceBeforePt,
      spaceAfterPt,
      lineHeightCss,
      firstLineIndentPt,
      leftIndentPt,
      rightIndentPt,
      align,
      hasDotLeaderTab,
      tabPositionsPt: tabPositionsPt.length > 0 ? tabPositionsPt : undefined,
    };
  }
  private isSdtTableOfContents(sdtEl: Element): boolean {
    const sdtPr = this.findDirectChild(sdtEl, 'sdtPr');
    if (!sdtPr) return false;
    const docPartObj = this.findDirectChild(sdtPr, 'docPartObj');
    if (docPartObj) {
      const gallery = this.findDirectChild(docPartObj, 'docPartGallery');
      const galVal = (this.getAttrByLocalName(gallery, 'val') || '').toLowerCase();
      if (
        galVal.includes('table of contents') ||
        galVal.includes('tabla de contenido') ||
        galVal.includes('toc')
      ) {
        return true;
      }
    }
    return false;
  }
  private parseThemeFonts(themeXmlStr?: string): { majorFont: string; minorFont: string } {
    let majorFont = 'Calibri Light';
    let minorFont = 'Calibri';
    if (!themeXmlStr) return { majorFont, minorFont };

    const parser = new DOMParser();
    const xml = parser.parseFromString(themeXmlStr, 'application/xml');
    const fontScheme = this.findFirstDescendant(xml, 'fontScheme');
    if (!fontScheme) return { majorFont, minorFont };

    const majorEl = this.findDirectChild(fontScheme, 'majorFont');
    const minorEl = this.findDirectChild(fontScheme, 'minorFont');

    const majorLatin = this.findDirectChild(majorEl, 'latin');
    const minorLatin = this.findDirectChild(minorEl, 'latin');

    const mjTypeface = this.getAttrByLocalName(majorLatin, 'typeface');
    const mnTypeface = this.getAttrByLocalName(minorLatin, 'typeface');

    if (mjTypeface) majorFont = mjTypeface;
    if (mnTypeface) minorFont = mnTypeface;

    return { majorFont, minorFont };
  }
  private toRoman(num: number, upper: boolean): string {
    const lookup: [number, string][] = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let res = '';
    let n = Math.max(1, num);
    for (const [val, sym] of lookup) {
      while (n >= val) {
        res += sym;
        n -= val;
      }
    }
    return upper ? res : res.toLowerCase();
  }
  private toLetter(num: number, upper: boolean): string {
    const code = ((Math.max(1, num) - 1) % 26) + 65;
    const ch = String.fromCharCode(code);
    return upper ? ch : ch.toLowerCase();
  }
  private formatCounterValue(val: number, numFmt: string): string {
    switch (numFmt) {
      case 'upperRoman':
        return this.toRoman(val, true);
      case 'lowerRoman':
        return this.toRoman(val, false);
      case 'upperLetter':
        return this.toLetter(val, true);
      case 'lowerLetter':
        return this.toLetter(val, false);
      default:
        return String(val);
    }
  }
  private createNumberingEngine(numberingXmlStr?: string): NumberingEngine {
    const abstractLevelsMap: Record<string, Record<number, NumberingLevelDef>> = {};
    const numIdToAbstractId: Record<string, string> = {};
    const styleToNumAndIlvl: Record<string, { numId: string; ilvl: number }> = {};
    const countersByAbstractId: Record<string, number[]> = {};

    if (numberingXmlStr) {
      const parser = new DOMParser();
      const xml = parser.parseFromString(numberingXmlStr, 'application/xml');
      const root = xml.documentElement;
      if (root) {
        const abstractNums = this.findDirectChildren(root, 'abstractNum');
        for (const abs of abstractNums) {
          const absId = this.getAttrByLocalName(abs, 'abstractNumId');
          if (!absId) continue;
          abstractLevelsMap[absId] = {};

          const lvls = this.findDirectChildren(abs, 'lvl');
          for (const lvl of lvls) {
            const ilvl = Number(this.getAttrByLocalName(lvl, 'ilvl') || 0);
            const startEl = this.findDirectChild(lvl, 'start');
            const start = Number(this.getAttrByLocalName(startEl, 'start') || this.getAttrByLocalName(startEl, 'val') || 1);
            const numFmtEl = this.findDirectChild(lvl, 'numFmt');
            const numFmt = this.getAttrByLocalName(numFmtEl, 'val') || 'decimal';
            const lvlTextEl = this.findDirectChild(lvl, 'lvlText');
            const lvlText = this.getAttrByLocalName(lvlTextEl, 'val') || `%${ilvl + 1}.`;
            const pStyleEl = this.findDirectChild(lvl, 'pStyle');
            const pStyle = this.getAttrByLocalName(pStyleEl, 'val') || undefined;

            abstractLevelsMap[absId][ilvl] = {
              ilvl,
              start: isNaN(start) ? 1 : start,
              numFmt,
              lvlText,
              pStyle,
            };
          }
        }

        const nums = this.findDirectChildren(root, 'num');
        for (const num of nums) {
          const numId = this.getAttrByLocalName(num, 'numId');
          const absIdEl = this.findDirectChild(num, 'abstractNumId');
          const absId = this.getAttrByLocalName(absIdEl, 'val');
          if (numId && absId && abstractLevelsMap[absId]) {
            numIdToAbstractId[numId] = absId;
            const levels = abstractLevelsMap[absId];
            Object.values(levels).forEach((lvlDef) => {
              if (lvlDef.pStyle && !styleToNumAndIlvl[lvlDef.pStyle]) {
                styleToNumAndIlvl[lvlDef.pStyle] = { numId, ilvl: lvlDef.ilvl };
              }
            });
          }
        }
      }
    }

    const getLevelDef = (numId: string, ilvl: number): NumberingLevelDef | undefined => {
      const absId = numIdToAbstractId[numId];
      if (!absId || !abstractLevelsMap[absId]) return undefined;
      return abstractLevelsMap[absId][ilvl] || abstractLevelsMap[absId][0];
    };

    return {
      getListType: (numId: string, ilvl: number) => {
        const def = getLevelDef(numId, ilvl);
        if (!def) return 'ul';
        const fmt = def.numFmt.toLowerCase();
        return fmt === 'bullet' || fmt === 'none' ? 'ul' : 'ol';
      },
      isMultiLevelOutline: (numId: string, ilvl: number) => {
        const def = getLevelDef(numId, ilvl);
        if (!def) return false;
        if (def.numFmt === 'bullet' || def.numFmt === 'none') return false;
        if (def.pStyle) return true;
        if (def.lvlText.includes('%1.%2') || def.lvlText.includes('%2')) return true;
        const absId = numIdToAbstractId[numId];
        const lvl1Def = absId ? abstractLevelsMap[absId]?.[1] : undefined;
        if (lvl1Def && lvl1Def.lvlText.includes('%1')) return true;
        return false;
      },
      getLinkedHeadingLevelForStyle: (styleId: string) => {
        return styleToNumAndIlvl[styleId];
      },
      formatNextNumberPrefix: (numId: string, ilvl: number) => {
        const absId = numIdToAbstractId[numId] || numId;
        const levels = abstractLevelsMap[absId];
        if (!levels) return '';

        if (!countersByAbstractId[absId]) {
          countersByAbstractId[absId] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
        const counters = countersByAbstractId[absId];
        const clampedIlvl = Math.max(0, Math.min(8, ilvl));

        const currentDef = levels[clampedIlvl];
        if (counters[clampedIlvl] === 0) {
          counters[clampedIlvl] = currentDef ? currentDef.start : 1;
        } else {
          counters[clampedIlvl]++;
        }

        for (let k = clampedIlvl + 1; k < 9; k++) {
          counters[k] = 0;
        }

        for (let k = 0; k < clampedIlvl; k++) {
          if (counters[k] === 0) {
            counters[k] = levels[k]?.start ?? 1;
          }
        }

        if (!currentDef || currentDef.numFmt === 'bullet' || currentDef.numFmt === 'none') {
          return '';
        }

        let formatted = currentDef.lvlText || `%${clampedIlvl + 1}.`;
        for (let k = 0; k <= clampedIlvl; k++) {
          const lvlFmt = levels[k]?.numFmt || 'decimal';
          const strVal = this.formatCounterValue(counters[k], lvlFmt);
          formatted = formatted.replace(new RegExp(`%${k + 1}`, 'g'), strVal);
        }

        return formatted.trim();
      },
    };
  }
  private extractFontFromRFonts(
    rFonts: Element | null,
    themeFonts: { majorFont: string; minorFont: string }
  ): string | undefined {
    if (!rFonts) return undefined;
    const direct =
      this.getAttrByLocalName(rFonts, 'ascii') ||
      this.getAttrByLocalName(rFonts, 'hAnsi') ||
      this.getAttrByLocalName(rFonts, 'cs') ||
      this.getAttrByLocalName(rFonts, 'eastAsia');

    if (direct) {
      if (direct.startsWith('+mj')) return themeFonts.majorFont;
      if (direct.startsWith('+mn')) return themeFonts.minorFont;
      return direct;
    }

    const themeAttr =
      this.getAttrByLocalName(rFonts, 'asciiTheme') ||
      this.getAttrByLocalName(rFonts, 'hAnsiTheme') ||
      this.getAttrByLocalName(rFonts, 'cstheme');

    if (themeAttr) {
      if (themeAttr.toLowerCase().includes('major')) return themeFonts.majorFont;
      if (themeAttr.toLowerCase().includes('minor')) return themeFonts.minorFont;
    }

    return undefined;
  }
  async parseDocxFile(file: File): Promise<{
    title: string;
    pages: DocumentPage[];
    properties: DocxDocumentProperties;
    detectedLayout: DocumentLayoutConfig;
    extractedTocHeadings: HeadingItem[];
  }> {
    const buffer = await file.arrayBuffer();
    const { xmlFiles, mediaBlobUrls } = await this.extractDocxArchiveContents(buffer);

    const documentXmlStr = xmlFiles['word/document.xml'];
    if (!documentXmlStr) {
      throw new Error('No se encontró word/document.xml dentro del archivo .docx');
    }

    const parser = new DOMParser();
    const docXml = parser.parseFromString(documentXmlStr, 'application/xml');
    const stylesXml = xmlFiles['word/styles.xml']
      ? parser.parseFromString(xmlFiles['word/styles.xml'], 'application/xml')
      : null;
    const relsXml = xmlFiles['word/_rels/document.xml.rels']
      ? parser.parseFromString(xmlFiles['word/_rels/document.xml.rels'], 'application/xml')
      : null;
    const appXml = xmlFiles['docProps/app.xml']
      ? parser.parseFromString(xmlFiles['docProps/app.xml'], 'application/xml')
      : null;
    const coreXml = xmlFiles['docProps/core.xml']
      ? parser.parseFromString(xmlFiles['docProps/core.xml'], 'application/xml')
      : null;

    const themeXmlKey = Object.keys(xmlFiles).find((k) => /^word\/theme\/theme\d*\.xml$/i.test(k));
    const themeFonts = this.parseThemeFonts(themeXmlKey ? xmlFiles[themeXmlKey] : undefined);
    const numberingEngine = this.createNumberingEngine(xmlFiles['word/numbering.xml']);

    const baseFileName = file.name.replace(/\.[^/.]+$/, '');

    const relIdToBlobUrl: Record<string, string> = {};
    if (relsXml && relsXml.documentElement) {
      const relNodes = this.findDirectChildren(relsXml.documentElement, 'Relationship');
      for (const rel of relNodes) {
        const id = this.getAttrByLocalName(rel, 'Id');
        const target = this.getAttrByLocalName(rel, 'Target');
        if (!id || !target) continue;
        const cleanTarget = target.replace(/^\/?word\//i, '').replace(/^\.\.\//, '');
        const fullMediaKey = `word/${cleanTarget}`;
        if (mediaBlobUrls[fullMediaKey]) {
          relIdToBlobUrl[id] = mediaBlobUrls[fullMediaKey];
        }
      }
    }

    // 1. Extract core & app metadata
    const coreRoot = coreXml?.documentElement || null;
    const appRoot = appXml?.documentElement || null;
    const coreTitle = this.findFirstDescendant(coreRoot, 'title')?.textContent?.trim();
    const author = this.findFirstDescendant(coreRoot, 'creator')?.textContent?.trim();
    const lastModifiedBy = this.findFirstDescendant(coreRoot, 'lastModifiedBy')?.textContent?.trim();
    const created = this.findFirstDescendant(coreRoot, 'created')?.textContent?.trim();
    const modified = this.findFirstDescendant(coreRoot, 'modified')?.textContent?.trim();
    const application = this.findFirstDescendant(appRoot, 'Application')?.textContent?.trim();
    const appWordsRaw = this.findFirstDescendant(appRoot, 'Words')?.textContent?.trim();

    // 2. Parse word/styles.xml for defaults, Normal style spacing, Heading 1..6, TOC 1..6, and style-level numPr
    let defaultFontFamily = themeFonts.minorFont || 'Times New Roman';
    let defaultFontSizePt = 11;
    let defaultSpaceAfterPt = 0;
    let defaultLineHeightCss = '1.15';

    const styleMap: Record<string, StyleDefinition> = {};
    const detectedFontsSet = new Set<string>();
    const detectedSizesSet = new Set<number>();

    if (stylesXml && stylesXml.documentElement) {
      const stylesRoot = stylesXml.documentElement;
      const docDefaults = this.findDirectChild(stylesRoot, 'docDefaults');
      if (docDefaults) {
        const rPrDefault = this.findDirectChild(docDefaults, 'rPrDefault');
        const rPr = this.findDirectChild(rPrDefault, 'rPr');
        const rFonts = this.findDirectChild(rPr, 'rFonts');
        const resolvedDefFont = this.extractFontFromRFonts(rFonts, themeFonts);
        if (resolvedDefFont) {
          defaultFontFamily = resolvedDefFont;
          detectedFontsSet.add(resolvedDefFont);
        }
        const szEl = this.findDirectChild(rPr, 'sz') || this.findDirectChild(rPr, 'szCs');
        const szVal = this.getAttrByLocalName(szEl, 'val');
        if (szVal && !isNaN(Number(szVal))) {
          defaultFontSizePt = Number(szVal) / 2;
          detectedSizesSet.add(defaultFontSizePt);
        }

        const pPrDefault = this.findDirectChild(docDefaults, 'pPrDefault');
        const pPrDef = this.findDirectChild(pPrDefault, 'pPr');
        const defSpacing = this.extractSpacingAndIndentationFromPPr(pPrDef);
        if (defSpacing.spaceAfterPt !== undefined) defaultSpaceAfterPt = defSpacing.spaceAfterPt;
        if (defSpacing.lineHeightCss) defaultLineHeightCss = defSpacing.lineHeightCss;
      }

      const styleNodes = this.findDirectChildren(stylesRoot, 'style');
      for (const sNode of styleNodes) {
        const styleId = this.getAttrByLocalName(sNode, 'styleId') || '';
        if (!styleId) continue;

        const nameEl = this.findDirectChild(sNode, 'name');
        const styleName = this.getAttrByLocalName(nameEl, 'val') || styleId;
        const basedOnEl = this.findDirectChild(sNode, 'basedOn');
        const basedOn = this.getAttrByLocalName(basedOnEl, 'val') || undefined;

        let headingLevel: number | undefined;
        let tocLevel: number | undefined;
        let isTocHeading = false;

        const lowerName = styleName.toLowerCase();
        const lowerId = styleId.toLowerCase();

        const headingMatch =
          lowerName.match(/(?:heading|título|titulo|encabezado|titre|überschrift)\s*([1-6])/i) ||
          lowerId.match(/^(?:heading|titulo|título|encabezado|ttulo|h)\s*([1-6])$/i);

        if (headingMatch) {
          headingLevel = parseInt(headingMatch[1], 10);
        }

        const tocMatch =
          lowerName.match(/^(?:toc|tdc|tabla de contenido|índice|indice)\s*([1-9])/i) ||
          lowerId.match(/^(?:toc|tdc|tabladecontenido|indice)\s*([1-9])$/i);

        if (tocMatch) {
          tocLevel = Math.min(6, parseInt(tocMatch[1], 10));
        }

        if (
          lowerName.includes('toc heading') ||
          lowerName.includes('título del índice') ||
          lowerName.includes('titulo del indice') ||
          lowerId === 'tocheading' ||
          lowerId === 'ttulodelndice'
        ) {
          isTocHeading = true;
        }

        let styleNumId: string | undefined;
        let styleIlvl: number | undefined;

        const pPr = this.findDirectChild(sNode, 'pPr');
        if (pPr) {
          if (!tocLevel) {
            const outlineLvlEl = this.findDirectChild(pPr, 'outlineLvl');
            const outlineVal = this.getAttrByLocalName(outlineLvlEl, 'val');
            if (outlineVal !== null && !isNaN(Number(outlineVal))) {
              const lvl = Number(outlineVal) + 1;
              if (lvl >= 1 && lvl <= 6) {
                headingLevel = lvl;
              }
            }
          }
          const styleNumPr = this.findDirectChild(pPr, 'numPr');
          if (styleNumPr) {
            const nId = this.getAttrByLocalName(this.findDirectChild(styleNumPr, 'numId'), 'val');
            const iLvl = this.getAttrByLocalName(this.findDirectChild(styleNumPr, 'ilvl'), 'val');
            if (nId && nId !== '0') styleNumId = nId;
            if (iLvl !== null && !isNaN(Number(iLvl))) styleIlvl = Number(iLvl);
          }
        }

        const linkedFromNum = numberingEngine.getLinkedHeadingLevelForStyle(styleId);
        if (linkedFromNum) {
          if (!styleNumId) styleNumId = linkedFromNum.numId;
          if (styleIlvl === undefined) styleIlvl = linkedFromNum.ilvl;
          if (!headingLevel && linkedFromNum.ilvl >= 0 && linkedFromNum.ilvl <= 5) {
            headingLevel = linkedFromNum.ilvl + 1;
          }
        }

        const styleSpacing = this.extractSpacingAndIndentationFromPPr(pPr);
        const rPr = this.findDirectChild(sNode, 'rPr');
        let fontFamily: string | undefined;
        let fontSizePt: number | undefined;
        let bold = false;
        let italic = false;
        let underline = false;
        let color: string | undefined;

        if (rPr) {
          const rFonts = this.findDirectChild(rPr, 'rFonts');
          const f = this.extractFontFromRFonts(rFonts, themeFonts);
          if (f) {
            fontFamily = f;
            detectedFontsSet.add(f);
          }
          const sz = this.findDirectChild(rPr, 'sz') || this.findDirectChild(rPr, 'szCs');
          const szVal = this.getAttrByLocalName(sz, 'val');
          if (szVal && !isNaN(Number(szVal))) {
            fontSizePt = Number(szVal) / 2;
            detectedSizesSet.add(fontSizePt);
          }
          if (this.findDirectChild(rPr, 'b')) bold = true;
          if (this.findDirectChild(rPr, 'i')) italic = true;
          const uEl = this.findDirectChild(rPr, 'u');
          if (uEl && this.getAttrByLocalName(uEl, 'val') !== 'none') underline = true;
          const colorEl = this.findDirectChild(rPr, 'color');
          const cVal = this.getAttrByLocalName(colorEl, 'val');
          if (cVal && cVal !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(cVal)) {
            color = `#${cVal}`;
          }
        }

        if (lowerId === 'normal' || lowerName === 'normal') {
          if (fontFamily) defaultFontFamily = fontFamily;
          if (fontSizePt) defaultFontSizePt = fontSizePt;
          if (styleSpacing.spaceAfterPt !== undefined) defaultSpaceAfterPt = styleSpacing.spaceAfterPt;
          if (styleSpacing.lineHeightCss) defaultLineHeightCss = styleSpacing.lineHeightCss;
        }

        styleMap[styleId] = {
          id: styleId,
          name: styleName,
          basedOn,
          headingLevel,
          tocLevel,
          isTocHeading,
          numId: styleNumId,
          ilvl: styleIlvl,
          fontFamily,
          fontSizePt,
          bold,
          italic,
          underline,
          color,
          align: styleSpacing.align,
          spaceBeforePt: styleSpacing.spaceBeforePt,
          spaceAfterPt: styleSpacing.spaceAfterPt,
          lineHeightMultiple: styleSpacing.lineHeightCss ? Number(styleSpacing.lineHeightCss) : undefined,
          firstLineIndentPt: styleSpacing.firstLineIndentPt,
          leftIndentPt: styleSpacing.leftIndentPt,
        };
      }
    }

    // 3. Locate body and the primary sectPr
    const bodyEl = this.findDirectChild(docXml.documentElement, 'body');
    const allSectPrs = this.findAllDescendants(bodyEl, 'sectPr');
    const sectPrEl =
      this.findDirectChild(bodyEl, 'sectPr') ||
      (allSectPrs.length > 0 ? allSectPrs[allSectPrs.length - 1] : null);

    const pgSzEl = this.findDirectChild(sectPrEl, 'pgSz');
    const rawWTwips = Number(this.getAttrByLocalName(pgSzEl, 'w') || 12240);
    const rawHTwips = Number(this.getAttrByLocalName(pgSzEl, 'h') || 15840);
    const orientAttr = this.getAttrByLocalName(pgSzEl, 'orient');

    const matchedSize = this.matchPaperFormatFromTwips(rawWTwips, rawHTwips, orientAttr);
    const extractedMargins = this.extractPageMarginsFromSectPr(sectPrEl);
    const extractedBorder = this.extractPageBordersFromSectPr(sectPrEl);

    let extractedHeaderHtml = '';
    let extractedFooterHtml = '';
    Object.keys(xmlFiles).forEach((path) => {
      if (/^word\/header\d*\.xml$/i.test(path) && !extractedHeaderHtml) {
        extractedHeaderHtml = this.parseHeaderOrFooterXml(xmlFiles[path]);
      }
      if (/^word\/footer\d*\.xml$/i.test(path) && !extractedFooterHtml) {
        extractedFooterHtml = this.parseHeaderOrFooterXml(xmlFiles[path]);
      }
    });

    const hasAnyRealHeaderOrFooter = Boolean(extractedHeaderHtml || extractedFooterHtml);

    const detectedLayout: DocumentLayoutConfig = {
      paperFormatId: matchedSize.formatId,
      orientation: matchedSize.orientation,
      customWidthPx: matchedSize.widthPx,
      customHeightPx: matchedSize.heightPx,
      customSizeLabel: matchedSize.label,
      margins: extractedMargins,
      pageBorder: extractedBorder,
      headerHtml: extractedHeaderHtml,
      footerHtml: extractedFooterHtml,
      showHeaderFooter: hasAnyRealHeaderOrFooter,
    };

    // Full usable vertical height per page in pixels (e.g. 1056px Letter - top/bottom margins = ~900px)
    const maxPageContentHeightPx = Math.max(
      720,
      matchedSize.heightPx - extractedMargins.topPx - extractedMargins.bottomPx - 12
    );

    // 4. Walk word/document.xml body into multiple pages
    const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    const headingStyleSummarySet = new Set<string>();
    let totalEmbeddedImages = 0;
    let foundTabsOrSpacing = false;
    let headingSeqCounter = 0;

    let hasTableOfContents = false;
    let tocEntriesCount = 0;
    let tocPageNumber: number | undefined;
    const extractedTocHeadings: HeadingItem[] = [];

    const pagesHtmlChunks: string[][] = [[]];
    let currentPageHeightPx = 0;

    const pushExplicitPageBreak = () => {
      const currentChunk = pagesHtmlChunks[pagesHtmlChunks.length - 1];
      if (currentChunk.length === 0) {
        currentChunk.push('<p><br/></p>');
      }
      pagesHtmlChunks.push([]);
      currentPageHeightPx = 0;
    };

    const appendBlockToCurrentPage = (html: string, estimatedHeightPx: number) => {
      if (
        currentPageHeightPx + estimatedHeightPx > maxPageContentHeightPx &&
        pagesHtmlChunks[pagesHtmlChunks.length - 1].length > 0
      ) {
        pagesHtmlChunks.push([]);
        currentPageHeightPx = 0;
      }
      pagesHtmlChunks[pagesHtmlChunks.length - 1].push(html);
      currentPageHeightPx += estimatedHeightPx;
    };

    const resolveStyleChain = (styleId?: string | null): StyleDefinition | null => {
      if (!styleId || !styleMap[styleId]) return null;
      const base = { ...styleMap[styleId] };
      let parentId = base.basedOn;
      let depth = 0;
      while (parentId && styleMap[parentId] && depth < 6) {
        const parent = styleMap[parentId];
        if (!base.headingLevel && parent.headingLevel) base.headingLevel = parent.headingLevel;
        if (!base.tocLevel && parent.tocLevel) base.tocLevel = parent.tocLevel;
        if (!base.isTocHeading && parent.isTocHeading) base.isTocHeading = parent.isTocHeading;
        if (!base.numId && parent.numId) base.numId = parent.numId;
        if (base.ilvl === undefined && parent.ilvl !== undefined) base.ilvl = parent.ilvl;
        if (!base.fontFamily && parent.fontFamily) base.fontFamily = parent.fontFamily;
        if (!base.fontSizePt && parent.fontSizePt) base.fontSizePt = parent.fontSizePt;
        if (!base.color && parent.color) base.color = parent.color;
        if (!base.align && parent.align) base.align = parent.align;
        if (base.spaceBeforePt === undefined && parent.spaceBeforePt !== undefined)
          base.spaceBeforePt = parent.spaceBeforePt;
        if (base.spaceAfterPt === undefined && parent.spaceAfterPt !== undefined)
          base.spaceAfterPt = parent.spaceAfterPt;
        if (base.firstLineIndentPt === undefined && parent.firstLineIndentPt !== undefined)
          base.firstLineIndentPt = parent.firstLineIndentPt;
        if (base.leftIndentPt === undefined && parent.leftIndentPt !== undefined)
          base.leftIndentPt = parent.leftIndentPt;
        parentId = parent.basedOn;
        depth++;
      }
      return base;
    };

    const parseParagraphElement = (
      pEl: Element,
      insideTocSdt: boolean = false,
      insideTableCell: boolean = false
    ): {
      fragmentsWithHeight: { html: string; heightPx: number }[];
      breakBefore: boolean;
      hasSectBreakAfter: boolean;
    } => {
      const pPr = this.findDirectChild(pEl, 'pPr');
      const pStyleEl = this.findDirectChild(pPr, 'pStyle');
      const styleId = this.getAttrByLocalName(pStyleEl, 'val');
      const resolvedStyle = resolveStyleChain(styleId);

      const pPrRPr = this.findDirectChild(pPr, 'rPr');
      let pLevelFontSizePt: number | undefined;
      let pLevelFontFamily: string | undefined;
      let pLevelBold: boolean | undefined;
      if (pPrRPr) {
        const szEl = this.findDirectChild(pPrRPr, 'sz') || this.findDirectChild(pPrRPr, 'szCs');
        const szVal = this.getAttrByLocalName(szEl, 'val');
        if (szVal && !isNaN(Number(szVal))) {
          pLevelFontSizePt = Number(szVal) / 2;
        }
        const rFonts = this.findDirectChild(pPrRPr, 'rFonts');
        const f = this.extractFontFromRFonts(rFonts, themeFonts);
        if (f) {
          pLevelFontFamily = f;
        }
        const bEl = this.findDirectChild(pPrRPr, 'b') || this.findDirectChild(pPrRPr, 'bCs');
        if (bEl && this.getAttrByLocalName(bEl, 'val') !== '0' && this.getAttrByLocalName(bEl, 'val') !== 'false') {
          pLevelBold = true;
        }
      }

      let headingLevel = insideTableCell ? undefined : resolvedStyle?.headingLevel;
      let tocLevel = insideTableCell ? undefined : resolvedStyle?.tocLevel;
      let isTocHeading = insideTableCell ? false : Boolean(resolvedStyle?.isTocHeading);

      if (!insideTableCell && !tocLevel && styleId && /^(?:toc|tdc)\s*([1-9])$/i.test(styleId)) {
        const m = styleId.match(/([1-9])/);
        if (m) tocLevel = Math.min(6, parseInt(m[1], 10));
      }

      if (!insideTableCell && pPr && !tocLevel) {
        const outlineEl = this.findDirectChild(pPr, 'outlineLvl');
        const outlineVal = this.getAttrByLocalName(outlineEl, 'val');
        if (outlineVal !== null && !isNaN(Number(outlineVal))) {
          const lvl = Number(outlineVal) + 1;
          if (lvl >= 1 && lvl <= 6) headingLevel = lvl;
        }
      }

      if (!insideTableCell && !headingLevel && !tocLevel && styleId) {
        const directHeadingMatch = styleId.match(/(?:heading|titulo|título|ttulo|encabezado)\s*([1-6])/i);
        if (directHeadingMatch) {
          headingLevel = parseInt(directHeadingMatch[1], 10);
        }
      }

      const breakBefore = !insideTableCell && Boolean(this.findDirectChild(pPr, 'pageBreakBefore'));
      const sectPrInPPr = this.findDirectChild(pPr, 'sectPr');
      let hasSectBreakAfter = false;
      if (!insideTableCell && sectPrInPPr) {
        const sectTypeEl = this.findDirectChild(sectPrInPPr, 'type');
        const sectTypeVal = this.getAttrByLocalName(sectTypeEl, 'val');
        if (sectTypeVal !== 'continuous') {
          hasSectBreakAfter = true;
        }
      }

      const directPPrMetrics = this.extractSpacingAndIndentationFromPPr(pPr);
      const textAlign = directPPrMetrics.align || resolvedStyle?.align || '';
      const spaceBeforePt = insideTableCell
        ? directPPrMetrics.spaceBeforePt ?? 0
        : directPPrMetrics.spaceBeforePt ?? resolvedStyle?.spaceBeforePt ?? 0;
      const spaceAfterPt = insideTableCell
        ? directPPrMetrics.spaceAfterPt ?? 0
        : directPPrMetrics.spaceAfterPt ?? resolvedStyle?.spaceAfterPt ?? defaultSpaceAfterPt;
      const lineHeightCss = insideTableCell
        ? directPPrMetrics.lineHeightCss || '1.1'
        : directPPrMetrics.lineHeightCss ||
          (resolvedStyle?.lineHeightMultiple
            ? String(resolvedStyle.lineHeightMultiple)
            : defaultLineHeightCss);
      const firstLineIndentPt = directPPrMetrics.firstLineIndentPt ?? resolvedStyle?.firstLineIndentPt;
      const leftIndentPt = directPPrMetrics.leftIndentPt ?? resolvedStyle?.leftIndentPt;
      const rightIndentPt = directPPrMetrics.rightIndentPt;

      if (
        firstLineIndentPt ||
        leftIndentPt ||
        directPPrMetrics.spaceBeforePt !== undefined ||
        directPPrMetrics.spaceAfterPt !== undefined
      ) {
        foundTabsOrSpacing = true;
      }

      const numPrEl = this.findDirectChild(pPr, 'numPr');
      let activeNumId: string | undefined = resolvedStyle?.numId;
      let activeIlvl: number = resolvedStyle?.ilvl ?? (headingLevel ? headingLevel - 1 : 0);

      if (numPrEl) {
        const numIdEl = this.findDirectChild(numPrEl, 'numId');
        const ilvlEl = this.findDirectChild(numPrEl, 'ilvl');
        const nVal = this.getAttrByLocalName(numIdEl, 'val');
        const lVal = this.getAttrByLocalName(ilvlEl, 'val');
        if (nVal === '0') {
          activeNumId = undefined;
        } else if (nVal) {
          activeNumId = nVal;
        }
        if (lVal !== null && !isNaN(Number(lVal))) {
          activeIlvl = Number(lVal);
        }
      }

      const runBuckets: string[][] = [[]];

      let maxRunSizeInParagraphPt: number | undefined;
      let firstRunFontInParagraph: string | undefined;
      let hasTextRuns = false;
      let allTextRunsBold = true;
      let hasAnyBoldRun = Boolean(pLevelBold || resolvedStyle?.bold);
      let hasImageInParagraph = false;
      let maxImageHeightPxInParagraph = 0;
      let paragraphHasTocFieldInstruction = false;
      let paragraphHasPagerefField = false;

      const extractImageFromDrawingOrPict = (container: Element): string | null => {
        const blipEl = this.findFirstDescendant(container, 'blip');
        const imagedataEl = this.findFirstDescendant(container, 'imagedata');
        const rId =
          this.getAttrByLocalName(blipEl, 'embed') ||
          this.getAttrByLocalName(imagedataEl, 'id');

        if (rId && relIdToBlobUrl[rId]) {
          totalEmbeddedImages++;
          hasImageInParagraph = true;
          const extentEl = this.findFirstDescendant(container, 'extent');
          const cxEmu = Number(this.getAttrByLocalName(extentEl, 'cx') || 0);
          const cyEmu = Number(this.getAttrByLocalName(extentEl, 'cy') || 0);

          const widthPx = cxEmu > 0 ? Math.min(650, Math.max(32, Math.round(cxEmu / 9525))) : 220;
          const heightPx = cyEmu > 0 ? Math.min(740, Math.max(32, Math.round(cyEmu / 9525))) : 220;
          if (heightPx > maxImageHeightPxInParagraph) {
            maxImageHeightPxInParagraph = heightPx;
          }
          const heightStyle = cyEmu > 0 ? `height: ${heightPx}px;` : 'height: auto;';

          return `<img src="${relIdToBlobUrl[rId]}" alt="Imagen del documento" style="width: ${widthPx}px; ${heightStyle} max-width: 100%; display: inline-block; margin: 4pt auto;" />`;
        }
        return null;
      };

      const processRunNode = (rEl: Element) => {
        const rPr = this.findDirectChild(rEl, 'rPr');

        let runFont = pLevelFontFamily || resolvedStyle?.fontFamily || defaultFontFamily;
        let runSizePt = pLevelFontSizePt || resolvedStyle?.fontSizePt || (insideTableCell ? 9.5 : defaultFontSizePt);
        let isBold = Boolean(pLevelBold || resolvedStyle?.bold);
        let isItalic = Boolean(resolvedStyle?.italic);
        let isUnderline = Boolean(resolvedStyle?.underline);
        let isStrike = false;
        let isSub = false;
        let isSup = false;
        let runColor = resolvedStyle?.color;

        if (rPr) {
          const rFonts = this.findDirectChild(rPr, 'rFonts');
          const f = this.extractFontFromRFonts(rFonts, themeFonts);
          if (f) {
            runFont = f;
            detectedFontsSet.add(f);
          }

          const szEl = this.findDirectChild(rPr, 'sz') || this.findDirectChild(rPr, 'szCs');
          const szVal = this.getAttrByLocalName(szEl, 'val');
          if (szVal && !isNaN(Number(szVal))) {
            runSizePt = Number(szVal) / 2;
            detectedSizesSet.add(runSizePt);
          }

          const bEl = this.findDirectChild(rPr, 'b') || this.findDirectChild(rPr, 'bCs');
          if (bEl) {
            const bVal = this.getAttrByLocalName(bEl, 'val');
            isBold = bVal !== '0' && bVal !== 'false';
          }
          const iEl = this.findDirectChild(rPr, 'i') || this.findDirectChild(rPr, 'iCs');
          if (iEl) {
            const iVal = this.getAttrByLocalName(iEl, 'val');
            isItalic = iVal !== '0' && iVal !== 'false';
          }
          const uEl = this.findDirectChild(rPr, 'u');
          if (uEl && this.getAttrByLocalName(uEl, 'val') !== 'none') {
            isUnderline = true;
          }
          if (this.findDirectChild(rPr, 'strike')) {
            isStrike = true;
          }
          const vertAlign = this.findDirectChild(rPr, 'vertAlign');
          const vVal = this.getAttrByLocalName(vertAlign, 'val');
          if (vVal === 'subscript') isSub = true;
          if (vVal === 'superscript') isSup = true;

          const colorEl = this.findDirectChild(rPr, 'color');
          const cVal = this.getAttrByLocalName(colorEl, 'val');
          if (cVal && cVal !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(cVal)) {
            runColor = `#${cVal}`;
          }
        }

        if (runSizePt && (!maxRunSizeInParagraphPt || runSizePt > maxRunSizeInParagraphPt)) {
          maxRunSizeInParagraphPt = runSizePt;
        }
        if (runFont && !firstRunFontInParagraph) {
          firstRunFontInParagraph = runFont;
        }

        let textSegmentBuffer = '';

        const flushTextSegment = () => {
          if (!textSegmentBuffer) return;
          hasTextRuns = true;
          if (isBold) hasAnyBoldRun = true;
          if (!isBold && textSegmentBuffer.trim().length > 0) {
            allTextRunsBold = false;
          }

          const stylesForSpan: string[] = [];
          if (runFont) stylesForSpan.push(`font-family: '${runFont}', serif`);
          if (runSizePt) stylesForSpan.push(`font-size: ${runSizePt}pt`);
          if (runColor) stylesForSpan.push(`color: ${runColor}`);

          let formatted = this.escapeHtml(textSegmentBuffer);
          if (isBold) formatted = `<strong>${formatted}</strong>`;
          if (isItalic) formatted = `<em>${formatted}</em>`;
          if (isUnderline) formatted = `<u>${formatted}</u>`;
          if (isStrike) formatted = `<strike>${formatted}</strike>`;
          if (isSub) formatted = `<sub>${formatted}</sub>`;
          if (isSup) formatted = `<sup>${formatted}</sup>`;

          if (stylesForSpan.length > 0) {
            formatted = `<span style="${stylesForSpan.join('; ')}">${formatted}</span>`;
          }
          runBuckets[runBuckets.length - 1].push(formatted);
          textSegmentBuffer = '';
        };

        const rChildren = rEl.children;
        for (let cIdx = 0; cIdx < rChildren.length; cIdx++) {
          const cEl = rChildren[cIdx];
          const ln = cEl.localName;

          if (ln === 't') {
            textSegmentBuffer += cEl.textContent || '';
          } else if (ln === 'instrText') {
            const instr = (cEl.textContent || '').toUpperCase();
            if (instr.includes('TOC ')) {
              paragraphHasTocFieldInstruction = true;
            }
            if (instr.includes('PAGEREF ') || instr.includes('_TOC')) {
              paragraphHasPagerefField = true;
            }
          } else if (ln === 'tab') {
            flushTextSegment();
            foundTabsOrSpacing = true;
            if (directPPrMetrics.hasDotLeaderTab || tocLevel || insideTocSdt) {
              runBuckets[runBuckets.length - 1].push(
                `<span class="docx-toc-leader" style="flex: 1; border-bottom: 1px dotted #94a3b8; margin: 0 8px; min-width: 24px; display: inline-block;"></span>`
              );
            } else {
              runBuckets[runBuckets.length - 1].push(
                `<span class="docx-tab" style="display:inline-block; width: 36pt; white-space: pre;">&#9;</span>`
              );
            }
          } else if (ln === 'br') {
            const brType = this.getAttrByLocalName(cEl, 'type');
            flushTextSegment();
            if (!insideTableCell && brType === 'page') {
              if (runBuckets[runBuckets.length - 1].length === 0) {
                runBuckets[runBuckets.length - 1].push('<br/>');
              }
              runBuckets.push([]);
            } else {
              runBuckets[runBuckets.length - 1].push('<br/>');
            }
          } else if (!insideTableCell && ln === 'lastRenderedPageBreak') {
            flushTextSegment();
            if (pagesHtmlChunks.length > 1 && currentPageHeightPx > maxPageContentHeightPx * 0.55) {
              if (runBuckets[runBuckets.length - 1].length > 0) {
                runBuckets.push([]);
              } else if (pagesHtmlChunks[pagesHtmlChunks.length - 1].length > 0) {
                pushExplicitPageBreak();
              }
            }
          } else if (
            ln === 'drawing' ||
            ln === 'pict' ||
            ln === 'object' ||
            ln === 'AlternateContent'
          ) {
            flushTextSegment();
            const imgHtml = extractImageFromDrawingOrPict(cEl);
            if (imgHtml) {
              runBuckets[runBuckets.length - 1].push(imgHtml);
            }
          }
        }

        flushTextSegment();
      };

      const walkParagraphChildren = (container: Element) => {
        const pChildren = container.children;
        for (let i = 0; i < pChildren.length; i++) {
          const el = pChildren[i];
          const ln = el.localName;
          if (ln === 'r') {
            processRunNode(el);
          } else if (ln === 'hyperlink') {
            const anchor = this.getAttrByLocalName(el, 'anchor') || '';
            if (anchor.toLowerCase().startsWith('_toc')) {
              paragraphHasPagerefField = true;
            }
            walkParagraphChildren(el);
          } else if (ln === 'fldSimple') {
            const instr = (this.getAttrByLocalName(el, 'instr') || '').toUpperCase();
            if (instr.includes('TOC ')) paragraphHasTocFieldInstruction = true;
            if (instr.includes('PAGEREF ') || instr.includes('_TOC')) paragraphHasPagerefField = true;
            walkParagraphChildren(el);
          } else if (ln === 'ins' || ln === 'smartTag' || ln === 'sdt' || ln === 'sdtContent') {
            walkParagraphChildren(el);
          } else if (ln === 'drawing' || ln === 'pict' || ln === 'AlternateContent') {
            const imgHtml = extractImageFromDrawingOrPict(el);
            if (imgHtml) {
              runBuckets[runBuckets.length - 1].push(imgHtml);
            }
          }
        }
      };

      walkParagraphChildren(pEl);

      const plainParagraphText = (pEl.textContent || '').trim();

      if (
        !insideTableCell &&
        !isTocHeading &&
        /^(?:tabla de contenido|índice de contenido|indice de contenido|índice general|indice general|table of contents|contenido|índice)$/i.test(
          plainParagraphText
        )
      ) {
        isTocHeading = true;
        hasTableOfContents = true;
        if (!tocPageNumber) tocPageNumber = pagesHtmlChunks.length;
      }

      if (
        !insideTableCell &&
        (paragraphHasTocFieldInstruction ||
          paragraphHasPagerefField ||
          tocLevel ||
          insideTocSdt ||
          (directPPrMetrics.hasDotLeaderTab && /\d+\s*$/.test(plainParagraphText)))
      ) {
        hasTableOfContents = true;
        if (!tocPageNumber) tocPageNumber = pagesHtmlChunks.length;
        if (!tocLevel && !isTocHeading && plainParagraphText.length > 0) {
          const ind = leftIndentPt || 0;
          if (ind >= 36) tocLevel = 3;
          else if (ind >= 14) tocLevel = 2;
          else tocLevel = 1;
        }
      }

      if (!insideTableCell && tocLevel && plainParagraphText.length > 1 && !isTocHeading) {
        tocEntriesCount++;
        const pageNumMatch = plainParagraphText.match(/^(.*?)(?:[\s.\t]+)(\d+)\s*$/);
        const rawTitle = (pageNumMatch ? pageNumMatch[1] : plainParagraphText).trim();
        const cleanTitle = rawTitle.replace(/^(\d+(?:\.\d+)*\.?)(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/, '$1 ');
        const targetPageNum = pageNumMatch ? Math.max(1, parseInt(pageNumMatch[2], 10)) : pagesHtmlChunks.length;

        if (cleanTitle) {
          extractedTocHeadings.push({
            id: `toc-entry-${tocEntriesCount}`,
            text: cleanTitle,
            level: tocLevel,
            pageIndex: targetPageNum - 1,
            fromTocEntry: true,
          });
        }
      }

      let generatedNumberPrefix = '';
      let isStandardBulletOrList = false;
      let listTagType: 'ul' | 'ol' = 'ul';

      if (!insideTableCell && activeNumId && hasTextRuns && !tocLevel && !insideTocSdt) {
        const listKind = numberingEngine.getListType(activeNumId, activeIlvl);
        const isOutlineNum = numberingEngine.isMultiLevelOutline(activeNumId, activeIlvl);
        const looksLikeHeadingWithNumbering =
          Boolean(headingLevel) ||
          (isOutlineNum &&
            (allTextRunsBold || hasAnyBoldRun) &&
            plainParagraphText.length < 160 &&
            !plainParagraphText.endsWith('.')) ||
          /^(?:cap[íi]tulo|secci[óo]n|parte|anexo|tema)\b/i.test(plainParagraphText);

        if (looksLikeHeadingWithNumbering) {
          if (!headingLevel) {
            headingLevel = Math.min(6, activeIlvl + 1);
          }
          const prefix = numberingEngine.formatNextNumberPrefix(activeNumId, activeIlvl);
          if (prefix && !plainParagraphText.startsWith(prefix)) {
            generatedNumberPrefix = prefix;
          }
        } else {
          isStandardBulletOrList = true;
          listTagType = listKind;
        }
      }

      if (
        !insideTableCell &&
        !headingLevel &&
        !tocLevel &&
        !insideTocSdt &&
        !isStandardBulletOrList &&
        pagesHtmlChunks.length > 1 &&
        hasTextRuns &&
        plainParagraphText.length > 2 &&
        plainParagraphText.length < 150
      ) {
        const multiNumberMatch = plainParagraphText.match(/^(\d+(?:\.\d+)+)\.?\s*\S/);
        const topChapterMatch = plainParagraphText.match(
          /^(?:(\d+)\.?\s*)?(?:cap[íi]tulo|secci[óo]n|parte|anexo)\s+\d+/i
        );
        const singleNumberBoldHeading =
          (allTextRunsBold || (maxRunSizeInParagraphPt || 0) >= 13) &&
          !plainParagraphText.endsWith('.') &&
          plainParagraphText.match(/^(\d+)\.\s*[A-ZÁÉÍÓÚÑ]/);

        if (topChapterMatch) {
          headingLevel = 1;
        } else if (multiNumberMatch && (allTextRunsBold || hasAnyBoldRun)) {
          const depth = multiNumberMatch[1].split('.').length;
          headingLevel = Math.min(6, depth);
        } else if (singleNumberBoldHeading) {
          headingLevel = 1;
        }
      }

      const effectiveHeadingSizePt =
        maxRunSizeInParagraphPt ||
        pLevelFontSizePt ||
        resolvedStyle?.fontSizePt ||
        (insideTableCell ? 9.5 : defaultFontSizePt);
      const effectiveFontFamily =
        firstRunFontInParagraph || pLevelFontFamily || resolvedStyle?.fontFamily || defaultFontFamily;

      if (generatedNumberPrefix && runBuckets.length > 0) {
        const targetBucket = runBuckets.find((b) => b.length > 0) || runBuckets[0];
        targetBucket.unshift(
          `<span style="font-family: '${effectiveFontFamily}', serif; font-size: ${effectiveHeadingSizePt}pt; font-weight: bold; margin-right: 6pt;">${this.escapeHtml(
            generatedNumberPrefix
          )} </span>`
        );
      }

      if (!hasTextRuns && !hasImageInParagraph && runBuckets.length === 1 && runBuckets[0].length === 0) {
        const emptyStyles: string[] = [
          `font-family: '${effectiveFontFamily}', serif`,
          `font-size: ${effectiveHeadingSizePt}pt`,
          `line-height: ${lineHeightCss}`,
          `margin-top: ${spaceBeforePt}pt`,
          `margin-bottom: ${spaceAfterPt}pt`,
        ];
        const emptyHeightPx = Math.round((effectiveHeadingSizePt + spaceBeforePt + spaceAfterPt) * 1.1);
        return {
          fragmentsWithHeight: [
            {
              html: `<p style="${emptyStyles.join('; ')}"><br/></p>`,
              heightPx: Math.max(11, emptyHeightPx),
            },
          ],
          breakBefore,
          hasSectBreakAfter,
        };
      }

      const textLinesEstimate = Math.max(1, Math.ceil(plainParagraphText.length / 95));
      const lineHeightPx = Math.round(effectiveHeadingSizePt * 1.33 * 1.12);
      const marginsPx = Math.round((spaceBeforePt + spaceAfterPt) * 1.33);
      const estimatedBlockHeightPx =
        (hasTextRuns ? textLinesEstimate * lineHeightPx : 0) +
        maxImageHeightPxInParagraph +
        marginsPx +
        2;

      const wrapBucketHtml = (inner: string): string => {
        const trimmed = inner.trim();
        if (!trimmed) return '';

        const blockStyles: string[] = [];
        if (textAlign) {
          blockStyles.push(`text-align: ${textAlign}`);
        } else if (hasImageInParagraph && !hasTextRuns) {
          blockStyles.push(`text-align: center`);
        }

        if (effectiveFontFamily) {
          blockStyles.push(`font-family: '${effectiveFontFamily}', serif`);
        }
        if (lineHeightCss) {
          blockStyles.push(`line-height: ${lineHeightCss}`);
        }
        blockStyles.push(`margin-top: ${spaceBeforePt}pt`);
        blockStyles.push(`margin-bottom: ${spaceAfterPt}pt`);

        if (firstLineIndentPt !== undefined && firstLineIndentPt !== 0 && !headingLevel && !insideTableCell) {
          blockStyles.push(`text-indent: ${firstLineIndentPt}pt`);
        }
        if (leftIndentPt !== undefined && leftIndentPt > 0 && !headingLevel && !insideTableCell) {
          blockStyles.push(`margin-left: ${leftIndentPt}pt`);
        }
        if (rightIndentPt !== undefined && rightIndentPt > 0 && !insideTableCell) {
          blockStyles.push(`margin-right: ${rightIndentPt}pt`);
        }

        if (tocLevel && !isTocHeading) {
          const indentPx = Math.max((tocLevel - 1) * 18, leftIndentPt ? leftIndentPt * 1.33 : 0);
          return `<div class="docx-toc-row" style="display: flex; align-items: baseline; justify-content: space-between; margin-left: ${indentPx}px; margin-bottom: 4px; font-family: '${effectiveFontFamily}', serif; font-size: ${
            effectiveHeadingSizePt || 11
          }pt;">${trimmed}</div>`;
        }

        if (isTocHeading) {
          headingSeqCounter++;
          return `<h1 id="docx-h-toc-${headingSeqCounter}" style="font-family: '${effectiveFontFamily}', serif; font-size: ${
            effectiveHeadingSizePt || 16
          }pt; text-align: ${textAlign || 'center'}; font-weight: bold; margin-bottom: 12pt;">${trimmed}</h1>`;
        }

        if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
          if (effectiveHeadingSizePt) {
            blockStyles.push(`font-size: ${effectiveHeadingSizePt}pt`);
          }
          if (resolvedStyle?.color) {
            blockStyles.push(`color: ${resolvedStyle.color}`);
          }
          if (resolvedStyle?.bold === false && !allTextRunsBold && !hasAnyBoldRun) {
            blockStyles.push(`font-weight: normal`);
          }
          const styleAttr = blockStyles.length > 0 ? ` style="${blockStyles.join('; ')}"` : '';

          const key = `h${headingLevel}` as keyof typeof headingCounts;
          headingCounts[key]++;
          headingSeqCounter++;
          const headingId = `docx-h-${headingSeqCounter}`;

          headingStyleSummarySet.add(
            `H${headingLevel}: ${effectiveFontFamily} ${effectiveHeadingSizePt}pt${
              textAlign ? ` (${textAlign})` : ''
            }`
          );

          return `<h${headingLevel} id="${headingId}"${styleAttr}>${trimmed}</h${headingLevel}>`;
        }

        const styleAttr = blockStyles.length > 0 ? ` style="${blockStyles.join('; ')}"` : '';

        if (isStandardBulletOrList) {
          return `<${listTagType}><li${styleAttr}>${trimmed}</li></${listTagType}>`;
        }

        return `<p${styleAttr}>${trimmed}</p>`;
      };

      const fragmentsWithHeight = runBuckets
        .map((b) => wrapBucketHtml(b.join('')))
        .filter(Boolean)
        .map((html) => ({
          html,
          heightPx: estimatedBlockHeightPx,
        }));

      return {
        fragmentsWithHeight,
        breakBefore,
        hasSectBreakAfter,
      };
    };

    /**
     * Calibrated Row-by-Row Paginating Table Parser:
     * - Accurately estimates each row's height in pixels (~13.5px per wrapped line + 4px cell padding)
     *   so all rows that fit on a page stay together in a single table!
     * - Never splits a table after just 1 row unless the page is genuinely full (`currentPageHeightPx + currentSliceHeightPx + rowHeightPx > maxPageContentHeightPx`).
     * - Does NOT blindly split on internal `<w:lastRenderedPageBreak/>` inside a table row when there is still space on the page
     *   (which previously caused a single tall "Flujo principal" row to sit alone on a page while "Postcondición / Excepción" jumped to another page).
     */
    const appendPaginatedTableToPages = (tblEl: Element): void => {
      const rows = this.findDirectChildren(tblEl, 'tr');
      if (rows.length === 0) return;

      const tblPr = this.findDirectChild(tblEl, 'tblPr');
      const tblGrid = this.findDirectChild(tblEl, 'tblGrid');
      const gridCols = this.findDirectChildren(tblGrid, 'gridCol');
      const colWidthsTwips = gridCols.map((gc) => Number(this.getAttrByLocalName(gc, 'w') || 0));
      const totalGridTwips = colWidthsTwips.reduce((acc, w) => acc + w, 0);

      const tblBorders = this.findDirectChild(tblPr, 'tblBorders');
      const sampleBorder =
        this.findDirectChild(tblBorders, 'insideH') ||
        this.findDirectChild(tblBorders, 'top') ||
        this.findDirectChild(tblBorders, 'bottom');
      const rawBorderColor = this.getAttrByLocalName(sampleBorder, 'color');
      const defaultBorderColor =
        rawBorderColor && rawBorderColor !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(rawBorderColor)
          ? `#${rawBorderColor}`
          : '#000000';

      let colGroupHtml = '';
      if (totalGridTwips > 0 && colWidthsTwips.length > 0) {
        const colsHtml = colWidthsTwips
          .map((w) => {
            const pct = Math.max(3, Math.round((w / totalGridTwips) * 1000) / 10);
            return `<col style="width: ${pct}%;" />`;
          })
          .join('');
        colGroupHtml = `<colgroup>${colsHtml}</colgroup>`;
      }

      const wrapRowsIntoTableHtml = (rowsMarkup: string[]) =>
        `<table style="width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin: 4pt 0 8pt 0;">${colGroupHtml}<tbody>${rowsMarkup.join(
          ''
        )}</tbody></table>`;

      let currentSliceRows: string[] = [];
      let currentSliceHeightPx = 6;

      const flushCurrentTableSlice = () => {
        if (currentSliceRows.length === 0) return;
        pagesHtmlChunks[pagesHtmlChunks.length - 1].push(wrapRowsIntoTableHtml(currentSliceRows));
        currentPageHeightPx += currentSliceHeightPx;
        currentSliceRows = [];
        currentSliceHeightPx = 6;
      };

      rows.forEach((tr) => {
        const trPr = this.findDirectChild(tr, 'trPr');
        const isHeaderRow = Boolean(this.findDirectChild(trPr, 'tblHeader'));

        let rowHtml = '<tr>';
        const cells = this.findDirectChildren(tr, 'tc');
        let gridColCursor = 0;
        let maxCellHeightInRowPx = 18;

        cells.forEach((tc) => {
          const tcPr = this.findDirectChild(tc, 'tcPr');
          const gridSpanEl = this.findDirectChild(tcPr, 'gridSpan');
          const colSpan = Number(this.getAttrByLocalName(gridSpanEl, 'val') || 1);

          const shdEl = this.findDirectChild(tcPr, 'shd');
          const fillHex = this.getAttrByLocalName(shdEl, 'fill');
          const colorHex = this.getAttrByLocalName(shdEl, 'color');

          const tcWEl = this.findDirectChild(tcPr, 'tcW');
          const tcWVal = Number(this.getAttrByLocalName(tcWEl, 'w') || 0);
          const tcWType = this.getAttrByLocalName(tcWEl, 'type');

          const vAlignEl = this.findDirectChild(tcPr, 'vAlign');
          const vAlignVal = this.getAttrByLocalName(vAlignEl, 'val');

          const cellStyles: string[] = [
            `border: 1px solid ${defaultBorderColor}`,
            'padding: 1.5pt 4pt',
            'min-width: 0',
            'word-wrap: break-word',
            'overflow-wrap: anywhere',
            'line-height: 1.1',
          ];

          if (vAlignVal === 'center') cellStyles.push('vertical-align: middle');
          else if (vAlignVal === 'bottom') cellStyles.push('vertical-align: bottom');
          else cellStyles.push('vertical-align: top');

          if (fillHex && fillHex !== 'auto' && fillHex.toLowerCase() !== 'ffffff' && /^[0-9A-Fa-f]{6}$/.test(fillHex)) {
            cellStyles.push(`background-color: #${fillHex}`);
          } else if (
            colorHex &&
            colorHex !== 'auto' &&
            colorHex.toLowerCase() !== 'ffffff' &&
            /^[0-9A-Fa-f]{6}$/.test(colorHex) &&
            this.getAttrByLocalName(shdEl, 'val') === 'solid'
          ) {
            cellStyles.push(`background-color: #${colorHex}`);
          }

          let cellWidthPct = 100 / Math.max(1, cells.length);
          if (totalGridTwips > 0 && gridColCursor < colWidthsTwips.length) {
            let spanTwips = 0;
            for (let s = 0; s < colSpan && gridColCursor + s < colWidthsTwips.length; s++) {
              spanTwips += colWidthsTwips[gridColCursor + s];
            }
            if (spanTwips > 0) {
              cellWidthPct = Math.round((spanTwips / totalGridTwips) * 1000) / 10;
              cellStyles.push(`width: ${cellWidthPct}%`);
            }
          } else if (tcWType === 'pct' && tcWVal > 0) {
            cellWidthPct = Math.min(100, Math.round((tcWVal / 50) * 10) / 10);
            cellStyles.push(`width: ${cellWidthPct}%`);
          }

          gridColCursor += colSpan;

          const cellTag = isHeaderRow ? 'th' : 'td';
          const colSpanAttr = colSpan > 1 ? ` colspan="${colSpan}"` : '';
          const cellParagraphs = this.findDirectChildren(tc, 'p');

          // Realistic compact height calculation for 9.5pt font inside a cell
          let cellTotalHeightPx = 4;
          const approxCharsPerLineInCell = Math.max(14, Math.floor((cellWidthPct / 100) * 108));

          const cellHtml = cellParagraphs
            .map((p) => {
              const parsed = parseParagraphElement(p, false, true);
              const pTextLen = (p.textContent || '').trim().length;
              const linesInCell = pTextLen === 0 ? 1 : Math.max(1, Math.ceil(pTextLen / approxCharsPerLineInCell));
              cellTotalHeightPx += linesInCell * 13.5;
              return parsed.fragmentsWithHeight.map((f) => f.html).join('');
            })
            .filter(Boolean)
            .join('');

          if (cellTotalHeightPx > maxCellHeightInRowPx) {
            maxCellHeightInRowPx = cellTotalHeightPx;
          }

          rowHtml += `<${cellTag}${colSpanAttr} style="${cellStyles.join('; ')}">${cellHtml || '&nbsp;'}</${cellTag}>`;
        });
        rowHtml += '</tr>';

        // Cap single-row height estimate so an unusually long cell doesn't force an empty page
        const rowHeightPx = Math.min(maxPageContentHeightPx * 0.72, maxCellHeightInRowPx);

        // Only split the table to the next page when the accumulated height on the current page genuinely exceeds maxPageContentHeightPx
        const wouldExceedPage =
          currentPageHeightPx + currentSliceHeightPx + rowHeightPx > maxPageContentHeightPx;

        if (wouldExceedPage) {
          if (currentSliceRows.length > 0) {
            flushCurrentTableSlice();
          }
          if (pagesHtmlChunks[pagesHtmlChunks.length - 1].length > 0) {
            pushExplicitPageBreak();
          }
        }

        currentSliceRows.push(rowHtml);
        currentSliceHeightPx += rowHeightPx;
      });

      flushCurrentTableSlice();
    };

    const walkBodyContainer = (container: Element, insideTocSdt: boolean = false) => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const ln = el.localName;

        if (ln === 'p') {
          const { fragmentsWithHeight, breakBefore, hasSectBreakAfter } = parseParagraphElement(
            el,
            insideTocSdt,
            false
          );

          if (breakBefore) {
            pushExplicitPageBreak();
          }

          fragmentsWithHeight.forEach((frag, idx) => {
            if (idx > 0) {
              pushExplicitPageBreak();
            }
            if (frag.html) {
              appendBlockToCurrentPage(frag.html, frag.heightPx);
            }
          });

          if (hasSectBreakAfter) {
            pushExplicitPageBreak();
          }
        } else if (ln === 'tbl') {
          appendPaginatedTableToPages(el);
        } else if (ln === 'sdt') {
          const isToc = insideTocSdt || this.isSdtTableOfContents(el);
          if (isToc) {
            hasTableOfContents = true;
            if (!tocPageNumber) tocPageNumber = pagesHtmlChunks.length;
          }
          const sdtContent = this.findDirectChild(el, 'sdtContent');
          if (sdtContent) {
            if (isToc && !insideTocSdt) {
              const beforePageIdx = pagesHtmlChunks.length - 1;
              const beforeLen = pagesHtmlChunks[beforePageIdx].length;
              walkBodyContainer(sdtContent, true);
              const afterPageIdx = pagesHtmlChunks.length - 1;
              if (beforePageIdx === afterPageIdx && pagesHtmlChunks[beforePageIdx].length > beforeLen) {
                const tocItems = pagesHtmlChunks[beforePageIdx].splice(beforeLen);
                pagesHtmlChunks[beforePageIdx].push(
                  `<div class="toc-block" data-native-word-toc="true">${tocItems.join('\n')}</div>`
                );
              }
            } else {
              walkBodyContainer(sdtContent, isToc);
            }
          }
        } else if (ln === 'sdtContent' || ln === 'ins' || ln === 'customXml') {
          walkBodyContainer(el, insideTocSdt);
        }
      }
    };

    if (bodyEl) {
      walkBodyContainer(bodyEl, false);
    }

    while (
      pagesHtmlChunks.length > 1 &&
      pagesHtmlChunks[pagesHtmlChunks.length - 1].every((b) => b === '<p><br/></p>' || !b.trim())
    ) {
      pagesHtmlChunks.pop();
    }

    for (let i = 0; i < pagesHtmlChunks.length; i++) {
      if (pagesHtmlChunks[i].length === 0) {
        pagesHtmlChunks[i].push('<p><br/></p>');
      }
    }

    const finalPagesHtml: string[] = pagesHtmlChunks.map((c) => c.join('\n'));

    const pages: DocumentPage[] = finalPagesHtml.map((html, idx) => ({
      id: `docx-page-${idx + 1}-${Date.now().toString(36)}`,
      html,
    }));

    extractedTocHeadings.forEach((h) => {
      h.pageIndex = Math.max(0, Math.min(pages.length - 1, h.pageIndex));
    });

    if (detectedFontsSet.size === 0) detectedFontsSet.add(defaultFontFamily);
    if (detectedSizesSet.size === 0) detectedSizesSet.add(defaultFontSizePt);

    const properties: DocxDocumentProperties = {
      fileName: file.name,
      title: coreTitle || baseFileName,
      author,
      lastModifiedBy,
      created,
      modified,
      application,
      pageCount: pages.length,
      officialPageCountPreserved: true,
      wordCount: appWordsRaw && !isNaN(Number(appWordsRaw)) ? Number(appWordsRaw) : undefined,
      defaultFontFamily,
      defaultFontSizePt,
      detectedFonts: Array.from(detectedFontsSet),
      detectedSizesPt: Array.from(detectedSizesSet).sort((a, b) => a - b),
      headingCounts,
      detectedHeadingStylesSummary: Array.from(headingStyleSummarySet),
      hasTableOfContents,
      tocEntriesCount,
      tocPageNumber,
      imagesCount: totalEmbeddedImages,
      preservesTabsAndSpacing: foundTabsOrSpacing,
      pageSizeLabel: matchedSize.label,
      detectedPaperFormatId: matchedSize.formatId,
      detectedOrientation: matchedSize.orientation,
      detectedMarginsLabel: extractedMargins.label,
      hasCustomPageBorder: extractedBorder.style !== 'none',
      hasDocumentHeader: Boolean(extractedHeaderHtml),
      hasDocumentFooter: Boolean(extractedFooterHtml),
    };

    return {
      title: properties.title,
      pages,
      properties,
      detectedLayout,
      extractedTocHeadings,
    };
  }
}