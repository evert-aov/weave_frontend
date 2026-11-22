import { FloatingArtwork } from '../models/excel.model';
import { WORD_ICON_DEFINITIONS } from '../../pure-doc-editor/components/word-icons-modal/word-icons-modal.component';
import { SHAPE_ITEMS } from '../../pure-doc-editor/constants/word-insert.constants';

type SvgNodeTuple = [tag: string, attrs: Record<string, string>];

interface ParsedSvgElement {
  tag: string;
  attrs: Record<string, string>;
  textContent?: string;
}

const ICON_NODE_MAP = new Map<string, SvgNodeTuple[]>();
for (const def of WORD_ICON_DEFINITIONS) {
  const iconMeta = (def as unknown as { icon?: { name?: string; node?: SvgNodeTuple[] } }).icon;
  if (iconMeta?.name && Array.isArray(iconMeta.node)) {
    ICON_NODE_MAP.set(iconMeta.name, iconMeta.node);
  }
}

const SHAPE_CACHE = new Map<string, { viewBox: [number, number, number, number]; elements: ParsedSvgElement[] }>();
const IMAGE_CACHE = new Map<string, HTMLImageElement>();

function parseViewBox(raw?: string): [number, number, number, number] {
  if (!raw) return [0, 0, 24, 24];
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0) {
    return [nums[0], nums[1], nums[2], nums[3]];
  }
  return [0, 0, 24, 24];
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseSvgMarkup(svgInner: string): ParsedSvgElement[] {
  const elements: ParsedSvgElement[] = [];
  const tokenRegex = /<([a-zA-Z]+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(svgInner)) !== null) {
    elements.push({
      tag: match[1].toLowerCase(),
      attrs: parseAttributes(match[2] || ''),
      textContent: match[3] !== undefined ? match[3].trim() : undefined,
    });
  }
  return elements;
}

function getShapeDefinition(itemId: string) {
  let cached = SHAPE_CACHE.get(itemId);
  if (cached) return cached;
  const item = SHAPE_ITEMS.find((shape) => shape.id === itemId);
  if (!item) return null;
  cached = {
    viewBox: parseViewBox(item.viewBox),
    elements: parseSvgMarkup(item.svgInner),
  };
  SHAPE_CACHE.set(itemId, cached);
  return cached;
}

function arcToCubicBeziers(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number
): number[][] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [];

  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rxs = rx * rx;
  const rys = ry * ry;
  const num = Math.max(0, rxs * rys - rxs * y1pSq - rys * x1pSq);
  const den = rxs * y1pSq + rys * x1pSq;
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(den === 0 ? 0 : num / den);

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const vectorAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)) || 1;
    return sign * Math.acos(Math.max(-1, Math.min(1, dot / len)));
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = vectorAngle(1, 0, ux, uy);
  let dTheta = vectorAngle(ux, uy, vx, vy);
  if (!sweepFlag && dTheta > 0) dTheta -= Math.PI * 2;
  if (sweepFlag && dTheta < 0) dTheta += Math.PI * 2;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const curves: number[][] = [];

  for (let i = 0; i < segments; i++) {
    const t1 = theta1 + i * delta;
    const t2 = t1 + delta;
    const k = (4 / 3) * Math.tan((t2 - t1) / 4);

    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);

    const p1x = cos1 - k * sin1;
    const p1y = sin1 + k * cos1;
    const p2x = cos2 + k * sin2;
    const p2y = sin2 - k * cos2;

    const mapPt = (px: number, py: number): [number, number] => [
      cx + cosPhi * rx * px - sinPhi * ry * py,
      cy + sinPhi * rx * px + cosPhi * ry * py,
    ];
    const [c1x, c1y] = mapPt(p1x, p1y);
    const [c2x, c2y] = mapPt(p2x, p2y);
    const [ex, ey] = mapPt(cos2, sin2);
    curves.push([c1x, c1y, c2x, c2y, ex, ey]);
  }
  return curves;
}

