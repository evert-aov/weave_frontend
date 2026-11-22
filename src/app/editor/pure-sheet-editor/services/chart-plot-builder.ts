import {
  ChartCategory,
  ChartDataConfig,
  ChartSubType,
  EmbeddedChart,
  SelectionRange,
  SheetGrid,
} from '../models/excel.model';
import { colIndexToLetter, evaluateCellValueCached, getCellId } from './formula-engine.service';
import type { ChartPlotState } from './chart-canvas-renderer';

export interface ExtractedSeriesData {
  rows: Record<string, string | number>[];
  seriesKeys: string[];
}

export const PALETTES: Record<string, string[]> = {
  excel: ['#2e75b6', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e'],
  monochrome: ['#1f4e78', '#2e75b6', '#5b9bd5', '#9bc2e6', '#bdd7ee', '#deebf7'],
  warm: ['#c55a11', '#ed7d31', '#f4b183', '#ffc000', '#ffd966', '#a9d08e'],
  cool: ['#0070c0', '#00b0f0', '#00b050', '#7030a0', '#2f5597', '#548235'],
};

export function parseNumericValue(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim();
  str = str.replace(/[$€£¥%]/g, '').trim();
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = /^[+-]?\d{1,3}(,\d{3})+$/.test(str) ? str.replace(/,/g, '') : str.replace(',', '.');
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function isChartNumber(value: string | number): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  const text = String(value).trim().replace(/[$€£¥%\s]/g, '');
  return /\d/.test(text) && /^[+-]?[\d.,]+$/.test(text) && Number.isFinite(parseNumericValue(value));
}

export function inferChartDataConfig(grid: SheetGrid, range: SelectionRange): ChartDataConfig {
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);
  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);
  const calculation = new WeakMap();
  const read = (col: number, row: number) => evaluateCellValueCached(getCellId(col, row), grid, calculation);
  const text = (value: string | number) => value !== '' && !isChartNumber(value);
  const values = Array.from(
    { length: maxRow - minRow + (maxRow > minRow ? 0 : 1) },
    (_, i) => read(minCol, maxRow > minRow ? minRow + 1 + i : minRow)
  );
  const xColumn = maxCol > minCol && values.some(text) ? minCol : null;
  const first = xColumn === null ? minCol : minCol + 1;
  const seriesColumns = Array.from({ length: maxCol - first + 1 }, (_, i) => first + i);
  return { xColumn, seriesColumns, hasHeaders: maxRow > minRow && seriesColumns.some((col) => text(read(col, minRow))) };
}

