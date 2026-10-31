import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EditorKeybindingsService {
  readonly vim = signal(this.read());
  setVim(enabled: boolean): void {
    this.vim.set(enabled);
    try { localStorage.setItem('weave_latex_vim', String(enabled)); } catch { /* Session preference still works. */ }
  }
  private read(): boolean { try { return localStorage.getItem('weave_latex_vim') === 'true'; } catch { return false; } }
}
