import { Component, inject, input } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';

/** Estado ligero mientras se descarga un editor, sin importar sus bibliotecas. */
@Component({
  selector: 'app-lazy-load-state',
  standalone: true,
  template: `
    <div class="load-state" role="status" aria-live="polite">
      @if (failed()) {
        <strong>{{ i18n.t('loading.failed') }}</strong>
        <span>{{ i18n.t('loading.retry') }}</span>
      } @else {
        <div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>
        <span>{{ i18n.t('loading.editor') }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; min-height: 100px; }
    .load-state { min-height: 160px; padding: 32px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px; color: var(--muted); font-size: 12px; }
    strong { color: var(--text); }
    .skeleton { width: min(360px, 100%); display: grid; gap: 12px; margin-bottom: 8px; }
    i { display: block; height: 10px; background: var(--border); border-radius: 6px; }
    i:first-child { width: 55%; height: 18px; }
    i:last-child { width: 80%; }
  `,
})
export class LazyLoadStateComponent {
  readonly failed = input(false);
  readonly i18n = inject(I18nService);
}
