import {
  CanvasBounds,
  CanvasElement,
  getElementBounds,
  getElementsBounds,
} from './canvas-model';
import { BranchDirection, isConnectableShape } from './canvas-graph';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface RenderViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
  dark: boolean;
  gridEnabled: boolean;
}

export interface RenderOverlayState {
  selectedIds: ReadonlySet<string>;
  marquee?: { x1: number; y1: number; x2: number; y2: number } | null;
  editingElementId?: string | null;
  snapTargetId?: string | null;
  readOnly?: boolean;
}

const HANDLE_SIZE = 8;

export function screenToWorld(
  sx: number,
  sy: number,
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): { x: number; y: number } {
  return {
    x: sx / vp.zoom - vp.scrollX,
    y: sy / vp.zoom - vp.scrollY,
  };
}

export function worldToScreen(
  wx: number,
  wy: number,
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): { x: number; y: number } {
  return {
    x: (wx + vp.scrollX) * vp.zoom,
    y: (wy + vp.scrollY) * vp.zoom,
  };
}

function resolveStrokeColor(color: string, dark: boolean): string {
  if (!dark) return color;
  const norm = color.trim().toLowerCase();
  if (norm === '#1e293b' || norm === '#000000' || norm === '#0f172a' || norm === '#1e1e1e') {
    return '#e2e8f0';
  }
  return color;
}

