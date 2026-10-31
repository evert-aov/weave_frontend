import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { FullscreenPanelDirective } from '../directives/fullscreen-panel.directive';
import { IconComponent } from '../components/icon/icon.component';
import { LatexCompilerService, downloadLatexFile, latexError, latexPdfBlob } from './latex-compiler.service';

@Component({
  selector: 'app-latex-preview', standalone: true, imports: [IconComponent, FullscreenPanelDirective],
  template: `
    <section class="preview-panel" appFullscreenPanel #fullscreen="fullscreenPanel">
    <div class="preview-bar">
      <button type="button" class="btn-recompile" (click)="compile()" [disabled]="busy() || !source.trim() || source.length > 300000" title="Recompilar PDF (Ctrl + Enter)">
        <app-icon name="refresh" [size]="14" [class.spinning]="busy()" />
        <span>{{ busy() ? 'Compilando…' : 'Recompilar' }}</span>
      </button>
      <button type="button" class="btn-preview-action" (click)="download()" [disabled]="!pdf || stale()" title="Descargar PDF">
        <app-icon name="download" [size]="14" />
        <span>PDF</span>
      </button>
      <button type="button" class="btn-preview-action icon-only" (click)="fullscreen.toggle()" [attr.aria-pressed]="fullscreen.expanded()" [title]="fullscreen.expanded() ? 'Salir de pantalla completa' : 'Pantalla completa'">
        <app-icon [name]="fullscreen.expanded() ? 'minimize' : 'maximize'" [size]="14" />
      </button>
      @if (stale()) {
        <span class="stale-badge" role="status" title="Hay cambios pendientes de recompilar">
          <span class="stale-dot"></span> Pendiente
        </span>
      }
      @if (log()) {
        <button type="button" class="btn-log-toggle" [class.has-error]="!safeUrl()" (click)="toggleLog()" [title]="showLog() ? 'Ocultar registro de compilación' : 'Ver registro de compilación'">
          <app-icon name="file-text" [size]="13" />
          <span>{{ !safeUrl() ? 'Error' : (logEngine() || 'Registro') }}</span>
        </button>
      }
    </div>
    @if (error()) { <p class="compile-error" role="alert">{{ error() }}</p> }
    @if (log()) {
      <details class="compile-log-drawer" [open]="showLog() || !safeUrl()">
        <summary>
          <span>Registro de compilación {{ logEngine() ? '· ' + logEngine() : '' }}</span>
        </summary>
        <pre>{{ log() }}</pre>
      </details>
    }
    <div class="preview-viewport">
      @if (safeUrl()) {
        <iframe [src]="safeUrl()" title="Vista previa del documento LaTeX en PDF"></iframe>
      } @else if (!busy()) {
        <div class="empty-preview">
          <app-icon name="file-text" [size]="36" />
          <p>Pulsa <strong>Recompilar</strong> o <kbd>Ctrl + Enter</kbd> para generar el PDF.</p>
        </div>
      }
    </div>
    </section>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; min-width: 0; }
    .preview-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; width: 100%; background: var(--bg, #fff); color: var(--text, #172033); overflow: hidden; }
    .preview-panel.panel-fullscreen { position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; width: 100%; height: 100%; }
    .preview-bar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; height: 38px; box-sizing: border-box; background: var(--panel, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0); flex-shrink: 0; }

    .btn-recompile {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 13px;
      border: 1px solid #047857; border-radius: 4px;
      background: #059669; color: #ffffff;
      font-size: 12px; font-weight: 600; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
      transition: background 0.15s, transform 0.05s;
      &:hover:not(:disabled) { background: #047857; }
      &:active:not(:disabled) { transform: translateY(1px); }
      &:disabled { opacity: 0.55; cursor: default; }
    }

    .btn-preview-action {
      display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px;
      border: 1px solid var(--border, #e2e8f0); border-radius: 4px;
      background: var(--bg, #fff); color: var(--text, #172033);
      font-size: 12px; font-weight: 500; cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      &:hover:not(:disabled) { background: var(--hover, #f1f5f9); }
      &:disabled { opacity: 0.45; cursor: default; }
      &.icon-only { padding: 5px 7px; }
    }

    .stale-badge {
      display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
      color: #b45309; background: #fef3c7; border: 1px solid #fde68a;
      padding: 2px 7px; border-radius: 999px; font-weight: 500;
    }
    .stale-dot { width: 6px; height: 6px; border-radius: 50%; background: #d97706; }

    .btn-log-toggle {
      margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 8px; font-size: 11px; border: 1px solid var(--border, #e2e8f0);
      border-radius: 4px; background: var(--bg, #fff); color: var(--muted, #64748b);
      cursor: pointer;
      &.has-error { color: #dc2626; border-color: #fca5a5; background: #fef2f2; font-weight: 600; }
    }

    .compile-error { color: #dc2626; background: #fef2f2; border-bottom: 1px solid #fee2e2; padding: 6px 12px; margin: 0; font-size: 12px; font-weight: 500; }

    .compile-log-drawer {
      border-bottom: 1px solid var(--border, #e2e8f0); background: var(--panel, #0f172a);
      color: var(--text, #f8fafc); font-size: 12px; max-height: 200px; overflow: auto; flex-shrink: 0;
      summary { padding: 6px 12px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--muted, #94a3b8); }
    }
    pre { margin: 0; padding: 8px 12px 12px; white-space: pre-wrap; overflow-wrap: anywhere; font: 11.5px/1.5 monospace; }

    .preview-viewport { flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; background: #525659; overflow: hidden; position: relative; }
    iframe { flex: 1; min-height: 0; width: 100%; height: 100%; border: 0; display: block; }
    .empty-preview { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #94a3b8; font-size: 13px; text-align: center; padding: 24px; }
    .empty-preview kbd { background: #334155; color: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 11px; }

    .spinning { animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  `],
})
export class LatexPreviewComponent implements OnChanges, OnDestroy {
  @Input() source = '';
  @Input() mode: 'document' | 'fragment' = 'document';
  @Input() title = 'documento';
  private readonly compiler = inject(LatexCompilerService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly busy = signal(false);
  readonly error = signal(''); readonly log = signal('');
  readonly stale = signal(false); readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly showLog = signal(false);
  pdf?: Blob;
  private compiledSource?: string;
  private request?: Subscription;
  private objectUrl?: string;
  ngOnChanges(): void {
    this.request?.unsubscribe(); this.busy.set(false);
    this.stale.set(this.pdf !== undefined && this.source !== this.compiledSource);
  }
  toggleLog(): void { this.showLog.update(v => !v); }
  logEngine(): string {
    const match = /\[Weave\] Motor: ([a-zA-Z0-9]+)/.exec(this.log());
    return match ? match[1] : '';
  }
  compile(): void {
    if (this.busy() || !this.source.trim() || this.source.length > 300000) return;
    const source = this.source;
    this.busy.set(true); this.error.set(''); this.log.set('');
    this.request = this.compiler.compile(source, this.mode).subscribe({
      next: result => {
        this.busy.set(false); this.log.set(result.log);
        if (!result.success || !result.pdf) {
          this.error.set('No se pudo compilar. Revisa los errores del registro.');
          this.showLog.set(true);
          return;
        }
        try {
          const pdf = latexPdfBlob(result.pdf);
          this.release(); this.pdf = pdf; this.objectUrl = URL.createObjectURL(pdf);
          this.safeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
          this.compiledSource = source; this.stale.set(false);
          this.showLog.set(false);
        } catch (error) { this.error.set(latexError(error)); }
      },
      error: error => { this.busy.set(false); this.error.set(latexError(error)); },
    });
  }
  download(): void { if (this.pdf && !this.stale()) downloadLatexFile(this.pdf, this.title, 'pdf'); }
  private release(): void { if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = undefined; }
  ngOnDestroy(): void { this.request?.unsubscribe(); this.release(); }
}
