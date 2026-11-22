import { ChartAppearance, ChartCategory, ChartDataConfig, ChartSubType, EmbeddedChart, SelectionRange, SheetGrid } from '../models/excel.model';

export interface ChartHitItem {
  kind: 'point' | 'axis';
  label: string;
  series: string;
  val: number;
  color: string;
  x: number;
  y: number;
  axisIndex?: number;
  axisX?: number;
  axisValues?: { key: string; value: number; color: string }[];
}

export interface ChartPlotState {
  category: ChartCategory;
  subType: ChartSubType;
  rows: Record<string, string | number>[];
  seriesKeys: string[];
  compact: boolean;
  isDark: boolean;
  smooth: boolean;
  markers: boolean;
  stacked: boolean;
  percent: boolean;
  axisDomain: { min: number; max: number; step: number };
  gridLines: { y: number; val: number }[];
  barGroups: { label: string; centerX: number; bars: { key: string; val: number; x: number; y: number; width: number; height: number }[] }[];
  horizontalBarGroups: { label: string; centerY: number; bars: { key: string; val: number; x: number; y: number; width: number; height: number }[] }[];
  lineSeries: { key: string; points: { x: number; y: number; val: number; label: string }[]; colorIndex: number }[];
  areaSeries: { key: string; points: { x: number; y: number; baseY: number; val: number; label: string }[] }[];
  pieSlices: { label: string; val: number; pct: number; startAngle?: number; endAngle?: number; innerRadius?: number; outerRadius?: number }[];
  scatterPoints: { x: number; y: number; val: number; xVal: number; label: string; series: string; colorIdx: number }[];
  radarData: {
    spokes: { x: number; y: number; lx: number; ly: number; label: string }[];
    series: { key: string; colorIdx: number; pts: { val: number; label: string; x: number; y: number }[] }[];
  };
  treemapTiles: { x: number; y: number; w: number; h: number; label: string; val: number; colorIdx: number }[];
  visibleXLabels: { x: number; text: string; anchor: string }[];
  scatterAxisLabels: { x: number; xVal: number }[];
  getColor: (index: number) => string;
  valueOfRow: (row: Record<string, string | number>, key: string) => number;
  activeAxisHover?: { x: number } | null;
  progress?: number;
}

export interface ChartViewportGeometry {
  cartesian: boolean;
  plotLeft: number;
  plotBottom: number;
  scaleX: number;
  scaleY: number;
  x: (v: number) => number;
  y: (v: number) => number;
  w: (v: number) => number;
  h: (v: number) => number;
}

export function isPieChartCategory(category: ChartCategory): boolean {
  return category === 'pie' || category === 'sunburst';
}

export function isRadarChartCategory(category: ChartCategory): boolean {
  return category === 'radar';
}

export function isTreemapChartCategory(category: ChartCategory): boolean {
  return category === 'treemap';
}

export function computeChartViewport(category: ChartCategory, width: number, height: number): ChartViewportGeometry {
  const safeW = Math.max(40, width || 500);
  const safeH = Math.max(40, height || 240);
  const cartesian = !isPieChartCategory(category) && !isRadarChartCategory(category) && !isTreemapChartCategory(category);
  const plotLeft = Math.min(70, safeW * 0.32);
  const plotBottom = Math.max(35, safeH - 26);
  const scaleX = Math.max(1, safeW - plotLeft - 16) / 425;
  const scaleY = Math.max(1, plotBottom - 10) / 175;
  return {
    cartesian,
    plotLeft,
    plotBottom,
    scaleX,
    scaleY,
    x: (val: number) => (cartesian ? plotLeft + (val - 55) * scaleX : val * (safeW / 500)),
    y: (val: number) => {
      if (!cartesian) return val * (safeH / 240);
      return val === 218 ? plotBottom + 17 : 10 + (val - 25) * scaleY;
    },
    w: (val: number) => (cartesian ? val * scaleX : val * (safeW / 500)),
    h: (val: number) => (cartesian ? val * scaleY : val * (safeH / 240)),
  };
}

