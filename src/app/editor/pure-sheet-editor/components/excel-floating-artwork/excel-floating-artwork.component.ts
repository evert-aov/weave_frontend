import { Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { LucideDynamicIcon, provideLucideIcons } from '@lucide/angular';
import { WORD_ICON_DEFINITIONS } from '../../../pure-doc-editor/components/word-icons-modal/word-icons-modal.component';
import { SHAPE_ITEMS } from '../../../pure-doc-editor/constants/word-insert.constants';
import { FloatingArtwork } from '../../models/excel.model';

@Component({
  selector: 'app-excel-floating-artwork', standalone: true, imports: [LucideDynamicIcon],
  providers: [provideLucideIcons(...WORD_ICON_DEFINITIONS)],
  template: `
    <div class="artwork" [class.selected]="selected" (mousedown)="begin($event, false)">
      @if (artwork.kind === 'icon') { <svg class="inserted-icon" [lucideIcon]="artwork.itemId" [size]="32"></svg> }
      @else { <div class="shape" [innerHTML]="shapeSvg"></div> }
      @if (selected) {
        <button type="button" class="delete" aria-label="Eliminar objeto" title="Eliminar" (mousedown)="$event.stopPropagation()" (click)="remove.emit()">×</button>
        <button type="button" class="resize" aria-label="Cambiar tamaño" (mousedown)="begin($event, true)"></button>
      }
    </div>`,
  styles: [`
    :host { display: block; position: absolute; z-index: 35; }
    .artwork { position: relative; width: 100%; height: 100%; cursor: move; user-select: none; color: #2563eb; }
    .artwork.selected { outline: 2px solid #059669; }
    .shape, .inserted-icon { display: block; width: 100%; height: 100%; pointer-events: none; }
    .delete { position: absolute; top: -24px; right: 0; width: 24px; height: 24px; border-radius: 4px; background: white; color: #475569; border: 1px solid #cbd5e1; cursor: pointer; }
    .resize { position: absolute; right: -5px; bottom: -5px; width: 10px; height: 10px; background: #059669; border: 1px solid white; border-radius: 50%; cursor: nwse-resize; }
  `],
})
export class ExcelFloatingArtworkComponent {
  @Input({ required: true }) artwork!: FloatingArtwork;
  @Input() selected = false;
  @Input() zoom = 1;
  @Output() select = new EventEmitter<void>();
  @Output() beginChange = new EventEmitter<void>();
  @Output() geometryChange = new EventEmitter<Pick<FloatingArtwork, 'x' | 'y' | 'width' | 'height'>>();
  @Output() endChange = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  private readonly sanitizer = inject(DomSanitizer);
  private drag?: { clientX: number; clientY: number; x: number; y: number; width: number; height: number; resize: boolean };
  get shapeSvg() {
    const shape = SHAPE_ITEMS.find(item => item.id === this.artwork.itemId);
    return shape ? this.sanitizer.bypassSecurityTrustHtml(`<svg width="100%" height="100%" viewBox="${shape.viewBox}" preserveAspectRatio="none">${shape.svgInner}</svg>`) : '';
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
