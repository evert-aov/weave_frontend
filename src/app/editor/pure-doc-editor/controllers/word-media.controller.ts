import { firstValueFrom } from 'rxjs';
import { markDocumentSelection } from '../utils/document-selection';
import { applyInlineProperties, inlineProperties } from '../utils/home-editing';
import { clipboardTableHtml } from '../../../shared/utils/clipboard-table';
import { SmartArtItem } from '../models/word-insert.model';
import { ICON_SVG_PATHS } from '../constants/word-insert.constants';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordMediaControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'checkAndPaginateOverflow'
  | 'commitPageDomToState'
  | 'copiedInlineStyle'
  | 'editingLatexCode'
  | 'editingLatexElement'
  | 'executeCommand'
  | 'formatPainterActive'
  | 'getPageBody'
  | 'headings'
  | 'iconsModalOpen'
  | 'imageFileInputRef'
  | 'insertHtmlAtCursorOrActivePage'
  | 'isReadMode'
  | 'latexModalOpen'
  | 'pages'
  | 'pushUndoSnapshot'
  | 'smartArtModalOpen'
  | 'updateSelectionFormats'>;
type WordMediaControllerHooks = Pick<WordEditorHooks,
  | 'applyPendingScroll'
  | 'collectDocData'
  | 'finishDocumentMutation'
  | 'getActivePageElement'
  | 'imageStore'
  | 'lastInputTime'
  | 'latexRenderer'
  | 'liveBodies'
  | 'notesService'
  | 'pendingTypingStyle'
  | 'restoreSelection'
  | 'saveSelection'
  | 'scheduleAutoSave'
  | 'showToast'>;

/** Media behavior owned by one editor instance. */
export class WordMediaController {
  constructor(private readonly editor: WordMediaControllerHost, private readonly hooks: WordMediaControllerHooks) {}

  handleInsertImage(): void {
    this.hooks.saveSelection();
    this.editor.imageFileInputRef?.nativeElement.click();
  }

