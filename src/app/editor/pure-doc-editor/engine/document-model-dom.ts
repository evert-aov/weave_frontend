import { DocumentNode, DocumentPosition, DocumentSelection, DocumentState, textNodes } from './document-model';

let adapterSequence = 0;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function serializeDocumentNodes(nodes: readonly DocumentNode[]): string {
  return nodes.map(node => {
    if (node.kind === 'text') return escapeHtml(node.text);
    const attrs = Object.entries(node.attributes)
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join('');
    if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`;
    return `<${node.tag}${attrs}>${serializeDocumentNodes(node.children)}</${node.tag}>`;
  }).join('');
}

export function documentStateToHtml(state: DocumentState): string {
  return serializeDocumentNodes(state.roots) || '<p><br></p>';
}

const STRUCTURAL_PARENT_TAGS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup']);
const BLOCK_LIKE_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup',
  'blockquote', 'pre', 'hr', 'div', 'section', 'article', 'figure', 'svg',
]);

export function htmlToDocumentState(html: string, revision = 0, namespace = `doc-${++adapterSequence}`): DocumentState {
  const container = document.createElement('div');
  container.innerHTML = html;
  let seq = 0;
  const readChildren = (childNodes: NodeListOf<ChildNode>, parentTag: string | null): DocumentNode[] => {
    const arr = Array.from(childNodes);
    const out: DocumentNode[] = [];
    for (let i = 0; i < arr.length; i++) {
      const node = arr[i];
      if (!(node instanceof Text) && !(node instanceof Element)) continue;
      if (node instanceof Text && /^[ \t\r\n]+$/.test(node.data)) {
        if (parentTag !== null && STRUCTURAL_PARENT_TAGS.has(parentTag)) {
          continue;
        }
        if (parentTag === null || parentTag === 'div' || parentTag === 'section' || parentTag === 'article') {
          const prev = arr[i - 1];
          const next = arr[i + 1];
          const prevIsBlock = prev instanceof Element && BLOCK_LIKE_TAGS.has(prev.tagName.toLowerCase());
          const nextIsBlock = next instanceof Element && BLOCK_LIKE_TAGS.has(next.tagName.toLowerCase());
          if (/[\r\n]/.test(node.data) || prevIsBlock || nextIsBlock || (!prev && !next)) {
            continue;
          }
        }
      }
      const id = `${namespace}:node-${++seq}`;
      if (node instanceof Text) {
        out.push({ id, kind: 'text', text: node.data });
        continue;
      }
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      out.push({
        id,
        kind: 'element',
        tag,
        attributes: Object.fromEntries(Array.from(element.attributes).map(a => [a.name, a.value])),
        children: readChildren(element.childNodes, tag),
      });
    }
    return out;
  };
  return { revision, roots: readChildren(container.childNodes, null), selection: null };
}

/** Transitional adapter. All tags/attributes are preserved, including unsupported objects. */
export class DocumentModelDomAdapter {
  private ids = new WeakMap<Node, string>();
  private nodes = new Map<string, Node>();
  private sequence = 0;
  private readonly namespace = `canvas-document-${++adapterSequence}`;

  capture(root: HTMLElement, revision = 0): DocumentState {
    this.nodes.clear();
    const read = (node: Node): DocumentNode[] => {
      if (!(node instanceof Text) && !(node instanceof Element)) return [];
      let id = this.ids.get(node);
      if (!id) {
        id = `${this.namespace}:node-${++this.sequence}`;
        this.ids.set(node, id);
      }
      this.nodes.set(id, node);
      if (node instanceof Text) return [{ id, kind: 'text', text: node.data }];
      const element = node as Element;
      return [{
        id,
        kind: 'element',
        tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries(Array.from(element.attributes).map(a => [a.name, a.value])),
        children: Array.from(element.childNodes).flatMap(read),
      }];
    };
    return { revision, roots: Array.from(root.childNodes).flatMap(read), selection: this.selection(window.getSelection()) };
  }

  nodeForId(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  position(node: Node, offset: number): DocumentPosition | null {
    if (node instanceof Text) {
      const nodeId = this.ids.get(node);
      return nodeId && this.nodes.has(nodeId) ? { nodeId, offset } : null;
    }
    if (node instanceof Element) {
      const clamped = Math.max(0, Math.min(offset, node.childNodes.length));
      const next = node.childNodes[clamped];
      const previous = node.childNodes[clamped - 1];
      for (const [candidate, atEnd] of [[next, false], [previous, true]] as const) {
        if (!candidate) continue;
        if (candidate instanceof Text) {
          const id = this.ids.get(candidate);
          if (id && this.nodes.has(id)) return { nodeId: id, offset: atEnd ? candidate.length : 0 };
        }
        const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
        let found = walker.nextNode() as Text | null;
        if (atEnd) {
          let current: Node | null;
          while ((current = walker.nextNode())) found = current as Text;
        }
        if (found) {
          const id = this.ids.get(found);
          if (id && this.nodes.has(id)) return { nodeId: id, offset: atEnd ? found.length : 0 };
        }
      }
      const elementId = this.ids.get(node);
      if (elementId && this.nodes.has(elementId)) return { nodeId: elementId, offset: 0 };
    }
    return null;
  }

  selection(selection: Selection | null): DocumentSelection | null {
    if (!selection?.anchorNode || !selection.focusNode) return null;
    const anchor = this.position(selection.anchorNode, selection.anchorOffset);
    const focus = this.position(selection.focusNode, selection.focusOffset);
    return anchor && focus ? { anchor, focus } : null;
  }

  restore(selection: DocumentSelection): boolean {
    const resolveDomPoint = (pos: DocumentPosition): { node: Node; offset: number } | null => {
      const target = this.nodes.get(pos.nodeId);
      if (!target || !target.isConnected) return null;
      if (target instanceof Text) {
        if (pos.offset < 0 || pos.offset > target.length) return null;
        return { node: target, offset: pos.offset };
      }
      if (target instanceof Element && pos.offset === 0) {
        return { node: target, offset: 0 };
      }
      return null;
    };
    const anchor = resolveDomPoint(selection.anchor);
    const focus = resolveDomPoint(selection.focus);
    if (!anchor || !focus) return false;
    window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    return true;
  }

  applyTextState(before: DocumentState, after: DocumentState): boolean {
    const previous = textNodes(before.roots);
    const nextList = textNodes(after.roots);
    if (previous.length !== nextList.length) return false;
    const next = new Map(nextList.map(node => [node.id, node]));
    const changes: { node: Text; text: string }[] = [];
    for (const old of previous) {
      const node = this.nodes.get(old.id), updated = next.get(old.id);
      if (!(node instanceof Text) || !node.isConnected || node.data !== old.text || !updated) return false;
      if (updated.text !== old.text) changes.push({ node, text: updated.text });
    }
    for (const change of changes) change.node.data = change.text;
    if (after.selection) this.restore(after.selection);
    return true;
  }

  applyState(root: HTMLElement, before: DocumentState, after: DocumentState): boolean {
    if (before.roots.length === after.roots.length && before.roots.every((r, i) => r.id === after.roots[i].id) && this.applyTextState(before, after)) {
      return true;
    }
    const buildDom = (model: DocumentNode): Node => {
      const existing = this.nodes.get(model.id);
      if (model.kind === 'text') {
        const textNode = existing instanceof Text ? existing : document.createTextNode(model.text);
        if (textNode.data !== model.text) textNode.data = model.text;
        this.ids.set(textNode, model.id);
        this.nodes.set(model.id, textNode);
        return textNode;
      }
      const el = existing instanceof Element && existing.tagName.toLowerCase() === model.tag
        ? existing
        : document.createElement(model.tag);
      for (const attr of Array.from(el.attributes)) {
        if (!(attr.name in model.attributes)) el.removeAttribute(attr.name);
      }
      for (const [k, v] of Object.entries(model.attributes)) {
        if (el.getAttribute(k) !== v) el.setAttribute(k, v);
      }
      const childDom = model.children.map(buildDom);
      if (model.children.length === 1 && model.children[0].kind === 'text' && model.children[0].text === '' && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(model.tag)) {
        el.replaceChildren(childDom[0], document.createElement('br'));
      } else {
        el.replaceChildren(...childDom);
      }
      this.ids.set(el, model.id);
      this.nodes.set(model.id, el);
      return el;
    };
    this.nodes.clear();
    const domRoots = after.roots.map(buildDom);
    root.replaceChildren(...domRoots);
    if (after.selection) this.restore(after.selection);
    return true;
  }

  clear(): void {
    this.nodes.clear();
    this.ids = new WeakMap();
  }
}
