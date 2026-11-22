import { domObjectDisplay } from './dom-object-display';
import { DocumentModelDomAdapter } from './document-model-dom';
import { PageDisplayList, PageDrawCommand } from './canvas-page-renderer';
import { caretForPosition, selectionRectsForRange } from './canvas-caret';
import { createCanvasTextMeasurer, layoutModelDocument, resolveDefaultModelStyles } from './model-layout';

const supported = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'A', 'CODE', 'PRE', 'BLOCKQUOTE', 'HR',
  'BR', 'DIV',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'COLGROUP', 'COL', 'CAPTION',
  'IMG', 'FIGURE', 'FIGCAPTION',
]);

const modelSupported = new Set([
  ...supported,
  'UL', 'OL', 'LI',
]);

/** Initial text backend: unsupported decoration/layout falls back to the editable DOM. */
export function buildDomDisplayList(body: HTMLElement, revision: number, adapter = new DocumentModelDomAdapter()): PageDisplayList | null {
  // Bound synchronous DOM measurement until line-level layout replaces glyph sampling.
  if ((body.textContent?.length || 0) > 6000) return null;
  if (!body.clientWidth || !body.clientHeight || !document.fonts?.check(getComputedStyle(body).font || '12px serif')) return null;
  for (const node of Array.from(body.querySelectorAll<HTMLElement>('*'))) {
    const style = getComputedStyle(node);
    const deco = style.textDecorationLine || '';
    const unsupportedDeco = deco !== 'none' && deco !== '' && !deco.split(/\s+/).every(d => d === 'underline' || d === 'line-through');
    if (
      !supported.has(node.tagName) ||
      unsupportedDeco ||
      (style.textShadow && style.textShadow !== 'none') ||
      style.direction === 'rtl' ||
      (style.writingMode && style.writingMode !== 'horizontal-tb')
    ) {
      return null;
    }
  }
  const box = body.getBoundingClientRect(), scale = box.width / body.clientWidth;
  if (!(scale > 0)) return null;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;
  const documentState = adapter.capture(body, revision);
  const objects = domObjectDisplay(body, scale);
  if (!objects) return null;
  const commands: PageDrawCommand[] = [...objects.commands];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text, parent = text.parentElement!;
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.textTransform !== 'none' && style.textTransform !== '') return null;
    const font = style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    measure.font = font;
    const metrics = measure.measureText('Mg');
    if (!Number.isFinite(metrics.fontBoundingBoxAscent)) return null;
    const deco = style.textDecorationLine || '';
    const hasUnderline = deco.includes('underline') || !!parent.closest('u,a');
    const hasStrike = deco.includes('line-through') || !!parent.closest('s,strike,del');
    for (const part of segmenter.segment(text.data)) {
      const range = document.createRange();
      range.setStart(text, part.index);
      range.setEnd(text, part.index + part.segment.length);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const x = (rect.left - box.left) / scale;
      const top = (rect.top - box.top) / scale;
      const width = rect.width / scale;
      const height = rect.height / scale;
      const baseline = top + metrics.fontBoundingBoxAscent;
      commands.push({
        kind: 'text',
        text: part.segment,
        x,
        y: baseline,
        font,
        color: style.color,
        source: {
          start: adapter.position(text, part.index)!,
          end: adapter.position(text, part.index + part.segment.length)!,
          top,
          width,
          height,
        },
      });
      if (hasUnderline) {
        commands.push({ kind: 'rect', x, y: baseline + 1.5, width, height: 1, color: style.color });
      }
      if (hasStrike) {
        commands.push({ kind: 'rect', x, y: baseline - Math.max(3, metrics.fontBoundingBoxAscent * 0.35), width, height: 1, color: style.color });
      }
    }
  }
  return {
    id: body.dataset['pageBodyId'] || '',
    revision,
    width: body.clientWidth,
    height: body.clientHeight,
    commands,
    document: documentState,
    assets: objects.assets,
  };
}

/**
 * Pure model-driven display list builder without DOM Range measurement.
 * Computes layout, glyph boxes, logical caret and selection highlights via Canvas 2D metrics.
 */
export function buildModelPageDisplayList(
  body: HTMLElement,
  revision: number,
  adapter = new DocumentModelDomAdapter(),
): PageDisplayList | null {
  if (!body.clientWidth || !body.clientHeight || !document.fonts?.check(getComputedStyle(body).font || '12px serif')) return null;
  const assets = new Map<string, CanvasImageSource>();
  for (const node of Array.from(body.querySelectorAll<HTMLElement>('*'))) {
    if (!modelSupported.has(node.tagName)) return null;
    if (node.getAttribute('contenteditable') === 'false') return null;
    const style = getComputedStyle(node);
    if (style.direction === 'rtl' || (style.writingMode && style.writingMode !== 'horizontal-tb')) return null;
    if (node instanceof HTMLImageElement) {
      if (!node.complete || !node.naturalWidth || !node.naturalHeight) return null;
      assets.set(node.currentSrc || node.src || node.getAttribute('src') || '', node);
    }
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  const measurer = createCanvasTextMeasurer(measureCtx);
  const state = adapter.capture(body, revision);
  const bodyStyle = getComputedStyle(body);
  const apaIndent = body.classList.contains('word-apa-body') ? 48 : 0;
  const styles = resolveDefaultModelStyles(state, {
    font: bodyStyle.font || '14.67px "Times New Roman", serif',
    color: bodyStyle.color || '#0f172a',
    lineHeight: parseFloat(bodyStyle.lineHeight) || 18,
    firstLineIndent: apaIndent,
  });
  try {
    const laidOut = layoutModelDocument(
      state,
      { width: body.clientWidth, height: body.clientHeight, top: 0, right: 0, bottom: 0, left: 0 },
      measurer,
      styles,
      { allowOversized: true, pageIds: [body.dataset['pageBodyId'] || 'page-0'] },
    );
    const page = laidOut[0];
    if (!page) return null;
    const sel = state.selection;
    const isCollapsed = sel && sel.anchor.nodeId === sel.focus.nodeId && sel.anchor.offset === sel.focus.offset;
    const caret = sel ? caretForPosition(page, sel.focus) : undefined;
    const selections = sel && !isCollapsed ? selectionRectsForRange(page, sel) : undefined;
    return {
      ...page,
      id: body.dataset['pageBodyId'] || page.id,
      document: state,
      assets,
      ...(caret ? { caret } : {}),
      ...(selections?.length ? { selections } : {}),
    };
  } catch {
    return null;
  }
}
