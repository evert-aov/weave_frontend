import type {
  PageDisplayList,
  PageDrawCommand,
  TextShadowStyle,
  TextStrokeStyle,
  CanvasTableLayout,
  CanvasTableColumnBorder,
  CanvasTableRowBorder,
} from './canvas-page-renderer';
export interface TextRun {
  nodeId: string;
  text: string;
  font: string;
  color: string;
  underline?: boolean;
  strike?: boolean;
  background?: string;
  baselineOffset?: number;
  textShadow?: TextShadowStyle;
  textStroke?: TextStrokeStyle;
  footnoteRefId?: string;
}
export interface ParagraphBlock {
  kind: 'paragraph';
  id?: string;
  runs: readonly TextRun[];
  tocRightRuns?: readonly TextRun[];
  tocLeaderNodeId?: string;
  lineHeight: number;
  before?: number;
  after?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  indentLeft?: number;
  indentRight?: number;
  firstLineIndent?: number;
  marker?: { text: string; font: string; color: string; offset?: number };
  background?: string;
  borderTop?: { width: number; color: string };
  borderRight?: { width: number; color: string };
  borderBottom?: { width: number; color: string };
  borderLeft?: { width: number; color: string };
}
export interface ImageBlock { align?: 'left'|'center'|'right'; kind: 'image'; nodeId?: string; assetId: string; width: number; height: number }
export interface RuleBlock { kind: 'rule'; nodeId?: string; height: number; thickness?: number; color: string; before?: number; after?: number }
export interface FormulaBlock {
  kind: 'formula';
  id: string;
  commands: readonly PageDrawCommand[];
  width: number;
  height: number;
  before?: number;
  after?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
}
export interface TableCellBorder { width: number; color: string }
export interface TableCell {
  blocks: readonly (ParagraphBlock | ImageBlock)[];
  colSpan?: number;
  rowSpan?: number;
  background?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  explicitTopBorder?: TableCellBorder;
  borderTop?: TableCellBorder;
  borderRight?: TableCellBorder;
  borderBottom?: TableCellBorder;
  borderLeft?: TableCellBorder;
}
export interface TableBlock {
  kind: 'table';
  nodeId?: string;
  columns: readonly number[];
  rows: readonly (readonly TableCell[])[];
  padding: number;
  border: number;
  color: string;
  headerRows?: number;
  apaBorders?: boolean;
  minRowHeights?: readonly number[];
  rowIds?: readonly string[];
}
export interface ColumnsBlock {
  kind: 'columns';
  nodeId?: string;
  columns: readonly number[];
  gap: number;
  ruleColor?: string;
  columnGroups: readonly (readonly LayoutBlock[])[];
  before?: number;
  after?: number;
}
export interface FootnoteBlock {
  kind: 'footnote';
  nodeId?: string;
  items: readonly ParagraphBlock[];
}
export type LayoutBlock = ParagraphBlock | ImageBlock | TableBlock | RuleBlock | FormulaBlock | ColumnsBlock | FootnoteBlock;
export interface PageGeometry { width: number; height: number; top: number; right: number; bottom: number; left: number }
export type MeasureText = (text: string, font: string) => { width: number; ascent: number; descent: number };
export interface LayoutOptions {
  allowOversized?: boolean;
  pageIds?: readonly string[];
  footnotes?: ReadonlyMap<string, readonly ParagraphBlock[]>;
}
type Box = { height: number; commands: PageDrawCommand[]; tableLayout?: CanvasTableLayout; isHeaderGroup?: boolean; footnoteIds?: readonly string[] };
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const blockBoxesCache = new WeakMap<MeasureText, WeakMap<LayoutBlock, Map<number, Box[]>>>();
const movedBoxCache = new WeakMap<Box, { x: number; y: number; commands: PageDrawCommand[] }>();

function getCachedBoxes(block: LayoutBlock, usableWidth: number, measure: MeasureText, compute: () => Box[]): Box[] {
  let byBlock = blockBoxesCache.get(measure);
  if (!byBlock) {
    byBlock = new WeakMap();
    blockBoxesCache.set(measure, byBlock);
  }
  let byWidth = byBlock.get(block);
  if (!byWidth) {
    byWidth = new Map();
    byBlock.set(block, byWidth);
  }
  const hit = byWidth.get(usableWidth);
  if (hit) return hit;
  const boxes = compute();
  byWidth.set(usableWidth, boxes);
  return boxes;
}

function getMovedCommands(box: Box, x: number, y: number): PageDrawCommand[] {
  const hit = movedBoxCache.get(box);
  if (hit && hit.x === x && hit.y === y) return hit.commands;
  const commands = box.commands.map(command => move(command, x, y));
  movedBoxCache.set(box, { x, y, commands });
  return commands;
}

