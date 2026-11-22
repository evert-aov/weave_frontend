import { PageDisplayList } from './canvas-page-renderer';
import { DocumentPosition, DocumentSelection } from './document-model';
/** Resolves an unzoomed page coordinate without reading DOM or native Selection. */
export function hitTestPage(page: PageDisplayList, x: number, y: number): DocumentPosition | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let closest: { position: DocumentPosition; vertical: number; horizontal: number } | undefined;
  for (const command of page.commands) {
    if (command.kind !== 'text' || !command.source) continue;
    const { source } = command;
    const vertical = Math.max(source.top - y, 0, y - source.top - source.height);
    const horizontal = Math.max(command.x - x, 0, x - command.x - source.width);
    const position = x < command.x + source.width / 2 ? source.start : source.end;
    if (!closest || vertical < closest.vertical || vertical === closest.vertical && horizontal < closest.horizontal) {
      closest = { position, vertical, horizontal };
    }
  }
  return closest?.position || null;
}

export function hitTestSelection(
  page: PageDisplayList,
  anchorPoint: { x: number; y: number },
  focusPoint: { x: number; y: number },
): DocumentSelection | null {
  const anchor = hitTestPage(page, anchorPoint.x, anchorPoint.y);
  const focus = hitTestPage(page, focusPoint.x, focusPoint.y);
  return anchor && focus ? { anchor, focus } : null;
}
