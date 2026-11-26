const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'hr', 'br',
  'ul', 'ol', 'li',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'a', 'span',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'img',
]);

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'table', 'hr', 'div']);

const ALLOWED_BLOCK_STYLES = new Set([
  'text-align', 'vertical-align', 'line-height', 'margin-top', 'margin-bottom', 'margin-left', 'text-indent',
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'list-style-type',
  'text-decoration', 'text-decoration-line', 'text-transform', 'width',
  'border', 'border-collapse', 'border-style', 'border-width', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
]);

const SAFE_CLIPBOARD_TABLE_ATTRS = new Set([
  'data-apa-table',
  'data-word-table-style',
  'data-word-table-binding',
  'data-word-table-rule',
  'data-word-table-padding',
  'data-word-table-header-rows',
  'data-repeat-header',
  'data-word-top-border',
]);

const ALLOWED_INLINE_STYLES = new Set([
  'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'color', 'background-color', 'font-size', 'font-family',
]);

function filterCss(styleText: string | null, allowed: Set<string>, allowWhiteBg = false): string {
  if (!styleText) return '';
  const kept: string[] = [];
  for (const decl of styleText.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    let prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val || /url\s*\(|expression\s*\(/i.test(val)) continue;
    if (prop === 'background' && !/\b(?:no-repeat|repeat|center|cover|contain)\b/i.test(val)) {
      prop = 'background-color';
    }
    if (!allowed.has(prop)) continue;
    const lowerVal = val.toLowerCase();
    if (
      prop === 'background-color' &&
      (lowerVal === 'transparent' ||
        lowerVal === 'rgba(0, 0, 0, 0)' ||
        (!allowWhiteBg && (lowerVal === 'rgb(255, 255, 255)' || lowerVal === '#ffffff' || lowerVal === '#fff')))
    ) {
      continue;
    }
    if (prop === 'text-indent' && /^0(?:px|pt|em|rem|%)?$/i.test(lowerVal)) continue;
    if (prop === 'font-weight' && (lowerVal === 'normal' || lowerVal === '400')) continue;
    if (prop === 'font-style' && lowerVal === 'normal') continue;
    if ((prop === 'text-decoration' || prop === 'text-decoration-line') && lowerVal === 'none') continue;
    if (prop === 'list-style-type' && lowerVal === 'none') continue;
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
  return /<(?:p|br|h[1-6]|strong|b|em|i|u|s|strike|del|sub|sup|ul|ol|li|blockquote|code|pre|a|table)\b/i.test(html) ||
    /font-weight\s*:\s*(?:bold|[6-9]\d{2})|font-style\s*:\s*italic|text-decoration(?:-line)?\s*:\s*(?:underline|line-through)|(?:^|[;"'\s])(?:color|background-color|font-size|font-family|text-align)\s*:/i.test(html) ||
    (html.match(/<(?:p|div)\b/gi)?.length ?? 0) > 1;
}

const INLINE_CONTAINER_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'code', 'a',
]);

const STRUCTURAL_PARENT_TAGS = new Set(['ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup']);
const TRIM_BOUNDARY_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote']);

function trimBlockBoundaryNewlines(el: Element): void {
  const first = el.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    const trimmed = (first.textContent ?? '').replace(/^[ \t\r\n]+/, '');
    if (!trimmed) el.removeChild(first);
    else if (trimmed !== first.textContent) first.textContent = trimmed;
  }
  const last = el.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    const trimmed = (last.textContent ?? '').replace(/[ \t\r\n]+$/, '');
    if (!trimmed) el.removeChild(last);
    else if (trimmed !== last.textContent) last.textContent = trimmed;
  }
}

function normalizeMixedBlockSiblings(doc: Document, nodes: Node[]): Node[] {
  const isBlockNode = (n: Node): boolean =>
    n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as Element).tagName.toLowerCase());
  if (!nodes.some(isBlockNode)) return nodes;

  const out: Node[] = [];
  let inlineBuf: Node[] = [];
  const flushInline = () => {
    if (!inlineBuf.length) return;
    const hasMeaningful = inlineBuf.some(
      n =>
        (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0) ||
        (n.nodeType === Node.ELEMENT_NODE &&
          (['img', 'br'].includes((n as Element).tagName.toLowerCase()) ||
            ((n as Element).textContent ?? '').trim().length > 0)),
    );
    if (hasMeaningful) {
      const p = doc.createElement('p');
      inlineBuf.forEach(c => p.appendChild(c));
      trimBlockBoundaryNewlines(p);
      if ((p.textContent ?? '').trim() || p.querySelector('br, img')) {
        out.push(p);
      }
    }
    inlineBuf = [];
  };

  for (const n of nodes) {
    if (isBlockNode(n)) {
      flushInline();
      out.push(n);
    } else if (n.nodeType === Node.TEXT_NODE && !inlineBuf.length && /^[ \t\r\n]+$/.test(n.textContent ?? '')) {
      continue;
    } else {
      inlineBuf.push(n);
    }
  }
  flushInline();
  return out;
}

