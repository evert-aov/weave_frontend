import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, provideLucideIcons, LucideColumns, LucideX } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { SelectionRange, Sheet, SheetGrid } from '../../models/excel.model';
import { FormulaCalculationCache } from '../../services/formula-engine.service';
import { previewTextToColumns, TextToColumnsDelimiters } from '../../services/sheet-data-tools.service';

@Component({
  selector: 'app-excel-text-to-columns-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideColumns, LucideX)],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Texto en columnas' : 'Text to Columns'"
               (click)="$event.stopPropagation()"
               (keydown.escape)="close.emit()"
               class="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden text-xs"
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
            <svg lucideIcon="columns" [size]="16" class="text-sky-500"></svg>
            <span>{{ isEs ? 'Texto en columnas' : 'Text to Columns' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div class="text-[11px] opacity-75">
            {{ isEs ? 'Columna origen del rango' : 'Source column in range' }}: <strong class="font-mono">{{ rangeLabel }}</strong>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="delimiters.comma" (ngModelChange)="refreshPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Coma (,)' : 'Comma (,)' }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="delimiters.semicolon" (ngModelChange)="refreshPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Punto y coma (;)' : 'Semicolon (;)' }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="delimiters.tab" (ngModelChange)="refreshPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Tabulación' : 'Tab' }}</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="delimiters.space" (ngModelChange)="refreshPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Espacio' : 'Space' }}</span>
            </label>
          </div>

          <div class="flex items-center gap-3">
            <label class="font-medium opacity-80 shrink-0">{{ isEs ? 'Otro separador' : 'Other' }}</label>
            <input type="text"
                   maxlength="4"
                   [(ngModel)]="delimiters.custom"
                   (ngModelChange)="refreshPreview()"
                   data-testid="ttc-custom-delimiter"
                   class="w-24 px-2.5 py-1 rounded-lg border bg-transparent outline-none"
                   [class.border-slate-700]="themeService.isDark()"
                   [class.border-slate-300]="!themeService.isDark()"
                   placeholder="|, -, /" />
            <label class="flex items-center gap-1.5 cursor-pointer ml-auto">
              <input type="checkbox" [(ngModel)]="delimiters.treatConsecutiveAsOne" (ngModelChange)="refreshPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Agrupar consecutivos' : 'Treat consecutive as one' }}</span>
            </label>
          </div>

          <div>
            <div class="font-medium mb-1 opacity-80">{{ isEs ? 'Vista previa' : 'Data preview' }}</div>
            <div class="rounded-lg border overflow-auto max-h-40"
                 [class.border-slate-700]="themeService.isDark()"
                 [class.border-slate-200]="!themeService.isDark()">
              <table class="w-full text-[11px] border-collapse">
                <tbody>
                  @for (row of previewRows; track $index) {
                    <tr class="border-b last:border-b-0"
                        [class.border-slate-800]="themeService.isDark()"
                        [class.border-slate-200]="!themeService.isDark()">
                      @for (cell of row; track $index) {
                        <td class="px-2 py-1 border-r last:border-r-0 truncate max-w-[140px]"
                            [class.border-slate-800]="themeService.isDark()"
                            [class.border-slate-200]="!themeService.isDark()">
                          {{ cell }}
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr>
                      <td class="px-3 py-4 text-center opacity-60">
                        {{ isEs ? 'Sin texto en la primera columna del rango.' : 'No text in the first column of selection.' }}
                      </td>
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
                  (click)="apply.emit(delimiters); close.emit()"
                  data-testid="ttc-apply-btn"
                  class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer">
            {{ isEs ? 'Dividir columnas' : 'Split Columns' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelTextToColumnsModalComponent implements OnChanges {
  @Input({ required: true }) grid!: SheetGrid;
  @Input({ required: true }) range!: SelectionRange;
  @Input() sheets: Sheet[] = [];
  @Input() activeSheet?: Sheet;
  @Input() calculationCache?: FormulaCalculationCache;
  @Input() rangeLabel = 'A1';

  @Output() apply = new EventEmitter<TextToColumnsDelimiters>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  delimiters: TextToColumnsDelimiters = {
    comma: true,
    semicolon: false,
    tab: false,
    space: false,
    custom: '',
    treatConsecutiveAsOne: false,
  };

  previewRows: string[][] = [];

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  ngOnChanges(): void {
    this.refreshPreview();
  }

  refreshPreview(): void {
    if (!this.grid || !this.range) return;
    this.previewRows = previewTextToColumns(
      this.grid,
      this.range,
      this.delimiters,
      6,
      this.sheets,
      this.activeSheet,
      this.calculationCache
    );
  }
}
