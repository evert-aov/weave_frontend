import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChartCategory, ChartSubType, SheetGrid } from '../../models/excel.model';
import { ExcelChartRendererComponent } from '../excel-chart-renderer/excel-chart-renderer.component';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-excel-chart-sheet-view',
  standalone: true,
  imports: [CommonModule, FormsModule, ExcelChartRendererComponent],
  templateUrl: './excel-chart-sheet-view.component.html',
  styleUrls: ['./excel-chart-sheet-view.component.css'],
})
export class ExcelChartSheetViewComponent {
  @Input() dataRevision = 0;
  @Input({ required: true }) grid: SheetGrid = {};
  @Input() category: ChartCategory = 'column';
  @Input() subType: ChartSubType = 'clusteredColumn';

  @Output() loadSampleData = new EventEmitter<void>();
  @Output() openChangeChartType = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  palette: 'excel' | 'monochrome' | 'warm' | 'cool' = 'excel';

  get hasSheetData(): boolean {
    return Object.keys(this.grid).length > 0;
  }
}
