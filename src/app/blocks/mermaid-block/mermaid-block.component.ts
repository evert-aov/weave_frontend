import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mermaid from 'mermaid';
import { Block } from '../../core/models/block.model';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';

/**
 * Bloque de Diagramas Mermaid.
 * Editor de texto plano que genera y renderiza diagramas de flujo y mapas interactivos en SVG.
 */
@Component({
  selector: 'app-mermaid-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mermaid-block-card" [class.reading-mode]="notesService.isReadingMode()">
      @if (!notesService.isReadingMode()) {
        <div class="mermaid-header">
          <span class="mermaid-tag">MERMAID</span>
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
            (blur)="renderChart()"
            [placeholder]="i18n.t('block.mermaid.placeholder')"
            rows="6"
          ></textarea>
        </div>
      } @else {
        <div class="mermaid-preview" (dblclick)="onPreviewDblClick()">
          <div class="svg-container" [innerHTML]="svgOutput()"></div>
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
        margin: 6px 0;
      }
      .mermaid-block-card.reading-mode {
        background: transparent;
        border: 1px solid var(--border);
        box-shadow: none;
        margin: 4px 0;
      }
      .mermaid-header {
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        border-bottom: 1px solid var(--border);
      }
      .mermaid-tag {
        font-size: 8px;
        font-weight: 700;
        color: var(--faint);
        letter-spacing: 0.12em;
      }
      .mode-btn {
        font-size: 9px;
        color: var(--muted);
        background: var(--bg);
        border: 1px solid var(--border);
        padding: 2px 8px;
        border-radius: 4px;
      }
      .mode-btn:hover {
        color: var(--accent);
      }
      .mermaid-editor {
        padding: 10px 14px;
      }
      textarea {
        width: 100%;
        border: 1px solid var(--border);
        background: var(--bg);
        border-radius: 6px;
        color: var(--text);
        padding: 8px 10px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        line-height: 1.6;
        outline: none;
      }
      textarea:focus {
        border-color: var(--accent);
      }
      .mermaid-preview {
        padding: 24px 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 120px;
        overflow-x: auto;
      }
      .svg-container {
        max-width: 100%;
      }
      ::ng-deep .svg-container svg {
        max-width: 100%;
        height: auto;
      }
    `,
  ],
})
export class MermaidBlockComponent implements OnInit {
  @Input({ required: true }) block!: Block;

  readonly notesService = inject(NotesService);
  private readonly themeService = inject(ThemeService);
  readonly i18n = inject(I18nService);

  readonly isEditing = signal<boolean>(false);
  readonly svgOutput = signal<string>('');
  chartText = '';

  onPreviewDblClick(): void {
    if (this.notesService.isReadingMode()) return;
    this.isEditing.set(true);
  }

  ngOnInit(): void {
    mermaid.initialize({
      startOnLoad: false,
      theme: this.themeService.isDark() ? 'dark' : 'default',
      securityLevel: 'loose',
    });

    this.chartText =
      this.block.content?.['chart'] ||
      'graph TD\n    A[Input tokens] --> B[Transformer Encoder]\n    B --> C[Attention Context]\n    C --> D[Output Projection]';

    this.renderChart();
  }

  toggleMode(): void {
    if (this.isEditing()) {
      this.isEditing.set(false);
      this.renderChart();
    } else {
      this.isEditing.set(true);
    }
  }

  async renderChart(): Promise<void> {
    try {
      const uniqueId = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(uniqueId, this.chartText || 'graph TD; A-->B;');
      this.svgOutput.set(svg);

      this.notesService.updateBlockContent(this.block.id, {
        chart: this.chartText,
      });
    } catch (err) {
      this.svgOutput.set(
        `<div style="color: #ef4444; font-size: 11px; font-family: monospace;">Syntax error in Mermaid diagram definition</div>`,
      );
    }
  }
}
