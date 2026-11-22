import { DocumentNode, textNodes } from './document-model';
import { PageDisplayList, PdfInternalLinkRect, PdfOutlineHeading } from './canvas-page-renderer';

type ElementNode = Extract<DocumentNode, { kind: 'element' }>;

export interface PdfExportSectionLike {
  model: { state: { roots: readonly DocumentNode[] } };
  displayLists: readonly PageDisplayList[];
}

export interface CanvasPdfNavigationMetadata {
  linksByPage: PdfInternalLinkRect[][];
  headings: PdfOutlineHeading[];
}

interface LinkTargetDescriptor {
  groupKey: string;
  targetId?: string;
  title?: string;
  fallbackPageIndex?: number;
}

const TOC_CONTAINER_CLASSES = new Set([
  'word-toc-page-section',
  'word-toc-entry',
  'word-toc-table',
]);

function hasClass(node: ElementNode, className: string): boolean {
  const cls = node.attributes['class'];
  return Boolean(cls && cls.split(/\s+/).includes(className));
}

function isTocContainer(node: ElementNode): boolean {
  const cls = node.attributes['class'] || '';
  if (cls) {
    for (const token of cls.split(/\s+/)) {
      if (TOC_CONTAINER_CLASSES.has(token)) return true;
    }
  }
  const flow = node.attributes['data-word-flow'] || '';
  return flow.toLowerCase().includes('toc');
}

function normalizeHeadingTitle(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTocTrailingPage(raw: string): { title: string; trailingPageIndex?: number } {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const match = /^(.*?)(?:\s*[.·…\-–—_]+\s*|\s{2,}|\t+)(?:p\.?\s*)?(\d{1,5})$/i.exec(trimmed);
  if (!match) return { title: trimmed };
  const pageNum = Number(match[2]);
  return {
    title: match[1].trim(),
    trailingPageIndex: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum - 1 : undefined,
  };
}

function nodePlainText(node: DocumentNode): string {
  return textNodes([node]).map(t => t.text).join('').replace(/\s+/g, ' ').trim();
}

function detectHeadingLevel(node: ElementNode): number | null {
  if (/^h[1-6]$/i.test(node.tag)) return Number(node.tag.slice(1));
  if ('data-apa-heading-level' in node.attributes) {
    const parsed = Number(node.attributes['data-apa-heading-level']);
    return Number.isFinite(parsed) ? parsed : 1;
  }
  if ('data-apa-run-in' in node.attributes) {
    const parsed = Number(node.attributes['data-apa-run-in']);
    return Number.isFinite(parsed) ? parsed : 4;
  }
  if (hasClass(node, 'word-chapter-heading') || node.attributes['data-word-role'] === 'chapter') {
    return 0;
  }
  return null;
}

function buildNodePageIndex(sections: readonly PdfExportSectionLike[]): Map<string, number> {
  const nodePageMap = new Map<string, number>();
  let globalPageBase = 0;
  for (const sec of sections) {
    for (let pIdx = 0; pIdx < sec.displayLists.length; pIdx++) {
      const globalPage = globalPageBase + pIdx;
      const dl = sec.displayLists[pIdx];
      for (const cmd of dl.commands) {
        if (cmd.kind === 'text' && cmd.source) {
          if (!nodePageMap.has(cmd.source.start.nodeId)) {
            nodePageMap.set(cmd.source.start.nodeId, globalPage);
          }
        } else if (cmd.kind !== 'text' && cmd.nodeId && !nodePageMap.has(cmd.nodeId)) {
          nodePageMap.set(cmd.nodeId, globalPage);
        }
      }
    }
    globalPageBase += sec.displayLists.length;
  }
  return nodePageMap;
}

function resolveNodePage(
  node: DocumentNode,
  nodePageMap: ReadonlyMap<string, number>,
  fallback: number,
): number {
  const direct = nodePageMap.get(node.id);
  if (direct !== undefined) return direct;
  if (node.kind === 'element') {
    for (const leaf of textNodes([node])) {
      const hit = nodePageMap.get(leaf.id);
      if (hit !== undefined) return hit;
    }
    const queue: DocumentNode[] = [...node.children];
    while (queue.length) {
      const cur = queue.shift()!;
      const hit = nodePageMap.get(cur.id);
      if (hit !== undefined) return hit;
      if (cur.kind === 'element' && cur.children.length) {
        queue.push(...cur.children);
      }
    }
  }
  return fallback;
}

function parseZeroBasedPageAttr(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOneBasedPageText(text: string): number | undefined {
  const match = /(\d{1,5})/.exec(text);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : undefined;
}

function findDescendantByClass(node: ElementNode, className: string): ElementNode | null {
  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    if (hasClass(child, className)) return child;
    const nested = findDescendantByClass(child, className);
    if (nested) return nested;
  }
  return null;
}

function findInternalAnchorHref(node: ElementNode): string | undefined {
  if (node.tag === 'a') {
    const href = (node.attributes['href'] || '').trim();
    if (href.startsWith('#') && href.length > 1) return href.slice(1);
  }
  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    const nested = findInternalAnchorHref(child);
    if (nested) return nested;
  }
  return undefined;
}

