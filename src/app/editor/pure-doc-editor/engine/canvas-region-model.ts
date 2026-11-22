import type { RegionRichLine, RegionRichRun } from './canvas-page-renderer';

export interface RegionCaret {
  lineIndex: number;
  charOffset: number;
}

export interface RegionStyleState {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface RegionEditState {
  zone: 'header' | 'footer';
  pageIndex: number;
  lines: RegionRichLine[];
  cursor: RegionCaret;
  anchor: RegionCaret;
  activeStyle: RegionStyleState & { color: string };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function escapeHtmlAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sameRunStyle(a: RegionRichRun, b: RegionRichRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    (a.color || '') === (b.color || '')
  );
}

export function normalizeRuns(runs: readonly RegionRichRun[]): RegionRichRun[] {
  const out: RegionRichRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && sameRunStyle(prev, r)) {
      out[out.length - 1] = { ...prev, text: prev.text + r.text };
    } else {
      out.push({
        text: r.text,
        ...(r.bold ? { bold: true } : {}),
        ...(r.italic ? { italic: true } : {}),
        ...(r.underline ? { underline: true } : {}),
        ...(r.color ? { color: r.color } : {}),
      });
    }
  }
  return out;
}

/** Parses saved header/footer HTML markup directly into rich lines without DOM innerHTML. */
export function parseRegionHtmlToLines(html?: string): RegionRichLine[] {
  const raw = (html || '').trim();
  if (!raw) return [];

  const lines: RegionRichLine[] = [];
  let currentAlign: 'left' | 'center' | 'right' = 'left';
  let currentRuns: RegionRichRun[] = [];
  const styleStack: RegionStyleState[] = [{}];

  const pushLine = (nextAlign: 'left' | 'center' | 'right' = 'left') => {
    const normalized = normalizeRuns(currentRuns);
    if (normalized.length) {
      lines.push({ align: currentAlign, runs: normalized });
    }
    currentRuns = [];
    currentAlign = nextAlign;
  };

  const tokenRe = /<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(raw)) !== null) {
    const token = match[0];
    if (!token.startsWith('<')) {
      const top = styleStack[styleStack.length - 1] || {};
      const clean = decodeHtmlEntities(token).replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
      if (clean) {
        currentRuns.push({
          text: clean,
          ...(top.bold ? { bold: true } : {}),
          ...(top.italic ? { italic: true } : {}),
          ...(top.underline ? { underline: true } : {}),
          ...(top.color ? { color: top.color } : {}),
        });
      }
      continue;
    }

    const closing = /^<\/\s*([a-zA-Z0-9]+)/.exec(token);
    if (closing) {
      const tag = closing[1].toLowerCase();
      if (tag === 'p' || tag === 'div' || tag === 'blockquote' || /^h[1-6]$/.test(tag) || tag === 'li') {
        pushLine('left');
      }
      if (styleStack.length > 1) styleStack.pop();
      continue;
    }

    const opening = /^<\s*([a-zA-Z0-9]+)([\s\S]*?)\/?\s*>$/.exec(token);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const attrsRaw = opening[2] || '';
    const selfClosing = /\/\s*>$/.test(token) || tag === 'br';
    if (tag === 'script' || tag === 'style') continue;
    if (tag === 'br') {
      pushLine(currentAlign);
      continue;
    }

    const styleAttrMatch = attrsRaw.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const styleCss = styleAttrMatch ? (styleAttrMatch[1] ?? styleAttrMatch[2] ?? '') : '';
    const alignAttrMatch = attrsRaw.match(/\balign\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const cssAlign = styleCss.match(/text-align\s*:\s*(left|center|right)/i)?.[1]?.toLowerCase()
      || alignAttrMatch?.[1]?.toLowerCase()
      || alignAttrMatch?.[2]?.toLowerCase();
    const isBlock = tag === 'p' || tag === 'div' || tag === 'blockquote' || /^h[1-6]$/.test(tag) || tag === 'li';
    if (isBlock) {
      if (currentRuns.length) pushLine(currentAlign);
      currentAlign = cssAlign === 'center' || cssAlign === 'right' ? cssAlign : 'left';
    }

    const prevStyle = styleStack[styleStack.length - 1] || {};
    const fwMatch = styleCss.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() || '';
    const fsMatch = styleCss.match(/font-style\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() || '';
    const tdMatch = styleCss.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() || '';
    const colorCss = styleCss.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();
    const colorAttr = attrsRaw.match(/\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1];

    const nextStyle: RegionStyleState = {
      bold: prevStyle.bold || tag === 'b' || tag === 'strong' || fwMatch === 'bold' || Number(fwMatch) >= 600,
      italic: prevStyle.italic || tag === 'i' || tag === 'em' || fsMatch === 'italic',
      underline: prevStyle.underline || tag === 'u' || tdMatch.includes('underline'),
      color: colorCss || colorAttr || prevStyle.color,
    };

    if (!selfClosing) {
      styleStack.push(nextStyle);
    }
  }

  pushLine('left');
  return lines.filter((l) => l.runs.some((r) => r.text.trim().length > 0));
}

export function serializeRegionLinesToHtml(lines: readonly RegionRichLine[]): string {
  const nonEmpty = lines
    .map((line) => ({
      align: line.align || 'left',
      runs: normalizeRuns(line.runs),
    }))
    .filter((l) => l.runs.some((r) => r.text.trim().length > 0));

  if (!nonEmpty.length) return '';

  return nonEmpty
    .map((line) => {
      const body = line.runs
        .map((run) => {
          let out = escapeHtmlAttr(run.text);
          if (run.color) out = `<span style="color: ${escapeHtmlAttr(run.color)}">${out}</span>`;
          if (run.underline) out = `<u>${out}</u>`;
          if (run.italic) out = `<em>${out}</em>`;
          if (run.bold) out = `<strong>${out}</strong>`;
          return out;
        })
        .join('');
      const alignAttr = line.align && line.align !== 'left' ? ` style="text-align: ${line.align}"` : '';
      return `<p${alignAttr}>${body}</p>`;
    })
    .join('');
}

export function regionLinesPlainText(lines: readonly RegionRichLine[]): string {
  return lines
    .map((l) => l.runs.map((r) => r.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lineTextLength(line: RegionRichLine | undefined): number {
  if (!line) return 0;
  return line.runs.reduce((sum, r) => sum + r.text.length, 0);
}

export function createRegionEditState(
  zone: 'header' | 'footer',
  pageIndex: number,
  html?: string,
  defaultColor = '#334155',
): RegionEditState {
  const parsed = parseRegionHtmlToLines(html);
  const lines: RegionRichLine[] = parsed.length
    ? parsed.map((l) => ({ align: l.align || 'left', runs: [...l.runs] }))
    : [{ align: 'left', runs: [] }];
  const lastLine = Math.max(0, lines.length - 1);
  const endOffset = lineTextLength(lines[lastLine]);
  const firstRun = lines[0]?.runs[0];
  return {
    zone,
    pageIndex,
    lines,
    anchor: { lineIndex: 0, charOffset: 0 },
    cursor: { lineIndex: lastLine, charOffset: endOffset },
    activeStyle: {
      bold: firstRun?.bold,
      italic: firstRun?.italic,
      underline: firstRun?.underline,
      color: firstRun?.color || defaultColor,
    },
  };
}

function compareCarets(a: RegionCaret, b: RegionCaret): number {
  if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
  return a.charOffset - b.charOffset;
}

export function normalizedRegionSelection(state: RegionEditState): { start: RegionCaret; end: RegionCaret; collapsed: boolean } {
  const cmp = compareCarets(state.anchor, state.cursor);
  if (cmp === 0) return { start: state.anchor, end: state.cursor, collapsed: true };
  return cmp < 0
    ? { start: state.anchor, end: state.cursor, collapsed: false }
    : { start: state.cursor, end: state.anchor, collapsed: false };
}

function sliceLineRuns(runs: readonly RegionRichRun[], from: number, to: number): RegionRichRun[] {
  if (from >= to) return [];
  const out: RegionRichRun[] = [];
  let offset = 0;
  for (const r of runs) {
    const end = offset + r.text.length;
    const overlapStart = Math.max(offset, from);
    const overlapEnd = Math.min(end, to);
    if (overlapEnd > overlapStart) {
      out.push({
        ...r,
        text: r.text.slice(overlapStart - offset, overlapEnd - offset),
      });
    }
    offset = end;
  }
  return normalizeRuns(out);
}

function removeSelectedRange(state: RegionEditState): RegionEditState {
  const sel = normalizedRegionSelection(state);
  if (sel.collapsed) return state;
  const lines = state.lines.map((l) => ({ ...l, runs: [...l.runs] }));
  const startLine = lines[sel.start.lineIndex] || { align: 'left' as const, runs: [] };
  const endLine = lines[sel.end.lineIndex] || startLine;
  const prefix = sliceLineRuns(startLine.runs, 0, sel.start.charOffset);
  const suffix = sliceLineRuns(endLine.runs, sel.end.charOffset, lineTextLength(endLine));
  lines.splice(sel.start.lineIndex, sel.end.lineIndex - sel.start.lineIndex + 1, {
    align: startLine.align || 'left',
    runs: normalizeRuns([...prefix, ...suffix]),
  });
  return {
    ...state,
    lines,
    anchor: sel.start,
    cursor: sel.start,
  };
}

export function insertRegionText(state: RegionEditState, text: string): RegionEditState {
  if (!text) return state;
  const clean = text.replace(/\r/g, '');
  if (clean.includes('\n')) {
    const parts = clean.split('\n');
    let next = insertRegionText(state, parts[0]);
    for (let i = 1; i < parts.length; i++) {
      next = splitRegionLine(next);
      next = insertRegionText(next, parts[i]);
    }
    return next;
  }

  const base = removeSelectedRange(state);
  const lines = base.lines.map((l) => ({ ...l, runs: [...l.runs] }));
  const lineIdx = Math.max(0, Math.min(lines.length - 1, base.cursor.lineIndex));
  const line = lines[lineIdx] || { align: 'left' as const, runs: [] };
  const len = lineTextLength(line);
  const caret = Math.max(0, Math.min(len, base.cursor.charOffset));

  const newRun: RegionRichRun = {
    text: clean,
    ...(base.activeStyle.bold ? { bold: true } : {}),
    ...(base.activeStyle.italic ? { italic: true } : {}),
    ...(base.activeStyle.underline ? { underline: true } : {}),
    ...(base.activeStyle.color ? { color: base.activeStyle.color } : {}),
  };

  const prefix = sliceLineRuns(line.runs, 0, caret);
  const suffix = sliceLineRuns(line.runs, caret, len);
  lines[lineIdx] = {
    align: line.align || 'left',
    runs: normalizeRuns([...prefix, newRun, ...suffix]),
  };
  const nextCaret: RegionCaret = { lineIndex: lineIdx, charOffset: caret + clean.length };
  return { ...base, lines, anchor: nextCaret, cursor: nextCaret };
}

export function splitRegionLine(state: RegionEditState): RegionEditState {
  const base = removeSelectedRange(state);
  if (base.lines.length >= 2) {
    // Keep headers/footers bounded cleanly to max 2 lines rendered on Canvas
    return base;
  }
  const lines = base.lines.map((l) => ({ ...l, runs: [...l.runs] }));
  const lineIdx = Math.max(0, Math.min(lines.length - 1, base.cursor.lineIndex));
  const line = lines[lineIdx] || { align: 'left' as const, runs: [] };
  const len = lineTextLength(line);
  const caret = Math.max(0, Math.min(len, base.cursor.charOffset));
  const firstRuns = sliceLineRuns(line.runs, 0, caret);
  const secondRuns = sliceLineRuns(line.runs, caret, len);

  lines.splice(
    lineIdx,
    1,
    { align: line.align || 'left', runs: firstRuns },
    { align: line.align || 'left', runs: secondRuns },
  );
  const nextCaret: RegionCaret = { lineIndex: lineIdx + 1, charOffset: 0 };
  return { ...base, lines, anchor: nextCaret, cursor: nextCaret };
}

export function deleteRegion(state: RegionEditState, backward: boolean): RegionEditState {
  const sel = normalizedRegionSelection(state);
  if (!sel.collapsed) {
    return removeSelectedRange(state);
  }
  const lines = state.lines.map((l) => ({ ...l, runs: [...l.runs] }));
  const lineIdx = Math.max(0, Math.min(lines.length - 1, state.cursor.lineIndex));
  const line = lines[lineIdx] || { align: 'left' as const, runs: [] };
  const len = lineTextLength(line);
  const caret = Math.max(0, Math.min(len, state.cursor.charOffset));

  if (backward) {
    if (caret > 0) {
      const nextRuns = normalizeRuns([
        ...sliceLineRuns(line.runs, 0, caret - 1),
        ...sliceLineRuns(line.runs, caret, len),
      ]);
      lines[lineIdx] = { align: line.align || 'left', runs: nextRuns };
      const nextCaret = { lineIndex: lineIdx, charOffset: caret - 1 };
      return { ...state, lines, anchor: nextCaret, cursor: nextCaret };
    }
    if (lineIdx > 0) {
      const prevLine = lines[lineIdx - 1];
      const prevLen = lineTextLength(prevLine);
      lines.splice(lineIdx - 1, 2, {
        align: prevLine.align || 'left',
        runs: normalizeRuns([...prevLine.runs, ...line.runs]),
      });
      const nextCaret = { lineIndex: lineIdx - 1, charOffset: prevLen };
      return { ...state, lines, anchor: nextCaret, cursor: nextCaret };
    }
    return state;
  }

  if (caret < len) {
    const nextRuns = normalizeRuns([
      ...sliceLineRuns(line.runs, 0, caret),
      ...sliceLineRuns(line.runs, caret + 1, len),
    ]);
    lines[lineIdx] = { align: line.align || 'left', runs: nextRuns };
    return { ...state, lines, anchor: state.cursor, cursor: state.cursor };
  }
  if (lineIdx + 1 < lines.length) {
    const nextLine = lines[lineIdx + 1];
    lines.splice(lineIdx, 2, {
      align: line.align || 'left',
      runs: normalizeRuns([...line.runs, ...nextLine.runs]),
    });
    return { ...state, lines, anchor: state.cursor, cursor: state.cursor };
  }
  return state;
}

export function selectAllRegion(state: RegionEditState): RegionEditState {
  const lastIdx = Math.max(0, state.lines.length - 1);
  const endOffset = lineTextLength(state.lines[lastIdx]);
  return {
    ...state,
    anchor: { lineIndex: 0, charOffset: 0 },
    cursor: { lineIndex: lastIdx, charOffset: endOffset },
  };
}

export function moveRegionCaret(
  state: RegionEditState,
  dir: 'left' | 'right' | 'up' | 'down' | 'home' | 'end',
  extend: boolean,
): RegionEditState {
  const lineIdx = Math.max(0, Math.min(state.lines.length - 1, state.cursor.lineIndex));
  const curLen = lineTextLength(state.lines[lineIdx]);
  let next: RegionCaret = { ...state.cursor };

  if (dir === 'left') {
    if (next.charOffset > 0) next.charOffset--;
    else if (next.lineIndex > 0) {
      next.lineIndex--;
      next.charOffset = lineTextLength(state.lines[next.lineIndex]);
    }
  } else if (dir === 'right') {
    if (next.charOffset < curLen) next.charOffset++;
    else if (next.lineIndex + 1 < state.lines.length) {
      next.lineIndex++;
      next.charOffset = 0;
    }
  } else if (dir === 'up') {
    if (next.lineIndex > 0) {
      next.lineIndex--;
      next.charOffset = Math.min(next.charOffset, lineTextLength(state.lines[next.lineIndex]));
    }
  } else if (dir === 'down') {
    if (next.lineIndex + 1 < state.lines.length) {
      next.lineIndex++;
      next.charOffset = Math.min(next.charOffset, lineTextLength(state.lines[next.lineIndex]));
    }
  } else if (dir === 'home') {
    next.charOffset = 0;
  } else if (dir === 'end') {
    next.charOffset = curLen;
  }

  return {
    ...state,
    cursor: next,
    anchor: extend ? state.anchor : next,
  };
}

function applyRunTransformOverRange(
  state: RegionEditState,
  transform: (run: RegionRichRun) => RegionRichRun,
): RegionEditState {
  const sel = normalizedRegionSelection(state);
  const hasAnyText = state.lines.some((l) => l.runs.some((r) => r.text.length > 0));
  if (!hasAnyText) return state;

  const effectiveSel = sel.collapsed
    ? {
        start: { lineIndex: 0, charOffset: 0 },
        end: {
          lineIndex: state.lines.length - 1,
          charOffset: lineTextLength(state.lines[state.lines.length - 1]),
        },
      }
    : sel;

  const lines = state.lines.map((line, idx) => {
    if (idx < effectiveSel.start.lineIndex || idx > effectiveSel.end.lineIndex) {
      return line;
    }
    const len = lineTextLength(line);
    const from = idx === effectiveSel.start.lineIndex ? effectiveSel.start.charOffset : 0;
    const to = idx === effectiveSel.end.lineIndex ? effectiveSel.end.charOffset : len;
    if (from >= to) return line;
    const before = sliceLineRuns(line.runs, 0, from);
    const middle = sliceLineRuns(line.runs, from, to).map(transform);
    const after = sliceLineRuns(line.runs, to, len);
    return {
      ...line,
      runs: normalizeRuns([...before, ...middle, ...after]),
    };
  });
  return { ...state, lines };
}

export function toggleRegionStyle(
  state: RegionEditState,
  prop: 'bold' | 'italic' | 'underline',
): RegionEditState {
  const nextFlag = !state.activeStyle[prop];
  const withActive: RegionEditState = {
    ...state,
    activeStyle: {
      ...state.activeStyle,
      [prop]: nextFlag,
    },
  };
  return applyRunTransformOverRange(withActive, (run) => {
    const updated: RegionRichRun = { ...run };
    if (nextFlag) updated[prop] = true;
    else delete updated[prop];
    return updated;
  });
}

export function applyRegionRunColor(state: RegionEditState, color: string): RegionEditState {
  const withActive: RegionEditState = {
    ...state,
    activeStyle: {
      ...state.activeStyle,
      color,
    },
  };
  return applyRunTransformOverRange(withActive, (run) => ({
    ...run,
    color,
  }));
}

export function setRegionAlignment(
  state: RegionEditState,
  align: 'left' | 'center' | 'right',
): RegionEditState {
  const sel = normalizedRegionSelection(state);
  const hasSelection = !sel.collapsed;
  const lines = state.lines.map((line, idx) => {
    if (!hasSelection || (idx >= sel.start.lineIndex && idx <= sel.end.lineIndex)) {
      return { ...line, align };
    }
    return line;
  });
  return { ...state, lines };
}
