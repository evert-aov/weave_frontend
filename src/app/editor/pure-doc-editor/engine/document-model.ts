/** Persistent document tree. DOM is used only by import/export adapters. */
export type DocumentNode =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'element'; tag: string; attributes: Readonly<Record<string, string>>; children: readonly DocumentNode[] };
export interface DocumentPosition { nodeId: string; offset: number }
export interface DocumentSelection { anchor: DocumentPosition; focus: DocumentPosition }
export interface DocumentState { revision: number; roots: readonly DocumentNode[]; selection: DocumentSelection | null }
export interface ReplaceText { type: 'replaceText'; selection: DocumentSelection; text: string }
export interface SetAttributes { type: 'setAttributes'; nodeId: string; attributes: Readonly<Record<string, string | null>> }
export interface SplitBlock { type: 'splitBlock'; position: DocumentPosition; newBlockId?: string; newTextId?: string }
export interface MergeBlocks { type: 'mergeBlocks'; leftBlockId: string; rightBlockId: string }
export interface InsertNodes { type: 'insertNodes'; parentId?: string; index: number; nodes: readonly DocumentNode[]; selection?: DocumentSelection | null }
export interface RemoveNode { type: 'removeNode'; nodeId: string; selection?: DocumentSelection | null }
export type DocumentOperation = ReplaceText | SetAttributes | SplitBlock | MergeBlocks | InsertNodes | RemoveNode;

const MERGEABLE_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);
const MODEL_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const textNodesByArray = new WeakMap<readonly DocumentNode[], Extract<DocumentNode, { kind: 'text' }>[]>();
const textNodesByNode = new WeakMap<DocumentNode, Extract<DocumentNode, { kind: 'text' }>[]>();
const subtreeIdsCache = new WeakMap<DocumentNode, Set<string>>();

export function getSubtreeIds(node: DocumentNode): Set<string> {
  const cached = subtreeIdsCache.get(node);
  if (cached) return cached;
  const set = new Set<string>([node.id]);
  if (node.kind === 'element') {
    for (const child of node.children) {
      for (const id of getSubtreeIds(child)) set.add(id);
    }
  }
  subtreeIdsCache.set(node, set);
  return set;
}

export function findAncestorPath(nodes: readonly DocumentNode[], targetId: string): DocumentNode[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.kind === 'element' && getSubtreeIds(node).has(targetId)) {
      const sub = findAncestorPath(node.children, targetId);
      if (sub.length) return [node, ...sub];
    }
  }
  return [];
}

function visit(
  nodes: readonly DocumentNode[],
  transform: (node: DocumentNode) => DocumentNode,
  targetIds?: ReadonlySet<string>,
): readonly DocumentNode[] {
  let changed = false;
  const result = nodes.map(node => {
    if (targetIds) {
      const ids = getSubtreeIds(node);
      let hit = false;
      for (const t of targetIds) {
        if (ids.has(t)) { hit = true; break; }
      }
      if (!hit) return node;
    }
    let next = node;
    if (node.kind === 'element') {
      const children = visit(node.children, transform, targetIds);
      if (children !== node.children) next = { ...node, children };
    }
    next = transform(next); changed ||= next !== node; return next;
  });
  return changed ? result : nodes;
}

function nodeTextNodes(node: DocumentNode): Extract<DocumentNode, { kind: 'text' }>[] {
  if (node.kind === 'text') return [node];
  const cached = textNodesByNode.get(node);
  if (cached) return cached;
  const result: Extract<DocumentNode, { kind: 'text' }>[] = [];
  for (const child of node.children) {
    const childTexts = nodeTextNodes(child);
    for (let i = 0; i < childTexts.length; i++) result.push(childTexts[i]);
  }
  textNodesByNode.set(node, result);
  return result;
}