function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function move(command: PageDrawCommand, x: number, y: number): PageDrawCommand {
  return command.kind === 'text'
    ? { ...command, x: command.x + x, y: command.y + y, source: command.source ? { ...command.source, top: command.source.top + y } : undefined }
    : { ...command, x: command.x + x, y: command.y + y };
}
/** Pure layout: supplied metrics only. No document, HTMLElement, Range or browser globals. */
export function layoutDocument(
  blocks: readonly LayoutBlock[],
  geometry: PageGeometry,
  measure: MeasureText,
  revision = 0,
  options?: LayoutOptions,
): PageDisplayList[] {
  const { width, height, top, right, bottom, left } = geometry;
  const usableWidth = width - left - right, usableHeight = height - top - bottom;
  if (![width, height, usableWidth, usableHeight].every(positive) || ![top, right, bottom, left].every(v => Number.isFinite(v) && v >= 0)) {
    throw new Error('Invalid page geometry');
  }
  const pages: PageDisplayList[] = [];
  let commands: PageDrawCommand[] = [], pageTables: CanvasTableLayout[] = [], y = 0;
  let pageFootnoteIds: string[] = [];
  const pageFootnoteSet = new Set<string>();
  const measureFootnotes = (ids: readonly string[]): { fnBoxes: Box[]; fnContentHeight: number; reservedHeight: number } => {
    const map = options?.footnotes;
    if (!map || !ids.length) return { fnBoxes: [], fnContentHeight: 0, reservedHeight: 0 };
    const fnBoxes: Box[] = [];
    let fnContentHeight = 0;
    for (const fnId of ids) {
      const items = map.get(fnId);
      if (!items?.length) continue;
      for (const item of items) {
        for (const box of getCachedBoxes(item, usableWidth, measure, () => paragraphLines(item, usableWidth, measure))) {
          fnBoxes.push(box);
          fnContentHeight += box.height;
        }
      }
    }
    const reservedHeight = fnBoxes.length ? fnContentHeight + 14 : 0;
    return { fnBoxes, fnContentHeight, reservedHeight };
  };
  const appendNewFootnotes = (candidate?: readonly string[]): string[] => {
    if (!candidate?.length || !options?.footnotes) return pageFootnoteIds;
    let next: string[] | null = null;
    for (const id of candidate) {
      if (options.footnotes.has(id) && !pageFootnoteSet.has(id)) {
        next ??= [...pageFootnoteIds];
        if (!next.includes(id)) next.push(id);
      }
    }
    return next ?? pageFootnoteIds;
  };
  const flush = () => {
    if (pageFootnoteIds.length) {
      const { fnBoxes, fnContentHeight } = measureFootnotes(pageFootnoteIds);
      if (fnBoxes.length) {
        const startY = Math.max(y + 8, usableHeight - fnContentHeight - 6);
        commands.push({
          kind: 'rect',
          x: left,
          y: top + startY - 6,
          width: Math.min(180, usableWidth * 0.35),
          height: 0.75,
          color: '#94a3b8',
        });
        let curFnY = startY;
        for (const box of fnBoxes) {
          for (const cmd of getMovedCommands(box, left, top + curFnY)) {
            commands.push(
              cmd.kind === 'text'
                ? { ...cmd, ...(cmd.source ? { advanceWidth: cmd.source.width } : {}), source: undefined }
                : cmd,
            );
          }
          curFnY += box.height;
        }
      }
    }
    const id = options?.pageIds?.[pages.length] ?? `layout-${pages.length}`;
    pages.push({
      id,
      revision,
      width,
      height,
      commands,
      ...(pageTables.length ? { tables: pageTables } : {}),
    });
    commands = [];
    pageTables = [];
    y = 0;
    pageFootnoteIds = [];
    pageFootnoteSet.clear();
  };
  const place = (box: Box) => {
    if (box.height > usableHeight && !options?.allowOversized) throw new Error('Indivisible content exceeds page height');
    const nextFnIds = appendNewFootnotes(box.footnoteIds);
    const { reservedHeight } = measureFootnotes(nextFnIds);
    if (y + box.height + reservedHeight > usableHeight && y > 0) flush();
    if (box.footnoteIds?.length && options?.footnotes) {
      for (const id of box.footnoteIds) {
        if (options.footnotes.has(id) && !pageFootnoteSet.has(id)) {
          pageFootnoteSet.add(id);
          pageFootnoteIds.push(id);
        }
      }
    }
    commands.push(...getMovedCommands(box, left, top + y));
    if (box.tableLayout) {
      const tl = box.tableLayout;
      const groupY = top + y;
      const groupX = left + tl.x;
      const groupH = tl.height;
      const translatedColBorders: CanvasTableColumnBorder[] = tl.colBorders.map(cb => ({
        ...cb,
        x: groupX + cb.x,
        top: groupY + cb.top,
        bottom: groupY + cb.bottom,
      }));
      const translatedRowBorders: CanvasTableRowBorder[] = tl.rowBorders.map(rb => ({
        ...rb,
        y: groupY + rb.y,
        left: groupX + rb.left,
        right: groupX + rb.right,
      }));

      const lastTable = pageTables.at(-1);
      if (lastTable && lastTable.tableId === tl.tableId) {
        const combinedHeight = lastTable.height + groupH;
        const mergedColBorders = lastTable.colBorders.map(cb => ({
          ...cb,
          bottom: lastTable.y + combinedHeight,
        }));
        pageTables[pageTables.length - 1] = {
          ...lastTable,
          height: combinedHeight,
          rowHeights: [...lastTable.rowHeights, ...tl.rowHeights],
          colBorders: mergedColBorders,
          rowBorders: [...lastTable.rowBorders, ...translatedRowBorders],
        };
      } else {
        pageTables.push({
          ...tl,
          x: groupX,
          y: groupY,
          colBorders: translatedColBorders,
          rowBorders: translatedRowBorders,
        });
      }
    }
    y += box.height;
  };
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const boxes = getCachedBoxes(block, usableWidth, measure, () => paragraphLines(block, usableWidth, measure));
      if ((block.tocRightRuns?.length || block.tocLeaderNodeId) && boxes.length > 1 && y > 0) {
        const totalHeight = boxes.reduce((sum, b) => sum + b.height, 0);
        const nextFnIds = appendNewFootnotes(boxes.flatMap(b => b.footnoteIds ?? []));
        const { reservedHeight } = measureFootnotes(nextFnIds);
        if (totalHeight + reservedHeight <= usableHeight && y + totalHeight + reservedHeight > usableHeight) {
          flush();
        }
      }
      for (const box of boxes) place(box);
    } else if (block.kind === 'image') {
      place(imageBox(block, usableWidth, options?.allowOversized ? usableHeight : undefined));
    } else if (block.kind === 'rule') {
      const before = block.before || 0, after = block.after || 0;
      const thickness = block.thickness ?? 1.5;
      const boxHeight = Math.max(thickness, block.height) + before + after;
      place({
        height: boxHeight,
        commands: [{ kind: 'rect', nodeId: block.nodeId, x: 0, y: before + (Math.max(thickness, block.height) - thickness) / 2, width: usableWidth, height: thickness, color: block.color }],
      });
    } else if (block.kind === 'formula') {
      const before = block.before || 0, after = block.after || 0;
      const align = block.align || 'center';
      const offsetX =
        align === 'right'
          ? Math.max(0, usableWidth - block.width)
          : align === 'left' || align === 'justify'
            ? 0
            : Math.max(0, (usableWidth - block.width) / 2);
      const boxHeight = Math.max(18, block.height) + before + after;
      place({
        height: boxHeight,
        commands: block.commands.map(cmd => move(cmd, offsetX, before)),
      });
    } else if (block.kind === 'columns') {
      const colWeights = block.columns.length ? block.columns : [1, 1];
      const totalWeight = colWeights.reduce((a, b) => a + b, 0) || colWeights.length;
      const numCols = colWeights.length;
      const totalGap = block.gap * Math.max(0, numCols - 1);
      const colAvail = Math.max(40, usableWidth - totalGap);
      const colWidths = colWeights.map(w => (w / totalWeight) * colAvail);
      const before = block.before || 4;
      const after = block.after || 8;
      const colCommands: PageDrawCommand[] = [];
      let maxColHeight = 0;
      let colX = 0;

      const layoutSubBlock = (sub: LayoutBlock, w: number): Box[] => {
        if (sub.kind === 'paragraph') return getCachedBoxes(sub, w, measure, () => paragraphLines(sub, w, measure));
        if (sub.kind === 'image') return [imageBox(sub, w, options?.allowOversized ? usableHeight : undefined)];
        if (sub.kind === 'rule') {
          const b = sub.before || 0, a = sub.after || 0, t = sub.thickness ?? 1.5;
          return [{ height: Math.max(t, sub.height) + b + a, commands: [{ kind: 'rect', nodeId: sub.nodeId, x: 0, y: b, width: w, height: t, color: sub.color }] }];
        }
        if (sub.kind === 'table') return getCachedBoxes(sub, w, measure, () => tableGroups(sub, w, measure));
        return [];
      };

      for (let c = 0; c < numCols; c++) {
        const w = colWidths[c];
        const group = block.columnGroups[c] ?? [];
        let colY = before;
        for (const sub of group) {
          for (const box of layoutSubBlock(sub, w)) {
            colCommands.push(...box.commands.map(cmd => move(cmd, colX, colY)));
            colY += box.height;
          }
        }
        maxColHeight = Math.max(maxColHeight, colY - before);
        if (block.ruleColor && c < numCols - 1) {
          colCommands.push({
            kind: 'rect',
            x: colX + w + block.gap / 2,
            y: before,
            width: 1,
            height: Math.max(12, maxColHeight),
            color: block.ruleColor,
          });
        }
        colX += w + block.gap;
      }
      place({ height: maxColHeight + before + after, commands: colCommands });
    } else if (block.kind === 'footnote') {
      const fnBoxes: Box[] = [];
      let fnContentHeight = 0;
      for (const item of block.items) {
        for (const box of getCachedBoxes(item, usableWidth, measure, () => paragraphLines(item, usableWidth, measure))) {
          fnBoxes.push(box);
          fnContentHeight += box.height;
        }
      }
      if (fnBoxes.length) {
        const separatorGap = 14;
        const totalFnHeight = fnContentHeight + separatorGap;
        if (y + totalFnHeight > usableHeight && y > 0) flush();
        const startY = Math.max(y + 8, usableHeight - fnContentHeight - 6);
        commands.push({
          kind: 'rect',
          nodeId: block.nodeId,
          x: left,
          y: top + startY - 6,
          width: Math.min(180, usableWidth * 0.35),
          height: 0.75,
          color: '#94a3b8',
        });
        let curFnY = startY;
        for (const box of fnBoxes) {
          commands.push(...getMovedCommands(box, left, top + curFnY));
          curFnY += box.height;
        }
        y = curFnY;
      }
    } else {
      const groups = getCachedBoxes(block, usableWidth, measure, () => tableGroups(block, usableWidth, measure));
      const headerGroups = groups.filter(g => g.isHeaderGroup);
      const headerHeight = headerGroups.reduce((sum, g) => sum + g.height, 0);
      const repeatedHeaders = (): Box[] => headerGroups.map(hg => ({
        height: hg.height,
        commands: hg.commands.map(cmd =>
          cmd.kind === 'text'
            ? { ...cmd, ...(cmd.source ? { advanceWidth: cmd.source.width } : {}), source: undefined }
            : cmd,
        ),
        ...(hg.tableLayout
          ? {
              tableLayout: {
                ...hg.tableLayout,
                rowBorders: hg.tableLayout.rowBorders.map(rb => ({ ...rb, rowId: undefined })),
              },
            }
          : {}),
      }));
      for (const group of groups) {
        const nextGroupFnIds = appendNewFootnotes(group.footnoteIds);
        const { reservedHeight: groupFnReserve } = measureFootnotes(nextGroupFnIds);
        if (!group.isHeaderGroup && headerGroups.length > 0 && y > 0 && y + group.height + groupFnReserve > usableHeight && headerHeight + group.height <= usableHeight) {
          flush();
          for (const repeated of repeatedHeaders()) place(repeated);
        }
        place(group);
      }
    }
  }
  if (commands.length || !pages.length) flush();
  return pages;
}

