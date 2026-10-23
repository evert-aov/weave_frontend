import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  LucideDynamicIcon,
  LucideTrash2,
  LucideX,
  provideLucideIcons,
} from '@lucide/angular';
import { LatexRendererService } from '../../services/latex-renderer.service';

type PrimaryCategory = 'basic' | 'math' | 'physics' | 'chemistry' | 'biology';

type BasicSubCategory =
  | 'symbols'
  | 'fractions'
  | 'scripts'
  | 'radicals'
  | 'integrals'
  | 'bigops'
  | 'brackets'
  | 'functions'
  | 'arrows'
  | 'limits'
  | 'matrices';

interface FormulaPresetCard {
  preview: string;
  label: string;
  latex: string;
}

const DEFAULT_SAMPLE_LATEX = `\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}_i} - \\frac{\\partial L}{\\partial q_i} = 0 \\\\
\\iint_{D} f(x,y) \\, dx\\,dy \\iiint\\limits_V f(x,y,z) \\, dx\\,dy\\,dz`;

const PRIMARY_TABS: { id: PrimaryCategory; label: string }[] = [
  { id: 'basic', label: 'Símbolos básicos' },
  { id: 'math', label: 'Matemáticas' },
  { id: 'physics', label: 'Física' },
  { id: 'chemistry', label: 'Química' },
  { id: 'biology', label: 'Biología' },
];

const BASIC_SUB_TABS: { id: BasicSubCategory; label: string }[] = [
  { id: 'symbols', label: 'Símbolos básicos' },
  { id: 'fractions', label: 'Fracciones' },
  { id: 'scripts', label: 'Super/Subíndice' },
  { id: 'radicals', label: 'Radicales' },
  { id: 'integrals', label: 'Integrales' },
  { id: 'bigops', label: 'Operadores grandes' },
  { id: 'brackets', label: 'Paréntesis y llaves' },
  { id: 'functions', label: 'Funciones' },
  { id: 'arrows', label: 'Flechas y símbolos' },
  { id: 'limits', label: 'Límites y log' },
  { id: 'matrices', label: 'Matrices' },
];

