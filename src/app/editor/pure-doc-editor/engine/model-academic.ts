import {
  DocumentNode,
  DocumentPosition,
  DocumentSelection,
  DocumentState,
  findAncestorPath,
  getSubtreeIds,
  textNodes,
} from './document-model';
import type { PageDisplayList } from './canvas-page-renderer';
import type { DocumentSectionState, EngineSectionSnapshot } from './document-engine';
import type { HeadingItem, StyleTemplate } from '../models/word-document.model';
import { isFixedTableStyle, styleModelTable } from '../utils/table-styling';
import type { AcademicObject, BibliographicSource, CaptionRequest, CitationRequest } from '../models/academic.model';
import type { AcademicNote, AcademicSectionRequest } from '../models/academic-sections.model';
import { wordCount } from '../utils/academic-insertion';
import {
  AcademicInlineSegment,
  normalizeAcademicSegments,
  parseCitationSourceIds,
  referenceEligible,
  referenceSegments,
  renderCitationGroupSegments,
  sortedSources,
} from '../utils/apa-references';
import { academicObjectLabel } from '../utils/apa-objects';
import { appendixLetter } from '../utils/apa-sections';
import { ObjectIndexEntry, TOC_TITLE_RE, resolveTocBaseLevel, tocEntryLayout } from '../utils/table-of-contents';

type ElementNode = Extract<DocumentNode, { kind: 'element' }>;

export function parseCssStyleMap(styleAttr: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!styleAttr) return map;
  for (const part of styleAttr.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (key && val) map[key] = val;
  }
  return map;
}

export function serializeCssStyleMap(map: Readonly<Record<string, string>>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

export function reIdNodes(nodes: readonly DocumentNode[], uid: (prefix: string) => string): DocumentNode[] {
  return nodes.map(node =>
    node.kind === 'text'
      ? { ...node, id: uid('t') }
      : { ...node, id: uid(node.tag), children: reIdNodes(node.children, uid) },
  );
}

/** Converts typed academic inline segments directly into DocumentNode children without HTML serialization. */
export function academicSegmentsToDocumentNodes(
  segments: readonly AcademicInlineSegment[],
  uid: (prefix: string) => string,
): DocumentNode[] {
  const out: DocumentNode[] = [];
  for (const seg of normalizeAcademicSegments(segments)) {
    if (!seg.text) continue;
    if (seg.kind === 'text') {
      out.push({ id: uid('t'), kind: 'text', text: seg.text });
    } else if (seg.kind === 'italic') {
      out.push({
        id: uid('i'),
        kind: 'element',
        tag: 'i',
        attributes: {},
        children: [{ id: uid('t'), kind: 'text', text: seg.text }],
      });
    } else {
      out.push({
        id: uid('a'),
        kind: 'element',
        tag: 'a',
        attributes: { href: seg.href, rel: 'noopener noreferrer' },
        children: [{ id: uid('t'), kind: 'text', text: seg.text }],
      });
    }
  }
  return out;
}

function documentNodesToAcademicSegments(nodes: readonly DocumentNode[]): AcademicInlineSegment[] | null {
  const out: AcademicInlineSegment[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push({ kind: 'text', text: node.text });
      continue;
    }
    if (node.kind === 'element' && (node.tag === 'i' || node.tag === 'em') && node.children.every(c => c.kind === 'text')) {
      out.push({ kind: 'italic', text: node.children.map(c => c.text).join('') });
      continue;
    }
    if (node.kind === 'element' && node.tag === 'a' && node.children.every(c => c.kind === 'text')) {
      out.push({ kind: 'link', text: node.children.map(c => c.text).join(''), href: node.attributes['href'] || '' });
      continue;
    }
    return null;
  }
  return normalizeAcademicSegments(out);
}

function segmentsEqual(a: readonly AcademicInlineSegment[] | null, b: readonly AcademicInlineSegment[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((seg, idx) => {
    const other = b[idx];
    if (seg.kind !== other.kind || seg.text !== other.text) return false;
    return seg.kind !== 'link' || (other.kind === 'link' && seg.href === other.href);
  });
}

/**
 * Deletes any selected range if non-collapsed and inserts `insertedNodes` at the caret
 * position inside `roots`, returning the updated tree and caret positioned after insertion.
 */
export function spliceInlineNodesAtSelection(
  roots: readonly DocumentNode[],
  selection: DocumentSelection,
  insertedNodes: readonly DocumentNode[],
  uid: (prefix: string) => string,
): { roots: readonly DocumentNode[]; selectionAfter: DocumentSelection } | null {
  let baseRoots = roots;
  let caretPos: DocumentPosition = { ...selection.anchor };

  if (selection.anchor.nodeId !== selection.focus.nodeId || selection.anchor.offset !== selection.focus.offset) {
    const leaves = textNodes(baseRoots);
    let a = selection.anchor;
    let b = selection.focus;
    let ai = leaves.findIndex(n => n.id === a.nodeId);
    let bi = leaves.findIndex(n => n.id === b.nodeId);
    if (ai < 0 || bi < 0) return null;
    if (ai > bi || (ai === bi && a.offset > b.offset)) {
      [a, b] = [b, a];
      [ai, bi] = [bi, ai];
    }
    const replaceMap = new Map<string, string>();
    for (let i = ai; i <= bi; i++) {
      const leaf = leaves[i];
      if (i === ai && i === bi) replaceMap.set(leaf.id, leaf.text.slice(0, a.offset) + leaf.text.slice(b.offset));
      else if (i === ai) replaceMap.set(leaf.id, leaf.text.slice(0, a.offset));
      else if (i === bi) replaceMap.set(leaf.id, leaf.text.slice(b.offset));
      else replaceMap.set(leaf.id, '');
    }
    const strip = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(n =>
        n.kind === 'text'
          ? replaceMap.has(n.id)
            ? { ...n, text: replaceMap.get(n.id)! }
            : n
          : { ...n, children: strip(n.children) },
      );
    baseRoots = strip(baseRoots);
    caretPos = { nodeId: a.nodeId, offset: a.offset };
  }

  let inserted = false;
  const insertAtLeaf = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
    const out: DocumentNode[] = [];
    for (const node of nodes) {
      if (node.kind === 'text' && node.id === caretPos.nodeId && !inserted) {
        const beforeText = node.text.slice(0, caretPos.offset);
        const afterText = node.text.slice(caretPos.offset);
        if (beforeText) out.push({ id: uid('t'), kind: 'text', text: beforeText });
        out.push(...insertedNodes);
        if (afterText || (!beforeText && !insertedNodes.length)) {
          out.push({ id: uid('t'), kind: 'text', text: afterText });
        }
        inserted = true;
      } else if (node.kind === 'element' && getSubtreeIds(node).has(caretPos.nodeId)) {
        out.push({ ...node, children: insertAtLeaf(node.children) });
      } else {
        out.push(node);
      }
    }
    return out;
  };

  let nextRoots = insertAtLeaf(baseRoots);
  if (!inserted) {
    // Target leaf might be empty block ID when cursor sits in empty paragraph.
    const insertInBlock = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if (node.id === caretPos.nodeId) {
          inserted = true;
          return { ...node, children: [...node.children, ...insertedNodes] };
        }
        return getSubtreeIds(node).has(caretPos.nodeId)
          ? { ...node, children: insertInBlock(node.children) }
          : node;
      });
    nextRoots = insertInBlock(baseRoots);
  }
  if (!inserted) return null;

  const insertedLeaves = textNodes(insertedNodes);
  const lastLeaf = insertedLeaves[insertedLeaves.length - 1];
  const afterLeaf = textNodes(nextRoots).find((_leaf, idx, arr) => idx > 0 && arr[idx - 1]?.id === lastLeaf?.id);
  const selectionAfter: DocumentSelection = lastLeaf
    ? afterLeaf && !insertedNodes.some(n => getSubtreeIds(n).has(afterLeaf.id))
      ? { anchor: { nodeId: afterLeaf.id, offset: 0 }, focus: { nodeId: afterLeaf.id, offset: 0 } }
      : { anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length }, focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length } }
    : { anchor: caretPos, focus: caretPos };

  return { roots: nextRoots, selectionAfter };
}

/** Inserts block nodes immediately after the active block (replacing it if empty). */
export function insertBlocksAtSelection(
  roots: readonly DocumentNode[],
  selection: DocumentSelection | null,
  blocks: readonly DocumentNode[],
  uid: (prefix: string) => string,
): { roots: readonly DocumentNode[]; selectionAfter: DocumentSelection | null } {
  const path = selection ? findAncestorPath(roots, selection.focus.nodeId) : [];
  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li', 'div', 'table']);
  const targetBlock = [...path].reverse().find((n): n is ElementNode => n.kind === 'element' && blockTags.has(n.tag));
  const hasMedia = (node: DocumentNode): boolean =>
    node.kind === 'element' && (['img', 'svg', 'table'].includes(node.tag) || node.children.some(hasMedia));
  const targetEmpty =
    !!targetBlock && textNodes([targetBlock]).every(t => !t.text.trim()) && !hasMedia(targetBlock);

  let nextRoots: readonly DocumentNode[];
  if (targetBlock) {
    let placed = false;
    const place = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.id === targetBlock.id && !placed) {
          if (targetEmpty) out.push(...blocks);
          else out.push(n, ...blocks);
          placed = true;
        } else if (n.kind === 'element' && getSubtreeIds(n).has(targetBlock.id)) {
          out.push({ ...n, children: place(n.children) });
        } else {
          out.push(n);
        }
      }
      return out;
    };
    nextRoots = place(roots);
  } else {
    nextRoots = [...roots, ...blocks];
  }

  const leaves = textNodes(blocks);
  const lastLeaf = leaves[leaves.length - 1];
  const selectionAfter: DocumentSelection | null = lastLeaf
    ? { anchor: { nodeId: lastLeaf.id, offset: lastLeaf.text.length }, focus: { nodeId: lastLeaf.id, offset: lastLeaf.text.length } }
    : selection ?? (textNodes(nextRoots)[0]
      ? { anchor: { nodeId: textNodes(nextRoots)[0].id, offset: 0 }, focus: { nodeId: textNodes(nextRoots)[0].id, offset: 0 } }
      : { anchor: { nodeId: uid('t'), offset: 0 }, focus: { nodeId: uid('t'), offset: 0 } });
  return { roots: nextRoots, selectionAfter };
}

function stripPlainAcademicColors(node: DocumentNode, inSvg = false): DocumentNode {
  if (node.kind === 'text') return node;
  const isSvg = inSvg || node.tag === 'svg';
  if (isSvg || node.tag === 'img') return node;
  const styleMap = parseCssStyleMap(node.attributes['style']);
  delete styleMap['background'];
  delete styleMap['text-shadow'];
  styleMap['background-color'] = 'transparent';
  styleMap['background-image'] = 'none';
  styleMap['color'] = '#000000';
  const nextAttrs: Record<string, string> = { ...node.attributes };
  delete nextAttrs['bgcolor'];
  delete nextAttrs['color'];
  nextAttrs['style'] = serializeCssStyleMap(styleMap);
  const nextChildren = node.children.map(c => stripPlainAcademicColors(c, false));
  return { ...node, attributes: nextAttrs, children: nextChildren };
}

