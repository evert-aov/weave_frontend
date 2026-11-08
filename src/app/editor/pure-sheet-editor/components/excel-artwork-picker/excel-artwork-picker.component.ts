import { Component, EventEmitter, Output, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SHAPE_ITEMS } from '../../../pure-doc-editor/constants/word-insert.constants';
import { ShapeDefinition } from '../../../pure-doc-editor/models/word-insert.model';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-excel-artwork-picker', standalone: true,
  template: `
    <div class="backdrop" (click)="close.emit()">
      <section role="dialog" aria-modal="true" aria-label="Formas" [class.dark]="theme.isDark()" (click)="$event.stopPropagation()">
        <header><span>Formas</span><button type="button" aria-label="Cerrar" (click)="close.emit()">×</button></header>
        <div class="catalog">
          @for (category of categories; track category.id) {
            <h3>{{ category.label }}</h3><div class="shapes">
              @for (shape of shapesFor(category.id); track shape.id) {
                <button type="button" [title]="shape.name" [attr.aria-label]="shape.name" (click)="selectShape.emit(shape.id)" [innerHTML]="preview(shape)"></button>
              }
            </div>
          }
        </div>
      </section>
    </div>`,
  styles: [`
    .backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: #0006; }
    section { width: 520px; max-width: 100%; max-height: 80dvh; display: flex; flex-direction: column; background: #fff; color: #334155; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 20px 50px #0003; }
    section.dark { background: #202024; color: #e4e4e7; border-color: #3f3f46; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #94a3b833; font-weight: 600; }
    header button { font-size: 22px; }
    .catalog { overflow: auto; padding: 12px 16px; }
    h3 { font-size: 12px; margin: 10px 0 6px; }
    .shapes { display: grid; grid-template-columns: repeat(auto-fill, 38px); gap: 6px; }
    button { border: 0; background: transparent; color: inherit; cursor: pointer; }
    .shapes button { width: 38px; height: 38px; padding: 6px; border-radius: 4px; }
    button:hover { background: #3b82f61a; }
    button:focus-visible { outline: 2px solid #3b82f6; }
  `],
})
export class ExcelArtworkPickerComponent {
  @Output() selectShape = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  readonly theme = inject(ThemeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly previews = new Map<string, SafeHtml>();
  readonly categories = [
    { id: 'recent', label: 'Formas usadas recientemente' },
    { id: 'lines', label: 'Líneas' }, { id: 'rectangles', label: 'Rectángulos' },
    { id: 'basic', label: 'Formas básicas' }, { id: 'arrows', label: 'Flechas de bloque' },
    { id: 'equation', label: 'Formas de ecuación' }, { id: 'flowchart', label: 'Diagrama de flujo' },
    { id: 'stars', label: 'Cintas y estrellas' }, { id: 'callouts', label: 'Llamadas' },
  ];
  shapesFor(category: string): ShapeDefinition[] { return category === 'recent' ? SHAPE_ITEMS.slice(0, 8) : SHAPE_ITEMS.filter(shape => shape.category === category); }
  preview(shape: ShapeDefinition): SafeHtml {
    if (!this.previews.has(shape.id)) this.previews.set(shape.id, this.sanitizer.bypassSecurityTrustHtml(`<svg width="26" height="26" viewBox="${shape.viewBox}">${shape.svgInner}</svg>`));
    return this.previews.get(shape.id)!;
  }
}