/**
 * Sanitiza y normaliza HTML proveniente de Google Docs, Word o navegadores
 * para que sea compatible con el modelo Canvas de Weave.
 */
export function sanitizeClipboardHtml(html: string): string | null {
  if (!html || !html.trim()) return null;
  // Quitar widgets inline de citas de IA (ej. Gemini) antes de DOMParser para evitar que un <div> interno cierre el <p> padre
  const preCleaned = html.replace(
    /<(sources-carousel-inline|source-footnote|source-inline-chips|source-inline-chip|sources-carousel|citation-marker|tts-control)\b[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  const doc = new DOMParser().parseFromString(preCleaned, 'text/html');
  doc
    .querySelectorAll('script, style, meta, link, title, head, noscript, iframe, object, embed, button, svg, input, select, textarea, template')
    .forEach(el => el.remove());

  const cleanChildrenWithParagraphBreaks = (childNodes: NodeListOf<ChildNode> | Node[], insideList: boolean, insideParagraph: boolean): Node[] => {
    const out: Node[] = [];
    const arr = Array.from(childNodes);
    for (let i = 0; i < arr.length; i++) {
      const child = arr[i];
      const isFlattenedBlock =
        (insideList || insideParagraph) &&
        child.nodeType === Node.ELEMENT_NODE &&
        ['p', 'div'].includes((child as Element).tagName.toLowerCase());
      const cleaned = cleanNode(child, insideList, insideParagraph);
      if (
        isFlattenedBlock &&
        cleaned.length > 0 &&
        out.length > 0 &&
        out.some(n => (n.textContent ?? '').trim().length > 0) &&
        cleaned.some(n => (n.textContent ?? '').trim().length > 0)
      ) {
        const lastOut = out[out.length - 1];
        if (!(lastOut.nodeType === Node.ELEMENT_NODE && (lastOut as Element).tagName.toLowerCase() === 'br')) {
          out.push(doc.createElement('br'));
        }
      }
      out.push(...cleaned);
    }
    return out;
  };

  const cleanNode = (node: Node, insideList = false, insideParagraph = false): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      return text ? [doc.createTextNode(text)] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Google Docs envuelve todo el fragmento en <b id="docs-internal-guid-..." style="font-weight:normal;">
    if (tag === 'b' && (el.id.startsWith('docs-internal-guid') || el.style.fontWeight === 'normal')) {
      return cleanChildrenWithParagraphBreaks(el.childNodes, insideList, insideParagraph);
    }

    // Google Docs / Gemini colocan <p> dentro de <li> o <blockquote>; lo aplanamos a contenido inline
    if ((insideList || insideParagraph) && (tag === 'p' || tag === 'div')) {
      const wrapper = doc.createElement('span');
      cleanChildrenWithParagraphBreaks(el.childNodes, insideList, true).forEach(c => wrapper.appendChild(c));
      trimBlockBoundaryNewlines(wrapper);
      return Array.from(wrapper.childNodes);
    }

    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer') {
      if (insideList || insideParagraph) {
        return cleanChildrenWithParagraphBreaks(el.childNodes, insideList, insideParagraph);
      }
      const hasBlockChildren = Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (hasBlockChildren) {
        return normalizeMixedBlockSiblings(doc, Array.from(el.childNodes).flatMap(c => cleanNode(c, insideList, false)));
      }
      const cleanedChildren = cleanChildrenWithParagraphBreaks(el.childNodes, insideList, true);
      const hasMeaningful = cleanedChildren.some(
        c => (c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim().length > 0) ||
          (c.nodeType === Node.ELEMENT_NODE && ['img', 'br', 'hr', 'table'].includes((c as Element).tagName.toLowerCase())) ||
          (c.nodeType === Node.ELEMENT_NODE && ((c as Element).textContent ?? '').trim().length > 0),
      );
      if (!hasMeaningful) return [];
      const p = doc.createElement('p');
      const style = filterCss(el.getAttribute('style'), ALLOWED_BLOCK_STYLES);
      if (style) p.setAttribute('style', style);
      cleanedChildren.forEach(c => p.appendChild(c));
      trimBlockBoundaryNewlines(p);
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
      cleanChildrenWithParagraphBreaks(el.childNodes, insideList, true).forEach(c => span.appendChild(c));
      return span.childNodes.length ? [span] : [];
    }

    if (!ALLOWED_TAGS.has(tag)) {
      return cleanChildrenWithParagraphBreaks(el.childNodes, insideList, insideParagraph);
    }

    // Convertir <span style="vertical-align: super|sub"> de Google Docs en <sup>/<sub>
    if (tag === 'span') {
      const va = el.style.verticalAlign;
      if (va === 'super' || va === 'sub') {
        const subSup = doc.createElement(va === 'super' ? 'sup' : 'sub');
        cleanChildrenWithParagraphBreaks(el.childNodes, insideList, true).forEach(c => subSup.appendChild(c));
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
      if (colspan && /^\d+$/.test(colspan) && +colspan > 0) out.setAttribute('colspan', colspan);
      if (rowspan && /^\d+$/.test(rowspan) && +rowspan > 0) out.setAttribute('rowspan', rowspan);
      if (el.getAttribute('data-word-top-border') === 'true') out.setAttribute('data-word-top-border', 'true');
    } else if (tag === 'col' || tag === 'colgroup') {
      const span = el.getAttribute('span');
      if (span && /^\d+$/.test(span) && +span > 0) out.setAttribute('span', span);
    } else if (tag === 'table') {
      for (const attrName of SAFE_CLIPBOARD_TABLE_ATTRS) {
        const val = el.getAttribute(attrName);
        if (val !== null && !/[<>\\]/.test(val)) out.setAttribute(attrName, val);
      }
    }

    const isTableElement = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'col', 'colgroup'].includes(tag);
    const isBlock = BLOCK_TAGS.has(tag) || tag === 'li' || isTableElement;
    const extraDecls: string[] = [];
    if (isTableElement) {
      const legacyBg = el.getAttribute('bgcolor')?.trim();
      if (legacyBg && !/[<>\\()]/.test(legacyBg)) extraDecls.push(`background-color: ${legacyBg}`);
      const legacyAlign = el.getAttribute('align')?.trim().toLowerCase();
      if (legacyAlign && ['left', 'center', 'right', 'justify'].includes(legacyAlign)) extraDecls.push(`text-align: ${legacyAlign}`);
      const legacyValign = el.getAttribute('valign')?.trim().toLowerCase();
      if (legacyValign && ['top', 'middle', 'bottom'].includes(legacyValign)) extraDecls.push(`vertical-align: ${legacyValign}`);
      const legacyWidth = el.getAttribute('width')?.trim();
      if (legacyWidth && (tag === 'col' || tag === 'td' || tag === 'th') && /^\d+(?:\.\d+)?(?:%|px|pt)?$/i.test(legacyWidth)) {
        extraDecls.push(`width: ${/^\d+(?:\.\d+)?$/.test(legacyWidth) ? `${legacyWidth}px` : legacyWidth}`);
      }
    }
    const mergedRawStyle = [extraDecls.join('; '), el.getAttribute('style') || ''].filter(Boolean).join('; ');
    const filteredStyle = filterCss(mergedRawStyle, isBlock ? ALLOWED_BLOCK_STYLES : ALLOWED_INLINE_STYLES, isTableElement);
    if (filteredStyle) out.setAttribute('style', filteredStyle);

    const nextInsideList = insideList || tag === 'li';
    const nextInsideParagraph = insideParagraph || INLINE_CONTAINER_TAGS.has(tag);
    const cleanedChildren = cleanChildrenWithParagraphBreaks(el.childNodes, nextInsideList, nextInsideParagraph);
    for (const c of cleanedChildren) {
      if (STRUCTURAL_PARENT_TAGS.has(tag) && c.nodeType === Node.TEXT_NODE && /^[ \t\r\n]+$/.test(c.textContent ?? '')) {
        continue;
      }
      out.appendChild(c);
    }

    if (TRIM_BOUNDARY_BLOCK_TAGS.has(tag)) {
      trimBlockBoundaryNewlines(out);
    }

    // Evitar <span> vacíos sin contenido, listas vacías y <p> vacíos residuales (sin texto, <br> ni <img>)
    if (tag === 'span' && !out.childNodes.length) return [];
    if ((tag === 'ul' || tag === 'ol') && !out.children.length) return [];
    if (tag === 'p' && !(out.textContent ?? '').trim() && !out.querySelector('br, img, hr, table')) return [];
    return [out];
  };

  const container = doc.createElement('div');
  const rootNodes = normalizeMixedBlockSiblings(
    doc,
    Array.from(doc.body.childNodes).flatMap(c => cleanNode(c, false, false)),
  );
  rootNodes.forEach(c => container.appendChild(c));
  const result = container.innerHTML.trim();
  return result || null;
}
