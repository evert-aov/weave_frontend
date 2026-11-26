import type { DocumentNode } from '../engine/document-model';
import type { TableStyleRule } from '../models/word-document.model';
import type { ResolvedLayoutStyle } from '../engine/model-layout';

type ElementNode = Extract<DocumentNode, { kind: 'element' }>;
export const DEFAULT_TABLE_STYLE: TableStyleRule = {
  mode: 'inherit', fontFamily: 'Arial', fontSizePt: 11, lineHeight: 1.15,
  align: 'left', color: '#172033', backgroundColor: '#ffffff',
  borders: 'grid', borderColor: '#94a3b8', borderWidthPt: 0.5, cellPaddingPt: 4,
  header: true, headerBold: true, headerAlign: 'left', headerColor: '#172033',
  headerBackgroundColor: '#dbeafe', bandedRows: false, bandColor: '#f1f5f9', repeatHeader: true,
};

export function normalizeTableStyle(input?: Partial<TableStyleRule>): TableStyleRule {
  const rule = { ...DEFAULT_TABLE_STYLE, ...input };
  const number = (value: number, fallback: number, min: number, max: number) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  rule.fontSizePt = number(rule.fontSizePt, 11, 6, 96);
  rule.lineHeight = number(rule.lineHeight, 1.15, 1, 4);
  rule.borderWidthPt = number(rule.borderWidthPt, 0.5, 0, 6);
  rule.cellPaddingPt = number(rule.cellPaddingPt, 4, 0, 24);
  for (const key of ['color', 'backgroundColor', 'borderColor', 'headerColor', 'headerBackgroundColor', 'bandColor'] as const) {
    if (!/^#[\da-f]{6}$/i.test(rule[key])) rule[key] = DEFAULT_TABLE_STYLE[key];
  }
  if (!['inherit', 'preserve', 'custom'].includes(rule.mode)) rule.mode = 'inherit';
  if (!['grid', 'horizontal', 'none'].includes(rule.borders)) rule.borders = 'grid';
  for (const key of ['align', 'headerAlign'] as const) if (!['left', 'center', 'right', 'justify'].includes(rule[key])) rule[key] = 'left';
  const cleanedFont = typeof rule.fontFamily === 'string' ? rule.fontFamily.trim().replace(/[;{}<>]/g, '') : '';
  rule.fontFamily = cleanedFont && cleanedFont !== '[object Object]' ? cleanedFont : 'Arial';
  for (const key of ['header', 'headerBold', 'bandedRows', 'repeatHeader'] as const) if (typeof rule[key] !== 'boolean') rule[key] = DEFAULT_TABLE_STYLE[key];
  return rule;
}

export const isFixedTableStyle = (table: ElementNode): boolean => table.attributes['data-word-table-binding'] === 'fixed';
export const hasIndependentTableStyle = (table: ElementNode): boolean => Boolean(table.attributes['data-word-table-style']);
const css = (style = ''): Record<string, string> => Object.fromEntries(style.split(';').flatMap(part => {
  const colon = part.indexOf(':'); return colon < 0 ? [] : [[part.slice(0, colon).trim(), part.slice(colon + 1).trim()]];
}));
const serialize = (style: Record<string, string>): string => Object.entries(style).map(([key, value]) => `${key}: ${value}`).join('; ');

const isNeutralCellBg = (raw?: string): boolean => {
  if (!raw) return true;
  const v = raw.trim().toLowerCase();
  return !v || v === 'transparent' || v === 'none' || v === 'rgba(0, 0, 0, 0)' || v === '#ffffff' || v === '#fff' || v === 'rgb(255, 255, 255)';
};

const isExplicitBold = (raw?: string): boolean => {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'bold' || v === 'bolder' || Number(v) >= 600;
};

/** Pure model transform: table IDs, text, spans, column widths and objects survive styling. */
export function styleModelTable(
  table: ElementNode,
  input: TableStyleRule,
  binding: 'template' | 'fixed' = 'template',
  options?: { preserveExplicitCellFormatting?: boolean },
): ElementNode {
  const rule = normalizeTableStyle(input);
  if (rule.mode === 'inherit') return table;
  if (rule.mode === 'preserve') return { ...table, attributes: { ...table.attributes, 'data-word-table-style': table.attributes['data-word-table-style'] || 'preserve' } };
  const preserveCellFmt = Boolean(options?.preserveExplicitCellFormatting);

  const allTrs: { tr: ElementNode; inThead: boolean }[] = [];
  for (const child of table.children) {
    if (child.kind !== 'element') continue;
    if (child.tag === 'tr') allTrs.push({ tr: child, inThead: false });
    else if (['thead', 'tbody', 'tfoot'].includes(child.tag)) {
      for (const sub of child.children) {
        if (sub.kind === 'element' && sub.tag === 'tr') allTrs.push({ tr: sub, inThead: child.tag === 'thead' });
      }
    }
  }
  let detectedHeaderRows = 1;
  if (allTrs.length > 0) {
    let theadCount = 0;
    while (theadCount < allTrs.length && allTrs[theadCount].inThead) theadCount++;
    const firstCells = allTrs[0].tr.children.filter(
      (c): c is ElementNode => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
    );
    const firstRowMaxSpan = firstCells.reduce((m, c) => Math.max(m, Number(c.attributes['rowspan'] || 1)), 1);
    let leadingThRows = 0;
    if (preserveCellFmt) {
      while (leadingThRows < allTrs.length) {
        const cells = allTrs[leadingThRows].tr.children.filter(
          (c): c is ElementNode => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
        );
        if (cells.length > 0 && cells.every(c => c.tag === 'th')) leadingThRows++;
        else break;
      }
    }
    detectedHeaderRows = Math.min(allTrs.length, Math.max(1, theadCount, firstRowMaxSpan, leadingThRows));
  }
  const effectiveHeaderRows = rule.header ? detectedHeaderRows : 0;

  const border = rule.borderWidthPt > 0 ? `${rule.borderWidthPt}pt solid ${rule.borderColor}` : 'none';
  const tableCss = css(table.attributes['style']);
  for (const key of Object.keys(tableCss)) if (key.startsWith('border') || key === 'background') delete tableCss[key];
  Object.assign(tableCss, { border: 'none', 'border-collapse': 'collapse', 'max-width': '100%', 'font-family': rule.fontFamily,
    'font-size': `${rule.fontSizePt}pt`, 'line-height': String(rule.lineHeight), color: rule.color, 'background-color': rule.backgroundColor });
  const attributes = { ...table.attributes, style: serialize(tableCss), 'data-word-table-style': 'custom',
    'data-word-table-binding': binding, 'data-word-table-rule': JSON.stringify(rule),
    'data-word-table-padding': String(rule.cellPaddingPt * 96 / 72),
    'data-word-table-header-rows': String(effectiveHeaderRows), 'data-repeat-header': String(effectiveHeaderRows > 0 && rule.repeatHeader) };
  delete (attributes as Record<string, string>)['data-apa-table'];
  let row = 0;
  const contents = (nodes: readonly DocumentNode[], header: boolean, inheritedAlign?: string): readonly DocumentNode[] => nodes.map(node => {
    if (node.kind === 'text' || ['img', 'svg', 'table'].includes(node.tag) || (node.attributes['class'] || '').includes('word-latex')) return node;
    const style = css(node.attributes['style']);
    const prevAlign = preserveCellFmt ? (style['text-align'] || node.attributes['align']?.toLowerCase() || inheritedAlign) : undefined;
    const prevBold = preserveCellFmt && isExplicitBold(style['font-weight']);
    for (const key of ['font-family', 'font-size', 'line-height', 'color', 'background', 'background-color']) delete style[key];
    const attrs = { ...node.attributes };
    if (node.tag === 'font') { delete attrs['face']; delete attrs['size']; delete attrs['color']; }
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(node.tag)) Object.assign(style, {
      'font-family': rule.fontFamily, 'font-size': `${rule.fontSizePt}pt`, 'line-height': String(rule.lineHeight),
      'text-align': prevAlign && ['left', 'center', 'right', 'justify'].includes(prevAlign) ? prevAlign : (header ? rule.headerAlign : rule.align),
      color: header ? rule.headerColor : rule.color,
      'margin-top': '0pt', 'margin-bottom': '0pt', 'text-indent': '0pt',
      'font-weight': (header && rule.headerBold) || prevBold ? 'bold' : 'normal',
    });
    if ('data-word-line-spacing' in attrs) attrs['data-word-line-spacing'] = String(rule.lineHeight);
    attrs['style'] = serialize(style);
    return { ...node, attributes: attrs, children: contents(node.children, header, prevAlign) };
  });
  const visit = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => nodes.map(node => {
    if (node.kind === 'text' || node.tag === 'table') return node;
    if (node.tag === 'tr') {
      const current = row++;
      const header = current < effectiveHeaderRows;
      const band = rule.bandedRows && !header && (current - effectiveHeaderRows) % 2 === 1;
      const trCss = css(node.attributes['style']);
      const trBg = preserveCellFmt ? (trCss['background-color'] || trCss['background']) : undefined;
      const children = node.children.map(cell => {
        if (cell.kind !== 'element' || !['td', 'th'].includes(cell.tag)) return cell;
        const style = css(cell.attributes['style']);
        const prevCellBg = preserveCellFmt ? (style['background-color'] || style['background'] || trBg) : undefined;
        const prevCellAlign = preserveCellFmt ? (style['text-align'] || cell.attributes['align']?.toLowerCase()) : undefined;
        const prevCellBold = preserveCellFmt && (isExplicitBold(style['font-weight']) || cell.tag === 'th');
        for (const key of Object.keys(style)) if (key.startsWith('border') || key.startsWith('padding') || key === 'background') delete style[key];
        const resolvedAlign = prevCellAlign && ['left', 'center', 'right', 'justify'].includes(prevCellAlign)
          ? prevCellAlign
          : (header ? rule.headerAlign : rule.align);
        const resolvedBg = prevCellBg && !isNeutralCellBg(prevCellBg)
          ? prevCellBg
          : (header ? rule.headerBackgroundColor : band ? rule.bandColor : rule.backgroundColor);
        Object.assign(style, { border: rule.borders === 'grid' ? border : 'none',
          'border-top': rule.borders === 'horizontal' && current === 0 ? border : rule.borders === 'grid' ? border : 'none',
          'border-bottom': rule.borders === 'none' ? 'none' : border,
          padding: `${rule.cellPaddingPt}pt`, 'font-family': rule.fontFamily, 'font-size': `${rule.fontSizePt}pt`,
          'line-height': String(rule.lineHeight), 'text-align': resolvedAlign,
          color: header ? rule.headerColor : rule.color,
          'font-weight': (header && rule.headerBold) || prevCellBold ? 'bold' : 'normal',
          'background-color': resolvedBg });
        const attrs: Record<string, string> = { ...cell.attributes, style: serialize(style) }; delete attrs['data-word-top-border'];
        return { ...cell, attributes: attrs, children: contents(cell.children, header, prevCellAlign) };
      });
      const style = css(node.attributes['style']);
      for (const key of Object.keys(style)) if (key.startsWith('border') || key.startsWith('background')) delete style[key];
      return { ...node, attributes: { ...node.attributes, style: serialize(style) }, children };
    }
    const style = css(node.attributes['style']);
    for (const key of Object.keys(style)) if (key.startsWith('border') || key.startsWith('background')) delete style[key];
    return { ...node, attributes: { ...node.attributes, style: serialize(style) }, children: visit(node.children) };
  });
  return { ...table, attributes, children: visit(table.children) };
}

