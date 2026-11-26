import { documentHref } from '../../../core/utils/document-link';
import { WordArtPreset } from '../models/word-insert.model';

import type { PureDocEditorComponent } from '../pure-doc-editor.component';
import type { WordEditorHooks } from './word-editor-hooks';

type WordInsertControllerHost = Pick<PureDocEditorComponent,
  | 'activePageIndex'
  | 'checkAndPaginateOverflow'
  | 'commitPageDomToState'
  | 'documentReady'
  | 'executeCommand'
  | 'isReadMode'
  | 'pushUndoSnapshot'>;
type WordInsertControllerHooks = Pick<WordEditorHooks,
  | 'canvasMode'
  | 'collectDocData'
  | 'destroyed'
  | 'dialogs'
  | 'getActivePageElement'
  | 'hasSelection'
  | 'insertCanvasHtml'
  | 'loadedNoteId'
  | 'pendingRenderPages'
  | 'prepareRibbonSelection'
  | 'references'
  | 'restoreSelection'
  | 'saveSelection'
  | 'scheduleAutoSave'
  | 'scheduleDocumentFlow'
  | 'selectedText'
  | 'showToast'>;

/** Insert behavior owned by one editor instance. */
const AUDIO_ICON_SVG = '<svg class="word-doc-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const VIDEO_ICON_SVG = '<svg class="word-doc-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
const COMMENT_ICON_SVG = '<svg class="word-doc-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#854d0e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

export class WordInsertController {
  constructor(private readonly editor: WordInsertControllerHost, private readonly hooks: WordInsertControllerHooks) {}

  handleInsertChecklist(): void {
    const html = `
      <ul style="list-style: none; padding-left: 0.5rem;">
        <li><label><input type="checkbox" style="margin-right: 8px;" /> Tarea pendiente 1</label></li>
        <li><label><input type="checkbox" style="margin-right: 8px;" /> Tarea pendiente 2</label></li>
      </ul><p><br/></p>
    `;
    this.editor.executeCommand('insertHTML', html);
  }

