import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
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
   * Genera y descarga un archivo .pdf directo con paginación inteligente por límites de elementos:
   * - Respeta límites entre párrafos, encabezados, tablas y fórmulas KaTeX sin cortar texto a la mitad.
   * - Incluye estilos completos de fuentes y KaTeX en el contenedor de rasterizado.
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
    renderContainer.style.padding = '36px 44px';
    renderContainer.style.fontFamily = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    renderContainer.style.boxSizing = 'border-box';
    renderContainer.style.zIndex = '-9999';
    renderContainer.style.pointerEvents = 'none';

    renderContainer.innerHTML = `
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" />
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
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
      await new Promise((resolve) => setTimeout(resolve, 150));

      const fullCanvas = await html2canvas(renderContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });

      const pdf = new jsPDF({
        orientation: options.orientation || 'portrait',
        unit: 'mm',
        format: options.pageSize?.toLowerCase() || 'a4',
      });

      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();
      const marginMm = 12;
      const contentWidthMm = pageWidthMm - marginMm * 2;
      const contentHeightMm = pageHeightMm - marginMm * 2;

      const pxPerMm = fullCanvas.width / contentWidthMm;
      const maxPageHeightPx = contentHeightMm * pxPerMm;

      const containerRect = renderContainer.getBoundingClientRect();
      const breakableNodes = Array.from(
        renderContainer.querySelectorAll<HTMLElement>(
          '.pdf-doc-header, .pdf-text-block > *, .pdf-sheet-wrapper, .pdf-sheet-table tr, .pdf-latex-block, .pdf-code-block, .pdf-image-block, .pdf-canvas-block, .pdf-doc-footer'
        )
      );

      const elementBounds = breakableNodes
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            top: (r.top - containerRect.top) * 2,
            bottom: (r.bottom - containerRect.top) * 2,
            isHeading: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName),
          };
        })
        .filter((b) => b.bottom > b.top);

      let currentY = 0;
      const totalHeightPx = fullCanvas.height;
      let pageIndex = 0;

      while (currentY < totalHeightPx) {
        const theoreticalBottom = currentY + maxPageHeightPx;
        let breakY = theoreticalBottom;

        if (theoreticalBottom < totalHeightPx) {
          // Si un elemento queda partido por la mitad al final de la página, cortar antes de él
          const crossing = elementBounds.find(
            (b) => b.top < theoreticalBottom && b.bottom > theoreticalBottom
          );

          if (crossing && crossing.top > currentY + 100) {
            breakY = crossing.top;
          } else {
            // Evitar encabezados huérfanos al pie de página
            const orphanHeading = elementBounds.find(
              (b) => b.isHeading && b.top < theoreticalBottom && b.top > theoreticalBottom - 120
            );
            if (orphanHeading && orphanHeading.top > currentY + 100) {
              breakY = orphanHeading.top;
            }
          }
        } else {
          breakY = totalHeightPx;
        }

        if (breakY <= currentY) {
          breakY = Math.min(currentY + maxPageHeightPx, totalHeightPx);
        }

        const sliceHeightPx = breakY - currentY;
        const sliceHeightMm = (sliceHeightPx * contentWidthMm) / fullCanvas.width;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = fullCanvas.width;
        pageCanvas.height = sliceHeightPx;
        const pageCtx = pageCanvas.getContext('2d');

        if (pageCtx) {
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            fullCanvas,
            0,
            currentY,
            fullCanvas.width,
            sliceHeightPx,
            0,
            0,
            pageCanvas.width,
            sliceHeightPx,
          );

          if (pageIndex > 0) {
            pdf.addPage();
          }

          const imgData = pageCanvas.toDataURL('image/jpeg', 0.98);
          pdf.addImage(imgData, 'JPEG', marginMm, marginMm, contentWidthMm, sliceHeightMm);
          pageIndex++;
        }

        currentY = breakY;
      }

      pdf.save(`${filename}.pdf`);
    } finally {
      if (document.body.contains(renderContainer)) {
        document.body.removeChild(renderContainer);
      }
    }
  }

  /**
   * Abre la ventana nativa de impresión del navegador con estilos optimizados para PDF vectorial.
   * Flujo continuo sin páginas en blanco artificiales.
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
              .pdf-blocks-container {
                display: block !important;
              }
              .pdf-block,
              .pdf-text-block {
                display: block !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
              }
              .page-break-avoid,
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
        const blockEl = typeof document !== 'undefined' ? document.querySelector(`[data-block-id="${block.id}"]`) : null;
        const svgEl = blockEl?.querySelector('.svg-container svg');
        if (svgEl) {
          const rawSvg = svgEl.outerHTML;
          // Remover estilos que limitan max-width y asegurar que el SVG se expanda responsivamente al ancho de página
          const responsiveSvg = rawSvg
            .replace(/style="[^"]*max-width:[^"]*"/i, 'style="width: 100%; height: auto;"')
            .replace(/max-width:[^;"]+;?/gi, '');

          return `
            <div class="pdf-block pdf-mermaid-block page-break-avoid">
              <div class="pdf-mermaid-svg-box">
                ${responsiveSvg}
              </div>
            </div>
          `;
        }
        const chart = content['chart'] || content['chartDefinition'] || '';
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
   * preservando celdas combinadas (rowspan y colspan) y texto enriquecido con saltos de línea.
   */
  private renderSheetToHtmlTable(block: Block): string {
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

    // Helper para extraer el texto limpio de una celda de Univer (soporta .v, .p rich text, .m)
    const getCellValue = (cell: any): string => {
      if (!cell) return '';
      if (cell.v !== undefined && cell.v !== null && cell.v !== '') {
        return String(cell.v);
      }
      if (cell.p?.body?.dataStream) {
        return String(cell.p.body.dataStream).replace(/\r?\n$/, '');
      }
      if (cell.m !== undefined && cell.m !== null && cell.m !== '') {
        return String(cell.m);
      }
      return '';
    };

    // Helper para extraer estilos CSS de los metadatos de Univer
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

    // Identificar qué celdas están ocupadas con datos reales (sin arrastrar columnas vacías)
    const rowKeys = Object.keys(cellData).map(Number);
    let maxRow = -1;
    let maxCol = -1;

    // Buscar filas y columnas con contenido real
    rowKeys.forEach((r) => {
      const row = cellData[r] || {};
      const colKeys = Object.keys(row).map(Number);
      colKeys.forEach((c) => {
        const val = getCellValue(row[c]);
        if (val.trim().length > 0) {
          if (r > maxRow) maxRow = r;
          if (c > maxCol) maxCol = c;
        }
      });
    });

    // Incluir celdas combinadas únicamente si contienen contenido real
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

    if (maxRow < 0) {
      return '';
    }

    if (maxCol < 0) maxCol = 0;

    // Mapeo de celdas combinadas:
    // mergeRoots: clave "r,c" => { rowSpan, colSpan }
    // coveredCells: Set de "r,c" que se omiten en el HTML porque están cubiertas por una combinación previa
    const mergeRoots = new Map<string, { rowSpan: number; colSpan: number }>();
    const coveredCells = new Set<string>();

    mergeData.forEach((m) => {
      const rowSpan = m.endRow - m.startRow + 1;
      const colSpan = m.endColumn - m.startColumn + 1;

      mergeRoots.set(`${m.startRow},${m.startColumn}`, { rowSpan, colSpan });

      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startColumn; c <= m.endColumn; c++) {
          if (r !== m.startRow || c !== m.startColumn) {
            coveredCells.add(`${r},${c}`);
          }
        }
      }
    });

    // Extraer anchos de columnas desde los metadatos de Univer para respetar proporciones exactas
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

    let tableHtml = '<div class="pdf-block pdf-sheet-wrapper page-break-avoid">';
    tableHtml += '<table class="pdf-sheet-table" style="table-layout: fixed; width: 100%; border-collapse: collapse;">';

    if (totalColsWidth > 0) {
      tableHtml += '<colgroup>';
      for (let c = 0; c <= maxCol; c++) {
        const pct = ((colWidths[c] / totalColsWidth) * 100).toFixed(2);
        tableHtml += `<col style="width: ${pct}%;" />`;
      }
      tableHtml += '</colgroup>';
    }

    tableHtml += '<tbody>';

    for (let r = 0; r <= maxRow; r++) {
      const row = cellData[r] || {};
      tableHtml += '<tr>';

      for (let c = 0; c <= maxCol; c++) {
        const key = `${r},${c}`;

        // Si la celda está cubierta por una combinación previa, omitirla para no desplazar columnas
        if (coveredCells.has(key)) {
          continue;
        }

        const cell = row[c];
        const rawVal = getCellValue(cell);
        const isNumeric = rawVal !== '' && !isNaN(Number(rawVal)) && !rawVal.includes('\n');

        // Formatear saltos de línea para celdas de texto enriquecido / párrafos
        const formattedVal = this.escapeHtml(rawVal).replace(/\r?\n/g, '<br/>');

        const mergeInfo = mergeRoots.get(key);
        let spanAttrs = '';
        if (mergeInfo) {
          if (mergeInfo.rowSpan > 1) spanAttrs += ` rowspan="${mergeInfo.rowSpan}"`;
          if (mergeInfo.colSpan > 1) spanAttrs += ` colspan="${mergeInfo.colSpan}"`;
        }

        const inlineStyle = getCellInlineStyle(cell, isNumeric);
        const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';

        tableHtml += `<td class="pdf-sheet-td"${styleAttr}${spanAttrs}>${formattedVal}</td>`;
      }
      tableHtml += '</tr>';
    }
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
        margin-bottom: 20px;
        page-break-inside: avoid;
        break-inside: avoid;
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
        display: block;
      }
      .pdf-block {
        display: block;
        margin: 12px 0;
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      .pdf-text-block {
        display: block;
        page-break-inside: auto !important;
        break-inside: auto !important;
        font-size: 16.8px;
        line-height: 1.68;
      }
      .page-break-avoid,
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
        font-size: 16.8px;
        line-height: 1.68;
        color: #1f2937;
        orphans: 2;
        widows: 2;
      }
      .pdf-text-block h1 {
        font-size: 26.4px;
        font-weight: 700;
        margin: 22px 0 10px;
        color: #111827;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 4px;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block h2 {
        font-size: 21.6px;
        font-weight: 700;
        margin: 18px 0 8px;
        color: #111827;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block h3 {
        font-size: 18px;
        font-weight: 600;
        margin: 14px 0 6px;
        color: #1f2937;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block h4 {
        font-size: 16.8px;
        font-weight: 600;
        margin: 12px 0 4px;
        color: #1f2937;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block h5 {
        font-size: 15.6px;
        font-weight: 600;
        margin: 10px 0 4px;
        color: #374151;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block h6 {
        font-size: 14.4px;
        font-weight: 600;
        margin: 10px 0 4px;
        color: #4b5563;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .pdf-text-block ul, .pdf-text-block ol {
        margin: 6px 0 12px 20px;
        padding: 0;
      }
      .pdf-text-block li {
        margin-bottom: 5px;
        font-size: 16.8px;
        orphans: 2;
        widows: 2;
      }
      .pdf-text-block blockquote {
        margin: 14px 0;
        padding: 10px 18px;
        font-size: 16px;
        background: #f9fafb;
        border-left: 3px solid #6366f1;
        color: #4b5563;
        font-style: italic;
      }
      .pdf-latex-block {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 10px 16px;
        margin: 10px 0;
        font-size: 11.5px;
      }
      .pdf-latex-inner {
        display: flex;
        justify-content: center;
        overflow-x: auto;
        font-size: 11.5px;
      }
      .pdf-latex-block .katex {
        font-size: 1em !important;
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
        border-collapse: collapse;
        border-spacing: 0;
        font-size: 11.5px;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .pdf-sheet-td {
        border: 1px solid #e5e7eb;
        padding: 0;
        color: #1f2937;
        box-sizing: border-box;
        word-break: normal;
        overflow-wrap: break-word;
        vertical-align: top;
        line-height: 1.4;
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
      .pdf-mermaid-block {
        margin: 16px 0;
        text-align: center;
        width: 100%;
      }
      .pdf-mermaid-svg-box {
        display: block;
        width: 100%;
        background: #ffffff;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        box-sizing: border-box;
      }
      .pdf-mermaid-svg-box svg {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        height: auto !important;
        display: block;
        margin: 0 auto;
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
