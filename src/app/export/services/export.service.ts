import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LatexCompilerService, downloadLatexFile, latexError, latexPdfBlob } from '../../shared/latex/latex-compiler.service';
import { isLatexDocument } from '../../shared/utils/latex';
import { Note } from '../../core/models/note.model';
import { ExportFormat, ExportOptions, ExportStrategy } from '../models/export.model';
import { PdfExportStrategy } from './pdf-export.strategy';
import { MarkdownExportStrategy } from './markdown-export.strategy';
import { HtmlExportStrategy } from './html-export.strategy';

/**
 * Servicio Central de Exportación de Documentos de Weave.
 * Diseñado mediante el patrón Strategy para permitir la incorporación extensible
 * de nuevos formatos de salida (PDF, Markdown, HTML, JSON, etc.) sin acoplamiento.
 */
@Injectable({
  providedIn: 'root',
})
export class ExportService {
  private readonly latexCompiler = inject(LatexCompilerService);
  private readonly pdfStrategy = inject(PdfExportStrategy);
  private readonly markdownStrategy = inject(MarkdownExportStrategy);
  private readonly htmlStrategy = inject(HtmlExportStrategy);

  private readonly strategies = new Map<ExportFormat, ExportStrategy>();

  constructor() {
    this.registerStrategy(this.pdfStrategy);
    this.registerStrategy(this.markdownStrategy);
    this.registerStrategy(this.htmlStrategy);
  }

  /**
   * Registra una nueva estrategia de exportación en el sistema.
   */
  registerStrategy(strategy: ExportStrategy): void {
    this.strategies.set(strategy.format, strategy);
  }

  /**
   * Obtiene la lista de todos los formatos de exportación disponibles.
   */
  getAvailableStrategies(docType?: string): ExportStrategy[] {
    if (docType === 'latex') return [
      { format: 'pdf', label: 'PDF LaTeX', description: 'Compila respetando los paquetes y el diseño del código fuente.', extension: 'pdf', mimeType: 'application/pdf', icon: 'file-text', export: note => this.exportNote(note, 'pdf') },
      { format: 'tex', label: 'Código LaTeX', description: 'Archivo .tex editable, sin modificar el código fuente.', extension: 'tex', mimeType: 'application/x-tex', icon: 'code', export: note => this.exportNote(note, 'tex') },
    ];
    return Array.from(this.strategies.values());
  }

  /**
   * Obtiene una estrategia por su formato.
   */
  getStrategy(format: ExportFormat): ExportStrategy | undefined {
    return this.strategies.get(format);
  }

  /**
   * Ejecuta la exportación de una nota al formato especificado.
   */
  async exportNote(note: Note, format: ExportFormat, options?: ExportOptions): Promise<void> {
    if (note.docType === 'latex') {
      const source = typeof note.docData?.source === 'string' ? note.docData.source : '';
      if (format === 'tex') { downloadLatexFile(new Blob([source], { type: 'application/x-tex;charset=utf-8' }), note.title, 'tex'); return; }
      if (format !== 'pdf') throw new Error('Elige PDF o código .tex para este documento.');
      try {
        const result = await firstValueFrom(this.latexCompiler.compile(source));
        if (!result.success || !result.pdf) throw new Error('No se pudo compilar. Revisa el registro en la vista previa LaTeX.');
        downloadLatexFile(latexPdfBlob(result.pdf), note.title, 'pdf'); return;
      } catch (error) { throw new Error(latexError(error)); }
    }
    if (format === 'pdf' && note.blocks?.some(block => block.type === 'latex' && (block.content['mode'] === 'document' || isLatexDocument(String(block.content['formula'] || ''))))) {
      throw new Error('Descarga el PDF de cada bloque LaTeX avanzado desde su vista previa. La exportación HTML conserva su código fuente.');
    }
    const strategy = this.strategies.get(format);
    if (!strategy) {
      throw new Error(`Formato de exportación no soportado: ${format}`);
    }
    await strategy.export(note, options);
  }
}
