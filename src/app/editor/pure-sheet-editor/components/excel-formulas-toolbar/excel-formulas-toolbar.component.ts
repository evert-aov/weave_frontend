import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { LucideDynamicIcon, provideLucideIcons, LucideSigma, LucideStar, LucideCoins, LucideFileText, LucideClock, LucideSearch, LucideTag, LucideTable, LucideGitBranch, LucideX, LucideTriangleAlert, LucideCalculator, LucideEye, LucideChevronDown } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';

interface FormulaTool { label: string; es: string; icon?: string; symbol?: string; action?: string; formula?: string; disabled?: boolean; dropdown?: boolean; }

@Component({
  selector: 'app-excel-formulas-toolbar', standalone: true,
  imports: [LucideDynamicIcon],
  providers: [provideLucideIcons(LucideSigma, LucideStar, LucideCoins, LucideFileText, LucideClock, LucideSearch, LucideTag, LucideTable, LucideGitBranch, LucideX, LucideTriangleAlert, LucideCalculator, LucideEye, LucideChevronDown)],
  templateUrl: './excel-formulas-toolbar.component.html', styleUrl: './excel-formulas-toolbar.component.scss',
})
export class ExcelFormulasToolbarComponent {
  @Input() showFormulas = false;
  @Output() openNames = new EventEmitter<void>();
  @Output() openFunctions = new EventEmitter<void>();
  @Output() insertFormula = new EventEmitter<string>();
  @Output() autoSum = new EventEmitter<string>();
  @Output() toggleFormulas = new EventEmitter<void>();
  @Output() traceReference = new EventEmitter<'precedents' | 'dependents'>();
  @Output() clearTrace = new EventEmitter<void>();
  @Output() editFormula = new EventEmitter<boolean>();
  @Output() recalculate = new EventEmitter<void>();
  readonly i18n = inject(I18nService);
  color(tool: FormulaTool): string {
    const colors: Record<string, string> = {
      'Insert Function': '#38bdf8', AutoSum: '#fbbf24', 'Recently Used': '#38bdf8',
      Financial: '#34d399', Logical: '#a78bfa', Text: '#38bdf8', 'Date & Time': '#fb7185',
      'Lookup & Reference': '#38bdf8', 'Math & Trig': '#34d399', 'More Functions': '#fb7185',
      'Define Name': '#fbbf24', 'Use in Formula': '#94a3b8', 'Create from Selection': '#38bdf8',
      'Trace Precedents': '#38bdf8', 'Trace Dependents': '#38bdf8', 'Remove Arrows': '#fb7185',
      'Show Formulas': '#38bdf8', 'Error Checking': '#fbbf24', 'Evaluate Formula': '#a78bfa',
    };
    return colors[tool.label] || '#38bdf8';
  }
  label(tool: FormulaTool): string { return this.i18n.currentLang() === 'es' ? tool.es : tool.label; }
  readonly library: FormulaTool[] = [
    { label: 'Insert Function', es: 'Insertar función', symbol: 'fx' },
    { label: 'AutoSum', es: 'Autosuma', icon: 'sigma', action: 'sum', dropdown: true },
    { label: 'Recently Used', es: 'Usadas recientemente', icon: 'star', dropdown: true },
    { label: 'Financial', es: 'Financieras', icon: 'coins', formula: '=PMT(8%/12, 10, 10000)', dropdown: true },
    { label: 'Logical', es: 'Lógicas', icon: 'file-text', formula: '=SI(D2>=3000, "Excelente", "Revisar")', dropdown: true },
    { label: 'Text', es: 'Texto', symbol: 'A', formula: '=CONCAT(A2, " - ", E2)', dropdown: true },
    { label: 'Date & Time', es: 'Fecha y hora', icon: 'clock', formula: '=HOY()', dropdown: true },
    { label: 'Lookup & Reference', es: 'Búsqueda y referencia', icon: 'search', formula: '=BUSCARV("Laptop Pro 15", A2:D6, 4, FALSO)', dropdown: true },
    { label: 'Math & Trig', es: 'Matemáticas y trigonometría', symbol: 'θ', formula: '=SUMA(D2:D6)', dropdown: true },
    { label: 'More Functions', es: 'Más funciones', symbol: '⋯', dropdown: true },
  ];
  readonly names: FormulaTool[] = [
    { label: 'Define Name', es: 'Definir nombre', icon: 'tag', dropdown: true, action: 'names' },
    { label: 'Use in Formula', es: 'Usar en fórmula', icon: 'tag', action: 'names' },
    { label: 'Create from Selection', es: 'Crear desde la selección', icon: 'table', action: 'names' },
  ];
  readonly tracing: FormulaTool[] = [
    { label: 'Trace Precedents', es: 'Rastrear precedentes', icon: 'git-branch', action: 'trace-precedents' },
    { label: 'Trace Dependents', es: 'Rastrear dependientes', icon: 'git-branch', action: 'trace-dependents' },
    { label: 'Remove Arrows', es: 'Quitar flechas', icon: 'x', action: 'stop-edit' },
  ];
  readonly auditing: FormulaTool[] = [
    { label: 'Show Formulas', es: 'Mostrar fórmulas', symbol: 'fx', action: 'show' },
    { label: 'Error Checking', es: 'Comprobación de errores', icon: 'triangle-alert' },
    { label: 'Evaluate Formula', es: 'Evaluar fórmula', icon: 'calculator' },
  ];
  run(tool: FormulaTool): void {
    if (tool.disabled) return;
    if (tool.formula) { this.insertFormula.emit(tool.formula); return; }
    switch (tool.action) {
      case 'names': this.openNames.emit(); break;
      case 'sum': this.autoSum.emit('SUMA'); break;
      case 'show': this.toggleFormulas.emit(); break;
      case 'trace-precedents': this.traceReference.emit('precedents'); break;
      case 'trace-dependents': this.traceReference.emit('dependents'); break;
      case 'edit': this.editFormula.emit(true); break;
      case 'stop-edit': this.clearTrace.emit(); break;
      default: this.openFunctions.emit();
    }
  }
}