export function extractChartDataFromGrid(
  grid: SheetGrid,
  range?: SelectionRange,
  dataConfig?: ChartDataConfig
): { rows: Record<string, any>[]; seriesKeys: string[] } {
  let minCol = range ? Math.min(range.startCol, range.endCol) : 0;
  let maxCol = range ? Math.max(range.startCol, range.endCol) : 3;
  let minRow = range ? Math.min(range.startRow, range.endRow) : 0;
  let maxRow = range ? Math.max(range.startRow, range.endRow) : 6;

  if (!range) {
    const occupied = Object.entries(grid)
      .filter(([, cell]) => cell.raw !== '')
      .map(([id]) => {
        const match = /^([A-Z]+)(\d+)$/.exec(id);
        if (!match) return null;
        let col = 0;
        for (const letter of match[1]) col = col * 26 + letter.charCodeAt(0) - 64;
        return { col: col - 1, row: Number(match[2]) - 1 };
      })
      .filter((point): point is { col: number; row: number } => point !== null);
    if (!occupied.length) return { rows: [], seriesKeys: [] };
    minCol = Math.min(...occupied.map((p) => p.col));
    maxCol = Math.max(...occupied.map((p) => p.col));
    minRow = Math.min(...occupied.map((p) => p.row));
    maxRow = Math.max(...occupied.map((p) => p.row));
  }

  const calculation = new WeakMap();
  const read = (col: number, row: number) => evaluateCellValueCached(getCellId(col, row), grid, calculation);
  const config = dataConfig || inferChartDataConfig(grid, { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });

  if (config?.orientation === 'row' || (config?.seriesRows && config.seriesRows.length > 0)) {
    const seriesRows = [...new Set(config.seriesRows || [])].filter((r) => Number.isInteger(r) && r >= minRow && r <= maxRow);
    const xRow = config.xRow !== null && config.xRow !== undefined && config.xRow >= minRow && config.xRow <= maxRow ? config.xRow : null;
    const catCols = config.seriesColumns?.length
      ? config.seriesColumns.filter((c) => Number.isInteger(c) && c >= minCol && c <= maxCol)
      : Array.from({ length: maxCol - minCol + 1 }, (_, i) => minCol + i);

    const keys: string[] = [];
    for (const row of seriesRows) {
      const base = config.seriesNames?.[row] || (read(minCol, row) !== '' ? String(read(minCol, row)) : `Fila ${row + 1}`);
      let key = base;
      let suffix = 2;
      while (keys.includes(key) || ['name', 'index', '__x'].includes(key)) key = `${base} (${suffix++})`;
      keys.push(key);
    }

    const rows: Record<string, string | number>[] = [];
    for (const [colIdx, col] of catCols.entries()) {
      const catVal = xRow !== null ? read(col, xRow) : '';
      const catName = catVal !== '' ? String(catVal) : colIndexToLetter(col);
      const item: Record<string, string | number> = {
        name: catName,
        index: colIdx,
        __x: isChartNumber(catVal) ? parseNumericValue(catVal) : colIdx + 1,
      };
      let hasNumber = false;
      for (const [rIdx, row] of seriesRows.entries()) {
        const val = read(col, row);
        item[keys[rIdx]] = isChartNumber(val) ? parseNumericValue(val) : 0;
        hasNumber ||= isChartNumber(val);
      }
      if (hasNumber || catVal !== '') rows.push(item);
    }
    return { rows, seriesKeys: keys };
  }

  const xColumn = config.xColumn !== null && config.xColumn >= minCol && config.xColumn <= maxCol ? config.xColumn : null;
  const columns = [...new Set(config.seriesColumns)].filter(
    (col) => Number.isInteger(col) && col >= minCol && col <= maxCol && col !== xColumn
  );
  const header = config.hasHeaders && maxRow > minRow;
  const keys: string[] = [];
  for (const col of columns) {
    const base =
      config.seriesNames?.[col] || (header && read(col, minRow) !== '' ? String(read(col, minRow)) : `Serie ${colIndexToLetter(col)}`);
    let key = base;
    let suffix = 2;
    while (keys.includes(key) || ['name', 'index', '__x'].includes(key)) key = `${base} (${suffix++})`;
    keys.push(key);
  }
  const rows: Record<string, string | number>[] = [];
  for (let row = minRow + (header ? 1 : 0); row <= maxRow; row++) {
    const item: Record<string, string | number> = {
      name: xColumn !== null ? String(read(xColumn, row)) : `Fila ${row + 1}`,
      index: row - minRow,
      __x: xColumn !== null && isChartNumber(read(xColumn, row)) ? parseNumericValue(read(xColumn, row)) : row - minRow + 1,
    };
    let hasNumber = false;
    for (const [index, col] of columns.entries()) {
      const value = read(col, row);
      item[keys[index]] = isChartNumber(value) ? parseNumericValue(value) : 0;
      hasNumber ||= isChartNumber(value);
    }
    if (hasNumber) rows.push(item);
  }
  return { rows, seriesKeys: keys };
}

export interface ChartColorItem {
  key: string;
  label: string;
  column: number;
  row?: number;
}

