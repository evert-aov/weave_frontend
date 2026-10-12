import { Injectable } from '@angular/core';
import * as katex from 'katex';
import { Note } from '../../core/models/note.model';
import { Block } from '../../core/models/block.model';
import { ExportOptions, ExportStrategy } from '../models/export.model';

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
    pre { background: #1f2937; color: #f9fafb; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
    .table-box table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    .table-box th, .table-box td { border: 1px solid #e5e7eb; padding: 8px 12px; }
    .table-box th { background: #f9fafb; font-weight: 600; }
    .latex-box { background: #f9fafb; padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
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
      case 'text':
        return `<div class="block text-block">${content['html'] || ''}</div>`;
      case 'latex': {
        const formula = content['formula'] || '';
        let rendered = '';
        try {
          rendered = katex.renderToString(formula, { displayMode: true, throwOnError: false });
        } catch {
          rendered = formula;
        }
        return `<div class="block latex-box">${rendered}</div>`;
      }
      case 'code':
        return `<div class="block"><pre><code>${this.escapeHtml(content['code'] || '')}</code></pre></div>`;
      case 'image':
        return `<div class="block"><img src="${this.escapeHtml(content['url'] || '')}" alt="${this.escapeHtml(content['caption'] || '')}"></div>`;
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
