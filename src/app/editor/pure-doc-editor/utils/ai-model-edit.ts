import {
  hasBlockMarkdown,
  hasInlineMarkdown,
  richTextHtml,
  unwrapMarkdownFence,
} from '../../../core/utils/ai-edit-text';
import type { DocumentSectionState } from '../engine/document-engine';
import { DocumentNode, textNodes } from '../engine/document-model';
import { htmlToDocumentState } from '../engine/document-model-dom';
import type { StyleTemplate } from '../models/word-document.model';
import { styleModelTable } from './table-styling';

export const MODEL_TEXT_PREFIX = 'model:';
export const MODEL_TABLE_PREFIX = 'model-table:';
export const MODEL_INSERT_PREFIX = 'model-insert:';

const PROTECTED_TAGS = new Set(['script', 'style', 'svg', 'math']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const INSERT_INSTRUCTIONS =
  'Para insertar tablas nativas DESPUÉS de este destino devuelve before igual a TODO este JSON y after como {"action":"insertAfter","tables":[{"title":"Título opcional","rows":[["Columna","Valor"],["Dato","120"]],"header":true,"note":"Nota opcional"}]}. Usa texto y valores del Excel/adjunto, nunca HTML/Markdown. No lo describas solo en el chat: devuelve edits.';

let aiNodeSeq = 0;
function nextAiId(prefix = 'ai'): string {
  aiNodeSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${aiNodeSeq}`;
}

function isElement(node: DocumentNode): node is Extract<DocumentNode, { kind: 'element' }> {
  return node.kind === 'element';
}

function hasClass(el: Extract<DocumentNode, { kind: 'element' }>, className: string): boolean {
  return (el.attributes['class'] || '').split(/\s+/).includes(className);
}

function isExcludedContainer(el: Extract<DocumentNode, { kind: 'element' }>, skipToc = false): boolean {
  if (PROTECTED_TAGS.has(el.tag) || el.attributes['contenteditable'] === 'false') return true;
  if (skipToc && (hasClass(el, 'word-toc-page-section') || 'data-native-word-toc' in el.attributes)) return true;
  return false;
}

function isHeadingElement(el: Extract<DocumentNode, { kind: 'element' }>): boolean {
  return HEADING_TAGS.has(el.tag) || 'data-apa-heading-level' in el.attributes || 'data-apa-run-in' in el.attributes;
}

function plainTextOf(node: DocumentNode): string {
  return node.kind === 'text' ? node.text : textNodes([node]).map(t => t.text).join('');
}

function fingerprintText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

function collectTableRows(table: Extract<DocumentNode, { kind: 'element' }>): Extract<DocumentNode, { kind: 'element' }>[][] {
  const rows: Extract<DocumentNode, { kind: 'element' }>[][] = [];
  const visitRows = (nodes: readonly DocumentNode[]) => {
    for (const child of nodes) {
      if (!isElement(child)) continue;
      if (child.tag === 'table') continue;
      if (child.tag === 'tr') {
        const cells = child.children.filter(
          (c): c is Extract<DocumentNode, { kind: 'element' }> => isElement(c) && (c.tag === 'td' || c.tag === 'th'),
        );
        rows.push(cells);
      } else if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
        visitRows(child.children);
      }
    }
  };
  visitRows(table.children);
  return rows;
}

function describeModelTable(table: Extract<DocumentNode, { kind: 'element' }>, budget = 1600) {
  const allRows = collectTableRows(table);
  const rows: { text: string; colSpan: number; rowSpan: number }[][] = [];
  let size = 0;
  let truncatedCell = false;
  for (const rowCells of allRows) {
    const cells = rowCells.map(cell => {
      const full = plainTextOf(cell);
      if (full.length > 250) truncatedCell = true;
      return {
        text: full.slice(0, 250),
        colSpan: Math.max(1, Number(cell.attributes['colspan'] || 1) || 1),
        rowSpan: Math.max(1, Number(cell.attributes['rowspan'] || 1) || 1),
      };
    });
    const length = JSON.stringify(cells).length;
    if (size + length > budget) break;
    rows.push(cells);
    size += length;
  }
  return {
    rows,
    rowCount: allRows.length,
    partial: rows.length !== allRows.length || truncatedCell,
  };
}

/** Campos de texto nativos del modelo Canvas por `sectionId:nodeId`, sin consultar DOMParser. */
export function* modelTextFields(sections: readonly DocumentSectionState[]): Generator<{ id: string; text: string }> {
  for (const scope of ['headings', 'body'] as const) {
    for (const sec of sections) {
      const walk = function* (
        nodes: readonly DocumentNode[],
        insideHeading: boolean,
        excluded: boolean,
      ): Generator<{ id: string; text: string }> {
        for (const node of nodes) {
          if (node.kind === 'text') {
            if (!excluded && node.text.trim() && (scope === 'headings') === insideHeading) {
              yield { id: `${MODEL_TEXT_PREFIX}${sec.id}:${node.id}`, text: node.text };
            }
            continue;
          }
          const nextExcluded = excluded || isExcludedContainer(node, false);
          if (nextExcluded) continue;
          const nextHeading = insideHeading || isHeadingElement(node);
          yield* walk(node.children, nextHeading, false);
        }
      };
      yield* walk(sec.model.state.roots, false, false);
      if (scope === 'body') {
        yield { id: `${MODEL_TEXT_PREFIX}${sec.id}:append`, text: '' };
      }
    }
  }
}

/** Inspecciona tablas del modelo Canvas por `nodeId` sin construir nodos DOM. */
export function aiModelTableFields(sections: readonly DocumentSectionState[]): { id: string; text: string }[] {
  const path: string[] = [];
  const entries: { id: string; table: Extract<DocumentNode, { kind: 'element' }>; headingPath: string[] }[] = [];

  const scan = (nodes: readonly DocumentNode[], secId: string, insideTable: boolean, insideToc: boolean) => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      const inToc = insideToc || hasClass(node, 'word-toc-page-section') || 'data-native-word-toc' in node.attributes;
      if (inToc) continue;
      if (node.tag === 'table' && !insideTable) {
        entries.push({ id: `${MODEL_TABLE_PREFIX}${secId}:${node.id}`, table: node, headingPath: path.filter(Boolean) });
        continue;
      }
      if (!insideTable && HEADING_TAGS.has(node.tag) && !('data-word-continuation' in node.attributes)) {
        const text = plainTextOf(node).trim();
        if (text) {
          const level = 'data-word-chapter' in node.attributes ? 0 : Number(node.tag.slice(1));
          path.length = level + 1;
          path[level] = text.slice(0, 500);
        }
      }
      scan(node.children, secId, insideTable || node.tag === 'table', inToc);
    }
  };

  for (const sec of sections) {
    scan(sec.model.state.roots, sec.id, false, false);
  }

  return entries.map((item, idx) => {
    const desc = describeModelTable(item.table);
    const next = entries[idx + 1];
    return {
      id: item.id,
      text: JSON.stringify({
        instructions:
          INSERT_INSTRUCTIONS +
          ' También puedes unir la tabla siguiente con {"action":"mergeNext"} o editar una celda con {"action":"setCell","row":0,"column":0,"text":"nuevo texto"}. Índices desde cero.',
        revision: fingerprintText(JSON.stringify(desc.rows)),
        heading: item.headingPath.at(-1) || '',
        headingPath: item.headingPath,
        ...desc,
        next: next ? { id: next.id, ...describeModelTable(next.table, 700) } : null,
      }),
    };
  });
}

/** Puntos de inserción de tabla tras encabezados del modelo Canvas sin construir nodos DOM. */
export function aiModelTableInsertionFields(sections: readonly DocumentSectionState[]): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const sec of sections) {
    const scan = (nodes: readonly DocumentNode[], insideProtected: boolean) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!isElement(node)) continue;
        const protectedHere =
          insideProtected ||
          node.tag === 'table' ||
          hasClass(node, 'word-toc-page-section') ||
          'data-native-word-toc' in node.attributes ||
          'data-word-continuation' in node.attributes;
        if (protectedHere) continue;
        if (HEADING_TAGS.has(node.tag) || 'data-apa-run-in' in node.attributes) {
          const headingText = plainTextOf(node).trim();
          if (headingText) {
            const nextSibling = nodes.slice(i + 1).find(isElement);
            out.push({
              id: `${MODEL_INSERT_PREFIX}${sec.id}:${node.id}`,
              text: JSON.stringify({
                instructions: INSERT_INSTRUCTIONS,
                heading: headingText.slice(0, 1600),
                revision: fingerprintText(headingText),
                following: nextSibling ? plainTextOf(nextSibling).slice(0, 160) : '',
              }),
            });
          }
        }
        scan(node.children, protectedHere);
      }
    };
    scan(sec.model.state.roots, false);
  }
  return out;
}

function buildTableParagraph(text: string, template?: StyleTemplate, bold = false): Extract<DocumentNode, { kind: 'element' }> {
  const rule = template?.rules.P;
  const styleParts = [
    rule ? `font-family:${rule.fontFamily}` : '',
    rule ? `font-size:${rule.fontSizePt}pt` : '',
    rule?.color ? `color:${rule.color}` : '',
    'text-align:left',
    'text-indent:0pt',
    'margin-top:0pt',
    'margin-bottom:0pt',
    `font-weight:${bold ? 'bold' : 'normal'}`,
  ].filter(Boolean);
  return {
    id: nextAiId('p'),
    kind: 'element',
    tag: 'p',
    attributes: { style: styleParts.join('; ') },
    children: text ? [{ id: nextAiId('txt'), kind: 'text', text }] : [],
  };
}

function buildModelInsertionNodes(payload: any, template?: StyleTemplate): DocumentNode[] {
  if (!Array.isArray(payload?.tables) || !payload.tables.length || payload.tables.length > 20) {
    throw Error('Debes indicar entre 1 y 20 tablas');
  }
  const nodes: DocumentNode[] = [];
  let total = 0;
  for (const spec of payload.tables) {
    if (!spec || !Array.isArray(spec.rows) || !spec.rows.length || spec.rows.length > 500) {
      throw Error('Filas de tabla inválidas');
    }
    const width = spec.rows[0]?.length;
    if (!Number.isInteger(width) || width < 1 || width > 50) throw Error('Columnas de tabla inválidas');
    total += spec.rows.length * width;
    if (total > 10000) throw Error('Demasiadas celdas');
    for (const key of ['title', 'note']) {
      if (spec[key] !== undefined && (typeof spec[key] !== 'string' || spec[key].length > 4000)) {
        throw Error('Título o nota inválidos');
      }
    }
    if (spec.header !== undefined && typeof spec.header !== 'boolean') throw Error('Cabecera inválida');
    if (spec.title) nodes.push(buildTableParagraph(spec.title, template, true));

    const headRows: DocumentNode[] = [];
    const bodyRows: DocumentNode[] = [];
    const colWidth = `${100 / width}%`;
    const isApa = template?.academicStyle === 'apa7';
    const cellBorder = isApa ? 'border:none; padding:4px 8px;' : 'border:1px solid #94a3b8; padding:4px 8px;';

    spec.rows.forEach((row: unknown, rowIndex: number) => {
      if (!Array.isArray(row) || row.length !== width) {
        throw Error('Las filas deben tener el mismo número de columnas');
      }
      const isHeaderRow = rowIndex === 0 && spec.header !== false;
      const cells: DocumentNode[] = row.map(value => {
        if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)) && value !== null) {
          throw Error('Valor de celda inválido');
        }
        const cellTag = isHeaderRow ? 'th' : 'td';
        return {
          id: nextAiId(cellTag),
          kind: 'element',
          tag: cellTag,
          attributes: { style: `${cellBorder} width:${colWidth};` },
          children: [buildTableParagraph(value === null ? '' : String(value), template, isHeaderRow)],
        };
      });
      const tr: DocumentNode = { id: nextAiId('tr'), kind: 'element', tag: 'tr', attributes: {}, children: cells };
      (isHeaderRow ? headRows : bodyRows).push(tr);
    });

    const tableChildren: DocumentNode[] = [];
    if (headRows.length) {
      tableChildren.push({ id: nextAiId('thead'), kind: 'element', tag: 'thead', attributes: {}, children: headRows });
    }
    tableChildren.push({ id: nextAiId('tbody'), kind: 'element', tag: 'tbody', attributes: {}, children: bodyRows });

    const tableStyle = isApa
      ? 'width:100%; max-width:100%; border-collapse:collapse; border-top:2px solid #0f172a; border-bottom:2px solid #0f172a;'
      : 'width:100%; max-width:100%; border-collapse:collapse;';
    const tableNode: Extract<DocumentNode, {kind:'element'}> = {
      id: nextAiId('tbl'),
      kind: 'element',
      tag: 'table',
      attributes: {
        'data-word-object-id': typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : nextAiId('obj'),
        style: tableStyle,
      },
      children: tableChildren,
    };
    nodes.push(template?.tableStyle && template.tableStyle.mode !== 'inherit' ? styleModelTable(tableNode, template.tableStyle) : tableNode);
    if (spec.note) nodes.push(buildTableParagraph(spec.note, template));
  }
  return nodes;
}

function parseMarkdownFragmentNodes(rawValue: string, inlineOnly: boolean): readonly DocumentNode[] {
  const html = richTextHtml(rawValue);
  const parsed = htmlToDocumentState(html, 1, nextAiId('frag'));
  if (!inlineOnly) return parsed.roots;
  if (parsed.roots.length === 1 && isElement(parsed.roots[0]) && parsed.roots[0].tag === 'p') {
    return parsed.roots[0].children;
  }
  return parsed.roots;
}

function isSoleParagraphTextNode(
  roots: readonly DocumentNode[],
  nodeId: string,
): Extract<DocumentNode, { kind: 'element' }> | null {
  const findParent = (nodes: readonly DocumentNode[]): Extract<DocumentNode, { kind: 'element' }> | null => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.children.some(c => c.id === nodeId)) return node;
      const deep = findParent(node.children);
      if (deep) return deep;
    }
    return null;
  };
  const parent = findParent(roots);
  if (!parent || parent.tag !== 'p') return null;
  for (const child of parent.children) {
    if (child.id === nodeId) continue;
    if (child.kind === 'text' && !child.text.trim()) continue;
    if (isElement(child) && child.tag === 'br') continue;
    return null;
  }
  return parent;
}

function replaceOrInsertAfterNode(
  nodes: readonly DocumentNode[],
  targetId: string,
  replacement: readonly DocumentNode[],
  insertAfter = false,
): { nodes: readonly DocumentNode[]; hit: boolean } {
  let hit = false;
  const out: DocumentNode[] = [];
  for (const node of nodes) {
    if (node.id === targetId) {
      hit = true;
      if (insertAfter) {
        out.push(node, ...replacement);
      } else {
        out.push(...replacement);
      }
      continue;
    }
    if (isElement(node) && node.children.length) {
      const sub = replaceOrInsertAfterNode(node.children, targetId, replacement, insertAfter);
      if (sub.hit) {
        hit = true;
        out.push({ ...node, children: sub.nodes });
        continue;
      }
    }
    out.push(node);
  }
  return { nodes: hit ? out : nodes, hit };
}

function updateTableCellNode(
  table: Extract<DocumentNode, { kind: 'element' }>,
  rowIndex: number,
  colIndex: number,
  text: string,
): Extract<DocumentNode, { kind: 'element' }> {
  const rows = collectTableRows(table);
  const targetCell = rows[rowIndex]?.[colIndex];
  if (!targetCell) throw Error('Celda fuera de la tabla');

  const existingP = targetCell.children.find((c): c is Extract<DocumentNode, { kind: 'element' }> => isElement(c) && c.tag === 'p');
  const nextCellParagraph: Extract<DocumentNode, { kind: 'element' }> = {
    id: existingP?.id || nextAiId('p'),
    kind: 'element',
    tag: 'p',
    attributes: existingP ? { ...existingP.attributes } : {},
    children: [{ id: nextAiId('txt'), kind: 'text', text }],
  };

  const replaceCell = (nodes: readonly DocumentNode[]): readonly DocumentNode[] =>
    nodes.map(node => {
      if (node.id === targetCell.id && isElement(node)) {
        return { ...node, children: [nextCellParagraph] };
      }
      if (isElement(node)) {
        const nextChildren = replaceCell(node.children);
        return nextChildren === node.children ? node : { ...node, children: nextChildren };
      }
      return node;
    });

  return { ...table, children: replaceCell(table.children) };
}

function countTableCols(table: Extract<DocumentNode, { kind: 'element' }>): number {
  const rows = collectTableRows(table);
  if (!rows.length) return 0;
  return Math.max(...rows.map(cells => cells.reduce((sum, cell) => sum + (Number(cell.attributes['colspan'] || 1) || 1), 0)));
}

function extractRawRows(table: Extract<DocumentNode, { kind: 'element' }>): Extract<DocumentNode, { kind: 'element' }>[] {
  const rows: Extract<DocumentNode, { kind: 'element' }>[] = [];
  const walk = (nodes: readonly DocumentNode[]) => {
    for (const node of nodes) {
      if (!isElement(node)) continue;
      if (node.tag === 'table') continue;
      if (node.tag === 'tr') rows.push(node);
      else walk(node.children);
    }
  };
  walk(table.children);
  return rows;
}

function removeNodeById(nodes: readonly DocumentNode[], targetId: string): { nodes: readonly DocumentNode[]; removed: boolean } {
  let removed = false;
  const out: DocumentNode[] = [];
  for (const node of nodes) {
    if (node.id === targetId) {
      removed = true;
      continue;
    }
    if (isElement(node) && node.children.length) {
      const sub = removeNodeById(node.children, targetId);
      if (sub.removed) {
        removed = true;
        out.push({ ...node, children: sub.nodes });
        continue;
      }
    }
    out.push(node);
  }
  return { nodes: removed ? out : nodes, removed };
}

/**
 * Aplica operaciones IA directamente sobre los nodos por ID estable de las secciones afectadas,
 * evitando la reimportación HTML global de todo el documento.
 */
export function applyAiEditsToSections(
  sections: readonly DocumentSectionState[],
  values: ReadonlyMap<string, string>,
  template?: StyleTemplate,
): Map<number, readonly DocumentNode[]> {
  const sectionIdxById = new Map(sections.map((sec, idx) => [sec.id, idx] as const));
  const rootsByIdx = new Map<number, readonly DocumentNode[]>();
  const getRoots = (idx: number) => rootsByIdx.get(idx) ?? sections[idx].model.state.roots;
  const setRoots = (idx: number, roots: readonly DocumentNode[]) => rootsByIdx.set(idx, roots);

  const orderedTables = (): { secIdx: number; table: Extract<DocumentNode, { kind: 'element' }> }[] => {
    const out: { secIdx: number; table: Extract<DocumentNode, { kind: 'element' }> }[] = [];
    for (let i = 0; i < sections.length; i++) {
      const walk = (nodes: readonly DocumentNode[], inside: boolean, inToc: boolean) => {
        for (const node of nodes) {
          if (!isElement(node)) continue;
          const toc = inToc || hasClass(node, 'word-toc-page-section') || 'data-native-word-toc' in node.attributes;
          if (toc) continue;
          if (node.tag === 'table' && !inside) {
            out.push({ secIdx: i, table: node });
            continue;
          }
          walk(node.children, inside || node.tag === 'table', toc);
        }
      };
      walk(getRoots(i), false, false);
    }
    return out;
  };

  for (const [id, value] of values) {
    if (id.startsWith(MODEL_TEXT_PREFIX)) {
      const rest = id.slice(MODEL_TEXT_PREFIX.length);
      const sep = rest.indexOf(':');
      if (sep <= 0) continue;
      const secId = rest.slice(0, sep);
      const nodeId = rest.slice(sep + 1);
      const secIdx = sectionIdxById.get(secId);
      if (secIdx === undefined) throw Error('Sección de destino inválida');
      const roots = getRoots(secIdx);

      if (nodeId === 'append') {
        if (!value) continue;
        const appended = parseMarkdownFragmentNodes(value, false);
        if (appended.length) setRoots(secIdx, [...roots, ...appended]);
        continue;
      }

      const rawValue = unwrapMarkdownFence(value);
      const soleParagraph = isSoleParagraphTextNode(roots, nodeId);
      if (soleParagraph && (hasBlockMarkdown(rawValue) || (!hasInlineMarkdown(rawValue) && rawValue.includes('\n')) || hasInlineMarkdown(rawValue) && rawValue.includes('\n'))) {
        const blockNodes = parseMarkdownFragmentNodes(rawValue, false);
        const res = replaceOrInsertAfterNode(roots, soleParagraph.id, blockNodes);
        if (res.hit) setRoots(secIdx, res.nodes);
      } else if (hasInlineMarkdown(rawValue) && !rawValue.includes('\n')) {
        const inlineNodes = parseMarkdownFragmentNodes(rawValue, true);
        const res = replaceOrInsertAfterNode(roots, nodeId, inlineNodes);
        if (res.hit) setRoots(secIdx, res.nodes);
      } else {
        const res = replaceOrInsertAfterNode(roots, nodeId, [{ id: nodeId, kind: 'text', text: rawValue }]);
        if (!res.hit) throw Error('El nodo de texto de destino ya no existe');
        setRoots(secIdx, res.nodes);
      }
      continue;
    }

    if (id.startsWith(MODEL_INSERT_PREFIX)) {
      const rest = id.slice(MODEL_INSERT_PREFIX.length);
      const sep = rest.indexOf(':');
      if (sep <= 0) throw Error('Destino de inserción inválido');
      const secId = rest.slice(0, sep);
      const headingId = rest.slice(sep + 1);
      const secIdx = sectionIdxById.get(secId);
      if (secIdx === undefined) throw Error('Destino de inserción inválido');
      const payload = JSON.parse(value);
      if (payload.action !== 'insertAfter') throw Error('Operación de inserción inválida');
      const inserted = buildModelInsertionNodes(payload, template);
      const res = replaceOrInsertAfterNode(getRoots(secIdx), headingId, inserted, true);
      if (!res.hit) throw Error('Destino de inserción inválido');
      setRoots(secIdx, res.nodes);
      continue;
    }

    if (id.startsWith(MODEL_TABLE_PREFIX)) {
      const rest = id.slice(MODEL_TABLE_PREFIX.length);
      const sep = rest.indexOf(':');
      if (sep <= 0) throw Error('Destino de tabla inválido');
      const secId = rest.slice(0, sep);
      const tableId = rest.slice(sep + 1);
      const tables = orderedTables();
      const tIdx = tables.findIndex(entry => sections[entry.secIdx].id === secId && entry.table.id === tableId);
      const entry = tables[tIdx];
      if (!entry) throw Error('Destino de tabla inválido o repetido');
      const action = JSON.parse(value);

      if (action.action === 'insertAfter') {
        const inserted = buildModelInsertionNodes(action, template);
        const res = replaceOrInsertAfterNode(getRoots(entry.secIdx), entry.table.id, inserted, true);
        if (res.hit) setRoots(entry.secIdx, res.nodes);
      } else if (action.action === 'setCell') {
        if (!Number.isInteger(action.row) || !Number.isInteger(action.column) || typeof action.text !== 'string') {
          throw Error('Celda inválida');
        }
        const nextTable = updateTableCellNode(entry.table, action.row, action.column, action.text);
        const res = replaceOrInsertAfterNode(getRoots(entry.secIdx), entry.table.id, [nextTable]);
        if (res.hit) setRoots(entry.secIdx, res.nodes);
      } else if (action.action === 'mergeNext') {
        const nextEntry = tables[tIdx + 1];
        if (!nextEntry) throw Error('No existe una tabla siguiente disponible');
        if (countTableCols(entry.table) !== countTableCols(nextEntry.table)) {
          throw Error('Las tablas tienen distinto número de columnas');
        }
        const nextRows = extractRawRows(nextEntry.table);
        const existingBody = entry.table.children.find(
          (c): c is Extract<DocumentNode, { kind: 'element' }> => isElement(c) && c.tag === 'tbody',
        );
        const updatedTableChildren: DocumentNode[] = existingBody
          ? entry.table.children.map(c => (c.id === existingBody.id ? { ...existingBody, children: [...existingBody.children, ...nextRows] } : c))
          : [...entry.table.children, { id: nextAiId('tbody'), kind: 'element', tag: 'tbody', attributes: {}, children: nextRows }];
        const mergedTable: Extract<DocumentNode, { kind: 'element' }> = { ...entry.table, children: updatedTableChildren };
        const mergedRes = replaceOrInsertAfterNode(getRoots(entry.secIdx), entry.table.id, [mergedTable]);
        setRoots(entry.secIdx, mergedRes.nodes);
        const removedRes = removeNodeById(getRoots(nextEntry.secIdx), nextEntry.table.id);
        setRoots(nextEntry.secIdx, removedRes.nodes);
      } else {
        throw Error('Operación de tabla no admitida');
      }
    }
  }

  return rootsByIdx;
}