function traceSvgPathD(ctx: CanvasRenderingContext2D, d: string): void {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return;

  ctx.beginPath();
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCx = 0;
  let lastCy = 0;
  let lastCmd = '';

  const nextNum = () => Number(tokens[i++]);
  const isCmd = (tok: string | undefined) => !!tok && /^[a-zA-Z]$/.test(tok);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i++];
    } else if (!cmd) {
      break;
    }

    switch (cmd) {
      case 'M':
      case 'm': {
        const rel = cmd === 'm';
        const nx = nextNum() + (rel ? cx : 0);
        const ny = nextNum() + (rel ? cy : 0);
        ctx.moveTo(nx, ny);
        cx = nx;
        cy = ny;
        sx = nx;
        sy = ny;
        cmd = rel ? 'l' : 'L';
        lastCmd = 'M';
        break;
      }
      case 'L':
      case 'l': {
        const rel = cmd === 'l';
        const nx = nextNum() + (rel ? cx : 0);
        const ny = nextNum() + (rel ? cy : 0);
        ctx.lineTo(nx, ny);
        cx = nx;
        cy = ny;
        lastCmd = 'L';
        break;
      }
      case 'H':
      case 'h': {
        const nx = nextNum() + (cmd === 'h' ? cx : 0);
        ctx.lineTo(nx, cy);
        cx = nx;
        lastCmd = 'L';
        break;
      }
      case 'V':
      case 'v': {
        const ny = nextNum() + (cmd === 'v' ? cy : 0);
        ctx.lineTo(cx, ny);
        cy = ny;
        lastCmd = 'L';
        break;
      }
      case 'C':
      case 'c': {
        const rel = cmd === 'c';
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const x1 = nextNum() + ox;
        const y1 = nextNum() + oy;
        const x2 = nextNum() + ox;
        const y2 = nextNum() + oy;
        const ex = nextNum() + ox;
        const ey = nextNum() + oy;
        ctx.bezierCurveTo(x1, y1, x2, y2, ex, ey);
        lastCx = x2;
        lastCy = y2;
        cx = ex;
        cy = ey;
        lastCmd = 'C';
        break;
      }
      case 'S':
      case 's': {
        const rel = cmd === 's';
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const x1 = lastCmd === 'C' || lastCmd === 'S' ? 2 * cx - lastCx : cx;
        const y1 = lastCmd === 'C' || lastCmd === 'S' ? 2 * cy - lastCy : cy;
        const x2 = nextNum() + ox;
        const y2 = nextNum() + oy;
        const ex = nextNum() + ox;
        const ey = nextNum() + oy;
        ctx.bezierCurveTo(x1, y1, x2, y2, ex, ey);
        lastCx = x2;
        lastCy = y2;
        cx = ex;
        cy = ey;
        lastCmd = 'S';
        break;
      }
      case 'Q':
      case 'q': {
        const rel = cmd === 'q';
        const ox = rel ? cx : 0;
        const oy = rel ? cy : 0;
        const x1 = nextNum() + ox;
        const y1 = nextNum() + oy;
        const ex = nextNum() + ox;
        const ey = nextNum() + oy;
        ctx.quadraticCurveTo(x1, y1, ex, ey);
        lastCx = x1;
        lastCy = y1;
        cx = ex;
        cy = ey;
        lastCmd = 'Q';
        break;
      }
      case 'T':
      case 't': {
        const rel = cmd === 't';
        const x1 = lastCmd === 'Q' || lastCmd === 'T' ? 2 * cx - lastCx : cx;
        const y1 = lastCmd === 'Q' || lastCmd === 'T' ? 2 * cy - lastCy : cy;
        const ex = nextNum() + (rel ? cx : 0);
        const ey = nextNum() + (rel ? cy : 0);
        ctx.quadraticCurveTo(x1, y1, ex, ey);
        lastCx = x1;
        lastCy = y1;
        cx = ex;
        cy = ey;
        lastCmd = 'T';
        break;
      }
      case 'A':
      case 'a': {
        const rel = cmd === 'a';
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const large = nextNum();
        const sweep = nextNum();
        const ex = nextNum() + (rel ? cx : 0);
        const ey = nextNum() + (rel ? cy : 0);
        const curves = arcToCubicBeziers(cx, cy, rx, ry, rot, large, sweep, ex, ey);
        if (curves.length === 0) {
          ctx.lineTo(ex, ey);
        } else {
          for (const [c1x, c1y, c2x, c2y, px, py] of curves) {
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, px, py);
          }
        }
        cx = ex;
        cy = ey;
        lastCmd = 'A';
        break;
      }
      case 'Z':
      case 'z': {
        ctx.closePath();
        cx = sx;
        cy = sy;
        lastCmd = 'Z';
        break;
      }
      default:
        i++;
        break;
    }
  }
}

