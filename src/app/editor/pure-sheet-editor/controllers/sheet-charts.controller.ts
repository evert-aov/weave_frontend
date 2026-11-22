import type { SheetEditorHooks } from './sheet-editor-hooks';
import { ChartCategory, ChartSubType, EmbeddedChart, SelectionRange, SheetGrid } from '../models/excel.model';
import { colIndexToLetter, extractFormulaReferences, HighlightedFormulaRef } from '../services/formula-engine.service';
import { getChartColorItems, inferChartDataConfig, resolveChartSeriesColor } from '../components/excel-chart-renderer/excel-chart-renderer.component';
import { ChartAppearance, ChartDataConfig } from '../models/excel.model';
import { CHART_CATEGORIES_DEF } from '../components/excel-chart-modal/excel-chart-modal.component';
import type { PureSheetEditorComponent } from '../pure-sheet-editor.component';

type SheetChartsControllerHost = Pick<PureSheetEditorComponent,
  | 'activeRibbonTab'
  | 'activeSheet'
  | 'activeSheetId'
  | 'chartDataModalOpen'
  | 'chartDataModalTab'
  | 'chartEditingId'
  | 'chartModalCat'
  | 'chartModalOpen'
  | 'chartModalTab'
  | 'chartSourceRange'
  | 'editOrigin'
  | 'editingValue'
  | 'formulaWorkbookRevision'
  | 'i18n'
  | 'isEditing'
  | 'scheduleAutoSave'
  | 'selectedChart'
  | 'selectedChartId'
  | 'selectionRange'
  | 'sheets'>;
type SheetChartsControllerHooks = Pick<SheetEditorHooks,
  | 'pushUndoSnapshot'>;

/** Charts behavior scoped to one editor instance. */
export class SheetChartsController {
  constructor(private readonly editor: SheetChartsControllerHost, private readonly hooks: SheetChartsControllerHooks) {}

  chartGrid(chart?: EmbeddedChart | null): SheetGrid { return this.editor.sheets.find(s => s.id === chart?.sourceSheetId)?.data || this.editor.activeSheet.data; }

  getChartRangeString(range?: SelectionRange): string {
    if (!range) return 'A1';
    const startCol = colIndexToLetter(Math.min(range.startCol, range.endCol));
    const startRow = Math.min(range.startRow, range.endRow) + 1;
    const endCol = colIndexToLetter(Math.max(range.startCol, range.endCol));
    const endRow = Math.max(range.startRow, range.endRow) + 1;
    return startCol === endCol && startRow === endRow ? `${startCol}${startRow}` : `${startCol}${startRow}:${endCol}${endRow}`;
  }

  openSelectedChartType(): void {
    const chart = this.editor.selectedChart;
    if (!chart) return;
    this.editor.chartEditingId = chart.id; this.editor.chartSourceRange = { ...chart.range };
    this.editor.chartModalCat = chart.category; this.editor.chartModalTab = 'all'; this.editor.chartModalOpen = true;
  }

  openChangeChartType(ch: EmbeddedChart, event: MouseEvent): void {
    event.stopPropagation();
    this.editor.selectedChartId = ch.id;
    this.editor.chartEditingId = ch.id;
    this.editor.chartSourceRange = { ...ch.range };
    this.editor.chartModalCat = ch.category; this.editor.chartModalTab = 'all'; this.editor.chartModalOpen = true;
  }

  insertChartFromSelection(event: { category: ChartCategory; subType: ChartSubType }): void {
    this.editor.chartEditingId = null; this.editor.chartSourceRange = { ...this.editor.selectionRange };
    this.onChartModalSelect(event);
  }

