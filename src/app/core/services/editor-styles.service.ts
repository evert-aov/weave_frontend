import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** Carga hojas de estilo globales de herramientas únicamente al abrirlas. */
@Injectable({ providedIn: 'root' })
export class EditorStylesService {
  private readonly document = inject(DOCUMENT);
  private readonly pending = new Map<string, Promise<void>>();

  load(href: string): Promise<void> {
    const existing = this.pending.get(href);
    if (existing) return existing;
    const loading = new Promise<void>((resolve, reject) => {
      const link = this.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(href, this.document.baseURI).href;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        this.pending.delete(href);
        reject(new Error('Editor stylesheet could not be loaded'));
      };
      this.document.head.appendChild(link);
    });
    this.pending.set(href, loading);
    return loading;
  }
}
