import { Component, EventEmitter, Input, Output, ElementRef, ViewChild, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideChevronRight,
  LucideEraser,
  LucidePalette,
  LucidePencil,
  LucideGrid,
  LucideX,
  LucideCheck,
} from '@lucide/angular';
import {
  BorderEdge,
  BorderLineStyle,
  BorderPreset,
  CellBorders,
  DrawBorderMode,
} from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';

export const THEME_BASE_COLORS = [
  { hex: '#ffffff', bgClass: 'bg-[#ffffff]', label: 'Blanco, Fondo 1' },
  { hex: '#000000', bgClass: 'bg-[#000000]', label: 'Negro, Texto 1' },
  { hex: '#e7e6e6', bgClass: 'bg-[#e7e6e6]', label: 'Gris claro, Fondo 2' },
  { hex: '#1f4e78', bgClass: 'bg-[#1f4e78]', label: 'Azul oscuro, Texto 2' },
  { hex: '#2f5597', bgClass: 'bg-[#2f5597]', label: 'Azul énfasis 1' },
  { hex: '#c55a11', bgClass: 'bg-[#c55a11]', label: 'Naranja énfasis 2' },
  { hex: '#275317', bgClass: 'bg-[#275317]', label: 'Verde énfasis 3' },
  { hex: '#0070c0', bgClass: 'bg-[#0070c0]', label: 'Azul claro énfasis 4' },
  { hex: '#7030a0', bgClass: 'bg-[#7030a0]', label: 'Púrpura énfasis 5' },
  { hex: '#385723', bgClass: 'bg-[#385723]', label: 'Verde oliva énfasis 6' },
];

export const THEME_SHADE_COLUMNS: { hex: string; bgClass: string }[][] = [
  // Col 1: White shades
  [
    { hex: '#f2f2f2', bgClass: 'bg-[#f2f2f2]' },
    { hex: '#d9d9d9', bgClass: 'bg-[#d9d9d9]' },
    { hex: '#bfbfbf', bgClass: 'bg-[#bfbfbf]' },
    { hex: '#a6a6a6', bgClass: 'bg-[#a6a6a6]' },
    { hex: '#808080', bgClass: 'bg-[#808080]' },
  ],
  // Col 2: Black shades
  [
    { hex: '#7f7f7f', bgClass: 'bg-[#7f7f7f]' },
    { hex: '#595959', bgClass: 'bg-[#595959]' },
    { hex: '#404040', bgClass: 'bg-[#404040]' },
    { hex: '#262626', bgClass: 'bg-[#262626]' },
    { hex: '#0d0d0d', bgClass: 'bg-[#0d0d0d]' },
  ],
  // Col 3: Light Gray shades
  [
    { hex: '#d0cece', bgClass: 'bg-[#d0cece]' },
    { hex: '#afabab', bgClass: 'bg-[#afabab]' },
    { hex: '#757171', bgClass: 'bg-[#757171]' },
    { hex: '#3b3838', bgClass: 'bg-[#3b3838]' },
    { hex: '#161616', bgClass: 'bg-[#161616]' },
  ],
  // Col 4: Dark Blue shades
  [
    { hex: '#d9e1f2', bgClass: 'bg-[#d9e1f2]' },
    { hex: '#b4c6e7', bgClass: 'bg-[#b4c6e7]' },
    { hex: '#8ea9db', bgClass: 'bg-[#8ea9db]' },
    { hex: '#2f5597', bgClass: 'bg-[#2f5597]' },
    { hex: '#1f3864', bgClass: 'bg-[#1f3864]' },
  ],
  // Col 5: Blue Accent 1 shades
  [
    { hex: '#deebf7', bgClass: 'bg-[#deebf7]' },
    { hex: '#bdd7ee', bgClass: 'bg-[#bdd7ee]' },
    { hex: '#9bc2e6', bgClass: 'bg-[#9bc2e6]' },
    { hex: '#2e75b6', bgClass: 'bg-[#2e75b6]' },
    { hex: '#1f4e79', bgClass: 'bg-[#1f4e79]' },
  ],
  // Col 6: Orange Accent 2 shades
  [
    { hex: '#fbe5d6', bgClass: 'bg-[#fbe5d6]' },
    { hex: '#f8cbad', bgClass: 'bg-[#f8cbad]' },
    { hex: '#f4b183', bgClass: 'bg-[#f4b183]' },
    { hex: '#c55a11', bgClass: 'bg-[#c55a11]' },
    { hex: '#833c0c', bgClass: 'bg-[#833c0c]' },
  ],
  // Col 7: Green Accent 3 shades
  [
    { hex: '#e2efda', bgClass: 'bg-[#e2efda]' },
    { hex: '#c6e0b4', bgClass: 'bg-[#c6e0b4]' },
    { hex: '#a9d08e', bgClass: 'bg-[#a9d08e]' },
    { hex: '#548235', bgClass: 'bg-[#548235]' },
    { hex: '#375623', bgClass: 'bg-[#375623]' },
  ],
  // Col 8: Cyan Accent 4 shades
  [
    { hex: '#ccecff', bgClass: 'bg-[#ccecff]' },
    { hex: '#99d9ff', bgClass: 'bg-[#99d9ff]' },
    { hex: '#66c6ff', bgClass: 'bg-[#66c6ff]' },
    { hex: '#0070c0', bgClass: 'bg-[#0070c0]' },
    { hex: '#004c80', bgClass: 'bg-[#004c80]' },
  ],
  // Col 9: Purple Accent 5 shades
  [
    { hex: '#f2e5ff', bgClass: 'bg-[#f2e5ff]' },
    { hex: '#e5ccff', bgClass: 'bg-[#e5ccff]' },
    { hex: '#cc99ff', bgClass: 'bg-[#cc99ff]' },
    { hex: '#8c1aff', bgClass: 'bg-[#8c1aff]' },
    { hex: '#5900b3', bgClass: 'bg-[#5900b3]' },
  ],
  // Col 10: Olive Green Accent 6 shades
  [
    { hex: '#ebf1de', bgClass: 'bg-[#ebf1de]' },
    { hex: '#d8e4bc', bgClass: 'bg-[#d8e4bc]' },
    { hex: '#c4d79b', bgClass: 'bg-[#c4d79b]' },
    { hex: '#76933c', bgClass: 'bg-[#76933c]' },
    { hex: '#4f6228', bgClass: 'bg-[#4f6228]' },
  ],
];

