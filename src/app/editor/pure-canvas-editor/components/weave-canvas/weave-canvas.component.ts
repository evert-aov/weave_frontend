import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  ArrowRouting,
  CanvasElement,
  CanvasSceneData,
  CanvasTool,
  FILL_PALETTE,
  STROKE_PALETTE,
  StrokeStyle,
  cloneElements,
  createCanvasId,
  getElementBounds,
  getElementsBounds,
  normalizeCanvasScene,
} from '../../engine/canvas-model';
import {
  BranchDirection,
  DiagramPresetKind,
  computeConnectorPoints,
  createBranchFromNode,
  createDiagramPreset,
  findSnapTarget,
  getShapeAnchor,
  isConnectableShape,
  syncBoundArrows,
} from '../../engine/canvas-graph';
import {
  ResizeHandle,
  elementsInBox,
  exportSceneToPngDataUrl,
  hitTestBranchHandle,
  hitTestElement,
  hitTestResizeHandle,
  renderCanvasScene,
  screenToWorld,
  worldToScreen,
} from '../../engine/canvas-renderer';

interface InlineTextEdit {
  elementId: string;
  text: string;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  centered: boolean;
}

type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'pan'; startScreenX: number; startScreenY: number; origScrollX: number; origScrollY: number }
  | { kind: 'draw'; elementId: string; startX: number; startY: number }
  | { kind: 'move'; startX: number; startY: number; originals: Map<string, CanvasElement>; moved: boolean }
  | { kind: 'resize'; elementId: string; handle: ResizeHandle; startX: number; startY: number; original: CanvasElement }
  | { kind: 'marquee'; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: 'erase'; erasedAny: boolean };

