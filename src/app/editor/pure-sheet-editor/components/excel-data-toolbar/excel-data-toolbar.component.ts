import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { lucideArrowUp, lucideArrowDown, lucideArrowDownUp, lucideFilter, lucideFilterX, lucideCheckSquare, lucideColumns, lucideCopy, lucideSearch, lucideTable, lucideRefreshCw, lucideLayers, lucideMinus } from '@ng-icons/lucide';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-excel-data-toolbar',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons({ lucideArrowUp,
      lucideArrowDown,
      lucideArrowDownUp,
      lucideFilter,
      lucideFilterX,
      lucideCheckSquare,
      lucideColumns,
      lucideCopy,
      lucideSearch,
      lucideTable,
      lucideRefreshCw,
      lucideLayers,
      lucideMinus }),
  ],
  template: `
    <div class="excel-data-toolbar flex items-stretch gap-2 text-[11px] select-none">
      <!-- Ordenar y Filtrar -->
      <div class="flex flex-col justify-between pr-3 border-r shrink-0"
           [class.border-[#333333]]="themeService.isDark()"
           [class.border-slate-200]="!themeService.isDark()">
        <div class="flex items-center gap-1.5">
          <button type="button"
                  (click)="applySort.emit('asc')"
                  class="flex flex-col items-center px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="arrow-up" [size]="17" class="text-sky-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Ordenar A-Z' : 'Sort A-Z' }}</span>
          </button>

          <button type="button"
                  (click)="applySort.emit('desc')"
                  class="flex flex-col items-center px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="arrow-down" [size]="17" class="text-sky-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Ordenar Z-A' : 'Sort Z-A' }}</span>
          </button>

          <button type="button"
                  (click)="openSortFilter.emit()"
                  class="flex flex-col items-center px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="arrow-down-up" [size]="17" class="text-emerald-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Ordenar / Filtrar' : 'Sort / Filter' }}</span>
          </button>

          <button type="button"
                  (click)="toggleFilter.emit()"
                  [attr.aria-pressed]="filterActive"
                  class="flex flex-col items-center px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.bg-emerald-600/20]="filterActive"
                  [class.text-emerald-400]="filterActive && themeService.isDark()"
                  [class.text-emerald-700]="filterActive && !themeService.isDark()"
                  [class.hover:bg-[#2d2d2d]]="!filterActive && themeService.isDark()"
                  [class.hover:bg-slate-100]="!filterActive && !themeService.isDark()">
            <svg lucideIcon="filter" [size]="17" class="text-amber-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Filtro' : 'Filter' }}</span>
          </button>

          @if (hasColumnFilters) {
            <button type="button"
                    (click)="clearAllFilters.emit()"
                    class="flex flex-col items-center px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="filter-x" [size]="17" class="text-rose-400 mb-0.5"></svg>
              <span>{{ isEs ? 'Borrar filtros' : 'Clear filters' }}</span>
            </button>
          }
        </div>
        <div class="text-[10px] text-gray-400 text-center mt-1">{{ isEs ? 'Ordenar y filtrar' : 'Sort & Filter' }}</div>
      </div>

      <!-- Herramientas de datos -->
      <div class="flex flex-col justify-between px-2 border-r shrink-0"
           [class.border-[#333333]]="themeService.isDark()"
           [class.border-slate-200]="!themeService.isDark()">
        <div class="flex items-center gap-1.5">
          <button type="button"
                  data-testid="data-validation-btn"
                  (click)="openValidation.emit()"
                  class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="check-square" [size]="17" class="text-emerald-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Validación de datos' : 'Data Validation' }}</span>
          </button>

          <button type="button"
                  data-testid="remove-duplicates-btn"
                  (click)="openRemoveDuplicates.emit()"
                  class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="copy" [size]="17" class="text-rose-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Quitar duplicados' : 'Remove Duplicates' }}</span>
          </button>

          <button type="button"
                  data-testid="text-to-columns-btn"
                  (click)="openTextToColumns.emit()"
                  class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="columns" [size]="17" class="text-sky-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Texto en columnas' : 'Text to Columns' }}</span>
          </button>
        </div>
        <div class="text-[10px] text-gray-400 text-center mt-1">{{ isEs ? 'Herramientas de datos' : 'Data Tools' }}</div>
      </div>

      <!-- Búsqueda y Análisis -->
      <div class="flex flex-col justify-between pl-2 shrink-0">
        <div class="flex items-center gap-1.5">
          <button type="button"
                  data-testid="data-find-replace-btn"
                  (click)="openFindReplace.emit()"
                  class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="search" [size]="17" class="text-sky-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Buscar y reemplazar' : 'Find & Replace' }}</span>
          </button>

          <button type="button"
                  data-testid="data-pivot-btn"
                  (click)="openPivotModal.emit()"
                  class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                  [class.hover:bg-slate-100]="!themeService.isDark()">
            <svg lucideIcon="table" [size]="17" class="text-amber-400 mb-0.5"></svg>
            <span>{{ isEs ? 'Tabla dinámica' : 'PivotTable' }}</span>
          </button>

          @if (hasPivotTables) {
            <button type="button"
                    data-testid="refresh-pivot-btn"
                    (click)="refreshPivot.emit()"
                    class="flex flex-col items-center px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="refresh-cw" [size]="16" class="text-emerald-400 mb-0.5"></svg>
              <span>{{ isEs ? 'Actualizar' : 'Refresh' }}</span>
            </button>
          }
        </div>
        <div class="text-[10px] text-gray-400 text-center mt-1">{{ isEs ? 'Consulta y análisis' : 'Query & Analysis' }}</div>
      </div>

      <!-- Esquema (Agrupar / Desagrupar) -->
      <div class="flex flex-col justify-between pl-2 border-l shrink-0"
           [class.border-[#333333]]="themeService.isDark()"
           [class.border-slate-200]="!themeService.isDark()">
        <div class="flex items-center gap-1">
          <div class="flex flex-col gap-0.5">
            <button type="button"
                    data-testid="group-rows-btn"
                    (click)="groupOutline.emit('row')"
                    class="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="layers" [size]="12" class="text-emerald-500"></svg>
              <span>{{ isEs ? 'Agrupar filas' : 'Group Rows' }}</span>
            </button>
            <button type="button"
                    data-testid="ungroup-rows-btn"
                    (click)="ungroupOutline.emit('row')"
                    class="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="minus" [size]="12" class="text-slate-400"></svg>
              <span>{{ isEs ? 'Desagrupar filas' : 'Ungroup Rows' }}</span>
            </button>
          </div>
          <div class="flex flex-col gap-0.5">
            <button type="button"
                    data-testid="group-cols-btn"
                    (click)="groupOutline.emit('col')"
                    class="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="layers" [size]="12" class="text-sky-500"></svg>
              <span>{{ isEs ? 'Agrupar cols' : 'Group Cols' }}</span>
            </button>
            <button type="button"
                    data-testid="ungroup-cols-btn"
                    (click)="ungroupOutline.emit('col')"
                    class="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                    [class.hover:bg-[#2d2d2d]]="themeService.isDark()"
                    [class.hover:bg-slate-100]="!themeService.isDark()">
              <svg lucideIcon="minus" [size]="12" class="text-slate-400"></svg>
              <span>{{ isEs ? 'Desagrupar cols' : 'Ungroup Cols' }}</span>
            </button>
          </div>
        </div>
        <div class="text-[10px] text-gray-400 text-center mt-1">{{ isEs ? 'Esquema' : 'Outline' }}</div>
      </div>
    </div>
  `,
})
export class ExcelDataToolbarComponent {
  @Input() filterActive = false;
  @Input() hasColumnFilters = false;
  @Input() hasPivotTables = false;

  @Output() applySort = new EventEmitter<'asc' | 'desc'>();
  @Output() openSortFilter = new EventEmitter<void>();
  @Output() toggleFilter = new EventEmitter<void>();
  @Output() clearAllFilters = new EventEmitter<void>();
  @Output() openValidation = new EventEmitter<void>();
  @Output() openRemoveDuplicates = new EventEmitter<void>();
  @Output() openTextToColumns = new EventEmitter<void>();
  @Output() openFindReplace = new EventEmitter<void>();
  @Output() openPivotModal = new EventEmitter<void>();
  @Output() refreshPivot = new EventEmitter<void>();
  @Output() groupOutline = new EventEmitter<'row' | 'col'>();
  @Output() ungroupOutline = new EventEmitter<'row' | 'col'>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }
}
