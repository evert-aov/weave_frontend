import { strFromU8, strToU8 } from 'fflate';
import {
  FloatingArtwork,
  PivotTableDefinition,
  SelectionRange,
  Sheet,
  SparklineConfig,
  SparklineType,
} from '../models/excel.model';
import { colIndexToLetter, parseCellId, parseWorksheetReference } from './formula-engine.service';
import { GridAxis } from './grid-viewport';
import {
  absRangeRef,
  appendRelationship,
  child,
  children,
  descendants,
  ensureContentTypeOverride,
  escapeXml,
  path,
  pxToAnchorPoint,
  xml,
  XlsxMetadata,
} from './xlsx-charts';

const SPARKLINE_EXT_URI = '{05C60535-1F16-4fd2-B633-F4F36F0B64E0}';

const SHAPE_TO_OOXML_PRST: Record<string, string> = {
  rect: 'rect',
  'rounded-rect': 'roundRect',
  'snip-corner-rect': 'snip1Rect',
  oval: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  cylinder: 'can',
  cube: 'cube',
  heart: 'heart',
  lightning: 'lightningBolt',
  cloud: 'cloud',
  'block-arrow-right': 'rightArrow',
  'block-arrow-left': 'leftArrow',
  'block-arrow-bidirectional': 'leftRightArrow',
  'star-5': 'star5',
  line: 'line',
  'arrow-line': 'line',
  'text-box': 'rect',
};

const OOXML_PRST_TO_SHAPE: Record<string, string> = {
  rect: 'rect',
  roundRect: 'rounded-rect',
  snip1Rect: 'snip-corner-rect',
  ellipse: 'oval',
  triangle: 'triangle',
  diamond: 'diamond',
  can: 'cylinder',
  cube: 'cube',
  heart: 'heart',
  lightningBolt: 'lightning',
  cloud: 'cloud',
  rightArrow: 'block-arrow-right',
  leftArrow: 'block-arrow-left',
  leftRightArrow: 'block-arrow-bidirectional',
  star5: 'star-5',
  line: 'line',
};

function parseA1RangeRef(ref: string): SelectionRange | undefined {
  const clean = ref.replace(/\$/g, '').trim();
  const [startPart, endPart] = clean.split(':');
  const start = parseCellId(startPart);
  const end = parseCellId(endPart || startPart);
  if (!start || !end) return undefined;
  return {
    startCol: Math.min(start.col, end.col),
    endCol: Math.max(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
  };
}

function formatA1RangeRef(range: SelectionRange): string {
  const minCol = Math.min(range.startCol, range.endCol);
  const maxCol = Math.max(range.startCol, range.endCol);
  const minRow = Math.min(range.startRow, range.endRow);
  const maxRow = Math.max(range.startRow, range.endRow);
  const start = `${colIndexToLetter(minCol)}${minRow + 1}`;
  const end = `${colIndexToLetter(maxCol)}${maxRow + 1}`;
  return start === end ? start : `${start}:${end}`;
}

function resolveSheetXmlPaths(files: Record<string, Uint8Array>): Map<string, string> {
  const map = new Map<string, string>();
  if (!files['xl/workbook.xml']) return map;
  const wbXml = xml(strFromU8(files['xl/workbook.xml']));
  const wbRelsPath = 'xl/_rels/workbook.xml.rels';
  const wbRels = files[wbRelsPath] ? xml(strFromU8(files[wbRelsPath])) : undefined;
  for (const entry of descendants(wbXml, 'sheet')) {
    const rel = children(wbRels, 'Relationship').find(r => r.attrs['Id'] === entry.attrs['r:id']);
    if (!rel) continue;
    const wsPath = path('xl/workbook.xml', rel.attrs['Target']);
    if (files[wsPath]) map.set(entry.attrs['name'], wsPath);
  }
  return map;
}

function ensureWorksheetDrawing(files: Record<string, Uint8Array>, wsPath: string): string {
  const wsParts = wsPath.split('/');
  const wsFile = wsParts.pop()!;
  const wsRelsPath = [...wsParts, '_rels', `${wsFile}.rels`].join('/');
  let wsRelsText = files[wsRelsPath] ? strFromU8(files[wsRelsPath]) : undefined;
  const existing = wsRelsText
    ? children(xml(wsRelsText), 'Relationship').find(r => r.attrs['Type']?.endsWith('/drawing'))
    : undefined;
  if (existing) return path(wsPath, existing.attrs['Target']);

  let nextIdx = 1;
  for (const key of Object.keys(files)) {
    const m = key.match(/^xl\/drawings\/drawing(\d+)\.xml$/);
    if (m) nextIdx = Math.max(nextIdx, Number(m[1]) + 1);
  }
  const drawingPath = `xl/drawings/drawing${nextIdx}.xml`;
  const added = appendRelationship(
    wsRelsText,
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
    `../drawings/drawing${nextIdx}.xml`,
  );
  files[wsRelsPath] = strToU8(added.xml);
  let wsText = strFromU8(files[wsPath]);
  const drawingTag = `<drawing r:id="${added.id}"/>`;
  wsText = wsText.includes('<extLst')
    ? wsText.replace('<extLst', `${drawingTag}<extLst`)
    : wsText.replace('</worksheet>', `${drawingTag}</worksheet>`);
  files[wsPath] = strToU8(wsText);
  files[drawingPath] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></xdr:wsDr>',
  );
  ensureContentTypeOverride(
    files,
    `/${drawingPath}`,
    'application/vnd.openxmlformats-officedocument.drawing+xml',
  );
  return drawingPath;
}

