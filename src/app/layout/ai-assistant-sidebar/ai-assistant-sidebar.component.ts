import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../core/services/dialog.service';
import { AiService } from '../../core/services/ai.service';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { WorkspaceLayoutService } from '../../core/services/workspace-layout.service';
import { ResizePanelDirective } from '../../shared/directives/resize-panel.directive';

@Component({
  selector: 'app-ai-assistant-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ResizePanelDirective],
  templateUrl: './ai-assistant-sidebar.component.html',
  styleUrls: ['./ai-assistant-sidebar.component.scss'],
  host: {
    '[class.is-open]': 'aiService.isSidebarOpen()',
    '[style.--assistant-width]': 'layout.assistantWidth() + "px"',
  },
})
export class AiAssistantSidebarComponent {
  readonly aiService = inject(AiService);
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly dialogs = inject(DialogService);
  readonly layout = inject(WorkspaceLayoutService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  readonly inputText = signal<string>('');
  readonly copiedMessageId = signal<string | null>(null);

  constructor() {
    if (this.aiService.isSidebarOpen()) this.aiService.initialize();
    effect(() => {
      this.aiService.activeConversationId();
      this.inputText.set(''); this.copiedMessageId.set(null);
    });
    // Auto-scroll al final al recibir nuevos mensajes
    effect(() => {
      const msgs = this.aiService.messages();
      if (msgs.length) {
        setTimeout(() => this.scrollToBottom(), 50);
      }
    });
  }

  renameChat(): void {
    const chat = this.aiService.conversations().find(item => item.id === this.aiService.activeConversationId());
    if (!chat) return;
    this.dialogs.open({ kind: 'input', title: 'Renombrar chat', label: 'Nombre', initialValue: chat.title,
      maxLength: 100, submitLabel: 'Guardar', onSubmit: title => this.aiService.renameConversation(title) });
  }
  deleteChat(): void {
    this.dialogs.open({ kind: 'confirm', title: 'Eliminar chat', message: 'Se eliminará el historial de este chat.',
      destructive: true, submitLabel: 'Eliminar', onSubmit: () => this.aiService.deleteConversation() });
  }

  onSend(): void {
    const text = this.inputText().trim();
    if (!text || this.aiService.isGenerating()) return;

    if (!this.aiService.sendMessage(text)) return;
    this.inputText.set('');
    setTimeout(() => this.scrollToBottom(), 50);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  copyToClipboard(text: string, id: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.copiedMessageId.set(id);
      setTimeout(() => this.copiedMessageId.set(null), 2000);
    });
  }

  formatMarkdown(content: string): SafeHtml {
    if (!content) return '';

    // 1. Escapar HTML previo para evitar inyección
    let escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Bloques de código ```lenguaje ... ```
    escaped = escaped.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<div class="ai-code-block"><div class="ai-code-header"><span>${lang || 'código'}</span></div><pre><code>${code.trim()}</code></pre></div>`
    );

    // 3. Código en línea `...`
    escaped = escaped.replace(
      /`([^`]+)`/g,
      '<code class="ai-inline-code">$1</code>'
    );

    // 4. Encabezados ###, ##, #
    escaped = escaped.replace(/^### (.*$)/gim, '<h4 class="ai-h3">$1</h4>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h3 class="ai-h2">$1</h3>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h2 class="ai-h1">$1</h2>');

    // 5. Negritas y cursivas
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Listas con viñetas
    escaped = escaped.replace(
      /^\s*[-*]\s+(.*)$/gim,
      '<li class="ai-li">$1</li>'
    );
    escaped = escaped.replace(
      /(<li class="ai-li">.*<\/li>)/gim,
      '<ul class="ai-ul">$1</ul>'
    );
    // Limpieza de etiquetas <ul> consecutivas
    escaped = escaped.replace(/<\/ul>\s*<ul class="ai-ul">/g, '');

    // 7. Saltos de línea
    escaped = escaped.replace(/\n/g, '<br/>');

    return this.sanitizer.bypassSecurityTrustHtml(escaped);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }
}
