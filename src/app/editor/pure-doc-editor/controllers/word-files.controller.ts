import { snapshotDocxPages } from '../services/docx-live-snapshot';
import { sanitizePagesForExport } from '../utils/document-review';


import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordFilesControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'activePaperPreset'
  | 'academic'
  | 'bibliographicSources'
  | 'activeTemplateId'
  | 'canvasEditor'
  | 'canvasEnabled'
  | 'canvasGeometry'
  | 'clearToast'
  | 'styleTemplates'
  | 'docTitle'
  | 'note'
  | 'docxProperties'
  | 'formats'
  | 'handleUpdateLayout'
  | 'hideCommentsOnExport'
  | 'importedTocEntries'
  | 'layoutConfig'
  | 'mainScrollRef'
  | 'pdfExportFailed'
  | 'pdfExportMessage'
  | 'pdfExporting'
  | 'statusMessage'
  | 'viewMode'>;
type WordFilesControllerHooks = Pick<WordEditorHooks,
  | 'cdr'
  | 'getLivePagesSnapshot'
  | 'liveBodies'
  | 'redoStack'
  | 'renderDocumentPages'
  | 'scheduleDocumentFlow'
  | 'showToast'
  | 'undoStack'
  | 'wordCompat'>;

/** Files behavior owned by one editor instance. */
export class WordFilesController {
  private static readonly EXPORT_SUCCESS_HIDE_MS = 4000;
  private static readonly EXPORT_ERROR_HIDE_MS = 6000;
  private exportMessageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly editor: WordFilesControllerHost, private readonly hooks: WordFilesControllerHooks) {}

  clearExportFeedback(): void {
    if (this.exportMessageTimer !== null) {
      clearTimeout(this.exportMessageTimer);
      this.exportMessageTimer = null;
    }
    this.editor.pdfExportFailed.set(false);
    this.editor.pdfExportMessage.set('');
    this.hooks.cdr?.markForCheck();
  }

  private showExportFeedback(message: string, failed = false, autoHideMs?: number): void {
    if (this.exportMessageTimer !== null) {
      clearTimeout(this.exportMessageTimer);
      this.exportMessageTimer = null;
    }
    this.editor.clearToast();
    this.editor.statusMessage.set(message);
    this.editor.pdfExportFailed.set(failed);
    this.editor.pdfExportMessage.set(message);
    this.hooks.cdr?.markForCheck();
    if (autoHideMs && autoHideMs > 0) {
      this.exportMessageTimer = setTimeout(() => {
        this.exportMessageTimer = null;
        this.editor.pdfExportFailed.set(false);
        this.editor.pdfExportMessage.set('');
        this.hooks.cdr?.markForCheck();
      }, autoHideMs);
    }
  }

  private finishExportSuccess(message: string): void {
    this.showExportFeedback(message, false, WordFilesController.EXPORT_SUCCESS_HIDE_MS);
  }

  private finishExportError(error: unknown, fallbackMessage: string): void {
    const message = error instanceof Error ? error.message : fallbackMessage;
    this.showExportFeedback(message, true, WordFilesController.EXPORT_ERROR_HIDE_MS);
  }

  async handleFileImport(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.hooks.showToast(
        `Analizando e importando "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`
      );
      this.hooks.undoStack = [];
      this.hooks.redoStack = [];

      const result = await this.hooks.wordCompat.parseImportedFile(file);
      this.editor.academic.close();
      this.editor.bibliographicSources.set([]);
      this.editor.docTitle.set(result.title);
      this.hooks.renderDocumentPages(result.pages);
      this.hooks.scheduleDocumentFlow();
      this.editor.importedTocEntries.set(result.extractedTocHeadings || []);
      this.editor.activePageIndex.set(0);

      if (result.detectedLayout) {
        this.editor.handleUpdateLayout(() => result.detectedLayout!);
        const apa = result.detectedLayout.apa;
        const template = apa ? this.editor.styleTemplates().find(t => t.academicStyle === 'apa7' && t.rules.P.fontFamily === apa.fontFamily && t.rules.P.fontSizePt === apa.fontSizePt) : null;
        if (template) this.editor.activeTemplateId.set(template.id);
      }

      if (result.docxProperties) {
        this.editor.docxProperties.set(result.docxProperties);
        this.editor.formats.update((prev) => ({
          ...prev,
          fontName: result.docxProperties!.defaultFontFamily,
          fontSize: String(Math.round(result.docxProperties!.defaultFontSizePt)),
        }));
        const hc = result.docxProperties.headingCounts;
        const totalDetectedH = hc.h1 + hc.h2 + hc.h3 + hc.h4 + hc.h5 + hc.h6;
        this.hooks.showToast(
          `Importado: ${result.pages.length} páginas · ${totalDetectedH} encabezados · Tablas ajustadas al alto real de cada página`
        );
      } else {
        this.editor.docxProperties.set(null);
        this.hooks.showToast(`Archivo "${file.name}" importado en ${result.pages.length} página(s)`);
      }

      this.editor.mainScrollRef?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al importar el archivo';
      this.hooks.showToast(msg);
    } finally {
      input.value = '';
    }
  }

  private exportSnapshotPages() {
    const raw = this.hooks.getLivePagesSnapshot();
    const hideComments = Boolean(this.editor.hideCommentsOnExport?.());
    return sanitizePagesForExport(raw, { hideComments });
  }

  private exportTitle(): string { return this.editor.note?.title?.trim() || this.editor.docTitle() || 'Documento'; }
  private exportingWord = false;
  async exportWord(): Promise<void> {
    if (this.exportingWord) return;
    this.exportingWord = true;
    this.showExportFeedback('Preparando DOCX e incrustando imágenes…');
    try {
      const isCanvas = Boolean(this.editor.canvasEnabled() && this.editor.canvasEditor?.session);
      const hideComments = Boolean(this.editor.hideCommentsOnExport?.());
      const snapshot = snapshotDocxPages(
        this.exportSnapshotPages(),
        isCanvas || hideComments ? [] : this.hooks.liveBodies(),
      );
      await this.hooks.wordCompat.exportToDocxFile(this.exportTitle(), snapshot, this.editor.layoutConfig());
      this.finishExportSuccess(`Exportado como "${this.exportTitle()}.docx" (${this.editor.activePaperPreset().name})`);
    } catch (error) {
      this.finishExportError(error, 'No se pudo exportar el archivo DOCX.');
    } finally {
      this.exportingWord = false;
    }
  }

  async exportLegacyDoc(): Promise<void> {
    this.showExportFeedback('Exportando documento compatible con Word (.doc)...');
    try {
      const snapshot = this.exportSnapshotPages();
      await this.hooks.wordCompat.exportToWordDoc(this.exportTitle(), snapshot, this.editor.layoutConfig());
      this.finishExportSuccess(`Exportado como "${this.exportTitle()}.doc" (${this.editor.activePaperPreset().name})`);
    } catch (error) {
      this.finishExportError(error, 'No se pudo exportar el archivo DOC.');
    }
  }

  async exportPdf(): Promise<void> {
    if (this.editor.pdfExporting()) return;
    this.editor.pdfExporting.set(true);
    this.showExportFeedback('Preparando las hojas…');
    try {
      if (!['print', 'read'].includes(this.editor.viewMode())) {
        throw new Error('Abre la vista de páginas para exportar con las dimensiones del documento.');
      }
      if (this.editor.canvasEnabled() && this.editor.canvasEditor?.session) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const geom = this.editor.canvasGeometry();
        const hideComments = Boolean(this.editor.hideCommentsOnExport?.());
        await this.hooks.wordCompat.exportCanvasToPdf(
          this.exportTitle(),
          this.editor.canvasEditor.exportDisplayLists({ hideComments }),
          geom.width,
          geom.height,
          message => this.showExportFeedback(message)
        );
      } else {
        const sheets = this.hooks.liveBodies().map(body => body.closest<HTMLElement>('.word-page-sheet')).filter((sheet): sheet is HTMLElement => !!sheet);
        await this.hooks.wordCompat.exportToPdf(this.exportTitle(), sheets, message => this.showExportFeedback(message));
      }
      this.showExportFeedback('PDF generado. Descarga iniciada.', false, WordFilesController.EXPORT_SUCCESS_HIDE_MS);
    } catch (error) {
      const message = error instanceof Error ? `No se pudo exportar el PDF: ${error.message}` : 'No se pudo exportar el PDF';
      this.showExportFeedback(message, true, WordFilesController.EXPORT_ERROR_HIDE_MS);
    } finally {
      this.editor.pdfExporting.set(false);
    }
  }

  async exportHtml(): Promise<void> {
    try {
      const snapshot = this.exportSnapshotPages();
      await this.hooks.wordCompat.exportToHtmlFile(this.exportTitle(), snapshot, this.editor.layoutConfig());
      this.finishExportSuccess(`Exportado como "${this.exportTitle()}.html"`);
    } catch (error) {
      this.finishExportError(error, 'No se pudo exportar el archivo HTML.');
    }
  }

  exportMarkdown(): void {
    try {
      const snapshot = this.exportSnapshotPages();
      this.hooks.wordCompat.exportToMarkdown(this.exportTitle(), snapshot);
      this.finishExportSuccess(`Exportado como "${this.exportTitle()}.md"`);
    } catch (error) {
      this.finishExportError(error, 'No se pudo exportar el archivo Markdown.');
    }
  }

  exportTxt(): void {
    try {
      const snapshot = this.exportSnapshotPages();
      const allText = snapshot
        .map((p, i) => {
          const clean = p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          return `--- PÁGINA ${i + 1} ---\n${clean}`;
        })
        .join('\n\n');
      this.hooks.wordCompat.exportToPlainText(this.exportTitle(), allText);
      this.finishExportSuccess(`Exportado como "${this.exportTitle()}.txt"`);
    } catch (error) {
      this.finishExportError(error, 'No se pudo exportar el archivo TXT.');
    }
  }

  async exportWordFromHeader(): Promise<void> { await this.exportWord(); }
}
