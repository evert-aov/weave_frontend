import { Component, ElementRef, EventEmitter, HostListener, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucidePalette,
  LucideType,
  LucideArrowUpDown,
  LucideSparkles,
  LucideCheckCircle2,
  LucideFileText,
  LucidePaintbrush,
  LucideFrame,
  LucideChevronDown,
  LucideSliders,
  LucideCheck,
  LucideLayers,
} from '@lucide/angular';
import {
  DocumentLayoutConfig,
  ElementStyleRule,
  PageBorderStyle,
  StyleTemplate,
} from '../../models/word-document.model';
import { I18nService } from '../../../../core/services/i18n.service';

export interface ThemePreset {
  id: string;
  nameKey: string;
  font: string;
  primaryColor: string;
  secondaryColor: string;
}

@Component({
  selector: 'app-word-design-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucidePalette,
      LucideType,
      LucideArrowUpDown,
      LucideSparkles,
      LucideCheckCircle2,
      LucideFileText,
      LucidePaintbrush,
      LucideFrame,
      LucideChevronDown,
      LucideSliders,
      LucideCheck,
      LucideLayers
    ),
  ],
  templateUrl: './word-design-toolbar.component.html',
  styleUrl: './word-design-toolbar.component.scss',
})
export class WordDesignToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly i18n = inject(I18nService, { optional: true });

  @Input() darkMode = false;
  @Input() styleTemplates: StyleTemplate[] = [];
  @Input() activeTemplateId = '';
  @Input({ required: true }) layoutConfig!: DocumentLayoutConfig;

  @Output() applyTemplate = new EventEmitter<StyleTemplate>();
  @Output() openDesigner = new EventEmitter<void>();
  @Output() updateLayout = new EventEmitter<(prev: DocumentLayoutConfig) => DocumentLayoutConfig>();
  @Output() applyParagraphSpacing = new EventEmitter<number>();
  @Output() applyFontPairing = new EventEmitter<string>();

  readonly openMenu = signal<'themes' | 'colors' | 'fonts' | 'spacing' | 'watermark' | 'pageColor' | 'pageBorders' | null>(null);

  readonly borderStylesList = [
    { id: 'none' as PageBorderStyle, labelKey: 'word.border.none', previewKey: 'word.border.none_preview', preview: '' },
    { id: 'solid' as PageBorderStyle, labelKey: 'word.border.solid', previewKey: '', preview: '───' },
    { id: 'double' as PageBorderStyle, labelKey: 'word.border.double', previewKey: '', preview: '═══' },
    { id: 'thick' as PageBorderStyle, labelKey: 'word.border.thick', previewKey: '', preview: '━━━' },
    { id: 'dashed' as PageBorderStyle, labelKey: 'word.border.dashed', previewKey: '', preview: '- - -' },
    { id: 'dotted' as PageBorderStyle, labelKey: 'word.border.dotted', previewKey: '', preview: '······' },
  ];

  readonly watermarkPresets = [
    { key: 'word.watermark.confidential' },
    { key: 'word.watermark.draft' },
    { key: 'word.watermark.do_not_copy' },
    { key: 'word.watermark.urgent' },
    { key: 'word.watermark.priority' },
  ];

  readonly pageColors = [
    { labelKey: 'word.color.white', value: '' },
    { labelKey: 'word.color.cream', value: '#fffbeb' },
    { labelKey: 'word.color.ice_gray', value: '#f8fafc' },
    { labelKey: 'word.color.breeze_blue', value: '#eff6ff' },
    { labelKey: 'word.color.mint', value: '#f0fdf4' },
    { labelKey: 'word.color.lavender', value: '#faf5ff' },
    { labelKey: 'word.color.pale_pink', value: '#fff1f2' },
    { labelKey: 'word.color.parchment', value: '#fef3c7' },
  ];

  readonly themePresets: ThemePreset[] = [
    { id: 'office', nameKey: 'word.theme.office', font: 'Calibri', primaryColor: '#2563eb', secondaryColor: '#475569' },
    { id: 'facet', nameKey: 'word.theme.facet', font: 'Times New Roman', primaryColor: '#0d9488', secondaryColor: '#d97706' },
    { id: 'integral', nameKey: 'word.theme.integral', font: 'Arial', primaryColor: '#0284c7', secondaryColor: '#16a34a' },
    { id: 'ion', nameKey: 'word.theme.ion', font: 'Century Gothic', primaryColor: '#7c3aed', secondaryColor: '#ea580c' },
    { id: 'organic', nameKey: 'word.theme.organic', font: 'Georgia', primaryColor: '#15803d', secondaryColor: '#b45309' },
    { id: 'slate', nameKey: 'word.theme.slate', font: 'Lucida Sans', primaryColor: '#334155', secondaryColor: '#0891b2' },
  ];

  readonly fontPairPresets = [
    { name: 'Calibri / Calibri Light', font: 'Calibri' },
    { name: 'Arial / Arial Black', font: 'Arial' },
    { name: 'Times New Roman', font: 'Times New Roman' },
    { name: 'Georgia / Garamond', font: 'Georgia' },
    { name: 'Segoe UI / Semibold', font: 'Segoe UI' },
    { name: 'Century Gothic', font: 'Century Gothic' },
  ];

  t(key: string, fallback?: string): string {
    return this.i18n?.t ? this.i18n.t(key) : fallback || key;
  }

  toggle(name: 'themes' | 'colors' | 'fonts' | 'spacing' | 'watermark' | 'pageColor' | 'pageBorders'): void {
    this.openMenu.update(cur => cur === name ? null : name);
  }

  selectTemplate(tpl: StyleTemplate): void {
    this.applyTemplate.emit(tpl);
  }

  selectTheme(theme: ThemePreset): void {
    this.openMenu.set(null);
    this.applyFontPairing.emit(theme.font);
  }

  selectFontPair(font: string): void {
    this.openMenu.set(null);
    this.applyFontPairing.emit(font);
  }

  selectSpacing(spacingPt: number): void {
    this.openMenu.set(null);
    this.applyParagraphSpacing.emit(spacingPt);
  }

  setWatermark(text: string): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, watermarkText: text }));
  }

  setCustomWatermark(): void {
    this.openMenu.set(null);
    const promptMsg = this.t('word.design.custom_watermark_prompt', 'Escribe el texto de la marca de agua:');
    const defaultVal = this.t('word.watermark.confidential', 'CONFIDENCIAL');
    const custom = prompt(promptMsg, defaultVal);
    if (custom !== null) {
      this.updateLayout.emit(prev => ({ ...prev, watermarkText: custom.trim() }));
    }
  }

  setPageColor(color: string): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, pageColor: color || undefined }));
  }

  setPageBorder(style: PageBorderStyle): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({
      ...prev,
      pageBorder: {
        ...prev.pageBorder,
        style,
        color: style === 'none' ? '#334155' : prev.pageBorder.color || '#2563eb',
        widthPt: style === 'thick' ? 3 : (prev.pageBorder.widthPt || 1),
      },
    }));
  }

  @HostListener('document:mousedown', ['$event'])
  closeOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }
}
