import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { EmbeddedChart, FloatingArtwork, Sheet, SheetGrid } from '../../models/excel.model';
import {
  hitTestFloatingArtwork,
  isArtworkInViewport,
  paintArtworkListOnCanvas,
} from '../../services/artwork-canvas-renderer';
import {
  ChartPlotState,
  hitTestChartPlot,
  hitTestEmbeddedChartCard,
  isChartInViewport,
  paintEmbeddedChartCard,
} from '../../services/chart-canvas-renderer';
import { buildChartPlotState } from '../../services/chart-plot-builder';

export interface CanvasObjectsLayerHost {
  readonly activeSheet: Sheet;
  readonly selectedChartId: string | null;
  selectedArtworkId: string | null;
  readonly isDarkMode: boolean;
  readonly currentZoom: () => number;
  readonly formulaWorkbookRevision: number;
  readonly renderRevision?: number;
  chartGrid(ch: EmbeddedChart): SheetGrid;
  getChartTypeLabel(ch: EmbeddedChart): string;
  getChartRangeString(range: EmbeddedChart['range']): string;
  selectChartOnly(id: string): void;
  selectArtworkOnly(id: string): void;
  clearInkSelection(): void;
  beginDragChart(ch: EmbeddedChart, event: MouseEvent): void;
  beginResizeChart(ch: EmbeddedChart, handle: 'se' | 'sw' | 'ne' | 'nw' | 's' | 'e' | 'w' | 'n', event: MouseEvent): void;
  openChangeChartType(ch: EmbeddedChart, event: MouseEvent): void;
  openChartDataModal?(ch: EmbeddedChart): void;
  deleteChartById(id: string): void;
  beginArtworkChange(): void;
  updateArtwork(item: FloatingArtwork, geometry: Pick<FloatingArtwork, 'x' | 'y' | 'width' | 'height'>): void;
  finishArtworkChange(): void;
  removeArtwork(id: string): void;
}

const HANDLE_CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  type: 'pointer',
  delete: 'pointer',
  header: 'move',
  plot: 'default',
  body: 'default',
};

/**
 * Sticky viewport Canvas layer that paints and hit-tests all viewport-visible
 * embedded charts and floating shapes/icons, skipping off-screen objects.
 */
