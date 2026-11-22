import type { DocumentNode, DocumentState } from './document-model';
import type { PageDisplayList } from './canvas-page-renderer';
import { serializeDocumentNodes } from './document-model-dom';

const wholeRootHtmlCache = new WeakMap<DocumentNode, string>();
const pageCommandsOccurrencesCache = new WeakMap<readonly PageDisplayList['commands'][number][], Map<string, number>>();
const rootLeavesCache = new WeakMap<DocumentNode, { leaf: DocumentNode; blockId: string }[]>();
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'pre', 'figcaption']);

function getPageOccurrences(commands: readonly PageDisplayList['commands'][number][]): Map<string, number> {
  const cached = pageCommandsOccurrencesCache.get(commands);
  if (cached) return cached;
  const map = new Map<string, number>();
  for (const command of commands) {
    const id = command.kind === 'text' ? command.source?.start.nodeId : command.nodeId;
    if (!id) continue;
    const offset = command.kind === 'text' ? command.source?.start.offset ?? 0 : 0;
    const prev = map.get(id);
    if (prev === undefined || offset < prev) map.set(id, offset);
  }
  pageCommandsOccurrencesCache.set(commands, map);
  return map;
}

function getRootLeaves(root: DocumentNode): { leaf: DocumentNode; blockId: string }[] {
  const cached = rootLeavesCache.get(root);
  if (cached) return cached;
  const list: { leaf: DocumentNode; blockId: string }[] = [];
  const collect = (node: DocumentNode, currentBlock?: string) => {
    const nextBlock =
      node.kind === 'element' &&
      (BLOCK_TAGS.has(node.tag) ||
        (node.tag === 'div' &&
          !node.children.some(c => c.kind === 'element' && (BLOCK_TAGS.has(c.tag) || ['div', 'ul', 'ol', 'table'].includes(c.tag)))))
        ? node.id
        : currentBlock ?? node.id;
    if (node.kind === 'text' || !node.children.length) {
      list.push({ leaf: node, blockId: nextBlock });
    } else {
      for (const child of node.children) collect(child, nextBlock);
    }
  };
  collect(root);
  rootLeavesCache.set(root, list);
  return list;
}

/** Projection only: every source leaf belongs to exactly one page or a contiguous text slice.
 * Whitespace omitted by wrapping is retained in the source projection, never reconstructed
 * from rendered glyphs. Objects are identified by node, not by URL (which can be repeated).
 */
