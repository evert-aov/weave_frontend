import { Component, inject, input } from '@angular/core';
import { I18nService } from '../../../core/services/i18n.service';

/** Skeleton Screen animado mientras se carga o hidrata un documento/editor. */
@Component({
  selector: 'app-lazy-load-state',
  standalone: true,
  template: `
    <div class="load-state" role="status" aria-live="polite">
      @if (failed()) {
        <div class="load-error">
          <strong>{{ i18n.t('loading.failed') }}</strong>
          <span>{{ i18n.t('loading.retry') }}</span>
        </div>
      } @else {
        <div class="doc-skeleton-sheet" aria-hidden="true">
          <div class="sk-line sk-title"></div>
          <div class="sk-line sk-subtitle"></div>
          <div class="sk-spacer"></div>
          <div class="sk-line w-full"></div>
          <div class="sk-line w-92"></div>
          <div class="sk-line w-85"></div>
          <div class="sk-line w-60"></div>
          <div class="sk-spacer"></div>
          <div class="sk-block"></div>
          <div class="sk-spacer"></div>
          <div class="sk-line w-full"></div>
          <div class="sk-line w-88"></div>
          <div class="sk-line w-72"></div>
        </div>
        <span class="load-label">{{ i18n.t('loading.editor') }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; min-height: 220px; width: 100%; }
    .load-state {
      min-height: 100%;
      width: 100%;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 14px;
      color: var(--muted);
      font-size: 12px;
      background: var(--canvas);
    }
    .load-error {
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    strong { color: var(--text); }
    .doc-skeleton-sheet {
      width: min(760px, 100%);
      padding: 40px 44px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sk-line, .sk-block {
      border-radius: 6px;
      background: linear-gradient(
        90deg,
        var(--soft) 25%,
        var(--border) 50%,
        var(--soft) 75%
      );
      background-size: 200% 100%;
      animation: weave-shimmer 1.4s ease-in-out infinite;
    }
    .sk-title { width: 52%; height: 24px; }
    .sk-subtitle { width: 32%; height: 12px; }
    .sk-line { height: 12px; }
    .sk-block { width: 100%; height: 120px; border-radius: 8px; }
    .sk-spacer { height: 8px; }
    .w-full { width: 100%; }
    .w-92 { width: 92%; }
    .w-88 { width: 88%; }
    .w-85 { width: 85%; }
    .w-72 { width: 72%; }
    .w-60 { width: 60%; }
    .load-label { font-size: 12px; color: var(--muted); }
    @keyframes weave-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `,
})
export class LazyLoadStateComponent {
  readonly failed = input(false);
  readonly i18n = inject(I18nService);
}
