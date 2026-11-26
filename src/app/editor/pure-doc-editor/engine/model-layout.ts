import type { DocumentNode, DocumentState } from './document-model';
import type { DocumentModelDomAdapter } from './document-model-dom';
import type { PageDrawCommand, TextShadowStyle, TextStrokeStyle } from './canvas-page-renderer';
import {
  layoutDocument,
  LayoutBlock,
  LayoutOptions,
  ParagraphBlock,
  ImageBlock,
  FormulaBlock,
  ColumnsBlock,
  FootnoteBlock,
  TextRun,
  TableCell,
  PageGeometry,
  MeasureText,
} from './document-layout';

/** Styles are resolved by the importer/theme layer, never inferred from DOM positions. */
export interface ResolvedLayoutStyle {
  font: string;
  color: string;
  lineHeight: number;
  before?: number;
  after?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  indentLeft?: number;
  indentRight?: number;
  firstLineIndent?: number;
  underline?: boolean;
  strike?: boolean;
  baselineOffset?: number;
  listMarker?: string;
  borderTop?: { width: number; color: string };
  borderRight?: { width: number; color: string };
  borderBottom?: { width: number; color: string };
  borderLeft?: { width: number; color: string };
  textShadow?: TextShadowStyle;
  textStroke?: TextStrokeStyle;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize';
  width?: number;
  height?: number;
  columns?: readonly number[];
  padding?: number;
  border?: number;
  apaBorders?: boolean;
  background?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

const INLINE_TAGS = new Set(['font', 'span', 'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'sub', 'sup', 'br', 'label', 'small', 'big', 'mark', 'abbr', 'cite', 'q', 'kbd', 'var', 'samp', 'time']);
const PARAGRAPH_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'figcaption']);
const CONTAINER_TAGS = new Set(['div', 'figure']);

const styleMapConfigKey = new WeakMap<ReadonlyMap<string, ResolvedLayoutStyle>, string>();
const rootStylesCache = new WeakMap<DocumentNode, Map<string, Map<string, ResolvedLayoutStyle>>>();
const rootBlocksCache = new WeakMap<DocumentNode, Map<string, LayoutBlock[]>>();

class CompositeStyleMap extends Map<string, ResolvedLayoutStyle> {
  constructor(private readonly partitions: readonly Map<string, ResolvedLayoutStyle>[]) {
    super();
  }
  override get(key: string): ResolvedLayoutStyle | undefined {
    const cached = super.get(key);
    if (cached !== undefined) return cached;
    for (let i = 0; i < this.partitions.length; i++) {
      const hit = this.partitions[i].get(key);
      if (hit !== undefined) {
        super.set(key, hit);
        return hit;
      }
    }
    return undefined;
  }
  override has(key: string): boolean {
    return this.get(key) !== undefined;
  }
}

function hasClass(node: DocumentNode, cls: string): boolean {
  return node.kind === 'element' && (node.attributes['class'] || '').split(/\s+/).includes(cls);
}

export function layoutModelDocument(
  state: DocumentState,
  geometry: PageGeometry,
  measure: MeasureText,
  styles: ReadonlyMap<string, ResolvedLayoutStyle>,
  options?: LayoutOptions,
) {
  const styleFor = (node: DocumentNode): ResolvedLayoutStyle => {
    const style = styles.get(node.id);
    if (!style) throw new Error(`Unresolved layout style: ${node.id}`);
    return style;
  };

  const runs = (node: DocumentNode, parent: ResolvedLayoutStyle, inPre = false, footnoteRefId?: string): TextRun[] => {
    const style = styles.get(node.id) || parent;
    const isPre = inPre || (node.kind === 'element' && node.tag === 'pre');
    const isNoteCall = node.kind === 'element' && Boolean(node.attributes['data-word-note-id']);
    const underline = style.underline || (node.kind === 'element' && (node.tag === 'u' || node.tag === 'ins' || (node.tag === 'a' && !isNoteCall)));
    const strike = style.strike || (node.kind === 'element' && ['s', 'strike', 'del'].includes(node.tag));
    const baselineOffset = style.baselineOffset ?? (node.kind === 'element' ? (node.tag === 'sub' ? 3 : node.tag === 'sup' ? -4 : undefined) : undefined);
    const activeFootnoteRefId =
      footnoteRefId ||
      (node.kind === 'element' && node.attributes['data-word-note-id'] && node.attributes['data-note-kind'] !== 'endnote'
        ? node.attributes['data-word-note-id']
        : undefined);
    const mergedStyle: ResolvedLayoutStyle = {
      ...style,
      underline,
      strike,
      baselineOffset,
    };
    if (node.kind === 'text') {
      let text = isPre ? node.text : node.text.replace(/[\r\n\t]/g, ' ');
      if (mergedStyle.textTransform === 'uppercase') text = text.toLocaleUpperCase();
      else if (mergedStyle.textTransform === 'lowercase') text = text.toLocaleLowerCase();
      else if (mergedStyle.textTransform === 'capitalize') {
        text = text.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
      }
      return [{
        nodeId: node.id,
        text,
        font: mergedStyle.font,
        color: mergedStyle.color,
        ...(activeFootnoteRefId ? { footnoteRefId: activeFootnoteRefId } : {}),
        ...(mergedStyle.underline ? { underline: true } : {}),
        ...(mergedStyle.strike ? { strike: true } : {}),
        ...(mergedStyle.background ? { background: mergedStyle.background } : {}),
        ...(mergedStyle.baselineOffset ? { baselineOffset: mergedStyle.baselineOffset } : {}),
        ...(mergedStyle.textShadow ? { textShadow: mergedStyle.textShadow } : {}),
        ...(mergedStyle.textStroke ? { textStroke: mergedStyle.textStroke } : {}),
      }];
    }
    if (node.tag === 'br') {
      return [{nodeId:node.id,text:'\n',font:style.font,color:style.color}];
    }
    if (node.tag === 'input') {
      const text = node.attributes['type'] === 'checkbox'
        ? ('checked' in node.attributes ? '[x]' : '[ ]')
        : '';
      return text ? [{nodeId:node.id,text,font:style.font,color:style.color}] : [];
    }
    if (node.tag === 'table') {
      // Inline table (e.g. LaTeX matrix \begin{pmatrix}...\end{pmatrix})
      const matrixRows: DocumentNode[] = [];
      for (const child of node.children) {
        if (child.kind !== 'element') continue;
        if (child.tag === 'tr') matrixRows.push(child);
        else if (['tbody', 'thead', 'tfoot'].includes(child.tag)) {
          matrixRows.push(...child.children.filter(n => n.kind === 'element' && n.tag === 'tr'));
        }
      }
      const outRuns: TextRun[] = [];
      matrixRows.forEach((row, rIdx) => {
        if (row.kind !== 'element') return;
        if (rIdx > 0) outRuns.push({ nodeId: row.id, text: ' ;  ', font: mergedStyle.font, color: mergedStyle.color });
        const cells = row.children.filter(c => c.kind === 'element' && ['td', 'th'].includes(c.tag));
        cells.forEach((cell, cIdx) => {
          if (cIdx > 0) outRuns.push({ nodeId: cell.id, text: '   ', font: mergedStyle.font, color: mergedStyle.color });
          outRuns.push(...runs(cell, mergedStyle, isPre));
        });
      });
      return outRuns;
    }
    if (node.tag === 'span' && (node.attributes['style'] || '').includes('flex-direction:column')) {
      const elChildren = node.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element');
      if (elChildren.length === 2 && (elChildren[0].attributes['style'] || '').includes('border-bottom')) {
        // Fraction \frac{num}{den}
        const numRuns = runs(elChildren[0], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) - 3 }, isPre);
        const denRuns = runs(elChildren[1], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) + 3 }, isPre);
        return [
          ...numRuns,
          { nodeId: node.id, text: ' / ', font: mergedStyle.font, color: mergedStyle.color },
          ...denRuns,
        ];
      }
      if (elChildren.length === 2 && (elChildren[0].attributes['style'] || '').includes('line-height:0.45')) {
        // Math accent (\dot, \ddot, \vec, \hat, \tilde)
        const accentRaw = runs(elChildren[0], mergedStyle, isPre).map(r => r.text).join('').trim();
        const combiningMap: Record<string, string> = { '˙': '\u0307', '¨': '\u0308', '→': '\u20d7', '^': '\u0302', '~': '\u0303' };
        const combining = combiningMap[accentRaw] || '';
        const baseRuns = runs(elChildren[1], mergedStyle, isPre);
        if (combining && baseRuns.length) {
          const last = baseRuns[baseRuns.length - 1];
          return [...baseRuns.slice(0, -1), { ...last, text: last.text + combining }];
        }
        return baseRuns;
      }
      if (elChildren.length >= 2) {
        // Stacked limits (\sum, \int, \prod, \lim) or simultaneous ^sup_sub
        const opIdx = elChildren.findIndex(c => (c.attributes['style'] || '').includes('font-size:1.55em') || (c.attributes['style'] || '').includes('font-size:1em'));
        if (opIdx >= 0) {
          const opRuns = runs(elChildren[opIdx], mergedStyle, isPre);
          const supRuns = opIdx > 0 ? runs(elChildren[0], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) - 5 }, isPre) : [];
          const subRuns = opIdx < elChildren.length - 1 ? runs(elChildren[elChildren.length - 1], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) + 4 }, isPre) : [];
          return [...opRuns, ...subRuns, ...supRuns];
        }
        if (elChildren.length === 2) {
          const supRuns = runs(elChildren[0], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) - 4 }, isPre);
          const subRuns = runs(elChildren[1], { ...mergedStyle, baselineOffset: (mergedStyle.baselineOffset ?? 0) + 4 }, isPre);
          return [...subRuns, ...supRuns];
        }
      }
    }
    if (node.tag === 'svg' || node.tag === 'ul' || node.tag === 'ol') {
      return [];
    }
    if (!PARAGRAPH_TAGS.has(node.tag) && !CONTAINER_TAGS.has(node.tag) && node.tag !== 'li' && !['td', 'th'].includes(node.tag) && !INLINE_TAGS.has(node.tag)) {
      throw new Error(`Unsupported inline layout: ${node.tag}`);
    }
    return node.children.flatMap(child => runs(child, mergedStyle, isPre, activeFootnoteRefId));
  };

  const toParagraph = (node: DocumentNode, style: ResolvedLayoutStyle, markerText?: string): ParagraphBlock => {
    if (
      node.kind === 'element' &&
      (hasClass(node, 'word-toc-entry') ||
        node.children.some(c => hasClass(c, 'word-toc-dots') || hasClass(c, 'docx-toc-leader') || hasClass(c, 'word-toc-page')))
    ) {
      const leftRuns: TextRun[] = [];
      const rightRuns: TextRun[] = [];
      let tocLeaderNodeId: string | undefined;
      let seenSplit = false;
      for (const child of node.children) {
        if (child.kind === 'text' && !child.text.trim()) continue;
        if (hasClass(child, 'word-toc-dots') || hasClass(child, 'docx-toc-leader')) {
          tocLeaderNodeId = child.id;
          seenSplit = true;
          continue;
        }
        if (hasClass(child, 'word-toc-page')) {
          seenSplit = true;
          rightRuns.push(...runs(child, style));
          continue;
        }
        if (seenSplit) rightRuns.push(...runs(child, style));
        else leftRuns.push(...runs(child, style));
      }
      const isTocEntry = hasClass(node, 'word-toc-entry') || node.attributes['data-word-toc'] === 'true';
      return {
        kind: 'paragraph',
        id: node.id,
        runs: leftRuns,
        ...(rightRuns.length ? { tocRightRuns: rightRuns } : {}),
        ...(tocLeaderNodeId ? { tocLeaderNodeId } : {}),
        lineHeight: style.lineHeight,
        before: style.before,
        after: style.after,
        align: style.align,
        indentLeft: style.indentLeft,
        indentRight: style.indentRight,
        firstLineIndent: style.firstLineIndent,
        background: style.background,
        ...(isTocEntry
          ? {}
          : {
              borderTop: style.borderTop,
              borderRight: style.borderRight,
              borderBottom: style.borderBottom,
              borderLeft: style.borderLeft,
            }),
      };
    }
    const extracted = runs(node, style);
    const hasEmptyPlaceholderOnly = extracted.length === 0 && node.kind === 'element';
    const firstEmptyText = node.kind === 'element' ? node.children.find(c => c.kind === 'text') : undefined;
    const finalRuns: readonly TextRun[] = hasEmptyPlaceholderOnly && firstEmptyText
      ? [{ nodeId: firstEmptyText.id, text: '', font: style.font, color: style.color }]
      : extracted;
    return {
      kind: 'paragraph',
      id: node.id,
      runs: finalRuns,
      lineHeight: style.lineHeight,
      before: style.before,
      after: style.after,
      align: style.align,
      indentLeft: style.indentLeft,
      indentRight: style.indentRight,
      firstLineIndent: style.firstLineIndent,
      background: style.background,
      borderTop: style.borderTop,
      borderRight: style.borderRight,
      borderBottom: style.borderBottom,
      borderLeft: style.borderLeft,
      ...(node.kind === 'element' && node.tag === 'pre' ? { preserveWhitespace: true } : {}),
      ...(markerText
        ? { marker: { text: markerText, font: style.font, color: style.color, offset: 16 } }
        : {}),
    };
  };

  interface MathBox {
    width: number;
    ascent: number;
    descent: number;
    commands: PageDrawCommand[];
  }

  const shiftMathCmd = (cmd: PageDrawCommand, dx: number, dy: number): PageDrawCommand =>
    cmd.kind === 'text'
      ? {
          ...cmd,
          x: cmd.x + dx,
          y: cmd.y + dy,
          source: cmd.source ? { ...cmd.source, top: cmd.source.top + dy } : undefined,
        }
      : { ...cmd, x: cmd.x + dx, y: cmd.y + dy };

  const layoutMathNode = (node: DocumentNode, parentStyle: ResolvedLayoutStyle): MathBox => {
    const style = styles.get(node.id) || parentStyle;
    const fontPx = parseFloat(style.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '18');
    if (node.kind === 'text') {
      if (!node.text.trim() && node.text.includes('\n')) {
        return { width: 0, ascent: 0, descent: 0, commands: [] };
      }
      const txt = node.text.replace(/[\r\n\t]+/g, ' ').replace(/\u00a0/g, ' ');
      if (!txt) {
        return { width: 0, ascent: 0, descent: 0, commands: [] };
      }
      let mathFont = style.font;
      const hasMathSymbol = /[\u2200-\u22FF\u2A00-\u2AFF\u2190-\u21FF\u0391-\u03C9\u2202\u2205\u2207\u2208\u2209\u220F\u2211\u2212\u221A\u221E\u2248\u2260\u2264\u2265]/.test(txt);
      if (hasMathSymbol && !mathFont.includes('DejaVu Math TeX Gyre')) {
        mathFont = mathFont.replace(
          /(?:["'][^"']+["']|[A-Za-z ]+)(?:,\s*.*)?$/,
          '"DejaVu Math TeX Gyre", "Noto Sans Math", "DejaVu Serif", "Times New Roman", serif',
        );
      }
      const m = measure(txt, mathFont);
      return {
        width: m.width,
        ascent: m.ascent,
        descent: m.descent,
        commands: [
          {
            kind: 'text',
            text: txt,
            font: mathFont,
            color: style.color,
            x: 0,
            y: 0,
            source: {
              start: { nodeId: node.id, offset: 0 },
              end: { nodeId: node.id, offset: node.text.length },
              top: -m.ascent,
              width: m.width,
              height: m.ascent + m.descent,
            },
          },
        ],
      };
    }

    const inlineCss = parseInlineCss(node.attributes['style']);
    const elChildren = node.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element');

    // 2D Matrix / Cases table inside formula
    if (node.tag === 'table') {
      const matrixRows: Extract<DocumentNode, { kind: 'element' }>[] = [];
      for (const child of node.children) {
        if (child.kind !== 'element') continue;
        if (child.tag === 'tr') matrixRows.push(child);
        else if (['tbody', 'thead', 'tfoot'].includes(child.tag)) {
          for (const tr of child.children) {
            if (tr.kind === 'element' && tr.tag === 'tr') matrixRows.push(tr);
          }
        }
      }
      const grid: MathBox[][] = matrixRows.map(tr =>
        tr.children
          .filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && ['td', 'th'].includes(c.tag))
          .map(cell => layoutMathChildren(cell.children, styles.get(cell.id) || style)),
      );
      const colCount = Math.max(0, ...grid.map(r => r.length));
      if (!grid.length || !colCount) return { width: 0, ascent: fontPx * 0.7, descent: fontPx * 0.2, commands: [] };
      const colWidths = Array.from({ length: colCount }, (_, c) =>
        Math.max(8, ...grid.map(r => r[c]?.width ?? 0)) + 10,
      );
      const rowAscents = grid.map(r => Math.max(fontPx * 0.65, ...r.map(cell => cell.ascent)) + 3);
      const rowDescents = grid.map(r => Math.max(fontPx * 0.22, ...r.map(cell => cell.descent)) + 3);
      const totalH = rowAscents.reduce((a, b) => a + b, 0) + rowDescents.reduce((a, b) => a + b, 0);
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      const axis = -fontPx * 0.3;
      const topY = axis - totalH / 2;
      const cmds: PageDrawCommand[] = [];
      let curY = topY;
      for (let r = 0; r < grid.length; r++) {
        const baselineY = curY + rowAscents[r];
        let curX = 0;
        for (let c = 0; c < grid[r].length; c++) {
          const cellBox = grid[r][c];
          const cx = curX + (colWidths[c] - cellBox.width) / 2;
          cmds.push(...cellBox.commands.map(cmd => shiftMathCmd(cmd, cx, baselineY)));
          curX += colWidths[c];
        }
        curY += rowAscents[r] + rowDescents[r];
      }
      return {
        width: totalW,
        ascent: Math.max(fontPx * 0.8, -topY),
        descent: Math.max(fontPx * 0.3, topY + totalH),
        commands: cmds,
      };
    }

    // Vertical column constructs: fractions (\frac), accents (\dot, \vec, \hat), stacked limits (\sum, \lim), binomials
    if ((inlineCss['flex-direction'] || '').includes('column') && elChildren.length >= 2) {
      const firstStyle = elChildren[0].attributes['style'] || '';
      const axis = -fontPx * 0.3;

      // 1) True 2D Fraction (\frac{num}{den})
      if (elChildren.length === 2 && firstStyle.includes('border-bottom')) {
        const numBox = layoutMathChildren(elChildren[0].children, styles.get(elChildren[0].id) || style);
        const denBox = layoutMathChildren(elChildren[1].children, styles.get(elChildren[1].id) || style);
        const padX = 5;
        const gapTop = 3;
        const gapBot = 3;
        const barH = 1.25;
        const barW = Math.max(numBox.width, denBox.width, 10) + padX * 2;
        const numBaseline = axis - gapTop - numBox.descent;
        const denBaseline = axis + barH + gapBot + denBox.ascent;
        const numX = (barW - numBox.width) / 2;
        const denX = (barW - denBox.width) / 2;
        const cmds: PageDrawCommand[] = [
          ...numBox.commands.map(cmd => shiftMathCmd(cmd, numX + 3, numBaseline)),
          {
            kind: 'rect',
            nodeId: node.id,
            x: 3,
            y: axis - barH / 2,
            width: barW,
            height: barH,
            color: style.color,
          },
          ...denBox.commands.map(cmd => shiftMathCmd(cmd, denX + 3, denBaseline)),
        ];
        return {
          width: barW + 6,
          ascent: Math.max(fontPx * 0.85, -(numBaseline - numBox.ascent) + 2),
          descent: Math.max(fontPx * 0.35, denBaseline + denBox.descent + 2),
          commands: cmds,
        };
      }

      // 2) Math Accent (\dot, \ddot, \vec, \hat, \tilde)
      if (elChildren.length === 2 && firstStyle.includes('line-height:0.45')) {
        const accentBox = layoutMathChildren(elChildren[0].children, styles.get(elChildren[0].id) || style);
        const baseBox = layoutMathChildren(elChildren[1].children, styles.get(elChildren[1].id) || style);
        const w = Math.max(accentBox.width, baseBox.width);
        const baseX = (w - baseBox.width) / 2;
        const accentX = (w - accentBox.width) / 2;
        const accentBaseline = -baseBox.ascent + accentBox.descent * 0.5 - 1;
        return {
          width: w,
          ascent: baseBox.ascent + accentBox.ascent * 0.65 + 2,
          descent: baseBox.descent,
          commands: [
            ...accentBox.commands.map(cmd => shiftMathCmd(cmd, accentX, accentBaseline)),
            ...baseBox.commands.map(cmd => shiftMathCmd(cmd, baseX, 0)),
          ],
        };
      }

      // 3) Stacked Big Operator (\sum, \prod, \lim, \int\limits) or Labeled Arrow (\xrightarrow)
      const opIdx = elChildren.findIndex(c => {
        const st = c.attributes['style'] || '';
        return st.includes('font-size:1.55em') || st.includes('font-size:1em') || st.includes('font-size:1.2em');
      });
      if (opIdx >= 0) {
        const opBox = layoutMathChildren(elChildren[opIdx].children, styles.get(elChildren[opIdx].id) || style);
        const supBox = opIdx > 0 ? layoutMathChildren(elChildren[0].children, styles.get(elChildren[0].id) || style) : null;
        const subBox =
          opIdx < elChildren.length - 1
            ? layoutMathChildren(elChildren[elChildren.length - 1].children, styles.get(elChildren[elChildren.length - 1].id) || style)
            : null;
        const w = Math.max(opBox.width, supBox?.width ?? 0, subBox?.width ?? 0) + 4;
        const cmds: PageDrawCommand[] = [
          ...opBox.commands.map(cmd => shiftMathCmd(cmd, (w - opBox.width) / 2, 0)),
        ];
        let ascent = opBox.ascent;
        let descent = opBox.descent;
        if (supBox) {
          const supBaseline = -opBox.ascent - supBox.descent - 1;
          cmds.push(...supBox.commands.map(cmd => shiftMathCmd(cmd, (w - supBox.width) / 2, supBaseline)));
          ascent = Math.max(ascent, -(supBaseline - supBox.ascent) + 2);
        }
        if (subBox) {
          const subBaseline = opBox.descent + subBox.ascent + 1;
          cmds.push(...subBox.commands.map(cmd => shiftMathCmd(cmd, (w - subBox.width) / 2, subBaseline)));
          descent = Math.max(descent, subBaseline + subBox.descent + 2);
        }
        return { width: w, ascent, descent, commands: cmds };
      }

      // 4) Binomial stack or simultaneous ^sup_sub column
      if (elChildren.length === 2) {
        const topBox = layoutMathChildren(elChildren[0].children, styles.get(elChildren[0].id) || style);
        const botBox = layoutMathChildren(elChildren[1].children, styles.get(elChildren[1].id) || style);
        const w = Math.max(topBox.width, botBox.width) + 2;
        const topBaseline = axis - 1.5 - topBox.descent;
        const botBaseline = axis + 1.5 + botBox.ascent;
        return {
          width: w,
          ascent: Math.max(fontPx * 0.78, -(topBaseline - topBox.ascent) + 1),
          descent: Math.max(fontPx * 0.28, botBaseline + botBox.descent + 1),
          commands: [
            ...topBox.commands.map(cmd => shiftMathCmd(cmd, (w - topBox.width) / 2, topBaseline)),
            ...botBox.commands.map(cmd => shiftMathCmd(cmd, (w - botBox.width) / 2, botBaseline)),
          ],
        };
      }
    }

    const inner = layoutMathChildren(node.children, style);

    // Top bar (radical vinculum \sqrt or \overline / \bar)
    if (inlineCss['border-top']) {
      const padX = 2;
      const barY = -inner.ascent - 1.5;
      const barW = inner.width + padX * 2;
      return {
        width: barW,
        ascent: inner.ascent + 3.5,
        descent: inner.descent,
        commands: [
          { kind: 'rect', nodeId: node.id, x: 0, y: barY, width: barW, height: 1.2, color: style.color },
          ...inner.commands.map(cmd => shiftMathCmd(cmd, padX, 0)),
        ],
      };
    }

    // Superscript <sup> and Subscript <sub>
    if (node.tag === 'sup' || node.tag === 'sub') {
      const parentPx = parseFloat(parentStyle.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '18');
      const shiftY = node.tag === 'sup' ? -Math.max(5, parentPx * 0.44) : Math.max(3.5, parentPx * 0.26);
      return {
        width: inner.width + 1,
        ascent: Math.max(0, inner.ascent - shiftY),
        descent: Math.max(0, inner.descent + shiftY),
        commands: inner.commands.map(cmd => shiftMathCmd(cmd, 0, shiftY)),
      };
    }

    return inner;
  };

  const layoutMathChildren = (children: readonly DocumentNode[], style: ResolvedLayoutStyle): MathBox => {
    let curX = 0;
    let maxAscent = 0;
    let maxDescent = 0;
    const cmds: PageDrawCommand[] = [];
    for (const child of children) {
      const box = layoutMathNode(child, style);
      if (box.width <= 0 && !box.commands.length) continue;
      cmds.push(...box.commands.map(cmd => shiftMathCmd(cmd, curX, 0)));
      curX += box.width;
      if (box.ascent > maxAscent) maxAscent = box.ascent;
      if (box.descent > maxDescent) maxDescent = box.descent;
    }
    return { width: curX, ascent: maxAscent, descent: maxDescent, commands: cmds };
  };

  const toFormulaBlock = (node: Extract<DocumentNode, { kind: 'element' }>, style: ResolvedLayoutStyle): FormulaBlock => {
    const renderedContainer =
      node.children.find(
        (c): c is Extract<DocumentNode, { kind: 'element' }> =>
          c.kind === 'element' && hasClass(c, 'word-latex-math-rendered'),
      ) || node;
    const containerStyle = styles.get(renderedContainer.id) || style;
    const lineNodes = renderedContainer.children.filter(
      (c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && c.tag === 'div',
    );
    const targets = lineNodes.length ? lineNodes : [renderedContainer];
    const lineBoxes = targets.map(line => layoutMathChildren(line.children, styles.get(line.id) || containerStyle));
    const maxWidth = Math.max(20, ...lineBoxes.map(b => b.width));
    const commands: PageDrawCommand[] = [];
    let curY = 4;
    for (const box of lineBoxes) {
      const asc = Math.max(12, box.ascent);
      const desc = Math.max(4, box.descent);
      const lineX = (maxWidth - box.width) / 2;
      const baselineY = curY + asc;
      commands.push(...box.commands.map(cmd => shiftMathCmd(cmd, lineX, baselineY)));
      curY += asc + desc + 6;
    }
    return {
      kind: 'formula',
      id: node.id,
      commands,
      width: maxWidth,
      height: Math.max(24, curY),
      before: style.before || 6,
      after: style.after || 6,
      align: 'center',
    };
  };

  const isFormulaNode = (n: DocumentNode): boolean =>
    n.kind === 'element' && (hasClass(n, 'word-latex-formula') || hasClass(n, 'word-latex-math-rendered'));

  const standaloneSvgFor = (n: DocumentNode): Extract<DocumentNode, { kind: 'element' }> | null => {
    if (n.kind !== 'element' || !INLINE_TAGS.has(n.tag)) return null;
    let svg: Extract<DocumentNode, { kind: 'element' }> | null = null;
    for (const child of n.children) {
      if (child.kind === 'text') {
        if (child.text.trim()) return null;
        continue;
      }
      if (child.tag === 'svg' && !svg) svg = child;
      else return null;
    }
    return svg;
  };

  const blocksFor = (node: DocumentNode): LayoutBlock[] => {
    if (node.kind === 'text') {
      const style = styleFor(node);
      return [toParagraph(node, style)];
    }
    if (INLINE_TAGS.has(node.tag)) {
      if ('data-weave-caret' in node.attributes) return [];
      const standaloneSvg = standaloneSvgFor(node);
      if (standaloneSvg) return blocksFor(standaloneSvg);
      return [toParagraph(node, styleFor(node))];
    }
    if (hasClass(node, 'word-latex-formula') || hasClass(node, 'word-latex-math-rendered')) {
      const style = styleFor(node);
      return [toFormulaBlock(node, style)];
    }
    if (node.tag === 'hr') {
      const style = styles.get(node.id) || { font: '12px serif', color: '#cbd5e1', lineHeight: 12 };
      return [{ kind: 'rule', nodeId: node.id, height: style.lineHeight || 12, thickness: 1.5, color: style.color || '#cbd5e1', before: style.before, after: style.after }];
    }
    if (node.tag === 'svg') {
      const serializeSvg = (n: DocumentNode): string => {
        if (n.kind === 'text') {
          return n.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        const attrsObj = n.tag === 'svg' && !n.attributes['xmlns']
          ? { xmlns: 'http://www.w3.org/2000/svg', ...n.attributes }
          : n.attributes;
        const attrs = Object.entries(attrsObj)
          .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
          .join(' ');
        const inner = n.children.map(serializeSvg).join('');
        return `<${n.tag}${attrs ? ' ' + attrs : ''}>${inner}</${n.tag}>`;
      };
      const style = styleFor(node);
      const w = parsePx(node.attributes['width'], style.width || 120);
      const h = parsePx(node.attributes['height'], style.height || 80);
      const svgMarkup = serializeSvg(node);
      return [{
        kind: 'image',
        nodeId: node.id,
        assetId: `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`,
        align: style.align === 'justify' ? 'left' : style.align,
        width: Math.max(12, w),
        height: Math.max(12, h),
      }];
    }
    if (node.attributes['data-word-note-list'] === 'footnote') {
      const items = node.children
        .filter(n => n.kind !== 'text' || n.text.trim())
        .flatMap(blocksFor)
        .filter((b): b is ParagraphBlock => b.kind === 'paragraph');
      if (!items.length) return [];
      const fnBlock: FootnoteBlock = { kind: 'footnote', nodeId: node.id, items };
      return [fnBlock];
    }
    if (hasClass(node, 'word-columns-section') || Boolean(node.attributes['data-word-columns'])) {
      const inlineCss = parseInlineCss(node.attributes['style']);
      const colPreset = node.attributes['data-word-columns'] || inlineCss['column-count'] || '2';
      let columns: number[] = [1, 1];
      if (colPreset === '3') columns = [1, 1, 1];
      else if (colPreset === 'left' || (inlineCss['grid-template-columns'] || '').includes('1fr 2fr')) columns = [1, 2];
      else if (colPreset === 'right' || (inlineCss['grid-template-columns'] || '').includes('2fr 1fr')) columns = [2, 1];

      const elementChildren = node.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element');
      const hasExplicitColumnDivs =
        elementChildren.length >= 2 &&
        elementChildren.every(c => c.tag === 'div' && !hasClass(c, 'word-latex-formula'));

      const columnGroups: LayoutBlock[][] = columns.map(() => []);
      if (hasExplicitColumnDivs) {
        elementChildren.slice(0, columns.length).forEach((colDiv, idx) => {
          columnGroups[idx] = colDiv.children.filter(n => n.kind !== 'text' || n.text.trim()).flatMap(blocksFor);
        });
      } else {
        const allItems = node.children.filter(n => n.kind !== 'text' || n.text.trim()).flatMap(blocksFor);
        const perCol = Math.max(1, Math.ceil(allItems.length / columns.length));
        for (let i = 0; i < columns.length; i++) {
          columnGroups[i] = allItems.slice(i * perCol, (i + 1) * perCol);
        }
      }
      const gap = colPreset === '3' ? 18 : 24;
      const colBlock: ColumnsBlock = {
        kind: 'columns',
        nodeId: node.id,
        columns,
        gap,
        ruleColor: '#cbd5e1',
        columnGroups,
      };
      return [colBlock];
    }
    if (node.tag === 'ul' || node.tag === 'ol') {
      const formatRoman = (num: number): string => {
        const vals: [number, string][] = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
        let rem = Math.max(1, Math.floor(num)), res = '';
        for (const [v, sym] of vals) { while (rem >= v) { res += sym; rem -= v; } }
        return res;
      };
      const formatAlpha = (num: number): string => {
        let rem = Math.max(1, Math.floor(num)), res = '';
        while (rem > 0) { rem--; res = String.fromCharCode(97 + (rem % 26)) + res; rem = Math.floor(rem / 26); }
        return res;
      };
      const bulletAtLevel = (lvl: number): string => ['•', '◦', '▪'][lvl % 3];
      const ordinalAtLevel = (ord: number, lvl: number): string => {
        const mod = lvl % 3;
        if (mod === 1) return `${formatAlpha(ord)}.`;
        if (mod === 2) return `${formatRoman(ord)}.`;
        return `${ord}.`;
      };

      const formatMarkerForStyle = (styleType: string | undefined, ord: number, lvl: number, isOrdered: boolean): string | undefined => {
        if (!styleType) return isOrdered ? ordinalAtLevel(ord, lvl) : bulletAtLevel(lvl);
        switch (styleType.toLowerCase()) {
          case 'none': return undefined;
          case 'disc': return '•';
          case 'circle': return '◦';
          case 'square': return '▪';
          case 'decimal': return `${ord}.`;
          case 'lower-alpha':
          case 'lower-latin': return `${formatAlpha(ord)}.`;
          case 'upper-alpha':
          case 'upper-latin': return `${formatAlpha(ord).toUpperCase()}.`;
          case 'lower-roman': return `${formatRoman(ord)}.`;
          case 'upper-roman': return `${formatRoman(ord).toUpperCase()}.`;
          default: return isOrdered ? ordinalAtLevel(ord, lvl) : bulletAtLevel(lvl);
        }
      };

      const collectListBlocks = (
        listNode: Extract<DocumentNode, { kind: 'element' }>,
        baseLevel: number,
        inheritedRootIndent?: number,
      ): LayoutBlock[] => {
        const listStyle = styles.get(listNode.id);
        const listStyleType = parseInlineCss(listNode.attributes['style'])['list-style-type']?.trim();
        const start = Number(listNode.attributes['start'] ?? 1);
        const counters = new Map<number, number>([[baseLevel, Number.isFinite(start) ? start : 1]]);
        let lastLevel = baseLevel;
        const items: LayoutBlock[] = [];
        const rootIndent =
          inheritedRootIndent ??
          (listStyle?.indentLeft && listStyle.indentLeft > 0 ? Math.max(listStyle.indentLeft, 20) : 28);

        for (const child of listNode.children) {
          if (child.kind === 'text' && !child.text.trim()) continue;
          if (child.kind === 'element' && (child.tag === 'ul' || child.tag === 'ol')) {
            items.push(...collectListBlocks(child, baseLevel + 1, rootIndent));
            continue;
          }
          if (child.kind !== 'element' || child.tag !== 'li') {
            if (child.kind === 'element') {
              items.push(...blocksFor(child));
            } else if (child.kind === 'text' && child.text.trim()) {
              items.push(toParagraph(child, listStyle || styleFor(listNode)));
            }
            continue;
          }
          const itemStyle = styles.get(child.id) || listStyle || styleFor(listNode);
          const itemListStyleType = parseInlineCss(child.attributes['style'])['list-style-type']?.trim() || (baseLevel === 0 ? listStyleType : undefined);
          const attrLevelRaw = child.attributes['data-list-level'];
          const attrLevel = attrLevelRaw !== undefined ? Number(attrLevelRaw) : NaN;
          const level = Number.isFinite(attrLevel) && attrLevel >= 0 ? baseLevel + Math.min(6, Math.floor(attrLevel)) : baseLevel;

          if (level < lastLevel) {
            for (const key of Array.from(counters.keys())) {
              if (key > level) counters.delete(key);
            }
          }
          let ordinal = counters.get(level) ?? (level === baseLevel && Number.isFinite(start) ? start : 1);
          const continued = 'data-word-continuation' in child.attributes;
          const explicitVal = child.attributes['value'] ? Number(child.attributes['value']) : undefined;
          if (explicitVal && Number.isFinite(explicitVal)) ordinal = explicitVal;

          const effectiveStyleType = level === baseLevel ? (itemListStyleType || listStyleType) : undefined;
          const marker = continued
            ? undefined
            : itemStyle.listMarker ?? formatMarkerForStyle(effectiveStyleType, ordinal, level, listNode.tag === 'ol');
          if (!continued) {
            counters.set(level, ordinal + 1);
          }
          lastLevel = level;

          const LEVEL_STEP_PX = 20;
          const progressiveIndent = rootIndent + level * LEVEL_STEP_PX;
          const explicitIndent = itemStyle.indentLeft && itemStyle.indentLeft > 0 ? itemStyle.indentLeft : 0;
          const effectiveIndent = Math.max(progressiveIndent, explicitIndent, 20);
          items.push(toParagraph(child, { ...itemStyle, indentLeft: effectiveIndent, firstLineIndent: 0 }, marker));

          for (const nested of child.children) {
            if (nested.kind === 'element' && (nested.tag === 'ul' || nested.tag === 'ol')) {
              items.push(...collectListBlocks(nested, level + 1, rootIndent));
            }
          }
        }
        return items;
      };

      return collectListBlocks(node, 0);
    }
    if (CONTAINER_TAGS.has(node.tag)) {
      const containerStyle = styles.get(node.id);
      const hasBlockChild = node.children.some(
        c => c.kind === 'element' && (PARAGRAPH_TAGS.has(c.tag) || CONTAINER_TAGS.has(c.tag) || isFormulaNode(c) || Boolean(standaloneSvgFor(c)) || ['ul', 'ol', 'table', 'img', 'hr', 'svg'].includes(c.tag))
      );
      if (hasBlockChild) {
        const blocks = node.children.filter(n => n.kind !== 'text' || n.text.trim()).flatMap(blocksFor);
        if (
          containerStyle &&
          !hasClass(node, 'word-toc-page-section') &&
          !hasClass(node, 'word-toc-header') &&
          !hasClass(node, 'word-toc-entry') &&
          node.attributes['data-word-toc'] !== 'true' &&
          node.attributes['data-native-word-toc'] !== 'true' &&
          (containerStyle.background || containerStyle.borderTop || containerStyle.borderRight || containerStyle.borderBottom || containerStyle.borderLeft)
        ) {
          const containerCss = parseInlineCss(node.attributes['style']);
          const padBox = parseCssBoxShorthand(containerCss['padding']);
          const padTop = parsePx(containerCss['padding-top'] || padBox.top, 0);
          const padBottom = parsePx(containerCss['padding-bottom'] || padBox.bottom, 0);
          const paraIndices = blocks.map((b, i) => (b.kind === 'paragraph' ? i : -1)).filter(i => i >= 0);
          const firstParaIdx = paraIndices[0];
          const lastParaIdx = paraIndices[paraIndices.length - 1];
          return blocks.map((b, idx) => {
            if (b.kind !== 'paragraph') return b;
            return {
              ...b,
              background: b.background ?? containerStyle.background,
              borderLeft: b.borderLeft ?? containerStyle.borderLeft,
              borderRight: b.borderRight ?? containerStyle.borderRight,
              ...(idx === firstParaIdx
                ? {
                    borderTop: b.borderTop ?? containerStyle.borderTop,
                    before: Math.max(b.before ?? 0, padTop),
                  }
                : {}),
              ...(idx === lastParaIdx
                ? {
                    borderBottom: b.borderBottom ?? containerStyle.borderBottom,
                    after: Math.max(b.after ?? 0, padBottom),
                  }
                : {}),
            };
          });
        }
        return blocks;
      }
      const style = styleFor(node);
      return [toParagraph(node, style)];
    }
    const style = styleFor(node);
    if (PARAGRAPH_TAGS.has(node.tag) || node.tag === 'li') {
      const isEmbeddedBlockChild = (c: DocumentNode): boolean =>
        c.kind === 'element' && (
          c.tag === 'img' ||
          c.tag === 'svg' ||
          c.tag === 'table' ||
          c.tag === 'hr' ||
          isFormulaNode(c) ||
          Boolean(standaloneSvgFor(c)) ||
          PARAGRAPH_TAGS.has(c.tag) ||
          (node.tag !== 'li' && (c.tag === 'ul' || c.tag === 'ol')) ||
          (CONTAINER_TAGS.has(c.tag) && !INLINE_TAGS.has(c.tag))
        );
      const hasBlockChild = node.children.some(isEmbeddedBlockChild);
      if (hasBlockChild) {
        const result: LayoutBlock[] = [];
        let inline: DocumentNode[] = [];
        const flush = () => {
          if (inline.length && inline.some(n => n.kind !== 'text' || n.text.trim())) {
            result.push(toParagraph({ ...node, children: inline }, style));
          }
          inline = [];
        };
        for (const child of node.children) {
          if (isEmbeddedBlockChild(child)) {
            flush();
            const svgTarget = standaloneSvgFor(child);
            result.push(...blocksFor(svgTarget ?? child));
          } else {
            inline.push(child);
          }
        }
        flush();
        return result.length ? result : [toParagraph(node, style, style.listMarker)];
      }
      return [toParagraph(node, style, style.listMarker)];
    }
    if (node.tag === 'img') {
      if (!node.attributes['src'] || !style.width || !style.height) throw new Error('Unresolved image resource/dimensions');
      return [{ kind: 'image', nodeId: node.id, assetId: node.attributes['src'], align: style.align==='justify'?'left':style.align, width: style.width, height: style.height }];
    }
    if (node.tag === 'table') {
      if (!style.columns) throw new Error('Unresolved table columns');
      const rows: DocumentNode[] = [];
      let headerRows = 0;
      let seenBodySection = false;
      for (const child of node.children) {
        if (child.kind === 'text' && !child.text.trim()) continue;
        if (child.kind === 'element' && ['colgroup', 'col', 'caption'].includes(child.tag)) continue;
        if (child.kind === 'element' && ['tbody', 'thead', 'tfoot'].includes(child.tag)) {
          const sectionRows = child.children.filter(n => n.kind === 'element');
          if (child.tag === 'thead' && !seenBodySection) {
            headerRows += sectionRows.length;
          } else if (sectionRows.length > 0) {
            seenBodySection = true;
          }
          rows.push(...sectionRows);
        } else if (child.kind === 'element' && child.tag === 'tr') {
          seenBodySection = true;
          rows.push(child);
        } else {
          throw new Error('Unsupported table structure');
        }
      }
      const repeatHeaderDisabled = node.attributes['data-repeat-header'] === 'false';
      const configuredHeaderRows = node.attributes['data-word-table-header-rows'];
      const effectiveHeaderRows = repeatHeaderDisabled ? 0 : configuredHeaderRows !== undefined ? Number(configuredHeaderRows) : headerRows;
      const rowIds = rows.map(r => r.id);
      const minRowHeights = rows.map(r => {
        if (r.kind !== 'element') return 0;
        const inline = parseInlineCss(r.attributes['style']);
        const hRaw = inline['height'] || r.attributes['height'];
        return parsePx(hRaw, 0);
      });
      return [{
        kind: 'table',
        nodeId: node.id,
        rowIds,
        columns: style.columns,
        padding: style.padding ?? 0,
        border: style.border ?? 0,
        color: style.color,
        ...(effectiveHeaderRows > 0 ? { headerRows: effectiveHeaderRows } : {}),
        ...(style.apaBorders ? { apaBorders: true } : {}),
        ...(minRowHeights.some(h => h > 0) ? { minRowHeights } : {}),
        rows: rows.map(row => {
          if (row.kind !== 'element' || row.tag !== 'tr') throw new Error('Invalid table row');
          return row.children.filter(n => n.kind !== 'text' || n.text.trim()).map(cell => {
            if (cell.kind !== 'element' || !['td', 'th'].includes(cell.tag)) throw new Error('Invalid table cell');
            const cellStyle = styleFor(cell);
            const blocks: (ParagraphBlock | ImageBlock)[] = [];
            let inlineRuns: TextRun[] = [];
            const flushInline = () => {
              if (inlineRuns.some(run => run.text.trim())) {
                blocks.push({ kind: 'paragraph', runs: inlineRuns, lineHeight: cellStyle.lineHeight, align: cellStyle.align });
              }
              inlineRuns = [];
            };
            for (const content of cell.children) {
              if (content.kind === 'text' || content.kind === 'element' && INLINE_TAGS.has(content.tag)) {
                inlineRuns.push(...runs(content, cellStyle));
              } else {
                flushInline();
                for (const item of blocksFor(content)) {
                  if (item.kind === 'table') throw new Error('Nested table layout is not supported');
                  if (item.kind === 'paragraph' || item.kind === 'image') blocks.push(item);
                }
              }
            }
            flushInline();
            if (!blocks.length) {
              const firstText = cell.children.find(c => c.kind === 'text');
              const firstBr = cell.children.find(c => c.kind === 'element' && c.tag === 'br');
              const emptyNodeId = firstText?.id ?? firstBr?.id ?? cell.id;
              blocks.push({
                kind: 'paragraph',
                id: emptyNodeId,
                runs: [{ nodeId: emptyNodeId, text: '', font: cellStyle.font, color: cellStyle.color }],
                lineHeight: cellStyle.lineHeight,
                align: cellStyle.align,
              });
            }
            const explicitTopBorder = cell.attributes['data-word-top-border'] === 'true'
              ? (cellStyle.borderTop ?? { width: 1, color: cellStyle.color || '#000000' })
              : (cellStyle.borderTop && !cellStyle.borderBottom && !cellStyle.borderLeft && !cellStyle.borderRight
                  ? cellStyle.borderTop
                  : undefined);
            return {
              blocks,
              colSpan: Number(cell.attributes['colspan'] || 1),
              rowSpan: Number(cell.attributes['rowspan'] || 1),
              background: cellStyle.background,
              ...(cellStyle.verticalAlign ? { verticalAlign: cellStyle.verticalAlign } : {}),
              explicitTopBorder,
              borderTop: cellStyle.borderTop,
              borderRight: cellStyle.borderRight,
              borderBottom: cellStyle.borderBottom,
              borderLeft: cellStyle.borderLeft,
            } satisfies TableCell;
          });
        }),
      }];
    }
    throw new Error(`Unsupported block layout: ${node.tag}`);
  };

  const configKey = styleMapConfigKey.get(styles);
  const blocksForRoot = (root: DocumentNode): LayoutBlock[] => {
    if (configKey === undefined) return blocksFor(root);
    let byKey = rootBlocksCache.get(root);
    if (!byKey) {
      byKey = new Map();
      rootBlocksCache.set(root, byKey);
    }
    const cached = byKey.get(configKey);
    if (cached) return cached;
    const computed = blocksFor(root);
    byKey.set(configKey, computed);
    return computed;
  };
  const allBlocks = state.roots.filter(n => n.kind !== 'text' || n.text.trim()).flatMap(blocksForRoot);
  const collectedFootnotes = options?.footnotes ?? collectModelFootnoteBlocks(state, styles);
  const effectiveBlocks =
    !options?.footnotes && collectedFootnotes.size > 0
      ? allBlocks.filter(b => b.kind !== 'footnote')
      : allBlocks;
  const effectiveOptions: LayoutOptions | undefined =
    !options?.footnotes && collectedFootnotes.size > 0
      ? { ...options, footnotes: collectedFootnotes }
      : options;
  const pages = layoutDocument(effectiveBlocks, geometry, measure, state.revision, effectiveOptions);
  return pages.map(page => ({ ...page, document: state }));
}

function collectNodePlainText(node: DocumentNode): string {
  if (node.kind === 'text') return node.text;
  return node.children.map(collectNodePlainText).join('');
}

/** Collects per-ID bottom-of-page footnote paragraph blocks from inline `[data-word-note-id]` call nodes. */
export function collectModelFootnoteBlocks(
  state: DocumentState,
  styles: ReadonlyMap<string, ResolvedLayoutStyle>,
): Map<string, readonly ParagraphBlock[]> {
  const footnotes = new Map<string, readonly ParagraphBlock[]>();
  let seq = 0;
  const visit = (nodes: readonly DocumentNode[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'element') continue;
      const fnId = node.attributes['data-word-note-id'];
      if (fnId && node.attributes['data-note-kind'] !== 'endnote' && !footnotes.has(fnId)) {
        seq += 1;
        const numText = collectNodePlainText(node).trim() || String(seq);
        const content = (node.attributes['data-note-content'] || '').replace(/\s+/g, ' ').trim();
        const nodeStyle = styles.get(node.id);
        const fontFamily = normalizeFontFamily(
          node.attributes['data-note-font'],
          nodeStyle?.font.replace(/^(?:(?:italic|oblique|bold|\d{3})\s+)*\d+(?:\.\d+)?px\s*/i, '').trim() || 'Times New Roman, Times, serif',
        );
        const baseSizePt = Number(node.attributes['data-note-font-size']) || 12;
        const fnSizePt = Math.max(8, baseSizePt - 2);
        const fnSizePx = Math.round(fnSizePt * (96 / 72));
        footnotes.set(fnId, [
          {
            kind: 'paragraph',
            id: `footnote-${fnId}`,
            runs: [
              {
                nodeId: '',
                text: numText,
                font: `700 ${Math.max(9, fnSizePx - 2)}px ${fontFamily}`,
                color: '#1e293b',
                baselineOffset: -2,
              },
              {
                nodeId: '',
                text: content ? ` ${content}` : '',
                font: `400 ${fnSizePx}px ${fontFamily}`,
                color: '#1e293b',
              },
            ],
            lineHeight: Math.max(12, Math.round(fnSizePx * 1.35)),
            before: 0,
            after: 3,
            align: 'left',
          },
        ]);
      }
      if (node.children.length) visit(node.children);
    }
  };
  visit(state.roots);
  return footnotes;
}