export function resolveChartSeriesColor(
  colors: Record<string, string> | undefined,
  key: string | undefined,
  palette: string | undefined,
  index: number
): string {
  const custom = key ? colors?.[key] : undefined;
  if (custom && /^#[0-9a-f]{6}$/i.test(custom)) return custom;
  const list = PALETTES[palette || 'excel'] || PALETTES['excel'];
  return list[index % list.length];
}

export function getChartColorItems(
  grid: SheetGrid,
  range: SelectionRange,
  config: ChartDataConfig | undefined,
  category: ChartCategory,
  subtype: ChartSubType,
  extracted?: ExtractedSeriesData
): ChartColorItem[] {
  const data = extracted || extractChartDataFromGrid(grid, range, config);
  const selected = config || inferChartDataConfig(grid, range);
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);
  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);

  if (selected?.orientation === 'row' || (selected?.seriesRows && selected.seriesRows.length > 0)) {
    const seriesRows = [...new Set(selected.seriesRows || [])].filter((r) => r >= minRow && r <= maxRow);
    return seriesRows.map((row, index) => ({
      key: `row:${row}`,
      row,
      column: 0,
      label: data.seriesKeys[index] || `Fila ${row + 1}`,
    }));
  }

  const columns = [...new Set(selected.seriesColumns)].filter((col) => col >= minCol && col <= maxCol && col !== selected.xColumn);
  if (['pie', 'sunburst', 'treemap'].includes(category)) {
    const column = columns[columns.length - 1];
    return column === undefined
      ? []
      : data.rows.map((row) => {
          const sourceRow = Math.min(range.startRow, range.endRow) + Number(row['index']);
          return { key: `row:${sourceRow}`, label: String(row['name']), column, row: sourceRow };
        });
  }
  let items = columns.map((column, index) => ({
    key: `column:${column}`,
    column,
    label: data.seriesKeys[index] || colIndexToLetter(column),
  }));
  if (['combo', 'stock', 'boxWhisker'].includes(category) || subtype === 'pareto') items = items.slice(0, 2);
  if (category === 'scatter' && !config) items = [items[1] || items[0]].filter(Boolean);
  return items;
}

