import { Injectable, signal, effect } from '@angular/core';

/**
 * Servicio para alternar el tema claro / oscuro de Weave.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly isDark = signal<boolean>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('weave_theme') === 'dark'
      : false,
  );

  constructor() {
    effect(() => {
      const dark = this.isDark();
      if (typeof document !== 'undefined') {
        if (dark) {
          document.body.classList.add('dark');
        } else {
          document.body.classList.remove('dark');
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('weave_theme', dark ? 'dark' : 'light');
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