function parsePx(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return fallback;
  if (value.endsWith('pt')) return num * (96 / 72);
  if (value.endsWith('rem')) return num * 16;
  if (value.endsWith('em')) return num * (fallback > 0 ? fallback : 16);
  return num;
}

function parseInlineCss(styleAttr: string | undefined): Record<string, string> {
  if (!styleAttr) return {};
  const result: Record<string, string> = {};
  for (const part of styleAttr.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

const HEADING_SIZES_PX: Record<string, number> = {
  h1: 21.33,
  h2: 18.67,
  h3: 16,
  h4: 14.67,
  h5: 14.67,
  h6: 13.33,
};

const INHERIT_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
const TRANSPARENT_KEYWORDS = new Set([
  'transparent', 'none', 'auto', 'window', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
  'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)',
]);

function cssVal(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || INHERIT_KEYWORDS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function normalizeFontFamily(raw: string | undefined, fallback: string): string {
  const val = cssVal(raw);
  if (!val) return fallback;
  const cleaned = val
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !INHERIT_KEYWORDS.has(part.toLowerCase()))
    .map(part => {
      const bare = part.replace(/["']/g, '').trim().toLowerCase();
      if (bare === 'cambria math' || bare === 'latin modern math') {
        return '"DejaVu Math TeX Gyre"';
      }
      if (
        (part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'")) ||
        !part.includes(' ')
      ) {
        return part;
      }
      return `"${part.replace(/"/g, '')}"`;
    })
    .join(', ');
  return cleaned || fallback;
}

function splitCssTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseTextShadow(raw?: string): TextShadowStyle | undefined {
  const first = raw?.split(/,(?![^(]*\))/)[0]?.trim();
  if (!first || first === 'none') return undefined;
  const tokens = splitCssTokens(first);
  const lengths: number[] = [];
  const colorTokens: string[] = [];
  for (const token of tokens) {
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:px|pt|rem|em)?$/i.test(token)) {
      lengths.push(parsePx(token, 0));
    } else {
      colorTokens.push(token);
    }
  }
  if (lengths.length < 2) return undefined;
  return {
    offsetX: lengths[0] ?? 0,
    offsetY: lengths[1] ?? 0,
    blur: Math.max(0, lengths[2] ?? 0),
    color: colorTokens.join(' ') || 'rgba(15,23,42,0.28)',
  };
}

function parseTextStroke(raw?: string): TextStrokeStyle | undefined {
  const value = raw?.trim();
  if (!value || value === 'none') return undefined;
  const tokens = splitCssTokens(value);
  const widthToken = tokens.find(t => /^-?(?:\d+\.?\d*|\.\d+)(?:px|pt|rem|em)?$/i.test(t));
  const width = widthToken ? parsePx(widthToken, 0) : 0;
  if (width <= 0) return undefined;
  const color = tokens.filter(t => t !== widthToken).join(' ') || '#0f172a';
  return { width, color };
}

function parseCssBorder(raw?: string): { width: number; color: string } | null | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (value === 'none' || value === '0' || value === '0px') return null;
  const tokens = splitCssTokens(value);
  let width = 1;
  let hasWidth = false;
  let isNoneStyle = false;
  const colorTokens: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'none' || lower === 'hidden') {
      isNoneStyle = true;
    } else if (/^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(lower)) {
      continue;
    } else if (/^(thin|medium|thick)$/.test(lower)) {
      width = lower === 'thin' ? 1 : lower === 'medium' ? 2 : 3;
      hasWidth = true;
    } else if (/^-?(?:\d+\.?\d*|\.\d+)(?:px|pt|rem|em)?$/i.test(token)) {
      width = parsePx(token, 1);
      hasWidth = true;
    } else {
      colorTokens.push(token);
    }
  }
  if (isNoneStyle || (hasWidth && width <= 0)) return null;
  return { width: Math.max(0.5, width), color: colorTokens.join(' ') || '#94a3b8' };
}

