import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideFilePlus2,
  LucideScissors,
  LucideTable,
  LucideImage,
  LucideShapes,
  LucideSmile,
  LucideBox,
  LucideBarChart3,
  LucideCamera,
  LucideLink,
  LucideMessageSquare,
  LucidePanelTop,
  LucidePanelBottom,
  LucideHash,
  LucideType,
  LucideSparkles,
  LucideCalendar,
  LucideSigma,
  LucideChevronDown,
  LucidePlus,
} from '@lucide/angular';
import { SHAPE_ITEMS, SYMBOL_ITEMS, WORDART_PRESETS } from '../../constants/word-insert.constants';
import { ShapeCategory, ShapeDefinition, WordArtPreset } from '../../models/word-insert.model';
import { WordTablePickerComponent } from '../word-table-picker/word-table-picker.component';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-word-insert-toolbar',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, WordTablePickerComponent],
  providers: [
    provideLucideIcons(
      LucideFilePlus2,
      LucideScissors,
      LucideTable,
      LucideImage,
      LucideShapes,
      LucideSmile,
      LucideBox,
      LucideBarChart3,
      LucideCamera,
      LucideLink,
      LucideMessageSquare,
      LucidePanelTop,
      LucidePanelBottom,
      LucideHash,
      LucideType,
      LucideSparkles,
      LucideCalendar,
      LucideSigma,
      LucideChevronDown,
      LucidePlus,
    ),
  ],
  templateUrl: './word-insert-toolbar.component.html',
  styleUrl: './word-insert-toolbar.component.scss',
})
export class WordInsertToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly sanitizer = inject(DomSanitizer);
  readonly i18n = inject(I18nService, { optional: true });

  getShapeSvg(shape: ShapeDefinition): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="${shape.viewBox}" class="shape-svg" style="width:22px;height:22px;overflow:visible;">${shape.svgInner}</svg>`
    );
  }

  @Input() darkMode = false;
  @Output() captureSelection = new EventEmitter<void>();
  @Output() addNewPage = new EventEmitter<void>();
  @Output() insertPageBreak = new EventEmitter<void>();
  @Output() insertTable = new EventEmitter<{ rows: number; cols: number }>();
  @Output() insertImage = new EventEmitter<void>();
  @Output() insertShapeHtml = new EventEmitter<string>();
  @Output() openIconsModal = new EventEmitter<void>();
  @Output() insert3dModel = new EventEmitter<void>();
  @Output() openSmartArtModal = new EventEmitter<void>();
  @Output() insertChartTable = new EventEmitter<void>();
  @Output() insertScreenshot = new EventEmitter<void>();
  @Output() insertLink = new EventEmitter<void>();
  @Output() insertComment = new EventEmitter<void>();
  @Output() focusHeaderArea = new EventEmitter<void>();
  @Output() focusFooterArea = new EventEmitter<void>();
  @Output() insertPageNumber = new EventEmitter<void>();
  @Output() insertTextBox = new EventEmitter<void>();
  @Output() insertWordArt = new EventEmitter<WordArtPreset>();
  @Output() insertDropCap = new EventEmitter<void>();
  @Output() insertSignatureLine = new EventEmitter<void>();
  @Output() insertDateTime = new EventEmitter<void>();
  @Output() openLatexModal = new EventEmitter<void>();
  @Output() insertSymbol = new EventEmitter<string>();
  @Output() insertDrawingCanvas = new EventEmitter<void>();

  readonly openMenu = signal<'shapes' | 'tablePicker' | 'symbols' | 'wordart' | null>(null);

  readonly shapeCategories: { id: ShapeCategory; labelKey: string; fallback: string }[] = [
    { id: 'recent', labelKey: 'word.shapes.recently_used', fallback: 'Formas usadas recientemente' },
    { id: 'lines', labelKey: 'word.shapes.lines', fallback: 'Líneas' },
    { id: 'rectangles', labelKey: 'word.shapes.rectangles', fallback: 'Rectángulos' },
    { id: 'basic', labelKey: 'word.shapes.basic', fallback: 'Formas básicas' },
    { id: 'arrows', labelKey: 'word.shapes.block_arrows', fallback: 'Flechas de bloque' },
    { id: 'equation', labelKey: 'word.shapes.equation', fallback: 'Formas de ecuación' },
    { id: 'flowchart', labelKey: 'word.shapes.flowchart', fallback: 'Diagrama de flujo' },
    { id: 'stars', labelKey: 'word.shapes.stars_banners', fallback: 'Cintas y estrellas' },
    { id: 'callouts', labelKey: 'word.shapes.callouts', fallback: 'Llamadas' },
  ];

  readonly allShapes = SHAPE_ITEMS;
  readonly symbols = SYMBOL_ITEMS;
  readonly wordArtPresets = WORDART_PRESETS;

  t(key: string, fallback?: string): string {
    return this.i18n?.t ? this.i18n.t(key) : fallback || key;
  }

  getShapesForCategory(catId: ShapeCategory): ShapeDefinition[] {
    if (catId === 'recent') {
      return this.allShapes.slice(0, 8);
    }
    return this.allShapes.filter(s => s.category === catId);
  }

  toggleMenu(name: 'shapes' | 'tablePicker' | 'symbols' | 'wordart'): void {
    this.captureSelection.emit();
    this.openMenu.update(current => (current === name ? null : name));
  }

  selectShape(shape: ShapeDefinition): void {
    this.openMenu.set(null);
    this.insertShapeHtml.emit(shape.generateHtml());
  }

  onShapeMouseDown(event: MouseEvent): void {
    this.captureSelection.emit();
    event.preventDefault();
  }

  keepSelection(event: MouseEvent): void {
    this.captureSelection.emit();
    if ((event.target as Element).closest('button')) {
      event.preventDefault();
    }
  }

  selectSymbol(symbol: string): void {
    this.openMenu.set(null);
    this.insertSymbol.emit(symbol);
  }

  selectWordArt(preset: WordArtPreset): void {
    this.openMenu.set(null);
    this.insertWordArt.emit(preset);
  }

  onNewCanvas(): void {
    this.openMenu.set(null);
    this.insertDrawingCanvas.emit();
  }

  @HostListener('document:mousedown', ['$event'])
  closeOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }
}
