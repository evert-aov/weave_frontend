import { strFromU8, strToU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { ChartCategory, ChartDataConfig, ChartSubType, EmbeddedChart, Sheet } from '../models/excel.model';
import { colIndexToLetter, parseCellId, parseWorksheetReference } from './formula-engine.service';
import { GridAxis } from './grid-viewport';

export interface Xml { name: string; attrs: Record<string, string>; text: string; children: Xml[]; }
export function xml(source: string): Xml {
  const root: Xml = { name: '', attrs: {}, text: '', children: [] }, stack = [root]; let count = 0;
  const parser = new SaxesParser();
  parser.on('doctype', () => { throw new Error('DOCTYPE is not supported in XLSX metadata.'); });
  parser.on('opentag', tag => { if (++count > 250000) throw new Error('XLSX metadata is too large.'); const node = { name: tag.name.split(':').at(-1)!, attrs: tag.attributes as Record<string, string>, text: '', children: [] }; stack.at(-1)!.children.push(node); stack.push(node); });
  parser.on('text', text => stack.at(-1)!.text += text);
  parser.on('closetag', () => { stack.pop(); });
  parser.write(source).close(); return root.children[0] || root;
}
export const children = (node: Xml | undefined, name: string) => node?.children.filter(child => child.name === name) || [];
export const child = (node: Xml | undefined, name: string) => children(node, name)[0];
export function descendants(node: Xml | undefined, name: string): Xml[] { return !node ? [] : [...(node.name === name ? [node] : []), ...node.children.flatMap(c => descendants(c, name))]; }
export const val = (node: Xml | undefined, key: string) => child(node, key)?.attrs['val'];
export const text = (node: Xml | undefined, key: string) => child(node, key)?.text || '';
export function path(base: string, target: string): string {
  const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const part of target.replace(/^\//, '').split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
  return parts.join('/');
}
export interface XlsxMetadata { files: Record<string, Uint8Array>; parse(name: string): Xml | undefined; relations(name: string): { id: string; type: string; target: string }[]; }
export function xlsxMetadata(buffer: ArrayBuffer): XlsxMetadata {
  const files = unzipSync(new Uint8Array(buffer), { filter: file => /(?:workbook\.xml|\.rels|\/charts\/chart\d+\.xml|\/drawings\/drawing\d+\.xml|\/worksheets\/sheet\d+\.xml|\/pivotTables\/pivotTable\d+\.xml|\/pivotCache\/pivotCacheDefinition\d+\.xml)$/.test(file.name) && file.originalSize < 8 * 1024 * 1024 });
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
  if (!sheet || !start || !end) return undefined;
  const minCol = Math.min(start.col, end.col), maxCol = Math.max(start.col, end.col);
  const minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row);
  if (maxRow - minRow > 10000 || maxCol - minCol > 16384) return undefined;
  const isCol = minCol === maxCol, isRow = minRow === maxRow;
  if (!isCol && !isRow) return undefined;
  const orientation: 'col' | 'row' = isRow && !isCol ? 'row' : 'col';
  return { sheet, orientation, startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow, col: minCol, row: minRow, start: orientation === 'row' ? minCol : minRow, end: orientation === 'row' ? maxCol : maxRow };
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
    case 'scatterChart': {
      category = 'scatter';
      const seriesList = children(type, 'ser');
      const hasLines = descendants(type, 'ln').length > 0 || seriesList.some(s => descendants(child(s, 'spPr'), 'ln').length > 0);
      const hasMarkers = descendants(type, 'marker').some(m => val(m, 'symbol') !== 'none') || seriesList.some(s => descendants(child(s, 'marker'), 'symbol').some(n => n.attrs['val'] !== 'none'));
      const isSmooth = val(type, 'scatterStyle')?.includes('smooth') || seriesList.some(s => val(s, 'smooth') === '1');
      const style = val(type, 'scatterStyle');
      if (style === 'smooth' || style === 'smoothMarker' || (isSmooth && hasMarkers)) subType = 'scatterSmoothLinesMarkers';
      else if (style === 'smoothNoMarker' || isSmooth) subType = 'scatterSmoothLines';
      else if (style === 'lineMarker' || (hasLines && hasMarkers)) subType = 'scatterStraightLinesMarkers';
      else if (style === 'line' || hasLines) subType = 'scatterStraightLines';
      else subType = 'scatter';
      break;
    }
    case 'radarChart': category = 'radar'; subType = val(type, 'radarStyle') === 'filled' ? 'filledRadar' : val(type, 'radarStyle') === 'marker' ? 'radarMarkers' : 'radar'; break;
    default: return undefined;
  }
  const series = children(type, 'ser'); if (!series.length) return undefined;
  const sources = series.map(ser => sourceRange(descendants(child(ser, category === 'scatter' ? 'yVal' : 'val'), 'f')[0]?.text || '', sheets, renamed));
  if (sources.some(s => !s)) return undefined;
  const first = sources[0]!;
  const isRowBased = first.orientation === 'row';
  if (isRowBased) {
    if (sources.some(s => s!.sheet.id !== first.sheet.id || s!.startCol !== first.startCol || s!.endCol !== first.endCol)) return undefined;
    if (new Set(sources.map(s => s!.startRow)).size !== sources.length) return undefined;
  } else {
    if (sources.some(s => s!.sheet.id !== first.sheet.id || s!.startRow !== first.startRow || s!.endRow !== first.endRow)) return undefined;
    if (new Set(sources.map(s => s!.startCol)).size !== sources.length) return undefined;
  }
  const categories = series.map(ser => { const formula = descendants(child(ser, category === 'scatter' ? 'xVal' : 'cat'), 'f')[0]?.text; return formula ? sourceRange(formula, sheets, renamed) : undefined; });
  if (isRowBased) {
    if (categories.some(s => s && (s.sheet.id !== first.sheet.id || s.startCol !== first.startCol || s.endCol !== first.endCol || s.startRow !== categories[0]?.startRow))) return undefined;
  } else {
    if (categories.some(s => s && (s.sheet.id !== first.sheet.id || s.startRow !== first.startRow || s.endRow !== first.endRow || s.startCol !== categories[0]?.startCol))) return undefined;
  }
  if (category === 'scatter' && !categories[0]) return undefined;

  const seriesIndices = isRowBased ? sources.map(s => s!.startRow) : sources.map(s => s!.startCol);
  const seriesRows = isRowBased ? seriesIndices : undefined;
  const columns = isRowBased ? Array.from({ length: first.endCol - first.startCol + 1 }, (_, i) => first.startCol + i) : seriesIndices;
  const xColumn = isRowBased ? null : (categories[0]?.startCol ?? null);
  const xRow = isRowBased ? (categories[0]?.startRow ?? null) : null;

  const labelCols: number[] = [];
  const seriesNames: Record<number, string> = {}, colors: Record<string, string> = {};
  const fillColor = (source: Xml | undefined) => { const rgb = descendants(source, 'srgbClr')[0]?.attrs['val']; if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) return '#' + rgb; const scheme = descendants(source, 'schemeClr')[0]?.attrs['val']; const index = ['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6'].indexOf(scheme || ''); return index >= 0 ? '#' + palette[index] : undefined; };
  series.forEach((ser, i) => {
    const tx = child(ser, 'tx'), cached = descendants(tx, 'v')[0]?.text;
    const labelRef = descendants(tx, 'f')[0]?.text, labelSource = labelRef ? sourceRange(labelRef, sheets, renamed) : undefined;
    if (labelSource) labelCols.push(labelSource.startCol);
    const refCellId = labelRef?.split('!').at(-1)?.replace(/\$/g, '');
    const cellValue = refCellId ? (labelSource?.sheet.data[refCellId]?.raw || labelSource?.sheet.data[refCellId]?.computed || first.sheet.data[refCellId]?.raw) : undefined;
    const seriesIndex = seriesIndices[i];
    seriesNames[seriesIndex] = cached || (cellValue ? String(cellValue) : '') || `Series ${i + 1}`;
    const color = fillColor(child(ser, 'spPr'));
    if (color) colors[isRowBased ? `row:${seriesIndex}` : `column:${seriesIndex}`] = color;
    if (category === 'pie') for (const point of children(ser, 'dPt')) { const pointColor = fillColor(child(point, 'spPr')); if (pointColor) colors[`row:${first.start + Number(val(point, 'idx') || 0)}`] = pointColor; }
  });
  const title = descendants(child(descendants(node, 'chart')[0], 'title'), 't').map(n => n.text).join('') || '';
  const legend = child(descendants(node, 'chart')[0], 'legend'), legendPosition = !legend ? 'none' : ({ r:'right', l:'left', t:'top', b:'bottom', tr:'right' } as const)[val(legend, 'legendPos') || 'b'] || 'bottom';

  const range = isRowBased ? {
    startCol: Math.min(first.startCol, ...(labelCols.length ? labelCols : [first.startCol])),
    endCol: first.endCol,
    startRow: Math.min(...seriesIndices, xRow ?? seriesIndices[0]),
    endRow: Math.max(...seriesIndices, xRow ?? seriesIndices[0]),
  } : {
    startCol: Math.min(...columns, xColumn ?? columns[0]),
    endCol: Math.max(...columns, xColumn ?? columns[0]),
    startRow: first.startRow,
    endRow: first.endRow,
  };

  const dataConfig: ChartDataConfig = isRowBased ? {
    orientation: 'row',
    xRow,
    xColumn: null,
    seriesRows,
    seriesColumns: columns,
    hasHeaders: false,
    seriesNames,
  } : {
    orientation: 'column',
    xColumn,
    seriesColumns: columns,
    hasHeaders: false,
    seriesNames,
  };

  return { id: crypto.randomUUID(), title: category, chartTitle: title, category, subType, sourceSheetId: first.sheet.id,
    range, dataConfig, seriesColors: colors,
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

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatOoxmlSheetRef(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export function absRangeRef(sheetName: string, startCol: number, startRow: number, endCol: number, endRow: number): string {
  const s = `${colIndexToLetter(startCol)}$${startRow + 1}`.replace(/^([A-Z]+)/, '$$$1');
  if (startCol === endCol && startRow === endRow) return `${formatOoxmlSheetRef(sheetName)}!${s}`;
  const e = `${colIndexToLetter(endCol)}$${endRow + 1}`.replace(/^([A-Z]+)/, '$$$1');
  return `${formatOoxmlSheetRef(sheetName)}!${s}:${e}`;
}

export function pxToAnchorPoint(px: number, axis: GridAxis): { index: number; offEmu: number } {
  const clamped = Math.max(0, px);
  let idx = 0;
  while (idx < axis.count - 1 && axis.offset(idx + 1) <= clamped) idx++;
  const offEmu = Math.max(0, Math.round((clamped - axis.offset(idx)) * 9525));
  return { index: idx, offEmu };
}

function nextRelsId(relsXml: string): string {
  let maxId = 0;
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    maxId = Math.max(maxId, Number(m[1]));
  }
  return `rId${maxId + 1}`;
}

export function appendRelationship(relsXml: string | undefined, type: string, target: string): { xml: string; id: string } {
  const base = relsXml || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const id = nextRelsId(base);
  const tag = `<Relationship Id="${id}" Type="${type}" Target="${escapeXml(target)}"/>`;
  return { id, xml: base.replace('</Relationships>', `${tag}</Relationships>`) };
}

export function ensureContentTypeOverride(files: Record<string, Uint8Array>, partName: string, contentType: string): void {
  const pathKey = '[Content_Types].xml';
  if (!files[pathKey]) return;
  const current = strFromU8(files[pathKey]);
  if (current.includes(`PartName="${partName}"`)) return;
  const tag = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  files[pathKey] = strToU8(current.replace('</Types>', `${tag}</Types>`));
}

function buildChartXml(chart: EmbeddedChart, sheets: Sheet[], owner: Sheet): string | undefined {
  const sourceSheet = sheets.find(s => s.id === chart.sourceSheetId) || owner;
  const minCol = Math.min(chart.range.startCol, chart.range.endCol);
  const maxCol = Math.max(chart.range.startCol, chart.range.endCol);
  const minRow = Math.min(chart.range.startRow, chart.range.endRow);
  const maxRow = Math.max(chart.range.startRow, chart.range.endRow);
  const cfg = chart.dataConfig;
  const isRowBased = cfg?.orientation === 'row';

  const seriesIndices = isRowBased
    ? (cfg?.seriesRows?.length ? cfg.seriesRows : Array.from({ length: Math.max(1, maxRow - minRow + 1 - (cfg?.xRow !== null && cfg?.xRow !== undefined ? 1 : 0)) }, (_, i) => minRow + i + (cfg?.xRow === minRow ? 1 : 0)))
    : (cfg?.seriesColumns?.length ? cfg.seriesColumns : Array.from({ length: Math.max(1, maxCol - minCol) }, (_, i) => minCol + 1 + i));

  if (!seriesIndices.length) return undefined;

  const isScatter = chart.category === 'scatter';
  const catTag = isScatter ? 'c:xVal' : 'c:cat';
  const valTag = isScatter ? 'c:yVal' : 'c:val';
  const subType = chart.subType || '';
  const grouping = subType.includes('percentStacked') ? 'percentStacked' : subType.includes('stacked') ? 'stacked' : 'clustered';

  const seriesXml = seriesIndices.map((idx, order) => {
    const firstCol = isRowBased && cfg?.seriesColumns?.length ? Math.min(...cfg.seriesColumns) : isRowBased ? minCol : idx;
    const lastCol = isRowBased && cfg?.seriesColumns?.length ? Math.max(...cfg.seriesColumns) : isRowBased ? maxCol : idx;
    const dataStartRow = !isRowBased && cfg?.hasHeaders && maxRow > minRow ? minRow + 1 : minRow;

    const valFormula = isRowBased
      ? absRangeRef(sourceSheet.name, firstCol, idx, lastCol, idx)
      : absRangeRef(sourceSheet.name, idx, dataStartRow, idx, maxRow);

    const xCol = !isRowBased ? (cfg?.xColumn !== undefined ? cfg.xColumn : minCol) : null;
    const xRow = isRowBased ? (cfg?.xRow ?? null) : null;
    const catFormula = isRowBased && xRow !== null
      ? absRangeRef(sourceSheet.name, firstCol, xRow, lastCol, xRow)
      : !isRowBased && xCol !== null
        ? absRangeRef(sourceSheet.name, xCol, dataStartRow, xCol, maxRow)
        : undefined;

    const labelCol = isRowBased ? minCol : idx;
    const labelRow = isRowBased ? idx : minRow;
    const labelName = cfg?.seriesNames?.[idx] || sourceSheet.data[`${colIndexToLetter(labelCol)}${labelRow + 1}`]?.raw || `Series ${order + 1}`;
    const labelFormula = absRangeRef(sourceSheet.name, labelCol, labelRow, labelCol, labelRow);
    const colorKey = isRowBased ? `row:${idx}` : `column:${idx}`;
    const colorHex = chart.seriesColors?.[colorKey]?.replace('#', '').toUpperCase();
    const spPr = colorHex && /^[0-9A-F]{6}$/.test(colorHex)
      ? `<c:spPr><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></c:spPr>`
      : '';
    const catXml = catFormula ? `<${catTag}><c:strRef><c:f>${escapeXml(catFormula)}</c:f></c:strRef></${catTag}>` : '';
    const txXml = `<c:tx><c:strRef><c:f>${escapeXml(labelFormula)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escapeXml(labelName)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
    const markerXml = chart.category === 'line' && subType.includes('Markers') ? '<c:marker><c:symbol val="circle"/></c:marker>' : '';
    return `<c:ser><c:idx val="${order}"/><c:order val="${order}"/>${txXml}${spPr}${markerXml}${catXml}<${valTag}><c:numRef><c:f>${escapeXml(valFormula)}</c:f></c:numRef></${valTag}></c:ser>`;
  }).join('');

  let chartElement = '';
  switch (chart.category) {
    case 'bar':
    case 'column':
      chartElement = `<c:barChart><c:barDir val="${chart.category === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/></c:barChart>`;
      break;
    case 'line':
      chartElement = `<c:lineChart><c:grouping val="${grouping === 'clustered' ? 'standard' : grouping}"/>${seriesXml}<c:marker val="${subType.includes('Markers') ? '1' : '0'}"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>`;
      break;
    case 'area':
      chartElement = `<c:areaChart><c:grouping val="${grouping === 'clustered' ? 'standard' : grouping}"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/></c:areaChart>`;
      break;
    case 'pie':
      chartElement = subType === 'doughnut'
        ? `<c:doughnutChart><c:varyColors val="1"/>${seriesXml}</c:doughnutChart>`
        : `<c:pieChart><c:varyColors val="1"/>${seriesXml}</c:pieChart>`;
      break;
    case 'scatter': {
      const style = subType === 'scatterSmoothLinesMarkers' ? 'smoothMarker'
        : subType === 'scatterSmoothLines' ? 'smoothNoMarker'
        : subType === 'scatterStraightLinesMarkers' ? 'lineMarker'
        : subType === 'scatterStraightLines' ? 'line'
        : 'marker';
      chartElement = `<c:scatterChart><c:scatterStyle val="${style}"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>`;
      break;
    }
    case 'radar': {
      const style = subType === 'filledRadar' ? 'filled' : subType === 'radarMarkers' ? 'marker' : 'standard';
      chartElement = `<c:radarChart><c:radarStyle val="${style}"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/></c:radarChart>`;
      break;
    }
    default:
      return undefined;
  }

  const titleXml = chart.chartTitle
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(chart.chartTitle)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : '';
  const legendPos = chart.appearance?.legendPosition;
  const legendMap: Record<string, string> = { bottom: 'b', top: 't', left: 'l', right: 'r' };
  const legendXml = legendPos && legendPos !== 'none'
    ? `<c:legend><c:legendPos val="${legendMap[legendPos] || 'b'}"/><c:overlay val="0"/></c:legend>`
    : '';
  const axesXml = chart.category === 'pie'
    ? ''
    : `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${titleXml}<c:plotArea>${chartElement}${axesXml}</c:plotArea>${legendXml}</c:chart></c:chartSpace>`;
}

/** Injects OOXML chart, drawing and relationship entries for sheets containing charts into an unzipped XLSX archive. */
export function exportChartMetadata(files: Record<string, Uint8Array>, sheets: Sheet[]): void {
  if (!files['xl/workbook.xml']) return;
  const wbXml = xml(strFromU8(files['xl/workbook.xml']));
  const wbRelsPath = 'xl/_rels/workbook.xml.rels';
  const wbRels = files[wbRelsPath] ? xml(strFromU8(files[wbRelsPath])) : undefined;
  const sheetEntries = descendants(wbXml, 'sheet');

  let nextDrawingIdx = 1;
  let nextChartIdx = 1;
  for (const key of Object.keys(files)) {
    const dm = key.match(/^xl\/drawings\/drawing(\d+)\.xml$/);
    if (dm) nextDrawingIdx = Math.max(nextDrawingIdx, Number(dm[1]) + 1);
    const cm = key.match(/^xl\/charts\/chart(\d+)\.xml$/);
    if (cm) nextChartIdx = Math.max(nextChartIdx, Number(cm[1]) + 1);
  }

  for (const sheet of sheets) {
    if (!sheet.charts?.length) continue;
    const sheetNode = sheetEntries.find(entry => entry.attrs['name'] === sheet.name);
    if (!sheetNode) continue;
    const wbRel = children(wbRels, 'Relationship').find(r => r.attrs['Id'] === sheetNode.attrs['r:id']);
    if (!wbRel) continue;
    const wsPath = path('xl/workbook.xml', wbRel.attrs['Target']);
    if (!files[wsPath]) continue;

    const wsParts = wsPath.split('/');
    const wsFile = wsParts.pop()!;
    const wsRelsPath = [...wsParts, '_rels', `${wsFile}.rels`].join('/');
    let wsRelsText = files[wsRelsPath] ? strFromU8(files[wsRelsPath]) : undefined;
    const existingDrawingRel = wsRelsText
      ? children(xml(wsRelsText), 'Relationship').find(r => r.attrs['Type']?.endsWith('/drawing'))
      : undefined;

    let drawingPath = existingDrawingRel ? path(wsPath, existingDrawingRel.attrs['Target']) : `xl/drawings/drawing${nextDrawingIdx++}.xml`;
    if (!existingDrawingRel) {
      const drawingFileName = drawingPath.split('/').at(-1)!;
      const added = appendRelationship(
        wsRelsText,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
        `../drawings/${drawingFileName}`,
      );
      wsRelsText = added.xml;
      files[wsRelsPath] = strToU8(wsRelsText);
      let wsText = strFromU8(files[wsPath]);
      const drawingTag = `<drawing r:id="${added.id}"/>`;
      wsText = wsText.includes('<extLst')
        ? wsText.replace('<extLst', `${drawingTag}<extLst`)
        : wsText.replace('</worksheet>', `${drawingTag}</worksheet>`);
      files[wsPath] = strToU8(wsText);
      files[drawingPath] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></xdr:wsDr>');
      ensureContentTypeOverride(files, `/${drawingPath}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
    }

    const dParts = drawingPath.split('/');
    const dFile = dParts.pop()!;
    const drawingRelsPath = [...dParts, '_rels', `${dFile}.rels`].join('/');
    let drawingRelsText = files[drawingRelsPath] ? strFromU8(files[drawingRelsPath]) : undefined;
    let drawingXmlText = strFromU8(files[drawingPath]);

    const colAxis = new GridAxis(16384, 84, sheet.colWidths);
    const rowAxis = new GridAxis(1048576, 24, sheet.rowHeights);

    for (const chart of sheet.charts) {
      const chartXmlText = buildChartXml(chart, sheets, sheet);
      if (!chartXmlText) continue;
      const chartPath = `xl/charts/chart${nextChartIdx++}.xml`;
      files[chartPath] = strToU8(chartXmlText);
      ensureContentTypeOverride(files, `/${chartPath}`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
      const chartFileName = chartPath.split('/').at(-1)!;
      const addedChartRel = appendRelationship(
        drawingRelsText,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
        `../charts/${chartFileName}`,
      );
      drawingRelsText = addedChartRel.xml;

      const from = pxToAnchorPoint(chart.x, colAxis);
      const fromRow = pxToAnchorPoint(chart.y, rowAxis);
      const to = pxToAnchorPoint(chart.x + Math.max(200, chart.width), colAxis);
      const toRow = pxToAnchorPoint(chart.y + Math.max(150, chart.height), rowAxis);
      const anchorXml = `<xdr:twoCellAnchor><xdr:from><xdr:col>${from.index}</xdr:col><xdr:colOff>${from.offEmu}</xdr:colOff><xdr:row>${fromRow.index}</xdr:row><xdr:rowOff>${fromRow.offEmu}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${to.index}</xdr:col><xdr:colOff>${to.offEmu}</xdr:colOff><xdr:row>${toRow.index}</xdr:row><xdr:rowOff>${toRow.offEmu}</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${nextChartIdx}" name="${escapeXml(chart.chartTitle || chart.title || 'Chart')}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${addedChartRel.id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
      drawingXmlText = drawingXmlText.replace('</xdr:wsDr>', `${anchorXml}</xdr:wsDr>`);
    }

    files[drawingPath] = strToU8(drawingXmlText);
    if (drawingRelsText) {
      files[drawingRelsPath] = strToU8(drawingRelsText);
    }
  }
}