function applyStrokeDash(ctx: CanvasRenderingContext2D, style: CanvasElement['strokeStyle'], width: number): void {
  if (style === 'dashed') {
    ctx.setLineDash([Math.max(8, width * 3.5), Math.max(5, width * 2.2)]);
  } else if (style === 'dotted') {
    ctx.setLineDash([Math.max(2, width), Math.max(4, width * 2)]);
  } else {
    ctx.setLineDash([]);
  }
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  dark: boolean,
  hideText = false,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, (el.opacity ?? 100) / 100));
  const stroke = resolveStrokeColor(el.strokeColor || '#1e293b', dark);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = el.backgroundColor || 'transparent';
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applyStrokeDash(ctx, el.strokeStyle, el.strokeWidth || 2);

  const hasFill = Boolean(el.backgroundColor && el.backgroundColor !== 'transparent');

  if (el.type === 'rectangle') {
    const b = getElementBounds(el);
    const r = Math.min(el.roundness ?? 8, b.width / 2, b.height / 2);
    ctx.beginPath();
    if (r > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(b.minX, b.minY, b.width, b.height, r);
    } else {
      ctx.rect(b.minX, b.minY, b.width, b.height);
    }
    if (hasFill) ctx.fill();
    ctx.stroke();
    if (!hideText && el.text) {
      drawCenteredLabel(ctx, el.text, b, stroke, el.fontSize || 16, el.fontFamily);
    }
  } else if (el.type === 'diamond') {
    const b = getElementBounds(el);
    const cx = b.minX + b.width / 2;
    const cy = b.minY + b.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx, b.minY);
    ctx.lineTo(b.maxX, cy);
    ctx.lineTo(cx, b.maxY);
    ctx.lineTo(b.minX, cy);
    ctx.closePath();
    if (hasFill) ctx.fill();
    ctx.stroke();
    if (!hideText && el.text) {
      drawCenteredLabel(ctx, el.text, b, stroke, el.fontSize || 16, el.fontFamily);
    }
  } else if (el.type === 'ellipse') {
    const b = getElementBounds(el);
    const cx = b.minX + b.width / 2;
    const cy = b.minY + b.height / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, b.width / 2), Math.max(0.5, b.height / 2), 0, 0, Math.PI * 2);
    if (hasFill) ctx.fill();
    ctx.stroke();
    if (!hideText && el.text) {
      drawCenteredLabel(ctx, el.text, b, stroke, el.fontSize || 16, el.fontFamily);
    }
  } else if (el.type === 'line' || el.type === 'arrow') {
    const pts = el.points && el.points.length >= 2 ? el.points : [[0, 0], [el.width, el.height]];
    ctx.beginPath();
    let angle = 0;
    const lastPt = pts[pts.length - 1];
    const endX = el.x + lastPt[0];
    const endY = el.y + lastPt[1];

    if (el.routing === 'curved' && pts.length === 3) {
      const x0 = el.x + pts[0][0];
      const y0 = el.y + pts[0][1];
      const cx = el.x + pts[1][0];
      const cy = el.y + pts[1][1];
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, endX, endY);
      angle = Math.atan2(endY - cy, endX - cx);
    } else if (el.routing === 'elbow' && pts.length >= 3) {
      ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const prevX = el.x + pts[i - 1][0];
        const prevY = el.y + pts[i - 1][1];
        const currX = el.x + pts[i][0];
        const currY = el.y + pts[i][1];
        const nextX = el.x + pts[i + 1][0];
        const nextY = el.y + pts[i + 1][1];
        const d1 = Math.hypot(currX - prevX, currY - prevY);
        const d2 = Math.hypot(nextX - currX, nextY - currY);
        const radius = Math.min(12, d1 / 2, d2 / 2);
        if (radius > 1) {
          ctx.arcTo(currX, currY, nextX, nextY, radius);
        } else {
          ctx.lineTo(currX, currY);
        }
      }
      ctx.lineTo(endX, endY);
      const prev = pts[pts.length - 2];
      angle = Math.atan2(lastPt[1] - prev[1], lastPt[0] - prev[0]);
    } else {
      ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(el.x + pts[i][0], el.y + pts[i][1]);
      }
      const prev = pts[pts.length - 2];
      angle = Math.atan2(lastPt[1] - prev[1], lastPt[0] - prev[0]);
    }
    ctx.stroke();

    if (el.type === 'arrow' && pts.length >= 2) {
      const headLen = Math.max(10, (el.strokeWidth || 2) * 4.2);
      const spread = Math.PI / 6.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle - spread), endY - headLen * Math.sin(angle - spread));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle + spread), endY - headLen * Math.sin(angle + spread));
      ctx.stroke();
    }
  } else if (el.type === 'freedraw') {
    const pts = el.points;
    if (pts && pts.length > 0) {
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.fillStyle = stroke;
        ctx.arc(el.x + pts[0][0], el.y + pts[0][1], Math.max(1, (el.strokeWidth || 2) / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = el.x + (pts[i][0] + pts[i + 1][0]) / 2;
          const midY = el.y + (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(el.x + pts[i][0], el.y + pts[i][1], midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(el.x + last[0], el.y + last[1]);
        ctx.stroke();
      }
    }
  } else if (el.type === 'text' && !hideText) {
    const fontSize = el.fontSize || 18;
    const fontFamily = el.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
    ctx.setLineDash([]);
    ctx.font = `500 ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = stroke;
    ctx.textBaseline = 'top';
    ctx.textAlign = el.textAlign || 'left';
    const lines = (el.text || '').split('\n');
    const lineHeight = fontSize * 1.35;
    const anchorX =
      el.textAlign === 'center'
        ? el.x + el.width / 2
        : el.textAlign === 'right'
          ? el.x + el.width
          : el.x;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], anchorX, el.y + i * lineHeight);
    }
  }

  ctx.restore();
}

function drawCenteredLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  bounds: CanvasBounds,
  color: string,
  fontSize: number,
  fontFamily?: string,
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `500 ${fontSize}px ${fontFamily || 'Inter, system-ui, -apple-system, sans-serif'}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const cx = bounds.minX + bounds.width / 2;
  const startY = bounds.minY + bounds.height / 2 - totalHeight / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, startY + i * lineHeight, Math.max(20, bounds.width - 16));
  }
  ctx.restore();
}

export function renderCanvasScene(
  canvas: HTMLCanvasElement,
  elements: readonly CanvasElement[],
  vp: RenderViewport,
  overlay: RenderOverlayState,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || vp.width <= 0 || vp.height <= 0) return;

  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const targetW = Math.round(vp.width * dpr);
  const targetH = Math.round(vp.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = vp.dark ? '#14151a' : '#ffffff';
  ctx.fillRect(0, 0, vp.width, vp.height);

  if (vp.gridEnabled) {
    drawDotGrid(ctx, vp);
  }

  ctx.save();
  ctx.scale(vp.zoom, vp.zoom);
  ctx.translate(vp.scrollX, vp.scrollY);

  for (const el of elements) {
    drawElement(ctx, el, vp.dark, overlay.editingElementId === el.id);
  }

  ctx.restore();

  // Highlight snap target when connecting an arrow to a node
  if (overlay.snapTargetId) {
    const snapEl = elements.find((el) => el.id === overlay.snapTargetId);
    if (snapEl) {
      const sb = getElementBounds(snapEl);
      const tl = worldToScreen(sb.minX, sb.minY, vp);
      const br = worldToScreen(sb.maxX, sb.maxY, vp);
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(tl.x - 8, tl.y - 8, br.x - tl.x + 16, br.y - tl.y + 16);
      ctx.strokeRect(tl.x - 8, tl.y - 8, br.x - tl.x + 16, br.y - tl.y + 16);
      ctx.restore();
    }
  }

  // Selection overlays in screen space for crisp 1px lines regardless of zoom
  const selectedElements = elements.filter((el) => overlay.selectedIds.has(el.id));
  if (selectedElements.length > 0) {
    const selBounds = getElementsBounds(selectedElements);
    if (selBounds) {
      const singleConnectable =
        selectedElements.length === 1 && !overlay.readOnly && isConnectableShape(selectedElements[0]);
      drawSelectionOverlay(ctx, selBounds, vp, selectedElements.length === 1, singleConnectable);
    }
  }

  if (overlay.marquee) {
    const p1 = worldToScreen(overlay.marquee.x1, overlay.marquee.y1, vp);
    const p2 = worldToScreen(overlay.marquee.x2, overlay.marquee.y2, vp);
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.10)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
}

function drawDotGrid(ctx: CanvasRenderingContext2D, vp: RenderViewport): void {
  const baseStep = 24;
  let step = baseStep * vp.zoom;
  while (step < 14) step *= 2;
  while (step > 56) step /= 2;

  const offsetX = ((vp.scrollX * vp.zoom) % step + step) % step;
  const offsetY = ((vp.scrollY * vp.zoom) % step + step) % step;

  ctx.save();
  ctx.fillStyle = vp.dark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(100, 116, 139, 0.24)';
  for (let x = offsetX; x < vp.width; x += step) {
    for (let y = offsetY; y < vp.height; y += step) {
      ctx.fillRect(Math.round(x), Math.round(y), 1.5, 1.5);
    }
  }
  ctx.restore();
}

export function getSelectionHandleCoords(
  bounds: CanvasBounds,
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): Record<ResizeHandle, { x: number; y: number }> {
  const tl = worldToScreen(bounds.minX, bounds.minY, vp);
  const br = worldToScreen(bounds.maxX, bounds.maxY, vp);
  const pad = 6;
  const x1 = tl.x - pad;
  const y1 = tl.y - pad;
  const x2 = br.x + pad;
  const y2 = br.y + pad;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  return {
    nw: { x: x1, y: y1 },
    n: { x: mx, y: y1 },
    ne: { x: x2, y: y1 },
    e: { x: x2, y: my },
    se: { x: x2, y: y2 },
    s: { x: mx, y: y2 },
    sw: { x: x1, y: y2 },
    w: { x: x1, y: my },
  };
}

export function getBranchHandleCoords(
  bounds: CanvasBounds,
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): Record<BranchDirection, { x: number; y: number }> {
  const tl = worldToScreen(bounds.minX, bounds.minY, vp);
  const br = worldToScreen(bounds.maxX, bounds.maxY, vp);
  const offset = 24;
  const mx = (tl.x + br.x) / 2;
  const my = (tl.y + br.y) / 2;
  return {
    up: { x: mx, y: tl.y - offset },
    right: { x: br.x + offset, y: my },
    down: { x: mx, y: br.y + offset },
    left: { x: tl.x - offset, y: my },
  };
}

export function hitTestBranchHandle(
  sx: number,
  sy: number,
  selectedElements: readonly CanvasElement[],
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): BranchDirection | null {
  if (selectedElements.length !== 1 || !isConnectableShape(selectedElements[0])) return null;
  const bounds = getElementBounds(selectedElements[0]);
  const coords = getBranchHandleCoords(bounds, vp);
  for (const [dir, pt] of Object.entries(coords) as [BranchDirection, { x: number; y: number }][]) {
    if (Math.hypot(sx - pt.x, sy - pt.y) <= 11) {
      return dir;
    }
  }
  return null;
}

function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  bounds: CanvasBounds,
  vp: RenderViewport,
  showHandles: boolean,
  showBranchHandles = false,
): void {
  const tl = worldToScreen(bounds.minX, bounds.minY, vp);
  const br = worldToScreen(bounds.maxX, bounds.maxY, vp);
  const pad = 6;
  const x = tl.x - pad;
  const y = tl.y - pad;
  const w = br.x - tl.x + pad * 2;
  const h = br.y - tl.y + pad * 2;

  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x, y, w, h);

  if (showHandles) {
    const handles = getSelectionHandleCoords(bounds, vp);
    const half = HANDLE_SIZE / 2;
    ctx.fillStyle = vp.dark ? '#1e293b' : '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    for (const pt of Object.values(handles)) {
      ctx.beginPath();
      ctx.rect(pt.x - half, pt.y - half, HANDLE_SIZE, HANDLE_SIZE);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (showBranchHandles) {
    const branchCoords = getBranchHandleCoords(bounds, vp);
    for (const pt of Object.values(branchCoords)) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = vp.dark ? '#1e293b' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // "+" icon inside circle
      ctx.beginPath();
      ctx.moveTo(pt.x - 4, pt.y);
      ctx.lineTo(pt.x + 4, pt.y);
      ctx.moveTo(pt.x, pt.y - 4);
      ctx.lineTo(pt.x, pt.y + 4);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function hitTestResizeHandle(
  sx: number,
  sy: number,
  selectedElements: readonly CanvasElement[],
  vp: Pick<RenderViewport, 'scrollX' | 'scrollY' | 'zoom'>,
): ResizeHandle | null {
  if (selectedElements.length !== 1) return null;
  const bounds = getElementBounds(selectedElements[0]);
  const handles = getSelectionHandleCoords(bounds, vp);
  const hitRadius = HANDLE_SIZE + 2;
  for (const [key, pt] of Object.entries(handles) as [ResizeHandle, { x: number; y: number }][]) {
    if (Math.abs(sx - pt.x) <= hitRadius && Math.abs(sy - pt.y) <= hitRadius) {
      return key;
    }
  }
  return null;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitTestElement(
  wx: number,
  wy: number,
  elements: readonly CanvasElement[],
  zoom: number,
): CanvasElement | null {
  const tolerance = Math.max(6, 10 / zoom);
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') {
      const pts = el.points && el.points.length >= 2 ? el.points : [[0, 0], [el.width, el.height]];
      const threshold = tolerance + (el.strokeWidth || 2) / 2;
      for (let j = 0; j < pts.length - 1; j++) {
        const d = distanceToSegment(
          wx,
          wy,
          el.x + pts[j][0],
          el.y + pts[j][1],
          el.x + pts[j + 1][0],
          el.y + pts[j + 1][1],
        );
        if (d <= threshold) return el;
      }
      if (pts.length === 1 && Math.hypot(wx - (el.x + pts[0][0]), wy - (el.y + pts[0][1])) <= threshold) {
        return el;
      }
      continue;
    }

    const b = getElementBounds(el);
    if (
      wx >= b.minX - tolerance &&
      wx <= b.maxX + tolerance &&
      wy >= b.minY - tolerance &&
      wy <= b.maxY + tolerance
    ) {
      if (el.type === 'text') return el;
      const hasFill = Boolean(el.backgroundColor && el.backgroundColor !== 'transparent');
      if (hasFill || el.text) return el;
      // Also allow clicking inside small shapes or near border
      if (b.width <= 48 || b.height <= 48) return el;
      const nearBorder =
        Math.abs(wx - b.minX) <= tolerance ||
        Math.abs(wx - b.maxX) <= tolerance ||
        Math.abs(wy - b.minY) <= tolerance ||
        Math.abs(wy - b.maxY) <= tolerance;
      if (el.type === 'rectangle' && nearBorder) return el;
      if (el.type === 'ellipse') {
        const rx = b.width / 2;
        const ry = b.height / 2;
        const nx = (wx - (b.minX + rx)) / Math.max(1, rx);
        const ny = (wy - (b.minY + ry)) / Math.max(1, ry);
        const dist = Math.hypot(nx, ny);
        if (Math.abs(dist - 1) <= tolerance / Math.min(rx, ry) + 0.15) return el;
      }
      if (el.type === 'diamond') {
        const cx = b.minX + b.width / 2;
        const cy = b.minY + b.height / 2;
        const norm = Math.abs(wx - cx) / Math.max(1, b.width / 2) + Math.abs(wy - cy) / Math.max(1, b.height / 2);
        if (Math.abs(norm - 1) <= 0.25) return el;
      }
      // Fallback: allow clicking interior of shapes so moving them feels effortless
      return el;
    }
  }
  return null;
}

export function elementsInBox(
  elements: readonly CanvasElement[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CanvasElement[] {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2);
  const maxY = Math.max(y1, y2);
  return elements.filter((el) => {
    const b = getElementBounds(el);
    return b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
  });
}

export function exportSceneToPngDataUrl(
  elements: readonly CanvasElement[],
  dark: boolean,
  padding = 32,
): string | null {
  const bounds = getElementsBounds(elements);
  if (!bounds) return null;

  const w = Math.ceil(bounds.width + padding * 2);
  const h = Math.ceil(bounds.height + padding * 2);
  const scale = 2;
  const offscreen = document.createElement('canvas');
  offscreen.width = w * scale;
  offscreen.height = h * scale;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.fillStyle = dark ? '#14151a' : '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(-bounds.minX + padding, -bounds.minY + padding);
  for (const el of elements) {
    drawElement(ctx, el, dark, false);
  }
  return offscreen.toDataURL('image/png');
}
