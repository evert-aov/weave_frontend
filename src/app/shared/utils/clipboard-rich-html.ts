const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'hr', 'br',
  'ul', 'ol', 'li',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'a', 'span',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'img',
]);

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'table', 'hr', 'div']);

const ALLOWED_BLOCK_STYLES = new Set([
  'text-align', 'line-height', 'margin-top', 'margin-bottom', 'margin-left', 'text-indent',
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'list-style-type',
]);

const ALLOWED_INLINE_STYLES = new Set([
  'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'color', 'background-color', 'font-size', 'font-family',
]);

function filterCss(styleText: string | null, allowed: Set<string>): string {
  if (!styleText) return '';
  const kept: string[] = [];
  for (const decl of styleText.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val || !allowed.has(prop)) continue;
    if (prop === 'background-color' && (val === 'transparent' || val === 'rgba(0, 0, 0, 0)')) continue;
    if (prop === 'font-weight' && (val === 'normal' || val === '400')) continue;
    if (prop === 'font-style' && val === 'normal') continue;
    if ((prop === 'text-decoration' || prop === 'text-decoration-line') && val === 'none') continue;
    kept.push(`${prop}: ${val}`);
  }
  return kept.join('; ');
}

function isSafeUrl(url: string, allowDataImage = false): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (allowDataImage && /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);/i.test(trimmed)) return true;
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(trimmed);
}

/** Determina si el HTML del portapapeles contiene formato enriquecido relevante (más allá de texto plano). */
export function hasRichClipboardFormatting(html: string): boolean {
  if (!html || !html.trim()) return false;
  return /<(?:h[1-6]|strong|b|em|i|u|s|strike|del|sub|sup|ul|ol|li|blockquote|code|pre|a|table)\b/i.test(html) ||
    /font-weight\s*:\s*(?:bold|[6-9]\d{2})|font-style\s*:\s*italic|text-decoration(?:-line)?\s*:\s*(?:underline|line-through)|(?:^|[;"'\s])(?:color|background-color|font-size|font-family|text-align)\s*:/i.test(html) ||
    (html.match(/<(?:p|div)\b/gi)?.length ?? 0) > 1;
}

/**
 * Sanitiza y normaliza HTML proveniente de Google Docs, Word o navegadores
 * para que sea compatible con el modelo Canvas de Weave.
 */
export function sanitizeClipboardHtml(html: string): string | null {
  if (!html || !html.trim()) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, meta, link, title, head, noscript, iframe, object, embed').forEach(el => el.remove());

  const cleanNode = (node: Node, insideList = false): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      return text ? [doc.createTextNode(text)] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Google Docs envuelve todo el fragmento en <b id="docs-internal-guid-..." style="font-weight:normal;">
    if (tag === 'b' && (el.id.startsWith('docs-internal-guid') || el.style.fontWeight === 'normal')) {
      return Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList));
    }

    // Google Docs coloca <p> dentro de <li>; lo aplanamos a contenido inline para el layout de listas
    if (insideList && (tag === 'p' || tag === 'div')) {
      const children = Array.from(el.childNodes).flatMap(c => cleanNode(c, true));
      return children;
    }

    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer') {
      const hasBlockChildren = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (hasBlockChildren) {
        return Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList));
      }
      const p = doc.createElement('p');
      const style = filterCss(el.getAttribute('style'), ALLOWED_BLOCK_STYLES);
      if (style) p.setAttribute('style', style);
      Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList)).forEach(c => p.appendChild(c));
      return [p];
    }

    if (tag === 'font') {
      const span = doc.createElement('span');
      const styles: string[] = [];
      const color = el.getAttribute('color');
      const face = el.getAttribute('face');
      if (color) styles.push(`color: ${color}`);
      if (face) styles.push(`font-family: ${face}`);
      if (styles.length) span.setAttribute('style', styles.join('; '));
      Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList)).forEach(c => span.appendChild(c));
      return span.childNodes.length ? [span] : [];
    }

    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList));
    }

    // Convertir <span style="vertical-align: super|sub"> de Google Docs en <sup>/<sub>
    if (tag === 'span') {
      const va = el.style.verticalAlign;
      if (va === 'super' || va === 'sub') {
        const subSup = doc.createElement(va === 'super' ? 'sup' : 'sub');
        Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList)).forEach(c => subSup.appendChild(c));
        return subSup.childNodes.length ? [subSup] : [];
      }
    }

    const out = doc.createElement(tag);
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      if (isSafeUrl(href)) out.setAttribute('href', href);
    } else if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (!isSafeUrl(src, true)) return [];
      out.setAttribute('src', src);
      if (el.getAttribute('width')) out.setAttribute('width', el.getAttribute('width')!);
      if (el.getAttribute('height')) out.setAttribute('height', el.getAttribute('height')!);
      if (el.getAttribute('alt')) out.setAttribute('alt', el.getAttribute('alt')!);
      return [out];
    } else if (tag === 'ol') {
      const start = el.getAttribute('start');
      if (start && /^\d+$/.test(start)) out.setAttribute('start', start);
    } else if (tag === 'td' || tag === 'th') {
      const colspan = el.getAttribute('colspan');
      const rowspan = el.getAttribute('rowspan');
      if (colspan && /^\d+$/.test(colspan)) out.setAttribute('colspan', colspan);
      if (rowspan && /^\d+$/.test(rowspan)) out.setAttribute('rowspan', rowspan);
    }

    const isBlock = BLOCK_TAGS.has(tag) || tag === 'li' || tag === 'td' || tag === 'th';
    const filteredStyle = filterCss(el.getAttribute('style'), isBlock ? ALLOWED_BLOCK_STYLES : ALLOWED_INLINE_STYLES);
    if (filteredStyle) out.setAttribute('style', filteredStyle);

    const nextInsideList = insideList || tag === 'li';
    const cleanedChildren = Array.from(el.childNodes).flatMap(c => cleanNode(c, nextInsideList));
    cleanedChildren.forEach(c => out.appendChild(c));

    // Evitar <span> vacíos sin atributos ni texto
    if (tag === 'span' && !out.getAttribute('style') && !out.childNodes.length) return [];
    return [out];
  };

  const container = doc.createElement('div');
  Array.from(doc.body.childNodes).flatMap(c => cleanNode(c, false)).forEach(c => container.appendChild(c));
  const result = container.innerHTML.trim();
  return result || null;
}
