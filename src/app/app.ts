import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

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
