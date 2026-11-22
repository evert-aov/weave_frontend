import { PageDisplayList, PageSelectionRect } from './canvas-page-renderer';
import { DocumentPosition, DocumentSelection } from './document-model';
import { hitTestPage } from './canvas-hit-test';

function compactCaret(
  x: number,
  command: Extract<PageDisplayList['commands'][number], { kind: 'text' }> & {
    source: NonNullable<Extract<PageDisplayList['commands'][number], { kind: 'text' }>['source']>;
  },
): NonNullable<PageDisplayList['caret']> {
  const rawTop = command.source.top;
  const rawHeight = command.source.height;
  const sizeMatch = command.font.match(/(\d+(?:\.\d+)?)px/);
  const fontPx = sizeMatch ? parseFloat(sizeMatch[1]) : 14.67;
  // Compact Word/Docs pipe: font cap-height proportion (~14-15.5px on 12pt body text), never bloated by line-height
  const caretH = Math.max(11, Math.round(fontPx * 0.95 * 100) / 100);
  const baseline = command.y;
  const top =
    baseline > rawTop && baseline <= rawTop + rawHeight + 4
      ? Math.max(rawTop, Math.min(rawTop + rawHeight - caretH, Math.round(baseline - caretH * 0.82)))
      : Math.round(rawTop + (rawHeight - caretH) / 2);
  return { x, top, height: caretH };
}

export function caretForPosition(page: PageDisplayList, position: DocumentPosition): PageDisplayList['caret'] {
  for (const command of page.commands) {
    if (command.kind === 'text' && command.source?.start.nodeId === position.nodeId && command.source.start.offset === position.offset) {
      return compactCaret(command.x, { ...command, source: command.source });
    }
  }
  for (const command of page.commands) {
    if (command.kind === 'text' && command.source?.end.nodeId === position.nodeId && command.source.end.offset === position.offset) {
      return compactCaret(command.x + command.source.width, { ...command, source: command.source });
    }
  }
  for (const command of page.commands) {
    if (
      command.kind === 'text' &&
      command.source &&
      command.source.start.nodeId === position.nodeId &&
      command.source.end.nodeId === position.nodeId &&
      position.offset > command.source.start.offset &&
      position.offset < command.source.end.offset
    ) {
      const span = command.source.end.offset - command.source.start.offset;
      const ratio = span > 0 ? (position.offset - command.source.start.offset) / span : 0;
      return compactCaret(command.x + command.source.width * ratio, { ...command, source: command.source });
    }
  }
  return undefined;
}

