import type { DocumentSectionState } from '../engine/document-engine';
import { DocumentNode, findNodeById, textNodes } from '../engine/document-model';
import { htmlToDocumentState } from '../engine/document-model-dom';
import type { BibliographicSource, CaptionRequest, CitationRequest, AcademicObject } from '../models/academic.model';
import type { AcademicNoteRequest, AcademicSectionRequest, ApaIssue } from '../models/academic-sections.model';
import type {
  DocumentLayoutConfig,
  PageBorderConfig,
  PageMarginsConfig,
  PaperFormatId,
  StyleTargetTag,
  StyleTemplate,
  TableStyleRule,
} from '../models/word-document.model';
import { MARGIN_PRESETS, PAPER_FORMAT_PRESETS } from '../constants/word-document.constants';
import { richTextHtml } from '../../../core/utils/ai-edit-text';
import { DEFAULT_TABLE_STYLE, normalizeTableStyle, styleModelTable } from './table-styling';

export const WORD_CONTROL_TARGET = 'word:control';

export interface WordControlSummaryInput {
  noteId?: string;
  title: string;
  layoutConfig: DocumentLayoutConfig;
  activeTemplateId: string;
  styleTemplates: readonly StyleTemplate[];
  headingNumbering: boolean;
  activePageIndex: number;
  pageCount: number;
  sections?: readonly DocumentSectionState[];
  bibliographicSources?: readonly BibliographicSource[];
  academicObjects?: readonly AcademicObject[];
  apaIssues?: readonly ApaIssue[];
}

export interface WordControlHost {
  renameDocument(title: string): void;
  updateLayout(updater: (prev: DocumentLayoutConfig) => DocumentLayoutConfig): void;
  applyTemplateById(templateId: string, customTemplate?: Partial<StyleTemplate>): boolean;
  setHeadingNumbering(enabled: boolean): void;
  insertOrUpdateFormula(latex: string, nodeId?: string, afterNodeId?: string, pageIndex?: number): boolean;
  deleteFormula(nodeId: string): boolean;
  updateToc(insertIfMissing?: boolean): void;
  addOrUpdateSource(source: Partial<BibliographicSource>): void;
  removeSource(sourceId: string): void;
  insertCitation(request: CitationRequest): void;
  insertBibliography(): void;
  updateAcademic(): void;
  applyCaption(request: CaptionRequest): void;
  insertAcademicSection(request: AcademicSectionRequest): void;
  addAcademicNote(request: AcademicNoteRequest): void;
  addBlankPage(afterIndex?: number): boolean;
  insertPageBreak(atIndex?: number): boolean;
  buildFormulaHtml?(latex: string): string;
}

