import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lucideCheckSquare, lucideX } from '@ng-icons/lucide';
import { CellValidationRule, ValidationOperator, ValidationRuleType } from '../../models/excel.model';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-excel-data-validation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons({ lucideCheckSquare, lucideX })],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Validación de datos' : 'Data Validation'"
               (click)="$event.stopPropagation()"
               (keydown.escape)="close.emit()"
               class="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden text-xs"
               [class.bg-slate-900]="themeService.isDark()"
               [class.border-slate-700]="themeService.isDark()"
               [class.text-slate-100]="themeService.isDark()"
               [class.bg-white]="!themeService.isDark()"
               [class.border-slate-200]="!themeService.isDark()"
               [class.text-slate-800]="!themeService.isDark()">
        <header class="px-4 py-3 border-b flex items-center justify-between"
                [class.border-slate-800]="themeService.isDark()"
                [class.border-slate-200]="!themeService.isDark()">
          <div class="flex items-center gap-2 font-semibold text-sm">
            <svg lucideIcon="check-square" [size]="16" class="text-emerald-500"></svg>
            <span>{{ isEs ? 'Validación de datos' : 'Data Validation' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div class="text-[11px] opacity-75">
            {{ isEs ? 'Rango seleccionado' : 'Target range' }}: <strong class="font-mono">{{ rangeLabel }}</strong>
          </div>

          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Permitir' : 'Allow' }}</label>
            <select [(ngModel)]="ruleType"
                    data-testid="validation-type-select"
                    class="w-full px-2.5 py-1.5 rounded-lg border bg-transparent"
                    [class.border-slate-700]="themeService.isDark()"
                    [class.bg-slate-900]="themeService.isDark()"
                    [class.border-slate-300]="!themeService.isDark()">
              <option value="any">{{ isEs ? 'Cualquier valor' : 'Any value' }}</option>
              <option value="list">{{ isEs ? 'Lista desplegable' : 'List' }}</option>
              <option value="whole">{{ isEs ? 'Número entero' : 'Whole number' }}</option>
              <option value="decimal">{{ isEs ? 'Decimal' : 'Decimal' }}</option>
              <option value="textLength">{{ isEs ? 'Longitud de texto' : 'Text length' }}</option>
              <option value="date">{{ isEs ? 'Fecha' : 'Date' }}</option>
            </select>
          </div>

          @if (ruleType === 'list') {
            <div>
              <label class="block font-medium mb-1 opacity-80">
                {{ isEs ? 'Origen (elementos separados por coma o rango =A1:A5)' : 'Source (comma-separated items or =A1:A5 range)' }}
              </label>
              <input type="text"
                     [(ngModel)]="formula1"
                     data-testid="validation-source-input"
                     class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none"
                     [class.border-slate-700]="themeService.isDark()"
                     [class.border-slate-300]="!themeService.isDark()"
                     [placeholder]="isEs ? 'Pendiente, Aprobado, Rechazado o =Catalogo!A2:A10' : 'Pending, Approved, Rejected or =A1:A5'" />
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="showDropdown" class="accent-emerald-600" />
              <span>{{ isEs ? 'Mostrar flecha desplegable en la celda' : 'In-cell dropdown' }}</span>
            </label>
          }

          @if (needsOperator) {
            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Condición' : 'Data' }}</label>
              <select [(ngModel)]="operator"
                      class="w-full px-2.5 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                <option value="between">{{ isEs ? 'entre' : 'between' }}</option>
                <option value="notBetween">{{ isEs ? 'no está entre' : 'not between' }}</option>
                <option value="equalTo">{{ isEs ? 'igual a' : 'equal to' }}</option>
                <option value="notEqualTo">{{ isEs ? 'no igual a' : 'not equal to' }}</option>
                <option value="greaterThan">{{ isEs ? 'mayor que' : 'greater than' }}</option>
                <option value="lessThan">{{ isEs ? 'menor que' : 'less than' }}</option>
                <option value="greaterOrEqual">{{ isEs ? 'mayor o igual que' : 'greater than or equal to' }}</option>
                <option value="lessOrEqual">{{ isEs ? 'menor o igual que' : 'less than or equal to' }}</option>
              </select>
            </div>

            <div class="grid gap-2.5" [class.grid-cols-2]="usesSecondValue">
              <div>
                <label class="block font-medium mb-1 opacity-80">
                  {{ usesSecondValue ? (isEs ? 'Mínimo' : 'Minimum') : (isEs ? 'Valor' : 'Value') }}
                </label>
                <input type="text"
                       [(ngModel)]="formula1"
                       class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none"
                       [class.border-slate-700]="themeService.isDark()"
                       [class.border-slate-300]="!themeService.isDark()" />
              </div>
              @if (usesSecondValue) {
                <div>
                  <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Máximo' : 'Maximum' }}</label>
                  <input type="text"
                         [(ngModel)]="formula2"
                         class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none"
                         [class.border-slate-700]="themeService.isDark()"
                         [class.border-slate-300]="!themeService.isDark()" />
                </div>
              }
            </div>
          }

          @if (ruleType !== 'any') {
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="allowBlank" class="accent-emerald-600" />
              <span>{{ isEs ? 'Omitir celdas en blanco' : 'Ignore blank' }}</span>
            </label>

            <div class="pt-1 border-t space-y-2"
                 [class.border-slate-800]="themeService.isDark()"
                 [class.border-slate-200]="!themeService.isDark()">
              <div>
                <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Título de aviso de error' : 'Error alert title' }}</label>
                <input type="text"
                       [(ngModel)]="errorTitle"
                       class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none"
                       [class.border-slate-700]="themeService.isDark()"
                       [class.border-slate-300]="!themeService.isDark()"
                       [placeholder]="isEs ? 'Valor no válido' : 'Invalid value'" />
              </div>
              <div>
                <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Mensaje de error' : 'Error message' }}</label>
                <input type="text"
                       [(ngModel)]="errorMessage"
                       class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none"
                       [class.border-slate-700]="themeService.isDark()"
                       [class.border-slate-300]="!themeService.isDark()"
                       [placeholder]="isEs ? 'Selecciona un valor válido de la regla.' : 'Enter a value that satisfies the rule.'" />
              </div>
            </div>
          }
        </div>

        <footer class="px-4 py-3 border-t flex items-center justify-between gap-2"
                [class.border-slate-800]="themeService.isDark()"
                [class.border-slate-200]="!themeService.isDark()">
          <button type="button"
                  (click)="clearRule()"
                  data-testid="validation-clear-btn"
                  class="px-3 py-1.5 rounded-lg border text-rose-500 cursor-pointer"
                  [class.border-slate-700]="themeService.isDark()"
                  [class.hover:bg-slate-800]="themeService.isDark()"
                  [class.border-slate-300]="!themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            {{ isEs ? 'Borrar regla' : 'Clear All' }}
          </button>
          <div class="flex items-center gap-2">
            <button type="button"
                    (click)="close.emit()"
                    class="px-3 py-1.5 rounded-lg border cursor-pointer"
                    [class.border-slate-700]="themeService.isDark()"
                    [class.border-slate-300]="!themeService.isDark()">
              {{ isEs ? 'Cancelar' : 'Cancel' }}
            </button>
            <button type="button"
                    (click)="submitRule()"
                    data-testid="validation-apply-btn"
                    class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer">
              {{ isEs ? 'Aceptar' : 'OK' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelDataValidationModalComponent implements OnInit {
  @Input() existingRule?: CellValidationRule;
  @Input() rangeLabel = 'A1';

  @Output() apply = new EventEmitter<CellValidationRule | null>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  ruleType: ValidationRuleType = 'list';
  operator: ValidationOperator = 'between';
  formula1 = '';
  formula2 = '';
  allowBlank = true;
  showDropdown = true;
  errorTitle = '';
  errorMessage = '';

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  get needsOperator(): boolean {
    return (
      this.ruleType === 'whole' ||
      this.ruleType === 'decimal' ||
      this.ruleType === 'textLength' ||
      this.ruleType === 'date'
    );
  }

  get usesSecondValue(): boolean {
    return this.operator === 'between' || this.operator === 'notBetween';
  }

  ngOnInit(): void {
    if (this.existingRule) {
      this.ruleType = this.existingRule.type;
      this.operator = this.existingRule.operator || 'between';
      this.formula1 = this.existingRule.formula1 || '';
      this.formula2 = this.existingRule.formula2 || '';
      this.allowBlank = this.existingRule.allowBlank !== false;
      this.showDropdown = this.existingRule.showDropdown !== false;
      this.errorTitle = this.existingRule.errorTitle || '';
      this.errorMessage = this.existingRule.errorMessage || '';
    }
  }

  clearRule(): void {
    this.apply.emit(null);
    this.close.emit();
  }

  submitRule(): void {
    if (this.ruleType === 'any') {
      this.apply.emit(null);
      this.close.emit();
      return;
    }
    this.apply.emit({
      type: this.ruleType,
      ...(this.needsOperator ? { operator: this.operator } : {}),
      formula1: this.formula1.trim(),
      ...(this.needsOperator && this.usesSecondValue ? { formula2: this.formula2.trim() } : {}),
      allowBlank: this.allowBlank,
      ...(this.ruleType === 'list' ? { showDropdown: this.showDropdown } : {}),
      ...(this.errorTitle.trim() ? { errorTitle: this.errorTitle.trim() } : {}),
      ...(this.errorMessage.trim() ? { errorMessage: this.errorMessage.trim() } : {}),
    });
    this.close.emit();
  }
}
