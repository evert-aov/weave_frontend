import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sheet } from '../../models/excel.model';
import { I18nService } from '../../../../core/services/i18n.service';
import { ThemeService } from '../../../../core/services/theme.service';
@Component({
  selector: 'app-excel-names-modal', standalone: true, imports: [FormsModule],
  template: `
    <div class="backdrop" (click)="close.emit()">
      <section role="dialog" aria-modal="true" [attr.aria-label]="t('excel.names.title')" [class.dark]="theme.isDark()" (click)="$event.stopPropagation()" (keydown.escape)="close.emit()">
        <header><h2>{{ t('excel.names.title') }}</h2><button (click)="close.emit()" [attr.aria-label]="t('excel.names.close')">×</button></header>
        <label>{{ t('excel.names.name') }}<input [(ngModel)]="name" maxlength="255" /></label>
        <label>{{ t('excel.names.reference') }}<input [(ngModel)]="reference" /></label>
        <label>{{ t('excel.names.scope') }}<select [(ngModel)]="scope"><option value="workbook">{{ t('excel.names.workbook') }}</option><option value="sheet">{{ t('excel.names.sheet') }}</option></select></label>
        @if (error) { <p role="alert">{{ t(error) }}</p> }
        <div class="actions"><button (click)="save.emit({name, reference, scope})">{{ t('excel.names.save') }}</button><button (click)="createTable.emit({name, headers})">{{ t('excel.names.table') }}</button></div>
        <label class="checkbox"><input type="checkbox" [(ngModel)]="headers" />{{ t('excel.names.headers') }}</label>
        <div class="entries">
          @for (entry of entries; track entry.key) {
            <article><button (click)="name = entry.name; reference = entry.reference; scope = entry.scope">{{ entry.name }}</button><code>{{ entry.reference }}</code>
              <button (click)="insert.emit(entry.name)">{{ t('excel.names.insert') }}</button><button (click)="remove.emit({ name: entry.name, scope: entry.scope, sheetId: entry.sheetId })">{{ t('excel.names.delete') }}</button></article>
          }
          @for (table of sheet.tables || []; track table.name) { <article><strong>{{ table.name }}</strong><code>{{ table.columns.join(', ') }}</code><button (click)="insert.emit(table.name + '[' + table.columns[0] + ']')">{{ t('excel.names.insert') }}</button><button (click)="removeTable.emit(table.name)">{{ t('excel.names.delete') }}</button></article> }
        </div>
      </section>
    </div>`,
  styles: [`:host{position:relative;z-index:70}.backdrop{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center}section{width:640px;max-width:95vw;max-height:85vh;overflow:auto;background:#fff;color:#334155;padding:24px;border-radius:12px;box-shadow:0 12px 48px #0004}section.dark{background:#202024;color:#e2e8f0}header,.actions,article{display:flex;align-items:center;gap:12px}header{justify-content:space-between;margin-bottom:16px}label{display:flex;flex-direction:column;gap:4px;margin:8px 0;font-size:12px}input,select{padding:8px;border:1px solid #94a3b8;border-radius:4px;background:transparent;color:inherit}.actions{flex-wrap:wrap;margin:12px 0}button{padding:6px 10px;border:1px solid #94a3b8;border-radius:5px;font-size:12px}.checkbox{flex-direction:row;align-items:center}.entries{margin-top:16px}article{border-top:1px solid #94a3b855;padding:8px 0;flex-wrap:wrap}article code{max-width:100%;overflow-wrap:anywhere;font-size:11px}p[role=alert]{color:#e11d48;font-size:12px}`],
})
export class ExcelNamesModalComponent {
  @Input({ required: true }) sheet!: Sheet;
  @Input() sheets: Sheet[] = [];
  @Input() reference = '';
  @Input() error = '';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{ name: string; reference: string; scope: string }>();
  @Output() remove = new EventEmitter<{ name: string; scope: string; sheetId: string }>();
  @Output() createTable = new EventEmitter<{ name: string; headers: boolean }>();
  @Output() removeTable = new EventEmitter<string>();
  @Output() insert = new EventEmitter<string>();
  name = ''; scope = 'workbook'; headers = true;
  readonly i18n = inject(I18nService); readonly theme = inject(ThemeService);
  t(key: string): string { return this.i18n.t(key); }
  get entries() {
    return this.sheets.flatMap(s => [
      ...Object.entries(s.workbookNames || {}).map(([name, reference]) => ({ key: `book:${name}`, name, reference, scope: 'workbook', sheetId: s.id })),
      ...(s.id === this.sheet.id ? Object.entries(s.definedNames || {}).map(([name, reference]) => ({ key: `${s.id}:${name}`, name, reference, scope: 'sheet', sheetId: s.id })) : []),
    ]);
  }
}
