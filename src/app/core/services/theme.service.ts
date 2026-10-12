import { Injectable, signal, effect } from '@angular/core';

/**
 * Servicio para alternar el tema claro / oscuro de Weave.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly isDark = signal<boolean>(
    localStorage.getItem('weave_theme') === 'dark',
  );

  constructor() {
    effect(() => {
      const dark = this.isDark();
      if (dark) {
        document.body.classList.add('dark');
        localStorage.setItem('weave_theme', 'dark');
      } else {
        document.body.classList.remove('dark');
        localStorage.setItem('weave_theme', 'light');
      }
    });
  }

  /**
   * Alterna entre modo oscuro y claro.
   */
  toggleTheme(): void {
    this.isDark.update((v) => !v);
  }
}
