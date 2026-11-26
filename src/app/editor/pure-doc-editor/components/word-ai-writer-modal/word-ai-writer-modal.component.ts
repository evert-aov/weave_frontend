import { LucideDynamicIcon, provideLucideIcons } from '../../../../shared/components/ng-lucide-icon.directive';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  lucideCheck, lucideLoader2, lucideSparkles, lucideX } from '@ng-icons/lucide';
import { AiWriterService } from '../../services/ai-writer.service';

const PRESET_PROMPTS = [
  'Redacta un resumen ejecutivo con encabezados H2 y H3 y una tabla de presupuesto',
  'Crea una plantilla de acta de reunión con lista de acuerdos y responsables',
  'Genera una tabla comparativa de pros y contras de migración a la nube',
  'Escribe una introducción formal y objetivos del proyecto con H1, H2 y viñetas',
];

@Component({
  selector: 'app-word-ai-writer-modal',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  providers: [provideLucideIcons({ lucideSparkles, lucideX, lucideLoader2, lucideCheck })],
  templateUrl: './word-ai-writer-modal.component.html',
  styleUrls: ['./word-ai-writer-modal.component.css'],
})
export class WordAiWriterModalComponent {
  @Input() isOpen = false;
  @Input() currentHtml = '';
  @Output() close = new EventEmitter<void>();
  @Output() insertGeneratedHtml = new EventEmitter<string>();

  private readonly aiWriter = inject(AiWriterService);

  readonly presetPrompts = PRESET_PROMPTS;
  readonly prompt = signal('');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async handleGenerate(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.prompt().trim()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const html = await this.aiWriter.generateDocumentContentWithAI(
        this.prompt(),
        this.currentHtml
      );
      this.insertGeneratedHtml.emit(html);
      this.prompt.set('');
      this.close.emit();
    } catch (err) {
      this.error.set('No se pudo generar el contenido en este momento. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
