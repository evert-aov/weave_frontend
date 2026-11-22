import { DocumentLayoutConfig, DocumentPage, SectionColumnsPreset, SectionPageConfig } from '../models/word-document.model';
import { findLogicalSectionStartPageIndex } from '../utils/page-section-layout';
import { selectedParagraphs } from '../utils/document-formatting';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordLayoutControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'activePaperPreset'
  | 'checkAndPaginateOverflow'
  | 'commitPageDomToState'
  | 'documentReady'
  | 'getPageBody'
  | 'layoutConfig'
  | 'pages'
  | 'pushUndoSnapshot'
  | 'viewMode'>;
type WordLayoutControllerHooks = Pick<WordEditorHooks,
  | 'captureHistory'
  | 'cdr'
  | 'collectDocData'
  | 'documentFlow'
  | 'finishDocumentMutation'
  | 'getActivePageElement'
  | 'getLivePagesSnapshot'
  | 'liveBodies'
  | 'prepareRibbonSelection'
  | 'renderDocumentPages'
  | 'scheduleAutoSave'
  | 'scheduleDocumentFlow'
  | 'showToast'
  | 'themeService'>;

/** Layout behavior owned by one editor instance. */
export class WordLayoutController {
  constructor(private readonly editor: WordLayoutControllerHost, private readonly hooks: WordLayoutControllerHooks) {}