@Component({
  selector: 'app-excel-canvas-objects-layer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #objectsCanvas
      class="block pointer-events-none select-none"
      aria-hidden="true"
      [attr.data-visible-charts]="visibleChartsCount()"
      [attr.data-visible-artwork]="visibleArtworkCount()"
    ></canvas>
    @if (hoveredTooltip(); as tip) {
      <div
        class="chart-canvas-tooltip absolute pointer-events-none z-50 px-2.5 py-1.5 rounded-md shadow-xl text-[11px] border flex flex-col gap-0.5 -translate-x-1/2 -translate-y-full"
        [style.left.px]="tip.x * (host?.currentZoom() || zoom || 1)"
        [style.top.px]="tip.y * (host?.currentZoom() || zoom || 1) - 8"
        [class.bg-[#252525]]="isDark"
        [class.border-[#444]]="isDark"
        [class.text-white]="isDark"
        [class.bg-white]="!isDark"
        [class.border-slate-300]="!isDark"
        [class.text-slate-800]="!isDark"
      >
        <span class="font-semibold text-[10px] opacity-75">{{ tip.label }}</span>
        <div class="flex items-center gap-1.5 font-medium">
          <span class="w-2.5 h-2.5 rounded-full inline-block" [style.background-color]="tip.color"></span>
          <span>{{ tip.series }}:</span>
          <span class="font-mono font-bold">{{ tip.val.toLocaleString('es-ES') }}</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 33;
      pointer-events: none;
    }
  `],
})
export class ExcelCanvasObjectsLayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) host!: CanvasObjectsLayerHost;
  @Input() scrollLeft = 0;
  @Input() scrollTop = 0;
  @Input() viewportWidth = 1100;
  @Input() viewportHeight = 600;
  @Input() zoom = 1;
  @Input() isDark = false;
  @Input() renderRevision = 0;
  @Input() selectedChartId: string | null = null;
  @Input() selectedArtworkId: string | null = null;

  @ViewChild('objectsCanvas') set objectsCanvas(el: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = el?.nativeElement;
    if (this.canvasEl) this.renderNow();
  }

  readonly visibleChartsCount = signal(0);
  readonly visibleArtworkCount = signal(0);
  readonly hoveredTooltip = signal<{
    x: number;
    y: number;
    label: string;
    series: string;
    val: number;
    color: string;
  } | null>(null);

  private canvasEl?: HTMLCanvasElement;
  private disposed = false;
  private plotCache = new Map<string, { sig: string; state: ChartPlotState }>();
  private artworkDrag?: {
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    resize: boolean;
  };

  private readonly onWindowArtworkMove = (event: MouseEvent) => {
    const drag = this.artworkDrag;
    if (!drag) return;
    const item = (this.host.activeSheet.artwork || []).find((a) => a.id === drag.id);
    if (!item) return;
    const z = this.host.currentZoom() || 1;
    const dx = (event.clientX - drag.startX) / z;
    const dy = (event.clientY - drag.startY) / z;
    this.host.updateArtwork(
      item,
      drag.resize
        ? { x: drag.origX, y: drag.origY, width: Math.max(24, drag.origW + dx), height: Math.max(24, drag.origH + dy) }
        : { x: Math.max(0, drag.origX + dx), y: Math.max(0, drag.origY + dy), width: drag.origW, height: drag.origH }
    );
    this.renderNow();
  };

  private readonly onWindowArtworkUp = () => {
    if (!this.artworkDrag) return;
    this.artworkDrag = undefined;
    this.unbindArtworkWindow();
    this.host.finishArtworkChange();
    this.renderNow();
  };

  ngAfterViewInit(): void {
    this.renderNow();
  }

  ngOnChanges(): void {
    this.renderNow();
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.unbindArtworkWindow();
  }

  private getPlotState(ch: EmbeddedChart): ChartPlotState {
    const sig = JSON.stringify([
      this.host.formulaWorkbookRevision,
      this.host.isDarkMode,
      ch.category,
      ch.subType,
      ch.range,
      ch.dataConfig,
      ch.seriesColors,
      ch.colorPalette,
      ch.width,
      ch.height,
    ]);
    const cached = this.plotCache.get(ch.id);
    if (cached && cached.sig === sig) return cached.state;
    const state = buildChartPlotState(
      this.host.chartGrid(ch),
      ch,
      this.host.isDarkMode,
      Math.max(40, (ch.width || 480) - 16),
      Math.max(40, (ch.height || 300) - 60)
    );
    this.plotCache.set(ch.id, { sig, state });
    return state;
  }

  private getLegendKeys(ch: EmbeddedChart, state: ChartPlotState): string[] {
    if (state.category === 'scatter') {
      return ch.dataConfig ? state.seriesKeys : [state.seriesKeys[1] || state.seriesKeys[0]].filter(Boolean);
    }
    if (['pie', 'sunburst', 'treemap'].includes(state.category)) {
      return state.rows.map((r) => String(r['name']));
    }
    if (['combo', 'stock', 'boxWhisker'].includes(state.category) || state.subType === 'pareto') {
      return state.seriesKeys.slice(0, 2);
    }
    return state.seriesKeys;
  }

  renderNow(): void {
    if (this.disposed || !this.host) return;
    const canvas = this.canvasEl;
    const z = this.host?.currentZoom() || this.zoom || 1;
    const vw = Math.max(1, this.viewportWidth);
    const vh = Math.max(1, this.viewportHeight);
    const cssW = Math.max(1, Math.round(vw * z));
    const cssH = Math.max(1, Math.round(vh * z));

    const visibleCharts = (this.host.activeSheet.charts || []).filter((ch) =>
      isChartInViewport(ch, this.scrollLeft, this.scrollTop, vw, vh)
    );
    const visibleArtwork = (this.host.activeSheet.artwork || []).filter((art) =>
      isArtworkInViewport(art, this.scrollLeft, this.scrollTop, vw, vh)
    );
    this.visibleChartsCount.set(visibleCharts.length);
    this.visibleArtworkCount.set(visibleArtwork.length);

    if (!canvas) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    const backingScale = dpr * z;
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(backingScale, backingScale);
    ctx.clearRect(0, 0, vw, vh);

    if (visibleCharts.length > 0 || visibleArtwork.length > 0) {
      ctx.translate(-this.scrollLeft, -this.scrollTop);

      for (const ch of visibleCharts) {
        const plotState = this.getPlotState(ch);
        paintEmbeddedChartCard(ctx, {
          chart: ch,
          typeLabel: this.host.getChartTypeLabel(ch),
          rangeLabel: this.host.getChartRangeString(ch.range),
          plotState,
          legendKeys: this.getLegendKeys(ch, plotState),
          selected: this.host.selectedChartId === ch.id,
          isDark: this.host.isDarkMode,
        });
      }

      if (visibleArtwork.length > 0) {
        paintArtworkListOnCanvas(ctx, visibleArtwork, this.host.selectedArtworkId, {
          isDark: this.host.isDarkMode,
        });
      }
    }

    ctx.restore();
  }

  handleWorldMouseDown(worldX: number, worldY: number, event: MouseEvent): boolean {
    if (!this.host) return false;
    const visibleArtwork = (this.host.activeSheet.artwork || []).filter((art) =>
      isArtworkInViewport(art, this.scrollLeft, this.scrollTop, this.viewportWidth, this.viewportHeight)
    );
    const artHit = hitTestFloatingArtwork(worldX, worldY, visibleArtwork, this.host.selectedArtworkId);
    if (artHit) {
      event.preventDefault();
      event.stopPropagation();
      this.host.clearInkSelection();
      if (artHit.part === 'delete') {
        this.host.removeArtwork(artHit.artwork.id);
        this.renderNow();
        return true;
      }
      this.host.selectArtworkOnly(artHit.artwork.id);
      this.host.beginArtworkChange();
      this.artworkDrag = {
        id: artHit.artwork.id,
        startX: event.clientX,
        startY: event.clientY,
        origX: artHit.artwork.x,
        origY: artHit.artwork.y,
        origW: artHit.artwork.width,
        origH: artHit.artwork.height,
        resize: artHit.part === 'resize',
      };
      this.bindArtworkWindow();
      this.renderNow();
      return true;
    }

    const visibleCharts = (this.host.activeSheet.charts || []).filter((ch) =>
      isChartInViewport(ch, this.scrollLeft, this.scrollTop, this.viewportWidth, this.viewportHeight)
    );
    for (let i = visibleCharts.length - 1; i >= 0; i--) {
      const ch = visibleCharts[i];
      const plotState = this.getPlotState(ch);
      const legendKeys = this.getLegendKeys(ch, plotState);
      const selected = this.host.selectedChartId === ch.id;
      const hit = hitTestEmbeddedChartCard(worldX, worldY, ch, selected, legendKeys.length > 0);
      if (!hit) continue;

      event.preventDefault();
      event.stopPropagation();
      this.host.clearInkSelection();
      this.host.selectChartOnly(ch.id);

      if (hit.part === 'delete') {
        this.host.deleteChartById(ch.id);
      } else if (hit.part === 'type') {
        this.host.openChangeChartType(ch, event);
      } else if (hit.part === 'header') {
        this.host.beginDragChart(ch, event);
      } else if (
        hit.part === 'nw' ||
        hit.part === 'ne' ||
        hit.part === 'sw' ||
        hit.part === 'se' ||
        hit.part === 'n' ||
        hit.part === 's' ||
        hit.part === 'e' ||
        hit.part === 'w'
      ) {
        this.host.beginResizeChart(ch, hit.part, event);
      }
      this.renderNow();
      return true;
    }

    return false;
  }

  handleWorldMouseMove(worldX: number, worldY: number): { handled: boolean; cursor?: string } {
    if (!this.host) return { handled: false };
    const visibleArtwork = (this.host.activeSheet.artwork || []).filter((art) =>
      isArtworkInViewport(art, this.scrollLeft, this.scrollTop, this.viewportWidth, this.viewportHeight)
    );
    const artHit = hitTestFloatingArtwork(worldX, worldY, visibleArtwork, this.host.selectedArtworkId);
    if (artHit) {
      this.hoveredTooltip.set(null);
      return {
        handled: true,
        cursor: artHit.part === 'delete' ? 'pointer' : artHit.part === 'resize' ? 'nwse-resize' : 'move',
      };
    }

    const visibleCharts = (this.host.activeSheet.charts || []).filter((ch) =>
      isChartInViewport(ch, this.scrollLeft, this.scrollTop, this.viewportWidth, this.viewportHeight)
    );
    for (let i = visibleCharts.length - 1; i >= 0; i--) {
      const ch = visibleCharts[i];
      const plotState = this.getPlotState(ch);
      const legendKeys = this.getLegendKeys(ch, plotState);
      const selected = this.host.selectedChartId === ch.id;
      const hit = hitTestEmbeddedChartCard(worldX, worldY, ch, selected, legendKeys.length > 0);
      if (!hit) continue;

      if (hit.part === 'plot' && hit.plotX !== undefined && hit.plotY !== undefined && hit.plotW && hit.plotH) {
        const ptHit = hitTestChartPlot(hit.plotX, hit.plotY, plotState, hit.plotW, hit.plotH);
        if (ptHit) {
          this.hoveredTooltip.set({
            x: Math.max(75, Math.min(this.viewportWidth - 75, worldX - this.scrollLeft)),
            y: Math.max(60, worldY - this.scrollTop),
            label: ptHit.label,
            series: ptHit.series,
            val: ptHit.val,
            color: ptHit.color,
          });
          return { handled: true, cursor: 'pointer' };
        }
      }

      this.hoveredTooltip.set(null);
      return { handled: true, cursor: HANDLE_CURSORS[hit.part] || 'default' };
    }

    if (this.hoveredTooltip()) this.hoveredTooltip.set(null);
    return { handled: false };
  }

  handleWorldDoubleClick(worldX: number, worldY: number): boolean {
    if (!this.host) return false;
    const visibleCharts = (this.host.activeSheet.charts || []).filter((ch) =>
      isChartInViewport(ch, this.scrollLeft, this.scrollTop, this.viewportWidth, this.viewportHeight)
    );
    for (let i = visibleCharts.length - 1; i >= 0; i--) {
      const ch = visibleCharts[i];
      const plotState = this.getPlotState(ch);
      const legendKeys = this.getLegendKeys(ch, plotState);
      const hit = hitTestEmbeddedChartCard(
        worldX,
        worldY,
        ch,
        this.host.selectedChartId === ch.id,
        legendKeys.length > 0
      );
      if (hit && hit.part !== 'delete') {
        this.host.selectChartOnly(ch.id);
        this.host.openChartDataModal?.(ch);
        return true;
      }
    }
    return false;
  }

  clearHover(): void {
    if (this.hoveredTooltip()) this.hoveredTooltip.set(null);
  }

  private bindArtworkWindow(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('mousemove', this.onWindowArtworkMove);
    window.addEventListener('mouseup', this.onWindowArtworkUp);
  }

  private unbindArtworkWindow(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('mousemove', this.onWindowArtworkMove);
    window.removeEventListener('mouseup', this.onWindowArtworkUp);
  }
}
