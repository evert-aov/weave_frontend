import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { ChartCategory, ChartSubType, EmbeddedChart, Sheet } from '../models/excel.model';
import { parseCellId, parseWorksheetReference } from './formula-engine.service';
import { GridAxis } from './grid-viewport';

interface Xml { name: string; attrs: Record<string, string>; text: string; children: Xml[]; }
function xml(source: string): Xml {
  const root: Xml = { name: '', attrs: {}, text: '', children: [] }, stack = [root]; let count = 0;
  const parser = new SaxesParser();
  parser.on('doctype', () => { throw new Error('DOCTYPE is not supported in XLSX metadata.'); });
  parser.on('opentag', tag => { if (++count > 250000) throw new Error('XLSX metadata is too large.'); const node = { name: tag.name.split(':').at(-1)!, attrs: tag.attributes as Record<string, string>, text: '', children: [] }; stack.at(-1)!.children.push(node); stack.push(node); });
  parser.on('text', text => stack.at(-1)!.text += text);
  parser.on('closetag', () => { stack.pop(); });
  parser.write(source).close(); return root.children[0] || root;
}
const children = (node: Xml | undefined, name: string) => node?.children.filter(child => child.name === name) || [];
const child = (node: Xml | undefined, name: string) => children(node, name)[0];
function descendants(node: Xml | undefined, name: string): Xml[] { return !node ? [] : [...(node.name === name ? [node] : []), ...node.children.flatMap(c => descendants(c, name))]; }
const val = (node: Xml | undefined, key: string) => child(node, key)?.attrs['val'];
const text = (node: Xml | undefined, key: string) => child(node, key)?.text || '';
function path(base: string, target: string): string {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.replace(/^\//, '').split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
  return parts.join('/');
}
export interface XlsxMetadata { files: Record<string, Uint8Array>; parse(name: string): Xml | undefined; relations(name: string): { id: string; type: string; target: string }[]; }
export function xlsxMetadata(buffer: ArrayBuffer): XlsxMetadata {
  const files = unzipSync(new Uint8Array(buffer), { filter: file => /(?:workbook\.xml|\.rels|\/charts\/chart\d+\.xml|\/drawings\/drawing\d+\.xml)$/.test(file.name) && file.originalSize < 8 * 1024 * 1024 });
  const cache = new Map<string, Xml>();
  const parse = (name: string) => { if (!files[name]) return undefined; if (!cache.has(name)) cache.set(name, xml(strFromU8(files[name]))); return cache.get(name)!; };
  const relations = (name: string) => {
    const parts = name.split('/'), file = parts.pop()!;
    return children(parse([...parts, '_rels', file + '.rels'].join('/')), 'Relationship')
      .filter(n => n.attrs['TargetMode'] !== 'External')
      .map(n => ({ id: n.attrs['Id'], type: n.attrs['Type'], target: path(name, n.attrs['Target']) }));
  };
  return { files, parse, relations };
}
function sourceRange(formula: string, sheets: Sheet[], renamed: Map<string, string>) {
  const ref = parseWorksheetReference(formula.trim()); if (!ref?.sheetName) return undefined;
  const sheetName = renamed.get(ref.sheetName.toLowerCase()) || ref.sheetName;
  const sheet = sheets.find(s => s.name.toLowerCase() === sheetName.toLowerCase());
  const start = parseCellId(ref.start), end = parseCellId(ref.end || ref.start);
  if (!sheet || !start || !end || start.col !== end.col || end.row < start.row || end.row - start.row > 10000) return undefined;
  return { sheet, col: start.col, start: start.row, end: end.row };
}
function convertChart(node: Xml, sheets: Sheet[], renamed: Map<string, string>, palette: string[]): EmbeddedChart | undefined {
  const plot = descendants(node, 'plotArea')[0];
  const types = plot?.children.filter(n => /Chart$/.test(n.name)) || [];
  if (!types.length || types.length > 1) return undefined;
  const type = types[0], grouping = val(type, 'grouping'), stacked = grouping === 'stacked', percent = grouping === 'percentStacked';
  let category: ChartCategory, subType: ChartSubType;
  switch (type.name) {
    case 'barChart': category = val(type, 'barDir') === 'bar' ? 'bar' : 'column'; subType = category === 'bar' ? percent ? 'percentStackedBar' : stacked ? 'stackedBar' : 'clusteredBar' : percent ? 'percentStackedColumn' : stacked ? 'stackedColumn' : 'clusteredColumn'; break;
    case 'lineChart': { category = 'line'; const markers = val(type, 'marker') === '1' || descendants(type, 'symbol').some(n => n.attrs['val'] !== 'none'); subType = percent ? markers ? 'percentStackedLineMarkers' : 'percentStackedLine' : stacked ? markers ? 'stackedLineMarkers' : 'stackedLine' : markers ? 'lineMarkers' : 'line'; break; }
    case 'areaChart': category = 'area'; subType = percent ? 'percentStackedArea' : stacked ? 'stackedArea' : 'area'; break;
    case 'pieChart': category = 'pie'; subType = 'pie2d'; break;
    case 'doughnutChart': category = 'pie'; subType = 'doughnut'; break;
    case 'scatterChart': category = 'scatter'; subType = val(type, 'scatterStyle') === 'smooth' ? 'scatterSmoothLinesMarkers' : val(type, 'scatterStyle') === 'smoothMarker' ? 'scatterSmoothLinesMarkers' : val(type, 'scatterStyle') === 'line' ? 'scatterStraightLines' : val(type, 'scatterStyle') === 'lineMarker' ? 'scatterStraightLinesMarkers' : 'scatter'; break;
    case 'radarChart': category = 'radar'; subType = val(type, 'radarStyle') === 'filled' ? 'filledRadar' : val(type, 'radarStyle') === 'marker' ? 'radarMarkers' : 'radar'; break;
    default: return undefined;
  }
  const series = children(type, 'ser'); if (!series.length) return undefined;
  const sources = series.map(ser => sourceRange(descendants(child(ser, category === 'scatter' ? 'yVal' : 'val'), 'f')[0]?.text || '', sheets, renamed));
  if (sources.some(s => !s)) return undefined;
  const first = sources[0]!;
  if (sources.some(s => s!.sheet.id !== first.sheet.id || s!.start !== first.start || s!.end !== first.end)) return undefined;
  const categories = series.map(ser => { const formula = descendants(child(ser, category === 'scatter' ? 'xVal' : 'cat'), 'f')[0]?.text; return formula ? sourceRange(formula, sheets, renamed) : undefined; });
  if (categories.some(s => s && (s.sheet.id !== first.sheet.id || s.start !== first.start || s.end !== first.end || s.col !== categories[0]?.col))) return undefined;
  if (category === 'scatter' && !categories[0]) return undefined;
  if (new Set(sources.map(s => s!.col)).size !== sources.length) return undefined;
  const columns = sources.map(s => s!.col), xColumn = categories[0]?.col ?? null;
  const seriesNames: Record<number, string> = {}, colors: Record<string, string> = {};
  const fillColor = (source: Xml | undefined) => { const rgb = descendants(source, 'srgbClr')[0]?.attrs['val']; if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) return '#' + rgb; const scheme = descendants(source, 'schemeClr')[0]?.attrs['val']; const index = ['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6'].indexOf(scheme || ''); return index >= 0 ? '#' + palette[index] : undefined; };
  series.forEach((ser, i) => {
    const tx = child(ser, 'tx'), cached = descendants(tx, 'v')[0]?.text;
    const labelRef = descendants(tx, 'f')[0]?.text, labelSource = labelRef ? sourceRange(labelRef, sheets, renamed) : undefined;
    seriesNames[columns[i]] = cached || (labelSource ? labelSource.sheet.data[`${labelRef!.split('!').at(-1)!.replace(/\$/g, '')}`]?.raw : '') || `Series ${i + 1}`;
    const color = fillColor(child(ser, 'spPr')); if (color) colors[`column:${columns[i]}`] = color;
    if (category === 'pie') for (const point of children(ser, 'dPt')) { const pointColor = fillColor(child(point, 'spPr')); if (pointColor) colors[`row:${first.start + Number(val(point, 'idx') || 0)}`] = pointColor; }
  });
  const title = descendants(child(descendants(node, 'chart')[0], 'title'), 't').map(n => n.text).join('') || '';
  const legend = child(descendants(node, 'chart')[0], 'legend'), legendPosition = !legend ? 'none' : ({ r:'right', l:'left', t:'top', b:'bottom', tr:'right' } as const)[val(legend, 'legendPos') || 'b'] || 'bottom';
  return { id: crypto.randomUUID(), title: category, chartTitle: title, category, subType, sourceSheetId: first.sheet.id,
    range: { startCol: Math.min(...columns, xColumn ?? columns[0]), endCol: Math.max(...columns, xColumn ?? columns[0]), startRow: first.start, endRow: first.end },
    dataConfig: { xColumn, seriesColumns: columns, hasHeaders: false, seriesNames }, seriesColors: colors,
    appearance: { titlePosition: title ? 'top' : 'none', titleAlign: 'center', legendPosition }, colorPalette: 'excel', x: 40, y: 40, width: 600, height: 360 };
}
export function importChartMetadata(meta: XlsxMetadata, sheets: Sheet[], renamed: Map<string, string>, palette: string[]): { imported: number; skipped: number } {
  const workbook = meta.parse('xl/workbook.xml'), rels = meta.relations('xl/workbook.xml'); let imported = 0, skipped = 0;
  for (const entry of descendants(workbook, 'sheet')) {
    const name = renamed.get(entry.attrs['name'].toLowerCase()) || entry.attrs['name'];
    const owner = sheets.find(s => s.name === name), relation = rels.find(r => r.id === entry.attrs['r:id']); if (!owner || !relation) continue;
    const colAxis = new GridAxis(16384, 84, owner.colWidths), rowAxis = new GridAxis(1048576, 24, owner.rowHeights);
    for (const drawing of meta.relations(relation.target).filter(r => r.type.endsWith('/drawing'))) {
      const drawingXml = meta.parse(drawing.target), chartRels = meta.relations(drawing.target);
      for (const anchor of drawingXml?.children || []) {
        const chartRef = descendants(anchor, 'chart')[0]; if (!chartRef) continue;
        try {
          const chartRel = chartRels.find(r => r.id === chartRef.attrs['r:id']), chartXml = chartRel && meta.parse(chartRel.target);
          const chart = chartXml && convertChart(chartXml, sheets, renamed, palette); if (!chart) { skipped++; continue; }
          const from = child(anchor, 'from'), to = child(anchor, 'to'), ext = child(anchor, 'ext'), pos = child(anchor, 'pos');
          const position = (node: Xml | undefined) => ({ x: colAxis.offset(Number(text(node, 'col'))) + Number(text(node, 'colOff')) / 9525, y: rowAxis.offset(Number(text(node, 'row'))) + Number(text(node, 'rowOff')) / 9525 });
          if (from) { const start = position(from); chart.x = start.x; chart.y = start.y; if (to) { const end = position(to); chart.width = Math.max(200, end.x - start.x); chart.height = Math.max(150, end.y - start.y); } }
          else if (pos) { chart.x = Number(pos.attrs['x']) / 9525; chart.y = Number(pos.attrs['y']) / 9525; }
          if (ext) { chart.width = Math.max(200, Number(ext.attrs['cx']) / 9525); chart.height = Math.max(150, Number(ext.attrs['cy']) / 9525); }
          (owner.charts ||= []).push(chart); imported++;
        } catch { skipped++; }
      }
    }
  }
  return { imported, skipped };
}
export function importDefinedNames(meta: XlsxMetadata, sheets: Sheet[], renamed: Map<string, string>, rewrite: (formula: string) => string): void {
  const workbook = meta.parse('xl/workbook.xml'), originalSheets = descendants(workbook, 'sheet');
  for (const node of descendants(workbook, 'definedName')) {
    const name = node.attrs['name']; if (!name || name.startsWith('_xlnm.')) continue;
    const scope = node.attrs['localSheetId'];
    const target = scope === undefined ? sheets[0] : sheets.find(s => s.name === renamed.get(originalSheets[+scope]?.attrs['name'].toLowerCase()));
    if (!target) continue;
    const dictionary = scope === undefined ? (target.workbookNames ||= {}) : (target.definedNames ||= {});
    dictionary[name] = rewrite(node.text);
  }
}