function normalizeInlineEmphasis(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  return nodes.map(node => {
    if (node.kind === 'text') return node;
    if (node.tag === 'svg' || node.tag === 'img') return node;
    const styleMap = parseCssStyleMap(node.attributes['style']);
    let attrsChanged = false;
    if (node.tag === 'i' || node.tag === 'em') {
      styleMap['font-style'] = 'italic';
      attrsChanged = true;
    } else if (node.tag === 'b' || node.tag === 'strong') {
      styleMap['font-weight'] = 'bold';
      attrsChanged = true;
    }
    const nextCh = normalizeInlineEmphasis(node.children);
    const nextAttrs = attrsChanged
      ? { ...node.attributes, style: serializeCssStyleMap(styleMap) }
      : node.attributes;
    return attrsChanged || nextCh !== node.children ? { ...node, attributes: nextAttrs, children: nextCh } : node;
  });
}

export function styleModelApaParagraph(node: ElementNode, template: StyleTemplate, role: string): ElementNode {
  const cleaned = stripPlainAcademicColors(node) as ElementNode;
  const rule = template.rules.P;
  const fontFamilyCss = rule.fontFamily.includes(',') ? rule.fontFamily : `"${rule.fontFamily}", serif`;
  const styleMap: Record<string, string> = {
    ...parseCssStyleMap(cleaned.attributes['style']),
    'font-family': fontFamilyCss,
    'font-size': role === 'footnote' ? `${Math.max(8, rule.fontSizePt - 2)}pt` : `${rule.fontSizePt}pt`,
    color: '#000000',
    'line-height': role === 'footnote' ? '1' : '2',
    'margin-top': role === 'author-note-heading' ? `${rule.fontSizePt * 2}pt` : '0pt',
    'margin-bottom': role === 'cover-title' ? `${rule.fontSizePt * 2}pt` : '0pt',
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
        ? 'bold'
        : 'normal',
    'font-style': role === 'title' ? 'italic' : 'normal',
    'text-decoration': 'none',
  };
  return {
    ...cleaned,
    attributes: {
      ...cleaned.attributes,
      'data-word-line-spacing': styleMap['line-height'],
      style: serializeCssStyleMap(styleMap),
    },
    children: normalizeInlineEmphasis(cleaned.children),
  };
}

export function styleModelApaTable(table: ElementNode, template: StyleTemplate): ElementNode {
  if (isFixedTableStyle(table)) return table;
  if (template.tableStyle && template.tableStyle.mode !== 'inherit') return styleModelTable(table, template.tableStyle);
  const pRule = template.rules.P;
  const fontFamilyCss = pRule.fontFamily.includes(',') ? pRule.fontFamily : `"${pRule.fontFamily}", serif`;
  const cleanInline = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
    nodes.map(n => {
      if (n.kind === 'text') return n;
      const children = cleanInline(n.children);
      if (['span', 'font', 'b', 'strong', 'i', 'em', 'a', 'small', 'big'].includes(n.tag)) {
        const sm = parseCssStyleMap(n.attributes['style']);
        sm['font-family'] = 'inherit';
        sm['font-size'] = 'inherit';
        sm['color'] = '#000000';
        const attrs: Record<string, string> = { ...n.attributes, style: serializeCssStyleMap(sm) };
        if (n.tag === 'font') {
          delete attrs['face'];
          delete attrs['size'];
          delete attrs['color'];
        }
        return { ...n, attributes: attrs, children };
      }
      return children === n.children ? n : { ...n, children };
    });

  let rowIdx = 0;
  const styleTableChildren = (nodes: readonly DocumentNode[], parentTag: string): readonly DocumentNode[] =>
    nodes.map(n => {
      if (n.kind !== 'element') return n;
      if (['thead', 'tbody', 'tfoot', 'colgroup', 'col'].includes(n.tag)) {
        const sm = parseCssStyleMap(n.attributes['style']);
        sm['border'] = 'none';
        return {
          ...n,
          attributes: { ...n.attributes, style: serializeCssStyleMap(sm) },
          children: styleTableChildren(n.children, n.tag),
        };
      }
      if (n.tag === 'tr') {
        const currentRow = rowIdx++;
        const isHeader = parentTag === 'thead' || currentRow === 0;
        const isFoot = parentTag === 'tfoot';
        const trStyle = parseCssStyleMap(n.attributes['style']);
        trStyle['border'] = 'none';
        return {
          ...n,
          attributes: { ...n.attributes, style: serializeCssStyleMap(trStyle) },
          children: n.children.map(cell => {
            if (cell.kind !== 'element' || (cell.tag !== 'td' && cell.tag !== 'th')) return cell;
            const cStyle: Record<string, string> = {
              ...parseCssStyleMap(cell.attributes['style']),
              border: 'none',
              'border-bottom': isHeader ? '1px solid #000' : 'none',
              'border-top': (isFoot || cell.attributes['data-word-top-border'] === 'true') ? '1px solid #000' : 'none',
              'text-align': isHeader ? 'center' : 'left',
              'font-family': fontFamilyCss,
              'font-size': `${pRule.fontSizePt}pt`,
              'line-height': '1.1',
              padding: '2px 4px',
              color: '#000000',
              'background-color': 'transparent',
            };
            const cellChildren = cleanInline(cell.children).map(ch => {
              if (ch.kind !== 'element' || ch.tag !== 'p') return ch;
              const styledP = styleModelApaParagraph(ch, template, 'body');
              const pSm = parseCssStyleMap(styledP.attributes['style']);
              pSm['line-height'] = '1.1';
              pSm['margin-top'] = '0pt';
              pSm['margin-bottom'] = '0pt';
              pSm['text-indent'] = '0pt';
              pSm['text-align'] = cStyle['text-align'];
              return { ...styledP, attributes: { ...styledP.attributes, 'data-word-line-spacing': '1.1', style: serializeCssStyleMap(pSm) } };
            });
            return {
              ...cell,
              attributes: { ...cell.attributes, style: serializeCssStyleMap(cStyle) },
              children: cellChildren,
            };
          }),
        };
      }
      return n;
    });

  const tStyle: Record<string, string> = {
    ...parseCssStyleMap(table.attributes['style']),
    border: 'none',
    'border-collapse': 'collapse',
    'border-top': '1px solid #000',
    'border-bottom': '1px solid #000',
    'background-color': '#ffffff',
    'font-family': fontFamilyCss,
    'font-size': `${pRule.fontSizePt}pt`,
    'line-height': '1.1',
    'max-width': '100%',
    color: '#000000',
  };
  return {
    ...table,
    attributes: { ...table.attributes, 'data-apa-table': 'true', style: serializeCssStyleMap(tStyle) },
    children: styleTableChildren(table.children, 'table'),
  };
}

export function buildApaParagraphNode(
  text: string,
  role: string,
  template: StyleTemplate,
  uid: (prefix: string) => string,
  extraAttrs: Record<string, string> = {},
  extraChildren?: DocumentNode[],
): ElementNode {
  const children: DocumentNode[] = extraChildren ?? [{ id: uid('t'), kind: 'text', text }];
  return styleModelApaParagraph(
    {
      id: uid('p'),
      kind: 'element',
      tag: 'p',
      attributes: { 'data-apa-role': role, ...extraAttrs },
      children,
    },
    template,
    role,
  );
}

/** Collects all unique source IDs referenced in document citations or figure/table notes. */
export function collectCitedIdsFromSections(sections: readonly DocumentSectionState[]): Set<string> {
  const ids = new Set<string>();
  const scan = (nodes: readonly DocumentNode[]) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      if ('data-apa-source' in n.attributes && n.attributes['data-apa-source']) {
        ids.add(n.attributes['data-apa-source']);
      }
      if ('data-word-citation' in n.attributes) {
        for (const cid of parseCitationSourceIds(n.attributes['data-word-source-ids'], n.attributes['data-word-source-id'])) {
          ids.add(cid);
        }
      }
      scan(n.children);
    }
  };
  for (const sec of sections) scan(sec.model.state.roots);
  return ids;
}

export function refreshModelCitationsInSnaps(
  snaps: EngineSectionSnapshot[],
  allSources: BibliographicSource[],
  uid: (prefix: string) => string,
): boolean {
  const used = new Set<string>();
  let anySectionChanged = false;

  for (let sIdx = 0; sIdx < snaps.length; sIdx++) {
    const snap = snaps[sIdx];
    let secChanged = false;
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes.map(node => {
        if (node.kind !== 'element') return node;
        if ('data-word-citation' in node.attributes) {
          const nextSegments = renderCitationGroupSegments(
            {
              sourceIds: node.attributes['data-word-source-ids'],
              sourceId: node.attributes['data-word-source-id'],
              narrative: node.attributes['data-narrative'],
              locator: node.attributes['data-locator'],
              secondaryAuthor: node.attributes['data-secondary-author'],
              secondaryYear: node.attributes['data-secondary-year'],
            },
            allSources,
            used,
          );
          const currentSegments = documentNodesToAcademicSegments(node.children);
          if (!segmentsEqual(currentSegments, nextSegments)) {
            secChanged = true;
            const children = academicSegmentsToDocumentNodes(nextSegments, uid);
            return { ...node, children: children.length ? children : [{ id: uid('t'), kind: 'text', text: '' }] };
          }
          return node;
        }
        const nextChildren = rewrite(node.children);
        return nextChildren === node.children ? node : { ...node, children: nextChildren };
      });

    const nextRoots = rewrite(snap.state.roots);
    if (secChanged) {
      anySectionChanged = true;
      snaps[sIdx] = { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots: nextRoots } };
    }
  }
  return anySectionChanged;
}

export function buildBibliographyParagraphNodes(
  citedSources: BibliographicSource[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
): ElementNode[] {
  const out: ElementNode[] = [
    buildApaParagraphNode('Referencias', 'heading', template, uid, { 'data-word-bibliography': 'heading' }),
  ];
  for (const source of citedSources) {
    const segs = referenceSegments(source, citedSources);
    const children = academicSegmentsToDocumentNodes(segs, uid);
    out.push(
      buildApaParagraphNode('', 'reference', template, uid, {
        'data-word-bibliography': 'entry',
        'data-reference-source': source.id,
      }, children.length ? children : [{ id: uid('t'), kind: 'text', text: '' }]),
    );
  }
  return out;
}

export function refreshModelBibliographyInSnaps(
  snaps: EngineSectionSnapshot[],
  allSources: BibliographicSource[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
): { found: boolean; changed: boolean } {
  const citedIds = new Set<string>();
  const collect = (nodes: readonly DocumentNode[]) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      if ('data-apa-source' in n.attributes && n.attributes['data-apa-source']) citedIds.add(n.attributes['data-apa-source']);
      if ('data-word-citation' in n.attributes) {
        for (const cid of parseCitationSourceIds(n.attributes['data-word-source-ids'], n.attributes['data-word-source-id'])) {
          citedIds.add(cid);
        }
      }
      collect(n.children);
    }
  };
  for (const snap of snaps) collect(snap.state.roots);
  const cited = sortedSources(allSources.filter(s => citedIds.has(s.id))).filter(referenceEligible);

  let found = false;
  let changed = false;
  let insertedFresh = false;
  const bibNodes = buildBibliographyParagraphNodes(cited, template, uid);

  for (let sIdx = 0; sIdx < snaps.length; sIdx++) {
    const snap = snaps[sIdx];
    const hasBib = (nodes: readonly DocumentNode[]): boolean =>
      nodes.some(n => n.kind === 'element' && ('data-word-bibliography' in n.attributes || hasBib(n.children)));
    if (!hasBib(snap.state.roots)) continue;
    found = true;
    changed = true;
    const replaceIn = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const n of nodes) {
        if (n.kind === 'element' && 'data-word-bibliography' in n.attributes) {
          if (!insertedFresh) {
            out.push(...bibNodes);
            insertedFresh = true;
          }
          continue;
        }
        if (n.kind === 'element') {
          out.push({ ...n, children: replaceIn(n.children) });
        } else {
          out.push(n);
        }
      }
      return out;
    };
    const nextRoots = replaceIn(snap.state.roots);
    snaps[sIdx] = { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots: nextRoots } };
  }
  return { found, changed };
}

