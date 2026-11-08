import { Component, EventEmitter, Input, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FreezePanesConfig } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideFileSpreadsheet,
  LucideEye,
  LucideZoomIn,
  LucideSnowflake,
  LucideChevronDown,
  LucideRows,
  LucideColumns,
  LucideX,
} from '@lucide/angular';

@Component({
  selector: 'app-excel-view-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideFileSpreadsheet,
      LucideEye,
      LucideZoomIn,
      LucideSnowflake,
      LucideChevronDown,
      LucideRows,
      LucideColumns,
      LucideX
    ),
  ],
  templateUrl: './excel-view-toolbar.component.html',
  styleUrls: ['./excel-view-toolbar.component.scss'],
})
export class ExcelViewToolbarComponent {
  @Input() activeSheetType: 'grid' | 'chart' = 'grid';
  @Input() showGridlines = true;
  @Input() showFormulaBar = true;
  @Input() showHeadings = true;
  @Input() zoom = 100;
  @Input() freezePanes: FreezePanesConfig = { rows: 0, cols: 0 };
  @Input() activeCellId = 'A1';
  @Input() selectedRow = 0;
  @Input() selectedCol = 0;

  @Output() selectNormalView = new EventEmitter<void>();
  @Output() selectChartView = new EventEmitter<void>();
  @Output() toggleGridlines = new EventEmitter<boolean>();
  @Output() toggleFormulaBar = new EventEmitter<boolean>();
  @Output() toggleHeadings = new EventEmitter<boolean>();
  @Output() changeZoom = new EventEmitter<number>();
  @Output() setFreezePanes = new EventEmitter<{ rows: number; cols: number }>();
  @Output() unfreezePanes = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly Math = Math;

  freezeMenuOpen = false;

  toggleFreezeMenu(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.freezeMenuOpen = !this.freezeMenuOpen;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.view-freeze-menu') && !target.closest('.view-freeze-trigger')) {
      this.freezeMenuOpen = false;
    }
  }

  freezeActiveCell(): void {
    this.setFreezePanes.emit({
      rows: this.selectedRow > 0 ? this.selectedRow : 1,
      cols: this.selectedCol > 0 ? this.selectedCol : 1,
    });
    this.freezeMenuOpen = false;
  }

  freezeTopRow(): void {
    this.setFreezePanes.emit({ rows: 1, cols: 0 });
    this.freezeMenuOpen = false;
  }

  freezeFirstColumn(): void {
    this.setFreezePanes.emit({ rows: 0, cols: 1 });
    this.freezeMenuOpen = false;
  }

  handleUnfreeze(): void {
    this.unfreezePanes.emit();
    this.freezeMenuOpen = false;
  }
}
