import {
  ArrowRouting,
  CanvasElement,
  StrokeStyle,
  createCanvasId,
  getElementBounds,
} from './canvas-model';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';
export type BranchDirection = 'up' | 'right' | 'down' | 'left';
export type DiagramPresetKind = 'tree' | 'mindmap' | 'graph' | 'flowchart';

export function isConnectableShape(el: CanvasElement): boolean {
  return el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse';
}

export function getShapeAnchor(
  el: CanvasElement,
  targetX: number,
  targetY: number,
  gap = 6,
): { x: number; y: number; side: AnchorSide } {
  const b = getElementBounds(el);
  const cx = b.minX + b.width / 2;
  const cy = b.minY + b.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  const normX = Math.abs(dx) / Math.max(1, b.width / 2);
  const normY = Math.abs(dy) / Math.max(1, b.height / 2);

  if (normX >= normY) {
    if (dx >= 0) return { x: b.maxX + gap, y: cy, side: 'right' };
    return { x: b.minX - gap, y: cy, side: 'left' };
  }
  if (dy >= 0) return { x: cx, y: b.maxY + gap, side: 'bottom' };
  return { x: cx, y: b.minY - gap, side: 'top' };
}

/**
 * Calcula los puntos relativos a (startX, startY) para un conector recto, curvo o ortogonal (codo).
 */
export function computeConnectorPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  routing: ArrowRouting,
  startSide?: AnchorSide,
  endSide?: AnchorSide,
): [number, number][] {
  const dx = endX - startX;
  const dy = endY - startY;

  if (routing === 'straight') {
    return [[0, 0], [dx, dy]];
  }

  if (routing === 'curved') {
    // 3 puntos: inicio, punto de control (curva suave), fin
    const horizontal =
      startSide === 'left' || startSide === 'right' || (!startSide && Math.abs(dx) >= Math.abs(dy));
    const ctrlX = horizontal ? dx * 0.5 : dx * 0.15;
    const ctrlY = horizontal ? dy * 0.15 : dy * 0.5;
    return [[0, 0], [ctrlX, ctrlY], [dx, dy]];
  }

  // routing === 'elbow' (ortogonal con 90° limpio)
  const startHoriz = startSide === 'left' || startSide === 'right';
  const startVert = startSide === 'top' || startSide === 'bottom';
  const endHoriz = endSide === 'left' || endSide === 'right';
  const endVert = endSide === 'top' || endSide === 'bottom';

  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) {
    return [[0, 0], [dx, dy]];
  }

  // L-bend cuando salen/entran en ejes perpendiculares
  if (startHoriz && endVert) {
    return [[0, 0], [dx, 0], [dx, dy]];
  }
  if (startVert && endHoriz) {
    return [[0, 0], [0, dy], [dx, dy]];
  }

  // Z-bend cuando ambos ejes son horizontales o ambos verticales
  if (startHoriz || (!startVert && Math.abs(dx) >= Math.abs(dy))) {
    const midX = dx / 2;
    return [[0, 0], [midX, 0], [midX, dy], [dx, dy]];
  }
  const midY = dy / 2;
  return [[0, 0], [0, midY], [dx, midY], [dx, dy]];
}

/**
 * Encuentra la figura conectable más cercana al punto (wx, wy) dentro de `threshold`.
 */
