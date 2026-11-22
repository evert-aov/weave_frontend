import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  ViewChild,
} from '@angular/core';
import { DrawToolId, InkPenConfig, InkPoint, InkStroke } from '../../models/excel.model';
import {
  InkBounds,
  hitTestInkSelection,
  hitTestInkStroke,
  paintInkCanvas,
  pointsBounds,
} from '../../services/ink-canvas-renderer';

type Bounds = InkBounds;

@Component({
  selector: 'app-excel-ink-layer',
  standalone: true,
  template: `
    <canvas
      #inkCanvas
      class="ink-surface"
      role="img"
      [attr.aria-label]="'Capa de tinta con ' + displayed.length + ' trazos'"
      [attr.data-stroke-count]="displayed.length"
      [class.interactive]="interactive"
      [class.erasing]="tool === 'eraser'"
      [style.width.px]="surfaceWidth"
      [style.height.px]="surfaceHeight"
      (pointerdown)="start($event)"
      (pointermove)="move($event)"
      (pointerup)="finish($event)"
      (pointercancel)="cancel()"
    ></canvas>
    @if (selectionBounds; as box) {
      <div
        class="selection-overlay"
        [style.left.px]="(box.x - effectiveScrollLeft - 5) * (zoom || 1)"
        [style.top.px]="(box.y - effectiveScrollTop - 5) * (zoom || 1)"
        [style.width.px]="(box.width + 10) * (zoom || 1)"
        [style.height.px]="(box.height + 10) * (zoom || 1)"
        (pointerdown)="startTransform($event, false)"
      >
        <button
          type="button"
          class="resize"
          aria-label="Cambiar tamaño de dibujo"
          (pointerdown)="startTransform($event, true)"
        ></button>
        <button
          type="button"
          class="delete"
          aria-label="Eliminar dibujo"
          (pointerdown)="$event.stopPropagation()"
          (click)="removeSelected()"
        ></button>
      </div>
    }
  `,
  styles: [`
    :host { position: absolute; left: 0; top: 0; z-index: 36; pointer-events: none; }
    .ink-surface { display: block; pointer-events: none; touch-action: none; }
    .interactive { pointer-events: all; cursor: crosshair; }
    .erasing { cursor: cell; }
    .selection-overlay { position: absolute; pointer-events: all; cursor: move; background: transparent; }
    .resize { position: absolute; right: -5px; bottom: -5px; width: 12px; height: 12px; border: 0; padding: 0; background: transparent; cursor: nwse-resize; pointer-events: all; }
    .delete { position: absolute; right: 0; top: -22px; width: 22px; height: 20px; border: 0; padding: 0; background: transparent; cursor: pointer; pointer-events: all; }
  `],
})
export class ExcelInkLayerComponent implements AfterViewInit, OnChanges {
  @Input() strokes: InkStroke[] = [];
  @Input() tool: DrawToolId = 'select';
  @Input() pen?: InkPenConfig;
  @Input() enabled = false;
  @Input() locked = false;
  @Input() inkToShape = false;
  @Input() width = 2200;
  @Input() height = 2424;
  @Input() scrollLeft = 0;
  @Input() scrollTop = 0;
  @Input() viewportWidth = 0;
  @Input() viewportHeight = 0;
  @Input() zoom = 1;
  @Output() strokesChange = new EventEmitter<InkStroke[]>();
  @Output() select = new EventEmitter<void>();

  readonly Math = Math;
  draft: InkStroke | null = null;
  preview: InkStroke[] | null = null;
  selectedIds: string[] = [];
  lasso: Bounds | null = null;
  private canvasEl?: HTMLCanvasElement;
  private gesture?: {
    kind: 'draw' | 'erase' | 'lasso' | 'move' | 'resize';
    origin: InkPoint;
    original: InkStroke[];
    bounds?: Bounds;
  };

  @ViewChild('inkCanvas') set inkCanvas(el: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = el?.nativeElement;
    if (this.canvasEl) this.paintCanvas();
  }

  get useViewportCulling(): boolean {
    return this.viewportWidth > 0 && this.viewportHeight > 0;
  }

  get effectiveScrollLeft(): number {
    return this.useViewportCulling ? this.scrollLeft : 0;
  }

  get effectiveScrollTop(): number {
    return this.useViewportCulling ? this.scrollTop : 0;
  }

  get surfaceWidth(): number {
    return Math.max(1, this.useViewportCulling ? this.viewportWidth : this.width);
  }

  get surfaceHeight(): number {
    return Math.max(1, this.useViewportCulling ? this.viewportHeight : this.height);
  }

  get displayed(): InkStroke[] {
    return this.preview || this.strokes;
  }

  get interactive(): boolean {
    return !this.locked && this.enabled && this.tool !== 'select';
  }

