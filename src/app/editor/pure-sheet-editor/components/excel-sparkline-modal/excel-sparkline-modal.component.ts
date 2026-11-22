import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, provideLucideIcons, LucideActivity, LucideX } from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { SelectionRange, SparklineConfig, SparklineType } from '../../models/excel.model';
import { colIndexToLetter, parseCellId } from '../../services/formula-engine.service';

@Component({
  selector: 'app-excel-sparkline-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideActivity, LucideX)],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
      <section role="dialog"
               aria-modal="true"
               [attr.aria-label]="isEs ? 'Insertar minigráfico' : 'Insert Sparkline'"
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
            <svg lucideIcon="activity" [size]="16" class="text-emerald-500"></svg>
            <span>{{ isEs ? 'Minigráfico en celda' : 'In-Cell Sparkline' }}</span>
          </div>
          <button type="button" (click)="close.emit()" class="p-1 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                  [attr.aria-label]="isEs ? 'Cerrar' : 'Close'">
            <svg lucideIcon="x" [size]="16"></svg>
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Tipo' : 'Type' }}</label>
            <div class="grid grid-cols-3 gap-2">
              <button type="button"
                      (click)="type = 'line'"
                      class="px-2.5 py-1.5 rounded-lg border text-center cursor-pointer"
                      [class.bg-emerald-600]="type === 'line'"
                      [class.text-white]="type === 'line'"
                      [class.border-emerald-600]="type === 'line'"
                      [class.border-slate-700]="type !== 'line' && themeService.isDark()"
                      [class.border-slate-300]="type !== 'line' && !themeService.isDark()">
                {{ isEs ? 'Línea' : 'Line' }}
              </button>
              <button type="button"
                      (click)="type = 'column'"
                      class="px-2.5 py-1.5 rounded-lg border text-center cursor-pointer"
                      [class.bg-emerald-600]="type === 'column'"
                      [class.text-white]="type === 'column'"
                      [class.border-emerald-600]="type === 'column'"
                      [class.border-slate-700]="type !== 'column' && themeService.isDark()"
                      [class.border-slate-300]="type !== 'column' && !themeService.isDark()">
                {{ isEs ? 'Columnas' : 'Column' }}
              </button>
              <button type="button"
                      (click)="type = 'winLoss'"
                      class="px-2.5 py-1.5 rounded-lg border text-center cursor-pointer"
                      [class.bg-emerald-600]="type === 'winLoss'"
                      [class.text-white]="type === 'winLoss'"
                      [class.border-emerald-600]="type === 'winLoss'"
                      [class.border-slate-700]="type !== 'winLoss' && themeService.isDark()"
                      [class.border-slate-300]="type !== 'winLoss' && !themeService.isDark()">
                {{ isEs ? 'Ganancia/Pérdida' : 'Win/Loss' }}
              </button>
            </div>
          </div>

          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Rango de datos (ej. B2:E2)' : 'Data range (e.g. B2:E2)' }}</label>
            <input type="text"
                   [(ngModel)]="rangeText"
                   data-testid="sparkline-range-input"
                   class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none font-mono"
                   [class.border-slate-700]="themeService.isDark()"
                   [class.border-slate-300]="!themeService.isDark()" />
          </div>

          <div>
            <label class="block font-medium mb-1 opacity-80">{{ isEs ? 'Celda destino (ej. F2)' : 'Location cell (e.g. F2)' }}</label>
            <input type="text"
                   [(ngModel)]="targetCellId"
                   data-testid="sparkline-target-input"
                   class="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none font-mono"
                   [class.border-slate-700]="themeService.isDark()"
                   [class.border-slate-300]="!themeService.isDark()" />
          </div>

          <div class="flex items-center justify-between">
            <span class="font-medium opacity-80">{{ isEs ? 'Color' : 'Color' }}</span>
            <div class="flex items-center gap-2">
              @for (c of palette; track c) {
                <button type="button"
                        (click)="color = c"
                        class="w-5 h-5 rounded-md border-2 cursor-pointer"
                        [style.background]="c"
                        [class.border-white]="color === c && themeService.isDark()"
                        [class.border-slate-900]="color === c && !themeService.isDark()"
                        [class.border-transparent]="color !== c"></button>
              }
            </div>
          </div>
        </div>

        <footer class="px-4 py-3 border-t flex items-center justify-between gap-2"
                [class.border-slate-800]="themeService.isDark()"
                [class.border-slate-200]="!themeService.isDark()">
          @if (hasExisting) {
            <button type="button" (click)="removeCurrent()" class="text-rose-500 hover:underline cursor-pointer">
              {{ isEs ? 'Quitar minigráfico' : 'Clear sparkline' }}
            </button>
          } @else {
            <span></span>
          }
          <div class="flex items-center gap-2">
            <button type="button" (click)="close.emit()" class="px-3 py-1.5 rounded-lg border cursor-pointer"
                    [class.border-slate-700]="themeService.isDark()"
                    [class.border-slate-300]="!themeService.isDark()">
              {{ isEs ? 'Cancelar' : 'Cancel' }}
            </button>
            <button type="button"
                    (click)="submit()"
                    [disabled]="!parsedRange || !parsedTarget"
                    data-testid="sparkline-apply-btn"
                    class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 cursor-pointer">
              {{ isEs ? 'Aplicar' : 'Apply' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  `,
})
export class ExcelSparklineModalComponent implements OnInit {
  @Input({ required: true }) sourceRange!: SelectionRange;
  @Input() initialTargetCellId = 'F2';
  @Input() existingConfig?: SparklineConfig;

  @Output() apply = new EventEmitter<{ targetCellId: string; config: SparklineConfig }>();
  @Output() remove = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  readonly palette = ['#059669', '#0284c7', '#f59e0b', '#dc2626', '#7c3aed'];

  type: SparklineType = 'line';
  rangeText = '';
  targetCellId = 'F2';
  color = '#059669';

  get isEs(): boolean {
    return this.i18n.currentLang() === 'es';
  }

  get hasExisting(): boolean {
    return Boolean(this.existingConfig);
  }

  ngOnInit(): void {
    const minC = Math.min(this.sourceRange.startCol, this.sourceRange.endCol);
    const maxC = Math.max(this.sourceRange.startCol, this.sourceRange.endCol);
    const minR = Math.min(this.sourceRange.startRow, this.sourceRange.endRow);
    const maxR = Math.max(this.sourceRange.startRow, this.sourceRange.endRow);
    this.rangeText = `${colIndexToLetter(minC)}${minR + 1}:${colIndexToLetter(maxC)}${maxR + 1}`;
    this.targetCellId = this.initialTargetCellId || `${colIndexToLetter(maxC + 1)}${minR + 1}`;
    if (this.existingConfig) {
      this.type = this.existingConfig.type;
      this.color = this.existingConfig.color || '#059669';
    }
  }

  get parsedRange(): SelectionRange | null {
    const parts = this.rangeText.trim().split(':');
    const a = parseCellId(parts[0] || '');
    const b = parseCellId(parts[1] || parts[0] || '');
    if (!a || !b) return null;
    return { startCol: a.col, startRow: a.row, endCol: b.col, endRow: b.row };
  }

  get parsedTarget(): string | null {
    const clean = this.targetCellId.trim().toUpperCase();
    return parseCellId(clean) ? clean : null;
  }

  submit(): void {
    if (!this.parsedRange || !this.parsedTarget) return;
    this.apply.emit({
      targetCellId: this.parsedTarget,
      config: {
        type: this.type,
        sourceRange: this.parsedRange,
        color: this.color,
        showMarkers: true,
      },
    });
    this.close.emit();
  }

  removeCurrent(): void {
    if (this.parsedTarget) this.remove.emit(this.parsedTarget);
    this.close.emit();
  }
}
