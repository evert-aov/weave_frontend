import { Injectable, inject } from '@angular/core';
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
  getAvailableStrategies(): ExportStrategy[] {
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
    const strategy = this.strategies.get(format);
    if (!strategy) {
      throw new Error(`Formato de exportación no soportado: ${format}`);
    }
    await strategy.export(note, options);
  }
}
