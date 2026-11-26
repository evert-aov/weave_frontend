import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, inject, Input, OnInit, OnChanges, Output, signal, SimpleChanges, } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lucideRuler, lucideRotateCw, lucideBookOpen, lucideColumns, lucideScissors, lucideTrash2, lucideHash, lucideMinus, lucideChevronDown, lucideAlignLeft, lucideAlignCenter, lucideAlignRight, lucideAlignJustify, lucideLayers, lucideEye, lucideMove, lucideFrame } from '@ng-icons/lucide';
import {
  DocumentLayoutConfig,
  EditorActiveFormats,
  PageNumberFormat,
  PageOrientation,
  PaperFormatId,
  PaperFormatPreset,
  SectionColumnsPreset,
  SectionPageConfig,
} from '../../models/word-document.model';
import type { ResolvedPageSectionInfo } from '../../utils/page-section-layout';
import {
  MARGIN_PRESETS,
  PAPER_FORMAT_PRESETS,
} from '../../constants/word-document.constants';
import { I18nService } from '../../../../core/services/i18n.service';

const PAPER_FORMAT_LIST: PaperFormatId[] = [
  'letter',
  'oficio',
  'legal',
  'a4',
  'executive',
  'a5',
  'b5',
  'a3',
  'tabloid',
];

@Component({
  selector: 'app-word-layout-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons({ lucideRuler,
      lucideRotateCw,
      lucideBookOpen,
      lucideColumns,
      lucideScissors,
      lucideTrash2,
      lucideHash,
      lucideMinus,
      lucideChevronDown,
      lucideAlignLeft,
      lucideAlignCenter,
      lucideAlignRight,
      lucideAlignJustify,
      lucideLayers,
      lucideEye,
      lucideMove,
      lucideFrame }),
  ],
  templateUrl: './word-layout-toolbar.component.html',
  styleUrl: './word-layout-toolbar.component.css',
})
export class WordLayoutToolbarComponent implements OnInit, OnChanges {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly i18n = inject(I18nService, { optional: true });

  @Input() darkMode = false;
  @Input() totalPages = 1;
  @Input({ required: true }) layoutConfig!: DocumentLayoutConfig;
  @Input({ required: true }) formats!: EditorActiveFormats;
  @Input({ required: true }) activePaperPreset!: PaperFormatPreset;
  @Input() activeSectionInfo: ResolvedPageSectionInfo | null = null;

  @Output() updateLayout = new EventEmitter<(prev: DocumentLayoutConfig) => DocumentLayoutConfig>();
  @Output() insertPageBreak = new EventEmitter<void>();
  @Output() insertSectionBreak = new EventEmitter<SectionPageConfig>();
  @Output() updateSectionConfig = new EventEmitter<Partial<SectionPageConfig>>();
  @Output() deletePage = new EventEmitter<void>();
  @Output() applyColumns = new EventEmitter<SectionColumnsPreset>();
  @Output() applyIndentLeft = new EventEmitter<number>();
  @Output() applyIndentRight = new EventEmitter<number>();
  @Output() applySpaceBefore = new EventEmitter<number>();
  @Output() applySpaceAfter = new EventEmitter<number>();
  @Output() applyLineHeight = new EventEmitter<string>();
  @Output() toggleNavSidebar = new EventEmitter<void>();
  @Output() captureSelection = new EventEmitter<void>();

  readonly openMenu = signal<'margins' | 'orientation' | 'paperSize' | 'columns' | 'breaks' | 'lineNumbers' | 'hyphenation' | 'align' | null>(null);

  readonly paperFormatList = PAPER_FORMAT_LIST;
  readonly marginPresets = Object.entries(MARGIN_PRESETS).map(([key, preset]) => ({ key, preset }));

  readonly columnOptions: { id: SectionColumnsPreset; labelKey: string; descKey: string }[] = [
    { id: '1', labelKey: 'word.layout.col_one', descKey: 'word.layout.col_one_desc' },
    { id: '2', labelKey: 'word.layout.col_two', descKey: 'word.layout.col_two_desc' },
    { id: '3', labelKey: 'word.layout.col_three', descKey: 'word.layout.col_three_desc' },
    { id: 'left', labelKey: 'word.layout.col_left', descKey: 'word.layout.col_left_desc' },
    { id: 'right', labelKey: 'word.layout.col_right', descKey: 'word.layout.col_right_desc' },
  ];

  readonly customMarginTopCm = signal<number>(2.5);
  readonly customMarginBottomCm = signal<number>(2.5);
  readonly customMarginLeftCm = signal<number>(3.0);
  readonly customMarginRightCm = signal<number>(3.0);
  readonly Number = Number;
  readonly Math = Math;