export const STANDARD_COLORS = [
  { hex: '#c00000', bgClass: 'bg-[#c00000]', label: 'Rojo oscuro' },
  { hex: '#ff0000', bgClass: 'bg-[#ff0000]', label: 'Rojo' },
  { hex: '#ffc000', bgClass: 'bg-[#ffc000]', label: 'Naranja' },
  { hex: '#ffff00', bgClass: 'bg-[#ffff00]', label: 'Amarillo' },
  { hex: '#92d050', bgClass: 'bg-[#92d050]', label: 'Verde claro' },
  { hex: '#00b050', bgClass: 'bg-[#00b050]', label: 'Verde' },
  { hex: '#00b0f0', bgClass: 'bg-[#00b0f0]', label: 'Azul claro' },
  { hex: '#0070c0', bgClass: 'bg-[#0070c0]', label: 'Azul' },
  { hex: '#002060', bgClass: 'bg-[#002060]', label: 'Azul oscuro' },
  { hex: '#7030a0', bgClass: 'bg-[#7030a0]', label: 'Púrpura' },
];

@Component({
  selector: 'app-excel-borders-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideChevronRight,
      LucideEraser,
      LucidePalette,
      LucidePencil,
      LucideGrid,
      LucideX,
      LucideCheck,
    ),
  ],
  templateUrl: './excel-borders-menu.component.html',
  styleUrls: ['./excel-borders-menu.component.scss'],
})
export class ExcelBordersMenuComponent {
  @Input() isOpen = false;
  @Input() lineColor = '#000000';
  @Input() lineStyle: BorderLineStyle = 'thin';
  @Input() drawMode: DrawBorderMode = 'none';

