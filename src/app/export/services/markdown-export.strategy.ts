import { Injectable } from '@angular/core';
import { Note } from '../../core/models/note.model';
import { Block } from '../../core/models/block.model';
import { ExportOptions, ExportStrategy } from '../models/export.model';

@Injectable({
  providedIn: 'root',
})
export class MarkdownExportStrategy implements ExportStrategy {
  readonly format = 'markdown';
  readonly label = 'Markdown (.md)';
  readonly description = 'Formato de texto estructurado compatible con Obsidian, Notion y GitHub.';
  readonly extension = '.md';
  readonly mimeType = 'text/markdown';
  readonly icon = 'file';

  async export(note: Note, options: ExportOptions = {}): Promise<void> {
    const filename = options.filename || this.sanitizeFilename(note.title || 'documento');
    const md = this.buildMarkdown(note, options);

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    this.downloadBlob(blob, `${filename}.md`);
  }

  private buildMarkdown(note: Note, options: ExportOptions): string {
    const lines: string[] = [];

    // Título principal
    if (options.includeTitle !== false && note.title) {
      lines.push(`# ${note.title}`);
      lines.push('');
    }

    // Metadatos
    if (options.includeMetadata !== false && note.space) {
      lines.push(`> Espacio: **${note.space}**`);
      lines.push('');
    }

    // Lead / Resumen
    if (note.lead) {
      lines.push(`*${note.lead}*`);
      lines.push('');
    }

    // Tags
    if (options.includeTags !== false && note.tags && note.tags.length > 0) {
      lines.push(`Tags: ${note.tags.map((t) => `\`#${t}\``).join(' ')}`);
      lines.push('');
    }

    if (lines.length > 0) {
      lines.push('---');
      lines.push('');
    }

    // Bloques
    const sortedBlocks = [...(note.blocks || [])].sort((a, b) => a.order - b.order);
    for (const block of sortedBlocks) {
      lines.push(this.renderBlockToMarkdown(block));
      lines.push('');
    }

    return lines.join('\n');
  }

  private renderBlockToMarkdown(block: Block): string {
    const content = block.content || {};
    switch (block.type) {
      case 'text': {
        const html = content['html'] || '';
        return this.simpleHtmlToMarkdown(html);
      }

      case 'latex': {
        const formula = content['formula'] || '';
        return `$$\n${formula}\n$$`;
      }

      case 'code': {
        const code = content['code'] || '';
        const lang = content['language'] || '';
        return `\`\`\`${lang}\n${code}\n\`\`\``;
      }

      case 'sheet': {
        return this.renderSheetToMarkdownTable(block);
      }

      case 'image': {
        const url = content['url'] || '';
        const caption = content['caption'] || 'Imagen';
        return `![${caption}](${url})\n*${caption}*`;
      }

      case 'mermaid': {
        const chart = content['chartDefinition'] || '';
        return `\`\`\`mermaid\n${chart}\n\`\`\``;
      }

      case 'canvas': {
        return `> 🎨 *[Pizarra de dibujo Excalidraw interactiva]*`;
      }

      default:
        return '';
    }
  }

  private renderSheetToMarkdownTable(block: Block): string {
    const workbookData = block.content?.['workbookData'];
    const sheet = Object.values(workbookData?.sheets || {})[0] as any;
    const cellData = sheet?.cellData || {};

    const rowIndices = Object.keys(cellData).map(Number).sort((a, b) => a - b);
    if (rowIndices.length === 0) return '';

    let maxCol = 0;
    rowIndices.forEach((r) => {
      const row = cellData[r] || {};
      Object.keys(row).map(Number).forEach((c) => {
        if (c > maxCol) maxCol = c;
      });
    });

    const headers: string[] = [];
    const separators: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      headers.push(String.fromCharCode(65 + (c % 26)));
      separators.push('---');
    }

    const rows: string[] = [];
    rows.push(`| ${headers.join(' | ')} |`);
    rows.push(`| ${separators.join(' | ')} |`);

    rowIndices.forEach((r) => {
      const row = cellData[r] || {};
      const cells: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const val = row[c]?.v !== undefined && row[c]?.v !== null ? String(row[c].v) : '';
        cells.push(val.replace(/\|/g, '\\|'));
      }
      rows.push(`| ${cells.join(' | ')} |`);
    });

    return rows.join('\n');
  }

  private simpleHtmlToMarkdown(html: string): string {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>/gi, '')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<hr\s*[\/]?>/gi, '\n---\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
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
