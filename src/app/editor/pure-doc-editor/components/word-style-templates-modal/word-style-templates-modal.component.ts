import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAlignCenter,
  LucideAlignJustify,
  LucideAlignLeft,
  LucideAlignRight,
  LucideBold,
  LucideCheck,
  LucideDynamicIcon,
  LucideItalic,
  LucidePalette,
  LucidePlus,
  LucideSparkles,
  LucideTrash2,
  LucideUnderline,
  LucideX,
  provideLucideIcons,
} from '@lucide/angular';
import {
  ElementStyleRule,
  StyleTargetTag,
  StyleTemplate,
  TextAlignment,
} from '../../models/word-document.model';
import { FONT_FAMILIES } from '../../constants/word-document.constants';

const TARGET_TAGS: StyleTargetTag[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'];

@Component({
  selector: 'app-word-style-templates-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucidePalette,
      LucideX,
      LucideCheck,
      LucidePlus,
      LucideAlignLeft,
      LucideAlignCenter,
      LucideAlignRight,
      LucideAlignJustify,
      LucideBold,
      LucideItalic,
      LucideUnderline,
      LucideSparkles,
      LucideTrash2
    ),
  ],
  templateUrl: './word-style-templates-modal.component.html',
  styleUrls: ['./word-style-templates-modal.component.scss'],
})
export class WordStyleTemplatesModalComponent implements OnInit {
  @Input() isOpen = false;
  @Input() templates: StyleTemplate[] = [];
  @Input() activeTemplateId = '';
  @Output() close = new EventEmitter<void>();
  @Output() saveCustomTemplate = new EventEmitter<StyleTemplate>();
  @Output() deleteCustomTemplate = new EventEmitter<string>();
  @Output() applyTemplateToDocument = new EventEmitter<StyleTemplate>();
  @Output() applySingleRuleToSelection = new EventEmitter<ElementStyleRule>();

  readonly Number = Number;
  readonly targetTags = TARGET_TAGS;
  readonly fontFamilies = FONT_FAMILIES;
  readonly alignOptions: { id: TextAlignment; icon: string; label: string }[] = [
    { id: 'left', icon: 'align-left', label: 'Izquierda' },
    { id: 'center', icon: 'align-center', label: 'Centrado' },
    { id: 'right', icon: 'align-right', label: 'Derecha' },
    { id: 'justify', icon: 'align-justify', label: 'Justificado' },
  ];

  readonly selectedTemplateId = signal<string>('');
  readonly editingTarget = signal<StyleTargetTag>('H1');
  readonly draftName = signal<string>('');
  readonly draftDescription = signal<string>('');
  readonly draftRules = signal<Record<StyleTargetTag, ElementStyleRule>>(
    {} as Record<StyleTargetTag, ElementStyleRule>
  );

  readonly currentRule = computed<ElementStyleRule>(
    () => this.draftRules()[this.editingTarget()]
  );

  ngOnInit(): void {
    const currentInitial =
      this.templates.find((t) => t.id === this.activeTemplateId) || this.templates[0];
    if (!currentInitial) return;
    this.selectedTemplateId.set(currentInitial.id);
    this.draftName.set(currentInitial.name);
    this.draftDescription.set(currentInitial.description);
    this.draftRules.set(JSON.parse(JSON.stringify(currentInitial.rules)));
  }

  get previewStyle(): Record<string, string | number> {
    const r = this.currentRule();
    return {
      fontFamily: `'${r.fontFamily}', serif`,
      fontSize: `${r.fontSizePt}pt`,
      textAlign: r.align,
      fontWeight: r.bold ? 'bold' : 'normal',
      fontStyle: r.italic ? 'italic' : 'normal',
      textDecoration: r.underline ? 'underline' : 'none',
      color: r.color,
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

  handleCreateNewCustomTemplate(): void {
    const newId = `custom-tpl-${Date.now().toString(36)}`;
    const newTpl: StyleTemplate = {
      id: newId,
      name: `${this.draftName()} (Personalizada)`,
      description: 'Plantilla de estilos personalizada para encabezados H1–H6 y párrafos.',
      isCustom: true,
      rules: JSON.parse(JSON.stringify(this.draftRules())),
    };
    this.saveCustomTemplate.emit(newTpl);
    this.selectedTemplateId.set(newId);
    this.draftName.set(newTpl.name);
  }

  handleSaveAndApplyAll(): void {
    const updatedTpl: StyleTemplate = {
      id: this.selectedTemplateId().startsWith('custom-')
        ? this.selectedTemplateId()
        : `custom-tpl-${Date.now().toString(36)}`,
      name: this.draftName().trim() || 'Mi Plantilla de Estilos',
      description: this.draftDescription().trim() || 'Plantilla personalizada',
      isCustom: true,
      rules: JSON.parse(JSON.stringify(this.draftRules())),
    };
    this.saveCustomTemplate.emit(updatedTpl);
    this.applyTemplateToDocument.emit(updatedTpl);
    this.close.emit();
  }
}