export function buildCitationSnippetNodes(
  request: CitationRequest,
  source: BibliographicSource,
  allSources: BibliographicSource[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
): { mode: 'blockquote'; nodes: DocumentNode[] } | { mode: 'inline'; nodes: DocumentNode[] } {
  const sourceIds =
    request.quoteText?.trim() || request.secondaryAuthor?.trim()
      ? [source.id]
      : [...new Set([source.id, ...(request.additionalIds || [])])];
  const attrs: Record<string, string> = {
    'data-word-citation': 'apa7',
    'data-word-source-id': source.id,
    'data-narrative': String(request.quoteText?.trim() ? false : request.narrative),
    'data-locator': request.locator,
    'data-word-source-ids': JSON.stringify(sourceIds),
    'data-secondary-author': request.secondaryAuthor || '',
    'data-secondary-year': request.secondaryYear || '',
  };
  const renderedSegments = renderCitationGroupSegments(
    {
      sourceIds: attrs['data-word-source-ids'],
      sourceId: attrs['data-word-source-id'],
      narrative: attrs['data-narrative'],
      locator: attrs['data-locator'],
      secondaryAuthor: attrs['data-secondary-author'],
      secondaryYear: attrs['data-secondary-year'],
    },
    allSources,
  );
  const children = academicSegmentsToDocumentNodes(renderedSegments, uid);
  const spanNode: ElementNode = {
    id: uid('cite'),
    kind: 'element',
    tag: 'span',
    attributes: attrs,
    children: children.length ? children : [{ id: uid('t'), kind: 'text', text: '' }],
  };

  const quoted = request.quoteText?.trim();
  if (quoted && wordCount(quoted) >= 40) {
    const parts = quoted.split(/\n+/).filter(Boolean);
    const quoteParas: ElementNode[] = parts.map((text: string, idx: number) => {
      const p = buildApaParagraphNode(text, 'quote', template, uid);
      const sm = parseCssStyleMap(p.attributes['style']);
      sm['text-indent'] = idx ? '36pt' : '0pt';
      const children = [...p.children];
      if (idx === parts.length - 1) {
        const lastText = textNodes(children).at(-1);
        if (!/[.!?]$/.test(lastText?.text || '')) {
          children.push({ id: uid('t'), kind: 'text', text: '.' });
        }
        children.push({ id: uid('t'), kind: 'text', text: ' ' }, spanNode);
      }
      return { ...p, attributes: { ...p.attributes, style: serializeCssStyleMap(sm) }, children };
    });
    const blockquote: ElementNode = {
      id: uid('blockquote'),
      kind: 'element',
      tag: 'blockquote',
      attributes: {
        'data-apa-quote': 'block',
        style: 'margin: 0pt 0pt 0pt 36pt; padding: 0; border: none; background-color: transparent; font-style: normal; line-height: 2',
      },
      children: quoteParas,
    };
    return { mode: 'blockquote', nodes: [blockquote] };
  }

  if (quoted) {
    const bodyQuote = quoted.endsWith('.') && !quoted.endsWith('...') ? quoted.slice(0, -1) : quoted;
    const children: DocumentNode[] = [
      { id: uid('t'), kind: 'text', text: `“${bodyQuote}” ` },
      spanNode,
      ...(request.quoteEnding ? [{ id: uid('t'), kind: 'text' as const, text: '.' }] : []),
    ];
    return {
      mode: 'inline',
      nodes: [{
        id: uid('shortquote'),
        kind: 'element',
        tag: 'span',
        attributes: { 'data-apa-short-quote': 'true' },
        children,
      }],
    };
  }

  return { mode: 'inline', nodes: [spanNode] };
}

export function collectModelNotes(sections: readonly { model: { state: { roots: readonly DocumentNode[] } } }[]): AcademicNote[] {
  const notes: AcademicNote[] = [];
  const seen = new Set<string>();
  let footnote = 0;
  let endnote = 0;
  const walk = (nodes: readonly DocumentNode[]) => {
    for (const node of nodes) {
      if (node.kind !== 'element') continue;
      const id = node.attributes['data-word-note-id'];
      if (id && !seen.has(id)) {
        seen.add(id);
        const kind = node.attributes['data-note-kind'] === 'endnote' ? 'endnote' : 'footnote';
        notes.push({
          id,
          kind,
          text: node.attributes['data-note-content'] || '',
          number: kind === 'footnote' ? ++footnote : ++endnote,
        });
      }
      walk(node.children);
    }
  };
  for (const sec of sections) walk(sec.model.state.roots);
  return notes;
}

export function collectNotesFromSnaps(snaps: readonly EngineSectionSnapshot[]): AcademicNote[] {
  return collectModelNotes(snaps.map(s => ({ model: { state: s.state } })));
}

export function renumberModelNotesInSnaps(
  snaps: EngineSectionSnapshot[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
): AcademicNote[] {
  const notes = collectNotesFromSnaps(snaps);
  const byId = new Map(notes.map(n => [n.id, n]));

  for (let sIdx = 0; sIdx < snaps.length; sIdx++) {
    const snap = snaps[sIdx];
    let changed = false;
    const rewrite = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind !== 'element') {
          out.push(node);
          continue;
        }
        const noteId = node.attributes['data-word-note-id'];
        if (noteId) {
          const note = byId.get(noteId);
          if (note) {
            const nextAttrs: Record<string, string> = {
              ...node.attributes,
              id: `note-call-${note.id}`,
              contenteditable: 'false',
              style: 'vertical-align: super; font-size: 75%; color: #000000; text-decoration: none',
              'data-note-font': node.attributes['data-note-font'] || template.rules.P.fontFamily,
              'data-note-font-size': node.attributes['data-note-font-size'] || String(template.rules.P.fontSizePt),
              ...(node.tag === 'a' ? { href: `#note-${note.id}` } : {}),
            };
            const numStr = String(note.number);
            const curText = textNodes(node.children).map(t => t.text).join('');
            if (
              curText !== numStr ||
              node.attributes['id'] !== nextAttrs['id'] ||
              node.attributes['href'] !== nextAttrs['href']
            ) {
              changed = true;
              out.push({
                ...node,
                attributes: nextAttrs,
                children: [{ id: node.children[0]?.kind === 'text' ? node.children[0].id : uid('nt'), kind: 'text', text: numStr }],
              });
              continue;
            }
          }
          out.push(node);
          continue;
        }
        const entryId = node.attributes['data-note-entry-id'];
        if (entryId) {
          const note = byId.get(entryId);
          if (!note) {
            changed = true;
            continue;
          }
        }
        const nextCh = rewrite(node.children);
        if (nextCh !== node.children) changed = true;
        out.push(nextCh === node.children ? node : { ...node, children: nextCh });
      }
      return out;
    };
    const nextRoots = rewrite(snap.state.roots);
    if (changed) {
      snaps[sIdx] = { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots: nextRoots } };
    }
  }
  return notes;
}

export function buildNoteListNode(
  notes: readonly AcademicNote[],
  template: StyleTemplate,
  kind: 'footnote' | 'endnote',
  uid: (prefix: string) => string,
): ElementNode {
  const children: DocumentNode[] = [];
  if (kind === 'endnote') {
    children.push(buildApaParagraphNode('Notas', 'heading', template, uid));
  }
  for (const note of notes.filter(n => n.kind === kind)) {
    const link: ElementNode = {
      id: uid('nback'),
      kind: 'element',
      tag: 'a',
      attributes: {
        href: `#note-call-${note.id}`,
        style: 'color: #000000; text-decoration: none',
        'data-note-backlink': 'true',
      },
      children: [{ id: uid('t'), kind: 'text', text: String(note.number) }],
    };
    const p = buildApaParagraphNode('', kind, template, uid, {
      'data-note-entry-id': note.id,
      id: `note-${note.id}`,
      ...(kind === 'endnote' ? { contenteditable: 'false' } : {}),
    }, [link, { id: uid('t'), kind: 'text', text: ` ${note.text}` }]);
    const sm = parseCssStyleMap(p.attributes['style']);
    sm['white-space'] = 'pre-wrap';
    children.push({ ...p, attributes: { ...p.attributes, style: serializeCssStyleMap(sm) } });
  }
  return {
    id: uid('nlist'),
    kind: 'element',
    tag: 'div',
    attributes: {
      'data-word-note-list': kind,
      contenteditable: 'false',
      ...(kind === 'footnote'
        ? { style: 'border-top: 1px solid #000000; margin-top: 8pt; padding-top: 4pt' }
        : { 'data-apa-section': 'endnotes' }),
    },
    children,
  };
}