function imageBox(block: ImageBlock, width: number, maxHeight?: number): Box {
  if (!positive(block.width) || !positive(block.height)) throw new Error('Invalid image dimensions');
  let ratio = Math.min(1, width / block.width);
  if (maxHeight && block.height * ratio > maxHeight) {
    ratio = Math.min(ratio, maxHeight / block.height);
  }
  return { height: block.height * ratio, commands: [{ kind: 'image', nodeId: block.nodeId, assetId: block.assetId, x: block.align==='center'?(width-block.width*ratio)/2:block.align==='right'?width-block.width*ratio:0, y: 0, width: block.width * ratio, height: block.height * ratio }] };
}

function paragraphLines(block: ParagraphBlock, width: number, measure: MeasureText): Box[] {
  if (!positive(block.lineHeight)) throw new Error('Invalid line height');
  const before = block.before || 0, after = block.after || 0;
  const indentLeft = block.indentLeft || 0, indentRight = block.indentRight || 0, firstLineIndent = block.firstLineIndent || 0;
  if (![before, after, indentLeft, indentRight].every(v => Number.isFinite(v) && v >= 0) || !Number.isFinite(firstLineIndent)) {
    throw new Error('Invalid paragraph spacing');
  }
  type Glyph = { text: string; width: number; ascent: number; descent: number; run: TextRun; start: number; end: number };
  const words: Glyph[][] = [];
  let word: Glyph[] = [];
  const segmenter = GRAPHEME_SEGMENTER;
  const rightGlyphs: Glyph[] = [];
  if (block.tocRightRuns?.length) {
    for (const run of block.tocRightRuns) {
      for (const part of segmenter.segment(run.text)) {
        if (/[\r\n]/.test(part.segment)) continue;
        const metrics = measure(part.segment, run.font);
        if (![metrics.width, metrics.ascent, metrics.descent].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Invalid font metrics');
        rightGlyphs.push({ text: part.segment, ...metrics, run, start: part.index, end: part.index + part.segment.length });
      }
    }
  }
  const rightWidth = rightGlyphs.reduce((sum, g) => sum + g.width, 0);
  const rightReserve = rightGlyphs.length ? rightWidth + 24 : 0;
  for (const run of block.runs) {
    for (const part of segmenter.segment(run.text)) {
      const metrics = measure(part.segment, run.font);
      if (![metrics.width, metrics.ascent, metrics.descent].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Invalid font metrics');
      const glyph = { text: part.segment, ...metrics, run, start: part.index, end: part.index + part.segment.length };
      if (/\s/.test(part.segment)) {
        if (word.length) words.push(word);
        word = [];
        words.push([glyph]);
      } else {
        word.push(glyph);
      }
    }
  }
  if (word.length) words.push(word);
  const lines: Glyph[][] = [];
  let line: Glyph[] = [], used = 0;
  const lineLimit = (lineIndex: number) => Math.max(1, width - indentLeft - indentRight - rightReserve - (lineIndex === 0 ? firstLineIndent : 0));
  const flush = () => { lines.push(line); line = []; used = 0; };
  for (const token of words) {
    if (token.length === 1 && /[\r\n]/.test(token[0].text)) { flush(); continue; }
    const length = token.reduce((sum, g) => sum + g.width, 0);
    const currentLimit = lineLimit(lines.length);
    if (used + length > currentLimit && line.length) flush();
    if (!line.length && token.every(g => /\s/.test(g.text))) continue;
    for (const glyph of token) {
      const limit = lineLimit(lines.length);
      if (used + glyph.width > limit && line.length) flush();
      if (glyph.width > lineLimit(lines.length)) throw new Error('Glyph exceeds content width');
      line.push(glyph);
      used += glyph.width;
    }
  }
  if (line.length || !lines.length) flush();
  return lines.map((glyphs, index) => {
    const lineStartIndent = indentLeft + (index === 0 ? firstLineIndent : 0);
    const availWidth = Math.max(1, width - lineStartIndent - indentRight);
    const offset = index === 0 ? before : 0;
    const refFont = block.runs[0]?.font ?? block.marker?.font ?? '14.67px serif';
    const refMetrics = !glyphs.length ? measure('M', refFont) : null;
    const ascent = glyphs.length ? Math.max(0, ...glyphs.map(g => g.ascent)) : (refMetrics?.ascent ?? Math.round(block.lineHeight * 0.72));
    const descent = glyphs.length ? Math.max(0, ...glyphs.map(g => g.descent)) : (refMetrics?.descent ?? Math.round(block.lineHeight * 0.22));
    const lineHeight = Math.max(block.lineHeight, ascent + descent);
    const baseline = offset + (lineHeight - ascent - descent) / 2 + ascent;
    const totalBoxHeight = lineHeight + offset + (index === lines.length - 1 ? after : 0);
    const commands: PageDrawCommand[] = [];

    const hasBoxFrame = Boolean(block.borderTop || block.borderRight || block.borderBottom);
    const hasAccentFrame = Boolean(block.borderLeft || hasBoxFrame);
    const frameInsetLeft = hasBoxFrame ? Math.max(0, indentLeft - 14) : (block.borderLeft ? Math.max(0, indentLeft - 12) : indentLeft);
    const frameInsetRight = hasBoxFrame ? Math.max(0, indentRight - 14) : (block.borderLeft ? Math.max(0, indentRight - 12) : indentRight);
    const frameWidth = Math.max(0, width - frameInsetLeft - frameInsetRight);

    if (block.background) {
      commands.push({
        kind: 'rect',
        x: hasAccentFrame ? frameInsetLeft : indentLeft,
        y: hasAccentFrame ? 0 : offset,
        width: hasAccentFrame ? frameWidth : Math.max(0, width - indentLeft - indentRight),
        height: hasAccentFrame ? totalBoxHeight : lineHeight,
        color: block.background,
      });
    }
    if (index === 0 && block.borderTop && block.borderTop.width > 0) {
      commands.push({ kind: 'rect', x: frameInsetLeft, y: 0, width: frameWidth, height: block.borderTop.width, color: block.borderTop.color });
    }
    if (index === lines.length - 1 && block.borderBottom && block.borderBottom.width > 0) {
      commands.push({ kind: 'rect', x: frameInsetLeft, y: Math.max(0, totalBoxHeight - block.borderBottom.width), width: frameWidth, height: block.borderBottom.width, color: block.borderBottom.color });
    }
    if (block.borderRight && block.borderRight.width > 0) {
      commands.push({ kind: 'rect', x: Math.max(0, frameInsetLeft + frameWidth - block.borderRight.width), y: 0, width: block.borderRight.width, height: totalBoxHeight, color: block.borderRight.color });
    }
    if (block.borderLeft && block.borderLeft.width > 0) {
      commands.push({ kind: 'rect', x: frameInsetLeft, y: 0, width: block.borderLeft.width, height: totalBoxHeight, color: block.borderLeft.color });
    }
    if (index === 0 && block.marker) {
      const markerOffset = block.marker.offset ?? 16;
      const measuredMarker = measure(block.marker.text, block.marker.font);
      const effectiveOffset = Math.max(markerOffset, Math.ceil(measuredMarker.width) + 6);
      commands.push({
        kind: 'text',
        text: block.marker.text,
        font: block.marker.font,
        color: block.marker.color,
        x: Math.max(0, lineStartIndent - effectiveOffset),
        y: baseline,
      });
    }

    if (!glyphs.length) {
      const anchorRun = block.runs[0];
      if (anchorRun || block.id) {
        const nodeId = anchorRun?.nodeId ?? block.id!;
        commands.push({
          kind: 'text',
          text: '',
          font: anchorRun?.font ?? block.marker?.font ?? '14.67px serif',
          color: anchorRun?.color ?? '#000',
          x: lineStartIndent,
          y: baseline,
          source: {
            start: { nodeId, offset: 0 },
            end: { nodeId, offset: 0 },
            top: offset,
            width: availWidth,
            height: lineHeight,
          },
        });
      }
      const lineFootnoteIds: string[] = [];
    for (const glyph of glyphs) {
      if (glyph.run.footnoteRefId && !lineFootnoteIds.includes(glyph.run.footnoteRefId)) {
        lineFootnoteIds.push(glyph.run.footnoteRefId);
      }
    }
    return { height: totalBoxHeight, commands, ...(lineFootnoteIds.length ? { footnoteIds: lineFootnoteIds } : {}) };
    }

    let lastNonSpace = glyphs.length - 1;
    while (lastNonSpace >= 0 && /\s/.test(glyphs[lastNonSpace].text)) lastNonSpace--;
    const visibleWidth = glyphs.slice(0, lastNonSpace + 1).reduce((sum, g) => sum + g.width, 0);
    const lineWidth = glyphs.reduce((sum, g) => sum + g.width, 0);
    const spaceIndices = glyphs
      .map((g, idx) => (idx <= lastNonSpace && /\s/.test(g.text) ? idx : -1))
      .filter(idx => idx >= 0);
    const shouldJustify = block.align === 'justify' && index < lines.length - 1 && spaceIndices.length > 0 && visibleWidth < availWidth;
    const extraSpace = shouldJustify ? (availWidth - visibleWidth) / spaceIndices.length : 0;

    let x = lineStartIndent + (
      block.align === 'right'
        ? availWidth - lineWidth
        : block.align === 'center'
          ? (availWidth - lineWidth) / 2
          : 0
    );

    for (let gIdx = 0; gIdx < glyphs.length; gIdx++) {
      const g = glyphs[gIdx];
      const advance = g.width + (shouldJustify && gIdx <= lastNonSpace && /\s/.test(g.text) ? extraSpace : 0);
      const yPos = baseline + (g.run.baselineOffset || 0);
      if (g.run.background) {
        commands.push({ kind: 'rect', x, y: offset, width: advance, height: lineHeight, color: g.run.background });
      }
      commands.push({
        kind: 'text',
        text: g.text,
        font: g.run.font,
        color: g.run.color,
        ...(g.run.textShadow ? { textShadow: g.run.textShadow } : {}),
        ...(g.run.textStroke ? { textStroke: g.run.textStroke } : {}),
        x,
        y: yPos,
        source: {
          start: { nodeId: g.run.nodeId, offset: g.start },
          end: { nodeId: g.run.nodeId, offset: g.end },
          top: offset,
          width: advance,
          height: lineHeight,
        },
      });
      if (g.run.underline) {
        commands.push({ kind: 'rect', x, y: yPos + 1.5, width: advance, height: 1, color: g.run.color });
      }
      if (g.run.strike) {
        commands.push({ kind: 'rect', x, y: yPos - Math.max(3, g.ascent * 0.35), width: advance, height: 1, color: g.run.color });
      }
      x += advance;
    }
    if (index === lines.length - 1 && (rightGlyphs.length > 0 || block.tocLeaderNodeId)) {
      const rightStartX = Math.max(x + 8, width - indentRight - rightWidth);
      const leaderStartX = x + 2;
      const leaderAvail = (rightStartX - 4) - leaderStartX;
      const leaderFont = glyphs[glyphs.length - 1]?.run.font ?? rightGlyphs[0]?.run.font ?? block.runs[0]?.font ?? '12px serif';
      const leaderColor = glyphs[glyphs.length - 1]?.run.color ?? rightGlyphs[0]?.run.color ?? block.runs[0]?.color ?? '#334155';
      const dotStep = Math.max(2, measure('.', leaderFont).width);
      const count = leaderAvail >= dotStep ? Math.floor(leaderAvail / dotStep) : 0;
      const leaderText = count > 0 ? '.'.repeat(count) : '';
      if (leaderText || block.tocLeaderNodeId) {
        commands.push({
          kind: 'text',
          text: leaderText,
          font: leaderFont,
          color: leaderColor,
          x: leaderStartX,
          y: baseline,
          ...(block.tocLeaderNodeId
            ? {
                source: {
                  start: { nodeId: block.tocLeaderNodeId, offset: 0 },
                  end: { nodeId: block.tocLeaderNodeId, offset: 0 },
                  top: offset,
                  width: Math.max(0, leaderAvail),
                  height: lineHeight,
                },
              }
            : {}),
        });
      }
      let rx = rightStartX;
      for (const rg of rightGlyphs) {
        commands.push({
          kind: 'text',
          text: rg.text,
          font: rg.run.font,
          color: rg.run.color,
          x: rx,
          y: baseline + (rg.run.baselineOffset || 0),
          source: {
            start: { nodeId: rg.run.nodeId, offset: rg.start },
            end: { nodeId: rg.run.nodeId, offset: rg.end },
            top: offset,
            width: rg.width,
            height: lineHeight,
          },
        });
        rx += rg.width;
      }
    }
    const lineFootnoteIds: string[] = [];
    for (const glyph of glyphs) {
      if (glyph.run.footnoteRefId && !lineFootnoteIds.includes(glyph.run.footnoteRefId)) {
        lineFootnoteIds.push(glyph.run.footnoteRefId);
      }
    }
    return { height: totalBoxHeight, commands, ...(lineFootnoteIds.length ? { footnoteIds: lineFootnoteIds } : {}) };
  });
}

function tableGroups(table: TableBlock, width: number, measure: MeasureText): Box[] {
  if (!table.columns.length || !table.columns.every(positive) || ![table.padding, table.border].every(v => Number.isFinite(v) && v >= 0)) {
    throw new Error('Invalid table dimensions');
  }
  const sum = table.columns.reduce((a, b) => a + b, 0), columns = table.columns.map(w => w * width / sum);
  const columnWidthsPct = table.columns.map(w => (w / sum) * 100);
  const occupied: boolean[][] = [], heights = table.rows.map((_, r) => Math.max(0, table.minRowHeights?.[r] ?? 0));
  const cells: { row: number; col: number; rows: number; cols: number; box: Box; cell: TableCell }[] = [];
  table.rows.forEach((row, r) => {
    occupied[r] ||= [];
    let c = 0;
    for (const cell of row) {
      while (occupied[r][c]) c++;
      const rows = cell.rowSpan ?? 1, cols = cell.colSpan ?? 1;
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || r + rows > table.rows.length || c + cols > columns.length) {
        throw new Error('Invalid table span');
      }
      for (let y = r; y < r + rows; y++) {
        occupied[y] ||= [];
        for (let x = c; x < c + cols; x++) {
          if (occupied[y][x]) throw new Error('Overlapping table cells');
          occupied[y][x] = true;
        }
      }
      const inner = columns.slice(c, c + cols).reduce((a, b) => a + b, 0) - 2 * (table.padding + table.border);
      if (!positive(inner)) throw new Error('Table cell has no content width');
      let height = 0;
      const commands: PageDrawCommand[] = [];
      const cellFootnoteIds: string[] = [];
      for (const block of cell.blocks) {
        const boxes = block.kind === 'paragraph' ? paragraphLines(block, inner, measure) : [imageBox(block, inner)];
        for (const box of boxes) {
          commands.push(...box.commands.map(cmd => move(cmd, table.padding + table.border, height + table.padding + table.border)));
          if (box.footnoteIds?.length) {
            for (const id of box.footnoteIds) {
              if (!cellFootnoteIds.includes(id)) cellFootnoteIds.push(id);
            }
          }
          height += box.height;
        }
      }
      const box: Box = {
        height: height + 2 * (table.padding + table.border),
        commands,
        ...(cellFootnoteIds.length ? { footnoteIds: cellFootnoteIds } : {}),
      };
      cells.push({ row: r, col: c, rows, cols, box, cell });
      if (rows === 1) heights[r] = Math.max(heights[r], box.height);
      c += cols;
    }
  });
  for (const cell of cells) {
    const available = heights.slice(cell.row, cell.row + cell.rows).reduce((a, b) => a + b, 0);
    if (available < cell.box.height) heights[cell.row + cell.rows - 1] += cell.box.height - available;
  }
  const groups: Box[] = [];
  for (let start = 0; start < table.rows.length;) {
    let end = start + 1;
    for (let scan = start; scan < end; scan++) for (const cell of cells) if (cell.row === scan) end = Math.max(end, cell.row + cell.rows);
    const commands: PageDrawCommand[] = [];
    const groupFootnoteIds: string[] = [];
    for (const slot of cells.filter(cell => cell.row >= start && cell.row < end)) {
      if (slot.box.footnoteIds?.length) {
        for (const id of slot.box.footnoteIds) {
          if (!groupFootnoteIds.includes(id)) groupFootnoteIds.push(id);
        }
      }
      const x = columns.slice(0, slot.col).reduce((a, b) => a + b, 0);
      const y = heights.slice(start, slot.row).reduce((a, b) => a + b, 0);
      const w = columns.slice(slot.col, slot.col + slot.cols).reduce((a, b) => a + b, 0);
      const h = heights.slice(slot.row, slot.row + slot.rows).reduce((a, b) => a + b, 0);
      if (slot.cell.background) commands.push({ kind: 'rect', x, y, width: w, height: h, color: slot.cell.background });
      const b = table.border;
      const cell = slot.cell;
      const rules: { x: number; y: number; width: number; height: number; color: string }[] = [];
      let drewTop = false;
      if (table.apaBorders) {
        if (b) {
          let drewBottom = false;
          if (slot.row === 0) {
            rules.push({ x, y, width: w, height: b, color: table.color });
            rules.push({ x, y: y + h - b, width: w, height: b, color: table.color });
            drewTop = true;
            drewBottom = true;
          }
          if (slot.row + slot.rows === table.rows.length && !drewBottom) {
            rules.push({ x, y: y + h - b, width: w, height: b, color: table.color });
          }
        }
        if (!drewTop && cell.explicitTopBorder?.width) {
          rules.push({ x, y, width: w, height: cell.explicitTopBorder.width, color: cell.explicitTopBorder.color });
        }
      } else if (b) {
        rules.push(
          { x, y, width: w, height: b, color: table.color },
          { x, y: y + h - b, width: w, height: b, color: table.color },
          { x, y, width: b, height: h, color: table.color },
          { x: x + w - b, y, width: b, height: h, color: table.color },
        );
      } else {
        const topRule = cell.explicitTopBorder ?? cell.borderTop;
        if (topRule?.width) {
          rules.push({ x, y, width: w, height: topRule.width, color: topRule.color });
        }
        if (cell.borderBottom?.width) {
          rules.push({ x, y: y + h - cell.borderBottom.width, width: w, height: cell.borderBottom.width, color: cell.borderBottom.color });
        }
        if (cell.borderLeft?.width) {
          rules.push({ x, y, width: cell.borderLeft.width, height: h, color: cell.borderLeft.color });
        }
        if (cell.borderRight?.width) {
          rules.push({ x: x + w - cell.borderRight.width, y, width: cell.borderRight.width, height: h, color: cell.borderRight.color });
        }
      }
      if (rules.length) {
        commands.push(...rules.map(rect => ({ kind: 'rect' as const, ...rect })));
      }
      const extraV = Math.max(0, h - slot.box.height);
      const dy = cell.verticalAlign === 'middle' ? extraV / 2 : cell.verticalAlign === 'bottom' ? extraV : 0;
      commands.push(...slot.box.commands.map(cmd => move(cmd, x, y + dy)));
    }
    const groupHeight = heights.slice(start, end).reduce((a, b) => a + b, 0);
    let tableLayout: CanvasTableLayout | undefined;
    if (table.nodeId) {
      const colBorders: CanvasTableColumnBorder[] = [];
      let accX = 0;
      for (let c = 0; c < columns.length; c++) {
        accX += columns[c];
        colBorders.push({
          x: accX,
          top: 0,
          bottom: groupHeight,
          columnIndex: c,
        });
      }
      const rowBorders: CanvasTableRowBorder[] = [];
      let accY = 0;
      for (let r = start; r < end; r++) {
        accY += heights[r];
        rowBorders.push({
          y: accY,
          left: 0,
          right: width,
          rowIndex: r,
          rowId: table.rowIds?.[r],
          rowHeight: heights[r],
        });
      }
      tableLayout = {
        tableId: table.nodeId,
        x: 0,
        y: 0,
        width,
        height: groupHeight,
        columns,
        columnWidthsPct,
        rowHeights: heights.slice(start, end),
        colBorders,
        rowBorders,
      };
    }
    const isHeaderGroup = Boolean(table.headerRows && table.headerRows > 0 && start < table.headerRows && end <= table.headerRows);
    groups.push({
      height: groupHeight,
      commands,
      tableLayout,
      ...(isHeaderGroup ? { isHeaderGroup: true } : {}),
      ...(groupFootnoteIds.length ? { footnoteIds: groupFootnoteIds } : {}),
    });
    start = end;
  }
  return groups;
}