function parseCssBoxShorthand(raw: string | undefined): { top?: string; right?: string; bottom?: string; left?: string } {
  if (!raw) return {};
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  if (parts.length >= 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  return {};
}

/** Pure non-DOM style resolver from document tags and inline CSS attributes. */
export function resolveDefaultModelStyles(
  state: DocumentState,
  defaults?: Partial<ResolvedLayoutStyle>,
): Map<string, ResolvedLayoutStyle> {
  const base: ResolvedLayoutStyle = {
    font: defaults?.font ?? '14.67px "Times New Roman", serif',
    color: defaults?.color ?? '#0f172a',
    lineHeight: defaults?.lineHeight ?? 18,
    align: defaults?.align ?? 'left',
    ...defaults,
  };
  const configKey = JSON.stringify(base);
  let targetMap = new Map<string, ResolvedLayoutStyle>();

  const hasDescendantTocMarker = (target: DocumentNode): boolean => {
    if (target.kind !== 'element') return false;
    if (
      hasClass(target, 'word-toc-title') ||
      hasClass(target, 'word-toc-entry') ||
      hasClass(target, 'word-toc-dots') ||
      hasClass(target, 'docx-toc-leader') ||
      hasClass(target, 'word-toc-page') ||
      hasClass(target, 'word-toc-header') ||
      target.attributes['data-word-toc'] === 'true'
    ) {
      return true;
    }
    return target.children.some(hasDescendantTocMarker);
  };

  const visitNode = (node: DocumentNode, inherited: ResolvedLayoutStyle, inTableCell = false, inToc = false, inStyledTable = false): void => {
    if (node.kind === 'text') {
      targetMap.set(node.id, inherited);
      return;
    }
    const insideCell = inTableCell || node.tag === 'td' || node.tag === 'th';
    const styledTable = inStyledTable || (node.tag === 'table' && Boolean(node.attributes['data-word-table-style']));
    const inline = parseInlineCss(node.attributes['style']);
    const isHeading = node.tag in HEADING_SIZES_PX;
    const isTocHeader = hasClass(node, 'word-toc-header');
    const isTocEntry = hasClass(node, 'word-toc-entry');
    const fw = cssVal(inline['font-weight']);
    const isBold = fw
      ? fw === 'bold' || fw === 'bolder' || Number(fw) >= 600
      : /(?:^|\s)(?:bold|[6-9]00)\s/.test(inherited.font) || isHeading || isTocHeader || ['b', 'strong', 'th'].includes(node.tag);
    const fs = cssVal(inline['font-style']);
    const isItalic = fs
      ? fs === 'italic' || fs === 'oblique'
      : inherited.font.includes('italic ') || ['i', 'em', 'blockquote'].includes(node.tag);
    const fontSizeAttr = cssVal(inline['font-size']);
    const inheritedSizePx = parsePx(inherited.font.match(/(\d+(?:\.\d+)?)px/)?.[1], 14.67);
    const fontSizePx = fontSizeAttr
      ? parsePx(fontSizeAttr, inheritedSizePx)
      : HEADING_SIZES_PX[node.tag] ?? (isTocHeader ? 18.67 : node.tag === 'pre' ? 13.33 : inheritedSizePx);
    const inheritedFamily = inherited.font.replace(/^.*?\d+(?:\.\d+)?px\s*/, '') || '"Times New Roman", serif';
    const fontFamily = normalizeFontFamily(
      inline['font-family'] || node.attributes['face'],
      node.tag === 'code' || node.tag === 'pre' ? '"JetBrains Mono", ui-monospace, Consolas, monospace' : inheritedFamily,
    );
    const font = `${isItalic ? 'italic ' : ''}${isBold ? '700 ' : ''}${Math.round(fontSizePx * 100) / 100}px ${fontFamily}`.trim();
    const colorAttr = cssVal(inline['color']);
    const validColor = colorAttr && !['windowtext', 'auto'].includes(colorAttr.toLowerCase()) ? colorAttr : undefined;
    const revKind = node.attributes['data-word-rev'];
    const revColor = node.tag === 'ins' || revKind === 'ins'
      ? '#15803d'
      : node.tag === 'del' || revKind === 'del'
        ? '#b91c1c'
        : undefined;
    const color = validColor || (node.tag === 'a' ? '#2563eb' : revColor ?? inherited.color);
    const WORD_AUTO_LINE_FACTOR = 1.15;
    const wordSpacingAttr = cssVal(node.attributes['data-word-line-spacing']);
    const wordSpacingMult = wordSpacingAttr ? parseFloat(wordSpacingAttr) : NaN;
    const lineHeightRaw = cssVal(inline['line-height']);
    const lineHeight = insideCell && !styledTable
      ? Math.round(fontSizePx * 1.1 * WORD_AUTO_LINE_FACTOR * 100) / 100
      : node.tag === 'pre' && !lineHeightRaw && !Number.isFinite(wordSpacingMult)
        ? Math.round(fontSizePx * 1.45 * 100) / 100
        : Number.isFinite(wordSpacingMult) && wordSpacingMult > 0 && wordSpacingMult <= 10
        ? Math.max(fontSizePx, Math.round(fontSizePx * wordSpacingMult * WORD_AUTO_LINE_FACTOR * 100) / 100)
        : lineHeightRaw
          ? (lineHeightRaw.endsWith('px') || lineHeightRaw.endsWith('pt')
              ? parsePx(lineHeightRaw, fontSizePx * 1.2)
              : Math.max(fontSizePx, Math.round(parseFloat(lineHeightRaw) * fontSizePx * WORD_AUTO_LINE_FACTOR * 100) / 100 || inherited.lineHeight))
          : Math.max(inherited.lineHeight, fontSizePx * 1.2);
    const alignAttr = (cssVal(inline['text-align']) || cssVal(node.attributes['align']) || (isTocHeader ? 'center' : inherited.align)) as ResolvedLayoutStyle['align'];
    const align: ResolvedLayoutStyle['align'] = ['left', 'center', 'right', 'justify'].includes(alignAttr || '') ? alignAttr : 'left';
    const textDecoration = cssVal(inline['text-decoration'] || inline['text-decoration-line']) || '';
    const underline = inherited.underline || node.tag === 'u' || node.tag === 'ins' || node.tag === 'a' || textDecoration.includes('underline');
    const strike = inherited.strike || ['s', 'strike', 'del'].includes(node.tag) || textDecoration.includes('line-through');
    const bgRaw = cssVal(inline['background-color'] || inline['background'] || node.attributes['bgcolor']);
    const validBg = bgRaw && !TRANSPARENT_KEYWORDS.has(bgRaw.toLowerCase()) ? bgRaw : undefined;
    const defaultCommentBg = ('data-word-comment-id' in node.attributes || hasClass(node, 'word-comment-anchor'))
      ? '#fef3c7'
      : undefined;
    const background = validBg ?? defaultCommentBg ?? inherited.background;
    const marginBox = parseCssBoxShorthand(cssVal(inline['margin']));
    const padBox = parseCssBoxShorthand(cssVal(inline['padding']));
    const marginTopAttr = cssVal(inline['margin-top']) ?? marginBox.top;
    const marginBottomAttr = cssVal(inline['margin-bottom']) ?? marginBox.bottom;
    const padTopAttr = cssVal(inline['padding-top']) ?? padBox.top;
    const padBottomAttr = cssVal(inline['padding-bottom']) ?? padBox.bottom;
    const isDirectLeafBox = node.tag === 'blockquote' || node.tag === 'pre';
    const before = insideCell
      ? 0
      : (marginTopAttr ? parsePx(marginTopAttr, 0) : (isHeading ? 8 : 0)) + (isDirectLeafBox && padTopAttr ? parsePx(padTopAttr, 0) : 0);
    const after = insideCell
      ? 0
      : (marginBottomAttr
          ? parsePx(marginBottomAttr, 0)
          : isTocHeader
            ? 16
            : isTocEntry
              ? (lineHeight >= fontSizePx * 1.6 ? 0 : 4)
              : node.tag === 'p' || isHeading
                ? 4
                : 0) + (isDirectLeafBox && padBottomAttr ? parsePx(padBottomAttr, 0) : 0);
    const textIndentAttr = cssVal(inline['text-indent']);
    const firstLineIndent = !insideCell && textIndentAttr && !('data-word-continuation' in node.attributes)
      ? parsePx(textIndentAttr, 0)
      : 0;
    const isTableStruct = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(node.tag);
    const padLeftAttr = cssVal(inline['padding-left']) ?? padBox.left;
    const marginLeftAttr = cssVal(inline['margin-left']) ?? marginBox.left;
    const indentLeft = isTableStruct
      ? 0
      : (inherited.indentLeft || 0) + (padLeftAttr ? parsePx(padLeftAttr, 0) : 0) + (marginLeftAttr ? parsePx(marginLeftAttr, 0) : 0);

    const padRightAttr = cssVal(inline['padding-right']) ?? padBox.right;
    const marginRightAttr = cssVal(inline['margin-right']) ?? marginBox.right;
    const indentRight = isTableStruct
      ? 0
      : (inherited.indentRight || 0) + (padRightAttr ? parsePx(padRightAttr, 0) : 0) + (marginRightAttr ? parsePx(marginRightAttr, 0) : 0);

    const vAlign = cssVal(inline['vertical-align']);
    const baselineOffset = inherited.baselineOffset ?? (
      vAlign === 'sub' || node.tag === 'sub' ? 3 :
      vAlign === 'super' || node.tag === 'sup' ? -4 :
      undefined
    );

    const textShadowAttr = cssVal(inline['text-shadow']);
    const textShadow = textShadowAttr
      ? (textShadowAttr === 'none' ? undefined : parseTextShadow(textShadowAttr))
      : inherited.textShadow;

    const textStrokeAttr = cssVal(inline['-webkit-text-stroke']);
    const textStroke = textStrokeAttr
      ? parseTextStroke(textStrokeAttr)
      : inherited.textStroke;

    const transformAttr = cssVal(inline['text-transform'])?.toLowerCase();
    const textTransform: ResolvedLayoutStyle['textTransform'] =
      transformAttr === 'uppercase' || transformAttr === 'lowercase' || transformAttr === 'capitalize'
        ? transformAttr
        : transformAttr === 'none'
          ? undefined
          : inherited.textTransform;

    const isTocElement =
      hasClass(node, 'word-toc-page-section') ||
      hasClass(node, 'word-toc-header') ||
      hasClass(node, 'word-toc-entry') ||
      node.attributes['data-word-toc'] === 'true' ||
      node.attributes['data-native-word-toc'] === 'true' ||
      node.attributes['data-toc-entry'] === 'true' ||
      (node.tag === 'table' && (hasClass(node, 'word-toc-table') || hasDescendantTocMarker(node)));
    const insideToc = inToc || isTocElement;

    let borderTop: ResolvedLayoutStyle['borderTop'];
    let borderRight: ResolvedLayoutStyle['borderRight'];
    let borderBottom: ResolvedLayoutStyle['borderBottom'];
    let borderLeft: ResolvedLayoutStyle['borderLeft'];
    let explicitBorderLeft = false;
    if (!INLINE_TAGS.has(node.tag) && !insideToc) {
      const borderAll = parseCssBorder(cssVal(inline['border']));
      if (borderAll !== undefined) {
        const val = borderAll ?? undefined;
        borderTop = val;
        borderRight = val;
        borderBottom = val;
        borderLeft = val;
        explicitBorderLeft = true;
      }
      const composeSideBorder = (side: 'top' | 'right' | 'bottom' | 'left'): string | undefined => {
        const direct = cssVal(inline[`border-${side}`]);
        if (direct !== undefined) return direct;
        const bw = cssVal(inline[`border-${side}-width`] || inline['border-width']);
        const bs = cssVal(inline[`border-${side}-style`] || inline['border-style']);
        const bc = cssVal(inline[`border-${side}-color`] || inline['border-color']);
        if (!bw && !bs && !bc) return undefined;
        if (bs === 'none' || bs === 'hidden') return 'none';
        return [bw || '1px', bs || 'solid', bc || '#94a3b8'].join(' ');
      };
      const bTop = parseCssBorder(composeSideBorder('top'));
      if (bTop !== undefined) borderTop = bTop ?? undefined;
      const bRight = parseCssBorder(composeSideBorder('right'));
      if (bRight !== undefined) borderRight = bRight ?? undefined;
      const bBottom = parseCssBorder(composeSideBorder('bottom'));
      if (bBottom !== undefined) borderBottom = bBottom ?? undefined;
      const bLeft = parseCssBorder(composeSideBorder('left'));
      if (bLeft !== undefined) {
        borderLeft = bLeft ?? undefined;
        explicitBorderLeft = true;
      }
    }

    const resolved: ResolvedLayoutStyle = {
      font,
      color,
      lineHeight,
      before,
      after,
      align,
      indentLeft,
      ...(indentRight ? { indentRight } : {}),
      firstLineIndent,
      underline,
      strike,
      ...(baselineOffset !== undefined ? { baselineOffset } : {}),
      ...(background ? { background } : {}),
      ...(textShadow ? { textShadow } : {}),
      ...(textStroke ? { textStroke } : {}),
      ...(textTransform ? { textTransform } : {}),
      ...(borderTop ? { borderTop } : {}),
      ...(borderRight ? { borderRight } : {}),
      ...(borderBottom ? { borderBottom } : {}),
      ...(borderLeft ? { borderLeft } : {}),
    };

    if (node.tag === 'td' || node.tag === 'th') {
      const vAlign = (cssVal(inline['vertical-align']) || cssVal(node.attributes['valign']))?.toLowerCase();
      if (vAlign === 'top' || vAlign === 'middle' || vAlign === 'bottom') {
        resolved.verticalAlign = vAlign;
      }
    }
    const hasExplicitBg = Boolean(cssVal(inline['background-color'] || inline['background'] || node.attributes['bgcolor']));
    const hasExplicitBorder = Boolean(
      cssVal(inline['border']) || cssVal(inline['border-top']) || cssVal(inline['border-right']) || cssVal(inline['border-bottom']) || cssVal(inline['border-left']),
    );
    if (node.tag === 'pre' && !hasExplicitBg && !hasExplicitBorder) {
      resolved.background = '#f1f5f9';
      resolved.borderTop = { width: 1, color: '#e2e8f0' };
      resolved.borderRight = { width: 1, color: '#e2e8f0' };
      resolved.borderBottom = { width: 1, color: '#e2e8f0' };
      resolved.borderLeft = { width: 1, color: '#e2e8f0' };
      resolved.indentLeft = Math.max(resolved.indentLeft || 0, 16);
      resolved.indentRight = Math.max(resolved.indentRight || 0, 16);
      resolved.before = Math.max(resolved.before || 0, 10);
      resolved.after = Math.max(resolved.after || 0, 10);
    }
    if (node.tag === 'blockquote' && !explicitBorderLeft) {
      resolved.indentLeft = (resolved.indentLeft || 0) + 16;
      resolved.borderLeft = { width: 3, color: '#3b82f6' };
    }
    if (node.tag === 'img' || node.tag === 'svg') {
      const vbParts = (node.attributes['viewBox'] || '').trim().split(/[\s,]+/).map(Number);
      const vbW = node.tag === 'svg' && vbParts.length === 4 && Number.isFinite(vbParts[2]) && vbParts[2] > 0 ? vbParts[2] : undefined;
      const vbH = node.tag === 'svg' && vbParts.length === 4 && Number.isFinite(vbParts[3]) && vbParts[3] > 0 ? vbParts[3] : undefined;
      resolved.width = parsePx(inline['width'] || node.attributes['width'], vbW ?? (node.tag === 'svg' ? 120 : 160));
      resolved.height = parsePx(inline['height'] || node.attributes['height'], vbH ?? (node.tag === 'svg' ? 80 : 120));
    }
    if (node.tag === 'table') {
      const trNodes: Extract<DocumentNode, { kind: 'element' }>[] = [];
      for (const child of node.children) {
        if (child.kind !== 'element') continue;
        if (child.tag === 'tr') trNodes.push(child);
        else if (['tbody', 'thead', 'tfoot'].includes(child.tag)) {
          for (const rc of child.children) {
            if (rc.kind === 'element' && rc.tag === 'tr') trNodes.push(rc);
          }
        }
      }
      const rowCells = (tr: Extract<DocumentNode, { kind: 'element' }>) =>
        tr.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && ['td', 'th'].includes(c.tag));
      let colCount = 1;
      const occ: boolean[][] = [];
      for (let r = 0; r < trNodes.length; r++) {
        occ[r] ||= [];
        let cIdx = 0;
        for (const cell of rowCells(trNodes[r])) {
          while (occ[r][cIdx]) cIdx++;
          const cs = Math.max(1, Number(cell.attributes['colspan'] || 1));
          const rs = Math.max(1, Math.min(trNodes.length - r, Number(cell.attributes['rowspan'] || 1)));
          for (let dr = 0; dr < rs; dr++) {
            occ[r + dr] ||= [];
            for (let dc = 0; dc < cs; dc++) occ[r + dr][cIdx + dc] = true;
          }
          cIdx += cs;
        }
        while (occ[r][cIdx]) cIdx++;
        if (cIdx > colCount) colCount = cIdx;
      }
      const unmergedRowWithWidths = trNodes.find(tr => {
        const cells = rowCells(tr);
        return cells.length === colCount &&
          cells.every(c => Math.max(1, Number(c.attributes['colspan'] || 1)) === 1) &&
          cells.some(c => Boolean(parseInlineCss(c.attributes['style'])['width'] || c.attributes['width']));
      });
      const weightRow = unmergedRowWithWidths || trNodes[0];
      const colNodes: Extract<DocumentNode, { kind: 'element' }>[] = [];
      for (const child of node.children) {
        if (child.kind !== 'element') continue;
        if (child.tag === 'col') colNodes.push(child);
        else if (child.tag === 'colgroup') {
          for (const cc of child.children) {
            if (cc.kind === 'element' && cc.tag === 'col') colNodes.push(cc);
          }
        }
      }
      const colWeights: number[] = [];
      for (const col of colNodes) {
        const span = Math.max(1, Number(col.attributes['span'] || 1));
        const wRaw = parseInlineCss(col.attributes['style'])['width'] || col.attributes['width'];
        const w = wRaw ? parseFloat(wRaw) : NaN;
        for (let s = 0; s < span; s++) {
          colWeights.push(Number.isFinite(w) && w > 0 ? w : 0);
        }
      }
      if (colWeights.length === colCount && colWeights.every(w => w > 0)) {
        resolved.columns = colWeights;
      } else if (weightRow) {
        const cellWeights: number[] = [];
        for (const c of weightRow.children) {
          if (c.kind !== 'element' || !['td', 'th'].includes(c.tag)) continue;
          const span = Math.max(1, Number(c.attributes['colspan'] || 1));
          const wRaw = parseInlineCss(c.attributes['style'])['width'] || c.attributes['width'];
          const w = wRaw ? parseFloat(wRaw) : NaN;
          for (let s = 0; s < span; s++) {
            cellWeights.push(Number.isFinite(w) && w > 0 ? w / span : 0);
          }
        }
        resolved.columns = cellWeights.length === colCount && cellWeights.every(w => w > 0)
          ? cellWeights
          : Array.from({ length: colCount }, () => 1);
      } else {
        resolved.columns = Array.from({ length: colCount }, () => 1);
      }
      resolved.padding = 2;
      const isTocTable = insideToc;
      const borderStyle = (inline['border-style'] || '').toLowerCase();
      const explicitTableBorderNone =
        inline['border'] === 'none' ||
        inline['border'] === '0' ||
        node.attributes['border'] === '0' ||
        borderStyle === 'none';
      const isApaTable =
        !isTocTable && node.attributes['data-word-table-style'] !== 'custom' &&
        (node.attributes['data-apa-table'] === 'true' ||
          borderStyle === 'solid none' ||
          (inline['border'] === 'none' && Boolean(inline['border-top'] || inline['border-bottom'])) ||
          (!styledTable && Boolean(defaults?.apaBorders)));

      if (node.attributes['data-word-table-style'] === 'custom') {
        resolved.apaBorders = false;
        resolved.border = 0;
        const padding = Number(node.attributes['data-word-table-padding']);
        if (Number.isFinite(padding) && padding >= 0 && node.attributes['data-word-table-padding'] !== undefined) resolved.padding = padding;
      } else if (isApaTable) {
        resolved.border = 1;
        resolved.apaBorders = true;
      } else if (isTocTable || explicitTableBorderNone) {
        resolved.border = 0;
      } else {
        resolved.border = 1;
      }
    }

    targetMap.set(node.id, resolved);
    const childInherited: ResolvedLayoutStyle = INLINE_TAGS.has(node.tag)
      ? resolved
      : {
          ...resolved,
          background: ['tr', 'thead', 'tbody', 'tfoot'].includes(node.tag) ? resolved.background : undefined,
          before: 0,
          after: 0,
          firstLineIndent: 0,
          borderTop: undefined,
          borderRight: undefined,
          borderBottom: undefined,
          borderLeft: undefined,
        };
    for (const child of node.children) {
      visitNode(child, childInherited, insideCell, insideToc, styledTable);
    }
  };

  const partitions: Map<string, ResolvedLayoutStyle>[] = [];
  for (const root of state.roots) {
    let byKey = rootStylesCache.get(root);
    if (!byKey) {
      byKey = new Map();
      rootStylesCache.set(root, byKey);
    }
    let rootMap = byKey.get(configKey);
    if (!rootMap) {
      targetMap = new Map<string, ResolvedLayoutStyle>();
      visitNode(root, base);
      rootMap = targetMap;
      byKey.set(configKey, rootMap);
    }
    partitions.push(rootMap);
  }
  const styles = new CompositeStyleMap(partitions);
  styleMapConfigKey.set(styles, configKey);
  return styles;
}

