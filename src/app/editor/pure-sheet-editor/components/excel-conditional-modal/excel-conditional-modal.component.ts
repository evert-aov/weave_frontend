import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ColorScalePreset,
  ConditionalRule,
  ConditionalRuleType,
  PresetStyle,
  SelectionRange,
} from '../../models/excel.model';
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

  @Output() addRule = new EventEmitter<ConditionalRule>();
  @Output() clearRangeRules = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  ruleType: ConditionalRuleType = 'greaterThan';
  val1 = 1000;
  val2 = 3000;
  textVal = '';
  presetStyle: PresetStyle = 'good';
  colorScale: ColorScalePreset = 'green-yellow-red';

  handleApply(): void {
    const newRule: ConditionalRule = {
      id: `rule-${Date.now()}`,
      range: { ...this.range },
      type: this.ruleType,
      value1: this.val1,
      value2: this.val2,
      textValue: this.textVal,
      presetStyle: this.presetStyle,
      colorScale: this.colorScale,
    };
    this.addRule.emit(newRule);
    this.close.emit();
  }
}
