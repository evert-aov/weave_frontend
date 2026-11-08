import { Component, EventEmitter, Input, Output, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideBarChart2,
  LucideTrendingUp,
  LucidePieChart,
  LucideAlignLeft,
  LucideActivity,
  LucideChartScatter,
  LucideGlobe,
  LucideCandlestickChart,
  LucideLayers,
  LucideHexagon,
  LucideLayoutGrid,
  LucideSun,
  LucideSliders,
  LucideArrowDownUp,
  LucideFilter,
  LucideCombine,
  LucideX,
  LucideCheck,
  LucideRotateCcw,
  LucideFolder,
} from '@lucide/angular';
import { ChartAppearance, ChartDataConfig, ChartCategory, ChartSubType, SelectionRange, SheetGrid } from '../../models/excel.model';
import { ExcelChartRendererComponent } from '../excel-chart-renderer/excel-chart-renderer.component';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

export interface ChartCategoryDef {
  id: ChartCategory;
  labelEs: string;
  labelEn: string;
  icon: string;
  subTypes: { id: ChartSubType; labelEs: string; labelEn: string; description?: string }[];
}

export const CHART_CATEGORIES_DEF: ChartCategoryDef[] = [
  {
    id: 'column',
    labelEs: 'Columna',
    labelEn: 'Column',
    icon: 'bar-chart-2',
    subTypes: [
      { id: 'clusteredColumn', labelEs: 'Columnas Agrupadas', labelEn: 'Clustered Column' },
      { id: 'stackedColumn', labelEs: 'Columnas Apiladas', labelEn: 'Stacked Column' },
      { id: 'percentStackedColumn', labelEs: 'Columnas 100% Apiladas', labelEn: '100% Stacked Column' },
      { id: '3dClusteredColumn', labelEs: 'Columnas 3D Agrupadas', labelEn: '3-D Clustered Column' },
      { id: '3dStackedColumn', labelEs: 'Columnas 3D Apiladas', labelEn: '3-D Stacked Column' },
      { id: '3dPercentStackedColumn', labelEs: 'Columnas 3D 100% Apiladas', labelEn: '3-D 100% Stacked Column' },
      { id: '3dColumn', labelEs: 'Columna 3D', labelEn: '3-D Column' },
    ],
  },
  {
    id: 'line',
    labelEs: 'Línea',
    labelEn: 'Line',
    icon: 'trending-up',
    subTypes: [
      { id: 'line', labelEs: 'Línea', labelEn: 'Line' },
      { id: 'stackedLine', labelEs: 'Línea Apilada', labelEn: 'Stacked Line' },
      { id: 'percentStackedLine', labelEs: 'Línea 100% Apilada', labelEn: '100% Stacked Line' },
      { id: 'lineMarkers', labelEs: 'Línea con Marcadores', labelEn: 'Line with Markers' },
      { id: 'stackedLineMarkers', labelEs: 'Línea Apilada con Marcadores', labelEn: 'Stacked Line with Markers' },
      { id: 'percentStackedLineMarkers', labelEs: '100% Apilada con Marcadores', labelEn: '100% Stacked with Markers' },
      { id: '3dLine', labelEs: 'Línea 3D', labelEn: '3-D Line' },
    ],
  },
  {
    id: 'pie',
    labelEs: 'Circular / Anillo',
    labelEn: 'Pie / Doughnut',
    icon: 'pie-chart',
    subTypes: [
      { id: 'pie2d', labelEs: 'Circular 2D', labelEn: '2D Pie' },
      { id: 'pieOfPie', labelEs: 'Circular con Subgráfico', labelEn: 'Pie of Pie' },
      { id: 'barOfPie', labelEs: 'Circular con Barras', labelEn: 'Bar of Pie' },
      { id: 'pie3d', labelEs: 'Circular 3D', labelEn: '3-D Pie' },
      { id: 'doughnut', labelEs: 'Anillo (Doughnut)', labelEn: 'Doughnut' },
    ],
  },
  {
    id: 'bar',
    labelEs: 'Barra Horizontal',
    labelEn: 'Bar',
    icon: 'align-left',
    subTypes: [
      { id: 'clusteredBar', labelEs: 'Barras Agrupadas', labelEn: 'Clustered Bar' },
      { id: 'stackedBar', labelEs: 'Barras Apiladas', labelEn: 'Stacked Bar' },
      { id: 'percentStackedBar', labelEs: 'Barras 100% Apiladas', labelEn: '100% Stacked Bar' },
      { id: '3dClusteredBar', labelEs: 'Barras 3D Agrupadas', labelEn: '3-D Clustered Bar' },
      { id: '3dStackedBar', labelEs: 'Barras 3D Apiladas', labelEn: '3-D Stacked Bar' },
      { id: '3dPercentStackedBar', labelEs: 'Barras 3D 100% Apiladas', labelEn: '3-D 100% Stacked Bar' },
    ],
  },
  {
    id: 'area',
    labelEs: 'Área',
    labelEn: 'Area',
    icon: 'activity',
    subTypes: [
      { id: 'area', labelEs: 'Área', labelEn: 'Area' },
      { id: 'stackedArea', labelEs: 'Área Apilada', labelEn: 'Stacked Area' },
      { id: 'percentStackedArea', labelEs: 'Área 100% Apilada', labelEn: '100% Stacked Area' },
      { id: '3dArea', labelEs: 'Área 3D', labelEn: '3-D Area' },
      { id: '3dStackedArea', labelEs: 'Área 3D Apilada', labelEn: '3-D Stacked Area' },
      { id: '3dPercentStackedArea', labelEs: 'Área 3D 100% Apilada', labelEn: '3-D 100% Stacked Area' },
    ],
  },
  {
    id: 'scatter',
    labelEs: 'Dispersión (XY)',
    labelEn: 'Scatter',
    icon: 'chart-scatter',
    subTypes: [
      { id: 'scatter', labelEs: 'Dispersión (Puntos)', labelEn: 'Scatter' },
      { id: 'scatterSmoothLinesMarkers', labelEs: 'Líneas Suaves con Marcadores', labelEn: 'Smooth Lines with Markers' },
      { id: 'scatterSmoothLines', labelEs: 'Líneas Suaves', labelEn: 'Smooth Lines' },
      { id: 'scatterStraightLinesMarkers', labelEs: 'Líneas Rectas con Marcadores', labelEn: 'Straight Lines with Markers' },
      { id: 'scatterStraightLines', labelEs: 'Líneas Rectas', labelEn: 'Straight Lines' },
      { id: 'bubble', labelEs: 'Burbujas', labelEn: 'Bubble' },
      { id: '3dBubble', labelEs: 'Burbujas 3D', labelEn: '3-D Bubble' },
    ],
  },
  {
    id: 'map',
    labelEs: 'Mapa',
    labelEn: 'Map',
    icon: 'globe',
    subTypes: [
      { id: 'filledMap', labelEs: 'Mapa Coroplético', labelEn: 'Filled Map' },
    ],
  },
  {
    id: 'stock',
    labelEs: 'Cotizaciones',
    labelEn: 'Stock',
    icon: 'candlestick-chart',
    subTypes: [
      { id: 'highLowClose', labelEs: 'Máx, Mín y Cierre', labelEn: 'High-Low-Close' },
      { id: 'openHighLowClose', labelEs: 'Apertura, Máx, Mín y Cierre', labelEn: 'Open-High-Low-Close' },
      { id: 'volumeHighLowClose', labelEs: 'Volumen, Máx, Mín y Cierre', labelEn: 'Volume-High-Low-Close' },
      { id: 'volumeOpenHighLowClose', labelEs: 'Volumen, Aper, Máx, Mín y Cierre', labelEn: 'Volume-Open-High-Low-Close' },
    ],
  },
  {
    id: 'surface',
    labelEs: 'Superficie',
    labelEn: 'Surface',
    icon: 'layers',
    subTypes: [
      { id: 'surface3d', labelEs: 'Superficie 3D', labelEn: '3-D Surface' },
      { id: 'wireframe3dSurface', labelEs: 'Superficie 3D Alámbrica', labelEn: 'Wireframe 3-D Surface' },
      { id: 'contour', labelEs: 'Contorno', labelEn: 'Contour' },
      { id: 'wireframeContour', labelEs: 'Contorno Alámbrico', labelEn: 'Wireframe Contour' },
    ],
  },
  {
    id: 'radar',
    labelEs: 'Radial',
    labelEn: 'Radar',
    icon: 'hexagon',
    subTypes: [
      { id: 'radar', labelEs: 'Radial', labelEn: 'Radar' },
      { id: 'radarMarkers', labelEs: 'Radial con Marcadores', labelEn: 'Radar with Markers' },
      { id: 'filledRadar', labelEs: 'Radial Relleno', labelEn: 'Filled Radar' },
    ],
  },
  {
    id: 'treemap',
    labelEs: 'Jerarquía (Treemap)',
    labelEn: 'Treemap',
    icon: 'layout-grid',
    subTypes: [
      { id: 'treemap', labelEs: 'Mapa de Rectángulos', labelEn: 'Treemap' },
    ],
  },
  {
    id: 'sunburst',
    labelEs: 'Proyección Solar',
    labelEn: 'Sunburst',
    icon: 'sun',
    subTypes: [
      { id: 'sunburst', labelEs: 'Proyección Solar (Sunburst)', labelEn: 'Sunburst' },
    ],
  },
  {
    id: 'histogram',
    labelEs: 'Histograma',
    labelEn: 'Histogram',
    icon: 'bar-chart-2',
    subTypes: [
      { id: 'histogram', labelEs: 'Histograma', labelEn: 'Histogram' },
      { id: 'pareto', labelEs: 'Diagrama de Pareto', labelEn: 'Pareto' },
    ],
  },
  {
    id: 'boxWhisker',
    labelEs: 'Cajas y Bigotes',
    labelEn: 'Box & Whisker',
    icon: 'sliders',
    subTypes: [
      { id: 'boxWhisker', labelEs: 'Cajas y Bigotes', labelEn: 'Box and Whisker' },
    ],
  },
  {
    id: 'waterfall',
    labelEs: 'Cascada',
    labelEn: 'Waterfall',
    icon: 'arrow-down-up',
    subTypes: [
      { id: 'waterfall', labelEs: 'Cascada', labelEn: 'Waterfall' },
    ],
  },
  {
    id: 'funnel',
    labelEs: 'Embudo',
    labelEn: 'Funnel',
    icon: 'filter',
    subTypes: [
      { id: 'funnel', labelEs: 'Embudo (Funnel)', labelEn: 'Funnel' },
    ],
  },
  {
    id: 'combo',
    labelEs: 'Cuadro Combinado',
    labelEn: 'Combo',
    icon: 'combine',
    subTypes: [
      { id: 'comboClusteredColumnLine', labelEs: 'Columna Agrupada - Línea', labelEn: 'Clustered Column - Line' },
    ],
  },
];

