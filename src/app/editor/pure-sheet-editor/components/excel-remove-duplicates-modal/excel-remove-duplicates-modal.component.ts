import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, provideLucideIcons, LucideCopy, LucideX } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';

export interface DuplicateColumnOption {
  col: number;
  label: string;
  selected: boolean;
}

@Component({
  selector: 'app-excel-remove-duplicates-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideCopy, LucideX)],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Quitar duplicados' : 'Remove Duplicates'"
               (click)="$event.stopPropagation()"
               (keydown.escape)="close.emit()"
               class="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden text-xs"
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
            <svg lucideIcon="copy" [size]="16" class="text-rose-500"></svg>
            <span>{{ isEs ? 'Quitar duplicados' : 'Remove Duplicates' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div class="flex items-center justify-between text-[11px] opacity-80">
            <span>{{ isEs ? 'Rango' : 'Range' }}: <strong class="font-mono">{{ rangeLabel }}</strong></span>
            <div class="flex gap-2">
              <button type="button" (click)="toggleAll(true)" class="text-emerald-500 hover:underline cursor-pointer">
                {{ isEs ? 'Todas' : 'Select all' }}
              </button>
              <button type="button" (click)="toggleAll(false)" class="text-slate-400 hover:underline cursor-pointer">
                {{ isEs ? 'Ninguna' : 'Unselect all' }}
              </button>
            </div>
          </div>

          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" [(ngModel)]="hasHeaders" class="accent-emerald-600" />
            <span>{{ isEs ? 'Mis datos tienen encabezados' : 'My data has headers' }}</span>
          </label>

          <div class="max-h-48 overflow-y-auto rounded-lg border p-2 space-y-1.5"
               [class.border-slate-700]="themeService.isDark()"
               [class.border-slate-200]="!themeService.isDark()">
            @for (col of columnItems; track col.col) {
              <label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-emerald-500/10 cursor-pointer">
                <input type="checkbox" [(ngModel)]="col.selected" class="accent-emerald-600" />
                <span class="truncate">{{ col.label }}</span>
              </label>
            }
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
                  [disabled]="selectedColumns.length === 0"
                  data-testid="remove-duplicates-apply"
                  class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 cursor-pointer">
            {{ isEs ? 'Aceptar' : 'OK' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelRemoveDuplicatesModalComponent implements OnInit {
  @Input() columns: { col: number; label: string }[] = [];
  @Input() rangeLabel = 'A1';

  @Output() apply = new EventEmitter<{ columns: number[]; hasHeaders: boolean }>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  columnItems: DuplicateColumnOption[] = [];
  hasHeaders = true;

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  get selectedColumns(): number[] {
    return this.columnItems.filter((c) => c.selected).map((c) => c.col);
  }

  ngOnInit(): void {
    this.columnItems = this.columns.map((c) => ({ ...c, selected: true }));
  }

  toggleAll(selected: boolean): void {
    this.columnItems.forEach((c) => (c.selected = selected));
  }

  submit(): void {
    if (!this.selectedColumns.length) return;
    this.apply.emit({ columns: this.selectedColumns, hasHeaders: this.hasHeaders });
    this.close.emit();
  }
}
