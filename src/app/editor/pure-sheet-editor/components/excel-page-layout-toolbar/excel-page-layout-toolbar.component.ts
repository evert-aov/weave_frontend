import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, Output, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PageLayoutConfig, PageMarginsId, PageOrientation, PageSizeId, PageThemeId, } from '../../models/excel.model';
import { ThemeService } from '../../../../core/services/theme.service';
import { lucidePalette, lucideType, lucideSparkles, lucideLayout, lucideFileText, lucideMaximize2, lucidePrinter, lucideScissors, lucideImage, lucideTable, lucideChevronDown, lucideChevronUp, lucideLayers, lucideMousePointer, lucideAlignLeft, lucideGroup, lucideRotateCw, lucideArrowUpRight } from '@ng-icons/lucide';

export interface ThemePreset {
  id: PageThemeId;
  name: string;
  headerBg: string;
  accent: string;
  fontFamily: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'office', name: 'Office (Predeterminado)', headerBg: '#1f4e78', accent: '#107c41', fontFamily: 'Aptos Narrow' },
  { id: 'facet', name: 'Facet (Esmeralda)', headerBg: '#1b5e20', accent: '#2e7d32', fontFamily: 'Calibri' },
  { id: 'integral', name: 'Integral (Azul Marino)', headerBg: '#0f172a', accent: '#0284c7', fontFamily: 'Arial' },
  { id: 'ion', name: 'Ion (Púrpura Moderno)', headerBg: '#4c1d95', accent: '#7c3aed', fontFamily: 'Calibri' },
  { id: 'organic', name: 'Organic (Tierra)', headerBg: '#78350f', accent: '#d97706', fontFamily: 'Aptos Narrow' },
  { id: 'retrospect', name: 'Retrospect (Coral)', headerBg: '#9a3412', accent: '#ea580c', fontFamily: 'Consolas' },
];

@Component({
  selector: 'app-excel-page-layout-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons({ lucidePalette,
      lucideType,
      lucideSparkles,
      lucideLayout,
      lucideFileText,
      lucideMaximize2,
      lucidePrinter,
      lucideScissors,
      lucideImage,
      lucideTable,
      lucideChevronDown,
      lucideChevronUp,
      lucideLayers,
      lucideMousePointer,
      lucideAlignLeft,
      lucideGroup,
      lucideRotateCw,
      lucideArrowUpRight }),
  ],
  templateUrl: './excel-page-layout-toolbar.component.html',
  styleUrls: ['./excel-page-layout-toolbar.component.css'],
})
export class ExcelPageLayoutToolbarComponent {
  @Input() config: PageLayoutConfig = {
    theme: 'office',
    margins: 'normal',
    orientation: 'portrait',
    size: 'letter',
    widthPages: 'Automatic',
    heightPages: 'Automatic',
    scale: 100,
    gridlinesPrint: true,
    headingsPrint: true,
  };
  @Input() showGridlines = true;
  @Input() showHeadings = true;
  @Input() zoom = 100;
  @Input() hasSelectedChart = false;

  @Output() updateConfig = new EventEmitter<Partial<PageLayoutConfig>>();
  @Output() toggleGridlines = new EventEmitter<boolean>();
  @Output() toggleHeadings = new EventEmitter<boolean>();
  @Output() changeZoom = new EventEmitter<number>();
  @Output() setPrintArea = new EventEmitter<void>();
  @Output() clearPrintArea = new EventEmitter<void>();
  @Output() bringChartForward = new EventEmitter<void>();
  @Output() sendChartBackward = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly themePresets = THEME_PRESETS;
  readonly Math = Math;

  openMenu: 'none' | 'themes' | 'margins' | 'orientation' | 'size' | 'printArea' | 'background' = 'none';

  readonly marginsOptions: { id: PageMarginsId; label: string; desc: string }[] = [
    { id: 'normal', label: 'Normal', desc: 'Sup/Inf: 1.91 cm · Izq/Der: 1.78 cm' },
    { id: 'wide', label: 'Wide (Ancho)', desc: 'Sup/Inf: 2.54 cm · Izq/Der: 2.54 cm' },
    { id: 'narrow', label: 'Narrow (Estrecho)', desc: 'Sup/Inf: 1.91 cm · Izq/Der: 0.64 cm' },
  ];

  readonly orientationOptions: { id: PageOrientation; label: string }[] = [
    { id: 'portrait', label: 'Portrait (Vertical)' },
    { id: 'landscape', label: 'Landscape (Horizontal)' },
  ];

  readonly sizeOptions: { id: PageSizeId; label: string; dim: string }[] = [
    { id: 'letter', label: 'Letter (Carta)', dim: '21.59 cm x 27.94 cm' },
    { id: 'a4', label: 'A4', dim: '21 cm x 29.7 cm' },
    { id: 'legal', label: 'Legal (Oficio)', dim: '21.59 cm x 35.56 cm' },
  ];

  readonly backgroundOptions: { label: string; url: string | null }[] = [
    { label: 'Sin fondo (Blanco limpio)', url: null },
    { label: 'Cuadrícula Técnica Suave', url: 'https://picsum.photos/id/106/1200/800' },
    { label: 'Textura Papel Ejecutivo', url: 'https://picsum.photos/id/24/1200/800' },
    { label: 'Paisaje Minimalista', url: 'https://picsum.photos/id/1015/1200/800' },
  ];

  toggleMenu(menu: 'themes' | 'margins' | 'orientation' | 'size' | 'printArea' | 'background', event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.openMenu = this.openMenu === menu ? 'none' : menu;
  }

  closeMenus(): void {
    this.openMenu = 'none';
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.layout-dropdown-menu') && !target.closest('.layout-dropdown-trigger')) {
      this.closeMenus();
    }
  }

  printTitles(): void {
    window.print();
  }
}
