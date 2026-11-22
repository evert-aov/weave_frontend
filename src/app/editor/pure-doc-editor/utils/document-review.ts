import type { DocumentNode } from '../engine/document-model';
import type { DocumentPage, DocumentRevisionItem } from '../models/word-document.model';

function hasClassToken(classAttr: string | undefined, token: string): boolean {
  return Boolean(classAttr && classAttr.split(/\s+/).includes(token));
}

/**
 * Neutraliza anclas de comentarios y elimina insignias heredadas en un árbol `DocumentNode`
 * sin mutar los nodos originales, para exportar Canvas PDF limpio cuando `hideComments` está activo.
 */
export function stripCommentMarkersFromNodes(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  let changed = false;
  const out: DocumentNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push(node);
      continue;
    }
    const cls = node.attributes['class'];
    if (hasClassToken(cls, 'word-comment-badge')) {
      changed = true;
      continue;
    }
    const nextChildren = stripCommentMarkersFromNodes(node.children);
    if ('data-word-comment-id' in node.attributes || hasClassToken(cls, 'word-comment-anchor')) {
      changed = true;
      out.push(...nextChildren);
      continue;
    }
    if (nextChildren !== node.children) {
      changed = true;
      out.push({ ...node, children: nextChildren });
    } else {
      out.push(node);
    }
  }
  return changed ? out : nodes;
}

/**
 * Limpia marcas visuales de comentarios en HTML manteniendo el texto anclado intacto.
 */
export function sanitizeHtmlForReviewExport(
  html: string,
  options: { hideComments?: boolean } = {},
): string {
  if (!options.hideComments || !html) return html;
  if (typeof document === 'undefined') {
    return html
      .replace(/<span[^>]*word-comment-badge[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<\/?(?:span|mark)[^>]*data-word-comment-id[^>]*>/gi, '');
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  for (const badge of Array.from(container.querySelectorAll('.word-comment-badge'))) {
    badge.remove();
  }
  for (const anchor of Array.from(container.querySelectorAll('[data-word-comment-id], .word-comment-anchor'))) {
    const parent = anchor.parentNode;
    if (!parent) continue;
    while (anchor.firstChild) {
      parent.insertBefore(anchor.firstChild, anchor);
    }
    parent.removeChild(anchor);
  }
  return container.innerHTML || '<p><br></p>';
}

/**
 * Genera una copia de las páginas lista para exportación respetando `hideComments`.
 */
export function sanitizePagesForExport(
  pages: readonly DocumentPage[],
  options: { hideComments?: boolean } = {},
): DocumentPage[] {
  if (!options.hideComments) return pages.map(p => ({ ...p }));
  return pages.map(page => ({
    ...page,
    html: sanitizeHtmlForReviewExport(page.html, options),
  }));
}

/**
 * Extrae la lista de cambios rastreados (`<ins data-word-rev="ins">` / `<del data-word-rev="del">`)
 * desde páginas HTML (modo DOM / respaldo).
 */
export function listRevisionsInPages(pages: readonly DocumentPage[]): DocumentRevisionItem[] {
  if (typeof document === 'undefined') return [];
  const items: DocumentRevisionItem[] = [];
  pages.forEach((page, pageIndex) => {
    const container = document.createElement('div');
    container.innerHTML = page.html;
    const revNodes = container.querySelectorAll('ins[data-word-rev], del[data-word-rev]');
    revNodes.forEach((el, idx) => {
      const kind = (el.getAttribute('data-word-rev') || el.tagName.toLowerCase()) === 'del' ? 'del' : 'ins';
      const id = el.getAttribute('data-word-rev-id') || `dom-rev-${pageIndex}-${idx + 1}`;
      const author = el.getAttribute('data-word-rev-author') || 'Usuario';
      const atRaw = Number(el.getAttribute('data-word-rev-at'));
      items.push({
        id,
        kind,
        text: (el.textContent || '').trim(),
        author,
        createdAt: Number.isFinite(atRaw) && atRaw > 0 ? atRaw : Date.now(),
        pageIndex,
        y: idx * 24,
      });
    });
  });
  return items;
}

/**
 * Acepta o rechaza uno o todos los cambios rastreados dentro de un fragmento HTML (modo DOM).
 */
export function applyRevisionDecisionToHtml(
  html: string,
  action: 'accept' | 'reject',
  revId?: string,
): { html: string; changed: boolean } {
  if (!html || typeof document === 'undefined') return { html, changed: false };
  const container = document.createElement('div');
  container.innerHTML = html;
  const targets = Array.from(container.querySelectorAll('ins[data-word-rev], del[data-word-rev]')).filter(el => {
    if (!revId) return true;
    return el.getAttribute('data-word-rev-id') === revId;
  });
  if (!targets.length) return { html, changed: false };

  for (const el of targets) {
    const kind = (el.getAttribute('data-word-rev') || el.tagName.toLowerCase()) === 'del' ? 'del' : 'ins';
    const keepContent = (action === 'accept' && kind === 'ins') || (action === 'reject' && kind === 'del');
    const parent = el.parentNode;
    if (!parent) continue;
    if (keepContent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
    }
    parent.removeChild(el);
  }
  return { html: container.innerHTML || '<p><br></p>', changed: true };
}
