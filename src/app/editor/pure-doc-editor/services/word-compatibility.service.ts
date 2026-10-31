import { Injectable, inject } from '@angular/core';
import {
  DocxDocumentProperties,
  DocumentLayoutConfig,
  DocumentPage,
  HeadingItem,
} from '../models/word-document.model';
import { DEFAULT_LAYOUT_CONFIG, PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';
import { DocxParserService } from './docx-parser.service';












export function formatCleanHeadingTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(\d+(?:\.\d+)*\.?)(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/g, '$1 ')
    .trim();
}

@Injectable({ providedIn: 'root' })
export class WordCompatibilityService {
  private readonly docxParser = inject(DocxParserService);

  /**
   * Normalizes heading text so section numbers like "1.CAPÍTULO" or "1.1.2Arquitectura"
   * always have a clean space ("1. CAPÍTULO", "1.1.2 Arquitectura").
   */
  formatCleanHeadingTitle(raw: string): string {
    return formatCleanHeadingTitle(raw);
  }
  /**
   * Generates a single TOC entry row HTML that looks identical to Microsoft Word's Table of Contents
   * (Title on left + dotted leader line + page number on right, all on one line)
   * and carries `data-toc-target-id` and `data-toc-page` so clicking it in the editor jumps to that section!
   */
  buildSingleTocEntryHtml(h: HeadingItem, pageNumberOffset: number = 0): string {
    const indentPt = Math.max(0, (h.level - 1) * 14);
    const isTopLevel = h.level === 1;
    const cleanTitle = this.formatCleanHeadingTitle(h.text);
    const displayPageNum = h.pageIndex + 1 + pageNumberOffset;

    return `<div class="word-toc-entry" contenteditable="false" data-toc-target-id="${h.id}" data-toc-page="${
      displayPageNum - 1
    }" style="padding-left: ${indentPt}pt; font-weight: ${
      isTopLevel ? '700' : '400'
    }; margin-top: ${isTopLevel ? '4pt' : '0pt'};" title="Haz clic para ir a: ${cleanTitle.replace(/"/g, '&quot;')} (Página ${displayPageNum})">
      <span class="word-toc-title">${cleanTitle}</span>
      <span class="word-toc-dots"></span>
      <span class="word-toc-page">${displayPageNum}</span>
    </div>`;
  }
  /**
   * Builds multi-page Table of Contents chunks (WITHOUT any scrollbars) so that if a document has
   * 40, 80, or 150 headings, the Table of Contents automatically spans across the exact number of pages
   * needed while respecting the physical height of each sheet.
   */
  buildPaginatedTocPagesHtml(
    headings: HeadingItem[],
    entriesPerPage: number = 28,
    extraPagesInsertedShift: number = 0
  ): string[] {
    if (headings.length === 0) {
      return [
        `<div class="word-toc-page-section" contenteditable="false">
          <div class="word-toc-header">ÍNDICE DE CONTENIDO</div>
          <p style="text-align: center; color: #64748b; font-style: italic;">No se encontraron encabezados (H1–H6) en el documento. Aplica estilos H1–H6 desde la barra superior para generar el índice.</p>
        </div><p><br/></p>`,
      ];
    }

    const pagesHtml: string[] = [];
    let cursor = 0;
    let pageSeq = 0;

    while (cursor < headings.length) {
      // First TOC page has the main title header so it fits slightly fewer rows than continuation pages
      const limit = pageSeq === 0 ? Math.max(16, entriesPerPage - 2) : entriesPerPage;
      const slice = headings.slice(cursor, cursor + limit);
      cursor += limit;

      const headerMarkup =
        pageSeq === 0
          ? `<div class="word-toc-header" contenteditable="false">ÍNDICE DE CONTENIDO</div>`
          : `<div class="word-toc-header" contenteditable="false" style="font-size: 11pt; color: #475569; margin-bottom: 10pt;">ÍNDICE DE CONTENIDO (CONTINUACIÓN — PÁG. ${pageSeq + 1})</div>`;

      const rowsMarkup = slice
        .map((h) => this.buildSingleTocEntryHtml(h, extraPagesInsertedShift))
        .join('\n');

      pagesHtml.push(
        `<div class="word-toc-page-section" contenteditable="false">\n${headerMarkup}\n${rowsMarkup}\n</div><p><br/></p>`
      );
      pageSeq++;
    }

    return pagesHtml;
  }
  buildInlineTocHtml(headings: HeadingItem[]): string {
    const chunks = this.buildPaginatedTocPagesHtml(headings, 28, 0);
    return chunks[0];
  }
  /**
   * Generates a fully compatible Microsoft Word (.doc) file from multiple pages,
   * preserving the selected paper size (Carta, Oficio, Legal, A4, etc.), orientation,
   * margins, page borders, headers/footers, embedded images, and H1-H6 outline levels.
   */
  async exportToWordDoc(
    title: string,
    pages: DocumentPage[],
    layout: DocumentLayoutConfig = DEFAULT_LAYOUT_CONFIG
  ): Promise<void> {
    const sanitizedTitle = (title || 'Documento').replace(/[^a-z0-9-_áéíóúñ\s]/gi, '').trim() || 'Documento';

    const preset = PAPER_FORMAT_PRESETS[layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
    const pageWidthCm = layout.orientation === 'landscape' ? preset.heightCm : preset.widthCm;
    const pageHeightCm = layout.orientation === 'landscape' ? preset.widthCm : preset.heightCm;

    const topCm = (layout.margins.topPx / 28.35).toFixed(2);
    const rightCm = (layout.margins.rightPx / 28.35).toFixed(2);
    const bottomCm = (layout.margins.bottomPx / 28.35).toFixed(2);
    const leftCm = (layout.margins.leftPx / 28.35).toFixed(2);

    const borderCss =
      layout.pageBorder.style !== 'none'
        ? `border: ${layout.pageBorder.widthPt}pt ${
            layout.pageBorder.style === 'thick' ? 'solid' : layout.pageBorder.style
          } ${layout.pageBorder.color}; padding: 12pt;`
        : '';

    const resolvedPagesHtml: string[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
      const p = pages[idx];
      const htmlWithEmbeddedImages = await this.docxParser.convertBlobUrlsInHtmlToBase64(p.html);
      const headerBlock =
        layout.showHeaderFooter && layout.headerHtml
          ? `<div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 6pt; margin-bottom: 14pt;">${layout.headerHtml}</div>`
          : '';
      const footerBlock =
        layout.showHeaderFooter && layout.footerHtml
          ? `<div style="border-top: 1px solid #e2e8f0; padding-top: 6pt; margin-top: 18pt;">${layout.footerHtml} <div style="text-align:right;font-size:8.5pt;color:#94a3b8;">Página ${
              idx + 1
            } de ${pages.length}</div></div>`
          : '';
      resolvedPagesHtml.push(`<div style="${borderCss}">${headerBlock}${htmlWithEmbeddedImages}${footerBlock}</div>`);
    }

    const multiPageHtmlContent = resolvedPagesHtml.join(
      '\n<br clear="all" style="mso-special-character:line-break; page-break-before:always" />\n'
    );

    const wordDocumentWrapper = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${sanitizedTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page Section1 {
            size: ${pageWidthCm}cm ${pageHeightCm}cm;
            margin: ${topCm}cm ${rightCm}cm ${bottomCm}cm ${leftCm}cm;
            mso-page-orientation: ${layout.orientation};
          }
          div.Section1 {
            page: Section1;
          }
          body {
            font-family: 'Times New Roman', 'Calibri', serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #0f172a;
          }
          h1 {
            font-size: 18pt;
            font-weight: bold;
            color: #0f172a;
            margin-top: 14pt;
            margin-bottom: 6pt;
            mso-outline-level: 1;
          }
          h2 {
            font-size: 15pt;
            font-weight: bold;
            color: #1e293b;
            margin-top: 12pt;
            margin-bottom: 4pt;
            mso-outline-level: 2;
          }
          h3 {
            font-size: 13pt;
            font-weight: bold;
            color: #334155;
            margin-top: 10pt;
            margin-bottom: 4pt;
            mso-outline-level: 3;
          }
          h4 {
            font-size: 11.5pt;
            font-weight: bold;
            color: #334155;
            margin-top: 8pt;
            margin-bottom: 2pt;
            mso-outline-level: 4;
          }
          h5 {
            font-size: 11pt;
            font-weight: bold;
            color: #475569;
            margin-top: 6pt;
            margin-bottom: 2pt;
            mso-outline-level: 5;
          }
          h6 {
            font-size: 10pt;
            font-weight: bold;
            color: #64748b;
            margin-top: 6pt;
            margin-bottom: 2pt;
            mso-outline-level: 6;
          }
          p {
            margin-top: 0pt;
            margin-bottom: 6pt;
          }
          .word-toc-header {
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 12pt;
          }
          .word-toc-entry {
            margin-bottom: 4pt;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
            margin: 6pt 0;
          }
          th, td {
            border: 1pt solid #000000;
            padding: 2pt 4pt;
            word-wrap: break-word;
          }
          blockquote {
            border-left: 3pt solid #2563eb;
            padding-left: 10pt;
            color: #475569;
            font-style: italic;
            margin: 10pt 0;
          }
          pre {
            background-color: #f1f5f9;
            padding: 8pt;
            font-family: 'Courier New', monospace;
            font-size: 9.5pt;
            border: 1pt solid #cbd5e1;
          }
        </style>
      </head>
      <body>
        <div class="Section1">
          ${multiPageHtmlContent}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['﻿', wordDocumentWrapper], {
      type: 'application/msword;charset=utf-8',
    });
    this.triggerDownload(blob, `${sanitizedTitle}.doc`);
  }
  async exportToHtmlFile(
    title: string,
    pages: DocumentPage[],
    layout: DocumentLayoutConfig = DEFAULT_LAYOUT_CONFIG
  ): Promise<void> {
    const sanitizedTitle = (title || 'Documento').replace(/[^a-z0-9-_áéíóúñ\s]/gi, '').trim() || 'Documento';
    const preset = PAPER_FORMAT_PRESETS[layout.paperFormatId] || PAPER_FORMAT_PRESETS.letter;
    const wPx = layout.orientation === 'landscape' ? preset.heightPx : preset.widthPx;
    const hPx = layout.orientation === 'landscape' ? preset.widthPx : preset.heightPx;

    const sections: string[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
      const htmlWithEmbedded = await this.docxParser.convertBlobUrlsInHtmlToBase64(pages[idx].html);
      sections.push(
        `<section class="page" data-page="${idx + 1}" data-break-before="${pages[idx].breakBefore ?? 'auto'}">
          ${layout.showHeaderFooter ? `<header class="page-header">${layout.headerHtml}</header>` : ''}
          <div class="page-body">${htmlWithEmbedded}</div>
          ${layout.showHeaderFooter ? `<footer class="page-footer">${layout.footerHtml}</footer>` : ''}
        </section>`
      );
    }

    const fullHtml = `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${sanitizedTitle}</title>
    <style>
      body { background: #f1f5f9; font-family: 'Times New Roman', system-ui, serif; margin: 0; padding: 32px 16px; line-height: 1.5; color: #0f172a; }
      .page { background: #ffffff; max-width: ${wPx}px; min-height: ${hPx}px; margin: 0 auto 28px auto; padding: ${layout.margins.topPx}px ${layout.margins.rightPx}px ${layout.margins.bottomPx}px ${layout.margins.leftPx}px; box-shadow: 0 4px 16px rgba(15,23,42,0.08); box-sizing: border-box; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; }
      .page-header { border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
      .page-body { flex: 1; }
      .page-footer { border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 16px; }
      .word-toc-header { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 14pt; }
      .word-toc-entry { display: flex; align-items: baseline; width: 100%; margin-bottom: 4pt; }
      .word-toc-dots { flex: 1; border-bottom: 1px dotted #64748b; margin: 0 8px; }
      table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin: 8px 0; }
      th, td { border: 1px solid #000000; padding: 2px 5px; word-wrap: break-word; overflow-wrap: anywhere; }
      blockquote { border-left: 4px solid #3b82f6; margin: 16px 0; padding: 8px 16px; background: #f8fafc; }
      pre { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; overflow-x: auto; }
    </style>
  </head>
  <body>
  ${sections.join('\n')}
  </body>
  </html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    this.triggerDownload(blob, `${sanitizedTitle}.html`);
  }
  exportToPlainText(title: string, textContent: string): void {
    const sanitizedTitle = (title || 'Documento').replace(/[^a-z0-9-_áéíóúñ\s]/gi, '').trim() || 'Documento';
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    this.triggerDownload(blob, `${sanitizedTitle}.txt`);
  }
  exportToMarkdown(title: string, pages: DocumentPage[]): void {
    const sanitizedTitle = (title || 'Documento').replace(/[^a-z0-9-_áéíóúñ\s]/gi, '').trim() || 'Documento';
    let md = '';

    pages.forEach((page, pageIdx) => {
      if (pageIdx > 0) {
        md += `\n---\n\n`;
      }
      const temp = document.createElement('div');
      temp.innerHTML = page.html;

      temp.childNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();
          const text = el.innerText.trim();
          if (tag === 'h1') md += `# ${text}\n\n`;
          else if (tag === 'h2') md += `## ${text}\n\n`;
          else if (tag === 'h3') md += `### ${text}\n\n`;
          else if (tag === 'h4') md += `#### ${text}\n\n`;
          else if (tag === 'h5') md += `##### ${text}\n\n`;
          else if (tag === 'h6') md += `###### ${text}\n\n`;
          else if (tag === 'blockquote') md += `> ${text}\n\n`;
          else if (tag === 'ul') {
            el.querySelectorAll('li').forEach((li) => {
              md += `- ${li.innerText.trim()}\n`;
            });
            md += '\n';
          } else if (tag === 'ol') {
            el.querySelectorAll('li').forEach((li, idx) => {
              md += `${idx + 1}. ${li.innerText.trim()}\n`;
            });
            md += '\n';
          } else {
            md += `${text}\n\n`;
          }
        }
      });
    });

    const blob = new Blob([md.trim()], { type: 'text/markdown;charset=utf-8' });
    this.triggerDownload(blob, `${sanitizedTitle}.md`);
  }
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  async parseImportedFile(file: File): Promise<{
    title: string;
    pages: DocumentPage[];
    docxProperties?: DocxDocumentProperties;
    detectedLayout?: DocumentLayoutConfig;
    extractedTocHeadings?: HeadingItem[];
  }> {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      const docxResult = await this.docxParser.parseDocxFile(file);
      return {
        title: docxResult.title,
        pages: docxResult.pages,
        docxProperties: docxResult.properties,
        detectedLayout: docxResult.detectedLayout,
        extractedTocHeadings: docxResult.extractedTocHeadings,
      };
    }

    const rawText = await file.text();
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    if (
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm') ||
      lowerName.endsWith('.doc') ||
      rawText.includes('<html') ||
      rawText.includes('<body') ||
      rawText.includes('<p') ||
      rawText.includes('<h1')
    ) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawText, 'text/html');

      const pageSections = doc.querySelectorAll('section.page');
      if (pageSections.length > 0) {
        const extractedPages: DocumentPage[] = Array.from(pageSections).map((sec, idx) => {
          const bodyEl = sec.querySelector('.page-body');
          return {
            id: `imported-page-${idx + 1}-${Date.now()}`,
            html: (bodyEl ? bodyEl.innerHTML : sec.innerHTML).trim() || '<p><br/></p>',
            ...(sec.getAttribute('data-break-before') === 'manual' ? { breakBefore: 'manual' as const } : {}),
          };
        });
        return { title: baseName, pages: extractedPages };
      }

      const bodyHtml = doc.body ? doc.body.innerHTML : rawText;
      const rawChunks = bodyHtml.split(/<br[^>]*page-break-before:\s*always[^>]*>/i);
      const pages: DocumentPage[] = rawChunks.map((chunk, i) => ({
        id: `imported-page-${i + 1}-${Date.now()}`,
        html: chunk.trim() || '<p><br/></p>',
        ...(i > 0 ? { breakBefore: 'manual' as const } : {}),
      }));

      return {
        title: baseName,
        pages: pages.length > 0 ? pages : [{ id: 'page-1', html: `<p>${rawText}</p>` }],
      };
    }

    if (lowerName.endsWith('.md')) {
      const lines = rawText.split(/\r?\n/);
      const htmlLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === '---') {
          htmlLines.push('__PAGE_BREAK__');
          continue;
        }
        if (trimmed.startsWith('###### ')) htmlLines.push(`<h6>${trimmed.slice(7)}</h6>`);
        else if (trimmed.startsWith('##### ')) htmlLines.push(`<h5>${trimmed.slice(6)}</h5>`);
        else if (trimmed.startsWith('#### ')) htmlLines.push(`<h4>${trimmed.slice(5)}</h4>`);
        else if (trimmed.startsWith('### ')) htmlLines.push(`<h3>${trimmed.slice(4)}</h3>`);
        else if (trimmed.startsWith('## ')) htmlLines.push(`<h2>${trimmed.slice(3)}</h2>`);
        else if (trimmed.startsWith('# ')) htmlLines.push(`<h1>${trimmed.slice(2)}</h1>`);
        else if (trimmed.startsWith('> ')) htmlLines.push(`<blockquote>${trimmed.slice(2)}</blockquote>`);
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* '))
          htmlLines.push(`<ul><li>${trimmed.slice(2)}</li></ul>`);
        else htmlLines.push(`<p>${trimmed}</p>`);
      }

      const pagesHtml = htmlLines
        .join('\n')
        .split('__PAGE_BREAK__')
        .map((s) => s.trim())
        .filter(Boolean);

      return {
        title: baseName,
        pages: (pagesHtml.length ? pagesHtml : ['<p><br/></p>']).map((html, idx) => ({
          id: `md-page-${idx + 1}-${Date.now()}`,
          html,
        })),
      };
    }

    const paragraphs = rawText
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${p.replace(/\r?\n/g, '<br/>')}</p>`)
      .filter(Boolean);

    const pages: DocumentPage[] = [];
    const chunkSize = 18;
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      pages.push({
        id: `txt-page-${pages.length + 1}-${Date.now()}`,
        html: paragraphs.slice(i, i + chunkSize).join('\n'),
      });
    }

    return {
      title: baseName,
      pages: pages.length > 0 ? pages : [{ id: 'page-1', html: '<p><br/></p>' }],
    };
  }
}
