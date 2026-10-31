import { Injectable } from '@angular/core';
import loader from '@monaco-editor/loader';
import type * as Monaco from 'monaco-editor';

export interface VimAdapter { dispose(): void; on(event: string, listener: (value: { mode: string }) => void): void }
export interface VimModule { initVimMode(editor: Monaco.editor.IStandaloneCodeEditor, status: HTMLElement): VimAdapter }
interface AmdRequire {
  (ids: string[], success: (module: VimModule) => void, failure: (error: unknown) => void): void;
  config(config: { paths: Record<string, string> }): void;
  undef?(id: string): void;
}
interface AmdWindow extends Window {
  require?: AmdRequire;
  define?: (name: string, dependencies: string[], factory: () => unknown) => void;
}

/** One Monaco runtime for code and LaTeX. Engines are loaded only on editor demand. */
@Injectable({ providedIn: 'root' })
export class MonacoRuntimeService {
  private pending?: Promise<typeof Monaco>;
  private vimPending?: Promise<VimModule>;
  private aliasesReady = false;

  load(): Promise<typeof Monaco> {
    if (!this.pending) {
      loader.config({ paths: { vs: new URL('assets/monaco/vs', document.baseURI).href } });
      this.pending = loader.init().catch(error => { this.pending = undefined; throw error; });
    }
    return this.pending;
  }

  loadVim(): Promise<VimModule> {
    if (!this.vimPending) this.vimPending = this.loadVimModule().catch(error => { this.vimPending = undefined; throw error; });
    return this.vimPending;
  }

  private async loadVimModule(): Promise<VimModule> {
    const monaco = await this.load();
    const amd = window as unknown as AmdWindow;
    if (!amd.require || !amd.define) throw new Error('No está disponible el cargador de Vim.');
    if (!this.aliasesReady) {
      // Monaco 0.57 ships flattened AMD chunks. Supply the two module names used by monaco-vim.
      const shift = await import('monaco-editor/editor/common/commands/shiftCommand.js');
      amd.define('vs/editor/editor.api', [], () => monaco);
      // The old adapter constructs ShiftCommand without Monaco's injected language service.
      // Plain indentation is sufficient for LaTeX; disable language-aware indentation here.
      class VimShiftCommand extends shift.ShiftCommand {
        constructor(range: Monaco.Selection, options: Record<string, unknown>) {
          super(range, { ...options, autoIndent: 0 }, undefined);
        }
      }
      amd.define('vs/editor/common/commands/shiftCommand', [], () => ({ ShiftCommand: VimShiftCommand }));
      this.aliasesReady = true;
    }
    let path = 'https://cdn.jsdelivr.net/npm/monaco-vim@0.4.2/dist/monaco-vim';
    const local = new URL('vendor/monaco-vim/monaco-vim.js', document.baseURI);
    try {
      const response = await fetch(local, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
      if (response.ok && /javascript/.test(response.headers.get('content-type') || '')) path = local.href.slice(0, -3);
    } catch { /* Local vendoring is optional; use the pinned upstream distribution. */ }
    amd.require.config({ paths: { 'weave-monaco-vim': path } });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(), 15_000);
      const fail = () => {
        clearTimeout(timer); amd.require?.undef?.('weave-monaco-vim');
        reject(new Error('No se pudo cargar Vim. Comprueba la conexión o instala sus archivos locales con npm run vendor:vim.'));
      };
      amd.require!(['weave-monaco-vim'], module => {
        clearTimeout(timer);
        if (typeof module?.initVimMode !== 'function') { fail(); return; }
        resolve(module);
      }, fail);
    });
  }
}
