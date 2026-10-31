import { marked, type Token, type Tokens } from 'marked';

const CODE_FENCE_RE = /^\s*```[a-zA-Z0-9_+-]*\r?\n([\s\S]*?)\r?\n?```\s*$/;
const MD_FENCE_RE = /^\s*```(?:markdown|md)\r?\n([\s\S]*?)\r?\n?```\s*$/i;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function unescapeMarkedEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, match => ENTITIES[match] ?? match);
}

function isSafeHref(href: string): boolean {
  return /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim());
}

export function unwrapCodeFence(value: string): string {
  const match = CODE_FENCE_RE.exec(value);
  return match ? match[1] : value;
}

function unwrapMarkdownFence(value: string): string {
  const match = MD_FENCE_RE.exec(value);
  return match ? match[1] : value;
}

export function cleanSheetCellText(value: string): string {
  let cleaned = unwrapCodeFence(value).trim();
  if (cleaned.length >= 2 && cleaned.startsWith('`') && cleaned.endsWith('`') && !cleaned.slice(1, -1).includes('`')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('=')) return cleaned;
  return cleaned
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(?=[^\d\s])/, '')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(?<![\w*])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![\w*])/g, '$1');
}

export function cleanSlideText(value: string): string {
  return unwrapCodeFence(value)
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(?<![\w*])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![\w*])/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}

