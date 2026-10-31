/** Reconoce tablas del portapapeles sin interpretar párrafos normales como columnas. */
export function clipboardTableHtml(html: string, text: string): string | null {
  if (/<table[\s>]/i.test(html)) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    if (parsed.body.querySelector('table tr > td, table tr > th')) {
      return sanitizeTableFragment(parsed.body);
    }
  }
  // Un bloque de código copiado debe seguir siendo código, aunque contenga tabulaciones.
  if (/<(?:pre|code)[\s>]/i.test(html)) return null;
  const normalized = text.replace(/\r\n?/g, '\n');
  const grid = parseTabularText(normalized);
  if (grid) return renderTable(grid);
  return parseMarkdownTables(normalized);
}

function parseTabularText(text: string): string[][] | null {
  if (!text.includes('\t') || text.trimStart().startsWith('```')) return null;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closedQuote) {
      quoted = true;
    } else if (char === '\t' || char === '\n') {
      row.push(cell);
      cell = '';
      closedQuote = false;
      if (char === '\n') { rows.push(row); row = []; }
    } else {
      if (closedQuote) return null;
      cell += char;
    }
  }
  if (quoted) return null;
  if (cell || row.length || !text.endsWith('\n')) { row.push(cell); rows.push(row); }
  const columns = rows[0]?.length ?? 0;
  return columns >= 2 && rows.every((r) => r.length === columns) ? rows : null;
}

function pipeCells(line: string): string[] | null {
  const cells: string[] = [];
  const source = line.trim();
  let cell = '';
  let codeFence = '';
  let delimiters = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\' && (source[i + 1] === '|' || source[i + 1] === '\\')) {
      cell += source[++i];
    } else if (char === '`') {
      let fence = '`';
      while (source[i + 1] === '`') { fence += '`'; i++; }
      if (!codeFence) codeFence = fence;
      else if (codeFence === fence) codeFence = '';
      cell += fence;
    } else if (char === '|' && !codeFence) {
      cells.push(cell.trim()); cell = ''; delimiters++;
    } else cell += char;
  }
  cells.push(cell.trim());
  if (source.startsWith('|')) cells.shift();
  if (source.endsWith('|') && !cell) cells.pop();
  return delimiters && cells.length >= 2 ? cells : null;
}

function parseMarkdownTables(text: string): string | null {
  const lines = text.split('\n');
  const output: string[] = [];
  let found = false;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].trim().match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
    const header = !fence ? pipeCells(lines[i]) : null;
    const separator = header && i + 1 < lines.length ? pipeCells(lines[i + 1]) : null;
    if (header && separator?.length === header.length && separator.every((s) => /^:?-{3,}:?$/.test(s))) {
      const rows = [header];
      i++;
      while (i + 1 < lines.length) {
        const next = pipeCells(lines[i + 1]);
        if (!next || next.length !== header.length) break;
        rows.push(next); i++;
      }
      const alignments = separator.map((s) => s.endsWith(':') ? (s.startsWith(':') ? 'center' : 'right') : 'left');
      output.push(renderTable(rows, true, alignments));
      found = true;
    } else output.push(`<p>${escapedLines(lines[i]) || '<br>'}</p>`);
  }
  return found ? output.join('') : null;
}

function escapedLines(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function renderTable(rows: string[][], header = false, alignments: string[] = []): string {
  return '<table><tbody>' + rows.map((row, r) => '<tr>' + row.map((value, c) => {
    const tag = header && !r ? 'th' : 'td';
    const alignment = alignments[c] ? ` style="text-align:${alignments[c]}"` : '';
    return `<${tag}${alignment}><p>${escapedLines(value) || '<br>'}</p></${tag}>`;
  }).join('') + '</tr>').join('') + '</tbody></table>';
}

/** Conserva contenido y combinaciones de celdas; descarta scripts y metadatos del editor de origen. */
function sanitizeTableFragment(body: HTMLElement): string {
  const comments = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const discarded: Node[] = [];
  while (comments.nextNode()) discarded.push(comments.currentNode);
  discarded.forEach((node) => node.parentNode?.removeChild(node));
  body.querySelectorAll('script,style,iframe,object,embed,link,meta,template,svg,math,form,input,button').forEach((el) => el.remove());
  const allowed = new Set('table thead tbody tfoot tr th td colgroup col caption p div span br b strong i em u s strike sub sup h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code a img hr'.split(' '));
  const styles = new Set('color background-color font-size font-family font-weight font-style text-decoration text-align vertical-align border border-top border-bottom border-left border-right padding padding-left padding-right'.split(' '));
  for (const el of Array.from(body.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (!allowed.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    const cleanStyle = document.createElement('span').style;
    for (const property of Array.from((el as HTMLElement).style)) {
      const value = (el as HTMLElement).style.getPropertyValue(property);
      if (styles.has(property) && !/url\s*\(|expression\s*\(|[<>\\]/i.test(value)) cleanStyle.setProperty(property, value);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      const span = (tag === 'td' || tag === 'th') && (name === 'colspan' || name === 'rowspan');
      const url = (tag === 'a' && name === 'href') || (tag === 'img' && name === 'src');
      if (span && /^\d+$/.test(attr.value) && +attr.value > 0 && +attr.value <= 1000) continue;
      if (url && /^(https?:\/\/|\/[^/]|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(attr.value)) continue;
      if ((name === 'alt' && tag === 'img') || (name === 'start' && tag === 'ol' && /^\d+$/.test(attr.value))) continue;
      el.removeAttribute(name);
    }
    if (tag === 'table') { cleanStyle.width = '100%'; cleanStyle.tableLayout = 'fixed'; }
    if (cleanStyle.cssText) el.setAttribute('style', cleanStyle.cssText);
  }
  return body.innerHTML;
}
