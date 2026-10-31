import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemeService } from './core/services/theme.service';
import { I18nService } from './core/services/i18n.service';

/**
 * Componente raíz de la aplicación Weave.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);
  readonly isNavigating = signal(true);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.isNavigating.set(true);
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.isNavigating.set(false);
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  preventBackspaceHistoryNavigation(event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isEditable =
        target.isContentEditable ||
        Boolean(target.closest('[contenteditable="true"]'));
      if (!isInput && !isEditable) {
        event.preventDefault();
      }
    }
  }
}
