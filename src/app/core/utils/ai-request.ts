export const AI_REQUEST_LIMITS = {
  message: 12_000,
  document: 15_000,
  title: 500,
  docType: 100,
} as const;

/** Bound before serializing JSON; binary attachments never belong in a text prompt. */
export function boundedAiText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || limit <= 0) return '';
  let text = value.slice(0, limit).replace(
    /data:[^,\s"'<>]*;base64,[a-z0-9+/=_-]*/gi,
    '[contenido binario omitido]',
  ).slice(0, limit);
  if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text;
}

/** Skip tag attributes without constructing a DOM containing potentially huge base64 images. */
export function htmlToAiExcerpt(html: string, limit: number): { text: string; truncated: boolean } {
  let cursor = 0;
  let text = '';
  const decode = (value: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  };
  while (cursor < html.length && text.length < limit) {
    if (html[cursor] !== '<') {
      const nextTag = html.indexOf('<', cursor);
      const end = nextTag < 0 ? html.length : nextTag;
      const length = Math.min(end - cursor, limit - text.length);
      text += boundedAiText(decode(html.slice(cursor, cursor + length)), limit - text.length);
      cursor += length;
      continue;
    }
    if (html.startsWith('<!--', cursor)) {
      const end = html.indexOf('-->', cursor + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    const tag = html.slice(cursor, cursor + 100).match(/^<\/?([a-z][\w:-]*)\b/i);
    if (!tag) { text += '<'; cursor++; continue; }
    let end = cursor + tag[0].length;
    while (end < html.length && html[end] !== '>') {
      if (html[end] === '"' || html[end] === "'") {
        const quoteEnd = html.indexOf(html[end], end + 1);
        end = quoteEnd < 0 ? html.length : quoteEnd + 1;
      } else end++;
    }
    cursor = Math.min(end + 1, html.length);
    const name = tag[1].toLowerCase();
    if (!tag[0].startsWith('</') && /^(script|style|svg|noscript|template)$/.test(name)) {
      const closing = new RegExp(`</${name}\\s*>`, 'gi');
      closing.lastIndex = cursor;
      const match = closing.exec(html);
      cursor = match ? closing.lastIndex : html.length;
    } else if (/^(p|div|h[1-6]|li|tr|br|blockquote|pre)$/.test(name) && text && !text.endsWith('\n')) {
      text += '\n';
    }
  }
  return { text: boundedAiText(text, limit).trim(), truncated: cursor < html.length };
}