  t(key: string, fallback?: string): string {
    return this.i18n?.t ? this.i18n.t(key) : fallback || key;
  }

  getMarginLabel(key: string, fallback: string): string {
    const i18nKey = `word.margin.${key}`;
    const translated = this.t(i18nKey);
    return translated !== i18nKey ? translated : fallback;
  }

  ngOnInit(): void {
    this.syncCustomMargins();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['layoutConfig']) {
      this.syncCustomMargins();
    }
  }

  toggle(name: 'margins' | 'orientation' | 'paperSize' | 'columns' | 'breaks' | 'lineNumbers' | 'hyphenation' | 'align'): void {
    this.captureSelection.emit();
    this.openMenu.update(cur => cur === name ? null : name);
  }

  selectMarginPreset(preset: typeof MARGIN_PRESETS[string]): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, margins: preset }));
  }

  applyCustomMargins(e: Event): void {
    e.preventDefault();
    this.openMenu.set(null);
    const topPx = Math.round((this.customMarginTopCm() / 2.54) * 96);
    const bottomPx = Math.round((this.customMarginBottomCm() / 2.54) * 96);
    const leftPx = Math.round((this.customMarginLeftCm() / 2.54) * 96);
    const rightPx = Math.round((this.customMarginRightCm() / 2.54) * 96);
    this.updateLayout.emit(prev => ({
      ...prev,
      margins: {
        label: 'Personalizado',
        topPx,
        bottomPx,
        leftPx,
        rightPx,
      },
    }));
  }

  toggleOrientation(): void {
    this.openMenu.set(null);
    const next: PageOrientation = this.layoutConfig.orientation === 'portrait' ? 'landscape' : 'portrait';
    this.updateLayout.emit(prev => ({ ...prev, orientation: next }));
  }

  setOrientation(next: PageOrientation): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, orientation: next }));
  }

  selectPaperFormat(id: PaperFormatId): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, paperFormatId: id }));
  }

  selectColumns(colId: SectionColumnsPreset): void {
    this.openMenu.set(null);
    this.applyColumns.emit(colId);
  }

  toggleLineNumbers(): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, showLineNumbers: !prev.showLineNumbers }));
  }

  toggleHyphenation(): void {
    this.openMenu.set(null);
    this.updateLayout.emit(prev => ({ ...prev, hyphenation: !prev.hyphenation }));
  }

  triggerPageBreak(): void {
    this.openMenu.set(null);
    this.insertPageBreak.emit();
  }

  triggerSectionBreak(config: SectionPageConfig = {}): void {
    this.openMenu.set(null);
    this.insertSectionBreak.emit(config);
  }

  toggleDifferentFirstPage(): void {
    const current = this.activeSectionInfo?.differentFirstPage ?? Boolean(this.layoutConfig.differentFirstPage);
    this.updateSectionConfig.emit({ differentFirstPage: !current });
    this.openMenu.set(null);
  }

  setSectionNumberFormat(format: PageNumberFormat): void {
    this.updateSectionConfig.emit({ pageNumberFormat: format });
    this.openMenu.set(null);
  }

  setSectionRestartNumbering(restartAt: number | undefined): void {
    this.updateSectionConfig.emit({ restartPageNumbering: restartAt });
    this.openMenu.set(null);
  }

  setSectionOrientation(orientation: PageOrientation): void {
    this.updateSectionConfig.emit({ orientation });
    this.openMenu.set(null);
  }

  onIndentLeftChange(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.applyIndentLeft.emit(num);
  }

  onIndentRightChange(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.applyIndentRight.emit(num);
  }

  onSpaceBeforeChange(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.applySpaceBefore.emit(num);
  }

  onSpaceAfterChange(val: string): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.applySpaceAfter.emit(num);
  }

  activePaperPresetFor(id: PaperFormatId): PaperFormatPreset {
    return PAPER_FORMAT_PRESETS[id] || PAPER_FORMAT_PRESETS['letter'];
  }

  private syncCustomMargins(): void {
    const m = this.layoutConfig?.margins;
    if (!m) return;
    this.customMarginTopCm.set(Number(((m.topPx / 96) * 2.54).toFixed(2)));
    this.customMarginBottomCm.set(Number(((m.bottomPx / 96) * 2.54).toFixed(2)));
    this.customMarginLeftCm.set(Number(((m.leftPx / 96) * 2.54).toFixed(2)));
    this.customMarginRightCm.set(Number(((m.rightPx / 96) * 2.54).toFixed(2)));
  }

  @HostListener('document:mousedown', ['$event'])
  closeOutside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.openMenu.set(null);
    }
  }
}