  get selectionBounds(): Bounds | null {
    if (this.locked) return null;
    if (this.interactive && this.tool !== 'lasso') return null;
    const points = this.displayed.filter((stroke) => this.selectedIds.includes(stroke.id)).flatMap((stroke) => stroke.points);
    return points.length ? this.bounds(points) : null;
  }

  ngAfterViewInit(): void {
    this.paintCanvas();
  }

  ngOnChanges(): void {
    this.paintCanvas();
  }

  paintCanvas(): void {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const z = this.zoom || 1;
    const w = this.surfaceWidth;
    const h = this.surfaceHeight;
    const cssW = Math.max(1, Math.round(w * z));
    const cssH = Math.max(1, Math.round(h * z));
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintInkCanvas(ctx, {
      strokes: this.displayed,
      draft: this.draft,
      selectedIds: this.selectedIds,
      selectionBounds: this.selectionBounds,
      lasso: this.lasso,
      width: w,
      height: h,
      scrollLeft: this.effectiveScrollLeft,
      scrollTop: this.effectiveScrollTop,
      dpr: dpr * z,
    });
  }

  bounds(points: InkPoint[]): Bounds {
    return pointsBounds(points);
  }

  private point(event: PointerEvent): InkPoint {
    const canvas = this.canvasEl || (event.currentTarget as HTMLElement);
    const rect = canvas.getBoundingClientRect();
    const w = this.surfaceWidth;
    const h = this.surfaceHeight;
    const localX = (event.clientX - rect.left) * w / (rect.width || w);
    const localY = (event.clientY - rect.top) * h / (rect.height || h);
    return {
      x: Math.max(0, localX + this.effectiveScrollLeft),
      y: Math.max(0, localY + this.effectiveScrollTop),
    };
  }

  private capture(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.canvasEl?.setPointerCapture?.(event.pointerId);
  }

  trySelectStrokeAtWorld(worldX: number, worldY: number, event: PointerEvent): boolean {
    if (this.locked || (this.interactive && this.tool !== 'select')) return false;
    const selHit = hitTestInkSelection(worldX, worldY, this.selectionBounds);
    if (selHit === 'delete') {
      this.removeSelected();
      return true;
    }
    if (selHit === 'resize') {
      this.startTransform(event, true);
      return true;
    }
    if (selHit === 'body') {
      this.startTransform(event, false);
      return true;
    }
    const stroke = hitTestInkStroke(worldX, worldY, this.displayed);
    if (!stroke) return false;
    this.selectStroke(event, stroke);
    return true;
  }

  start(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (!this.interactive) {
      if (!this.locked) {
        const pt = this.point(event);
        this.trySelectStrokeAtWorld(pt.x, pt.y, event);
      }
      return;
    }
    this.capture(event);
    this.select.emit();
    this.selectedIds = [];
    const origin = this.point(event);
    const kind = this.tool === 'eraser' ? 'erase' : this.tool === 'lasso' ? 'lasso' : 'draw';
    this.gesture = { kind, origin, original: this.strokes };
    if (kind === 'draw' && this.pen) {
      this.draft = {
        id: `ink-${crypto.randomUUID()}`,
        penId: this.pen.id,
        color: this.pen.color,
        strokeWidth: this.pen.strokeWidth,
        opacity: this.pen.opacity,
        isHighlighter: this.pen.kind === 'highlighter',
        isGalaxy: this.pen.kind === 'galaxy',
        points: [origin],
      };
    } else if (kind === 'erase') {
      this.erase(origin);
    }
    this.paintCanvas();
  }

  selectStroke(event: PointerEvent, stroke: InkStroke): void {
    if (event.button !== 0) return;
    this.selectedIds = [stroke.id];
    this.select.emit();
    this.startTransform(event, false);
  }

  startTransform(event: PointerEvent, resize: boolean): void {
    const bounds = this.selectionBounds;
    if (!bounds || event.button !== 0) return;
    this.capture(event);
    this.gesture = { kind: resize ? 'resize' : 'move', origin: this.point(event), original: this.strokes, bounds };
    this.paintCanvas();
  }