export function serializeModelPages(state: DocumentState, pages: readonly PageDisplayList[], withSelection = false): string[] {
  const occurrences = new Map<string, Map<number, number>>();
  pages.forEach((page, index) => {
    for (const [id, minOffset] of getPageOccurrences(page.commands)) {
      let at = occurrences.get(id);
      if (!at) {
        at = new Map<number, number>();
        occurrences.set(id, at);
      }
      at.set(index, minOffset);
    }
  });
  const leaves: DocumentNode[] = [];
  const leafBlock = new Map<string, string>();
  for (const root of state.roots) {
    for (const item of getRootLeaves(root)) {
      leaves.push(item.leaf);
      leafBlock.set(item.leaf.id, item.blockId);
    }
  }
  const assigned = new Map<string, Map<number, { from: number; to: number }>>();
  let previousPage = 0;
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const at = occurrences.get(leaf.id);
    let entries: [number, number][];
    if (at) {
      entries = [...at].sort((a, b) => a[0] - b[0]);
    } else {
      const blockId = leafBlock.get(leaf.id);
      let resolvedPage: number | undefined;
      for (let prev = i - 1; prev >= 0 && leafBlock.get(leaves[prev].id) === blockId; prev--) {
        const prevAt = occurrences.get(leaves[prev].id);
        if (prevAt) {
          resolvedPage = Math.max(...prevAt.keys());
          break;
        }
      }
      if (resolvedPage === undefined) {
        for (let next = i + 1; next < leaves.length && leafBlock.get(leaves[next].id) === blockId; next++) {
          const nextAt = occurrences.get(leaves[next].id);
          if (nextAt) {
            resolvedPage = Math.min(...nextAt.keys());
            break;
          }
        }
      }
      entries = [[resolvedPage ?? previousPage, 0]];
    }
    const slices = new Map<number, { from: number; to: number }>();
    entries.forEach(([page, offset], index) => {
      slices.set(page, { from: index === 0 ? 0 : offset, to: entries[index + 1]?.[1] ?? (leaf.kind === 'text' ? leaf.text.length : 0) });
    });
    assigned.set(leaf.id, slices); previousPage = entries.at(-1)![0];
  }
  const markers = new Map<string, { offset: number; token: string; page: number }[]>();
  const startToken = `weave-canvas-start-${crypto.randomUUID()}`;
  const endToken = `weave-canvas-end-${crypto.randomUUID()}`;
  if (withSelection && state.selection) {
    const order = (p: {nodeId:string;offset:number}) => leaves.findIndex(n=>n.id===p.nodeId)*1e9+p.offset;
    const {anchor,focus}=state.selection;
    const [start,end]=order(anchor)<=order(focus)?[anchor,focus]:[focus,anchor];
    for(const [position,token] of [[start,startToken],...(order(start)===order(end)?[]:[[end,endToken]])] as [typeof start,string][]) {
      const slices=assigned.get(position.nodeId);if(!slices)continue;
      const page=[...slices].filter(([,slice])=>slice.from<=position.offset).at(-1)?.[0];if(page===undefined)continue;
      const list=markers.get(position.nodeId)||[];list.push({offset:position.offset,token,page});markers.set(position.nodeId,list);
    }
  }
  const pageMembership = new Map<string, Set<number>>();
  const splitSubtree = new Set<string>();
  const members = (node: DocumentNode): Set<number> => {
    const leafSlices = assigned.get(node.id);
    const set = leafSlices ? new Set(leafSlices.keys()) : new Set<number>();
    let isSplit = leafSlices ? leafSlices.size > 1 : false;
    if (node.kind === 'element') {
      for (const child of node.children) {
        for (const page of members(child)) set.add(page);
        if (splitSubtree.has(child.id)) isSplit = true;
      }
    }
    if (set.size > 1 || isSplit) splitSubtree.add(node.id);
    pageMembership.set(node.id, set);
    return set;
  };
  const rootsByPage: DocumentNode[][] = pages.map(() => []);
  for (const root of state.roots) {
    if (!withSelection) {
      const rLeaves = getRootLeaves(root);
      if (rLeaves.length > 0) {
        let singlePage = -1;
        let unsplit = true;
        for (let i = 0; i < rLeaves.length; i++) {
          const slices = assigned.get(rLeaves[i].leaf.id);
          if (!slices || slices.size !== 1) { unsplit = false; break; }
          const p = slices.keys().next().value!;
          if (singlePage === -1) singlePage = p;
          else if (singlePage !== p) { unsplit = false; break; }
        }
        if (unsplit && singlePage >= 0 && singlePage < rootsByPage.length) {
          rootsByPage[singlePage].push(root);
          continue;
        }
      }
    }
    const rootPages = members(root);
    for (const pageIdx of rootPages) {
      if (pageIdx >= 0 && pageIdx < rootsByPage.length) {
        rootsByPage[pageIdx].push(root);
      }
    }
  }
  const project = (nodes: readonly DocumentNode[], index: number): DocumentNode[] => nodes.flatMap<DocumentNode>(node => {
    if (!pageMembership.get(node.id)?.has(index)) return [];
    const slice = assigned.get(node.id)?.get(index);
    if (node.kind === 'text') {
      if(!slice)return [];
      let text=node.text.slice(slice.from,slice.to);
      for(const marker of (markers.get(node.id)||[]).filter(m=>m.page===index).sort((a,b)=>b.offset-a.offset)) {
        const offset=marker.offset-slice.from;text=text.slice(0,offset)+marker.token+text.slice(offset);
      }
      return [{...node,text}];
    }
    const attributes = { ...node.attributes };
    const memberPages = pageMembership.get(node.id)!;
    if (memberPages.size > 1) {
      const flow = attributes['data-word-flow'] || node.id;
      attributes['data-word-flow'] = flow;
      if (index !== Math.min(...memberPages)) { attributes['data-word-continuation'] = flow; delete attributes['id']; }
    }
    return [{ ...node, attributes, children: project(node.children, index) }];
  });
  return pages.map((_, index) => {
    const pageRoots = rootsByPage[index];
    if (!pageRoots.length) return '<p><br></p>';
    const parts: string[] = [];
    for (const root of pageRoots) {
      if (!withSelection && !splitSubtree.has(root.id)) {
        let html = wholeRootHtmlCache.get(root);
        if (html === undefined) {
          html = serializeDocumentNodes([root]);
          wholeRootHtmlCache.set(root, html);
        }
        parts.push(html);
      } else {
        parts.push(serializeDocumentNodes(project([root], index)));
      }
    }
    return parts.join('').replace(startToken, '<!--weave-selection-start-->').replace(endToken, '<!--weave-selection-end-->') || '<p><br></p>';
  });
}