/** Cached Canvas 2D text measurer that never touches DOM layout or Range rects. */
export function createCanvasTextMeasurer(context?: CanvasRenderingContext2D | null): MeasureText {
  const ctx = context ?? (typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null);
  const cache = new Map<string, { width: number; ascent: number; descent: number }>();
  let currentFont = '';
  return (text: string, font: string) => {
    const key = `${font}\0${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
    const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) : 14;
    const fallbackAscent = fontSize * 0.78;
    const fallbackDescent = fontSize * 0.22;
    if (!ctx || typeof ctx.measureText !== 'function') {
      const fallback = { width: [...text].length * (fontSize * 0.55), ascent: fallbackAscent, descent: fallbackDescent };
      cache.set(key, fallback);
      return fallback;
    }
    if (currentFont !== font) {
      ctx.font = font;
      currentFont = font;
    }
    const m = ctx.measureText(text);
    const width = Number.isFinite(m.width) && m.width >= 0 ? m.width : [...text].length * (fontSize * 0.55);
    const ascent = Number.isFinite(m.fontBoundingBoxAscent) && m.fontBoundingBoxAscent > 0
      ? m.fontBoundingBoxAscent
      : fallbackAscent;
    const descent = Number.isFinite(m.fontBoundingBoxDescent) && m.fontBoundingBoxDescent >= 0
      ? m.fontBoundingBoxDescent
      : fallbackDescent;
    const metrics = { width, ascent, descent };
    if (cache.size > 8000) cache.clear();
    cache.set(key, metrics);
    return metrics;
  };
}
