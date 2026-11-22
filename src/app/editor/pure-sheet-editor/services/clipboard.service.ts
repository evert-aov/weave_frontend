import { Injectable } from '@angular/core';
import { BorderEdge, BorderLineStyle, CellBorders, CellData, CellStyle, ClipboardMatrix, SheetGrid } from '../models/excel.model';
import { evaluateCellValueCached, getCellId } from './formula-engine.service';

const BORDER_EDGES = ['top', 'right', 'bottom', 'left'] as const;

const BORDER_WIDTH_CSS: Record<BorderLineStyle, string> = {
  thin: '1px',
  medium: '2px',
  thick: '3px',
  double: '3px',
  dashed: '1px',
  dotted: '1px',
};

function borderStyleToCss(style: BorderLineStyle): string {
  return style === 'double' || style === 'dashed' || style === 'dotted' ? style : 'solid';
}

export function cloneCellStyle(style?: CellStyle): CellStyle | undefined {
  if (!style) return undefined;
  let clonedBorders: CellBorders | undefined;
  if (style.borders) {
    clonedBorders = {};
    for (const edge of BORDER_EDGES) {
      if (style.borders[edge]) {
        clonedBorders[edge] = { ...style.borders[edge] };
      }
    }
  }
  return {
    ...style,
    ...(style.borders ? { borders: clonedBorders } : {}),
  };
}

export function cloneCellData(cell: CellData): CellData {
  return {
    ...cell,
    style: cloneCellStyle(cell.style),
  };
}

export function normalizeClipboardLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
}

