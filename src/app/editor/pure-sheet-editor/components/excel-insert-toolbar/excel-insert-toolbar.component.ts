import { Component, EventEmitter, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartCategory, ChartSubType } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideTable,
  LucideFileSpreadsheet,
  LucideImage,
  LucideShapes,
  LucideSparkles,
  LucideBox,
  LucideCamera,
  LucideCheckSquare,
  LucideBarChart2,
  LucideTrendingUp,
  LucidePieChart,
  LucideGlobe,
  LucideActivity,
  LucideChartScatter,
  LucideFilter,
  LucideClock,
  LucideLink,
  LucideType,
  LucideFileText,
  LucideSigma,
  LucideChevronDown,
  LucideArrowUpRight,
} from '@lucide/angular';

@Component({
  selector: 'app-excel-insert-toolbar',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideTable,
      LucideFileSpreadsheet,
      LucideImage,
      LucideShapes,
      LucideSparkles,
      LucideBox,
      LucideCamera,
      LucideCheckSquare,
      LucideBarChart2,
      LucideTrendingUp,
      LucidePieChart,
      LucideGlobe,
      LucideActivity,
  LucideChartScatter,
      LucideFilter,
      LucideClock,
      LucideLink,
      LucideType,
      LucideFileText,
      LucideSigma,
      LucideChevronDown,
      LucideArrowUpRight
    ),
  ],
  templateUrl: './excel-insert-toolbar.component.html',
  styleUrls: ['./excel-insert-toolbar.component.scss'],
})
export class ExcelInsertToolbarComponent {
  @Output() insertChart = new EventEmitter<{ category: ChartCategory; subType: ChartSubType }>();
  @Output() openAllChartsModal = new EventEmitter<{ tab: 'recommended' | 'all'; category?: ChartCategory }>();
  @Output() openShapes = new EventEmitter<void>();
  @Output() openIcons = new EventEmitter<void>();
  @Output() insertCheckbox = new EventEmitter<void>();
  @Output() insertEquation = new EventEmitter<void>();
  @Output() insertSymbol = new EventEmitter<void>();
  @Output() formatSelectionAsTable = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);

  openDropdown: 'none' | 'pie' | 'column' | 'line' | 'scatter' | 'hierarchy' | 'statistical' = 'none';

  toggleDropdown(name: 'pie' | 'column' | 'line' | 'scatter' | 'hierarchy' | 'statistical', event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.openDropdown = this.openDropdown === name ? 'none' : name;
  }

  closeMenus(): void {
    this.openDropdown = 'none';
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.insert-dropdown-menu') && !target.closest('.insert-dropdown-trigger')) {
      this.closeMenus();
    }
  }

  handleInsert(category: ChartCategory, subType: ChartSubType): void {
    this.insertChart.emit({ category, subType });
    this.closeMenus();
  }

  handleOpenModal(tab: 'recommended' | 'all', category?: ChartCategory): void {
    this.openAllChartsModal.emit({ tab, category });
    this.closeMenus();
  }
}