  async handleImageFileSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.hooks.showToast('Por favor selecciona un archivo de imagen válido');
      return;
    }

    await this.uploadAndInsertImageFile(file);
  }

  async uploadAndInsertImageFile(file: File, pageIndex?: number): Promise<void> {
    const targetIdx = pageIndex ?? this.editor.activePageIndex();
    this.editor.activePageIndex.set(targetIdx);
    this.hooks.showToast('Subiendo imagen al servidor...');

    try {
      const res = await firstValueFrom(this.hooks.notesService.uploadImage(file));
      const displayUrl = this.hooks.imageStore.toDisplayUrl(res.url);

      const figureHtml = `<figure style="margin: 1.5rem auto; text-align: center; max-width: 100%;"><img src="${displayUrl}" alt="${file.name}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: inline-block;" /><figcaption style="font-size: 0.8rem; color: #64748b; text-align: center; margin-top: 6px; font-style: italic;">Figura: ${file.name}</figcaption></figure><p><br/></p>`;

      this.hooks.restoreSelection();
      const activeEl = this.editor.getPageBody(this.editor.pages()[targetIdx]?.id) || this.hooks.getActivePageElement();

      if (activeEl) {
        activeEl.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
          document.execCommand('insertHTML', false, figureHtml);
        } else {
          activeEl.insertAdjacentHTML('beforeend', figureHtml);
        }
        this.editor.commitPageDomToState(targetIdx);
        this.editor.checkAndPaginateOverflow(targetIdx);
        this.hooks.scheduleAutoSave(this.hooks.collectDocData());
        this.hooks.showToast('Imagen persistida físicamente en servidor con éxito');
      }
    } catch (err) {
      console.error('[PureDocEditor] Error subiendo imagen:', err);
      this.hooks.showToast('Error al subir la imagen al servidor');
    }
  }

  async onPagePaste(e: ClipboardEvent, pageIndex: number): Promise<void> {
    if (this.editor.isReadMode()) return;
    const clipboard = e.clipboardData;
    const html = clipboardTableHtml(clipboard?.getData('text/html') ?? '', clipboard?.getData('text/plain') ?? '');
    if (html) {
      e.preventDefault();
      this.editor.activePageIndex.set(pageIndex);
      // Antes de mirar imágenes: Excel/Word pueden incluir una vista previa de la misma tabla.
      this.editor.executeCommand('insertHTML', html + (/<\/table>\s*$/i.test(html) ? '<p><br></p>' : ''));
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          this.editor.activePageIndex.set(pageIndex);
          await this.uploadAndInsertImageFile(file, pageIndex);
        }
        return;
      }
    }
  }

  onPageDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async onPageDrop(e: DragEvent, pageIndex: number): Promise<void> {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        this.editor.activePageIndex.set(pageIndex);
        await this.uploadAndInsertImageFile(file, pageIndex);
        return;
      }
    }
  }

  handleInsertShapeHtml(shapeHtml: string): void {
    const wrappedHtml = `<div class="word-shape-wrapper" style="margin:14px 0;text-align:center;">${shapeHtml}</div><p><br/></p>`;
    this.editor.insertHtmlAtCursorOrActivePage(wrappedHtml);
    this.hooks.showToast('Forma insertada con éxito');
  }

  handleInsertSmartArt(item: SmartArtItem): void {
    this.editor.smartArtModalOpen.set(false);
    this.editor.insertHtmlAtCursorOrActivePage(item.generateHtml());
    this.hooks.showToast(`SmartArt "${item.name}" insertado con éxito`);
  }

  handleInsertIcon(iconName: string): void {
    this.editor.iconsModalOpen.set(false);
    const svgPath = ICON_SVG_PATHS[iconName] || '<circle cx="12" cy="12" r="10"/><path d="m12 8v8m-4-4h8"/>';
    const iconHtml = `<span class="word-icon-inline" contenteditable="false"><svg class="word-doc-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg></span>&nbsp;`;
    this.editor.insertHtmlAtCursorOrActivePage(iconHtml, true);
    this.hooks.showToast(`Icono "${iconName}" insertado`);
  }

  handleInsert3dModel(): void {
    const modelHtml = `
      <div class="word-3d-model-container" contenteditable="false" style="display:inline-block;margin:12px;padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;text-align:center;">
        <svg width="120" height="110" viewBox="0 0 120 110">
          <polygon points="60,10 110,35 60,60 10,35" fill="#93c5fd" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="10,35 60,60 60,105 10,80" fill="#60a5fa" stroke="#2563eb" stroke-width="2.5"/>
          <polygon points="110,35 60,60 60,105 110,80" fill="#2563eb" stroke="#1d4ed8" stroke-width="2.5"/>
        </svg>
        <div contenteditable="true" style="font-size:12px;font-weight:bold;color:#1e293b;margin-top:6px;outline:none;">[Modelo 3D Isométrico]</div>
      </div><p><br/></p>
    `;
    this.editor.insertHtmlAtCursorOrActivePage(modelHtml);
    this.hooks.showToast('Modelo 3D insertado');
  }

  handleInsertScreenshot(): void {
    const figureHtml = `
      <figure class="word-screenshot-placeholder" contenteditable="false" style="margin:16px auto;text-align:center;max-width:100%;border:1.5px dashed #94a3b8;border-radius:8px;padding:16px;background:#f8fafc;">
        <div style="font-size:24px;margin-bottom:6px;">📸</div>
        <div contenteditable="true" style="font-weight:600;font-size:13px;color:#334155;outline:none;">Captura de Pantalla</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">(Pega una imagen con Ctrl+V o arrastra una imagen aquí)</div>
      </figure><p><br/></p>
    `;
    this.editor.insertHtmlAtCursorOrActivePage(figureHtml);
    this.hooks.showToast('Área de captura de pantalla insertada');
  }

  handleEditorMouseUp(e: MouseEvent): void {
    this.hooks.lastInputTime = 0;
    this.hooks.pendingTypingStyle = null;
    const targetEl = e.target as HTMLElement | null;

    const latexBlockEl = targetEl?.closest('.word-latex-formula') as HTMLElement | null;
    if (latexBlockEl) {
      const encodedLatex = latexBlockEl.getAttribute('data-latex') || '';
      const decodedLatex = encodedLatex ? decodeURIComponent(encodedLatex) : '';
      this.editor.editingLatexElement.set(latexBlockEl);
      this.editor.editingLatexCode.set(decodedLatex);
      this.editor.latexModalOpen.set(true);
      return;
    }

    const tocEntryEl = targetEl?.closest('.word-toc-entry') as HTMLElement | null;
    if (tocEntryEl) {
      const targetHeadingId = tocEntryEl.getAttribute('data-toc-target-id');
      const targetPageAttr = tocEntryEl.getAttribute('data-toc-page');
      const liveHeading = this.editor.headings().find((h) => h.id === targetHeadingId);
      const targetPageIndex = liveHeading
        ? liveHeading.pageIndex
        : targetPageAttr !== null
        ? parseInt(targetPageAttr, 10)
        : 0;

      if (!isNaN(targetPageIndex)) {
        this.editor.activePageIndex.set(Math.max(0, Math.min(this.editor.pages().length - 1, targetPageIndex)));
        if (targetHeadingId) {
          this.hooks.applyPendingScroll(targetHeadingId);
        }
        this.hooks.showToast(
          `Navegando a "${liveHeading?.text || 'sección'}" en la Página ${targetPageIndex + 1}`
        );
        return;
      }
    }

    this.editor.updateSelectionFormats();
    if (this.editor.formatPainterActive() && this.editor.copiedInlineStyle()) {
      const copied = this.editor.copiedInlineStyle()!;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        this.editor.pushUndoSnapshot();
        markDocumentSelection(this.hooks.liveBodies());
        applyInlineProperties(this.hooks.liveBodies(), window.getSelection()!.getRangeAt(0), inlineProperties(copied));
        this.editor.formatPainterActive.set(false);
        this.editor.copiedInlineStyle.set(null);
        this.hooks.finishDocumentMutation();
        this.hooks.showToast('Formato aplicado');
      }
    }
  }

  handleInsertOrUpdateLatexFormula(latexCode: string): void {
    const preSnapshot = this.editor.pages().map((p) => ({
      ...p,
      html: this.editor.getPageBody(p.id)?.innerHTML ?? p.html,
    }));

    const editingEl = this.editor.editingLatexElement();
    if (editingEl) {
      this.editor.pushUndoSnapshot(preSnapshot);
      editingEl.setAttribute('data-latex', encodeURIComponent(latexCode.trim()));
      editingEl.innerHTML = this.hooks.latexRenderer.renderLatexToHtml(latexCode);
      this.editor.editingLatexElement.set(null);
      this.editor.editingLatexCode.set(undefined);
      this.editor.commitPageDomToState(this.editor.activePageIndex());
      this.editor.checkAndPaginateOverflow(this.editor.activePageIndex(), preSnapshot);
      this.hooks.showToast('Fórmula LaTeX actualizada en la página');
      return;
    }

    const activeEl = this.hooks.getActivePageElement();
    if (activeEl) {
      this.editor.pushUndoSnapshot(preSnapshot);
      activeEl.focus();
      const formulaHtml = this.hooks.latexRenderer.buildDocumentFormulaBlockHtml(latexCode);
      document.execCommand('insertHTML', false, formulaHtml);
      this.editor.commitPageDomToState(this.editor.activePageIndex());
      this.editor.checkAndPaginateOverflow(this.editor.activePageIndex(), preSnapshot);
      this.hooks.showToast(
        `Fórmula LaTeX insertada en la Página ${this.editor.activePageIndex() + 1} (haz clic sobre ella para editarla o eliminarla)`
      );
    }
  }

  handleDeleteExistingLatexFormula(): void {
    const editingEl = this.editor.editingLatexElement();
    if (!editingEl) return;
    this.editor.pushUndoSnapshot();
    editingEl.remove();
    this.editor.editingLatexElement.set(null);
    this.editor.editingLatexCode.set(undefined);
    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.hooks.showToast('Fórmula LaTeX eliminada del documento (Ctrl+Z para restaurar)');
  }

  openLatexModal(): void {
    this.editor.editingLatexElement.set(null);
    this.editor.editingLatexCode.set(undefined);
    this.editor.latexModalOpen.set(true);
  }

  onCloseLatexModal(): void {
    this.editor.latexModalOpen.set(false);
    this.editor.editingLatexElement.set(null);
    this.editor.editingLatexCode.set(undefined);
  }
}