function paintSvgPrimitive(
  ctx: CanvasRenderingContext2D,
  el: ParsedSvgElement,
  defaultColor: string,
  defaultStrokeWidth: number
): void {
  const { tag, attrs } = el;
  ctx.save();

  const opacity = Number(attrs['opacity'] ?? '1');
  if (Number.isFinite(opacity) && opacity < 1) {
    ctx.globalAlpha *= opacity;
  }

  if (attrs['stroke-dasharray']) {
    const dashes = attrs['stroke-dasharray'].split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (dashes.length && ctx.setLineDash) ctx.setLineDash(dashes);
  }

  ctx.lineCap = (attrs['stroke-linecap'] as CanvasLineCap) || 'round';
  ctx.lineJoin = (attrs['stroke-linejoin'] as CanvasLineJoin) || 'round';

  if (tag === 'text') {
    const tx = Number(attrs['x'] ?? 12);
    const ty = Number(attrs['y'] ?? 14);
    const fontSize = Number(attrs['font-size'] ?? 12);
    const weight = attrs['font-weight'] || '700';
    ctx.font = `${weight} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = attrs['fill'] || defaultColor;
    ctx.textAlign = attrs['text-anchor'] === 'middle' ? 'center' : attrs['text-anchor'] === 'end' ? 'right' : 'left';
    ctx.fillText(el.textContent || '', tx, ty);
    ctx.restore();
    return;
  }

  let hasPath = true;
  switch (tag) {
    case 'path':
      traceSvgPathD(ctx, attrs['d'] || '');
      break;
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(Number(attrs['x1'] ?? 0), Number(attrs['y1'] ?? 0));
      ctx.lineTo(Number(attrs['x2'] ?? 0), Number(attrs['y2'] ?? 0));
      break;
    }
    case 'rect': {
      const rx = Number(attrs['x'] ?? 0);
      const ry = Number(attrs['y'] ?? 0);
      const rw = Number(attrs['width'] ?? 0);
      const rh = Number(attrs['height'] ?? 0);
      const radius = Number(attrs['rx'] ?? attrs['ry'] ?? 0);
      ctx.beginPath();
      if (radius > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.rect(rx, ry, rw, rh);
      }
      break;
    }
    case 'circle': {
      ctx.beginPath();
      ctx.arc(Number(attrs['cx'] ?? 0), Number(attrs['cy'] ?? 0), Math.max(0, Number(attrs['r'] ?? 0)), 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(
        Number(attrs['cx'] ?? 0),
        Number(attrs['cy'] ?? 0),
        Math.max(0, Number(attrs['rx'] ?? 0)),
        Math.max(0, Number(attrs['ry'] ?? 0)),
        0,
        0,
        Math.PI * 2
      );
      break;
    }
    case 'polygon':
    case 'polyline': {
      const nums = (attrs['points'] || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (nums.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(nums[0], nums[1]);
        for (let idx = 2; idx + 1 < nums.length; idx += 2) {
          ctx.lineTo(nums[idx], nums[idx + 1]);
        }
        if (tag === 'polygon') ctx.closePath();
      } else {
        hasPath = false;
      }
      break;
    }
    default:
      hasPath = false;
      break;
  }

  if (hasPath) {
    const fill = attrs['fill'];
    if (fill && fill !== 'none') {
      ctx.fillStyle = fill === 'currentColor' ? defaultColor : fill;
      ctx.fill();
    }
    const stroke = attrs['stroke'] ?? (tag === 'path' || tag === 'line' || tag === 'polyline' || tag === 'circle' || tag === 'rect' ? defaultColor : undefined);
    if (stroke && stroke !== 'none') {
      ctx.strokeStyle = stroke === 'currentColor' ? defaultColor : stroke;
      ctx.lineWidth = Number(attrs['stroke-width'] ?? defaultStrokeWidth) || defaultStrokeWidth;
      ctx.stroke();
    }
    if (attrs['marker-end'] && tag === 'line') {
      const x1 = Number(attrs['x1'] ?? 0);
      const y1 = Number(attrs['y1'] ?? 0);
      const x2 = Number(attrs['x2'] ?? 0);
      const y2 = Number(attrs['y2'] ?? 0);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 4;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = stroke && stroke !== 'none' ? (stroke === 'currentColor' ? defaultColor : stroke) : defaultColor;
      ctx.fill();
    }
  }

  ctx.restore();
}

export interface ArtworkPaintOptions {
  x?: number;
  y?: number;
  selected?: boolean;
  isDark?: boolean;
  interactiveButtons?: boolean;
}

export function paintFloatingArtworkItem(
  ctx: CanvasRenderingContext2D,
  artwork: FloatingArtwork,
  options: ArtworkPaintOptions = {}
): void {
  const x = options.x ?? artwork.x;
  const y = options.y ?? artwork.y;
  const w = Math.max(16, artwork.width);
  const h = Math.max(16, artwork.height);
  const color = options.isDark ? '#60a5fa' : '#2563eb';

  ctx.save();
  ctx.translate(x, y);

  if (artwork.kind === 'image' && artwork.imageDataUrl) {
    if (typeof Image !== 'undefined') {
      let img = IMAGE_CACHE.get(artwork.imageDataUrl);
      if (!img) {
        img = new Image();
        img.src = artwork.imageDataUrl;
        IMAGE_CACHE.set(artwork.imageDataUrl, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = options.isDark ? '#1e293b' : '#f1f5f9';
        ctx.fillRect(0, 0, w, h);
      }
    }
  } else if (artwork.kind === 'icon') {
    const nodes = ICON_NODE_MAP.get(artwork.itemId);
    if (nodes) {
      ctx.save();
      ctx.scale(w / 24, h / 24);
      for (const [tag, attrs] of nodes) {
        paintSvgPrimitive(ctx, { tag, attrs: { fill: 'none', stroke: color, ...attrs } }, color, 2);
      }
      ctx.restore();
    }
  } else {
    const shape = getShapeDefinition(artwork.itemId);
    if (shape) {
      const [vx, vy, vw, vh] = shape.viewBox;
      ctx.save();
      ctx.scale(w / vw, h / vh);
      ctx.translate(-vx, -vy);
      for (const element of shape.elements) {
        paintSvgPrimitive(ctx, element, color, 2);
      }
      ctx.restore();
    }
  }

  if (options.selected) {
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2;
    ctx.strokeRect(-1, -1, w + 2, h + 2);

    if (options.interactiveButtons !== false) {
      // Delete button (top-right above artwork)
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(w - 24, -24, 24, 24, 4);
      } else {
        ctx.rect(w - 24, -24, 24, 24);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×', w - 12, -11.5);

      // Resize handle (bottom-right circle)
      ctx.beginPath();
      ctx.arc(w, h, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#059669';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function paintArtworkListOnCanvas(
  ctx: CanvasRenderingContext2D,
  artworks: FloatingArtwork[],
  selectedId: string | null,
  options: { isDark?: boolean; interactiveButtons?: boolean } = {}
): void {
  for (const item of artworks) {
    paintFloatingArtworkItem(ctx, item, {
      selected: item.id === selectedId,
      isDark: options.isDark,
      interactiveButtons: options.interactiveButtons,
    });
  }
}

export function hitTestFloatingArtwork(
  worldX: number,
  worldY: number,
  artworks: FloatingArtwork[],
  selectedId: string | null
): { artwork: FloatingArtwork; part: 'delete' | 'resize' | 'body' } | null {
  for (let i = artworks.length - 1; i >= 0; i--) {
    const item = artworks[i];
    if (item.id === selectedId) {
      if (
        worldX >= item.x + item.width - 24 &&
        worldX <= item.x + item.width &&
        worldY >= item.y - 24 &&
        worldY <= item.y
      ) {
        return { artwork: item, part: 'delete' };
      }
      const dx = worldX - (item.x + item.width);
      const dy = worldY - (item.y + item.height);
      if (dx * dx + dy * dy <= 64) {
        return { artwork: item, part: 'resize' };
      }
    }
    if (
      worldX >= item.x &&
      worldX <= item.x + item.width &&
      worldY >= item.y &&
      worldY <= item.y + item.height
    ) {
      return { artwork: item, part: 'body' };
    }
  }
  return null;
}

export function isArtworkInViewport(
  artwork: FloatingArtwork,
  scrollLeft: number,
  scrollTop: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 48
): boolean {
  return (
    artwork.x + artwork.width + margin >= scrollLeft &&
    artwork.x - margin <= scrollLeft + viewportWidth &&
    artwork.y + artwork.height + margin >= scrollTop &&
    artwork.y - margin <= scrollTop + viewportHeight
  );
}