function parseWeaveStyleAttribute(rawAttr: string | null): CellStyle | undefined {
  if (!rawAttr) return undefined;
  try {
    const parsed = JSON.parse(rawAttr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return cloneCellStyle(parsed as CellStyle);
  } catch {
    return undefined;
  }
}

function normalizeCssColorToHex(rawColor: string): string {
  const trimmed = rawColor.trim();
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (!rgbMatch) return trimmed;
  const toHex = (value: string) => Math.max(0, Math.min(255, Number(value))).toString(16).padStart(2, '0');
  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

function parseCssBorderEdge(value: string): BorderEdge | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none' || /^0(?:px|pt)?\b/i.test(trimmed)) return undefined;
  const widthMatch = trimmed.match(/(\d+(?:\.\d+)?)px/i);
  const px = widthMatch ? parseFloat(widthMatch[1]) : 1;
  const styleMatch = trimmed.match(/\b(double|dashed|dotted|solid|ridge|groove)\b/i);
  const rawStyle = styleMatch?.[1]?.toLowerCase();
  let style: BorderLineStyle = 'thin';
  if (rawStyle === 'double') style = 'double';
  else if (rawStyle === 'dashed') style = 'dashed';
  else if (rawStyle === 'dotted') style = 'dotted';
  else if (px >= 3) style = 'thick';
  else if (px >= 2) style = 'medium';

  const rawColor = trimmed
    .replace(/(\d+(?:\.\d+)?)(px|pt|em|rem)\b/gi, '')
    .replace(/\b(double|dashed|dotted|solid|ridge|groove|thin|medium|thick)\b/gi, '')
    .trim();
  const color = rawColor ? normalizeCssColorToHex(rawColor) : '#000000';
  return { style, color };
}

export function serializeRangeToClipboard(
  grid: SheetGrid,
  minCol: number,
  maxCol: number,
  minRow: number,
  maxRow: number
): { tsv: string; html: string } {
  const calculation = new WeakMap();
  const tsvRows: string[] = [];
  const htmlRows: string[] = [];

  for (let r = minRow; r <= maxRow; r++) {
    const rowVals: string[] = [];
    const htmlCells: string[] = [];

    for (let c = minCol; c <= maxCol; c++) {
      const id = getCellId(c, r);
      const cell = grid[id];
      const raw = cell?.raw ?? '';
      const evaluated = raw ? evaluateCellValueCached(id, grid, calculation) : '';
      const textVal = String(evaluated ?? '');
      rowVals.push(/[\t\r\n"]/.test(textVal) ? `"${textVal.replace(/"/g, '""')}"` : textVal);

      const st = cell?.style;
      const cssParts: string[] = [];
      if (st?.bold) cssParts.push('font-weight:bold');
      if (st?.italic) cssParts.push('font-style:italic');
      if (st?.underline) cssParts.push('text-decoration:underline');
      if (st?.bgColor) cssParts.push(`background-color:${st.bgColor}`);
      if (st?.textColor) cssParts.push(`color:${st.textColor}`);
      if (st?.align) cssParts.push(`text-align:${st.align}`);
      if (st?.verticalAlign) cssParts.push(`vertical-align:${st.verticalAlign}`);
      if (st?.wrapText) cssParts.push('white-space:normal');
      if (st?.fontFamily) cssParts.push(`font-family:${st.fontFamily}`);
      if (st?.fontSize) cssParts.push(`font-size:${st.fontSize}pt`);

      if (st?.borders) {
        for (const edge of BORDER_EDGES) {
          const edgeVal = st.borders[edge];
          if (edgeVal) {
            const lineStyle = edgeVal.style || 'thin';
            cssParts.push(`border-${edge}:${BORDER_WIDTH_CSS[lineStyle]} ${borderStyleToCss(lineStyle)} ${edgeVal.color || '#000000'}`);
          }
        }
      } else if (st?.border) {
        cssParts.push('border:1px solid #000000');
      }

      const styleAttr = cssParts.length > 0 ? ` style="${escapeHtml(cssParts.join(';'))}"` : '';
      const weaveStyleAttr = st && Object.keys(st).length > 0
        ? ` data-weave-style="${escapeHtml(JSON.stringify(st))}"`
        : '';
      const xlsxTypeAttr = cell?.xlsxType ? ` data-xlsx-type="${escapeHtml(cell.xlsxType)}"` : '';
      const formulaAttr = raw.startsWith('=')
        ? ` data-formula="${escapeHtml(raw)}"`
        : '';

      htmlCells.push(`<td${styleAttr}${weaveStyleAttr}${xlsxTypeAttr}${formulaAttr}>${escapeHtml(textVal)}</td>`);
    }

    tsvRows.push(rowVals.join('\t'));
    htmlRows.push(`<tr>${htmlCells.join('')}</tr>`);
  }

  const tsv = tsvRows.join('\r\n');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table data-weave-sheet="1">${htmlRows.join(
    ''
  )}</table></body></html>`;

  return { tsv, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function writeToSystemClipboard(tsv: string, html: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tsv);
    }
  } catch {
    try {
      await navigator.clipboard?.writeText(tsv);
    } catch {
      // Ignore if browser restricts clipboard
    }
  }
}

function normalizeImportedValue(rawText: string): { raw: string; stylePatch?: Partial<CellStyle> } {
  const trimmed = rawText.trim();
  if (!trimmed) return { raw: '' };

  if (trimmed.startsWith('=')) {
    return { raw: trimmed };
  }

  const currencyMatch = trimmed.match(/^\$\s*([+-]?[\d.,]+)$/);
  if (currencyMatch) {
    const cleanNum = parseFlexibleNumber(currencyMatch[1]);
    if (cleanNum !== null) {
      return {
        raw: String(cleanNum),
        stylePatch: { numberFormat: 'currency' },
      };
    }
  }

  const percentMatch = trimmed.match(/^([+-]?[\d.,]+)\s*%$/);
  if (percentMatch) {
    const cleanNum = parseFlexibleNumber(percentMatch[1]);
    if (cleanNum !== null) {
      return {
        raw: String(cleanNum / 100),
        stylePatch: { numberFormat: 'percent' },
      };
    }
  }

  if (/^[+-]?[\d.,]+$/.test(trimmed) && /\d/.test(trimmed)) {
    const number = parseFlexibleNumber(trimmed);
    if (number !== null) return { raw: String(number) };
  }
  return { raw: trimmed };
}

function parseFlexibleNumber(numStr: string): number | null {
  const s = numStr.trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      const normalized = s.replace(/\./g, '').replace(',', '.');
      const n = Number(normalized);
      return isNaN(n) ? null : n;
    } else {
      const normalized = s.replace(/,/g, '');
      const n = Number(normalized);
      return isNaN(n) ? null : n;
    }
  }
  const direct = Number(/^[+-]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.'));
  return isNaN(direct) ? null : direct;
}

export function parseHtmlTableFromClipboard(html: string): CellData[][] | null {
  if (!html || !html.toLowerCase().includes('<table')) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;

    const rows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table);
    if (rows.length === 0) return null;

    const matrix: CellData[][] = [];

    for (const [rowIndex, tr] of rows.entries()) {
      const cells = Array.from(tr.children).filter(cell => cell.tagName === 'TD' || cell.tagName === 'TH');
      if (cells.length === 0) { matrix[rowIndex] ||= []; continue; }

      const rowData: CellData[] = matrix[rowIndex] || [];
      matrix[rowIndex] = rowData;
      let column = 0;
      for (const td of cells) {
        while (rowData[column] !== undefined) column++;
        const htmlEl = td as HTMLElement;
        const formulaAttr = htmlEl.getAttribute('data-formula') || htmlEl.getAttribute('fmla');
        const weaveStyle = parseWeaveStyleAttribute(htmlEl.getAttribute('data-weave-style'));
        const xlsxTypeAttr = htmlEl.getAttribute('data-xlsx-type');
        const text = htmlEl.innerText ?? htmlEl.textContent ?? '';
        const { raw, stylePatch } = normalizeImportedValue(formulaAttr ? formulaAttr : text);

        const style: CellStyle = { ...(stylePatch || {}), ...(weaveStyle || {}) };
        if (!weaveStyle) {
          const effectiveStyle = doc.createElement('span');
          for (const sheet of doc.querySelectorAll('style')) {
            for (const rule of (sheet.textContent || '').matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
              try { if (htmlEl.matches(rule[1].trim())) effectiveStyle.style.cssText += ';' + rule[2]; } catch { /* Ignore unsupported selectors. */ }
            }
          }
          effectiveStyle.style.cssText += ';' + htmlEl.style.cssText;
          const inlineStyle = effectiveStyle.style;

          if (
            inlineStyle.fontWeight === 'bold' ||
            Number(inlineStyle.fontWeight) >= 600 ||
            td.tagName === 'TH' ||
            td.querySelector('b, strong')
          ) {
            style.bold = true;
          }
          if (inlineStyle.fontStyle === 'italic' || td.querySelector('i, em')) {
            style.italic = true;
          }
          if (inlineStyle.textDecoration.includes('underline') || td.querySelector('u')) {
            style.underline = true;
          }
          if (
            inlineStyle.backgroundColor &&
            inlineStyle.backgroundColor !== 'transparent' &&
            inlineStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
          ) {
            style.bgColor = inlineStyle.backgroundColor;
          }
          if (inlineStyle.color) {
            style.textColor = inlineStyle.color;
          }
          if (
            inlineStyle.textAlign === 'left' ||
            inlineStyle.textAlign === 'center' ||
            inlineStyle.textAlign === 'right'
          ) {
            style.align = inlineStyle.textAlign as any;
          }
          if (
            inlineStyle.verticalAlign === 'top' ||
            inlineStyle.verticalAlign === 'middle' ||
            inlineStyle.verticalAlign === 'bottom'
          ) {
            style.verticalAlign = inlineStyle.verticalAlign;
          }
          if (inlineStyle.whiteSpace === 'normal' || inlineStyle.whiteSpace === 'pre-wrap') {
            style.wrapText = true;
          }

          if (inlineStyle.fontFamily) style.fontFamily = inlineStyle.fontFamily;
          if (inlineStyle.fontSize) {
            const size = parseFloat(inlineStyle.fontSize);
            if (Number.isFinite(size)) style.fontSize = inlineStyle.fontSize.endsWith('px') ? size * 0.75 : size;
          }

          const parsedBorders: CellBorders = {};
          for (const edge of BORDER_EDGES) {
            const edgeCss = inlineStyle.getPropertyValue(`border-${edge}`);
            const parsedEdge = parseCssBorderEdge(edgeCss);
            if (parsedEdge) parsedBorders[edge] = parsedEdge;
          }
          if (Object.keys(parsedBorders).length > 0) {
            style.borders = parsedBorders;
          } else if (inlineStyle.border) {
            const uniformEdge = parseCssBorderEdge(inlineStyle.border);
            if (uniformEdge) {
              style.borders = {
                top: uniformEdge,
                right: { ...uniformEdge },
                bottom: { ...uniformEdge },
                left: { ...uniformEdge },
              };
            }
          }
        }
        const hasStyle = Object.keys(style).length > 0;
        const colSpan = Math.min(1000, Math.max(1, parseInt(htmlEl.getAttribute('colspan') || '1', 10) || 1));
        const rowSpan = Math.min(1000, Math.max(1, parseInt(htmlEl.getAttribute('rowspan') || '1', 10) || 1));
        const parsedCell: CellData = { raw, style: hasStyle ? style : undefined };
        if (xlsxTypeAttr === 'text' || xlsxTypeAttr === 'date') {
          parsedCell.xlsxType = xlsxTypeAttr;
        }
        rowData[column] = parsedCell;
        for (let row = rowIndex; row < rowIndex + rowSpan; row++) {
          matrix[row] ||= [];
          for (let col = column; col < column + colSpan; col++) {
            if (row !== rowIndex || col !== column) matrix[row][col] = { raw: '' };
          }
        }
        column += colSpan;
      }
    }
    const width = Math.max(0, ...matrix.map(row => row.length));
    if (!width) return null;
    for (const row of matrix) for (let col = 0; col < width; col++) row[col] ||= { raw: '' };

    return matrix.length > 0 ? matrix : null;
  } catch {
    return null;
  }
}

export function parseTsvFromClipboard(tsvText: string): CellData[][] {
  if (!tsvText) return [];

  const cleaned = tsvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  const rawRows = splitTsvRows(cleaned);

  return rawRows.map((rowStr) => {
    const cols = splitTsvColumns(rowStr);
    return cols.map((colText) => {
      const { raw, stylePatch } = normalizeImportedValue(colText);
      return {
        raw,
        style: stylePatch,
      };
    });
  });
}

function splitTsvRows(text: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === '\n' && !inQuotes) {
      rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  rows.push(current);
  return rows;
}

function splitTsvColumns(rowStr: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const ch = rowStr[i];
    if (ch === '"') {
      if (inQuotes && rowStr[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\t' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

@Injectable({ providedIn: 'root' })
export class SpreadsheetClipboardService {
  private internalMatrix: ClipboardMatrix | null = null;

  serializeRange = serializeRangeToClipboard;
  writeToClipboard = writeToSystemClipboard;
  parseHtmlTable = parseHtmlTableFromClipboard;
  parseTsv = parseTsvFromClipboard;

  setInternalMatrix(matrix: ClipboardMatrix): void {
    this.internalMatrix = {
      ...matrix,
      range: { ...matrix.range },
      cells: matrix.cells.map(row => row.map(cloneCellData)),
      merges: matrix.merges.map(m => ({ ...m })),
    };
  }

  getInternalMatrix(): ClipboardMatrix | null {
    if (!this.internalMatrix) return null;
    return {
      ...this.internalMatrix,
      range: { ...this.internalMatrix.range },
      cells: this.internalMatrix.cells.map(row => row.map(cloneCellData)),
      merges: this.internalMatrix.merges.map(m => ({ ...m })),
    };
  }

  getMatchingInternalMatrix(plainText: string | null | undefined): ClipboardMatrix | null {
    if (!this.internalMatrix || plainText === null || plainText === undefined) return null;
    if (normalizeClipboardLineEndings(plainText) !== normalizeClipboardLineEndings(this.internalMatrix.tsvSignature)) {
      return null;
    }
    return this.getInternalMatrix();
  }

  clearIfExternalChange(plainText: string | null | undefined): void {
    if (!this.internalMatrix || plainText === null || plainText === undefined) return;
    if (normalizeClipboardLineEndings(plainText) !== normalizeClipboardLineEndings(this.internalMatrix.tsvSignature)) {
      this.internalMatrix = null;
    }
  }

  clearInternalMatrix(): void {
    this.internalMatrix = null;
  }
}
