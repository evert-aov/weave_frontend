import { DocumentNode } from './document-model';
import { HeadingOutlineCounter } from '../utils/heading-outline-counter';

type ElementNode = Extract<DocumentNode, {kind: 'element'}>;
const relevant = new WeakMap<DocumentNode, boolean>();
const isPrefix = (node: DocumentNode): boolean => node.kind === 'element' && 'data-word-heading-number' in node.attributes;
function containsHeading(node: DocumentNode): boolean {
  const cached = relevant.get(node);
  if (cached !== undefined) return cached;
  const result = node.kind === 'element' && (isPrefix(node) || /^h[1-6]$/.test(node.tag) || 'data-apa-run-in' in node.attributes || node.children.some(containsHeading));
  relevant.set(node, result);
  return result;
}
function title(node: DocumentNode): string {
  return node.kind === 'text' ? node.text : isPrefix(node) ? '' : node.children.map(title).join('');
}
function withoutPrefixes(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  let changed = false;
  const result: DocumentNode[] = [];
  for (const node of nodes) {
    if (isPrefix(node)) { changed = true; continue; }
    const children = node.kind === 'element' && containsHeading(node) ? withoutPrefixes(node.children) : null;
    if (children && node.kind === 'element' && children !== node.children) { changed = true; result.push({...node, children}); }
    else result.push(node);
  }
  return changed ? result : nodes;
}

function stripTitlePrefix(nodes: readonly DocumentNode[], remaining: {count: number}): readonly DocumentNode[] {
  if (!remaining.count) return nodes;
  let changed = false;
  const result = nodes.map(node => {
    if (!remaining.count) return node;
    if (node.kind === 'text') {
      const count = Math.min(remaining.count, node.text.length);
      remaining.count -= count;
      if (!count) return node;
      changed = true;
      return {...node, text: node.text.slice(count)};
    }
    const children = stripTitlePrefix(node.children, remaining);
    if (children === node.children) return node;
    changed = true;
    return {...node, children};
  });
  return changed ? result : nodes;
}

/** Updates generated prefixes without DOM conversion or replacing editable text IDs. */
export function numberModelHeadings(roots: readonly DocumentNode[], outline: HeadingOutlineCounter, enabled: boolean): readonly DocumentNode[] {
  let changed = false;
  const result = roots.map(node => {
    if (node.kind !== 'element' || !containsHeading(node)) return node;
    let next: DocumentNode = node;
    const heading = /^h[1-6]$/.test(node.tag) || 'data-apa-run-in' in node.attributes;
    if (heading) {
      const headingTitle = title(node);
      const hasTitle = headingTitle.replace(/[\u200b-\u200d\ufeff]/g, '').trim().length > 0;
      const chapter = 'data-word-chapter' in node.attributes;
      const continuation = 'data-word-continuation' in node.attributes;
      if (enabled && hasTitle && chapter && !continuation) outline.startChapter();
      const level = 'data-apa-run-in' in node.attributes ? Math.min(6, Math.max(1, Number(node.attributes['data-apa-run-in']) || 4)) : Number(node.tag.slice(1));
      const prefixLength = enabled && hasTitle && !chapter && !continuation ? outline.chapterPrefixLength(headingTitle) : 0;
      const number = enabled && hasTitle && !chapter && !continuation ? outline.next(level, headingTitle) : null;
      let children = withoutPrefixes(node.children);
      if (prefixLength) children = stripTitlePrefix(children, {count: prefixLength});
      if (number !== null) {
        const prefix: ElementNode = {id: `${node.id}-outline-prefix`, kind: 'element', tag: 'span', attributes: {'data-word-heading-number': 'true', contenteditable: 'false', style: 'font:inherit;color:inherit;white-space:pre;margin-right:0.4em;'}, children: [{id: `${node.id}-outline-number`, kind: 'text', text: number}]};
        const target = children.find(child => child.kind === 'element' && 'data-apa-heading-level' in child.attributes);
        if (target?.kind === 'element') children = children.map(child => child === target ? {...target, children: [prefix, ...target.children]} : child);
        else children = [prefix, ...children];
      }
      // Keep unchanged model nodes, avoiding redundant layout and serialization.
      const same = (a: readonly DocumentNode[], b: readonly DocumentNode[]): boolean => a.length === b.length && a.every((child, i) => child === b[i] || (child.kind === 'element' && b[i].kind === 'element' && child.tag === (b[i] as ElementNode).tag && JSON.stringify(child.attributes) === JSON.stringify((b[i] as ElementNode).attributes) && same(child.children, (b[i] as ElementNode).children)) || (child.kind === 'text' && b[i].kind === 'text' && child.text === (b[i] as Extract<DocumentNode,{kind:'text'}>).text));
      if (!same(node.children, children)) next = {...node, children};
    } else {
      const children = numberModelHeadings(node.children, outline, enabled);
      if (children !== node.children) next = {...node, children};
    }
    if (next !== node) changed = true;
    return next;
  });
  return changed ? result : roots;
}
