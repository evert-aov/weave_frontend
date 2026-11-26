import {
  Component,
  Input,
  OnChanges,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  SimpleChanges,
  computed,
  signal,
  inject,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartAppearance, ChartDataConfig, ChartCategory, ChartSubType, SelectionRange, SheetGrid } from '../../models/excel.model';
import { colIndexToLetter, evaluateCellValueCached, getCellId } from '../../services/formula-engine.service';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  ChartPlotState,
  hitTestChartPlot,
  paintChartPlot,
} from '../../services/chart-canvas-renderer';
import {
  ChartColorItem,
  ExtractedSeriesData,
  PALETTES,
  buildChartPlotState,
  extractChartDataFromGrid,
  getChartColorItems,
  inferChartDataConfig,
  parseNumericValue,
  resolveChartSeriesColor,
} from '../../services/chart-plot-builder';

export type { ChartColorItem, ExtractedSeriesData };
export {
  PALETTES,
  buildChartPlotState,
  extractChartDataFromGrid,
  getChartColorItems,
  inferChartDataConfig,
  parseNumericValue,
  resolveChartSeriesColor,
};

@Component({
  selector: 'app-excel-chart-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './excel-chart-renderer.component.html',
  styleUrls: ['./excel-chart-renderer.component.css'],
})
export class ExcelChartRendererComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) grid: SheetGrid = {};
  @Input() range?: SelectionRange;
  @Input() compact = false;
  @Input() chartTitle = '';
  @Input() appearance?: ChartAppearance;
  @Input() seriesColors?: Record<string, string>;
  @Input() dataConfig?: ChartDataConfig;
  @Input() dataRevision = 0;
  animateChart = true;
  private dataFingerprint?: string;
  @Input() category: ChartCategory = 'column';
  @Input() subType: ChartSubType = 'clusteredColumn';
  @Input() palette?: 'excel' | 'monochrome' | 'warm' | 'cool' = 'excel';

  readonly themeService = inject(ThemeService);
  readonly Math = Math;

  readonly chartData = signal<ExtractedSeriesData>({ rows: [], seriesKeys: [] });
  readonly renderCount = signal(0);
  private canvasEl?: HTMLCanvasElement;
  private disposed = false;

  @ViewChild('plotCanvas') set plotCanvas(el: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = el?.nativeElement;
    if (this.canvasEl) this.paintCanvas();
  }

  private readonly themeAndViewportEffect = effect(() => {
    void this.themeService.isDark();
    void this.viewport();
    void this.chartData();
    void this.axisHover();
    queueMicrotask(() => {
      if (!this.disposed) this.paintCanvas();
    });
  });

  ngOnInit(): void {
    this.refreshData();
  }

  ngAfterViewInit(): void {
    this.paintCanvas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['seriesColors']) this.clearHover();
    const dataChanged = !!(changes['grid'] || changes['range'] || changes['dataConfig'] || changes['dataRevision']);
    const rendererChanged = !!(changes['category'] || changes['subType'] || changes['palette'] || changes['compact']);
    if (dataChanged || rendererChanged) {
      this.clearHover();
      this.refreshData(rendererChanged);
    }
    this.paintCanvas();
  }

  readonly viewport = signal({ width: 500, height: 240 });
  private viewportObserver?: ResizeObserver;

  @ViewChild('plotViewport') set plotViewport(element: ElementRef<HTMLElement> | undefined) {
    this.viewportObserver?.disconnect();
    if (!element || typeof ResizeObserver === 'undefined') return;
    this.viewportObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.viewport.set({ width, height });
        this.paintCanvas();
      }
    });
    this.viewportObserver.observe(element.nativeElement);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.viewportObserver?.disconnect();
  }

  get chartAriaLabel(): string {
    const title = this.chartTitle.trim() || `${this.category} (${this.subType})`;
    const { rows, seriesKeys } = this.chartData();
    return `Gráfico ${title}: ${rows.length} categorías, ${seriesKeys.length} series`;
  }

  toPlotState(): ChartPlotState {
    const data = this.chartData();
    return {
      category: this.category,
      subType: this.subType,
      rows: data.rows,
      seriesKeys: data.seriesKeys,
      compact: this.compact,
      isDark: this.themeService.isDark(),
      smooth: this.smooth,
      markers: this.markers,
      stacked: this.stacked,
      percent: this.percent,
      axisDomain: this.axisDomain(),
      gridLines: this.gridLines(),
      barGroups: this.barGroups(),
      horizontalBarGroups: this.horizontalBarGroups(),
      lineSeries: this.lineSeries(),
      areaSeries: this.areaSeries(),
      pieSlices: this.pieSlices(),
      scatterPoints: this.scatterPoints(),
      radarData: this.radarData(),
      treemapTiles: this.treemapTiles(),
      visibleXLabels: this.visibleXLabels,
      scatterAxisLabels: this.scatterAxisLabels,
      getColor: (idx) => this.getColor(idx),
      valueOfRow: (row, key) => this.value(row, key),
      activeAxisHover: this.axisHover() ? { x: this.axisHover()!.x } : null,
    };
  }

  paintCanvas(): void {
    const canvas = this.canvasEl;
    if (!canvas || this.disposed) return;
    const { width, height } = this.viewport();
    const w = Math.max(40, Math.round(width || 500));
    const h = Math.max(40, Math.round(height || 240));
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    this.renderCount.update((c) => c + 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintChartPlot(ctx, this.toPlotState(), w, h, dpr);
  }

  get cartesian(): boolean { return !this.isPie() && !this.isRadar() && !this.isTreemap(); }
  get viewBox(): string {
    return this.cartesian ? `0 0 ${this.viewport().width} ${this.viewport().height}` : '0 0 500 240';
  }
  get plotLeft(): number { return Math.min(70, this.viewport().width * 0.32); }
  get plotBottom(): number { return Math.max(35, this.viewport().height - 26); }
  get scaleX(): number { return Math.max(1, this.viewport().width - this.plotLeft - 16) / 425; }
  get scaleY(): number { return Math.max(1, this.plotBottom - 10) / 175; }
  x(value: number): number { return this.cartesian ? this.plotLeft + (value - 55) * this.scaleX : value; }
  y(value: number): number {
    if (!this.cartesian) return value;
    return value === 218 ? this.plotBottom + 17 : 10 + (value - 25) * this.scaleY;
  }
  chartWidth(value: number): number { return this.cartesian ? value * this.scaleX : value; }
  chartHeight(value: number): number { return this.cartesian ? value * this.scaleY : value; }
  get plotTransform(): string | null {
    return this.cartesian ? `translate(${this.plotLeft - 55 * this.scaleX} ${10 - 25 * this.scaleY}) scale(${this.scaleX} ${this.scaleY})` : null;
  }

  get visibleXLabels(): { x: number; text: string; anchor: string }[] {
    const labels = this.xLabels();
    const labelWidth = Math.max(40, Math.min(180, Math.max(0, ...labels.map(label => label.text.length)) * 6 + 10));
    const count = Math.min(labels.length, Math.max(2, Math.floor((this.viewport().width - this.plotLeft - 16) / labelWidth) + 1));
    if (count < 2) return labels.map(label => ({ ...label, anchor: 'middle' }));
    return Array.from({ length: count }, (_, i) => {
      const index = Math.round(i * (labels.length - 1) / (count - 1));
      return { ...labels[index], anchor: i === count - 1 ? 'end' : 'middle' };
    });
  }

  get verticalLegend(): boolean { return this.appearance?.legendPosition === 'left' || this.appearance?.legendPosition === 'right'; }
  get chartLayout(): Record<string, string> {
    const legend = this.appearance?.legendPosition || 'bottom';
    const title = this.chartTitle.trim() && this.appearance?.titlePosition !== 'none' ? this.appearance?.titlePosition || 'top' : null;
    const areas: string[] = [], rows: string[] = [];
    if (title === 'top') { areas.push(this.verticalLegend ? 'title title' : 'title'); rows.push('auto'); }
    if (legend === 'top') { areas.push('legend'); rows.push('auto'); }
    areas.push(legend === 'left' ? 'legend plot' : legend === 'right' ? 'plot legend' : 'plot'); rows.push('minmax(0, 1fr)');
    if (legend === 'bottom') { areas.push('legend'); rows.push('auto'); }
    if (title === 'bottom') { areas.push(this.verticalLegend ? 'title title' : 'title'); rows.push('auto'); }
    return { display: 'grid', gridTemplateAreas: areas.map(area => `"${area}"`).join(' '), gridTemplateRows: rows.join(' '), gridTemplateColumns: legend === 'left' ? 'minmax(85px, 30%) minmax(0, 1fr)' : legend === 'right' ? 'minmax(0, 1fr) minmax(85px, 30%)' : 'minmax(0, 1fr)' };
  }

  animationKey = 0;

  get stacked(): boolean {
    return this.subType.toLowerCase().includes('stacked') || ['histogram', 'waterfall', 'surface'].includes(this.category);
  }

  get percent(): boolean { return this.subType.toLowerCase().includes('percent'); }
  get markers(): boolean { return this.subType.toLowerCase().includes('markers') || this.subType === 'line'; }
  get smooth(): boolean { return this.subType.toLowerCase().includes('smooth') || this.subType.includes('3d') || this.category === 'surface'; }

  private value(row: Record<string, string | number>, key: string): number {
    const value = Number(row[key]) || 0;
    if (!this.percent) return value;
    const total = this.chartData().seriesKeys.reduce((sum, k) => sum + Math.abs(Number(row[k]) || 0), 0);
    return total ? value / total * 100 : 0;
  }

  private linePath(points: { x: number; y: number }[]): string {
    const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    return valid.map((p, i) => {
      if (!i) return `M ${p.x} ${p.y}`;
      const previous = valid[i - 1];
      const mid = (previous.x + p.x) / 2;
      return this.smooth ? `C ${mid} ${previous.y}, ${mid} ${p.y}, ${p.x} ${p.y}` : `L ${p.x} ${p.y}`;
    }).join(' ');
  }

  private refreshData(rendererChanged = false): void {
    const extracted = extractChartDataFromGrid(this.grid, this.range, this.dataConfig);
    const rawValues: string[] = [];
    if (this.range) {
      for (let row = Math.min(this.range.startRow, this.range.endRow); row <= Math.max(this.range.startRow, this.range.endRow); row++) {
        const columns = this.dataConfig ? [...new Set([this.dataConfig.xColumn, ...this.dataConfig.seriesColumns])].filter((col): col is number => col !== null) : Array.from({ length: Math.abs(this.range.endCol - this.range.startCol) + 1 }, (_, index) => Math.min(this.range!.startCol, this.range!.endCol) + index);
        for (const col of columns) rawValues.push(this.grid[getCellId(col, row)]?.raw || '');
      }
    }
    const fingerprint = JSON.stringify({ extracted, rawValues, dataConfig: this.dataConfig });
    const changed = fingerprint !== this.dataFingerprint;
    if (changed) {
      if (this.dataFingerprint !== undefined) this.animationKey++;
      this.animateChart = true;
      this.dataFingerprint = fingerprint;
    } else if (rendererChanged) this.animateChart = false;
    if (changed || rendererChanged) this.chartData.set(extracted);
  }

  readonly colorItems = computed(() => {
    const data = this.chartData();
    if (!this.range) return [];
    return getChartColorItems(this.grid, this.range, this.dataConfig, this.category, this.subType, data);
  });
  getColor(idx: number): string {
    return resolveChartSeriesColor(this.seriesColors, this.colorItems()[idx]?.key, this.palette, idx);
  }

  truncate(str: any, len: number): string {
    const s = String(str ?? '');
    return s.length > len ? s.slice(0, len) + '…' : s;
  }

  isColumn(): boolean {
    return ['column', 'histogram', 'waterfall', 'map'].includes(this.category) && this.subType !== 'pareto';
  }

  isColumnOrBar(): boolean {
    return this.isColumn() || this.isBar();
  }

  isBar(): boolean {
    return this.category === 'bar';
  }

  isLine(): boolean {
    return this.category === 'line';
  }

  isArea(): boolean {
    return this.category === 'area' || this.category === 'surface';
  }

  isPie(): boolean {
    return this.category === 'pie' || this.category === 'sunburst';
  }

  isScatter(): boolean {
    return this.category === 'scatter';
  }

  isRadar(): boolean {
    return this.category === 'radar';
  }

  isTreemap(): boolean {
    return this.category === 'treemap';
  }

  isStock(): boolean {
    return this.category === 'stock';
  }

  isCombo(): boolean {
    return ['combo', 'stock', 'boxWhisker'].includes(this.category) || this.subType === 'pareto';
  }

  isFunnel(): boolean {
    return this.category === 'funnel';
  }

  get legendKeys(): string[] {
    if (this.isScatter()) return this.dataConfig ? this.chartData().seriesKeys : [this.chartData().seriesKeys[1] || this.chartData().seriesKeys[0]].filter(Boolean);
    return this.isPie() || this.isTreemap() ? this.chartData().rows.map(r => String(r['name']))
      : this.isCombo() ? this.chartData().seriesKeys.slice(0, 2) : this.chartData().seriesKeys;
  }

  get axisHoverEnabled(): boolean { return this.isLine() || this.isArea() || this.isCombo(); }

  readonly axisHover = signal<{
    index: number; x: number; left: number; top: number; label: string;
    values: { key: string; value: number; color: string }[];
  } | null>(null);

  onCanvasMouseMove(event: MouseEvent): void {
    const target = event.currentTarget as HTMLCanvasElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const { width, height } = this.viewport();
    const w = Math.max(40, width || rect.width || 500);
    const h = Math.max(40, height || rect.height || 240);
    const px = rect.width ? (event.clientX - rect.left) * w / rect.width : event.offsetX;
    const py = rect.height ? (event.clientY - rect.top) * h / rect.height : event.offsetY;

    if (this.axisHoverEnabled) {
      this.onAxisMoveAt(px, py, w, h);
      return;
    }

    const hit = hitTestChartPlot(px, py, this.toPlotState(), w, h);
    if (!hit) {
      this.clearHover();
      return;
    }
    const cardRect = target.closest('.chart-card-root')?.getBoundingClientRect() || rect;
    this.axisHover.set(null);
    this.hoverTooltip.set({
      x: Math.max(75, Math.min((cardRect.width || w) - 75, event.clientX - cardRect.left)),
      y: Math.max(60, event.clientY - cardRect.top),
      label: hit.label,
      series: hit.series,
      val: hit.val,
      color: hit.color,
    });
  }

  onAxisMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const w = this.viewport().width;
    const h = this.viewport().height;
    const pointerX = (event.clientX - rect.left) * w / rect.width;
    const pointerY = (event.clientY - rect.top) * h / rect.height;
    this.onAxisMoveAt(pointerX, pointerY, w, h);
  }

  private onAxisMoveAt(pointerX: number, pointerY: number, width: number, height: number): void {
    const positions = this.isCombo() ? this.barGroups().map(group => group.centerX) : this.xLabels().map(label => label.x);
    if (!positions.length) return;
    const index = positions.reduce((closest, position, i) =>
      Math.abs(this.x(position) - pointerX) < Math.abs(this.x(positions[closest]) - pointerX) ? i : closest, 0);
    const { rows, seriesKeys } = this.chartData();
    const row = rows[index];
    if (!row) return;
    const keys = this.isCombo() ? seriesKeys.slice(0, 2) : seriesKeys;
    this.hoverTooltip.set(null);
    this.axisHover.set({
      index, x: this.x(positions[index]), label: String(row['name'] || ''),
      left: Math.max(4, Math.min(width - 184, pointerX + 12)),
      top: Math.max(4, Math.min(height - (38 + keys.length * 20), pointerY + 12)),
      values: keys.map(key => ({ key, value: this.value(row, key), color: this.getColor(seriesKeys.indexOf(key)) })),
    });
  }

  readonly hoverTooltip = signal<{
    x: number;
    y: number;
    label: string;
    series: string;
    val: number;
    color: string;
  } | null>(null);

  setHover(e: MouseEvent, label: string, series: string, val: number, color: string): void {
    const el = e.currentTarget as HTMLElement;
    const rect = el.closest('.chart-card-root')?.getBoundingClientRect() || el.getBoundingClientRect();
    this.hoverTooltip.set({
      x: Math.max(75, Math.min(rect.width - 75, e.clientX - rect.left)),
      y: Math.max(60, e.clientY - rect.top),
      label,
      series,
      val,
      color,
    });
  }

  clearHover(): void {
    this.axisHover.set(null);
    this.hoverTooltip.set(null);
  }

  // A linear value axis with readable 1/2/2.5/5 × 10^n tick intervals.
  readonly axisDomain = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (this.percent) return { min: 0, max: 100, step: 25 };
    let min = 0, max = 0;
    const keys = this.isScatter() && !this.dataConfig ? [seriesKeys[1] || seriesKeys[0]] : this.isCombo() ? seriesKeys.slice(0, 2) : seriesKeys;
    for (const row of rows) {
      let positive = 0, negative = 0;
      for (const key of keys) {
        const value = Number(row[key]) || 0;
        min = Math.min(min, value); max = Math.max(max, value);
        positive += Math.max(0, value); negative += Math.min(0, value);
      }
      if (this.stacked) { min = Math.min(min, negative); max = Math.max(max, positive); }
    }
    if (min === 0 && max === 0) return { min: 0, max: 100, step: 25 };
    const lower = min < 0 ? min * 1.05 : 0, upper = max > 0 ? max * 1.05 : 0;
    const rawStep = (upper - lower) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = ([1, 2, 2.5, 5, 10].find(unit => unit * magnitude >= rawStep) || 10) * magnitude;
    return { min: Math.floor(lower / step) * step, max: Math.ceil(upper / step) * step, step };
  });
  readonly maxVal = computed(() => this.axisDomain().max);
  valueY(value: number): number {
    const domain = this.axisDomain();
    return 200 - (value - domain.min) / (domain.max - domain.min || 1) * 175;
  }
  readonly gridLines = computed(() => {
    const domain = this.axisDomain();
    const steps = this.compact ? 2 : Math.round((domain.max - domain.min) / domain.step);
    return Array.from({ length: steps + 1 }, (_, index) => {
      const val = Number((domain.min + (domain.max - domain.min) * index / steps).toPrecision(12));
      return { y: this.valueY(val), val };
    });
  });

  readonly barGroups = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];

    const max = this.maxVal();
    const totalW = 425; // from x=55 to 480
    const groupW = totalW / rows.length;
    const barPadding = 4;
    const keys = this.isCombo() ? seriesKeys.slice(0, 1) : seriesKeys;
    const barW = Math.max(4, Math.min(26, (groupW - barPadding * 2) / (this.stacked ? 1 : keys.length)));

    return rows.map((r, rIdx) => {
      const groupStartX = 55 + rIdx * groupW + (groupW - barW * (this.stacked ? 1 : keys.length)) / 2;
      let positive = 0, negative = 0;
      const bars = keys.map((k, kIdx) => {
        const v = this.value(r, k);
        const base = this.stacked ? v >= 0 ? positive : negative : 0;
        if (v >= 0) positive += v; else negative += v;
        const startY = this.valueY(base), endY = this.valueY(base + v);
        return {
          key: k, val: v,
          x: groupStartX + (this.stacked ? 0 : kIdx * barW),
          y: v >= 0 && Math.abs(endY - startY) < 2 ? startY - 2 : Math.min(startY, endY),
          width: Math.max(2, barW - 2), height: Math.max(2, Math.abs(endY - startY)),
        };
      });
      return {
        label: String(r['name'] || `Fila ${rIdx + 1}`),
        centerX: 55 + rIdx * groupW + groupW / 2,
        bars,
      };
    });
  });

  readonly horizontalBarGroups = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];

    const max = this.maxVal();
    const totalH = 170;
    const groupH = totalH / rows.length;
    const barH = Math.max(4, Math.min(20, (groupH - 4) / (this.stacked ? 1 : seriesKeys.length)));

    return rows.map((r, rIdx) => {
      const groupStartY = 25 + rIdx * groupH + 2;
      let positive = 0, negative = 0;
      const bars = seriesKeys.map((k, kIdx) => {
        const v = this.value(r, k);
        const base = this.stacked ? v >= 0 ? positive : negative : 0;
        if (v >= 0) positive += v; else negative += v;
        const domain = this.axisDomain();
        const scale = 375 / (domain.max - domain.min || 1);
        const w = Math.max(2, Math.abs(v) * scale);
        return { key: k, val: v, x: this.isFunnel() ? 95 + (375 - w) / 2 : 95 + (Math.min(base, base + v) - domain.min) * scale,
          y: groupStartY + (this.stacked ? 0 : kIdx * barH), width: w, height: Math.max(2, barH - 2) };
      });
      return {
        label: String(r['name'] || `Item ${rIdx + 1}`),
        centerY: groupStartY + ((this.stacked ? 1 : seriesKeys.length) * barH) / 2,
        bars,
      };
    });
  });

  readonly xLabels = computed(() => {
    const { rows } = this.chartData();
    if (!rows.length) return [];
    const totalW = 425;
    const step = rows.length > 1 ? totalW / (rows.length - 1) : totalW / 2;
    return rows.map((r, i) => ({
      x: rows.length > 1 ? 55 + i * step : 260,
      text: String(r['name'] || `Item ${i + 1}`),
    }));
  });

  readonly lineSeries = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];

    const max = this.maxVal();
    const totalW = 425;
    const step = rows.length > 1 ? totalW / (rows.length - 1) : totalW / 2;

    const keys = this.isCombo() ? [seriesKeys[1] || seriesKeys[0]] : seriesKeys;
    return keys.map((k, keyIndex) => {
      const points = rows.map((r, i) => {
        const v = this.value(r, k);
        const plotted = this.stacked ? seriesKeys.slice(0, keyIndex + 1).reduce((sum, key) => sum + this.value(r, key), 0) : v;
        const x = this.isCombo() ? 55 + (i + 0.5) * 425 / rows.length : rows.length > 1 ? 55 + i * step : 260;
        const y = this.valueY(plotted);
        return { x, y, val: Number(r[k]) || 0, label: String(r['name'] || '') };
      });
      const d = this.linePath(points);
      return { key: k, d, points, colorIndex: seriesKeys.indexOf(k) };
    });
  });

  readonly areaSeries = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    const max = this.maxVal();
    return seriesKeys.map((key, keyIndex) => {
      const points = rows.map((row, index) => {
        const base = this.stacked ? seriesKeys.slice(0, keyIndex).reduce((sum, k) => sum + this.value(row, k), 0) : 0;
        return {
          x: rows.length > 1 ? 55 + index * 425 / (rows.length - 1) : 260,
          y: this.valueY(base + this.value(row, key)),
          baseY: this.valueY(base),
          val: Number(row[key]) || 0, label: String(row['name'] || ''),
        };
      });
      const dLine = this.linePath(points);
      const bottom = [...points].reverse().map(p => `L ${p.x} ${p.baseY}`).join(' ');
      return { key, dLine, dArea: `${dLine} ${bottom} Z`, points };
    });
  });

  readonly pieSlices = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];
    const k = seriesKeys[seriesKeys.length - 1];
    const total = rows.reduce((acc, r) => acc + Math.max(0, Number(r[k]) || 0), 0);
    if (total <= 0) return [];

    let currentAngle = -Math.PI / 2;
    const r = 90;
    const innerR = this.subType === 'doughnut' || this.category === 'sunburst' ? 45 : 0;

    return rows.map((row) => {
      const val = Math.max(0, Number(row[k]) || 0);
      const angle = Math.min((val / total) * (Math.PI * 2), Math.PI * 2 - 0.00001);
      const endAngle = currentAngle + angle;

      const x1 = Math.cos(currentAngle) * r;
      const y1 = Math.sin(currentAngle) * r;
      const x2 = Math.cos(endAngle) * r;
      const y2 = Math.sin(endAngle) * r;

      const largeArc = angle > Math.PI ? 1 : 0;

      let path = '';
      if (innerR > 0) {
        const ix1 = Math.cos(endAngle) * innerR;
        const iy1 = Math.sin(endAngle) * innerR;
        const ix2 = Math.cos(currentAngle) * innerR;
        const iy2 = Math.sin(currentAngle) * innerR;
        path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
      } else {
        path = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      }

      const sliceData = {
        label: String(row['name'] || ''),
        val,
        pct: Math.round((val / total) * 100),
        path,
      };

      currentAngle = endAngle;
      return sliceData;
    });
  });

  readonly scatterPoints = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];
    const xKey = seriesKeys[0];
    const yKeys = this.dataConfig ? seriesKeys : [seriesKeys[1] || xKey];
    const xValues = rows.map((row, index) => this.dataConfig ? Number(row['__x']) : seriesKeys.length > 1 ? Number(row[xKey]) || index + 1 : index + 1);
    const maxX = Math.max(1, ...xValues);
    return yKeys.flatMap((key, colorIdx) => rows.map((row, i) => ({
      x: 55 + xValues[i] / maxX * 425,
      y: this.valueY(Number(row[key]) || 0),
      val: Number(row[key]) || 0, xVal: xValues[i],
      label: String(row['name'] || ''), series: key, colorIdx,
    })));
  });

  get scatterLines(): { key: string; colorIdx: number; path: string }[] {
    return [...new Set(this.scatterPoints().map(point => point.series))].map((key, colorIdx) => ({ key, colorIdx, path: this.linePath(this.scatterPoints().filter(point => point.series === key)) }));
  }
  get scatterAxisLabels() { return this.scatterPoints().filter((point, index, all) => all.findIndex(other => other.x === point.x) === index); }


  readonly radarData = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return { spokes: [], series: [] };

    const max = Math.max(1, this.maxVal());
    const cx = 250;
    const cy = 125;
    const radius = 85;
    const n = rows.length;

    const spokes = rows.map((r, i) => {
      const angle = -Math.PI / 2 + (i / n) * (Math.PI * 2);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const lx = cx + Math.cos(angle) * (radius + 15);
      const ly = cy + Math.sin(angle) * (radius + 15);
      return { x, y, lx, ly, label: String(r['name'] || `P${i + 1}`) };
    });

    const series = seriesKeys.map((k, sIdx) => {
      const pts = rows.map((r, i) => {
        const v = Math.max(0, Number(r[k]) || 0);
        const rNorm = (v / max) * radius;
        const angle = -Math.PI / 2 + (i / n) * (Math.PI * 2);
        return {
          val: v, label: String(r['name'] || ''),
          x: cx + Math.cos(angle) * rNorm,
          y: cy + Math.sin(angle) * rNorm,
        };
      });
      const d = pts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '') + ' Z';
      return { key: k, d, colorIdx: sIdx, pts };
    });

    return { spokes, series };
  });

  readonly treemapTiles = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length || !seriesKeys.length) return [];
    const k = seriesKeys[seriesKeys.length - 1];
    const total = rows.reduce((acc, r) => acc + Math.max(0, Number(r[k]) || 0), 0);
    if (total <= 0) return [];

    const totalW = 430;
    const totalH = 190;
    const startX = 45;
    const startY = 25;

    // Split items into 2 columns
    const half = Math.ceil(rows.length / 2);
    const col1 = rows.slice(0, half);
    const col2 = rows.slice(half);

    const tiles: { x: number; y: number; w: number; h: number; label: string; val: number; colorIdx: number }[] = [];
    const w1 = col2.length > 0 ? totalW * 0.55 : totalW;
    const w2 = totalW - w1;

    let curY = startY;
    const t1 = col1.reduce((acc, r) => acc + Math.max(0, Number(r[k]) || 0), 0) || 1;
    col1.forEach((r, idx) => {
      const val = Math.max(0, Number(r[k]) || 0);
      const h = (val / t1) * totalH;
      tiles.push({ x: startX, y: curY, w: w1 - 3, h: Math.max(14, h - 3), label: String(r['name'] || ''), val, colorIdx: idx });
      curY += h;
    });

    curY = startY;
    const t2 = col2.reduce((acc, r) => acc + Math.max(0, Number(r[k]) || 0), 0) || 1;
    col2.forEach((r, idx) => {
      const val = Math.max(0, Number(r[k]) || 0);
      const h = (val / t2) * totalH;
      tiles.push({ x: startX + w1, y: curY, w: w2 - 3, h: Math.max(14, h - 3), label: String(r['name'] || ''), val, colorIdx: half + idx });
      curY += h;
    });

    return tiles;
  });

  readonly stockItems = computed(() => {
    const { rows, seriesKeys } = this.chartData();
    if (!rows.length) return [];
    const max = this.maxVal();
    const totalW = 440;
    const step = totalW / rows.length;

    return rows.map((r, i) => {
      const v = Math.max(0, Number(r[seriesKeys[0]]) || 0);
      const high = Math.min(max, v * 1.15);
      const low = Math.max(0, v * 0.85);
      const open = v * 0.95;
      const close = v * 1.05;

      const cx = 50 + i * step + step / 2;
      const yHigh = 220 - (high / max) * 190;
      const yLow = 220 - (low / max) * 190;
      const yOpen = 220 - (open / max) * 190;
      const yClose = 220 - (close / max) * 190;
      const isBull = close >= open;

      return {
        cx,
        yHigh,
        yLow,
        yTop: Math.min(yOpen, yClose),
        bodyH: Math.max(3, Math.abs(yClose - yOpen)),
        isBull,
        label: String(r['name'] || `S${i + 1}`),
      };
    });
  });
}
