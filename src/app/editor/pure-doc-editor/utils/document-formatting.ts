import { ElementStyleRule, StyleTargetTag } from '../models/word-document.model';

export const PARAGRAPH_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote';

/** Leaf paragraphs only: a list item containing paragraphs must not be formatted twice. */
export function selectedParagraphs(bodies: HTMLElement[], range: Range): HTMLElement[] {
  const paragraphs = bodies.flatMap(body => Array.from(body.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR)))
    .filter(element => !element.querySelector(PARAGRAPH_SELECTOR));
  if (range.collapsed) {
    const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const block = element?.closest<HTMLElement>(PARAGRAPH_SELECTOR);
    return block && bodies.some(body => body.contains(block)) ? [block] : [];
  }
  return paragraphs.filter(element => {
    const contents = document.createRange();
    contents.selectNodeContents(element);
    if (range.compareBoundaryPoints(Range.END_TO_START, contents) >= 0
      || range.compareBoundaryPoints(Range.START_TO_END, contents) <= 0) return false;
    const intersection = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, contents) < 0) intersection.setStart(contents.startContainer, contents.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, contents) > 0) intersection.setEnd(contents.endContainer, contents.endOffset);
    return !!intersection.toString().length || !element.textContent;
  });
}

export function cssPoints(value: string, fallback = 0): number {
  const number = parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  if (value.endsWith('px')) return number * .75;
  if (value.endsWith('cm')) return number * 72 / 2.54;
  if (value.endsWith('in')) return number * 72;
  return number;
}

/** Resolve the actual text run, including ranges restored at element boundaries. */
export function selectionElement(range: Range): HTMLElement {
  const readable = (node: Node): boolean => !!node.textContent?.length
    && !(node.parentElement?.closest('[contenteditable="false"],script,style'));
  if (range.startContainer instanceof Text && readable(range.startContainer)
    && (range.collapsed || range.startOffset < range.startContainer.length)) return range.startContainer.parentElement!;
  if (!range.collapsed) {
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (readable(text) && range.intersectsNode(text)
        && (text !== range.startContainer || range.startOffset < (text as Text).length)
        && (text !== range.endContainer || range.endOffset > 0)) return text.parentElement!;
    }
  }
  const container = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement!;
  const descendants = (node: Node, last: boolean): HTMLElement | null => {
    if (node instanceof Text) return readable(node) ? node.parentElement : null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let result: HTMLElement | null = null;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (readable(text)) { result = text.parentElement; if (!last) return result; }
    }
    return result;
  };
  // At the end of a run the caret keeps that run's format. At its beginning,
  // an empty marker-created text node must not hide the following styled run.
  const offset = range.startContainer instanceof Element ? range.startOffset : Array.from(container.childNodes).indexOf(range.startContainer as ChildNode);
  for (let index = offset - 1; index >= 0; index--) {
    const found = descendants(container.childNodes[index], true); if (found) return found;
  }
  for (let index = Math.max(0,offset); index < container.childNodes.length; index++) {
    const found = descendants(container.childNodes[index], false); if (found) return found;
  }
  return container as HTMLElement;
}

export function inheritedStyle(element: HTMLElement, property: 'fontFamily' | 'fontSize'): string {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const value = getComputedStyle(current)[property];
    if (value && value !== 'inherit') return value;
    const legacy = current.tagName === 'FONT' && property === 'fontFamily' ? current.getAttribute('face') : null;
    if (legacy) return legacy;
  }
  return '';
}

export function scriptPosition(element: HTMLElement): 'sub' | 'super' | 'baseline' {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const authored = current.style.verticalAlign;
    if (authored === 'sub' || authored === 'super' || authored === 'baseline') return authored;
    const alignment = getComputedStyle(current).verticalAlign;
    // A child run's default baseline is relative to its script parent; it does
    // not cancel an ancestor's vertical position.
    if (alignment === 'sub' || alignment === 'super') return alignment;
    if (current.tagName === 'SUB') return 'sub';
    if (current.tagName === 'SUP') return 'super';
    if (current.hasAttribute('data-page-body-id')) break;
  }
  return 'baseline';
}