  handleInsertLink(): void {
    if (this.editor.isReadMode()) return;
    const sourceId = this.hooks.loadedNoteId;
    this.hooks.saveSelection();
    this.hooks.dialogs.open({
      kind: 'input', title: 'Insertar enlace', label: 'Dirección del enlace', initialValue: 'https://', maxLength: 2048,
      submitLabel: 'Insertar enlace', icon: 'paperclip',
      validate: (value) => {
        try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value, window.location.origin).protocol) ? null : 'Introduce un enlace válido.'; }
        catch { return 'Introduce un enlace válido.'; }
      },
      onCancel: () => { if (!this.hooks.destroyed && this.hooks.loadedNoteId === sourceId) this.hooks.restoreSelection(); },
      onSubmit: (url) => {
        if (this.hooks.destroyed || this.hooks.loadedNoteId !== sourceId) return;
        this.hooks.restoreSelection();
        const selected = this.hooks.selectedText?.() ?? (window.getSelection()?.toString() || '');
        if (selected) this.editor.executeCommand('createLink', url);
        else {
          const anchor = document.createElement('a');
          anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = url;
          this.editor.executeCommand('insertHTML', anchor.outerHTML);
        }
      },
    });
  }

  handleInsertDocumentReference(): void {
    if (!this.editor.documentReady() || this.editor.isReadMode() || !this.hooks.loadedNoteId) return;
    const sourceId = this.hooks.loadedNoteId;
    this.hooks.saveSelection();
    this.hooks.references.open(sourceId, (note) => {
      if (this.hooks.destroyed || this.hooks.loadedNoteId !== sourceId) return;
      this.hooks.restoreSelection();
      const href = documentHref(note._id);
      const selected = this.hooks.selectedText?.() ?? (window.getSelection()?.toString() || '');
      if (selected) this.editor.executeCommand('createLink', href);
      else {
        const anchor = document.createElement('a');
        anchor.setAttribute('href', href); anchor.textContent = note.title || 'Sin título';
        this.editor.executeCommand('insertHTML', anchor.outerHTML);
      }
    }, () => { if (!this.hooks.destroyed && this.hooks.loadedNoteId === sourceId) this.hooks.restoreSelection(); });
  }

  handleInsertBlockquote(): void {
    const selectedText =
      this.hooks.selectedText?.() ||
      window.getSelection()?.toString() ||
      'Escribe aquí tu cita destacada...';
    this.editor.executeCommand('insertHTML', `<blockquote>${selectedText}</blockquote><p><br/></p>`);
  }

  handleInsertCodeBlock(lang: string): void {
    const codeHtml = `<pre><code data-lang="${lang}">// Código ${lang}\nfunction ejemplo() {\n  return "Hola Mundo";\n}</code></pre><p><br/></p>`;
    this.editor.executeCommand('insertHTML', codeHtml);
  }

  handleInsertCalloutBox(): void {
    const calloutHtml = `
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; margin: 12px 0;">
        <strong>Nota Importante:</strong> Escribe aquí los detalles clave o advertencias de esta sección.
      </div><p><br/></p>
    `;
    this.editor.executeCommand('insertHTML', calloutHtml);
  }

  handleInsertChartTable(): void {
    const chartHtml = `
      <table>
        <thead>
          <tr>
            <th>Indicador (KPI)</th>
            <th>Q1</th>
            <th>Q2</th>
            <th>Progreso Visual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Adopción de Clientes</strong></td>
            <td>64%</td>
            <td>88%</td>
            <td><div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;"><div style="background:#2563eb;height:10px;width:88%;border-radius:4px;"></div></div></td>
          </tr>
          <tr>
            <td><strong>Eficiencia Operativa</strong></td>
            <td>72%</td>
            <td>94%</td>
            <td><div style="background:#e2e8f0;border-radius:4px;height:10px;width:100%;"><div style="background:#16a34a;height:10px;width:94%;border-radius:4px;"></div></div></td>
          </tr>
        </tbody>
      </table><p><br/></p>
    `;
    this.editor.executeCommand('insertHTML', chartHtml);
  }

  handleInsertAudioPlaceholder(): void {
    const html = `
      <div class="word-audio-placeholder" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;margin:10px 0;">
        <span style="display:inline-flex;align-items:center;justify-content:center;">${AUDIO_ICON_SVG}</span>
        <div>
          <div style="font-weight:600;font-size:13px;">Archivo de Audio Adjunto</div>
          <div style="font-size:11px;color:#64748b;">Grabación_Reunión_Ejecutiva.mp3</div>
        </div>
      </div><p><br/></p>
    `;
    this.editor.executeCommand('insertHTML', html);
  }

  handleInsertVideoPlaceholder(): void {
    const html = `
      <div class="word-video-placeholder" style="padding:16px;background:#0f172a;color:#f8fafc;border-radius:8px;margin:12px 0;text-align:center;">
        <div style="font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;">${VIDEO_ICON_SVG}<span>Bloque Multimedia de Video</span></div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Presentación_Corporativa_2025.mp4</div>
      </div><p><br/></p>
    `;
    this.editor.executeCommand('insertHTML', html);
  }

  insertHtmlAtCursorOrActivePage(html: string, keepInlineCaret = false): void {
    if (this.hooks.canvasMode?.() && this.hooks.insertCanvasHtml) {
      this.hooks.insertCanvasHtml(html, keepInlineCaret);
      return;
    }
    this.editor.pushUndoSnapshot();
    const range = this.hooks.prepareRibbonSelection();
    const activeEl = this.hooks.getActivePageElement();
    if (!activeEl) return;

    let targetRange: Range | null = range;
    const sel = window.getSelection();
    if (!targetRange && sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
      targetRange = sel.getRangeAt(0);
    }

    let insertedNode: Node | null = null;
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const fragment = template.content;
    const lastChild = fragment.lastChild;

    if (keepInlineCaret) {
      const inlineBlocks = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,th,td';
      const anchor = targetRange?.startContainer;
      const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
      let block = anchorElement?.closest<HTMLElement>(inlineBlocks) ?? null;
      if (!block || !activeEl.contains(block)) {
        block = Array.from(activeEl.querySelectorAll<HTMLElement>(inlineBlocks)).at(-1) ?? null;
      }
      if (!block) {
        block = document.createElement('p');
        activeEl.appendChild(block);
      }
      if (block.innerHTML.toLowerCase() === '<br>') block.replaceChildren();

      const inlineRange = targetRange && block.contains(targetRange.startContainer)
        && block.contains(targetRange.endContainer)
        ? targetRange
        : document.createRange();
      if (inlineRange !== targetRange) {
        inlineRange.selectNodeContents(block);
        inlineRange.collapse(false);
      }
      inlineRange.deleteContents();
      inlineRange.insertNode(fragment);
      if (lastChild) {
        const caret = document.createRange();
        caret.setStartAfter(lastChild);
        caret.collapse(true);
        activeEl.focus({ preventScroll: true });
        sel?.removeAllRanges();
        sel?.addRange(caret);
      }
      this.hooks.pendingRenderPages = null;
      this.editor.commitPageDomToState(this.editor.activePageIndex());
      this.hooks.scheduleAutoSave(this.hooks.collectDocData());
      this.hooks.scheduleDocumentFlow();
      return;
    }

    if (targetRange && activeEl.contains(targetRange.commonAncestorContainer)) {
      targetRange.deleteContents();
      targetRange.insertNode(fragment);
      if (lastChild) {
        insertedNode = lastChild;
        const newRange = document.createRange();
        newRange.setStartAfter(lastChild);
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    } else {
      if (
        activeEl.childNodes.length === 1 &&
        activeEl.firstElementChild?.tagName === 'P' &&
        !activeEl.firstElementChild.textContent?.trim()
      ) {
        activeEl.replaceChildren(fragment);
      } else {
        activeEl.appendChild(fragment);
      }
      if (lastChild && activeEl.contains(lastChild)) {
        insertedNode = lastChild;
        const newRange = document.createRange();
        newRange.setStartAfter(lastChild);
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    }

    this.hooks.pendingRenderPages = null;
    this.editor.commitPageDomToState(this.editor.activePageIndex());
    this.editor.checkAndPaginateOverflow(this.editor.activePageIndex());
    this.hooks.scheduleAutoSave(this.hooks.collectDocData());
    this.hooks.scheduleDocumentFlow();

    setTimeout(() => {
      if (insertedNode instanceof HTMLElement) {
        insertedNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (insertedNode?.parentElement) {
        insertedNode.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 40);
  }

  handleInsertComment(): void {
    const commentHtml = `
      <span class="word-comment-badge" contenteditable="false" style="background:#fef9c3;border:1px solid #eab308;color:#713f12;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:0 4px;display:inline-flex;align-items:center;gap:4px;">
        ${COMMENT_ICON_SVG} Comentario: <span contenteditable="true" style="font-weight:normal;outline:none;min-width:40px;">Escribe tu nota aquí</span>
      </span>&nbsp;
    `;
    this.insertHtmlAtCursorOrActivePage(commentHtml, true);
    this.hooks.showToast('Comentario insertado');
  }

  handleInsertPageNumber(): void {
    const pageNumHtml = `
      <span class="word-page-number" contenteditable="false" style="font-weight:600;color:#2563eb;background:#eff6ff;padding:1px 6px;border-radius:3px;">
        Pág. {{page}}
      </span>&nbsp;
    `;
    this.insertHtmlAtCursorOrActivePage(pageNumHtml, true);
    this.hooks.showToast('Número de página insertado');
  }

  handleInsertTextBox(): void {
    const textBoxHtml = `
      <div class="word-textbox" style="background:#f8fafc;border:1px solid #cbd5e1;border-left:4px solid #2563eb;padding:12px 16px;border-radius:6px;margin:12px 0;">
        <p contenteditable="true" style="font-weight:700;font-size:13px;color:#0f172a;margin:0 0 6px 0;outline:none;">Cuadro de texto</p>
        <p contenteditable="true" style="font-size:12px;color:#334155;margin:0;outline:none;">Escribe o pega contenido destacado aquí.</p>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(textBoxHtml);
    this.hooks.showToast('Cuadro de texto insertado');
  }

  handleInsertNote(): void {
    const selectedText = (this.hooks.selectedText?.() ?? (window.getSelection()?.toString() || '')).trim();
    const safeText = (selectedText || 'Escribe tu nota aquí.')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const noteHtml = `
      <blockquote class="word-note" style="border-left:4px solid #3b82f6;background:#f8fafc;padding:10px 16px;margin:10px 0;font-style:normal;color:#1e293b;">${safeText}</blockquote><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(noteHtml);
    this.hooks.showToast('Nota insertada');
  }

  handleInsertWordArt(preset: WordArtPreset): void {
    const wordArtHtml = `
      <div class="wordart-heading" contenteditable="true" style="${preset.cssStyle} margin:16px 0; text-align:center; outline:none;">
        ${preset.sampleText}
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(wordArtHtml);
    this.hooks.showToast(`WordArt "${preset.name}" insertado`);
  }

  handleInsertDropCap(): void {
    const canDrop = this.hooks.hasSelection
      ? this.hooks.hasSelection()
      : (() => {
          const sel = window.getSelection();
          return Boolean(sel && sel.rangeCount > 0);
        })();
    if (!canDrop) return;
    const selectedText = this.hooks.selectedText?.() ?? (window.getSelection()?.toString() || '');
    const firstChar = selectedText ? selectedText.charAt(0) : 'A';
    const dropCapHtml = `<span style="float:left;font-size:3.2em;line-height:0.8;margin-right:8px;font-weight:bold;color:#1e3a8a;font-family:serif;">${firstChar}</span>`;
    this.insertHtmlAtCursorOrActivePage(dropCapHtml, true);
    this.hooks.showToast('Letra capital insertada');
  }

  handleInsertSignatureLine(): void {
    const sigHtml = `
      <div style="margin:28px 0 16px;max-width:280px;text-align:center;">
        <div style="border-top:1.5px solid #334155;margin-bottom:6px;"></div>
        <div contenteditable="true" style="font-weight:600;font-size:13px;color:#1e293b;outline:none;">Firma del Responsable</div>
        <div contenteditable="true" style="font-size:11px;color:#64748b;outline:none;">Nombre / Cargo / Institución</div>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(sigHtml);
    this.hooks.showToast('Línea de firma insertada');
  }

  handleInsertDateTime(): void {
    const nowStr = new Date().toLocaleDateString(undefined, {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    this.insertHtmlAtCursorOrActivePage(`<span>${nowStr}</span>&nbsp;`, true);
    this.hooks.showToast('Fecha y hora insertadas');
  }

  handleInsertSymbol(symbol: string): void {
    this.insertHtmlAtCursorOrActivePage(`<span>${symbol}</span>&nbsp;`, true);
    this.hooks.showToast(`Símbolo ${symbol} insertado`);
  }

  handleInsertDrawingCanvas(): void {
    const canvasHtml = `
      <div class="word-drawing-canvas" contenteditable="false" style="border:2px dashed #93c5fd;border-radius:8px;padding:20px;margin:16px 0;background:#f0f9ff;min-height:120px;text-align:center;">
        <div style="font-size:11px;color:#0284c7;font-weight:bold;margin-bottom:8px;">[ Lienzo de Dibujo ]</div>
        <div contenteditable="true" style="font-size:12px;color:#475569;outline:none;">Coloca formas o diagramas aquí dentro.</div>
      </div><p><br/></p>
    `;
    this.insertHtmlAtCursorOrActivePage(canvasHtml);
    this.hooks.showToast('Nuevo lienzo de dibujo insertado');
  }
}