export function selectionRectsForRange(
  page: PageDisplayList,
  selection: DocumentSelection,
  leafOrder?: ReadonlyMap<string, number>,
): PageSelectionRect[] {
  if (selection.anchor.nodeId === selection.focus.nodeId && selection.anchor.offset === selection.focus.offset) {
    return [];
  }
  const sourced = page.commands.filter(
    (c): c is Extract<typeof page.commands[number], { kind: 'text' }> & { source: NonNullable<Extract<typeof page.commands[number], { kind: 'text' }>['source']> } =>
      c.kind === 'text' && !!c.source
  );
  if (!sourced.length) return [];

  const pushRect = (rects: PageSelectionRect[], x: number, top: number, width: number, height: number): void => {
    if (width <= 0 || height <= 0) return;
    const prev = rects.at(-1);
    if (
      prev &&
      Math.abs(prev.top - top) < 1.5 &&
      Math.abs(prev.height - height) < 1.5 &&
      x >= prev.x &&
      x <= prev.x + prev.width + 6
    ) {
      const right = Math.max(prev.x + prev.width, x + width);
      prev.width = right - prev.x;
    } else {
      rects.push({ x, top, width, height });
    }
  };

  // Document-order range intersection: works reliably across pages, tables, footnotes, trimmed/wrapped spaces, and empty nodes.
  if (leafOrder) {
    const aIdx = leafOrder.get(selection.anchor.nodeId);
    const fIdx = leafOrder.get(selection.focus.nodeId);
    if (aIdx !== undefined && fIdx !== undefined) {
      const aOrd = aIdx * 1e9 + selection.anchor.offset;
      const fOrd = fIdx * 1e9 + selection.focus.offset;
      const startOrd = Math.min(aOrd, fOrd);
      const endOrd = Math.max(aOrd, fOrd);
      if (startOrd === endOrd) return [];
      const rects: PageSelectionRect[] = [];
      for (const cmd of sourced) {
        if (!cmd.text || cmd.source.width <= 0 || cmd.source.height <= 0) continue;
        const sIdx = leafOrder.get(cmd.source.start.nodeId);
        const eIdx = leafOrder.get(cmd.source.end.nodeId);
        if (sIdx === undefined || eIdx === undefined) continue;
        const cmdStart = sIdx * 1e9 + cmd.source.start.offset;
        const cmdEnd = eIdx * 1e9 + cmd.source.end.offset;
        if (cmdEnd <= startOrd || cmdStart >= endOrd) continue;
        let x = cmd.x;
        let w = cmd.source.width;
        if (sIdx === eIdx && cmdEnd > cmdStart && (cmdStart < startOrd || cmdEnd > endOrd)) {
          const span = cmdEnd - cmdStart;
          const leftRatio = Math.max(0, (startOrd - cmdStart) / span);
          const rightRatio = Math.min(1, (endOrd - cmdStart) / span);
          x = cmd.x + w * leftRatio;
          w = w * Math.max(0, rightRatio - leftRatio);
        }
        pushRect(rects, x, cmd.source.top, w, cmd.source.height);
      }
      return rects;
    }
  }

  const locate = (pos: DocumentPosition): { cmdIndex: number; boundary: 'start' | 'end' } | null => {
    let lastMatchForNode = -1;
    for (let i = 0; i < sourced.length; i++) {
      const s = sourced[i].source;
      if (s.start.nodeId === pos.nodeId && s.start.offset === pos.offset) return { cmdIndex: i, boundary: 'start' };
      if (s.end.nodeId === pos.nodeId && s.end.offset === pos.offset) return { cmdIndex: i, boundary: 'end' };
      if (s.start.nodeId === pos.nodeId && pos.offset > s.start.offset && pos.offset < s.end.offset) {
        return { cmdIndex: i, boundary: 'start' };
      }
      if (s.end.nodeId === pos.nodeId && s.end.offset <= pos.offset) {
        lastMatchForNode = i;
      }
    }
    if (lastMatchForNode >= 0) return { cmdIndex: lastMatchForNode, boundary: 'end' };
    return null;
  };

  const aLoc = locate(selection.anchor);
  const fLoc = locate(selection.focus);
  if (!aLoc || !fLoc) return [];

  const aOrder = aLoc.cmdIndex * 2 + (aLoc.boundary === 'end' ? 1 : 0);
  const fOrder = fLoc.cmdIndex * 2 + (fLoc.boundary === 'end' ? 1 : 0);
  if (aOrder === fOrder) return [];

  const [startOrder, endOrder] = aOrder < fOrder ? [aOrder, fOrder] : [fOrder, aOrder];
  const firstIdx = Math.floor((startOrder + 1) / 2);
  const lastIdx = Math.floor((endOrder - 1) / 2);
  if (firstIdx > lastIdx) return [];

  const rects: PageSelectionRect[] = [];
  for (let i = firstIdx; i <= lastIdx; i++) {
    const cmd = sourced[i];
    if (!cmd.text || cmd.source.width <= 0 || cmd.source.height <= 0) continue;
    pushRect(rects, cmd.x, cmd.source.top, cmd.source.width, cmd.source.height);
  }
  return rects;
}

export function moveCaretVertically(
  page: PageDisplayList,
  position: DocumentPosition,
  direction: -1 | 1,
  preferredX?: number,
): { position: DocumentPosition; x: number } | null {
  const current = caretForPosition(page, position);
  if (!current) return null;
  const lines: { top: number; height: number }[] = [];
  for (const command of page.commands) {
    if (command.kind !== 'text' || !command.source) continue;
    const { top, height } = command.source;
    if (!lines.some(line => Math.abs(line.top - top) < 1)) {
      lines.push({ top, height });
    }
  }
  lines.sort((a, b) => a.top - b.top);
  const caretMid = current.top + current.height / 2;
  const currentIdx = lines.findIndex(
    line => Math.abs(line.top - current.top) < 1 || (caretMid >= line.top - 1 && caretMid <= line.top + line.height + 1),
  );
  if (currentIdx < 0) return null;
  const targetLine = lines[currentIdx + direction];
  if (!targetLine) return null;
  const targetX = preferredX ?? current.x;
  const nextPos = hitTestPage(page, targetX, targetLine.top + targetLine.height / 2);
  if (!nextPos) return null;
  return { position: nextPos, x: targetX };
}