/** Materialize inherited metrics before document defaults change. No DOM measurement. */
export function preserveModelTable(table: ElementNode, styles: ReadonlyMap<string, ResolvedLayoutStyle>): ElementNode {
  const tableStyle = styles.get(table.id);
  const visit = (node: DocumentNode): DocumentNode => {
    if (node.kind === 'text' || ['img', 'svg'].includes(node.tag) || (node.attributes['class'] || '').includes('word-latex')) return node;
    const resolved = styles.get(node.id);
    const style = css(node.attributes['style']);
    const font = resolved?.font.match(/([\d.]+)px\s+(.+)$/);
    if (font) Object.assign(style, { 'font-size': `${font[1]}px`, 'font-family': font[2], 'font-weight': /(?:^|\s)700\s/.test(resolved!.font) ? 'bold' : 'normal', 'font-style': resolved!.font.includes('italic ') ? 'italic' : 'normal' });
    if (resolved) Object.assign(style, { 'line-height': `${resolved.lineHeight}px`, color: resolved.color, 'text-align': resolved.align || 'left' });
    if (['td', 'th'].includes(node.tag) && tableStyle?.border && !tableStyle.apaBorders) style['border'] = `${tableStyle.border}px solid ${tableStyle.color}`;
    const attrs = { ...node.attributes, style: serialize(style) };
    delete (attrs as Record<string, string>)['data-word-line-spacing'];
    return { ...node, attributes: attrs, children: node.children.map(visit) };
  };
  const frozen = visit(table) as ElementNode;
  return styleModelTable(frozen, { ...DEFAULT_TABLE_STYLE, mode: 'preserve' });
}
