import { Injectable } from '@angular/core';
import { CellData, CellStyle, SheetGrid } from '../models/excel.model';
import { evaluateCellValueCached, getCellId } from './formula-engine.service';

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
      if (st?.fontFamily) cssParts.push(`font-family:${st.fontFamily}`);
      if (st?.fontSize) cssParts.push(`font-size:${st.fontSize}pt`);

      const styleAttr = cssParts.length > 0 ? ` style="${cssParts.join(';')}"` : '';
      const formulaAttr = raw.startsWith('=')
        ? ` data-formula="${escapeHtml(raw)}"`
        : '';

      htmlCells.push(`<td${styleAttr}${formulaAttr}>${escapeHtml(textVal)}</td>`);
    }

    tsvRows.push(rowVals.join('\t'));
    htmlRows.push(`<tr>${htmlCells.join('')}</tr>`);
  }

  const tsv = tsvRows.join('\r\n');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body><table>${htmlRows.join(
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
        const text = htmlEl.innerText ?? htmlEl.textContent ?? '';
        const { raw, stylePatch } = normalizeImportedValue(formulaAttr ? formulaAttr : text);

        const style: CellStyle = { ...(stylePatch || {}) };
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

        if (inlineStyle.fontFamily) style.fontFamily = inlineStyle.fontFamily;
        if (inlineStyle.fontSize) {
          const size = parseFloat(inlineStyle.fontSize);
          if (Number.isFinite(size)) style.fontSize = inlineStyle.fontSize.endsWith('px') ? size * 0.75 : size;
        }
        const hasStyle = Object.keys(style).length > 0;
        const colSpan = Math.min(1000, Math.max(1, parseInt(htmlEl.getAttribute('colspan') || '1', 10) || 1));
        const rowSpan = Math.min(1000, Math.max(1, parseInt(htmlEl.getAttribute('rowspan') || '1', 10) || 1));
        rowData[column] = { raw, style: hasStyle ? style : undefined };
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
  serializeRange = serializeRangeToClipboard;
  writeToClipboard = writeToSystemClipboard;
  parseHtmlTable = parseHtmlTableFromClipboard;
  parseTsv = parseTsvFromClipboard;
}
