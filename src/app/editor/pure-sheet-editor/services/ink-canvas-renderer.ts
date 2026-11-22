import { InkPoint, InkStroke } from '../models/excel.model';

export interface InkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InkPaintParams {
  strokes: InkStroke[];
  draft: InkStroke | null;
  selectedIds: string[];
  selectionBounds: InkBounds | null;
  lasso: InkBounds | null;
  width: number;
  height: number;
  scrollLeft?: number;
  scrollTop?: number;
  dpr?: number;
  interactiveButtons?: boolean;
}

export function pointsBounds(points: InkPoint[]): InkBounds {
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function strokeBounds(stroke: InkStroke): InkBounds {
  return pointsBounds(stroke.points);
}

export function isStrokeInViewport(
  stroke: InkStroke,
  scrollLeft: number,
  scrollTop: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 24
): boolean {
  if (!stroke.points.length) return false;
  const pad = margin + stroke.strokeWidth;
  const b = strokeBounds(stroke);
  return (
    b.x + b.width + pad >= scrollLeft &&
    b.x - pad <= scrollLeft + viewportWidth &&
    b.y + b.height + pad >= scrollTop &&
    b.y - pad <= scrollTop + viewportHeight
  );
}

function pointToSegmentDistance(px: number, py: number, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
}

export function hitTestInkStroke(x: number, y: number, strokes: InkStroke[]): InkStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    const threshold = Math.max(8, stroke.strokeWidth / 2 + 4);
    if (stroke.points.length === 1) {
      if (Math.hypot(x - stroke.points[0].x, y - stroke.points[0].y) <= threshold) {
        return stroke;
      }
      continue;
    }
    for (let idx = 0; idx < stroke.points.length - 1; idx++) {
      if (pointToSegmentDistance(x, y, stroke.points[idx], stroke.points[idx + 1]) <= threshold) {
        return stroke;
      }
    }
  }
  return null;
}

export function hitTestInkSelection(
  x: number,
  y: number,
  bounds: InkBounds | null
): 'delete' | 'resize' | 'body' | null {
  if (!bounds) return null;
  // Delete button: (box.x + box.width - 17, box.y - 26, 22, 20)
  if (x >= bounds.x + bounds.width - 17 && x <= bounds.x + bounds.width + 5 && y >= bounds.y - 26 && y <= bounds.y - 6) {
    return 'delete';
  }
  // Resize circle: (box.x + box.width + 5, box.y + box.height + 5), r = 7 hit target
  const rx = bounds.x + bounds.width + 5;
  const ry = bounds.y + bounds.height + 5;
  if ((x - rx) * (x - rx) + (y - ry) * (y - ry) <= 64) {
    return 'resize';
  }
  if (x >= bounds.x - 5 && x <= bounds.x + bounds.width + 5 && y >= bounds.y - 5 && y <= bounds.y + bounds.height + 5) {
    return 'body';
  }
  return null;
}

function paintSingleStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke): void {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity ?? 1));
  ctx.lineWidth = Math.max(1, stroke.strokeWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.isGalaxy) {
    const b = strokeBounds(stroke);
    const grad = ctx.createLinearGradient(b.x, b.y, b.x + Math.max(24, b.width), b.y + b.height);
    grad.addColorStop(0, '#8b5cf6');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1, '#10b981');
    ctx.strokeStyle = grad;
  } else {
    ctx.strokeStyle = stroke.color || '#0f172a';
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y);
  } else {
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function paintInkCanvas(ctx: CanvasRenderingContext2D, params: InkPaintParams): void {
  const { strokes, draft, selectionBounds, lasso, width, height, scrollLeft = 0, scrollTop = 0, dpr = 1 } = params;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(-scrollLeft, -scrollTop);

  for (const stroke of strokes) {
    if (isStrokeInViewport(stroke, scrollLeft, scrollTop, width, height, 32)) {
      paintSingleStroke(ctx, stroke);
    }
  }
  if (draft) {
    paintSingleStroke(ctx, draft);
  }

  if (selectionBounds) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(
      selectionBounds.x - 5,
      selectionBounds.y - 5,
      selectionBounds.width + 10,
      selectionBounds.height + 10
    );
    ctx.restore();

    if (params.interactiveButtons !== false) {
      // Resize handle
      const hx = selectionBounds.x + selectionBounds.width + 5;
      const hy = selectionBounds.y + selectionBounds.height + 5;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Delete button
      const bx = selectionBounds.x + selectionBounds.width - 17;
      const by = selectionBounds.y - 26;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bx, by, 22, 20, 3);
      } else {
        ctx.rect(bx, by, 22, 20);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', bx + 11, by + 10);
    }
  }

  if (lasso) {
    ctx.save();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(lasso.x, lasso.y, lasso.width, lasso.height);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(lasso.x, lasso.y, lasso.width, lasso.height);
    ctx.restore();
  }

  ctx.restore();
}
