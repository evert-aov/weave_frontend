import { Component, EventEmitter, HostListener, Input, OnInit, Output, inject } from '@angular/core';
import { ChartAppearance, ChartSubType, ChartDataConfig, EmbeddedChart, SelectionRange, SheetGrid } from '../../models/excel.model';
import { ChartColorItem, ExcelChartRendererComponent, getChartColorItems, inferChartDataConfig, resolveChartSeriesColor } from '../excel-chart-renderer/excel-chart-renderer.component';
import { colIndexToLetter, evaluateCellValue, getCellId, parseCellId } from '../../services/formula-engine.service';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-excel-chart-data-modal', standalone: true, imports: [ExcelChartRendererComponent],
  templateUrl: './excel-chart-data-modal.component.html', styleUrl: './excel-chart-data-modal.component.scss',
})
export class ExcelChartDataModalComponent implements OnInit {
  @Input() dataRevision = 0;
  @Input({ required: true }) grid!: SheetGrid;
  @Input({ required: true }) chart!: EmbeddedChart;
  @Input() initialTab: 'data' | 'appearance' = 'data';
  @Output() apply = new EventEmitter<{ range: SelectionRange; config: ChartDataConfig; appearance: ChartAppearance; chartTitle: string; subType: ChartSubType; dataEdited: boolean; seriesColors: Record<string, string> }>();
  @Output() close = new EventEmitter<void>();
  readonly theme = inject(ThemeService);
  range!: SelectionRange;
  config!: ChartDataConfig;
  sourceText = '';
  sourceError = '';
  tab: 'data' | 'appearance' = 'data';
  appearance!: ChartAppearance;
  title = '';
  subType!: ChartSubType;
  dataEdited = false;
  seriesColors: Record<string, string> = {};
  ngOnInit(): void {
    this.tab = this.initialTab;
    this.seriesColors = { ...this.chart.seriesColors };
    this.appearance = this.chart.appearance ? { ...this.chart.appearance } : { legendPosition: 'bottom', titlePosition: 'top', titleAlign: 'center' };
    this.title = this.chart.chartTitle || ''; this.subType = this.chart.subType;
    this.range = { ...this.chart.range };
    this.config = this.chart.dataConfig ? { ...this.chart.dataConfig, seriesColumns: [...this.chart.dataConfig.seriesColumns] } : inferChartDataConfig(this.grid, this.range);
    this.sourceText = `${getCellId(Math.min(this.range.startCol, this.range.endCol), Math.min(this.range.startRow, this.range.endRow))}:${getCellId(Math.max(this.range.startCol, this.range.endCol), Math.max(this.range.startRow, this.range.endRow))}`;
  }
  get columns(): { index: number; label: string }[] {
    const min = Math.min(this.range.startCol, this.range.endCol), max = Math.max(this.range.startCol, this.range.endCol);
    const row = Math.min(this.range.startRow, this.range.endRow);
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const index = min + i;
      const title = this.config.hasHeaders ? String(evaluateCellValue(getCellId(index, row), this.grid)) : '';
      return { index, label: colIndexToLetter(index) + (title ? ` — ${title}` : '') };
    });
  }
  setSource(value: string): void {
    this.dataEdited = true;
    this.sourceText = value;
    const match = /^\s*(\$?[A-Z]+\$?[1-9]\d*)(?::(\$?[A-Z]+\$?[1-9]\d*))?\s*$/i.exec(value);
    if (!match) { this.sourceError = 'Introduce un rango válido, por ejemplo A1:Z100.'; return; }
    const first = parseCellId(match[1]), last = parseCellId(match[2] || match[1]);
    if (!first || !last) return;
    this.sourceError = '';
    this.range = { startCol: Math.min(first.col, last.col), endCol: Math.max(first.col, last.col), startRow: Math.min(first.row, last.row), endRow: Math.max(first.row, last.row) };
    const indices = this.columns.map(column => column.index);
    const seriesColumns = this.config.seriesColumns.filter(col => indices.includes(col));
    this.config = { ...this.config, xColumn: this.config.xColumn !== null && indices.includes(this.config.xColumn) ? this.config.xColumn : null, seriesColumns };
  }
  setX(value: string): void {
    this.dataEdited = true;
    const xColumn = value === '' ? null : Number(value);
    this.config = { ...this.config, xColumn, seriesColumns: this.config.seriesColumns.filter(col => col !== xColumn) };
  }
  toggleSeries(column: number, checked: boolean): void {
    this.dataEdited = true;
    const seriesColumns = checked ? [...this.config.seriesColumns, column] : this.config.seriesColumns.filter(col => col !== column);
    this.config = { ...this.config, seriesColumns: [...new Set(seriesColumns)].sort((a, b) => a - b) };
  }
  setHeaders(checked: boolean): void { this.dataEdited = true; this.config = { ...this.config, hasHeaders: checked }; }
  get seriesMode(): string { return this.subType.toLowerCase().includes('percent') ? 'percent' : this.subType.toLowerCase().includes('stacked') ? 'stacked' : 'normal'; }
  setSeriesMode(mode: string): void {
    const markers = this.subType.toLowerCase().includes('markers') ? 'Markers' : '';
    const types: Record<string, string[]> = {
      line: [`line${markers}`, `stackedLine${markers}`, `percentStackedLine${markers}`],
      area: ['area', 'stackedArea', 'percentStackedArea'],
      column: ['clusteredColumn', 'stackedColumn', 'percentStackedColumn'],
      bar: ['clusteredBar', 'stackedBar', 'percentStackedBar'],
    };
    this.subType = (types[this.chart.category]?.[mode === 'percent' ? 2 : mode === 'stacked' ? 1 : 0] || this.subType) as ChartSubType;
  }
  setAppearance(field: keyof ChartAppearance, value: string): void { this.appearance = { ...this.appearance, [field]: value }; }
  get colorItems(): ChartColorItem[] {
    return getChartColorItems(this.grid, this.range, this.dataEdited ? this.config : this.chart.dataConfig, this.chart.category, this.subType);
  }
  itemColor(item: ChartColorItem, index: number): string { return resolveChartSeriesColor(this.seriesColors, item.key, this.chart.colorPalette, index); }
  setSeriesColor(key: string, value: string): void {
    if (/^#[0-9a-f]{6}$/i.test(value)) this.seriesColors = { ...this.seriesColors, [key]: value };
  }
  resetSeriesColor(key: string): void {
    const colors = { ...this.seriesColors }; delete colors[key]; this.seriesColors = colors;
  }
  confirm(): void {
    if (!this.sourceError && (this.config.seriesColumns.length || this.config.seriesRows?.length)) this.apply.emit({ range: { ...this.range }, config: { ...this.config, seriesColumns: [...this.config.seriesColumns], seriesRows: this.config.seriesRows ? [...this.config.seriesRows] : undefined }, appearance: { ...this.appearance }, chartTitle: this.title, subType: this.subType, dataEdited: this.dataEdited, seriesColors: { ...this.seriesColors } });
  }
  @HostListener('document:keydown.escape') escape(): void { this.close.emit(); }
}