@Component({
  selector: 'app-weave-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './weave-canvas.component.html',
  styleUrls: ['./weave-canvas.component.css'],
})
export class WeaveCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() sceneData: unknown = null;
  @Input() sceneKey = '';
  @Input() readOnly = false;
  @Input() compact = false;

  @Output() sceneChange = new EventEmitter<CanvasSceneData>();

  @ViewChild('canvasHost', { static: true }) canvasHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvasEl', { static: true }) canvasElRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('inlineTextarea') inlineTextareaRef?: ElementRef<HTMLTextAreaElement>;

  readonly i18n = inject(I18nService);
  readonly themeService = inject(ThemeService);

  readonly strokePalette = STROKE_PALETTE;
  readonly fillPalette = FILL_PALETTE;
  readonly strokeWidths = [1.5, 2.5, 4, 6] as const;
  readonly fontSizes = [14, 18, 24, 32] as const;

  // Scene & tool signals
  readonly activeTool = signal<CanvasTool>('select');
  readonly strokeColor = signal<string>('#1e293b');
  readonly backgroundColor = signal<string>('transparent');
  readonly strokeWidth = signal<number>(2.5);
  readonly strokeStyle = signal<StrokeStyle>('solid');
  readonly arrowRouting = signal<ArrowRouting>('elbow');
  readonly selectedShapeType = signal<'rectangle' | 'diamond' | 'ellipse' | null>(null);
  readonly fontSize = signal<number>(18);
  readonly opacity = signal<number>(100);
  readonly showPresetsMenu = signal<boolean>(false);

  readonly zoom = signal<number>(1);
  readonly scrollX = signal<number>(0);
  readonly scrollY = signal<number>(0);
  readonly gridEnabled = signal<boolean>(false);
  readonly spacePressed = signal<boolean>(false);

  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly elementCount = signal<number>(0);
  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);
  readonly inlineEdit = signal<InlineTextEdit | null>(null);
  readonly cursorStyle = signal<string>('default');

  readonly hasSingleConnectableSelected = computed(() => {
    const sel = this.selectedIds();
    if (this.readOnly || sel.size !== 1) return false;
    const id = sel.values().next().value;
    const el = this.elements.find((item) => item.id === id);
    return Boolean(el && isConnectableShape(el));
  });

  readonly showInspector = computed(() => {
    if (this.readOnly) return false;
    if (this.selectedIds().size > 0) return true;
    const t = this.activeTool();
    return t !== 'select' && t !== 'hand' && t !== 'eraser';
  });

  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));

  private elements: CanvasElement[] = [];
  private undoStack: CanvasElement[][] = [];
  private redoStack: CanvasElement[][] = [];
  private clipboard: CanvasElement[] = [];
  private interaction: InteractionMode = { kind: 'idle' };
  private snapTargetId: string | null = null;
  private lastLoadedKey = '';
  private viewportWidth = 800;
  private viewportHeight = 600;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private viewReady = false;

  constructor() {
    effect(() => {
      this.themeService.isDark();
      this.scheduleRender();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const keyChanged = Boolean(changes['sceneKey'] && this.sceneKey !== this.lastLoadedKey);
    const dataInitial = Boolean(changes['sceneData'] && !this.lastLoadedKey && this.elements.length === 0);
    if (keyChanged || dataInitial) {
      this.loadScene(this.sceneData);
      this.lastLoadedKey = this.sceneKey || '__loaded__';
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.lastLoadedKey) {
      this.loadScene(this.sceneData);
      this.lastLoadedKey = this.sceneKey || '__loaded__';
    }
    this.measureHost();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.measureHost();
        this.scheduleRender();
      });
      this.resizeObserver.observe(this.canvasHostRef.nativeElement);
    }
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  private loadScene(raw: unknown): void {
    const scene = normalizeCanvasScene(raw);
    this.elements = cloneElements(scene.elements);
    this.undoStack = [];
    this.redoStack = [];
    this.selectedIds.set(new Set());
    this.inlineEdit.set(null);
    this.elementCount.set(this.elements.length);
    this.canUndo.set(false);
    this.canRedo.set(false);
    this.zoom.set(scene.appState.zoom ?? 1);
    this.scrollX.set(scene.appState.scrollX ?? 0);
    this.scrollY.set(scene.appState.scrollY ?? 0);
    this.gridEnabled.set(scene.appState.gridEnabled === true);
    this.scheduleRender();
  }

  private measureHost(): void {
    const rect = this.canvasHostRef.nativeElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.viewportWidth = rect.width;
      this.viewportHeight = rect.height;
    }
  }

  private scheduleRender(): void {
    if (!this.viewReady || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.renderNow();
    });
  }

  private renderNow(): void {
    const canvas = this.canvasElRef?.nativeElement;
    if (!canvas) return;
    const marquee =
      this.interaction.kind === 'marquee'
        ? {
            x1: this.interaction.startX,
            y1: this.interaction.startY,
            x2: this.interaction.currentX,
            y2: this.interaction.currentY,
          }
        : null;

    renderCanvasScene(
      canvas,
      this.elements,
      {
        scrollX: this.scrollX(),
        scrollY: this.scrollY(),
        zoom: this.zoom(),
        width: this.viewportWidth,
        height: this.viewportHeight,
        dark: this.themeService.isDark(),
        gridEnabled: this.gridEnabled(),
      },
      {
        selectedIds: this.selectedIds(),
        marquee,
        editingElementId: this.inlineEdit()?.elementId ?? null,
        snapTargetId: this.snapTargetId,
        readOnly: this.readOnly,
      },
    );
  }

  private pushUndoSnapshot(): void {
    this.undoStack.push(cloneElements(this.elements));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(false);
  }

  private emitSceneChange(): void {
    this.elementCount.set(this.elements.length);
    this.sceneChange.emit({
      version: 1,
      engine: 'weave-canvas',
      elements: cloneElements(this.elements),
      appState: {
        viewBackgroundColor: this.themeService.isDark() ? '#14151a' : '#ffffff',
        scrollX: Math.round(this.scrollX() * 100) / 100,
        scrollY: Math.round(this.scrollY() * 100) / 100,
        zoom: Math.round(this.zoom() * 1000) / 1000,
        gridEnabled: this.gridEnabled(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public toolbar & viewport controls
  // ---------------------------------------------------------------------------

  setTool(tool: CanvasTool): void {
    if (this.readOnly && tool !== 'hand') return;
    this.commitInlineEdit();
    this.activeTool.set(tool);
    if (tool !== 'select') {
      this.selectedIds.set(new Set());
    }
    this.updateIdleCursor();
    this.scheduleRender();
  }

  toggleGrid(): void {
    this.gridEnabled.update((v) => !v);
    this.scheduleRender();
    if (!this.readOnly) this.emitSceneChange();
  }

  zoomIn(): void {
    this.zoomAtPoint(Math.min(4, Math.round((this.zoom() + 0.15) * 100) / 100), this.viewportWidth / 2, this.viewportHeight / 2);
  }

  zoomOut(): void {
    this.zoomAtPoint(Math.max(0.15, Math.round((this.zoom() - 0.15) * 100) / 100), this.viewportWidth / 2, this.viewportHeight / 2);
  }

  resetZoom(): void {
    this.zoomAtPoint(1, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  centerToContent(): void {
    const bounds = getElementsBounds(this.elements);
    if (!bounds) {
      this.zoom.set(1);
      this.scrollX.set(0);
      this.scrollY.set(0);
      this.scheduleRender();
      return;
    }
    const pad = 64;
    const fitZoom = Math.min(
      1.5,
      Math.max(
        0.2,
        Math.min(
          (this.viewportWidth - pad * 2) / Math.max(1, bounds.width),
          (this.viewportHeight - pad * 2) / Math.max(1, bounds.height),
        ),
      ),
    );
    const roundedZoom = Math.round(fitZoom * 100) / 100;
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    this.zoom.set(roundedZoom);
    this.scrollX.set(this.viewportWidth / (2 * roundedZoom) - cx);
    this.scrollY.set(this.viewportHeight / (2 * roundedZoom) - cy);
    this.scheduleRender();
  }

  private zoomAtPoint(nextZoom: number, screenX: number, screenY: number): void {
    const clamped = Math.min(4, Math.max(0.15, nextZoom));
    const currentZoom = this.zoom();
    if (clamped === currentZoom) return;
    const worldBefore = screenToWorld(screenX, screenY, {
      scrollX: this.scrollX(),
      scrollY: this.scrollY(),
      zoom: currentZoom,
    });
    this.zoom.set(clamped);
    this.scrollX.set(screenX / clamped - worldBefore.x);
    this.scrollY.set(screenY / clamped - worldBefore.y);
    this.scheduleRender();
  }

  undo(): void {
    if (this.readOnly || !this.undoStack.length) return;
    this.commitInlineEdit();
    this.redoStack.push(cloneElements(this.elements));
    this.elements = this.undoStack.pop()!;
    this.selectedIds.set(new Set());
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.scheduleRender();
    this.emitSceneChange();
  }

  redo(): void {
    if (this.readOnly || !this.redoStack.length) return;
    this.commitInlineEdit();
    this.undoStack.push(cloneElements(this.elements));
    this.elements = this.redoStack.pop()!;
    this.selectedIds.set(new Set());
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.scheduleRender();
    this.emitSceneChange();
  }

  // ---------------------------------------------------------------------------
  // Style & layer mutations
  // ---------------------------------------------------------------------------

  applyStrokeColor(color: string): void {
    this.strokeColor.set(color);
    this.patchSelected({ strokeColor: color });
  }

  applyBackgroundColor(color: string): void {
    this.backgroundColor.set(color);
    this.patchSelected({ backgroundColor: color });
  }

  applyStrokeWidth(width: number): void {
    this.strokeWidth.set(width);
    this.patchSelected({ strokeWidth: width });
  }

  applyStrokeStyle(style: StrokeStyle): void {
    this.strokeStyle.set(style);
    this.patchSelected({ strokeStyle: style });
  }

  changeSelectedShapeType(shape: 'rectangle' | 'diamond' | 'ellipse'): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    let changed = false;
    this.pushUndoSnapshot();
    this.elements = this.elements.map((el) => {
      if (!sel.has(el.id) || !isConnectableShape(el) || el.type === shape) return el;
      changed = true;
      return {
        ...el,
        type: shape,
        roundness: shape === 'rectangle' ? 8 : 0,
      };
    });
    if (changed) {
      this.selectedShapeType.set(shape);
      this.elements = syncBoundArrows(this.elements);
      this.scheduleRender();
      this.emitSceneChange();
    } else {
      this.undoStack.pop();
      this.canUndo.set(this.undoStack.length > 0);
    }
  }

  applyArrowRouting(routing: ArrowRouting): void {
    this.arrowRouting.set(routing);
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    let updatedAny = false;
    this.pushUndoSnapshot();
    this.elements = this.elements.map((el) => {
      if (!sel.has(el.id) || (el.type !== 'arrow' && el.type !== 'line')) return el;
      updatedAny = true;
      const pts = el.points && el.points.length >= 2 ? el.points : [[0, 0], [el.width, el.height]];
      const startX = el.x + pts[0][0];
      const startY = el.y + pts[0][1];
      const endX = el.x + pts[pts.length - 1][0];
      const endY = el.y + pts[pts.length - 1][1];
      return {
        ...el,
        routing,
        points: computeConnectorPoints(startX, startY, endX, endY, routing),
      };
    });
    if (updatedAny) {
      this.elements = syncBoundArrows(this.elements);
      this.scheduleRender();
      this.emitSceneChange();
    } else {
      this.undoStack.pop();
      this.canUndo.set(this.undoStack.length > 0);
    }
  }

  togglePresetsMenu(): void {
    if (this.readOnly) return;
    this.showPresetsMenu.update((v) => !v);
  }

  insertPreset(kind: DiagramPresetKind): void {
    if (this.readOnly) return;
    this.showPresetsMenu.set(false);
    this.commitInlineEdit();
    const center = screenToWorld(this.viewportWidth / 2, this.viewportHeight / 2, {
      scrollX: this.scrollX(),
      scrollY: this.scrollY(),
      zoom: this.zoom(),
    });
    const created = createDiagramPreset(kind, center.x, center.y, this.strokeColor());
    this.pushUndoSnapshot();
    this.elements = [...this.elements, ...created];
    this.selectedIds.set(new Set(created.map((el) => el.id)));
    this.activeTool.set('select');
    this.scheduleRender();
    this.emitSceneChange();
  }

  branchFromSelected(direction: BranchDirection): boolean {
    if (this.readOnly) return false;
    const sel = this.selectedIds();
    if (sel.size !== 1) return false;
    const sourceId = sel.values().next().value;
    const source = this.elements.find((el) => el.id === sourceId);
    if (!source || !isConnectableShape(source)) return false;

    this.commitInlineEdit();
    this.pushUndoSnapshot();
    const { node, arrow } = createBranchFromNode(source, direction, this.elements, this.arrowRouting());
    this.elements = [...this.elements, arrow, node];
    this.selectedIds.set(new Set([node.id]));
    this.activeTool.set('select');
    this.scheduleRender();
    this.emitSceneChange();
    return true;
  }

  applyFontSize(size: number): void {
    this.fontSize.set(size);
    this.patchSelected({ fontSize: size });
  }

  applyOpacity(value: number): void {
    const clamped = Math.max(10, Math.min(100, Number(value) || 100));
    this.opacity.set(clamped);
    this.patchSelected({ opacity: clamped });
  }

  private patchSelected(patch: Partial<CanvasElement>): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    this.pushUndoSnapshot();
    this.elements = this.elements.map((el) => (sel.has(el.id) ? { ...el, ...patch } : el));
    this.scheduleRender();
    this.emitSceneChange();
  }

  bringToFront(): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    this.pushUndoSnapshot();
    const rest = this.elements.filter((el) => !sel.has(el.id));
    const chosen = this.elements.filter((el) => sel.has(el.id));
    this.elements = [...rest, ...chosen];
    this.scheduleRender();
    this.emitSceneChange();
  }

  sendToBack(): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    this.pushUndoSnapshot();
    const rest = this.elements.filter((el) => !sel.has(el.id));
    const chosen = this.elements.filter((el) => sel.has(el.id));
    this.elements = [...chosen, ...rest];
    this.scheduleRender();
    this.emitSceneChange();
  }

  duplicateSelected(): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    const copies = this.elements
      .filter((el) => sel.has(el.id))
      .map((el) => ({
        ...cloneElements([el])[0],
        id: createCanvasId(),
        x: el.x + 20,
        y: el.y + 20,
      }));
    if (!copies.length) return;
    this.pushUndoSnapshot();
    this.elements = [...this.elements, ...copies];
    this.selectedIds.set(new Set(copies.map((c) => c.id)));
    this.scheduleRender();
    this.emitSceneChange();
  }

  deleteSelected(): void {
    const sel = this.selectedIds();
    if (this.readOnly || !sel.size) return;
    this.pushUndoSnapshot();
    this.elements = this.elements
      .filter((el) => !sel.has(el.id))
      .map((el) => {
        const dropStart = el.startBinding && sel.has(el.startBinding.elementId);
        const dropEnd = el.endBinding && sel.has(el.endBinding.elementId);
        if (!dropStart && !dropEnd) return el;
        return {
          ...el,
          ...(dropStart ? { startBinding: null } : {}),
          ...(dropEnd ? { endBinding: null } : {}),
        };
      });
    this.selectedIds.set(new Set());
    this.scheduleRender();
    this.emitSceneChange();
  }

  clearCanvas(): void {
    if (this.readOnly || !this.elements.length) return;
    this.commitInlineEdit();
    this.pushUndoSnapshot();
    this.elements = [];
    this.selectedIds.set(new Set());
    this.scheduleRender();
    this.emitSceneChange();
  }

  exportPng(): void {
    const dataUrl = exportSceneToPngDataUrl(this.elements, this.themeService.isDark());
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `weave-canvas-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ---------------------------------------------------------------------------
  // Pointer & Wheel interactions
  // ---------------------------------------------------------------------------

  private localCoords(e: PointerEvent | MouseEvent | WheelEvent): { sx: number; sy: number; wx: number; wy: number } {
    const rect = this.canvasHostRef.nativeElement.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy, {
      scrollX: this.scrollX(),
      scrollY: this.scrollY(),
      zoom: this.zoom(),
    });
    return { sx, sy, wx: world.x, wy: world.y };
  }

  onPointerDown(e: PointerEvent): void {
    this.canvasHostRef.nativeElement.parentElement?.focus({ preventScroll: true });
    if (this.showPresetsMenu()) this.showPresetsMenu.set(false);
    if (this.inlineEdit()) {
      this.commitInlineEdit();
    }
    const canvas = this.canvasElRef.nativeElement;
    canvas.setPointerCapture?.(e.pointerId);
    const { sx, sy, wx, wy } = this.localCoords(e);

    // Middle click, Space+drag, Hand tool, or ReadOnly -> Pan
    if (e.button === 1 || this.spacePressed() || this.activeTool() === 'hand' || this.readOnly) {
      this.interaction = {
        kind: 'pan',
        startScreenX: sx,
        startScreenY: sy,
        origScrollX: this.scrollX(),
        origScrollY: this.scrollY(),
      };
      this.cursorStyle.set('grabbing');
      return;
    }

    if (e.button !== 0) return;

    const tool = this.activeTool();

    if (tool === 'eraser') {
      const hit = hitTestElement(wx, wy, this.elements, this.zoom());
      if (hit) {
        this.pushUndoSnapshot();
        this.elements = this.elements.filter((el) => el.id !== hit.id);
        this.interaction = { kind: 'erase', erasedAny: true };
        this.scheduleRender();
      } else {
        this.interaction = { kind: 'erase', erasedAny: false };
      }
      return;
    }

    if (tool === 'text') {
      const id = createCanvasId();
      const newText: CanvasElement = {
        id,
        type: 'text',
        x: wx,
        y: wy,
        width: 160,
        height: this.fontSize() * 1.4,
        strokeColor: this.strokeColor(),
        backgroundColor: 'transparent',
        strokeWidth: this.strokeWidth(),
        strokeStyle: 'solid',
        opacity: this.opacity(),
        text: '',
        fontSize: this.fontSize(),
        textAlign: 'left',
      };
      this.pushUndoSnapshot();
      this.elements = [...this.elements, newText];
      this.selectedIds.set(new Set([id]));
      this.openInlineEditor(newText);
      this.scheduleRender();
      return;
    }

    if (tool === 'select') {
      const selectedEls = this.elements.filter((el) => this.selectedIds().has(el.id));
      const vpNow = {
        scrollX: this.scrollX(),
        scrollY: this.scrollY(),
        zoom: this.zoom(),
      };
      const branchDir = hitTestBranchHandle(sx, sy, selectedEls, vpNow);
      if (branchDir) {
        this.branchFromSelected(branchDir);
        return;
      }
      const handle = hitTestResizeHandle(sx, sy, selectedEls, vpNow);
      if (handle && selectedEls.length === 1) {
        this.pushUndoSnapshot();
        this.interaction = {
          kind: 'resize',
          elementId: selectedEls[0].id,
          handle,
          startX: wx,
          startY: wy,
          original: cloneElements([selectedEls[0]])[0],
        };
        return;
      }

      const hit = hitTestElement(wx, wy, this.elements, this.zoom());
      if (hit) {
        const nextSel = new Set(e.shiftKey ? this.selectedIds() : []);
        if (e.shiftKey && nextSel.has(hit.id)) {
          nextSel.delete(hit.id);
        } else {
          if (!this.selectedIds().has(hit.id) || e.shiftKey) {
            nextSel.add(hit.id);
          } else {
            this.selectedIds().forEach((id) => nextSel.add(id));
          }
        }
        this.selectedIds.set(nextSel);
        this.syncInspectorFromSelection();

        const originals = new Map<string, CanvasElement>();
        for (const el of this.elements) {
          if (nextSel.has(el.id)) originals.set(el.id, cloneElements([el])[0]);
        }
        this.interaction = { kind: 'move', startX: wx, startY: wy, originals, moved: false };
        this.cursorStyle.set('move');
        this.scheduleRender();
      } else {
        if (!e.shiftKey) this.selectedIds.set(new Set());
        this.interaction = { kind: 'marquee', startX: wx, startY: wy, currentX: wx, currentY: wy };
        this.scheduleRender();
      }
      return;
    }

    // Drawing tools: rectangle, diamond, ellipse, arrow, line, freedraw
    if (tool === 'hand') return;
    const id = createCanvasId();
    const isLinear = tool === 'arrow' || tool === 'line' || tool === 'freedraw';
    const isConnector = tool === 'arrow' || tool === 'line';
    const startSnap = isConnector ? findSnapTarget(wx, wy, this.elements, new Set()) : null;
    const startAnchor = startSnap ? getShapeAnchor(startSnap, wx, wy) : null;
    const startX = startAnchor ? startAnchor.x : wx;
    const startY = startAnchor ? startAnchor.y : wy;
    const newEl: CanvasElement = {
      id,
      type: tool,
      x: startX,
      y: startY,
      width: 0,
      height: 0,
      strokeColor: this.strokeColor(),
      backgroundColor: isLinear ? 'transparent' : this.backgroundColor(),
      strokeWidth: this.strokeWidth(),
      strokeStyle: tool === 'freedraw' ? 'solid' : this.strokeStyle(),
      opacity: this.opacity(),
      roundness: tool === 'rectangle' ? 8 : 0,
      ...(isConnector ? { routing: this.arrowRouting() } : {}),
      ...(startSnap ? { startBinding: { elementId: startSnap.id } } : {}),
      ...(isLinear ? { points: [[0, 0]] } : {}),
    };
    this.snapTargetId = startSnap?.id ?? null;
    this.pushUndoSnapshot();
    this.elements = [...this.elements, newEl];
    this.selectedIds.set(new Set([id]));
    this.interaction = { kind: 'draw', elementId: id, startX, startY };
    this.scheduleRender();
  }

  onPointerMove(e: PointerEvent): void {
    const { sx, sy, wx, wy } = this.localCoords(e);

    if (this.interaction.kind === 'pan') {
      const dx = (sx - this.interaction.startScreenX) / this.zoom();
      const dy = (sy - this.interaction.startScreenY) / this.zoom();
      this.scrollX.set(this.interaction.origScrollX + dx);
      this.scrollY.set(this.interaction.origScrollY + dy);
      this.scheduleRender();
      return;
    }

    if (this.interaction.kind === 'erase') {
      const hit = hitTestElement(wx, wy, this.elements, this.zoom());
      if (hit) {
        if (!this.interaction.erasedAny) {
          this.pushUndoSnapshot();
          this.interaction.erasedAny = true;
        }
        this.elements = this.elements.filter((el) => el.id !== hit.id);
        this.scheduleRender();
      }
      return;
    }

    if (this.interaction.kind === 'draw') {
      const draw = this.interaction;
      const idx = this.elements.findIndex((el) => el.id === draw.elementId);
      if (idx < 0) return;
      const el = this.elements[idx];
      if (el.type === 'freedraw') {
        const pts: [number, number][] = el.points ? [...el.points] : [[0, 0]];
        const rx = wx - el.x;
        const ry = wy - el.y;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(rx - last[0], ry - last[1]) >= 2 / this.zoom()) {
          pts.push([rx, ry]);
          this.elements[idx] = { ...el, points: pts };
          this.scheduleRender();
        }
      } else if (el.type === 'line' || el.type === 'arrow') {
        const exclude = new Set<string>([el.id]);
        if (el.startBinding?.elementId) exclude.add(el.startBinding.elementId);
        const endSnap = findSnapTarget(wx, wy, this.elements, exclude);
        this.snapTargetId = endSnap?.id ?? null;

        const startNode = el.startBinding
          ? this.elements.find((item) => item.id === el.startBinding?.elementId)
          : undefined;
        let sxPos = draw.startX;
        let syPos = draw.startY;
        let exPos = wx;
        let eyPos = wy;
        let startSide: 'top' | 'right' | 'bottom' | 'left' | undefined;
        let endSide: 'top' | 'right' | 'bottom' | 'left' | undefined;

        if (startNode && endSnap) {
          const sb = getElementBounds(startNode);
          const eb = getElementBounds(endSnap);
          const sa = getShapeAnchor(startNode, eb.minX + eb.width / 2, eb.minY + eb.height / 2);
          const ea = getShapeAnchor(endSnap, sb.minX + sb.width / 2, sb.minY + sb.height / 2);
          sxPos = sa.x;
          syPos = sa.y;
          startSide = sa.side;
          exPos = ea.x;
          eyPos = ea.y;
          endSide = ea.side;
        } else if (startNode) {
          const sa = getShapeAnchor(startNode, exPos, eyPos);
          sxPos = sa.x;
          syPos = sa.y;
          startSide = sa.side;
        } else if (endSnap) {
          const ea = getShapeAnchor(endSnap, sxPos, syPos);
          exPos = ea.x;
          eyPos = ea.y;
          endSide = ea.side;
        }

        let dx = exPos - sxPos;
        let dy = eyPos - syPos;
        if (e.shiftKey && !endSnap) {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          dx = Math.cos(angle) * len;
          dy = Math.sin(angle) * len;
          exPos = sxPos + dx;
          eyPos = syPos + dy;
        }
        const routing = el.routing || this.arrowRouting();
        const pts = computeConnectorPoints(sxPos, syPos, exPos, eyPos, routing, startSide, endSide);
        this.elements[idx] = {
          ...el,
          x: sxPos,
          y: syPos,
          width: dx,
          height: dy,
          routing,
          endBinding: endSnap ? { elementId: endSnap.id } : null,
          points: pts,
        };
        this.scheduleRender();
      } else {
        let dx = wx - draw.startX;
        let dy = wy - draw.startY;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * side;
          dy = Math.sign(dy || 1) * side;
        }
        this.elements[idx] = {
          ...el,
          x: dx < 0 ? draw.startX + dx : draw.startX,
          y: dy < 0 ? draw.startY + dy : draw.startY,
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
        this.scheduleRender();
      }
      return;
    }

    if (this.interaction.kind === 'move') {
      const dx = wx - this.interaction.startX;
      const dy = wy - this.interaction.startY;
      if (!this.interaction.moved && Math.hypot(dx, dy) > 2 / this.zoom()) {
        this.pushUndoSnapshot();
        this.interaction.moved = true;
      }
      if (this.interaction.moved) {
        this.elements = syncBoundArrows(
          this.elements.map((el) => {
            const orig = this.interaction.kind === 'move' ? this.interaction.originals.get(el.id) : undefined;
            if (!orig) return el;
            return { ...el, x: orig.x + dx, y: orig.y + dy };
          }),
        );
        this.scheduleRender();
      }
      return;
    }

    if (this.interaction.kind === 'resize') {
      const resize = this.interaction;
      const idx = this.elements.findIndex((el) => el.id === resize.elementId);
      if (idx < 0) return;
      const orig = resize.original;
      const ob = getElementBounds(orig);
      const dx = wx - resize.startX;
      const dy = wy - resize.startY;
      let minX = ob.minX;
      let minY = ob.minY;
      let maxX = ob.maxX;
      let maxY = ob.maxY;
      const h = resize.handle;
      if (h.includes('w')) minX = Math.min(ob.maxX - 8, ob.minX + dx);
      if (h.includes('e')) maxX = Math.max(ob.minX + 8, ob.maxX + dx);
      if (h.includes('n')) minY = Math.min(ob.maxY - 8, ob.minY + dy);
      if (h.includes('s')) maxY = Math.max(ob.minY + 8, ob.maxY + dy);

      const newW = Math.max(8, maxX - minX);
      const newH = Math.max(8, maxY - minY);

      if ((orig.type === 'freedraw' || orig.type === 'line' || orig.type === 'arrow') && orig.points?.length) {
        const scaleX = newW / Math.max(1, ob.width);
        const scaleY = newH / Math.max(1, ob.height);
        const scaledPoints = orig.points.map(([px, py]) => [
          (orig.x + px - ob.minX) * scaleX,
          (orig.y + py - ob.minY) * scaleY,
        ] as [number, number]);
        this.elements[idx] = {
          ...orig,
          x: minX,
          y: minY,
          width: newW,
          height: newH,
          points: scaledPoints,
        };
      } else {
        this.elements[idx] = {
          ...orig,
          x: minX,
          y: minY,
          width: newW,
          height: newH,
        };
      }
      this.elements = syncBoundArrows(this.elements);
      this.scheduleRender();
      return;
    }

    if (this.interaction.kind === 'marquee') {
      this.interaction.currentX = wx;
      this.interaction.currentY = wy;
      const inside = elementsInBox(
        this.elements,
        this.interaction.startX,
        this.interaction.startY,
        wx,
        wy,
      );
      this.selectedIds.set(new Set(inside.map((el) => el.id)));
      this.scheduleRender();
      return;
    }

    // Hover cursor updates in select mode
    if (this.activeTool() === 'select' && !this.spacePressed() && !this.readOnly) {
      const selectedEls = this.elements.filter((el) => this.selectedIds().has(el.id));
      const vpNow = {
        scrollX: this.scrollX(),
        scrollY: this.scrollY(),
        zoom: this.zoom(),
      };
      if (hitTestBranchHandle(sx, sy, selectedEls, vpNow)) {
        this.cursorStyle.set('pointer');
      } else {
        const handle = hitTestResizeHandle(sx, sy, selectedEls, vpNow);
        if (handle) {
          this.cursorStyle.set(this.cursorForHandle(handle));
        } else if (hitTestElement(wx, wy, this.elements, this.zoom())) {
          this.cursorStyle.set('move');
        } else {
          this.cursorStyle.set('default');
        }
      }
    }
  }

  onPointerUp(e: PointerEvent): void {
    this.canvasElRef.nativeElement.releasePointerCapture?.(e.pointerId);
    const mode = this.interaction;
    this.interaction = { kind: 'idle' };
    this.snapTargetId = null;
    this.updateIdleCursor();

    if (mode.kind === 'draw') {
      const el = this.elements.find((item) => item.id === mode.elementId);
      if (el) {
        const b = getElementBounds(el);
        const tooSmall = el.type !== 'freedraw' && b.width < 4 && b.height < 4;
        if (tooSmall) {
          this.elements = this.elements.filter((item) => item.id !== mode.elementId);
          this.undoStack.pop();
          this.canUndo.set(this.undoStack.length > 0);
          this.selectedIds.set(new Set());
        } else {
          if (el.type !== 'freedraw') {
            this.activeTool.set('select');
          }
          this.emitSceneChange();
        }
      }
      this.scheduleRender();
    } else if (mode.kind === 'move' && mode.moved) {
      this.emitSceneChange();
    } else if (mode.kind === 'resize') {
      this.emitSceneChange();
    } else if (mode.kind === 'erase' && mode.erasedAny) {
      this.emitSceneChange();
    } else if (mode.kind === 'marquee') {
      this.syncInspectorFromSelection();
      this.scheduleRender();
    }
  }

  onDoubleClick(e: MouseEvent): void {
    if (this.readOnly) return;
    const { wx, wy } = this.localCoords(e);
    const hit = hitTestElement(wx, wy, this.elements, this.zoom());
    if (hit && (hit.type === 'text' || hit.type === 'rectangle' || hit.type === 'diamond' || hit.type === 'ellipse')) {
      this.selectedIds.set(new Set([hit.id]));
      this.openInlineEditor(hit);
      this.scheduleRender();
    }
  }

  onWheel(e: WheelEvent): void {
    const { sx, sy } = this.localCoords(e);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAtPoint(this.zoom() * factor, sx, sy);
    } else if (!this.compact) {
      e.preventDefault();
      this.scrollX.update((x) => x - e.deltaX / this.zoom());
      this.scrollY.update((y) => y - e.deltaY / this.zoom());
      this.scheduleRender();
    }
  }

  // ---------------------------------------------------------------------------
  // Inline text / shape label editing
  // ---------------------------------------------------------------------------

  private openInlineEditor(el: CanvasElement): void {
    const b = getElementBounds(el);
    const screen = worldToScreen(b.minX, b.minY, {
      scrollX: this.scrollX(),
      scrollY: this.scrollY(),
      zoom: this.zoom(),
    });
    const centered = el.type !== 'text';
    this.inlineEdit.set({
      elementId: el.id,
      text: el.text || '',
      screenX: screen.x,
      screenY: screen.y,
      width: Math.max(120, b.width * this.zoom()),
      height: Math.max(36, b.height * this.zoom()),
      fontSize: Math.max(12, (el.fontSize || (centered ? 16 : 18)) * this.zoom()),
      color: this.themeService.isDark() && el.strokeColor === '#1e293b' ? '#e2e8f0' : el.strokeColor,
      centered,
    });
    setTimeout(() => {
      const ta = this.inlineTextareaRef?.nativeElement;
      if (ta) {
        ta.focus();
        ta.select();
      }
    }, 0);
  }

  onInlineTextInput(value: string): void {
    this.inlineEdit.update((curr) => (curr ? { ...curr, text: value } : null));
  }

  onInlineTextKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      this.commitInlineEdit();
    }
    e.stopPropagation();
  }

  commitInlineEdit(): void {
    const edit = this.inlineEdit();
    if (!edit) return;
    this.inlineEdit.set(null);
    const idx = this.elements.findIndex((el) => el.id === edit.elementId);
    if (idx < 0) return;

    const el = this.elements[idx];
    const trimmed = edit.text.trim();
    if (el.type === 'text' && !trimmed) {
      this.elements = this.elements.filter((item) => item.id !== el.id);
      this.selectedIds.set(new Set());
      this.scheduleRender();
      this.emitSceneChange();
      return;
    }

    if (el.type === 'text') {
      const lines = edit.text.split('\n');
      const fs = el.fontSize || 18;
      const longest = Math.max(4, ...lines.map((l) => l.length));
      this.elements[idx] = {
        ...el,
        text: edit.text,
        width: Math.max(60, longest * fs * 0.62),
        height: Math.max(fs * 1.4, lines.length * fs * 1.35),
      };
      this.activeTool.set('select');
    } else {
      this.elements[idx] = { ...el, text: edit.text };
    }
    this.scheduleRender();
    this.emitSceneChange();
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (this.inlineEdit()) return;
    if (this.compact && !this.canvasHostRef.nativeElement.parentElement?.contains(document.activeElement)) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (e.code === 'Space') {
      this.spacePressed.set(true);
      this.cursorStyle.set('grab');
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if ((ctrl && key === 'y') || (ctrl && e.shiftKey && key === 'z')) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && key === 'd') {
      e.preventDefault();
      this.duplicateSelected();
      return;
    }
    if (ctrl && key === 'c' && this.selectedIds().size > 0) {
      this.clipboard = cloneElements(this.elements.filter((el) => this.selectedIds().has(el.id)));
      return;
    }
    if (ctrl && key === 'v' && this.clipboard.length > 0 && !this.readOnly) {
      e.preventDefault();
      const pasted = this.clipboard.map((el) => ({
        ...cloneElements([el])[0],
        id: createCanvasId(),
        x: el.x + 24,
        y: el.y + 24,
      }));
      this.pushUndoSnapshot();
      this.elements = [...this.elements, ...pasted];
      this.selectedIds.set(new Set(pasted.map((p) => p.id)));
      this.scheduleRender();
      this.emitSceneChange();
      return;
    }
    if (ctrl && key === 'a' && !this.readOnly) {
      e.preventDefault();
      this.selectedIds.set(new Set(this.elements.map((el) => el.id)));
      this.scheduleRender();
      return;
    }

    // Ctrl + Arrow keys: create connected branch node (tree / flowchart / mind map)
    if (ctrl && !this.readOnly && this.selectedIds().size === 1) {
      const dirMap: Record<string, BranchDirection> = {
        ArrowUp: 'up',
        ArrowRight: 'right',
        ArrowDown: 'down',
        ArrowLeft: 'left',
      };
      const dir = dirMap[e.key];
      if (dir && this.branchFromSelected(dir)) {
        e.preventDefault();
        return;
      }
    }

    // Enter on a single selected shape/text: edit label inline
    if (e.key === 'Enter' && !ctrl && !e.altKey && !this.readOnly && this.selectedIds().size === 1) {
      const id = this.selectedIds().values().next().value;
      const el = this.elements.find((item) => item.id === id);
      if (el && (el.type === 'text' || isConnectableShape(el))) {
        e.preventDefault();
        this.openInlineEditor(el);
        this.scheduleRender();
        return;
      }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds().size > 0 && !this.readOnly) {
      e.preventDefault();
      this.deleteSelected();
      return;
    }

    if (ctrl || e.altKey || this.readOnly) return;

    const toolShortcuts: Record<string, CanvasTool> = {
      h: 'hand',
      v: 'select',
      '1': 'select',
      r: 'rectangle',
      '2': 'rectangle',
      d: 'diamond',
      '3': 'diamond',
      o: 'ellipse',
      '4': 'ellipse',
      a: 'arrow',
      '5': 'arrow',
      l: 'line',
      '6': 'line',
      p: 'freedraw',
      '7': 'freedraw',
      t: 'text',
      '8': 'text',
      e: 'eraser',
      '9': 'eraser',
    };
    if (toolShortcuts[key]) {
      this.setTool(toolShortcuts[key]);
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spacePressed.set(false);
      this.updateIdleCursor();
    }
  }

  private syncInspectorFromSelection(): void {
    const sel = this.selectedIds();
    const selectedShapes = this.elements.filter((item) => sel.has(item.id) && isConnectableShape(item));
    if (selectedShapes.length > 0) {
      const firstType = selectedShapes[0].type as 'rectangle' | 'diamond' | 'ellipse';
      this.selectedShapeType.set(selectedShapes.every((s) => s.type === firstType) ? firstType : null);
    } else {
      this.selectedShapeType.set(null);
    }
    if (sel.size !== 1) return;
    const el = this.elements.find((item) => sel.has(item.id));
    if (!el) return;
    this.strokeColor.set(el.strokeColor);
    this.backgroundColor.set(el.backgroundColor);
    this.strokeWidth.set(el.strokeWidth);
    this.strokeStyle.set(el.strokeStyle);
    this.opacity.set(el.opacity);
    if (el.fontSize) this.fontSize.set(el.fontSize);
    if (el.routing) this.arrowRouting.set(el.routing);
  }

  private updateIdleCursor(): void {
    if (this.readOnly || this.activeTool() === 'hand' || this.spacePressed()) {
      this.cursorStyle.set('grab');
    } else if (this.activeTool() === 'select') {
      this.cursorStyle.set('default');
    } else if (this.activeTool() === 'text') {
      this.cursorStyle.set('text');
    } else {
      this.cursorStyle.set('crosshair');
    }
  }

  private cursorForHandle(handle: ResizeHandle): string {
    switch (handle) {
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
    }
  }
}
