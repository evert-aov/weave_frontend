import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import * as katex from 'katex';
import { Note } from '../../core/models/note.model';
import { Block } from '../../core/models/block.model';
import { ExportOptions, ExportStrategy } from '../models/export.model';
import { formatMultiLineLatex } from '../../blocks/latex-block/latex-block.component';

@Injectable({
  providedIn: 'root',
})
export class PdfExportStrategy implements ExportStrategy {
  readonly format = 'pdf';
  readonly label = 'Documento PDF';
  readonly description = 'Exportación de alta fidelidad con fórmulas KaTeX, código y tablas maquetadas.';
  readonly extension = '.pdf';
  readonly mimeType = 'application/pdf';
  readonly icon = 'file';

  async export(note: Note, options: ExportOptions = {}): Promise<void> {
    const filename = options.filename || this.sanitizeFilename(note.title || 'documento');

    if (options.method === 'print') {
      this.printViaBrowser(note, options);
      return;
    }

    await this.generateDirectPdfDownload(note, filename, options);
  }

  /**
   * Genera y descarga un archivo .pdf vectorial maquetado con auto-paginación inteligente
   * evitando cortar texto o tablas a la mitad entre páginas.
   */
  private async generateDirectPdfDownload(
    note: Note,
    filename: string,
    options: ExportOptions,
  ): Promise<void> {
    const renderContainer = document.createElement('div');
    renderContainer.className = 'weave-pdf-export-render-box';
    renderContainer.style.position = 'fixed';
    renderContainer.style.top = '0';
    renderContainer.style.left = '0';
    renderContainer.style.width = '794px'; // ~210mm a 96dpi estándar para tamaño A4
    renderContainer.style.background = '#ffffff';
    renderContainer.style.color = '#111827';
    renderContainer.style.padding = '40px 48px';
    renderContainer.style.fontFamily = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    renderContainer.style.boxSizing = 'border-box';
    renderContainer.style.zIndex = '-9999';
    renderContainer.style.pointerEvents = 'none';

    renderContainer.innerHTML = `
      <style>${this.getPdfStyles()}</style>
      <div class="weave-pdf-document">
        ${this.buildNoteHtmlContent(note, options)}
      </div>
    `;
    document.body.appendChild(renderContainer);

    try {
      if ((document as any).fonts?.ready) {
        await (document as any).fonts.ready;
      }
      // Tiempo de estabilización para fuentes web, SVG y KaTeX
      await new Promise((resolve) => setTimeout(resolve, 100));

      const pdf = new jsPDF({
        orientation: options.orientation || 'portrait',
        unit: 'mm',
        format: options.pageSize?.toLowerCase() || 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;

      await new Promise<void>((resolve, reject) => {
        pdf.html(renderContainer, {
          x: margin,
          y: margin,
          width: contentWidth,
          windowWidth: 794,
          autoPaging: 'text',
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
          },
          callback: (doc) => {
            try {
              doc.save(`${filename}.pdf`);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
      });
    } finally {
      if (document.body.contains(renderContainer)) {
        document.body.removeChild(renderContainer);
      }
    }
  }

  /**
   * Abre la ventana nativa de impresión del navegador con estilos optimizados para PDF vectorial.
   */
  private printViaBrowser(note: Note, options: ExportOptions): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir el documento.');
      return;
    }

    const contentHtml = this.buildNoteHtmlContent(note, options);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>${this.escapeHtml(note.title || 'Documento Weave')}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" />
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
          <style>
            @page {
              size: ${options.pageSize || 'A4'} ${options.orientation || 'portrait'};
              margin: 16mm 16mm 20mm 16mm;
            }
            body {
              font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #111827;
              background: #ffffff;
              line-height: 1.65;
              font-size: 14px;
              margin: 0;
              padding: 24px;
            }
            @media print {
              body {
                padding: 0;
              }
              .page-break-avoid,
              .pdf-block,
              .pdf-sheet-wrapper,
              .pdf-sheet-table tr,
              .pdf-latex-block,
              .pdf-code-block,
              .pdf-image-block,
              .pdf-canvas-block {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
            ${this.getPdfStyles()}
          </style>
        </head>
        <body>
          <div class="weave-pdf-document">
            ${contentHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  /**
   * Genera el HTML semántico del documento con todos sus bloques transformados para impresión.
   */
  private buildNoteHtmlContent(note: Note, options: ExportOptions): string {
    const includeTitle = options.includeTitle !== false;
    const includeMeta = options.includeMetadata !== false;
    const includeTags = options.includeTags !== false;

    let html = '';

    // Encabezado del documento
    html += '<header class="pdf-doc-header page-break-avoid">';
    if (includeMeta && note.space) {
      html += `<div class="pdf-space-badge">${this.escapeHtml(note.space)}</div>`;
    }
    if (includeTitle) {
      html += `<h1 class="pdf-doc-title">${this.escapeHtml(note.title || 'Untitled Note')}</h1>`;
    }
    if (note.lead) {
      html += `<p class="pdf-doc-lead">${this.escapeHtml(note.lead)}</p>`;
    }
    if (includeTags && note.tags && note.tags.length > 0) {
      html += '<div class="pdf-tags-row">';
      note.tags.forEach((tag) => {
        html += `<span class="pdf-tag-chip">#${this.escapeHtml(tag)}</span>`;
      });
      html += '</div>';
    }
    html += '<hr class="pdf-header-divider" />';
    html += '</header>';

    // Cuerpo con bloques
    html += '<main class="pdf-blocks-container">';
    if (note.blocks && note.blocks.length > 0) {
      const sortedBlocks = [...note.blocks].sort((a, b) => a.order - b.order);
      for (const block of sortedBlocks) {
        html += this.renderBlockToHtml(block);
      }
    }
    html += '</main>';

    // Pie de página
    html += '<footer class="pdf-doc-footer page-break-avoid">';
    html += `<span class="pdf-footer-brand">Weave Notes</span>`;
    html += `<span class="pdf-footer-date">${new Date(note.updatedAt || Date.now()).toLocaleDateString()}</span>`;
    html += '</footer>';

    return html;
  }

  private renderBlockToHtml(block: Block): string {
    const content = block.content || {};
    switch (block.type) {
      case 'text': {
        const textContent = content['html'] || '<p></p>';
        const blockStyles = content['blockStyles'];
        const blockClass = `pdf-text-${block.id}`;

        let scopedStyles = '';
        let inlineStyleVars = '';
        if (blockStyles) {
          const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
          tags.forEach((tag) => {
            const rule = blockStyles[tag];
            if (rule) {
              const parts: string[] = [];
              if (rule.color) {
                parts.push(`color: ${rule.color} !important;`);
                inlineStyleVars += `--custom-${tag}-color: ${rule.color}; `;
              }
              if (rule.fontSize) {
                parts.push(`font-size: ${rule.fontSize} !important;`);
                inlineStyleVars += `--custom-${tag}-size: ${rule.fontSize}; `;
              }
              if (rule.fontFamily) {
                parts.push(`font-family: ${rule.fontFamily} !important;`);
                inlineStyleVars += `--custom-${tag}-font: ${rule.fontFamily}; `;
              }
              if (parts.length > 0) {
                scopedStyles += `.${blockClass} ${tag} { ${parts.join(' ')} }\n`;
                if (tag === 'p') {
                  scopedStyles += `.${blockClass} li { ${parts.join(' ')} }\n`;
                }
              }
            }
          });
        }

        const styleTag = scopedStyles ? `<style>${scopedStyles}</style>` : '';
        return `
          <div class="pdf-block pdf-text-block ${blockClass}" style="${inlineStyleVars}">
            ${styleTag}
            ${textContent}
          </div>
        `;
      }

      case 'latex': {
        const rawFormula = content['formula'] || '';
        const formula = formatMultiLineLatex(rawFormula);
        let renderedMath = '';
        try {
          renderedMath = katex.renderToString(formula, {
            displayMode: true,
            throwOnError: false,
          });
        } catch {
          renderedMath = `<code>${this.escapeHtml(rawFormula)}</code>`;
        }
        return `
          <div class="pdf-block pdf-latex-block page-break-avoid">
            <div class="pdf-latex-inner">${renderedMath}</div>
          </div>
        `;
      }

      case 'code': {
        const code = content['code'] || '';
        const lang = content['language'] || 'plaintext';
        return `
          <div class="pdf-block pdf-code-block page-break-avoid">
            <div class="pdf-code-header">
              <span class="pdf-code-lang">${this.escapeHtml(lang)}</span>
            </div>
            <pre class="pdf-code-pre"><code>${this.escapeHtml(code)}</code></pre>
          </div>
        `;
      }

      case 'sheet': {
        return this.renderSheetToHtmlTable(block);
      }

      case 'image': {
        const url = content['url'] || '';
        const caption = content['caption'] || '';
        if (!url) return '';
        return `
          <figure class="pdf-block pdf-image-block page-break-avoid">
            <img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(caption)}" class="pdf-image" />
            ${caption ? `<figcaption class="pdf-image-caption">${this.escapeHtml(caption)}</figcaption>` : ''}
          </figure>
        `;
      }

      case 'mermaid': {
        const chart = content['chartDefinition'] || '';
        return `
          <div class="pdf-block pdf-mermaid-block page-break-avoid">
            <div class="pdf-mermaid-header">Diagrama Mermaid</div>
            <pre class="pdf-code-pre"><code>${this.escapeHtml(chart)}</code></pre>
          </div>
        `;
      }

      case 'canvas': {
        const dataUrl = this.getCanvasBlockImage(block.id);
        if (dataUrl) {
          return `
            <div class="pdf-block pdf-canvas-block page-break-avoid">
              <div class="pdf-canvas-card">
                <img src="${dataUrl}" alt="Pizarra Excalidraw" class="pdf-canvas-img" />
              </div>
            </div>
          `;
        }
        return `
          <div class="pdf-block pdf-canvas-placeholder page-break-avoid">
            <div class="pdf-canvas-badge">🎨 Pizarra Vectorial Excalidraw</div>
            <div class="pdf-canvas-note">Contenido interactivo sincronizado en Weave</div>
          </div>
        `;
      }

      default:
        return '';
    }
  }

  /**
   * Captura en vivo los trazos vectoriales del lienzo Excalidraw montado en el DOM,
   * exportándolo a una imagen PNG de alta resolución.
   */
  private getCanvasBlockImage(blockId: string): string | null {
    if (typeof document === 'undefined') return null;
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockEl) return null;

    const canvases = Array.from(blockEl.querySelectorAll('canvas')) as HTMLCanvasElement[];
    if (canvases.length === 0) return null;

    try {
      const primaryCanvas = canvases.find((c) => c.width > 0 && c.height > 0) || canvases[0];
      if (!primaryCanvas || primaryCanvas.width === 0 || primaryCanvas.height === 0) return null;

      const offscreen = document.createElement('canvas');
      offscreen.width = primaryCanvas.width;
      offscreen.height = primaryCanvas.height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      for (const canvas of canvases) {
        if (canvas.width > 0 && canvas.height > 0) {
          ctx.drawImage(canvas, 0, 0);
        }
      }

      return offscreen.toDataURL('image/png');
    } catch (err) {
      console.warn('No se pudo capturar canvas vectorial:', err);
      return null;
    }
  }

  /**
   * Transforma el snapshot de Univer Spreadsheet en una tabla HTML limpia para impresión,
   * con separadores de celda estables y sin cortes de texto.
   */
  private renderSheetToHtmlTable(block: Block): string {
    const workbookData = block.content?.['workbookData'];
    const sheet = Object.values(workbookData?.sheets || {})[0] as any;
    const cellData = sheet?.cellData || {};

    const rowIndices = Object.keys(cellData).map(Number).sort((a, b) => a - b);
    if (rowIndices.length === 0) {
      return '';
    }

    let maxCol = 0;
    rowIndices.forEach((r) => {
      const row = cellData[r] || {};
      const colIndices = Object.keys(row).map(Number);
      colIndices.forEach((c) => {
        if (c > maxCol) maxCol = c;
      });
    });

    let tableHtml = '<div class="pdf-block pdf-sheet-wrapper page-break-avoid">';
    tableHtml += '<table class="pdf-sheet-table">';
    tableHtml += '<thead><tr>';
    tableHtml += '<th class="pdf-sheet-th-corner">#</th>';
    for (let c = 0; c <= maxCol; c++) {
      const colLetter = String.fromCharCode(65 + (c % 26));
      tableHtml += `<th class="pdf-sheet-th">${colLetter}</th>`;
    }
    tableHtml += '</tr></thead>';

    tableHtml += '<tbody>';
    rowIndices.forEach((r) => {
      const row = cellData[r] || {};
      tableHtml += '<tr>';
      tableHtml += `<td class="pdf-sheet-row-index">${r + 1}</td>`;
      for (let c = 0; c <= maxCol; c++) {
        const cell = row[c];
        const val = cell?.v !== undefined && cell?.v !== null ? String(cell.v) : '';
        const isNumeric = val !== '' && !isNaN(Number(val));
        tableHtml += `<td class="pdf-sheet-td ${isNumeric ? 'text-right' : ''}">${this.escapeHtml(val)}</td>`;
      }
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
    tableHtml += '</div>';

    return tableHtml;
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

  private getPdfStyles(): string {
    return `
      .weave-pdf-document {
        max-width: 800px;
        margin: 0 auto;
        color: #111827;
      }
      .pdf-doc-header {
        margin-bottom: 24px;
      }
      .pdf-space-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6366f1;
        background: #eef2ff;
        padding: 3px 9px;
        border-radius: 4px;
        margin-bottom: 10px;
      }
      .pdf-doc-title {
        font-size: 28px;
        font-weight: 700;
        margin: 4px 0 10px 0;
        color: #111827;
        line-height: 1.25;
      }
      .pdf-doc-lead {
        font-size: 15px;
        color: #4b5563;
        margin: 0 0 12px 0;
        line-height: 1.5;
      }
      .pdf-tags-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 14px;
      }
      .pdf-tag-chip {
        font-size: 11px;
        color: #4b5563;
        background: #f3f4f6;
        padding: 2px 7px;
        border-radius: 3px;
      }
      .pdf-header-divider {
        border: 0;
        border-top: 1px solid #e5e7eb;
        margin: 16px 0;
      }
      .pdf-blocks-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .pdf-block {
        margin: 4px 0;
      }
      .page-break-avoid,
      .pdf-block,
      .pdf-sheet-wrapper,
      .pdf-sheet-table tr,
      .pdf-latex-block,
      .pdf-code-block,
      .pdf-image-block,
      .pdf-canvas-block {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .pdf-text-block p {
        margin: 0 0 10px 0;
        font-size: 14px;
        line-height: 1.68;
        color: #1f2937;
      }
      .pdf-text-block h1 {
        font-size: 22px;
        font-weight: 700;
        margin: 20px 0 8px;
        color: #111827;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 4px;
      }
      .pdf-text-block h2 {
        font-size: 18px;
        font-weight: 700;
        margin: 16px 0 6px;
        color: #111827;
      }
      .pdf-text-block h3 {
        font-size: 15px;
        font-weight: 600;
        margin: 12px 0 4px;
        color: #1f2937;
      }
      .pdf-text-block h4 {
        font-size: 14px;
        font-weight: 600;
        margin: 10px 0 4px;
        color: #1f2937;
      }
      .pdf-text-block h5 {
        font-size: 13px;
        font-weight: 600;
        margin: 8px 0 3px;
        color: #374151;
      }
      .pdf-text-block h6 {
        font-size: 12px;
        font-weight: 600;
        margin: 8px 0 3px;
        color: #4b5563;
      }
      .pdf-text-block ul, .pdf-text-block ol {
        margin: 6px 0 12px 20px;
        padding: 0;
      }
      .pdf-text-block li {
        margin-bottom: 4px;
      }
      .pdf-text-block blockquote {
        margin: 12px 0;
        padding: 8px 16px;
        background: #f9fafb;
        border-left: 3px solid #6366f1;
        color: #4b5563;
        font-style: italic;
      }
      .pdf-latex-block {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 14px 20px;
        margin: 12px 0;
      }
      .pdf-latex-inner {
        display: flex;
        justify-content: center;
        overflow-x: auto;
      }
      .pdf-code-block {
        background: #1f2937;
        border-radius: 6px;
        overflow: hidden;
        margin: 12px 0;
      }
      .pdf-code-header {
        background: #111827;
        padding: 5px 12px;
        font-size: 11px;
        color: #9ca3af;
        font-family: monospace;
      }
      .pdf-code-pre {
        margin: 0;
        padding: 12px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #f3f4f6;
        line-height: 1.5;
        overflow-x: auto;
      }
      .pdf-sheet-wrapper {
        margin: 12px 0;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        overflow-x: auto;
        background: #ffffff;
      }
      .pdf-sheet-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 11.5px;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .pdf-sheet-th-corner, .pdf-sheet-th {
        background: #f3f4f6;
        border-bottom: 1px solid #d1d5db;
        border-right: 1px solid #e5e7eb;
        padding: 6px 10px;
        font-weight: 600;
        color: #4b5563;
        text-align: center;
        box-sizing: border-box;
      }
      .pdf-sheet-row-index {
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        border-right: 1px solid #d1d5db;
        padding: 5px 8px;
        color: #6b7280;
        text-align: center;
        font-weight: 500;
        box-sizing: border-box;
      }
      .pdf-sheet-td {
        border-bottom: 1px solid #e5e7eb;
        border-right: 1px solid #e5e7eb;
        padding: 5px 10px;
        color: #1f2937;
        box-sizing: border-box;
        word-break: break-word;
      }
      .pdf-sheet-td.text-right {
        text-align: right;
      }
      .pdf-image-block {
        margin: 14px 0;
        text-align: center;
      }
      .pdf-image {
        max-width: 100%;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
      }
      .pdf-image-caption {
        font-size: 12px;
        color: #6b7280;
        margin-top: 6px;
        font-style: italic;
      }
      .pdf-canvas-block {
        margin: 14px 0;
        text-align: center;
      }
      .pdf-canvas-card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #ffffff;
        padding: 8px;
        display: inline-block;
        max-width: 100%;
      }
      .pdf-canvas-img {
        max-width: 100%;
        height: auto;
        display: block;
        border-radius: 4px;
        margin: 0 auto;
      }
      .pdf-canvas-placeholder {
        padding: 16px;
        background: #f9fafb;
        border: 1px dashed #d1d5db;
        border-radius: 6px;
        text-align: center;
      }
      .pdf-canvas-badge {
        font-weight: 600;
        color: #374151;
        font-size: 13px;
      }
      .pdf-canvas-note {
        font-size: 11.5px;
        color: #6b7280;
        margin-top: 4px;
      }
      .pdf-doc-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 32px;
        padding-top: 12px;
        border-top: 1px solid #e5e7eb;
        font-size: 11px;
        color: #9ca3af;
      }
    `;
  }
}