export function textNodes(nodes: readonly DocumentNode[]): Extract<DocumentNode, { kind: 'text' }>[] {
  const cached = textNodesByArray.get(nodes);
  if (cached) return cached;
  const result: Extract<DocumentNode, { kind: 'text' }>[] = [];
  for (const node of nodes) {
    const childTexts = nodeTextNodes(node);
    for (let i = 0; i < childTexts.length; i++) result.push(childTexts[i]);
  }
  textNodesByArray.set(nodes, result);
  return result;
}

export function findNodeById(nodes: readonly DocumentNode[], id: string): DocumentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === 'element' && getSubtreeIds(node).has(id)) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findEnclosingBlock(
  nodes: readonly DocumentNode[],
  targetId: string,
  parentId: string | null = null,
): { block: Extract<DocumentNode, { kind: 'element' }>; parentId: string | null } | null {
  for (const node of nodes) {
    if (node.kind !== 'element' || !getSubtreeIds(node).has(targetId)) continue;
    const nested = findEnclosingBlock(node.children, targetId, node.id);
    if (nested) return nested;
    if (MERGEABLE_BLOCKS.has(node.tag)) {
      return { block: node, parentId };
    }
  }
  return null;
}

function validateOffset(text: string, offset: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new Error('Invalid text position');
  if (offset > 0 && offset < text.length) {
    const segments = MODEL_SEGMENTER.segment(text);
    if (segments.containing(offset)?.index !== offset) throw new Error('Position splits a grapheme');
  }
}

function stripTrailingPlaceholderBr(children: readonly DocumentNode[]): readonly DocumentNode[] {
  const hasNonEmptyText = textNodes(children).some(t => t.text.length > 0);
  if (!hasNonEmptyText) return children;
  return children.filter(c => !(c.kind === 'element' && c.tag === 'br'));
}

function splitSubtree(
  nodes: readonly DocumentNode[],
  targetId: string,
  offset: number,
  idSuffix: string,
  state: { seen: boolean; found: boolean; firstRightTextId?: string },
): { left: DocumentNode[]; right: DocumentNode[] } {
  const left: DocumentNode[] = [];
  const right: DocumentNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (node.id === targetId) {
        validateOffset(node.text, offset);
        state.found = true;
        state.seen = true;
        const leftText = node.text.slice(0, offset);
        const rightText = node.text.slice(offset);
        left.push({ id: node.id, kind: 'text', text: leftText });
        const rightId = `${node.id}${idSuffix}`;
        state.firstRightTextId ??= rightId;
        right.push({ id: rightId, kind: 'text', text: rightText });
      } else if (!state.seen) {
        left.push(node);
      } else {
        state.firstRightTextId ??= node.id;
        right.push(node);
      }
      continue;
    }
    if (node.id === targetId && offset === 0) {
      state.found = true;
      state.seen = true;
      const leftTextId = `${node.id}:L${idSuffix}`;
      const rightTextId = `${node.id}:R${idSuffix}`;
      state.firstRightTextId ??= rightTextId;
      left.push({ id: leftTextId, kind: 'text', text: '' });
      right.push({ id: rightTextId, kind: 'text', text: '' });
      continue;
    }
    if (!state.seen && findNodeById(node.children, targetId)) {
      const split = splitSubtree(node.children, targetId, offset, idSuffix, state);
      if (split.left.length) left.push({ ...node, children: split.left });
      if (split.right.length) {
        const attrs = { ...node.attributes };
        delete attrs['id'];
        right.push({ ...node, id: `${node.id}${idSuffix}`, attributes: attrs, children: split.right });
      }
    } else if (!state.seen) {
      left.push(node);
    } else {
      const firstText = textNodes([node])[0];
      if (firstText) state.firstRightTextId ??= firstText.id;
      right.push(node);
    }
  }
  return { left, right };
}

function replaceInContainer(
  nodes: readonly DocumentNode[],
  parentId: string | null,
  currentParentId: string | null,
  transform: (children: readonly DocumentNode[]) => readonly DocumentNode[],
): readonly DocumentNode[] {
  if (parentId === currentParentId) return transform(nodes);
  return nodes.map(node => {
    if (node.kind !== 'element') return node;
    const nextChildren = replaceInContainer(node.children, parentId, node.id, transform);
    return nextChildren === node.children ? node : { ...node, children: nextChildren };
  });
}