/** Ensures Excel/LibreOffice outline collapse indicators are enabled when groups are present. */
export function exportOutlineProperties(files: Record<string, Uint8Array>, sheets: Sheet[]): void {
  const wsPaths = resolveSheetXmlPaths(files);
  for (const sheet of sheets) {
    if (!sheet.rowGroups?.length && !sheet.colGroups?.length) continue;
    const wsPath = wsPaths.get(sheet.name);
    if (!wsPath) continue;
    let wsText = strFromU8(files[wsPath]);
    if (wsText.includes('<outlinePr')) continue;
    if (wsText.includes('<sheetPr>')) {
      wsText = wsText.replace('<sheetPr>', '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/>');
    } else if (/<sheetPr\s+[^>]*\/>/.test(wsText)) {
      wsText = wsText.replace(/<sheetPr(\s+[^>]*)\/>/, '<sheetPr$1><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>');
    } else {
      wsText = wsText.replace(/<worksheet\b[^>]*>/, m => `${m}<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>`);
    }
    files[wsPath] = strToU8(wsText);
  }
}

/** Exports Weave SparklineConfig entries as standard OOXML `<x14:sparklineGroups>` inside worksheet `<extLst>`. */
export function exportSparklineMetadata(files: Record<string, Uint8Array>, sheets: Sheet[]): void {
  const wsPaths = resolveSheetXmlPaths(files);
  for (const sheet of sheets) {
    const entries = Object.entries(sheet.sparklines || {});
    if (!entries.length) continue;
    const wsPath = wsPaths.get(sheet.name);
    if (!wsPath) continue;

    const groupsXml = entries.map(([cellId, cfg]) => {
      const ooxmlType = cfg.type === 'winLoss' ? 'stacked' : cfg.type;
      const colorHex = (cfg.color || '#0284c7').replace('#', '').toUpperCase();
      const rgb = /^[0-9A-F]{6}$/.test(colorHex) ? `FF${colorHex}` : 'FF0284C7';
      const markersAttr = cfg.showMarkers ? ' markers="1"' : '';
      const range = cfg.sourceRange;
      const formula = absRangeRef(
        sheet.name,
        Math.min(range.startCol, range.endCol),
        Math.min(range.startRow, range.endRow),
        Math.max(range.startCol, range.endCol),
        Math.max(range.startRow, range.endRow),
      );
      return `<x14:sparklineGroup type="${ooxmlType}"${markersAttr} displayEmptyCellsAs="gap"><x14:colorSeries rgb="${rgb}"/><x14:colorMarkers rgb="${rgb}"/><x14:sparklines><x14:sparkline><xm:f>${escapeXml(formula)}</xm:f><xm:sqref>${escapeXml(cellId)}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup>`;
    }).join('');

    const extBlock = `<ext uri="${SPARKLINE_EXT_URI}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${groupsXml}</x14:sparklineGroups></ext>`;
    let wsText = strFromU8(files[wsPath]);
    wsText = wsText.includes('</extLst>')
      ? wsText.replace('</extLst>', `${extBlock}</extLst>`)
      : wsText.replace('</worksheet>', `<extLst>${extBlock}</extLst></worksheet>`);
    files[wsPath] = strToU8(wsText);
  }
}

