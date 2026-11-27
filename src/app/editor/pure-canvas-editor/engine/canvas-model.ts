/**
 * Modelo de datos ligero del motor Canvas 2D propio de Weave.
 * Mantiene compatibilidad directa con escenas previas de Excalidraw
 * (`{ elements, appState }`) para no perder ningún lienzo guardado.
 */

export type CanvasTool =
  | 'hand'
  | 'select'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'eraser';

export type CanvasElementType =
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text';

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export type ArrowRouting = 'straight' | 'curved' | 'elbow';

export interface ArrowBinding {
  elementId: string;
}

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number; // 0..100
  roughness?: number;
  roundness?: number;
  /** Puntos relativos a (x, y) para line, arrow y freedraw */
  points?: [number, number][];
  /** Conexión dinámica a nodos (para árboles, grafos y mapas) */
  startBinding?: ArrowBinding | null;
  endBinding?: ArrowBinding | null;
  routing?: ArrowRouting;
  /** Texto para elementos `text` o etiqueta centrada dentro de formas */
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  isDeleted?: boolean;
}

export interface CanvasAppState {
  viewBackgroundColor?: string;
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
  gridEnabled?: boolean;
}

export interface CanvasSceneData {
  version: number;
  engine: 'weave-canvas';
  elements: CanvasElement[];
  appState: CanvasAppState;
}

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export const STROKE_PALETTE = [
  '#1e293b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
] as const;

export const FILL_PALETTE = [
  'transparent',
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#dbeafe',
  '#ede9fe',
  '#fce7f3',
  '#f1f5f9',
] as const;

export function createCanvasId(): string {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Normaliza cualquier payload persistido (escena nueva de Weave, escena previa de Excalidraw
 * o bloque con `snapshot`) a un `CanvasSceneData` limpio y tipado.
 */
export function normalizeCanvasScene(raw: unknown): CanvasSceneData {
  const source = extractSceneContainer(raw);
  const rawElements = Array.isArray(source?.elements) ? source.elements : [];
  const elements: CanvasElement[] = [];

  for (const item of rawElements) {
    const normalized = normalizeElement(item);
    if (normalized) elements.push(normalized);
  }

  const rawState = (source?.appState && typeof source.appState === 'object' ? source.appState : {}) as Record<string, unknown>;
  const zoomRaw = rawState['zoom'];
  const zoomValue =
    typeof zoomRaw === 'number'
      ? zoomRaw
      : zoomRaw && typeof zoomRaw === 'object' && typeof (zoomRaw as { value?: unknown }).value === 'number'
        ? (zoomRaw as { value: number }).value
        : 1;

  return {
    version: 1,
    engine: 'weave-canvas',
    elements,
    appState: {
      viewBackgroundColor:
        typeof rawState['viewBackgroundColor'] === 'string' ? rawState['viewBackgroundColor'] : '#ffffff',
      scrollX: typeof rawState['scrollX'] === 'number' && Number.isFinite(rawState['scrollX']) ? rawState['scrollX'] : 0,
      scrollY: typeof rawState['scrollY'] === 'number' && Number.isFinite(rawState['scrollY']) ? rawState['scrollY'] : 0,
      zoom: Number.isFinite(zoomValue) ? Math.min(4, Math.max(0.15, zoomValue)) : 1,
      gridEnabled: rawState['gridEnabled'] === true,
    },
  };
}

function extractSceneContainer(raw: unknown): { elements?: unknown[]; appState?: unknown } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj['elements'])) {
    return { elements: obj['elements'], appState: obj['appState'] };
  }
  if (obj['snapshot'] && typeof obj['snapshot'] === 'object') {
    const snap = obj['snapshot'] as Record<string, unknown>;
    if (Array.isArray(snap['elements'])) {
      return { elements: snap['elements'], appState: snap['appState'] };
    }
  }
  return null;
}

const VALID_TYPES = new Set<CanvasElementType>([
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'freedraw',
  'text',
]);