export function syncModelEndnotesInSnaps(
  snaps: EngineSectionSnapshot[],
  notes: readonly AcademicNote[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
): boolean {
  const endnotes = notes.filter(n => n.kind === 'endnote');
  const hasEndnoteList = (nodes: readonly DocumentNode[]): boolean =>
    nodes.some(n => n.kind === 'element' && (n.attributes['data-word-note-list'] === 'endnote' || n.attributes['data-apa-section'] === 'endnotes' || hasEndnoteList(n.children)));
  const existingIdx = snaps.findIndex(s => hasEndnoteList(s.state.roots));

  if (!endnotes.length) {
    if (existingIdx < 0) return false;
    const stripEndnotes = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
      nodes
        .filter(n => !(n.kind === 'element' && (n.attributes['data-word-note-list'] === 'endnote' || n.attributes['data-apa-section'] === 'endnotes')))
        .map(n => (n.kind === 'element' ? { ...n, children: stripEndnotes(n.children) } : n));
    const cleaned = stripEndnotes(snaps[existingIdx].state.roots);
    const hasContent = textNodes(cleaned).some(t => t.text.trim()) ||
      cleaned.some(n => n.kind === 'element' && ['img', 'svg', 'table'].includes(n.tag));
    if (hasContent) {
      snaps[existingIdx] = {
        ...snaps[existingIdx],
        state: { ...snaps[existingIdx].state, revision: snaps[existingIdx].state.revision + 1, roots: cleaned },
      };
    } else if (snaps.length > 1) {
      snaps.splice(existingIdx, 1);
    } else {
      snaps[0] = {
        ...snaps[0],
        state: {
          revision: snaps[0].state.revision + 1,
          roots: [{ id: uid('p'), kind: 'element', tag: 'p', attributes: {}, children: [{ id: uid('t'), kind: 'text', text: '' }] }],
          selection: null,
        },
      };
    }
    return true;
  }

  const endnoteList = buildNoteListNode(endnotes, template, 'endnote', uid);
  const id = existingIdx >= 0 ? snaps[existingIdx].id : uid('endnotes');
  const newSnap: EngineSectionSnapshot = {
    id,
    breakBefore: 'manual',
    state: { revision: (existingIdx >= 0 ? snaps[existingIdx].state.revision : 0) + 1, roots: [endnoteList], selection: null },
    pageIds: [id],
  };
  if (existingIdx >= 0) {
    snaps[existingIdx] = newSnap;
  } else {
    const appIdx = snaps.findIndex(s => s.state.roots.some(r => r.kind === 'element' && r.attributes['data-apa-section'] === 'appendix'));
    const insertAt = appIdx < 0 ? snaps.length : appIdx;
    snaps.splice(insertAt, 0, newSnap);
  }
  return true;
}

export function collectModelAcademicObjects(
  sections: readonly { model: { state: { roots: readonly DocumentNode[] } } }[],
): AcademicObject[] {
  const snaps: EngineSectionSnapshot[] = sections.map((s, idx) => ({
    id: String(idx),
    state: { revision: 0, roots: s.model.state.roots, selection: null },
    pageIds: [],
  }));
  return collectObjectsFromSnaps(snaps).map(entry => entry.object);
}

interface ModelObjectEntry {
  sectionIndex: number;
  node: ElementNode;
  object: AcademicObject;
}

function collectObjectsFromSnaps(snaps: readonly EngineSectionSnapshot[]): ModelObjectEntry[] {
  const appendixCounts = new Map<string, { table: number; figure: number }>();
  const appendixTotal = new Set<string>();
  const titles = new Map<string, string>();
  const captionedTargets = new Set<string>();
  const appendixMap = new Map<string, { id: string; letter: string; tableOnly: boolean }>();

  const findDescendantTag = (nodes: readonly DocumentNode[], tag: string): ElementNode | null => {
    for (const child of nodes) {
      if (child.kind !== 'element') continue;
      if (child.tag === tag) return child;
      const nested = findDescendantTag(child.children, tag);
      if (nested) return nested;
    }
    return null;
  };

  const prescan = (nodes: readonly DocumentNode[], activeAppendix?: { id: string; letter: string; tableOnly: boolean }, ignored = false) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      const skip = ignored || isTocNode(n) || isObjectIndexNode(n);
      if (skip) continue;
      let nextApp = activeAppendix;
      if (n.attributes['data-appendix-id']) {
        const appId = n.attributes['data-appendix-id'];
        appendixTotal.add(appId);
        nextApp = {
          id: appId,
          letter: n.attributes['data-appendix-letter'] || appendixLetter(appendixTotal.size - 1),
          tableOnly: n.attributes['data-appendix-table-only'] === 'true',
        };
      }
      if (n.attributes['data-apa-role'] === 'title' && n.attributes['data-apa-caption-for']) {
        titles.set(n.attributes['data-apa-caption-for'], textNodes([n]).map(t => t.text).join(''));
        captionedTargets.add(n.attributes['data-apa-caption-for']);
      }
      if (n.tag === 'figure') {
        const imgNode = findDescendantTag(n.children, 'img');
        const capNode = findDescendantTag(n.children, 'figcaption');
        if (imgNode && capNode) {
          const imgId = imgNode.attributes['data-word-object-id'] || imgNode.id;
          const capText = textNodes([capNode]).map(t => t.text).join('').replace(/\s+/g, ' ').trim();
          if (capText) {
            if (!titles.has(imgId)) titles.set(imgId, capText);
            captionedTargets.add(imgId);
          }
        }
      }
      if (n.tag === 'table') {
        const capNode = n.children.find((c): c is ElementNode => c.kind === 'element' && c.tag === 'caption');
        if (capNode) {
          const tblId = n.attributes['data-word-object-id'] || n.id;
          const capText = textNodes([capNode]).map(t => t.text).join('').replace(/\s+/g, ' ').trim();
          if (capText) {
            if (!titles.has(tblId)) titles.set(tblId, capText);
            captionedTargets.add(tblId);
          }
        }
      }
      if ((n.tag === 'table' || n.tag === 'img') && nextApp) {
        appendixMap.set(n.id, nextApp);
      }
      prescan(n.children, nextApp, skip);
    }
  };
  for (const snap of snaps) prescan(snap.state.roots);

  let table = 0;
  let figure = 0;
  const seen = new Set<string>();
  const entries: ModelObjectEntry[] = [];

  const collect = (nodes: readonly DocumentNode[], sIdx: number, inCell: boolean, ignored = false) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      const skip = ignored || isTocNode(n) || isObjectIndexNode(n);
      if (skip) continue;
      if ((n.tag === 'table' && !inCell) || n.tag === 'img') {
        if (!n.attributes['data-word-continuation']) {
          const objId = n.attributes['data-word-object-id'] || n.id;
          if (!seen.has(objId)) {
            seen.add(objId);
            const kind = n.tag === 'table' ? 'table' : 'figure';
            const app = appendixMap.get(n.id);
            const numbered = n.attributes['data-apa-captioned'] === 'true' || captionedTargets.has(objId);
            let number = 0;
            if (numbered) {
              if (app) {
                const counts = appendixCounts.get(app.id) || { table: 0, figure: 0 };
                number = ++counts[kind];
                appendixCounts.set(app.id, counts);
              } else {
                number = kind === 'table' ? ++table : ++figure;
              }
            }
            const prefix = app?.letter || '';
            entries.push({
              sectionIndex: sIdx,
              node: n,
              object: {
                id: objId,
                kind,
                number,
                prefix,
                appendixLabel:
                  app?.tableOnly && kind === 'table'
                    ? appendixTotal.size === 1
                      ? 'Apéndice'
                      : `Apéndice ${prefix}`
                    : undefined,
                title: titles.get(objId) ?? n.attributes['data-apa-title'] ?? '',
                note: n.attributes['data-apa-note'] || '',
                sourceId: n.attributes['data-apa-source'] || '',
                attribution: n.attributes['data-apa-attribution'] || '',
              },
            });
          }
        }
      }
      collect(n.children, sIdx, inCell || n.tag === 'td' || n.tag === 'th', skip);
    }
  };
  snaps.forEach((snap, sIdx) => collect(snap.state.roots, sIdx, false));
  return entries;
}

export function applyModelApaSectionsAndObjectsInSnaps(
  snaps: EngineSectionSnapshot[],
  template: StyleTemplate,
  uid: (prefix: string) => string,
  caption?: CaptionRequest,
): void {
  // Pass 1: assign missing data-appendix-id, appendix-letter, and data-word-object-id
  const appendixIds = new Map<string, string>();
  const scanApps = (nodes: readonly DocumentNode[]) => {
    for (const n of nodes) {
      if (n.kind !== 'element') continue;
      if (n.attributes['data-apa-section'] === 'appendix') {
        const id = n.attributes['data-appendix-id'] || n.id;
        if (!appendixIds.has(id)) appendixIds.set(id, appendixLetter(appendixIds.size));
      }
      scanApps(n.children);
    }
  };
  for (const snap of snaps) scanApps(snap.state.roots);

  for (let sIdx = 0; sIdx < snaps.length; sIdx++) {
    let changed = false;
    const prep = (nodes: readonly DocumentNode[], inCell = false, inSingleTableApp = false): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        let nextAttrs = n.attributes;
        let attrChanged = false;
        const singleTableApp = n.attributes['data-appendix-table-only'] === 'true'
          ? true
          : n.attributes['data-appendix-id']
            ? false
            : inSingleTableApp;
        if (n.attributes['data-apa-section'] === 'appendix') {
          const appId = n.attributes['data-appendix-id'] || n.id;
          const letter = appendixIds.get(appId)!;
          if (n.attributes['data-appendix-id'] !== appId || n.attributes['data-appendix-letter'] !== letter) {
            nextAttrs = { ...nextAttrs, 'data-appendix-id': appId, 'data-appendix-letter': letter };
            attrChanged = true;
          }
        }
        if (((n.tag === 'table' && !inCell) || n.tag === 'img') && !n.attributes['data-word-continuation']) {
          if (!n.attributes['data-word-object-id']) {
            nextAttrs = {
              ...nextAttrs,
              'data-word-object-id': caption && caption.id === n.id ? caption.id : crypto.randomUUID(),
            };
            attrChanged = true;
          }
          const curObjId = nextAttrs['data-word-object-id'] || n.id;
          if (caption && (caption.id === curObjId || caption.id === n.id)) {
            nextAttrs = {
              ...nextAttrs,
              'data-word-object-id': curObjId,
              'data-apa-title': caption.title,
              'data-apa-note': caption.note,
              'data-apa-source': caption.sourceId,
              'data-apa-attribution': caption.attribution,
              'data-apa-captioned': singleTableApp && n.tag === 'table' ? 'false' : 'true',
            };
            attrChanged = true;
          }
        }
        const nextCh = prep(n.children, inCell || n.tag === 'td' || n.tag === 'th', singleTableApp);
        if (attrChanged || nextCh !== n.children) {
          changed = true;
          return { ...n, attributes: nextAttrs, children: nextCh };
        }
        return n;
      });
    const nextRoots = prep(snaps[sIdx].state.roots);
    if (changed) {
      snaps[sIdx] = { ...snaps[sIdx], state: { ...snaps[sIdx].state, revision: snaps[sIdx].state.revision + 1, roots: nextRoots } };
    }
  }

  // Pass 2: compute numbered objects and update captions/tables/references
  const entries = collectObjectsFromSnaps(snaps);
  if (caption) {
    const hit = entries.find(e => e.object.id === caption.id || e.node.id === caption.id);
    if (hit) Object.assign(hit.object, { ...caption, id: hit.object.id });
  }
  const objectById = new Map(entries.map(e => [e.object.id, e.object]));

  const makeNoteParagraph = (obj: AcademicObject): ElementNode | null => {
    if (!obj.note.trim() && !obj.attribution.trim()) return null;
    const italicLabel: ElementNode = {
      id: uid('i'),
      kind: 'element',
      tag: 'i',
      attributes: {},
      children: [{ id: uid('t'), kind: 'text', text: 'Nota.' }],
    };
    const rest = ` ${[obj.note.trim(), obj.attribution.trim()].filter(Boolean).join(' ')}`;
    return buildApaParagraphNode('', 'note', template, uid, {
      'data-apa-caption-for': obj.id,
      ...(obj.sourceId ? { 'data-word-source-id': obj.sourceId } : {}),
    }, [italicLabel, { id: uid('t'), kind: 'text', text: rest }]);
  };

  for (let sIdx = 0; sIdx < snaps.length; sIdx++) {
    const snap = snaps[sIdx];
    let changed = false;

    const rewriteList = (nodes: readonly DocumentNode[], currentAppLetter?: string, currentAppTableOnly = false): readonly DocumentNode[] => {
      const out: DocumentNode[] = [];
      for (const node of nodes) {
        if (node.kind !== 'element') {
          out.push(node);
          continue;
        }
        const nextAppLetter = node.attributes['data-appendix-letter'] || currentAppLetter;
        const nextAppTableOnly = node.attributes['data-appendix-table-only'] === 'true' ? true : node.attributes['data-appendix-id'] ? false : currentAppTableOnly;

        // Drop orphaned or replaced caption paragraphs cleanly (regenerated around object if captioned or newly captioned)
        if ('data-apa-caption-for' in node.attributes) {
          const forId = node.attributes['data-apa-caption-for'];
          const obj = objectById.get(forId);
          if (!obj || caption?.id === forId) {
            changed = true;
            continue;
          }
          if (node.attributes['data-apa-role'] === 'number') {
            const label = `${obj.kind === 'table' ? 'Tabla' : 'Figura'} ${obj.prefix}${obj.number}`;
            const cur = textNodes([node]).map(t => t.text).join('');
            const styled = styleModelApaParagraph(
              cur === label ? node : { ...node, children: [{ id: uid('t'), kind: 'text', text: label }] },
              template,
              'number',
            );
            changed = true;
            out.push(styled);
            continue;
          }
          const styled = styleModelApaParagraph(node, template, node.attributes['data-apa-role'] || 'note');
          changed = true;
          out.push(styled);
          continue;
        }

        // Update appendix label text
        if (node.attributes['data-apa-role'] === 'appendix-label' && nextAppLetter && !('data-word-continuation' in node.attributes)) {
          const label = appendixIds.size === 1 ? 'Apéndice' : `Apéndice ${nextAppLetter}`;
          const styled = styleModelApaParagraph({ ...node, children: [{ id: uid('t'), kind: 'text', text: label }] }, template, 'appendix-label');
          changed = true;
          out.push(styled);
          continue;
        }

        // Update inline object cross-references
        if ('data-word-object-reference' in node.attributes) {
          const obj = objectById.get(node.attributes['data-word-object-reference']);
          const label = obj ? academicObjectLabel(obj) : '[Referencia a objeto eliminado]';
          const cur = textNodes([node]).map(t => t.text).join('');
          if (cur !== label) {
            changed = true;
            out.push({ ...node, children: [{ id: uid('t'), kind: 'text', text: label }] });
          } else {
            out.push(node);
          }
          continue;
        }

        // Handle top-level table or paragraph containing a single/captioned image
        if (node.tag === 'table' && !node.attributes['data-word-continuation']) {
          const objId = node.attributes['data-word-object-id'] || node.id;
          const isCaptionedTarget = caption ? (caption.id === objId || caption.id === node.id) : false;
          let tbl = styleModelApaTable(node, template);
          if (isCaptionedTarget && caption) {
            tbl = {
              ...tbl,
              attributes: {
                ...tbl.attributes,
                'data-apa-title': caption.title,
                'data-apa-note': caption.note,
                'data-apa-source': caption.sourceId,
                'data-apa-attribution': caption.attribution,
                'data-apa-captioned': nextAppTableOnly ? 'false' : 'true',
              },
            };
          }
          const obj = objectById.get(objId);
          if (isCaptionedTarget && caption && obj) {
            if (!nextAppTableOnly) {
              out.push(
                buildApaParagraphNode(`${obj.kind === 'table' ? 'Tabla' : 'Figura'} ${obj.prefix}${obj.number}`, 'number', template, uid, { 'data-apa-caption-for': obj.id }),
                buildApaParagraphNode(caption.title, 'title', template, uid, { 'data-apa-caption-for': obj.id }, caption.title ? undefined : [{ id: uid('t'), kind: 'text', text: '' }]),
              );
            }
            out.push(tbl);
            const noteNode = makeNoteParagraph({ ...obj, ...caption, id: obj.id });
            if (noteNode) out.push(noteNode);
          } else {
            out.push(tbl);
          }
          changed = true;
          continue;
        }

        // Check if paragraph wraps a captioned image (or image being captioned now)
        const directImg = node.tag === 'p' ? node.children.find((c): c is ElementNode => c.kind === 'element' && c.tag === 'img' && (caption ? (c.attributes['data-word-object-id'] || c.id) === caption.id || c.id === caption.id : c.attributes['data-apa-captioned'] === 'true')) : undefined;
        if (directImg && caption && ((directImg.attributes['data-word-object-id'] || directImg.id) === caption.id || directImg.id === caption.id)) {
          const objId = directImg.attributes['data-word-object-id'] || directImg.id;
          const obj = objectById.get(objId);
          const styledImg: ElementNode = {
            ...directImg,
            attributes: {
              ...directImg.attributes,
              'data-apa-title': caption.title,
              'data-apa-note': caption.note,
              'data-apa-source': caption.sourceId,
              'data-apa-attribution': caption.attribution,
              'data-apa-captioned': 'true',
            },
          };
          const otherChildren = node.children.filter(c => c.id !== directImg.id && !(c.kind === 'text' && !c.text.trim()));
          const figureP = buildApaParagraphNode('', 'figure', template, uid, {}, [styledImg]);
          if (obj) {
            out.push(
              buildApaParagraphNode(`Figura ${obj.prefix}${obj.number}`, 'number', template, uid, { 'data-apa-caption-for': obj.id }),
              buildApaParagraphNode(caption.title, 'title', template, uid, { 'data-apa-caption-for': obj.id }, caption.title ? undefined : [{ id: uid('t'), kind: 'text', text: '' }]),
            );
          }
          out.push(figureP);
          if (obj) {
            const noteNode = makeNoteParagraph({ ...obj, ...caption });
            if (noteNode) out.push(noteNode);
          }
          if (otherChildren.length) out.push({ ...node, children: otherChildren });
          changed = true;
          continue;
        }

        // Plain image directly in block list
        if (node.tag === 'img' && caption && (node.attributes['data-word-object-id'] || node.id) === caption.id) {
          const objId = node.attributes['data-word-object-id'] || node.id;
          const obj = objectById.get(objId);
          const styledImg: ElementNode = {
            ...node,
            attributes: {
              ...node.attributes,
              'data-apa-title': caption.title,
              'data-apa-note': caption.note,
              'data-apa-source': caption.sourceId,
              'data-apa-attribution': caption.attribution,
              'data-apa-captioned': 'true',
            },
          };
          if (obj) {
            out.push(
              buildApaParagraphNode(`Figura ${obj.prefix}${obj.number}`, 'number', template, uid, { 'data-apa-caption-for': obj.id }),
              buildApaParagraphNode(caption.title, 'title', template, uid, { 'data-apa-caption-for': obj.id }, caption.title ? undefined : [{ id: uid('t'), kind: 'text', text: '' }]),
            );
          }
          out.push(styledImg);
          if (obj) {
            const noteNode = makeNoteParagraph({ ...obj, ...caption });
            if (noteNode) out.push(noteNode);
          }
          changed = true;
          continue;
        }

        if (node.attributes['data-apa-role']) {
          const styled = styleModelApaParagraph(
            { ...node, children: rewriteList(node.children, nextAppLetter, nextAppTableOnly) },
            template,
            node.attributes['data-apa-role'],
          );
          changed = true;
          out.push(styled);
          continue;
        }

        const nextCh = rewriteList(node.children, nextAppLetter, nextAppTableOnly);
        if (nextCh !== node.children) changed = true;
        out.push(nextCh === node.children ? node : { ...node, children: nextCh });
      }
      return out;
    };

    const nextRoots = rewriteList(snap.state.roots);
    if (changed) {
      snaps[sIdx] = { ...snap, state: { ...snap.state, revision: snap.state.revision + 1, roots: nextRoots } };
    }
  }
}

