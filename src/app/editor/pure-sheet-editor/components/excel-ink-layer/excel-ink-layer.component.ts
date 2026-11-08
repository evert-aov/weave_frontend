import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { DrawToolId, InkPenConfig, InkPoint, InkStroke } from '../../models/excel.model';

type Bounds = { x: number; y: number; width: number; height: number };

@Component({
  selector: 'app-excel-ink-layer', standalone: true,
  template: `
    <svg class="ink-surface" [attr.width]="width" [attr.height]="height" [class.interactive]="interactive"
      [class.erasing]="tool === 'eraser'" (pointerdown)="start($event)" (pointermove)="move($event)"
      (pointerup)="finish($event)" (pointercancel)="cancel()">
      <defs><linearGradient id="sheet-galaxy-ink"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs>
      @for (stroke of displayed; track stroke.id) {
        <path [attr.d]="path(stroke)" fill="none" [attr.stroke]="stroke.isGalaxy ? 'url(#sheet-galaxy-ink)' : stroke.color"
          [attr.stroke-width]="stroke.strokeWidth" [attr.opacity]="stroke.opacity" stroke-linecap="round" stroke-linejoin="round" pointer-events="none" />
        <path class="stroke-hit" [attr.d]="path(stroke)" fill="none" stroke="transparent" [attr.stroke-width]="Math.max(12, stroke.strokeWidth)"
          [style.pointer-events]="!locked && (!interactive || tool === 'select') ? 'stroke' : 'none'" (pointerdown)="selectStroke($event, stroke)" />
      }
      @if (draft) {
        <path [attr.d]="path(draft)" fill="none" [attr.stroke]="draft.isGalaxy ? 'url(#sheet-galaxy-ink)' : draft.color" [attr.stroke-width]="draft.strokeWidth" [attr.opacity]="draft.opacity" stroke-linecap="round" stroke-linejoin="round" pointer-events="none" />
      }
      @if (selectionBounds; as box) {
        <rect class="selection" [attr.x]="box.x - 5" [attr.y]="box.y - 5" [attr.width]="box.width + 10" [attr.height]="box.height + 10"
          fill="transparent" stroke="#059669" stroke-width="1" stroke-dasharray="4 3" (pointerdown)="startTransform($event, false)" />
        <circle class="resize" [attr.cx]="box.x + box.width + 5" [attr.cy]="box.y + box.height + 5" r="5" fill="#059669" stroke="white" (pointerdown)="startTransform($event, true)" />
        <g class="delete" role="button" aria-label="Eliminar dibujo" tabindex="0" (pointerdown)="$event.stopPropagation()" (click)="removeSelected()" (keydown.enter)="removeSelected()">
          <rect [attr.x]="box.x + box.width - 17" [attr.y]="box.y - 26" width="22" height="20" rx="3" fill="white" stroke="#cbd5e1"/>
          <text [attr.x]="box.x + box.width - 6" [attr.y]="box.y - 12" text-anchor="middle" fill="#475569" font-size="16">×</text>
        </g>
      }
      @if (lasso; as box) { <rect [attr.x]="box.x" [attr.y]="box.y" [attr.width]="box.width" [attr.height]="box.height" fill="#3b82f61a" stroke="#3b82f6" stroke-dasharray="4 3" pointer-events="none"/> }
    </svg>`,
  styles: [`
    :host { position: absolute; left: 0; top: 0; z-index: 36; pointer-events: none; }
    .ink-surface { display: block; overflow: visible; pointer-events: none; touch-action: none; }
    .interactive { pointer-events: all; cursor: crosshair; }
    .erasing { cursor: cell; }
    .stroke-hit, .selection { cursor: move; }
    .selection, .resize, .delete { pointer-events: all; }
    .resize { cursor: nwse-resize; }
    .delete { cursor: pointer; }
  `],
})
export class ExcelInkLayerComponent {
  @Input() strokes: InkStroke[] = [];
  @Input() tool: DrawToolId = 'select';
  @Input() pen?: InkPenConfig;
  @Input() enabled = false;
  @Input() locked = false;
  @Input() inkToShape = false;
  @Input() width = 2200;
  @Input() height = 2424;
  @Output() strokesChange = new EventEmitter<InkStroke[]>();
  @Output() select = new EventEmitter<void>();
  readonly Math = Math;
  draft: InkStroke | null = null;
  preview: InkStroke[] | null = null;
  selectedIds: string[] = [];
  lasso: Bounds | null = null;
  private gesture?: { kind: 'draw' | 'erase' | 'lasso' | 'move' | 'resize'; origin: InkPoint; original: InkStroke[]; bounds?: Bounds };
  get displayed(): InkStroke[] { return this.preview || this.strokes; }
  get interactive(): boolean { return !this.locked && this.enabled && this.tool !== 'select'; }
  get selectionBounds(): Bounds | null {
    if (this.locked) return null;
    if (this.interactive && this.tool !== 'lasso') return null;
    const points = this.displayed.filter(stroke => this.selectedIds.includes(stroke.id)).flatMap(stroke => stroke.points);
    return points.length ? this.bounds(points) : null;
  }
  bounds(points: InkPoint[]): Bounds {
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(1, Math.max(...points.map(p => p.x)) - x), height: Math.max(1, Math.max(...points.map(p => p.y)) - y) };
  }
  path(stroke: InkStroke): string {
    return stroke.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + (stroke.points.length === 1 ? ' l 0.01 0' : '');
  }
  private point(event: PointerEvent): InkPoint {
    const svg = (event.currentTarget as SVGElement).closest('svg')!;
    const rect = svg.getBoundingClientRect();
    return { x: Math.max(0, (event.clientX - rect.left) * this.width / (rect.width || this.width)), y: Math.max(0, (event.clientY - rect.top) * this.height / (rect.height || this.height)) };
  }
  private capture(event: PointerEvent): void {
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as SVGElement).closest('svg')?.setPointerCapture?.(event.pointerId);
  }
  start(event: PointerEvent): void {
    if (!this.interactive || event.button !== 0) return;
    this.capture(event); this.select.emit(); this.selectedIds = [];
    const origin = this.point(event);
    const kind = this.tool === 'eraser' ? 'erase' : this.tool === 'lasso' ? 'lasso' : 'draw';
    this.gesture = { kind, origin, original: this.strokes };
    if (kind === 'draw' && this.pen) {
      this.draft = { id: `ink-${crypto.randomUUID()}`, penId: this.pen.id, color: this.pen.color, strokeWidth: this.pen.strokeWidth, opacity: this.pen.opacity, isHighlighter: this.pen.kind === 'highlighter', isGalaxy: this.pen.kind === 'galaxy', points: [origin] };
    } else if (kind === 'erase') this.erase(origin);
  }
  selectStroke(event: PointerEvent, stroke: InkStroke): void {
    if (event.button !== 0) return;
    this.selectedIds = [stroke.id]; this.select.emit(); this.startTransform(event, false);
  }
  startTransform(event: PointerEvent, resize: boolean): void {
    const bounds = this.selectionBounds;
    if (!bounds || event.button !== 0) return;
    this.capture(event);
    this.gesture = { kind: resize ? 'resize' : 'move', origin: this.point(event), original: this.strokes, bounds };
  }
  move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const point = this.point(event);
    if (gesture.kind === 'draw' && this.draft) this.draft = { ...this.draft, points: [...this.draft.points, point] };
    else if (gesture.kind === 'erase') this.erase(point);
    else if (gesture.kind === 'lasso') this.lasso = this.bounds([gesture.origin, point]);
    else if (gesture.bounds) {
      const box = gesture.bounds;
      const dx = Math.max(-box.x, point.x - gesture.origin.x), dy = Math.max(-box.y, point.y - gesture.origin.y);
      const sx = Math.max(4, box.width + point.x - gesture.origin.x) / box.width;
      const sy = Math.max(4, box.height + point.y - gesture.origin.y) / box.height;
      this.preview = gesture.original.map(stroke => this.selectedIds.includes(stroke.id) ? { ...stroke, points: stroke.points.map(p => gesture.kind === 'resize' ? { x: box.x + (p.x - box.x) * sx, y: box.y + (p.y - box.y) * sy } : { x: p.x + dx, y: p.y + dy }) } : stroke);
    }
  }
  private erase(point: InkPoint): void {
    const radius = 10;
    this.preview = this.displayed.filter(stroke => !stroke.points.some((p, index) => {
      const next = stroke.points[index + 1] || p;
      const dx = next.x - p.x, dy = next.y - p.y;
      const t = Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(point.x - p.x - t * dx, point.y - p.y - t * dy) <= radius + stroke.strokeWidth / 2;
    }));
  }
  finish(event: PointerEvent): void {
    if (!this.gesture) return;
    if (this.gesture.kind === 'draw' && this.draft) {
      let stroke = this.draft;
      if (this.inkToShape && stroke.points.length > 1) {
        const box = this.bounds(stroke.points);
        const first = stroke.points[0], last = stroke.points[stroke.points.length - 1];
        const diagonal = Math.hypot(box.width, box.height);
        const length = stroke.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - stroke.points[index].x, point.y - stroke.points[index].y), 0);
        if (Math.hypot(first.x - last.x, first.y - last.y) < diagonal * 0.25 && box.width > 10 && box.height > 10) {
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          let ellipseError = 0, rectangleError = 0;
          for (const point of stroke.points) {
            const nx = Math.abs(point.x - cx) / (box.width / 2), ny = Math.abs(point.y - cy) / (box.height / 2);
            ellipseError += Math.abs(Math.hypot(nx, ny) - 1);
            rectangleError += Math.min(Math.abs(nx - 1), Math.abs(ny - 1));
          }
          const ellipse = ellipseError < rectangleError;
          stroke = { ...stroke, shapeType: ellipse ? 'ellipse' : 'rectangle', points: ellipse
            ? Array.from({ length: 49 }, (_, index) => ({ x: cx + Math.cos(index / 48 * Math.PI * 2) * box.width / 2, y: cy + Math.sin(index / 48 * Math.PI * 2) * box.height / 2 }))
            : [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y }, { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }, { x: box.x, y: box.y }] };
        } else if (length <= Math.hypot(first.x - last.x, first.y - last.y) * 1.12) {
          stroke = { ...stroke, shapeType: 'line', points: [first, last] };
        }
      }
      this.strokesChange.emit([...this.strokes, stroke]);
    } else if (this.gesture.kind === 'lasso' && this.lasso) {
      const box = this.lasso;
      this.selectedIds = this.strokes.filter(stroke => stroke.points.some(p => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height)).map(stroke => stroke.id);
    } else if (this.preview) this.strokesChange.emit(this.preview);
    (event.currentTarget as SVGElement).closest('svg')?.releasePointerCapture?.(event.pointerId);
    this.cancel();
  }
  cancel(): void { this.draft = null; this.preview = null; this.gesture = undefined; this.lasso = null; }
  clearSelection(): void { this.selectedIds = []; this.cancel(); }
  removeSelected(): void {
    if (!this.selectedIds.length) return;
    this.strokesChange.emit(this.strokes.filter(stroke => !this.selectedIds.includes(stroke.id)));
    this.selectedIds = [];
  }
  @HostListener('window:keydown', ['$event']) keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Escape') { this.cancel(); this.selectedIds = []; }
    if (this.selectionBounds && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); this.removeSelected(); }
  }
}