export function cleanLatexSource(value: string, documentMode = false): string {
  let cleaned = unwrapCodeFence(value);
  if (documentMode) {
    cleaned = cleaned
      .replace(/^###\s+(.+)$/gm, '\\subsubsection{$1}')
      .replace(/^##\s+(.+)$/gm, '\\subsection{$1}')
      .replace(/^#\s+(.+)$/gm, '\\section{$1}')
      .replace(/\*\*([^*\n]+)\*\*/g, '\\textbf{$1}');
  }
  return cleaned;
}

function hasInlineMarkdown(value: string): boolean {
  return /\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|(?<![\w*])\*[^*\s](?:[^*\n]*[^*\s])?\*(?![\w*])|(?<![\w_])_[^_\s](?:[^_\n]*[^_\s])?_(?![\w_])|\[[^\]\n]+\]\((?:https?:\/\/|mailto:|\/|#)[^)\s]+\)/i.test(value);
}

function hasBlockMarkdown(value: string): boolean {
  return /^\s*(?:#{1,6}\s+\S|[-*+]\s+\S|\d+\.\s+\S|>\s+\S|```|(?:---+|\*\*\*+)\s*$)/m.test(value)
    || /^\s*\|.+\|\s*\r?\n\s*\|[\s:|-]+\|/m.test(value)
    || /\r?\n\s*\r?\n/.test(value);
}

function appendInlineTokens(doc: Document, parent: ParentNode, tokens: Token[] | undefined): void {
  if (!tokens) return;
  for (const token of tokens) {
    switch (token.type) {
      case 'strong': {
        const el = doc.createElement('strong');
        appendInlineTokens(doc, el, (token as Tokens.Strong).tokens);
        parent.append(el);
        break;
      }
      case 'em': {
        const el = doc.createElement('em');
        appendInlineTokens(doc, el, (token as Tokens.Em).tokens);
        parent.append(el);
        break;
      }
      case 'del': {
        const el = doc.createElement('s');
        appendInlineTokens(doc, el, (token as Tokens.Del).tokens);
        parent.append(el);
        break;
      }
      case 'codespan': {
        const el = doc.createElement('code');
        el.textContent = unescapeMarkedEntities((token as Tokens.Codespan).text);
        parent.append(el);
        break;
      }
      case 'br':
        parent.append(doc.createElement('br'));
        break;
      case 'link': {
        const link = token as Tokens.Link;
        if (isSafeHref(link.href)) {
          const a = doc.createElement('a');
          a.setAttribute('href', link.href.trim());
          if (/^https?:\/\//i.test(link.href.trim())) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          }
          appendInlineTokens(doc, a, link.tokens);
          parent.append(a);
        } else {
          parent.append(doc.createTextNode(link.raw));
        }
        break;
      }
      case 'escape':
        parent.append(doc.createTextNode((token as Tokens.Escape).text));
        break;
      case 'html':
        parent.append(doc.createTextNode(token.raw));
        break;
      case 'text': {
        const txt = token as Tokens.Text;
        if (txt.tokens?.length) appendInlineTokens(doc, parent, txt.tokens);
        else parent.append(doc.createTextNode(unescapeMarkedEntities(txt.text)));
        break;
      }
      default:
        parent.append(doc.createTextNode('text' in token && typeof token.text === 'string'
          ? unescapeMarkedEntities(token.text) : token.raw));
    }
  }
}

function appendInlineText(doc: Document, parent: ParentNode, source: string): void {
  appendInlineTokens(doc, parent, marked.Lexer.lexInline(source, { gfm: true }));
}

function appendBlockTokens(doc: Document, container: ParentNode, tokens: Token[]): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;
      case 'heading': {
        const h = token as Tokens.Heading;
        const el = doc.createElement(`h${Math.min(6, Math.max(1, h.depth))}`);
        appendInlineTokens(doc, el, h.tokens);
        container.append(el);
        break;
      }
      case 'paragraph': {
        const pToken = token as Tokens.Paragraph;
        for (const line of pToken.text.split(/\r?\n/)) {
          const p = doc.createElement('p');
          if (line) appendInlineText(doc, p, line);
          container.append(p);
        }
        break;
      }
      case 'list': {
        const list = token as Tokens.List;
        const listEl = doc.createElement(list.ordered ? 'ol' : 'ul');
        if (list.ordered && typeof list.start === 'number' && list.start !== 1) {
          listEl.setAttribute('start', String(list.start));
        }
        for (const item of list.items) {
          const li = doc.createElement('li');
          if (item.task) li.append(doc.createTextNode(item.checked ? '☑ ' : '☐ '));
          for (const child of item.tokens) {
            if (child.type === 'text') {
              const txt = child as Tokens.Text;
              if (txt.tokens?.length) appendInlineTokens(doc, li, txt.tokens);
              else appendInlineText(doc, li, txt.text);
            } else if (child.type === 'paragraph') {
              appendInlineTokens(doc, li, (child as Tokens.Paragraph).tokens);
            } else if (child.type !== 'space') {
              appendBlockTokens(doc, li, [child]);
            }
          }
          listEl.append(li);
        }
        container.append(listEl);
        break;
      }
      case 'blockquote': {
        const bq = doc.createElement('blockquote');
        appendBlockTokens(doc, bq, (token as Tokens.Blockquote).tokens);
        container.append(bq);
        break;
      }
      case 'code': {
        const codeToken = token as Tokens.Code;
        if (codeToken.codeBlockStyle === 'indented') {
          for (const line of codeToken.text.split(/\r?\n/)) {
            const p = doc.createElement('p');
            p.textContent = line;
            container.append(p);
          }
        } else {
          const pre = doc.createElement('pre');
          const code = doc.createElement('code');
          if (codeToken.lang) code.setAttribute('data-lang', codeToken.lang.trim());
          code.textContent = codeToken.text;
          pre.append(code);
          container.append(pre);
        }
        break;
      }
      case 'table': {
        const tbl = token as Tokens.Table;
        const table = doc.createElement('table');
        const thead = doc.createElement('thead');
        const headRow = doc.createElement('tr');
        tbl.header.forEach((cell, i) => {
          const th = doc.createElement('th');
          if (tbl.align[i]) th.style.textAlign = tbl.align[i]!;
          appendInlineTokens(doc, th, cell.tokens);
          headRow.append(th);
        });
        thead.append(headRow);
        table.append(thead);
        if (tbl.rows.length) {
          const tbody = doc.createElement('tbody');
          for (const row of tbl.rows) {
            const tr = doc.createElement('tr');
            row.forEach((cell, i) => {
              const td = doc.createElement('td');
              if (tbl.align[i]) td.style.textAlign = tbl.align[i]!;
              appendInlineTokens(doc, td, cell.tokens);
              tr.append(td);
            });
            tbody.append(tr);
          }
          table.append(tbody);
        }
        container.append(table);
        break;
      }
      case 'hr':
        container.append(doc.createElement('hr'));
        break;
      default: {
        for (const line of token.raw.replace(/\r?\n$/, '').split(/\r?\n/)) {
          const p = doc.createElement('p');
          p.textContent = line;
          container.append(p);
        }
      }
    }
  }
}

function appendRichBlocks(doc: Document, container: ParentNode, raw: string): void {
  const cleaned = unwrapMarkdownFence(raw);
  if (!cleaned) return;
  const tokens = marked.lexer(cleaned, { gfm: true });
  appendBlockTokens(doc, container, tokens);
}

export function richTextHtml(source: string): string {
  const doc = new DOMParser().parseFromString('', 'text/html');
  appendRichBlocks(doc, doc.body, source);
  return doc.body.innerHTML || '<p></p>';
}

function isSoleParagraphText(node: Text): HTMLParagraphElement | null {
  const parent = node.parentElement;
  if (!parent || parent.tagName !== 'P') return null;
  for (const child of Array.from(parent.childNodes)) {
    if (child === node) continue;
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) continue;
    if (child.nodeName === 'BR') continue;
    return null;
  }
  return parent as HTMLParagraphElement;
}

/** Campos de texto con IDs estables por nodo; no expone atributos ni binarios al proveedor. */
export function* domTextFields(body: HTMLElement, prefix: string): Generator<{ id: string; text: string }> {
  const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node: Node | null; let index = 0;
  while ((node = walk.nextNode())) {
    const id = `${prefix}:text:${index++}`;
    const protectedParent = node.parentElement?.closest('script,style,svg,math,[contenteditable=false]');
    const excluded = protectedParent && protectedParent !== body && body.contains(protectedParent);
    if (!excluded && node.textContent?.trim()) yield { id, text: node.textContent };
  }
  yield { id: `${prefix}:append`, text: '' };
}

export function htmlTextFields(html: string, prefix: string): { id: string; text: string }[] {
  return [...domTextFields(new DOMParser().parseFromString(html, 'text/html').body, prefix)];
}

export function applyHtmlText(html: string, prefix: string, values: Map<string, string>): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  const walk = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const targets: { id: string; node: Text }[] = [];
  let current: Node | null; let index = 0;
  while ((current = walk.nextNode())) {
    const id = `${prefix}:text:${index++}`;
    if (values.has(id) && !current.parentElement?.closest('script,style,svg,math,[contenteditable=false]')) {
      targets.push({ id, node: current as Text });
    }
  }
  for (const { id, node } of targets) {
    const rawValue = unwrapMarkdownFence(values.get(id)!);
    const soleParagraph = isSoleParagraphText(node);
    if (soleParagraph && hasBlockMarkdown(rawValue)) {
      const fragment = doc.createDocumentFragment();
      appendRichBlocks(doc, fragment, rawValue);
      soleParagraph.replaceWith(fragment);
    } else if (node.parentElement?.closest('h1,h2,h3,h4,h5,h6') && /^\s*#{1,6}\s+\S/.test(rawValue) && !rawValue.includes('\n')) {
      const stripped = rawValue.replace(/^\s*#{1,6}\s+/, '');
      if (hasInlineMarkdown(stripped)) {
        const fragment = doc.createDocumentFragment();
        appendInlineText(doc, fragment, stripped);
        node.replaceWith(fragment);
      } else {
        node.textContent = stripped;
      }
    } else if (hasInlineMarkdown(rawValue) && !rawValue.includes('\n')) {
      const fragment = doc.createDocumentFragment();
      appendInlineText(doc, fragment, rawValue);
      node.replaceWith(fragment);
    } else if (soleParagraph && (hasInlineMarkdown(rawValue) || rawValue.includes('\n'))) {
      const fragment = doc.createDocumentFragment();
      appendRichBlocks(doc, fragment, rawValue);
      soleParagraph.replaceWith(fragment);
    } else {
      node.textContent = rawValue;
    }
  }
  const append = values.get(`${prefix}:append`);
  if (append) appendRichBlocks(doc, body, append);
  return body.innerHTML;
}
