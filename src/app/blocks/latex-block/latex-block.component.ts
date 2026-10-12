import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  inject,
  signal,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as katex from 'katex';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';

/**
 * Bloque LaTeX con Renderizado Nativo KaTeX de Flujo Natural.
 * - Sin scrollbars artificiales ni enclaustramiento: ocupa el espacio necesario en el documento.
 * - Renderizado directo en el DOM (sin filtros de DomSanitizer) para total fidelidad de símbolos matemáticos.
 * - Textarea auto-expandible en altura durante la edición.
 * - Transición ultra limpia entre edición y visualización matemática.
 */
@Component({
  selector: 'app-latex-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="latex-block-root" [class.editing]="isEditing()">
      <!-- Modo Edición: Textarea auto-expandible con cabecera y vista previa en vivo -->
      @if (isEditing()) {
        <div class="latex-editor-card">
          <div class="editor-bar">
            <div class="badge-tag">
              <span class="sigma-glyph">∑</span>
              <span class="badge-text">LaTeX Formula</span>
            </div>
            <div class="bar-actions">
              <span class="hint-key">Ctrl + Enter</span>
              <button type="button" class="done-btn" (mousedown)="finishEditing($event)">
                {{ i18n.currentLang() === 'es' ? 'Listo' : 'Done' }}
              </button>
            </div>
          </div>

          <textarea
            #textareaEl
            [(ngModel)]="rawFormula"
            (input)="onFormulaInput()"
            (keydown.control.enter)="saveAndPreview()"
            (blur)="onBlurEditor()"
            [placeholder]="'Ej: \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}'"
            class="latex-textarea"
          ></textarea>

          <!-- Vista previa en vivo mientras escribe -->
          <div class="live-preview-box">
            <div class="live-preview-label">
              {{ i18n.currentLang() === 'es' ? 'Vista previa en vivo' : 'Live Preview' }}
            </div>
            <div #liveTarget class="math-render-surface"></div>
          </div>
        </div>
      } @else {
        <!-- Modo Visualización: Fórmula integrada naturalmente al documento (sin scroll) -->
        <div class="latex-display-card" (click)="enableEdit()" title="Haz clic para editar la fórmula">
          <div class="top-tag">
            <span class="sigma-glyph">∑</span>
            <span>LaTeX</span>
          </div>

          <div #displayTarget class="math-render-surface main-display"></div>

          <button type="button" class="quick-edit-btn" (click)="$event.stopPropagation(); enableEdit()">
            {{ i18n.currentLang() === 'es' ? 'Editar' : 'Edit' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .latex-block-root {
        width: 100%;
        margin: 10px 0;
        position: relative;
        font-family: inherit;
      }

      /* Tarjeta de visualización integrada limpiamente */
      .latex-display-card {
        width: 100%;
        padding: 22px 28px 18px;
        background: color-mix(in srgb, var(--panel) 60%, var(--bg));
        border: 1px solid var(--border);
        border-radius: 9px;
        cursor: pointer;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .latex-display-card:hover {
        border-color: var(--border-strong);
        background: var(--panel);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
      }

      .top-tag {
        position: absolute;
        top: 8px;
        left: 12px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        color: var(--faint);
        letter-spacing: 0.06em;
        user-select: none;
      }
      .sigma-glyph {
        font-size: 13px;
        color: var(--accent);
        font-weight: 700;
      }

      .quick-edit-btn {
        position: absolute;
        top: 8px;
        right: 12px;
        font-size: 10px;
        font-weight: 600;
        color: var(--muted);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 2px 8px;
        opacity: 0;
        transition: opacity 0.15s ease, color 0.15s ease;
      }
      .latex-display-card:hover .quick-edit-btn {
        opacity: 1;
      }
      .quick-edit-btn:hover {
        color: var(--accent);
        border-color: var(--accent);
      }

      /* Superficie de renderizado KaTeX: Flujo natural sin scroll */
      .math-render-surface {
        width: 100%;
        color: var(--text);
        text-align: center;
        overflow: visible; /* Elimina cualquier scroll forzado */
      }
      .main-display {
        font-size: 17px;
        padding: 6px 0;
      }

      ::ng-deep .math-render-surface .katex-display {
        margin: 0.4em 0;
        overflow: visible !important;
      }
      ::ng-deep .math-render-surface .katex {
        font-size: 1.15em;
        text-rendering: auto;
      }

      /* Modo Edición */
      .latex-editor-card {
        width: 100%;
        background: var(--bg);
        border: 1px solid var(--accent);
        border-radius: 9px;
        padding: 12px 14px;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
        animation: fadeIn 0.12s ease;
      }

      .editor-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .badge-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
      }
      .bar-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .hint-key {
        font-size: 10px;
        color: var(--faint);
        font-family: 'DM Sans', sans-serif;
      }
      .done-btn {
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        background: var(--accent);
        border-radius: 5px;
        padding: 3px 12px;
        transition: opacity 0.15s ease;
      }
      .done-btn:hover {
        opacity: 0.9;
      }

      /* Textarea con auto-expansión en altura, sin scrollbar vertical */
      .latex-textarea {
        width: 100%;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text);
        padding: 10px 12px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        line-height: 1.5;
        outline: none;
        resize: none;
        overflow-y: hidden;
        min-height: 52px;
        box-sizing: border-box;
      }
      .latex-textarea:focus {
        border-color: var(--accent);
      }

      /* Recuadro de vista previa en vivo durante edición */
      .live-preview-box {
        margin-top: 10px;
        padding: 10px 14px;
        background: var(--panel);
        border-radius: 6px;
        border: 1px dashed var(--border-strong);
      }
      .live-preview-label {
        font-size: 9.5px;
        font-weight: 600;
        color: var(--faint);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
    `,
  ],
})
export class LatexBlockComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) block!: Block;
  @ViewChild('textareaEl') textareaEl?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('displayTarget') displayTarget?: ElementRef<HTMLDivElement>;
  @ViewChild('liveTarget') liveTarget?: ElementRef<HTMLDivElement>;

  private readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly isEditing = signal<boolean>(false);
  rawFormula = '';

  ngOnInit(): void {
    this.rawFormula =
      this.block.content?.['formula'] ||
      'Attention(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V';
  }

  ngAfterViewInit(): void {
    this.renderDisplayFormula();
  }

  enableEdit(): void {
    this.isEditing.set(true);
    setTimeout(() => {
      this.adjustTextareaHeight();
      this.textareaEl?.nativeElement.focus();
      this.renderLiveFormula();
    }, 40);
  }

  onFormulaInput(): void {
    this.adjustTextareaHeight();
    this.renderLiveFormula();
  }

  finishEditing(event: MouseEvent): void {
    event.preventDefault();
    this.saveAndPreview();
  }

  onBlurEditor(): void {
    // Si no se hizo clic en el botón hecho, guardar al perder foco
    this.saveAndPreview();
  }

  saveAndPreview(): void {
    if (!this.isEditing()) return;
    this.isEditing.set(false);
    this.notesService.updateBlockContent(this.block.id, {
      formula: this.rawFormula,
    });
    setTimeout(() => {
      this.renderDisplayFormula();
    }, 30);
  }

  private renderDisplayFormula(): void {
    if (this.displayTarget?.nativeElement) {
      this.renderFormulaToElement(this.displayTarget.nativeElement, this.rawFormula);
    }
  }

  private renderLiveFormula(): void {
    if (this.liveTarget?.nativeElement) {
      this.renderFormulaToElement(this.liveTarget.nativeElement, this.rawFormula);
    }
  }

  private renderFormulaToElement(element: HTMLElement, formula: string): void {
    const textToRender = formula.trim() || '\\text{Escribe una fórmula...}';
    try {
      katex.render(textToRender, element, {
        displayMode: true,
        throwOnError: false,
        trust: true,
      });
    } catch {
      element.innerHTML = `<span style="color:#ef4444;font-size:12px;">Error en la fórmula LaTeX</span>`;
    }
  }

  private adjustTextareaHeight(): void {
    if (this.textareaEl?.nativeElement) {
      const el = this.textareaEl.nativeElement;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 52)}px`;
    }
  }
}