function truncateText(str: unknown, len: number): string {
  const s = String(str ?? '');
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function traceSmoothOrLinearPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  smooth: boolean
): void {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!valid.length) return;
  ctx.moveTo(valid[0].x, valid[0].y);
  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const curr = valid[i];
    if (smooth) {
      const mid = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(mid, prev.y, mid, curr.y, curr.x, curr.y);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function paintChartPlot(
  ctx: CanvasRenderingContext2D,
  state: ChartPlotState,
  width: number,
  height: number,
  backingScale = 1
): void {
  const safeW = Math.max(40, width);
  const safeH = Math.max(40, height);
  ctx.save();
  if (backingScale !== 1) {
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
  }
  ctx.clearRect(0, 0, safeW, safeH);
  if (state.rows.length > 0) {
    paintChartPlotLocal(ctx, state, safeW, safeH);
  }
  ctx.restore();
}

/** Paint plot preserving the current Canvas transform (used both standalone and inside cards/PDF). */
export function paintChartPlotLocal(
  ctx: CanvasRenderingContext2D,
  state: ChartPlotState,
  width: number,
  height: number
): void {
  const safeW = Math.max(40, width);
  const safeH = Math.max(40, height);
  const geom = computeChartViewport(state.category, safeW, safeH);
  const prog = Math.max(0.05, Math.min(1, state.progress ?? 1));

  const isColumn = ['column', 'histogram', 'waterfall', 'map'].includes(state.category) && state.subType !== 'pareto';
  const isBar = state.category === 'bar';
  const isFunnel = state.category === 'funnel';
  const isLine = state.category === 'line';
  const isArea = state.category === 'area' || state.category === 'surface';
  const isPie = isPieChartCategory(state.category);
  const isScatter = state.category === 'scatter';
  const isRadar = isRadarChartCategory(state.category);
  const isTreemap = isTreemapChartCategory(state.category);
  const isCombo = ['combo', 'stock', 'boxWhisker'].includes(state.category) || state.subType === 'pareto';

  if (state.rows.length === 0) return;

  const labelColor = state.isDark ? '#cbd5e1' : '#475569';
  const tickColor = state.isDark ? '#9ca3af' : '#6b7280';
  const gridColor = state.isDark ? '#374151' : '#e5e7eb';
  const axisColor = state.isDark ? '#4b5563' : '#cbd5e1';

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, safeW, safeH);
  ctx.clip();

  // Standard Cartesian Gridlines & Axes
  if (!isPie && !isRadar && !isTreemap) {
    ctx.save();
    for (const line of state.gridLines) {
      const ly = geom.y(line.y);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(geom.x(50), ly);
      ctx.lineTo(geom.x(480), ly);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = tickColor;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(line.val), geom.x(55) - 6, ly);
    }

    if (!isBar && !isFunnel) {
      ctx.strokeStyle = state.isDark ? '#6b7280' : '#a3a3a3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(geom.x(55), geom.y(25));
      ctx.lineTo(geom.x(55), geom.y(200));
      ctx.stroke();
    }

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(geom.x(50), geom.y(200));
    ctx.lineTo(geom.x(480), geom.y(200));
    ctx.stroke();
    ctx.restore();
  }

  // 1. Columns / Combo Bars
  if (isColumn || isCombo) {
    const baselineY = geom.y(200);
    for (const group of state.barGroups) {
      group.bars.forEach((bar, bIdx) => {
        const bx = geom.x(bar.x);
        const targetY = geom.y(bar.y);
        const fullH = Math.max(2, geom.h(bar.height));
        const bh = Math.min(fullH, Math.max(2, fullH * prog));
        const by = targetY <= baselineY ? baselineY - Math.max(2, (baselineY - targetY) * prog) : targetY;
        const bw = Math.max(2, geom.w(bar.width));
        ctx.fillStyle = state.getColor(bIdx);
        roundRectPath(ctx, bx, by, bw, bh, 2);
        ctx.fill();
      });
      ctx.fillStyle = labelColor;
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(truncateText(group.label, 12), geom.x(group.centerX), geom.y(218));
    }
  }

  // 2. Horizontal Bars / Funnel
  if (isBar || isFunnel) {
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(geom.x(90), geom.y(20));
    ctx.lineTo(geom.x(90), geom.y(200));
    ctx.stroke();

    for (const group of state.horizontalBarGroups) {
      ctx.fillStyle = labelColor;
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncateText(group.label, 12), geom.x(84), geom.y(group.centerY));

      group.bars.forEach((bar, bIdx) => {
        ctx.fillStyle = state.getColor(bIdx);
        roundRectPath(
          ctx,
          geom.x(bar.x),
          geom.y(bar.y),
          Math.max(2, geom.w(bar.width) * prog),
          Math.max(2, geom.h(bar.height)),
          2
        );
        ctx.fill();
      });
    }
  }

  // 3. Line & Combo overlay
  if (isLine || isCombo) {
    for (const series of state.lineSeries) {
      const scaledPts = series.points.map((pt) => ({ x: geom.x(pt.x), y: geom.y(pt.y), raw: pt }));
      const color = state.getColor(series.colorIndex);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      traceSmoothOrLinearPath(ctx, scaledPts, state.smooth);
      ctx.stroke();

      if (state.markers || isCombo) {
        for (const pt of scaledPts) {
          ctx.fillStyle = color;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (!isCombo) {
      ctx.fillStyle = labelColor;
      ctx.font = '9.5px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      for (const lbl of state.visibleXLabels) {
        ctx.textAlign = lbl.anchor === 'end' ? 'right' : 'center';
        ctx.fillText(truncateText(lbl.text, 14), geom.x(lbl.x), geom.y(218));
      }
    }
  }

  // 4. Area / Surface
  if (isArea) {
    const wireframe = state.subType.toLowerCase().includes('wireframe');
    state.areaSeries.forEach((area, aIdx) => {
      const color = state.getColor(aIdx);
      const pts = area.points.map((p) => ({ x: geom.x(p.x), y: geom.y(p.y), baseY: geom.y(p.baseY) }));
      if (!pts.length) return;

      ctx.save();
      ctx.beginPath();
      traceSmoothOrLinearPath(ctx, pts, state.smooth);
      for (let i = pts.length - 1; i >= 0; i--) {
        ctx.lineTo(pts[i].x, pts[i].baseY);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = wireframe ? 0.12 : 0.55;
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      traceSmoothOrLinearPath(ctx, pts, state.smooth);
      ctx.stroke();
      ctx.restore();
    });

    ctx.fillStyle = labelColor;
    ctx.font = '9.5px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    for (const lbl of state.visibleXLabels) {
      ctx.textAlign = lbl.anchor === 'end' ? 'right' : 'center';
      ctx.fillText(truncateText(lbl.text, 14), geom.x(lbl.x), geom.y(218));
    }
  }

  // 5. Pie / Sunburst / Doughnut
  if (isPie) {
    const cx = safeW * 0.5;
    const cy = safeH * (110 / 240);
    const scale = Math.min(safeW / 500, safeH / 240);
    const r = Math.max(12, 90 * scale);
    const innerR = (state.subType === 'doughnut' || state.category === 'sunburst' ? 45 : 0) * scale;
    const k = state.seriesKeys[state.seriesKeys.length - 1];
    const total = state.rows.reduce((acc, row) => acc + Math.max(0, Number(row[k]) || 0), 0);
    let angle = -Math.PI / 2;

    if (total > 0) {
      state.rows.forEach((row, idx) => {
        const val = Math.max(0, Number(row[k]) || 0);
        const sweep = Math.min((val / total) * Math.PI * 2, Math.PI * 2 - 0.00001) * prog;
        const end = angle + sweep;
        ctx.save();
        ctx.beginPath();
        if (innerR > 0) {
          ctx.arc(cx, cy, r, angle, end, false);
          ctx.arc(cx, cy, innerR, end, angle, true);
          ctx.closePath();
        } else {
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, angle, end, false);
          ctx.closePath();
        }
        ctx.fillStyle = state.getColor(idx);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        angle = end;
      });
    }
  }

  // 6. Scatter / Bubble
  if (isScatter) {
    const maxV = Math.max(1, state.axisDomain.max);
    if (state.subType.toLowerCase().includes('lines')) {
      const seriesList = [...new Set(state.scatterPoints.map((p) => p.series))];
      seriesList.forEach((key, cIdx) => {
        const pts = state.scatterPoints
          .filter((p) => p.series === key)
          .map((p) => ({ x: geom.x(p.x), y: geom.y(p.y) }));
        ctx.save();
        ctx.strokeStyle = state.getColor(cIdx);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        traceSmoothOrLinearPath(ctx, pts, state.smooth);
        ctx.stroke();
        ctx.restore();
      });
    }

    const showDots = !state.subType.toLowerCase().includes('lines') || state.subType.toLowerCase().includes('markers');
    if (showDots) {
      const bubble = state.subType.toLowerCase().includes('bubble');
      for (const pt of state.scatterPoints) {
        const radius = bubble ? 5 + Math.sqrt(Math.abs(pt.val) / maxV) * 14 : 4;
        ctx.save();
        ctx.fillStyle = state.getColor(pt.colorIdx);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(geom.x(pt.x), geom.y(pt.y), radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.fillStyle = labelColor;
    ctx.font = '9.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const pt of state.scatterAxisLabels) {
      ctx.fillText(String(pt.xVal), geom.x(pt.x), geom.y(218));
    }
  }

  // 7. Radar
  if (isRadar) {
    const cx = geom.x(250);
    const cy = geom.y(125);
    ctx.save();
    for (const spoke of state.radarData.spokes) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(geom.x(spoke.x), geom.y(spoke.y));
      ctx.stroke();

      ctx.fillStyle = labelColor;
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncateText(spoke.label, 10), geom.x(spoke.lx), geom.y(spoke.ly));
    }
    for (const ser of state.radarData.series) {
      if (!ser.pts.length) continue;
      const color = state.getColor(ser.colorIdx);
      ctx.beginPath();
      ser.pts.forEach((p, idx) => {
        const px = geom.x(p.x);
        const py = geom.y(p.y);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = state.subType === 'filledRadar' ? 0.55 : 0.15;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      if (state.subType === 'radarMarkers') {
        for (const p of ser.pts) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(geom.x(p.x), geom.y(p.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // 8. Treemap
  if (isTreemap) {
    for (const tile of state.treemapTiles) {
      const tx = geom.x(tile.x);
      const ty = geom.y(tile.y);
      const tw = Math.max(4, geom.w(tile.w));
      const th = Math.max(4, geom.h(tile.h));
      ctx.save();
      roundRectPath(ctx, tx, ty, tw, th, 4);
      ctx.fillStyle = state.getColor(tile.colorIdx);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (tw > 28 && th > 16) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(truncateText(tile.label, 14), tx + 6, ty + 5);
        if (th > 28) {
          ctx.font = '9px Inter, system-ui, sans-serif';
          ctx.fillText(String(tile.val), tx + 6, ty + 18);
        }
      }
      ctx.restore();
    }
  }

  // Axis hover cursor line
  if (state.activeAxisHover && (isLine || isArea || isCombo)) {
    ctx.save();
    ctx.strokeStyle = state.isDark ? '#9ca3af' : '#a3a3a3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.activeAxisHover.x, 10);
    ctx.lineTo(state.activeAxisHover.x, geom.plotBottom);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function hitTestChartPlot(
  px: number,
  py: number,
  state: ChartPlotState,
  width: number,
  height: number
): ChartHitItem | null {
  const safeW = Math.max(40, width);
  const safeH = Math.max(40, height);
  const geom = computeChartViewport(state.category, safeW, safeH);
  const isColumn = ['column', 'histogram', 'waterfall', 'map'].includes(state.category) && state.subType !== 'pareto';
  const isBar = state.category === 'bar';
  const isFunnel = state.category === 'funnel';
  const isLine = state.category === 'line';
  const isArea = state.category === 'area' || state.category === 'surface';
  const isPie = isPieChartCategory(state.category);
  const isScatter = state.category === 'scatter';
  const isRadar = isRadarChartCategory(state.category);
  const isTreemap = isTreemapChartCategory(state.category);
  const isCombo = ['combo', 'stock', 'boxWhisker'].includes(state.category) || state.subType === 'pareto';

  if (isColumn || isCombo) {
    for (const group of state.barGroups) {
      for (let bIdx = 0; bIdx < group.bars.length; bIdx++) {
        const bar = group.bars[bIdx];
        const bx = geom.x(bar.x);
        const by = geom.y(bar.y);
        const bw = Math.max(2, geom.w(bar.width));
        const bh = Math.max(2, geom.h(bar.height));
        if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) {
          return {
            kind: 'point',
            label: group.label,
            series: bar.key,
            val: bar.val,
            color: state.getColor(bIdx),
            x: bx + bw / 2,
            y: by,
          };
        }
      }
    }
  }

  if (isBar || isFunnel) {
    for (const group of state.horizontalBarGroups) {
      for (let bIdx = 0; bIdx < group.bars.length; bIdx++) {
        const bar = group.bars[bIdx];
        const bx = geom.x(bar.x);
        const by = geom.y(bar.y);
        const bw = Math.max(2, geom.w(bar.width));
        const bh = Math.max(2, geom.h(bar.height));
        if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) {
          return {
            kind: 'point',
            label: group.label,
            series: bar.key,
            val: bar.val,
            color: state.getColor(bIdx),
            x: bx + bw / 2,
            y: by,
          };
        }
      }
    }
  }

  if (isPie) {
    const cx = safeW * 0.5;
    const cy = safeH * (110 / 240);
    const scale = Math.min(safeW / 500, safeH / 240);
    const r = Math.max(12, 90 * scale);
    const innerR = (state.subType === 'doughnut' || state.category === 'sunburst' ? 45 : 0) * scale;
    const dist = Math.hypot(px - cx, py - cy);
    if (dist <= r && dist >= innerR) {
      let theta = Math.atan2(py - cy, px - cx);
      if (theta < -Math.PI / 2) theta += Math.PI * 2;
      const k = state.seriesKeys[state.seriesKeys.length - 1];
      const total = state.rows.reduce((acc, row) => acc + Math.max(0, Number(row[k]) || 0), 0);
      let angle = -Math.PI / 2;
      for (let idx = 0; idx < state.rows.length; idx++) {
        const row = state.rows[idx];
        const val = Math.max(0, Number(row[k]) || 0);
        const sweep = total > 0 ? Math.min((val / total) * Math.PI * 2, Math.PI * 2 - 0.00001) : 0;
        if (theta >= angle && theta <= angle + sweep) {
          return {
            kind: 'point',
            label: String(row['name'] || ''),
            series: 'Valor',
            val,
            color: state.getColor(idx),
            x: px,
            y: py,
          };
        }
        angle += sweep;
      }
    }
  }

  if (isScatter) {
    for (const pt of state.scatterPoints) {
      const cx = geom.x(pt.x);
      const cy = geom.y(pt.y);
      if (Math.hypot(px - cx, py - cy) <= 10) {
        return {
          kind: 'point',
          label: pt.label,
          series: pt.series,
          val: pt.val,
          color: state.getColor(pt.colorIdx),
          x: cx,
          y: cy,
        };
      }
    }
  }

  if (isRadar) {
    for (const ser of state.radarData.series) {
      for (const p of ser.pts) {
        const cx = geom.x(p.x);
        const cy = geom.y(p.y);
        if (Math.hypot(px - cx, py - cy) <= 9) {
          return {
            kind: 'point',
            label: p.label,
            series: ser.key,
            val: p.val,
            color: state.getColor(ser.colorIdx),
            x: cx,
            y: cy,
          };
        }
      }
    }
  }

  if (isTreemap) {
    for (const tile of state.treemapTiles) {
      const tx = geom.x(tile.x);
      const ty = geom.y(tile.y);
      const tw = geom.w(tile.w);
      const th = geom.h(tile.h);
      if (px >= tx && px <= tx + tw && py >= ty && py <= ty + th) {
        return {
          kind: 'point',
          label: tile.label,
          series: 'Área',
          val: tile.val,
          color: state.getColor(tile.colorIdx),
          x: px,
          y: py,
        };
      }
    }
  }

  if (isLine || isArea || isCombo) {
    // Check explicit points first if markers/combo
    if (isLine || isCombo) {
      for (const series of state.lineSeries) {
        for (const pt of series.points) {
          const cx = geom.x(pt.x);
          const cy = geom.y(pt.y);
          if (Math.hypot(px - cx, py - cy) <= 7) {
            return {
              kind: 'point',
              label: pt.label,
              series: series.key,
              val: pt.val,
              color: state.getColor(series.colorIndex),
              x: cx,
              y: cy,
            };
          }
        }
      }
    }

    if (px >= geom.plotLeft && px <= geom.plotLeft + geom.w(425) && py >= 10 && py <= geom.plotBottom) {
      const rawPositions = isCombo
        ? state.barGroups.map((g) => g.centerX)
        : state.rows.length > 1
          ? state.rows.map((_, i) => 55 + (i * 425) / (state.rows.length - 1))
          : state.rows.length === 1
            ? [260]
            : [];
      if (rawPositions.length) {
        const index = rawPositions.reduce(
          (closest, pos, i) =>
            Math.abs(geom.x(pos) - px) < Math.abs(geom.x(rawPositions[closest]) - px) ? i : closest,
          0
        );
        const row = state.rows[index];
        const keys = isCombo ? state.seriesKeys.slice(0, 2) : state.seriesKeys;
        return {
          kind: 'axis',
          label: String(row?.['name'] || ''),
          series: keys[0] || '',
          val: row ? state.valueOfRow(row, keys[0] || '') : 0,
          color: state.getColor(0),
          x: Math.max(4, Math.min(safeW - 184, px + 12)),
          y: Math.max(4, Math.min(safeH - (38 + keys.length * 20), py + 12)),
          axisIndex: index,
          axisX: geom.x(rawPositions[index]),
          axisValues: keys.map((key) => ({
            key,
            value: row ? state.valueOfRow(row, key) : 0,
            color: state.getColor(state.seriesKeys.indexOf(key)),
          })),
        };
      }
    }
  }

  return null;
}

export interface ChartDataSummary {
  rows: Record<string, string | number>[];
  seriesKeys: string[];
  legendKeys: string[];
  plotState: ChartPlotState;
}

/** Paint a complete chart card (frame, header bar, title, Canvas plot, legend, and selection handles) for unified sheet Canvas & PDF export. */
export function paintEmbeddedChartCard(
  ctx: CanvasRenderingContext2D,
  params: {
    chart: EmbeddedChart;
    typeLabel: string;
    rangeLabel: string;
    plotState: ChartPlotState;
    legendKeys: string[];
    selected: boolean;
    isDark: boolean;
    offsetX?: number;
    offsetY?: number;
    interactiveButtons?: boolean;
  }
): void {
  const { chart, plotState, legendKeys, selected, isDark } = params;
  const x = chart.x + (params.offsetX ?? 0);
  const y = chart.y + (params.offsetY ?? 0);
  const w = Math.max(120, chart.width);
  const h = Math.max(100, chart.height);

  ctx.save();
  // Drop shadow & card background
  ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = selected ? '#059669' : isDark ? '#334155' : '#cbd5e1';
  ctx.lineWidth = selected ? 2 : 1;
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.stroke();

  // Header bar (32px)
  const headerH = 32;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + w - 10, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 10);
  ctx.lineTo(x + w, y + headerH);
  ctx.lineTo(x, y + headerH);
  ctx.lineTo(x, y + 10);
  ctx.quadraticCurveTo(x, y, x + 10, y);
  ctx.closePath();
  ctx.fillStyle = isDark ? '#262626' : '#f8f9fa';
  ctx.fill();
  ctx.strokeStyle = isDark ? '#383838' : '#e5e5e5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + headerH);
  ctx.lineTo(x + w, y + headerH);
  ctx.stroke();

  // Header label & range badge
  ctx.fillStyle = isDark ? '#e5e7eb' : '#262626';
  ctx.font = '600 11.5px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxTitleW = Math.max(40, w - 150);
  const titleText = truncateText(params.typeLabel || chart.title, Math.max(6, Math.floor(maxTitleW / 7)));
  ctx.fillText(titleText, x + 12, y + headerH / 2);

  const badgeX = x + 18 + Math.min(maxTitleW, ctx.measureText(titleText).width);
  if (badgeX + 44 < x + w - 78) {
    ctx.font = '10px monospace';
    const badgeW = Math.min(72, ctx.measureText(params.rangeLabel).width + 10);
    roundRectPath(ctx, badgeX, y + 7, badgeW, 18, 6);
    ctx.fillStyle = isDark ? 'rgba(6, 78, 59, 0.5)' : '#ecfdf5';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#065f46' : '#a7f3d0';
    ctx.stroke();
    ctx.fillStyle = isDark ? '#34d399' : '#047857';
    ctx.fillText(params.rangeLabel, badgeX + 5, y + headerH / 2);
  }

  // Action buttons (Type & Delete) in interactive Canvas mode
  if (params.interactiveButtons !== false) {
    // Type button
    const typeBtnX = x + w - 74;
    const typeBtnY = y + 6;
    roundRectPath(ctx, typeBtnX, typeBtnY, 44, 20, 6);
    ctx.fillStyle = isDark ? '#334155' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#475569' : '#d1d5db';
    ctx.stroke();
    ctx.fillStyle = isDark ? '#e2e8f0' : '#374151';
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Type', typeBtnX + 22, typeBtnY + 10.5);

    // Close button
    const delBtnX = x + w - 24;
    const delBtnY = y + 6;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText('×', delBtnX + 9, delBtnY + 10);
  }
  ctx.restore();

  // Body area
  const bodyX = x + 8;
  let bodyY = y + headerH + 6;
  const bodyW = Math.max(40, w - 16);
  let bodyH = Math.max(40, h - headerH - 14);

  const chartTitle = (chart.chartTitle || '').trim();
  const titlePos = chart.appearance?.titlePosition || 'top';
  if (chartTitle && titlePos !== 'none') {
    ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const align = chart.appearance?.titleAlign || 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const tx = align === 'left' ? bodyX + 6 : align === 'right' ? bodyX + bodyW - 6 : bodyX + bodyW / 2;
    const ty = titlePos === 'bottom' ? y + h - 14 : bodyY + 10;
    ctx.fillText(truncateText(chartTitle, 42), tx, ty);
    if (titlePos === 'top') bodyY += 20;
    bodyH -= 20;
  }

  const legendPos = chart.appearance?.legendPosition || 'bottom';
  let legendHeight = 0;
  if (legendPos !== 'none' && legendKeys.length > 0 && (legendPos === 'bottom' || legendPos === 'top')) {
    legendHeight = 20;
    const ly = legendPos === 'top' ? bodyY + 8 : bodyY + bodyH - 8;
    if (legendPos === 'top') bodyY += legendHeight;
    bodyH -= legendHeight;

    ctx.font = '500 10.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const items = legendKeys.slice(0, 6);
    const totalW = items.reduce((acc, key) => acc + Math.min(110, ctx.measureText(key).width) + 22, 0);
    let lx = bodyX + Math.max(4, (bodyW - totalW) / 2);
    items.forEach((key, idx) => {
      const col = plotState.getColor(idx);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(lx + 4, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(truncateText(key, 14), lx + 11, ly);
      lx += Math.min(110, ctx.measureText(key).width) + 22;
    });
  }

  // Paint chart plot clipped & translated inside body
  ctx.save();
  ctx.translate(bodyX, bodyY);
  if (plotState.rows.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Selecciona un rango con datos numéricos', bodyW / 2, Math.max(20, bodyH / 2));
  } else {
    const cleanState: ChartPlotState = { ...plotState, activeAxisHover: null };
    paintChartPlotLocal(ctx, cleanState, bodyW, Math.max(40, bodyH));
  }
  ctx.restore();

  // 8 resize handles if selected
  if (selected && params.interactiveButtons !== false) {
    const handles: { hx: number; hy: number; filled?: boolean }[] = [
      { hx: x, hy: y },
      { hx: x + w / 2, hy: y },
      { hx: x + w, hy: y },
      { hx: x + w, hy: y + h / 2 },
      { hx: x + w, hy: y + h, filled: true },
      { hx: x + w / 2, hy: y + h },
      { hx: x, hy: y + h },
      { hx: x, hy: y + h / 2 },
    ];
    for (const handle of handles) {
      ctx.beginPath();
      ctx.arc(handle.hx, handle.hy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = handle.filled ? '#059669' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = handle.filled ? '#ffffff' : '#059669';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

export type EmbeddedChartHitPart =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'type'
  | 'delete'
  | 'header'
  | 'plot'
  | 'body';

export interface EmbeddedChartHitResult {
  part: EmbeddedChartHitPart;
  plotX?: number;
  plotY?: number;
  plotW?: number;
  plotH?: number;
}

export function isChartInViewport(
  chart: EmbeddedChart,
  scrollLeft: number,
  scrollTop: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 48
): boolean {
  const x = chart.x ?? 100;
  const y = chart.y ?? 80;
  const w = Math.max(120, chart.width);
  const h = Math.max(100, chart.height);
  return (
    x + w + margin >= scrollLeft &&
    x - margin <= scrollLeft + viewportWidth &&
    y + h + margin >= scrollTop &&
    y - margin <= scrollTop + viewportHeight
  );
}

export function hitTestEmbeddedChartCard(
  worldX: number,
  worldY: number,
  chart: EmbeddedChart,
  selected: boolean,
  hasLegend = false
): EmbeddedChartHitResult | null {
  const x = chart.x ?? 100;
  const y = chart.y ?? 80;
  const w = Math.max(120, chart.width);
  const h = Math.max(100, chart.height);

  if (selected) {
    const handles: { part: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'; hx: number; hy: number }[] = [
      { part: 'nw', hx: x, hy: y },
      { part: 'n', hx: x + w / 2, hy: y },
      { part: 'ne', hx: x + w, hy: y },
      { part: 'e', hx: x + w, hy: y + h / 2 },
      { part: 'se', hx: x + w, hy: y + h },
      { part: 's', hx: x + w / 2, hy: y + h },
      { part: 'sw', hx: x, hy: y + h },
      { part: 'w', hx: x, hy: y + h / 2 },
    ];
    for (const handle of handles) {
      const dx = worldX - handle.hx;
      const dy = worldY - handle.hy;
      if (dx * dx + dy * dy <= 64) {
        return { part: handle.part };
      }
    }
  }

  if (worldX < x || worldX > x + w || worldY < y || worldY > y + h) {
    return null;
  }

  const headerH = 32;
  if (worldY <= y + headerH) {
    if (worldX >= x + w - 74 && worldX <= x + w - 30 && worldY >= y + 6 && worldY <= y + 26) {
      return { part: 'type' };
    }
    if (worldX >= x + w - 26 && worldX <= x + w - 4 && worldY >= y + 6 && worldY <= y + 26) {
      return { part: 'delete' };
    }
    return { part: 'header' };
  }

  const bodyX = x + 8;
  let bodyY = y + headerH + 6;
  const bodyW = Math.max(40, w - 16);
  let bodyH = Math.max(40, h - headerH - 14);
  const chartTitle = (chart.chartTitle || '').trim();
  const titlePos = chart.appearance?.titlePosition || 'top';
  if (chartTitle && titlePos !== 'none') {
    if (titlePos === 'top') bodyY += 20;
    bodyH -= 20;
  }
  const legendPos = chart.appearance?.legendPosition || 'bottom';
  if (legendPos !== 'none' && hasLegend && (legendPos === 'bottom' || legendPos === 'top')) {
    if (legendPos === 'top') bodyY += 20;
    bodyH -= 20;
  }

  if (worldX >= bodyX && worldX <= bodyX + bodyW && worldY >= bodyY && worldY <= bodyY + bodyH) {
    return {
      part: 'plot',
      plotX: worldX - bodyX,
      plotY: worldY - bodyY,
      plotW: bodyW,
      plotH: Math.max(40, bodyH),
    };
  }

  return { part: 'body' };
}
