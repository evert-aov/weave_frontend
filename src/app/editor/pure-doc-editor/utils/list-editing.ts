import type { ElementStyleRule } from '../models/word-document.model';
import { selectedParagraphs } from './document-formatting';

/** Toggle-off applies to the selected items, rather than asking execCommand to rebuild runs. */
export function selectedListItems(bodies: HTMLElement[], range: Range, tag: 'OL' | 'UL'): HTMLElement[] | null {
  const blocks = selectedParagraphs(bodies, range);
  const items = blocks.map(block => block.closest<HTMLElement>('li'));
  if (!items.length || items.some(item => !item || item.parentElement?.tagName !== tag)) return null;
  return [...new Set(items as HTMLElement[])];
}

function paragraphStyle(target: HTMLElement, item: HTMLElement, list: HTMLElement, normal: ElementStyleRule): void {
  const computed = getComputedStyle(item);
  const concrete = (...values: string[]) => values.find(value => value && !['inherit', 'initial', 'unset'].includes(value)) || '';
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'line-height', 'text-align']) {
    if (!target.style.getPropertyValue(property) || target.style.getPropertyValue(property) === 'inherit') {
      target.style.setProperty(property, concrete(item.style.getPropertyValue(property), list.style.getPropertyValue(property), computed.getPropertyValue(property)));
    }
  }
  target.style.fontFamily ||= normal.fontFamily;
  target.style.fontSize ||= `${normal.fontSizePt}pt`;
  target.style.lineHeight ||= String(normal.lineHeight);
  target.style.marginLeft = `${normal.indentLeftPt ?? 0}pt`;
  target.style.marginRight = `${normal.indentRightPt ?? 0}pt`;
  target.style.textIndent = `${normal.firstLineIndentPt}pt`;
  target.style.marginTop = `${normal.spaceBeforePt}pt`;
  target.style.marginBottom = `${normal.spaceAfterPt}pt`;
}

function unwrapItem(item: HTMLElement, list: HTMLElement, normal: ElementStyleRule): Node[] {
  const output: Node[] = [];
  let paragraph: HTMLElement | null = null;
  const flush = () => { if (paragraph) { output.push(paragraph); paragraph = null; } };
  for (const node of Array.from(item.childNodes)) {
    if (node instanceof HTMLElement && /^(P|DIV|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE)$/.test(node.tagName)) {
      flush();
      if (!/^(UL|OL|TABLE)$/.test(node.tagName)) paragraphStyle(node, item, list, normal);
      output.push(node);
    } else {
      if (!paragraph) {
        paragraph = document.createElement('p');
        paragraphStyle(paragraph, item, list, normal);
      }
      // All inline nodes, including space-only spans and selection markers, share one paragraph.
      paragraph.appendChild(node);
    }
  }
  flush();
  if (!output.length) {
    const empty = document.createElement('p'); empty.appendChild(document.createElement('br'));
    paragraphStyle(empty, item, list, normal); output.push(empty);
  }
  if (output[0] instanceof HTMLElement && !/^(UL|OL|TABLE)$/.test(output[0].tagName)) {
    for (const name of ['id', 'data-word-flow', 'data-word-continuation']) {
      if (item.hasAttribute(name) && !output[0].hasAttribute(name)) output[0].setAttribute(name, item.getAttribute(name)!);
    }
  }
  return output;
}

export function removeListItems(items: HTMLElement[], normal: ElementStyleRule): void {
  const selected = new Set(items);
  const lists = [...new Set(items.map(item => item.parentElement!))];
  // Nested lists must be converted before their containing item moves.
  lists.sort((a, b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0);
  for (const list of lists) {
    const replacement = document.createDocumentFragment();
    let segment: HTMLElement | null = null;
    let segmentCount = 0;
    let ordinal = list.hasAttribute('start') ? Number(list.getAttribute('start')) : list.hasAttribute('reversed') ? list.children.length : 1;
    const step = list.hasAttribute('reversed') ? -1 : 1;
    const flush = () => { if (segment) { replacement.appendChild(segment); segment = null; } };
    for (const node of Array.from(list.childNodes)) {
      if (!(node instanceof HTMLElement) || node.tagName !== 'LI') {
        (segment || replacement).appendChild(node); continue;
      }
      if (node.hasAttribute('value')) ordinal = Number(node.getAttribute('value'));
      if (selected.has(node)) {
        flush(); replacement.append(...unwrapItem(node, list, normal));
      } else {
        if (!segment) {
          segment = list.cloneNode(false) as HTMLElement;
          if (segmentCount++) segment.removeAttribute('id');
          if (list.tagName === 'OL') segment.setAttribute('start', String(ordinal));
        }
        segment.appendChild(node);
      }
      ordinal += step;
    }
    flush(); list.replaceWith(replacement);
  }
}

/** Crear/cambiar listas moviendo nodos: execCommand descarta espacios en runs importados. */
export function addListItems(bodies: HTMLElement[], range: Range, tag: 'OL' | 'UL'): boolean {
  const selected = selectedParagraphs(bodies, range).filter(block => !block.closest('[contenteditable="false"]'));
  if (!selected.length) return false;
  const flowIds = new Set(selected.map(block => block.dataset['wordFlow']).filter(Boolean));
  const blocks = bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li')))
    .filter(block => selected.includes(block) || flowIds.has(block.dataset['wordFlow']))
    .filter(block => !block.querySelector('p,h1,h2,h3,h4,h5,h6,li'));
  const items = new Set(blocks.map(block => block.closest<HTMLElement>('li')).filter((item): item is HTMLElement => !!item));
  for (const list of new Set([...items].map(item => item.parentElement!))) {
    const output = document.createDocumentFragment(); let segment: HTMLElement | null = null;
    let ordinal = Number(list.getAttribute('start') || 1);
    for (const child of Array.from(list.childNodes)) {
      if (!(child instanceof HTMLElement)) { (segment || output).append(child); continue; }
      ordinal = Number(child.getAttribute('value') || ordinal);
      const kind = items.has(child as HTMLElement) ? tag : list.tagName;
      if (!segment || segment.tagName !== kind) {
        segment = document.createElement(kind); segment.style.cssText = list.style.cssText;
        if (kind !== list.tagName) segment.style.removeProperty('list-style-type');
        for (const attr of ['data-word-flow','data-word-continuation','start','reversed']) if (list.hasAttribute(attr)) segment.setAttribute(attr,list.getAttribute(attr)!);
        if (kind === 'OL') segment.setAttribute('start', String(list.tagName === 'OL' ? ordinal : 1));
        output.append(segment);
      }
      segment.append(child); ordinal += list.hasAttribute('reversed') ? -1 : 1;
    }
    list.replaceWith(output);
  }
  let lastList: HTMLElement | null = null;
  const listFlow = `list-${crypto.randomUUID()}`;
  let listsCreated = 0;
  for (const block of blocks) {
    if (block.closest('li')) continue;
    let list = block.previousElementSibling as HTMLElement | null;
    if (list !== lastList || list?.tagName !== tag) {
      list = document.createElement(tag); list.dataset['wordFlow'] = listFlow;
      if (listsCreated++) list.dataset['wordContinuation'] = listFlow;
      block.before(list); lastList = list;
    }
    const item = document.createElement('li');
    const flow = block.dataset['wordFlow'];
    if (flow) { item.dataset['wordFlow'] = `item-${flow}`; if (block.hasAttribute('data-word-continuation')) item.dataset['wordContinuation'] = `item-${flow}`; }
    list!.append(item); item.append(block);
  }
  return true;
}
