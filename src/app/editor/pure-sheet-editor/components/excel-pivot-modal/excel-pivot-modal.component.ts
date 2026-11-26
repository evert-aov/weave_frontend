import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lucideTable, lucideX } from '@ng-icons/lucide';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { CellData, SelectionRange, Sheet, SheetGrid } from '../../models/excel.model';
import { FormulaCalculationCache } from '../../services/formula-engine.service';
import {
  buildPivotTableMatrix,
  extractPivotHeaders,
  PivotAggregation,
  PivotTableConfig,
} from '../../services/sheet-data-tools.service';

@Component({
  selector: 'app-excel-pivot-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons({ lucideTable, lucideX })],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Crear tabla dinámica' : 'Create PivotTable'"
               (click)="$event.stopPropagation()"
               (keydown.escape)="close.emit()"
               class="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden text-xs"
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
            <svg lucideIcon="table" [size]="16" class="text-amber-500"></svg>
            <span>{{ isEs ? 'Crear tabla dinámica' : 'Create PivotTable' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div class="text-[11px] opacity-75">
            {{ isEs ? 'Rango origen' : 'Source range' }}: <strong class="font-mono">{{ rangeLabel }}</strong>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Filas (Agrupar por)' : 'Rows' }}</label>
              <select [(ngModel)]="rowCol" (ngModelChange)="refreshPreview()"
                      data-testid="pivot-row-select"
                      class="w-full px-2 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                @for (h of headers; track h.col) {
                  <option [ngValue]="h.col">{{ h.label }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Columnas (opcional)' : 'Columns (optional)' }}</label>
              <select [(ngModel)]="colCol" (ngModelChange)="refreshPreview()"
                      data-testid="pivot-col-select"
                      class="w-full px-2 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                <option [ngValue]="null">{{ isEs ? '(Ninguna)' : '(None)' }}</option>
                @for (h of headers; track h.col) {
                  <option [ngValue]="h.col">{{ h.label }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Valores' : 'Values' }}</label>
              <select [(ngModel)]="valueCol" (ngModelChange)="refreshPreview()"
                      data-testid="pivot-value-select"
                      class="w-full px-2 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                @for (h of headers; track h.col) {
                  <option [ngValue]="h.col">{{ h.label }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Cálculo' : 'Summarize by' }}</label>
              <select [(ngModel)]="aggregation" (ngModelChange)="refreshPreview()"
                      data-testid="pivot-agg-select"
                      class="w-full px-2 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                <option value="sum">{{ isEs ? 'Suma' : 'Sum' }}</option>
                <option value="count">{{ isEs ? 'Recuento' : 'Count' }}</option>
                <option value="average">{{ isEs ? 'Promedio' : 'Average' }}</option>
                <option value="min">{{ isEs ? 'Mínimo' : 'Min' }}</option>
                <option value="max">{{ isEs ? 'Máximo' : 'Max' }}</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-4 pt-1">
            <span class="font-medium opacity-80">{{ isEs ? 'Destino' : 'Destination' }}:</span>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="pivotDest" value="newSheet" [(ngModel)]="destination" class="accent-emerald-600" />
              <span>{{ isEs ? 'Nueva hoja' : 'New worksheet' }}</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="pivotDest" value="currentSheet" [(ngModel)]="destination" class="accent-emerald-600" />
              <span>{{ isEs ? 'Debajo / junto al rango en hoja actual' : 'Adjacent area in current sheet' }}</span>
            </label>
          </div>

          <div>
            <div class="font-medium mb-1 opacity-80">{{ isEs ? 'Vista previa' : 'Preview' }}</div>
            <div class="rounded-lg border overflow-auto max-h-56"
                 [class.border-slate-700]="themeService.isDark()"
                 [class.border-slate-200]="!themeService.isDark()">
              <table class="w-full text-[11px] border-collapse">
                <tbody>
                  @for (row of previewMatrix; track $index; let rIdx = $index) {
                    <tr [class.font-semibold]="rIdx === 0 || rIdx === previewMatrix.length - 1"
                        class="border-b last:border-b-0"
                        [class.bg-slate-800/70]="(rIdx === 0 || rIdx === previewMatrix.length - 1) && themeService.isDark()"
                        [class.bg-slate-100]="(rIdx === 0 || rIdx === previewMatrix.length - 1) && !themeService.isDark()"
                        [class.border-slate-800]="themeService.isDark()"
                        [class.border-slate-200]="!themeService.isDark()">
                      @for (cell of row; track $index) {
                        <td class="px-2.5 py-1.5 border-r last:border-r-0"
                            [class.text-right]="cell.style?.align === 'right'"
                            [class.border-slate-800]="themeService.isDark()"
                            [class.border-slate-200]="!themeService.isDark()">
                          {{ cell.raw }}
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <footer class="px-4 py-3 border-t flex items-center justify-end gap-2"
                [class.border-slate-800]="themeService.isDark()"
                [class.border-slate-200]="!themeService.isDark()">
          <button type="button" (click)="close.emit()" class="px-3 py-1.5 rounded-lg border cursor-pointer"
                  [class.border-slate-700]="themeService.isDark()"
                  [class.border-slate-300]="!themeService.isDark()">
            {{ isEs ? 'Cancelar' : 'Cancel' }}
          </button>
          <button type="button"
                  (click)="submit()"
                  [disabled]="headers.length === 0"
                  data-testid="pivot-create-btn"
                  class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 cursor-pointer">
            {{ isEs ? 'Crear tabla dinámica' : 'Create PivotTable' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelPivotModalComponent implements OnInit, OnChanges {
  @Input({ required: true }) grid!: SheetGrid;
  @Input({ required: true }) range!: SelectionRange;
  @Input() sheets: Sheet[] = [];
  @Input() activeSheet?: Sheet;
  @Input() calculationCache?: FormulaCalculationCache;
  @Input() rangeLabel = 'A1';

  @Output() createPivot = new EventEmitter<PivotTableConfig>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  headers: { col: number; label: string }[] = [];
  rowCol = 0;
  colCol: number | null = null;
  valueCol = 0;
  aggregation: PivotAggregation = 'sum';
  destination: 'newSheet' | 'currentSheet' = 'newSheet';
  previewMatrix: CellData[][] = [];

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  ngOnInit(): void {
    this.initFields();
  }

  ngOnChanges(): void {
    this.initFields();
  }

  private initFields(): void {
    if (!this.grid || !this.range) return;
    this.headers = extractPivotHeaders(
      this.grid,
      this.range,
      this.sheets,
      this.activeSheet,
      this.calculationCache
    );
    if (this.headers.length > 0) {
      if (!this.headers.some((h) => h.col === this.rowCol)) {
        this.rowCol = this.headers[0].col;
      }
      if (!this.headers.some((h) => h.col === this.valueCol)) {
        this.valueCol = this.headers[this.headers.length - 1].col;
      }
    }
    this.refreshPreview();
  }

  refreshPreview(): void {
    if (!this.headers.length) {
      this.previewMatrix = [];
      return;
    }
    this.previewMatrix = buildPivotTableMatrix(
      this.grid,
      {
        range: this.range,
        rowCol: this.rowCol,
        colCol: this.colCol,
        valueCol: this.valueCol,
        aggregation: this.aggregation,
        destination: this.destination,
      },
      this.sheets,
      this.activeSheet,
      this.calculationCache,
      this.isEs ? 'es' : 'en'
    ).matrix;
  }

  submit(): void {
    this.createPivot.emit({
      range: this.range,
      rowCol: this.rowCol,
      colCol: this.colCol,
      valueCol: this.valueCol,
      aggregation: this.aggregation,
      destination: this.destination,
    });
    this.close.emit();
  }
}