export function buildChartPlotState(
  grid: SheetGrid,
  chart: Pick<EmbeddedChart, 'category' | 'subType' | 'range' | 'dataConfig' | 'seriesColors' | 'colorPalette'> & {
    palette?: 'excel' | 'monochrome' | 'warm' | 'cool';
  },
  isDark: boolean,
  plotWidth = 360,
  plotHeight = 200
): ChartPlotState {
  const category = chart.category || 'column';
  const subType = chart.subType || 'clusteredColumn';
  const data = extractChartDataFromGrid(grid, chart.range, chart.dataConfig);
  const { rows, seriesKeys } = data;
  const stacked = subType.toLowerCase().includes('stacked') || ['histogram', 'waterfall', 'surface'].includes(category);
  const percent = subType.toLowerCase().includes('percent');
  const markers = subType.toLowerCase().includes('markers') || subType === 'line';
  const smooth = subType.toLowerCase().includes('smooth') || subType.includes('3d') || category === 'surface';
  const isCombo = ['combo', 'stock', 'boxWhisker'].includes(category) || subType === 'pareto';
  const isScatter = category === 'scatter';
  const isFunnel = category === 'funnel';
  const colorItems = chart.range
    ? getChartColorItems(grid, chart.range, chart.dataConfig, category, subType, data)
    : [];

  const resolvedPalette = chart.colorPalette || chart.palette;
  const getColor = (idx: number) => resolveChartSeriesColor(chart.seriesColors, colorItems[idx]?.key, resolvedPalette, idx);
  const valueOfRow = (row: Record<string, string | number>, key: string): number => {
    const val = Number(row[key]) || 0;
    if (!percent) return val;
    const total = seriesKeys.reduce((sum, k) => sum + Math.abs(Number(row[k]) || 0), 0);
    return total ? (val / total) * 100 : 0;
  };

  let axisDomain = { min: 0, max: 100, step: 25 };
  if (!percent) {
    let min = 0;
    let max = 0;
    const keys =
      isScatter && !chart.dataConfig ? [seriesKeys[1] || seriesKeys[0]] : isCombo ? seriesKeys.slice(0, 2) : seriesKeys;
    for (const row of rows) {
      let positive = 0;
      let negative = 0;
      for (const key of keys) {
        const val = Number(row[key]) || 0;
        min = Math.min(min, val);
        max = Math.max(max, val);
        positive += Math.max(0, val);
        negative += Math.min(0, val);
      }
      if (stacked) {
        min = Math.min(min, negative);
        max = Math.max(max, positive);
      }
    }
    if (min !== 0 || max !== 0) {
      const lower = min < 0 ? min * 1.05 : 0;
      const upper = max > 0 ? max * 1.05 : 0;
      const rawStep = (upper - lower) / 5 || 1;
      const magnitude = 10 ** Math.floor(Math.log10(rawStep));
      const step = ([1, 2, 2.5, 5, 10].find((u) => u * magnitude >= rawStep) || 10) * magnitude;
      axisDomain = { min: Math.floor(lower / step) * step, max: Math.ceil(upper / step) * step, step };
    }
  }

  const valueY = (val: number) => 200 - ((val - axisDomain.min) / (axisDomain.max - axisDomain.min || 1)) * 175;
  const steps = Math.max(1, Math.round((axisDomain.max - axisDomain.min) / axisDomain.step));
  const gridLines = Array.from({ length: steps + 1 }, (_, i) => {
    const val = Number((axisDomain.min + ((axisDomain.max - axisDomain.min) * i) / steps).toPrecision(12));
    return { y: valueY(val), val };
  });

  const barKeys = isCombo ? seriesKeys.slice(0, 1) : seriesKeys;
  const groupW = rows.length ? 425 / rows.length : 425;
  const barW = Math.max(4, Math.min(26, (groupW - 8) / (stacked ? 1 : Math.max(1, barKeys.length))));
  const barGroups =
    !rows.length || !seriesKeys.length
      ? []
      : rows.map((r, rIdx) => {
          const groupStartX = 55 + rIdx * groupW + (groupW - barW * (stacked ? 1 : barKeys.length)) / 2;
          let positive = 0;
          let negative = 0;
          const bars = barKeys.map((k, kIdx) => {
            const v = valueOfRow(r, k);
            const base = stacked ? (v >= 0 ? positive : negative) : 0;
            if (v >= 0) positive += v;
            else negative += v;
            const startY = valueY(base);
            const endY = valueY(base + v);
            return {
              key: k,
              val: v,
              x: groupStartX + (stacked ? 0 : kIdx * barW),
              y: v >= 0 && Math.abs(endY - startY) < 2 ? startY - 2 : Math.min(startY, endY),
              width: Math.max(2, barW - 2),
              height: Math.max(2, Math.abs(endY - startY)),
            };
          });
          return {
            label: String(r['name'] || `Fila ${rIdx + 1}`),
            centerX: 55 + rIdx * groupW + groupW / 2,
            bars,
          };
        });

  const groupH = rows.length ? 170 / rows.length : 170;
  const hBarH = Math.max(4, Math.min(20, (groupH - 4) / (stacked ? 1 : Math.max(1, seriesKeys.length))));
  const hScale = 375 / (axisDomain.max - axisDomain.min || 1);
  const horizontalBarGroups =
    !rows.length || !seriesKeys.length
      ? []
      : rows.map((r, rIdx) => {
          const groupStartY = 25 + rIdx * groupH + 2;
          let positive = 0;
          let negative = 0;
          const bars = seriesKeys.map((k, kIdx) => {
            const v = valueOfRow(r, k);
            const base = stacked ? (v >= 0 ? positive : negative) : 0;
            if (v >= 0) positive += v;
            else negative += v;
            const w = Math.max(2, Math.abs(v) * hScale);
            return {
              key: k,
              val: v,
              x: isFunnel ? 95 + (375 - w) / 2 : 95 + (Math.min(base, base + v) - axisDomain.min) * hScale,
              y: groupStartY + (stacked ? 0 : kIdx * hBarH),
              width: w,
              height: Math.max(2, hBarH - 2),
            };
          });
          return {
            label: String(r['name'] || `Item ${rIdx + 1}`),
            centerY: groupStartY + ((stacked ? 1 : seriesKeys.length) * hBarH) / 2,
            bars,
          };
        });

  const lineStep = rows.length > 1 ? 425 / (rows.length - 1) : 425 / 2;
  const lineKeys = isCombo ? [seriesKeys[1] || seriesKeys[0]].filter(Boolean) : seriesKeys;
  const lineSeries =
    !rows.length || !seriesKeys.length
      ? []
      : lineKeys.map((k, keyIndex) => ({
          key: k,
          points: rows.map((r, i) => {
            const v = valueOfRow(r, k);
            const plotted = stacked ? seriesKeys.slice(0, keyIndex + 1).reduce((s, key) => s + valueOfRow(r, key), 0) : v;
            const px = isCombo ? 55 + ((i + 0.5) * 425) / rows.length : rows.length > 1 ? 55 + i * lineStep : 260;
            return { x: px, y: valueY(plotted), val: Number(r[k]) || 0, label: String(r['name'] || '') };
          }),
          colorIndex: seriesKeys.indexOf(k),
        }));

  const areaSeries = seriesKeys.map((key, keyIndex) => ({
    key,
    points: rows.map((row, index) => {
      const base = stacked ? seriesKeys.slice(0, keyIndex).reduce((s, k) => s + valueOfRow(row, k), 0) : 0;
      return {
        x: rows.length > 1 ? 55 + (index * 425) / (rows.length - 1) : 260,
        y: valueY(base + valueOfRow(row, key)),
        baseY: valueY(base),
        val: Number(row[key]) || 0,
        label: String(row['name'] || ''),
      };
    }),
  }));

  const pieKey = seriesKeys[seriesKeys.length - 1];
  const pieTotal = pieKey ? rows.reduce((acc, r) => acc + Math.max(0, Number(r[pieKey]) || 0), 0) : 0;
  let curAngle = -Math.PI / 2;
  const pieInnerR = subType === 'doughnut' || category === 'sunburst' ? 45 : 0;
  const pieSlices =
    pieTotal <= 0
      ? []
      : rows.map((row) => {
          const val = Math.max(0, Number(row[pieKey]) || 0);
          const angle = Math.min((val / pieTotal) * Math.PI * 2, Math.PI * 2 - 0.00001);
          const slice = {
            label: String(row['name'] || ''),
            val,
            pct: Math.round((val / pieTotal) * 100),
            startAngle: curAngle,
            endAngle: curAngle + angle,
            innerRadius: pieInnerR,
            outerRadius: 90,
          };
          curAngle += angle;
          return slice;
        });

  const scatterXKey = seriesKeys[0];
  const scatterYKeys = chart.dataConfig ? seriesKeys : [seriesKeys[1] || scatterXKey].filter(Boolean);
  const scatterXValues = rows.map((row, i) =>
    chart.dataConfig ? Number(row['__x']) : seriesKeys.length > 1 ? Number(row[scatterXKey]) || i + 1 : i + 1
  );
  const maxX = Math.max(1, ...scatterXValues);
  const scatterPoints =
    !rows.length || !seriesKeys.length
      ? []
      : scatterYKeys.flatMap((key, colorIdx) =>
          rows.map((row, i) => ({
            x: 55 + (scatterXValues[i] / maxX) * 425,
            y: valueY(Number(row[key]) || 0),
            val: Number(row[key]) || 0,
            xVal: scatterXValues[i],
            label: String(row['name'] || ''),
            series: key,
            colorIdx,
          }))
        );
  const scatterAxisLabels = scatterPoints.filter(
    (point, index, all) => all.findIndex((other) => other.x === point.x) === index
  );

  const radarMax = Math.max(1, axisDomain.max);
  const nRadar = rows.length || 1;
  const radarData =
    !rows.length || !seriesKeys.length
      ? { spokes: [], series: [] }
      : {
          spokes: rows.map((r, i) => {
            const angle = -Math.PI / 2 + (i / nRadar) * Math.PI * 2;
            return {
              x: 250 + Math.cos(angle) * 85,
              y: 125 + Math.sin(angle) * 85,
              lx: 250 + Math.cos(angle) * 100,
              ly: 125 + Math.sin(angle) * 100,
              label: String(r['name'] || `P${i + 1}`),
            };
          }),
          series: seriesKeys.map((k, sIdx) => ({
            key: k,
            colorIdx: sIdx,
            pts: rows.map((r, i) => {
              const v = Math.max(0, Number(r[k]) || 0);
              const rNorm = (v / radarMax) * 85;
              const angle = -Math.PI / 2 + (i / nRadar) * Math.PI * 2;
              return { val: v, label: String(r['name'] || ''), x: 250 + Math.cos(angle) * rNorm, y: 125 + Math.sin(angle) * rNorm };
            }),
          })),
        };

  const treemapTiles: ChartPlotState['treemapTiles'] = [];
  if (rows.length && seriesKeys.length) {
    const tk = seriesKeys[seriesKeys.length - 1];
    const tTotal = rows.reduce((acc, r) => acc + Math.max(0, Number(r[tk]) || 0), 0);
    if (tTotal > 0) {
      const half = Math.ceil(rows.length / 2);
      const col1 = rows.slice(0, half);
      const col2 = rows.slice(half);
      const w1 = col2.length > 0 ? 430 * 0.55 : 430;
      const w2 = 430 - w1;
      let curY = 25;
      const t1 = col1.reduce((acc, r) => acc + Math.max(0, Number(r[tk]) || 0), 0) || 1;
      col1.forEach((r, idx) => {
        const val = Math.max(0, Number(r[tk]) || 0);
        const th = (val / t1) * 190;
        treemapTiles.push({ x: 45, y: curY, w: w1 - 3, h: Math.max(14, th - 3), label: String(r['name'] || ''), val, colorIdx: idx });
        curY += th;
      });
      curY = 25;
      const t2 = col2.reduce((acc, r) => acc + Math.max(0, Number(r[tk]) || 0), 0) || 1;
      col2.forEach((r, idx) => {
        const val = Math.max(0, Number(r[tk]) || 0);
        const th = (val / t2) * 190;
        treemapTiles.push({ x: 45 + w1, y: curY, w: w2 - 3, h: Math.max(14, th - 3), label: String(r['name'] || ''), val, colorIdx: half + idx });
        curY += th;
      });
    }
  }

  const rawXLabels = rows.map((r, i) => ({
    x: rows.length > 1 ? 55 + i * lineStep : 260,
    text: String(r['name'] || `Item ${i + 1}`),
  }));
  const plotLeft = Math.min(70, plotWidth * 0.32);
  const labelW = Math.max(40, Math.min(180, Math.max(0, ...rawXLabels.map((l) => l.text.length)) * 6 + 10));
  const labelCount = Math.min(rawXLabels.length, Math.max(2, Math.floor((plotWidth - plotLeft - 16) / labelW) + 1));
  const visibleXLabels =
    labelCount < 2
      ? rawXLabels.map((l) => ({ ...l, anchor: 'middle' }))
      : Array.from({ length: labelCount }, (_, i) => {
          const idx = Math.round((i * (rawXLabels.length - 1)) / (labelCount - 1));
          return { ...rawXLabels[idx], anchor: i === labelCount - 1 ? 'end' : 'middle' };
        });

  return {
    category,
    subType,
    rows,
    seriesKeys,
    compact: false,
    isDark,
    smooth,
    markers,
    stacked,
    percent,
    axisDomain,
    gridLines,
    barGroups,
    horizontalBarGroups,
    lineSeries,
    areaSeries,
    pieSlices,
    scatterPoints,
    radarData,
    treemapTiles,
    visibleXLabels,
    scatterAxisLabels,
    getColor,
    valueOfRow,
    activeAxisHover: null,
  };
}