  handleApplySectionColumns(preset: SectionColumnsPreset): void {
    const activeEl = this.hooks.getActivePageElement();
    if (!activeEl) return;
    activeEl.focus();

    const preSnapshot = this.editor.pages().map((p) => ({
      ...p,
      html: this.editor.getPageBody(p.id)?.innerHTML ?? p.html,
    }));
    this.editor.pushUndoSnapshot(preSnapshot);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    let existingColBlock: HTMLElement | null = null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== activeEl) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).classList.contains('word-columns-section')
      ) {
        existingColBlock = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (preset === '1') {
      if (existingColBlock) {
        existingColBlock.style.columnCount = '';
        existingColBlock.style.columnGap = '';
        existingColBlock.style.columnRule = '';
        existingColBlock.style.display = 'block';
        existingColBlock.style.gridTemplateColumns = '';
        existingColBlock.classList.remove('word-columns-section');
        this.editor.commitPageDomToState(this.editor.activePageIndex());
        this.hooks.showToast('Sección restaurada a 1 sola columna');
      } else {
        this.hooks.showToast('La sección actual ya está en 1 columna');
      }
      return;
    }

    const buildColumnStyles = (colType: SectionColumnsPreset): string => {
      if (colType === '2') {
        return 'column-count: 2; column-gap: 24pt; column-rule: 1px solid #cbd5e1;';
      }
      if (colType === '3') {
        return 'column-count: 3; column-gap: 18pt; column-rule: 1px solid #cbd5e1;';
      }
      if (colType === 'left') {
        return 'display: grid; grid-template-columns: 1fr 2fr; gap: 20pt; align-items: start;';
      }
      return 'display: grid; grid-template-columns: 2fr 1fr; gap: 20pt; align-items: start;';
    };

    if (existingColBlock && (preset === '2' || preset === '3')) {
      existingColBlock.style.display = 'block';
      existingColBlock.style.gridTemplateColumns = '';
      existingColBlock.style.columnCount = preset;
      existingColBlock.style.columnGap = preset === '2' ? '24pt' : '18pt';
      existingColBlock.style.columnRule = '1px solid #cbd5e1';
      this.editor.commitPageDomToState(this.editor.activePageIndex());
      this.hooks.showToast(`Sección actualizada a ${preset} columnas`);
      return;
    }

    const range = sel.getRangeAt(0);
    const hasSelection = !sel.isCollapsed && activeEl.contains(range.commonAncestorContainer);

    if (hasSelection) {
      const fragment = range.extractContents();
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);
      const selectedHtml = tempDiv.innerHTML.trim();

      let wrappedHtml = '';
      if (preset === 'left' || preset === 'right') {
        wrappedHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">
          <div style="border-right: 1px solid #e2e8f0; padding-right: 12pt;">${selectedHtml}</div>
          <div><p>Escribe aquí el contenido de la segunda columna de esta sección...</p></div>
        </div><p><br/></p>`;
      } else {
        wrappedHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">${
          selectedHtml.includes('<p') ? selectedHtml : `<p>${selectedHtml}</p>`
        }</div><p><br/></p>`;
      }

      document.execCommand('insertHTML', false, wrappedHtml);
    } else {
      let sampleSectionHtml = '';
      if (preset === 'left' || preset === 'right') {
        sampleSectionHtml = `<div class="word-columns-section" style="${buildColumnStyles(preset)}">
          <div style="border-right: 1px solid #e2e8f0; padding-right: 12pt;"><p><strong>Columna 1 (Sección):</strong> Escribe o pega aquí el contenido de la primera columna.</p></div>
          <div><p><strong>Columna 2 (Sección):</strong> Escribe o pega aquí el contenido de la segunda columna.</p></div>
        </div><p><br/></p>`;
      } else {
        const numCols = Number(preset);
        const sampleParagraphs = Array.from({ length: numCols })
          .map(
            (_, i) =>
              `<p><strong>Columna ${i + 1} de la sección:</strong> Escribe aquí el texto que fluirá automáticamente entre las ${numCols} columnas de esta sección sin afectar el resto del documento.</p>`
          )
          .join('');
        sampleSectionHtml = `<div class="word-columns-section" style="${buildColumnStyles(
          preset
        )}">${sampleParagraphs}</div><p><br/></p>`;
      }
      document.execCommand('insertHTML', false, sampleSectionHtml);
    }

    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex(), preSnapshot);
    this.hooks.showToast(`Sección dividida en columnas (${preset}) sin afectar el resto del documento`);
  }

  handleApplyParagraphSpacingAndIndent(patch: {
    indentLeftCm?: number;
    indentRightCm?: number;
    firstLineIndentPt?: number;
    spaceBeforePt?: number;
    spaceAfterPt?: number;
  }): void {
    const range = this.hooks.prepareRibbonSelection();
    if (!range) return;
    this.editor.pushUndoSnapshot();
    selectedParagraphs(this.hooks.liveBodies(), range).forEach(element => {
      if (patch.indentLeftCm !== undefined) element.style.marginLeft = `${patch.indentLeftCm}cm`;
      if (patch.indentRightCm !== undefined) element.style.marginRight = `${patch.indentRightCm}cm`;
      if (patch.firstLineIndentPt !== undefined) element.style.textIndent = `${patch.firstLineIndentPt}pt`;
      if (patch.spaceBeforePt !== undefined) element.style.marginTop = `${patch.spaceBeforePt}pt`;
      if (patch.spaceAfterPt !== undefined) element.style.marginBottom = `${patch.spaceAfterPt}pt`;
    });
    this.hooks.finishDocumentMutation();
  }

  handleAddNewPageAt(
    insertAfterIndex: number,
    options?: { sectionBreak?: 'nextPage'; sectionConfig?: SectionPageConfig },
  ): void {
    this.editor.pushUndoSnapshot();
    const newPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const hasConfig = options?.sectionConfig && Object.keys(options.sectionConfig).length > 0;
    const newPage: DocumentPage = {
      id: newPageId,
      html: `<p><br/></p>`,
      breakBefore: 'manual',
      ...(options?.sectionBreak ? { sectionBreak: options.sectionBreak } : {}),
      ...(hasConfig ? { sectionConfig: { ...options!.sectionConfig } } : {}),
    };

    this.editor.pages.update((prev) => {
      const synced = prev.map((p) => ({
        ...p,
        html: this.editor.getPageBody(p.id)?.innerHTML ?? p.html,
      }));
      const next = [...synced];
      if (next[insertAfterIndex + 1]) next[insertAfterIndex + 1] = { ...next[insertAfterIndex + 1], breakBefore: 'manual' };
      next.splice(insertAfterIndex + 1, 0, newPage);
      return next;
    });

    this.editor.activePageIndex.set(insertAfterIndex + 1);
    this.hooks.showToast(
      options?.sectionBreak === 'nextPage'
        ? `Salto de sección insertado en Página ${insertAfterIndex + 2} (Ctrl+Z para deshacer)`
        : `Página ${insertAfterIndex + 2} (${this.editor.activePaperPreset().name}) añadida (Ctrl+Z para deshacer)`
    );

    setTimeout(() => {
      const newEl = this.editor.getPageBody(newPageId);
      if (newEl) {
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newEl.focus();
      }
    }, 80);
  }

  handleInsertSectionBreak(sectionConfig: SectionPageConfig = {}): void {
    this.handleAddNewPageAt(this.editor.activePageIndex(), {
      sectionBreak: 'nextPage',
      sectionConfig,
    });
  }

  handleUpdateSectionConfig(patch: Partial<SectionPageConfig>, targetPageIndex?: number): void {
    this.editor.pushUndoSnapshot();
    const pageIdx = targetPageIndex ?? this.editor.activePageIndex();
    const currentPages = this.hooks.getLivePagesSnapshot();
    const sectionStartIdx = findLogicalSectionStartPageIndex(currentPages, pageIdx);
    const nextPages = currentPages.map((page, idx) => {
      if (idx !== sectionStartIdx) return page;
      const merged: SectionPageConfig = { ...(page.sectionConfig ?? {}), ...patch };
      for (const [k, v] of Object.entries(merged) as Array<[keyof SectionPageConfig, unknown]>) {
        if (v === undefined) delete merged[k];
      }
      const hasKeys = Object.keys(merged).length > 0;
      const copy: DocumentPage = { ...page };
      if (hasKeys) copy.sectionConfig = merged;
      else delete copy.sectionConfig;
      return copy;
    });
    this.hooks.renderDocumentPages(nextPages);
    if (sectionStartIdx === 0 && patch.differentFirstPage !== undefined) {
      this.handleUpdateLayout(prev => ({ ...prev, differentFirstPage: patch.differentFirstPage }));
    } else if (this.editor.documentReady()) {
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    }
    this.hooks.showToast('Configuración de sección actualizada');
  }

  handleInsertPageBreak(): void {
    const activeEl = this.hooks.getActivePageElement();
    if (!activeEl) {
      this.handleAddNewPageAt(this.editor.activePageIndex());
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !activeEl.contains(sel.anchorNode)) {
      this.handleAddNewPageAt(this.editor.activePageIndex());
      return;
    }

    this.editor.pushUndoSnapshot();
    const selectionRange = sel.getRangeAt(0);
    selectionRange.deleteContents();
    const trailing = selectionRange.cloneRange();
    trailing.setEnd(activeEl, activeEl.childNodes.length);
    const fragment = trailing.extractContents();
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    const head = activeEl.lastElementChild as HTMLElement | null;
    const tail = holder.firstElementChild as HTMLElement | null;
    if (head && tail && head.tagName === tail.tagName && head.contains(selectionRange.startContainer)) {
      this.hooks.documentFlow.linkContinuation(head, tail);
    }
    if (!activeEl.innerHTML) activeEl.innerHTML = '<p><br></p>';
    if (!holder.innerHTML) holder.innerHTML = '<p><br></p>';
    // Put the caret at the exact beginning of the new page, including an empty paragraph.
    const caretHost = holder.firstElementChild ?? holder;
    caretHost.insertBefore(document.createComment('weave-selection-start'), caretHost.firstChild);
    const pages = this.hooks.getLivePagesSnapshot();
    const insertAt = this.editor.activePageIndex();
    pages.splice(insertAt + 1, 0, {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      html: holder.innerHTML,
      breakBefore: 'manual',
    });
    this.hooks.renderDocumentPages(pages);
    this.editor.activePageIndex.set(insertAt + 1);
    this.hooks.scheduleDocumentFlow();
    this.hooks.showToast('Salto de página insertado');
  }

  handleDeletePage(indexToDelete: number): void {
    if (this.editor.pages().length <= 1) {
      this.hooks.showToast('El documento debe tener al menos 1 página');
      return;
    }
    if (indexToDelete < 0 || indexToDelete >= this.editor.pages().length) return;
    const snapshot = this.hooks.captureHistory();
    this.editor.pushUndoSnapshot(snapshot.pages);
    const next = snapshot.pages.filter((_, index) => index !== indexToDelete);
    this.hooks.renderDocumentPages(next);
    const active = snapshot.activePageIndex;
    this.editor.activePageIndex.set(Math.min(active > indexToDelete ? active - 1 : active, next.length - 1));
    this.hooks.showToast(`Página ${indexToDelete + 1} eliminada (Ctrl+Z para restaurar)`);
  }

  handleUpdateLayout(updater: (prev: DocumentLayoutConfig) => DocumentLayoutConfig): void {
    this.editor.layoutConfig.update((prev) => updater(prev));
    this.hooks.cdr?.markForCheck();
    if (this.editor.documentReady()) {
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    }
  }

  handleSetDarkMode(dark: boolean): void {
    if (this.hooks.themeService && this.hooks.themeService.isDark() !== dark) {
      this.hooks.themeService.setDark(dark);
    }
  }

  onHeaderInput(e: Event): void {
    const newHtml = (e.target as HTMLElement).innerHTML;
    this.handleUpdateLayout((prev) => ({ ...prev, headerHtml: newHtml }));
  }

  onFooterInput(e: Event): void {
    const newHtml = (e.target as HTMLElement).innerHTML;
    this.handleUpdateLayout((prev) => ({ ...prev, footerHtml: newHtml }));
  }

  pagePaddingTop(): number {
    return this.editor.viewMode() === 'draft' ? 32 : this.editor.layoutConfig().margins.topPx;
  }

  pagePaddingRight(): number {
    return this.editor.viewMode() === 'draft' ? 36 : this.editor.layoutConfig().margins.rightPx;
  }

  pagePaddingBottom(): number {
    return this.editor.viewMode() === 'draft' ? 32 : this.editor.layoutConfig().margins.bottomPx;
  }

  pagePaddingLeft(): number {
    const layout = this.editor.layoutConfig();
    return this.editor.viewMode() === 'draft'
      ? 36
      : layout.margins.leftPx + (layout.showLineNumbers ? 28 : 0);
  }
}