export function insertAcademicSectionInSnaps(
  snaps: EngineSectionSnapshot[],
  request: AcademicSectionRequest,
  template: StyleTemplate,
  uid: (prefix: string) => string,
): number {
  let key: string;
  let position: 'start' | 'abstract' | 'end';
  let sectionNodes: DocumentNode[];

  if (request.kind === 'cover') {
    key = 'cover';
    position = 'start';
    const children: ElementNode[] = [buildApaParagraphNode(request.title, 'cover-title', template, uid)];
    for (const [value, role] of [
      [request.authors, 'cover-author'],
      [request.affiliations, 'cover-affiliation'],
      [request.course, 'cover-detail'],
      [request.instructor, 'cover-detail'],
      [request.date, 'cover-detail'],
    ] as const) {
      if (request.professional && role === 'cover-detail' && value !== request.date) continue;
      value.split('\n').filter(l => l.trim()).forEach(line => children.push(buildApaParagraphNode(line.trim(), role, template, uid)));
    }
    if (request.professional && request.authorNote.trim()) {
      children.push(buildApaParagraphNode('Nota del autor', 'author-note-heading', template, uid));
      request.authorNote.split(/\n+/).filter(Boolean).forEach(line => children.push(buildApaParagraphNode(line, 'author-note', template, uid)));
    }
    sectionNodes = [{
      id: uid('cover'),
      kind: 'element',
      tag: 'div',
      attributes: { 'data-apa-section': 'cover', style: 'padding-top: 64px' },
      children,
    }];
  } else if (request.kind === 'abstract') {
    key = `abstract-${request.language}`;
    position = 'abstract';
    const children: ElementNode[] = [
      buildApaParagraphNode(request.language === 'es' ? 'Resumen' : 'Abstract', 'heading', template, uid),
      buildApaParagraphNode(request.text.replace(/\s+/g, ' ').trim(), 'abstract', template, uid),
    ];
    if (request.keywords.trim()) {
      const italicLabel: ElementNode = {
        id: uid('i'),
        kind: 'element',
        tag: 'i',
        attributes: {},
        children: [{ id: uid('t'), kind: 'text', text: request.language === 'es' ? 'Palabras clave:' : 'Keywords:' }],
      };
      children.push(buildApaParagraphNode('', 'keywords', template, uid, {}, [italicLabel, { id: uid('t'), kind: 'text', text: ` ${request.keywords.trim()}` }]));
    }
    sectionNodes = [{
      id: uid('abstract'),
      kind: 'element',
      tag: 'div',
      attributes: { 'data-apa-section': key },
      children,
    }];
  } else {
    const appendixId = crypto.randomUUID();
    key = `appendix-${appendixId}`;
    position = 'end';
    const children: DocumentNode[] = [
      buildApaParagraphNode('Apéndice', 'appendix-label', template, uid),
      buildApaParagraphNode(request.title, 'appendix-title', template, uid),
      ...request.text.split(/\n+/).filter(Boolean).map(t => buildApaParagraphNode(t, 'appendix-body', template, uid)),
    ];
    let tableOnly = false;
    if (request.objectId) {
      let movedObject: ElementNode | null = null;
      const stripObject = (nodes: readonly DocumentNode[]): readonly DocumentNode[] => {
        const out: DocumentNode[] = [];
        for (const n of nodes) {
          if (n.kind !== 'element') { out.push(n); continue; }
          if (n.attributes['data-apa-caption-for'] === request.objectId) continue;
          if ((n.attributes['data-word-object-id'] || n.id) === request.objectId) {
            movedObject = {
              ...n,
              attributes: {
                ...n.attributes,
                'data-apa-captioned': 'true',
                'data-apa-title': n.attributes['data-apa-title'] || request.title,
              },
            };
            continue;
          }
          out.push({ ...n, children: stripObject(n.children) });
        }
        return out;
      };
      for (let i = 0; i < snaps.length; i++) {
        const nextRoots = stripObject(snaps[i].state.roots);
        if (nextRoots !== snaps[i].state.roots) {
          snaps[i] = { ...snaps[i], state: { ...snaps[i].state, revision: snaps[i].state.revision + 1, roots: nextRoots } };
        }
      }
      if (movedObject) {
        const objEl = movedObject as ElementNode;
        children.push(objEl);
        if (objEl.tag === 'table' && request.singleTable && !request.text.trim()) {
          tableOnly = true;
        }
      }
    }
    sectionNodes = [{
      id: uid('appendix'),
      kind: 'element',
      tag: 'div',
      attributes: {
        'data-apa-section': 'appendix',
        'data-appendix-id': appendixId,
        ...(tableOnly ? { 'data-appendix-table-only': 'true' } : {}),
      },
      children,
    }];
  }

  // Remove any previous section with matching key (e.g. replacing existing cover or abstract-es)
  let existingIndex = -1;
  for (let i = snaps.length - 1; i >= 0; i--) {
    const hasKey = (nodes: readonly DocumentNode[]): boolean =>
      nodes.some(n => n.kind === 'element' && (n.attributes['data-apa-section'] === key || hasKey(n.children)));
    if (hasKey(snaps[i].state.roots)) {
      existingIndex = i;
      const filterKey = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
        nodes
          .filter(n => !(n.kind === 'element' && n.attributes['data-apa-section'] === key))
          .map(n => (n.kind === 'element' ? { ...n, children: filterKey(n.children) } : n));
      const remaining = filterKey(snaps[i].state.roots);
      const nonEmpty = textNodes(remaining).some(t => t.text.trim()) || remaining.some(n => n.kind === 'element' && ['img', 'svg', 'table'].includes(n.tag));
      if (nonEmpty) {
        snaps[i] = { ...snaps[i], state: { ...snaps[i].state, revision: snaps[i].state.revision + 1, roots: remaining } };
      } else {
        snaps.splice(i, 1);
      }
    }
  }

  // Drop lone blank starter page if inserting into empty document
  if (
    snaps.length === 1 &&
    textNodes(snaps[0].state.roots).every(t => !t.text.trim()) &&
    !snaps[0].state.roots.some(n => n.kind === 'element' && ['img', 'svg', 'table'].includes(n.tag))
  ) {
    snaps.splice(0, 1);
  }

  let insertIndex = existingIndex;
  if (insertIndex < 0) {
    if (position === 'start') insertIndex = 0;
    else if (position === 'abstract') {
      insertIndex = 0;
      while (insertIndex < snaps.length) {
        const hasFrontMatter = snaps[insertIndex].state.roots.some(
          n => n.kind === 'element' && /^(?:cover|abstract-[^"]+)$/.test(n.attributes['data-apa-section'] || ''),
        );
        if (!hasFrontMatter) break;
        insertIndex++;
      }
    } else {
      insertIndex = snaps.length;
    }
  }
  insertIndex = Math.max(0, Math.min(insertIndex, snaps.length));
  const secId = uid('sec');
  snaps.splice(insertIndex, 0, {
    id: secId,
    breakBefore: 'manual',
    state: { revision: 1, roots: sectionNodes, selection: null },
    pageIds: [secId],
  });
  if (snaps[insertIndex + 1]) {
    snaps[insertIndex + 1] = { ...snaps[insertIndex + 1], breakBefore: 'manual' };
  }
  return insertIndex;
}

export function isObjectIndexNode(node: ElementNode, kind?: 'table' | 'figure'): boolean {
  const listOf = node.attributes['data-word-list-of'];
  if (!kind) return listOf === 'tables' || listOf === 'figures';
  return listOf === (kind === 'table' ? 'tables' : 'figures');
}

export function isTocNode(node: ElementNode): boolean {
  if ('data-word-list-of' in node.attributes) return false;
  const cls = node.attributes['class'] || '';
  return (
    cls.includes('word-toc-page-section') ||
    node.attributes['data-native-word-toc'] === 'true' ||
    'data-word-toc' in node.attributes
  );
}

/** Collects document headings from non-TOC sections and stamps missing unique IDs directly in `snaps`. */
export function collectAndStampModelHeadings(
  sections: readonly DocumentSectionState[],
  snaps: EngineSectionSnapshot[],
  tocIndex: number,
  skipSections: ReadonlySet<number>,
): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const usedIds = new Set<string>();
  let globalPageBase = 0;

  sections.forEach((sec, sIdx) => {
    const secPages = sec.displayLists.length;
    if (skipSections.has(sIdx)) {
      return;
    }
    const pageOfSubtree = (node: DocumentNode): number => {
      const sub = getSubtreeIds(node);
      for (let p = 0; p < sec.displayLists.length; p++) {
        for (const cmd of sec.displayLists[p].commands) {
          if (cmd.kind === 'text' && cmd.source && sub.has(cmd.source.start.nodeId)) {
            return globalPageBase + p;
          }
        }
      }
      return globalPageBase;
    };

    let mutated = false;
    const scan = (nodes: readonly DocumentNode[], inIgnored = false): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        const ignored = inIgnored || isTocNode(n) || isObjectIndexNode(n) || 'data-word-continuation' in n.attributes;
        if (!ignored && (/^h[1-6]$/i.test(n.tag) || 'data-apa-heading-level' in n.attributes)) {
          const text = textNodes([n]).map(t => t.text).join('').replace(/\s+/g, ' ').trim();
          if (text && !TOC_TITLE_RE.test(text)) {
            let id = n.attributes['id'] || '';
            if (!id || usedIds.has(id)) {
              id = `heading-${crypto.randomUUID()}`;
              mutated = true;
            }
            usedIds.add(id);
            const level = 'data-word-chapter' in n.attributes ? 0 : Number(n.attributes['data-apa-heading-level'] || n.tag.slice(1));
            headings.push({ id, text, level, pageIndex: pageOfSubtree(n) });
            if (n.attributes['id'] !== id) {
              return { ...n, attributes: { ...n.attributes, id } };
            }
            return n;
          }
        }
        const nextCh = scan(n.children, ignored);
        return nextCh === n.children ? n : { ...n, children: nextCh };
      });

    const snapIdx = snaps.findIndex(s => s.id === sec.id);
    if (snapIdx >= 0) {
      const nextRoots = scan(snaps[snapIdx].state.roots);
      if (mutated) {
        snaps[snapIdx] = { ...snaps[snapIdx], state: { ...snaps[snapIdx].state, revision: snaps[snapIdx].state.revision + 1, roots: nextRoots } };
      }
    }
    globalPageBase += secPages;
  });

  void tocIndex;
  return headings;
}

