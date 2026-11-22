import { numberModelHeadings } from './model-heading-numbering';
import { isFixedTableStyle, normalizeTableStyle, preserveModelTable, styleModelTable } from '../utils/table-styling';
import { HeadingOutlineCounter } from '../utils/heading-outline-counter';
import { findNodeById } from './document-model';
import { DocumentCanvasEngine, EngineSectionSnapshot } from './document-engine';
import {
  applyDocumentOperation,
  DocumentNode,
  DocumentPosition,
  DocumentSelection,
  DocumentState,
  findAncestorPath,
  getSubtreeIds,
  textNodes,
} from './document-model';
import { htmlToDocumentState, serializeDocumentNodes } from './document-model-dom';
import { PageGeometry, MeasureText } from './document-layout';
import { resolveDefaultModelStyles, ResolvedLayoutStyle } from './model-layout';
import {
  DocumentPage,
  DocumentRevisionItem,
  EditorActiveFormats,
  ElementStyleRule,
  HeadingItem,
  SectionPageConfig,
  StyleTemplate,
  TableStyleRule,
} from '../models/word-document.model';
import type { AcademicObject, BibliographicSource, CaptionRequest, CitationRequest } from '../models/academic.model';
import type { AcademicNote, AcademicNoteRequest, AcademicSectionRequest } from '../models/academic-sections.model';
import { academicObjectLabel } from '../utils/apa-objects';
import {
  applyModelApaSectionsAndObjectsInSnaps,
  buildBibliographyParagraphNodes,
  buildCitationSnippetNodes,
  collectCitedIdsFromSections,
  collectModelAcademicObjects,
  collectModelNotes,
  hasModelObjectIndexInSnaps,
  insertAcademicSectionInSnaps,
  insertBlocksAtSelection,
  ModelTocBuildOptions,
  rebuildModelObjectIndexInSnaps,
  rebuildModelTocInSnaps,
  refreshModelBibliographyInSnaps,
  refreshModelCitationsInSnaps,
  renumberModelNotesInSnaps,
  serializeCssStyleMap,
  spliceInlineNodesAtSelection,
  syncModelEndnotesInSnaps,
} from './model-academic';
import { referenceEligible, sortedSources } from '../utils/apa-references';
import { caretForPosition, selectionRectsForRange } from './canvas-caret';
import { PageDisplayList, PageSelectionRect } from './canvas-page-renderer';
import { completedWordCorrection, repeatedWord, type WritingLanguage } from '../../../core/utils/proofreading';
import {
  aiModelTableFields,
  aiModelTableInsertionFields,
  applyAiEditsToSections,
  modelTextFields,
} from '../utils/ai-model-edit';

export interface CanvasAccessibleTableCell {
  id: string;
  text: string;
  isHeader: boolean;
}

export interface CanvasAccessibleTableRow {
  cells: CanvasAccessibleTableCell[];
}

export interface CanvasAccessibleBlock {
  id: string;
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'li' | 'blockquote' | 'table';
  text: string;
  level?: number;
  checked?: boolean;
  rows?: CanvasAccessibleTableRow[];
  pageIndex: number;
}

export interface CanvasProofreadingResult {
  kind: 'correction' | 'repetition';
  before: string;
  after?: string;
  undo?: () => boolean;
}

export interface CanvasTableContext {
  tableId: string;
  rowId: string;
  cellId: string;
  rowHasTopBorder?: boolean;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  background?: string;
  repeatHeader?: boolean;
}

export interface CanvasTocEntryHit {
  targetId?: string;
  pageIndex?: number;
  title?: string;
}

export interface CanvasLatexFormulaHit {
  nodeId: string;
  latex: string;
}

export interface CanvasImageHit {
  pageId: string;
  pageIndex: number;
  nodeId: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasTableBorderHit {
  type: 'col' | 'row';
  tableId: string;
  pageId: string;
  pageIndex: number;
  colIndex?: number;
  tableWidth?: number;
  tableLeft?: number;
  colWidthsPct?: readonly number[];
  rowIndex?: number;
  rowId?: string;
  rowTop?: number;
  rowHeight?: number;
}

export interface CanvasSelectionContext {
  formats: EditorActiveFormats;
  table: CanvasTableContext | null;
  tocEntry: CanvasTocEntryHit | null;
}

export interface CanvasTextMatch {
  sectionIndex: number;
  pageIndex: number;
  y: number;
  anchor: DocumentPosition;
  focus: DocumentPosition;
}

export interface CanvasHistoryMeta {
  activeTemplateId?: string;
  headingNumbering?: boolean;
  layoutConfig?: unknown;
  templates?: readonly StyleTemplate[];
  bibliographicSources?: readonly BibliographicSource[];
}

interface Snapshot {
  states: EngineSectionSnapshot[] | DocumentState[];
  section: number;
  selection: DocumentSelection | null;
  geometry: PageGeometry;
  defaults: Partial<ResolvedLayoutStyle>;
  meta?: CanvasHistoryMeta;
}

const SESSION_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
const INLINE_RUN_TAGS = new Set([
  'span', 'font', 'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'small', 'big',
]);
const OVERRIDE_STYLE_KEYS = [
  'font-family', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-decoration-line', 'color', 'text-transform', 'background-color',
];

function parseStyleMap(styleAttr: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!styleAttr) return map;
  for (const part of styleAttr.split(';')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (key && val) map[key] = val;
  }
  return map;
}