/** Imports OOXML `<x14:sparklineGroups>` back into Sheet.sparklines on XLSX read. */
export function importSparklineMetadata(meta: XlsxMetadata, sheets: Sheet[], renamed: Map<string, string>): void {
  const wbXml = meta.parse('xl/workbook.xml');
  const wbRels = meta.relations('xl/workbook.xml');
  for (const entry of descendants(wbXml, 'sheet')) {
    const sheetName = renamed.get(entry.attrs['name'].toLowerCase()) || entry.attrs['name'];
    const owner = sheets.find(s => s.name === sheetName);
    const rel = wbRels.find(r => r.id === entry.attrs['r:id']);
    if (!owner || !rel) continue;
    const wsXml = meta.parse(rel.target);
    if (!wsXml) continue;

    for (const group of descendants(wsXml, 'sparklineGroup')) {
      const rawType = group.attrs['type'];
      const type: SparklineType = rawType === 'column' ? 'column' : rawType === 'stacked' ? 'winLoss' : 'line';
      const showMarkers = group.attrs['markers'] === '1';
      const rgb = child(group, 'colorSeries')?.attrs['rgb'];
      const color = rgb && /^[0-9A-F]{6,8}$/i.test(rgb) ? `#${rgb.slice(-6).toUpperCase()}` : '#0284c7';

      for (const sp of descendants(group, 'sparkline')) {
        const sqref = child(sp, 'sqref')?.text?.trim();
        const formula = child(sp, 'f')?.text?.trim();
        if (!sqref || !formula) continue;
        const parsedRef = parseWorksheetReference(formula);
        const rawRange = parsedRef ? `${parsedRef.start}${parsedRef.end ? ':' + parsedRef.end : ''}` : formula.split('!').at(-1) || '';
        const sourceRange = parseA1RangeRef(rawRange);
        if (!sourceRange) continue;
        const cfg: SparklineConfig = { type, sourceRange, color, ...(showMarkers ? { showMarkers: true } : {}) };
        (owner.sparklines ||= {})[sqref.toUpperCase()] = cfg;
      }
    }
  }
}