export function selectionStyle(range: Range, base: ElementStyleRule): ElementStyleRule {
  const element = selectionElement(range);
  const block = element.closest<HTMLElement>(PARAGRAPH_SELECTOR) ?? element;
  const text = getComputedStyle(element);
  const paragraph = getComputedStyle(block);
  const decoration = [element, ...ancestors(element, block)].map(el => getComputedStyle(el).textDecorationLine || getComputedStyle(el).textDecoration).join(' ');
  const size = cssPoints(inheritedStyle(element, 'fontSize'), base.fontSizePt);
  const lineHeight = parseFloat(paragraph.lineHeight);
  const fontPx = parseFloat(paragraph.fontSize) || size / .75;
  const align = paragraph.textAlign;
  let color = text.color || base.color;
  if (element.closest('.word-dark-sheet')) {
    // The dark sheet changes display colors only; never save its white ink as a style.
    let authored: HTMLElement | null = element;
    color = '#0f172a';
    while (authored) {
      if (authored.style.color && !['inherit','currentcolor'].includes(authored.style.color.toLowerCase())) { color = authored.style.color; break; }
      if (authored.hasAttribute('data-page-body-id')) break;
      authored = authored.parentElement;
    }
  }
  return {
    ...base,
    fontFamily: inheritedStyle(element, 'fontFamily').replace(/["']/g, '').split(',')[0].trim() || base.fontFamily,
    fontSizePt: Math.round(size * 100) / 100,
    bold: text.fontWeight === 'bold' || Number(text.fontWeight) >= 600,
    italic: text.fontStyle === 'italic' || text.fontStyle === 'oblique',
    underline: decoration.includes('underline'), strikeThrough: decoration.includes('line-through'),
    color,
    backgroundColor: text.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'transparent' : text.backgroundColor || 'transparent',
    align: ['left','center','right','justify'].includes(align) ? align as ElementStyleRule['align'] : 'left',
    lineHeight: Number.isFinite(lineHeight) ? Math.round((paragraph.lineHeight.endsWith('px') ? lineHeight / fontPx : lineHeight) * 100) / 100 : base.lineHeight,
    spaceBeforePt: cssPoints(paragraph.marginTop), spaceAfterPt: cssPoints(paragraph.marginBottom),
    firstLineIndentPt: cssPoints(paragraph.textIndent),
    indentLeftPt: cssPoints(paragraph.marginLeft), indentRightPt: cssPoints(paragraph.marginRight),
    uppercase: text.textTransform === 'uppercase',
  };
}

function ancestors(element: HTMLElement, stop: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  for (let parent = element.parentElement; parent && element !== stop; parent = parent.parentElement) {
    result.push(parent);
    if (parent === stop) break;
  }
  return result;
}

/** Remove direct run overrides, including legacy FONT and semantic bold/italic tags. */
export function applyStyleRule(element: HTMLElement, rule: ElementStyleRule): void {
  const style = element.style;
  style.fontFamily = rule.fontFamily.includes(',') ? rule.fontFamily : `"${rule.fontFamily}", serif`;
  style.fontSize = `${rule.fontSizePt}pt`;
  style.fontWeight = rule.bold ? '700' : '400';
  style.fontStyle = rule.italic ? 'italic' : 'normal';
  style.textDecoration = [rule.underline ? 'underline' : '', rule.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  style.color = rule.color;
  style.backgroundColor = rule.backgroundColor || 'transparent';
  style.textTransform = rule.uppercase ? 'uppercase' : 'none';
  style.textAlign = rule.align;
  style.lineHeight = String(rule.lineHeight);
  style.marginTop = `${rule.spaceBeforePt}pt`;
  style.marginBottom = `${rule.spaceAfterPt}pt`;
  style.textIndent = `${rule.firstLineIndentPt}pt`;
  style.marginLeft = `${rule.indentLeftPt ?? 0}pt`;
  style.marginRight = `${rule.indentRightPt ?? 0}pt`;
  element.querySelectorAll<HTMLElement>('span,font,b,strong,i,em,u,s,strike,a,code,small,big').forEach(run => {
    for (const property of ['font-family','font-size','font-weight','font-style','text-decoration','color','text-transform','background-color']) {
      run.style.setProperty(property, 'inherit');
    }
    if (run.tagName === 'FONT') ['face','size','color'].forEach(attribute => run.removeAttribute(attribute));
  });
}

export function replaceParagraphTag(element: HTMLElement, tag: StyleTargetTag): HTMLElement {
  if (element.tagName === tag) return element;
  const replacement = document.createElement(tag.toLowerCase());
  for (const attribute of Array.from(element.attributes)) replacement.setAttribute(attribute.name, attribute.value);
  while (element.firstChild) replacement.appendChild(element.firstChild);
  element.replaceWith(replacement);
  return replacement;
}

export interface TextMatch { range: Range; pageIndex: number; }

/** Index text runs, keeping inline markup searchable and paragraph boundaries separate. */
export function findDocumentText(bodies: HTMLElement[], query: string, matchCase = false, wholeWord = false): TextMatch[] {
  if (!query) return [];
  const matches: TextMatch[] = [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  bodies.forEach((body, pageIndex) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const runs: { node: Text; start: number; end: number }[] = [];
    let text = '', previousBlock: Element | null = null;
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (node.parentElement?.closest('[contenteditable="false"],script,style')) continue;
      const block = node.parentElement?.closest(PARAGRAPH_SELECTOR + ',td,th') ?? body;
      if (previousBlock && previousBlock !== block) text += '\n';
      previousBlock = block;
      runs.push({ node, start: text.length, end: text.length + node.length });
      text += node.data;
    }
    let firstRunIndex = 0;
    expression.lastIndex = 0;
    for (let match = expression.exec(text); match; match = expression.exec(text)) {
      const position = match.index, end = position + match[0].length;
      const word = /[\p{L}\p{N}_]/u;
      if (!wholeWord || (!word.test(text[position - 1] || '') && !word.test(text[end] || ''))) {
        while (runs[firstRunIndex] && runs[firstRunIndex].end <= position) firstRunIndex++;
        const first = runs[firstRunIndex];
        let lastRunIndex = firstRunIndex;
        while (runs[lastRunIndex] && runs[lastRunIndex].end < end) lastRunIndex++;
        const last = runs[lastRunIndex];
        if (first && last) {
          const range = document.createRange();
          range.setStart(first.node, position - first.start);
          range.setEnd(last.node, end - last.start);
          matches.push({ range, pageIndex });
        }
      }
    }
  });
  return matches;
}