function extractTocRowDescriptor(row: ElementNode): LinkTargetDescriptor | null {
  const nestedEntry = findDescendantByClass(row, 'word-toc-entry');
  const titleEl = findDescendantByClass(row, 'word-toc-title');
  const pageEl = findDescendantByClass(row, 'word-toc-page');
  const targetId =
    row.attributes['data-toc-target-id'] ||
    nestedEntry?.attributes['data-toc-target-id'] ||
    findInternalAnchorHref(row) ||
    undefined;
  const attrPage =
    parseZeroBasedPageAttr(row.attributes['data-toc-page']) ??
    parseZeroBasedPageAttr(nestedEntry?.attributes['data-toc-page']);
  const pageFromCell = pageEl ? parseOneBasedPageText(nodePlainText(pageEl)) : undefined;

  let title = titleEl ? nodePlainText(titleEl) : '';
  let fallbackPageIndex = attrPage ?? pageFromCell;

  if (!title && row.tag === 'tr') {
    const cells = row.children.filter(
      (c: DocumentNode): c is ElementNode => c.kind === 'element' && (c.tag === 'td' || c.tag === 'th'),
    );
    if (cells.length) {
      const lastCellText = nodePlainText(cells[cells.length - 1]);
      if (cells.length >= 2 && fallbackPageIndex === undefined) {
        const lastNum = parseOneBasedPageText(lastCellText);
        if (lastNum !== undefined && /^\s*(?:p\.?\s*)?\d{1,5}\s*$/i.test(lastCellText)) {
          fallbackPageIndex = lastNum;
        }
      }
      const parsedFirst = stripTocTrailingPage(nodePlainText(cells[0]));
      title = parsedFirst.title;
      if (fallbackPageIndex === undefined) fallbackPageIndex = parsedFirst.trailingPageIndex;
    }
  }

  if (!title) {
    const stripped = stripTocTrailingPage(nodePlainText(row));
    title = stripped.title;
    if (fallbackPageIndex === undefined) fallbackPageIndex = stripped.trailingPageIndex;
  }

  if (!targetId && !title && fallbackPageIndex === undefined) return null;
  return {
    groupKey: `toc-row:${row.id}`,
    ...(targetId ? { targetId } : {}),
    ...(title ? { title } : {}),
    ...(fallbackPageIndex !== undefined ? { fallbackPageIndex } : {}),
  };
}

function extractTocEntryDescriptor(tocNode: ElementNode): LinkTargetDescriptor {
  const targetId = tocNode.attributes['data-toc-target-id'] || findInternalAnchorHref(tocNode) || undefined;
  const titleNode = findDescendantByClass(tocNode, 'word-toc-title');
  const pageNode = findDescendantByClass(tocNode, 'word-toc-page');
  const attrPage = parseZeroBasedPageAttr(tocNode.attributes['data-toc-page']);
  const visiblePage = pageNode ? parseOneBasedPageText(nodePlainText(pageNode)) : undefined;
  let title = titleNode ? nodePlainText(titleNode) : '';
  let fallbackPageIndex = attrPage ?? visiblePage;
  if (!title) {
    const stripped = stripTocTrailingPage(nodePlainText(tocNode));
    title = stripped.title;
    if (fallbackPageIndex === undefined) fallbackPageIndex = stripped.trailingPageIndex;
  }
  return {
    groupKey: `toc:${tocNode.id}`,
    ...(targetId ? { targetId } : {}),
    ...(title ? { title } : {}),
    ...(fallbackPageIndex !== undefined ? { fallbackPageIndex } : {}),
  };
}

function extractAnchorDescriptor(anchor: ElementNode): LinkTargetDescriptor | null {
  const rawHref = (anchor.attributes['href'] || '').trim();
  if (!rawHref.startsWith('#') || rawHref.length <= 1) return null;
  const targetId = rawHref.slice(1);
  const { title, trailingPageIndex } = stripTocTrailingPage(nodePlainText(anchor));
  return {
    groupKey: `href:${anchor.id}`,
    targetId,
    ...(title ? { title } : {}),
    ...(trailingPageIndex !== undefined ? { fallbackPageIndex: trailingPageIndex } : {}),
  };
}

/**
 * Collects live heading bookmarks (`pdfHeadings`) and clickable TOC / internal-anchor
 * link rectangles (`pdfLinks`) per rendered Canvas page.
 */