export function findSnapTarget(
  wx: number,
  wy: number,
  elements: readonly CanvasElement[],
  excludeIds: ReadonlySet<string>,
  threshold = 28,
): CanvasElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (excludeIds.has(el.id) || !isConnectableShape(el)) continue;
    const b = getElementBounds(el);
    if (
      wx >= b.minX - threshold &&
      wx <= b.maxX + threshold &&
      wy >= b.minY - threshold &&
      wy <= b.maxY + threshold
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Actualiza automáticamente todos los conectores (`arrow` / `line`) enlazados a nodos
 * cuando cualquier figura se mueve, redimensiona o cambia de estilo de ruta.
 */
export function syncBoundArrows(elements: readonly CanvasElement[]): CanvasElement[] {
  const byId = new Map<string, CanvasElement>();
  for (const el of elements) byId.set(el.id, el);

  let changed = false;
  const next = elements.map((el) => {
    if ((el.type !== 'arrow' && el.type !== 'line') || (!el.startBinding && !el.endBinding)) {
      return el;
    }
    const startNode = el.startBinding ? byId.get(el.startBinding.elementId) : undefined;
    const endNode = el.endBinding ? byId.get(el.endBinding.elementId) : undefined;
    if (!startNode && !endNode) return el;

    const currentPts = el.points && el.points.length >= 2 ? el.points : [[0, 0], [el.width, el.height]];
    let startX = el.x + currentPts[0][0];
    let startY = el.y + currentPts[0][1];
    let endX = el.x + currentPts[currentPts.length - 1][0];
    let endY = el.y + currentPts[currentPts.length - 1][1];
    let startSide: AnchorSide | undefined;
    let endSide: AnchorSide | undefined;

    if (startNode && endNode) {
      const sb = getElementBounds(startNode);
      const eb = getElementBounds(endNode);
      const sAnchor = getShapeAnchor(startNode, eb.minX + eb.width / 2, eb.minY + eb.height / 2);
      const eAnchor = getShapeAnchor(endNode, sb.minX + sb.width / 2, sb.minY + sb.height / 2);
      startX = sAnchor.x;
      startY = sAnchor.y;
      startSide = sAnchor.side;
      endX = eAnchor.x;
      endY = eAnchor.y;
      endSide = eAnchor.side;
    } else if (startNode) {
      const sAnchor = getShapeAnchor(startNode, endX, endY);
      startX = sAnchor.x;
      startY = sAnchor.y;
      startSide = sAnchor.side;
    } else if (endNode) {
      const eAnchor = getShapeAnchor(endNode, startX, startY);
      endX = eAnchor.x;
      endY = eAnchor.y;
      endSide = eAnchor.side;
    }

    const routing: ArrowRouting = el.routing || 'elbow';
    const points = computeConnectorPoints(startX, startY, endX, endY, routing, startSide, endSide);
    changed = true;
    return {
      ...el,
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
      points,
    };
  });

  return changed ? next : [...elements];
}

/**
 * Crea un nodo conectado en la dirección indicada (`up`, `right`, `down`, `left`)
 * evitando superponerse con nodos hermanos existentes (ideal para árboles y diagramas de flujo).
 */
export function createBranchFromNode(
  source: CanvasElement,
  direction: BranchDirection,
  existingElements: readonly CanvasElement[],
  routing: ArrowRouting = 'elbow',
): { node: CanvasElement; arrow: CanvasElement } {
  const sb = getElementBounds(source);
  const gap = 84;
  let nx = sb.minX;
  let ny = sb.minY;

  if (direction === 'right') nx = sb.maxX + gap;
  else if (direction === 'left') nx = sb.minX - gap - sb.width;
  else if (direction === 'down') ny = sb.maxY + gap;
  else ny = sb.minY - gap - sb.height;

  // Desplazar si ya existe un hermano en esa misma posición
  const overlapsExisting = (tx: number, ty: number): boolean =>
    existingElements.some((el) => {
      if (!isConnectableShape(el)) return false;
      const b = getElementBounds(el);
      return (
        tx < b.maxX + 16 &&
        tx + sb.width > b.minX - 16 &&
        ty < b.maxY + 16 &&
        ty + sb.height > b.minY - 16
      );
    });

  let attempts = 0;
  while (overlapsExisting(nx, ny) && attempts < 12) {
    attempts++;
    if (direction === 'down' || direction === 'up') {
      nx += (attempts % 2 === 1 ? 1 : -1) * Math.ceil(attempts / 2) * (sb.width + 36);
    } else {
      ny += (attempts % 2 === 1 ? 1 : -1) * Math.ceil(attempts / 2) * (sb.height + 28);
    }
  }

  const nodeId = createCanvasId();
  const node: CanvasElement = {
    id: nodeId,
    type: source.type,
    x: nx,
    y: ny,
    width: sb.width,
    height: sb.height,
    strokeColor: source.strokeColor,
    backgroundColor: source.backgroundColor,
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
    opacity: source.opacity,
    roundness: source.roundness,
    fontSize: source.fontSize ?? 16,
    text: '',
  };

  const arrow = createBoundArrow(source, node, routing, {
    strokeColor: source.strokeColor,
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
  });

  return { node, arrow };
}

export function createBoundArrow(
  from: CanvasElement,
  to: CanvasElement,
  routing: ArrowRouting,
  style: { strokeColor: string; strokeWidth: number; strokeStyle: StrokeStyle },
): CanvasElement {
  const fb = getElementBounds(from);
  const tb = getElementBounds(to);
  const sAnchor = getShapeAnchor(from, tb.minX + tb.width / 2, tb.minY + tb.height / 2);
  const eAnchor = getShapeAnchor(to, fb.minX + fb.width / 2, fb.minY + fb.height / 2);
  const points = computeConnectorPoints(
    sAnchor.x,
    sAnchor.y,
    eAnchor.x,
    eAnchor.y,
    routing,
    sAnchor.side,
    eAnchor.side,
  );
  return {
    id: createCanvasId(),
    type: 'arrow',
    x: sAnchor.x,
    y: sAnchor.y,
    width: eAnchor.x - sAnchor.x,
    height: eAnchor.y - sAnchor.y,
    strokeColor: style.strokeColor,
    backgroundColor: 'transparent',
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    opacity: 100,
    routing,
    startBinding: { elementId: from.id },
    endBinding: { elementId: to.id },
    points,
  };
}

/**
 * Genera plantillas listas y editables de Árbol, Mapa Mental, Grafo o Diagrama de Flujo.
 */
export function createDiagramPreset(
  kind: DiagramPresetKind,
  cx: number,
  cy: number,
  strokeColor = '#1e293b',
): CanvasElement[] {
  const makeNode = (
    type: 'rectangle' | 'diamond' | 'ellipse',
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    bg: string,
  ): CanvasElement => ({
    id: createCanvasId(),
    type,
    x: Math.round(x - w / 2),
    y: Math.round(y - h / 2),
    width: w,
    height: h,
    strokeColor,
    backgroundColor: bg,
    strokeWidth: 2,
    strokeStyle: 'solid',
    opacity: 100,
    roundness: type === 'rectangle' ? 10 : 0,
    fontSize: 15,
    text,
  });

  const style = { strokeColor, strokeWidth: 2, strokeStyle: 'solid' as StrokeStyle };

  if (kind === 'tree') {
    const root = makeNode('rectangle', cx, cy - 130, 150, 52, 'Raíz', '#dbeafe');
    const c1 = makeNode('rectangle', cx - 170, cy, 136, 48, 'Rama A', '#ede9fe');
    const c2 = makeNode('rectangle', cx + 170, cy, 136, 48, 'Rama B', '#ede9fe');
    const g1 = makeNode('rectangle', cx - 245, cy + 125, 120, 44, 'Hoja A1', '#dcfce7');
    const g2 = makeNode('rectangle', cx - 95, cy + 125, 120, 44, 'Hoja A2', '#dcfce7');
    const g3 = makeNode('rectangle', cx + 170, cy + 125, 120, 44, 'Hoja B1', '#dcfce7');
    return [
      root, c1, c2, g1, g2, g3,
      createBoundArrow(root, c1, 'elbow', style),
      createBoundArrow(root, c2, 'elbow', style),
      createBoundArrow(c1, g1, 'elbow', style),
      createBoundArrow(c1, g2, 'elbow', style),
      createBoundArrow(c2, g3, 'elbow', style),
    ];
  }

  if (kind === 'mindmap') {
    const center = makeNode('ellipse', cx, cy, 165, 72, 'Idea central', '#dbeafe');
    const n1 = makeNode('rectangle', cx - 230, cy - 95, 136, 46, 'Tema 1', '#fef9c3');
    const n2 = makeNode('rectangle', cx - 230, cy + 95, 136, 46, 'Tema 2', '#dcfce7');
    const n3 = makeNode('rectangle', cx + 230, cy - 95, 136, 46, 'Tema 3', '#fce7f3');
    const n4 = makeNode('rectangle', cx + 230, cy + 95, 136, 46, 'Tema 4', '#ede9fe');
    return [
      center, n1, n2, n3, n4,
      createBoundArrow(center, n1, 'curved', style),
      createBoundArrow(center, n2, 'curved', style),
      createBoundArrow(center, n3, 'curved', style),
      createBoundArrow(center, n4, 'curved', style),
    ];
  }

  if (kind === 'graph') {
    const a = makeNode('ellipse', cx, cy - 125, 68, 68, 'A', '#dbeafe');
    const b = makeNode('ellipse', cx - 150, cy + 10, 68, 68, 'B', '#dcfce7');
    const c = makeNode('ellipse', cx + 150, cy + 10, 68, 68, 'C', '#fef9c3');
    const d = makeNode('ellipse', cx - 80, cy + 145, 68, 68, 'D', '#ede9fe');
    const e = makeNode('ellipse', cx + 80, cy + 145, 68, 68, 'E', '#fce7f3');
    return [
      a, b, c, d, e,
      createBoundArrow(a, b, 'straight', style),
      createBoundArrow(a, c, 'straight', style),
      createBoundArrow(b, c, 'straight', style),
      createBoundArrow(b, d, 'straight', style),
      createBoundArrow(c, e, 'straight', style),
      createBoundArrow(d, e, 'straight', style),
    ];
  }

  // flowchart
  const start = makeNode('ellipse', cx, cy - 160, 130, 48, 'Inicio', '#dcfce7');
  const step = makeNode('rectangle', cx, cy - 55, 155, 50, 'Proceso', '#dbeafe');
  const decision = makeNode('diamond', cx, cy + 70, 140, 88, '¿Condición?', '#fef9c3');
  const yesBranch = makeNode('rectangle', cx + 210, cy + 70, 130, 48, 'Acción Sí', '#ede9fe');
  const end = makeNode('ellipse', cx, cy + 195, 130, 48, 'Fin', '#fee2e2');
  return [
    start, step, decision, yesBranch, end,
    createBoundArrow(start, step, 'elbow', style),
    createBoundArrow(step, decision, 'elbow', style),
    createBoundArrow(decision, yesBranch, 'elbow', style),
    createBoundArrow(decision, end, 'elbow', style),
  ];
}
