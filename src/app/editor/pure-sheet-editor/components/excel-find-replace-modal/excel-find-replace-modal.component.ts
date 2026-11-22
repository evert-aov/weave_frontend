import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, provideLucideIcons, LucideSearch, LucideX, LucideChevronUp, LucideChevronDown } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { FindMatch, FindReplaceOptions } from '../../services/sheet-data-tools.service';

@Component({
  selector: 'app-excel-find-replace-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideSearch, LucideX, LucideChevronUp, LucideChevronDown)],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Buscar y reemplazar' : 'Find and Replace'"
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
            <svg lucideIcon="search" [size]="16" class="text-sky-500"></svg>
            <span>{{ isEs ? 'Buscar y reemplazar' : 'Find & Replace' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Buscar' : 'Find what' }}</label>
            <input type="text"
                   [(ngModel)]="query"
                   (ngModelChange)="emitSearchPreview()"
                   (keydown.enter)="findNext.emit(currentOptions)"
                   data-testid="find-query-input"
                   class="w-full px-3 py-1.5 rounded-lg border outline-none bg-transparent"
                   [class.border-slate-700]="themeService.isDark()"
                   [class.border-slate-300]="!themeService.isDark()"
                   [placeholder]="isEs ? 'Texto o parte de fórmula...' : 'Text or formula fragment...'" />
          </div>

          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Reemplazar con' : 'Replace with' }}</label>
            <input type="text"
                   [(ngModel)]="replaceWith"
                   data-testid="replace-value-input"
                   class="w-full px-3 py-1.5 rounded-lg border outline-none bg-transparent"
                   [class.border-slate-700]="themeService.isDark()"
                   [class.border-slate-300]="!themeService.isDark()"
                   [placeholder]="isEs ? 'Nuevo valor...' : 'Replacement text...'" />
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Ámbito' : 'Within' }}</label>
              <select [(ngModel)]="scope"
                      (ngModelChange)="emitSearchPreview()"
                      class="w-full px-2.5 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                <option value="sheet">{{ isEs ? 'Hoja actual' : 'Active sheet' }}</option>
                <option value="workbook">{{ isEs ? 'Todo el libro' : 'Entire workbook' }}</option>
              </select>
            </div>
            <div>
              <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Buscar en' : 'Look in' }}</label>
              <select [(ngModel)]="searchIn"
                      (ngModelChange)="emitSearchPreview()"
                      class="w-full px-2.5 py-1.5 rounded-lg border bg-transparent"
                      [class.border-slate-700]="themeService.isDark()"
                      [class.bg-slate-900]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()">
                <option value="both">{{ isEs ? 'Fórmulas y valores' : 'Formulas & Values' }}</option>
                <option value="raw">{{ isEs ? 'Solo contenido / fórmulas' : 'Raw / Formulas only' }}</option>
                <option value="display">{{ isEs ? 'Solo valores mostrados' : 'Display values only' }}</option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 pt-1">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="matchCase" (ngModelChange)="emitSearchPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Distinguir mayús./minús.' : 'Match case' }}</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" [(ngModel)]="wholeCell" (ngModelChange)="emitSearchPreview()" class="accent-emerald-600" />
              <span>{{ isEs ? 'Celda completa' : 'Match entire cell' }}</span>
            </label>
          </div>

          <div class="px-3 py-2 rounded-lg border flex items-center justify-between text-[11px]"
               [class.bg-slate-800/60]="themeService.isDark()"
               [class.border-slate-700]="themeService.isDark()"
               [class.bg-slate-50]="!themeService.isDark()"
               [class.border-slate-200]="!themeService.isDark()">
            <span data-testid="find-match-status">
              @if (!query) {
                {{ isEs ? 'Escribe un término para buscar.' : 'Enter a search term.' }}
              } @else if (matches.length === 0) {
                {{ isEs ? 'Sin coincidencias.' : 'No matches found.' }}
              } @else {
                {{ isEs ? 'Coincidencia' : 'Match' }} {{ activeIndex + 1 }} / {{ matches.length }}
                · <strong>{{ matches[activeIndex]?.sheetName }}!{{ matches[activeIndex]?.cellId }}</strong>
              }
            </span>
            <div class="flex items-center gap-1">
              <button type="button"
                      (click)="findPrev.emit(currentOptions)"
                      [disabled]="matches.length === 0"
                      class="p-1 rounded border disabled:opacity-40 cursor-pointer"
                      [class.border-slate-600]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()"
                      [title]="isEs ? 'Anterior' : 'Previous'">
                <svg lucideIcon="chevron-up" [size]="12"></svg>
              </button>
              <button type="button"
                      (click)="findNext.emit(currentOptions)"
                      [disabled]="matches.length === 0"
                      class="p-1 rounded border disabled:opacity-40 cursor-pointer"
                      [class.border-slate-600]="themeService.isDark()"
                      [class.border-slate-300]="!themeService.isDark()"
                      [title]="isEs ? 'Siguiente' : 'Next'">
                <svg lucideIcon="chevron-down" [size]="12"></svg>
              </button>
            </div>
          </div>

          @if (statusMessage) {
            <p class="text-[11px] text-emerald-500 font-medium" role="status">{{ statusMessage }}</p>
          }
        </div>

        <footer class="px-4 py-3 border-t flex flex-wrap items-center justify-end gap-2"
                [class.border-slate-800]="themeService.isDark()"
                [class.border-slate-200]="!themeService.isDark()">
          <button type="button"
                  (click)="findNext.emit(currentOptions)"
                  [disabled]="!query"
                  data-testid="find-next-btn"
                  class="px-3 py-1.5 rounded-lg border font-medium disabled:opacity-40 cursor-pointer"
                  [class.border-slate-700]="themeService.isDark()"
                  [class.hover:bg-slate-800]="themeService.isDark()"
                  [class.border-slate-300]="!themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            {{ isEs ? 'Buscar siguiente' : 'Find Next' }}
          </button>
          <button type="button"
                  (click)="replaceCurrent.emit(currentOptions)"
                  [disabled]="matches.length === 0"
                  data-testid="replace-one-btn"
                  class="px-3 py-1.5 rounded-lg border font-medium disabled:opacity-40 cursor-pointer"
                  [class.border-slate-700]="themeService.isDark()"
                  [class.hover:bg-slate-800]="themeService.isDark()"
                  [class.border-slate-300]="!themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            {{ isEs ? 'Reemplazar' : 'Replace' }}
          </button>
          <button type="button"
                  (click)="replaceAll.emit(currentOptions)"
                  [disabled]="!query"
                  data-testid="replace-all-btn"
                  class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 cursor-pointer">
            {{ isEs ? 'Reemplazar todo' : 'Replace All' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelFindReplaceModalComponent implements OnChanges {
  @Input() initialQuery = '';
  @Input() focusReplace = false;
  @Input() matches: FindMatch[] = [];
  @Input() activeIndex = 0;
  @Input() statusMessage = '';

  @Output() searchChange = new EventEmitter<FindReplaceOptions>();
  @Output() findNext = new EventEmitter<FindReplaceOptions>();
  @Output() findPrev = new EventEmitter<FindReplaceOptions>();
  @Output() replaceCurrent = new EventEmitter<FindReplaceOptions>();
  @Output() replaceAll = new EventEmitter<FindReplaceOptions>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  query = '';
  replaceWith = '';
  scope: 'sheet' | 'workbook' = 'sheet';
  searchIn: 'raw' | 'display' | 'both' = 'both';
  matchCase = false;
  wholeCell = false;

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  get currentOptions(): FindReplaceOptions {
    return {
      query: this.query,
      replaceWith: this.replaceWith,
      scope: this.scope,
      matchCase: this.matchCase,
      wholeCell: this.wholeCell,
      searchIn: this.searchIn,
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialQuery'] && this.initialQuery && !this.query) {
      this.query = this.initialQuery;
      this.emitSearchPreview();
    }
  }

  emitSearchPreview(): void {
    this.searchChange.emit(this.currentOptions);
  }
}
