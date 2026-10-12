import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  effect,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import mermaid from 'mermaid';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';

/**
 * Bloque de Diagramas Mermaid.
 * Editor de texto plano que genera y renderiza diagramas de flujo, grafos, secuencias
 * y mapas conceptuales vectoriales en SVG de alta fidelidad, con soporte para temas claro y oscuro.
 */
@Component({
  selector: 'app-mermaid-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mermaid-block-card" [class.reading-mode]="notesService.isReadingMode()">
      @if (!notesService.isReadingMode()) {
        <div class="mermaid-header">
          <div class="header-left">
            <span class="mermaid-tag">MERMAID</span>
            <span class="type-hint">{{ i18n.currentLang() === 'es' ? 'Diagrama vectorial' : 'Vector diagram' }}</span>
          </div>
          <button
            type="button"
            class="mode-btn"
            (click)="toggleMode()"
          >
            {{ isEditing() ? i18n.t('block.mermaid.preview') : i18n.t('block.mermaid.edit') }}
          </button>
        </div>
      }

      @if (isEditing() && !notesService.isReadingMode()) {
        <div class="mermaid-editor">
          <textarea
            [(ngModel)]="chartText"
            (blur)="onBlurEditor()"
            [placeholder]="i18n.t('block.mermaid.placeholder')"
            rows="7"
          ></textarea>
          <div class="editor-actions">
            <span class="hint-text">{{ i18n.currentLang() === 'es' ? 'Haz clic en "Vista previa" para generar el diagrama' : 'Click "Preview" to render diagram' }}</span>
            <button type="button" class="render-btn" (click)="toggleMode()">
              ✓ {{ i18n.currentLang() === 'es' ? 'Ver Diagrama' : 'Render Diagram' }}
            </button>
          </div>
        </div>
      } @else {
        <div class="mermaid-preview" (dblclick)="onPreviewDblClick()">
          <div #svgContainer class="svg-container" [innerHTML]="svgOutput()"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .mermaid-block-card {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 9px;
        background: var(--panel);
        overflow: hidden;
        margin: 8px 0;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .mermaid-block-card.reading-mode {
        background: transparent;
        border: 1px solid var(--border);
        box-shadow: none;
        margin: 6px 0;
      }
      .mermaid-header {
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        border-bottom: 1px solid var(--border);
        background: var(--bg);
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mermaid-tag {
        font-size: 8.5px;
        font-weight: 700;
        color: var(--accent);
        letter-spacing: 0.12em;
      }
      .type-hint {
        font-size: 10.5px;
        color: var(--faint);
      }
      .mode-btn {
        font-size: 10px;
        font-weight: 600;
        color: var(--muted);
        background: var(--soft);
        border: 1px solid var(--border);
        padding: 3px 9px;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .mode-btn:hover {
        color: var(--accent);
        border-color: var(--accent);
      }
      .mermaid-editor {
        padding: 10px 14px 12px;
        background: var(--bg);
      }
      textarea {
        width: 100%;
        border: 1px solid var(--border);
        background: var(--panel);
        border-radius: 6px;
        color: var(--text);
        padding: 10px 12px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        line-height: 1.6;
        outline: none;
        resize: vertical;
        box-sizing: border-box;
      }
      textarea:focus {
        border-color: var(--accent);
      }
      .editor-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
      }
      .hint-text {
        font-size: 11px;
        color: var(--faint);
      }
      .render-btn {
        font-size: 11px;
        font-weight: 600;
        background: var(--accent);
        color: #ffffff;
        border: none;
        border-radius: 5px;
        padding: 4px 12px;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }
      .render-btn:hover {
        opacity: 0.9;
      }
      .mermaid-preview {
        padding: 24px 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 140px;
        overflow-x: auto;
        background: var(--bg);
        cursor: default;
      }
      .svg-container {
        max-width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
      }
      ::ng-deep .svg-container svg {
        max-width: 100% !important;
        height: auto !important;
        display: block;
        margin: 0 auto;
      }
      ::ng-deep .mermaid-syntax-error {
        padding: 12px 16px;
        border-radius: 6px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #ef4444;
        width: 100%;
        max-width: 600px;
      }
      ::ng-deep .mermaid-syntax-error .error-badge {
        font-weight: 700;
        font-size: 12px;
        margin-bottom: 4px;
      }
      ::ng-deep .mermaid-syntax-error .error-detail {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        white-space: pre-wrap;
        word-break: break-all;
        margin-bottom: 6px;
      }
      ::ng-deep .mermaid-syntax-error .error-tip {
        font-size: 10.5px;
        color: var(--muted);
      }
    `,
  ],
})
export class MermaidBlockComponent implements OnInit {
  @Input({ required: true }) block!: Block;
  @ViewChild('svgContainer') svgContainer?: ElementRef<HTMLDivElement>;

  readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly i18n = inject(I18nService);

  readonly isEditing = signal<boolean>(false);
  readonly svgOutput = signal<SafeHtml>('');
  chartText = '';

  constructor() {
    effect(() => {
      const isDark = this.themeService.isDark();
      const isReading = this.notesService.isReadingMode();
      if (isReading && this.isEditing()) {
        this.isEditing.set(false);
      }
      // Re-inicializar tema Mermaid al cambiar claro/oscuro
      this.initMermaid(isDark);
      if (this.chartText) {
        this.renderChart();
      }
    });
  }

  onPreviewDblClick(): void {
    if (this.notesService.isReadingMode()) return;
    this.isEditing.set(true);
  }

  ngOnInit(): void {
    this.initMermaid(this.themeService.isDark());

    this.chartText =
      this.block.content?.['chart'] ||
      'graph TD\n    A[Inicio] --> B[Procesamiento]\n    B --> C[Fin]';

    this.renderChart();
  }

  toggleMode(): void {
    if (this.isEditing()) {
      this.isEditing.set(false);
      setTimeout(() => {
        this.renderChart();
      }, 30);
    } else {
      this.isEditing.set(true);
    }
  }

  onBlurEditor(): void {
    this.notesService.updateBlockContent(this.block.id, {
      chart: this.chartText,
    });
  }

  private initMermaid(isDark: boolean): void {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          useMaxWidth: true,
        },
      });
    } catch (err) {
      console.warn('Error inicializando Mermaid:', err);
    }
  }

  async renderChart(): Promise<void> {
    const rawChart = (this.chartText || '').trim();
    if (!rawChart) {
      this.svgOutput.set('');
      return;
    }

    const uniqueId = `mermaid_${this.block.id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    try {
      this.initMermaid(this.themeService.isDark());
      const { svg } = await mermaid.render(uniqueId, rawChart);

      // Usar bypassSecurityTrustHtml para evitar que Angular elimine las etiquetas <style> internas del SVG
      const trusted = this.sanitizer.bypassSecurityTrustHtml(svg);
      this.svgOutput.set(trusted);

      // Asignar también directamente al contenedor DOM nativo para máxima fidelidad visual
      setTimeout(() => {
        if (this.svgContainer?.nativeElement) {
          this.svgContainer.nativeElement.innerHTML = svg;
        }
      }, 0);

      this.notesService.updateBlockContent(this.block.id, {
        chart: this.chartText,
      });
    } catch (err: any) {
      // Limpiar posibles elementos residuales inyectados en document.body por Mermaid en caso de error
      const tempElement = document.getElementById(uniqueId);
      if (tempElement) {
        tempElement.remove();
      }

      const errMsg = err?.message || 'Error de sintaxis en el diagrama Mermaid';
      const errorHtml = `
        <div class="mermaid-syntax-error">
          <div class="error-badge">⚠️ Error de sintaxis Mermaid</div>
          <div class="error-detail">${this.escapeHtml(errMsg)}</div>
          <div class="error-tip">${this.i18n.currentLang() === 'es' ? 'Haz doble clic o pulsa Editar para corregir la sintaxis.' : 'Double click or click Edit to fix syntax.'}</div>
        </div>
      `;
      this.svgOutput.set(this.sanitizer.bypassSecurityTrustHtml(errorHtml));
      if (this.svgContainer?.nativeElement) {
        this.svgContainer.nativeElement.innerHTML = errorHtml;
      }
    }
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
