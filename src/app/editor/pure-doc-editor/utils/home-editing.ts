import { cssPoints, inheritedStyle, PARAGRAPH_SELECTOR, selectedParagraphs } from './document-formatting';
import { ElementStyleRule } from '../models/word-document.model';

export function inlineProperties(rule: ElementStyleRule): Record<string, string> {
  return { fontFamily: rule.fontFamily, fontSize: `${rule.fontSizePt}pt`,
    fontWeight: rule.bold ? '700' : '400', fontStyle: rule.italic ? 'italic' : 'normal',
    textDecoration: [rule.underline ? 'underline' : '', rule.strikeThrough ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    color: rule.color, backgroundColor: rule.backgroundColor || 'transparent', textTransform: rule.uppercase ? 'uppercase' : 'none' };
}

export function selectedTextRuns(bodies: HTMLElement[], range: Range): { node: Text; start: number; end: number }[] {
  const runs: { node: Text; start: number; end: number }[] = [];
  for (const body of bodies) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!range.intersectsNode(node) || node.parentElement?.closest('[contenteditable="false"]')) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end > start) runs.push({ node, start, end });
    }
  }
  return runs;
}

export function applyInlineProperties(bodies: HTMLElement[], range: Range, properties: Record<string, string>): void {
  for (const { node, start, end } of selectedTextRuns(bodies, range).reverse()) {
    if (end < node.length) node.splitText(end);
    const selected = start ? node.splitText(start) : node;
    const span = document.createElement('span');
    Object.assign(span.style, properties);
    selected.replaceWith(span); span.appendChild(selected);
  }
}

/** Commands that operate on the document DOM instead of browser toolbar state. */
export function applyHomeCommand(command: string, value: string | undefined, bodies: HTMLElement[], range: Range): boolean {
  const paragraphs = selectedParagraphs(bodies, range);
  const element = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement!;
  switch (command) {
    case 'changeCase': {
      let sentenceStart = true, wordStart = true;
      const runs = selectedTextRuns(bodies, range);
      if (!runs.length) return false;
      for (const { node, start, end } of runs) {
        const changed = Array.from(node.data.slice(start, end)).map(char => {
          const letter = /\p{L}/u.test(char);
          let result = char;
          if (value === 'upper') result = char.toLocaleUpperCase();
          else if (value === 'lower') result = char.toLocaleLowerCase();
          else if (value === 'toggle') result = char === char.toLocaleUpperCase() ? char.toLocaleLowerCase() : char.toLocaleUpperCase();
          else if (value === 'title') result = wordStart ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
          else if (value === 'sentence') result = sentenceStart ? char.toLocaleUpperCase() : char.toLocaleLowerCase();
          if (letter) sentenceStart = false;
          if (/[.!?]/u.test(char)) sentenceStart = true;
          wordStart = !/[\p{L}\p{N}]/u.test(char);
          return result;
        }).join('');
        node.replaceData(start, end - start, changed);
      }
      return true;
    }
    case 'textEffect':
      applyInlineProperties(bodies, range, { textShadow: value === 'shadow' ? '1px 2px 3px #64748b' : 'none', webkitTextStroke: value === 'outline' ? '0.5px currentColor' : '0px' });
      return !range.collapsed;
    case 'lineHeight': paragraphs.forEach(el => el.style.lineHeight = value || '1.15'); break;
    case 'spaceBefore': paragraphs.forEach(el => el.style.marginTop = `${Number(value) || 0}pt`); break;
    case 'spaceAfter': paragraphs.forEach(el => el.style.marginBottom = `${Number(value) || 0}pt`); break;
    case 'paragraphShading': paragraphs.forEach(el => el.style.backgroundColor = value || 'transparent'); break;
    case 'paragraphBorder':
      paragraphs.forEach(el => {
        el.style.border = 'none';
        if (value === 'all') el.style.border = '1px solid currentColor';
        else if (value === 'top') el.style.borderTop = '1px solid currentColor';
        else if (value === 'bottom') el.style.borderBottom = '1px solid currentColor';
      }); break;
    case 'sortParagraphs': {
      if (paragraphs.length < 2) return false;
      const parent = paragraphs[0].parentElement;
      // Sorting separate table cells or nested blocks would destroy document structure.
      if (!parent || paragraphs.some(el => el.parentElement !== parent)) return false;
      const sorted = [...paragraphs].sort((a,b) => (a.textContent || '').localeCompare(b.textContent || '', 'es', { numeric: true, sensitivity: 'base' }) * (value === 'desc' ? -1 : 1));
      const slots = paragraphs.map(el => { const slot = document.createComment('sort-slot'); el.before(slot); return slot; });
      paragraphs.forEach(el => el.remove());
      slots.forEach((slot,index) => slot.replaceWith(sorted[index]));
      break;
    }
    case 'listStyle': {
      const ordered = ['decimal','lower-alpha','upper-roman'].includes(value || '');
      if (!element.closest(ordered ? 'ol' : 'ul')) document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false);
      const selectionElement = window.getSelection()?.anchorNode;
      const current = selectionElement instanceof Element ? selectionElement : selectionElement?.parentElement;
      const lists = new Set(paragraphs.map(p => p.closest<HTMLElement>('ol,ul')).filter(Boolean));
      const list = current?.closest<HTMLElement>('ol,ul');
      if (list) lists.add(list);
      lists.forEach(list => { if (list) list.style.listStyleType = value || 'disc'; });
      return lists.size > 0;
    }
    case 'multilevelList': {
      if (!element.closest('ol')) document.execCommand('insertOrderedList', false);
      const anchor = window.getSelection()?.anchorNode;
      const current = anchor instanceof Element ? anchor : anchor?.parentElement;
      const list = current?.closest<HTMLElement>('ol');
      if (!list) return false;
      list.classList.add('word-multilevel-list');
      list.style.listStyleType = 'decimal';
      return true;
    }
    case 'indent':
    case 'outdent': {
      if (element.closest('li')) { document.execCommand(command, false); return true; }
      paragraphs.forEach(el => {
        const current = cssPoints(getComputedStyle(el).marginLeft);
        el.style.marginLeft = `${Math.max(0, current + (command === 'indent' ? 36 : -36))}pt`;
      }); break;
    }
    case 'justifyLeft': case 'justifyCenter': case 'justifyRight': case 'justifyFull':
      paragraphs.forEach(el => el.style.textAlign = ({justifyLeft:'left', justifyCenter:'center', justifyRight:'right', justifyFull:'justify'} as Record<string,string>)[command]); break;
    default: return false;
  }
  return paragraphs.length > 0;
}

