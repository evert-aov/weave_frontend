import { Injectable } from '@angular/core';

/** The external module boundary is isolated here; Angular never bundles a second CM instance. */
export interface CodeMirrorRuntime {
  EditorState: any; StateField: any; StateEffect: any; Compartment: any;
  EditorView: any; Decoration: any; WidgetType: any; keymap: any;
  drawSelection: any; highlightActiveLine: any; history: any;
  historyKeymap: any[]; defaultKeymap: any[]; indentWithTab: any; searchKeymap: any[];
  loadVim(): Promise<{ vim: (options?: { status?: boolean }) => unknown }>;
}

@Injectable({ providedIn: 'root' })
export class CodeMirrorRuntimeService {
  private pending?: Promise<CodeMirrorRuntime>;
  load(): Promise<CodeMirrorRuntime> {
    return this.pending ??= this.loadModule().catch(error => { this.pending = undefined; throw error; });
  }
  private async loadModule(): Promise<CodeMirrorRuntime> {
    const local = new URL('vendor/codemirror/local/local.mjs', document.baseURI).href;
    let moduleUrl = new URL('vendor/codemirror/remote.mjs', document.baseURI).href;
    try {
      const response = await fetch(local, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      if (response.ok && /javascript/.test(response.headers.get('content-type') || '')) moduleUrl = local;
    } catch { /* Remote fallback; source remains editable if both are unavailable. */ }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const module = await Promise.race([
        import(/* @vite-ignore */ moduleUrl),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('No se pudo cargar CodeMirror. Puedes seguir editando el código fuente.')), 15000); }),
      ]);
      if (!module.EditorView || !module.EditorState || !module.loadVim) throw new Error('CodeMirror no está disponible.');
      return module;
    } finally { clearTimeout(timer); }
  }
}