  onChartModalSelect(event: { category: ChartCategory; subType: ChartSubType }): void {
    this.hooks.pushUndoSnapshot();
    if (!this.editor.activeSheet.charts) this.editor.activeSheet.charts = [];

    const targetId = this.editor.chartEditingId || this.editor.selectedChartId;
    if (targetId) {
      const ch = this.editor.activeSheet.charts.find((item) => item.id === targetId);
      if (ch) {
        ch.category = event.category;
        ch.subType = event.subType;
        ch.title = event.category.charAt(0).toUpperCase() + event.category.slice(1);
        this.editor.chartEditingId = null; this.editor.chartSourceRange = undefined;
        this.editor.scheduleAutoSave();
        return;
      }
    }

    const source = this.editor.chartSourceRange || this.editor.selectionRange;
    const minCol = Math.min(source.startCol, source.endCol), maxCol = Math.max(source.startCol, source.endCol);
    const minRow = Math.min(source.startRow, source.endRow), maxRow = Math.max(source.startRow, source.endRow);
    const chartCount = this.editor.activeSheet.charts.length;
    const initialOffset = (chartCount * 28) % 140;
    const newChart: EmbeddedChart = {
      id: `chart-${crypto.randomUUID()}`,
      title: event.category.charAt(0).toUpperCase() + event.category.slice(1),
      category: event.category,
      subType: event.subType,
      range: {
        startCol: minCol,
        startRow: minRow,
        endCol: maxCol,
        endRow: maxRow,
      },
      x: 100 + initialOffset,
      y: 80 + initialOffset,
      width: 480,
      height: 300,
      colorPalette: 'excel',
    };

    this.editor.activeSheet.charts.push(newChart);
    this.editor.chartEditingId = null; this.editor.chartSourceRange = undefined;
    this.editor.selectedChartId = newChart.id;
    this.editor.activeRibbonTab = 'Chart Design';
    this.editor.scheduleAutoSave();
  }

  deleteSelectedChart(): void {
    if (!this.editor.selectedChartId || !this.editor.activeSheet.charts) return;
    this.hooks.pushUndoSnapshot();
    this.editor.activeSheet.charts = this.editor.activeSheet.charts.filter((c) => c.id !== this.editor.selectedChartId);
    this.editor.selectedChartId = null;
    this.editor.activeRibbonTab = 'Home';
    this.editor.scheduleAutoSave();
  }

  configureChartData(chart = this.editor.selectedChart, tab: 'data' | 'appearance' = 'data'): void {
    if (!chart) return;
    this.editor.selectedChartId = chart.id; this.editor.chartDataModalTab = tab; this.editor.chartDataModalOpen = true;
  }

  applyChartData(event: { range: SelectionRange; config: ChartDataConfig; appearance?: ChartAppearance; chartTitle?: string; subType?: ChartSubType; dataEdited?: boolean; seriesColors?: Record<string, string> }): void {
    const chart = this.editor.selectedChart;
    if (!chart) return;
    this.hooks.pushUndoSnapshot();
    if (event.dataEdited !== false) {
      chart.range = { ...event.range };
      chart.dataConfig = { ...event.config, seriesColumns: [...(event.config.seriesColumns || [])], seriesRows: event.config.seriesRows ? [...event.config.seriesRows] : undefined };
    }
    if (event.seriesColors) chart.seriesColors = { ...event.seriesColors };
    if (event.appearance) chart.appearance = { ...event.appearance };
    if (event.chartTitle !== undefined) chart.chartTitle = event.chartTitle;
    if (event.subType) chart.subType = event.subType;
    this.editor.chartDataModalOpen = false; this.editor.scheduleAutoSave();
  }

  getChartTypeLabel(chart: EmbeddedChart): string {
    const subtype = CHART_CATEGORIES_DEF.find(category => category.id === chart.category)?.subTypes.find(type => type.id === chart.subType);
    return subtype ? this.editor.i18n.currentLang() === 'es' ? subtype.labelEs : subtype.labelEn : chart.title;
  }

  changeChartTitle(title: string): void {
    const chart = this.editor.selectedChart;
    if (!chart || chart.chartTitle === title) return;
    this.hooks.pushUndoSnapshot(); chart.chartTitle = title; this.editor.scheduleAutoSave();
  }

  private sourceHighlightKey = '';

  private sourceHighlightGrid?: SheetGrid;

  private sourceHighlights: HighlightedFormulaRef[] = [];