export function currentParagraph(range: Range): HTMLElement | null {
  const node = range.startContainer;
  return (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(PARAGRAPH_SELECTOR) ?? null;
}

/** Split only the selected branch so changing a script never changes adjacent text. */
function isolateScriptBranch(text: Text): void {
  let branch: Node = text;
  let parent = branch.parentElement;
  while (parent && !parent.matches(PARAGRAPH_SELECTOR) && !parent.hasAttribute('data-page-body-id')) {
    const nextParent = parent.parentElement;
    const before = parent.cloneNode(false) as HTMLElement;
    const after = parent.cloneNode(false) as HTMLElement;
    before.removeAttribute('id'); after.removeAttribute('id');
    while (parent.firstChild && parent.firstChild !== branch) before.appendChild(parent.firstChild);
    while (branch.nextSibling) after.appendChild(branch.nextSibling);
    if (before.childNodes.length) parent.before(before);
    if (after.childNodes.length) parent.after(after);
    if (parent.tagName === 'SUB' || parent.tagName === 'SUP') {
      const span = document.createElement('span');
      for (const attribute of Array.from(parent.attributes)) span.setAttribute(attribute.name, attribute.value);
      span.append(...Array.from(parent.childNodes)); parent.replaceWith(span); parent = span;
      parent.style.fontSize = 'inherit';
      parent.style.verticalAlign = 'baseline';
    }
    if (['sub','super'].includes(parent.style.verticalAlign) || parent.hasAttribute('data-word-script')) {
      parent.style.verticalAlign = 'baseline'; parent.style.fontSize = 'inherit';
      parent.removeAttribute('data-word-script'); parent.removeAttribute('data-word-base-size');
    }
    branch = parent; parent = nextParent;
  }
}

export function scriptBaseSize(element: HTMLElement, fallback: number): number {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const saved = Number(current.dataset['wordBaseSize']);
    if (saved > 0) return saved;
    if (current.matches('sub,sup') || ['sub','super'].includes(current.style.verticalAlign || getComputedStyle(current).verticalAlign)) {
      if (current.parentElement) return cssPoints(inheritedStyle(current.parentElement,'fontSize'),fallback);
    }
    if (current.hasAttribute('data-page-body-id')) break;
  }
  return fallback;
}

export function applyScript(bodies: HTMLElement[], range: Range, mode: 'sub' | 'super' | 'baseline', fallback: number): void {
  for (const {node,start,end} of selectedTextRuns(bodies,range).reverse()) {
    const base = scriptBaseSize(node.parentElement!, cssPoints(inheritedStyle(node.parentElement!,'fontSize'),fallback));
    if (end < node.length) node.splitText(end);
    const selected = start ? node.splitText(start) : node;
    isolateScriptBranch(selected);
    const span = document.createElement('span');
    span.style.verticalAlign = mode;
    span.style.fontSize = `${Math.round((mode === 'baseline' ? base : base * .75) * 100) / 100}pt`;
    if (mode !== 'baseline') { span.dataset['wordScript'] = mode; span.dataset['wordBaseSize'] = String(base); }
    selected.replaceWith(span); span.appendChild(selected);
  }
}