  move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const point = this.point(event);
    if (gesture.kind === 'draw' && this.draft) {
      this.draft = { ...this.draft, points: [...this.draft.points, point] };
    } else if (gesture.kind === 'erase') {
      this.erase(point);
    } else if (gesture.kind === 'lasso') {
      this.lasso = this.bounds([gesture.origin, point]);
    } else if (gesture.bounds) {
      const box = gesture.bounds;
      const dx = Math.max(-box.x, point.x - gesture.origin.x);
      const dy = Math.max(-box.y, point.y - gesture.origin.y);
      const sx = Math.max(4, box.width + point.x - gesture.origin.x) / box.width;
      const sy = Math.max(4, box.height + point.y - gesture.origin.y) / box.height;
      this.preview = gesture.original.map((stroke) =>
        this.selectedIds.includes(stroke.id)
          ? {
              ...stroke,
              points: stroke.points.map((p) =>
                gesture.kind === 'resize'
                  ? { x: box.x + (p.x - box.x) * sx, y: box.y + (p.y - box.y) * sy }
                  : { x: p.x + dx, y: p.y + dy }
              ),
            }
          : stroke
      );
    }
    this.paintCanvas();
  }

  private erase(point: InkPoint): void {
    const radius = 10;
    this.preview = this.displayed.filter(
      (stroke) =>
        !stroke.points.some((p, index) => {
          const next = stroke.points[index + 1] || p;
          const dx = next.x - p.x;
          const dy = next.y - p.y;
          const t = Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(point.x - p.x - t * dx, point.y - p.y - t * dy) <= radius + stroke.strokeWidth / 2;
        })
    );
  }

  finish(event: PointerEvent): void {
    if (!this.gesture) return;
    if (this.gesture.kind === 'draw' && this.draft) {
      let stroke = this.draft;
      if (this.inkToShape && stroke.points.length > 1) {
        const box = this.bounds(stroke.points);
        const first = stroke.points[0];
        const last = stroke.points[stroke.points.length - 1];
        const diagonal = Math.hypot(box.width, box.height);
        const length = stroke.points
          .slice(1)
          .reduce((sum, point, index) => sum + Math.hypot(point.x - stroke.points[index].x, point.y - stroke.points[index].y), 0);
        if (Math.hypot(first.x - last.x, first.y - last.y) < diagonal * 0.25 && box.width > 10 && box.height > 10) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          let ellipseError = 0;
          let rectangleError = 0;
          for (const point of stroke.points) {
            const nx = Math.abs(point.x - cx) / (box.width / 2);
            const ny = Math.abs(point.y - cy) / (box.height / 2);
            ellipseError += Math.abs(Math.hypot(nx, ny) - 1);
            rectangleError += Math.min(Math.abs(nx - 1), Math.abs(ny - 1));
          }
          const ellipse = ellipseError < rectangleError;
          stroke = {
            ...stroke,
            shapeType: ellipse ? 'ellipse' : 'rectangle',
            points: ellipse
              ? Array.from({ length: 49 }, (_, index) => ({
                  x: cx + (Math.cos((index / 48) * Math.PI * 2) * box.width) / 2,
                  y: cy + (Math.sin((index / 48) * Math.PI * 2) * box.height) / 2,
                }))
              : [
                  { x: box.x, y: box.y },
                  { x: box.x + box.width, y: box.y },
                  { x: box.x + box.width, y: box.y + box.height },
                  { x: box.x, y: box.y + box.height },
                  { x: box.x, y: box.y },
                ],
          };
        } else if (length <= Math.hypot(first.x - last.x, first.y - last.y) * 1.12) {
          stroke = { ...stroke, shapeType: 'line', points: [first, last] };
        }
      }
      this.strokesChange.emit([...this.strokes, stroke]);
    } else if (this.gesture.kind === 'lasso' && this.lasso) {
      const box = this.lasso;
      this.selectedIds = this.strokes
        .filter((stroke) => stroke.points.some((p) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height))
        .map((stroke) => stroke.id);
    } else if (this.preview) {
      this.strokesChange.emit(this.preview);
    }
    this.canvasEl?.releasePointerCapture?.(event.pointerId);
    this.cancel();
  }

  cancel(): void {
    this.draft = null;
    this.preview = null;
    this.gesture = undefined;
    this.lasso = null;
    this.paintCanvas();
  }

  clearSelection(): void {
    this.selectedIds = [];
    this.cancel();
  }

  removeSelected(): void {
    if (!this.selectedIds.length) return;
    this.strokesChange.emit(this.strokes.filter((stroke) => !this.selectedIds.includes(stroke.id)));
    this.selectedIds = [];
    this.paintCanvas();
  }

  @HostListener('window:mousemove', ['$event']) onWindowMove(event: MouseEvent): void {
    if (this.gesture && (this.gesture.kind === 'move' || this.gesture.kind === 'resize')) {
      this.move(event as unknown as PointerEvent);
    }
  }

  @HostListener('window:mouseup', ['$event']) onWindowUp(event: MouseEvent): void {
    if (this.gesture && (this.gesture.kind === 'move' || this.gesture.kind === 'resize')) {
      this.finish(event as unknown as PointerEvent);
    }
  }

  @HostListener('window:keydown', ['$event']) keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Escape') {
      this.cancel();
      this.selectedIds = [];
      this.paintCanvas();
    }
    if (this.selectionBounds && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      this.removeSelected();
    }
  }
}