@Component({
  selector: 'app-excel-chart-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ExcelChartRendererComponent],
  providers: [
    provideLucideIcons(
      LucideBarChart2,
      LucideTrendingUp,
      LucidePieChart,
      LucideAlignLeft,
      LucideActivity,
      LucideChartScatter,
      LucideGlobe,
      LucideCandlestickChart,
      LucideLayers,
      LucideHexagon,
      LucideLayoutGrid,
      LucideSun,
      LucideSliders,
      LucideArrowDownUp,
      LucideFilter,
      LucideCombine,
      LucideX,
      LucideCheck, LucideRotateCcw, LucideFolder
    ),
  ],
  templateUrl: './excel-chart-modal.component.html',
  styleUrls: ['./excel-chart-modal.component.scss'],
})
export class ExcelChartModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog!: ElementRef<HTMLElement>;
  private readonly document = inject(DOCUMENT);
  private previousFocus: HTMLElement | null = null;
  @Input() dataRevision = 0;
  @Input({ required: true }) grid: SheetGrid = {};
  @Input() range?: SelectionRange;
  @Input() dataConfig?: ChartDataConfig;
  @Input() appearance?: ChartAppearance;
  @Input() seriesColors?: Record<string, string>;
  @Input() initialTab: 'recommended' | 'all' = 'all';
  @Input() initialCategory: ChartCategory = 'column';
  @Input() initialSubType: ChartSubType = 'clusteredColumn';

  @Output() selectChart = new EventEmitter<{ category: ChartCategory; subType: ChartSubType }>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly categories = CHART_CATEGORIES_DEF;
  activeTab: 'recommended' | 'all' = 'all';
  readonly recommendedCategories = this.categories.filter(c => ['column', 'line', 'pie', 'bar', 'area', 'scatter'].includes(c.id));

  get currentSubTypeDef() {
    return this.currentCategoryDef?.subTypes.find(s => s.id === this.activeSubType);
  }

  activeCategory: ChartCategory = 'column';
  activeSubType: ChartSubType = 'clusteredColumn';

  ngAfterViewInit(): void {
    this.previousFocus = this.document.activeElement as HTMLElement | null;
    this.dialog.nativeElement.focus();
  }

  ngOnDestroy(): void {
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close.emit();
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (this.document.activeElement === first || this.document.activeElement === this.dialog.nativeElement)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && (this.document.activeElement === last || this.document.activeElement === this.dialog.nativeElement)) {
      event.preventDefault(); first?.focus();
    }
  }

  ngOnInit(): void {
    this.activeTab = this.initialTab;
    this.activeCategory = this.initialCategory;
    this.activeSubType = this.currentCategoryDef?.subTypes.some(s => s.id === this.initialSubType)
      ? this.initialSubType : this.currentCategoryDef!.subTypes[0].id;
  }

  get currentCategoryDef(): ChartCategoryDef | undefined {
    return this.categories.find((c) => c.id === this.activeCategory);
  }

  selectCategory(cat: ChartCategory): void {
    this.activeCategory = cat;
    const def = this.categories.find((c) => c.id === cat);
    if (def && def.subTypes.length > 0) {
      this.activeSubType = def.subTypes[0].id;
    }
  }

  handleConfirm(): void {
    this.selectChart.emit({
      category: this.activeCategory,
      subType: this.activeSubType,
    });
    this.close.emit();
  }
}
