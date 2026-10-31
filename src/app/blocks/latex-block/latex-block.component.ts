import { AiDocumentService } from '../../core/services/ai-document.service';
import { cleanLatexSource } from '../../core/utils/ai-edit-text';
import {
  Component,
  Input,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as katex from 'katex';
import { DEFAULT_LATEX_FONT_SIZE_PX, MIN_LATEX_FONT_SIZE_PX, MAX_LATEX_FONT_SIZE_PX, normalizeLatexFontSize, formatMultiLineLatex } from '../../shared/utils/latex';
export { formatMultiLineLatex } from '../../shared/utils/latex';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { MonacoLatexEditorComponent } from '../../shared/latex/monaco-latex-editor.component';
import { LatexPreviewComponent } from '../../shared/latex/latex-preview.component';
import { isLatexDocument, LatexAlignment, normalizeLatexAlignment, splitLatexRows, reconcileLatexRowAlignments } from '../../shared/utils/latex';

import { renderFormula } from '../../shared/latex/render-formula';

export interface LatexToolItem {
  label: string;
  snippet: string;
  tooltip: string;
}

export interface LatexCategory {
  id: string;
  nameEs: string;
  nameEn: string;
  items: LatexToolItem[];
}

/**
 * Bloque LaTeX Enriquecido con Cuadro de Herramientas Interactivo.
 * - Paleta visual categorizada con renderizado KaTeX de símbolos para asistencia guiada.
 * - Inserción inteligente de snippets en la posición del cursor con selección envolvente.
 * - Renderizado en vivo sin retrasos.
 * - Modo lectura de flujo natural sin scrollbars.
 */
@Component({
  selector: 'app-latex-block',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, MonacoLatexEditorComponent, LatexPreviewComponent],
  templateUrl: './latex-block.component.html',
  styleUrl: './latex-block.component.scss',
})
export class LatexBlockComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) block!: Block;
  @ViewChild(MonacoLatexEditorComponent) sourceEditor?: MonacoLatexEditorComponent;
  @ViewChild('displayTarget') displayTarget?: ElementRef<HTMLDivElement>;
  @ViewChild('liveTarget') liveTarget?: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly isEditing = signal<boolean>(false);
  readonly documentMode = signal(false);
  private lastSavedDocumentMode = false;
  readonly showToolbox = signal<boolean>(true);
  readonly activeCategoryId = signal<string>('basics');

  readonly fontSizePx = signal(DEFAULT_LATEX_FONT_SIZE_PX);
  readonly alignment = signal<LatexAlignment>('center');
  readonly alignByLine = signal(false);
  readonly lineAlignments = signal<(LatexAlignment | null)[]>([]);
  readonly formulaRows = signal<string[]>([]);
  private savedLineSettings = '';

  setAlignByLine(enabled: boolean): void {
    if (!this.isEditing() || this.documentMode() || this.notesService.isReadingMode()) return;
    this.alignByLine.set(enabled); this.persistChanges(); this.renderLiveFormula();
  }

  setLineAlignment(index: number, value: string): void {
    if (!this.isEditing() || this.documentMode() || this.notesService.isReadingMode()) return;
    this.lineAlignments.update(values => this.formulaRows().map((_, i) =>
      i === index ? (value === 'inherit' ? null : normalizeLatexAlignment(value)) : values[i] ?? null));
    this.persistChanges(); this.renderLiveFormula();
  }

  private lineSettings(): string { return JSON.stringify([this.alignByLine(), this.lineAlignments()]); }

  private lastSavedAlignment: LatexAlignment = 'center';
  readonly alignmentOptions = [
    { value: 'left', es: 'Alinear a la izquierda', en: 'Align left', path: 'M4 5h16M4 10h10M4 15h16M4 20h10' },
    { value: 'center', es: 'Centrar fórmula', en: 'Center formula', path: 'M4 5h16M7 10h10M4 15h16M7 20h10' },
    { value: 'right', es: 'Alinear a la derecha', en: 'Align right', path: 'M4 5h16M10 10h10M4 15h16M10 20h10' },
  ] as const;
  readonly minFontSize = MIN_LATEX_FONT_SIZE_PX;
  readonly maxFontSize = MAX_LATEX_FONT_SIZE_PX;
  readonly fontSizePresets = [10,11.5,14,16,20,24,32,48];
  private ownerNoteId?: string;
  private lastSavedFormula = '';
  private lastSavedFontSize = DEFAULT_LATEX_FONT_SIZE_PX;
  private destroyed = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  rawFormula = '';
  private readonly renderedChipsMap = new Map<string, SafeHtml>();

  readonly categories: LatexCategory[] = [
    {
      id: 'basics',
      nameEs: 'Básicos',
      nameEn: 'Basics',
      items: [
        { label: '\\frac{a}{b}', snippet: '\\frac{a}{b}', tooltip: 'Fracción (\\frac{numerador}{denominador})' },
        { label: '\\sqrt{x}', snippet: '\\sqrt{x}', tooltip: 'Raíz cuadrada (\\sqrt{x})' },
        { label: '\\sqrt[n]{x}', snippet: '\\sqrt[n]{x}', tooltip: 'Raíz n-ésima (\\sqrt[n]{x})' },
        { label: 'x^{n}', snippet: 'x^{2}', tooltip: 'Exponente / Potencia (x^{n})' },
        { label: 'x_{i}', snippet: 'x_{i}', tooltip: 'Subíndice (x_{i})' },
        { label: 'x_{i}^{n}', snippet: 'x_{i}^{2}', tooltip: 'Subíndice y superíndice (x_{i}^{n})' },
        { label: '\\cdot', snippet: '\\cdot ', tooltip: 'Punto de multiplicación (\\cdot)' },
        { label: '\\times', snippet: '\\times ', tooltip: 'Signo de multiplicación (\\times)' },
        { label: '\\div', snippet: '\\div ', tooltip: 'Signo de división (\\div)' },
        { label: '\\pm', snippet: '\\pm ', tooltip: 'Más / Menos (\\pm)' },
        { label: '\\mp', snippet: '\\mp ', tooltip: 'Menos / Más (\\mp)' },
        { label: '\\left( x \\right)', snippet: '\\left( x \\right)', tooltip: 'Paréntesis adaptables (\\left( ... \\right))' },
        { label: '\\left[ x \\right]', snippet: '\\left[ x \\right]', tooltip: 'Corchetes adaptables (\\left[ ... \\right])' },
        { label: '\\left\\{ x \\right\\}', snippet: '\\left\\{ x \\right\\}', tooltip: 'Llaves adaptables (\\left\\{ ... \\right\\})' },
        { label: '|x|', snippet: '\\left| x \\right|', tooltip: 'Valor absoluto (\\left| x \\right|)' },
        { label: '\\text{abc}', snippet: '\\text{texto}', tooltip: 'Texto plano sin formato matemático' },
      ],
    },
    {
      id: 'calculus',
      nameEs: 'Cálculo',
      nameEn: 'Calculus',
      items: [
        { label: '\\int_{a}^{b}', snippet: '\\int_{a}^{b} f(x) \\, dx', tooltip: 'Integral definida (\\int_{a}^{b})' },
        { label: '\\int', snippet: '\\int f(x) \\, dx', tooltip: 'Integral indefinida (\\int)' },
        { label: '\\iint', snippet: '\\iint_{D} f(x, y) \\, dx dy', tooltip: 'Integral doble (\\iint)' },
        { label: '\\oint', snippet: '\\oint_{C} f(z) \\, dz', tooltip: 'Integral de contorno cerrado (\\oint)' },
        { label: '\\sum_{i=1}^{n}', snippet: '\\sum_{i=1}^{n} x_i', tooltip: 'Sumatoria con límites (\\sum)' },
        { label: '\\prod_{i=1}^{n}', snippet: '\\prod_{i=1}^{n} x_i', tooltip: 'Productoria con límites (\\prod)' },
        { label: '\\lim_{x \\to 0}', snippet: '\\lim_{x \\to 0} \\frac{f(x)}{x}', tooltip: 'Límite (\\lim)' },
        { label: '\\lim_{x \\to \\infty}', snippet: '\\lim_{x \\to \\infty} f(x)', tooltip: 'Límite al infinito' },
        { label: '\\frac{dy}{dx}', snippet: '\\frac{df}{dx}', tooltip: 'Derivada ordinaria' },
        { label: '\\frac{\\partial f}{\\partial x}', snippet: '\\frac{\\partial f}{\\partial x}', tooltip: 'Derivada parcial (\\partial)' },
        { label: '\\nabla', snippet: '\\nabla f', tooltip: 'Operador gradiente / Nabla' },
        { label: '\\vec{v}', snippet: '\\vec{v}', tooltip: 'Vector con flecha (\\vec{v})' },
        { label: '\\|x\\|', snippet: '\\|x\\|', tooltip: 'Norma de vector (\\|x\\|)' },
      ],
    },
    {
      id: 'symbols',
      nameEs: 'Símbolos & Griegas',
      nameEn: 'Symbols & Greek',
      items: [
        { label: '\\alpha', snippet: '\\alpha ', tooltip: 'Alfa (\\alpha)' },
        { label: '\\beta', snippet: '\\beta ', tooltip: 'Beta (\\beta)' },
        { label: '\\gamma', snippet: '\\gamma ', tooltip: 'Gamma (\\gamma)' },
        { label: '\\delta', snippet: '\\delta ', tooltip: 'Delta (\\delta)' },
        { label: '\\epsilon', snippet: '\\epsilon ', tooltip: 'Épsilon (\\epsilon)' },
        { label: '\\theta', snippet: '\\theta ', tooltip: 'Theta (\\theta)' },
        { label: '\\lambda', snippet: '\\lambda ', tooltip: 'Lambda (\\lambda)' },
        { label: '\\mu', snippet: '\\mu ', tooltip: 'Mu (\\mu)' },
        { label: '\\pi', snippet: '\\pi ', tooltip: 'Pi (\\pi)' },
        { label: '\\sigma', snippet: '\\sigma ', tooltip: 'Sigma (\\sigma)' },
        { label: '\\tau', snippet: '\\tau ', tooltip: 'Tau (\\tau)' },
        { label: '\\phi', snippet: '\\phi ', tooltip: 'Fi / Phi (\\phi)' },
        { label: '\\omega', snippet: '\\omega ', tooltip: 'Omega minúscula (\\omega)' },
        { label: '\\Delta', snippet: '\\Delta ', tooltip: 'Delta mayúscula (\\Delta)' },
        { label: '\\Sigma', snippet: '\\Sigma ', tooltip: 'Sigma mayúscula (\\Sigma)' },
        { label: '\\Omega', snippet: '\\Omega ', tooltip: 'Omega mayúscula (\\Omega)' },
        { label: '\\infty', snippet: '\\infty ', tooltip: 'Infinito (\\infty)' },
        { label: '\\to', snippet: '\\to ', tooltip: 'Flecha hacia la derecha / Tiende a (\\to)' },
        { label: '\\Rightarrow', snippet: '\\Rightarrow ', tooltip: 'Implicación lógica (\\Rightarrow)' },
        { label: '\\iff', snippet: '\\iff ', tooltip: 'Si y solo si (\\iff)' },
        { label: '\\in', snippet: '\\in ', tooltip: 'Pertenece a (\\in)' },
        { label: '\\notin', snippet: '\\notin ', tooltip: 'No pertenece a (\\notin)' },
        { label: '\\subset', snippet: '\\subset ', tooltip: 'Subconjunto de (\\subset)' },
        { label: '\\cup', snippet: '\\cup ', tooltip: 'Unión de conjuntos (\\cup)' },
        { label: '\\cap', snippet: '\\cap ', tooltip: 'Intersección de conjuntos (\\cap)' },
        { label: '\\forall', snippet: '\\forall ', tooltip: 'Para todo (\\forall)' },
        { label: '\\exists', snippet: '\\exists ', tooltip: 'Existe al menos uno (\\exists)' },
        { label: '\\le', snippet: '\\le ', tooltip: 'Menor o igual que (\\le)' },
        { label: '\\ge', snippet: '\\ge ', tooltip: 'Mayor o igual que (\\ge)' },
        { label: '\\ne', snippet: '\\ne ', tooltip: 'Distinto / No igual (\\ne)' },
        { label: '\\approx', snippet: '\\approx ', tooltip: 'Aproximadamente igual (\\approx)' },
        { label: '\\equiv', snippet: '\\equiv ', tooltip: 'Idéntico / Equivalente (\\equiv)' },
      ],
    },
    {
      id: 'matrices',
      nameEs: 'Matrices & Casos',
      nameEn: 'Matrices & Cases',
      items: [
        {
          label: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
          snippet: '\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}',
          tooltip: 'Matriz 2x2 con paréntesis redondos (pmatrix)',
        },
        {
          label: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
          snippet: '\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}',
          tooltip: 'Matriz 2x2 con corchetes rectos (bmatrix)',
        },
        {
          label: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
          snippet: '\\begin{vmatrix}\n  a & b \\\\\n  c & d\n\\end{vmatrix}',
          tooltip: 'Determinante / Barras verticales (vmatrix)',
        },
        {
          label: '\\begin{pmatrix} x_1 \\\\ x_2 \\end{pmatrix}',
          snippet: '\\begin{pmatrix}\n  x_1 \\\\\n  x_2\n\\end{pmatrix}',
          tooltip: 'Vector columna 2x1',
        },
        {
          label: '\\begin{cases} a \\\\ b \\end{cases}',
          snippet: 'f(x) = \\begin{cases}\n  a & \\text{si } x \\ge 0 \\\\\n  b & \\text{si } x < 0\n\\end{cases}',
          tooltip: 'Función a trozos / Por casos (cases)',
        },
        {
          label: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
          snippet: '\\begin{aligned}\n  x &= a + b \\\\\n  y &= c - d\n\\end{aligned}',
          tooltip: 'Sistema de ecuaciones alineado por el igual (aligned)',
        },
      ],
    },
    {
      id: 'templates',
      nameEs: 'Plantillas',
      nameEn: 'Templates',
      items: [
        {
          label: 'x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}',
          snippet: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
          tooltip: 'Fórmula cuadrática general',
        },
        {
          label: 'a^2 + b^2 = c^2',
          snippet: 'a^2 + b^2 = c^2',
          tooltip: 'Teorema de Pitágoras',
        },
        {
          label: 'e^{i\\pi} + 1 = 0',
          snippet: 'e^{i\\pi} + 1 = 0',
          tooltip: 'Identidad de Euler',
        },
        {
          label: 'P(A|B) = \\frac{P(B|A)P(A)}{P(B)}',
          snippet: 'P(A|B) = \\frac{P(B|A) P(A)}{P(B)}',
          tooltip: 'Teorema de Bayes (Probabilidad)',
        },
        {
          label: '\\mathcal{N}(\\mu, \\sigma^2)',
          snippet: 'f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x - \\mu}{\\sigma}\\right)^2}',
          tooltip: 'Distribución Normal / Gaussiana',
        },
        {
          label: '\\text{softmax}(z_i)',
          snippet: '\\text{softmax}(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}',
          tooltip: 'Función Softmax para clasificación',
        },
        {
          label: '\\text{Attention}(Q, K, V)',
          snippet: '\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
          tooltip: 'Mecanismo de atención (Transformers / Deep Learning)',
        },
      ],
    },
  ];

  readonly currentCategory = computed<LatexCategory>(() => {
    const id = this.activeCategoryId();
    return this.categories.find((c) => c.id === id) || this.categories[0];
  });

  private aiOwner?: string;
  private readonly aiDocuments = inject(AiDocumentService);
  private readonly unregisterAi = this.aiDocuments.register({
    owner: () => this.aiOwner,
    fields: () => [{ id: `formula:${this.block.id}`, text: this.rawFormula }],
    apply: values => {
      const value = values.get(`formula:${this.block.id}`);
      if (value !== undefined) { this.onSourceChange(cleanLatexSource(value, this.documentMode() || isLatexDocument(value))); }
    },
  });

  ngOnInit(): void {
    this.aiOwner = this.notesService.currentNote()?._id;
    this.ownerNoteId = this.notesService.currentNote()?._id;
    this.rawFormula = typeof this.block.content?.['formula'] === 'string' ? this.block.content['formula'] : '';
    this.documentMode.set(this.block.content?.['mode'] === 'document' || isLatexDocument(this.rawFormula));
    this.lastSavedDocumentMode = this.documentMode();
    this.fontSizePx.set(normalizeLatexFontSize(this.block.content?.['fontSizePx']));
    this.alignment.set(normalizeLatexAlignment(this.block.content?.['alignment']));
    this.lastSavedAlignment = this.alignment();
    this.alignByLine.set(this.block.content?.['alignByLine'] === true);
    this.formulaRows.set(splitLatexRows(this.rawFormula));
    const stored = this.block.content?.['lineAlignments'];
    this.lineAlignments.set(reconcileLatexRowAlignments(this.formulaRows(), this.formulaRows(), Array.isArray(stored) ? stored : []));
    this.savedLineSettings = this.lineSettings();
    this.lastSavedFormula = this.rawFormula;
    this.lastSavedFontSize = this.fontSizePx();
  }

  ngOnDestroy(): void {
    this.unregisterAi();
    this.persistChanges();
    this.destroyed = true;
    this.timers.forEach(timer => clearTimeout(timer)); this.timers.clear();
  }

  private later(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) callback();
    },delay);
    this.timers.add(timer);
  }

  setFontSize(value: unknown): void {
    if (!this.isEditing() || this.notesService.isReadingMode() || this.destroyed) return;
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isFinite(Number(value))) return;
    this.fontSizePx.set(normalizeLatexFontSize(value));
    this.persistChanges();
  }

  onFontSizeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFontSize(input.value); input.value = String(this.fontSizePx());
  }

  changeFontSize(delta: number): void { this.setFontSize(this.fontSizePx() + delta); }

  setAlignment(value: LatexAlignment): void {
    if (!this.isEditing() || this.documentMode() || this.notesService.isReadingMode() || this.destroyed) return;
    this.alignment.set(normalizeLatexAlignment(value)); this.persistChanges(); this.renderLiveFormula();
  }

  private persistChanges(): void {
    if (this.rawFormula === this.lastSavedFormula && this.fontSizePx() === this.lastSavedFontSize && this.documentMode() === this.lastSavedDocumentMode && this.alignment() === this.lastSavedAlignment && this.savedLineSettings === this.lineSettings()) return;
    this.notesService.updateBlockContent(this.block.id, { formula:this.rawFormula, fontSizePx:this.fontSizePx(), alignment:this.alignment(), alignByLine:this.alignByLine(), lineAlignments:this.lineAlignments(), mode: this.documentMode() ? 'document' : 'formula' },this.ownerNoteId);
    this.savedLineSettings = this.lineSettings();
    this.lastSavedFormula = this.rawFormula; this.lastSavedFontSize = this.fontSizePx();
    this.lastSavedAlignment = this.alignment();
    this.lastSavedDocumentMode = this.documentMode();
  }

  ngAfterViewInit(): void {
    this.renderDisplayFormula();
  }

  onCardClick(): void {
    if (this.notesService.isReadingMode()) return;
    this.enableEdit();
  }

  enableEdit(): void {
    if (this.notesService.isReadingMode() || this.destroyed) return;
    this.isEditing.set(true);
    this.later(() => {
      this.sourceEditor?.focus();
      this.renderLiveFormula();
    }, 40);
  }

  toggleToolbox(): void {
    this.showToolbox.update((prev) => !prev);
  }

  selectCategory(categoryId: string): void {
    this.activeCategoryId.set(categoryId);
  }

  /**
   * Renderiza el snippet matemático KaTeX en HTML para mostrarlo en el botón/chip.
   * Utiliza DomSanitizer para evitar que Angular elimine las etiquetas SVG (como la raíz)
   * o los estilos en línea (como la línea divisoria de la fracción).
   */
  renderKatexSnippet(math: string): SafeHtml {
    if (this.renderedChipsMap.has(math)) {
      return this.renderedChipsMap.get(math)!;
    }
    try {
      const rendered = katex.renderToString(math, {
        throwOnError: false,
        displayMode: false,
        output: 'html',
      });
      const safe = this.sanitizer.bypassSecurityTrustHtml(rendered);
      this.renderedChipsMap.set(math, safe);
      return safe;
    } catch {
      const safe = this.sanitizer.bypassSecurityTrustHtml(math);
      this.renderedChipsMap.set(math, safe);
      return safe;
    }
  }

  /**
   * Inserta una plantilla o símbolo LaTeX directamente en la posición del cursor,
   * manteniendo el foco en el editor y actualizando la vista previa al instante.
   */
  insertSnippet(template: string): void {
    this.sourceEditor?.insertSource(template);
  }

  onSourceChange(value: string): void {
    if (this.destroyed || this.notesService.isReadingMode()) return;
    this.rawFormula = value; this.onFormulaInput(); this.persistChanges();
  }

  clearFormula(): void {
    this.rawFormula = '';
    this.onFormulaInput(); this.persistChanges();
    this.sourceEditor?.focus();
  }

  onFormulaInput(): void {
    const rows = splitLatexRows(this.rawFormula);
    this.lineAlignments.set(reconcileLatexRowAlignments(this.formulaRows(), rows, this.lineAlignments()));
    this.formulaRows.set(rows);
    if (isLatexDocument(this.rawFormula)) this.documentMode.set(true);
    this.renderLiveFormula();
  }

  changeMode(value: string): void {
    if (this.notesService.isReadingMode()) return;
    this.documentMode.set(value === 'document'); this.persistChanges();
    this.later(() => this.renderLiveFormula(), 0);
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); this.saveAndPreview();
    }
  }

  finishEditing(event: MouseEvent): void {
    event.preventDefault();
    this.saveAndPreview();
  }

  onBlurEditor(event: FocusEvent): void {
    // Si el usuario hizo clic dentro de la tarjeta de herramientas o botones, no cerrar
    const related = event.relatedTarget as HTMLElement;
    if (related && related.closest('.latex-editor-card')) {
      return;
    }
    this.saveAndPreview();
  }

  saveAndPreview(): void {
    if (!this.isEditing()) return;
    this.isEditing.set(false);
    this.persistChanges();
    this.later(() => {
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
    if (this.documentMode()) { element.replaceChildren(); return; }
    if (!formula.trim()) { element.replaceChildren(); return; }
    try {
      element.innerHTML = renderFormula(formula, { alignByLine: this.alignByLine(), lineAlignments: this.lineAlignments(), alignment: this.alignment() });
    } catch {
      element.innerHTML = `<span style="color:#ef4444;font-size:12px;">Error en la fórmula LaTeX</span>`;
    }
  }

}