const BASIC_SUB_CARDS: Record<BasicSubCategory, FormulaPresetCard[]> = {
  integrals: [
    { preview: '∫f(x) dx', label: 'Integral indefinida', latex: '\\int f(x) \\, dx' },
    { preview: '∫ₐᵇ f(x) dx', label: 'Integral definida', latex: '\\int_{a}^{b} f(x) \\, dx' },
    { preview: '∬D f(x,y) dxdy', label: 'Integral doble', latex: '\\iint_{D} f(x,y) \\, dx\\,dy' },
    { preview: '∭V f(x,y,z) dxdydz', label: 'Integral triple', latex: '\\iiint\\limits_V f(x,y,z) \\, dx\\,dy\\,dz' },
    { preview: '∮C f(x,y) ds', label: 'Integral de línea', latex: '\\oint_{C} f(x,y) \\, ds' },
    { preview: '∯S f(x,y,z) dS', label: 'Integral de superficie', latex: '\\oiint_{S} f(x,y,z) \\, dS' },
    { preview: '∮C F·dr', label: 'Integral de circulación', latex: '\\oint_{C} \\vec{F} \\cdot d\\vec{r}' },
    { preview: '∭V dV', label: 'Integral de volumen', latex: '\\iiint_{V} dV' },
  ],
  symbols: [
    { preview: 'α β γ δ', label: 'Letras griegas (α, β, γ)', latex: '\\alpha + \\beta = \\gamma' },
    { preview: '∂f / ∂x', label: 'Derivada parcial (∂)', latex: '\\partial' },
    { preview: '∇f(x,y,z)', label: 'Operador Nabla (∇)', latex: '\\nabla f(x,y,z)' },
    { preview: '± ∓ × ÷', label: 'Más/Menos (±)', latex: '\\pm' },
    { preview: '∞', label: 'Infinito (∞)', latex: '\\infty' },
    { preview: '≈ ≠ ≡ ≤ ≥', label: 'Relaciones (≈, ≠, ≤, ≥)', latex: 'x \\approx y \\neq z' },
    { preview: '∀x ∈ ℝ', label: 'Cuantificadores (∀, ∃, ∈)', latex: '\\forall x \\in \\mathbb{R}' },
    { preview: 'A ∪ B ∩ C', label: 'Conjuntos (∪, ∩, ⊂)', latex: 'A \\cup B \\cap C' },
  ],
  fractions: [
    { preview: 'a / b', label: 'Fracción estándar', latex: '\\frac{a}{b}' },
    { preview: 'dy / dx', label: 'Derivada total', latex: '\\frac{dy}{dx}' },
    { preview: 'd²y / dx²', label: 'Segunda derivada', latex: '\\frac{d^2 y}{dx^2}' },
    { preview: '∂L / ∂qᵢ', label: 'Derivada parcial', latex: '\\frac{\\partial L}{\\partial q_i}' },
    { preview: '∂²u / ∂t²', label: 'Laplaciano parcial', latex: '\\frac{\\partial^2 u}{\\partial t^2}' },
    { preview: '1 / (1 + x²)', label: 'Fracción algebraica', latex: '\\frac{1}{1 + x^2}' },
    { preview: '(a/b) / (c/d)', label: 'Fracción compuesta', latex: '\\frac{\\frac{a}{b}}{\\frac{c}{d}}' },
    { preview: 'n! / k!(n−k)!', label: 'Coeficiente binomial', latex: '\\binom{n}{k} = \\frac{n!}{k!(n-k)!}' },
  ],
  scripts: [
    { preview: 'x²', label: 'Superíndice (Potencia)', latex: 'x^{2}' },
    { preview: 'xᵢ', label: 'Subíndice', latex: 'x_{i}' },
    { preview: 'xᵢ²', label: 'Subíndice y superíndice', latex: 'x_{i}^{2}' },
    { preview: 'e⁻ˣ²', label: 'Exponencial compuesta', latex: 'e^{-x^2}' },
    { preview: 'q̇ᵢ , q̈ᵢ', label: 'Derivada temporal (Punto)', latex: '\\dot{q}_i , \\ddot{q}_i' },
    { preview: 'v⃗ , û , x̄', label: 'Vector, circunflejo y barra', latex: '\\vec{v} + \\hat{u} = \\bar{x}' },
    { preview: 'Aᵢⱼᵏ', label: 'Tensor mixto', latex: 'A_{ij}^{k}' },
    { preview: '₂³⁵U', label: 'Isótopo atómico', latex: '_{92}^{235}\\text{U}' },
  ],
  radicals: [
    { preview: '√x', label: 'Raíz cuadrada', latex: '\\sqrt{x}' },
    { preview: 'ⁿ√x', label: 'Raíz n-ésima', latex: '\\sqrt[n]{x}' },
    { preview: '³√(x² + y²)', label: 'Raíz cúbica', latex: '\\sqrt[3]{x^2 + y^2}' },
    { preview: '√(b² − 4ac)', label: 'Discriminante cuadrático', latex: '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { preview: '√(1 − v²/c²)', label: 'Factor de Lorentz', latex: '\\sqrt{1 - \\frac{v^2}{c^2}}' },
  ],
  bigops: [
    { preview: '∑ᵢ₌₁ⁿ xᵢ', label: 'Sumatoria definida', latex: '\\sum_{i=1}^{n} x_i' },
    { preview: '∏ᵢ₌₁ⁿ xᵢ', label: 'Productoria definida', latex: '\\prod_{i=1}^{n} x_i' },
    { preview: '⋃ᵢ₌₁ⁿ Aᵢ', label: 'Unión generalizada', latex: '\\bigcup_{i=1}^{n} A_i' },
    { preview: '⋂ᵢ₌₁ⁿ Aᵢ', label: 'Intersección generalizada', latex: '\\bigcap_{i=1}^{n} A_i' },
    { preview: '⨁ Vᵢ', label: 'Suma directa', latex: '\\bigoplus_{i=1}^{n} V_i' },
  ],
  brackets: [
    { preview: '( a / b )', label: 'Paréntesis adaptables', latex: '\\left( \\frac{a}{b} \\right)' },
    { preview: '[ a + b ]', label: 'Corchetes adaptables', latex: '\\left[ \\frac{a}{b} \\right]' },
    { preview: '{ x ∈ ℝ }', label: 'Llaves de conjunto', latex: '\\left\\{ x \\in \\mathbb{R} \\right\\}' },
    { preview: '| x |', label: 'Valor absoluto', latex: '\\left| x \\right|' },
    { preview: 'f(x) = { ...', label: 'Función por tramos (Cases)', latex: 'f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases}' },
  ],
  functions: [
    { preview: 'sin(x) + cos(x)', label: 'Trigonométricas', latex: '\\sin(x) + \\cos(x) = 1' },
    { preview: 'tan(θ)', label: 'Tangente', latex: '\\tan(\\theta) = \\frac{\\sin(\\theta)}{\\cos(\\theta)}' },
    { preview: 'arcsin(x)', label: 'Trigonométricas inversas', latex: '\\arcsin(x) + \\arccos(x) = \\frac{\\pi}{2}' },
    { preview: 'sinh(x), cosh(x)', label: 'Hiperbólicas', latex: '\\cosh^2(x) - \\sinh^2(x) = 1' },
  ],
  arrows: [
    { preview: 'A → B', label: 'Flecha derecha', latex: 'A \\rightarrow B' },
    { preview: 'A ⇒ B', label: 'Implicación lógica', latex: 'A \\Rightarrow B' },
    { preview: 'A ⇔ B', label: 'Doble implicación (Si y sólo si)', latex: 'A \\Leftrightarrow B' },
    { preview: 'x ↦ f(x)', label: 'Asignación de función', latex: 'x \\mapsto f(x)' },
    { preview: 'A ⇌ B', label: 'Equilibrio reversible', latex: 'A + B \\rightleftharpoons C + D' },
  ],
  limits: [
    { preview: 'limₓ→₀ f(x)', label: 'Límite puntual', latex: '\\lim_{x \\to 0} f(x)' },
    { preview: 'limₙ→∞ aₙ', label: 'Límite al infinito', latex: '\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e' },
    { preview: 'limₕ→₀ Δf/h', label: 'Definición de derivada', latex: 'f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}' },
    { preview: 'logₐ(x) , ln(x)', label: 'Logaritmos', latex: '\\log_{a}(x) = \\frac{\\ln(x)}{\\ln(a)}' },
  ],
  matrices: [
    {
      preview: '( a  b ; c  d )',
      label: 'Matriz 2×2 (Paréntesis)',
      latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    },
    {
      preview: '[ a₁₁ a₁₂ ; a₂₁ a₂₂ ]',
      label: 'Matriz 2×2 (Corchetes)',
      latex: '\\begin{bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{bmatrix}',
    },
    {
      preview: '| A | (Determinante 3×3)',
      label: 'Determinante 3×3',
      latex: '\\begin{vmatrix} a_1 & b_1 & c_1 \\\\ a_2 & b_2 & c_2 \\\\ a_3 & b_3 & c_3 \\end{vmatrix}',
    },
    {
      preview: 'I₃ (Matriz Identidad)',
      label: 'Matriz Identidad 3×3',
      latex: 'I_3 = \\begin{pmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{pmatrix}',
    },
  ],
};

const DOMAIN_PRESET_CARDS: Record<Exclude<PrimaryCategory, 'basic'>, FormulaPresetCard[]> = {
  math: [
    {
      preview: 'x = (−b ± √(b²−4ac)) / 2a',
      label: 'Fórmula General Cuadrática',
      latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    },
    {
      preview: 'f(x) = ∑ f⁽ⁿ⁾(a)/n! (x−a)ⁿ',
      label: 'Serie de Taylor',
      latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n',
    },
    {
      preview: '∮C P dx + Q dy = ∬D (∂Q/∂x − ∂P/∂y)',
      label: 'Teorema de Green',
      latex: '\\oint_{C} (P\\,dx + Q\\,dy) = \\iint_{D} \\left(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\right) dx\\,dy',
    },
    {
      preview: 'f̂(ω) = ∫ f(t) e⁻ⁱωᵗ dt',
      label: 'Transformada de Fourier',
      latex: '\\hat{f}(\\omega) = \\int_{-\\infty}^{\\infty} f(t) e^{-i\\omega t} \\, dt',
    },
    {
      preview: 'eⁱπ + 1 = 0',
      label: 'Identidad de Euler',
      latex: 'e^{i\\pi} + 1 = 0',
    },
    {
      preview: 'P(A|B) = P(B|A)P(A) / P(B)',
      label: 'Teorema de Bayes',
      latex: 'P(A|B) = \\frac{P(B|A)P(A)}{P(B)}',
    },
    {
      preview: 'f(x) = 1/(σ√2π) e⁻⁽ˣ⁻μ⁾²/²σ²',
      label: 'Distribución Normal (Gauss)',
      latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
    },
    {
      preview: '∬S (∇ × F)·dS = ∮C F·dr',
      label: 'Teorema de Stokes',
      latex: '\\iint_{S} (\\nabla \\times \\vec{F}) \\cdot d\\vec{S} = \\oint_{C} \\vec{F} \\cdot d\\vec{r}',
    },
  ],
  physics: [
    {
      preview: 'd/dt(∂L/∂q̇ᵢ) − ∂L/∂qᵢ = 0',
      label: 'Ecuación de Euler-Lagrange',
      latex: '\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}_i} - \\frac{\\partial L}{\\partial q_i} = 0',
    },
    {
      preview: 'iℏ ∂Ψ/∂t = [−ℏ²/2m ∇² + V]Ψ',
      label: 'Ecuación de Schrödinger',
      latex: 'i\\hbar \\frac{\\partial \\Psi}{\\partial t} = -\\frac{\\hbar^2}{2m}\\nabla^2 \\Psi + V\\Psi',
    },
    {
      preview: '∇ · E = ρ / ε₀',
      label: 'Ecuaciones de Maxwell (Gauss)',
      latex: '\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0} \\quad , \\quad \\nabla \\times \\vec{B} = \\mu_0 \\vec{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\vec{E}}{\\partial t}',
    },
    {
      preview: 'E² = (pc)² + (m₀c²)²',
      label: 'Energía-Momento Relativista',
      latex: 'E^2 = (pc)^2 + (m_0 c^2)^2',
    },
    {
      preview: 'Rμν − ½Rgμν = (8πG/c⁴)Tμν',
      label: 'Ecuación de Campo de Einstein',
      latex: 'R_{\\mu\\nu} - \\frac{1}{2}R g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}',
    },
    {
      preview: 'F = G (m₁m₂) / r²',
      label: 'Gravitación Universal',
      latex: '\\vec{F} = -G \\frac{m_1 m_2}{r^2} \\hat{r}',
    },
    {
      preview: 'dS ≥ δQ / T',
      label: 'Segunda Ley de la Termodinámica',
      latex: 'dS \\geq \\frac{\\delta Q}{T}',
    },
    {
      preview: 'Δx · Δp ≥ ℏ / 2',
      label: 'Principio de Incertidumbre',
      latex: '\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}',
    },
  ],
  chemistry: [
    {
      preview: 'aA + bB ⇌ cC + dD',
      label: 'Equilibrio Químico Reversible',
      latex: 'a\\text{A} + b\\text{B} \\rightleftharpoons c\\text{C} + d\\text{D}',
    },
    {
      preview: 'Kc = [C]ᶜ[D]ᵈ / [A]ᵃ[B]ᵇ',
      label: 'Constante de Equilibrio (Kc)',
      latex: 'K_c = \\frac{[\\text{C}]^c [\\text{D}]^d}{[\\text{A}]^a [\\text{B}]^b}',
    },
    {
      preview: 'pH = −log₁₀[H₃O⁺]',
      label: 'Potencial de Hidrógeno (pH)',
      latex: '\\text{pH} = -\\log_{10}[\\text{H}_3\\text{O}^+]',
    },
    {
      preview: 'pH = pKa + log([A⁻]/[HA])',
      label: 'Ecuación de Henderson-Hasselbalch',
      latex: '\\text{pH} = \\text{p}K_a + \\log\\left(\\frac{[\\text{A}^-]}{[\\text{HA}]}\\right)',
    },
    {
      preview: 'ΔG = ΔH − TΔS',
      label: 'Energía Libre de Gibbs',
      latex: '\\Delta G^\\circ = \\Delta H^\\circ - T\\Delta S^\\circ = -RT \\ln K',
    },
    {
      preview: 'k = A · e^(−Ea / RT)',
      label: 'Ecuación de Arrhenius',
      latex: 'k = A e^{-\\frac{E_a}{RT}}',
    },
    {
      preview: 'E = E° − (RT/nF) ln Q',
      label: 'Ecuación de Nernst',
      latex: 'E = E^\\circ - \\frac{RT}{nF} \\ln Q',
    },
    {
      preview: '2H₂ + O₂ → 2H₂O',
      label: 'Estequiometría e Iones',
      latex: '2\\text{H}_2 + \\text{O}_2 \\xrightarrow{\\Delta} 2\\text{H}_2\\text{O}',
    },
  ],
  biology: [
    {
      preview: 'v = (Vmax [S]) / (Km + [S])',
      label: 'Cinética de Michaelis-Menten',
      latex: 'v_0 = \\frac{V_{\\max}[\\text{S}]}{K_m + [\\text{S}]}',
    },
    {
      preview: 'dN/dt = rN(1 − N/K)',
      label: 'Crecimiento Logístico Poblacional',
      latex: '\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)',
    },
    {
      preview: 'p² + 2pq + q² = 1',
      label: 'Equilibrio de Hardy-Weinberg',
      latex: 'p^2 + 2pq + q^2 = 1 \\quad (p + q = 1)',
    },
    {
      preview: 'H\' = −∑ pᵢ ln(pᵢ)',
      label: 'Índice de Biodiversidad de Shannon',
      latex: 'H\' = -\\sum_{i=1}^{S} p_i \\ln(p_i)',
    },
    {
      preview: 'dx/dt = αx − βxy',
      label: 'Modelo Depredador-Presa (Lotka-Volterra)',
      latex: '\\begin{cases} \\frac{dx}{dt} = \\alpha x - \\beta xy \\\\ \\frac{dy}{dt} = \\delta xy - \\gamma y \\end{cases}',
    },
    {
      preview: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂',
      label: 'Reacción de Fotosíntesis',
      latex: '6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\xrightarrow{h\\nu} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2',
    },
  ],
};

@Component({
  selector: 'app-word-latex-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideX, LucideTrash2)],
  templateUrl: './word-latex-modal.component.html',
  styleUrls: ['./word-latex-modal.component.scss'],
})
export class WordLatexModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() initialLatex?: string;
  @Input() isEditingExisting?: boolean;
  @Output() close = new EventEmitter<void>();
  @Output() insertFormula = new EventEmitter<string>();
  @Output() deleteFormula = new EventEmitter<void>();

  @ViewChild('latexTextarea') textareaRef?: ElementRef<HTMLTextAreaElement>;

  private readonly latex = inject(LatexRendererService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly primaryTabs = PRIMARY_TABS;
  readonly basicSubTabs = BASIC_SUB_TABS;
  readonly latexInput = signal<string>(DEFAULT_SAMPLE_LATEX);
  readonly primaryTab = signal<PrimaryCategory>('basic');
  readonly basicSubTab = signal<BasicSubCategory>('integrals');

  readonly activeCards = computed<FormulaPresetCard[]>(() => {
    const primary = this.primaryTab();
    if (primary === 'basic') {
      return BASIC_SUB_CARDS[this.basicSubTab()];
    }
    return DOMAIN_PRESET_CARDS[primary];
  });

  readonly previewHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.latex.renderLatexToHtml(this.latexInput()))
  );

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['isOpen'] || changes['initialLatex']) && this.isOpen) {
      this.latexInput.set(this.initialLatex || DEFAULT_SAMPLE_LATEX);
    }
  }

  handleInsertSnippetAtCursor(snippet: string): void {
    const ta = this.textareaRef?.nativeElement;
    if (!ta) {
      this.latexInput.update((prev) => (prev ? `${prev} ${snippet}` : snippet));
      return;
    }

    const start = ta.selectionStart ?? this.latexInput().length;
    const end = ta.selectionEnd ?? this.latexInput().length;
    const before = this.latexInput().slice(0, start);
    const after = this.latexInput().slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const inserted = `${needsSpace ? ' ' : ''}${snippet}`;
    const updated = `${before}${inserted}${after}`;

    this.latexInput.set(updated);

    setTimeout(() => {
      ta.focus();
      const newPos = start + inserted.length;
      ta.setSelectionRange(newPos, newPos);
    }, 10);
  }

  handleConfirmInsert(): void {
    if (!this.latexInput().trim()) return;
    this.insertFormula.emit(this.latexInput());
    this.close.emit();
  }

  clearInput(): void {
    this.latexInput.set('');
    this.textareaRef?.nativeElement.focus();
  }

  handleDeleteFormula(): void {
    this.deleteFormula.emit();
    this.close.emit();
  }
}
