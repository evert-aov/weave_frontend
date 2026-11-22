import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild, inject } from '@angular/core';
import { FloatingArtwork } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import { paintFloatingArtworkItem } from '../../services/artwork-canvas-renderer';

@Component({
  selector: 'app-excel-floating-artwork',
  standalone: true,
  template: `
    <div
      class="artwork"
      role="img"
      [attr.aria-label]="artwork.kind === 'icon' ? 'Icono ' + artwork.itemId : 'Forma ' + artwork.itemId"
      [class.selected]="selected"
      (mousedown)="begin($event, false)"
    >
      <canvas #artworkCanvas class="artwork-canvas" (mousedown)="begin($event, false)"></canvas>
      @if (selected) {
        <button type="button" class="delete" aria-label="Eliminar objeto" title="Eliminar" (mousedown)="$event.stopPropagation()" (click)="remove.emit()">×</button>
        <button type="button" class="resize" aria-label="Cambiar tamaño" (mousedown)="begin($event, true)"></button>
      }
    </div>`,
  styles: [`
    :host { display: block; position: absolute; z-index: 35; }
    .artwork { position: relative; width: 100%; height: 100%; cursor: move; user-select: none; color: #2563eb; }
    .artwork.selected { outline: 2px solid #059669; }
    .artwork-canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
    .delete { position: absolute; top: -24px; right: 0; width: 24px; height: 24px; border-radius: 4px; background: white; color: #475569; border: 1px solid #cbd5e1; cursor: pointer; }
    .resize { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; background: #059669; border: 1px solid white; border-radius: 50%; cursor: nwse-resize; }
  `],
})
export class ExcelFloatingArtworkComponent implements AfterViewInit, OnChanges {
  @Input({ required: true }) artwork!: FloatingArtwork;
  @Input() selected = false;
  @Input() zoom = 1;
  @Output() select = new EventEmitter<void>();
  @Output() beginChange = new EventEmitter<void>();
  @Output() geometryChange = new EventEmitter<Pick<FloatingArtwork, 'x' | 'y' | 'width' | 'height'>>();
  @Output() endChange = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  private readonly themeService = inject(ThemeService);
  private canvasEl?: HTMLCanvasElement;
  private drag?: { clientX: number; clientY: number; x: number; y: number; width: number; height: number; resize: boolean };

  @ViewChild('artworkCanvas') set artworkCanvas(el: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasEl = el?.nativeElement;
    if (this.canvasEl) this.paintCanvas();
  }

  ngAfterViewInit(): void {
    this.paintCanvas();
  }

  ngOnChanges(): void {
    this.paintCanvas();
  }

  paintCanvas(): void {
    const canvas = this.canvasEl;
    if (!canvas || !this.artwork) return;
    const w = Math.max(16, Math.round(this.artwork.width));
    const h = Math.max(16, Math.round(this.artwork.height));
    const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    paintFloatingArtworkItem(ctx, this.artwork, {
      x: 0,
      y: 0,
      selected: false,
      isDark: this.themeService.isDark(),
      interactiveButtons: false,
    });
    ctx.restore();
  }

  begin(event: MouseEvent, resize: boolean): void {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    this.select.emit(); this.beginChange.emit();
    this.drag = { clientX: event.clientX, clientY: event.clientY, ...this.artwork, resize };
  }
  @HostListener('window:mousemove', ['$event']) move(event: MouseEvent): void {
    if (!this.drag) return;
    const d = this.drag;
    const dx = (event.clientX - d.clientX) / this.zoom;
    const dy = (event.clientY - d.clientY) / this.zoom;
    this.geometryChange.emit(d.resize
      ? { x: d.x, y: d.y, width: Math.max(24, d.width + dx), height: Math.max(24, d.height + dy) }
      : { x: Math.max(0, d.x + dx), y: Math.max(0, d.y + dy), width: d.width, height: d.height });
  }
  @HostListener('window:mouseup') finish(): void {
    if (this.drag) { this.drag = undefined; this.endChange.emit(); }
  }
}
