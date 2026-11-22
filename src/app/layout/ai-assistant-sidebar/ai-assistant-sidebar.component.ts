import { readAiAttachment } from '../../core/utils/ai-attachments';
import { noteToAiAttachment, getDocTypeLabel } from '../../core/utils/ai-note-reader';
import type { AiAttachment } from '../../core/models/ai.model';
import type { NoteSummary } from '../../core/models/note.model';
import { firstValueFrom } from 'rxjs';
import {
  Component,
  ElementRef,
  ViewChild,
  HostListener,
  inject,
  signal,
  effect,
  computed,
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

  readonly chatsOpen = signal(false);
  readonly chatSearch = signal('');
  readonly activeChatTitle = computed(() => this.aiService.conversations().find(chat => chat.id === this.aiService.activeConversationId())?.title || '');
  readonly filteredChats = computed(() => {
    const query = this.chatSearch().trim().toLocaleLowerCase();
    return this.aiService.conversations().filter(chat => !query || chat.title.toLocaleLowerCase().includes(query));
  });
  newChat(): void { this.aiService.createConversation(); this.chatsOpen.set(false); }
  selectChat(id: string): void { this.aiService.selectConversation(id); this.chatsOpen.set(false); }

  readonly attachments=signal<AiAttachment[]>([]);
  readonly attachmentBusy=signal(false);
  readonly attachmentError=signal('');
  async attachFiles(event:Event):Promise<void>{
    const input=event.target as HTMLInputElement,files=Array.from(input.files||[]);input.value='';
    await this.addAttachmentFiles(files);
  }
  async pasteAttachments(event:ClipboardEvent):Promise<void>{
    const isSupportedPaste=(type:string)=>type.startsWith('image/')||type.startsWith('audio/');
    const items=Array.from(event.clipboardData?.items||[]);
    const files=items.filter(item=>item.kind==='file'&&isSupportedPaste(item.type)).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));
    if(!files.length)files.push(...Array.from(event.clipboardData?.files||[]).filter(file=>isSupportedPaste(file.type)));
    if(!files.length)return;
    event.preventDefault();event.stopPropagation();
    await this.addAttachmentFiles(files);
  }
  private async addAttachmentFiles(files:File[]):Promise<void>{
    if(!files.length||this.attachmentBusy())return;
    if(files.length+this.attachments().length>10){this.attachmentError.set('Máximo 10 adjuntos por mensaje.');return;}
    const chat=this.aiService.activeConversationId();this.attachmentBusy.set(true);this.attachmentError.set('');
    try{const pending=await Promise.all(files.map(readAiAttachment));
      if(chat===this.aiService.activeConversationId()){
        const next=[...this.attachments(),...pending];
        if(next.reduce((n,a)=>n+(a.data?.length||a.text?.length||0),0)>20000000)throw Error('Los adjuntos superan el tamaño total permitido.');
        this.attachments.set(next);
      }
    }catch(error){this.attachmentError.set(error instanceof Error?error.message:'No se pudo adjuntar el archivo.');}
    finally{this.attachmentBusy.set(false);}
  }
  removeAttachment(index:number):void{this.attachments.update(files=>files.filter((_,i)=>i!==index));}

  openDatabaseNotePicker(): void {
    if (this.attachmentBusy() || this.aiService.isGenerating()) return;
    this.aiService.openDbNotePicker();
  }

  async attachDatabaseNote(summary: NoteSummary): Promise<void> {
    if (this.attachmentBusy() || this.aiService.isGenerating()) return;
    if (this.attachments().length >= 4) {
      this.attachmentError.set('Máximo 4 adjuntos por mensaje.');
      return;
    }

    const chat = this.aiService.activeConversationId();
    this.attachmentBusy.set(true);
    this.attachmentError.set('');
    try {
      const note = await firstValueFrom(this.notesService.getNoteById(summary._id));
      if (!note) throw Error('No se pudo cargar el documento de la base.');

      const attachment = noteToAiAttachment(note);
      if (chat === this.aiService.activeConversationId()) {
        const next = [...this.attachments(), attachment];
        if (next.reduce((n, a) => n + (a.data?.length || a.text?.length || 0), 0) > 8000000) {
          throw Error('Los adjuntos superan el tamaño total permitido.');
        }
        this.attachments.set(next);
        this.aiService.closeDbNotePicker();
      }
    } catch (error) {
      this.attachmentError.set(error instanceof Error ? error.message : 'No se pudo leer el documento de la base.');
    } finally {
      this.attachmentBusy.set(false);
    }
  }

  readonly inputText = signal<string>('');
  readonly copiedMessageId = signal<string | null>(null);

  constructor() {
    if (this.aiService.isSidebarOpen()) this.aiService.initialize();
    effect(() => {
      this.aiService.activeConversationId();
      this.inputText.set(''); this.attachments.set([]);this.attachmentError.set('');this.copiedMessageId.set(null);
    });
    effect(() => {
      const requestedNote = this.aiService.attachDbNoteRequested();
      if (requestedNote) {
        this.aiService.attachDbNoteRequested.set(null);
        void this.attachDatabaseNote(requestedNote);
      }
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

  pinnedAttachments(): { name: string }[] {
    return this.aiService.activePinnedAttachments?.() ?? [];
  }

  queuedPrompts(): { id: string; prompt: string }[] {
    return this.aiService.queuedPrompts?.() ?? [];
  }

  keepAttachmentsEnabled(): boolean {
    return this.aiService.keepAttachmentsInConversation?.() ?? false;
  }

  workspaceIndexEnabled(): boolean {
    return this.aiService.includeWorkspaceIndex?.() ?? false;
  }

  toggleKeepAttachments(): void {
    this.aiService.toggleKeepAttachmentsInConversation?.();
  }

  toggleWorkspaceIndex(): void {
    this.aiService.toggleIncludeWorkspaceIndex?.();
  }

  unpinAttachment(name: string): void {
    this.aiService.unpinAttachment?.(name);
  }

  cancelGeneration(): void {
    this.aiService.cancelGeneration?.();
  }

  removeQueuedPrompt(id: string): void {
    this.aiService.removeQueuedPrompt?.(id);
  }

  onSend(): void {
    const text = this.inputText().trim();
    if ((!text&&!this.attachments().length)||this.attachmentBusy())return;

    if (!this.aiService.sendMessage(text||'Analiza los archivos adjuntos.',this.attachments())) return;
    this.inputText.set('');this.attachments.set([]);
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