export function buildCanvasPdfMetadata(
  sections: readonly PdfExportSectionLike[],
): CanvasPdfNavigationMetadata {
  const totalPages = sections.reduce((sum, sec) => sum + sec.displayLists.length, 0);
  const linksByPage: PdfInternalLinkRect[][] = Array.from({ length: totalPages }, () => []);
  const headings: PdfOutlineHeading[] = [];
  if (!totalPages) return { linksByPage, headings };

  const nodePageMap = buildNodePageIndex(sections);
  const pageById = new Map<string, number>();
  const pageByTitle = new Map<string, number>();
  const headingIndexEntries: Array<{ normalized: string; pageIndex: number }> = [];

  let globalPageBase = 0;
  const objectIndexBookmarks: Array<{
    sectionTitle: string;
    sectionPage: number;
    entries: LinkTargetDescriptor[];
  }> = [];

  for (const sec of sections) {
    const collect = (nodes: readonly DocumentNode[], inToc: boolean): void => {
      for (const node of nodes) {
        if (node.kind !== 'element') continue;
        const listOf = node.attributes['data-word-list-of'];
        if (!inToc && (listOf === 'tables' || listOf === 'figures')) {
          const sectionPage = resolveNodePage(node, nodePageMap, globalPageBase);
          const headerNode = findDescendantByClass(node, 'word-toc-header');
          const sectionTitle =
            (headerNode ? nodePlainText(headerNode) : '') ||
            (listOf === 'tables' ? 'Índice de tablas' : 'Índice de figuras');
          const entries: LinkTargetDescriptor[] = [];
          const collectEntries = (list: readonly DocumentNode[]): void => {
            for (const child of list) {
              if (child.kind !== 'element') continue;
              if (hasClass(child, 'word-toc-entry')) {
                entries.push(extractTocEntryDescriptor(child));
                continue;
              }
              if (child.children.length) collectEntries(child.children);
            }
          };
          collectEntries(node.children);
          const existingGroup = objectIndexBookmarks.find(b => b.sectionTitle === sectionTitle);
          if (existingGroup) existingGroup.entries.push(...entries);
          else objectIndexBookmarks.push({ sectionTitle, sectionPage, entries });
        }
        const nextInToc = inToc || isTocContainer(node);
        if (!nextInToc) {
          const resolvedPage = resolveNodePage(node, nodePageMap, globalPageBase);
          for (const candidateId of [
            node.attributes['id'],
            node.attributes['data-word-object-id'],
            node.attributes['data-apa-caption-for'],
          ]) {
            if (candidateId && !pageById.has(candidateId)) {
              pageById.set(candidateId, resolvedPage);
            }
          }
          const fnId = node.attributes['data-word-note-id'];
          if (fnId && !pageById.has(`note-${fnId}`)) {
            pageById.set(`note-${fnId}`, resolvedPage);
          }
          const level = detectHeadingLevel(node);
          if (level !== null) {
            const title = nodePlainText(node);
            if (title) {
              headings.push({
                title,
                level: Math.max(0, Math.min(6, level)),
                pageIndex: resolvedPage,
              });
              const normalized = normalizeHeadingTitle(title);
              if (normalized && !pageByTitle.has(normalized)) {
                pageByTitle.set(normalized, resolvedPage);
                headingIndexEntries.push({ normalized, pageIndex: resolvedPage });
              }
            }
          }
        }
        collect(node.children, nextInToc);
      }
    };
    collect(sec.model.state.roots, false);
    globalPageBase += sec.displayLists.length;
  }

  const resolveTargetPageIndex = (descriptor: LinkTargetDescriptor): number | null => {
    if (descriptor.targetId) {
      const cleanId = descriptor.targetId.replace(/^#/, '');
      const byId = pageById.get(cleanId);
      if (byId !== undefined) return byId;
      try {
        const decoded = decodeURIComponent(cleanId);
        const byDecoded = pageById.get(decoded);
        if (byDecoded !== undefined) return byDecoded;
      } catch {
        // Ignore malformed URI fragments and fall back to title/page matching.
      }
    }
    if (descriptor.title) {
      const normalized = normalizeHeadingTitle(descriptor.title);
      if (normalized) {
        const exact = pageByTitle.get(normalized);
        if (exact !== undefined) return exact;
        if (normalized.length >= 3) {
          const partial = headingIndexEntries.find(
            entry =>
              entry.normalized.includes(normalized) ||
              (entry.normalized.length >= 3 && normalized.includes(entry.normalized)),
          );
          if (partial) return partial.pageIndex;
        }
      }
    }
    if (descriptor.fallbackPageIndex !== undefined && Number.isFinite(descriptor.fallbackPageIndex)) {
      return Math.max(0, Math.min(totalPages - 1, Math.trunc(descriptor.fallbackPageIndex)));
    }
    return null;
  };

  let pageCursor = 0;
  for (const sec of sections) {
    const nodeDescriptor = new Map<string, LinkTargetDescriptor>();
    const indexNodeLinks = (
      nodes: readonly DocumentNode[],
      activeDescriptor: LinkTargetDescriptor | null,
      inTocTable: boolean,
    ): void => {
      for (const node of nodes) {
        if (node.kind === 'text') {
          if (activeDescriptor) nodeDescriptor.set(node.id, activeDescriptor);
          continue;
        }
        let nextDescriptor = activeDescriptor;
        const nextInTocTable =
          inTocTable || hasClass(node, 'word-toc-table') || (node.attributes['data-word-flow'] || '').toLowerCase().includes('toc');
        if (!nextDescriptor) {
          if (hasClass(node, 'word-toc-entry')) {
            nextDescriptor = extractTocEntryDescriptor(node);
          } else if (
            node.tag === 'tr' &&
            (nextInTocTable || Boolean(findDescendantByClass(node, 'word-toc-title')))
          ) {
            nextDescriptor = extractTocRowDescriptor(node);
          } else if (node.tag === 'a') {
            nextDescriptor = extractAnchorDescriptor(node);
          }
        }
        if (nextDescriptor) nodeDescriptor.set(node.id, nextDescriptor);
        indexNodeLinks(node.children, nextDescriptor, nextInTocTable);
      }
    };
    indexNodeLinks(sec.model.state.roots, null, false);

    for (const dl of sec.displayLists) {
      const boxes = new Map<
        string,
        { minX: number; minY: number; maxX: number; maxY: number; descriptor: LinkTargetDescriptor }
      >();
      for (const cmd of dl.commands) {
        if (cmd.kind !== 'text' || !cmd.source) continue;
        const descriptor = nodeDescriptor.get(cmd.source.start.nodeId);
        if (!descriptor) continue;
        const cmdWidth = Math.max(0, cmd.source.width);
        const cmdHeight = Math.max(0, cmd.source.height);
        if (!(cmdWidth > 0 && cmdHeight > 0)) continue;
        const minX = cmd.x;
        const minY = cmd.source.top;
        const maxX = cmd.x + cmdWidth;
        const maxY = cmd.source.top + cmdHeight;
        const existing = boxes.get(descriptor.groupKey);
        if (!existing) {
          boxes.set(descriptor.groupKey, { minX, minY, maxX, maxY, descriptor });
        } else {
          if (minX < existing.minX) existing.minX = minX;
          if (minY < existing.minY) existing.minY = minY;
          if (maxX > existing.maxX) existing.maxX = maxX;
          if (maxY > existing.maxY) existing.maxY = maxY;
        }
      }

      const pageLinks = linksByPage[pageCursor];
      for (const box of boxes.values()) {
        const targetPageIndex = resolveTargetPageIndex(box.descriptor);
        if (targetPageIndex === null) continue;
        const width = box.maxX - box.minX;
        const height = box.maxY - box.minY;
        if (!(width > 0 && height > 0)) continue;
        pageLinks.push({
          x: box.minX,
          y: box.minY,
          width,
          height,
          targetPageIndex,
          ...(box.descriptor.title ? { title: box.descriptor.title } : {}),
        });
      }
      pageCursor++;
    }
  }

  for (const group of objectIndexBookmarks) {
    headings.push({
      title: group.sectionTitle,
      level: 1,
      pageIndex: Math.max(0, Math.min(totalPages - 1, group.sectionPage)),
    });
    for (const entry of group.entries) {
      const title = entry.title?.trim();
      if (!title) continue;
      const targetPage = resolveTargetPageIndex(entry);
      if (targetPage === null) continue;
      headings.push({
        title,
        level: 2,
        pageIndex: targetPage,
      });
    }
  }

  return { linksByPage, headings };
}

/** Returns shallow-copied display lists enriched with PDF internal links and document outline headings. */
export function attachCanvasPdfNavigation(
  displayLists: readonly PageDisplayList[],
  sections: readonly PdfExportSectionLike[],
): PageDisplayList[] {
  if (!displayLists.length || !sections.length) return [...displayLists];
  const { linksByPage, headings } = buildCanvasPdfMetadata(sections);
  return displayLists.map((list, index) => {
    const pageLinks = linksByPage[index];
    const hasLinks = Boolean(pageLinks?.length);
    const hasHeadings = index === 0 && headings.length > 0;
    if (!hasLinks && !hasHeadings) return list;
    return {
      ...list,
      ...(hasLinks ? { pdfLinks: pageLinks } : {}),
      ...(hasHeadings ? { pdfHeadings: headings } : {}),
    };
  });
}
