import { renderFormula } from '../../shared/latex/render-formula';
import { Injectable } from '@angular/core';
import { Note } from '../../core/models/note.model';
import { Block } from '../../core/models/block.model';
import { ExportOptions, ExportStrategy } from '../models/export.model';
import { isLatexDocument, normalizeLatexAlignment, normalizeLatexFontSize } from '../../shared/utils/latex';

@Injectable({
  providedIn: 'root',
})
export class HtmlExportStrategy implements ExportStrategy {
  readonly format = 'html';
  readonly label = 'Página Web (.html)';
  readonly description = 'Archivo HTML autónomo con estilos integrados para visualizar en cualquier navegador.';
  readonly extension = '.html';
  readonly mimeType = 'text/html';
  readonly icon = 'file';

  async export(note: Note, options: ExportOptions = {}): Promise<void> {
    const filename = options.filename || this.sanitizeFilename(note.title || 'documento');
    const html = this.buildFullHtml(note, options);

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    this.downloadBlob(blob, `${filename}.html`);
  }

  private buildFullHtml(note: Note, options: ExportOptions): string {
    const title = this.escapeHtml(note.title || 'Documento Weave');
    const sortedBlocks = [...(note.blocks || [])].sort((a, b) => a.order - b.order);

    let blocksHtml = '';
    for (const block of sortedBlocks) {
      blocksHtml += this.renderBlockToHtml(block);
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 820px;
      margin: 40px auto;
      padding: 0 24px;
      color: #111827;
      line-height: 1.65;
      background: #fafafa;
    }
    .weave-paper {
      background: #ffffff;
      padding: 48px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6366f1;
      background: #eef2ff;
      padding: 3px 9px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    h1.doc-title { font-size: 32px; font-weight: 800; margin: 0 0 10px 0; color: #111827; }
    p.doc-lead { font-size: 16px; color: #4b5563; margin: 0 0 14px 0; }
    .tags { display: flex; gap: 6px; margin-bottom: 20px; }
    .tag { font-size: 11px; background: #f3f4f6; color: #4b5563; padding: 2px 8px; border-radius: 4px; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .block { margin: 16px 0; }
    .text-block { font-size: 16.8px; line-height: 1.68; }
    .text-block p { font-size: 16.8px; line-height: 1.68; margin: 0 0 10px 0; }
    pre { background: #1f2937; color: #f9fafb; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    .table-box table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    .table-box th, .table-box td { border: 1px solid #e5e7eb; padding: 8px 12px; }
    .table-box th { background: #f9fafb; font-weight: 600; }
    .latex-box { background: #f9fafb; padding: 12px 18px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; font-size: 11.5px; }
    .latex-box .katex-display, .latex-box .katex-display > .katex { text-align: inherit; }
    .latex-box .katex { font-size: 1em !important; }
    img { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="weave-paper">
    ${options.includeMetadata !== false && note.space ? `<span class="badge">${this.escapeHtml(note.space)}</span>` : ''}
    ${options.includeTitle !== false ? `<h1 class="doc-title">${title}</h1>` : ''}
    ${note.lead ? `<p class="doc-lead">${this.escapeHtml(note.lead)}</p>` : ''}
    ${options.includeTags !== false && note.tags?.length ? `<div class="tags">${note.tags.map((t) => `<span class="tag">#${this.escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <hr>
    ${blocksHtml}
  </div>
</body>
</html>`;
  }

  private renderBlockToHtml(block: Block): string {
    const content = block.content || {};
    switch (block.type) {
      case 'text': {
        const textContent = content['html'] || '';
        const blockStyles = content['blockStyles'];
        let scoped = '';
        if (blockStyles) {
          const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
          tags.forEach((tag) => {
            const rule = blockStyles[tag];
            if (rule) {
              const parts: string[] = [];
              if (rule.color) parts.push(`color: ${rule.color};`);
              if (rule.fontSize) parts.push(`font-size: ${rule.fontSize};`);
              if (rule.fontFamily) parts.push(`font-family: ${rule.fontFamily};`);
              if (parts.length > 0) scoped += `.block-${block.id} ${tag} { ${parts.join(' ')} }\n`;
            }
          });
        }
        return `
          <div class="block text-block block-${block.id}">
            ${scoped ? `<style>${scoped}</style>` : ''}
            ${textContent}
          </div>
        `;
      }
      case 'latex': {
        const rawFormula = content['formula'] || '';
        if (content['mode'] === 'document' || isLatexDocument(rawFormula)) {
          return `<div class="block"><p>LaTeX avanzado — código fuente. Descarga el PDF desde la vista previa del bloque.</p><pre><code>${this.escapeHtml(rawFormula)}</code></pre></div>`;
        }
        let rendered = '';
        try {
          rendered = renderFormula(rawFormula, content);
        } catch {
          rendered = this.escapeHtml(rawFormula);
        }
        return `<div class="block latex-box" style="font-size: ${normalizeLatexFontSize(content['fontSizePx'])}px; text-align: ${normalizeLatexAlignment(content['alignment'])};">${rendered}</div>`;
      }
      case 'code':
        return `<div class="block"><pre><code>${this.escapeHtml(content['code'] || '')}</code></pre></div>`;
      case 'image':
        return `<div class="block"><img src="${this.escapeHtml(content['url'] || '')}" alt="${this.escapeHtml(content['caption'] || '')}"></div>`;
      case 'mermaid': {
        const blockEl = typeof document !== 'undefined' ? document.querySelector(`[data-block-id="${block.id}"]`) : null;
        const svgEl = blockEl?.querySelector('.svg-container svg');
        if (svgEl) {
          return `<div class="block mermaid-box" style="text-align: center; margin: 16px 0;">${svgEl.outerHTML}</div>`;
        }
        return `<div class="block"><pre><code>${this.escapeHtml(content['chart'] || content['chartDefinition'] || '')}</code></pre></div>`;
      }
      case 'sheet': {
        return this.renderSheetToHtml(block);
      }
      default:
        return '';
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private renderSheetToHtml(block: Block): string {
    const workbookData = block.content?.['workbookData'];
    if (!workbookData?.sheets) return '';

    const sheet = Object.values(workbookData.sheets)[0] as any;
    if (!sheet) return '';

    const cellData = sheet.cellData || {};
    const stylesDict = workbookData.styles || {};
    const mergeData: Array<{
      startRow: number;
      endRow: number;
      startColumn: number;
      endColumn: number;
    }> = sheet.mergeData || [];

    const getCellValue = (cell: any): string => {
      if (!cell) return '';
      if (cell.v !== undefined && cell.v !== null && cell.v !== '') return String(cell.v);
      if (cell.p?.body?.dataStream) return String(cell.p.body.dataStream).replace(/\r?\n$/, '');
      if (cell.m !== undefined && cell.m !== null && cell.m !== '') return String(cell.m);
      return '';
    };

    const getCellInlineStyle = (cell: any, isNumeric: boolean): string => {
      if (!cell) return isNumeric ? 'text-align: right;' : '';

      let styleObj: any = null;
      if (typeof cell.s === 'string') {
        styleObj = stylesDict[cell.s];
      } else if (typeof cell.s === 'object' && cell.s !== null) {
        styleObj = cell.s;
      }

      const cssProps: string[] = [];

      // Alineación horizontal
      if (styleObj?.ht !== undefined) {
        if (styleObj.ht === 1) cssProps.push('text-align: left');
        else if (styleObj.ht === 2) cssProps.push('text-align: center');
        else if (styleObj.ht === 3) cssProps.push('text-align: right');
        else if (styleObj.ht === 4) cssProps.push('text-align: justify');
      } else if (isNumeric) {
        cssProps.push('text-align: right');
      }

      // Alineación vertical
      const vt = styleObj?.vt ?? styleObj?.va;
      if (vt !== undefined) {
        if (vt === 1) cssProps.push('vertical-align: top');
        else if (vt === 2) cssProps.push('vertical-align: middle');
        else if (vt === 3) cssProps.push('vertical-align: bottom');
      }

      // Color de fondo
      if (styleObj?.bg) {
        const bgVal = typeof styleObj.bg === 'string' ? styleObj.bg : styleObj.bg?.rgb;
        if (bgVal) {
          cssProps.push(`background-color: ${bgVal}`);
        }
      }

      // Color de texto
      if (styleObj?.cl) {
        const clVal = typeof styleObj.cl === 'string' ? styleObj.cl : styleObj.cl?.rgb;
        if (clVal) {
          cssProps.push(`color: ${clVal}`);
        }
      }

      // Negrita
      if (styleObj?.bl === 1 || styleObj?.bl === true) {
        cssProps.push('font-weight: 700');
      }

      // Cursiva
      if (styleObj?.it === 1 || styleObj?.it === true) {
        cssProps.push('font-style: italic');
      }

      // Subrayado / Tachado
      const textDecorations: string[] = [];
      if (styleObj?.ul === 1 || styleObj?.ul === true || styleObj?.ul?.s === 1) {
        textDecorations.push('underline');
      }
      if (styleObj?.st === 1 || styleObj?.st === true || styleObj?.st?.s === 1) {
        textDecorations.push('line-through');
      }
      if (textDecorations.length > 0) {
        cssProps.push(`text-decoration: ${textDecorations.join(' ')}`);
      }

      // Tipografía
      if (styleObj?.ff) {
        cssProps.push(`font-family: ${styleObj.ff}`);
      }

      // Tamaño de fuente
      if (styleObj?.fs) {
        cssProps.push(`font-size: ${styleObj.fs}pt`);
      }

      // Padding configurado en la hoja de cálculo (si no está configurado, 0 por defecto)
      if (styleObj?.pd) {
        const t = styleObj.pd.t ?? 0;
        const r = styleObj.pd.r ?? 0;
        const b = styleObj.pd.b ?? 0;
        const l = styleObj.pd.l ?? 0;
        cssProps.push(`padding: ${t}px ${r}px ${b}px ${l}px`);
      }

      // Bordes personalizados si están definidos
      if (styleObj?.bd) {
        const getBorderCss = (b: any) => {
          if (!b) return null;
          const color = typeof b.cl === 'string' ? b.cl : b.cl?.rgb || '#d1d5db';
          return `1px solid ${color}`;
        };
        if (styleObj.bd.t) cssProps.push(`border-top: ${getBorderCss(styleObj.bd.t)}`);
        if (styleObj.bd.r) cssProps.push(`border-right: ${getBorderCss(styleObj.bd.r)}`);
        if (styleObj.bd.b) cssProps.push(`border-bottom: ${getBorderCss(styleObj.bd.b)}`);
        if (styleObj.bd.l) cssProps.push(`border-left: ${getBorderCss(styleObj.bd.l)}`);
      }

      return cssProps.length > 0 ? cssProps.join('; ') + ';' : '';
    };

    const rowKeys = Object.keys(cellData).map(Number);
    let maxRow = -1;
    let maxCol = -1;

    rowKeys.forEach((r) => {
      const row = cellData[r] || {};
      Object.keys(row).map(Number).forEach((c) => {
        if (getCellValue(row[c]).trim().length > 0) {
          if (r > maxRow) maxRow = r;
          if (c > maxCol) maxCol = c;
        }
      });
    });

    mergeData.forEach((m) => {
      let mergeHasContent = false;
      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startColumn; c <= m.endColumn; c++) {
          if (getCellValue(cellData[r]?.[c]).trim().length > 0) {
            mergeHasContent = true;
            break;
          }
        }
        if (mergeHasContent) break;
      }

      if (mergeHasContent) {
        if (m.endRow > maxRow) maxRow = m.endRow;
        if (m.endColumn > maxCol) maxCol = m.endColumn;
      }
    });

    if (maxRow < 0) return '';
    if (maxCol < 0) maxCol = 0;

    const mergeRoots = new Map<string, { rowSpan: number; colSpan: number }>();
    const coveredCells = new Set<string>();

    mergeData.forEach((m) => {
      const rowSpan = m.endRow - m.startRow + 1;
      const colSpan = m.endColumn - m.startColumn + 1;

      mergeRoots.set(`${m.startRow},${m.startColumn}`, {
        rowSpan,
        colSpan,
      });
      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startColumn; c <= m.endColumn; c++) {
          if (r !== m.startRow || c !== m.startColumn) {
            coveredCells.add(`${r},${c}`);
          }
        }
      }
    });

    const columnData = sheet.columnData || {};
    const defaultColWidth = sheet.defaultColumnWidth || 80;
    const colWidths: number[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const colItem = columnData[c];
      if (colItem?.hd === 1) {
        colWidths.push(0);
      } else if (colItem?.w != null) {
        colWidths.push(Number(colItem.w));
      } else {
        colWidths.push(defaultColWidth);
      }
    }
    const totalColsWidth = colWidths.reduce((sum, w) => sum + w, 0);

    let html = '<div class="block table-box"><table style="width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0;">';

    if (totalColsWidth > 0) {
      html += '<colgroup>';
      for (let c = 0; c <= maxCol; c++) {
        const pct = ((colWidths[c] / totalColsWidth) * 100).toFixed(2);
        html += `<col style="width: ${pct}%;" />`;
      }
      html += '</colgroup>';
    }

    html += '<tbody>';

    for (let r = 0; r <= maxRow; r++) {
      const row = cellData[r] || {};
      html += '<tr>';
      for (let c = 0; c <= maxCol; c++) {
        const key = `${r},${c}`;
        if (coveredCells.has(key)) continue;

        const cell = row[c];
        const rawVal = getCellValue(cell);
        const isNumeric = rawVal !== '' && !isNaN(Number(rawVal)) && !rawVal.includes('\n');
        const formattedVal = this.escapeHtml(rawVal).replace(/\r?\n/g, '<br/>');
        const mergeInfo = mergeRoots.get(key);
        let spanAttrs = '';
        if (mergeInfo) {
          if (mergeInfo.rowSpan > 1) spanAttrs += ` rowspan="${mergeInfo.rowSpan}"`;
          if (mergeInfo.colSpan > 1) spanAttrs += ` colspan="${mergeInfo.colSpan}"`;
        }

        const inlineStyle = getCellInlineStyle(cell, isNumeric);
        const baseStyle = 'border: 1px solid #e5e7eb; padding: 0; word-break: normal; overflow-wrap: break-word; line-height: 1.4; vertical-align: top; box-sizing: border-box;';
        const fullStyle = inlineStyle ? `${baseStyle} ${inlineStyle}` : baseStyle;

        html += `<td style="${fullStyle}"${spanAttrs}>${formattedVal}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
