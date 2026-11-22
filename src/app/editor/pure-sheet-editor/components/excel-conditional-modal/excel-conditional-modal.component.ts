import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ColorScalePreset,
  ConditionalRule,
  ConditionalRuleType,
  IconSetStyle,
  PresetStyle,
  SelectionRange,
} from '../../models/excel.model';
import { colIndexToLetter } from '../../services/formula-engine.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-excel-conditional-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './excel-conditional-modal.component.html',
  styleUrls: ['./excel-conditional-modal.component.scss']
})
export class ExcelConditionalModalComponent {
  @Input({ required: true }) range!: SelectionRange;
  @Input() existingRules: ConditionalRule[] = [];

  @Output() addRule = new EventEmitter<ConditionalRule>();
  @Output() removeRule = new EventEmitter<string>();
  @Output() clearRangeRules = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly dataBarColors = ['#10b981', '#0284c7', '#f59e0b', '#ef4444', '#8b5cf6'];

  ruleType: ConditionalRuleType = 'greaterThan';
  val1 = 1000;
  val2 = 3000;
  textVal = '';
  presetStyle: PresetStyle = 'good';
  colorScale: ColorScalePreset = 'green-yellow-red';
  dataBarColor = '#10b981';
  iconSetStyle: IconSetStyle = 'trafficLights';

  get usesPresetStyle(): boolean {
    return (
      this.ruleType !== 'colorScale' &&
      this.ruleType !== 'dataBar' &&
      this.ruleType !== 'iconSet'
    );
  }

  describeRule(rule: ConditionalRule): string {
    const minC = Math.min(rule.range.startCol, rule.range.endCol);
    const maxC = Math.max(rule.range.startCol, rule.range.endCol);
    const minR = Math.min(rule.range.startRow, rule.range.endRow);
    const maxR = Math.max(rule.range.startRow, rule.range.endRow);
    const ref = `${colIndexToLetter(minC)}${minR + 1}:${colIndexToLetter(maxC)}${maxR + 1}`;
    const isEs = this.i18n.currentLang() === 'es';
    const labelsEs: Record<ConditionalRuleType, string> = {
      greaterThan: `> ${rule.value1 ?? ''}`,
      lessThan: `< ${rule.value1 ?? ''}`,
      between: `Entre ${rule.value1 ?? ''} y ${rule.value2 ?? ''}`,
      equalTo: `= "${rule.textValue ?? ''}"`,
      containsText: `Contiene "${rule.textValue ?? ''}"`,
      duplicates: 'Duplicados',
      aboveAverage: 'Sobre el promedio',
      colorScale: 'Escala de color',
      dataBar: 'Barra de datos',
      iconSet: rule.iconSetStyle === 'arrows' ? 'Iconos (Flechas)' : 'Iconos (Semáforo)',
    };
    const labelsEn: Record<ConditionalRuleType, string> = {
      greaterThan: `> ${rule.value1 ?? ''}`,
      lessThan: `< ${rule.value1 ?? ''}`,
      between: `Between ${rule.value1 ?? ''} & ${rule.value2 ?? ''}`,
      equalTo: `= "${rule.textValue ?? ''}"`,
      containsText: `Contains "${rule.textValue ?? ''}"`,
      duplicates: 'Duplicates',
      aboveAverage: 'Above average',
      colorScale: 'Color Scale',
      dataBar: 'Data Bar',
      iconSet: rule.iconSetStyle === 'arrows' ? 'Icons (Arrows)' : 'Icons (Lights)',
    };
    return `${ref} · ${(isEs ? labelsEs : labelsEn)[rule.type] || rule.type}`;
  }

  handleApply(): void {
    const newRule: ConditionalRule = {
      id: `rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      range: { ...this.range },
      type: this.ruleType,
      value1: this.val1,
      value2: this.val2,
      textValue: this.textVal,
      presetStyle: this.presetStyle,
      colorScale: this.colorScale,
      dataBarColor: this.dataBarColor,
      iconSetStyle: this.iconSetStyle,
    };
    this.addRule.emit(newRule);
    this.close.emit();
  }
}
