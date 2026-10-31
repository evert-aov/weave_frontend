export interface MarkdownSelection { from: number; to: number; }
export interface MarkdownEdit { from: number; to: number; insert: string; anchor: number; head: number; }
export type MarkdownFormat = 'bold' | 'italic' | 'strike' | 'code' | 'bullet' | 'ordered' | 'quote' | `h${number}`;

/** Source edits used by CodeMirror and the loading fallback; one edit = one undo step. */
export function formatMarkdown(source: string, selection: MarkdownSelection, format: MarkdownFormat): MarkdownEdit {
  const from = Math.max(0, Math.min(selection.from, source.length));
  const to = Math.max(from, Math.min(selection.to, source.length));
  const markers: Record<string, string> = { bold: '**', italic: '*', strike: '~~', code: '`' };
  const marker = markers[format];
  if (marker) {
    const selected = source.slice(from, to);
    if (from >= marker.length && source.slice(from - marker.length, from) === marker && source.slice(to, to + marker.length) === marker) {
      return { from: from - marker.length, to: to + marker.length, insert: selected, anchor: from - marker.length, head: to - marker.length };
    }
    if (selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
      const insert = selected.slice(marker.length, -marker.length);
      return { from, to, insert, anchor: from, head: from + insert.length };
    }
    const text = selected || 'texto';
    return { from, to, insert: marker + text + marker, anchor: from + marker.length, head: from + marker.length + text.length };
  }
  const start = from === 0 ? 0 : source.lastIndexOf('\n', from - 1) + 1;
  const last = to > from && source[to - 1] === '\n' ? to - 1 : to;
  const next = source.indexOf('\n', last);
  const end = next < 0 ? source.length : next;
  const lines = source.slice(start, end).split('\n');
  const pattern = format === 'quote' ? /^>\s?/ : format === 'bullet' ? /^[-+*]\s+/ : /^\d+\.\s+/;
  const remove = lines.every(line => pattern.test(line));
  const changed = lines.map((line, index) => {
    if (format.startsWith('h')) {
      const level = Math.max(0, Math.min(6, Number(format.slice(1)) || 0));
      return (level ? '#'.repeat(level) + ' ' : '') + line.replace(/^#{1,6}\s+/, '');
    }
    if (remove) return line.replace(pattern, '');
    const prefix = format === 'quote' ? '> ' : format === 'bullet' ? '- ' : `${index + 1}. `;
    return prefix + line.replace(format === 'quote' ? /^>\s?/ : /^(?:[-+*]|\d+\.)\s+/, '');
  });
  const insert = changed.join('\n');
  // A collapsed caret stays within the line; a selected range remains selected.
  const anchor = from === to ? start + Math.max(0, from - start + changed[0].length - lines[0].length) : start;
  return { from: start, to: end, insert, anchor, head: from === to ? anchor : start + insert.length };
}
