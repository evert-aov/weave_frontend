import type { DocumentNode } from '../engine/document-model';
import type { DocumentCommentReply, DocumentCommentThread, DocumentPage } from '../models/word-document.model';
import type { DocDataV3, SerializedDocSectionModel } from '../models/word-editor-state.model';

function isValidNode(node: unknown): node is DocumentNode {
  if (!node || typeof node !== 'object') return false;
  const record = node as Record<string, unknown>;
  if (typeof record['id'] !== 'string' || !record['id']) return false;
  if (record['kind'] === 'text') return typeof record['text'] === 'string';
  if (record['kind'] === 'element') {
    return (
      typeof record['tag'] === 'string' &&
      !!record['tag'] &&
      typeof record['attributes'] === 'object' &&
      record['attributes'] !== null &&
      Array.isArray(record['children']) &&
      record['children'].every(isValidNode)
    );
  }
  return false;
}

function isValidSectionList(
  rawSections: unknown,
  pages: readonly DocumentPage[],
): rawSections is SerializedDocSectionModel[] {
  if (!Array.isArray(rawSections) || !rawSections.length || !pages.length) return false;
  const pageIdsFromModel: string[] = [];
  for (const sec of rawSections) {
    if (!sec || typeof sec !== 'object') return false;
    const item = sec as Record<string, unknown>;
    if (typeof item['id'] !== 'string' || !Array.isArray(item['pageIds'])) return false;
    const state = item['state'] as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object' || typeof state['revision'] !== 'number' || !Array.isArray(state['roots'])) {
      return false;
    }
    if (!state['roots'].every(isValidNode)) return false;
    for (const pid of item['pageIds']) {
      if (typeof pid !== 'string') return false;
      pageIdsFromModel.push(pid);
    }
  }
  return (
    pageIdsFromModel.length === pages.length &&
    pageIdsFromModel.every((pid, idx) => pid === pages[idx].id)
  );
}

function normalizeComments(raw: unknown): DocumentCommentThread[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DocumentCommentThread[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec['id'] !== 'string' || !rec['id']) continue;
    const replies: DocumentCommentReply[] = Array.isArray(rec['replies'])
      ? rec['replies']
          .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
          .map((r, idx) => ({
            id: typeof r['id'] === 'string' && r['id'] ? r['id'] : `${rec['id']}-r-${idx + 1}`,
            author: typeof r['author'] === 'string' ? r['author'] : 'Usuario',
            text: typeof r['text'] === 'string' ? r['text'] : '',
            createdAt: typeof r['createdAt'] === 'number' ? r['createdAt'] : Date.now(),
          }))
      : [];
    out.push({
      id: rec['id'],
      author: typeof rec['author'] === 'string' && rec['author'] ? rec['author'] : 'Usuario',
      text: typeof rec['text'] === 'string' ? rec['text'] : '',
      quote: typeof rec['quote'] === 'string' ? rec['quote'] : '',
      createdAt: typeof rec['createdAt'] === 'number' ? rec['createdAt'] : Date.now(),
      resolved: Boolean(rec['resolved']),
      ...(typeof rec['resolvedAt'] === 'number' ? { resolvedAt: rec['resolvedAt'] } : {}),
      ...(typeof rec['pageIndex'] === 'number' ? { pageIndex: rec['pageIndex'] } : {}),
      replies,
    });
  }
  return out;
}

/**
 * Normaliza `docData` desde formatos legacy (`sin versión`, `v: 2`) o `v: 3` con modelo estructurado.
 * Si `modelSections` no coincide exactamente con `pages`, cae de forma segura a la rehidratación HTML.
 */
export function normalizeLoadedDocData(raw: unknown): DocDataV3 {
  if (!raw || typeof raw !== 'object') {
    return { v: 3 };
  }
  const source = raw as Record<string, unknown>;
  const pages = Array.isArray(source['pages'])
    ? (source['pages'] as DocumentPage[]).map(p => ({ ...p }))
    : undefined;
  const validModels =
    source['v'] === 3 && pages && isValidSectionList(source['modelSections'], pages)
      ? (source['modelSections'] as SerializedDocSectionModel[])
      : undefined;
  const comments = normalizeComments(source['comments']);

  const { modelSections: _ignoredModelSections, pages: _ignoredPages, comments: _ignoredComments, ...rest } = source;
  return {
    ...(rest as Omit<DocDataV3, 'v' | 'modelSections' | 'pages' | 'comments'>),
    v: 3,
    ...(pages ? { pages } : {}),
    ...(validModels ? { modelSections: validModels } : {}),
    ...(comments ? { comments } : {}),
  };
}

/**
 * Transforma `src` de nodos `<img>` dentro de un árbol del modelo sin mutar los nodos originales.
 */
export async function mapModelSectionImages(
  sections: readonly SerializedDocSectionModel[],
  transformSrc: (src: string) => Promise<string>,
): Promise<SerializedDocSectionModel[]> {
  const mapNodes = async (nodes: readonly DocumentNode[]): Promise<readonly DocumentNode[]> => {
    let changed = false;
    const next: DocumentNode[] = [];
    for (const node of nodes) {
      if (node.kind === 'element' && node.tag === 'img' && node.attributes['src']) {
        const nextSrc = await transformSrc(node.attributes['src']);
        if (nextSrc !== node.attributes['src']) {
          changed = true;
          next.push({ ...node, attributes: { ...node.attributes, src: nextSrc } });
          continue;
        }
      }
      if (node.kind === 'element' && node.children.length) {
        const nextChildren = await mapNodes(node.children);
        if (nextChildren !== node.children) {
          changed = true;
          next.push({ ...node, children: nextChildren });
          continue;
        }
      }
      next.push(node);
    }
    return changed ? next : nodes;
  };

  return Promise.all(
    sections.map(async sec => {
      const nextRoots = await mapNodes(sec.state.roots);
      return nextRoots === sec.state.roots
        ? sec
        : { ...sec, state: { ...sec.state, roots: nextRoots } };
    }),
  );
}