export function sectionHasMeaningfulContent(nodes: readonly DocumentNode[]): boolean {
  if (textNodes(nodes).some(t => t.text.trim().length > 0)) return true;
  const hasMedia = (list: readonly DocumentNode[]): boolean =>
    list.some(n => n.kind === 'element' && (['img', 'svg', 'table'].includes(n.tag) || hasMedia(n.children)));
  return hasMedia(nodes);
}

function nodeContainsToc(nodes: readonly DocumentNode[]): boolean {
  return nodes.some(
    n => n.kind === 'element' && (isTocNode(n) || nodeContainsToc(n.children)),
  );
}

function stripTocNodes(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  const result: DocumentNode[] = [];
  for (const n of nodes) {
    if (n.kind !== 'element') {
      result.push(n);
      continue;
    }
    if (isTocNode(n)) continue;
    if (/^h[1-6]$/i.test(n.tag)) {
      const text = textNodes([n]).map(t => t.text).join('').trim();
      if (TOC_TITLE_RE.test(text)) continue;
    }
    const nextChildren = stripTocNodes(n.children);
    result.push(nextChildren === n.children ? n : { ...n, children: nextChildren });
  }
  return result;
}

export interface ModelTocTypography {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  headerTitle?: string;
}

export interface ModelTocBuildOptions {
  template?: StyleTemplate;
  typography?: ModelTocTypography;
  measureDisplayLists?: (state: DocumentState) => PageDisplayList[];
  entriesPerPage?: number;
}

export interface ModelTocRebuildResult {
  found: boolean;
  changed: boolean;
  tocSectionIndex: number;
  tocPageCount: number;
  headings: HeadingItem[];
}

function cleanTocHeadingTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(\d+(?:\.\d+)*\.?)(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/g, '$1 ')
    .trim();
}

function extractModelTocTypography(snaps: readonly EngineSectionSnapshot[]): ModelTocTypography | undefined {
  let fontFamily: string | undefined;
  let fontSize: string | undefined;
  let lineHeight: string | undefined;
  let headerTitle: string | undefined;

  const visit = (nodes: readonly DocumentNode[]): void => {
    for (const node of nodes) {
      if (node.kind !== 'element') continue;
      const cls = node.attributes['class'] || '';
      if (!fontFamily && !fontSize && !lineHeight && cls.includes('word-toc-entry')) {
        const sm = parseCssStyleMap(node.attributes['style']);
        fontFamily = sm['font-family'] || undefined;
        fontSize = sm['font-size'] || undefined;
        lineHeight = sm['line-height'] || undefined;
      }
      if (!headerTitle && cls.includes('word-toc-header')) {
        const title = textNodes([node]).map(t => t.text).join('').trim();
        if (title) headerTitle = title;
      }
      if (node.children.length) visit(node.children);
    }
  };

  for (const snap of snaps) visit(snap.state.roots);
  if (!fontFamily && !fontSize && !lineHeight && !headerTitle) return undefined;
  return { fontFamily, fontSize, lineHeight, headerTitle };
}

function buildApaTocBaseStyle(template: StyleTemplate): Record<string, string> {
  return {
    'font-family': template.rules.P.fontFamily,
    'font-size': `${template.rules.P.fontSizePt}pt`,
    'line-height': '2',
    color: '#000000',
    'background-color': 'transparent',
    'margin-top': '0pt',
    'margin-bottom': '0pt',
    border: 'none',
    'padding-top': '0pt',
    'padding-right': '0pt',
    'padding-bottom': '0pt',
    'letter-spacing': 'normal',
    'text-transform': 'none',
  };
}

interface TocRootOverrideConfig {
  headerText?: string;
  emptyText?: string;
  rootAttributes?: Readonly<Record<string, string>>;
  flatWeight?: boolean;
}

function buildModelTocPageRoot(
  slice: readonly HeadingItem[],
  baseLevel: number,
  options: ModelTocBuildOptions,
  typography: ModelTocTypography | undefined,
  includeHeader: boolean,
  emptyState: boolean,
  uid: (prefix: string) => string,
  override?: TocRootOverrideConfig,
): { root: ElementNode; trackedLeafIds: Array<{ titleId: string; pageId: string }> } {
  const isApa = options.template?.academicStyle === 'apa7';
  const apaBase = isApa && options.template ? buildApaTocBaseStyle(options.template) : null;
  const children: DocumentNode[] = [];
  const trackedLeafIds: Array<{ titleId: string; pageId: string }> = [];

  if (includeHeader) {
    const headerText =
      override?.headerText ?? (isApa ? 'Índice de contenido' : (typography?.headerTitle || 'ÍNDICE DE CONTENIDO'));
    const headerStyle: Record<string, string> = apaBase
      ? { ...apaBase, 'font-weight': 'bold', 'text-align': 'center', 'padding-left': '0pt' }
      : {
          ...(typography?.fontFamily ? { 'font-family': typography.fontFamily } : {}),
          ...(typography?.fontSize ? { 'font-size': typography.fontSize } : {}),
          ...(typography?.lineHeight ? { 'line-height': typography.lineHeight } : {}),
          ...(typography ? { 'text-transform': 'none' } : {}),
        };
    children.push({
      id: uid('div'),
      kind: 'element',
      tag: 'div',
      attributes: {
        class: 'word-toc-header',
        contenteditable: 'false',
        ...(Object.keys(headerStyle).length ? { style: serializeCssStyleMap(headerStyle) } : {}),
      },
      children: [{ id: uid('t'), kind: 'text', text: headerText }],
    });
  }

  if (emptyState) {
    const emptyText =
      override?.emptyText ??
      (isApa
        ? 'No se encontraron encabezados (H1–H5) en el documento. Aplica estilos H1–H5 desde la barra superior para generar el índice.'
        : 'No se encontraron encabezados (H1–H6) en el documento. Aplica estilos H1–H6 desde la barra superior para generar el índice.');
    const emptyStyle = apaBase
      ? serializeCssStyleMap({ ...apaBase, 'text-align': 'center', 'font-style': 'italic', 'padding-left': '0pt' })
      : 'text-align: center; color: #64748b; font-style: italic';
    children.push({
      id: uid('p'),
      kind: 'element',
      tag: 'p',
      attributes: { style: emptyStyle },
      children: [{ id: uid('t'), kind: 'text', text: emptyText }],
    });
  } else {
    slice.forEach((h, idx) => {
      const { indentPt, isTopLevel } = tocEntryLayout(h.level, baseLevel);
      const cleanTitle = override ? h.text.replace(/\s+/g, ' ').trim() : cleanTocHeadingTitle(h.text);
      const displayPageNum = h.pageIndex + 1;
      const weight = override?.flatWeight ? '400' : (isTopLevel ? '700' : '400');
      const topMargin = override?.flatWeight ? (idx > 0 || !includeHeader ? '2pt' : '0pt') : (isTopLevel && (idx > 0 || !includeHeader) ? '4pt' : '0pt');
      const entryStyle: Record<string, string> = apaBase
        ? {
            ...apaBase,
            'padding-left': `${override?.flatWeight ? 0 : indentPt}pt`,
            'font-weight': weight,
            'margin-top': topMargin,
          }
        : {
            'padding-left': `${override?.flatWeight ? 0 : indentPt}pt`,
            'font-weight': weight,
            'margin-top': topMargin,
            ...(typography?.fontFamily ? { 'font-family': typography.fontFamily } : {}),
            ...(typography?.fontSize ? { 'font-size': typography.fontSize } : {}),
            ...(typography?.lineHeight ? { 'line-height': typography.lineHeight } : {}),
          };
      const titleLeafId = uid('t');
      const pageLeafId = uid('t');
      trackedLeafIds.push({ titleId: titleLeafId, pageId: pageLeafId });
      children.push({
        id: uid('div'),
        kind: 'element',
        tag: 'div',
        attributes: {
          class: 'word-toc-entry',
          contenteditable: 'false',
          'data-toc-target-id': h.id,
          'data-toc-page': String(displayPageNum - 1),
          'data-toc-level': String(h.level),
          style: serializeCssStyleMap(entryStyle),
          title: `Haz clic para ir a: ${cleanTitle} (Página ${displayPageNum})`,
        },
        children: [
          {
            id: uid('span'),
            kind: 'element',
            tag: 'span',
            attributes: { class: 'word-toc-title' },
            children: [{ id: titleLeafId, kind: 'text', text: cleanTitle }],
          },
          {
            id: uid('span'),
            kind: 'element',
            tag: 'span',
            attributes: {
              class: 'word-toc-dots',
              ...(apaBase ? { style: 'border-bottom-color: #000000' } : {}),
            },
            children: [{ id: uid('t'), kind: 'text', text: '' }],
          },
          {
            id: uid('span'),
            kind: 'element',
            tag: 'span',
            attributes: { class: 'word-toc-page' },
            children: [{ id: pageLeafId, kind: 'text', text: String(displayPageNum) }],
          },
        ],
      });
    });
  }

  return {
    root: {
      id: uid('div'),
      kind: 'element',
      tag: 'div',
      attributes: override?.rootAttributes
        ? {
            ...override.rootAttributes,
            ...(apaBase ? { style: serializeCssStyleMap({ ...apaBase, 'padding-left': '0pt' }) } : {}),
          }
        : {
            class: 'word-toc-page-section',
            contenteditable: 'false',
            'data-word-toc': 'true',
            'data-native-word-toc': 'true',
            ...(apaBase ? { style: serializeCssStyleMap({ ...apaBase, 'padding-left': '0pt' }) } : {}),
          },
      children,
    },
    trackedLeafIds,
  };
}

