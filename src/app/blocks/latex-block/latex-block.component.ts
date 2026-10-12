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
  templateUrl: './latex-block.component.html',
  styleUrl: './latex-block.component.scss',
})
export class LatexBlockComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) block!: Block;
  @ViewChild('textareaEl') textareaEl?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('displayTarget') displayTarget?: ElementRef<HTMLDivElement>;
  @ViewChild('liveTarget') liveTarget?: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
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

  onCardClick(): void {
    if (this.notesService.isReadingMode()) return;
    this.enableEdit();
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
    const textToRender = formatMultiLineLatex(formula);
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

/**
 * Adapta fórmulas KaTeX que contienen saltos de línea (\n) envolviéndolas
 * en el entorno \begin{gathered}...\end{gathered} y añadiendo \\ a cada línea,
 * permitiendo que KaTeX muestre ecuaciones apiladas verticalmente en lugar de una sola línea.
 */
export function formatMultiLineLatex(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '\\text{Escribe una fórmula...}';
  if (/\\begin\{(aligned|gathered|align|split|matrix|pmatrix|bmatrix|vmatrix|cases)\}/.test(trimmed)) {
    return trimmed;
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1) {
    const joined = lines
      .map((l, i) => {
        if (i === lines.length - 1) return l;
        return l.endsWith('\\\\') ? l : `${l} \\\\`;
      })
      .join('\n');
    return `\\begin{gathered}\n${joined}\n\\end{gathered}`;
  }
  return trimmed;
}