let splitIdSequence = 0;

/** Applies an immutable transaction. Invalid operations never modify the previous state. */
export function applyDocumentOperation(state: DocumentState, operation: DocumentOperation): DocumentState {
  if (operation.type === 'setAttributes') {
    let found = false;
    const roots = visit(state.roots, node => {
      if (node.id !== operation.nodeId) return node;
      if (node.kind !== 'element') throw new Error('Attributes require an element');
      found = true; const attributes = { ...node.attributes };
      for (const [name, value] of Object.entries(operation.attributes)) {
        if (value === null) delete attributes[name]; else attributes[name] = value;
      }
      return { ...node, attributes };
    });
    if (!found) throw new Error('Unknown node');
    return { ...state, roots, revision: state.revision + 1 };
  }

  if (operation.type === 'insertNodes') {
    if (!Number.isInteger(operation.index) || operation.index < 0) throw new Error('Invalid insert index');
    let inserted = false;
    const insertInto = (list: readonly DocumentNode[]): readonly DocumentNode[] => {
      if (operation.index > list.length) throw new Error('Invalid insert index');
      inserted = true;
      return [...list.slice(0, operation.index), ...operation.nodes, ...list.slice(operation.index)];
    };
    const roots = !operation.parentId
      ? insertInto(state.roots)
      : visit(state.roots, node => {
          if (node.id !== operation.parentId) return node;
          if (node.kind !== 'element') throw new Error('Insert target must be an element');
          return { ...node, children: insertInto(node.children) };
        });
    if (!inserted) throw new Error('Unknown parent node');
    return {
      revision: state.revision + 1,
      roots,
      selection: operation.selection === undefined ? state.selection : operation.selection,
    };
  }

  if (operation.type === 'removeNode') {
    let removed = false;
    const filterList = (list: readonly DocumentNode[]): readonly DocumentNode[] => {
      const next = list.filter(n => n.id !== operation.nodeId);
      if (next.length !== list.length) { removed = true; return next; }
      return list;
    };
    const roots = filterList(visit(state.roots, node => {
      if (node.kind !== 'element') return node;
      const children = filterList(node.children);
      return children === node.children ? node : { ...node, children };
    }));
    if (!removed) throw new Error('Unknown node');
    return {
      revision: state.revision + 1,
      roots,
      selection: operation.selection === undefined ? state.selection : operation.selection,
    };
  }

  if (operation.type === 'splitBlock') {
    const { position } = operation;
    const target = findEnclosingBlock(state.roots, position.nodeId);
    if (!target) throw new Error('Cannot split outside a block element');
    const suffix = `:split-${state.revision + 1}-${++splitIdSequence}`;
    const splitState: { seen: boolean; found: boolean; firstRightTextId?: string } = { seen: false, found: false };
    const { left, right } = splitSubtree(
      target.block.children.length
        ? target.block.children
        : [{ id: `${target.block.id}:empty`, kind: 'text', text: '' }],
      position.nodeId === target.block.id ? `${target.block.id}:empty` : position.nodeId,
      position.offset,
      suffix,
      splitState,
    );
    if (!splitState.found) throw new Error('Unknown split position');
    const rightTextId = operation.newTextId || splitState.firstRightTextId || `${target.block.id}:text${suffix}`;
    const ensuredRight: readonly DocumentNode[] = textNodes(right).length
      ? right
      : [{ id: rightTextId, kind: 'text', text: '' }];
    const ensuredLeft: readonly DocumentNode[] = textNodes(left).length
      ? left
      : [{ id: `${target.block.id}:left${suffix}`, kind: 'text', text: '' }];
    const rightHasText = right.some(n => textNodes([n]).some(t => t.text.length > 0));
    const resetToPlainParagraph =
      (/^h[1-6]$/.test(target.block.tag) || 'data-apa-run-in' in target.block.attributes) && !rightHasText;
    const newAttrs = { ...target.block.attributes };
    delete newAttrs['id'];
    delete newAttrs['data-word-continuation'];
    if (resetToPlainParagraph) {
      delete newAttrs['data-word-chapter'];
      delete newAttrs['data-apa-run-in'];
      delete newAttrs['data-apa-heading-level'];
      delete newAttrs['style'];
    }
    const cleanRightChildren: readonly DocumentNode[] = resetToPlainParagraph
      ? [{ id: textNodes(ensuredRight)[0].id, kind: 'text', text: '' }]
      : ensuredRight;
    const leftBlock: DocumentNode = { ...target.block, children: ensuredLeft };
    const rightBlock: DocumentNode = {
      id: operation.newBlockId || `${target.block.id}${suffix}`,
      kind: 'element',
      tag: resetToPlainParagraph ? 'p' : target.block.tag,
      attributes: newAttrs,
      children: cleanRightChildren,
    };
    const roots = replaceInContainer(state.roots, target.parentId, null, list => {
      const idx = list.findIndex(n => n.id === target.block.id);
      if (idx < 0) return list;
      return [...list.slice(0, idx), leftBlock, rightBlock, ...list.slice(idx + 1)];
    });
    const caretPos = { nodeId: textNodes(ensuredRight)[0].id, offset: 0 };
    return { revision: state.revision + 1, roots, selection: { anchor: caretPos, focus: caretPos } };
  }

  if (operation.type === 'mergeBlocks') {
    const leftInfo = findEnclosingBlock(state.roots, operation.leftBlockId);
    const rightInfo = findEnclosingBlock(state.roots, operation.rightBlockId);
    if (!leftInfo || !rightInfo || leftInfo.block.id === rightInfo.block.id || leftInfo.parentId !== rightInfo.parentId) {
      throw new Error('Incompatible blocks to merge');
    }
    const leftLeaves = textNodes(leftInfo.block.children);
    const rightLeaves = textNodes(rightInfo.block.children);
    const joinNode = leftLeaves.at(-1) ?? rightLeaves[0];
    const joinOffset = leftLeaves.at(-1)?.text.length ?? 0;
    const mergedChildren = stripTrailingPlaceholderBr([...leftInfo.block.children, ...rightInfo.block.children]);
    const ensuredChildren: readonly DocumentNode[] = mergedChildren.length
      ? mergedChildren
      : [{ id: `${leftInfo.block.id}:text`, kind: 'text', text: '' }];
    const caretNodeId = joinNode ? joinNode.id : textNodes(ensuredChildren)[0].id;
    const roots = replaceInContainer(state.roots, leftInfo.parentId, null, list => {
      const leftIdx = list.findIndex(n => n.id === leftInfo.block.id);
      const rightIdx = list.findIndex(n => n.id === rightInfo.block.id);
      if (leftIdx < 0 || rightIdx < 0) throw new Error('Blocks not found in container');
      return list
        .map((node, idx) => idx === leftIdx ? { ...leftInfo.block, children: ensuredChildren } : node)
        .filter((_, idx) => idx !== rightIdx);
    });
    const pos = { nodeId: caretNodeId, offset: joinOffset };
    return { revision: state.revision + 1, roots, selection: { anchor: pos, focus: pos } };
  }

  // ReplaceText on an empty block/cell element or placeholder <br> that has no text node yet:
  const { anchor, focus } = operation.selection;
  if (anchor.nodeId === focus.nodeId && anchor.offset === 0 && focus.offset === 0) {
    const targetNode = findNodeById(state.roots, anchor.nodeId);
    if (targetNode && targetNode.kind === 'element' && textNodes([targetNode]).length === 0) {
      const textId = `${targetNode.id}:text`;
      const newTextNode: DocumentNode = { id: textId, kind: 'text', text: operation.text };
      const roots = targetNode.tag === 'br'
        ? visit(state.roots, node =>
            node.kind === 'element' && node.children.some(c => c.id === targetNode.id)
              ? { ...node, children: node.children.map(c => c.id === targetNode.id ? newTextNode : c) }
              : node
          )
        : visit(state.roots, node =>
            node.id === targetNode.id && node.kind === 'element'
              ? { ...node, children: [newTextNode] }
              : node
          );
      const pos = { nodeId: textId, offset: operation.text.length };
      return { revision: state.revision + 1, roots, selection: { anchor: pos, focus: pos } };
    }
  }

  const leaves = textNodes(state.roots);
  let start = leaves.findIndex(node => node.id === anchor.nodeId), end = leaves.findIndex(node => node.id === focus.nodeId);
  if (start < 0 || end < 0) throw new Error('Unknown text node');
  validateOffset(leaves[start].text, anchor.offset); validateOffset(leaves[end].text, focus.offset);
  let from = anchor.offset, to = focus.offset;
  if (start > end || start === end && from > to) { [start, end] = [end, start]; [from, to] = [to, from]; }
  const edits = new Map<string, string>();
  if (start === end) edits.set(leaves[start].id, leaves[start].text.slice(0, from) + operation.text + leaves[start].text.slice(to));
  else {
    edits.set(leaves[start].id, leaves[start].text.slice(0, from) + operation.text);
    for (let i = start + 1; i < end; i++) edits.set(leaves[i].id, '');
    edits.set(leaves[end].id, leaves[end].text.slice(to));
  }
  let roots = visit(state.roots, node => node.kind === 'text' && edits.has(node.id) ? { ...node, text: edits.get(node.id)! } : node, new Set(edits.keys()));

  // If the replaced range spans across two mergeable blocks in the same container, merge their structures.
  if (start !== end) {
    const startBlock = findEnclosingBlock(roots, leaves[start].id);
    const endBlock = findEnclosingBlock(roots, leaves[end].id);
    if (startBlock && endBlock && startBlock.block.id !== endBlock.block.id && startBlock.parentId === endBlock.parentId) {
      roots = replaceInContainer(roots, startBlock.parentId, null, list => {
        const sIdx = list.findIndex(n => n.id === startBlock.block.id);
        const eIdx = list.findIndex(n => n.id === endBlock.block.id);
        if (sIdx < 0 || eIdx < 0 || sIdx >= eIdx) return list;
        const startLeaves = new Set(textNodes(startBlock.block.children).map(t => t.id));
        const keptStart = startBlock.block.children.filter(child => {
          const childLeaves = textNodes([child]);
          return childLeaves.length === 0 || childLeaves.some(l => l.id === leaves[start].id || l.text.length > 0);
        });
        const keptEnd = endBlock.block.children.filter(child => {
          const childLeaves = textNodes([child]);
          return childLeaves.some(l => !startLeaves.has(l.id) && (l.id === leaves[end].id || l.text.length > 0));
        });
        const merged: DocumentNode = {
          ...startBlock.block,
          children: stripTrailingPlaceholderBr([...keptStart, ...keptEnd]),
        };
        return [...list.slice(0, sIdx), merged, ...list.slice(eIdx + 1)];
      });
    }
  }

  const position = { nodeId: leaves[start].id, offset: from + operation.text.length };
  return { revision: state.revision + 1, roots, selection: { anchor: position, focus: position } };
}

/** History shares immutable subtrees; no serialization or DOM snapshots per command. */
export class DocumentModel {
  private past: DocumentState[] = [];
  private future: DocumentState[] = [];
  constructor(public state: DocumentState, private readonly historyLimit = 100) {}
  apply(operation: DocumentOperation): void {
    this.commit(applyDocumentOperation(this.state, operation));
  }
  commit(next: DocumentState): void {
    this.past.push(this.state); if (this.past.length > this.historyLimit) this.past.shift();
    this.future = []; this.state = next;
  }
  undo(): boolean { const previous = this.past.pop(); if (!previous) return false; this.future.push(this.state); this.state = previous; return true; }
  redo(): boolean { const next = this.future.pop(); if (!next) return false; this.past.push(this.state); this.state = next; return true; }
}
