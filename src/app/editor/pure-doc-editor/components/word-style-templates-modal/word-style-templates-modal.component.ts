import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  lucideAlignCenter, lucideAlignJustify, lucideAlignLeft, lucideAlignRight, lucideBold, lucideCheck, lucideItalic, lucidePalette, lucidePlus, lucideSparkles, lucideTrash2, lucideUnderline, lucideX } from '@ng-icons/lucide';
import {
  ElementStyleRule,
  StyleTargetTag,
  StyleTemplate,
  TableStyleRule,
  TextAlignment,
} from '../../models/word-document.model';
import { FONT_FAMILIES } from '../../constants/word-document.constants';
import { I18nService } from '../../../../core/services/i18n.service';
import { WordTableStyleEditorComponent } from './word-table-style-editor.component';
import { normalizeTableStyle } from '../../utils/table-styling';

const TARGET_TAGS: StyleTargetTag[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'];

@Component({
  selector: 'app-word-style-templates-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, WordTableStyleEditorComponent],
  providers: [
    provideLucideIcons({ lucidePalette,
      lucideX,
      lucideCheck,
      lucidePlus,
      lucideAlignLeft,
      lucideAlignCenter,
      lucideAlignRight,
      lucideAlignJustify,
      lucideBold,
      lucideItalic,
      lucideUnderline,
      lucideSparkles,
      lucideTrash2 }),
  ],
  templateUrl: './word-style-templates-modal.component.html',
  styleUrls: ['./word-style-templates-modal.component.css'],
})
export class WordStyleTemplatesModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() darkMode = false;
  @Input() templates: StyleTemplate[] = [];
  @Input() activeTemplateId = '';
  @Input() canApplyTableStyle = false;
  @Input() selectedTableDesign?: { rule: TableStyleRule; fixed: boolean };
  @Output() close = new EventEmitter<void>();
  @Output() saveCustomTemplate = new EventEmitter<StyleTemplate>();
  @Output() deleteCustomTemplate = new EventEmitter<string>();
  @Output() applyTemplateToDocument = new EventEmitter<StyleTemplate>();
  @Output() applySingleRuleToSelection = new EventEmitter<ElementStyleRule>();
  @Output() applyTableStyleToSelection = new EventEmitter<{ rule: TableStyleRule; fixed: boolean }>();

  private readonly i18n = inject(I18nService, { optional: true });

  t(key: string, paramsOrFallback?: Record<string, string | number> | string, fallback?: string): string {
    if (!this.i18n?.t) {
      return typeof paramsOrFallback === 'string' ? paramsOrFallback : (fallback || key);
    }
    if (typeof paramsOrFallback === 'string') {
      const translated = this.i18n.t(key);
      return translated !== key ? translated : paramsOrFallback;
    }
    const translated = this.i18n.t(key, paramsOrFallback);
    return (translated !== key || !fallback) ? translated : fallback;
  }

  readonly Number = Number;
  get targetTags(): StyleTargetTag[] { return this.draftAcademicStyle() === 'apa7' ? TARGET_TAGS.filter(tag => tag !== 'H6') : TARGET_TAGS; }
  readonly fontFamilies = FONT_FAMILIES;
  readonly alignOptions: { id: TextAlignment; icon: string; labelKey: string; fallback: string }[] = [
    { id: 'left', icon: 'align-left', labelKey: 'word.style.align_left', fallback: 'Izquierda' },
    { id: 'center', icon: 'align-center', labelKey: 'word.style.align_center', fallback: 'Centrado' },
    { id: 'right', icon: 'align-right', labelKey: 'word.style.align_right', fallback: 'Derecha' },
    { id: 'justify', icon: 'align-justify', labelKey: 'word.style.align_justify', fallback: 'Justificado' },
  ];

  readonly selectedTemplateId = signal<string>('');
  readonly editingTarget = signal<StyleTargetTag>('H1');
  readonly draftAcademicStyle = signal<StyleTemplate['academicStyle']>(undefined);
  readonly draftListRules = signal<StyleTemplate['listRules']>(undefined);
  readonly editingTables = signal(false);
  readonly draftTableStyle = signal<TableStyleRule>(normalizeTableStyle());
  readonly fixedTableStyle = signal(true);
  readonly draftName = signal<string>('');
  readonly draftDescription = signal<string>('');
  readonly draftRules = signal<Record<StyleTargetTag, ElementStyleRule>>(
    {} as Record<StyleTargetTag, ElementStyleRule>
  );

  readonly currentRule = computed<ElementStyleRule>(
    () => this.draftRules()[this.editingTarget()]
  );

  ngOnInit(): void {
    this.loadActiveTemplate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) this.loadActiveTemplate();
  }

  private loadActiveTemplate(): void {
    const currentInitial =
      this.templates.find((t) => t.id === this.activeTemplateId) || this.templates[0];
    if (!currentInitial) return;
    this.selectedTemplateId.set(currentInitial.id);
    this.draftName.set(currentInitial.name);
    this.draftDescription.set(currentInitial.description);
    this.draftRules.set(JSON.parse(JSON.stringify(currentInitial.rules)));
    this.draftAcademicStyle.set(currentInitial.academicStyle);
    this.draftListRules.set(currentInitial.listRules ? structuredClone(currentInitial.listRules) : undefined);
    this.draftTableStyle.set(normalizeTableStyle(currentInitial.tableStyle));
    if (this.selectedTableDesign) {
      this.draftTableStyle.set(normalizeTableStyle(this.selectedTableDesign.rule));
      this.fixedTableStyle.set(this.selectedTableDesign.fixed);
      this.editingTables.set(true);
    }
  }

  get previewStyle(): Record<string, string | number> {
    const r = this.currentRule();
    const rawColor = (r.color || '#000000').trim().toLowerCase();
    const darkInkOnDarkBg =
      this.darkMode &&
      (rawColor === '#000' ||
        rawColor === '#000000' ||
        rawColor === '#0f172a' ||
        rawColor === '#1e293b' ||
        rawColor === '#111827' ||
        rawColor === 'black');
    return {
      fontFamily: `'${r.fontFamily}', serif`,
      fontSize: `${r.fontSizePt}pt`,
      textAlign: r.align,
      fontWeight: r.bold ? 'bold' : 'normal',
      fontStyle: r.italic ? 'italic' : 'normal',
      textDecoration: r.underline ? 'underline' : 'none',
      color: darkInkOnDarkBg ? '#f4f4f5' : r.color,
      lineHeight: r.lineHeight,
      marginTop: `${r.spaceBeforePt}pt`,
      marginBottom: `${r.spaceAfterPt}pt`,
      textIndent: `${r.firstLineIndentPt}pt`,
    };
  }

  cleanFontName(value: string): string {
    return value.replace(/['"]/g, '').split(',')[0].trim();
  }

  handleSelectTemplate(tpl: StyleTemplate): void {
    this.selectedTemplateId.set(tpl.id);
    this.draftName.set(tpl.name);
    this.draftDescription.set(tpl.description);
    this.draftRules.set(JSON.parse(JSON.stringify(tpl.rules)));
    this.draftAcademicStyle.set(tpl.academicStyle);
    this.draftListRules.set(tpl.listRules ? structuredClone(tpl.listRules) : undefined);
    this.draftTableStyle.set(normalizeTableStyle(tpl.tableStyle));
  }

  updateCurrentRule(patch: Partial<ElementStyleRule>): void {
    this.draftRules.update((prev) => ({
      ...prev,
      [this.editingTarget()]: {
        ...prev[this.editingTarget()],
        ...patch,
      },
    }));
  }

  private buildBlankCustomRules(): Record<StyleTargetTag, ElementStyleRule> {
    return {
      H1: {
        target: 'H1',
        label: 'Encabezado 1 (H1)',
        fontFamily: 'Inter',
        fontSizePt: 20,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#0f172a',
        lineHeight: 1.25,
        spaceBeforePt: 14,
        spaceAfterPt: 6,
        firstLineIndentPt: 0,
      },
      H2: {
        target: 'H2',
        label: 'Encabezado 2 (H2)',
        fontFamily: 'Inter',
        fontSizePt: 16,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#1e293b',
        lineHeight: 1.3,
        spaceBeforePt: 12,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H3: {
        target: 'H3',
        label: 'Encabezado 3 (H3)',
        fontFamily: 'Inter',
        fontSizePt: 13.5,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#1e293b',
        lineHeight: 1.35,
        spaceBeforePt: 10,
        spaceAfterPt: 4,
        firstLineIndentPt: 0,
      },
      H4: {
        target: 'H4',
        label: 'Encabezado 4 (H4)',
        fontFamily: 'Inter',
        fontSizePt: 12,
        align: 'left',
        bold: true,
        italic: true,
        underline: false,
        color: '#334155',
        lineHeight: 1.4,
        spaceBeforePt: 8,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      H5: {
        target: 'H5',
        label: 'Encabezado 5 (H5)',
        fontFamily: 'Inter',
        fontSizePt: 11,
        align: 'left',
        bold: true,
        italic: false,
        underline: false,
        color: '#334155',
        lineHeight: 1.4,
        spaceBeforePt: 6,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      H6: {
        target: 'H6',
        label: 'Encabezado 6 (H6)',
        fontFamily: 'Inter',
        fontSizePt: 10.5,
        align: 'left',
        bold: false,
        italic: true,
        underline: false,
        color: '#475569',
        lineHeight: 1.4,
        spaceBeforePt: 4,
        spaceAfterPt: 2,
        firstLineIndentPt: 0,
      },
      P: {
        target: 'P',
        label: 'Párrafo Normal (P)',
        fontFamily: 'Inter',
        fontSizePt: 11,
        align: 'left',
        bold: false,
        italic: false,
        underline: false,
        color: '#000000',
        lineHeight: 1.5,
        spaceBeforePt: 0,
        spaceAfterPt: 8,
        firstLineIndentPt: 0,
      },
    };
  }

  /** Creates a brand-new custom template from scratch without cloning an existing preset. */
  handleCreateBlankCustomTemplate(): void {
    const customCount = this.templates.filter((tpl) => tpl.isCustom).length + 1;
    const baseName = this.t('word.style.new_template_default_name', 'Nueva Plantilla Personalizada');
    const newId = `custom-tpl-${Date.now().toString(36)}`;
    const blankTpl: StyleTemplate = {
      id: newId,
      name: customCount > 1 ? `${baseName} ${customCount}` : baseName,
      description: this.t('word.style.new_template_default_desc', 'Plantilla personalizada desde cero para H1–H6 y párrafos.'),
      isCustom: true,
      rules: this.buildBlankCustomRules(),
    };
    this.saveCustomTemplate.emit(blankTpl);
    this.selectedTemplateId.set(newId);
    this.draftName.set(blankTpl.name);
    this.draftDescription.set(blankTpl.description);
    this.draftRules.set(JSON.parse(JSON.stringify(blankTpl.rules)));
    this.draftAcademicStyle.set(undefined);
    this.draftListRules.set(undefined);
    this.draftTableStyle.set(normalizeTableStyle());
    this.editingTarget.set('H1');
  }

  handleCreateNewCustomTemplate(): void {
    const newId = `custom-tpl-${Date.now().toString(36)}`;
    const newTpl: StyleTemplate = {
      id: newId,
      name: `${this.draftName()} (Personalizada)`,
      description: 'Plantilla de estilos personalizada para encabezados H1–H6 y párrafos.',
      isCustom: true,
      academicStyle: this.draftAcademicStyle(),
      rules: JSON.parse(JSON.stringify(this.draftRules())),
      tableStyle: normalizeTableStyle(this.draftTableStyle()),
      ...(this.draftListRules() ? { listRules: structuredClone(this.draftListRules()) } : {}),
    };
    this.saveCustomTemplate.emit(newTpl);
    this.selectedTemplateId.set(newId);
    this.draftName.set(newTpl.name);
  }

  private buildDraftCustomTemplate(): StyleTemplate {
    return {
      id: this.templates.some(template => template.id === this.selectedTemplateId() && template.isCustom)
        ? this.selectedTemplateId()
        : `custom-tpl-${Date.now().toString(36)}`,
      name: this.draftName().trim() || 'Mi Plantilla de Estilos',
      description: this.draftDescription().trim() || 'Plantilla personalizada',
      isCustom: true,
      academicStyle: this.draftAcademicStyle(),
      rules: JSON.parse(JSON.stringify(this.draftRules())),
      tableStyle: normalizeTableStyle(this.draftTableStyle()),
      ...(this.draftListRules() ? { listRules: structuredClone(this.draftListRules()) } : {}),
    };
  }

  handleSaveCustomOnly(): void {
    const saved = this.buildDraftCustomTemplate();
    this.saveCustomTemplate.emit(saved);
    this.selectedTemplateId.set(saved.id);
    this.draftName.set(saved.name);
    this.draftDescription.set(saved.description);
  }

  handleApplyTableOnly(): void {
    if (!this.canApplyTableStyle || this.draftTableStyle().mode !== 'custom') return;
    this.applyTableStyleToSelection.emit({ rule: normalizeTableStyle(this.draftTableStyle()), fixed: this.fixedTableStyle() });
    this.close.emit();
  }

  handleSaveAndApplyAll(): void {
    const updatedTpl = this.buildDraftCustomTemplate();
    this.applyTemplateToDocument.emit(updatedTpl);
    this.close.emit();
  }
}
