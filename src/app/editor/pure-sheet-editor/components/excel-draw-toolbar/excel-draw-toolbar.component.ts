import { Component, EventEmitter, Input, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawToolId, InkPenConfig } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideUndo2,
  LucideRedo2,
  LucidePlus,
  LucideChevronDown,
  LucideShapes,
  LucidePlayCircle,
  LucideHelpCircle,
  LucideX,
  LucideTrash2,
} from '@lucide/angular';

export const DEFAULT_INK_PENS: InkPenConfig[] = [
  {
    id: 'penBlack',
    name: 'Black Pen (0.5 mm)',
    kind: 'pen',
    color: '#111827',
    strokeWidth: 2.5,
    opacity: 1,
  },
  {
    id: 'penRed',
    name: 'Red Pen (0.5 mm)',
    kind: 'pen',
    color: '#ef4444',
    strokeWidth: 2.5,
    opacity: 1,
  },
  {
    id: 'pencilGray',
    name: 'Pencil (Grafito)',
    kind: 'pencil',
    color: '#6b7280',
    strokeWidth: 2,
    opacity: 0.85,
  },
  {
    id: 'highlighterYellow',
    name: 'Yellow Highlighter',
    kind: 'highlighter',
    color: '#facc15',
    strokeWidth: 14,
    opacity: 0.42,
  },
  {
    id: 'fountainBlue',
    name: 'Blue Fountain Pen',
    kind: 'fountain',
    color: '#1d4ed8',
    strokeWidth: 3.2,
    opacity: 1,
  },
  {
    id: 'markerGreen',
    name: 'Green Marker',
    kind: 'marker',
    color: '#15803d',
    strokeWidth: 4.5,
    opacity: 0.95,
  },
  {
    id: 'penGalaxy',
    name: 'Galaxy Sparkle Pen',
    kind: 'galaxy',
    color: '#10b981',
    strokeWidth: 3.5,
    opacity: 1,
  },
];

@Component({
  selector: 'app-excel-draw-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideUndo2,
      LucideRedo2,
      LucidePlus,
      LucideChevronDown,
      LucideShapes,
      LucidePlayCircle,
      LucideHelpCircle,
      LucideX,
      LucideTrash2
    ),
  ],
  templateUrl: './excel-draw-toolbar.component.html',
  styleUrls: ['./excel-draw-toolbar.component.scss'],
})
export class ExcelDrawToolbarComponent {
  @Input() activeTool: DrawToolId = 'select';
  @Input() pens: InkPenConfig[] = DEFAULT_INK_PENS;
  @Input() inkToShape = false;
  @Input() isReplaying = false;
  @Input() hasStrokes = false;

  @Output() selectTool = new EventEmitter<DrawToolId>();
  @Output() addPen = new EventEmitter<InkPenConfig>();
  @Output() toggleInkToShape = new EventEmitter<void>();
  @Output() openInkToMath = new EventEmitter<void>();
  @Output() replayInk = new EventEmitter<void>();
  @Output() undoInk = new EventEmitter<void>();
  @Output() redoInk = new EventEmitter<void>();
  @Output() clearAllInk = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);

  addPenMenuOpen = false;
  helpModalOpen = false;

  toggleAddPenMenu(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.addPenMenuOpen = !this.addPenMenuOpen;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.draw-dropdown-menu') && !target.closest('.draw-dropdown-trigger')) {
      this.addPenMenuOpen = false;
    }
  }

  onAddSpecificPen(kind: 'pen' | 'pencil' | 'highlighter'): void {
    const ts = Date.now();
    let newPen: InkPenConfig;
    if (kind === 'pen') {
      newPen = {
        id: `pen_${ts}`,
        name: 'Purple Pen',
        kind: 'pen',
        color: '#9333ea',
        strokeWidth: 3,
        opacity: 1,
      };
    } else if (kind === 'pencil') {
      newPen = {
        id: `pencil_${ts}`,
        name: 'Charcoal Pencil',
        kind: 'pencil',
        color: '#374151',
        strokeWidth: 2.2,
        opacity: 0.8,
      };
    } else {
      newPen = {
        id: `hl_${ts}`,
        name: 'Pink Highlighter',
        kind: 'highlighter',
        color: '#f472b6',
        strokeWidth: 14,
        opacity: 0.42,
      };
    }
    this.addPen.emit(newPen);
    this.selectTool.emit(newPen.id);
    this.addPenMenuOpen = false;
  }
}
