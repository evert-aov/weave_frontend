import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService } from '../../../../core/services/i18n.service';
import type { TableStyleRule } from '../../models/word-document.model';
import { DEFAULT_TABLE_STYLE, normalizeTableStyle } from '../../utils/table-styling';
import { FONT_FAMILIES } from '../../constants/word-document.constants';

@Component({
  selector: 'app-word-table-style-editor', standalone: true, imports: [CommonModule],
  template: `
    <div class="space-y-4 text-xs" data-testid="table-style-editor">
      <label class="block font-semibold">{{ t('Formato de las tablas', 'Table formatting') }}
        <select class="control mt-1" data-testid="table-style-mode" [value]="rule.mode" (change)="update({mode: $any($event.target).value})">
          <option value="inherit">{{ t('Seguir el formato del documento (incluido APA)', 'Follow document formatting (including APA)') }}</option>
          <option value="preserve">{{ t('Conservar el diseño actual de cada tabla', 'Preserve each table’s current design') }}</option>
          <option value="custom">{{ t('Diseño de tabla personalizado', 'Custom table design') }}</option>
        </select>
      </label>
      <p class="opacity-75">{{ t('El diseño personalizado tiene su propia fuente y espaciado, independientes de los párrafos y del formato APA.', 'Custom designs have their own font and spacing, independent of paragraphs and APA formatting.') }}</p>
      @if (rule.mode === 'custom') {
        <div class="flex flex-wrap gap-2">
          @for (preset of presets; track preset.id) {
            <button type="button" class="preset" (click)="applyPreset(preset.id)">{{ t(preset.es, preset.en) }}</button>
          }
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label>{{ t('Fuente', 'Font') }}
            <select class="control" data-testid="table-style-fontFamily" [value]="rule.fontFamily" (change)="update({fontFamily: $any($event.target).value})">
              @for (font of fontOptions; track font) { <option [value]="font">{{font}}</option> }
            </select>
          </label>
          @for (field of numericFields; track field.key) {
            <label>{{ t(field.es, field.en) }}
              <input class="control" type="number" [attr.data-testid]="'table-style-' + field.key" [min]="field.min" [max]="field.max" [step]="field.step"
                [value]="rule[field.key]" (change)="updateNumber(field.key, $any($event.target).value)" />
            </label>
          }
          <label>{{ t('Bordes', 'Borders') }}
            <select class="control" [value]="rule.borders" (change)="update({borders: $any($event.target).value})">
              <option value="grid">{{ t('Cuadrícula', 'Grid') }}</option><option value="horizontal">{{ t('Horizontales', 'Horizontal') }}</option><option value="none">{{ t('Sin bordes', 'None') }}</option>
            </select>
          </label>
          @for (field of alignFields; track field.key) {
            <label>{{ t(field.es, field.en) }}
              <select class="control" [value]="rule[field.key]" (change)="updateAlignment(field.key, $any($event.target).value)">
                @for (align of alignments; track align.id) { <option [value]="align.id">{{ t(align.es, align.en) }}</option> }
              </select>
            </label>
          }
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          @for (field of colorFields; track field.key) {
            <label class="flex items-center justify-between gap-2">{{ t(field.es, field.en) }}
              <input type="color" class="h-7 w-10 shrink-0" [attr.aria-label]="t(field.es, field.en)" [value]="rule[field.key]" (input)="updateColor(field.key, $any($event.target).value)" />
            </label>
          }
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          @for (field of flags; track field.key) {
            <label class="flex items-center gap-1.5"><input type="checkbox" [checked]="rule[field.key]" (change)="updateFlag(field.key, $any($event.target).checked)" />{{ t(field.es, field.en) }}</label>
          }
        </div>
        <div class="overflow-auto rounded-lg border border-slate-300 bg-white p-3 text-slate-900" data-testid="table-style-preview">
          <p class="text-[10px] text-slate-500 mb-2">{{ t('Vista previa', 'Preview') }}</p>
          <table class="w-full border-collapse" [style.font-family]="rule.fontFamily" [style.font-size.pt]="rule.fontSizePt" [style.line-height]="rule.lineHeight">
            @for (row of previewRows; track $index; let r = $index) {
              <tr>@for (cell of row; track $index) { <td [ngStyle]="previewCellStyle(r)">{{cell}}</td> }</tr>
            }
          </table>
        </div>
      }
    </div>
  `,
  styles: [`.control{display:block;width:100%;padding:6px 8px;border:1px solid #94a3b8;border-radius:6px;background:transparent;color:inherit;margin-top:4px}.control option{color:#0f172a;background:white}.preset{padding:5px 10px;border:1px solid #94a3b8;border-radius:6px}.preset:hover{background:#2563eb;color:white}`],
})
export class WordTableStyleEditorComponent {
  @Input() rule: TableStyleRule = { ...DEFAULT_TABLE_STYLE };
  @Output() ruleChange = new EventEmitter<TableStyleRule>();
  private i18n = inject(I18nService, { optional: true });
  t(es: string, en: string): string { return this.i18n?.currentLang() === 'en' ? en : es; }
  readonly fonts = FONT_FAMILIES.map(f => f.value.replace(/['"]/g, '').split(',')[0].trim());
  get fontOptions(): string[] {
    const current = this.rule.fontFamily;
    return current && !this.fonts.includes(current) ? [current, ...this.fonts] : this.fonts;
  }
  readonly numericFields = [
    { key: 'fontSizePt', es: 'Tamaño (pt)', en: 'Size (pt)', min: 6, max: 96, step: 0.5 },
    { key: 'lineHeight', es: 'Interlineado', en: 'Line spacing', min: 1, max: 4, step: 0.05 },
    { key: 'cellPaddingPt', es: 'Margen de celda (pt)', en: 'Cell padding (pt)', min: 0, max: 24, step: 0.5 },
    { key: 'borderWidthPt', es: 'Grosor del borde (pt)', en: 'Border width (pt)', min: 0, max: 6, step: 0.25 },
  ] as const;
  readonly colorFields = [
    { key: 'color', es: 'Texto', en: 'Text' }, { key: 'backgroundColor', es: 'Fondo', en: 'Background' },
    { key: 'headerColor', es: 'Texto del encabezado', en: 'Header text' }, { key: 'headerBackgroundColor', es: 'Fondo del encabezado', en: 'Header background' },
    { key: 'borderColor', es: 'Color de bordes', en: 'Border color' }, { key: 'bandColor', es: 'Filas alternas', en: 'Alternating rows' },
  ] as const;
  readonly flags = [
    { key: 'header', es: 'Primera fila como encabezado', en: 'First row as header' }, { key: 'headerBold', es: 'Encabezado en negrita', en: 'Bold header' },
    { key: 'bandedRows', es: 'Alternar colores de filas', en: 'Banded rows' }, { key: 'repeatHeader', es: 'Repetir encabezado en cada página', en: 'Repeat header on each page' },
  ] as const;
  readonly alignFields = [{ key: 'align', es: 'Alineación del texto', en: 'Text alignment' }, { key: 'headerAlign', es: 'Alineación del encabezado', en: 'Header alignment' }] as const;
  readonly alignments = [{ id: 'left', es: 'Izquierda', en: 'Left' }, { id: 'center', es: 'Centro', en: 'Center' }, { id: 'right', es: 'Derecha', en: 'Right' }, { id: 'justify', es: 'Justificar', en: 'Justify' }];
  readonly presets = [{ id: 'grid', es: 'Cuadrícula', en: 'Grid' }, { id: 'horizontal', es: 'Líneas horizontales', en: 'Horizontal rules' }, { id: 'striped', es: 'Filas alternas', en: 'Banded rows' }, { id: 'none', es: 'Sin bordes', en: 'No borders' }] as const;
  readonly previewRows = [['Concepto', 'Cantidad', 'Total'], ['Servicio A', '2', '120,00'], ['Servicio B', '1', '80,00'], ['Total', '3', '200,00']];
  update(patch: Partial<TableStyleRule>): void { this.ruleChange.emit(normalizeTableStyle({ ...this.rule, ...patch })); }
  updateNumber(key: typeof this.numericFields[number]['key'], value: string): void { this.update({ [key]: Number(value) }); }
  updateColor(key: typeof this.colorFields[number]['key'], value: string): void { this.update({ [key]: value }); }
  updateFlag(key: typeof this.flags[number]['key'], value: boolean): void { this.update({ [key]: value }); }
  updateAlignment(key: 'align' | 'headerAlign', value: TableStyleRule['align']): void { this.update({ [key]: value }); }
  applyPreset(preset: typeof this.presets[number]['id']): void { this.update({ mode: 'custom', borders: preset === 'striped' ? 'horizontal' : preset, bandedRows: preset === 'striped' }); }
  previewCellStyle(row: number): Record<string, string> {
    const rule = this.rule, header = row === 0 && rule.header;
    const border = rule.borders === 'none' ? 'none' : `${rule.borderWidthPt}pt solid ${rule.borderColor}`;
    return { border: rule.borders === 'grid' ? border : 'none', 'border-bottom': border,
      'border-top': row === 0 ? border : rule.borders === 'grid' ? border : 'none', padding: `${rule.cellPaddingPt}pt`,
      color: header ? rule.headerColor : rule.color, 'background-color': header ? rule.headerBackgroundColor : rule.bandedRows && (row - (rule.header ? 1 : 0)) % 2 === 1 ? rule.bandColor : rule.backgroundColor,
      'font-weight': header && rule.headerBold ? 'bold' : 'normal', 'text-align': header ? rule.headerAlign : rule.align };
  }
}
