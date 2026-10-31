import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MarkdownPart { from: number; to: number; raw: string; type: string; depth?: number; html: string; }

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['contenteditable', 'autofocus'],
  });
}

export function markdownHtml(source: string): string {
  return sanitizeHtml(marked.parse(source, { async: false, gfm: true }) as string);
}

/** Raw token lengths preserve offsets even for CRLF, blanks and nested lists. */
export function markdownParts(source: string): MarkdownPart[] {
  // Marked normalizes CRLF and omits reference definitions from its token list.
  const normalized = source.replace(/\r\n?/g, '\n');
  const positions: number[] = [];
  for (let i = 0; i < source.length; i++) { positions.push(i); if (source[i] === '\r' && source[i + 1] === '\n') i++; }
  positions.push(source.length);
  const tokens = marked.lexer(normalized, { gfm: true });
  let offset = 0;
  return tokens.map(token => {
    const start = normalized.indexOf(token.raw, offset);
    const from = start < 0 ? offset : start;
    offset = from + token.raw.length;
    const end = offset - (token.raw.match(/\n+$/)?.[0].length || 0);
    const raw = source.slice(positions[from], positions[end]);
    // Share reference definitions so links render identically in preview and exports.
    const one = Object.assign([token], { links: tokens.links });
    return { from: positions[from], to: positions[end], raw, type: token.type,
      depth: token.type === 'heading' ? token.depth : undefined,
      html: sanitizeHtml(marked.parser(one)),
    };
  }).filter(part => part.raw.trim().length > 0);
}

/** Markdown cannot represent every rich-text style: preserve such HTML verbatim. */
export function richHtmlToMarkdown(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  if (!root.textContent?.trim() && !root.querySelector('img,table,hr')) return '';
  const escape = (value: string) => value.replace(/([\\`*_[\]<>#|])/g, '\\$1');
  const convert = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent || '');
    if (!(node instanceof HTMLElement)) return '';
    // Keep merged tables, task lists, alignment, custom marks and styles losslessly.
    if (node.hasAttribute('style') || node.hasAttribute('data-type')) return `\n\n${node.outerHTML}\n\n`;
    const children = () => Array.from(node.childNodes).map(convert).join('');
    switch (node.tagName) {
      case 'TABLE': {
        const rows = Array.from(node.querySelectorAll('tr'));
        const cells = rows.map(row => Array.from(row.children) as HTMLElement[]);
        const width = cells[0]?.length || 0;
        const unsupported = node.querySelector('[colspan]:not([colspan="1"]),[rowspan]:not([rowspan="1"]),[style],[data-type],table,ul,ol,pre,img,div,span,u,sup,sub,br,blockquote,hr,caption,colgroup,[data-colwidth]');
        if (!width || unsupported || cells.some(row => row.length !== width || row.some(cell => cell.querySelectorAll('p').length > 1)) || cells[0].some(cell => cell.tagName !== 'TH')) {
          return `\n\n${node.outerHTML}\n\n`;
        }
        const lines = cells.map(row => '| ' + row.map(cell => Array.from(cell.childNodes).map(convert).join('').trim().replace(/\n+/g, ' ')).join(' | ') + ' |');
        lines.splice(1, 0, '| ' + Array(width).fill('---').join(' | ') + ' |');
        return '\n\n' + lines.join('\n') + '\n\n';
      }
      case 'PRE': {
        const code = node.textContent || '';
        const fence = '`'.repeat(Math.max(3, ...(code.match(/`+/g) || []).map(run => run.length + 1)));
        return `\n\n${fence}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
      }
      case 'CODE': {
        const code = node.textContent || '';
        const fence = '`'.repeat(Math.max(1, ...(code.match(/`+/g) || []).map(run => run.length + 1)));
        const pad = /^[` ]|[` ]$/.test(code) ? ' ' : '';
        return `${fence}${pad}${code}${pad}${fence}`;
      }

      case 'UL': case 'OL': {
        return Array.from(node.children).map((item, index) => {
          const body = Array.from(item.childNodes).map(convert).join('').trim();
          const prefix = node.tagName === 'OL' ? `${Number(node.getAttribute('start') || 1) + index}. ` : '- ';
          return prefix + body.split('\n').join('\n' + ' '.repeat(prefix.length));
        }).join('\n') + '\n\n';
      }
      case 'LI': return children();
      case 'P': return `${children()}\n\n`;
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': return `${'#'.repeat(Number(node.tagName[1]))} ${children()}\n\n`;
      case 'STRONG': case 'B': return `**${children()}**`;
      case 'EM': case 'I': return `*${children()}*`;
      case 'S': case 'DEL': return `~~${children()}~~`;
      case 'BR': return '  \n';
      case 'HR': return '\n\n---\n\n';
      case 'A': return `[${children()}](<${(node.getAttribute('href') || '').replace(/>/g, '%3E')}>)`;
      case 'BLOCKQUOTE': return children().trim().split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
      // Raw HTML is valid Markdown. Preserve complex structures rather than approximate them.
      default: return `\n\n${node.outerHTML}\n\n`;
    }
  };
  return Array.from(root.childNodes).map(node => {
    if (node instanceof HTMLElement && node.tagName !== 'TABLE' && node.querySelector('[style],[data-type],span,u,sup,sub,img')) return `\n\n${node.outerHTML}\n\n`;
    return convert(node);
  }).join('').trim();
}


/** Repair HTML saved by older conversions, without touching fenced or inline code examples. */
export function normalizeLiveMarkdown(source: string): string {
  const parts = markdownParts(source);
  let result = source;
  for (const part of parts.slice().reverse()) {
    const containsHtml = (tokens: any[]): boolean => tokens.some(token => token.type === 'html' ||
      (Array.isArray(token.tokens) && containsHtml(token.tokens)) ||
      (Array.isArray(token.items) && containsHtml(token.items)));
    if (part.type !== 'html' && !containsHtml(marked.lexer(part.raw))) continue;
    const converted = richHtmlToMarkdown(part.type === 'html' ? part.raw : part.html);
    if (converted !== part.raw) result = result.slice(0, part.from) + converted + result.slice(part.to);
  }
  return result;
}
