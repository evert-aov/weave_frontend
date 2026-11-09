import { snapshotDocxPages } from '../services/docx-live-snapshot';


import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordFilesControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'activePaperPreset'
  | 'academic'
  | 'bibliographicSources'
  | 'activeTemplateId'
  | 'styleTemplates'
  | 'docTitle'
  | 'note'
  | 'docxProperties'
  | 'formats'
  | 'handleUpdateLayout'
  | 'importedTocEntries'
  | 'layoutConfig'
  | 'mainScrollRef'
  | 'pdfExportFailed'
  | 'pdfExportMessage'
  | 'pdfExporting'
  | 'viewMode'>;
type WordFilesControllerHooks = Pick<WordEditorHooks,
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
  constructor(private readonly editor: WordFilesControllerHost, private readonly hooks: WordFilesControllerHooks) {}

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

  private exportTitle(): string { return this.editor.note?.title?.trim() || this.editor.docTitle() || 'Documento'; }
  private exportingWord = false;
  async exportWord(): Promise<void> {
    if (this.exportingWord) return;
    this.exportingWord = true;
    this.hooks.showToast('Preparando DOCX e incrustando imágenes…');
    try {
      const snapshot = snapshotDocxPages(this.hooks.getLivePagesSnapshot(), this.hooks.liveBodies());
      await this.hooks.wordCompat.exportToDocxFile(this.exportTitle(), snapshot, this.editor.layoutConfig());
      this.hooks.showToast(`Exportado como "${this.exportTitle()}.docx" (${this.editor.activePaperPreset().name})`);
    } catch (error) { this.hooks.showToast(error instanceof Error ? error.message : 'No se pudo exportar el archivo DOCX.'); }
    finally { this.exportingWord = false; }
  }

  async exportLegacyDoc(): Promise<void> {
    this.hooks.showToast('Exportando documento compatible con Word (.doc)...');
    const snapshot = this.hooks.getLivePagesSnapshot();
    await this.hooks.wordCompat.exportToWordDoc(this.exportTitle(), snapshot, this.editor.layoutConfig());
    this.hooks.showToast(`Exportado como "${this.exportTitle()}.doc" (${this.editor.activePaperPreset().name})`);
  }

  async exportPdf(): Promise<void> {
    if (this.editor.pdfExporting()) return;
    this.editor.pdfExporting.set(true);
    this.editor.pdfExportFailed.set(false);
    this.editor.pdfExportMessage.set('Preparando las hojas…');
    this.hooks.showToast('Generando el archivo PDF...');
    try {
      if (!['print', 'read'].includes(this.editor.viewMode())) {
        throw new Error('Abre la vista de páginas para exportar con las dimensiones del documento.');
      }
      const sheets = this.hooks.liveBodies().map(body => body.closest<HTMLElement>('.word-page-sheet')).filter((sheet): sheet is HTMLElement => !!sheet);
      await this.hooks.wordCompat.exportToPdf(this.exportTitle(), sheets, message => this.editor.pdfExportMessage.set(message));
      this.editor.pdfExportMessage.set('PDF generado. Descarga iniciada.');
      this.hooks.showToast(`Exportado como "${this.exportTitle()}.pdf" (${this.editor.activePaperPreset().name})`);
    } catch (error) {
      this.editor.pdfExportFailed.set(true);
      const message = error instanceof Error ? `No se pudo exportar el PDF: ${error.message}` : 'No se pudo exportar el PDF';
      this.editor.pdfExportMessage.set(message);
      this.hooks.showToast(message);
    } finally {
      this.editor.pdfExporting.set(false);
    }
  }

  async exportHtml(): Promise<void> {
    const snapshot = this.hooks.getLivePagesSnapshot();
    await this.hooks.wordCompat.exportToHtmlFile(this.exportTitle(), snapshot, this.editor.layoutConfig());
    this.hooks.showToast(`Exportado como "${this.exportTitle()}.html"`);
  }

  exportMarkdown(): void {
    const snapshot = this.hooks.getLivePagesSnapshot();
    this.hooks.wordCompat.exportToMarkdown(this.exportTitle(), snapshot);
    this.hooks.showToast(`Exportado como "${this.exportTitle()}.md"`);
  }

  exportTxt(): void {
    const snapshot = this.hooks.getLivePagesSnapshot();
    const allText = snapshot
      .map((p, i) => {
        const clean = p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return `--- PÁGINA ${i + 1} ---\n${clean}`;
      })
      .join('\n\n');
    this.hooks.wordCompat.exportToPlainText(this.exportTitle(), allText);
    this.hooks.showToast(`Exportado como "${this.exportTitle()}.txt"`);
  }

  async exportWordFromHeader(): Promise<void> { await this.exportWord(); }
}
