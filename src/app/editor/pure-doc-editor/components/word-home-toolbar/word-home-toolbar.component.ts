import { Component, ElementRef, EventEmitter, HostListener, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideDynamicIcon, provideLucideIcons, LucideBold, LucideItalic, LucideUnderline,
  LucideStrikethrough, LucideSubscript, LucideSuperscript, LucideEraser, LucidePaintbrush,
  LucideAlignLeft, LucideAlignCenter, LucideAlignRight, LucideAlignJustify,
  LucideList, LucideListOrdered, LucideListTree, LucideIndentIncrease, LucideIndentDecrease,
  LucideArrowUpDown, LucidePaintBucket, LucideFrame, LucideSearch, LucideReplace,
  LucideChevronDown, LucideUndo2, LucideRedo2, LucideType, LucidePilcrow,
  LucideCaseSensitive, LucideArrowDownAZ, LucideMousePointer, LucideCheck,
} from '@lucide/angular';
import { EditorActiveFormats, ElementStyleRule, StyleTargetTag, StyleTemplate } from '../../models/word-document.model';
import { FONT_FAMILIES, TEXT_COLORS, HIGHLIGHT_COLORS } from '../../constants/word-document.constants';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-word-home-toolbar', standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [provideLucideIcons(LucideBold, LucideItalic, LucideUnderline, LucideStrikethrough,
    LucideSubscript, LucideSuperscript, LucideEraser, LucidePaintbrush, LucideAlignLeft,
    LucideAlignCenter, LucideAlignRight, LucideAlignJustify, LucideList, LucideListOrdered,
    LucideListTree, LucideIndentIncrease, LucideIndentDecrease, LucideArrowUpDown,
    LucidePaintBucket, LucideFrame, LucideSearch, LucideReplace, LucideChevronDown,
    LucideUndo2, LucideRedo2, LucideType, LucidePilcrow, LucideCaseSensitive,
    LucideArrowDownAZ, LucideMousePointer, LucideCheck)],
  templateUrl: './word-home-toolbar.component.html',
  styleUrl: './word-home-toolbar.component.scss',
})
export class WordHomeToolbarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly i18n = inject(I18nService, { optional: true });

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n?.t ? this.i18n.t(key, params) : key;
  }

  label(item: { labelKey: string; fallback: string }): string {
    return this.i18n?.t ? this.i18n.t(item.labelKey) : item.fallback;
  }

  @HostListener('document:mousedown', ['$event']) closeOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.menu.set(null);
      this.styleMenuPosition.set(null);
    }
  }

  @HostListener('window:resize') onResize(): void {
    if (this.menu()?.startsWith('style-')) {
      this.menu.set(null);
      this.styleMenuPosition.set(null);
    }
  }
  @Input({ required: true }) formats!: EditorActiveFormats;
  @Input({ required: true }) template!: StyleTemplate;
  @Input() darkMode = false;
  @Input() formatPainterActive = false;
  @Input() showFormattingMarks = false;
  @Input() headingNumbering = false;
  @Output() command = new EventEmitter<{ command: string; value?: string }>();
  @Output() applyRule = new EventEmitter<ElementStyleRule>();
  @Output() updateStyle = new EventEmitter<StyleTargetTag>();
  @Output() openDesigner = new EventEmitter<void>();
  @Output() copyFormat = new EventEmitter<void>();
  readonly menu = signal<string | null>(null);
  readonly fonts = FONT_FAMILIES;
  readonly colors = TEXT_COLORS;
  readonly highlights = HIGHLIGHT_COLORS;
  readonly tags: StyleTargetTag[] = ['P','H1','H2','H3','H4','H5','H6'];
  readonly styleMenuPosition = signal<{ top: number; left: number } | null>(null);
  readonly activeStyleTag = () => {
    const m = this.menu();
    if (m?.startsWith('style-')) {
      const tag = m.slice(6) as StyleTargetTag;
      if (this.tags.includes(tag)) return tag;
    }
    return null;
  };
  readonly inlineButtons = [
    { command: 'bold', icon: 'bold', labelKey: 'word.font.bold', fallback: 'Negrita (Ctrl+B)' },
    { command: 'italic', icon: 'italic', labelKey: 'word.font.italic', fallback: 'Cursiva' },
    { command: 'underline', icon: 'underline', labelKey: 'word.font.underline', fallback: 'Subrayado (Ctrl+U)' },
    { command: 'strikeThrough', icon: 'strikethrough', labelKey: 'word.font.strikethrough', fallback: 'Tachado' },
    { command: 'subscript', icon: 'subscript', labelKey: 'word.font.subscript', fallback: 'Subíndice' },
    { command: 'superscript', icon: 'superscript', labelKey: 'word.font.superscript', fallback: 'Superíndice' },
  ] as const;
  readonly alignButtons = [
    { command: 'justifyLeft', icon: 'align-left', labelKey: 'word.paragraph.align_left', fallback: 'Alinear a la izquierda' },
    { command: 'justifyCenter', icon: 'align-center', labelKey: 'word.paragraph.align_center', fallback: 'Centrar' },
    { command: 'justifyRight', icon: 'align-right', labelKey: 'word.paragraph.align_right', fallback: 'Alinear a la derecha' },
    { command: 'justifyFull', icon: 'align-justify', labelKey: 'word.paragraph.justify', fallback: 'Justificar' },
  ] as const;
  readonly cases = [
    { value: 'sentence', labelKey: 'word.font.case_sentence', fallback: 'Tipo oración' },
    { value: 'lower', labelKey: 'word.font.case_lower', fallback: 'minúsculas' },
    { value: 'upper', labelKey: 'word.font.case_upper', fallback: 'MAYÚSCULAS' },
    { value: 'title', labelKey: 'word.font.case_title', fallback: 'Poner En Mayúscula Cada Palabra' },
    { value: 'toggle', labelKey: 'word.font.case_toggle', fallback: 'Alternar mayúsculas y minúsculas' },
  ];
  readonly effects = [
    { value: 'none', labelKey: 'word.font.effects_none', fallback: 'Sin efectos' },
    { value: 'shadow', labelKey: 'word.font.effects_shadow', fallback: 'Sombra' },
    { value: 'outline', labelKey: 'word.font.effects_outline', fallback: 'Contorno' },
  ];
  readonly borders = [
    { value: 'none', labelKey: 'word.paragraph.border_none', fallback: 'Sin borde' },
    { value: 'bottom', labelKey: 'word.paragraph.border_bottom', fallback: 'Borde inferior' },
    { value: 'top', labelKey: 'word.paragraph.border_top', fallback: 'Borde superior' },
    { value: 'all', labelKey: 'word.paragraph.border_all', fallback: 'Todos los bordes' },
  ];
  readonly listStyles = [
    { value: 'disc', label: 'Viñeta circular' },
    { value: 'circle', label: 'Círculo vacío' },
    { value: 'square', label: 'Viñeta cuadrada' },
    { value: 'decimal', label: '1, 2, 3' },
    { value: 'lower-alpha', label: 'a, b, c' },
    { value: 'upper-roman', label: 'I, II, III' },
  ];

  toggle(name: string): void {
    if (name.startsWith('style-')) {
      this.toggleStyleMenu(name.slice(6) as StyleTargetTag);
      return;
    }
    this.menu.update(current => current === name ? null : name);
  }
  toggleStyleMenu(tag: StyleTargetTag, event?: MouseEvent): void {
    const menuKey = 'style-' + tag;
    if (this.menu() === menuKey) {
      this.menu.set(null);
      this.styleMenuPosition.set(null);
      return;
    }

    let top = 54;
    let left = 0;

    const currentEl = event?.currentTarget as HTMLElement | null;
    const tileEl = currentEl?.closest('.style-tile') as HTMLElement | null;
    const groupEl = currentEl?.closest('.styles-group') as HTMLElement | null
      ?? (this.host.nativeElement.querySelector('.styles-group') as HTMLElement | null);

    if (tileEl && groupEl) {
      const tileRect = tileEl.getBoundingClientRect();
      const groupRect = groupEl.getBoundingClientRect();
      const menuWidth = 270;

      top = Math.round(tileRect.bottom - groupRect.top + 2);
      const rawLeft = tileRect.left - groupRect.left;
      const maxLeft = Math.max(0, groupRect.width - menuWidth - 4);
      left = Math.round(Math.max(0, Math.min(rawLeft, maxLeft)));
    }

    this.styleMenuPosition.set({ top, left });
    this.menu.set(menuKey);
  }

  onGalleryWheel(event: WheelEvent): void {
    if (this.menu()?.startsWith('style-')) {
      this.menu.set(null);
      this.styleMenuPosition.set(null);
    }
    const container = event.currentTarget as HTMLElement;
    if (!container) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      container.scrollLeft += event.deltaY;
    }
  }
  run(command: string, value?: string): void { this.command.emit({ command, value }); this.menu.set(null); }
  selectStyle(tag: StyleTargetTag): void { this.applyRule.emit(this.template.rules[tag]); this.menu.set(null); }
  update(tag: StyleTargetTag): void { this.updateStyle.emit(tag); this.menu.set(null); }
  fontValue(): string {
    return this.fonts.find(font => font.value.replace(/["']/g, '').split(',')[0].trim().toLocaleLowerCase() === this.formats.fontName.replace(/["']/g, '').split(',')[0].trim().toLocaleLowerCase())?.value ?? this.formats.fontName;
  }
  hasKnownFont(): boolean { return this.fonts.some(font => font.value === this.fontValue()); }
  previewSize(rule: ElementStyleRule): string {
    return `${Math.max(11.5, Math.min(13.5, rule.fontSizePt))}px`;
  }
  setSize(value: string): void {
    const size = Number(value);
    if (Number.isFinite(size) && size >= 1 && size <= 400) this.run('fontSizePt', String(size));
  }
  keepSelection(event: MouseEvent): void {
    if ((event.target as Element).closest('button')) event.preventDefault();
  }
}