/** Exports floating vector shapes (`FloatingArtwork` kind `'shape'`) as `<xdr:sp>` inside worksheet drawings. */
export function exportDrawingShapes(files: Record<string, Uint8Array>, sheets: Sheet[]): void {
  const wsPaths = resolveSheetXmlPaths(files);
  let shapeId = 1000;
  for (const sheet of sheets) {
    const shapes = (sheet.artwork || []).filter(a => a.kind === 'shape');
    if (!shapes.length) continue;
    const wsPath = wsPaths.get(sheet.name);
    if (!wsPath) continue;

    const drawingPath = ensureWorksheetDrawing(files, wsPath);
    let drawingXml = strFromU8(files[drawingPath]);
    const colAxis = new GridAxis(16384, 84, sheet.colWidths);
    const rowAxis = new GridAxis(1048576, 24, sheet.rowHeights);

    for (const art of shapes) {
      const prst = SHAPE_TO_OOXML_PRST[art.itemId] || 'rect';
      const from = pxToAnchorPoint(art.x, colAxis);
      const fromRow = pxToAnchorPoint(art.y, rowAxis);
      const to = pxToAnchorPoint(art.x + Math.max(16, art.width), colAxis);
      const toRow = pxToAnchorPoint(art.y + Math.max(16, art.height), rowAxis);
      const spXml = `<xdr:twoCellAnchor><xdr:from><xdr:col>${from.index}</xdr:col><xdr:colOff>${from.offEmu}</xdr:colOff><xdr:row>${fromRow.index}</xdr:row><xdr:rowOff>${fromRow.offEmu}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${to.index}</xdr:col><xdr:colOff>${to.offEmu}</xdr:colOff><xdr:row>${toRow.index}</xdr:row><xdr:rowOff>${toRow.offEmu}</xdr:rowOff></xdr:to><xdr:sp macro=""><xdr:nvSpPr><xdr:cNvPr id="${shapeId++}" name="${escapeXml(art.itemId)}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="3B82F6"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="1D4ED8"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
      drawingXml = drawingXml.replace('</xdr:wsDr>', `${spXml}</xdr:wsDr>`);
    }
    files[drawingPath] = strToU8(drawingXml);
  }
}

/** Imports OOXML `<xdr:sp>` floating vector shapes into Sheet.artwork (`kind: 'shape'`). */
export function importDrawingShapes(meta: XlsxMetadata, sheets: Sheet[], renamed: Map<string, string>): void {
  const wbXml = meta.parse('xl/workbook.xml');
  const wbRels = meta.relations('xl/workbook.xml');
  for (const entry of descendants(wbXml, 'sheet')) {
    const sheetName = renamed.get(entry.attrs['name'].toLowerCase()) || entry.attrs['name'];
    const owner = sheets.find(s => s.name === sheetName);
    const rel = wbRels.find(r => r.id === entry.attrs['r:id']);
    if (!owner || !rel) continue;
    const colAxis = new GridAxis(16384, 84, owner.colWidths);
    const rowAxis = new GridAxis(1048576, 24, owner.rowHeights);

    for (const drawing of meta.relations(rel.target).filter(r => r.type.endsWith('/drawing'))) {
      const drawingXml = meta.parse(drawing.target);
      for (const anchor of drawingXml?.children || []) {
        const sp = child(anchor, 'sp');
        if (!sp) continue;
        const cNvPr = descendants(sp, 'cNvPr')[0];
        const prst = descendants(sp, 'prstGeom')[0]?.attrs['prst'] || 'rect';
        const namedId = cNvPr?.attrs['name'];
        const itemId = (namedId && namedId in SHAPE_TO_OOXML_PRST) ? namedId : (OOXML_PRST_TO_SHAPE[prst] || 'rect');
        const from = child(anchor, 'from');
        const to = child(anchor, 'to');
        const pos = (node: ReturnType<typeof child>) => ({
          x: colAxis.offset(Number(node ? child(node, 'col')?.text || 0 : 0)) + Number(node ? child(node, 'colOff')?.text || 0 : 0) / 9525,
          y: rowAxis.offset(Number(node ? child(node, 'row')?.text || 0 : 0)) + Number(node ? child(node, 'rowOff')?.text || 0 : 0) / 9525,
        });
        if (!from || !to) continue;
        const start = pos(from);
        const end = pos(to);
        const art: FloatingArtwork = {
          id: crypto.randomUUID(),
          kind: 'shape',
          itemId,
          x: Math.round(start.x * 100) / 100,
          y: Math.round(start.y * 100) / 100,
          width: Math.max(16, Math.round(end.x - start.x)),
          height: Math.max(16, Math.round(end.y - start.y)),
        };
        (owner.artwork ||= []).push(art);
      }
    }
  }
}

/** Exports native OOXML PivotTables (`<pivotTableDefinition>` + `<pivotCacheDefinition>` + records). */
export function exportPivotTableMetadata(files: Record<string, Uint8Array>, sheets: Sheet[]): void {
  const wsPaths = resolveSheetXmlPaths(files);
  if (!files['xl/workbook.xml'] || !files['xl/_rels/workbook.xml.rels']) return;

  let nextIdx = 1;
  let wbText = strFromU8(files['xl/workbook.xml']);
  let wbRelsText = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const pivotCaches: string[] = [];

  for (const sheet of sheets) {
    if (!sheet.pivotTables?.length) continue;
    const wsPath = wsPaths.get(sheet.name);
    if (!wsPath) continue;

    const wsParts = wsPath.split('/');
    const wsFile = wsParts.pop()!;
    const wsRelsPath = [...wsParts, '_rels', `${wsFile}.rels`].join('/');
    let wsRelsText = files[wsRelsPath] ? strFromU8(files[wsRelsPath]) : undefined;

    for (const pt of sheet.pivotTables) {
      const idx = nextIdx++;
      const cacheId = idx;
      const sourceSheet = sheets.find(s => s.id === pt.sourceSheetId) || sheet;
      const minCol = Math.min(pt.range.startCol, pt.range.endCol);
      const maxCol = Math.max(pt.range.startCol, pt.range.endCol);
      const minRow = Math.min(pt.range.startRow, pt.range.endRow);
      const maxRow = Math.max(pt.range.startRow, pt.range.endRow);
      const sourceRef = formatA1RangeRef(pt.range);
      const targetRef = formatA1RangeRef(pt.targetRange);

      const headers: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const raw = sourceSheet.data[`${colIndexToLetter(c)}${minRow + 1}`]?.raw?.trim();
        headers.push(raw || `Col_${colIndexToLetter(c)}`);
      }

      const recordsXml: string[] = [];
      for (let r = minRow + 1; r <= maxRow; r++) {
        const fields = [];
        for (let c = minCol; c <= maxCol; c++) {
          const valRaw = sourceSheet.data[`${colIndexToLetter(c)}${r + 1}`]?.raw ?? '';
          const num = Number(valRaw);
          if (valRaw !== '' && Number.isFinite(num)) {
            fields.push(`<n v="${num}"/>`);
          } else {
            fields.push(`<s v="${escapeXml(valRaw)}"/>`);
          }
        }
        recordsXml.push(`<r>${fields.join('')}</r>`);
      }

      const cacheDefPath = `xl/pivotCache/pivotCacheDefinition${idx}.xml`;
      const cacheRecPath = `xl/pivotCache/pivotCacheRecords${idx}.xml`;
      const cacheDefRelsPath = `xl/pivotCache/_rels/pivotCacheDefinition${idx}.xml.rels`;
      const ptPath = `xl/pivotTables/pivotTable${idx}.xml`;
      const ptRelsPath = `xl/pivotTables/_rels/pivotTable${idx}.xml.rels`;

      const addedCacheRecRel = appendRelationship(
        undefined,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords',
        `pivotCacheRecords${idx}.xml`,
      );
      files[cacheDefRelsPath] = strToU8(addedCacheRecRel.xml);
      files[cacheRecPath] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" count="${recordsXml.length}">${recordsXml.join('')}</pivotCacheRecords>`,
      );

      const cacheFieldsXml = headers
        .map(h => `<cacheField name="${escapeXml(h)}" numFmtId="0"><sharedItems/></cacheField>`)
        .join('');
      files[cacheDefPath] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${addedCacheRecRel.id}" recordCount="${recordsXml.length}" refreshOnLoad="1"><cacheSource type="worksheet"><worksheetSource ref="${escapeXml(sourceRef)}" sheet="${escapeXml(sourceSheet.name)}"/></cacheSource><cacheFields count="${headers.length}">${cacheFieldsXml}</cacheFields></pivotCacheDefinition>`,
      );

      const addedWbCacheRel = appendRelationship(
        wbRelsText,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition',
        `pivotCache/pivotCacheDefinition${idx}.xml`,
      );
      wbRelsText = addedWbCacheRel.xml;
      pivotCaches.push(`<pivotCache cacheId="${cacheId}" r:id="${addedWbCacheRel.id}"/>`);

      const rowFieldIdx = Math.max(0, pt.rowCol - minCol);
      const colFieldIdx = pt.colCol !== null ? Math.max(0, pt.colCol - minCol) : null;
      const valFieldIdx = Math.max(0, pt.valueCol - minCol);

      const pivotFieldsXml = headers.map((_, fIdx) => {
        if (fIdx === rowFieldIdx) return '<pivotField axis="axisRow" showAll="0"/>';
        if (fIdx === colFieldIdx) return '<pivotField axis="axisCol" showAll="0"/>';
        if (fIdx === valFieldIdx) return '<pivotField dataField="1" showAll="0"/>';
        return '<pivotField showAll="0"/>';
      }).join('');

      const colFieldsXml = colFieldIdx !== null ? `<colFields count="1"><field x="${colFieldIdx}"/></colFields>` : '';
      const valHeader = headers[valFieldIdx] || 'Value';
      files[ptPath] = strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="${escapeXml(pt.name)}" cacheId="${cacheId}" dataCaption="Values" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" updatedVersion="6" minRefreshableVersion="3" createdVersion="6"><location ref="${escapeXml(targetRef)}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/><pivotFields count="${headers.length}">${pivotFieldsXml}</pivotFields><rowFields count="1"><field x="${rowFieldIdx}"/></rowFields>${colFieldsXml}<dataFields count="1"><dataField name="${escapeXml(valHeader)}" fld="${valFieldIdx}" subtotal="${pt.aggregation}" baseField="0" baseItem="0"/></dataFields></pivotTableDefinition>`,
      );

      const addedPtCacheRel = appendRelationship(
        undefined,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition',
        `../pivotCache/pivotCacheDefinition${idx}.xml`,
      );
      files[ptRelsPath] = strToU8(addedPtCacheRel.xml);

      const addedWsPtRel = appendRelationship(
        wsRelsText,
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable',
        `../pivotTables/pivotTable${idx}.xml`,
      );
      wsRelsText = addedWsPtRel.xml;

      ensureContentTypeOverride(files, `/${cacheDefPath}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml');
      ensureContentTypeOverride(files, `/${cacheRecPath}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml');
      ensureContentTypeOverride(files, `/${ptPath}`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml');
    }

    if (wsRelsText) {
      files[wsRelsPath] = strToU8(wsRelsText);
    }
  }

  if (pivotCaches.length) {
    files['xl/_rels/workbook.xml.rels'] = strToU8(wbRelsText);
    wbText = wbText.replace(/<pivotCaches[\s\S]*?<\/pivotCaches>/, '').replace(
      '</workbook>',
      `<pivotCaches>${pivotCaches.join('')}</pivotCaches></workbook>`,
    );
    files['xl/workbook.xml'] = strToU8(wbText);
  }
}

/** Imports native OOXML PivotTables back into Sheet.pivotTables so definitions remain refreshable. */
export function importPivotTableMetadata(meta: XlsxMetadata, sheets: Sheet[], renamed: Map<string, string>): void {
  const wbXml = meta.parse('xl/workbook.xml');
  const wbRels = meta.relations('xl/workbook.xml');

  for (const entry of descendants(wbXml, 'sheet')) {
    const sheetName = renamed.get(entry.attrs['name'].toLowerCase()) || entry.attrs['name'];
    const owner = sheets.find(s => s.name === sheetName);
    const rel = wbRels.find(r => r.id === entry.attrs['r:id']);
    if (!owner || !rel) continue;

    for (const ptRel of meta.relations(rel.target).filter(r => r.type.endsWith('/pivotTable'))) {
      const ptXml = meta.parse(ptRel.target);
      if (!ptXml) continue;
      const cacheRel = meta.relations(ptRel.target).find(r => r.type.endsWith('/pivotCacheDefinition'));
      const cacheXml = cacheRel ? meta.parse(cacheRel.target) : undefined;
      const wsSource = cacheXml ? descendants(cacheXml, 'worksheetSource')[0] : undefined;
      const sourceRef = wsSource?.attrs['ref'];
      const sourceSheetName = wsSource?.attrs['sheet'];
      const sourceSheet = sourceSheetName
        ? sheets.find(s => s.name === (renamed.get(sourceSheetName.toLowerCase()) || sourceSheetName))
        : owner;
      const range = sourceRef ? parseA1RangeRef(sourceRef) : undefined;
      const locRef = child(ptXml, 'location')?.attrs['ref'];
      const targetRange = locRef ? parseA1RangeRef(locRef) : range;
      if (!sourceSheet || !range || !targetRange) continue;

      const rowX = Number(child(child(ptXml, 'rowFields'), 'field')?.attrs['x'] ?? 0);
      const colFieldNode = child(child(ptXml, 'colFields'), 'field');
      const colX = colFieldNode ? Number(colFieldNode.attrs['x']) : null;
      const dataField = child(child(ptXml, 'dataFields'), 'dataField');
      const valX = Number(dataField?.attrs['fld'] ?? Math.max(0, range.endCol - range.startCol));
      const subtotal = dataField?.attrs['subtotal'] as PivotTableDefinition['aggregation'] | undefined;
      const aggregation: PivotTableDefinition['aggregation'] =
        subtotal && ['sum', 'count', 'average', 'min', 'max'].includes(subtotal) ? subtotal : 'sum';

      const def: PivotTableDefinition = {
        id: crypto.randomUUID(),
        name: ptXml.attrs['name'] || 'PivotTable1',
        sourceSheetId: sourceSheet.id,
        range,
        rowCol: range.startCol + rowX,
        colCol: colX !== null ? range.startCol + colX : null,
        valueCol: range.startCol + valX,
        aggregation,
        targetRange,
      };
      (owner.pivotTables ||= []).push(def);
    }
  }
}