let wordAiSeq = 0;
function nextWordAiId(prefix = 'w'): string {
  wordAiSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${wordAiSeq}`;
}

function fingerprintText(text: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeImageUrl(src: string): string | null {
  const trimmed = String(src || '').trim();
  if (/^(?:https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function parseStyleString(raw = ''): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (key && val) map[key] = val;
  }
  return map;
}

function serializeStyleMap(map: Record<string, string | null | undefined>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join('; ');
}

function patchNodeStyle(
  attrs: Readonly<Record<string, string>>,
  patch: Record<string, string | null | undefined>,
): Record<string, string> {
  const merged: Record<string, string | null | undefined> = { ...parseStyleString(attrs['style'] || ''), ...patch };
  const nextStyle = serializeStyleMap(merged);
  const out = { ...attrs };
  if (nextStyle) out['style'] = nextStyle;
  else delete out['style'];
  return out;
}

function htmlStringToNodes(html: string): readonly DocumentNode[] {
  return htmlToDocumentState(html).roots;
}

function summarizeMediaAndTables(sections: readonly DocumentSectionState[] = []): {
  wordCount: number;
  headingsCount: number;
  tables: { nodeId: string; rows: number; cols: number; preview: string }[];
  images: { nodeId: string; src: string; alt: string; style: string }[];
  formulas: { nodeId: string; latex: string }[];
} {
  let wordCount = 0;
  let headingsCount = 0;
  const tables: { nodeId: string; rows: number; cols: number; preview: string }[] = [];
  const images: { nodeId: string; src: string; alt: string; style: string }[] = [];
  const formulas: { nodeId: string; latex: string }[] = [];

  const visit = (nodes: readonly DocumentNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'text') {
        const words = node.text.trim().split(/\s+/).filter(Boolean).length;
        wordCount += words;
        continue;
      }
      if (/^h[1-6]$/.test(node.tag) || 'data-apa-heading-level' in node.attributes) {
        headingsCount++;
      }
      if (node.tag === 'img') {
        images.push({
          nodeId: node.id,
          src: (node.attributes['src'] || '').slice(0, 140),
          alt: node.attributes['alt'] || '',
          style: node.attributes['style'] || '',
        });
        continue;
      }
      if ('data-latex' in node.attributes) {
        formulas.push({
          nodeId: node.id,
          latex: node.attributes['data-latex'] || '',
        });
        continue;
      }
      if (node.tag === 'table') {
        const preview = textNodes([node]).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        let rowCount = 0;
        let maxCols = 0;
        const countRows = (children: readonly DocumentNode[]) => {
          for (const ch of children) {
            if (ch.kind !== 'element') continue;
            if (ch.tag === 'tr') {
              rowCount++;
              const c = ch.children.filter(x => x.kind === 'element' && (x.tag === 'td' || x.tag === 'th')).length;
              if (c > maxCols) maxCols = c;
            } else if (ch.tag === 'thead' || ch.tag === 'tbody' || ch.tag === 'tfoot') {
              countRows(ch.children);
            }
          }
        };
        countRows(node.children);
        tables.push({ nodeId: node.id, rows: rowCount, cols: maxCols, preview });
      }
      visit(node.children);
    }
  };

  for (const sec of sections) visit(sec.model.state.roots);
  return { wordCount, headingsCount, tables: tables.slice(0, 40), images: images.slice(0, 40), formulas: formulas.slice(0, 40) };
}

/**
 * Genera el destino de control estructurado `word:control` con el estado completo del documento y sus operaciones disponibles.
 */
export function wordControlField(input: WordControlSummaryInput, prefix = ''): { id: string; text: string } {
  const stats = summarizeMediaAndTables(input.sections);
  const sectionRevs = (input.sections || []).map(s => s.model.state.revision);
  const revision = fingerprintText(JSON.stringify({
    title: input.title,
    layout: input.layoutConfig,
    tpl: input.activeTemplateId,
    num: input.headingNumbering,
    sectionRevs,
    sources: (input.bibliographicSources || []).map(s => s.id),
  }));

  const payload = {
    revision,
    noteId: input.noteId,
    title: input.title,
    metrics: {
      pageCount: input.pageCount,
      activePageIndex: input.activePageIndex,
      wordCount: stats.wordCount,
      headingsCount: stats.headingsCount,
      tablesCount: stats.tables.length,
      imagesCount: stats.images.length,
      formulasCount: stats.formulas.length,
    },
    styles: {
      activeTemplateId: input.activeTemplateId,
      headingNumbering: input.headingNumbering,
      availableTemplates: input.styleTemplates.map(t => ({
        id: t.id,
        name: t.name,
        academicStyle: t.academicStyle,
      })),
    },
    layout: {
      paperFormatId: input.layoutConfig.paperFormatId,
      orientation: input.layoutConfig.orientation,
      margins: input.layoutConfig.margins,
      showHeaderFooter: input.layoutConfig.showHeaderFooter,
      headerHtml: input.layoutConfig.headerHtml,
      footerHtml: input.layoutConfig.footerHtml,
      pageColor: input.layoutConfig.pageColor,
      watermarkText: input.layoutConfig.watermarkText,
      pageBorder: input.layoutConfig.pageBorder,
      showLineNumbers: Boolean(input.layoutConfig.showLineNumbers),
      hyphenation: Boolean(input.layoutConfig.hyphenation),
      apa: input.layoutConfig.apa ?? null,
    },
    media: {
      images: stats.images,
      formulas: stats.formulas,
      tables: stats.tables,
    },
    academic: {
      sources: (input.bibliographicSources || []).map(s => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        year: s.year,
        authors: s.authors,
      })),
      objects: input.academicObjects || [],
      issues: input.apaIssues || [],
    },
    operations: [
      'renameDocument(title)',
      'setLayout(paperFormatId?,orientation?,marginPreset?:normal|narrow|moderate|wide|apa,margins?:{topPx,rightPx,bottomPx,leftPx,label},showHeaderFooter?,headerHtml?,footerHtml?,headerText?,footerText?,pageColor?,watermarkText?,pageBorder?,showLineNumbers?,hyphenation?,apa?)',
      'setHeaderFooter(headerHtml?,footerHtml?,headerText?,footerText?,showHeaderFooter?,runningHead?,apaMode?)',
      'applyTemplate(templateId,customTemplate?)',
      'setHeadingNumbering(enabled)',
      'formatNodes(nodeIds?,matchTag?,matchText?,scope?:all|headings|body,tag?:P|H1..H6,align?,bold?,italic?,underline?,strikeThrough?,fontFamily?,fontSizePt?,color?,backgroundColor?,lineHeight?,spaceBeforePt?,spaceAfterPt?,firstLineIndentPt?,indentLeftPt?,indentRightPt?,changeCase?)',
      'findReplace(query,replacement,matchCase?,wholeWord?,all?)',
      'insertBlock(kind:paragraph|heading|pageBreak|blankPage|blockquote|code|hr|callout|list,text?,level?,items?,ordered?,language?,afterNodeId?,pageIndex?)',
      'insertOrUpdateFormula(latex,nodeId?,afterNodeId?,pageIndex?)',
      'deleteFormula(nodeId)',
      'manageImage(nodeId,action:align|resize|alt|delete,align?,widthPx?,heightPx?,alt?)',
      'insertImage(src,alt?,caption?,widthPx?,align?,afterNodeId?)',
      'toggleTableRowTopBorder(tableNodeId?,rowIndex,enabled?)',
      'styleTable(tableNodeId?,allTables?,style:{borders?:grid|horizontal|none,borderColor?,borderWidthPt?,cellPaddingPt?,fontFamily?,fontSizePt?,lineHeight?,align?:left|center|right|justify,color?,backgroundColor?,header?,headerBold?,headerAlign?,headerColor?,headerBackgroundColor?,bandedRows?,bandColor?,repeatHeader?},binding?:fixed|template,preserveExplicitCellFormatting?)',
      'tableAction(tableNodeId,action:addRow|addCol|delRow|delCol|delTable,rowIndex?,colIndex?)',
      'updateToc(insertIfMissing?)',
      'academic(action:addSource|removeSource|insertCitation|insertBibliography|updateAcademic|applyCaption|insertSection|addNote,...)',
    ],
  };

  return { id: `${prefix}${WORD_CONTROL_TARGET}`, text: JSON.stringify(payload) };
}

function applyTextCase(value: string, mode: string): string {
  switch (mode) {
    case 'upper': return value.toUpperCase();
    case 'lower': return value.toLowerCase();
    case 'capitalize': return value.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
    case 'sentence': return value.toLowerCase().replace(/(^\s*|\.\s+)(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
    case 'toggle': return Array.from(value, ch => ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()).join('');
    default: return value;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTextInNodeTree(
  nodes: readonly DocumentNode[],
  query: string,
  replacement: string,
  matchCase = false,
  wholeWord = false,
  replaceAll = true,
): { nodes: readonly DocumentNode[]; count: number } {
  const escaped = escapeRegExp(query);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  let count = 0;
  let done = false;

  const walk = (list: readonly DocumentNode[]): readonly DocumentNode[] => {
    let changed = false;
    const out = list.map((node) => {
      if (done) return node;
      if (node.kind === 'text') {
        const re = new RegExp(pattern, `${replaceAll ? 'g' : ''}${matchCase ? '' : 'i'}`);
        if (!re.test(node.text)) return node;
        let localHits = 0;
        const nextText = node.text.replace(re, () => {
          localHits++;
          return replacement;
        });
        count += localHits;
        if (!replaceAll && localHits > 0) done = true;
        changed = true;
        return { ...node, text: nextText };
      }
      if ('data-latex' in node.attributes || node.tag === 'script' || node.tag === 'style') {
        return node;
      }
      const nextChildren = walk(node.children);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
      return node;
    });
    return changed ? out : list;
  };

  return { nodes: walk(nodes), count };
}

function insertNodesAfterTarget(
  roots: readonly DocumentNode[],
  inserted: readonly DocumentNode[],
  afterNodeId?: string,
): { roots: readonly DocumentNode[]; placed: boolean } {
  if (!afterNodeId) {
    return { roots: [...roots, ...inserted], placed: true };
  }
  const out: DocumentNode[] = [];
  let placed = false;
  for (const node of roots) {
    out.push(node);
    if (!placed && (node.id === afterNodeId || (node.kind === 'element' && findNodeById([node], afterNodeId)))) {
      out.push(...inserted);
      placed = true;
    }
  }
  return { roots: placed ? out : [...roots, ...inserted], placed: true };
}

function applyFormatOpToSections(
  sections: readonly { model: { state: { roots: readonly DocumentNode[] } } }[],
  op: Record<string, any>,
): Map<number, readonly DocumentNode[]> {
  const updated = new Map<number, readonly DocumentNode[]>();
  const targetIds = Array.isArray(op['nodeIds']) ? new Set<string>(op['nodeIds'].map(String)) : null;
  const matchTag = typeof op['matchTag'] === 'string' ? op['matchTag'].toLowerCase() : null;
  const matchText = typeof op['matchText'] === 'string' ? op['matchText'].toLowerCase() : null;
  const scope = typeof op['scope'] === 'string' ? op['scope'] : 'all';

  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
  const headingTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  const blockMatches = (el: Extract<DocumentNode, { kind: 'element' }>): boolean => {
    if (!blockTags.has(el.tag)) return false;
    if (targetIds && !targetIds.has(el.id)) return false;
    if (matchTag && el.tag !== matchTag) return false;
    if (scope === 'headings' && !headingTags.has(el.tag)) return false;
    if (scope === 'body' && el.tag !== 'p' && el.tag !== 'li') return false;
    if (matchText) {
      const content = textNodes([el]).map(t => t.text).join('').toLowerCase();
      if (!content.includes(matchText)) return false;
    }
    return true;
  };

  const stylePatch: Record<string, string | null> = {};
  if (op['align']) stylePatch['text-align'] = String(op['align']);
  if (op['bold'] !== undefined) stylePatch['font-weight'] = op['bold'] ? 'bold' : 'normal';
  if (op['italic'] !== undefined) stylePatch['font-style'] = op['italic'] ? 'italic' : 'normal';
  if (op['underline'] !== undefined || op['strikeThrough'] !== undefined) {
    const parts: string[] = [];
    if (op['underline']) parts.push('underline');
    if (op['strikeThrough']) parts.push('line-through');
    stylePatch['text-decoration'] = parts.length ? parts.join(' ') : 'none';
  }
  if (op['fontFamily']) stylePatch['font-family'] = String(op['fontFamily']);
  if (op['fontSizePt'] !== undefined) stylePatch['font-size'] = `${Number(op['fontSizePt'])}pt`;
  if (op['color']) stylePatch['color'] = String(op['color']);
  if (op['backgroundColor']) stylePatch['background-color'] = String(op['backgroundColor']);
  if (op['lineHeight'] !== undefined) stylePatch['line-height'] = String(op['lineHeight']);
  if (op['spaceBeforePt'] !== undefined) stylePatch['margin-top'] = `${Number(op['spaceBeforePt'])}pt`;
  if (op['spaceAfterPt'] !== undefined) stylePatch['margin-bottom'] = `${Number(op['spaceAfterPt'])}pt`;
  if (op['firstLineIndentPt'] !== undefined) stylePatch['text-indent'] = `${Number(op['firstLineIndentPt'])}pt`;
  if (op['indentLeftPt'] !== undefined) stylePatch['margin-left'] = `${Number(op['indentLeftPt'])}pt`;
  if (op['indentRightPt'] !== undefined) stylePatch['margin-right'] = `${Number(op['indentRightPt'])}pt`;

  const applyCaseToTree = (children: readonly DocumentNode[], caseMode: string): readonly DocumentNode[] =>
    children.map(child =>
      child.kind === 'text'
        ? { ...child, text: applyTextCase(child.text, caseMode) }
        : { ...child, children: applyCaseToTree(child.children, caseMode) },
    );

  sections.forEach((sec, idx) => {
    let changed = false;
    const visit = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (blockMatches(node)) {
          changed = true;
          let nextTag = node.tag;
          let nextAttrs = Object.keys(stylePatch).length ? patchNodeStyle(node.attributes, stylePatch) : { ...node.attributes };
          if (op['lineHeight'] !== undefined) {
            nextAttrs['data-word-line-spacing'] = String(op['lineHeight']);
          }
          if (typeof op['tag'] === 'string') {
            const rawTag = op['tag'].toUpperCase();
            if (rawTag === 'CHAPTER') {
              nextTag = 'h1';
              nextAttrs['data-word-chapter'] = 'true';
            } else if (/^(?:P|H[1-6])$/.test(rawTag)) {
              nextTag = rawTag.toLowerCase();
              delete nextAttrs['data-word-chapter'];
            }
          }
          const nextChildren = op['changeCase'] ? applyCaseToTree(node.children, String(op['changeCase'])) : node.children;
          return { ...node, tag: nextTag, attributes: nextAttrs, children: nextChildren };
        }
        const nextChildren = visit(node.children);
        return nextChildren === node.children ? node : { ...node, children: nextChildren };
      });

    const nextRoots = visit(sec.model.state.roots);
    if (changed) updated.set(idx, nextRoots);
  });

  return updated;
}

function mutateImageNodeInSections(
  sections: readonly { model: { state: { roots: readonly DocumentNode[] } } }[],
  nodeId: string,
  action: 'align' | 'resize' | 'alt' | 'delete',
  op: Record<string, any>,
): Map<number, readonly DocumentNode[]> {
  const updated = new Map<number, readonly DocumentNode[]>();

  sections.forEach((sec, idx) => {
    let changed = false;
    const visit = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const result: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.id === nodeId && node.kind === 'element' && node.tag === 'img') {
          changed = true;
          if (action === 'delete') continue;
          let attrs = { ...node.attributes };
          if (action === 'alt' && typeof op['alt'] === 'string') {
            attrs['alt'] = op['alt'];
          }
          if (action === 'resize') {
            const stylePatch: Record<string, string | null> = {};
            if (op['widthPx'] !== undefined) stylePatch['width'] = `${Math.max(24, Number(op['widthPx']) || 240)}px`;
            if (op['heightPx'] !== undefined) stylePatch['height'] = `${Math.max(24, Number(op['heightPx']) || 180)}px`;
            else if (op['widthPx'] !== undefined) stylePatch['height'] = 'auto';
            attrs = patchNodeStyle(attrs, stylePatch);
          }
          if (action === 'align') {
            const align = op['align'] === 'center' ? 'center' : op['align'] === 'right' ? 'right' : 'left';
            attrs['data-align'] = align;
            if (align === 'center') {
              attrs = patchNodeStyle(attrs, { display: 'block', margin: '0.5rem auto', float: null });
            } else if (align === 'right') {
              attrs = patchNodeStyle(attrs, { display: 'block', 'margin-left': 'auto', 'margin-right': '0', float: null });
            } else {
              attrs = patchNodeStyle(attrs, { display: 'block', 'margin-left': '0', 'margin-right': 'auto', float: null });
            }
          }
          result.push({ ...node, attributes: attrs });
          continue;
        }
        if (node.kind === 'element') {
          const nextChildren = visit(node.children);
          if (nextChildren !== node.children) changed = true;
          result.push(nextChildren === node.children ? node : { ...node, children: nextChildren });
        } else {
          result.push(node);
        }
      }
      return result;
    };

    const nextRoots = visit(sec.model.state.roots);
    if (changed) updated.set(idx, nextRoots);
  });

  return updated;
}

function createTableCellNode(tag: 'td' | 'th', text = ''): DocumentNode {
  return {
    id: nextWordAiId(tag),
    kind: 'element',
    tag,
    attributes: {},
    children: [{
      id: nextWordAiId('p'),
      kind: 'element',
      tag: 'p',
      attributes: {},
      children: [{ id: nextWordAiId('txt'), kind: 'text', text }],
    }],
  };
}

function mutateTableInRoots(
  roots: readonly DocumentNode[],
  tableNodeId: string | undefined,
  transformTable: (table: Extract<DocumentNode, { kind: 'element' }>) => DocumentNode | null,
  allTables = false,
): { roots: readonly DocumentNode[]; touched: boolean } {
  let touched = false;
  const walk = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
    const out: DocumentNode[] = [];
    for (const node of nodes) {
      if (node.kind === 'element' && node.tag === 'table' && (allTables || !touched) && (!tableNodeId || node.id === tableNodeId)) {
        touched = true;
        const next = transformTable(node);
        if (next) out.push(next);
        continue;
      }
      if (node.kind === 'element') {
        const nextChildren = walk(node.children);
        if (nextChildren !== node.children) touched = true;
        out.push(nextChildren === node.children ? node : { ...node, children: nextChildren });
      } else {
        out.push(node);
      }
    }
    return touched ? out : nodes;
  };
  return { roots: walk(roots), touched };
}

const TABLE_STYLE_KEYS: readonly (keyof TableStyleRule)[] = [
  'mode', 'fontFamily', 'fontSizePt', 'lineHeight', 'align', 'color', 'backgroundColor',
  'borders', 'borderColor', 'borderWidthPt', 'cellPaddingPt',
  'header', 'headerBold', 'headerAlign', 'headerColor', 'headerBackgroundColor',
  'bandedRows', 'bandColor', 'repeatHeader',
];

function applyStyleTableOp(
  table: Extract<DocumentNode, { kind: 'element' }>,
  op: Record<string, any>,
): DocumentNode {
  let existingRule: Partial<TableStyleRule> = {};
  const rawExisting = table.attributes['data-word-table-rule'];
  if (rawExisting) {
    try {
      const parsed = JSON.parse(rawExisting);
      if (parsed && typeof parsed === 'object') existingRule = parsed;
    } catch {
      // Ignore malformed stored table rule and fall back to defaults.
    }
  }

  const patch: Partial<TableStyleRule> = {};
  const sources = [op, op['style'] && typeof op['style'] === 'object' ? op['style'] : null];
  for (const src of sources) {
    if (!src) continue;
    for (const key of TABLE_STYLE_KEYS) {
      if (src[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = src[key];
      }
    }
  }

  const rule = normalizeTableStyle({
    ...DEFAULT_TABLE_STYLE,
    ...existingRule,
    ...patch,
    mode: patch.mode ?? 'custom',
  });
  const binding: 'template' | 'fixed' = op['binding'] === 'template' ? 'template' : 'fixed';
  return styleModelTable(table, rule, binding, {
    preserveExplicitCellFormatting: Boolean(op['preserveExplicitCellFormatting']),
  });
}

function applyToggleRowTopBorder(
  table: Extract<DocumentNode, { kind: 'element' }>,
  rowIndex: number,
  enabled?: boolean,
): DocumentNode {
  const targetIdx = Math.max(0, Math.floor(rowIndex));
  let currentRow = 0;
  let resolvedEnabled = enabled;

  const inspectRows = (nodes: readonly DocumentNode[]) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      if (n.tag === 'tr') {
        if (currentRow === targetIdx && resolvedEnabled === undefined) {
          const cells = n.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'));
          resolvedEnabled = !cells.every(c => c.attributes['data-word-top-border'] === 'true');
        }
        currentRow++;
      } else if (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') {
        inspectRows(n.children);
      }
    }
  };
  inspectRows(table.children);
  const turnOn = resolvedEnabled ?? true;

  currentRow = 0;
  const rewriteRows = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
    nodes.map(n => {
      if (n.kind !== 'element') return n;
      if (n.tag === 'tr') {
        const idx = currentRow++;
        if (idx !== targetIdx) return n;
        return {
          ...n,
          children: n.children.map(cell => {
            if (cell.kind !== 'element' || (cell.tag !== 'td' && cell.tag !== 'th')) return cell;
            const nextAttrs = patchNodeStyle(
              cell.attributes,
              turnOn ? { 'border-top': '1px solid #000000' } : { 'border-top': null },
            );
            if (turnOn) nextAttrs['data-word-top-border'] = 'true';
            else delete nextAttrs['data-word-top-border'];
            return { ...cell, attributes: nextAttrs };
          }),
        };
      }
      if (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') {
        return { ...n, children: rewriteRows(n.children) };
      }
      return n;
    });

  return { ...table, children: rewriteRows(table.children) };
}

function applyTableStructureOp(
  table: Extract<DocumentNode, { kind: 'element' }>,
  action: 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable',
  rowIndex?: number,
  colIndex?: number,
  cellsData?: unknown[],
): DocumentNode | null {
  if (action === 'delTable') return null;

  const getSectionContainers = (nodes: readonly DocumentNode[]) => {
    const trParents: Extract<DocumentNode, { kind: 'element' }>[] = [];
    for (const c of nodes) {
      if (c.kind === 'element' && (c.tag === 'thead' || c.tag === 'tbody' || c.tag === 'tfoot')) {
        trParents.push(c);
      }
    }
    return trParents;
  };

  if (action === 'addRow' || action === 'delRow') {
    const flatRows: Extract<DocumentNode, { kind: 'element' }>[] = [];
    const collect = (list: readonly DocumentNode[]) => {
      for (const n of list) {
        if (n.kind !== 'element') continue;
        if (n.tag === 'tr') flatRows.push(n);
        else if (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') collect(n.children);
      }
    };
    collect(table.children);
    const colCount = Math.max(
      1,
      ...flatRows.map(r => r.children.filter(c => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th')).length),
    );
    const targetRow = rowIndex !== undefined ? Math.max(0, Math.min(flatRows.length - 1, Math.floor(rowIndex))) : Math.max(0, flatRows.length - 1);

    if (action === 'delRow') {
      if (flatRows.length <= 1) return null;
      let cursor = 0;
      const stripRow = (list: readonly DocumentNode[]): readonly DocumentNode[] =>
        list
          .filter(n => !(n.kind === 'element' && n.tag === 'tr' && cursor++ === targetRow))
          .map(n => (n.kind === 'element' && (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') ? { ...n, children: stripRow(n.children) } : n));
      return { ...table, children: stripRow(table.children) };
    }

    const newRow: DocumentNode = {
      id: nextWordAiId('tr'),
      kind: 'element',
      tag: 'tr',
      attributes: {},
      children: Array.from({ length: colCount }, (_, cIdx) =>
        createTableCellNode('td', Array.isArray(cellsData) ? String(cellsData[cIdx] ?? '') : ''),
      ),
    };

    const containers = getSectionContainers(table.children);
    if (!containers.length) {
      const idx = table.children.filter(c => c.kind === 'element' && c.tag === 'tr').length;
      const insertAt = rowIndex !== undefined ? Math.min(idx, Math.max(0, Math.floor(rowIndex) + 1)) : table.children.length;
      const next = [...table.children];
      next.splice(insertAt, 0, newRow);
      return { ...table, children: next };
    }
    const targetContainer = containers.find(c => c.tag === 'tbody') ?? containers[containers.length - 1];
    return {
      ...table,
      children: table.children.map(c =>
        c === targetContainer ? { ...c, children: [...c.children, newRow] } : c,
      ),
    };
  }

  let globalRow = 0;
  const mutateColsInList = (list: readonly DocumentNode[], inHead: boolean): readonly DocumentNode[] =>
    list.map(n => {
      if (n.kind !== 'element') return n;
      if (n.tag === 'tr') {
        const rIdx = globalRow++;
        const cells = n.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'));
        if (action === 'addCol') {
          const insertAt = colIndex !== undefined ? Math.max(0, Math.min(cells.length, Math.floor(colIndex) + 1)) : cells.length;
          const nextCells = [...cells];
          const cellText = Array.isArray(cellsData) ? String(cellsData[rIdx] ?? '') : '';
          nextCells.splice(insertAt, 0, createTableCellNode(inHead ? 'th' : 'td', cellText) as Extract<DocumentNode, { kind: 'element' }>);
          return { ...n, children: nextCells };
        }
        if (cells.length <= 1) return n;
        const removeAt = colIndex !== undefined ? Math.max(0, Math.min(cells.length - 1, Math.floor(colIndex))) : cells.length - 1;
        return { ...n, children: cells.filter((_, idx) => idx !== removeAt) };
      }
      if (n.tag === 'thead' || n.tag === 'tbody' || n.tag === 'tfoot') {
        return { ...n, children: mutateColsInList(n.children, inHead || n.tag === 'thead') };
      }
      return n;
    });

  return { ...table, children: mutateColsInList(table.children, false) };
}

function buildBlockNodesFromOp(op: Record<string, any>, buildFormulaHtml?: (latex: string) => string): readonly DocumentNode[] {
  const kind = String(op['kind'] || 'paragraph');
  if (kind === 'hr') {
    return [{ id: nextWordAiId('hr'), kind: 'element', tag: 'hr', attributes: {}, children: [] }];
  }
  if (kind === 'latex' && typeof op['latex'] === 'string') {
    const html = buildFormulaHtml
      ? buildFormulaHtml(op['latex'])
      : `<div data-latex="${escapeHtmlText(op['latex'])}" contenteditable="false"><p>${escapeHtmlText(op['latex'])}</p></div>`;
    return htmlStringToNodes(html);
  }
  if (kind === 'code') {
    const lang = escapeHtmlText(String(op['language'] || 'text'));
    const code = escapeHtmlText(String(op['text'] || ''));
    return htmlStringToNodes(`<pre><code data-lang="${lang}">${code}</code></pre>`);
  }
  if (kind === 'blockquote') {
    return htmlStringToNodes(`<blockquote><p>${escapeHtmlText(String(op['text'] || ''))}</p></blockquote>`);
  }
  if (kind === 'callout') {
    return htmlStringToNodes(
      `<blockquote style="border-left: 4px solid #3b82f6; background: #eff6ff; padding: 10px 14px; border-radius: 4px;"><p>${escapeHtmlText(String(op['text'] || ''))}</p></blockquote>`,
    );
  }
  if (kind === 'list' && Array.isArray(op['items'])) {
    const tag = op['ordered'] ? 'ol' : 'ul';
    const itemsHtml = op['items'].map((item: unknown) => `<li>${escapeHtmlText(String(item ?? ''))}</li>`).join('');
    return htmlStringToNodes(`<${tag}>${itemsHtml}</${tag}>`);
  }
  if (kind === 'heading') {
    const level = Math.max(1, Math.min(6, Number(op['level'] || 1)));
    const text = String(op['text'] || '');
    return [{
      id: nextWordAiId(`h${level}`),
      kind: 'element',
      tag: `h${level}`,
      attributes: {},
      children: [{ id: nextWordAiId('txt'), kind: 'text', text }],
    }];
  }
  const text = String(op['text'] || '');
  return htmlStringToNodes(richTextHtml(text));
}

function buildLayoutUpdater(op: Record<string, any>): (prev: DocumentLayoutConfig) => DocumentLayoutConfig {
  return (prev) => {
    const next: DocumentLayoutConfig = {
      ...prev,
      margins: { ...prev.margins },
      pageBorder: { ...prev.pageBorder },
    };

    if (typeof op['paperFormatId'] === 'string' && op['paperFormatId'] in PAPER_FORMAT_PRESETS) {
      next.paperFormatId = op['paperFormatId'] as PaperFormatId;
    }
    if (op['orientation'] === 'portrait' || op['orientation'] === 'landscape') {
      next.orientation = op['orientation'];
    }
    if (typeof op['marginPreset'] === 'string' && MARGIN_PRESETS[op['marginPreset']]) {
      next.margins = { ...MARGIN_PRESETS[op['marginPreset']] };
    }
    if (op['margins'] && typeof op['margins'] === 'object') {
      const m = op['margins'] as Partial<PageMarginsConfig>;
      next.margins = {
        topPx: Number.isFinite(Number(m.topPx)) ? Math.max(16, Number(m.topPx)) : next.margins.topPx,
        rightPx: Number.isFinite(Number(m.rightPx)) ? Math.max(16, Number(m.rightPx)) : next.margins.rightPx,
        bottomPx: Number.isFinite(Number(m.bottomPx)) ? Math.max(16, Number(m.bottomPx)) : next.margins.bottomPx,
        leftPx: Number.isFinite(Number(m.leftPx)) ? Math.max(16, Number(m.leftPx)) : next.margins.leftPx,
        label: typeof m.label === 'string' && m.label.trim() ? m.label : 'Personalizado IA',
      };
    }
    if (typeof op['showHeaderFooter'] === 'boolean') next.showHeaderFooter = op['showHeaderFooter'];
    if (typeof op['headerHtml'] === 'string') {
      next.headerHtml = op['headerHtml'];
      next.showHeaderFooter = true;
    } else if (typeof op['headerText'] === 'string') {
      next.headerHtml = `<p>${escapeHtmlText(op['headerText'])}</p>`;
      next.showHeaderFooter = true;
    }
    if (typeof op['footerHtml'] === 'string') {
      next.footerHtml = op['footerHtml'];
      next.showHeaderFooter = true;
    } else if (typeof op['footerText'] === 'string') {
      next.footerHtml = `<p>${escapeHtmlText(op['footerText'])}</p>`;
      next.showHeaderFooter = true;
    }
    if (op['pageColor'] !== undefined) {
      next.pageColor = op['pageColor'] ? String(op['pageColor']) : undefined;
    }
    if (op['watermarkText'] !== undefined) {
      next.watermarkText = op['watermarkText'] ? String(op['watermarkText']) : undefined;
    }
    if (op['pageBorder'] && typeof op['pageBorder'] === 'object') {
      next.pageBorder = { ...next.pageBorder, ...(op['pageBorder'] as Partial<PageBorderConfig>) };
    }
    if (typeof op['showLineNumbers'] === 'boolean') next.showLineNumbers = op['showLineNumbers'];
    if (typeof op['hyphenation'] === 'boolean') next.hyphenation = op['hyphenation'];

    if (op['apa'] === null) {
      delete next.apa;
    } else if (op['apa'] && typeof op['apa'] === 'object') {
      next.apa = {
        mode: op['apa']['mode'] === 'professional' ? 'professional' : 'student',
        runningHead: String(op['apa']['runningHead'] || next.apa?.runningHead || '').toLocaleUpperCase().slice(0, 50),
        fontFamily: String(op['apa']['fontFamily'] || next.apa?.fontFamily || 'Times New Roman'),
        fontSizePt: Number(op['apa']['fontSizePt'] || next.apa?.fontSizePt || 12),
      };
    } else if (typeof op['runningHead'] === 'string' || op['apaMode']) {
      next.apa = {
        mode: op['apaMode'] === 'professional' ? 'professional' : next.apa?.mode || 'student',
        runningHead: typeof op['runningHead'] === 'string'
          ? op['runningHead'].toLocaleUpperCase().slice(0, 50)
          : next.apa?.runningHead || '',
        fontFamily: next.apa?.fontFamily || 'Times New Roman',
        fontSizePt: next.apa?.fontSizePt || 12,
      };
    }

    return next;
  };
}

/**
 * Ejecuta operaciones estructurales puras sobre secciones del modelo Word (testeable sin DOM/Canvas).
 */
export function applyPureWordModelOperations(
  sections: readonly DocumentSectionState[],
  operations: readonly Record<string, any>[],
  buildFormulaHtml?: (latex: string) => string,
): { updatedBySection: Map<number, readonly DocumentNode[]>; hostOps: Record<string, any>[] } {
  const working = sections.map((s, index) => ({ index, roots: s.model.state.roots }));
  const dirty = new Set<number>();
  const hostOps: Record<string, any>[] = [];

  for (const op of operations) {
    if (!op || typeof op !== 'object') continue;
    const type = String(op['type'] || '');

    if (type === 'formatNodes' || type === 'formatAll') {
      const currentSections = working.map((w, i) => ({
        ...sections[i],
        model: { ...sections[i].model, state: { ...sections[i].model.state, roots: w.roots } },
      }));
      const mutated = applyFormatOpToSections(currentSections, op);
      for (const [secIdx, nextRoots] of mutated) {
        working[secIdx].roots = nextRoots;
        dirty.add(secIdx);
      }
      continue;
    }

    if (type === 'findReplace' && typeof op['query'] === 'string' && op['query']) {
      for (let i = 0; i < working.length; i++) {
        const res = replaceTextInNodeTree(
          working[i].roots,
          op['query'],
          String(op['replacement'] ?? ''),
          Boolean(op['matchCase']),
          Boolean(op['wholeWord']),
          op['all'] !== false,
        );
        if (res.count > 0) {
          working[i].roots = res.nodes;
          dirty.add(i);
          if (op['all'] === false) break;
        }
      }
      continue;
    }

    if (type === 'manageImage' && typeof op['nodeId'] === 'string') {
      const action = op['action'];
      if (action === 'align' || action === 'resize' || action === 'alt' || action === 'delete') {
        const currentSections = working.map((w, i) => ({
          ...sections[i],
          model: { ...sections[i].model, state: { ...sections[i].model.state, roots: w.roots } },
        }));
        const mutated = mutateImageNodeInSections(currentSections, op['nodeId'], action, op);
        for (const [secIdx, nextRoots] of mutated) {
          working[secIdx].roots = nextRoots;
          dirty.add(secIdx);
        }
      }
      continue;
    }

    if (type === 'insertImage' && typeof op['src'] === 'string') {
      const safe = safeImageUrl(op['src']);
      if (!safe) continue;
      const alt = escapeHtmlText(String(op['alt'] || 'Imagen'));
      const widthAttr = op['widthPx'] ? `width: ${Math.max(40, Number(op['widthPx']))}px;` : 'max-width: 100%;';
      const alignStyle = op['align'] === 'left'
        ? 'display: block; margin: 0.75rem auto 0.75rem 0;'
        : op['align'] === 'right'
          ? 'display: block; margin: 0.75rem 0 0.75rem auto;'
          : 'display: block; margin: 0.75rem auto;';
      const caption = op['caption'] ? `<figcaption>${escapeHtmlText(String(op['caption']))}</figcaption>` : '';
      const nodes = htmlStringToNodes(
        `<figure style="text-align: ${op['align'] || 'center'};"><img src="${escapeHtmlText(safe)}" alt="${alt}" style="${widthAttr} height: auto; ${alignStyle}" />${caption}</figure>`,
      );
      const targetSecIdx = working.length - 1;
      if (targetSecIdx >= 0) {
        const placed = insertNodesAfterTarget(working[targetSecIdx].roots, nodes, op['afterNodeId']);
        working[targetSecIdx].roots = placed.roots;
        dirty.add(targetSecIdx);
      }
      continue;
    }

    if (type === 'insertBlock') {
      if (op['kind'] === 'pageBreak' || op['kind'] === 'blankPage') {
        hostOps.push(op);
        continue;
      }
      const nodes = buildBlockNodesFromOp(op, buildFormulaHtml);
      if (nodes.length && working.length) {
        let targetSecIdx = Math.max(0, Math.min(working.length - 1, Number(op['pageIndex'] ?? working.length - 1)));
        if (typeof op['afterNodeId'] === 'string') {
          const foundSec = working.findIndex(w => findNodeById(w.roots, op['afterNodeId']));
          if (foundSec >= 0) targetSecIdx = foundSec;
        }
        const placed = insertNodesAfterTarget(working[targetSecIdx].roots, nodes, op['afterNodeId']);
        working[targetSecIdx].roots = placed.roots;
        dirty.add(targetSecIdx);
      }
      continue;
    }

    if (type === 'toggleTableRowTopBorder') {
      const tableNodeId = typeof op['tableNodeId'] === 'string' ? op['tableNodeId'] : undefined;
      const rowIndex = Number(op['rowIndex'] ?? 0);
      const enabled = typeof op['enabled'] === 'boolean' ? op['enabled'] : undefined;
      for (let i = 0; i < working.length; i++) {
        const res = mutateTableInRoots(working[i].roots, tableNodeId, table =>
          applyToggleRowTopBorder(table, rowIndex, enabled),
        );
        if (res.touched) {
          working[i].roots = res.roots;
          dirty.add(i);
          break;
        }
      }
      continue;
    }

    if (type === 'styleTable') {
      const tableNodeId = typeof op['tableNodeId'] === 'string' ? op['tableNodeId'] : undefined;
      const allTables = Boolean(op['allTables']) && !tableNodeId;
      for (let i = 0; i < working.length; i++) {
        const res = mutateTableInRoots(
          working[i].roots,
          tableNodeId,
          table => applyStyleTableOp(table, op),
          allTables,
        );
        if (res.touched) {
          working[i].roots = res.roots;
          dirty.add(i);
          if (!allTables) break;
        }
      }
      continue;
    }

    if (type === 'tableAction' && typeof op['action'] === 'string') {
      const action = op['action'];
      if (action === 'addRow' || action === 'addCol' || action === 'delRow' || action === 'delCol' || action === 'delTable') {
        const tableNodeId = typeof op['tableNodeId'] === 'string' ? op['tableNodeId'] : undefined;
        const rowIndex = op['rowIndex'] !== undefined ? Number(op['rowIndex']) : undefined;
        const colIndex = op['colIndex'] !== undefined ? Number(op['colIndex']) : undefined;
        const cells = Array.isArray(op['cells']) ? op['cells'] : undefined;
        for (let i = 0; i < working.length; i++) {
          const res = mutateTableInRoots(working[i].roots, tableNodeId, table =>
            applyTableStructureOp(table, action, rowIndex, colIndex, cells),
          );
          if (res.touched) {
            working[i].roots = res.roots;
            dirty.add(i);
            break;
          }
        }
      }
      continue;
    }

    hostOps.push(op);
  }

  const updatedBySection = new Map<number, readonly DocumentNode[]>();
  for (const idx of dirty) {
    updatedBySection.set(idx, working[idx].roots);
  }
  return { updatedBySection, hostOps };
}

/**
 * Ejecuta el payload JSON `word:control` completo contra la sesión del modelo y los controladores de Word.
 */
export function applyWordControlPayload(
  rawJson: string,
  sections: readonly DocumentSectionState[],
  commitSectionRoots: (updated: ReadonlyMap<number, readonly DocumentNode[]>) => void,
  host: WordControlHost,
): void {
  const parsed = JSON.parse(rawJson);
  const operations: Record<string, any>[] = Array.isArray(parsed?.operations) ? parsed.operations : [];
  if (!operations.length || operations.length > 500) {
    throw Error('Operaciones de Word inválidas.');
  }

  const { updatedBySection, hostOps } = applyPureWordModelOperations(sections, operations, host.buildFormulaHtml);
  if (updatedBySection.size > 0) {
    commitSectionRoots(updatedBySection);
  }

  for (const op of hostOps) {
    const type = String(op['type'] || '');
    if (type === 'renameDocument' && typeof op['title'] === 'string' && op['title'].trim()) {
      host.renameDocument(op['title'].trim());
    } else if (type === 'setLayout' || type === 'setHeaderFooter') {
      host.updateLayout(buildLayoutUpdater(op));
    } else if (type === 'applyTemplate' && (typeof op['templateId'] === 'string' || op['customTemplate'])) {
      host.applyTemplateById(String(op['templateId'] || ''), op['customTemplate']);
    } else if (type === 'setHeadingNumbering') {
      host.setHeadingNumbering(Boolean(op['enabled']));
    } else if (type === 'insertOrUpdateFormula' && typeof op['latex'] === 'string') {
      host.insertOrUpdateFormula(op['latex'], op['nodeId'], op['afterNodeId'], op['pageIndex']);
    } else if (type === 'deleteFormula' && typeof op['nodeId'] === 'string') {
      host.deleteFormula(op['nodeId']);
    } else if (type === 'insertBlock' && op['kind'] === 'blankPage') {
      host.addBlankPage(op['pageIndex']);
    } else if (type === 'insertBlock' && op['kind'] === 'pageBreak') {
      host.insertPageBreak(op['pageIndex']);
    } else if (type === 'updateToc') {
      host.updateToc(Boolean(op['insertIfMissing']));
    } else if (type === 'academic') {
      const action = String(op['action'] || '');
      if (action === 'addSource' && op['source']) host.addOrUpdateSource(op['source']);
      else if (action === 'removeSource' && typeof op['sourceId'] === 'string') host.removeSource(op['sourceId']);
      else if (action === 'insertCitation' && op['request']) host.insertCitation(op['request']);
      else if (action === 'insertBibliography') host.insertBibliography();
      else if (action === 'updateAcademic') host.updateAcademic();
      else if (action === 'applyCaption' && op['request']) host.applyCaption(op['request']);
      else if (action === 'insertSection' && op['request']) host.insertAcademicSection(op['request']);
      else if (action === 'addNote' && op['request']) host.addAcademicNote(op['request']);
    } else {
      throw Error(`Operación de documento Word desconocida: ${type}`);
    }
  }
}
