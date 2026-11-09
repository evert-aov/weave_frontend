import { Component, inject } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';
import { ProofreadingService } from '../../../core/services/proofreading.service';
@Component({ selector: 'app-proofreading-control', standalone: true, template: `
  <details>
    <summary [title]="i18n.t('writing.settings')">{{ writing.language() === 'es' ? 'ES' : 'EN' }} · ABC</summary>
    <div class="writing-settings">
      <label>{{ i18n.t('writing.language') }}<select [value]="writing.language()" (change)="writing.setLanguage($any($event.target).value)"><option value="es">Español</option><option value="en">English</option></select></label>
      <label class="writing-toggle"><input type="checkbox" [checked]="writing.enabled()" (change)="writing.toggle()" />{{ i18n.t('writing.autocorrect') }}</label>
      <small>{{ i18n.t('writing.hint') }}</small>
    </div>
  </details>
  @if (writing.notice(); as notice) {
    <span class="writing-notice" role="status">{{ notice.kind === 'correction' ? i18n.t('writing.corrected', { before: notice.before, after: notice.after || '' }) : i18n.t('writing.repeated', { word: notice.before }) }}</span>
    @if (notice.undo) { <button type="button" (click)="writing.undo()">{{ i18n.t('writing.undo') }}</button> }
    <button type="button" (click)="writing.dismiss()" [attr.aria-label]="i18n.t('writing.dismiss')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
  }
`, styles: [`
  :host { display:flex; align-items:center; gap:6px; position:relative; font-size:11px; color:var(--muted); max-width:100%; }
  summary,button { cursor:pointer; border:0; border-radius:5px; background:transparent; padding:3px 5px; color:inherit; }
  summary { list-style:none; white-space:nowrap; } summary::-webkit-details-marker { display:none; }
  summary:hover,button:hover { background:var(--soft); color:var(--text); }
  .writing-settings { position:absolute; bottom:calc(100% + 8px); left:0; width:250px; max-width:calc(100vw - 36px); padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--panel); color:var(--text); box-shadow:0 6px 24px #0002; z-index:50; }
  label { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
  select { padding:4px; border:1px solid var(--border); border-radius:5px; background:var(--bg); color:inherit; }
  .writing-toggle { justify-content:flex-start; } small { line-height:1.5; color:var(--muted); display:block; }
  .writing-notice { overflow-wrap:anywhere; } button { color:var(--accent); }
`] })
export class ProofreadingControlComponent {
  readonly writing = inject(ProofreadingService);
  readonly i18n = inject(I18nService);
}