  getSourceHighlight(col: number, row: number): Record<string, string> | null {
    const chart = this.editor.selectedChart;
    if (chart?.sourceSheetId && chart.sourceSheetId !== this.editor.activeSheetId && !this.editor.isEditing) return null;
    const key = this.editor.isEditing ? `formula:${this.editor.activeSheetId}:${this.editor.editOrigin?.sheetId}:${this.editor.editingValue}` : chart ? `chart:${chart.id}:${JSON.stringify(chart.range)}:${JSON.stringify(chart.dataConfig)}:${JSON.stringify(chart.seriesColors)}:${chart.colorPalette}:${chart.category}:${chart.subType}:${this.editor.formulaWorkbookRevision}` : '';
    if (key !== this.sourceHighlightKey || this.sourceHighlightGrid !== this.editor.activeSheet.data) {
      this.sourceHighlightKey = key; this.sourceHighlightGrid = this.editor.activeSheet.data;
      if (this.editor.isEditing) this.sourceHighlights = extractFormulaReferences(this.editor.editingValue, this.editor.activeSheet.name, this.editor.sheets.find(sheet => sheet.id === this.editor.editOrigin?.sheetId)?.name || this.editor.activeSheet.name);
      else if (chart) {
        const range = chart.range;
        const config = chart.dataConfig || inferChartDataConfig(this.editor.activeSheet.data, range);
        const items = getChartColorItems(this.editor.activeSheet.data, range, chart.dataConfig, chart.category, chart.subType);
        const minRow = Math.min(range.startRow, range.endRow), maxRow = Math.max(range.startRow, range.endRow);
        this.sourceHighlights = [];
        const xColumn = chart.category === 'scatter' && !chart.dataConfig ? config.seriesColumns.length > 1 ? config.seriesColumns[0] : null : config.xColumn;
        if (xColumn !== null && !['pie', 'sunburst', 'treemap'].includes(chart.category)) this.sourceHighlights.push({ refText: '', minCol: xColumn, maxCol: xColumn, minRow, maxRow, color: '#64748b' });
        items.forEach((item, index) => {
          const color = resolveChartSeriesColor(chart.seriesColors, item.key, chart.colorPalette, index);
          this.sourceHighlights.push({ refText: '', minCol: item.column, maxCol: item.column, minRow: item.row ?? minRow, maxRow: item.row ?? maxRow, color });
          if (item.row !== undefined && config.xColumn !== null) this.sourceHighlights.push({ refText: '', minCol: config.xColumn, maxCol: config.xColumn, minRow: item.row, maxRow: item.row, color });
        });
      } else this.sourceHighlights = [];
    }
    const ref = this.sourceHighlights.find(ref => col >= ref.minCol && col <= ref.maxCol && row >= ref.minRow && row <= ref.maxRow);
    if (!ref) return null;
    return { backgroundColor: `${ref.color}18`, borderTop: row === ref.minRow ? `2px solid ${ref.color}` : 'none', borderBottom: row === ref.maxRow ? `2px solid ${ref.color}` : 'none', borderLeft: col === ref.minCol ? `2px solid ${ref.color}` : 'none', borderRight: col === ref.maxCol ? `2px solid ${ref.color}` : 'none' };
  }

  useSelectedChartRange(): void {
    const chart = this.editor.selectedChart;
    if (!chart) return;
    this.hooks.pushUndoSnapshot(); chart.range = { ...this.editor.selectionRange }; delete chart.dataConfig; this.editor.scheduleAutoSave();
  }

  changeSelectedChartPalette(palette: 'excel' | 'monochrome' | 'warm' | 'cool'): void {
    if (!this.editor.selectedChartId || !this.editor.activeSheet.charts) return;
    const ch = this.editor.activeSheet.charts.find((c) => c.id === this.editor.selectedChartId);
    if (ch) {
      if (ch.colorPalette === palette && !Object.keys(ch.seriesColors || {}).length) return;
      this.hooks.pushUndoSnapshot();
      ch.colorPalette = palette;
      delete ch.seriesColors;
      this.editor.scheduleAutoSave();
    }
  }

  handleBringChartForward(): void {
    if (!this.editor.selectedChart || !this.editor.activeSheet.charts) return;
    const idx = this.editor.activeSheet.charts.findIndex((c) => c.id === this.editor.selectedChart?.id);
    if (idx >= 0 && idx < this.editor.activeSheet.charts.length - 1) {
      this.hooks.pushUndoSnapshot();
      const [chart] = this.editor.activeSheet.charts.splice(idx, 1);
      this.editor.activeSheet.charts.push(chart);
      this.editor.scheduleAutoSave();
    }
  }

  handleSendChartBackward(): void {
    if (!this.editor.selectedChart || !this.editor.activeSheet.charts) return;
    const idx = this.editor.activeSheet.charts.findIndex((c) => c.id === this.editor.selectedChart?.id);
    if (idx > 0) {
      this.hooks.pushUndoSnapshot();
      const [chart] = this.editor.activeSheet.charts.splice(idx, 1);
      this.editor.activeSheet.charts.unshift(chart);
      this.editor.scheduleAutoSave();
    }
  }

  handleOpenChartModal(event: { tab: 'recommended' | 'all'; category?: ChartCategory }): void {
    this.editor.chartEditingId = null;
    this.editor.chartSourceRange = { ...this.editor.selectionRange };
    this.editor.selectedChartId = null;
    this.editor.chartModalTab = event.tab;
    this.editor.chartModalCat = event.category;
    this.editor.chartModalOpen = true;
  }
}