function serializeStyleMap(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

function parsePoints(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return undefined;
  if (raw.endsWith('px')) return Math.round(num * 0.75 * 100) / 100;
  if (raw.endsWith('cm')) return Math.round((num * 72 / 2.54) * 100) / 100;
  if (raw.endsWith('in')) return Math.round(num * 72 * 100) / 100;
  return Math.round(num * 100) / 100;
}

function ruleToCssStyle(rule: ElementStyleRule, textTransformOverride?: string): string {
  const fontFamily = rule.fontFamily.includes(',') ? rule.fontFamily : `"${rule.fontFamily}", serif`;
  const textDecoration = [rule.underline ? 'underline' : '', rule.strikeThrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ') || 'none';
  const textTransform = textTransformOverride ?? (rule.uppercase ? 'uppercase' : 'none');
  return serializeStyleMap({
    'font-family': fontFamily,
    'font-size': `${rule.fontSizePt}pt`,
    'font-weight': rule.bold ? '700' : '400',
    'font-style': rule.italic ? 'italic' : 'normal',
    'text-decoration': textDecoration,
    'color': rule.color,
    'background-color': rule.backgroundColor || 'transparent',
    'text-transform': textTransform,
    'text-align': rule.align,
    'line-height': String(rule.lineHeight),
    'margin-top': `${rule.spaceBeforePt}pt`,
    'margin-bottom': `${rule.spaceAfterPt}pt`,
    'text-indent': `${rule.firstLineIndentPt}pt`,
    'margin-left': `${rule.indentLeftPt ?? 0}pt`,
    'margin-right': `${rule.indentRightPt ?? 0}pt`,
  });
}

function stripRunStyleOverrides(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  return nodes.map(node => {
    if (node.kind === 'text') return node;
    const children = stripRunStyleOverrides(node.children);
    if (!INLINE_RUN_TAGS.has(node.tag) || 'data-word-rev' in node.attributes) {
      return children === node.children ? node : { ...node, children };
    }
    const styleMap = parseStyleMap(node.attributes['style']);
    for (const key of OVERRIDE_STYLE_KEYS) delete styleMap[key];
    const nextAttrs: Record<string, string> = { ...node.attributes };
    const nextStyle = serializeStyleMap(styleMap);
    if (nextStyle) nextAttrs['style'] = nextStyle;
    else delete nextAttrs['style'];
    if (node.tag === 'font') {
      delete nextAttrs['face'];
      delete nextAttrs['size'];
      delete nextAttrs['color'];
    }
    const nextTag = ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font'].includes(node.tag) ? 'span' : node.tag;
    return { ...node, tag: nextTag, attributes: nextAttrs, children };
  });
}

function unwrapApaRunInChildren(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  const out: DocumentNode[] = [];
  for (const child of nodes) {
    if (child.kind === 'element' && 'data-apa-heading-level' in child.attributes) {
      out.push(...child.children);
    } else {
      out.push(child);
    }
  }
  return out;
}

function normalizeHeadingSearchTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(\d+(?:\.\d+)*\.?)(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/g, '$1 ')
    .trim()
    .toLowerCase();
}

/** Persistent editing session. Neither keystrokes nor selection read editable HTML. */
export class CanvasEditSession {
  readonly engine: DocumentCanvasEngine;
  onCheckpoint?: () => void;
  section = 0;
  selection: DocumentSelection | null = null;
  pendingInlineStyle: Record<string, string> | null = null;
  trackChangesEnabled = false;
  reviewAuthor = 'Usuario';
  private searchMatches: CanvasTextMatch[] = [];
  private activeSearchMatchIdx = -1;
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private typingAt = 0;
  private typingKind = '';
  private idSeq = 0;
  private a11yBlocksCache: {
    roots: (readonly DocumentNode[])[];
    displayLists: (readonly PageDisplayList[])[];
    blocks: CanvasAccessibleBlock[];
  } | null = null;
  private readonly subtreeCaps = new WeakMap<
    readonly DocumentNode[],
    { hasToc: boolean; hasLatex: boolean; hasCheckbox: boolean; hasLink: boolean }
  >();

  private getSubtreeCaps(roots: readonly DocumentNode[]): {
    hasToc: boolean;
    hasLatex: boolean;
    hasCheckbox: boolean;
    hasLink: boolean;
  } {
    const cached = this.subtreeCaps.get(roots);
    if (cached) return cached;
    const caps = { hasToc: false, hasLatex: false, hasCheckbox: false, hasLink: false };
    const visit = (nodes: readonly DocumentNode[]) => {
      for (const n of nodes) {
        if (n.kind !== 'element') continue;
        const cls = n.attributes['class'] || '';
        if (!caps.hasToc && cls.includes('word-toc-entry')) caps.hasToc = true;
        if (!caps.hasLatex && cls.includes('word-latex-formula')) caps.hasLatex = true;
        if (!caps.hasCheckbox && n.tag === 'input' && (n.attributes['type'] || '').toLowerCase() === 'checkbox') {
          caps.hasCheckbox = true;
        }
        if (!caps.hasLink && n.tag === 'a' && (n.attributes['href'] || '').trim()) {
          caps.hasLink = true;
        }
        if (caps.hasToc && caps.hasLatex && caps.hasCheckbox && caps.hasLink) return;
        if (n.children.length) visit(n.children);
      }
    };
    visit(roots);
    this.subtreeCaps.set(roots, caps);
    return caps;
  }

  constructor(public geometry: PageGeometry, defaults: Partial<ResolvedLayoutStyle> = {}, measure?: MeasureText) {
    this.engine = new DocumentCanvasEngine(measure, defaults);
  }

  private uid(prefix = 'c'): string {
    return `${prefix}-${Date.now().toString(36)}-${++this.idSeq}`;
  }

  load(pages: readonly DocumentPage[], preloadedModels?: readonly EngineSectionSnapshot[]): void {
    this.engine.syncPages(pages, this.geometry, preloadedModels);
    this.past = [];
    this.future = [];
    this.selection = null;
    this.pendingInlineStyle = null;
    this.a11yBlocksCache = null;
    this.section = 0;
  }

  exportSectionModels(): EngineSectionSnapshot[] {
    return this.engine.snapshot();
  }

  get pages(): DocumentPage[] {
    return this.engine.getPages();
  }

  get displayLists(): PageDisplayList[] {
    return this.engine.getDisplayLists();
  }

  setSelection(section: number, selection: DocumentSelection | null): void {
    this.section = section;
    this.selection = selection;
    this.pendingInlineStyle = null;
    this.engine.setSelection(section, selection);
    this.typingAt = 0;
  }

  sectionForPage(pageId: string): number {
    return this.engine.getSections().findIndex(s => s.displayLists.some(p => p.id === pageId));
  }

  selectAt(pageId: string, x: number, y: number, extend = false): boolean {
    const position = this.engine.hitTest(pageId, x, y);
    const section = this.sectionForPage(pageId);
    if (!position || section < 0) return false;
    if (extend && this.selection && section !== this.section) return false;
    this.setSelection(section, { anchor: extend && this.selection ? this.selection.anchor : position, focus: position });
    return true;
  }

  private resolveBlockForPosition(
    roots: readonly DocumentNode[],
    nodeId: string,
  ): Extract<DocumentNode, { kind: 'element' }> | null {
    const path = findAncestorPath(roots, nodeId);
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i];
      if (node.kind === 'element' && (BLOCK_TAGS.has(node.tag) || node.tag === 'pre' || node.tag === 'td' || node.tag === 'th')) {
        return node;
      }
    }
    return null;
  }

  /** Selects the entire word under `(x, y)` on `pageId` (double-click behavior). */
  selectWordAt(pageId: string, x: number, y: number): boolean {
    const position = this.engine.hitTest(pageId, x, y);
    const sectionIndex = this.sectionForPage(pageId);
    if (!position || sectionIndex < 0) return false;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    const block = this.resolveBlockForPosition(roots, position.nodeId);
    const leaves = textNodes(block ? [block] : roots);
    if (!leaves.length) return this.selectAt(pageId, x, y, false);

    let globalOffset = 0;
    let foundLeaf = false;
    const fullText = leaves.map(l => {
      if (!foundLeaf) {
        if (l.id === position.nodeId) {
          globalOffset += Math.max(0, Math.min(position.offset, l.text.length));
          foundLeaf = true;
        } else {
          globalOffset += l.text.length;
        }
      }
      return l.text;
    }).join('');
    if (!foundLeaf || !fullText.length) return this.selectAt(pageId, x, y, false);

    const isWordChar = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
    let idx = Math.max(0, Math.min(globalOffset, fullText.length - 1));
    if (!isWordChar(fullText[idx]) && globalOffset > 0 && isWordChar(fullText[globalOffset - 1])) {
      idx = globalOffset - 1;
    }

    let start = idx;
    let end = idx + 1;
    if (isWordChar(fullText[idx])) {
      while (start > 0 && isWordChar(fullText[start - 1])) start--;
      while (end < fullText.length && isWordChar(fullText[end])) end++;
    } else {
      const isSpace = /\s/.test(fullText[idx]);
      while (start > 0 && (isSpace ? /\s/.test(fullText[start - 1]) : !isWordChar(fullText[start - 1]) && !/\s/.test(fullText[start - 1]))) {
        start--;
      }
      while (end < fullText.length && (isSpace ? /\s/.test(fullText[end]) : !isWordChar(fullText[end]) && !/\s/.test(fullText[end]))) {
        end++;
      }
    }

    const posForGlobal = (target: number): DocumentPosition => {
      let acc = 0;
      for (const leaf of leaves) {
        const nextAcc = acc + leaf.text.length;
        if (target <= nextAcc) return { nodeId: leaf.id, offset: Math.max(0, target - acc) };
        acc = nextAcc;
      }
      const last = leaves[leaves.length - 1];
      return { nodeId: last.id, offset: last.text.length };
    };

    this.setSelection(sectionIndex, { anchor: posForGlobal(start), focus: posForGlobal(end) });
    return true;
  }

  /** Selects the entire paragraph/block under `(x, y)` on `pageId` (triple-click behavior). */
  selectParagraphAt(pageId: string, x: number, y: number): boolean {
    const position = this.engine.hitTest(pageId, x, y);
    const sectionIndex = this.sectionForPage(pageId);
    if (!position || sectionIndex < 0) return false;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    const block = this.resolveBlockForPosition(roots, position.nodeId);
    if (!block) return this.selectAt(pageId, x, y, false);
    const leaves = textNodes([block]);
    if (!leaves.length) {
      const pos: DocumentPosition = { nodeId: block.id, offset: 0 };
      this.setSelection(sectionIndex, { anchor: pos, focus: pos });
      return true;
    }
    const first = leaves[0];
    const last = leaves[leaves.length - 1];
    this.setSelection(sectionIndex, {
      anchor: { nodeId: first.id, offset: 0 },
      focus: { nodeId: last.id, offset: last.text.length },
    });
    return true;
  }

  /** Detects if pointer coordinates `(x, y)` on `pageId` hit a `.word-toc-entry` row. */
  hitTocEntry(pageId: string, x: number, y: number): CanvasTocEntryHit | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    const sectionIndex = this.sectionForPage(pageId);
    if (!page || sectionIndex < 0) return null;
    if (x < this.geometry.left - 12 || x > this.geometry.width - this.geometry.right + 12) return null;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    if (!this.getSubtreeCaps(roots).hasToc) return null;
    const checkedNodes = new Set<string>();
    for (const command of page.commands) {
      if (command.kind !== 'text' || !command.source) continue;
      const { top, height, start } = command.source;
      if (y < top - 3 || y > top + height + 3 || checkedNodes.has(start.nodeId)) continue;
      checkedNodes.add(start.nodeId);
      const path = findAncestorPath(roots, start.nodeId);
      const tocNode = path.find(
        (n): n is Extract<DocumentNode, { kind: 'element' }> =>
          n.kind === 'element' && (n.attributes['class'] || '').split(/\s+/).includes('word-toc-entry'),
      );
      if (tocNode) {
        return this.extractTocEntryHit(tocNode);
      }
    }
    return null;
  }

  /** Detects if pointer coordinates `(x, y)` on `pageId` hit a `.word-latex-formula` block. */
  hitLatexFormula(pageId: string, x: number, y: number): CanvasLatexFormulaHit | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    const sectionIndex = this.sectionForPage(pageId);
    if (!page || sectionIndex < 0) return null;
    if (x < this.geometry.left - 12 || x > this.geometry.width - this.geometry.right + 12) return null;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    if (!this.getSubtreeCaps(roots).hasLatex) return null;
    const checkedNodes = new Set<string>();
    for (const command of page.commands) {
      if (command.kind !== 'text' || !command.source) continue;
      const { top, height, start } = command.source;
      if (y < top - 4 || y > top + height + 4 || checkedNodes.has(start.nodeId)) continue;
      checkedNodes.add(start.nodeId);
      const path = findAncestorPath(roots, start.nodeId);
      const latexNode = path.find(
        (n): n is Extract<DocumentNode, { kind: 'element' }> =>
          n.kind === 'element' && (n.attributes['class'] || '').split(/\s+/).includes('word-latex-formula'),
      );
      if (latexNode) {
        const encoded = latexNode.attributes['data-latex'] || '';
        let latex = '';
        try {
          latex = encoded ? decodeURIComponent(encoded) : '';
        } catch {
          latex = encoded;
        }
        return { nodeId: latexNode.id, latex };
      }
    }
    return null;
  }

  /** Detects if pointer coordinates `(x, y)` on `pageId` hit an `<img>` block. */
  hitImage(pageId: string, x: number, y: number): CanvasImageHit | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    if (!page) return null;
    const pageIndex = this.engine.getDisplayLists().findIndex(p => p.id === pageId);
    for (const command of page.commands) {
      if (command.kind === 'image' && command.nodeId) {
        if (x >= command.x && x <= command.x + command.width &&
            y >= command.y && y <= command.y + command.height) {
          return {
            pageId,
            pageIndex: pageIndex >= 0 ? pageIndex : 0,
            nodeId: command.nodeId,
            assetId: command.assetId,
            x: command.x,
            y: command.y,
            width: command.width,
            height: command.height,
          };
        }
      }
    }
    return null;
  }

  /** Detects if pointer coordinates `(x, y)` on `pageId` hit a checkbox `<input type="checkbox">`. */
  hitCheckbox(pageId: string, x: number, y: number): string | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    const sectionIndex = this.sectionForPage(pageId);
    if (!page || sectionIndex < 0) return null;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    if (!this.getSubtreeCaps(roots).hasCheckbox) return null;
    for (const command of page.commands) {
      if (command.kind !== 'text' || !command.source) continue;
      const { start, top, width, height } = command.source;
      if (x < command.x - 2 || x > command.x + width + 2 || y < top - 2 || y > top + height + 2) continue;
      const node = findNodeById(roots, start.nodeId);
      if (node?.kind === 'element' && node.tag === 'input' && (node.attributes['type'] || '').toLowerCase() === 'checkbox') {
        return node.id;
      }
    }
    return null;
  }

  /** Toggles the `checked` attribute of a checkbox input node and records an undo snapshot. */
  toggleCheckbox(nodeId: string): boolean {
    const sections = this.engine.getSections();
    const sectionIndex = sections.findIndex(sec => {
      const node = findNodeById(sec.model.state.roots, nodeId);
      return node?.kind === 'element' && node.tag === 'input';
    });
    if (sectionIndex < 0) return false;
    const before = this.snapshot();
    const sec = sections[sectionIndex];
    const toggleNode = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.id === nodeId && node.tag === 'input') {
          const isChecked = node.attributes['checked'] !== undefined;
          const nextAttrs = { ...node.attributes };
          if (isChecked) delete nextAttrs['checked'];
          else nextAttrs['checked'] = '';
          return { ...node, attributes: nextAttrs };
        }
        const nextChildren = toggleNode(node.children);
        return nextChildren.every((c, i) => c === node.children[i]) ? node : { ...node, children: nextChildren };
      });
    const nextRoots = toggleNode(sec.model.state.roots);
    this.engine.commitSectionState(
      sectionIndex,
      { ...sec.model.state, revision: sec.model.state.revision + 1, roots: nextRoots },
      this.geometry,
    );
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.pendingInlineStyle = null;
    this.typingKind = 'checkbox';
    this.typingAt = 0;
    this.onCheckpoint?.();
    return true;
  }

  /** Detects if pointer coordinates `(x, y)` on `pageId` hit an `<a href="...">` run and returns its `href`. */
  hitLink(pageId: string, x: number, y: number): string | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    const sectionIndex = this.sectionForPage(pageId);
    if (!page || sectionIndex < 0) return null;
    const roots = this.engine.getSections()[sectionIndex].model.state.roots;
    if (!this.getSubtreeCaps(roots).hasLink) return null;
    const checkedNodes = new Set<string>();
    for (const command of page.commands) {
      if (command.kind !== 'text' || !command.source) continue;
      const { start, top, width, height } = command.source;
      if (x < command.x || x > command.x + width || y < top || y > top + height || checkedNodes.has(start.nodeId)) continue;
      checkedNodes.add(start.nodeId);
      const path = findAncestorPath(roots, start.nodeId);
      const anchor = [...path].reverse().find(
        (n): n is Extract<DocumentNode, { kind: 'element' }> =>
          n.kind === 'element' && n.tag === 'a' && Boolean((n.attributes['href'] || '').trim()),
      );
      if (anchor) return anchor.attributes['href'].trim();
    }
    return null;
  }

  /** Hit-tests table column or row borders within 3.5px of the pointer. */
  hitTableBorder(pageId: string, x: number, y: number): CanvasTableBorderHit | null {
    const page = this.engine.getDisplayListByPageId(pageId);
    if (!page || !page.tables || !page.tables.length) return null;
    const pageIndex = this.engine.getDisplayLists().findIndex(p => p.id === pageId);
    const HIT_RADIUS = 3.5;
    let closestHit: CanvasTableBorderHit | null = null;
    let closestDist = Infinity;

    for (const tbl of page.tables) {
      // Check inner column dividers (ignore outer rightmost table boundary which cannot be resized independently)
      for (const cb of tbl.colBorders) {
        if (cb.columnIndex >= tbl.columns.length - 1) continue;
        const dx = Math.abs(x - cb.x);
        if (dx <= HIT_RADIUS && y >= cb.top - 2 && y <= cb.bottom + 2) {
          if (dx < closestDist) {
            closestDist = dx;
            closestHit = {
              type: 'col',
              tableId: tbl.tableId,
              pageId,
              pageIndex: pageIndex >= 0 ? pageIndex : 0,
              colIndex: cb.columnIndex,
              tableWidth: tbl.width,
              tableLeft: tbl.x,
              colWidthsPct: tbl.columnWidthsPct,
            };
          }
        }
      }
      // Check row borders (horizontal)
      for (const rb of tbl.rowBorders) {
        const dy = Math.abs(y - rb.y);
        if (dy <= HIT_RADIUS && x >= rb.left - 2 && x <= rb.right + 2) {
          if (dy < closestDist) {
            closestDist = dy;
            closestHit = {
              type: 'row',
              tableId: tbl.tableId,
              pageId,
              pageIndex: pageIndex >= 0 ? pageIndex : 0,
              rowIndex: rb.rowIndex,
              rowId: rb.rowId,
              rowTop: rb.y - rb.rowHeight,
              rowHeight: rb.rowHeight,
            };
          }
        }
      }
    }
    return closestHit;
  }

  /** Guarantees a valid selection exists in the session, defaulting to the given page index when null. */
  ensureSelection(fallbackPageIndex = 0): DocumentSelection | null {
    if (this.selection) return this.selection;
    const pages = this.displayLists;
    if (pages.length) {
      const clamped = Math.max(0, Math.min(pages.length - 1, fallbackPageIndex));
      const page = pages[clamped] || pages[0];
      const secIdx = this.sectionForPage(page.id);
      if (secIdx >= 0) {
        const textCmds = page.commands.filter((c): c is Extract<typeof page.commands[number], { kind: 'text' }> => c.kind === 'text' && !!c.source);
        const targetCmd = textCmds.at(-1);
        if (targetCmd?.source) {
          this.setSelection(secIdx, { anchor: targetCmd.source.end, focus: targetCmd.source.end });
          return this.selection;
        }
      }
    }
    const sections = this.engine.getSections();
    if (sections.length) {
      const leaves = textNodes(sections[0].model.state.roots);
      if (leaves.length) {
        const pos = { nodeId: leaves[0].id, offset: 0 };
        this.setSelection(0, { anchor: pos, focus: pos });
        return this.selection;
      }
      const firstRoot = sections[0].model.state.roots[0];
      if (firstRoot) {
        const pos = { nodeId: firstRoot.id, offset: 0 };
        this.setSelection(0, { anchor: pos, focus: pos });
        return this.selection;
      }
    }
    return null;
  }

  private extractTocEntryHit(tocNode: Extract<DocumentNode, { kind: 'element' }>): CanvasTocEntryHit {
    const targetId = tocNode.attributes['data-toc-target-id'] || undefined;
    const pageAttr = tocNode.attributes['data-toc-page'];
    const parsedPage = pageAttr !== undefined && pageAttr !== '' ? Number(pageAttr) : NaN;
    const pageIndex = Number.isFinite(parsedPage) ? parsedPage : undefined;
    const titleNode = tocNode.children.find(
      c => c.kind === 'element' && (c.attributes['class'] || '').split(/\s+/).includes('word-toc-title'),
    );
    const rawTitle = textNodes(titleNode ? [titleNode] : [tocNode])
      .map(t => t.text)
      .join('')
      .trim();
    return { targetId, pageIndex, ...(rawTitle ? { title: rawTitle } : {}) };
  }

  /** Inspects the current Canvas selection and resolves active Ribbon formats, table context, and TOC entry context. */
  getSelectionContext(): CanvasSelectionContext | null {
    if (!this.selection) return null;
    const section = this.engine.getSections()[this.section];
    if (!section) return null;
    const state = section.model.state;
    const path = findAncestorPath(state.roots, this.selection.focus.nodeId);
    if (!path.length) return null;

    let headingTag = 'P';
    let blockNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    let tableNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    let tableId: string | undefined;
    let rowNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    let rowId: string | undefined;
    let cellNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    let cellId: string | undefined;
    let inUl = false;
    let inOl = false;
    let tocNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    let explicitFontSizePt: number | undefined;
    let explicitLineHeight: string | undefined;
    let explicitSpaceBeforePt: number | undefined;
    let explicitSpaceAfterPt: number | undefined;
    let explicitIndentLeftPt: number | undefined;
    let explicitIndentRightPt: number | undefined;
    let explicitFirstLinePt: number | undefined;

    for (const node of path) {
      if (node.kind !== 'element') continue;
      if (BLOCK_TAGS.has(node.tag) || node.tag === 'pre') {
        blockNode = node;
      }
      if (/^h[1-6]$/i.test(node.tag)) {
        headingTag = node.tag.toUpperCase();
      }
      if (node.attributes['data-apa-run-in']) {
        headingTag = `H${node.attributes['data-apa-run-in']}`;
      }
      if (node.attributes['data-apa-heading-level']) {
        headingTag = `H${node.attributes['data-apa-heading-level']}`;
      }
      if (node.tag === 'ul') inUl = true;
      if (node.tag === 'ol') inOl = true;
      if (node.tag === 'table') {
        tableNode = node;
        tableId = node.id;
      }
      if (node.tag === 'tr') {
        rowNode = node;
        rowId = node.id;
      }
      if (node.tag === 'td' || node.tag === 'th') {
        cellNode = node;
        cellId = node.id;
      }
      if ((node.attributes['class'] || '').split(/\s+/).includes('word-toc-entry')) {
        tocNode = node;
      }
      const inline = parseStyleMap(node.attributes['style']);
      const fsPt = parsePoints(inline['font-size']);
      if (fsPt !== undefined) explicitFontSizePt = fsPt;
      if (node === blockNode) {
        if (node.attributes['data-word-line-spacing']) {
          explicitLineHeight = node.attributes['data-word-line-spacing'];
        } else if (inline['line-height'] && !inline['line-height'].endsWith('px') && !inline['line-height'].endsWith('pt')) {
          explicitLineHeight = inline['line-height'];
        }
        const mt = parsePoints(inline['margin-top']);
        if (mt !== undefined) explicitSpaceBeforePt = mt;
        const mb = parsePoints(inline['margin-bottom']);
        if (mb !== undefined) explicitSpaceAfterPt = mb;
        const ml = parsePoints(inline['margin-left']);
        if (ml !== undefined) explicitIndentLeftPt = ml;
        const mr = parsePoints(inline['margin-right']);
        if (mr !== undefined) explicitIndentRightPt = mr;
        const ti = parsePoints(inline['text-indent']);
        if (ti !== undefined) explicitFirstLinePt = ti;
      }
    }

    const styles = resolveDefaultModelStyles(state, this.engine.getDefaultStyle());
    const leafStyle = styles.get(this.selection.focus.nodeId) || (blockNode ? styles.get(blockNode.id) : undefined);
    const blockStyle = (blockNode ? styles.get(blockNode.id) : undefined) || leafStyle;
    const leafFontPx = parseFloat(leafStyle?.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '14.67');
    const resolvedPt = explicitFontSizePt ?? Math.round(leafFontPx * 0.75 * 2) / 2;
    const rawFamily = (leafStyle?.font.replace(/^.*?\d+(?:\.\d+)?px\s*/, '') || 'Times New Roman')
      .replace(/["']/g, '')
      .split(',')[0]
      .trim() || 'Times New Roman';

    const pending = this.pendingInlineStyle;
    const bold = pending?.['font-weight']
      ? pending['font-weight'] === 'bold' || Number(pending['font-weight']) >= 600
      : /(?:^|\s)(?:bold|[6-9]00)(?:\s|$)/i.test(leafStyle?.font || '');
    const italic = pending?.['font-style']
      ? pending['font-style'] === 'italic' || pending['font-style'] === 'oblique'
      : /\b(?:italic|oblique)\b/i.test(leafStyle?.font || '');
    const pendingDec = pending?.['text-decoration'] || '';
    const underline = pending?.['text-decoration'] !== undefined
      ? pendingDec.includes('underline')
      : Boolean(leafStyle?.underline) || path.some(n => n.kind === 'element' && (n.tag === 'u' || n.tag === 'a'));
    const strikeThrough = pending?.['text-decoration'] !== undefined
      ? pendingDec.includes('line-through')
      : Boolean(leafStyle?.strike) || path.some(n => n.kind === 'element' && ['s', 'strike', 'del'].includes(n.tag));
    const subscript = pending?.['vertical-align']
      ? pending['vertical-align'] === 'sub'
      : (leafStyle?.baselineOffset ?? 0) > 0 ||
        path.some(n => n.kind === 'element' && (n.tag === 'sub' || /\bvertical-align:\s*sub\b/i.test(n.attributes['style'] || '')));
    const superscript = pending?.['vertical-align']
      ? pending['vertical-align'] === 'super'
      : (leafStyle?.baselineOffset ?? 0) < 0 ||
        path.some(n => n.kind === 'element' && (n.tag === 'sup' || /\bvertical-align:\s*super\b/i.test(n.attributes['style'] || '')));

    const align = blockStyle?.align || leafStyle?.align || 'left';
    const fontName = pending?.['font-family']
      ? pending['font-family'].replace(/["']/g, '').split(',')[0].trim()
      : rawFamily;
    const fontSize = pending?.['font-size']
      ? String(parsePoints(pending['font-size']) ?? resolvedPt)
      : String(resolvedPt);
    const lineHeightRatio = explicitLineHeight ?? String(Math.round(((blockStyle?.lineHeight || 18) / leafFontPx) * 100) / 100);
    const spaceBeforePt = explicitSpaceBeforePt ?? Math.round(((blockStyle?.before || 0) * 72 / 96) * 10) / 10;
    const spaceAfterPt = explicitSpaceAfterPt ?? Math.round(((blockStyle?.after || 0) * 72 / 96) * 10) / 10;
    const indentLeftPt = explicitIndentLeftPt ?? ((blockStyle?.indentLeft || 0) * 72 / 96);
    const indentRightPt = explicitIndentRightPt ?? ((blockStyle?.indentRight || 0) * 72 / 96);
    const firstLineIndentPt = Math.round((explicitFirstLinePt ?? ((blockStyle?.firstLineIndent || 0) * 72 / 96)) * 10) / 10;

    const formats: EditorActiveFormats = {
      bold,
      italic,
      underline,
      strikeThrough,
      subscript,
      superscript,
      justifyLeft: align === 'left',
      justifyCenter: align === 'center',
      justifyRight: align === 'right',
      justifyFull: align === 'justify',
      insertUnorderedList: inUl,
      insertOrderedList: inOl,
      heading: headingTag,
      fontName,
      fontSize,
      indentLeftCm: Number(((indentLeftPt / 72) * 2.54).toFixed(2)),
      indentRightCm: Number(((indentRightPt / 72) * 2.54).toFixed(2)),
      firstLineIndentPt,
      spaceBeforePt,
      spaceAfterPt,
      lineHeight: lineHeightRatio,
    };

    const rowHasTopBorder = rowNode ? this.rowHasExplicitTopBorder(rowNode) : false;
    const cellStyleMap = cellNode ? parseStyleMap(cellNode.attributes['style']) : {};
    const rawVAlign = (cellStyleMap['vertical-align'] || '').toLowerCase();
    const verticalAlign: 'top' | 'middle' | 'bottom' | undefined =
      rawVAlign === 'top' || rawVAlign === 'middle' || rawVAlign === 'bottom' ? rawVAlign : undefined;
    const background = cellStyleMap['background-color'] || undefined;
    const repeatHeader = tableNode ? tableNode.attributes['data-repeat-header'] !== 'false' : undefined;
    const table = tableId && rowId && cellId
      ? {
          tableId,
          rowId,
          cellId,
          rowHasTopBorder,
          ...(verticalAlign ? { verticalAlign } : {}),
          ...(background ? { background } : {}),
          ...(repeatHeader !== undefined ? { repeatHeader } : {}),
        }
      : null;
    const tocEntry = tocNode ? this.extractTocEntryHit(tocNode) : null;
    return { formats, table, tocEntry };
  }

  /** Locates a heading in the Canvas display lists by `targetId`, `title`, or `fallbackPageIndex` and places the caret there. */
  findHeadingLocation(targetId?: string, title?: string, fallbackPageIndex?: number): { pageIndex: number; y: number } {
    const sections = this.engine.getSections();
    const locateNode = (sectionIndex: number, node: DocumentNode): { pageIndex: number; y: number } | null => {
      const ids = getSubtreeIds(node);
      const leaves = textNodes([node]);
      if (leaves.length) {
        this.setSelection(sectionIndex, {
          anchor: { nodeId: leaves[0].id, offset: 0 },
          focus: { nodeId: leaves[0].id, offset: 0 },
        });
      }
      let globalPageIdx = 0;
      for (let s = 0; s < sections.length; s++) {
        for (const page of sections[s].displayLists) {
          if (s === sectionIndex) {
            for (const cmd of page.commands) {
              if (cmd.kind === 'text' && cmd.source && ids.has(cmd.source.start.nodeId)) {
                return { pageIndex: globalPageIdx, y: cmd.source.top };
              }
              if (cmd.kind !== 'text' && cmd.nodeId && ids.has(cmd.nodeId)) {
                return { pageIndex: globalPageIdx, y: cmd.y };
              }
            }
          }
          globalPageIdx++;
        }
      }
      return null;
    };

    if (targetId) {
      const searchById = (nodes: readonly DocumentNode[], inToc = false): DocumentNode | null => {
        for (const node of nodes) {
          if (node.kind !== 'element') continue;
          const isToc = inToc || (node.attributes['class'] || '').includes('word-toc-entry');
          if (!isToc && (node.attributes['id'] === targetId || node.attributes['data-word-object-id'] === targetId)) {
            return node;
          }
          const found = searchById(node.children, isToc);
          if (found) return found;
        }
        return null;
      };
      for (let s = 0; s < sections.length; s++) {
        const hit = searchById(sections[s].model.state.roots);
        if (hit) {
          const loc = locateNode(s, hit);
          if (loc) return loc;
        }
      }
    }

    const normTitle = title ? normalizeHeadingSearchTitle(title) : '';
    if (normTitle) {
      const searchByTitle = (nodes: readonly DocumentNode[], inToc = false): DocumentNode | null => {
        for (const node of nodes) {
          if (node.kind !== 'element') continue;
          const isToc = inToc || (node.attributes['class'] || '').includes('word-toc-page-section') || (node.attributes['class'] || '').includes('word-toc-entry');
          if (!isToc && (/^h[1-6]$/i.test(node.tag) || 'data-apa-heading-level' in node.attributes || 'data-apa-run-in' in node.attributes)) {
            const nodeText = normalizeHeadingSearchTitle(textNodes([node]).map(t => t.text).join(''));
            if (nodeText && (nodeText === normTitle || nodeText.includes(normTitle) || normTitle.includes(nodeText))) {
              return node;
            }
          }
          const found = searchByTitle(node.children, isToc);
          if (found) return found;
        }
        return null;
      };
      for (let s = 0; s < sections.length; s++) {
        const hit = searchByTitle(sections[s].model.state.roots);
        if (hit) {
          const loc = locateNode(s, hit);
          if (loc) return loc;
        }
      }
    }

    const total = Math.max(1, this.displayLists.length);
    const clamped = Math.max(0, Math.min(total - 1, fallbackPageIndex ?? 0));
    return { pageIndex: clamped, y: 0 };
  }

  /** Locates a table in the Canvas display lists and places the caret in its first cell. */
  findTableLocation(pageIndex: number, tableIndexInPage = 0, title?: string): { pageIndex: number; y: number } {
    const allLists = this.displayLists;
    if (!allLists.length) return { pageIndex: 0, y: 0 };
    const clamped = Math.max(0, Math.min(allLists.length - 1, pageIndex));
    const targetPage = allLists[clamped];
    const sectionIdx = this.sectionForPage(targetPage.id);
    if (sectionIdx >= 0) {
      const section = this.engine.getSections()[sectionIdx];
      const tables: Extract<DocumentNode, { kind: 'element' }>[] = [];
      const collectTables = (nodes: readonly DocumentNode[]) => {
        for (const n of nodes) {
          if (n.kind !== 'element') continue;
          if (n.tag === 'table') tables.push(n);
          else collectTables(n.children);
        }
      };
      collectTables(section.model.state.roots);

      const pageTables = tables.filter(tbl => {
        const ids = getSubtreeIds(tbl);
        return targetPage.commands.some(cmd => cmd.kind === 'text' && cmd.source && ids.has(cmd.source.start.nodeId));
      });
      let chosen = pageTables[tableIndexInPage] ?? pageTables[0];
      if (!chosen && title) {
        const norm = title.replace(/\s+/g, ' ').trim().toLowerCase();
        chosen = tables.find(tbl => textNodes([tbl]).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase().includes(norm))!;
      }
      if (chosen) {
        const leaves = textNodes([chosen]);
        if (leaves.length) {
          this.setSelection(sectionIdx, {
            anchor: { nodeId: leaves[0].id, offset: 0 },
            focus: { nodeId: leaves[0].id, offset: 0 },
          });
        }
        const ids = getSubtreeIds(chosen);
        let globalIdx = 0;
        for (const sec of this.engine.getSections()) {
          for (const dl of sec.displayLists) {
            for (const cmd of dl.commands) {
              if (cmd.kind === 'text' && cmd.source && ids.has(cmd.source.start.nodeId)) {
                return { pageIndex: globalIdx, y: Math.max(0, cmd.source.top - 24) };
              }
            }
            globalIdx++;
          }
        }
      }
    }
    return { pageIndex: clamped, y: 0 };
  }

  setSearchHighlights(matches: readonly CanvasTextMatch[], activeIndex: number): void {
    this.searchMatches = [...matches];
    this.activeSearchMatchIdx = activeIndex;
  }

  clearSearchHighlights(): void {
    this.searchMatches = [];
    this.activeSearchMatchIdx = -1;
  }

  overlay(page: PageDisplayList): PageDisplayList {
    let searchHighlights: PageSelectionRect[] | undefined;
    let activeSearchHighlight: PageSelectionRect | undefined;
    if (this.searchMatches.length > 0) {
      const pageSec = this.sectionForPage(page.id);
      if (pageSec >= 0) {
        const state = this.engine.getSections()[pageSec].model.state;
        const leaves = textNodes(state.roots);
        const leafOrder = new Map<string, number>();
        leaves.forEach((n, idx) => leafOrder.set(n.id, idx));
        const allRects: PageSelectionRect[] = [];
        this.searchMatches.forEach((match, idx) => {
          if (match.sectionIndex !== pageSec) return;
          const rects = selectionRectsForRange(page, { anchor: match.anchor, focus: match.focus }, leafOrder);
          allRects.push(...rects);
          if (idx === this.activeSearchMatchIdx && rects.length) {
            activeSearchHighlight = rects[0];
          }
        });
        if (allRects.length) searchHighlights = allRects;
      }
    }

    if (!this.selection || this.sectionForPage(page.id) !== this.section) {
      return {
        ...page,
        caret: undefined,
        selections: undefined,
        ...(searchHighlights ? { searchHighlights } : {}),
        ...(activeSearchHighlight ? { activeSearchHighlight } : {}),
      };
    }
    const collapsed = this.selection.anchor.nodeId === this.selection.focus.nodeId && this.selection.anchor.offset === this.selection.focus.offset;
    if (collapsed) {
      return {
        ...page,
        caret: caretForPosition(page, this.selection.focus),
        selections: undefined,
        ...(searchHighlights ? { searchHighlights } : {}),
        ...(activeSearchHighlight ? { activeSearchHighlight } : {}),
      };
    }
    const state = this.engine.getSections()[this.section].model.state, leaves = textNodes(state.roots);
    const leafOrder = new Map<string, number>();
    leaves.forEach((n, idx) => leafOrder.set(n.id, idx));
    const rects = selectionRectsForRange(page, this.selection, leafOrder);
    const selections: PageDisplayList['selections'] = rects.length ? rects : undefined;
    return {
      ...page,
      caret: undefined,
      selections,
      ...(searchHighlights ? { searchHighlights } : {}),
      ...(activeSearchHighlight ? { activeSearchHighlight } : {}),
    };
  }

  private numberedRoots: readonly (readonly DocumentNode[])[] = [];
  private numberingEnabled: boolean | undefined;

  renumberHeadings(enabled: boolean): void {
    const sections = this.engine.getSections();
    if (enabled === this.numberingEnabled && sections.length === this.numberedRoots.length && sections.every((section, index) => section.model.state.roots === this.numberedRoots[index])) return;
    const outline = new HeadingOutlineCounter();
    sections.forEach((section, index) => {
      const state = section.model.state;
      const roots = numberModelHeadings(state.roots, outline, enabled);
      if (roots !== state.roots) this.engine.commitSectionState(index, {...state, roots, revision: state.revision + 1}, this.geometry);
    });
    this.numberingEnabled = enabled;
    this.numberedRoots = sections.map(section => section.model.state.roots);
  }

  private apaHeadingRoots: readonly (readonly DocumentNode[])[] = [];
  private apaHeadingTemplate?: StyleTemplate;
  private readonly apaChapterNodes = new WeakMap<DocumentNode, boolean>();
  private readonly apaH1Nodes = new WeakMap<DocumentNode, boolean>();

  /** Chapter uses APA's centered title; H1 shares the H2 presentation. */
  normalizeApaChapterHeadings(template?: StyleTemplate): void {
    if (template?.academicStyle !== 'apa7') { this.apaHeadingTemplate = undefined; return; }
    const sections = this.engine.getSections();
    if (template === this.apaHeadingTemplate && sections.length === this.apaHeadingRoots.length && sections.every((section, index) => section.model.state.roots === this.apaHeadingRoots[index])) return;
    const content = (node: DocumentNode): string => node.kind === 'text' ? node.text : 'data-word-heading-number' in node.attributes ? '' : node.children.map(content).join('');
    const hasChapter = (node: DocumentNode): boolean => {
      const cached = this.apaChapterNodes.get(node);
      if (cached !== undefined) return cached;
      const result = node.kind === 'element' && (('data-word-chapter' in node.attributes && Boolean(content(node).replace(/[\u200b-\u200d\ufeff]/g, '').trim())) || node.children.some(hasChapter));
      this.apaChapterNodes.set(node, result);return result;
    };
    const hasH1 = (node: DocumentNode): boolean => {
      const cached = this.apaH1Nodes.get(node);
      if (cached !== undefined) return cached;
      const result = node.kind === 'element' && (node.tag === 'h1' || node.children.some(hasH1));
      this.apaH1Nodes.set(node, result);return result;
    };
    const hasChapters = sections.some(section => section.model.state.roots.some(hasChapter));
    const transform = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let changed = false;
      const result = nodes.map(node => {
        if (node.kind !== 'element' || !hasH1(node)) return node;
        if (node.tag === 'h1' && (hasChapters || 'data-word-apa-chapter-style' in node.attributes)) {
          const chapter = 'data-word-chapter' in node.attributes;
          const rule = hasChapters && !chapter ? template.rules.H2 : template.rules.H1;
          const style = ruleToCssStyle(rule, 'capitalize');
          const marked = 'data-word-apa-chapter-style' in node.attributes;
          if (node.attributes['style'] === style && marked === hasChapters && node.attributes['data-word-line-spacing'] === String(rule.lineHeight)) return node;
          const attributes: Record<string, string> = {...node.attributes, style, 'data-word-line-spacing': String(rule.lineHeight)};
          if (hasChapters) attributes['data-word-apa-chapter-style'] = 'true';
          else delete attributes['data-word-apa-chapter-style'];
          changed = true;
          return {...node, attributes, children: stripRunStyleOverrides(node.children)};
        }
        const children = transform(node.children);
        if (children === node.children) return node;
        changed = true;
        return {...node, children};
      });
      return changed ? result : nodes;
    };
    sections.forEach((section, index) => {
      const state = section.model.state, roots = transform(state.roots);
      if (roots !== state.roots) this.engine.commitSectionState(index, {...state, roots, revision: state.revision + 1}, this.geometry);
    });
    this.apaHeadingTemplate = template;
    this.apaHeadingRoots = sections.map(section => section.model.state.roots);
  }

  private snapshot(meta?: CanvasHistoryMeta): Snapshot {
    return {
      states: this.engine.snapshot(),
      section: this.section,
      selection: this.selection,
      geometry: { ...this.geometry },
      defaults: { ...this.engine.getDefaultStyle() },
      ...(meta ? { meta } : {}),
    };
  }

  private commit(operation: Parameters<DocumentCanvasEngine['applyOperation']>[1], kind: string): void {
    const before = this.snapshot(), now = Date.now();
    const grouped = kind === this.typingKind && now - this.typingAt < 800;
    this.engine.applyOperation(this.section, operation, this.geometry);
    if (!grouped) {
      this.onCheckpoint?.();
      this.past.push(before);
      if (this.past.length > 50) this.past.shift();
    }
    this.future = [];
    this.selection = this.engine.getSections()[this.section].model.state.selection;
    this.typingKind = kind;
    this.typingAt = now;
  }

  private commitCustomState(nextRoots: readonly DocumentNode[], nextSelection: DocumentSelection | null, kind: string): boolean {
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const before = this.snapshot();
    const nextState: DocumentState = {
      revision: section.model.state.revision + 1,
      roots: nextRoots,
      selection: nextSelection,
    };
    this.engine.commitSectionState(this.section, nextState, this.geometry);
    this.onCheckpoint?.();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.selection = nextSelection;
    this.typingKind = kind;
    this.typingAt = 0;
    return true;
  }

  private selectedBlockIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.selection) return ids;
    const section = this.engine.getSections()[this.section];
    if (!section) return ids;
    const roots = section.model.state.roots;
    const leaves = textNodes(roots);
    const ai = leaves.findIndex(n => n.id === this.selection!.anchor.nodeId);
    const bi = leaves.findIndex(n => n.id === this.selection!.focus.nodeId);
    if (ai < 0 || bi < 0) {
      const fallbackPath = findAncestorPath(roots, this.selection.focus.nodeId);
      for (let j = fallbackPath.length - 1; j >= 0; j--) {
        const node = fallbackPath[j];
        if (node.kind === 'element' && BLOCK_TAGS.has(node.tag)) {
          ids.add(node.id);
          break;
        }
      }
      return ids;
    }
    const [start, end] = ai <= bi ? [ai, bi] : [bi, ai];
    for (let i = start; i <= end; i++) {
      const path = findAncestorPath(roots, leaves[i].id);
      for (let j = path.length - 1; j >= 0; j--) {
        const node = path[j];
        if (node.kind === 'element' && BLOCK_TAGS.has(node.tag)) {
          ids.add(node.id);
          break;
        }
      }
    }
    return ids;
  }

  private mapSelectedBlocks(
    transform: (block: Extract<DocumentNode, { kind: 'element' }>) => DocumentNode,
    kind: string,
  ): boolean {
    const targetBlockIds = this.selectedBlockIds();
    if (!targetBlockIds.size) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    let changed = false;
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let localChanged = false;
      const mapped = nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (targetBlockIds.has(node.id)) {
          const next = transform(node);
          if (next !== node) {
            changed = true;
            localChanged = true;
          }
          return next;
        }
        let hitsSubtree = false;
        const subIds = getSubtreeIds(node);
        for (const id of targetBlockIds) {
          if (subIds.has(id)) {
            hitsSubtree = true;
            break;
          }
        }
        if (!hitsSubtree) return node;
        const nextChildren = rewrite(node.children);
        if (nextChildren !== node.children) {
          localChanged = true;
          return { ...node, children: nextChildren };
        }
        return node;
      });
      return localChanged ? mapped : nodes;
    };
    const nextRoots = rewrite(section.model.state.roots);
    if (!changed) return false;
    return this.commitCustomState(nextRoots, this.selection, kind);
  }

  /** Applies a block style rule (`P`, `H1`–`H6`) directly on the DocumentModel without leaving Canvas mode. */
  applyChapter():boolean {
    return this.mapSelectedBlocks(block=>{
      const attributes:Record<string,string>={...block.attributes,'data-word-chapter':'true',id:block.attributes['id']||this.uid('chapter'),style:serializeStyleMap({...parseStyleMap(block.attributes['style']),'text-align':'center','font-weight':'700','text-indent':'0'})};
      delete attributes['data-apa-run-in'];delete attributes['data-apa-heading-level'];
      const strip=(nodes:readonly DocumentNode[]):DocumentNode[]=>nodes.filter(n=>n.kind!=='element'||!('data-word-heading-number' in n.attributes)).map(n=>n.kind==='element'?{...n,children:strip(n.children)}:n);
      return {...block,tag:'h1',attributes,children:strip(block.children)};
    },'chapter');
  }

  applyBlockRule(rule: ElementStyleRule, template?: StyleTemplate): boolean {
    const isApaRunIn = template?.academicStyle === 'apa7' && ['H4', 'H5', 'H6'].includes(rule.target);
    const isApaTopHeading = template?.academicStyle === 'apa7' && ['H1', 'H2', 'H3'].includes(rule.target);
    return this.mapSelectedBlocks(block => {
      const unwrappedChildren = stripRunStyleOverrides(unwrapApaRunInChildren(block.children));
      if (isApaRunIn && template) {
        const level = rule.target === 'H4' ? '4' : '5';
        const pRule = template.rules.P;
        const pStyle = ruleToCssStyle(pRule);
        const headingId = block.attributes['id'] || this.uid('heading');
        const spanStyle = serializeStyleMap({
          'font-weight': 'bold',
          'font-style': level === '5' ? 'italic' : 'normal',
          'text-transform': 'capitalize',
        });
        const nextAttrs: Record<string, string> = {
          ...block.attributes,
          'data-apa-run-in': level,
          'data-word-line-spacing': String(pRule.lineHeight),
          style: pStyle,
        };
        delete nextAttrs['id'];
        return {
          id: block.id,
          kind: 'element',
          tag: block.tag === 'li' ? 'li' : 'p',
          attributes: nextAttrs,
          children: [
            {
              id: this.uid('apa-h'),
              kind: 'element',
              tag: 'span',
              attributes: {
                id: headingId,
                'data-apa-heading-level': level,
                style: spanStyle,
              },
              children: unwrappedChildren,
            },
          ],
        };
      }

      const nextTag = block.tag === 'li' ? 'li' : rule.target.toLowerCase();
      const isHeading = /^h[1-6]$/i.test(nextTag);
      const nextAttrs: Record<string, string> = { ...block.attributes };
      delete nextAttrs['data-apa-run-in'];
      delete nextAttrs['data-apa-heading-level'];
      delete nextAttrs['data-word-chapter'];
      if (isHeading && !nextAttrs['id']) {
        nextAttrs['id'] = this.uid('heading');
      }
      nextAttrs['data-word-line-spacing'] = String(rule.lineHeight);
      const effectiveRule = block.tag === 'li' ? { ...rule, firstLineIndentPt: 0 } : rule;
      nextAttrs['style'] = ruleToCssStyle(effectiveRule, isApaTopHeading ? 'capitalize' : undefined);
      return {
        ...block,
        tag: nextTag,
        attributes: nextAttrs,
        children: unwrappedChildren,
      };
    }, 'format-heading');
  }

  /** Applies block-level CSS / attribute changes directly on the selected block(s) in the model. */
  applyBlockStylePatch(
    stylePatch: Record<string, string | null>,
    attrPatch?: Record<string, string | null>,
  ): boolean {
    return this.mapSelectedBlocks(block => {
      const styleMap = parseStyleMap(block.attributes['style']);
      for (const [k, v] of Object.entries(stylePatch)) {
        if (v === null) delete styleMap[k];
        else styleMap[k] = v;
      }
      const nextAttrs: Record<string, string> = { ...block.attributes };
      const nextStyle = serializeStyleMap(styleMap);
      if (nextStyle) nextAttrs['style'] = nextStyle;
      else delete nextAttrs['style'];
      if (attrPatch) {
        for (const [k, v] of Object.entries(attrPatch)) {
          if (v === null) delete nextAttrs[k];
          else nextAttrs[k] = v;
        }
      }
      return { ...block, attributes: nextAttrs };
    }, 'format-block-style');
  }

  /** Adjusts list nesting level (`+1` or `-1`) on selected `<li>` blocks via `data-list-level`. */
  indentListItem(delta: 1 | -1): boolean {
    if (!this.selection) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const leaves = textNodes(roots);
    let ai = leaves.findIndex(n => n.id === this.selection!.anchor.nodeId);
    let bi = leaves.findIndex(n => n.id === this.selection!.focus.nodeId);
    if (ai < 0 || bi < 0) return false;
    if (ai > bi) [ai, bi] = [bi, ai];

    const liIds = new Set<string>();
    for (let i = ai; i <= bi; i++) {
      const path = findAncestorPath(roots, leaves[i].id);
      const li = [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'li');
      if (li) liIds.add(li.id);
    }
    if (!liIds.size) return false;

    let changed = false;
    const mapLi = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.tag === 'li' && liIds.has(node.id)) {
          const cur = Math.max(0, Number(node.attributes['data-list-level'] || 0) || 0);
          const next = Math.max(0, Math.min(5, cur + delta));
          if (next === cur && !node.children.some(c => c.kind === 'element')) return node;
          if (next !== cur) {
            changed = true;
            const nextAttrs = { ...node.attributes };
            if (next === 0) delete nextAttrs['data-list-level'];
            else nextAttrs['data-list-level'] = String(next);
            return { ...node, attributes: nextAttrs, children: mapLi(node.children) };
          }
        }
        if (node.children.length) {
          const nextChildren = mapLi(node.children);
          if (nextChildren !== node.children) return { ...node, children: nextChildren };
        }
        return node;
      });

    const nextRoots = mapLi(roots);
    return changed ? this.commitCustomState(nextRoots, this.selection, 'indent-list') : false;
  }

  /** Restarts ordered list numbering at `startAt` (default `1`) on the active list item. */
  restartListNumbering(startAt = 1): boolean {
    if (!this.selection) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const path = findAncestorPath(roots, this.selection.focus.nodeId);
    const li = [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'li');
    if (!li) return false;
    const targetVal = String(Math.max(1, Math.floor(startAt)));
    let changed = false;
    const mapLi = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.id === li.id) {
          changed = true;
          return { ...node, attributes: { ...node.attributes, value: targetVal } };
        }
        if (getSubtreeIds(node).has(li.id)) {
          return { ...node, children: mapLi(node.children) };
        }
        return node;
      });
    const nextRoots = mapLi(roots);
    return changed ? this.commitCustomState(nextRoots, this.selection, 'restart-list') : false;
  }

  /** Adjusts left margin indent (`+24pt` or `-24pt`) on selected blocks (or list level when in `<li>`). */
  adjustBlockIndent(deltaPt: number): boolean {
    if (this.selection) {
      const section = this.engine.getSections()[this.section];
      if (section) {
        const path = findAncestorPath(section.model.state.roots, this.selection.focus.nodeId);
        if (path.some(n => n.kind === 'element' && n.tag === 'li')) {
          return this.indentListItem(deltaPt >= 0 ? 1 : -1);
        }
      }
    }
    return this.mapSelectedBlocks(block => {
      const styleMap = parseStyleMap(block.attributes['style']);
      const currentPt = parsePoints(styleMap['margin-left']) ?? 0;
      const nextPt = Math.max(0, Math.round((currentPt + deltaPt) * 100) / 100);
      styleMap['margin-left'] = `${nextPt}pt`;
      return {
        ...block,
        attributes: { ...block.attributes, style: serializeStyleMap(styleMap) },
      };
    }, 'format-indent');
  }

  /** Applies inline CSS properties (`font-weight`, `font-style`, `text-decoration`, `font-size`, `font-family`, `color`, `background-color`) to the selection. */
  applyInlineStyle(patch: Record<string, string | null>): boolean {
    if (!this.selection) return false;
    const { anchor, focus } = this.selection;
    if (anchor.nodeId === focus.nodeId && anchor.offset === focus.offset) {
      const nextPending: Record<string, string> = { ...(this.pendingInlineStyle || {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete nextPending[k];
        else nextPending[k] = v;
      }
      this.pendingInlineStyle = Object.keys(nextPending).length ? nextPending : null;
      return true;
    }

    this.pendingInlineStyle = null;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const leaves = textNodes(roots);
    let ai = leaves.findIndex(n => n.id === anchor.nodeId);
    let bi = leaves.findIndex(n => n.id === focus.nodeId);
    if (ai < 0 || bi < 0) return false;
    let startPos = anchor;
    let endPos = focus;
    if (ai > bi || (ai === bi && anchor.offset > focus.offset)) {
      [ai, bi] = [bi, ai];
      [startPos, endPos] = [focus, anchor];
    }

    const selectedLeafRanges = new Map<string, { start: number; end: number }>();
    for (let i = ai; i <= bi; i++) {
      const leaf = leaves[i];
      const s = i === ai ? startPos.offset : 0;
      const e = i === bi ? endPos.offset : leaf.text.length;
      if (e > s) selectedLeafRanges.set(leaf.id, { start: s, end: e });
    }
    if (!selectedLeafRanges.size) return false;

    const cleanPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== null) cleanPatch[k] = v;
    }
    const spanStyle = serializeStyleMap(cleanPatch);
    let newAnchor: DocumentPosition = startPos;
    let newFocus: DocumentPosition = endPos;

    const transformList = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let listChanged = false;
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'text') {
          const range = selectedLeafRanges.get(node.id);
          if (!range) {
            out.push(node);
            continue;
          }
          listChanged = true;
          const beforeText = node.text.slice(0, range.start);
          const midText = node.text.slice(range.start, range.end);
          const afterText = node.text.slice(range.end);
          if (beforeText) {
            out.push({ id: this.uid('txt-b'), kind: 'text', text: beforeText });
          }
          const midNode: DocumentNode = { id: node.id, kind: 'text', text: midText };
          if (spanStyle) {
            out.push({
              id: this.uid('span'),
              kind: 'element',
              tag: 'span',
              attributes: { style: spanStyle },
              children: [midNode],
            });
          } else {
            out.push(midNode);
          }
          if (afterText) {
            out.push({ id: this.uid('txt-a'), kind: 'text', text: afterText });
          }
          if (node.id === startPos.nodeId) newAnchor = { nodeId: node.id, offset: 0 };
          if (node.id === endPos.nodeId) newFocus = { nodeId: node.id, offset: midText.length };
          continue;
        }

        const subIds = getSubtreeIds(node);
        let hits = false;
        for (const id of selectedLeafRanges.keys()) {
          if (subIds.has(id)) {
            hits = true;
            break;
          }
        }
        if (!hits) {
          out.push(node);
          continue;
        }

        if (node.kind === 'element' && (node.tag === 'span' || node.tag === 'sub' || node.tag === 'sup')) {
          const subLeaves = textNodes([node]);
          const isFullyCovered = subLeaves.length > 0 && subLeaves.every(l => {
            const r = selectedLeafRanges.get(l.id);
            return r && r.start === 0 && r.end === l.text.length;
          });
          if (isFullyCovered) {
            listChanged = true;
            const styleMap = parseStyleMap(node.attributes['style']);
            for (const [k, v] of Object.entries(patch)) {
              if (v === null) {
                delete styleMap[k];
              } else {
                styleMap[k] = v;
              }
            }
            let tag = node.tag;
            if ((node.tag === 'sub' || node.tag === 'sup') && (patch['vertical-align'] === null || patch['vertical-align'] === 'baseline')) {
              tag = 'span';
            }
            const newStyle = serializeStyleMap(styleMap);
            const nonStyleAttrs = Object.keys(node.attributes).filter(k => k !== 'style' && k !== 'id');
            if (tag === 'span' && !newStyle && nonStyleAttrs.length === 0) {
              out.push(...node.children);
            } else {
              out.push({
                ...node,
                tag,
                attributes: newStyle ? { ...node.attributes, style: newStyle } : { ...node.attributes, style: '' },
              });
            }
            continue;
          }
        }

        const nextChildren = transformList(node.children);
        if (nextChildren !== node.children) {
          listChanged = true;
          out.push({ ...node, children: nextChildren });
        } else {
          out.push(node);
        }
      }
      return listChanged ? out : nodes;
    };

    const nextRoots = transformList(roots);
    if (nextRoots === roots) return false;
    return this.commitCustomState(nextRoots, { anchor: newAnchor, focus: newFocus }, 'format-inline');
  }

  /** Toggles bold, italic, underline, strikethrough, subscript, or superscript directly on the Canvas selection. */
  toggleInlineCommand(command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'subscript' | 'superscript'): boolean {
    const ctx = this.getSelectionContext();
    if (!ctx) return false;
    if (command === 'bold') {
      return this.applyInlineStyle({ 'font-weight': ctx.formats.bold ? 'normal' : 'bold' });
    }
    if (command === 'italic') {
      return this.applyInlineStyle({ 'font-style': ctx.formats.italic ? 'normal' : 'italic' });
    }
    if (command === 'underline') {
      return this.applyInlineStyle({ 'text-decoration': ctx.formats.underline ? 'none' : 'underline' });
    }
    if (command === 'strikeThrough') {
      return this.applyInlineStyle({ 'text-decoration': ctx.formats.strikeThrough ? 'none' : 'line-through' });
    }
    if (command === 'subscript') {
      const active = ctx.formats.subscript;
      return this.applyInlineStyle({
        'vertical-align': active ? null : 'sub',
        'font-size': active ? null : '9pt',
      });
    }
    const active = ctx.formats.superscript;
    return this.applyInlineStyle({
      'vertical-align': active ? null : 'super',
      'font-size': active ? null : '9pt',
    });
  }

  /** Modifies the active table (`addRowAbove`, `addRowBelow`, `addRow`, `addColLeft`, `addColRight`, `addCol`, `delRow`, `delCol`, `delTable`, `splitCell`) directly in the DocumentModel. */
  modifyTable(
    action: 'addRow' | 'addRowAbove' | 'addRowBelow' | 'addCol' | 'addColLeft' | 'addColRight' | 'delRow' | 'delCol' | 'delTable' | 'splitCell',
  ): boolean {
    const ctx = this.getSelectionContext();
    if (!ctx?.table) return false;
    const { tableId, rowId, cellId } = ctx.table;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;

    const makeEmptyCell = (tag: 'td' | 'th', styleAttr?: string): { cell: Extract<DocumentNode, { kind: 'element' }>; leafId: string } => {
      const leafId = this.uid('cell-t');
      return {
        leafId,
        cell: {
          id: this.uid(tag),
          kind: 'element',
          tag,
          attributes: styleAttr ? { style: styleAttr } : {},
          children: [
            {
              id: this.uid('cell-p'),
              kind: 'element',
              tag: 'p',
              attributes: {},
              children: [{ id: leafId, kind: 'text', text: '' }],
            },
          ],
        },
      };
    };

    let nextSelection: DocumentSelection | null = this.selection;
    let modified = false;

    const removeTableFromList = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const filtered = nodes.filter(n => n.id !== tableId);
      if (filtered.length !== nodes.length) {
        modified = true;
        if (!filtered.length) {
          const leafId = this.uid('empty-t');
          nextSelection = { anchor: { nodeId: leafId, offset: 0 }, focus: { nodeId: leafId, offset: 0 } };
          return [{ id: this.uid('empty-p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: leafId, kind: 'text', text: '' }] }];
        }
        const remLeaves = textNodes(filtered);
        if (remLeaves.length) {
          nextSelection = { anchor: { nodeId: remLeaves[0].id, offset: 0 }, focus: { nodeId: remLeaves[0].id, offset: 0 } };
        }
        return filtered;
      }
      return nodes.map(n => {
        if (n.kind !== 'element' || !getSubtreeIds(n).has(tableId)) return n;
        const ch = removeTableFromList(n.children);
        return ch === n.children ? n : { ...n, children: ch };
      });
    };

    if (action === 'delTable') {
      const nextRoots = removeTableFromList(roots);
      return modified ? this.commitCustomState(nextRoots, nextSelection, 'table-del') : false;
    }

    const isAddRow = action === 'addRow' || action === 'addRowAbove' || action === 'addRowBelow';
    const isAddCol = action === 'addCol' || action === 'addColLeft' || action === 'addColRight';

    const transformTable = (tableNode: Extract<DocumentNode, { kind: 'element' }>): DocumentNode | null => {
      const allRows: Extract<DocumentNode, { kind: 'element' }>[] = [];
      const collectRows = (children: readonly DocumentNode[]) => {
        for (const c of children) {
          if (c.kind !== 'element') continue;
          if (c.tag === 'tr') allRows.push(c);
          else if (['thead', 'tbody', 'tfoot'].includes(c.tag)) collectRows(c.children);
        }
      };
      collectRows(tableNode.children);
      const targetRow = allRows.find(r => r.id === rowId);
      if (!targetRow) return tableNode;
      const rowCells = targetRow.children.filter(
        (c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
      );
      const colIndex = Math.max(0, rowCells.findIndex(c => c.id === cellId));
      const targetCell = rowCells[colIndex];
      const targetColSpan = Number(targetCell?.attributes['colspan'] || 1);
      const splitNeedsNewCol = action === 'splitCell' && targetColSpan <= 1 && Number(targetCell?.attributes['rowspan'] || 1) <= 1;

      if (action === 'delRow' && allRows.length <= 1) return null;
      if (action === 'delCol' && rowCells.length <= 1) return null;

      const updateRowList = (children: readonly DocumentNode[], inHeader = false): readonly DocumentNode[] => {
        const out: DocumentNode[] = [];
        for (const child of children) {
          if (child.kind !== 'element') {
            out.push(child);
            continue;
          }
          if (['thead', 'tbody', 'tfoot'].includes(child.tag)) {
            out.push({ ...child, children: updateRowList(child.children, child.tag === 'thead') });
            continue;
          }
          if (child.tag === 'colgroup' && (isAddCol || action === 'delCol' || splitNeedsNewCol)) {
            const cols = child.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && c.tag === 'col');
            if (cols.length) {
              const nextCount = action === 'delCol' ? Math.max(1, cols.length - 1) : cols.length + 1;
              const pct = Math.round((100 / nextCount) * 10) / 10;
              const nextCols: DocumentNode[] = Array.from({ length: nextCount }, (_, idx) => ({
                id: cols[idx]?.id || this.uid('col'),
                kind: 'element',
                tag: 'col',
                attributes: { style: `width: ${pct}%` },
                children: [],
              }));
              out.push({ ...child, children: nextCols });
              continue;
            }
          }
          if (child.tag !== 'tr') {
            out.push(child);
            continue;
          }

          if (isAddRow) {
            if (child.id === rowId) {
              modified = true;
              let firstNewLeafId: string | undefined;
              const newCells = rowCells.map(c => {
                const cellTag: 'td' | 'th' = inHeader || c.tag === 'th' ? 'th' : 'td';
                const created = makeEmptyCell(cellTag, c.attributes['style']);
                firstNewLeafId ??= created.leafId;
                return created.cell;
              });
              if (firstNewLeafId) {
                nextSelection = { anchor: { nodeId: firstNewLeafId, offset: 0 }, focus: { nodeId: firstNewLeafId, offset: 0 } };
              }
              const newRow: DocumentNode = {
                id: this.uid('tr'),
                kind: 'element',
                tag: 'tr',
                attributes: {},
                children: newCells,
              };
              if (action === 'addRowAbove') {
                out.push(newRow, child);
              } else {
                out.push(child, newRow);
              }
            } else {
              out.push(child);
            }
          } else if (action === 'delRow') {
            if (child.id === rowId) {
              modified = true;
              continue;
            }
            out.push(child);
          } else if (isAddCol) {
            modified = true;
            const trCells = child.children.filter(
              (c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
            );
            const refCell = trCells[Math.min(colIndex, trCells.length - 1)];
            const cellTag: 'td' | 'th' = inHeader || refCell?.tag === 'th' ? 'th' : 'td';
            const created = makeEmptyCell(cellTag, refCell?.attributes['style']);
            if (child.id === rowId) {
              nextSelection = { anchor: { nodeId: created.leafId, offset: 0 }, focus: { nodeId: created.leafId, offset: 0 } };
            }
            const nextTrChildren: DocumentNode[] = [];
            let cellIdx = 0;
            let inserted = false;
            for (const c of child.children) {
              if (c.kind === 'element' && (c.tag === 'td' || c.tag === 'th')) {
                if (action === 'addColLeft' && cellIdx === colIndex) {
                  nextTrChildren.push(created.cell, c);
                  inserted = true;
                } else {
                  nextTrChildren.push(c);
                  if (action !== 'addColLeft' && cellIdx === colIndex) {
                    nextTrChildren.push(created.cell);
                    inserted = true;
                  }
                }
                cellIdx++;
              } else {
                nextTrChildren.push(c);
              }
            }
            if (!inserted) nextTrChildren.push(created.cell);
            out.push({ ...child, children: nextTrChildren });
          } else if (action === 'delCol') {
            modified = true;
            let cellIdx = 0;
            const nextTrChildren = child.children.filter(c => {
              if (c.kind !== 'element' || (c.tag !== 'td' && c.tag !== 'th')) return true;
              const keep = cellIdx !== colIndex;
              cellIdx++;
              return keep;
            });
            out.push({ ...child, children: nextTrChildren });
          } else if (action === 'splitCell') {
            if (child.id === rowId) {
              modified = true;
              const nextTrChildren: DocumentNode[] = [];
              for (const c of child.children) {
                if (c.kind === 'element' && c.id === cellId) {
                  const origSpan = Number(c.attributes['colspan'] || 1);
                  const origRowSpan = Number(c.attributes['rowspan'] || 1);
                  if (origSpan > 1) {
                    const leftSpan = Math.ceil(origSpan / 2);
                    const rightSpan = origSpan - leftSpan;
                    const leftAttrs = { ...c.attributes };
                    if (leftSpan > 1) leftAttrs['colspan'] = String(leftSpan);
                    else delete leftAttrs['colspan'];
                    const siblingAttrs = { ...c.attributes };
                    delete siblingAttrs['id'];
                    if (rightSpan > 1) siblingAttrs['colspan'] = String(rightSpan);
                    else delete siblingAttrs['colspan'];
                    const created = makeEmptyCell(c.tag as 'td' | 'th', siblingAttrs['style']);
                    const siblingCell: DocumentNode = {
                      ...created.cell,
                      attributes: { ...siblingAttrs },
                    };
                    nextTrChildren.push({ ...c, attributes: leftAttrs }, siblingCell);
                    nextSelection = { anchor: { nodeId: created.leafId, offset: 0 }, focus: { nodeId: created.leafId, offset: 0 } };
                  } else if (origRowSpan > 1) {
                    const nextAttrs = { ...c.attributes };
                    delete nextAttrs['rowspan'];
                    nextTrChildren.push({ ...c, attributes: nextAttrs });
                  } else {
                    const created = makeEmptyCell(c.tag as 'td' | 'th', c.attributes['style']);
                    nextTrChildren.push(c, created.cell);
                    nextSelection = { anchor: { nodeId: created.leafId, offset: 0 }, focus: { nodeId: created.leafId, offset: 0 } };
                  }
                } else {
                  nextTrChildren.push(c);
                }
              }
              out.push({ ...child, children: nextTrChildren });
            } else if (splitNeedsNewCol) {
              modified = true;
              let cellIdx = 0;
              const nextTrChildren = child.children.map(c => {
                if (c.kind !== 'element' || (c.tag !== 'td' && c.tag !== 'th')) return c;
                const match = cellIdx === colIndex;
                cellIdx++;
                if (!match) return c;
                const curSpan = Number(c.attributes['colspan'] || 1);
                return { ...c, attributes: { ...c.attributes, colspan: String(curSpan + 1) } };
              });
              out.push({ ...child, children: nextTrChildren });
            } else {
              out.push(child);
            }
          }
        }
        return out;
      };

      const updatedChildren = updateRowList(tableNode.children);
      const updatedTable: Extract<DocumentNode, { kind: 'element' }> = { ...tableNode, children: updatedChildren };
      if (action === 'delRow' || action === 'delCol') {
        const remLeaves = textNodes([updatedTable]);
        if (remLeaves.length) {
          nextSelection = { anchor: { nodeId: remLeaves[0].id, offset: 0 }, focus: { nodeId: remLeaves[0].id, offset: 0 } };
        }
      }
      return updatedTable;
    };

    let deleteEntireTable = false;
    const mapRoots = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.id === tableId) {
          const res = transformTable(node);
          if (res === null) {
            deleteEntireTable = true;
            return node;
          }
          return res;
        }
        if (!getSubtreeIds(node).has(tableId)) return node;
        return { ...node, children: mapRoots(node.children) };
      });

    const nextRoots = mapRoots(roots);
    if (deleteEntireTable) {
      const removedRoots = removeTableFromList(roots);
      return modified ? this.commitCustomState(removedRoots, nextSelection, 'table-del') : false;
    }
    return modified ? this.commitCustomState(nextRoots, nextSelection, `table-${action}`) : false;
  }

  /** Applies inline CSS properties on the active or selected cells of a table. */
  private patchSelectedTableCells(stylePatch: Record<string, string | null>, historyLabel: string): boolean {
    if (!this.selection) return false;
    const ctx = this.getSelectionContext();
    if (!ctx?.table) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;

    const aPath = findAncestorPath(roots, this.selection.anchor.nodeId);
    const fPath = findAncestorPath(roots, this.selection.focus.nodeId);
    const aCell = aPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    const fCell = fPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    const tableId = ctx.table.tableId;
    const targetIds = new Set<string>([ctx.table.cellId]);
    if (aCell && fCell && aCell.id !== fCell.id) {
      const tableNode = aPath.find(n => n.kind === 'element' && n.id === tableId);
      if (tableNode && fPath.some(n => n.kind === 'element' && n.id === tableId)) {
        const allCells: string[] = [];
        const walk = (n: DocumentNode) => {
          if (n.kind !== 'element') return;
          if (n.tag === 'td' || n.tag === 'th') allCells.push(n.id);
          else n.children.forEach(walk);
        };
        walk(tableNode);
        const ia = allCells.indexOf(aCell.id);
        const ib = allCells.indexOf(fCell.id);
        if (ia >= 0 && ib >= 0) {
          for (let i = Math.min(ia, ib); i <= Math.max(ia, ib); i++) targetIds.add(allCells[i]);
        }
      }
    }

    let changed = false;
    const mapCells = (nodes: readonly DocumentNode[], insideTable = false): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        if ((n.tag === 'td' || n.tag === 'th') && targetIds.has(n.id)) {
          changed = true;
          const styleMap = parseStyleMap(n.attributes['style']);
          for (const [k, v] of Object.entries(stylePatch)) {
            if (v === null) delete styleMap[k];
            else styleMap[k] = v;
          }
          const nextAttrs = { ...n.attributes };
          const serialized = serializeStyleMap(styleMap);
          if (serialized) nextAttrs['style'] = serialized;
          else delete nextAttrs['style'];
          return { ...n, attributes: nextAttrs };
        }
        const nowInside = insideTable || n.id === tableId;
        if (nowInside || getSubtreeIds(n).has(tableId)) {
          return { ...n, children: mapCells(n.children, nowInside) };
        }
        return n;
      });

    const nextRoots = mapCells(roots);
    return changed ? this.commitCustomState(nextRoots, this.selection, historyLabel) : false;
  }

  /** Sets or clears background shading on the active/selected table cell(s). */
  setTableCellBackground(color: string | null): boolean {
    const clean = color && color !== 'transparent' ? color : null;
    return this.patchSelectedTableCells({ 'background-color': clean }, 'table-cell-bg');
  }

  /** Sets vertical alignment (`top` | `middle` | `bottom`) on the active/selected table cell(s). */
  setTableCellVerticalAlign(align: 'top' | 'middle' | 'bottom'): boolean {
    return this.patchSelectedTableCells({ 'vertical-align': align === 'top' ? null : align }, 'table-cell-valign');
  }

  /** Toggles repeating `<thead>` header rows across page breaks on the active table. */
  toggleTableHeaderRepeat(): boolean {
    const ctx = this.getSelectionContext();
    if (!ctx?.table) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const { tableId } = ctx.table;
    let changed = false;
    const mapTables = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        if (n.id === tableId && n.tag === 'table') {
          changed = true;
          const nextAttrs = { ...n.attributes };
          if (nextAttrs['data-repeat-header'] === 'false') {
            delete nextAttrs['data-repeat-header'];
          } else {
            nextAttrs['data-repeat-header'] = 'false';
          }
          return { ...n, attributes: nextAttrs };
        }
        if (getSubtreeIds(n).has(tableId)) {
          return { ...n, children: mapTables(n.children) };
        }
        return n;
      });
    const nextRoots = mapTables(section.model.state.roots);
    return changed ? this.commitCustomState(nextRoots, this.selection, 'table-repeat-header') : false;
  }

  /** Moves the caret to the next (`+1`) or previous (`-1`) cell inside the active table, adding a row at the end on Tab. */
  navigateTableCell(delta: 1 | -1): boolean {
    if (!this.selection) return false;
    const ctx = this.getSelectionContext();
    if (!ctx?.table) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const path = findAncestorPath(roots, this.selection.focus.nodeId);
    const tableNode = path.find(n => n.kind === 'element' && n.id === ctx.table!.tableId);
    if (!tableNode) return false;

    const cells: Extract<DocumentNode, { kind: 'element' }>[] = [];
    const collect = (n: DocumentNode) => {
      if (n.kind !== 'element') return;
      if (n.tag === 'td' || n.tag === 'th') cells.push(n);
      else n.children.forEach(collect);
    };
    collect(tableNode);
    const curIdx = cells.findIndex(c => c.id === ctx.table!.cellId);
    if (curIdx < 0) return false;

    const targetIdx = curIdx + delta;
    if (targetIdx >= cells.length) {
      return this.modifyTable('addRowBelow');
    }
    if (targetIdx < 0) {
      return true;
    }
    const targetCell = cells[targetIdx];
    const leaves = textNodes([targetCell]);
    const leaf = leaves[0];
    if (!leaf) return true;
    this.setSelection(this.section, {
      anchor: { nodeId: leaf.id, offset: 0 },
      focus: { nodeId: leaf.id, offset: 0 },
    });
    return true;
  }

  /** Resizes table column widths by updating `<col style="width: ...%">` inside `<colgroup>`. */
  resizeTableColumn(tableId: string, colIndex: number, nextWidthsPct: readonly number[]): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      let updated = false;
      const updateNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        return nodes.map(n => {
          if (n.id === tableId && n.kind === 'element' && n.tag === 'table') {
            updated = true;
            const existingColgroup = n.children.find(c => c.kind === 'element' && c.tag === 'colgroup') as Extract<DocumentNode, { kind: 'element' }> | undefined;
            const colgroupChildren: DocumentNode[] = nextWidthsPct.map((pct, idx) => {
              const existingCol = existingColgroup?.children[idx];
              const colId = existingCol?.id ?? this.uid('col');
              const rounded = Math.round(pct * 100) / 100;
              return {
                id: colId,
                kind: 'element' as const,
                tag: 'col',
                attributes: { style: `width: ${rounded}%` },
                children: [],
              };
            });
            const updatedColgroup: DocumentNode = {
              id: existingColgroup?.id ?? this.uid('colgroup'),
              kind: 'element',
              tag: 'colgroup',
              attributes: {},
              children: colgroupChildren,
            };
            const nonColgroupChildren = n.children.filter(c => !(c.kind === 'element' && (c.tag === 'colgroup' || c.tag === 'col')));
            const nextChildren = [updatedColgroup, ...nonColgroupChildren];
            const styleMap = parseStyleMap(n.attributes['style'] || '');
            styleMap['table-layout'] = 'fixed';
            styleMap['width'] = '100%';
            return {
              ...n,
              attributes: {
                ...n.attributes,
                style: serializeStyleMap(styleMap),
              },
              children: nextChildren,
            };
          }
          if (n.kind === 'element' && getSubtreeIds(n).has(tableId)) {
            const nextCh = updateNodes(n.children);
            return nextCh !== n.children ? { ...n, children: nextCh } : n;
          }
          return n;
        });
      };
      const nextRoots = updateNodes(sections[sIdx].model.state.roots);
      if (updated) {
        this.section = sIdx;
        return this.commitCustomState(nextRoots, this.selection, 'table-resize-col');
      }
    }
    return false;
  }

  /** Resizes table row height by updating `style="height: ...px"` on the target row (`<tr>`). */
  resizeTableRow(tableId: string, rowIndex: number, heightPx: number, rowId?: string): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      let updated = false;
      const updateNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        return nodes.map(n => {
          if (n.id === tableId && n.kind === 'element' && n.tag === 'table') {
            let currentRowIndex = 0;
            const updateRows = (children: readonly DocumentNode[]): readonly DocumentNode[] => {
              return children.map(ch => {
                if (ch.kind === 'element' && ch.tag === 'tr') {
                  const isTarget = rowId ? ch.id === rowId : currentRowIndex === rowIndex;
                  currentRowIndex++;
                  if (isTarget) {
                    updated = true;
                    const styleMap = parseStyleMap(ch.attributes['style'] || '');
                    styleMap['height'] = `${Math.round(heightPx)}px`;
                    return {
                      ...ch,
                      attributes: {
                        ...ch.attributes,
                        style: serializeStyleMap(styleMap),
                        height: String(Math.round(heightPx)),
                      },
                    };
                  }
                  return ch;
                }
                if (ch.kind === 'element' && ['thead', 'tbody', 'tfoot'].includes(ch.tag)) {
                  const updatedInner = updateRows(ch.children);
                  return updatedInner !== ch.children ? { ...ch, children: updatedInner } : ch;
                }
                return ch;
              });
            };
            const nextChildren = updateRows(n.children);
            return nextChildren !== n.children ? { ...n, children: nextChildren } : n;
          }
          if (n.kind === 'element' && getSubtreeIds(n).has(tableId)) {
            const nextCh = updateNodes(n.children);
            return nextCh !== n.children ? { ...n, children: nextCh } : n;
          }
          return n;
        });
      };
      const nextRoots = updateNodes(sections[sIdx].model.state.roots);
      if (updated) {
        this.section = sIdx;
        return this.commitCustomState(nextRoots, this.selection, 'table-resize-row');
      }
    }
    return false;
  }

  private cellHasExplicitTopBorder(cell: Extract<DocumentNode, { kind: 'element' }>): boolean {
    if (cell.attributes['data-word-top-border'] === 'true') return true;
    const bt = (parseStyleMap(cell.attributes['style'])['border-top'] || '').toLowerCase();
    return Boolean(bt && !bt.startsWith('none') && !bt.startsWith('0 ') && bt !== '0' && !bt.startsWith('0px'));
  }

  private rowHasExplicitTopBorder(rowNode: Extract<DocumentNode, { kind: 'element' }>): boolean {
    const cells = rowNode.children.filter(
      (c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
    );
    return cells.length > 0 && cells.every(c => this.cellHasExplicitTopBorder(c));
  }

  /** Toggles an explicit top horizontal rule (`border-top: 1px solid #000000`) on all cells of the active table row (e.g. APA Total row). */
  toggleTableRowTopBorder(): boolean {
    if (!this.selection) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const path = findAncestorPath(roots, this.selection.focus.nodeId);
    const tableNode = path.find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'table');
    const rowNode = path.find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'tr');
    if (!tableNode || !rowNode) return false;

    const enable = !this.rowHasExplicitTopBorder(rowNode);
    let updated = false;
    const mapRow = (node: DocumentNode): DocumentNode => {
      if (node.kind !== 'element') return node;
      if (node.id === rowNode.id && node.tag === 'tr') {
        updated = true;
        return {
          ...node,
          children: node.children.map(cell => {
            if (cell.kind !== 'element' || (cell.tag !== 'td' && cell.tag !== 'th')) return cell;
            const styleMap = parseStyleMap(cell.attributes['style']);
            const nextAttrs: Record<string, string> = { ...cell.attributes };
            if (enable) {
              styleMap['border-top'] = '1px solid #000000';
              nextAttrs['data-word-top-border'] = 'true';
            } else {
              delete styleMap['border-top'];
              delete nextAttrs['data-word-top-border'];
            }
            nextAttrs['style'] = serializeStyleMap(styleMap);
            return { ...cell, attributes: nextAttrs };
          }),
        };
      }
      if (!getSubtreeIds(node).has(rowNode.id)) return node;
      const nextCh = node.children.map(mapRow);
      return nextCh.every((c, idx) => c === node.children[idx]) ? node : { ...node, children: nextCh };
    };
    const nextRoots = roots.map(mapRow);
    return updated ? this.commitCustomState(nextRoots, this.selection, 'table-row-top-border') : false;
  }

  /** Inserts a new table (`rows` × `cols`) directly into the DocumentModel without leaving Canvas mode. */
  insertTable(rows: number, cols: number, isApa7 = false, fallbackPageIndex = 0, tableRule?: TableStyleRule): boolean {
    if (rows < 1 || cols < 1) return false;
    this.ensureSelection(fallbackPageIndex);
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;

    const colPct = Math.round((100 / cols) * 10) / 10;
    const colgroupNode: DocumentNode = {
      id: this.uid('colgroup'),
      kind: 'element',
      tag: 'colgroup',
      attributes: {},
      children: Array.from({ length: cols }, () => ({
        id: this.uid('col'),
        kind: 'element' as const,
        tag: 'col',
        attributes: { style: `width: ${colPct}%` },
        children: [],
      })),
    };

    let firstCellLeafId = '';
    const buildCell = (tag: 'th' | 'td'): DocumentNode => {
      const leafId = this.uid('cell-t');
      if (!firstCellLeafId) firstCellLeafId = leafId;
      const cellStyle = isApa7
        ? 'border: none; padding: 4pt 6pt; text-align: left; vertical-align: top; line-height: 1.1'
        : 'border: 1px solid #000000; padding: 4pt 6pt; text-align: left; vertical-align: top; line-height: 1.1';
      return {
        id: this.uid(tag),
        kind: 'element',
        tag,
        attributes: { style: cellStyle },
        children: [
          {
            id: this.uid('cell-p'),
            kind: 'element',
            tag: 'p',
            attributes: {},
            children: [{ id: leafId, kind: 'text', text: '' }],
          },
        ],
      };
    };

    const headerRow: DocumentNode = {
      id: this.uid('tr-h'),
      kind: 'element',
      tag: 'tr',
      attributes: {},
      children: Array.from({ length: cols }, () => buildCell('th')),
    };
    const theadNode: DocumentNode = {
      id: this.uid('thead'),
      kind: 'element',
      tag: 'thead',
      attributes: {},
      children: [headerRow],
    };

    const tableChildren: DocumentNode[] = [colgroupNode, theadNode];
    if (rows > 1) {
      const bodyRows: DocumentNode[] = Array.from({ length: rows - 1 }, () => ({
        id: this.uid('tr-b'),
        kind: 'element' as const,
        tag: 'tr',
        attributes: {},
        children: Array.from({ length: cols }, () => buildCell('td')),
      }));
      tableChildren.push({
        id: this.uid('tbody'),
        kind: 'element',
        tag: 'tbody',
        attributes: {},
        children: bodyRows,
      });
    }

    let tableNode: Extract<DocumentNode, { kind: 'element' }> = {
      id: this.uid('table'),
      kind: 'element',
      tag: 'table',
      attributes: {
        style: 'width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0',
        ...(isApa7 ? { 'data-apa-table': 'true' } : {}),
      },
      children: tableChildren,
    };
    if (tableRule && tableRule.mode !== 'inherit') tableNode = styleModelTable(tableNode, tableRule);

    const afterLeafId = this.uid('after-t');
    const trailingParagraph: DocumentNode = {
      id: this.uid('after-p'),
      kind: 'element',
      tag: 'p',
      attributes: {},
      children: [{ id: afterLeafId, kind: 'text', text: '' }],
    };

    const path = this.selection ? findAncestorPath(roots, this.selection.focus.nodeId) : [];
    const topRoot = path[0];
    const rootIdx = topRoot ? roots.findIndex(r => r.id === topRoot.id) : roots.length - 1;
    const isEmptyRootParagraph =
      topRoot &&
      topRoot.kind === 'element' &&
      topRoot.tag === 'p' &&
      textNodes([topRoot]).every(t => t.text.length === 0) &&
      !topRoot.children.some(c => c.kind === 'element' && c.tag === 'img');

    const nextRoots =
      rootIdx >= 0
        ? isEmptyRootParagraph
          ? [...roots.slice(0, rootIdx), tableNode, trailingParagraph, ...roots.slice(rootIdx + 1)]
          : [...roots.slice(0, rootIdx + 1), tableNode, trailingParagraph, ...roots.slice(rootIdx + 1)]
        : [...roots, tableNode, trailingParagraph];

    const nextPos: DocumentPosition = { nodeId: firstCellLeafId, offset: 0 };
    return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'insert-table');
  }

  /** Pastes an HTML table (from Excel, Sheets, or TSV) directly into the DocumentModel. */
  pasteTable(tableHtml: string, isApa7 = false, fallbackPageIndex = 0, tableRule?: TableStyleRule): boolean {
    if (!tableHtml || !tableHtml.includes('<table')) return false;
    this.ensureSelection(fallbackPageIndex);
    const sections = this.engine.getSections();
    if (!sections.length) return false;
    if (this.selection) {
      const targetId = this.selection.focus.nodeId;
      const sIdx = sections.findIndex(s => !!findNodeById(s.model.state.roots, targetId));
      if (sIdx >= 0) this.section = sIdx;
    }
    const roots = sections[this.section]?.model.state.roots;
    if (!roots) return false;

    const parsed = htmlToDocumentState(tableHtml, 1, this.uid('tbl')).roots;
    if (!parsed.length) return false;

    const findTable = (nodes: readonly DocumentNode[]): Extract<DocumentNode, { kind: 'element' }> | undefined => {
      for (const n of nodes) {
        if (n.kind === 'element') {
          if (n.tag === 'table') return n;
          const found = findTable(n.children);
          if (found) return found;
        }
      }
      return undefined;
    };

    let tableNode = findTable(parsed);
    if (!tableNode) return false;

    // Normalize table style
    const baseStyle = tableNode.attributes['style'] || '';
    const tableStyle = `width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0; ${baseStyle}`.trim();
    tableNode.attributes = {
      ...tableNode.attributes,
      style: tableStyle,
      ...(isApa7 ? { 'data-apa-table': 'true' } : {}),
    };

    // Collect all tr rows
    const rows: Extract<DocumentNode, { kind: 'element' }>[] = [];
    for (const child of tableNode.children) {
      if (child.kind !== 'element') continue;
      if (child.tag === 'tr') rows.push(child);
      else if (['tbody', 'thead', 'tfoot'].includes(child.tag)) {
        for (const sub of child.children) {
          if (sub.kind === 'element' && sub.tag === 'tr') rows.push(sub);
        }
      }
    }
    if (rows.length === 0) return false;

    // Calculate columns in the first row
    const firstRow = rows[0];
    const cellsInFirstRow = firstRow.children.filter(c => c.kind === 'element' && ['td', 'th'].includes(c.tag)) as Extract<DocumentNode, { kind: 'element' }>[];
    const colCount = Math.max(1, cellsInFirstRow.reduce((sum, c) => sum + Math.max(1, Number(c.attributes['colspan'] || 1)), 0));

    // Ensure colgroup exists
    const hasColGroup = tableNode.children.some(c => c.kind === 'element' && (c.tag === 'colgroup' || c.tag === 'col'));
    if (!hasColGroup && colCount > 0) {
      const colPct = Math.round((100 / colCount) * 10) / 10;
      const colgroupNode: DocumentNode = {
        id: this.uid('colgroup'),
        kind: 'element',
        tag: 'colgroup',
        attributes: {},
        children: Array.from({ length: colCount }, () => ({
          id: this.uid('col'),
          kind: 'element' as const,
          tag: 'col',
          attributes: { style: `width: ${colPct}%` },
          children: [],
        })),
      };
      tableNode.children = [colgroupNode, ...tableNode.children];
    }

    // Ensure all cells have styling and at least one text node leaf for navigation
    let firstCellLeafId = '';
    for (const row of rows) {
      for (const cell of row.children) {
        if (cell.kind !== 'element' || !['td', 'th'].includes(cell.tag)) continue;
        const existingStyle = cell.attributes['style'] || '';
        const defaultBorder = isApa7 ? 'border: none;' : 'border: 1px solid #000000;';
        const borderNeedsAdd = !existingStyle.includes('border');
        const paddingNeedsAdd = !existingStyle.includes('padding');
        const addedStyles = `${borderNeedsAdd ? defaultBorder : ''} ${paddingNeedsAdd ? 'padding: 4pt 6pt;' : ''} vertical-align: top; line-height: 1.15;`;
        cell.attributes = {
          ...cell.attributes,
          style: `${existingStyle}; ${addedStyles}`.trim(),
        };

        const leaves = textNodes([cell]);
        if (leaves.length === 0) {
          const leafId = this.uid('cell-t');
          if (!firstCellLeafId) firstCellLeafId = leafId;
          cell.children = [
            {
              id: this.uid('cell-p'),
              kind: 'element',
              tag: 'p',
              attributes: {},
              children: [{ id: leafId, kind: 'text', text: '' }],
            },
          ];
        } else {
          if (!firstCellLeafId) firstCellLeafId = leaves[0].id;
        }
      }
    }

    if (tableRule && tableRule.mode !== 'inherit' && !isFixedTableStyle(tableNode)) tableNode = styleModelTable(tableNode, tableRule);
    const afterLeafId = this.uid('after-t');
    const trailingParagraph: DocumentNode = {
      id: this.uid('after-p'),
      kind: 'element',
      tag: 'p',
      attributes: {},
      children: [{ id: afterLeafId, kind: 'text', text: '' }],
    };

    const path = this.selection ? findAncestorPath(roots, this.selection.focus.nodeId) : [];

    // If the caret is inside an existing table cell, paste rows/cells directly into that table starting at (startRow, startCol)
    const activeTable = path.find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'table');
    const activeCell = [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    const activeTr = [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'tr');
    if (activeTable && activeCell && activeTr) {
      const existingRows: Extract<DocumentNode, { kind: 'element' }>[] = [];
      const collectTrs = (nodes: readonly DocumentNode[]) => {
        for (const n of nodes) {
          if (n.kind !== 'element') continue;
          if (n.tag === 'tr') existingRows.push(n);
          else if (['tbody', 'thead', 'tfoot'].includes(n.tag)) collectTrs(n.children);
        }
      };
      collectTrs(activeTable.children);
      const startRowIdx = existingRows.findIndex(r => r.id === activeTr.id);
      const activeRowCells = activeTr.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'));
      const startColIdx = activeRowCells.findIndex(c => c.id === activeCell.id);
      if (startRowIdx >= 0 && startColIdx >= 0) {
        const pastedGrid = rows.map(r =>
          r.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th')),
        );
        const cloneCellContent = (srcCell: Extract<DocumentNode, { kind: 'element' }>): readonly DocumentNode[] => {
          const reIdNode = (n: DocumentNode): DocumentNode =>
            n.kind === 'text'
              ? { ...n, id: this.uid('t') }
              : { ...n, id: this.uid(n.tag), children: n.children.map(reIdNode) };
          const cloned = srcCell.children.map(reIdNode);
          return textNodes(cloned).length
            ? cloned
            : [{ id: this.uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: this.uid('t'), kind: 'text', text: '' }] }];
        };

        let lastPastedLeaf: Extract<DocumentNode, { kind: 'text' }> | null = null;
        const neededRows = startRowIdx + pastedGrid.length;
        const templateRow = existingRows[existingRows.length - 1];
        const templateCells = templateRow.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'));

        const buildUpdatedRow = (row: Extract<DocumentNode, { kind: 'element' }>, rowOffset: number): Extract<DocumentNode, { kind: 'element' }> => {
          const pastedRow = pastedGrid[rowOffset];
          if (!pastedRow) return row;
          let colCursor = 0;
          const nextChildren = row.children.map(child => {
            if (child.kind !== 'element' || (child.tag !== 'td' && child.tag !== 'th')) return child;
            const cIdx = colCursor++;
            const pastedCell = pastedRow[cIdx - startColIdx];
            if (!pastedCell) return child;
            const nextContent = cloneCellContent(pastedCell);
            const leaves = textNodes(nextContent);
            if (leaves.length) lastPastedLeaf = leaves[leaves.length - 1];
            return { ...child, children: nextContent };
          });
          return { ...row, children: nextChildren };
        };

        const extraRows: Extract<DocumentNode, { kind: 'element' }>[] = [];
        for (let r = existingRows.length; r < neededRows; r++) {
          const newRow: Extract<DocumentNode, { kind: 'element' }> = {
            id: this.uid('tr'),
            kind: 'element',
            tag: 'tr',
            attributes: { ...templateRow.attributes },
            children: templateCells.map(tc => ({
              id: this.uid('td'),
              kind: 'element' as const,
              tag: 'td',
              attributes: { ...tc.attributes },
              children: [{ id: this.uid('p'), kind: 'element' as const, tag: 'p', attributes: {}, children: [{ id: this.uid('t'), kind: 'text' as const, text: '' }] }],
            })),
          };
          extraRows.push(buildUpdatedRow(newRow, r - startRowIdx));
        }

        let rowCounter = 0;
        let appendedExtra = false;
        const rewriteTable = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
          nodes.map(n => {
            if (n.kind !== 'element') return n;
            if (n.id === activeTable.id) {
              const hasTbody = n.children.some(c => c.kind === 'element' && c.tag === 'tbody');
              const mapSection = (children: readonly DocumentNode[], isTargetContainer: boolean): readonly DocumentNode[] => {
                const mapped = children.map(c => {
                  if (c.kind !== 'element') return c;
                  if (c.tag === 'tr') {
                    const idx = rowCounter++;
                    return idx >= startRowIdx && idx < startRowIdx + pastedGrid.length
                      ? buildUpdatedRow(c, idx - startRowIdx)
                      : c;
                  }
                  if (['tbody', 'thead', 'tfoot'].includes(c.tag)) {
                    const appendHere = hasTbody ? c.tag === 'tbody' : false;
                    return { ...c, children: mapSection(c.children, appendHere) };
                  }
                  return c;
                });
                if (isTargetContainer && extraRows.length && !appendedExtra) {
                  appendedExtra = true;
                  return [...mapped, ...extraRows];
                }
                return mapped;
              };
              return { ...n, children: mapSection(n.children, !hasTbody) };
            }
            if (getSubtreeIds(n).has(activeTable.id)) {
              return { ...n, children: rewriteTable(n.children) };
            }
            return n;
          });

        const nextRoots = rewriteTable(roots);
        const nextPos: DocumentPosition = lastPastedLeaf
          ? { nodeId: (lastPastedLeaf as Extract<DocumentNode, { kind: 'text' }>).id, offset: (lastPastedLeaf as Extract<DocumentNode, { kind: 'text' }>).text.length }
          : this.selection!.focus;
        return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'paste-table-cells');
      }
    }

    const topRoot = path[0];
    const rootIdx = topRoot ? roots.findIndex(r => r.id === topRoot.id) : roots.length - 1;
    const isEmptyRootParagraph =
      topRoot &&
      topRoot.kind === 'element' &&
      topRoot.tag === 'p' &&
      textNodes([topRoot]).every(t => t.text.length === 0) &&
      !topRoot.children.some(c => c.kind === 'element' && c.tag === 'img');

    const nextRoots =
      rootIdx >= 0
        ? isEmptyRootParagraph
          ? [...roots.slice(0, rootIdx), tableNode, trailingParagraph, ...roots.slice(rootIdx + 1)]
          : [...roots.slice(0, rootIdx + 1), tableNode, trailingParagraph, ...roots.slice(rootIdx + 1)]
        : [...roots, tableNode, trailingParagraph];

    const nextPos: DocumentPosition = firstCellLeafId
      ? { nodeId: firstCellLeafId, offset: 0 }
      : { nodeId: afterLeafId, offset: 0 };
    return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'paste-table');
  }

  canMergeTableCells(): boolean {
    if (!this.selection) return false;
    const { anchor, focus } = this.selection;
    if (anchor.nodeId === focus.nodeId && anchor.offset === focus.offset) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const aPath = findAncestorPath(roots, anchor.nodeId);
    const fPath = findAncestorPath(roots, focus.nodeId);
    const aTable = aPath.find(n => n.kind === 'element' && n.tag === 'table');
    const fTable = fPath.find(n => n.kind === 'element' && n.tag === 'table');
    if (!aTable || !fTable || aTable.id !== fTable.id) return false;
    const aCell = aPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    const fCell = fPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    return Boolean(aCell && fCell && aCell.id !== fCell.id);
  }

  mergeSelectedTableCells(): boolean {
    if (!this.canMergeTableCells()) return false;
    const section = this.engine.getSections()[this.section];
    if (!section || !this.selection) return false;
    const roots = section.model.state.roots;
    const { anchor, focus } = this.selection;
    const aPath = findAncestorPath(roots, anchor.nodeId);
    const fPath = findAncestorPath(roots, focus.nodeId);
    const tableNode = aPath.find(n => n.kind === 'element' && n.tag === 'table') as Extract<DocumentNode, { kind: 'element' }>;
    const aCell = aPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    const fCell = fPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
    if (!tableNode || !aCell || !fCell) return false;

    const rows: Extract<DocumentNode, { kind: 'element' }>[] = [];
    const collectRows = (nodes: readonly DocumentNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'element') {
          if (n.tag === 'tr') rows.push(n);
          else if (['tbody', 'thead', 'tfoot'].includes(n.tag)) collectRows(n.children);
        }
      }
    };
    collectRows(tableNode.children);
    if (!rows.length) return false;

    let aCoord = { r: -1, c: -1 };
    let fCoord = { r: -1, c: -1 };
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let colIdx = 0;
      for (const cell of row.children) {
        if (cell.kind === 'element' && (cell.tag === 'td' || cell.tag === 'th')) {
          if (cell.id === aCell.id) aCoord = { r, c: colIdx };
          if (cell.id === fCell.id) fCoord = { r, c: colIdx };
          colIdx += Number(cell.attributes['colspan'] || 1);
        }
      }
    }
    if (aCoord.r < 0 || fCoord.r < 0) return false;

    const minR = Math.min(aCoord.r, fCoord.r);
    const maxR = Math.max(aCoord.r, fCoord.r);
    const minC = Math.min(aCoord.c, fCoord.c);
    const maxC = Math.max(aCoord.c, fCoord.c);
    const spanR = maxR - minR + 1;
    const spanC = maxC - minC + 1;

    let anchorCellNode: Extract<DocumentNode, { kind: 'element' }> | null = null;
    const otherCellChildren: DocumentNode[] = [];

    const updateRow = (row: Extract<DocumentNode, { kind: 'element' }>, rIdx: number): Extract<DocumentNode, { kind: 'element' }> => {
      if (rIdx < minR || rIdx > maxR) return row;
      const nextChildren: DocumentNode[] = [];
      let colIdx = 0;
      for (const cell of row.children) {
        if (cell.kind === 'element' && (cell.tag === 'td' || cell.tag === 'th')) {
          const c = colIdx;
          const colSpan = Number(cell.attributes['colspan'] || 1);
          colIdx += colSpan;
          if (rIdx === minR && c === minC) {
            anchorCellNode = cell;
            nextChildren.push(cell);
          } else if (c >= minC && c <= maxC) {
            for (const child of cell.children) {
              if (child.kind === 'text' && !child.text.trim()) continue;
              otherCellChildren.push(child);
            }
          } else {
            nextChildren.push(cell);
          }
        } else {
          nextChildren.push(cell);
        }
      }
      return { ...row, children: nextChildren };
    };

    let curRowIdx = 0;
    const transformTableChildren = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      return nodes.map(n => {
        if (n.kind !== 'element') return n;
        if (n.tag === 'tr') {
          return updateRow(n, curRowIdx++);
        }
        if (['tbody', 'thead', 'tfoot'].includes(n.tag)) {
          return { ...n, children: transformTableChildren(n.children) };
        }
        return n;
      });
    };

    const nextTableChildren = transformTableChildren(tableNode.children);
    const anchorCell = anchorCellNode as Extract<DocumentNode, { kind: 'element' }> | null;
    if (!anchorCell) return false;

    const updatedAnchorCell: DocumentNode = {
      ...anchorCell,
      attributes: {
        ...anchorCell.attributes,
        ...(spanC > 1 ? { colspan: String(spanC) } : {}),
        ...(spanR > 1 ? { rowspan: String(spanR) } : {}),
      },
      children: otherCellChildren.length ? [...anchorCell.children, ...otherCellChildren] : anchorCell.children,
    };

    const replaceAnchor = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      return nodes.map(n => {
        if (n.id === anchorCell.id) return updatedAnchorCell;
        if (n.kind === 'element' && n.children.length) return { ...n, children: replaceAnchor(n.children) };
        return n;
      });
    };

    const finalTableChildren = replaceAnchor(nextTableChildren);
    const nextRoots = roots.map(n => n.id === tableNode.id ? { ...n, children: finalTableChildren } : n);
    const leaves = textNodes([updatedAnchorCell]);
    const firstLeaf = leaves[0];
    const pos = firstLeaf ? { nodeId: firstLeaf.id, offset: 0 } : this.selection.focus;
    return this.commitCustomState(nextRoots, { anchor: pos, focus: pos }, 'merge-table-cells');
  }

  private unwrapListItemChildren(item: Extract<DocumentNode, { kind: 'element' }>): readonly DocumentNode[] {
    const meaningful = item.children.filter(c => !(c.kind === 'text' && !c.text.trim() && item.children.some(x => x.kind === 'element')));
    if (meaningful.length === 1 && meaningful[0].kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(meaningful[0].tag)) {
      const inner = meaningful[0].children;
      return inner.length ? inner : [{ id: this.uid('txt'), kind: 'text', text: '' }];
    }
    return item.children.length ? item.children : [{ id: this.uid('txt'), kind: 'text', text: '' }];
  }

  /** Ensures no <p>/heading/etc. sits directly inside a <ul>/<ol> by splitting any enclosing list around it. */
  private hoistNonListBlocksFromLists(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
    let changed = false;
    const out: DocumentNode[] = [];
    for (const node of nodes) {
      if (node.kind !== 'element') {
        out.push(node);
        continue;
      }
      const normalizedChildren = node.children.length ? this.hoistNonListBlocksFromLists(node.children) : node.children;
      if (normalizedChildren !== node.children) changed = true;

      if (node.tag === 'ul' || node.tag === 'ol') {
        const hasInvalidDirectChild = normalizedChildren.some(
          c => c.kind === 'element' && c.tag !== 'li' && c.tag !== 'ul' && c.tag !== 'ol',
        );
        if (hasInvalidDirectChild) {
          changed = true;
          let pending: DocumentNode[] = [];
          const flush = () => {
            if (pending.some(c => c.kind === 'element')) {
              out.push({ id: this.uid(node.tag), kind: 'element', tag: node.tag, attributes: { ...node.attributes }, children: pending });
            }
            pending = [];
          };
          for (const child of normalizedChildren) {
            if (child.kind === 'element' && child.tag !== 'li' && child.tag !== 'ul' && child.tag !== 'ol') {
              flush();
              out.push(child);
            } else if (child.kind === 'text' && !child.text.trim()) {
              continue;
            } else {
              pending.push(child);
            }
          }
          flush();
          continue;
        }
        // Drop completely empty lists
        if (!normalizedChildren.some(c => c.kind === 'element')) {
          changed = true;
          continue;
        }
      }
      out.push(normalizedChildren !== node.children ? { ...node, children: normalizedChildren } : node);
    }
    return changed ? out : nodes;
  }

  private unwrapSingleListItem(
    roots: readonly DocumentNode[],
    listId: string,
    itemId: string,
  ): { nextRoots: readonly DocumentNode[]; caretNodeId: string } | null {
    let caretNodeId: string | null = null;
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let changed = false;
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'element' && node.id === listId && (node.tag === 'ul' || node.tag === 'ol')) {
          let pending: DocumentNode[] = [];
          let seenTarget = false;
          let ordinal = Number(node.attributes['start'] || 1);
          if (!Number.isFinite(ordinal)) ordinal = 1;
          let segmentStart = ordinal;
          const flushPending = () => {
            if (!pending.some(c => c.kind === 'element' && c.tag === 'li')) {
              pending = [];
              return;
            }
            const attrs = { ...node.attributes };
            if (node.tag === 'ol' && segmentStart !== 1) attrs['start'] = String(segmentStart);
            out.push({ id: this.uid(node.tag), kind: 'element', tag: node.tag, attributes: attrs, children: pending });
            pending = [];
          };
          for (const child of node.children) {
            if (child.kind === 'element' && child.tag === 'li') {
              const explicitVal = child.attributes['value'] ? Number(child.attributes['value']) : NaN;
              if (Number.isFinite(explicitVal)) ordinal = explicitVal;
              if (child.id === itemId) {
                seenTarget = true;
                changed = true;
                flushPending();
                const pChildren = this.unwrapListItemChildren(child);
                const firstText = textNodes(pChildren)[0];
                const ensuredChildren = firstText ? pChildren : [{ id: this.uid('txt'), kind: 'text' as const, text: '' }];
                caretNodeId = textNodes(ensuredChildren)[0].id;
                out.push({
                  id: this.uid('p'),
                  kind: 'element',
                  tag: 'p',
                  attributes: {},
                  children: ensuredChildren,
                });
                ordinal += 1;
                segmentStart = ordinal;
              } else {
                if (!pending.length) segmentStart = ordinal;
                pending.push(child);
                ordinal += 1;
              }
            } else if (child.kind === 'text' && !child.text.trim()) {
              continue;
            } else {
              pending.push(child);
            }
          }
          flushPending();
          if (!seenTarget) out.push(node);
          continue;
        }
        if (node.kind === 'element' && node.children.length) {
          const nextChildren = rewrite(node.children);
          if (nextChildren !== node.children) {
            changed = true;
            out.push({ ...node, children: nextChildren });
            continue;
          }
        }
        out.push(node);
      }
      return changed ? out : nodes;
    };
    const rawNextRoots = rewrite(roots);
    if (!caretNodeId || rawNextRoots === roots) return null;
    const nextRoots = this.hoistNonListBlocksFromLists(rawNextRoots);
    return { nextRoots, caretNodeId };
  }

  toggleList(type: 'ul' | 'ol', listStyleType?: string): boolean {
    if (!this.selection) return false;
    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const leaves = textNodes(roots);
    const { anchor, focus } = this.selection;
    let ai = leaves.findIndex(n => n.id === anchor.nodeId);
    let bi = leaves.findIndex(n => n.id === focus.nodeId);

    const targetPaths: DocumentNode[][] = [];
    if (ai >= 0 && bi >= 0) {
      if (ai > bi) [ai, bi] = [bi, ai];
      for (const leaf of leaves.slice(ai, bi + 1)) {
        targetPaths.push(findAncestorPath(roots, leaf.id));
      }
    } else {
      const fallbackPath = findAncestorPath(roots, focus.nodeId);
      if (fallbackPath.length) targetPaths.push(fallbackPath);
    }

    const blockIds = new Set<string>();
    for (const path of targetPaths) {
      const li = [...path].reverse().find(n => n.kind === 'element' && n.tag === 'li');
      const block = li ?? [...path].reverse().find(n => n.kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(n.tag));
      if (block) blockIds.add(block.id);
    }
    if (!blockIds.size) return false;

    let allInTargetList = targetPaths.length > 0;
    for (const path of targetPaths) {
      const list = [...path].reverse().find(n => n.kind === 'element' && (n.tag === 'ul' || n.tag === 'ol'));
      if (!list || list.kind !== 'element' || list.tag !== type) {
        allInTargetList = false;
        break;
      }
    }

    const buildListAttrs = (baseAttrs: Record<string, string>, nextTag: 'ul' | 'ol', prevTag?: string): Record<string, string> => {
      const attrs = { ...baseAttrs };
      const styleMap = parseStyleMap(attrs['style']);
      if (listStyleType) {
        styleMap['list-style-type'] = listStyleType;
      } else if (prevTag && prevTag !== nextTag) {
        delete styleMap['list-style-type'];
      }
      const serialized = serializeStyleMap(styleMap);
      if (serialized) attrs['style'] = serialized;
      else delete attrs['style'];
      return attrs;
    };

    const convertedListIds = new Set<string>();
    const pushListResult = (result: DocumentNode[], listNode: Extract<DocumentNode, { kind: 'element' }>, isConverted: boolean): void => {
      if (isConverted) convertedListIds.add(listNode.id);
      if (isConverted) {
        // Merge with previous converted list of the same tag & list-style-type (ignoring whitespace text nodes between them)
        let prevIdx = result.length - 1;
        while (prevIdx >= 0 && result[prevIdx].kind === 'text' && !(result[prevIdx] as Extract<DocumentNode, { kind: 'text' }>).text.trim()) {
          prevIdx--;
        }
        const prev = prevIdx >= 0 ? result[prevIdx] : null;
        if (
          prev &&
          prev.kind === 'element' &&
          convertedListIds.has(prev.id) &&
          prev.tag === listNode.tag &&
          (parseStyleMap(prev.attributes['style'])['list-style-type'] || '') ===
            (parseStyleMap(listNode.attributes['style'])['list-style-type'] || '')
        ) {
          result.splice(prevIdx + 1);
          result[prevIdx] = { ...prev, children: [...prev.children, ...listNode.children] };
          return;
        }
      }
      result.push(listNode);
    };

    const transformNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const result: DocumentNode[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.kind === 'element' && (node.tag === 'ul' || node.tag === 'ol')) {
          const hasSelectedChild = node.children.some(c => blockIds.has(c.id));
          if (hasSelectedChild) {
            if (allInTargetList && !listStyleType) {
              let pendingList: DocumentNode[] = [];
              for (const child of node.children) {
                if (blockIds.has(child.id) && child.kind === 'element' && child.tag === 'li') {
                  if (pendingList.length) {
                    result.push({ id: this.uid(node.tag), kind: 'element', tag: node.tag, attributes: { ...node.attributes }, children: pendingList });
                    pendingList = [];
                  }
                  const pChildren = this.unwrapListItemChildren(child);
                  result.push({
                    id: this.uid('p'),
                    kind: 'element',
                    tag: 'p',
                    attributes: {},
                    children: pChildren,
                  });
                } else if (child.kind === 'text' && !child.text.trim()) {
                  continue;
                } else {
                  pendingList.push(child);
                }
              }
              if (pendingList.length) {
                result.push({ id: this.uid(node.tag), kind: 'element', tag: node.tag, attributes: { ...node.attributes }, children: pendingList });
              }
            } else {
              const allChildrenSelected = node.children
                .filter(c => c.kind === 'element' && c.tag === 'li')
                .every(c => blockIds.has(c.id));
              if (allChildrenSelected) {
                const updated: Extract<DocumentNode, { kind: 'element' }> = {
                  ...node,
                  tag: type,
                  attributes: buildListAttrs(node.attributes, type, node.tag),
                  children: node.children.filter(c => !(c.kind === 'text' && !c.text.trim())),
                };
                pushListResult(result, updated, true);
              } else {
                let currentTag: 'ul' | 'ol' | null = null;
                let currentAttrs: Record<string, string> = {};
                let currentItems: DocumentNode[] = [];
                let currentIsConverted = false;
                const flushSegment = () => {
                  if (!currentTag || !currentItems.length) return;
                  pushListResult(
                    result,
                    {
                      id: this.uid(currentTag),
                      kind: 'element',
                      tag: currentTag,
                      attributes: currentAttrs,
                      children: currentItems,
                    },
                    currentIsConverted,
                  );
                  currentTag = null;
                  currentItems = [];
                  currentIsConverted = false;
                };
                for (const child of node.children) {
                  if (child.kind === 'text' && !child.text.trim()) continue;
                  const isSel = blockIds.has(child.id);
                  const segTag: 'ul' | 'ol' = isSel ? type : (node.tag as 'ul' | 'ol');
                  const segAttrs = isSel
                    ? buildListAttrs(node.attributes, segTag, node.tag)
                    : { ...node.attributes };
                  if (currentTag !== segTag || currentIsConverted !== isSel || (currentAttrs['style'] || '') !== (segAttrs['style'] || '')) {
                    flushSegment();
                    currentTag = segTag;
                    currentAttrs = segAttrs;
                    currentIsConverted = isSel;
                  }
                  currentItems.push(child);
                }
                flushSegment();
              }
            }
            continue;
          }
        }

        if (blockIds.has(node.id) && node.kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag)) {
          const listItems: DocumentNode[] = [{
            id: this.uid('li'),
            kind: 'element',
            tag: 'li',
            attributes: {},
            children: node.children.length ? node.children : [{ id: this.uid('txt'), kind: 'text', text: '' }]
          }];
          let j = i + 1;
          while (j < nodes.length) {
            const nextNode = nodes[j];
            if (nextNode.kind === 'text' && !nextNode.text.trim()) {
              j++;
              continue;
            }
            if (blockIds.has(nextNode.id) && nextNode.kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(nextNode.tag)) {
              listItems.push({
                id: this.uid('li'),
                kind: 'element',
                tag: 'li',
                attributes: {},
                children: nextNode.children.length ? nextNode.children : [{ id: this.uid('txt'), kind: 'text', text: '' }]
              });
              j++;
            } else {
              break;
            }
          }
          i = j - 1;
          pushListResult(
            result,
            {
              id: this.uid(type),
              kind: 'element',
              tag: type,
              attributes: buildListAttrs({}, type),
              children: listItems,
            },
            true,
          );
          continue;
        }

        if (node.kind === 'element') {
          const nextChildren = transformNodes(node.children);
          result.push(nextChildren !== node.children ? { ...node, children: nextChildren } : node);
        } else {
          result.push(node);
        }
      }
      return result;
    };

    const wasCollapsed = anchor.nodeId === focus.nodeId && anchor.offset === focus.offset;
    const nextRoots = this.hoistNonListBlocksFromLists(transformNodes(roots));
    const nextLeaves = textNodes(nextRoots);
    if (!nextLeaves.length) return this.commitCustomState(nextRoots, this.selection, 'toggle-list');
    const safeAi = ai >= 0 ? Math.min(ai, nextLeaves.length - 1) : 0;
    const safeBi = bi >= 0 ? Math.min(bi, nextLeaves.length - 1) : safeAi;
    const matchedAnchor = nextLeaves.find(n => n.id === anchor.nodeId);
    const matchedFocus = nextLeaves.find(n => n.id === focus.nodeId);
    const startLeaf = matchedAnchor || nextLeaves[safeAi] || nextLeaves[0];
    const endLeaf = matchedFocus || nextLeaves[safeBi] || startLeaf;
    const nextAnchor = wasCollapsed
      ? { nodeId: startLeaf.id, offset: Math.min(anchor.offset, startLeaf.text.length) }
      : { nodeId: startLeaf.id, offset: matchedAnchor ? Math.min(anchor.offset, startLeaf.text.length) : 0 };
    const nextFocus = wasCollapsed
      ? { nodeId: startLeaf.id, offset: Math.min(focus.offset, startLeaf.text.length) }
      : { nodeId: endLeaf.id, offset: matchedFocus ? Math.min(focus.offset, endLeaf.text.length) : endLeaf.text.length };
    return this.commitCustomState(nextRoots, { anchor: nextAnchor, focus: nextFocus }, 'toggle-list');
  }

  /** Applies a specific CSS `list-style-type` (`disc`, `circle`, `square`, `decimal`, `lower-alpha`, `upper-roman`, etc.) to the selected blocks without toggling off an active list. */
  applyListStyle(listStyleType: string): boolean {
    const normalized = (listStyleType || '').trim().toLowerCase();
    if (!normalized) return false;
    const ordered = ['decimal', 'lower-alpha', 'lower-latin', 'upper-alpha', 'upper-latin', 'lower-roman', 'upper-roman'].includes(normalized);
    return this.toggleList(ordered ? 'ol' : 'ul', normalized);
  }

  /** Inserts or updates a LaTeX formula block (`.word-latex-formula`) directly in the DocumentModel. */
  insertOrUpdateLatexFormula(formulaHtml: string, editingNodeId?: string | null, fallbackPageIndex = 0): boolean {
    this.ensureSelection(fallbackPageIndex);
    const parsed = htmlToDocumentState(formulaHtml, 1, this.uid('latex')).roots;
    if (!parsed.length) return false;

    let trailingLeafId: string | undefined;
    const normalizeParsed = parsed.map(node => {
      if (node.kind === 'element' && node.tag === 'p' && textNodes([node]).length === 0) {
        const leafId = this.uid('latex-after-t');
        trailingLeafId = leafId;
        return {
          ...node,
          children: [{ id: leafId, kind: 'text' as const, text: '' }],
        };
      }
      return node;
    });
    const formulaNode = normalizeParsed[0];

    if (editingNodeId) {
      const sections = this.engine.getSections();
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        let updated = false;
        const replaceFormula = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
          nodes.map(node => {
            if (node.id === editingNodeId) {
              updated = true;
              return { ...formulaNode, id: editingNodeId };
            }
            if (node.kind !== 'element' || !getSubtreeIds(node).has(editingNodeId)) return node;
            return { ...node, children: replaceFormula(node.children) };
          });
        const nextRoots = replaceFormula(sections[sIdx].model.state.roots);
        if (updated) {
          this.section = sIdx;
          return this.commitCustomState(nextRoots, this.selection, 'update-latex');
        }
      }
    }

    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const path = this.selection ? findAncestorPath(roots, this.selection.focus.nodeId) : [];
    const topRoot = path[0];
    const rootIdx = topRoot ? roots.findIndex(r => r.id === topRoot.id) : roots.length - 1;
    const isEmptyRootParagraph =
      topRoot &&
      topRoot.kind === 'element' &&
      topRoot.tag === 'p' &&
      textNodes([topRoot]).every(t => t.text.length === 0) &&
      !topRoot.children.some(c => c.kind === 'element' && c.tag === 'img');

    const nextRoots =
      rootIdx >= 0
        ? isEmptyRootParagraph
          ? [...roots.slice(0, rootIdx), ...normalizeParsed, ...roots.slice(rootIdx + 1)]
          : [...roots.slice(0, rootIdx + 1), ...normalizeParsed, ...roots.slice(rootIdx + 1)]
        : [...roots, ...normalizeParsed];

    const formulaLeaves = textNodes([formulaNode]);
    const caretNodeId = trailingLeafId ?? formulaLeaves[0]?.id ?? this.selection?.focus.nodeId;
    const nextSel: DocumentSelection | null = caretNodeId
      ? { anchor: { nodeId: caretNodeId, offset: 0 }, focus: { nodeId: caretNodeId, offset: 0 } }
      : this.selection;
    return this.commitCustomState(nextRoots, nextSel, 'insert-latex');
  }

  /** Deletes an existing `.word-latex-formula` block by nodeId from the DocumentModel. */
  deleteLatexFormula(editingNodeId: string): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      let removed = false;
      const filterNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const filtered = nodes.filter(n => n.id !== editingNodeId);
        if (filtered.length !== nodes.length) {
          removed = true;
          if (!filtered.length) {
            const leafId = this.uid('empty-t');
            return [{ id: this.uid('empty-p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: leafId, kind: 'text', text: '' }] }];
          }
          return filtered;
        }
        return nodes.map(n => {
          if (n.kind !== 'element' || !getSubtreeIds(n).has(editingNodeId)) return n;
          return { ...n, children: filterNodes(n.children) };
        });
      };
      const nextRoots = filterNodes(sections[sIdx].model.state.roots);
      if (removed) {
        this.section = sIdx;
        const leaves = textNodes(nextRoots);
        const nextSel = leaves.length ? { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[0].id, offset: 0 } } : null;
        return this.commitCustomState(nextRoots, nextSel, 'delete-latex');
      }
    }
    return false;
  }

  /** Replaces all pages in one undoable history snapshot, preserving optional UI/document metadata. */
  replacePagesWithHistory(pages: readonly DocumentPage[], currentMeta?: CanvasHistoryMeta): void {
    const before = this.snapshot(currentMeta);
    this.engine.syncPages(pages, this.geometry);
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.section = 0;
    this.selection = null;
    this.pendingInlineStyle = null;
    this.typingAt = 0;
    this.onCheckpoint?.();
  }

  /** Pushes a metadata-only history checkpoint (e.g. APA layout settings) onto Canvas Undo/Redo. */
  pushMetaSnapshot(currentMeta?: CanvasHistoryMeta): void {
    this.past.push(this.snapshot(currentMeta));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.typingAt = 0;
    this.onCheckpoint?.();
  }

  /** Lazily stamps stable `data-word-object-id` attributes on tables and images without polluting undo history. */
  assignMissingObjectIds(): boolean {
    const sections = this.engine.getSections();
    let anyChanged = false;
    const ensureOnNodes = (nodes: readonly DocumentNode[], inCell = false): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        const isObj = (node.tag === 'table' && !inCell) || node.tag === 'img';
        let nextAttrs = node.attributes;
        let nodeChanged = false;
        if (isObj && !nextAttrs['data-word-continuation'] && !nextAttrs['data-word-object-id']) {
          nextAttrs = { ...nextAttrs, 'data-word-object-id': crypto.randomUUID() };
          nodeChanged = true;
          anyChanged = true;
        }
        const childInCell = inCell || node.tag === 'td' || node.tag === 'th';
        const nextChildren = ensureOnNodes(node.children, childInCell);
        if (nodeChanged || nextChildren !== node.children) {
          return { ...node, attributes: nextAttrs, children: nextChildren };
        }
        return node;
      });
    sections.forEach((sec, idx) => {
      const nextRoots = ensureOnNodes(sec.model.state.roots);
      if (nextRoots !== sec.model.state.roots) {
        this.engine.commitSectionState(
          idx,
          { ...sec.model.state, revision: sec.model.state.revision + 1, roots: nextRoots },
          this.geometry,
        );
      }
    });
    return anyChanged;
  }

  private commitSnapsMutation(
    nextSnaps: EngineSectionSnapshot[],
    nextSection: number,
    nextSelection: DocumentSelection | null,
    currentMeta?: CanvasHistoryMeta,
  ): void {
    const before = this.snapshot(currentMeta);
    this.engine.restore(nextSnaps, this.geometry);
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.section = Math.max(0, Math.min(nextSection, this.engine.getSections().length - 1));
    this.selection = nextSelection;
    this.pendingInlineStyle = null;
    this.typingAt = 0;
    this.onCheckpoint?.();
  }

  private globalPageToSectionLocal(pageIndex: number): { sectionIndex: number; localIndex: number } | null {
    const sections = this.engine.getSections();
    let offset = 0;
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const count = Math.max(1, sections[sIdx].displayLists.length);
      if (pageIndex < offset + count) {
        return { sectionIndex: sIdx, localIndex: pageIndex - offset };
      }
      offset += count;
    }
    return null;
  }

  private sectionLocalToGlobalPage(sectionIndex: number, localIndex = 0): number {
    const sections = this.engine.getSections();
    let page = 0;
    for (let i = 0; i < sectionIndex && i < sections.length; i++) {
      page += Math.max(1, sections[i].displayLists.length);
    }
    return page + localIndex;
  }

  deletePage(pageIndex: number, currentMeta?: CanvasHistoryMeta): boolean {
    const sections = this.engine.getSections();
    const totalPages = sections.reduce((sum, sec) => sum + Math.max(1, sec.displayLists.length), 0);
    if (totalPages <= 1 || pageIndex < 0 || pageIndex >= totalPages) return false;
    const loc = this.globalPageToSectionLocal(pageIndex);
    if (!loc) return false;

    const { sectionIndex, localIndex } = loc;
    const targetSec = sections[sectionIndex];
    const snaps = this.engine.snapshot();

    if (targetSec.displayLists.length <= 1) {
      snaps.splice(sectionIndex, 1);
      this.commitSnapsMutation(snaps, Math.min(sectionIndex, snaps.length - 1), null, currentMeta);
      return true;
    }

    // Multi-page section: remove only nodes/text slices belonging exclusively to `localIndex`.
    const keptIds = new Set<string>();
    const targetTextRanges = new Map<string, { start: number; end: number }[]>();
    const targetVoidIds = new Set<string>();

    const recordCommand = (cmd: PageDisplayList['commands'][number], isTarget: boolean) => {
      if (cmd.kind === 'text' && cmd.source) {
        const nid = cmd.source.start.nodeId;
        if (isTarget) {
          const list = targetTextRanges.get(nid) ?? [];
          list.push({ start: cmd.source.start.offset, end: cmd.source.end.offset });
          targetTextRanges.set(nid, list);
        } else {
          keptIds.add(nid);
        }
      } else if (cmd.kind === 'image' && cmd.nodeId) {
        if (isTarget) targetVoidIds.add(cmd.nodeId);
        else keptIds.add(cmd.nodeId);
      }
    };

    targetSec.displayLists.forEach((dl, p) => {
      for (const cmd of dl.commands) recordCommand(cmd, p === localIndex);
    });

    const pruneNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'text') {
          const ranges = targetTextRanges.get(n.id);
          if (!ranges?.length) {
            out.push(n);
            continue;
          }
          if (!keptIds.has(n.id)) continue;
          const minStart = Math.min(...ranges.map(r => r.start));
          const maxEnd = Math.max(...ranges.map(r => r.end));
          const sliced = n.text.slice(0, minStart) + n.text.slice(maxEnd);
          if (sliced.length > 0) out.push({ ...n, text: sliced });
          continue;
        }
        if (n.tag === 'img' || n.tag === 'hr') {
          if (targetVoidIds.has(n.id) && !keptIds.has(n.id)) continue;
          out.push(n);
          continue;
        }
        const nextChildren = pruneNodes(n.children);
        const sub = getSubtreeIds(n);
        const touchesKept = [...sub].some(id => keptIds.has(id));
        const touchedByTarget = [...sub].some(id => targetTextRanges.has(id) || targetVoidIds.has(id));
        if (nextChildren.length === 0 && (touchedByTarget || !touchesKept)) {
          continue;
        }
        out.push(nextChildren === n.children ? n : { ...n, children: nextChildren });
      }
      return out;
    };

    const nextRoots = pruneNodes(targetSec.model.state.roots);
    if (!nextRoots.length && snaps.length > 1) {
      snaps.splice(sectionIndex, 1);
      this.commitSnapsMutation(snaps, Math.min(sectionIndex, snaps.length - 1), null, currentMeta);
      return true;
    }

    const ensuredRoots = nextRoots.length
      ? nextRoots
      : [{ id: this.uid('p'), kind: 'element' as const, tag: 'p', attributes: {}, children: [{ id: this.uid('t'), kind: 'text' as const, text: '' }] }];

    snaps[sectionIndex] = {
      ...snaps[sectionIndex],
      state: { ...snaps[sectionIndex].state, revision: snaps[sectionIndex].state.revision + 1, roots: ensuredRoots },
    };
    this.commitSnapsMutation(snaps, sectionIndex, null, currentMeta);
    return true;
  }

  addNewPageAt(
    insertAfterIndex: number,
    currentMeta?: CanvasHistoryMeta,
    options?: { sectionBreak?: 'nextPage'; sectionConfig?: SectionPageConfig },
  ): boolean {
    const sections = this.engine.getSections();
    const totalPages = sections.reduce((sum, sec) => sum + Math.max(1, sec.displayLists.length), 0);
    if (!totalPages) return false;

    const idx = Math.max(0, Math.min(insertAfterIndex, totalPages - 1));
    const loc = this.globalPageToSectionLocal(idx);
    if (!loc) return false;

    const { sectionIndex, localIndex } = loc;
    const targetSec = sections[sectionIndex];
    const snaps = this.engine.snapshot();

    const pageId = this.uid('page');
    const leafId = this.uid('t');
    const blankSnap: EngineSectionSnapshot = {
      id: pageId,
      breakBefore: 'manual',
      ...(options?.sectionBreak ? { sectionBreak: options.sectionBreak } : {}),
      ...(options?.sectionConfig ? { sectionConfig: { ...options.sectionConfig } } : {}),
      state: {
        revision: 1,
        roots: [{ id: this.uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: leafId, kind: 'text', text: '' }] }],
        selection: null,
      },
      pageIds: [pageId],
    };

    if (localIndex < targetSec.displayLists.length - 1) {
      const rootPageOf = (root: DocumentNode): number => {
        const sub = getSubtreeIds(root);
        for (let p = 0; p < targetSec.displayLists.length; p++) {
          for (const cmd of targetSec.displayLists[p].commands) {
            if (cmd.kind === 'text' && cmd.source && sub.has(cmd.source.start.nodeId)) return p;
            if (cmd.kind === 'image' && cmd.nodeId && sub.has(cmd.nodeId)) return p;
          }
        }
        return 0;
      };
      const roots = snaps[sectionIndex].state.roots;
      const prefix = roots.filter(r => rootPageOf(r) <= localIndex);
      const suffix = roots.filter(r => rootPageOf(r) > localIndex);
      if (prefix.length && suffix.length) {
        const prefixSnap: EngineSectionSnapshot = {
          ...snaps[sectionIndex],
          state: { ...snaps[sectionIndex].state, revision: snaps[sectionIndex].state.revision + 1, roots: prefix },
        };
        const suffixId = this.uid('sec');
        const suffixSnap: EngineSectionSnapshot = {
          id: suffixId,
          breakBefore: 'manual',
          state: { revision: 1, roots: suffix, selection: null },
          pageIds: [suffixId],
        };
        snaps.splice(sectionIndex, 1, prefixSnap, blankSnap, suffixSnap);
        this.commitSnapsMutation(
          snaps,
          sectionIndex + 1,
          { anchor: { nodeId: leafId, offset: 0 }, focus: { nodeId: leafId, offset: 0 } },
          currentMeta,
        );
        return true;
      }
    }

    snaps.splice(sectionIndex + 1, 0, blankSnap);
    this.commitSnapsMutation(
      snaps,
      sectionIndex + 1,
      { anchor: { nodeId: leafId, offset: 0 }, focus: { nodeId: leafId, offset: 0 } },
      currentMeta,
    );
    return true;
  }

  insertPageBreak(fallbackPageIndex = 0, currentMeta?: CanvasHistoryMeta): boolean {
    if (!this.selection) {
      return this.addNewPageAt(fallbackPageIndex, currentMeta);
    }
    const sections = this.engine.getSections();
    const targetSec = sections[this.section];
    if (!targetSec) return this.addNewPageAt(fallbackPageIndex, currentMeta);

    const snaps = this.engine.snapshot();
    const secSnap = snaps[this.section];
    let roots = secSnap.state.roots;
    const focus = this.selection.focus;
    const path = findAncestorPath(roots, focus.nodeId);
    if (!path.length) return this.addNewPageAt(fallbackPageIndex, currentMeta);

    const topRoot = path[0];
    const rootIdx = roots.findIndex(r => r.id === topRoot.id);
    if (rootIdx < 0) return this.addNewPageAt(fallbackPageIndex, currentMeta);

    const insideTableOrList = path.some(n => n.kind === 'element' && ['table', 'ul', 'ol'].includes(n.tag));
    let prefix: DocumentNode[] = [];
    let suffix: DocumentNode[] = [];

    if (!insideTableOrList && topRoot.kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(topRoot.tag)) {
      const blockLeaves = textNodes([topRoot]);
      const isEmptyBlock = this.isEditableBlockEmpty(topRoot);
      const firstLeaf = blockLeaves[0];
      const lastLeaf = blockLeaves[blockLeaves.length - 1];
      const atStart = !firstLeaf || (focus.nodeId === firstLeaf.id && focus.offset === 0);
      const atEnd = !lastLeaf || (focus.nodeId === lastLeaf.id && focus.offset === lastLeaf.text.length);

      if (isEmptyBlock) {
        prefix = roots.slice(0, rootIdx) as DocumentNode[];
        // If there is content right below the empty paragraph (e.g. a Chapter heading), move it directly to the top of the new page
        suffix = rootIdx + 1 < roots.length ? (roots.slice(rootIdx + 1) as DocumentNode[]) : [topRoot];
      } else if (atStart) {
        prefix = roots.slice(0, rootIdx) as DocumentNode[];
        suffix = roots.slice(rootIdx) as DocumentNode[];
      } else if (atEnd) {
        prefix = roots.slice(0, rootIdx + 1) as DocumentNode[];
        suffix = roots.slice(rootIdx + 1) as DocumentNode[];
      } else {
        // Caret in the middle of a paragraph: split the paragraph so the trailing half moves to the new page
        const splitState = applyDocumentOperation(secSnap.state, { type: 'splitBlock', position: focus });
        roots = splitState.roots;
        prefix = roots.slice(0, rootIdx + 1) as DocumentNode[];
        suffix = roots.slice(rootIdx + 1) as DocumentNode[];
      }
    } else {
      prefix = roots.slice(0, rootIdx + 1) as DocumentNode[];
      suffix = roots.slice(rootIdx + 1) as DocumentNode[];
    }

    if (!prefix.length) {
      prefix = [{ id: this.uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: this.uid('t'), kind: 'text', text: '' }] }];
    }
    if (!suffix.length) {
      suffix = [{ id: this.uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: this.uid('t'), kind: 'text', text: '' }] }];
    }

    const prefixSnap: EngineSectionSnapshot = {
      ...secSnap,
      state: { ...secSnap.state, revision: secSnap.state.revision + 1, roots: prefix },
    };
    const nextPageId = this.uid('page');
    const suffixSnap: EngineSectionSnapshot = {
      id: nextPageId,
      breakBefore: 'manual',
      state: { revision: 1, roots: suffix, selection: null },
      pageIds: [nextPageId],
    };
    snaps.splice(this.section, 1, prefixSnap, suffixSnap);
    const firstSuffixLeaf = textNodes(suffix)[0];
    const nextCaret: DocumentPosition = firstSuffixLeaf
      ? { nodeId: firstSuffixLeaf.id, offset: 0 }
      : { nodeId: suffix[0].id, offset: 0 };
    this.commitSnapsMutation(snaps, this.section + 1, { anchor: nextCaret, focus: nextCaret }, currentMeta);
    return true;
  }

  /** Inserts a new logical Word section (new numbering, first-page rule, or orientation) after `fallbackPageIndex`. */
  insertSectionBreak(
    fallbackPageIndex = 0,
    sectionConfig?: SectionPageConfig,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    return this.addNewPageAt(fallbackPageIndex, currentMeta, {
      sectionBreak: 'nextPage',
      sectionConfig,
    });
  }

  /** Updates the `SectionPageConfig` of the logical Word section containing `pageIndex`. */
  updateSectionConfig(
    pageIndex: number,
    patch: Partial<SectionPageConfig>,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const snaps = this.engine.snapshot();
    if (!snaps.length) return false;
    const loc = this.globalPageToSectionLocal(Math.max(0, pageIndex));
    const currentSnapIdx = loc?.sectionIndex ?? 0;
    let targetSnapIdx = currentSnapIdx;
    while (targetSnapIdx > 0 && snaps[targetSnapIdx].sectionBreak !== 'nextPage') {
      targetSnapIdx--;
    }
    const existing = snaps[targetSnapIdx].sectionConfig ?? {};
    const merged: SectionPageConfig = { ...existing, ...patch };
    for (const [k, v] of Object.entries(merged) as Array<[keyof SectionPageConfig, unknown]>) {
      if (v === undefined) delete merged[k];
    }
    snaps[targetSnapIdx] = {
      ...snaps[targetSnapIdx],
      sectionConfig: Object.keys(merged).length ? merged : undefined,
    };
    this.commitSnapsMutation(snaps, currentSnapIdx, this.selection, currentMeta);
    return true;
  }

  /** Creates or wraps the current selection with an `<a>` link directly in the DocumentModel. */
  createLink(href: string, fallbackPageIndex = 0, currentMeta?: CanvasHistoryMeta): boolean {
    if (!href) return false;
    const prevSection = this.section;
    const prevSelection = this.selection;
    if (!this.selection) this.ensureSelection(fallbackPageIndex);
    if (!this.selection) return false;

    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const linkAttrs: Record<string, string> = { href };
    if (/^https?:/i.test(href)) {
      linkAttrs['target'] = '_blank';
      linkAttrs['rel'] = 'noopener noreferrer';
    }

    const { anchor, focus } = this.selection;
    const isCollapsed = anchor.nodeId === focus.nodeId && anchor.offset === focus.offset;
    let nextRoots: readonly DocumentNode[] | null = null;
    let nextSel: DocumentSelection | null = null;

    if (isCollapsed) {
      const textLeaf: DocumentNode = { id: this.uid('t'), kind: 'text', text: href };
      const linkNode: Extract<DocumentNode, { kind: 'element' }> = {
        id: this.uid('a'),
        kind: 'element',
        tag: 'a',
        attributes: linkAttrs,
        children: [textLeaf],
      };
      const spliced = spliceInlineNodesAtSelection(roots, this.selection, [linkNode], id => this.uid(id));
      if (!spliced) return false;
      nextRoots = spliced.roots;
      nextSel = { anchor: { nodeId: textLeaf.id, offset: href.length }, focus: { nodeId: textLeaf.id, offset: href.length } };
    } else {
      const leaves = textNodes(roots);
      const ai = leaves.findIndex(n => n.id === anchor.nodeId);
      const bi = leaves.findIndex(n => n.id === focus.nodeId);
      if (ai < 0 || bi < 0) return false;
      const forward = ai < bi || (ai === bi && anchor.offset <= focus.offset);
      const start = forward ? anchor : focus;
      const end = forward ? focus : anchor;

      const blockOfLeaf = (leafId: string): Extract<DocumentNode, { kind: 'element' }> | null => {
        const path = findAncestorPath(roots, leafId);
        return [...path].reverse().find(
          (n): n is Extract<DocumentNode, { kind: 'element' }> =>
            n.kind === 'element' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th'].includes(n.tag),
        ) ?? null;
      };
      const startBlock = blockOfLeaf(start.nodeId);
      if (!startBlock) return false;
      const startBlockLeaves = textNodes([startBlock]);
      const startLeafIdxInBlock = startBlockLeaves.findIndex(l => l.id === start.nodeId);
      let endLeafIdxInBlock = startBlockLeaves.findIndex(l => l.id === end.nodeId);
      let endOffsetInBlockLeaf = end.offset;
      if (endLeafIdxInBlock < 0) {
        endLeafIdxInBlock = startBlockLeaves.length - 1;
        endOffsetInBlockLeaf = startBlockLeaves[endLeafIdxInBlock]?.text.length ?? 0;
      }

      // Compute block-local character bounds `[charStart, charEnd)`.
      let charStart = 0;
      let charEnd = 0;
      let cursor = 0;
      for (let i = 0; i < startBlockLeaves.length; i++) {
        if (i === startLeafIdxInBlock) charStart = cursor + start.offset;
        if (i === endLeafIdxInBlock) charEnd = cursor + endOffsetInBlockLeaf;
        cursor += startBlockLeaves[i].text.length;
      }
      if (charEnd <= charStart) return false;

      // Wrap exact character range `[charStart, charEnd)` within `startBlock` inside an `<a>` element.
      const linkChildren: DocumentNode[] = [];
      let walk = 0;
      let trailingCaretPos: DocumentPosition | null = null;
      const buildWrappedChildren = (children: readonly DocumentNode[], insideA: boolean): DocumentNode[] => {
        const result: DocumentNode[] = [];
        for (const ch of children) {
          if (ch.kind === 'text') {
            const c0 = walk;
            const c1 = walk + ch.text.length;
            walk = c1;
            if (c1 <= charStart || c0 >= charEnd) {
              result.push(ch);
              continue;
            }
            const beforeText = ch.text.slice(0, Math.max(0, charStart - c0));
            const midText = ch.text.slice(Math.max(0, charStart - c0), Math.min(ch.text.length, charEnd - c0));
            const afterText = ch.text.slice(Math.max(0, charEnd - c0));
            if (beforeText) result.push({ id: this.uid('t'), kind: 'text', text: beforeText });
            const pushedAnchorHere = linkChildren.length === 0;
            if (midText) {
              const midNode: DocumentNode = { id: this.uid('t'), kind: 'text', text: midText };
              linkChildren.push(midNode);
              trailingCaretPos = { nodeId: midNode.id, offset: midText.length };
            }
            if (pushedAnchorHere && !insideA) {
              result.push({ id: '__LINK_SLOT__', kind: 'text', text: '' });
            }
            if (afterText) result.push({ id: this.uid('t'), kind: 'text', text: afterText });
            continue;
          }
          const subLen = textNodes([ch]).reduce((s, t) => s + t.text.length, 0);
          const n0 = walk;
          const n1 = walk + subLen;
          if (n1 <= charStart || n0 >= charEnd) {
            walk = n1;
            result.push(ch);
            continue;
          }
          const wasEmpty = linkChildren.length === 0;
          const nextCh = buildWrappedChildren(ch.children, insideA || ch.tag === 'a');
          if (ch.tag === 'a') {
            result.push(...nextCh);
          } else {
            const beforePart: DocumentNode[] = [];
            const afterPart: DocumentNode[] = [];
            let seenSlot = !wasEmpty && linkChildren.length > 0;
            for (const x of nextCh) {
              if (x.id === '__LINK_SLOT__') {
                seenSlot = true;
                continue;
              }
              if (!seenSlot) beforePart.push(x);
              else afterPart.push(x);
            }
            if (beforePart.length) {
              result.push({ ...ch, id: this.uid(ch.tag), children: beforePart });
            }
            if (wasEmpty && linkChildren.length > 0 && !insideA) {
              const wrappedInner = nextCh.some(x => x.id === '__LINK_SLOT__')
                ? linkChildren.splice(0, linkChildren.length).map(inner => ({ ...ch, id: this.uid(ch.tag), children: [inner] }))
                : null;
              if (wrappedInner) linkChildren.push(...wrappedInner);
              result.push({ id: '__LINK_SLOT__', kind: 'text', text: '' });
            } else if (!wasEmpty && nextCh.some(x => x.id === '__LINK_SLOT__') && !insideA) {
              result.push({ id: '__LINK_SLOT__', kind: 'text', text: '' });
            }
            if (afterPart.length) {
              result.push({ ...ch, id: this.uid(ch.tag), children: afterPart });
            }
          }
        }
        return result;
      };

      const builtWithSlot = buildWrappedChildren(startBlock.children, false);
      const linkEl: Extract<DocumentNode, { kind: 'element' }> = {
        id: this.uid('a'),
        kind: 'element',
        tag: 'a',
        attributes: linkAttrs,
        children: linkChildren,
      };
      const finalChildren = builtWithSlot.map(c => (c.id === '__LINK_SLOT__' ? linkEl : c));
      const replaceBlock = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(n => {
          if (n.id === startBlock.id && n.kind === 'element') return { ...n, children: finalChildren };
          if (n.kind === 'element' && getSubtreeIds(n).has(startBlock.id)) {
            return { ...n, children: replaceBlock(n.children) };
          }
          return n;
        });
      nextRoots = replaceBlock(roots);
      nextSel = trailingCaretPos ? { anchor: trailingCaretPos, focus: trailingCaretPos } : null;
    }

    const before = this.snapshot(currentMeta);
    before.section = prevSection;
    before.selection = prevSelection;
    this.engine.commitSectionState(
      this.section,
      { ...section.model.state, revision: section.model.state.revision + 1, roots: nextRoots, selection: nextSel },
      this.geometry,
    );
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.selection = nextSel;
    this.pendingInlineStyle = null;
    this.typingAt = 0;
    this.onCheckpoint?.();
    return true;
  }

  /** Clears inline (and when collapsed or full-block, block-level) formatting directly in the DocumentModel. */
  removeFormat(baseRule: ElementStyleRule, fallbackPageIndex = 0, currentMeta?: CanvasHistoryMeta): boolean {
    const prevSection = this.section;
    const prevSelection = this.selection;
    if (!this.selection) this.ensureSelection(fallbackPageIndex);
    if (!this.selection) return false;

    const section = this.engine.getSections()[this.section];
    if (!section) return false;
    const roots = section.model.state.roots;
    const leaves = textNodes(roots);
    const { anchor, focus } = this.selection;
    const ai = leaves.findIndex(n => n.id === anchor.nodeId);
    const bi = leaves.findIndex(n => n.id === focus.nodeId);
    if (ai < 0 || bi < 0) return false;

    const forward = ai < bi || (ai === bi && anchor.offset <= focus.offset);
    const startPos = forward ? anchor : focus;
    const endPos = forward ? focus : anchor;
    const isCollapsed = startPos.nodeId === endPos.nodeId && startPos.offset === endPos.offset;

    const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
    const FORMAT_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'sub', 'sup', 'a', 'font', 'span']);
    const isProtectedSpan = (el: Extract<DocumentNode, { kind: 'element' }>): boolean =>
      'data-word-citation' in el.attributes ||
      'data-word-note-id' in el.attributes ||
      'data-note-id' in el.attributes ||
      'data-note-call' in el.attributes ||
      'data-word-object-reference' in el.attributes ||
      'data-word-latex' in el.attributes ||
      'data-apa-heading-level' in el.attributes;

    const startIdx = leaves.findIndex(l => l.id === startPos.nodeId);
    const endIdx = leaves.findIndex(l => l.id === endPos.nodeId);
    const selectedLeafSet = new Set(leaves.slice(startIdx, endIdx + 1).map(l => l.id));

    const findPosByCharOffset = (block: DocumentNode, targetOffset: number): DocumentPosition | null => {
      const bLeaves = textNodes([block]);
      let walk = 0;
      for (const l of bLeaves) {
        if (targetOffset <= walk + l.text.length) {
          return { nodeId: l.id, offset: Math.max(0, targetOffset - walk) };
        }
        walk += l.text.length;
      }
      const last = bLeaves.at(-1);
      return last ? { nodeId: last.id, offset: last.text.length } : null;
    };

    let nextAnchor: DocumentPosition | null = null;
    let nextFocus: DocumentPosition | null = null;
    let changed = false;

    const cleanBlock = (block: Extract<DocumentNode, { kind: 'element' }>): DocumentNode => {
      const bLeaves = textNodes([block]);
      if (!bLeaves.some(l => selectedLeafSet.has(l.id))) return block;

      let totalLen = 0;
      let selStart = -1;
      let selEnd = -1;
      for (const l of bLeaves) {
        if (l.id === startPos.nodeId && selStart < 0) selStart = totalLen + startPos.offset;
        if (l.id === endPos.nodeId) selEnd = totalLen + endPos.offset;
        totalLen += l.text.length;
      }
      if (selStart < 0) selStart = 0;
      if (selEnd < 0) selEnd = totalLen;

      const fullBlockClear = isCollapsed || (selStart === 0 && selEnd >= totalLen);
      const clearFrom = fullBlockClear ? 0 : selStart;
      const clearTo = fullBlockClear ? totalLen : selEnd;

      let walk = 0;
      const stripChildren = (children: readonly DocumentNode[]): DocumentNode[] => {
        const out: DocumentNode[] = [];
        for (const ch of children) {
          if (ch.kind === 'text') {
            walk += ch.text.length;
            out.push(ch);
            continue;
          }
          const chLen = textNodes([ch]).reduce((s, t) => s + t.text.length, 0);
          const n0 = walk;
          const n1 = walk + chLen;

          if (FORMAT_TAGS.has(ch.tag) && !(isProtectedSpan(ch) && !fullBlockClear)) {
            if (isProtectedSpan(ch) && 'data-apa-heading-level' in ch.attributes && fullBlockClear) {
              changed = true;
              out.push(...stripChildren(ch.children));
              continue;
            }
            if (isProtectedSpan(ch)) {
              walk = n1;
              out.push(ch);
              continue;
            }
            if (n1 <= clearFrom || n0 >= clearTo || chLen === 0) {
              if (fullBlockClear || (n0 >= clearFrom && n1 <= clearTo)) {
                changed = true;
                out.push(...stripChildren(ch.children));
              } else {
                walk = n1;
                out.push(ch);
              }
              continue;
            }
            if (n0 >= clearFrom && n1 <= clearTo) {
              changed = true;
              out.push(...stripChildren(ch.children));
              continue;
            }
            // Partial overlap inside formatting wrapper: split before / unwrapped inside / after
            changed = true;
            const beforeNodes: DocumentNode[] = [];
            const midNodes: DocumentNode[] = [];
            const afterNodes: DocumentNode[] = [];
            const splitLeaves = (sub: readonly DocumentNode[], targetBefore: DocumentNode[], targetMid: DocumentNode[], targetAfter: DocumentNode[]) => {
              for (const s of sub) {
                if (s.kind === 'text') {
                  const s0 = walk;
                  const s1 = walk + s.text.length;
                  walk = s1;
                  const b = s.text.slice(0, Math.max(0, clearFrom - s0));
                  const m = s.text.slice(Math.max(0, clearFrom - s0), Math.min(s.text.length, clearTo - s0));
                  const a = s.text.slice(Math.max(0, clearTo - s0));
                  if (b) targetBefore.push({ id: this.uid('t'), kind: 'text', text: b });
                  if (m) targetMid.push({ id: this.uid('t'), kind: 'text', text: m });
                  if (a) targetAfter.push({ id: this.uid('t'), kind: 'text', text: a });
                } else {
                  const sb: DocumentNode[] = [];
                  const sm: DocumentNode[] = [];
                  const sa: DocumentNode[] = [];
                  splitLeaves(s.children, sb, sm, sa);
                  if (sb.length) targetBefore.push({ ...s, id: this.uid(s.tag), children: sb });
                  if (sm.length) targetMid.push(...sm);
                  if (sa.length) targetAfter.push({ ...s, id: this.uid(s.tag), children: sa });
                }
              }
            };
            splitLeaves(ch.children, beforeNodes, midNodes, afterNodes);
            if (beforeNodes.length) out.push({ ...ch, id: this.uid(ch.tag), children: beforeNodes });
            if (midNodes.length) out.push(...midNodes);
            if (afterNodes.length) out.push({ ...ch, id: this.uid(ch.tag), children: afterNodes });
            continue;
          }

          const nextCh = stripChildren(ch.children);
          out.push(nextCh === ch.children ? ch : { ...ch, children: nextCh });
        }
        return out;
      };

      const nextChildren = stripChildren(block.children);
      let nextBlock: Extract<DocumentNode, { kind: 'element' }> =
        nextChildren === block.children ? block : { ...block, children: nextChildren };

      if (fullBlockClear) {
        const nextTag = block.tag === 'li' ? 'li' : 'p';
        const nextAttrs: Record<string, string> = { ...block.attributes };
        delete nextAttrs['data-apa-heading-level'];
        delete nextAttrs['data-apa-run-in'];
        delete nextAttrs['data-word-chapter'];
        nextAttrs['data-word-line-spacing'] = String(baseRule.lineHeight);
        nextAttrs['style'] = ruleToCssStyle(baseRule);
        changed = true;
        nextBlock = { ...nextBlock, tag: nextTag, attributes: nextAttrs };
      }

      if (bLeaves.some(l => l.id === startPos.nodeId)) {
        nextAnchor = findPosByCharOffset(nextBlock, selStart);
      }
      if (bLeaves.some(l => l.id === endPos.nodeId)) {
        nextFocus = findPosByCharOffset(nextBlock, selEnd);
      }
      return nextBlock;
    };

    const visit = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        if (BLOCK_TAGS.has(n.tag) && !n.children.some(c => c.kind === 'element' && BLOCK_TAGS.has(c.tag))) {
          return cleanBlock(n);
        }
        const ch = visit(n.children);
        return ch === n.children ? n : { ...n, children: ch };
      });

    const nextRoots = visit(roots);
    if (!changed) return false;
    const finalSel: DocumentSelection | null =
      nextAnchor && nextFocus ? { anchor: nextAnchor, focus: nextFocus } : this.selection;

    const before = this.snapshot(currentMeta);
    before.section = prevSection;
    before.selection = prevSelection;
    this.engine.commitSectionState(
      this.section,
      { ...section.model.state, revision: section.model.state.revision + 1, roots: nextRoots, selection: finalSel },
      this.geometry,
    );
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.selection = finalSel;
    this.pendingInlineStyle = null;
    this.typingAt = 0;
    this.onCheckpoint?.();
    return true;
  }

  getAcademicNotes(): AcademicNote[] {
    return collectModelNotes(this.engine.getSections());
  }

  getAcademicObjects(): AcademicObject[] {
    return collectModelAcademicObjects(this.engine.getSections());
  }

  isBibliographicSourceCited(id: string): boolean {
    return collectCitedIdsFromSections(this.engine.getSections()).has(id);
  }

  insertObjectReference(
    objectId: string,
    template: StyleTemplate,
    fallbackPageIndex = 0,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    this.assignMissingObjectIds();
    if (!this.selection) this.ensureSelection(fallbackPageIndex);
    if (!this.selection) return false;

    const object = this.getAcademicObjects().find(o => o.id === objectId);
    if (!object) return false;

    const snaps = this.engine.snapshot();
    const activeSnap = snaps[this.section];
    if (!activeSnap) return false;

    const label = academicObjectLabel(object);
    const pRule = template.rules.P;
    const spanTextId = this.uid('t');
    const spanNode: Extract<DocumentNode, { kind: 'element' }> = {
      id: this.uid('objref'),
      kind: 'element',
      tag: 'span',
      attributes: {
        'data-word-object-reference': object.id,
        contenteditable: 'false',
        style: serializeCssStyleMap({
          'font-family': `'${pRule.fontFamily}', serif`,
          'font-size': `${pRule.fontSizePt}pt`,
          color: '#000000',
        }),
      },
      children: [{ id: spanTextId, kind: 'text', text: label }],
    };

    const spliced = spliceInlineNodesAtSelection(
      activeSnap.state.roots,
      this.selection,
      [spanNode],
      id => this.uid(id),
    );
    if (!spliced) return false;

    snaps[this.section] = {
      ...activeSnap,
      state: { ...activeSnap.state, revision: activeSnap.state.revision + 1, roots: spliced.roots },
    };
    this.commitSnapsMutation(snaps, this.section, spliced.selectionAfter, currentMeta);
    return true;
  }

  insertCitation(
    request: CitationRequest,
    allSources: readonly BibliographicSource[],
    template: StyleTemplate,
    fallbackPageIndex = 0,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const source = allSources.find(s => s.id === request.sourceId);
    if (!source) return false;
    if (!this.selection) this.ensureSelection(fallbackPageIndex);
    if (!this.selection) return false;

    const snaps = this.engine.snapshot();
    const activeSnap = snaps[this.section];
    if (!activeSnap) return false;

    const snippet = buildCitationSnippetNodes(request, source, [...allSources], template, id => this.uid(id));
    let nextSel: DocumentSelection | null = this.selection;
    if (snippet.mode === 'blockquote') {
      const res = insertBlocksAtSelection(activeSnap.state.roots, this.selection, snippet.nodes, id => this.uid(id));
      snaps[this.section] = {
        ...activeSnap,
        state: { ...activeSnap.state, revision: activeSnap.state.revision + 1, roots: res.roots },
      };
      nextSel = res.selectionAfter;
    } else {
      const res = spliceInlineNodesAtSelection(activeSnap.state.roots, this.selection, snippet.nodes, id => this.uid(id));
      if (!res) return false;
      snaps[this.section] = {
        ...activeSnap,
        state: { ...activeSnap.state, revision: activeSnap.state.revision + 1, roots: res.roots },
      };
      nextSel = res.selectionAfter;
    }

    refreshModelCitationsInSnaps(snaps, [...allSources], id => this.uid(id));
    refreshModelBibliographyInSnaps(snaps, [...allSources], template, id => this.uid(id));
    this.commitSnapsMutation(snaps, this.section, nextSel, currentMeta);
    return true;
  }

  insertOrRefreshBibliography(
    allSources: readonly BibliographicSource[],
    template: StyleTemplate,
    currentMeta?: CanvasHistoryMeta,
  ): { ok: boolean; activePageIndex?: number; error?: string } {
    const snaps = this.engine.snapshot();
    const res = refreshModelBibliographyInSnaps(snaps, [...allSources], template, id => this.uid(id));
    if (res.found) {
      if (!res.changed) return { ok: true };
      const hasBibInNodes = (nodes: readonly DocumentNode[]): boolean =>
        nodes.some(n => n.kind === 'element' && ('data-word-bibliography' in n.attributes || hasBibInNodes(n.children)));
      const bibSecIdx = snaps.findIndex(s => hasBibInNodes(s.state.roots));
      this.commitSnapsMutation(snaps, Math.max(0, bibSecIdx), this.selection, currentMeta);
      return { ok: true, activePageIndex: this.sectionLocalToGlobalPage(Math.max(0, bibSecIdx), 0) };
    }

    const citedIds = collectCitedIdsFromSections(this.engine.getSections());
    const bibSources = sortedSources(allSources.filter(s => citedIds.has(s.id))).filter(referenceEligible);
    if (!bibSources.length) {
      return { ok: false, error: 'Inserta primero al menos una cita válida antes de generar las referencias.' };
    }

    const secId = this.uid('bib');
    const nodes = buildBibliographyParagraphNodes(bibSources, template, id => this.uid(id));
    const endnotesIdx = snaps.findIndex(s => s.state.roots.some(r => r.kind === 'element' && (r.attributes['data-apa-section'] === 'endnotes' || r.attributes['data-word-note-list'] === 'endnote')));
    const appendixIdx = snaps.findIndex(s => s.state.roots.some(r => r.kind === 'element' && r.attributes['data-apa-section'] === 'appendix'));
    const insertAt = endnotesIdx >= 0 ? endnotesIdx : (appendixIdx >= 0 ? appendixIdx : snaps.length);

    snaps.splice(insertAt, 0, {
      id: secId,
      breakBefore: 'manual',
      state: { revision: 1, roots: nodes, selection: null },
      pageIds: [secId],
    });
    if (snaps[insertAt + 1] && snaps[insertAt + 1].breakBefore !== 'manual') {
      snaps[insertAt + 1] = { ...snaps[insertAt + 1], breakBefore: 'manual' };
    }
    this.commitSnapsMutation(snaps, insertAt, null, currentMeta);
    return { ok: true, activePageIndex: this.sectionLocalToGlobalPage(insertAt, 0) };
  }

  refreshAcademicBibliographyAndCitations(
    allSources: readonly BibliographicSource[],
    template: StyleTemplate,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const snaps = this.engine.snapshot();
    const cChanged = refreshModelCitationsInSnaps(snaps, [...allSources], id => this.uid(id));
    const bRes = refreshModelBibliographyInSnaps(snaps, [...allSources], template, id => this.uid(id));
    if (!cChanged && !bRes.changed) return false;
    this.commitSnapsMutation(snaps, this.section, this.selection, currentMeta);
    return true;
  }

  applyAcademicCaption(
    request: CaptionRequest,
    allSources: readonly BibliographicSource[],
    template: StyleTemplate,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const snaps = this.engine.snapshot();
    applyModelApaSectionsAndObjectsInSnaps(snaps, template, id => this.uid(id), request);
    refreshModelBibliographyInSnaps(snaps, [...allSources], template, id => this.uid(id));
    this.commitSnapsMutation(snaps, this.section, this.selection, currentMeta);
    this.refreshExistingObjectIndexesInPlace(template);
    return true;
  }

  saveAcademicNote(
    request: AcademicNoteRequest,
    template: StyleTemplate,
    fallbackPageIndex = 0,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const snaps = this.engine.snapshot();
    let nextSel: DocumentSelection | null = this.selection;
    const trimmedText = request.text.trim();

    if (request.id) {
      let found = false;
      const updateNoteCall = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(n => {
          if (n.kind !== 'element') return n;
          if (n.attributes['data-word-note-id'] === request.id) {
            found = true;
            return {
              ...n,
              attributes: {
                ...n.attributes,
                'data-note-kind': request.kind,
                'data-note-content': trimmedText,
                'data-note-font': template.rules.P.fontFamily,
                'data-note-font-size': String(template.rules.P.fontSizePt),
              },
            };
          }
          const ch = updateNoteCall(n.children);
          return ch === n.children ? n : { ...n, children: ch };
        });
      snaps.forEach((s, i) => {
        const nextRoots = updateNoteCall(s.state.roots);
        if (nextRoots !== s.state.roots) {
          snaps[i] = { ...s, state: { ...s.state, revision: s.state.revision + 1, roots: nextRoots } };
        }
      });
      if (!found) return false;
    } else {
      if (!this.selection) this.ensureSelection(fallbackPageIndex);
      if (!this.selection) return false;
      const activeSnap = snaps[this.section];
      if (!activeSnap) return false;

      const existingCount = collectModelNotes(this.engine.getSections()).length + 1;
      const noteId = crypto.randomUUID();
      const noteCallNode: Extract<DocumentNode, { kind: 'element' }> = {
        id: this.uid('na'),
        kind: 'element',
        tag: 'a',
        attributes: {
          'data-word-note-id': noteId,
          'data-note-kind': request.kind,
          'data-note-content': trimmedText,
          'data-note-font': template.rules.P.fontFamily,
          'data-note-font-size': String(template.rules.P.fontSizePt),
          id: `note-call-${noteId}`,
          href: `#note-${noteId}`,
          contenteditable: 'false',
          style: 'vertical-align: super; font-size: 75%; color: #000000; text-decoration: none',
        },
        children: [{ id: this.uid('t'), kind: 'text', text: String(existingCount) }],
      };
      const spliced = spliceInlineNodesAtSelection(activeSnap.state.roots, this.selection, [noteCallNode], id => this.uid(id));
      if (!spliced) return false;
      snaps[this.section] = {
        ...activeSnap,
        state: { ...activeSnap.state, revision: activeSnap.state.revision + 1, roots: spliced.roots },
      };
      nextSel = spliced.selectionAfter;
    }

    const notes = renumberModelNotesInSnaps(snaps, template, id => this.uid(id));
    syncModelEndnotesInSnaps(snaps, notes, template, id => this.uid(id));
    this.commitSnapsMutation(snaps, this.section, nextSel, currentMeta);
    return true;
  }

  removeAcademicNote(id: string, template: StyleTemplate, currentMeta?: CanvasHistoryMeta): boolean {
    const snaps = this.engine.snapshot();
    let removed = false;
    const stripCall = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes
        .filter(n => {
          if (n.kind === 'element' && n.attributes['data-word-note-id'] === id) {
            removed = true;
            return false;
          }
          return true;
        })
        .map(n => {
          if (n.kind !== 'element') return n;
          const ch = stripCall(n.children);
          return ch === n.children ? n : { ...n, children: ch };
        });

    snaps.forEach((s, i) => {
      const nextRoots = stripCall(s.state.roots);
      if (nextRoots !== s.state.roots) {
        snaps[i] = { ...s, state: { ...s.state, revision: s.state.revision + 1, roots: nextRoots } };
      }
    });
    if (!removed) return false;

    const notes = renumberModelNotesInSnaps(snaps, template, pid => this.uid(pid));
    syncModelEndnotesInSnaps(snaps, notes, template, pid => this.uid(pid));
    this.commitSnapsMutation(snaps, this.section, null, currentMeta);
    return true;
  }

  insertAcademicSection(
    request: AcademicSectionRequest,
    template: StyleTemplate,
    currentMeta?: CanvasHistoryMeta,
  ): { ok: boolean; activePageIndex: number } {
    this.assignMissingObjectIds();
    const snaps = this.engine.snapshot();
    const insertIdx = insertAcademicSectionInSnaps(snaps, request, template, id => this.uid(id));
    applyModelApaSectionsAndObjectsInSnaps(snaps, template, id => this.uid(id));
    this.commitSnapsMutation(snaps, insertIdx, null, currentMeta);
    this.refreshExistingObjectIndexesInPlace(template);
    return { ok: true, activePageIndex: this.sectionLocalToGlobalPage(insertIdx, 0) };
  }

  updateAcademicDocument(
    allSources: readonly BibliographicSource[],
    template: StyleTemplate,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    this.assignMissingObjectIds();
    const snaps = this.engine.snapshot();
    refreshModelCitationsInSnaps(snaps, [...allSources], id => this.uid(id));
    refreshModelBibliographyInSnaps(snaps, [...allSources], template, id => this.uid(id));
    const notes = renumberModelNotesInSnaps(snaps, template, id => this.uid(id));
    applyModelApaSectionsAndObjectsInSnaps(snaps, template, id => this.uid(id));
    syncModelEndnotesInSnaps(snaps, notes, template, id => this.uid(id));
    this.commitSnapsMutation(snaps, this.section, this.selection, currentMeta);
    this.refreshExistingObjectIndexesInPlace(template);
    return true;
  }

  syncAcademicEndnotes(template: StyleTemplate, currentMeta?: CanvasHistoryMeta): boolean {
    const snaps = this.engine.snapshot();
    const notes = renumberModelNotesInSnaps(snaps, template, id => this.uid(id));
    const changed = syncModelEndnotesInSnaps(snaps, notes, template, id => this.uid(id));
    if (!changed) return false;
    this.commitSnapsMutation(snaps, this.section, this.selection, currentMeta);
    return true;
  }

  rebuildToc(
    insert: boolean,
    activePageIndex: number,
    options: Omit<ModelTocBuildOptions, 'measureDisplayLists'> = {},
    inPlace = false,
    currentMeta?: CanvasHistoryMeta,
  ): { found: boolean; activePageIndex: number; headings: HeadingItem[] } {
    const sections = this.engine.getSections();
    const snaps = this.engine.snapshot();
    const res = rebuildModelTocInSnaps(
      sections,
      snaps,
      activePageIndex,
      insert,
      {
        ...options,
        measureDisplayLists: state => this.engine.measureStateDisplayLists(state, this.geometry),
      },
      id => this.uid(id),
    );
    if (!res.found) {
      return { found: false, activePageIndex, headings: [] };
    }
    if (inPlace) {
      this.engine.restore(snaps, this.geometry);
      this.section = Math.max(0, Math.min(this.section, this.engine.getSections().length - 1));
      if (this.selection) {
        const curSec = this.engine.getSections()[this.section];
        if (!curSec || !findNodeById(curSec.model.state.roots, this.selection.anchor.nodeId)) {
          this.selection = null;
        }
      }
      this.onCheckpoint?.();
    } else {
      this.commitSnapsMutation(snaps, res.tocSectionIndex, null, currentMeta);
    }
    this.refreshExistingObjectIndexesInPlace(options.template);
    return {
      found: true,
      activePageIndex: this.sectionLocalToGlobalPage(res.tocSectionIndex, 0),
      headings: res.headings,
    };
  }

  private refreshExistingObjectIndexesInPlace(template?: StyleTemplate): void {
    const opts: ModelTocBuildOptions = {
      template,
      measureDisplayLists: state => this.engine.measureStateDisplayLists(state, this.geometry),
    };
    let refreshed = false;
    for (const kind of ['table', 'figure'] as const) {
      const snaps = this.engine.snapshot();
      if (!hasModelObjectIndexInSnaps(snaps, kind)) continue;
      const res = rebuildModelObjectIndexInSnaps(
        this.engine.getSections(),
        snaps,
        kind,
        0,
        false,
        opts,
        id => this.uid(id),
      );
      if (res.found) {
        this.engine.restore(snaps, this.geometry);
        refreshed = true;
      }
    }
    if (refreshed) {
      this.section = Math.max(0, Math.min(this.section, this.engine.getSections().length - 1));
      if (this.selection) {
        const curSec = this.engine.getSections()[this.section];
        if (!curSec || !findNodeById(curSec.model.state.roots, this.selection.anchor.nodeId)) {
          this.selection = null;
        }
      }
      this.onCheckpoint?.();
    }
  }

  /** Builds, inserts, or refreshes the Table Index or Figure Index directly in the Canvas model. */
  rebuildObjectIndex(
    kind: 'table' | 'figure',
    insert: boolean,
    activePageIndex: number,
    options: Omit<ModelTocBuildOptions, 'measureDisplayLists'> = {},
    inPlace = false,
    currentMeta?: CanvasHistoryMeta,
  ): { found: boolean; activePageIndex: number; count: number } {
    const sections = this.engine.getSections();
    const snaps = this.engine.snapshot();
    const res = rebuildModelObjectIndexInSnaps(
      sections,
      snaps,
      kind,
      activePageIndex,
      insert,
      {
        ...options,
        measureDisplayLists: state => this.engine.measureStateDisplayLists(state, this.geometry),
      },
      id => this.uid(id),
    );
    if (!res.found) {
      return { found: false, activePageIndex, count: 0 };
    }
    if (inPlace) {
      this.engine.restore(snaps, this.geometry);
      this.section = Math.max(0, Math.min(this.section, this.engine.getSections().length - 1));
      if (this.selection) {
        const curSec = this.engine.getSections()[this.section];
        if (!curSec || !findNodeById(curSec.model.state.roots, this.selection.anchor.nodeId)) {
          this.selection = null;
        }
      }
      this.onCheckpoint?.();
    } else {
      this.commitSnapsMutation(snaps, res.indexSectionIndex, null, currentMeta);
    }
    if (kind === 'table' && hasModelObjectIndexInSnaps(this.engine.snapshot(), 'figure')) {
      const figSnaps = this.engine.snapshot();
      const figRes = rebuildModelObjectIndexInSnaps(
        this.engine.getSections(),
        figSnaps,
        'figure',
        0,
        false,
        {
          ...options,
          measureDisplayLists: state => this.engine.measureStateDisplayLists(state, this.geometry),
        },
        id => this.uid(id),
      );
      if (figRes.found) {
        this.engine.restore(figSnaps, this.geometry);
        this.onCheckpoint?.();
      }
    }
    return {
      found: true,
      activePageIndex: this.sectionLocalToGlobalPage(res.indexSectionIndex, 0),
      count: res.entries.length,
    };
  }

  /** Resizes an existing `<img>` block in the document model by updating its style/width/height and reflowing. */
  resizeImage(nodeId: string, width: number, height: number): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      let updated = false;
      const updateNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        return nodes.map(n => {
          if (n.id === nodeId && n.kind === 'element' && n.tag === 'img') {
            updated = true;
            const styleMap = parseStyleMap(n.attributes['style'] || '');
            styleMap['width'] = `${Math.round(width)}px`;
            styleMap['height'] = `${Math.round(height)}px`;
            styleMap['max-width'] = '100%';
            const nextAttrs = {
              ...n.attributes,
              style: serializeStyleMap(styleMap),
              width: String(Math.round(width)),
              height: String(Math.round(height)),
            };
            return { ...n, attributes: nextAttrs };
          }
          if (n.kind === 'element' && getSubtreeIds(n).has(nodeId)) {
            const nextCh = updateNodes(n.children);
            return nextCh !== n.children ? { ...n, children: nextCh } : n;
          }
          return n;
        });
      };
      const nextRoots = updateNodes(sections[sIdx].model.state.roots);
      if (updated) {
        this.section = sIdx;
        return this.commitCustomState(nextRoots, this.selection, 'resize-image');
      }
    }
    return false;
  }

  /** Deletes an existing `<img>` block by nodeId from the DocumentModel, with instant Undo/Redo support. */
  alignImage(nodeId:string,align:'left'|'center'|'right'):boolean {
    for(const [index,section] of this.engine.getSections().entries()) {
      const node=findNodeById(section.model.state.roots,nodeId);
      if(node?.kind!=='element'||node.tag!=='img')continue;
      const style=parseStyleMap(node.attributes['style']||'');
      Object.assign(style,{'display':'block','text-align':align,'margin-left':align==='left'?'0':'auto','margin-right':align==='right'?'0':'auto'});
      this.section=index;
      this.commit({type:'setAttributes',nodeId,attributes:{style:serializeStyleMap(style)}},'align-image');
      this.typingAt=0;return true;
    }
    return false;
  }

  /** Inserts or updates a connected `<figcaption>` for the image identified by `nodeId` in Canvas. */
  insertImageCaption(nodeId: string, captionText = 'Figura: Descripción de la imagen'): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const target = findNodeById(sections[sIdx].model.state.roots, nodeId);
      if (target?.kind !== 'element' || target.tag !== 'img') continue;

      const textId = this.uid('cap-t');
      const captionNode: DocumentNode = {
        id: this.uid('figcaption'),
        kind: 'element',
        tag: 'figcaption',
        attributes: {
          style: 'font-size:10pt;color:#64748b;text-align:center;margin-top:4pt;font-style:italic;',
        },
        children: [{ id: textId, kind: 'text', text: captionText }],
      };

      let updated = false;
      const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const out: DocumentNode[] = [];
        for (const n of nodes) {
          if (n.kind !== 'element') {
            out.push(n);
            continue;
          }
          if (n.id === nodeId) {
            updated = true;
            out.push({
              id: this.uid('figure'),
              kind: 'element',
              tag: 'figure',
              attributes: { style: 'margin:12pt auto;text-align:center;max-width:100%;' },
              children: [n, captionNode],
            });
            continue;
          }
          if (n.tag === 'figure' && n.children.some(c => c.id === nodeId)) {
            updated = true;
            const existingIdx = n.children.findIndex(c => c.kind === 'element' && c.tag === 'figcaption');
            const nextChildren = existingIdx >= 0
              ? n.children.map((c, idx) => (idx === existingIdx ? captionNode : c))
              : [...n.children, captionNode];
            out.push({ ...n, children: nextChildren });
            continue;
          }
          if (
            n.tag === 'p' &&
            n.children.some(c => c.id === nodeId) &&
            n.children.every(c => c.id === nodeId || (c.kind === 'text' && !c.text.trim()))
          ) {
            updated = true;
            out.push({
              id: this.uid('figure'),
              kind: 'element',
              tag: 'figure',
              attributes: { style: 'margin:12pt auto;text-align:center;max-width:100%;' },
              children: [target, captionNode],
            });
            continue;
          }
          if (getSubtreeIds(n).has(nodeId)) {
            out.push({ ...n, children: rewrite(n.children) });
          } else {
            out.push(n);
          }
        }
        return out;
      };

      const nextRoots = rewrite(sections[sIdx].model.state.roots);
      if (updated) {
        this.section = sIdx;
        const nextSel: DocumentSelection = {
          anchor: { nodeId: textId, offset: 0 },
          focus: { nodeId: textId, offset: captionText.length },
        };
        return this.commitCustomState(nextRoots, nextSel, 'insert-image-caption');
      }
    }
    return false;
  }

  imageForClipboard(nodeId:string): {src:string;width:number;height:number;alt:string}|null {
    for(const section of this.engine.getSections()) {
      const node=findNodeById(section.model.state.roots,nodeId);
      if(node?.kind==='element'&&node.tag==='img') {
        const command=section.displayLists.flatMap(p=>p.commands).find(c=>c.kind==='image'&&c.nodeId===nodeId);
        return {src:node.attributes['src'],width:command?.kind==='image'?command.width:160,height:command?.kind==='image'?command.height:120,alt:node.attributes['alt']||''};
      }
    }
    return null;
  }

  pasteImage(image:{src:string;width:number;height:number;alt?:string},afterImageId?:string):boolean {
    const sections=this.engine.getSections();if(!sections.length)return false;
    let targetId=afterImageId||this.selection?.focus.nodeId;
    if(targetId){const index=sections.findIndex(s=>!!findNodeById(s.model.state.roots,targetId!));if(index>=0)this.section=index;}
    const roots=sections[this.section]?.model.state.roots;if(!roots)return false;
    const node:DocumentNode={id:this.uid('image'),kind:'element',tag:'img',attributes:{src:image.src,alt:image.alt||'',width:String(image.width),height:String(image.height),style:`width:${image.width}px;height:${image.height}px;max-width:100%`},children:[]};
    let index=targetId?roots.findIndex(root=>root.id===targetId||root.kind==='element'&&getSubtreeIds(root).has(targetId!)):-1;
    if(index<0)index=roots.length-1;
    const next=[...roots.slice(0,index+1),node,...roots.slice(index+1)];
    return this.commitCustomState(next,this.selection,'paste-image');
  }

  deleteImage(nodeId: string): boolean {
    const sections = this.engine.getSections();
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      let removed = false;
      const filterNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const filtered = nodes.filter(n => n.id !== nodeId);
        if (filtered.length !== nodes.length) {
          removed = true;
          if (!filtered.length) {
            const leafId = this.uid('empty-t');
            return [{ id: this.uid('empty-p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: leafId, kind: 'text', text: '' }] }];
          }
          return filtered;
        }
        return nodes.map(n => {
          if (n.kind !== 'element' || !getSubtreeIds(n).has(nodeId)) return n;
          return { ...n, children: filterNodes(n.children) };
        });
      };
      const nextRoots = filterNodes(sections[sIdx].model.state.roots);
      if (removed) {
        this.section = sIdx;
        const leaves = textNodes(nextRoots);
        const nextSel = leaves.length ? { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[0].id, offset: 0 } } : null;
        return this.commitCustomState(nextRoots, nextSel, 'delete-image');
      }
    }
    return false;
  }

  private isInsideRevisionTag(roots: readonly DocumentNode[], nodeId: string, kind: 'ins' | 'del'): Extract<DocumentNode, { kind: 'element' }> | undefined {
    const path = findAncestorPath(roots, nodeId);
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      if (n.kind === 'element' && (n.tag === kind || n.attributes['data-word-rev'] === kind)) {
        return n;
      }
    }
    return undefined;
  }

  private buildRevisionNode(kind: 'ins' | 'del', children: readonly DocumentNode[], revId = this.uid('rev')): Extract<DocumentNode, { kind: 'element' }> {
    const style = kind === 'ins'
      ? 'color: #15803d; text-decoration: underline;'
      : 'color: #b91c1c; text-decoration: line-through;';
    return {
      id: this.uid(kind),
      kind: 'element',
      tag: kind,
      attributes: {
        'data-word-rev': kind,
        'data-word-rev-id': revId,
        'data-word-rev-author': this.reviewAuthor || 'Usuario',
        'data-word-rev-at': String(Date.now()),
        style,
      },
      children,
    };
  }

  private markRangeAsDeleted(
    roots: readonly DocumentNode[],
    rangeStart: DocumentPosition,
    rangeEnd: DocumentPosition,
    revId = this.uid('rev'),
  ): { roots: readonly DocumentNode[]; lastAffectedLeafId: string | null } {
    const leaves = textNodes(roots);
    const ai = leaves.findIndex(n => n.id === rangeStart.nodeId);
    const bi = leaves.findIndex(n => n.id === rangeEnd.nodeId);
    if (ai < 0 || bi < 0) return { roots, lastAffectedLeafId: null };
    const forward = ai < bi || (ai === bi && rangeStart.offset <= rangeEnd.offset);
    const startPos = forward ? rangeStart : rangeEnd;
    const endPos = forward ? rangeEnd : rangeStart;
    const sIdx = forward ? ai : bi;
    const eIdx = forward ? bi : ai;
    const targetIds = new Set(leaves.slice(sIdx, eIdx + 1).map(n => n.id));
    let lastAffectedLeafId: string | null = null;

    const visit = (nodes: readonly DocumentNode[], insideIns: boolean, insideDel: boolean): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'text') {
          if (!targetIds.has(node.id)) {
            out.push(node);
            continue;
          }
          const isStart = node.id === startPos.nodeId;
          const isEnd = node.id === endPos.nodeId;
          const from = isStart ? startPos.offset : 0;
          const to = isEnd ? endPos.offset : node.text.length;
          if (from >= to) {
            out.push(node);
            continue;
          }
          if (insideDel) {
            lastAffectedLeafId = node.id;
            out.push(node);
            continue;
          }
          if (insideIns) {
            const left = node.text.slice(0, from);
            const right = node.text.slice(to);
            const remaining = left + right;
            if (remaining) {
              out.push({ ...node, text: remaining });
            }
            continue;
          }
          const leftText = node.text.slice(0, from);
          const delText = node.text.slice(from, to);
          const rightText = node.text.slice(to);
          if (leftText) out.push({ id: this.uid('txt'), kind: 'text', text: leftText });
          const delLeafId = this.uid('del-t');
          lastAffectedLeafId = delLeafId;
          out.push(this.buildRevisionNode('del', [{ id: delLeafId, kind: 'text', text: delText }], revId));
          if (rightText) out.push({ id: this.uid('txt-r'), kind: 'text', text: rightText });
          continue;
        }
        const ids = getSubtreeIds(node);
        let touches = false;
        for (const id of targetIds) {
          if (ids.has(id)) {
            touches = true;
            break;
          }
        }
        if (!touches) {
          out.push(node);
          continue;
        }
        const nextIns = insideIns || node.tag === 'ins' || node.attributes['data-word-rev'] === 'ins';
        const nextDel = insideDel || node.tag === 'del' || node.attributes['data-word-rev'] === 'del';
        const nextChildren = visit(node.children, nextIns, nextDel);
        if ((node.tag === 'ins' || node.attributes['data-word-rev'] === 'ins') && textNodes(nextChildren).every(t => !t.text)) {
          continue;
        }
        out.push({ ...node, children: nextChildren });
      }
      return out;
    };

    return { roots: visit(roots, false, false), lastAffectedLeafId };
  }

  insert(text: string): boolean {
    if (!this.selection) return false;
    const isCollapsed =
      this.selection.anchor.nodeId === this.selection.focus.nodeId &&
      this.selection.anchor.offset === this.selection.focus.offset;
    if (this.trackChangesEnabled && text.length > 0) {
      const section = this.engine.getSections()[this.section];
      if (section) {
        if (isCollapsed && this.isInsideRevisionTag(section.model.state.roots, this.selection.focus.nodeId, 'ins')) {
          this.commit({ type: 'replaceText', selection: this.selection, text }, 'insert');
          return true;
        }
        let workingRoots = section.model.state.roots;
        let insertTarget = this.selection.focus;
        if (!isCollapsed) {
          const marked = this.markRangeAsDeleted(workingRoots, this.selection.anchor, this.selection.focus);
          workingRoots = marked.roots;
          const afterLeaf = marked.lastAffectedLeafId || insertTarget.nodeId;
          const leavesAfter = textNodes(workingRoots);
          const idxAfter = leavesAfter.findIndex(n => n.id === afterLeaf);
          const newInsLeafId = this.uid('ins-t');
          const insNode = this.buildRevisionNode('ins', [{ id: newInsLeafId, kind: 'text', text }]);
          const insertAfterLeaf = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
            const out: DocumentNode[] = [];
            for (const n of nodes) {
              if (n.kind === 'text' && n.id === afterLeaf) {
                out.push(n, insNode);
              } else if (n.kind === 'element') {
                if (n.children.some(c => c.kind === 'text' && c.id === afterLeaf) && (n.tag === 'del' || n.attributes['data-word-rev'] === 'del')) {
                  out.push(n, insNode);
                } else {
                  out.push({ ...n, children: insertAfterLeaf(n.children) });
                }
              } else {
                out.push(n);
              }
            }
            return out;
          };
          if (idxAfter >= 0) {
            const nextRoots = insertAfterLeaf(workingRoots);
            const nextPos: DocumentPosition = { nodeId: newInsLeafId, offset: text.length };
            return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'track-insert');
          }
        }
        const focus = insertTarget;
        const newInsLeafId = this.uid('ins-t');
        const injectInsLeaf = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
          let changed = false;
          const out: DocumentNode[] = [];
          for (const node of nodes) {
            if (node.kind === 'text') {
              if (node.id !== focus.nodeId) {
                out.push(node);
                continue;
              }
              changed = true;
              const leftText = node.text.slice(0, focus.offset);
              const rightText = node.text.slice(focus.offset);
              if (leftText || !rightText) {
                out.push({ id: node.id, kind: 'text', text: leftText });
              }
              out.push(this.buildRevisionNode('ins', [{ id: newInsLeafId, kind: 'text', text }]));
              if (rightText) {
                out.push({ id: leftText ? this.uid('txt-r') : node.id, kind: 'text', text: rightText });
              }
              continue;
            }
            if (!getSubtreeIds(node).has(focus.nodeId)) {
              out.push(node);
              continue;
            }
            const nextCh = injectInsLeaf(node.children);
            if (nextCh !== node.children) {
              changed = true;
              out.push({ ...node, children: nextCh });
            } else {
              out.push(node);
            }
          }
          return changed ? out : nodes;
        };
        const nextRoots = injectInsLeaf(workingRoots);
        if (nextRoots !== workingRoots) {
          const nextPos: DocumentPosition = { nodeId: newInsLeafId, offset: text.length };
          return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'track-insert');
        }
      }
    }
    if (isCollapsed && this.pendingInlineStyle && text.length > 0) {
      const section = this.engine.getSections()[this.section];
      if (section) {
        const focus = this.selection.focus;
        const spanStyle = serializeStyleMap(this.pendingInlineStyle);
        this.pendingInlineStyle = null;
        const newLeafId = this.uid('styled-t');
        const injectStyledLeaf = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
          let changed = false;
          const out: DocumentNode[] = [];
          for (const node of nodes) {
            if (node.kind === 'text') {
              if (node.id !== focus.nodeId) {
                out.push(node);
                continue;
              }
              changed = true;
              const leftText = node.text.slice(0, focus.offset);
              const rightText = node.text.slice(focus.offset);
              if (leftText || !rightText) {
                out.push({ id: node.id, kind: 'text', text: leftText });
              }
              out.push({
                id: this.uid('span'),
                kind: 'element',
                tag: 'span',
                attributes: { style: spanStyle },
                children: [{ id: newLeafId, kind: 'text', text }],
              });
              if (rightText) {
                out.push({ id: leftText ? this.uid('txt-r') : node.id, kind: 'text', text: rightText });
              }
              continue;
            }
            if (!getSubtreeIds(node).has(focus.nodeId)) {
              out.push(node);
              continue;
            }
            const nextCh = injectStyledLeaf(node.children);
            if (nextCh !== node.children) {
              changed = true;
              out.push({ ...node, children: nextCh });
            } else {
              out.push(node);
            }
          }
          return changed ? out : nodes;
        };
        const nextRoots = injectStyledLeaf(section.model.state.roots);
        if (nextRoots !== section.model.state.roots) {
          const nextPos: DocumentPosition = { nodeId: newLeafId, offset: text.length };
          return this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'insert');
        }
      }
    }
    this.commit({ type: 'replaceText', selection: this.selection, text }, 'insert');
    return true;
  }

  private isEditableBlockEmpty(node: DocumentNode): boolean {
    const editableBlocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
    const inlineEmptyTags = new Set(['br', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font', 'sub', 'sup', 'a', 'code', 'mark', 'small', 'big', 'del', 'ins']);
    const check = (n: DocumentNode): boolean =>
      n.kind === 'text'
        ? n.text.length === 0
        : (editableBlocks.has(n.tag) || inlineEmptyTags.has(n.tag)) && n.children.every(check);
    return check(node);
  }

  enter(): boolean {
    if (!this.selection) return false;
    if (this.selection.anchor.nodeId !== this.selection.focus.nodeId || this.selection.anchor.offset !== this.selection.focus.offset) return false;
    const roots = this.engine.getSections()[this.section].model.state.roots;
    const path = findAncestorPath(roots, this.selection.focus.nodeId);
    const li = [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'li');
    const list = li ? [...path].reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && (n.tag === 'ul' || n.tag === 'ol')) : null;
    if (li && list && this.isEditableBlockEmpty(li)) {
      const unwrapped = this.unwrapSingleListItem(roots, list.id, li.id);
      if (unwrapped) {
        const pos = { nodeId: unwrapped.caretNodeId, offset: 0 };
        return this.commitCustomState(unwrapped.nextRoots, { anchor: pos, focus: pos }, 'exit-list');
      }
    }
    this.typingAt = 0;
    this.commit({ type: 'splitBlock', position: this.selection.focus }, 'split');
    this.typingAt = 0;
    return true;
  }

  delete(backward: boolean): boolean {
    if (!this.selection) return false;
    const { anchor, focus } = this.selection;
    if (this.trackChangesEnabled) {
      const roots = this.engine.getSections()[this.section].model.state.roots;
      if (anchor.nodeId !== focus.nodeId || anchor.offset !== focus.offset) {
        const insAnchor = this.isInsideRevisionTag(roots, anchor.nodeId, 'ins');
        const insFocus = this.isInsideRevisionTag(roots, focus.nodeId, 'ins');
        if (insAnchor && insFocus && insAnchor.id === insFocus.id) {
          this.commit({ type: 'replaceText', selection: this.selection, text: '' }, 'delete');
          return true;
        }
        const marked = this.markRangeAsDeleted(roots, anchor, focus);
        const leavesAfter = textNodes(marked.roots);
        const caretLeaf = (marked.lastAffectedLeafId ? leavesAfter.find(n => n.id === marked.lastAffectedLeafId) : null) || leavesAfter[0];
        const nextPos = caretLeaf ? { nodeId: caretLeaf.id, offset: caretLeaf.text.length } : anchor;
        return this.commitCustomState(marked.roots, { anchor: nextPos, focus: nextPos }, 'track-delete');
      }
      const leaves = textNodes(roots);
      const index = leaves.findIndex(n => n.id === focus.nodeId);
      const leaf = leaves[index];
      if (leaf) {
        const insideIns = this.isInsideRevisionTag(roots, leaf.id, 'ins');
        const boundaryInIns = backward ? focus.offset === 0 : focus.offset === leaf.text.length;
        if (insideIns && !boundaryInIns) {
          const segments = SESSION_SEGMENTER.segment(leaf.text);
          const part = segments.containing(backward ? focus.offset - 1 : focus.offset)!;
          this.commit(
            {
              type: 'replaceText',
              selection: {
                anchor: { nodeId: leaf.id, offset: part.index },
                focus: { nodeId: leaf.id, offset: part.index + part.segment.length },
              },
              text: '',
            },
            backward ? 'backspace' : 'delete',
          );
          return true;
        }
        if (this.isInsideRevisionTag(roots, leaf.id, 'del')) {
          const other = leaves[index + (backward ? -1 : 1)];
          if (!other) return false;
          const pos = { nodeId: other.id, offset: backward ? other.text.length : 0 };
          this.setSelection(this.section, { anchor: pos, focus: pos });
          return true;
        }
        if (!(backward ? focus.offset === 0 : focus.offset === leaf.text.length)) {
          const segments = SESSION_SEGMENTER.segment(leaf.text);
          const part = segments.containing(backward ? focus.offset - 1 : focus.offset)!;
          const delStart: DocumentPosition = { nodeId: leaf.id, offset: part.index };
          const delEnd: DocumentPosition = { nodeId: leaf.id, offset: part.index + part.segment.length };
          const marked = this.markRangeAsDeleted(roots, delStart, delEnd);
          const leavesAfter = textNodes(marked.roots);
          const delIdx = marked.lastAffectedLeafId ? leavesAfter.findIndex(n => n.id === marked.lastAffectedLeafId) : -1;
          let nextPos: DocumentPosition = delStart;
          if (delIdx >= 0) {
            if (backward) {
              const prevLeaf = leavesAfter[delIdx - 1];
              nextPos = prevLeaf ? { nodeId: prevLeaf.id, offset: prevLeaf.text.length } : { nodeId: leavesAfter[delIdx].id, offset: 0 };
            } else {
              nextPos = { nodeId: leavesAfter[delIdx].id, offset: leavesAfter[delIdx].text.length };
            }
          }
          return this.commitCustomState(marked.roots, { anchor: nextPos, focus: nextPos }, backward ? 'track-backspace' : 'track-delete');
        }
      }
    }
    if (anchor.nodeId !== focus.nodeId || anchor.offset !== focus.offset) {
      const beforeRoots = this.engine.getSections()[this.section].model.state.roots;
      const beforeLeaves = textNodes(beforeRoots);
      let ai = beforeLeaves.findIndex(n => n.id === anchor.nodeId);
      let bi = beforeLeaves.findIndex(n => n.id === focus.nodeId);
      if (ai > bi) [ai, bi] = [bi, ai];
      const touchedLiIds = new Set<string>();
      if (ai >= 0 && bi >= 0) {
        for (let i = ai; i <= bi; i++) {
          const p = findAncestorPath(beforeRoots, beforeLeaves[i].id);
          const li = [...p].reverse().find(n => n.kind === 'element' && n.tag === 'li');
          if (li) touchedLiIds.add(li.id);
        }
      }
      this.commit({ type: 'replaceText', selection: this.selection, text: '' }, 'delete');
      if (touchedLiIds.size > 0 && this.selection) {
        const afterRoots = this.engine.getSections()[this.section].model.state.roots;
        const caretPath = findAncestorPath(afterRoots, this.selection.focus.nodeId);
        const caretLi = [...caretPath].reverse().find(n => n.kind === 'element' && n.tag === 'li');
        let cleaned = false;
        const pruneEmptyLists = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
          const out: DocumentNode[] = [];
          for (const node of nodes) {
            if (node.kind === 'element' && (node.tag === 'ul' || node.tag === 'ol')) {
              const nextChildren = node.children.filter(c => {
                if (c.kind === 'element' && c.tag === 'li' && touchedLiIds.has(c.id) && c.id !== caretLi?.id && this.isEditableBlockEmpty(c)) {
                  cleaned = true;
                  return false;
                }
                return true;
              });
              if (!nextChildren.some(c => c.kind === 'element')) {
                cleaned = true;
                continue;
              }
              out.push(nextChildren.length !== node.children.length ? { ...node, children: nextChildren } : node);
              continue;
            }
            if (node.kind === 'element' && node.children.length) {
              const nextChildren = pruneEmptyLists(node.children);
              out.push(nextChildren !== node.children ? { ...node, children: nextChildren } : node);
            } else {
              out.push(node);
            }
          }
          return out;
        };
        const pruned = pruneEmptyLists(afterRoots);
        if (cleaned) {
          this.commitCustomState(pruned, this.selection, 'delete');
        }
      }
      return true;
    }
    const roots = this.engine.getSections()[this.section].model.state.roots, leaves = textNodes(roots);
    const index = leaves.findIndex(n => n.id === focus.nodeId), leaf = leaves[index];
    const path=findAncestorPath(roots,focus.nodeId);
    const editableBlocks=new Set(['p','h1','h2','h3','h4','h5','h6','li','blockquote']);
    const isWhitespaceNode = (n: DocumentNode): boolean => n.kind === 'text' && !n.text.trim();
    const rawBlock = path.slice().reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && editableBlocks.has(n.tag));
    const enclosingLi = path.slice().reverse().find((n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && n.tag === 'li');
    const block =
      enclosingLi &&
      rawBlock &&
      rawBlock.id !== enclosingLi.id &&
      (this.isEditableBlockEmpty(enclosingLi) || enclosingLi.children.filter(c => !isWhitespaceNode(c)).length === 1)
        ? enclosingLi
        : rawBlock;
    const empty = (node: DocumentNode): boolean => this.isEditableBlockEmpty(node);
    if(block?.kind==='element') {
      const parentIndex=path.findIndex(n=>n.id===block.id)-1;
      const parent=parentIndex>=0?path[parentIndex]:null;
      const siblings=parent?.kind==='element'?parent.children:roots;
      const meaningfulSiblings = siblings.filter(n => !isWhitespaceNode(n));
      const at = meaningfulSiblings.findIndex(n => n.id === block.id);
      const boundary=backward?focus.offset===0:!leaf||focus.offset===leaf.text.length;
      const neighbor=meaningfulSiblings[at+(backward?-1:1)];
      const removeEmpty=(target:DocumentNode,caretTarget:DocumentNode):boolean=>{
        const texts=textNodes([caretTarget]);const text=backward?texts.at(-1):texts[0];
        const pos={nodeId:text?.id||caretTarget.id,offset:backward?(text?.text.length||0):0};
        this.typingAt=0;this.commit({type:'removeNode',nodeId:target.id,selection:{anchor:pos,focus:pos}},'remove-empty-block');return true;
      };
      // Handle list item deletion/unwrapping so users can always delete any item or exit a list.
      if (block.tag === 'li' && parent?.kind === 'element' && (parent.tag === 'ul' || parent.tag === 'ol')) {
        if (empty(block)) {
          if (backward && neighbor) {
            return removeEmpty(block, neighbor);
          }
          if (!backward && neighbor) {
            return removeEmpty(block, neighbor);
          }
          if (!backward && meaningfulSiblings.length > 1) {
            const prev = meaningfulSiblings[at - 1];
            if (prev) return removeEmpty(block, prev);
          }
          const unwrapped = this.unwrapSingleListItem(roots, parent.id, block.id);
          if (unwrapped) {
            const pos = { nodeId: unwrapped.caretNodeId, offset: 0 };
            return this.commitCustomState(unwrapped.nextRoots, { anchor: pos, focus: pos }, 'exit-list');
          }
        }
        if (backward && boundary && !neighbor) {
          const unwrapped = this.unwrapSingleListItem(roots, parent.id, block.id);
          if (unwrapped) {
            const pos = { nodeId: unwrapped.caretNodeId, offset: 0 };
            return this.commitCustomState(unwrapped.nextRoots, { anchor: pos, focus: pos }, 'exit-list');
          }
        }
        if (boundary && neighbor?.kind === 'element' && neighbor.tag === 'li') {
          this.typingAt = 0;
          this.commit({ type: 'mergeBlocks', leftBlockId: backward ? neighbor.id : block.id, rightBlockId: backward ? block.id : neighbor.id }, 'merge');
          return true;
        }
      }
      // Empty HTML paragraphs often have only <br>, so textNodes cannot locate them.
      // Remove the actual block rather than searching through an adjacent table/image.
      if(empty(block)&&meaningfulSiblings.length>1) {
        const target=neighbor||meaningfulSiblings[at+(backward?1:-1)];
        if(target)return removeEmpty(block,target);
      }
      if(boundary&&neighbor?.kind==='element'&&editableBlocks.has(neighbor.tag)&&empty(neighbor))return removeEmpty(neighbor,block);
      // Merge a paragraph right after a list into the list's last <li> on Backspace at offset 0.
      if (backward && boundary && block.tag !== 'li' && neighbor?.kind === 'element' && (neighbor.tag === 'ul' || neighbor.tag === 'ol')) {
        const listItems = neighbor.children.filter((c): c is Extract<DocumentNode, { kind: 'element' }> => c.kind === 'element' && c.tag === 'li');
        const lastLi = listItems.at(-1);
        if (lastLi) {
          const lastLiTexts = textNodes([lastLi]);
          const joinNode = lastLiTexts.at(-1);
          const joinOffset = joinNode?.text.length ?? 0;
          const appended = block.children.filter(c => !(c.kind === 'element' && c.tag === 'br'));
          const nextRoots = roots.reduce<DocumentNode[]>((acc, n) => {
            if (n.id === block.id) return acc;
            if (n.id === neighbor.id && n.kind === 'element') {
              acc.push({
                ...n,
                children: n.children.map(c => c.id === lastLi.id && c.kind === 'element' ? { ...c, children: [...c.children, ...appended] } : c),
              });
              return acc;
            }
            acc.push(n);
            return acc;
          }, []);
          const targetLeaf = joinNode ?? textNodes(appended)[0];
          if (targetLeaf) {
            const pos = { nodeId: targetLeaf.id, offset: joinNode ? joinOffset : 0 };
            return this.commitCustomState(nextRoots, { anchor: pos, focus: pos }, 'merge');
          }
        }
      }
    }
    if (!leaf) return false;
    const blockOf = (id: string, nodes: readonly DocumentNode[], parent: DocumentNode | null = null): DocumentNode | null => {
      for (const n of nodes) {
        if (n.id === id) return parent;
        if (n.kind === 'element') {
          const next = n.tag === 'li'
            ? n
            : (parent?.kind === 'element' && parent.tag === 'li' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(n.tag))
              ? parent
              : ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(n.tag) ? n : parent;
          const found = blockOf(id, n.children, next);
          if (found) return found;
        }
      }
      return null;
    };
    if (backward ? focus.offset === 0 : focus.offset === leaf.text.length) {
      const other = leaves[index + (backward ? -1 : 1)];
      if (!other) {
        const sections=this.engine.getSections(),next=this.section+(backward?-1:1);
        if(next<0||next>=sections.length)return false;
        const right=backward?this.section:next;
        if(sections[right].breakBefore!=='manual')return false;
        const before = this.snapshot();
        const snaps = this.engine.snapshot();
        const leftCount = textNodes(sections[right - 1].model.state.roots).length;
        const mergedSnap: EngineSectionSnapshot = {
          ...snaps[right - 1],
          state: {
            ...snaps[right - 1].state,
            revision: snaps[right - 1].state.revision + 1,
            roots: [...snaps[right - 1].state.roots, ...snaps[right].state.roots],
          },
        };
        snaps.splice(right - 1, 2, mergedSnap);
        this.engine.restore(snaps, this.geometry);
        this.past.push(before);if(this.past.length>50)this.past.shift();this.future=[];
        this.section=right-1;
        const merged=textNodes(this.engine.getSections()[this.section].model.state.roots);
        const target=merged[Math.max(0,leftCount-1)]||merged[0];
        const position=target?{nodeId:target.id,offset:target.text.length}:null;
        this.selection=position?{anchor:position,focus:position}:null;
        this.engine.setSelection(this.section,this.selection);this.typingAt=0;this.onCheckpoint?.();return true;
      }
      const block = blockOf(leaf.id, roots), adjacent = blockOf(other.id, roots);
      if (block && adjacent && block.id !== adjacent.id) {
        const leftPath=findAncestorPath(roots,block.id),rightPath=findAncestorPath(roots,adjacent.id);
        const lp=leftPath.at(-2),rp=rightPath.at(-2);
        if(lp?.id!==rp?.id) {
          const leftCell = leftPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
          const rightCell = rightPath.find(n => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'));
          if (leftCell?.id !== rightCell?.id) return false;
          if (block.kind !== 'element' || adjacent.kind !== 'element') return false;
          const leftBlock = backward ? adjacent : block;
          const rightBlock = backward ? block : adjacent;
          const rightInline = (rightBlock.tag === 'li' ? this.unwrapListItemChildren(rightBlock) : rightBlock.children)
            .filter(c => !(c.kind === 'element' && c.tag === 'br'));
          const leftLeaves = textNodes([leftBlock]);
          const joinNode = leftLeaves.at(-1);
          const joinOffset = joinNode?.text.length ?? 0;
          const mergeCross = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
            const out: DocumentNode[] = [];
            for (const n of nodes) {
              if (n.id === rightBlock.id) continue;
              if (n.kind === 'element' && n.id === leftBlock.id) {
                const keptLeft = n.children.filter(c => !(c.kind === 'element' && c.tag === 'br'));
                const mergedChildren = [...keptLeft, ...rightInline];
                out.push({
                  ...n,
                  children: mergedChildren.length ? mergedChildren : [{ id: this.uid('txt'), kind: 'text', text: '' }],
                });
                continue;
              }
              if (n.kind === 'element' && n.children.length) {
                const nextChildren = mergeCross(n.children);
                if ((n.tag === 'ul' || n.tag === 'ol') && !nextChildren.some(c => c.kind === 'element')) {
                  continue;
                }
                out.push(nextChildren !== n.children ? { ...n, children: nextChildren } : n);
                continue;
              }
              out.push(n);
            }
            return out;
          };
          const nextRoots = mergeCross(roots);
          const caretLeaf = joinNode ?? textNodes(rightInline)[0];
          const pos = caretLeaf ? { nodeId: caretLeaf.id, offset: joinNode ? joinOffset : 0 } : focus;
          return this.commitCustomState(nextRoots, { anchor: pos, focus: pos }, 'merge');
        }
        const siblings=(lp?.kind==='element'?lp.children:roots).filter(n => !isWhitespaceNode(n));
        if(Math.abs(siblings.findIndex(n=>n.id===block.id)-siblings.findIndex(n=>n.id===adjacent.id))!==1)return false;
        this.typingAt = 0;
        this.commit({ type: 'mergeBlocks', leftBlockId: backward ? adjacent.id : block.id, rightBlockId: backward ? block.id : adjacent.id }, 'merge');
        return true;
      }
      const pos = { nodeId: other.id, offset: backward ? other.text.length : 0 };
      this.selection = { anchor: pos, focus: pos };
      return this.delete(backward);
    }
    const segments = SESSION_SEGMENTER.segment(leaf.text);
    const part = segments.containing(backward ? focus.offset - 1 : focus.offset)!;
    this.commit(
      {
        type: 'replaceText',
        selection: {
          anchor: { nodeId: leaf.id, offset: part.index },
          focus: { nodeId: leaf.id, offset: part.index + part.segment.length },
        },
        text: '',
      },
      backward ? 'backspace' : 'delete',
    );
    return true;
  }

  moveHorizontal(direction: -1 | 1, extend = false): void {
    if (!this.selection) return;
    const leaves = textNodes(this.engine.getSections()[this.section].model.state.roots), p = this.selection.focus;
    const index = leaves.findIndex(n => n.id === p.nodeId), leaf = leaves[index];
    if (!leaf) return;
    let pos: DocumentPosition;
    if (direction < 0 && p.offset > 0) pos = { ...p, offset: SESSION_SEGMENTER.segment(leaf.text).containing(p.offset - 1)!.index };
    else if (direction > 0 && p.offset < leaf.text.length) {
      const s = SESSION_SEGMENTER.segment(leaf.text).containing(p.offset)!;
      pos = { ...p, offset: s.index + s.segment.length };
    } else {
      const next = leaves[index + direction];
      if (!next) return;
      pos = { nodeId: next.id, offset: direction < 0 ? next.text.length : 0 };
    }
    this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
  }

  /** Moves the caret by word (Ctrl+Left / Ctrl+Right), respecting block boundaries and formatted inline runs. */
  moveWord(direction: -1 | 1, extend = false): void {
    if (!this.selection) return;
    const roots = this.engine.getSections()[this.section].model.state.roots;
    const allLeaves = textNodes(roots);
    const p = this.selection.focus;
    const globalIdx = allLeaves.findIndex(n => n.id === p.nodeId);
    if (globalIdx < 0) return;

    const path = findAncestorPath(roots, p.nodeId);
    const block = [...path].reverse().find(n => n.kind === 'element' && BLOCK_TAGS.has(n.tag));
    const blockLeaves = block ? textNodes([block]) : [allLeaves[globalIdx]];

    let fullText = '';
    const spans: { nodeId: string; start: number; end: number }[] = [];
    let cursor = 0;
    for (const leaf of blockLeaves) {
      const start = fullText.length;
      if (leaf.id === p.nodeId) cursor = start + p.offset;
      fullText += leaf.text;
      spans.push({ nodeId: leaf.id, start, end: fullText.length });
    }

    const toPosition = (offset: number, preferNextSpan: boolean): DocumentPosition => {
      for (const span of spans) {
        if (preferNextSpan ? offset < span.end : offset <= span.end) {
          return { nodeId: span.nodeId, offset: Math.max(0, offset - span.start) };
        }
      }
      const last = blockLeaves[blockLeaves.length - 1];
      return { nodeId: last.id, offset: last.text.length };
    };

    const isSpace = (ch: string) => /\s/.test(ch);
    const isWord = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);

    if (direction > 0) {
      if (cursor >= fullText.length) {
        const lastIdx = allLeaves.findIndex(n => n.id === blockLeaves[blockLeaves.length - 1].id);
        const nextLeaf = allLeaves[lastIdx + 1];
        if (!nextLeaf) return;
        const pos = { nodeId: nextLeaf.id, offset: 0 };
        this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
        return;
      }
      let i = cursor;
      while (i < fullText.length && isSpace(fullText[i])) i++;
      if (i < fullText.length) {
        const word = isWord(fullText[i]);
        while (i < fullText.length && !isSpace(fullText[i]) && isWord(fullText[i]) === word) i++;
      }
      const pos = toPosition(i, false);
      this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
      return;
    }

    if (cursor <= 0) {
      const firstIdx = allLeaves.findIndex(n => n.id === blockLeaves[0].id);
      const prevLeaf = allLeaves[firstIdx - 1];
      if (!prevLeaf) return;
      const pos = { nodeId: prevLeaf.id, offset: prevLeaf.text.length };
      this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
      return;
    }
    let i = cursor;
    while (i > 0 && isSpace(fullText[i - 1])) i--;
    if (i > 0) {
      const word = isWord(fullText[i - 1]);
      while (i > 0 && !isSpace(fullText[i - 1]) && isWord(fullText[i - 1]) === word) i--;
    }
    const pos = toPosition(i, true);
    this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
  }

  /** Moves the caret to the start (Home / Fn+Left) or end (End / Fn+Right) of the current visual line. */
  moveLineBoundary(toEnd: boolean, extend = false): void {
    if (!this.selection) return;
    const focus = this.selection.focus;
    for (const page of this.displayLists) {
      const caret = caretForPosition(page, focus);
      if (!caret) continue;
      const caretMid = caret.top + caret.height / 2;
      const lineCmds = page.commands.filter(
        (c): c is Extract<typeof c, { kind: 'text' }> & { source: NonNullable<Extract<typeof c, { kind: 'text' }>['source']> } =>
          c.kind === 'text' &&
          !!c.source &&
          caretMid >= c.source.top - 1 &&
          caretMid <= c.source.top + c.source.height + 1,
      );
      if (lineCmds.length) {
        lineCmds.sort((a, b) => a.x - b.x);
        const pos = toEnd ? lineCmds[lineCmds.length - 1].source.end : lineCmds[0].source.start;
        this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
        return;
      }
    }
    // Fallback to current block start/end when visual line cannot be resolved
    const roots = this.engine.getSections()[this.section].model.state.roots;
    const path = findAncestorPath(roots, focus.nodeId);
    const block = [...path].reverse().find(n => n.kind === 'element' && BLOCK_TAGS.has(n.tag));
    const leaves = block ? textNodes([block]) : [];
    if (!leaves.length) return;
    const target = toEnd ? leaves[leaves.length - 1] : leaves[0];
    const pos = { nodeId: target.id, offset: toEnd ? target.text.length : 0 };
    this.setSelection(this.section, { anchor: extend ? this.selection.anchor : pos, focus: pos });
  }

  selectAll(): void {
    const leaves = textNodes(this.engine.getSections()[this.section].model.state.roots);
    if (!leaves.length) return;
    this.setSelection(this.section, {
      anchor: { nodeId: leaves[0].id, offset: 0 },
      focus: { nodeId: leaves.at(-1)!.id, offset: leaves.at(-1)!.text.length },
    });
  }

  selectedText(): string {
    if (!this.selection) return '';
    const leaves = textNodes(this.engine.getSections()[this.section].model.state.roots);
    let a = this.selection.anchor, b = this.selection.focus, ai = leaves.findIndex(n => n.id === a.nodeId), bi = leaves.findIndex(n => n.id === b.nodeId);
    if (ai > bi || (ai === bi && a.offset > b.offset)) {
      [a, b] = [b, a];
      [ai, bi] = [bi, ai];
    }
    if (ai < 0 || bi < 0) return '';
    return leaves
      .slice(ai, bi + 1)
      .map((n, i) => n.text.slice(i === 0 ? a.offset : 0, ai + i === bi ? b.offset : undefined))
      .join('');
  }

  /** Serializes the current Canvas selection as HTML preserving inline styles, headings, and lists. */
  selectedHtml(): string {
    if (!this.selection) return '';
    const roots = this.engine.getSections()[this.section]?.model.state.roots;
    if (!roots?.length) return '';
    const leaves = textNodes(roots);
    let a = this.selection.anchor;
    let b = this.selection.focus;
    let ai = leaves.findIndex(n => n.id === a.nodeId);
    let bi = leaves.findIndex(n => n.id === b.nodeId);
    if (ai < 0 || bi < 0) return '';
    if (ai > bi || (ai === bi && a.offset > b.offset)) {
      [a, b] = [b, a];
      [ai, bi] = [bi, ai];
    }
    if (ai === bi && a.offset === b.offset) return '';

    const selectedSliceById = new Map<string, string>();
    for (let i = ai; i <= bi; i++) {
      const leaf = leaves[i];
      const start = i === ai ? a.offset : 0;
      const end = i === bi ? b.offset : leaf.text.length;
      const slice = leaf.text.slice(start, end);
      if (slice) selectedSliceById.set(leaf.id, slice);
    }
    if (!selectedSliceById.size) return '';

    const trimToSelection = (node: DocumentNode): DocumentNode | null => {
      if (node.kind === 'text') {
        const slice = selectedSliceById.get(node.id);
        return slice !== undefined ? { ...node, text: slice } : null;
      }
      const nextChildren = node.children.map(trimToSelection).filter((c): c is DocumentNode => c !== null);
      if (!nextChildren.length) return null;
      return { ...node, children: nextChildren };
    };

    const clipped = roots.map(trimToSelection).filter((n): n is DocumentNode => n !== null);
    return serializeDocumentNodes(clipped);
  }

  /** Pastes sanitized rich HTML at the current caret/selection in one undoable Canvas transaction. */
  pasteHtml(html: string): boolean {
    const trimmed = html.trim();
    if (!trimmed) return false;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return false;

    const parsed = htmlToDocumentState(trimmed);
    const reId = (node: DocumentNode): DocumentNode =>
      node.kind === 'text'
        ? { ...node, id: this.uid('t') }
        : { ...node, id: this.uid(node.tag), children: node.children.map(reId) };
    const insertedRoots = parsed.roots.map(reId);
    if (!insertedRoots.length) return false;

    // 1) Si hay selección no colapsada, limpiar primero los caracteres seleccionados sin crear doble snapshot
    let baseRoots = sec.model.state.roots;
    let caretPos: DocumentPosition | null = this.selection ? { ...this.selection.anchor } : null;

    if (
      this.selection &&
      (this.selection.anchor.nodeId !== this.selection.focus.nodeId ||
        this.selection.anchor.offset !== this.selection.focus.offset)
    ) {
      const leaves = textNodes(baseRoots);
      let a = this.selection.anchor;
      let b = this.selection.focus;
      let ai = leaves.findIndex(n => n.id === a.nodeId);
      let bi = leaves.findIndex(n => n.id === b.nodeId);
      if (ai >= 0 && bi >= 0) {
        if (ai > bi || (ai === bi && a.offset > b.offset)) {
          [a, b] = [b, a];
          [ai, bi] = [bi, ai];
        }
        const replaceMap = new Map<string, string>();
        for (let i = ai; i <= bi; i++) {
          const leaf = leaves[i];
          if (i === ai && i === bi) {
            replaceMap.set(leaf.id, leaf.text.slice(0, a.offset) + leaf.text.slice(b.offset));
          } else if (i === ai) {
            replaceMap.set(leaf.id, leaf.text.slice(0, a.offset));
          } else if (i === bi) {
            replaceMap.set(leaf.id, leaf.text.slice(b.offset));
          } else {
            replaceMap.set(leaf.id, '');
          }
        }
        const stripSelected = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
          nodes.map(n =>
            n.kind === 'text'
              ? replaceMap.has(n.id)
                ? { ...n, text: replaceMap.get(n.id)! }
                : n
              : { ...n, children: stripSelected(n.children) },
          );
        baseRoots = stripSelected(baseRoots);
        caretPos = { nodeId: a.nodeId, offset: a.offset };
      }
    }

    const blockLevelTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'hr']);
    const isSingleInlineOrParagraph =
      insertedRoots.length === 1 &&
      (insertedRoots[0].kind === 'text' ||
        (insertedRoots[0].kind === 'element' &&
          !blockLevelTags.has(insertedRoots[0].tag) &&
          (insertedRoots[0].tag === 'p' ? !insertedRoots[0].attributes['style'] : true)));

    const extractInline = (nodes: readonly DocumentNode[]): DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'text') out.push(n);
        else if (n.tag === 'p' || n.tag === 'div') out.push(...n.children);
        else out.push(n);
      }
      return out;
    };

    // 2) Pegado inline dentro del nodo de texto actual cuando es un fragmento inline
    if (isSingleInlineOrParagraph && caretPos) {
      const inlineNodes = extractInline(insertedRoots);
      if (inlineNodes.length) {
        let insertedInline = false;
        const insertAtLeaf = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
          const out: DocumentNode[] = [];
          for (const node of nodes) {
            if (node.kind === 'text' && node.id === caretPos!.nodeId && !insertedInline) {
              const beforeText = node.text.slice(0, caretPos!.offset);
              const afterText = node.text.slice(caretPos!.offset);
              if (beforeText) out.push({ id: this.uid('t'), kind: 'text', text: beforeText });
              out.push(...inlineNodes);
              if (afterText) out.push({ id: this.uid('t'), kind: 'text', text: afterText });
              insertedInline = true;
            } else if (node.kind === 'element') {
              out.push({ ...node, children: insertAtLeaf(node.children) });
            } else {
              out.push(node);
            }
          }
          return out;
        };
        const nextRoots = insertAtLeaf(baseRoots);
        if (insertedInline) {
          const leaves = textNodes(inlineNodes);
          const lastLeaf = leaves[leaves.length - 1];
          const nextSel: DocumentSelection | null = lastLeaf
            ? {
                anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
                focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
              }
            : { anchor: caretPos, focus: caretPos };
          return this.commitCustomState(nextRoots, nextSel, 'paste-html');
        }
      }
    }

    // 3) Pegado de bloques (títulos, múltiples párrafos, listas, citas): reemplazar bloque vacío o insertar después
    const anchorPath = caretPos ? findAncestorPath(baseRoots, caretPos.nodeId) ?? [] : [];
    const activeCell = [...anchorPath].reverse().find(
      (n): n is Extract<DocumentNode, { kind: 'element' }> => n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'),
    );
    const targetBlock = [...anchorPath].reverse().find(
      n => n.kind === 'element' && (BLOCK_TAGS.has(n.tag) || n.tag === 'div'),
    );
    const targetBlockInCell = activeCell && targetBlock && getSubtreeIds(activeCell).has(targetBlock.id);
    const targetBlockId = activeCell ? (targetBlockInCell ? targetBlock!.id : undefined) : targetBlock?.id;
    const hasMedia = (node: DocumentNode): boolean =>
      node.kind === 'element' &&
      (['img', 'svg', 'table'].includes(node.tag) || node.children.some(hasMedia));

    // If caret is directly inside an empty or non-<p> table cell, place pasted nodes inside that cell instead of after the table
    if (activeCell && !targetBlockInCell) {
      const cellEmpty = textNodes([activeCell]).every(t => !t.text.trim()) && !hasMedia(activeCell);
      const cellBlocks: DocumentNode[] = insertedRoots.map(n =>
        n.kind === 'text'
          ? { id: this.uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [n] }
          : n,
      );
      const rewriteCell = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(n => {
          if (n.kind !== 'element') return n;
          if (n.id === activeCell.id) {
            return { ...n, children: cellEmpty ? cellBlocks : [...n.children, ...cellBlocks] };
          }
          if (getSubtreeIds(n).has(activeCell.id)) {
            return { ...n, children: rewriteCell(n.children) };
          }
          return n;
        });
      const nextRoots = rewriteCell(baseRoots);
      const leaves = textNodes(cellBlocks);
      const lastLeaf = leaves[leaves.length - 1];
      const nextSel: DocumentSelection | null = lastLeaf
        ? { anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length }, focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length } }
        : caretPos
          ? { anchor: caretPos, focus: caretPos }
          : null;
      return this.commitCustomState(nextRoots, nextSel, 'paste-html');
    }

    const targetBlockEmpty =
      !!targetBlock &&
      textNodes([targetBlock]).every(t => !t.text.trim()) &&
      !hasMedia(targetBlock);

    const extractListItems = (nodes: readonly DocumentNode[]): DocumentNode[] => {
      const items: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'element' && (n.tag === 'ul' || n.tag === 'ol')) {
          for (const c of n.children) {
            if (c.kind === 'element' && c.tag === 'li') items.push(c);
            else if (c.kind === 'element' && (c.tag === 'ul' || c.tag === 'ol')) items.push(...extractListItems([c]));
          }
        }
      }
      return items;
    };

    const allInsertedAreLists =
      insertedRoots.length > 0 &&
      insertedRoots.every(n => n.kind === 'element' && (n.tag === 'ul' || n.tag === 'ol'));

    let placed = false;
    const placeBlocks = (nodes: readonly DocumentNode[], parentTag?: string): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'element' && node.id === targetBlockId && !placed) {
          if ((parentTag === 'ul' || parentTag === 'ol') && allInsertedAreLists) {
            const splicedItems = extractListItems(insertedRoots);
            if (targetBlockEmpty) out.push(...splicedItems);
            else out.push(node, ...splicedItems);
          } else if (targetBlockEmpty) {
            out.push(...insertedRoots);
          } else {
            out.push(node, ...insertedRoots);
          }
          placed = true;
        } else if (node.kind === 'element') {
          out.push({ ...node, children: placeBlocks(node.children, node.tag) });
        } else {
          out.push(node);
        }
      }
      return out;
    };

    const nextRoots = targetBlockId ? this.hoistNonListBlocksFromLists(placeBlocks(baseRoots)) : [...baseRoots, ...insertedRoots];
    const finalRoots = placed ? nextRoots : [...baseRoots, ...insertedRoots];
    const leaves = textNodes(insertedRoots);
    const lastLeaf = leaves[leaves.length - 1];
    const nextSel: DocumentSelection | null = lastLeaf
      ? {
          anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
          focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length },
        }
      : caretPos
        ? { anchor: caretPos, focus: caretPos }
        : null;
    return this.commitCustomState(finalRoots, nextSel, 'paste-html');
  }

  /** Finds all text matches across all sections in the Canvas model and resolves their global page index + Y coordinate. */
  findMatches(query: string, matchCase = false, wholeWord = false): CanvasTextMatch[] {
    if (!query) return [];
    const stripDiacritics = (str: string): string => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const foldedQuery = stripDiacritics(query);
    const useFolded = foldedQuery.length > 0;
    const effectiveQuery = useFolded ? foldedQuery : query;
    const escaped = effectiveQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
    const regex = new RegExp(pattern, matchCase ? 'gu' : 'giu');
    const sections = this.engine.getSections();
    const matches: CanvasTextMatch[] = [];

    const foldWithIndexMap = (input: string): { text: string; indexMap: number[] } => {
      if (!useFolded) {
        return { text: input, indexMap: [] };
      }
      let folded = '';
      const indexMap: number[] = [];
      let i = 0;
      while (i < input.length) {
        const cp = input.codePointAt(i)!;
        const unitLen = cp > 0xffff ? 2 : 1;
        const ch = input.slice(i, i + unitLen);
        const clean = stripDiacritics(ch);
        for (let k = 0; k < clean.length; k++) {
          folded += clean[k];
          indexMap.push(i);
        }
        i += unitLen;
      }
      indexMap.push(input.length);
      return { text: folded, indexMap };
    };

    const collectBlockTextSegments = (nodes: readonly DocumentNode[], segments: Extract<DocumentNode, { kind: 'text' }>[][]) => {
      let currentInline: Extract<DocumentNode, { kind: 'text' }>[] = [];
      const flush = () => {
        if (currentInline.length) {
          segments.push(currentInline);
          currentInline = [];
        }
      };
      for (const node of nodes) {
        if (node.kind === 'text') {
          currentInline.push(node);
        } else if (BLOCK_TAGS.has(node.tag) || ['td', 'th', 'div', 'section', 'article'].includes(node.tag)) {
          flush();
          const hasNestedBlock = node.children.some(
            c => c.kind === 'element' && (BLOCK_TAGS.has(c.tag) || ['ul', 'ol', 'table', 'div', 'section'].includes(c.tag)),
          );
          if (hasNestedBlock) {
            collectBlockTextSegments(node.children, segments);
          } else {
            const leaves = textNodes(node.children);
            if (leaves.length) segments.push(leaves);
          }
        } else {
          currentInline.push(...textNodes(node.children));
        }
      }
      flush();
    };

    const locatePosition = (sectionIndex: number, basePageIdx: number, pos: DocumentPosition): { pageIndex: number; y: number } => {
      const sec = sections[sectionIndex];
      for (let p = 0; p < sec.displayLists.length; p++) {
        for (const cmd of sec.displayLists[p].commands) {
          if (
            cmd.kind === 'text' &&
            cmd.source &&
            cmd.source.start.nodeId === pos.nodeId &&
            pos.offset >= cmd.source.start.offset &&
            pos.offset <= cmd.source.end.offset
          ) {
            return { pageIndex: basePageIdx + p, y: cmd.source.top };
          }
        }
        for (const cmd of sec.displayLists[p].commands) {
          if (cmd.kind === 'text' && cmd.source && cmd.source.start.nodeId === pos.nodeId) {
            return { pageIndex: basePageIdx + p, y: cmd.source.top };
          }
        }
      }
      return { pageIndex: basePageIdx, y: 0 };
    };

    let basePageIdx = 0;
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      const segments: Extract<DocumentNode, { kind: 'text' }>[][] = [];
      collectBlockTextSegments(sec.model.state.roots, segments);

      for (const leaves of segments) {
        let fullText = '';
        const offsets: { node: Extract<DocumentNode, { kind: 'text' }>; start: number; end: number }[] = [];
        for (const leaf of leaves) {
          const start = fullText.length;
          fullText += leaf.text;
          offsets.push({ node: leaf, start, end: fullText.length });
        }
        const { text: searchText, indexMap } = foldWithIndexMap(fullText);
        regex.lastIndex = 0;
        let hit: RegExpExecArray | null;
        while ((hit = regex.exec(searchText)) !== null) {
          if (!hit[0].length) {
            regex.lastIndex++;
            continue;
          }
          const mStart = useFolded ? indexMap[hit.index] : hit.index;
          const mEnd = useFolded ? indexMap[hit.index + hit[0].length] : hit.index + hit[0].length;
          const startEntry = offsets.find(o => mStart >= o.start && mStart <= o.end && (mStart < o.end || o.end === o.start)) ?? offsets[0];
          const endEntry = offsets.find(o => mEnd >= o.start && mEnd <= o.end) ?? offsets[offsets.length - 1];
          const anchor: DocumentPosition = { nodeId: startEntry.node.id, offset: mStart - startEntry.start };
          const focus: DocumentPosition = { nodeId: endEntry.node.id, offset: mEnd - endEntry.start };
          const loc = locatePosition(s, basePageIdx, anchor);
          matches.push({ sectionIndex: s, pageIndex: loc.pageIndex, y: loc.y, anchor, focus });
        }
      }
      basePageIdx += sec.displayLists.length;
    }
    return matches;
  }

  /** Selects a CanvasTextMatch so it is highlighted visually on the Canvas. */
  selectMatch(match: CanvasTextMatch): void {
    this.setSelection(match.sectionIndex, { anchor: match.anchor, focus: match.focus });
  }

  /** Replaces a single CanvasTextMatch with `replacement` and keeps Undo/Redo history. */
  replaceMatch(match: CanvasTextMatch, replacement: string): boolean {
    const sections = this.engine.getSections();
    const sec = sections[match.sectionIndex];
    if (!sec) return false;
    this.setSelection(match.sectionIndex, { anchor: match.anchor, focus: match.focus });
    const leaves = textNodes(sec.model.state.roots);
    const ai = leaves.findIndex(n => n.id === match.anchor.nodeId);
    const bi = leaves.findIndex(n => n.id === match.focus.nodeId);
    if (ai < 0 || bi < 0) return false;

    const replaceMap = new Map<string, string>();
    for (let i = ai; i <= bi; i++) {
      const leaf = leaves[i];
      if (i === ai && i === bi) {
        replaceMap.set(
          leaf.id,
          leaf.text.slice(0, match.anchor.offset) + replacement + leaf.text.slice(match.focus.offset),
        );
      } else if (i === ai) {
        replaceMap.set(leaf.id, leaf.text.slice(0, match.anchor.offset) + replacement);
      } else if (i === bi) {
        replaceMap.set(leaf.id, leaf.text.slice(match.focus.offset));
      } else {
        replaceMap.set(leaf.id, '');
      }
    }

    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind === 'text') {
          const nextText = replaceMap.get(node.id);
          return nextText !== undefined ? { ...node, text: nextText } : node;
        }
        return { ...node, children: rewrite(node.children) };
      });

    const nextRoots = rewrite(sec.model.state.roots);
    const endOffset = match.anchor.offset + replacement.length;
    const nextSel: DocumentSelection = {
      anchor: { nodeId: match.anchor.nodeId, offset: match.anchor.offset },
      focus: { nodeId: match.anchor.nodeId, offset: endOffset },
    };
    return this.commitCustomState(nextRoots, nextSel, 'replace-match');
  }

  /** Replaces all matches of `query` across all sections in one undoable transaction. */
  replaceAllMatches(query: string, replacement: string, matchCase = false, wholeWord = false): number {
    const matches = this.findMatches(query, matchCase, wholeWord);
    if (!matches.length) return 0;
    const before = this.snapshot();
    const sections = this.engine.getSections();
    const bySection = new Map<number, CanvasTextMatch[]>();
    for (const m of matches) {
      const list = bySection.get(m.sectionIndex) ?? [];
      list.push(m);
      bySection.set(m.sectionIndex, list);
    }

    const nextStates: DocumentState[] = sections.map((sec, sIdx) => {
      const secMatches = bySection.get(sIdx);
      if (!secMatches?.length) return sec.model.state;
      const leaves = textNodes(sec.model.state.roots);
      const leafIndex = new Map(leaves.map((l, idx) => [l.id, idx]));
      const textById = new Map(leaves.map(l => [l.id, l.text]));

      // Apply in reverse document order so earlier offsets remain valid
      for (const m of [...secMatches].reverse()) {
        const ai = leafIndex.get(m.anchor.nodeId);
        const bi = leafIndex.get(m.focus.nodeId);
        if (ai === undefined || bi === undefined) continue;
        for (let i = ai; i <= bi; i++) {
          const id = leaves[i].id;
          const cur = textById.get(id) ?? '';
          if (i === ai && i === bi) {
            textById.set(id, cur.slice(0, m.anchor.offset) + replacement + cur.slice(m.focus.offset));
          } else if (i === ai) {
            textById.set(id, cur.slice(0, m.anchor.offset) + replacement);
          } else if (i === bi) {
            textById.set(id, cur.slice(m.focus.offset));
          } else {
            textById.set(id, '');
          }
        }
      }

      const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(node => {
          if (node.kind === 'text') {
            const nextText = textById.get(node.id);
            return nextText !== undefined && nextText !== node.text ? { ...node, text: nextText } : node;
          }
          return { ...node, children: rewrite(node.children) };
        });

      return {
        revision: sec.model.state.revision + 1,
        roots: rewrite(sec.model.state.roots),
        selection: sec.model.state.selection,
      };
    });

    this.engine.restore(nextStates, this.geometry, this.engine.getDefaultStyle());
    this.syncTocPageNumbers();
    this.onCheckpoint?.();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.typingKind = 'replace-all';
    this.typingAt = 0;
    return matches.length;
  }

  /** Selects the entire paragraph/block containing the current caret. */
  selectCurrentParagraph(): boolean {
    if (!this.selection) return false;
    const blockIds = this.selectedBlockIds();
    const firstId = blockIds.values().next().value;
    if (!firstId) return false;
    const sec = this.engine.getSections()[this.section];
    const block = sec ? findNodeById(sec.model.state.roots, firstId) : null;
    if (!block) return false;
    const leaves = textNodes([block]);
    if (!leaves.length) return false;
    const first = leaves[0];
    const last = leaves[leaves.length - 1];
    this.setSelection(this.section, {
      anchor: { nodeId: first.id, offset: 0 },
      focus: { nodeId: last.id, offset: last.text.length },
    });
    return true;
  }

  /** Selects all text rendered on the given global page index. */
  selectPage(pageIndex: number): boolean {
    const sections = this.engine.getSections();
    let offset = 0;
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      if (pageIndex < offset + sec.displayLists.length) {
        const dl = sec.displayLists[pageIndex - offset];
        const textCmds = dl.commands.filter(c => c.kind === 'text' && c.source);
        if (!textCmds.length) return false;
        const first = textCmds[0];
        const last = textCmds[textCmds.length - 1];
        if (first.kind !== 'text' || last.kind !== 'text' || !first.source || !last.source) return false;
        this.setSelection(s, {
          anchor: first.source.start,
          focus: last.source.end,
        });
        return true;
      }
      offset += sec.displayLists.length;
    }
    return false;
  }

  /** Changes text case (`upper`, `lower`, `toggle`, `title`, `sentence`) on the active selection. */
  changeCase(mode: string): boolean {
    if (!this.selection) return false;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return false;
    const leaves = textNodes(sec.model.state.roots);
    let a = this.selection.anchor;
    let b = this.selection.focus;
    let ai = leaves.findIndex(n => n.id === a.nodeId);
    let bi = leaves.findIndex(n => n.id === b.nodeId);
    if (ai < 0 || bi < 0) return false;
    if (ai > bi || (ai === bi && a.offset > b.offset)) {
      [a, b] = [b, a];
      [ai, bi] = [bi, ai];
    }
    if (ai === bi && a.offset === b.offset) return false;

    let sentenceStart = true;
    let wordStart = true;
    const updatedText = new Map<string, string>();
    for (let i = ai; i <= bi; i++) {
      const leaf = leaves[i];
      const start = i === ai ? a.offset : 0;
      const end = i === bi ? b.offset : leaf.text.length;
      if (end <= start) continue;
      const changed = Array.from(leaf.text.slice(start, end))
        .map(char => {
          const letter = /\p{L}/u.test(char);
          let result = char;
          if (mode === 'upper') result = char.toLocaleUpperCase();
          else if (mode === 'lower') result = char.toLocaleLowerCase();
          else if (mode === 'toggle') {
            result = char === char.toLocaleUpperCase() ? char.toLocaleLowerCase() : char.toLocaleUpperCase();
          } else if (mode === 'title') {
            result = wordStart ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
          } else if (mode === 'sentence') {
            result = sentenceStart ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
          }
          if (letter) sentenceStart = false;
          if (/[.!?]/u.test(char)) sentenceStart = true;
          wordStart = !/[\p{L}\p{N}]/u.test(char);
          return result;
        })
        .join('');
      updatedText.set(leaf.id, leaf.text.slice(0, start) + changed + leaf.text.slice(end));
    }
    if (!updatedText.size) return false;
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node =>
        node.kind === 'text'
          ? updatedText.has(node.id)
            ? { ...node, text: updatedText.get(node.id)! }
            : node
          : { ...node, children: rewrite(node.children) },
      );
    return this.commitCustomState(rewrite(sec.model.state.roots), this.selection, 'change-case');
  }

  /** Applies text shadow or outline effects to the selected text runs. */
  applyTextEffect(mode: string): boolean {
    if (!this.selection) return false;
    if (
      this.selection.anchor.nodeId === this.selection.focus.nodeId &&
      this.selection.anchor.offset === this.selection.focus.offset
    ) {
      return false;
    }
    return this.applyInlineStyle({
      'text-shadow': mode === 'shadow' ? '1px 2px 3px #64748b' : null,
      '-webkit-text-stroke': mode === 'outline' ? '0.5px currentColor' : null,
    });
  }

  /** Sorts 2+ adjacent selected blocks alphabetically (`asc` or `desc`). */
  sortSelectedParagraphs(direction: 'asc' | 'desc' = 'asc'): boolean {
    const blockIds = this.selectedBlockIds();
    if (blockIds.size < 2) return false;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return false;

    const textOf = (node: DocumentNode): string => textNodes([node]).map(t => t.text).join('');
    let sorted = false;
    const rewriteContainer = (children: readonly DocumentNode[]): readonly DocumentNode[] => {
      const indices: number[] = [];
      children.forEach((child, idx) => {
        if (child.kind === 'element' && blockIds.has(child.id)) indices.push(idx);
      });
      if (indices.length >= 2 && indices.length === blockIds.size) {
        const subset = indices.map(i => children[i]);
        const ordered = [...subset].sort(
          (a, b) =>
            textOf(a).localeCompare(textOf(b), 'es', { numeric: true, sensitivity: 'base' }) *
            (direction === 'desc' ? -1 : 1),
        );
        const next = [...children];
        indices.forEach((targetIdx, k) => {
          next[targetIdx] = ordered[k];
        });
        sorted = true;
        return next;
      }
      return children.map(child =>
        child.kind === 'element' ? { ...child, children: rewriteContainer(child.children) } : child,
      );
    };

    const nextRoots = rewriteContainer(sec.model.state.roots);
    if (!sorted) return false;
    return this.commitCustomState(nextRoots, this.selection, 'sort-paragraphs');
  }

  /** Converts the selected block(s) into a multilevel ordered list (`word-multilevel-list`). */
  applyMultilevelList(): boolean {
    if (!this.selection) return false;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return false;
    const blockIds = this.selectedBlockIds();
    const path = findAncestorPath(sec.model.state.roots, this.selection.anchor.nodeId) ?? [];
    const existingOl = [...path].reverse().find(n => n.kind === 'element' && n.tag === 'ol');
    if (existingOl && existingOl.kind === 'element') {
      const styleMap = parseStyleMap(existingOl.attributes['style']);
      styleMap['list-style-type'] = 'decimal';
      const cls = existingOl.attributes['class'] || '';
      const nextCls = cls.includes('word-multilevel-list') ? cls : `${cls} word-multilevel-list`.trim();
      const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(n =>
          n.kind === 'element'
            ? n.id === existingOl.id
              ? { ...n, attributes: { ...n.attributes, class: nextCls, style: serializeStyleMap(styleMap) } }
              : { ...n, children: rewrite(n.children) }
            : n,
        );
      return this.commitCustomState(rewrite(sec.model.state.roots), this.selection, 'multilevel-list');
    }
    if (!this.toggleList('ol')) return false;
    const refreshedSec = this.engine.getSections()[this.section];
    const refreshedPath = findAncestorPath(refreshedSec.model.state.roots, this.selection?.anchor.nodeId || '') ?? [];
    const newOl = [...refreshedPath].reverse().find(n => n.kind === 'element' && n.tag === 'ol');
    if (!newOl || newOl.kind !== 'element' || !blockIds.size) return true;
    const cls = newOl.attributes['class'] || '';
    const nextCls = cls.includes('word-multilevel-list') ? cls : `${cls} word-multilevel-list`.trim();
    const styleMap = parseStyleMap(newOl.attributes['style']);
    styleMap['list-style-type'] = 'decimal';
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(n =>
        n.kind === 'element'
          ? n.id === newOl.id
            ? { ...n, attributes: { ...n.attributes, class: nextCls, style: serializeStyleMap(styleMap) } }
            : { ...n, children: rewrite(n.children) }
          : n,
      );
    return this.commitCustomState(rewrite(refreshedSec.model.state.roots), this.selection, 'multilevel-list');
  }

  /** Extracts an ElementStyleRule from the current Canvas selection (used by "Update style from selection"). */
  selectionStyleRule(fallback: ElementStyleRule): ElementStyleRule | null {
    if (!this.selection) return null;
    const formats = this.getSelectionContext()?.formats;
    if (!formats) return null;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return null;
    const blockIds = this.selectedBlockIds();
    const blockId = blockIds.values().next().value;
    const block = blockId ? findNodeById(sec.model.state.roots, blockId) : null;
    const styleMap = block && block.kind === 'element' ? parseStyleMap(block.attributes['style']) : {};
    const fontSizePt = parseFloat(formats.fontSize) || fallback.fontSizePt;
    const lineHeight = parseFloat(formats.lineHeight || styleMap['line-height'] || '') || fallback.lineHeight;
    const anchorPath = findAncestorPath(sec.model.state.roots, this.selection.anchor.nodeId) ?? [];
    const inlineColor = [...anchorPath]
      .reverse()
      .map(n => (n.kind === 'element' ? parseStyleMap(n.attributes['style'])['color'] : undefined))
      .find(Boolean);
    const inlineBg = [...anchorPath]
      .reverse()
      .map(n => (n.kind === 'element' ? parseStyleMap(n.attributes['style'])['background-color'] : undefined))
      .find(Boolean);
    return {
      ...fallback,
      fontFamily: formats.fontName || fallback.fontFamily,
      fontSizePt,
      bold: formats.bold,
      italic: formats.italic,
      underline: formats.underline,
      strikeThrough: formats.strikeThrough,
      color: inlineColor || styleMap['color'] || fallback.color,
      backgroundColor:
        inlineBg && inlineBg !== 'transparent'
          ? inlineBg
          : styleMap['background-color'] && styleMap['background-color'] !== 'transparent'
            ? styleMap['background-color']
            : fallback.backgroundColor,
      align: formats.justifyCenter ? 'center' : formats.justifyRight ? 'right' : formats.justifyFull ? 'justify' : 'left',
      lineHeight,
      spaceBeforePt: formats.spaceBeforePt ?? parsePoints(styleMap['margin-top']) ?? fallback.spaceBeforePt,
      spaceAfterPt: formats.spaceAfterPt ?? parsePoints(styleMap['margin-bottom']) ?? fallback.spaceAfterPt,
    };
  }

  /** Updates all paragraphs/headings matching `tag` across all sections to match `rule`. */
  updateStyleRuleAcrossDocument(tag: 'P' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6', rule: ElementStyleRule): number {
    const sections = this.engine.getSections();
    if (!sections.length) return 0;
    const before = this.snapshot();
    const targetTag = tag.toLowerCase();
    const fontFamilyCss = rule.fontFamily.includes(',') ? rule.fontFamily : `"${rule.fontFamily}", serif`;
    let count = 0;

    const rewrite = (nodes: readonly DocumentNode[], inToc = false): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.tag === 'table' && node.attributes['data-word-table-style']) return node;
        const cls = node.attributes['class'] || '';
        const isToc = inToc || cls.includes('word-toc-page-section') || cls.includes('word-toc-entry');
        if (!isToc && node.tag === targetTag) {
          count++;
          const styleMap = parseStyleMap(node.attributes['style']);
          styleMap['font-family'] = fontFamilyCss;
          styleMap['font-size'] = `${rule.fontSizePt}pt`;
          styleMap['font-weight'] = rule.bold ? '700' : '400';
          styleMap['font-style'] = rule.italic ? 'italic' : 'normal';
          styleMap['text-decoration'] =
            [rule.underline ? 'underline' : '', rule.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
          styleMap['color'] = rule.color;
          styleMap['text-align'] = rule.align;
          styleMap['line-height'] = String(rule.lineHeight);
          styleMap['margin-top'] = `${rule.spaceBeforePt}pt`;
          styleMap['margin-bottom'] = `${rule.spaceAfterPt}pt`;
          if (rule.uppercase) styleMap['text-transform'] = 'uppercase';
          else delete styleMap['text-transform'];
          return {
            ...node,
            attributes: {
              ...node.attributes,
              'data-word-line-spacing': String(rule.lineHeight),
              style: serializeStyleMap(styleMap),
            },
          };
        }
        return { ...node, children: rewrite(node.children, isToc) };
      });

    const nextStates: DocumentState[] = sections.map(sec => ({
      revision: sec.model.state.revision + 1,
      roots: rewrite(sec.model.state.roots, false),
      selection: sec.model.state.selection,
    }));

    this.engine.restore(nextStates, this.geometry, this.engine.getDefaultStyle());
    this.syncTocPageNumbers();
    this.onCheckpoint?.();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.typingKind = 'update-style-rule';
    this.typingAt = 0;
    return count;
  }

  /** Inserts an HTML fragment (shapes, SmartArt, icons, checklists, comments, symbols) directly into the Canvas model. */
  insertHtml(html: string, keepInlineCaret = false, fallbackPageIndex?: number): boolean {
    const trimmed = html.trim();
    if (!trimmed) return false;
    if (!this.selection && fallbackPageIndex !== undefined) {
      this.ensureSelection(fallbackPageIndex);
    }
    const sec = this.engine.getSections()[this.section];
    if (!sec) return false;

    const parsed = htmlToDocumentState(trimmed);
    const reId = (node: DocumentNode): DocumentNode =>
      node.kind === 'text'
        ? { ...node, id: this.uid('t') }
        : { ...node, id: this.uid(node.tag), children: node.children.map(reId) };
    const insertedRoots = parsed.roots.map(reId);
    if (!insertedRoots.length) return false;

    const extractInline = (nodes: readonly DocumentNode[]): DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'text') out.push(n);
        else if (BLOCK_TAGS.has(n.tag) || n.tag === 'div') out.push(...n.children);
        else out.push(n);
      }
      return out;
    };

    if (keepInlineCaret && this.selection) {
      const blockIds = this.selectedBlockIds();
      const targetBlockId = blockIds.values().next().value;
      if (targetBlockId) {
        const inlineNodes = extractInline(insertedRoots);
        const leaves = textNodes(inlineNodes);
        const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
          nodes.map(node => {
            if (node.kind !== 'element') return node;
            if (node.id === targetBlockId) {
              return { ...node, children: [...node.children, ...inlineNodes] };
            }
            return { ...node, children: rewrite(node.children) };
          });
        const nextRoots = rewrite(sec.model.state.roots);
        const lastLeaf = leaves[leaves.length - 1];
        const nextSel: DocumentSelection | null = lastLeaf
          ? { anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length }, focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length } }
          : this.selection;
        return this.commitCustomState(nextRoots, nextSel, 'insert-html-inline');
      }
    }

    const blockIds = this.selectedBlockIds();
    const targetBlockId = blockIds.values().next().value;
    const allInsertedLists =
      insertedRoots.length > 0 &&
      insertedRoots.every(n => n.kind === 'element' && (n.tag === 'ul' || n.tag === 'ol'));
    let inserted = false;
    const insertAfterBlock = (nodes: readonly DocumentNode[], parentTag?: string): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'element' && node.id === targetBlockId && !inserted) {
          if ((parentTag === 'ul' || parentTag === 'ol') && allInsertedLists) {
            const spliced = insertedRoots.flatMap(r =>
              r.kind === 'element' ? r.children.filter(c => c.kind === 'element' && c.tag === 'li') : [],
            );
            out.push(node, ...spliced);
          } else {
            out.push(node, ...insertedRoots);
          }
          inserted = true;
        } else if (node.kind === 'element') {
          out.push({ ...node, children: insertAfterBlock(node.children, node.tag) });
        } else {
          out.push(node);
        }
      }
      return out;
    };

    const nextRoots = targetBlockId ? this.hoistNonListBlocksFromLists(insertAfterBlock(sec.model.state.roots)) : [...sec.model.state.roots, ...insertedRoots];
    const finalRoots = inserted ? nextRoots : [...sec.model.state.roots, ...insertedRoots];
    const leaves = textNodes(insertedRoots);
    const lastLeaf = leaves[leaves.length - 1];
    const nextSel: DocumentSelection | null = lastLeaf
      ? { anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length }, focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length } }
      : this.selection;
    return this.commitCustomState(finalRoots, nextSel, 'insert-html');
  }

  /** Applies or removes multi-column layout (`1`, `2`, `3`, `left`, `right`) on the active section/blocks in Canvas. */
  applySectionColumns(preset: '1' | '2' | '3' | 'left' | 'right'): { applied: boolean; message: string } {
    const sec = this.engine.getSections()[this.section];
    if (!sec) return { applied: false, message: '' };

    const path = this.selection ? findAncestorPath(sec.model.state.roots, this.selection.anchor.nodeId) ?? [] : [];
    const existingCol = [...path]
      .reverse()
      .find(n => n.kind === 'element' && (n.attributes['class'] || '').includes('word-columns-section'));

    const buildStyle = (p: '2' | '3' | 'left' | 'right'): string => {
      if (p === '2') return 'column-count: 2; column-gap: 24pt; column-rule: 1px solid #cbd5e1;';
      if (p === '3') return 'column-count: 3; column-gap: 18pt; column-rule: 1px solid #cbd5e1;';
      if (p === 'left') return 'display: grid; grid-template-columns: 1fr 2fr; gap: 20pt; align-items: start;';
      return 'display: grid; grid-template-columns: 2fr 1fr; gap: 20pt; align-items: start;';
    };

    if (preset === '1') {
      if (!existingCol || existingCol.kind !== 'element') {
        return { applied: false, message: 'La sección actual ya está en 1 columna' };
      }
      const unwrap = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const out: DocumentNode[] = [];
        for (const n of nodes) {
          if (n.kind === 'element' && n.id === existingCol.id) {
            out.push(...n.children);
          } else if (n.kind === 'element') {
            out.push({ ...n, children: unwrap(n.children) });
          } else {
            out.push(n);
          }
        }
        return out;
      };
      const applied = this.commitCustomState(unwrap(sec.model.state.roots), this.selection, 'section-columns');
      return { applied, message: 'Sección restaurada a 1 sola columna' };
    }

    if (existingCol && existingCol.kind === 'element' && (preset === '2' || preset === '3')) {
      const styleMap = parseStyleMap(existingCol.attributes['style']);
      delete styleMap['display'];
      delete styleMap['grid-template-columns'];
      styleMap['column-count'] = preset;
      styleMap['column-gap'] = preset === '2' ? '24pt' : '18pt';
      styleMap['column-rule'] = '1px solid #cbd5e1';
      const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(n =>
          n.kind === 'element'
            ? n.id === existingCol.id
              ? { ...n, attributes: { ...n.attributes, 'data-word-columns': preset, style: serializeStyleMap(styleMap) } }
              : { ...n, children: rewrite(n.children) }
            : n,
        );
      const applied = this.commitCustomState(rewrite(sec.model.state.roots), this.selection, 'section-columns');
      return { applied, message: `Sección actualizada a ${preset} columnas` };
    }

    const blockIds = this.selectedBlockIds();
    const hasNonCollapsedSelection =
      !!this.selection &&
      (this.selection.anchor.nodeId !== this.selection.focus.nodeId ||
        this.selection.anchor.offset !== this.selection.focus.offset);

    if (hasNonCollapsedSelection && blockIds.size > 0) {
      const colWrapperId = this.uid('cols');
      let wrapped = false;
      const wrapInContainer = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const out: DocumentNode[] = [];
        const collected: DocumentNode[] = [];
        for (const node of nodes) {
          if (node.kind === 'element' && blockIds.has(node.id)) {
            collected.push(node);
            continue;
          }
          if (collected.length) {
            const inner =
              preset === 'left' || preset === 'right'
                ? [
                    { id: this.uid('col1'), kind: 'element' as const, tag: 'div', attributes: {}, children: collected },
                    {
                      id: this.uid('col2'),
                      kind: 'element' as const,
                      tag: 'div',
                      attributes: {},
                      children: [
                        {
                          id: this.uid('p'),
                          kind: 'element' as const,
                          tag: 'p',
                          attributes: {},
                          children: [{ id: this.uid('t'), kind: 'text' as const, text: 'Escribe aquí el contenido de la segunda columna...' }],
                        },
                      ],
                    },
                  ]
                : collected;
            out.push({
              id: colWrapperId,
              kind: 'element',
              tag: 'div',
              attributes: {
                class: 'word-columns-section',
                'data-word-columns': preset,
                style: buildStyle(preset),
              },
              children: inner,
            });
            collected.length = 0;
            wrapped = true;
          }
          out.push(node.kind === 'element' ? { ...node, children: wrapInContainer(node.children) } : node);
        }
        if (collected.length) {
          out.push({
            id: colWrapperId,
            kind: 'element',
            tag: 'div',
            attributes: {
              class: 'word-columns-section',
              'data-word-columns': preset,
              style: buildStyle(preset),
            },
            children: collected,
          });
          wrapped = true;
        }
        return out;
      };
      const nextRoots = wrapInContainer(sec.model.state.roots);
      if (wrapped) {
        const applied = this.commitCustomState(nextRoots, this.selection, 'section-columns');
        return { applied, message: `Sección de ${preset} columnas aplicada` };
      }
    }

    const numCols = preset === '3' ? 3 : 2;
    const sampleColumns =
      preset === 'left' || preset === 'right'
        ? `<div class="word-columns-section" data-word-columns="${preset}" style="${buildStyle(preset)}"><div style="border-right: 1px solid #e2e8f0; padding-right: 12pt;"><p><strong>Columna 1 (Sección):</strong> Escribe o pega aquí el contenido de la primera columna.</p></div><div><p><strong>Columna 2 (Sección):</strong> Escribe o pega aquí el contenido de la segunda columna.</p></div></div><p><br/></p>`
        : `<div class="word-columns-section" data-word-columns="${preset}" style="${buildStyle(preset)}">${Array.from({ length: numCols })
            .map(
              (_, i) =>
                `<p><strong>Columna ${i + 1} de la sección:</strong> Escribe aquí el texto que fluirá automáticamente entre las ${numCols} columnas de esta sección.</p>`,
            )
            .join('')}</div><p><br/></p>`;
    const applied = this.insertHtml(sampleColumns, false);
    return { applied, message: `Sección de ${preset === 'left' ? 'izquierda' : preset === 'right' ? 'derecha' : preset + ' columnas'} insertada` };
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  getSelectedTableDesign(): { rule: TableStyleRule; fixed: boolean } | undefined {
    const tableId = this.getSelectionContext()?.table?.tableId;
    const roots = this.engine.getSections()[this.section]?.model.state.roots;
    const table = tableId && roots ? findNodeById(roots, tableId) : undefined;
    if (!table || table.kind !== 'element' || !table.attributes['data-word-table-rule']) return undefined;
    try { return { rule: normalizeTableStyle(JSON.parse(table.attributes['data-word-table-rule'])), fixed: isFixedTableStyle(table) }; }
    catch { return undefined; }
  }

  applyTableStyle(rule: TableStyleRule, fixed = true): boolean {
    const tableId = this.getSelectionContext()?.table?.tableId;
    const section = this.engine.getSections()[this.section];
    if (!tableId || !section || rule.mode !== 'custom') return false;
    const visit = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => nodes.map(node => {
      if (node.kind === 'text') return node;
      if (node.id === tableId) return styleModelTable(node, rule, fixed ? 'fixed' : 'template');
      if (!getSubtreeIds(node).has(tableId)) return node;
      return { ...node, children: visit(node.children) };
    });
    return this.commitCustomState(visit(section.model.state.roots), this.selection, 'table-style');
  }

  /** Applies a full design template (`StyleTemplate`) across all sections directly in the DocumentModel without leaving Canvas mode. */
  applyTemplateToDocument(
    template: StyleTemplate,
    nextGeometry: PageGeometry,
    nextDefaults: Partial<ResolvedLayoutStyle>,
    currentMeta?: CanvasHistoryMeta,
  ): boolean {
    const sections = this.engine.getSections();
    if (!sections.length) return false;
    const before = this.snapshot(currentMeta);
    const isApa = template.academicStyle === 'apa7';
    const pRule = template.rules.P;
    const fontFamilyCss = pRule.fontFamily.includes(',') ? pRule.fontFamily : `"${pRule.fontFamily}", serif`;
    let currentStyles: ReadonlyMap<string, ResolvedLayoutStyle> | undefined;

    const cleanInlineRuns = (
      nodes: readonly DocumentNode[],
      stripEmphasis: boolean,
    ): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind === 'text') return node;
        const cls = node.attributes['class'] || '';
        if (cls.includes('word-latex-formula') || cls.includes('word-latex-math-rendered') || node.tag === 'svg') {
          return node;
        }
        if (isApa && node.tag === 'span' && 'data-heading-num' in node.attributes) {
          return { id: node.id, kind: 'text', text: '' };
        }
        const children = cleanInlineRuns(node.children, stripEmphasis);
        if (!INLINE_RUN_TAGS.has(node.tag)) {
          return children === node.children ? node : { ...node, children };
        }
        const styleMap = parseStyleMap(node.attributes['style']);
        const wasBold =
          ['b', 'strong'].includes(node.tag) ||
          styleMap['font-weight'] === 'bold' ||
          Number(styleMap['font-weight']) >= 600;
        const wasItalic =
          ['i', 'em'].includes(node.tag) ||
          styleMap['font-style'] === 'italic' ||
          styleMap['font-style'] === 'oblique';
        for (const key of OVERRIDE_STYLE_KEYS) delete styleMap[key];
        delete styleMap['line-height'];
        if (!stripEmphasis) {
          if (wasBold) styleMap['font-weight'] = 'bold';
          if (wasItalic) styleMap['font-style'] = 'italic';
        }
        const nextAttrs: Record<string, string> = { ...node.attributes };
        const nextStyle = serializeStyleMap(styleMap);
        if (nextStyle) nextAttrs['style'] = nextStyle;
        else delete nextAttrs['style'];
        if (node.tag === 'font') {
          delete nextAttrs['face'];
          delete nextAttrs['size'];
          delete nextAttrs['color'];
        }
        const nextTag =
          stripEmphasis && ['b', 'strong', 'i', 'em', 'font'].includes(node.tag)
            ? 'span'
            : node.tag === 'font'
              ? 'span'
              : node.tag;
        return { ...node, tag: nextTag, attributes: nextAttrs, children };
      });

    const styleApaRoleParagraph = (
      node: Extract<DocumentNode, { kind: 'element' }>,
      role: string,
    ): Extract<DocumentNode, { kind: 'element' }> => {
      const styleMap: Record<string, string> = {
        'font-family': fontFamilyCss,
        'font-size': role === 'footnote' ? `${Math.max(8, pRule.fontSizePt - 2)}pt` : `${pRule.fontSizePt}pt`,
        color: '#000000',
        'line-height': role === 'footnote' ? '1' : '2',
        'margin-top': role === 'author-note-heading' ? `${pRule.fontSizePt * 2}pt` : '0pt',
        'margin-bottom': role === 'cover-title' ? `${pRule.fontSizePt * 2}pt` : '0pt',
        'margin-left': role === 'reference' ? '36pt' : '0pt',
        'text-indent':
          role === 'reference'
            ? '-36pt'
            : ['author-note', 'keywords', 'appendix-body', 'endnote'].includes(role)
              ? '36pt'
              : '0pt',
        'text-align':
          role === 'heading' ||
          role.startsWith('cover-') ||
          role === 'author-note-heading' ||
          role === 'appendix-label' ||
          role === 'appendix-title'
            ? 'center'
            : 'left',
        'font-weight':
          ['number', 'heading', 'cover-title', 'author-note-heading', 'appendix-label', 'appendix-title'].includes(role)
            ? '700'
            : '400',
        'font-style': role === 'title' ? 'italic' : 'normal',
        'text-decoration': 'none',
      };
      const nextAttrs: Record<string, string> = {
        ...node.attributes,
        'data-word-line-spacing': styleMap['line-height'],
        style: serializeStyleMap(styleMap),
      };
      return {
        ...node,
        attributes: nextAttrs,
        children: cleanInlineRuns(node.children, false),
      };
    };

    const transformNode = (node: DocumentNode, inCell = false, inToc = false): DocumentNode => {
      if (node.kind === 'text') return node;
      const cls = node.attributes['class'] || '';
      if (cls.includes('word-latex-formula') || cls.includes('word-latex-math-rendered') || node.tag === 'svg') {
        return node;
      }

      const isTocNode =
        inToc ||
        cls.includes('word-toc-page-section') ||
        cls.includes('word-toc-header') ||
        cls.includes('word-toc-entry');
      if (isTocNode) {
        const styleMap = parseStyleMap(node.attributes['style']);
        const tocLh = isApa ? '2' : String(pRule.lineHeight);
        if (cls.includes('word-toc-page-section') || cls.includes('word-toc-entry')) {
          styleMap['font-family'] = fontFamilyCss;
          styleMap['font-size'] = `${pRule.fontSizePt}pt`;
          styleMap['line-height'] = tocLh;
          if (cls.includes('word-toc-entry')) {
            const isTopLevel = parseFloat(styleMap['padding-left'] || '0') <= 0;
            styleMap['font-weight'] = isTopLevel ? '700' : '400';
            if (!styleMap['margin-top']) styleMap['margin-top'] = '0pt';
          } else {
            styleMap['margin-top'] = '0pt';
          }
          styleMap['margin-bottom'] = '0pt';
          styleMap['color'] = isApa ? '#000000' : pRule.color;
        } else if (cls.includes('word-toc-header')) {
          const h1Rule = template.rules.H1;
          styleMap['font-family'] = fontFamilyCss;
          styleMap['font-size'] = `${isApa ? pRule.fontSizePt : h1Rule.fontSizePt}pt`;
          styleMap['line-height'] = tocLh;
          styleMap['margin-top'] = '0pt';
          styleMap['margin-bottom'] = '0pt';
          styleMap['font-weight'] = '700';
          styleMap['text-align'] = isApa ? 'center' : h1Rule.align;
          styleMap['color'] = isApa ? '#000000' : h1Rule.color;
        } else {
          delete styleMap['font-family'];
          delete styleMap['font-size'];
          delete styleMap['line-height'];
        }
        const nextAttrs: Record<string, string> = { ...node.attributes };
        if (cls.includes('word-toc-entry') || cls.includes('word-toc-header')) {
          nextAttrs['data-word-line-spacing'] = tocLh;
        }
        const nextStyle = serializeStyleMap(styleMap);
        if (nextStyle) nextAttrs['style'] = nextStyle;
        else delete nextAttrs['style'];
        return {
          ...node,
          attributes: nextAttrs,
          children: node.children.map(c => transformNode(c, inCell, true)),
        };
      }

      if (node.tag === 'table') {
        if (isFixedTableStyle(node)) return node;
        if (template.tableStyle?.mode === 'preserve' && currentStyles) return preserveModelTable(node, currentStyles);
        if (template.tableStyle && template.tableStyle.mode !== 'inherit') return styleModelTable(node, template.tableStyle);
        const styleMap = parseStyleMap(node.attributes['style']);
        styleMap['font-family'] = fontFamilyCss;
        styleMap['font-size'] = `${pRule.fontSizePt}pt`;
        styleMap['line-height'] = '1.1';
        styleMap['border-collapse'] = 'collapse';
        if (isApa) {
          styleMap['border'] = 'none';
          styleMap['border-top'] = '1px solid #000000';
          styleMap['border-bottom'] = '1px solid #000000';
          styleMap['background-color'] = '#ffffff';
        }
        const nextAttrs: Record<string, string> = {
          ...node.attributes,
          style: serializeStyleMap(styleMap),
        };
        delete nextAttrs['data-word-table-style'];
        delete nextAttrs['data-word-table-binding'];
        delete nextAttrs['data-word-table-rule'];
        delete nextAttrs['data-word-table-padding'];
        delete nextAttrs['data-word-table-header-rows'];
        if (isApa) nextAttrs['data-apa-table'] = 'true';
        else delete nextAttrs['data-apa-table'];
        return {
          ...node,
          attributes: nextAttrs,
          children: node.children.map(c => transformNode(c, true, false)),
        };
      }

      if (node.tag === 'th' || node.tag === 'td') {
        const styleMap = parseStyleMap(node.attributes['style']);
        styleMap['font-family'] = fontFamilyCss;
        styleMap['font-size'] = `${pRule.fontSizePt}pt`;
        styleMap['line-height'] = '1.1';
        styleMap['color'] = isApa ? '#000000' : pRule.color;
        if (isApa) {
          styleMap['padding'] = '2px 4px';
          styleMap['background-color'] = 'transparent';
        }
        return {
          ...node,
          attributes: { ...node.attributes, style: serializeStyleMap(styleMap) },
          children: node.children.map(c => transformNode(c, true, false)),
        };
      }

      if (inCell && node.tag === 'p') {
        const styleMap = parseStyleMap(node.attributes['style']);
        styleMap['font-family'] = fontFamilyCss;
        styleMap['font-size'] = `${pRule.fontSizePt}pt`;
        styleMap['line-height'] = '1.1';
        styleMap['margin-top'] = '0pt';
        styleMap['margin-bottom'] = '0pt';
        styleMap['text-indent'] = '0pt';
        styleMap['color'] = isApa ? '#000000' : pRule.color;
        return {
          ...node,
          attributes: {
            ...node.attributes,
            'data-word-line-spacing': '1.1',
            style: serializeStyleMap(styleMap),
          },
          children: cleanInlineRuns(node.children, false),
        };
      }

      if (node.tag === 'ul' || node.tag === 'ol') {
        const listRule = template.listRules?.[node.tag === 'ol' ? 'ordered' : 'unordered'];
        const indentLeft = listRule?.indentLeftPt ?? 36;
        const hanging = listRule?.hangingIndentPt ?? 18;
        const lh = String(listRule?.lineHeight ?? pRule.lineHeight);
        const styleMap: Record<string, string> = {
          'font-family': fontFamilyCss,
          'font-size': `${pRule.fontSizePt}pt`,
          color: isApa ? '#000000' : pRule.color,
          'text-align': 'left',
          'line-height': lh,
          'text-indent': '0pt',
          'margin-top': '0pt',
          'margin-bottom': '0pt',
          'margin-left': `${indentLeft - hanging}pt`,
          'padding-left': `${hanging}pt`,
          'list-style-position': 'outside',
          'list-style-type': listRule?.marker ?? (node.tag === 'ol' ? 'decimal' : 'disc'),
        };
        return {
          ...node,
          attributes: {
            ...node.attributes,
            'data-word-list-indent': String(indentLeft),
            'data-word-list-hanging': String(hanging),
            style: serializeStyleMap(styleMap),
          },
          children: node.children.map(child => {
            if (child.kind !== 'element' || child.tag !== 'li') return child;
            const liStyle: Record<string, string> = {
              'font-family': fontFamilyCss,
              'font-size': `${pRule.fontSizePt}pt`,
              color: isApa ? '#000000' : pRule.color,
              'text-align': 'left',
              'line-height': lh,
              'text-indent': '0pt',
              'margin-left': '0pt',
              'margin-right': '0pt',
              'margin-top': `${listRule?.spaceBeforePt ?? 0}pt`,
              'margin-bottom': `${listRule?.spaceAfterPt ?? 0}pt`,
            };
            return {
              ...child,
              attributes: {
                ...child.attributes,
                'data-word-line-spacing': lh,
                style: serializeStyleMap(liStyle),
              },
              children: cleanInlineRuns(child.children, false),
            };
          }),
        };
      }

      if (!inCell && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag)) {
        const apaRole = node.attributes['data-apa-role'];
        if (apaRole && isApa) {
          return styleApaRoleParagraph(node, apaRole);
        }

        const runInLevel = node.attributes['data-apa-run-in'];
        if (runInLevel) {
          if (isApa) {
            const pStyle = ruleToCssStyle(pRule);
            return {
              ...node,
              attributes: {
                ...node.attributes,
                'data-word-line-spacing': String(pRule.lineHeight),
                style: pStyle,
              },
              children: node.children.map(c => {
                if (c.kind === 'element' && 'data-apa-heading-level' in c.attributes) {
                  return { ...c, children: cleanInlineRuns(c.children, true) };
                }
                return c.kind === 'element' ? (cleanInlineRuns([c], false)[0] ?? c) : c;
              }),
            };
          }
          // Switching from APA run-in heading to non-APA heading
          const hKey = (`H${runInLevel}` as keyof StyleTemplate['rules']) in template.rules
            ? (`H${runInLevel}` as keyof StyleTemplate['rules'])
            : 'H4';
          const hRule = template.rules[hKey];
          const unwrapped = cleanInlineRuns(unwrapApaRunInChildren(node.children), true);
          const nextAttrs: Record<string, string> = { ...node.attributes };
          delete nextAttrs['data-apa-run-in'];
          nextAttrs['data-word-line-spacing'] = String(hRule.lineHeight);
          nextAttrs['style'] = ruleToCssStyle(hRule);
          return {
            ...node,
            tag: hKey.toLowerCase(),
            attributes: nextAttrs,
            children: unwrapped,
          };
        }

        if (isApa && ['h4', 'h5', 'h6'].includes(node.tag)) {
          const level = node.tag === 'h4' ? '4' : '5';
          const headingId = node.attributes['id'] || this.uid('heading');
          const spanStyle = serializeStyleMap({
            'font-weight': 'bold',
            'font-style': level === '5' ? 'italic' : 'normal',
            'text-transform': 'capitalize',
          });
          const nextAttrs: Record<string, string> = {
            ...node.attributes,
            'data-apa-run-in': level,
            'data-word-line-spacing': String(pRule.lineHeight),
            style: ruleToCssStyle(pRule),
          };
          delete nextAttrs['id'];
          return {
            id: node.id,
            kind: 'element',
            tag: 'p',
            attributes: nextAttrs,
            children: [
              {
                id: this.uid('apa-h'),
                kind: 'element',
                tag: 'span',
                attributes: {
                  id: headingId,
                  'data-apa-heading-level': level,
                  style: spanStyle,
                },
                children: cleanInlineRuns(node.children, true),
              },
            ],
          };
        }

        const ruleKey = node.tag.toUpperCase() as keyof StyleTemplate['rules'];
        const rule = template.rules[ruleKey] || pRule;
        const isHeading = node.tag !== 'p';
        const nextAttrs: Record<string, string> = {
          ...node.attributes,
          'data-word-line-spacing': String(rule.lineHeight),
          style: ruleToCssStyle(rule, isApa && ['h1', 'h2', 'h3'].includes(node.tag) ? 'capitalize' : undefined),
        };
        return {
          ...node,
          attributes: nextAttrs,
          children: cleanInlineRuns(node.children, isHeading),
        };
      }

      const nextChildren = node.children.map(c => transformNode(c, inCell, isTocNode));
      return nextChildren.every((c, idx) => c === node.children[idx])
        ? node
        : { ...node, children: nextChildren };
    };

    const nextStates: DocumentState[] = sections.map(sec => {
      currentStyles = template.tableStyle?.mode === 'preserve' ? this.engine.getResolvedStyles(sec.model.state) : undefined;
      return { revision: sec.model.state.revision + 1,
        roots: sec.model.state.roots.map(root => transformNode(root, false, false)), selection: sec.model.state.selection };
    });

    this.geometry = nextGeometry;
    this.engine.restore(nextStates, nextGeometry, nextDefaults);
    this.syncTocPageNumbers();
    this.onCheckpoint?.();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.typingKind = 'apply-template';
    this.typingAt = 0;
    return true;
  }

  /** Synchronizes `.word-toc-entry` page numbers in the model with the current Canvas pagination. */
  syncTocPageNumbers(): void {
    const sections = this.engine.getSections();
    const pageById = new Map<string, number>();
    const pageByTitle = new Map<string, number>();

    let globalPageBase = 0;
    for (const sec of sections) {
      const nodePageMap = new Map<string, number>();
      for (let pIdx = 0; pIdx < sec.displayLists.length; pIdx++) {
        const globalPage = globalPageBase + pIdx;
        for (const cmd of sec.displayLists[pIdx].commands) {
          if (cmd.kind === 'text' && cmd.source) {
            if (!nodePageMap.has(cmd.source.start.nodeId)) {
              nodePageMap.set(cmd.source.start.nodeId, globalPage);
            }
          } else if (cmd.kind !== 'text' && cmd.nodeId && !nodePageMap.has(cmd.nodeId)) {
            nodePageMap.set(cmd.nodeId, globalPage);
          }
        }
      }
      const firstHitPage = (node: DocumentNode): number => {
        const direct = nodePageMap.get(node.id);
        if (direct !== undefined) return direct;
        for (const leaf of textNodes([node])) {
          const hit = nodePageMap.get(leaf.id);
          if (hit !== undefined) return hit;
        }
        return globalPageBase;
      };
      const collectHeadings = (nodes: readonly DocumentNode[], inToc = false) => {
        for (const node of nodes) {
          if (node.kind !== 'element') continue;
          const cls = node.attributes['class'] || '';
          const isToc = inToc || cls.includes('word-toc-page-section') || cls.includes('word-toc-entry');
          if (!isToc && (/^h[1-6]$/i.test(node.tag) || 'data-apa-heading-level' in node.attributes)) {
            const pIdx = firstHitPage(node);
            const id = node.attributes['id'];
            if (id && !pageById.has(id)) pageById.set(id, pIdx);
            const title = normalizeHeadingSearchTitle(textNodes([node]).map(t => t.text).join(''));
            if (title && !pageByTitle.has(title)) pageByTitle.set(title, pIdx);
          }
          collectHeadings(node.children, isToc);
        }
      };
      collectHeadings(sec.model.state.roots);
      globalPageBase += sec.displayLists.length;
    }

    if (!pageById.size && !pageByTitle.size) return;

    sections.forEach((sec, secIdx) => {
      let changed = false;
      const updateEntries = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes.map(node => {
          if (node.kind !== 'element') return node;
          const cls = node.attributes['class'] || '';
          if (cls.split(/\s+/).includes('word-toc-entry')) {
            const targetId = node.attributes['data-toc-target-id'];
            let resolvedPage = targetId ? pageById.get(targetId) : undefined;
            if (resolvedPage === undefined) {
              const titleNode = node.children.find(
                c => c.kind === 'element' && (c.attributes['class'] || '').includes('word-toc-title'),
              );
              const normTitle = normalizeHeadingSearchTitle(
                textNodes(titleNode ? [titleNode] : [node]).map(t => t.text).join(''),
              );
              if (normTitle) resolvedPage = pageByTitle.get(normTitle);
            }
            if (resolvedPage !== undefined) {
              const nextPageAttr = String(resolvedPage);
              const nextPageText = String(resolvedPage + 1);
              let entryChanged = node.attributes['data-toc-page'] !== nextPageAttr;
              const nextChildren = node.children.map(child => {
                if (child.kind === 'element' && (child.attributes['class'] || '').split(/\s+/).includes('word-toc-page')) {
                  const firstLeaf = child.children.find(c => c.kind === 'text');
                  if (firstLeaf && firstLeaf.kind === 'text' && firstLeaf.text !== nextPageText) {
                    entryChanged = true;
                    return {
                      ...child,
                      children: [{ ...firstLeaf, text: nextPageText }],
                    };
                  }
                }
                return child;
              });
              if (entryChanged) {
                changed = true;
                return {
                  ...node,
                  attributes: { ...node.attributes, 'data-toc-page': nextPageAttr },
                  children: nextChildren,
                };
              }
            }
            return node;
          }
          const nextCh = updateEntries(node.children);
          return nextCh.every((c, i) => c === node.children[i]) ? node : { ...node, children: nextCh };
        });

      const nextRoots = updateEntries(sec.model.state.roots);
      if (changed) {
        this.engine.commitSectionState(
          secIdx,
          {
            revision: sec.model.state.revision + 1,
            roots: nextRoots,
            selection: sec.model.state.selection,
          },
          this.geometry,
        );
      }
    });
  }

  /** Applies autocorrect or detects repeated words at a collapsed Canvas caret. */
  applyProofreading(language: WritingLanguage, autocorrectEnabled: boolean): CanvasProofreadingResult | null {
    if (!this.selection) return null;
    const { anchor, focus } = this.selection;
    if (anchor.nodeId !== focus.nodeId || anchor.offset !== focus.offset) return null;
    const section = this.engine.getSections()[this.section];
    if (!section) return null;

    const roots = section.model.state.roots;
    const path = findAncestorPath(roots, focus.nodeId);
    if (!path.length) return null;
    if (
      path.some(
        n =>
          n.kind === 'element' &&
          (['pre', 'code', 'kbd', 'a'].includes(n.tag) || n.attributes['contenteditable'] === 'false'),
      )
    ) {
      return null;
    }

    const block = [...path].reverse().find(n => n.kind === 'element' && BLOCK_TAGS.has(n.tag));
    const leaves = textNodes(block ? [block] : roots);
    const focusIdx = leaves.findIndex(n => n.id === focus.nodeId);
    if (focusIdx < 0) return null;

    let beforeText = '';
    const offsets: { nodeId: string; globalStart: number; globalEnd: number }[] = [];
    for (let i = 0; i <= focusIdx; i++) {
      const leaf = leaves[i];
      const slice = i === focusIdx ? leaf.text.slice(0, focus.offset) : leaf.text;
      const start = beforeText.length;
      beforeText += slice;
      offsets.push({ nodeId: leaf.id, globalStart: start, globalEnd: beforeText.length });
    }

    const correction = autocorrectEnabled ? completedWordCorrection(beforeText, language) : null;
    if (correction) {
      const startEntry = offsets.find(o => correction.start >= o.globalStart && correction.start < o.globalEnd);
      if (!startEntry) return null;
      const startPos: DocumentPosition = {
        nodeId: startEntry.nodeId,
        offset: correction.start - startEntry.globalStart,
      };
      const trailing = beforeText.slice(correction.start + correction.before.length);
      const replacedText = correction.after + trailing;
      const expectedEndOffset = startPos.offset + replacedText.length;
      const sectionIndex = this.section;

      this.typingAt = 0;
      this.commit(
        {
          type: 'replaceText',
          selection: { anchor: startPos, focus },
          text: replacedText,
        },
        'autocorrect',
      );

      return {
        kind: 'correction',
        before: correction.before,
        after: correction.after,
        undo: () => {
          const targetSec = this.engine.getSections()[sectionIndex];
          if (!targetSec) return false;
          const targetNode = findNodeById(targetSec.model.state.roots, startPos.nodeId);
          if (targetNode?.kind !== 'text') return false;
          if (targetNode.text.slice(startPos.offset, expectedEndOffset) !== replacedText) return false;
          this.section = sectionIndex;
          this.typingAt = 0;
          this.commit(
            {
              type: 'replaceText',
              selection: {
                anchor: { nodeId: startPos.nodeId, offset: startPos.offset },
                focus: { nodeId: startPos.nodeId, offset: expectedEndOffset },
              },
              text: correction.before + trailing,
            },
            'autocorrect-undo',
          );
          return true;
        },
      };
    }

    const repeated = repeatedWord(beforeText);
    return repeated ? { kind: 'repetition', before: repeated } : null;
  }

  undoWithMeta(redo = false, currentMeta?: CanvasHistoryMeta): { ok: boolean; meta?: CanvasHistoryMeta } {
    const source = redo ? this.future : this.past;
    const target = redo ? this.past : this.future;
    const previous = source.at(-1);
    if (!previous) return { ok: false };
    const current = this.snapshot(currentMeta);
    this.geometry = previous.geometry;
    this.engine.restore(previous.states, previous.geometry, previous.defaults);
    source.pop();
    target.push(current);
    this.section = previous.section;
    this.selection = previous.selection;
    this.pendingInlineStyle = null;
    this.typingAt = 0;
    return { ok: true, meta: previous.meta };
  }

  undo(redo = false): boolean {
    return this.undoWithMeta(redo).ok;
  }

  /** Devuelve instantánea de las secciones actuales del modelo Canvas. */
  getSectionsSnapshot() {
    return this.engine.getSections();
  }

  /** Inspecciona campos de texto y tablas directamente desde el árbol del modelo Canvas. */
  *getAiTextFields(): Generator<{ id: string; text: string }> {
    const sections = this.engine.getSections();
    yield* aiModelTableFields(sections);
    yield* aiModelTableInsertionFields(sections);
    yield* modelTextFields(sections);
  }

  /** Consigna secciones actualizadas por IA en una sola transacción de historial. */
  commitAiSectionRoots(updatedBySection: ReadonlyMap<number, readonly DocumentNode[]>): boolean {
    if (!updatedBySection.size) return false;
    const t0 = this.engine.perf.now();
    const sections = this.engine.getSections();
    const before = this.snapshot();
    for (const [secIdx, nextRoots] of updatedBySection) {
      const sec = sections[secIdx];
      if (!sec) continue;
      this.engine.commitSectionState(
        secIdx,
        { ...sec.model.state, revision: sec.model.state.revision + 1, roots: nextRoots },
        this.geometry,
      );
    }
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.pendingInlineStyle = null;
    this.typingKind = 'ai';
    this.typingAt = 0;
    const currentSec = this.engine.getSections()[this.section];
    if (this.selection && (!currentSec || !findNodeById(currentSec.model.state.roots, this.selection.focus.nodeId))) {
      const leaves = currentSec ? textNodes(currentSec.model.state.roots) : [];
      this.selection = leaves.length
        ? { anchor: { nodeId: leaves[0].id, offset: 0 }, focus: { nodeId: leaves[0].id, offset: 0 } }
        : null;
    }
    this.engine.perf.record('ai', this.engine.perf.now() - t0, undefined, this.displayLists.length);
    this.onCheckpoint?.();
    return true;
  }

  /** Aplica ediciones IA directamente sobre las secciones afectadas en una sola transacción de historial. */
  applyAiEdits(values: ReadonlyMap<string, string>, template?: StyleTemplate): boolean {
    const sections = this.engine.getSections();
    const updatedBySection = applyAiEditsToSections(sections, values, template);
    return this.commitAiSectionRoots(updatedBySection);
  }

  /** Extrae texto legible para lectores o síntesis de voz directamente desde la selección o página del modelo. */
  getReadableText(pageIndex = 0): string {
    const selected = this.selectedText().trim();
    if (selected) return selected;
    const lists = this.displayLists;
    if (!lists.length) return '';
    const clamped = Math.max(0, Math.min(lists.length - 1, pageIndex));
    const page = lists[clamped];
    let text = '';
    let prevY = -Infinity;
    for (const cmd of page.commands) {
      if (cmd.kind !== 'text') continue;
      if (prevY > -Infinity && cmd.y - prevY > 2 && text && !/\s$/.test(text)) {
        text += '\n';
      }
      text += cmd.text;
      prevY = cmd.y;
    }
    return text.trim();
  }

  /** Proyecta bloques semánticos accesibles desde el modelo para lectores de pantalla (cacheado por estado/layout). */
  getAccessibleBlocks(): CanvasAccessibleBlock[] {
    const sections = this.engine.getSections();
    const cache = this.a11yBlocksCache;
    if (
      cache &&
      cache.roots.length === sections.length &&
      sections.every((sec, i) => sec.model.state.roots === cache.roots[i] && sec.displayLists === cache.displayLists[i])
    ) {
      return cache.blocks;
    }

    const blocks: CanvasAccessibleBlock[] = [];
    const pageByNodeId = new Map<string, number>();
    this.displayLists.forEach((dl, idx) => {
      for (const cmd of dl.commands) {
        if (cmd.kind === 'text' && cmd.source && !pageByNodeId.has(cmd.source.start.nodeId)) {
          pageByNodeId.set(cmd.source.start.nodeId, idx);
        }
      }
    });

    const resolveBlockPage = (node: DocumentNode, fallback: number): number => {
      for (const leaf of textNodes([node])) {
        const found = pageByNodeId.get(leaf.id);
        if (found !== undefined) return found;
      }
      return fallback;
    };

    const extractTableRows = (tableNode: Extract<DocumentNode, { kind: 'element' }>): CanvasAccessibleTableRow[] => {
      const rows: CanvasAccessibleTableRow[] = [];
      const collectTrs = (nodes: readonly DocumentNode[], inThead: boolean): void => {
        for (const child of nodes) {
          if (child.kind !== 'element') continue;
          if (child.tag === 'tr') {
            const cells: CanvasAccessibleTableCell[] = [];
            for (const cell of child.children) {
              if (cell.kind !== 'element' || (cell.tag !== 'td' && cell.tag !== 'th')) continue;
              const cellText = textNodes([cell]).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
              cells.push({
                id: cell.id,
                text: cellText,
                isHeader: inThead || cell.tag === 'th',
              });
            }
            if (cells.length) rows.push({ cells });
          } else if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
            collectTrs(child.children, inThead || child.tag === 'thead');
          }
        }
      };
      collectTrs(tableNode.children, false);
      return rows;
    };

    let pageOffset = 0;
    for (const sec of sections) {
      const visit = (nodes: readonly DocumentNode[]) => {
        for (const node of nodes) {
          if (node.kind !== 'element') continue;
          if (/^h[1-6]$/.test(node.tag)) {
            const text = textNodes([node]).map(t => t.text).join('').trim();
            if (text) {
              blocks.push({
                id: node.id,
                tag: node.tag as CanvasAccessibleBlock['tag'],
                level: Number(node.tag.slice(1)),
                text,
                pageIndex: resolveBlockPage(node, pageOffset),
              });
            }
            continue;
          }
          if (node.tag === 'p' || node.tag === 'li' || node.tag === 'blockquote') {
            const checkbox = node.children.find(
              (c): c is Extract<DocumentNode, { kind: 'element' }> =>
                c.kind === 'element' && c.tag === 'input' && (c.attributes['type'] || '').toLowerCase() === 'checkbox',
            ) ?? (
              node.children[0]?.kind === 'element' && node.children[0].tag === 'label'
                ? node.children[0].children.find(
                    (c): c is Extract<DocumentNode, { kind: 'element' }> =>
                      c.kind === 'element' && c.tag === 'input' && (c.attributes['type'] || '').toLowerCase() === 'checkbox',
                  )
                : undefined
            );
            const text = textNodes([node]).map(t => t.text).join('').trim();
            if (text || checkbox) {
              blocks.push({
                id: node.id,
                tag: node.tag as CanvasAccessibleBlock['tag'],
                text: text || (checkbox?.attributes['checked'] !== undefined ? 'Casilla marcada' : 'Casilla sin marcar'),
                ...(checkbox ? { checked: checkbox.attributes['checked'] !== undefined } : {}),
                pageIndex: resolveBlockPage(node, pageOffset),
              });
            }
            continue;
          }
          if (node.tag === 'table') {
            const rows = extractTableRows(node);
            const text = textNodes([node]).map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
            blocks.push({
              id: node.id,
              tag: 'table',
              text: text ? `Tabla: ${text.slice(0, 120)}` : 'Tabla',
              rows,
              pageIndex: resolveBlockPage(node, pageOffset),
            });
            continue;
          }
          visit(node.children);
        }
      };
      visit(sec.model.state.roots);
      pageOffset += sec.displayLists.length;
    }

    this.a11yBlocksCache = {
      roots: sections.map(s => s.model.state.roots),
      displayLists: sections.map(s => s.displayLists),
      blocks,
    };
    return blocks;
  }

  /** Devuelve el ID del bloque o celda semántica que contiene actualmente la selección del usuario. */
  getActiveAccessibleBlockId(): string | null {
    if (!this.selection) return null;
    const sec = this.engine.getSections()[this.section];
    if (!sec) return null;
    const path = findAncestorPath(sec.model.state.roots, this.selection.focus.nodeId);
    const reversed = [...path].reverse();
    const cell = reversed.find(
      (n): n is Extract<DocumentNode, { kind: 'element' }> =>
        n.kind === 'element' && (n.tag === 'td' || n.tag === 'th'),
    );
    if (cell) return `canvas-a11y-${cell.id}`;
    const block = reversed.find(
      (n): n is Extract<DocumentNode, { kind: 'element' }> =>
        n.kind === 'element' && (/^h[1-6]$/.test(n.tag) || n.tag === 'p' || n.tag === 'li' || n.tag === 'blockquote' || n.tag === 'table'),
    );
    return block ? `canvas-a11y-${block.id}` : null;
  }

  /** Mueve el caret al inicio o final del documento (para atajos Ctrl+Home / Ctrl+End). */
  moveDocumentBoundary(toEnd: boolean, extend = false): boolean {
    const sections = this.engine.getSections();
    if (!sections.length) return false;
    const targetSection = toEnd ? sections.length - 1 : 0;
    const leaves = textNodes(sections[targetSection].model.state.roots);
    if (!leaves.length) return false;
    const targetLeaf = toEnd ? leaves[leaves.length - 1] : leaves[0];
    const targetPos: DocumentPosition = { nodeId: targetLeaf.id, offset: toEnd ? targetLeaf.text.length : 0 };
    const anchor = extend && this.selection && targetSection === this.section ? this.selection.anchor : targetPos;
    this.setSelection(targetSection, { anchor, focus: targetPos });
    return true;
  }

  /** Envuelve la selección actual (o inserta un marcador en el cursor) con un ancla de comentario persistente. */
  wrapSelectionWithCommentAnchor(
    commentId: string,
    fallbackPageIndex = 0,
    fallbackLabel = 'Comentario',
  ): { quote: string; pageIndex: number } | null {
    if (!this.selection) {
      this.ensureSelection(fallbackPageIndex);
    }
    const sec = this.engine.getSections()[this.section];
    if (!sec || !this.selection) return null;
    const { anchor, focus } = this.selection;
    const isCollapsed = anchor.nodeId === focus.nodeId && anchor.offset === focus.offset;
    const quote = isCollapsed ? '' : this.selectedText().trim();

    if (isCollapsed || !quote) {
      const badgeHtml = `<span class="word-comment-badge" data-word-comment-id="${commentId}" style="background-color: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 11px;">[${fallbackLabel}]</span>`;
      const inserted = this.insertHtml(badgeHtml, true, fallbackPageIndex);
      if (!inserted) return null;
      const loc = this.findCommentLocation(commentId);
      return { quote: '', pageIndex: loc?.pageIndex ?? fallbackPageIndex };
    }

    const leaves = textNodes(sec.model.state.roots);
    const ai = leaves.findIndex(n => n.id === anchor.nodeId);
    const bi = leaves.findIndex(n => n.id === focus.nodeId);
    if (ai < 0 || bi < 0) return null;
    const forward = ai < bi || (ai === bi && anchor.offset <= focus.offset);
    const startPos = forward ? anchor : focus;
    const endPos = forward ? focus : anchor;
    const sIdx = forward ? ai : bi;
    const eIdx = forward ? bi : ai;
    const targetIds = new Set(leaves.slice(sIdx, eIdx + 1).map(n => n.id));
    let lastAnchoredLeafId: string | null = null;

    const wrapNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'text') {
          if (!targetIds.has(node.id)) {
            out.push(node);
            continue;
          }
          const from = node.id === startPos.nodeId ? startPos.offset : 0;
          const to = node.id === endPos.nodeId ? endPos.offset : node.text.length;
          if (from >= to) {
            out.push(node);
            continue;
          }
          const leftText = node.text.slice(0, from);
          const midText = node.text.slice(from, to);
          const rightText = node.text.slice(to);
          if (leftText) out.push({ id: this.uid('txt'), kind: 'text', text: leftText });
          const innerId = this.uid('cmt-t');
          lastAnchoredLeafId = innerId;
          out.push({
            id: this.uid('cmt-a'),
            kind: 'element',
            tag: 'span',
            attributes: {
              class: 'word-comment-anchor',
              'data-word-comment-id': commentId,
              style: 'background-color: #fef3c7; border-bottom: 2px solid #f59e0b;',
            },
            children: [{ id: innerId, kind: 'text', text: midText }],
          });
          if (rightText) out.push({ id: this.uid('txt-r'), kind: 'text', text: rightText });
          continue;
        }
        out.push({ ...node, children: wrapNodes(node.children) });
      }
      return out;
    };

    const nextRoots = wrapNodes(sec.model.state.roots);
    const nextPos: DocumentPosition = lastAnchoredLeafId
      ? { nodeId: lastAnchoredLeafId, offset: quote.length }
      : endPos;
    const ok = this.commitCustomState(nextRoots, { anchor: nextPos, focus: nextPos }, 'comment-anchor');
    if (!ok) return null;
    const loc = this.findCommentLocation(commentId);
    return { quote, pageIndex: loc?.pageIndex ?? fallbackPageIndex };
  }

  /** Elimina el ancla o insignia visual de un comentario preservando el texto del documento. */
  removeCommentAnchor(commentId: string): boolean {
    const snaps = this.engine.snapshot();
    let changedAny = false;
    const cleanNodes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let localChanged = false;
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'text') {
          out.push(node);
          continue;
        }
        const cid = node.attributes['data-word-comment-id'];
        if (cid === commentId) {
          localChanged = true;
          const isBadge = (node.attributes['class'] || '').split(/\s+/).includes('word-comment-badge');
          if (!isBadge) {
            out.push(...cleanNodes(node.children));
          }
          continue;
        }
        const nextChildren = cleanNodes(node.children);
        if (nextChildren !== node.children) {
          localChanged = true;
          out.push({ ...node, children: nextChildren });
        } else {
          out.push(node);
        }
      }
      if (localChanged) changedAny = true;
      return localChanged ? out : nodes;
    };

    const nextSnaps = snaps.map(snap => {
      const roots = cleanNodes(snap.state.roots);
      return roots === snap.state.roots
        ? snap
        : { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots } };
    });
    if (!changedAny) return false;
    const before = this.snapshot();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.engine.restore(nextSnaps, this.geometry);
    this.onCheckpoint?.();
    return true;
  }

  private findNodeLocationAcrossSections(
    predicate: (node: Extract<DocumentNode, { kind: 'element' }>) => boolean,
  ): { sectionIndex: number; pageIndex: number; y: number; position: DocumentPosition } | null {
    const sections = this.engine.getSections();
    let basePageIdx = 0;
    const findFirstTarget = (nodes: readonly DocumentNode[]): Extract<DocumentNode, { kind: 'element' }> | null => {
      for (const node of nodes) {
        if (node.kind !== 'element') continue;
        if (predicate(node)) return node;
        const hit = findFirstTarget(node.children);
        if (hit) return hit;
      }
      return null;
    };

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      const hitNode = findFirstTarget(sec.model.state.roots);
      if (hitNode) {
        const leaves = textNodes([hitNode]);
        const targetLeaf = leaves[0];
        if (targetLeaf) {
          for (let p = 0; p < sec.displayLists.length; p++) {
            for (const cmd of sec.displayLists[p].commands) {
              if (cmd.kind === 'text' && cmd.source && cmd.source.start.nodeId === targetLeaf.id) {
                return {
                  sectionIndex: s,
                  pageIndex: basePageIdx + p,
                  y: cmd.source.top,
                  position: { nodeId: targetLeaf.id, offset: 0 },
                };
              }
            }
          }
          return {
            sectionIndex: s,
            pageIndex: basePageIdx,
            y: 0,
            position: { nodeId: targetLeaf.id, offset: 0 },
          };
        }
      }
      basePageIdx += sec.displayLists.length;
    }
    return null;
  }

  /** Localiza la página y coordenada vertical de un comentario anclado en el documento. */
  findCommentLocation(commentId: string): { sectionIndex: number; pageIndex: number; y: number } | null {
    const hit = this.findNodeLocationAcrossSections(n => n.attributes['data-word-comment-id'] === commentId);
    return hit ? { sectionIndex: hit.sectionIndex, pageIndex: hit.pageIndex, y: hit.y } : null;
  }

  /** Selecciona y ubica el cursor sobre un comentario anclado. */
  jumpToComment(commentId: string): { sectionIndex: number; pageIndex: number; y: number } | null {
    const hit = this.findNodeLocationAcrossSections(n => n.attributes['data-word-comment-id'] === commentId);
    if (!hit) return null;
    this.setSelection(hit.sectionIndex, { anchor: hit.position, focus: hit.position });
    return { sectionIndex: hit.sectionIndex, pageIndex: hit.pageIndex, y: hit.y };
  }

  /** Lista todas las inserciones y borrados rastreados (`<ins>` / `<del>`) en el documento. */
  listRevisions(): DocumentRevisionItem[] {
    const sections = this.engine.getSections();
    const items: DocumentRevisionItem[] = [];
    let basePageIdx = 0;

    const locateLeaf = (secIdx: number, leafId: string | undefined, basePage: number): { pageIndex: number; y: number } => {
      if (!leafId) return { pageIndex: basePage, y: 0 };
      const sec = sections[secIdx];
      for (let p = 0; p < sec.displayLists.length; p++) {
        for (const cmd of sec.displayLists[p].commands) {
          if (cmd.kind === 'text' && cmd.source && cmd.source.start.nodeId === leafId) {
            return { pageIndex: basePage + p, y: cmd.source.top };
          }
        }
      }
      return { pageIndex: basePage, y: 0 };
    };

    for (let s = 0; s < sections.length; s++) {
      const visit = (nodes: readonly DocumentNode[]) => {
        for (const node of nodes) {
          if (node.kind !== 'element') continue;
          const revAttr = node.attributes['data-word-rev'];
          const kind = revAttr === 'del' || node.tag === 'del'
            ? 'del'
            : revAttr === 'ins' || node.tag === 'ins'
              ? 'ins'
              : null;
          if (kind && ('data-word-rev' in node.attributes || node.tag === 'ins' || node.tag === 'del')) {
            const leaves = textNodes([node]);
            const loc = locateLeaf(s, leaves[0]?.id, basePageIdx);
            const atRaw = Number(node.attributes['data-word-rev-at']);
            items.push({
              id: node.attributes['data-word-rev-id'] || node.id,
              kind,
              text: leaves.map(l => l.text).join(''),
              author: node.attributes['data-word-rev-author'] || 'Usuario',
              createdAt: Number.isFinite(atRaw) && atRaw > 0 ? atRaw : Date.now(),
              pageIndex: loc.pageIndex,
              y: loc.y,
            });
            continue;
          }
          visit(node.children);
        }
      };
      visit(sections[s].model.state.roots);
      basePageIdx += sections[s].displayLists.length;
    }
    return items;
  }

  /** Ubica y selecciona una revisión rastreada (`<ins>` / `<del>`). */
  jumpToRevision(revId: string): { sectionIndex: number; pageIndex: number; y: number } | null {
    const hit = this.findNodeLocationAcrossSections(
      n => (n.attributes['data-word-rev-id'] || n.id) === revId && ('data-word-rev' in n.attributes || n.tag === 'ins' || n.tag === 'del'),
    );
    if (!hit) return null;
    this.setSelection(hit.sectionIndex, { anchor: hit.position, focus: hit.position });
    return { sectionIndex: hit.sectionIndex, pageIndex: hit.pageIndex, y: hit.y };
  }

  private resolveRevisions(action: 'accept' | 'reject', revId?: string): boolean {
    const snaps = this.engine.snapshot();
    let changedAny = false;

    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      let localChanged = false;
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'text') {
          out.push(node);
          continue;
        }
        const revAttr = node.attributes['data-word-rev'];
        const isRev = 'data-word-rev' in node.attributes || node.tag === 'ins' || node.tag === 'del';
        const nodeRevId = node.attributes['data-word-rev-id'] || node.id;
        if (isRev && (!revId || nodeRevId === revId)) {
          localChanged = true;
          const kind = revAttr === 'del' || node.tag === 'del' ? 'del' : 'ins';
          const keep = (action === 'accept' && kind === 'ins') || (action === 'reject' && kind === 'del');
          if (keep) {
            out.push(...rewrite(node.children));
          }
          continue;
        }
        const nextChildren = rewrite(node.children);
        if (nextChildren !== node.children) {
          localChanged = true;
          out.push({ ...node, children: nextChildren });
        } else {
          out.push(node);
        }
      }
      if (localChanged) changedAny = true;
      return localChanged ? out : nodes;
    };

    const nextSnaps = snaps.map(snap => {
      const roots = rewrite(snap.state.roots);
      return roots === snap.state.roots
        ? snap
        : { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots } };
    });
    if (!changedAny) return false;
    const before = this.snapshot();
    this.past.push(before);
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.engine.restore(nextSnaps, this.geometry);
    this.selection = null;
    this.ensureSelection(0);
    this.onCheckpoint?.();
    return true;
  }

  acceptRevision(revId: string): boolean { return this.resolveRevisions('accept', revId); }
  rejectRevision(revId: string): boolean { return this.resolveRevisions('reject', revId); }
  acceptAllRevisions(): boolean { return this.resolveRevisions('accept'); }
  rejectAllRevisions(): boolean { return this.resolveRevisions('reject'); }
}