function normalizeElement(raw: unknown): CanvasElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const el = raw as Record<string, unknown>;
  if (el['isDeleted'] === true) return null;

  const rawType = String(el['type'] || '');
  if (!VALID_TYPES.has(rawType as CanvasElementType)) return null;
  const type = rawType as CanvasElementType;

  const x = typeof el['x'] === 'number' && Number.isFinite(el['x']) ? el['x'] : 0;
  const y = typeof el['y'] === 'number' && Number.isFinite(el['y']) ? el['y'] : 0;
  const width = typeof el['width'] === 'number' && Number.isFinite(el['width']) ? el['width'] : 0;
  const height = typeof el['height'] === 'number' && Number.isFinite(el['height']) ? el['height'] : 0;

  let points: [number, number][] | undefined;
  if (Array.isArray(el['points'])) {
    const parsed: [number, number][] = [];
    for (const pt of el['points']) {
      if (Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
        parsed.push([pt[0], pt[1]]);
      }
    }
    if (parsed.length > 0) points = parsed;
  }

  const strokeStyleRaw = String(el['strokeStyle'] || 'solid');
  const strokeStyle: StrokeStyle =
    strokeStyleRaw === 'dashed' || strokeStyleRaw === 'dotted' ? strokeStyleRaw : 'solid';

  const opacityRaw = typeof el['opacity'] === 'number' && Number.isFinite(el['opacity']) ? el['opacity'] : 100;

  const parseBinding = (rawBinding: unknown): ArrowBinding | null | undefined => {
    if (!rawBinding || typeof rawBinding !== 'object') return undefined;
    const bId = (rawBinding as Record<string, unknown>)['elementId'];
    return typeof bId === 'string' && bId.trim() ? { elementId: bId } : undefined;
  };
  const startBinding = parseBinding(el['startBinding']);
  const endBinding = parseBinding(el['endBinding']);
  const routingRaw = String(el['routing'] || '');
  const routing: ArrowRouting | undefined =
    routingRaw === 'straight' || routingRaw === 'curved' || routingRaw === 'elbow' ? routingRaw : undefined;

  return {
    id: typeof el['id'] === 'string' && el['id'].trim() ? el['id'] : createCanvasId(),
    type,
    x,
    y,
    width,
    height,
    strokeColor: typeof el['strokeColor'] === 'string' && el['strokeColor'] ? el['strokeColor'] : '#1e293b',
    backgroundColor: typeof el['backgroundColor'] === 'string' ? el['backgroundColor'] : 'transparent',
    strokeWidth: typeof el['strokeWidth'] === 'number' && el['strokeWidth'] > 0 ? el['strokeWidth'] : 2,
    strokeStyle,
    opacity: Math.max(5, Math.min(100, opacityRaw)),
    roundness: typeof el['roundness'] === 'number' ? el['roundness'] : type === 'rectangle' ? 8 : 0,
    ...(points ? { points } : {}),
    ...(startBinding ? { startBinding } : {}),
    ...(endBinding ? { endBinding } : {}),
    ...(routing ? { routing } : {}),
    ...(typeof el['text'] === 'string' ? { text: el['text'] } : {}),
    ...(typeof el['fontSize'] === 'number' && el['fontSize'] > 0 ? { fontSize: el['fontSize'] } : {}),
    ...(typeof el['fontFamily'] === 'string' ? { fontFamily: el['fontFamily'] } : {}),
    ...(el['textAlign'] === 'left' || el['textAlign'] === 'center' || el['textAlign'] === 'right'
      ? { textAlign: el['textAlign'] }
      : {}),
  };
}

export function getElementBounds(el: CanvasElement): CanvasBounds {
  if ((el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') && el.points?.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of el.points) {
      const wx = el.x + px;
      const wy = el.y + py;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  const x1 = Math.min(el.x, el.x + el.width);
  const y1 = Math.min(el.y, el.y + el.height);
  const x2 = Math.max(el.x, el.x + el.width);
  const y2 = Math.max(el.y, el.y + el.height);
  return {
    minX: x1,
    minY: y1,
    maxX: x2,
    maxY: y2,
    width: Math.max(1, x2 - x1),
    height: Math.max(1, y2 - y1),
  };
}

export function getElementsBounds(elements: readonly CanvasElement[]): CanvasBounds | null {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function cloneElements(elements: readonly CanvasElement[]): CanvasElement[] {
  return elements.map((el) => ({
    ...el,
    ...(el.points ? { points: el.points.map(([px, py]) => [px, py] as [number, number]) } : {}),
    ...(el.startBinding ? { startBinding: { ...el.startBinding } } : {}),
    ...(el.endBinding ? { endBinding: { ...el.endBinding } } : {}),
  }));
}