function paginateModelTocHeadings(
  headings: readonly HeadingItem[],
  baseLevel: number,
  options: ModelTocBuildOptions,
  typography: ModelTocTypography | undefined,
  uid: (prefix: string) => string,
  override?: TocRootOverrideConfig,
): HeadingItem[][] {
  if (!headings.length) return [[]];
  if (options.measureDisplayLists) {
    const built = buildModelTocPageRoot(headings, baseLevel, options, typography, true, false, uid, override);
    const lists = options.measureDisplayLists({ revision: 1, roots: [built.root], selection: null });
    const leafPage = new Map<string, number>();
    lists.forEach((dl, pIdx) => {
      for (const cmd of dl.commands) {
        if (cmd.kind === 'text' && cmd.source) {
          const prev = leafPage.get(cmd.source.start.nodeId);
          if (prev === undefined || pIdx > prev) {
            leafPage.set(cmd.source.start.nodeId, pIdx);
          }
        }
      }
    });
    const groups: HeadingItem[][] = [];
    let currentPage = 0;
    for (let i = 0; i < headings.length; i++) {
      const tracked = built.trackedLeafIds[i];
      const titlePage = leafPage.get(tracked.titleId);
      const numPage = leafPage.get(tracked.pageId);
      const measuredPage =
        titlePage !== undefined && numPage !== undefined
          ? Math.max(titlePage, numPage)
          : (numPage ?? titlePage ?? currentPage);
      currentPage = Math.max(currentPage, measuredPage);
      while (groups.length <= currentPage) groups.push([]);
      groups[currentPage].push(headings[i]);
    }
    const nonEmpty = groups.filter(g => g.length > 0);
    return nonEmpty.length ? nonEmpty : [[...headings]];
  }

  const perPage = Math.max(1, options.entriesPerPage ?? 28);
  const slices: HeadingItem[][] = [];
  let cursor = 0;
  let pageSeq = 0;
  while (cursor < headings.length) {
    const limit = pageSeq === 0 ? Math.max(1, perPage - 2) : perPage;
    slices.push(headings.slice(cursor, cursor + limit));
    cursor += limit;
    pageSeq++;
  }
  return slices;
}

/**
 * Rebuilds or inserts the Table of Contents directly on DocumentNode snapshots without generating or parsing HTML strings.
 */
export function rebuildModelTocInSnaps(
  sections: readonly DocumentSectionState[],
  snaps: EngineSectionSnapshot[],
  activePageIndex: number,
  insert: boolean,
  options: ModelTocBuildOptions,
  uid: (prefix: string) => string,
): ModelTocRebuildResult {
  const tocSectionIndices: number[] = [];
  const pureTocSections = new Set<number>();

  sections.forEach((sec, idx) => {
    if (!nodeContainsToc(sec.model.state.roots)) return;
    tocSectionIndices.push(idx);
    const cleaned = stripTocNodes(sec.model.state.roots);
    if (!sectionHasMeaningfulContent(cleaned)) {
      pureTocSections.add(idx);
    }
  });

  if (tocSectionIndices.length === 0 && !insert) {
    return { found: false, changed: false, tocSectionIndex: 0, tocPageCount: 0, headings: [] };
  }

  const typography = options.typography ?? extractModelTocTypography(snaps);

  let insertSecIdx = 0;
  if (tocSectionIndices.length > 0) {
    insertSecIdx = tocSectionIndices[0];
  } else {
    let cursor = 0;
    insertSecIdx = Math.max(0, sections.length - 1);
    for (let i = 0; i < sections.length; i++) {
      const len = Math.max(1, sections[i].displayLists.length);
      if (activePageIndex < cursor + len) {
        insertSecIdx = i;
        break;
      }
      cursor += len;
    }
  }

  // Track which headings appeared before vs. at/after the TOC insertion point.
  const headings = collectAndStampModelHeadings(sections, snaps, insertSecIdx, pureTocSections);
  const baseLevel = resolveTocBaseLevel(headings);
  let insertHeadingSplitIdx = headings.length;
  {
    let nonTocPagesBeforeInsert = 0;
    for (let i = 0; i < insertSecIdx && i < sections.length; i++) {
      if (!pureTocSections.has(i)) nonTocPagesBeforeInsert += sections[i].displayLists.length;
    }
    insertHeadingSplitIdx = headings.findIndex(h => h.pageIndex >= nonTocPagesBeforeInsert);
    if (insertHeadingSplitIdx < 0) insertHeadingSplitIdx = headings.length;
  }

  const initialSlices = paginateModelTocHeadings(headings, baseLevel, options, typography, uid);
  const tocPageCount = initialSlices.length;
  const shiftedHeadings = headings.map((h, idx) =>
    idx >= insertHeadingSplitIdx ? { ...h, pageIndex: h.pageIndex + tocPageCount } : h,
  );
  const finalSlices = paginateModelTocHeadings(shiftedHeadings, baseLevel, options, typography, uid);

  const tocSnaps: EngineSectionSnapshot[] = options.measureDisplayLists
    ? (() => {
        const built = buildModelTocPageRoot(
          shiftedHeadings,
          baseLevel,
          options,
          typography,
          true,
          shiftedHeadings.length === 0,
          uid,
        );
        const pageIds = Array.from({ length: Math.max(1, finalSlices.length) }, () => uid('toc'));
        return [
          {
            id: pageIds[0],
            breakBefore: 'manual' as const,
            state: { revision: 1, roots: [built.root], selection: null },
            pageIds,
          },
        ];
      })()
    : finalSlices.map((slice, idx) => {
        const secId = uid('toc');
        const built = buildModelTocPageRoot(
          slice,
          baseLevel,
          options,
          typography,
          idx === 0,
          shiftedHeadings.length === 0,
          uid,
        );
        return {
          id: secId,
          breakBefore: 'manual' as const,
          state: { revision: 1, roots: [built.root], selection: null },
          pageIds: [secId],
        };
      });

  // Remove old TOC sections / strip TOC nodes from mixed sections, adjusting target insertion slot.
  const insertAnchorSecId = sections[insertSecIdx]?.id;
  let replaceEmptyAnchor = false;
  if (tocSectionIndices.length === 0 && insert && snaps[insertSecIdx] && !sectionHasMeaningfulContent(snaps[insertSecIdx].state.roots)) {
    replaceEmptyAnchor = true;
  }

  let resolvedInsertPos = -1;
  const nextSnaps: EngineSectionSnapshot[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    const isAnchor = snap.id === insertAnchorSecId;
    if (isAnchor && resolvedInsertPos < 0) {
      resolvedInsertPos = nextSnaps.length;
    }
    if (replaceEmptyAnchor && isAnchor) {
      continue;
    }
    if (nodeContainsToc(snap.state.roots)) {
      const cleaned = stripTocNodes(snap.state.roots);
      if (sectionHasMeaningfulContent(cleaned)) {
        nextSnaps.push({
          ...snap,
          state: { ...snap.state, revision: snap.state.revision + 1, roots: cleaned },
        });
      }
      continue;
    }
    nextSnaps.push(snap);
  }

  if (resolvedInsertPos < 0) {
    resolvedInsertPos = Math.min(insertSecIdx, nextSnaps.length);
  }

  nextSnaps.splice(resolvedInsertPos, 0, ...tocSnaps);
  const afterIdx = resolvedInsertPos + tocSnaps.length;
  if (nextSnaps[afterIdx] && nextSnaps[afterIdx].breakBefore !== 'manual') {
    nextSnaps[afterIdx] = { ...nextSnaps[afterIdx], breakBefore: 'manual' };
  }

  snaps.splice(0, snaps.length, ...nextSnaps);
  return {
    found: true,
    changed: true,
    tocSectionIndex: resolvedInsertPos,
    tocPageCount: finalSlices.length,
    headings: shiftedHeadings,
  };
}

function nodeContainsObjectIndex(nodes: readonly DocumentNode[], kind?: 'table' | 'figure'): boolean {
  return nodes.some(
    n => n.kind === 'element' && (isObjectIndexNode(n, kind) || nodeContainsObjectIndex(n.children, kind)),
  );
}

function stripObjectIndexNodes(nodes: readonly DocumentNode[], kind: 'table' | 'figure'): readonly DocumentNode[] {
  const result: DocumentNode[] = [];
  for (const n of nodes) {
    if (n.kind !== 'element') {
      result.push(n);
      continue;
    }
    if (isObjectIndexNode(n, kind)) continue;
    const nextCh = stripObjectIndexNodes(n.children, kind);
    result.push(nextCh === n.children ? n : { ...n, children: nextCh });
  }
  return result;
}

export interface ModelObjectIndexResult {
  found: boolean;
  changed: boolean;
  indexSectionIndex: number;
  pageCount: number;
  entries: ObjectIndexEntry[];
}

export function hasModelObjectIndexInSnaps(
  snaps: readonly EngineSectionSnapshot[],
  kind?: 'table' | 'figure',
): boolean {
  return snaps.some(snap => nodeContainsObjectIndex(snap.state.roots, kind));
}

