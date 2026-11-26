import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  lucideAlignCenter,
  lucideAlignJustify,
  lucideAlignLeft,
  lucideAlignRight,
  lucideArrowDown,
  lucideArrowLeft,
  lucideArrowRight,
  lucideArrowUp,
  lucideCheck,
  lucideChevronDown,
  lucideCombine,
  lucideColumns,
  lucideFrame,
  lucideGrid,
  lucideLayers,
  lucideMinus,
  lucidePaintBucket,
  lucidePalette,
  lucidePlus,
  lucideRows,
  lucideSliders,
  lucideSparkles,
  lucideTable,
  lucideTrash2,
} from '@ng-icons/lucide';
import { TableStyleRule, TextAlignment } from '../../models/word-document.model';
import { DEFAULT_TABLE_STYLE, normalizeTableStyle } from '../../utils/table-styling';
import { I18nService } from '../../../../core/services/i18n.service';

export interface TablePresetItem {
  id: string;
  nameKey: string;
  descKey: string;
  fallbackName: string;
  previewClass: string;
  rule: Partial<TableStyleRule>;
}

@Component({
  selector: 'app-word-table-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons({
      lucideTable,
      lucideColumns,
      lucideRows,
      lucidePlus,
      lucideMinus,
      lucideTrash2,
      lucideCombine,
      lucideAlignLeft,
      lucideAlignCenter,
      lucideAlignRight,
      lucideAlignJustify,
      lucidePaintBucket,
      lucidePalette,
      lucideSliders,
      lucideGrid,
      lucideCheck,
      lucideChevronDown,
      lucideSparkles,
      lucideArrowUp,
      lucideArrowDown,
      lucideArrowLeft,
      lucideArrowRight,
      lucideFrame,
      lucideLayers,
    }),
  ],
  templateUrl: './word-table-toolbar.component.html',
  styleUrl: './word-table-toolbar.component.css',
})
export class WordTableToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly i18n = inject(I18nService, { optional: true });

  @Input() darkMode = false;
  @Input() hasActiveTable = true;
  @Input() canMerge = false;
  @Input() rowTopBorder = false;
  @Input() verticalAlign: 'top' | 'middle' | 'bottom' = 'top';
  @Input() repeatHeader = true;
  @Input() set tableStyleRule(value: TableStyleRule | null) {
    if (value && value.mode === 'custom') {
      this.currentRule.set(normalizeTableStyle(value));
    } else {
      this.currentRule.set({ ...DEFAULT_TABLE_STYLE, mode: 'custom' });
    }
  }

  @Output() modifyTable = new EventEmitter<
    'addRow' | 'addRowAbove' | 'addRowBelow' | 'addCol' | 'addColLeft' | 'addColRight' | 'delRow' | 'delCol' | 'delTable' | 'splitCell'
  >();
  @Output() combineCells = new EventEmitter<void>();
  @Output() setCellBackground = new EventEmitter<string | null>();
  @Output() setVerticalAlign = new EventEmitter<'top' | 'middle' | 'bottom'>();
  @Output() setHorizontalAlign = new EventEmitter<'left' | 'center' | 'right' | 'justify'>();
  @Output() toggleRowTopBorder = new EventEmitter<void>();
  @Output() toggleRepeatHeader = new EventEmitter<void>();
  @Output() applyTableStyle = new EventEmitter<{ rule: TableStyleRule; fixed: boolean }>();
  @Output() setCellPadding = new EventEmitter<number>();
  @Output() distributeColumns = new EventEmitter<void>();
  @Output() insertTable = new EventEmitter<{ rows: number; cols: number }>();

  readonly openDropdown = signal<'presets' | 'shading' | 'borders' | 'padding' | 'insert' | null>(null);

  readonly currentRule = signal<TableStyleRule>({ ...DEFAULT_TABLE_STYLE, mode: 'custom' });

  readonly shadingSwatches = [
    'transparent',
    '#ffffff',
    '#f8fafc',
    '#f1f5f9',
    '#e2e8f0',
    '#dbeafe',
    '#bfdbfe',
    '#dcfce7',
    '#fef3c7',
    '#fee2e2',
    '#f3e8ff',
    '#1e293b',
  ];

  readonly borderWidths = [
    { pt: 0.5, label: '0.5 pt' },
    { pt: 1, label: '1.0 pt' },
    { pt: 1.5, label: '1.5 pt' },
    { pt: 2, label: '2.0 pt' },
    { pt: 3, label: '3.0 pt' },
  ];

  readonly paddingOptions = [
    { pt: 0, labelKey: 'word.table.padding_none', fallback: 'Sin margen (0 pt)' },
    { pt: 2, labelKey: 'word.table.padding_compact', fallback: 'Compacto (2 pt)' },
    { pt: 5, labelKey: 'word.table.padding_normal', fallback: 'Normal (5 pt)' },
    { pt: 8, labelKey: 'word.table.padding_wide', fallback: 'Amplio (8 pt)' },
    { pt: 12, labelKey: 'word.table.padding_spacious', fallback: 'Espacioso (12 pt)' },
  ];

  readonly presets: TablePresetItem[] = [
    {
      id: 'grid',
      nameKey: 'word.table.preset_grid',
      descKey: 'word.table.preset_grid_desc',
      fallbackName: 'Cuadrícula',
      previewClass: 'preview-grid',
      rule: {
        mode: 'custom',
        borders: 'grid',
        borderColor: '#cbd5e1',
        borderWidthPt: 0.5,
        cellPaddingPt: 5,
        header: true,
        headerBold: true,
        headerBackgroundColor: '#f1f5f9',
        headerColor: '#0f172a',
        bandedRows: false,
        bandColor: '#f8fafc',
        backgroundColor: '#ffffff',
        color: '#0f172a',
      },
    },
    {
      id: 'apa',
      nameKey: 'word.table.preset_apa',
      descKey: 'word.table.preset_apa_desc',
      fallbackName: 'Académico APA',
      previewClass: 'preview-apa',
      rule: {
        mode: 'custom',
        borders: 'horizontal',
        borderColor: '#0f172a',
        borderWidthPt: 1,
        cellPaddingPt: 5,
        header: true,
        headerBold: false,
        headerBackgroundColor: '#ffffff',
        headerColor: '#0f172a',
        bandedRows: false,
        bandColor: '#ffffff',
        backgroundColor: '#ffffff',
        color: '#0f172a',
      },
    },
    {
      id: 'striped',
      nameKey: 'word.table.preset_striped',
      descKey: 'word.table.preset_striped_desc',
      fallbackName: 'Filas alternas',
      previewClass: 'preview-striped',
      rule: {
        mode: 'custom',
        borders: 'grid',
        borderColor: '#e2e8f0',
        borderWidthPt: 0.5,
        cellPaddingPt: 5,
        header: true,
        headerBold: true,
        headerBackgroundColor: '#2563eb',
        headerColor: '#ffffff',
        bandedRows: true,
        bandColor: '#f8fafc',
        backgroundColor: '#ffffff',
        color: '#0f172a',
      },
    },
    {
      id: 'accent',
      nameKey: 'word.table.preset_accent',
      descKey: 'word.table.preset_accent_desc',
      fallbackName: 'Acento azul',
      previewClass: 'preview-accent',
      rule: {
        mode: 'custom',
        borders: 'grid',
        borderColor: '#93c5fd',
        borderWidthPt: 0.5,
        cellPaddingPt: 6,
        header: true,
        headerBold: true,
        headerBackgroundColor: '#dbeafe',
        headerColor: '#1e40af',
        bandedRows: true,
        bandColor: '#eff6ff',
        backgroundColor: '#ffffff',
        color: '#1e293b',
      },
    },
    {
      id: 'clean',
      nameKey: 'word.table.preset_clean',
      descKey: 'word.table.preset_clean_desc',
      fallbackName: 'Minimalista',
      previewClass: 'preview-clean',
      rule: {
        mode: 'custom',
        borders: 'none',
        borderColor: '#e2e8f0',
        borderWidthPt: 0,
        cellPaddingPt: 6,
        header: true,
        headerBold: true,
        headerBackgroundColor: '#f8fafc',
        headerColor: '#0f172a',
        bandedRows: false,
        bandColor: '#ffffff',
        backgroundColor: '#ffffff',
        color: '#0f172a',
      },
    },
    {
      id: 'horizontal',
      nameKey: 'word.table.preset_horizontal',
      descKey: 'word.table.preset_horizontal_desc',
      fallbackName: 'Líneas horizontales',
      previewClass: 'preview-horizontal',
      rule: {
        mode: 'custom',
        borders: 'horizontal',
        borderColor: '#cbd5e1',
        borderWidthPt: 0.5,
        cellPaddingPt: 5,
        header: true,
        headerBold: true,
        headerBackgroundColor: '#ffffff',
        headerColor: '#0f172a',
        bandedRows: false,
        bandColor: '#ffffff',
        backgroundColor: '#ffffff',
        color: '#0f172a',
      },
    },
  ];

  // Quick table inserter dimensions
  insertRows = 3;
  insertCols = 3;

  t(key: string, fallback?: string): string {
    if (!this.i18n) return fallback || key;
    const val = this.i18n.t(key);
    return val && val !== key ? val : (fallback || key);
  }

  toggleDropdown(name: 'presets' | 'shading' | 'borders' | 'padding' | 'insert'): void {
    this.openDropdown.update((cur) => (cur === name ? null : name));
  }

  closeDropdown(): void {
    this.openDropdown.set(null);
  }

  selectPreset(preset: TablePresetItem): void {
    const next = normalizeTableStyle({ ...this.currentRule(), ...preset.rule, mode: 'custom' });
    this.currentRule.set(next);
    this.applyTableStyle.emit({ rule: next, fixed: true });
    this.closeDropdown();
  }

  toggleOption(key: 'header' | 'headerBold' | 'bandedRows'): void {
    const cur = this.currentRule();
    const updated = normalizeTableStyle({ ...cur, [key]: !cur[key], mode: 'custom' });
    this.currentRule.set(updated);
    this.applyTableStyle.emit({ rule: updated, fixed: true });
  }

  setBordersType(borders: 'grid' | 'horizontal' | 'none'): void {
    const cur = this.currentRule();
    const updated = normalizeTableStyle({ ...cur, borders, mode: 'custom' });
    this.currentRule.set(updated);
    this.applyTableStyle.emit({ rule: updated, fixed: true });
    this.closeDropdown();
  }

  setBorderWidth(widthPt: number): void {
    const cur = this.currentRule();
    const updated = normalizeTableStyle({ ...cur, borderWidthPt: widthPt, mode: 'custom' });
    this.currentRule.set(updated);
    this.applyTableStyle.emit({ rule: updated, fixed: true });
    this.closeDropdown();
  }

  setBorderColor(color: string): void {
    const cur = this.currentRule();
    const updated = normalizeTableStyle({ ...cur, borderColor: color, mode: 'custom' });
    this.currentRule.set(updated);
    this.applyTableStyle.emit({ rule: updated, fixed: true });
  }

  applyCellPadding(paddingPt: number): void {
    const cur = this.currentRule();
    const updated = normalizeTableStyle({ ...cur, cellPaddingPt: paddingPt, mode: 'custom' });
    this.currentRule.set(updated);
    this.applyTableStyle.emit({ rule: updated, fixed: true });
    this.closeDropdown();
  }

  onSelectShading(color: string | null): void {
    this.setCellBackground.emit(color);
    this.closeDropdown();
  }

  onSelectCustomColor(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target?.value) {
      this.setCellBackground.emit(target.value);
    }
  }

  onSelectBorderColor(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target?.value) {
      this.setBorderColor(target.value);
    }
  }

  onInsertTableQuick(): void {
    const rows = Math.max(1, Math.min(20, this.insertRows));
    const cols = Math.max(1, Math.min(20, this.insertCols));
    this.insertTable.emit({ rows, cols });
    this.closeDropdown();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.openDropdown() && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }
}
