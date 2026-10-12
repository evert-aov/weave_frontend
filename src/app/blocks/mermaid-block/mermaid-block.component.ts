import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  effect,
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
 * Editor declarativo que genera y renderiza diagramas de flujo, mapas conceptuales
 * y secuencias preservando el árbol SVG y estilos completos sin sanitización destructiva.
 */
@Component({
  selector: 'app-mermaid-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mermaid-block.component.html',
  styleUrl: './mermaid-block.component.scss',
})
export class MermaidBlockComponent implements OnInit {
  @Input({ required: true }) block!: Block;

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
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      });
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
      const isDark = this.themeService.isDark();
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      });

      const uniqueId =
        'mermaid-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
      const codeToRender = (this.chartText || 'graph TD;\n    A-->B;').trim();
      const { svg } = await mermaid.render(uniqueId, codeToRender);

      this.svgOutput.set(this.sanitizer.bypassSecurityTrustHtml(svg));

      this.notesService.updateBlockContent(this.block.id, {
        chart: this.chartText,
      });
    } catch (err) {
      console.error('Mermaid render error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.svgOutput.set(
        this.sanitizer.bypassSecurityTrustHtml(
          `<div class="mermaid-error-box">
             <div class="error-title">⚠️ ${this.i18n.currentLang() === 'es' ? 'Error de sintaxis en diagrama Mermaid' : 'Syntax error in Mermaid diagram'}</div>
             <pre>${errorMsg}</pre>
           </div>`,
        ),
      );
    }
  }
}