/**
 * Builds, inserts, or refreshes an automated Table Index or Figure Index (`data-word-list-of`)
 * directly on Canvas `EngineSectionSnapshot[]`.
 */
export function rebuildModelObjectIndexInSnaps(
  sections: readonly DocumentSectionState[],
  snaps: EngineSectionSnapshot[],
  kind: 'table' | 'figure',
  activePageIndex: number,
  insert: boolean,
  options: ModelTocBuildOptions,
  uid: (prefix: string) => string,
): ModelObjectIndexResult {
  const existingIndices: number[] = [];
  const pureIndexSections = new Set<number>();

  sections.forEach((sec, idx) => {
    if (!nodeContainsObjectIndex(sec.model.state.roots, kind)) return;
    existingIndices.push(idx);
    const cleaned = stripObjectIndexNodes(sec.model.state.roots, kind);
    if (!sectionHasMeaningfulContent(cleaned)) {
      pureIndexSections.add(idx);
    }
  });

  if (existingIndices.length === 0 && !insert) {
    return { found: false, changed: false, indexSectionIndex: 0, pageCount: 0, entries: [] };
  }

  let insertSecIdx = 0;
  let insertAfterAnchor = false;
  if (existingIndices.length > 0) {
    insertSecIdx = existingIndices[0];
  } else {
    let lastTablesIdx = -1;
    let firstFiguresIdx = -1;
    let lastTocIdx = -1;
    sections.forEach((sec, idx) => {
      if (nodeContainsToc(sec.model.state.roots)) lastTocIdx = idx;
      if (nodeContainsObjectIndex(sec.model.state.roots, 'table')) lastTablesIdx = idx;
      if (firstFiguresIdx < 0 && nodeContainsObjectIndex(sec.model.state.roots, 'figure')) firstFiguresIdx = idx;
    });
    if (kind === 'figure' && lastTablesIdx >= 0) {
      insertSecIdx = lastTablesIdx;
      insertAfterAnchor = true;
    } else if (kind === 'table' && firstFiguresIdx >= 0) {
      insertSecIdx = firstFiguresIdx;
    } else if (lastTocIdx >= 0) {
      insertSecIdx = lastTocIdx;
      insertAfterAnchor = true;
    } else {
      let cursor = 0;
      insertSecIdx = Math.max(0, sections.length - 1);
      for (let i = 0; i < sections.length; i++) {
        const len = Math.max(1, sections[i].displayLists.length);
        if (activePageIndex < cursor + len) {
          insertSecIdx = i;
          break;
        }
        cursor += len;
      }
    }
  }

  const sectionPageBase = new Map<number, number>();
  {
    let base = 0;
    sections.forEach((sec, sIdx) => {
      sectionPageBase.set(sIdx, base);
      base += sec.displayLists.length;
    });
  }

  const pageOfElement = (sectionIndex: number, node: DocumentNode): number => {
    const sec = sections[sectionIndex];
    const base = sectionPageBase.get(sectionIndex) ?? 0;
    if (!sec) return base;
    const sub = getSubtreeIds(node);
    for (let p = 0; p < sec.displayLists.length; p++) {
      for (const cmd of sec.displayLists[p].commands) {
        if (cmd.kind === 'text' && cmd.source && sub.has(cmd.source.start.nodeId)) {
          return base + p;
        }
        if (cmd.kind !== 'text' && cmd.nodeId && sub.has(cmd.nodeId)) {
          return base + p;
        }
      }
    }
    return base;
  };

function stampMissingObjectIdsInSnaps(
  snaps: EngineSectionSnapshot[],
  uid: (prefix: string) => string,
): void {
  for (let i = 0; i < snaps.length; i++) {
    let mutated = false;
    const visit = (nodes: readonly DocumentNode[], inCell: boolean, ignored: boolean): readonly DocumentNode[] =>
      nodes.map(n => {
        if (n.kind !== 'element') return n;
        const skip = ignored || isTocNode(n) || isObjectIndexNode(n);
        if (skip) return n;
        let nextNode = n;
        const isObj = (n.tag === 'table' && !inCell) || n.tag === 'img';
        if (isObj && !n.attributes['data-word-continuation'] && !n.attributes['data-word-object-id']) {
          mutated = true;
          const objId = n.attributes['id'] || uid('obj');
          nextNode = {
            ...n,
            attributes: {
              ...n.attributes,
              id: objId,
              'data-word-object-id': objId,
            },
          };
        }
        const nextCh = visit(nextNode.children, inCell || n.tag === 'td' || n.tag === 'th', skip);
        return nextCh === nextNode.children ? nextNode : { ...nextNode, children: nextCh };
      });
    const nextRoots = visit(snaps[i].state.roots, false, false);
    if (mutated || nextRoots !== snaps[i].state.roots) {
      snaps[i] = {
        ...snaps[i],
        state: { ...snaps[i].state, revision: snaps[i].state.revision + 1, roots: nextRoots },
      };
    }
  }
}

  stampMissingObjectIdsInSnaps(snaps, uid);
  const collected = collectObjectsFromSnaps(snaps).filter(entry => entry.object.kind === kind);
  const hasAnyCaptionedOrTitled = collected.some(
    entry => entry.object.number > 0 || Boolean(entry.object.appendixLabel) || Boolean(entry.object.title.trim()),
  );
  const selected = hasAnyCaptionedOrTitled
    ? collected.filter(
        entry => entry.object.number > 0 || Boolean(entry.object.appendixLabel) || Boolean(entry.object.title.trim()),
      )
    : collected;

  const prefixWord = kind === 'table' ? 'Tabla' : 'Figura';
  const titleStripRe = new RegExp(`^${prefixWord}\\s+\\d+(?:[:.\\s-]+|$)`, 'i');
  const rawItems: HeadingItem[] = selected.map((entry, idx) => {
    const baseLabel =
      entry.object.number > 0 || entry.object.appendixLabel
        ? academicObjectLabel(entry.object)
        : `${prefixWord} ${idx + 1}`;
    const rawTitle = entry.object.title.replace(/\s+/g, ' ').trim();
    const cleanedTitle = rawTitle.replace(titleStripRe, '').trim();
    const fullLabel = cleanedTitle ? `${baseLabel}: ${cleanedTitle}` : baseLabel;
    return {
      id: entry.object.id,
      text: fullLabel,
      level: 1,
      pageIndex: pageOfElement(entry.sectionIndex, entry.node),
    };
  });

  const isApa = options.template?.academicStyle === 'apa7';
  const typography = options.typography ?? extractModelTocTypography(snaps);
  const listAttr = kind === 'table' ? 'tables' : 'figures';
  const override: TocRootOverrideConfig = {
    headerText: kind === 'table'
      ? (isApa ? 'Índice de tablas' : 'ÍNDICE DE TABLAS')
      : (isApa ? 'Índice de figuras' : 'ÍNDICE DE FIGURAS'),
    emptyText: kind === 'table'
      ? 'No se encontraron tablas tituladas o insertadas en el documento.'
      : 'No se encontraron figuras o imágenes en el documento.',
    rootAttributes: {
      class: 'word-toc-page-section word-object-index-section',
      contenteditable: 'false',
      'data-word-list-of': listAttr,
    },
    flatWeight: true,
  };

  let pagesBeforeInsert = 0;
  const boundIdx = insertAfterAnchor ? insertSecIdx + 1 : insertSecIdx;
  for (let i = 0; i < boundIdx && i < sections.length; i++) {
    if (!pureIndexSections.has(i)) pagesBeforeInsert += sections[i].displayLists.length;
  }
  const splitIdx = rawItems.findIndex(item => item.pageIndex >= pagesBeforeInsert);
  const effectiveSplit = splitIdx < 0 ? rawItems.length : splitIdx;

  const initialSlices = paginateModelTocHeadings(rawItems, 1, options, typography, uid, override);
  const pageCount = initialSlices.length;
  const oldPageCount = Array.from(pureIndexSections).reduce(
    (sum, sIdx) => sum + (sections[sIdx]?.displayLists.length ?? 0),
    0,
  );
  const deltaPages = pageCount - oldPageCount;
  const shiftedItems = rawItems.map((item, idx) =>
    idx >= effectiveSplit ? { ...item, pageIndex: Math.max(0, item.pageIndex + deltaPages) } : item,
  );
  const finalSlices = paginateModelTocHeadings(shiftedItems, 1, options, typography, uid, override);

  const indexSnaps: EngineSectionSnapshot[] = options.measureDisplayLists
    ? (() => {
        const built = buildModelTocPageRoot(
          shiftedItems,
          1,
          options,
          typography,
          true,
          shiftedItems.length === 0,
          uid,
          override,
        );
        const pageIds = Array.from({ length: Math.max(1, finalSlices.length) }, () => uid(`idx-${kind}`));
        return [
          {
            id: pageIds[0],
            breakBefore: 'manual' as const,
            state: { revision: 1, roots: [built.root], selection: null },
            pageIds,
          },
        ];
      })()
    : finalSlices.map((slice, idx) => {
        const secId = uid(`idx-${kind}`);
        const built = buildModelTocPageRoot(
          slice,
          1,
          options,
          typography,
          idx === 0,
          shiftedItems.length === 0,
          uid,
          override,
        );
        return {
          id: secId,
          breakBefore: 'manual' as const,
          state: { revision: 1, roots: [built.root], selection: null },
          pageIds: [secId],
        };
      });

  const anchorSecId = sections[insertSecIdx]?.id;
  const replaceEmptyAnchor =
    existingIndices.length === 0 &&
    !insertAfterAnchor &&
    insert &&
    Boolean(snaps[insertSecIdx] && !sectionHasMeaningfulContent(snaps[insertSecIdx].state.roots));

  let resolvedInsertPos = -1;
  const nextSnaps: EngineSectionSnapshot[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    const isAnchor = snap.id === anchorSecId;
    if (isAnchor && !insertAfterAnchor && resolvedInsertPos < 0) {
      resolvedInsertPos = nextSnaps.length;
    }
    if (replaceEmptyAnchor && isAnchor) continue;
    if (nodeContainsObjectIndex(snap.state.roots, kind)) {
      const cleaned = stripObjectIndexNodes(snap.state.roots, kind);
      if (sectionHasMeaningfulContent(cleaned)) {
        nextSnaps.push({
          ...snap,
          state: { ...snap.state, revision: snap.state.revision + 1, roots: cleaned },
        });
      }
      if (isAnchor && insertAfterAnchor && resolvedInsertPos < 0) {
        resolvedInsertPos = nextSnaps.length;
      }
      continue;
    }
    nextSnaps.push(snap);
    if (isAnchor && insertAfterAnchor && resolvedInsertPos < 0) {
      resolvedInsertPos = nextSnaps.length;
    }
  }

  if (resolvedInsertPos < 0) {
    resolvedInsertPos = Math.min(boundIdx, nextSnaps.length);
  }

  nextSnaps.splice(resolvedInsertPos, 0, ...indexSnaps);
  const afterIdx = resolvedInsertPos + indexSnaps.length;
  if (nextSnaps[afterIdx] && nextSnaps[afterIdx].breakBefore !== 'manual') {
    nextSnaps[afterIdx] = { ...nextSnaps[afterIdx], breakBefore: 'manual' };
  }

  snaps.splice(0, snaps.length, ...nextSnaps);
  return {
    found: true,
    changed: true,
    indexSectionIndex: resolvedInsertPos,
    pageCount: finalSlices.length,
    entries: shiftedItems.map(item => ({ id: item.id, label: item.text, pageIndex: item.pageIndex })),
  };
}