  @Output() close = new EventEmitter<void>();
  @Output() applyPreset = new EventEmitter<BorderPreset>();
  @Output() applyCustomBorders = new EventEmitter<CellBorders>();
  @Output() selectLineColor = new EventEmitter<string>();
  @Output() selectLineStyle = new EventEmitter<BorderLineStyle>();
  @Output() selectDrawMode = new EventEmitter<DrawBorderMode>();

  @ViewChild('colorInputRef') colorInputRef?: ElementRef<HTMLInputElement>;

  readonly themeService = inject(ThemeService);

  get automaticColor(): string {
    return '#000000';
  }

  activeSubmenu: 'none' | 'lineColor' | 'lineStyle' = 'none';
  highContrastOnly = false;
  moreBordersModalOpen = false;

  // Custom modal state
  customTop = true;
  customBottom = true;
  customLeft = true;
  customRight = true;
  customStyle: BorderLineStyle = 'thin';
  customColor = '#000000';

  readonly themeBaseColors = THEME_BASE_COLORS;
  readonly themeShadeColumns = THEME_SHADE_COLUMNS;
  readonly standardColors = STANDARD_COLORS;

  readonly borderMenuItems: {
    preset: BorderPreset;
    label: string;
    dividerAfter?: boolean;
  }[] = [
    { preset: 'bottom', label: 'Bottom Border' },
    { preset: 'top', label: 'Top Border' },
    { preset: 'left', label: 'Left Border' },
    { preset: 'right', label: 'Right Border', dividerAfter: true },
    { preset: 'none', label: 'No Border' },
    { preset: 'all', label: 'All Borders' },
    { preset: 'outside', label: 'Outside Borders' },
    { preset: 'thickOutside', label: 'Thick Outside Borders', dividerAfter: true },
    { preset: 'bottomDouble', label: 'Bottom Double Border' },
    { preset: 'thickBottom', label: 'Thick Bottom Border' },
    { preset: 'topBottom', label: 'Top and Bottom Border' },
    { preset: 'topThickBottom', label: 'Top and Thick Bottom Border' },
    { preset: 'topDoubleBottom', label: 'Top and Double Bottom Border' },
  ];

  readonly lineStyleOptions: { style: BorderLineStyle; label: string }[] = [
    { style: 'thin', label: 'Continuo fino (Thin)' },
    { style: 'medium', label: 'Continuo medio (Medium)' },
    { style: 'thick', label: 'Continuo grueso (Thick)' },
    { style: 'double', label: 'Doble línea (Double)' },
    { style: 'dashed', label: 'Guiones (Dashed)' },
    { style: 'dotted', label: 'Puntos (Dotted)' },
  ];

  onPresetClick(preset: BorderPreset): void {
    this.applyPreset.emit(preset);
    this.close.emit();
  }

  onDrawModeClick(mode: DrawBorderMode): void {
    const next = this.drawMode === mode ? 'none' : mode;
    this.selectDrawMode.emit(next);
    this.close.emit();
  }

  onColorClick(color: string): void {
    this.selectLineColor.emit(color);
    this.activeSubmenu = 'none';
  }

  onStyleClick(style: BorderLineStyle): void {
    this.selectLineStyle.emit(style);
    this.activeSubmenu = 'none';
  }

  openMoreBorders(): void {
    this.customStyle = this.lineStyle;
    this.customColor = this.lineColor;
    this.moreBordersModalOpen = true;
  }

  onApplyMoreBorders(): void {
    const edge: BorderEdge = { style: this.customStyle, color: this.customColor };
    this.applyCustomBorders.emit({
      top: this.customTop ? edge : undefined,
      bottom: this.customBottom ? edge : undefined,
      left: this.customLeft ? edge : undefined,
      right: this.customRight ? edge : undefined,
    });
    this.moreBordersModalOpen = false;
    this.close.emit();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.moreBordersModalOpen) return;
    if (!target.closest('.borders-dropdown-container') && !target.closest('.borders-menu-root')) {
      this.close.emit();
    }
  }
}
