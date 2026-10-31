import { Injectable, WritableSignal, signal } from '@angular/core';

/** Conserva las dimensiones de los paneles del espacio de trabajo en este dispositivo. */
@Injectable({ providedIn: 'root' })
export class WorkspaceLayoutService {
  readonly navigationMinWidth = 240;
  readonly navigationMaxWidth = 440;
  readonly assistantMinWidth = 300;
  readonly assistantMaxWidth = 440;
  readonly navigationWidth = signal(this.readWidth('weave_navigation_width', 288, 240, 440));
  readonly assistantWidth = signal(this.readWidth('weave_assistant_width', 336, 300, 440));

  setNavigationWidth(width: number): void {
    this.saveWidth('weave_navigation_width', this.navigationWidth, width, 240, 440);
  }

  setAssistantWidth(width: number): void {
    this.saveWidth('weave_assistant_width', this.assistantWidth, width, 300, 440);
  }

  private readWidth(key: string, fallback: number, min: number, max: number): number {
    try {
      const stored = localStorage.getItem(key);
      const value = stored === null ? fallback : Number(stored);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    } catch {
      return fallback;
    }
  }

  private saveWidth(
    key: string,
    target: WritableSignal<number>,
    value: number,
    min: number,
    max: number,
  ): void {
    if (!Number.isFinite(value)) return;
    const width = Math.round(Math.max(min, Math.min(max, value)));
    target.set(width);
    try {
      localStorage.setItem(key, String(width));
    } catch {
      // El ajuste sigue funcionando cuando el navegador no permite guardar preferencias.
    }
  }
}
