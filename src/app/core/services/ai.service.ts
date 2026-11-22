import type { AiAttachment } from '../models/ai.model';
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom, catchError, finalize, of, tap } from 'rxjs';
import { AiDocumentService, EditSnapshot } from './ai-document.service';
import { AiConversation } from '../models/ai.model';
import { NotesService } from './notes.service';
import { NoteSummary } from '../models/note.model';
import { AI_REQUEST_LIMITS, boundedAiText, htmlToAiExcerpt } from '../utils/ai-request';
import { noteToAiAttachment } from '../utils/ai-note-reader';
import {
  AiChatMessage,
  AiChatRequest,
  AiChatResponse,
  DocumentContextPayload,
  AiHistoryPage,
  StoredAiMessage,
} from '../models/ai.model';
import { environment } from '../../../environments/environment';

const STORAGE_KEY_OPEN = 'weave_ai_sidebar_open';
const STORAGE_KEY_INCLUDE_DOC = 'weave_ai_include_doc';
const STORAGE_KEY_PIN_ATTACHMENTS = 'weave_ai_pin_attachments';
const STORAGE_KEY_WORKSPACE_INDEX = 'weave_ai_workspace_index';
const MAX_CHAT_ATTACHMENTS = 10;

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private readonly http = inject(HttpClient);
  readonly documents = inject(AiDocumentService);
  private readonly notesService = inject(NotesService);
  private readonly apiUrl = `${environment.apiUrl}/ai`;

  // Estado de visibilidad del panel del agente.
  readonly isSidebarOpen = signal<boolean>(
    this.readPreference(STORAGE_KEY_OPEN, false)
  );

  // Si se debe enviar el contexto del documento activo
  readonly includeDocumentContext = signal<boolean>(
    this.readPreference(STORAGE_KEY_INCLUDE_DOC, true)
  );

  // Conservar archivos y notas adjuntos durante toda la conversación activa
  readonly keepAttachmentsInConversation = signal<boolean>(
    this.readPreference(STORAGE_KEY_PIN_ATTACHMENTS, true)
  );

  // Incluir índice de documentos del espacio para descubrir referencias automáticamente
  readonly includeWorkspaceIndex = signal<boolean>(
    this.readPreference(STORAGE_KEY_WORKSPACE_INDEX, true)
  );

  // Estado de generación en curso
  readonly isGenerating = signal<boolean>(false);
  readonly documentContextTruncated = signal(false);
  readonly activeModel = signal<string>('gemini-3.8-flash');

  private readonly pinnedAttachmentsByChat = signal<Map<string, AiAttachment[]>>(new Map());
  readonly activePinnedAttachments = computed<AiAttachment[]>(() =>
    this.pinnedAttachmentsByChat().get(this.activeConversationId()) ?? []
  );
  readonly queuedPrompts = signal<{ id: string; prompt: string; attachments: AiAttachment[] }[]>([]);
  private cancelledInFlight = false;

  // Modal para adjuntar documentos de la base de datos (desacoplado del visor)
  readonly dbNotePickerOpen = signal<boolean>(false);
  readonly attachDbNoteRequested = signal<NoteSummary | null>(null);

  openDbNotePicker(): void {
    this.dbNotePickerOpen.set(true);
  }

  closeDbNotePicker(): void {
    this.dbNotePickerOpen.set(false);
  }

  requestAttachDbNote(note: NoteSummary): void {
    this.attachDbNoteRequested.set(note);
    this.closeDbNotePicker();
  }

  readonly availableModels = [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', tag: 'Recomendado', desc: 'Rápido, multimodal y contexto de 1M tokens' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Ligero', desc: 'Respuestas veloces y eficientes' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', tag: 'Razonamiento', desc: 'Modelo frontera para razonamiento profundo' },
    { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', tag: 'Gemini 4', desc: 'Modelo rápido y eficiente de la familia Gemini 4' },
    { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', tag: 'Gemini 4', desc: 'Modelo de alta capacidad de la familia Gemini 4' },
  ] as const;

  readonly selectedModel = signal<string>(
    this.readStringPreference('weave_ai_selected_model', 'gemini-3.8-flash')
  );

  setSelectedModel(modelId: string): void {
    this.selectedModel.set(modelId);
    this.activeModel.set(modelId);
    try {
      localStorage.setItem('weave_ai_selected_model', modelId);
    } catch {
      // Ignorar fallo de almacenamiento local
    }
  }

  readonly messages = signal<AiChatMessage[]>([]);
  readonly isLoadingHistory = signal(false);
  readonly isClearingHistory = signal(false);
  readonly historyReady = signal(false);
  readonly historyError = signal<string | null>(null);
  readonly hasMoreHistory = signal(false);
  readonly conversations = signal<AiConversation[]>([]);
  readonly activeConversationId = signal('default');
  readonly conversationsReady = signal(false);
  readonly isManagingChats = signal(false);
  readonly editMode = signal(false);
  readonly editStatus = signal('');
  private conversationSubscription?: Subscription;

  initialize(): void {
    this.loadConversations(true);
  }

  loadConversations(loadMessages = false): void {
    const version = this.sessionVersion;
    this.conversationSubscription?.unsubscribe();
    this.isManagingChats.set(true);
    this.conversationSubscription = this.http.get<AiConversation[]>(`${this.apiUrl}/conversations`).pipe(
      tap(items => {
        if (version !== this.sessionVersion) return;
        this.conversations.set(items); this.conversationsReady.set(true);
        if (!items.some(item => item.id === this.activeConversationId())) {
          this.resetSession(true);
          this.activeConversationId.set(items[0]?.id ?? '');
        }
        if (loadMessages && this.activeConversationId()) this.loadHistory();
        else if (!items.length) { this.messages.set([]); this.historyReady.set(false); }
      }),
      catchError(() => { if (version === this.sessionVersion) this.historyError.set('No se pudieron cargar los chats. Vuelve a intentarlo.'); return of(null); }),
      finalize(() => { if (version === this.sessionVersion) this.isManagingChats.set(false); }),
    ).subscribe();
  }

  selectConversation(id: string): void {
    if (!this.conversations().some(item => item.id === id) || id === this.activeConversationId()) return;
    this.resetSession(true); this.activeConversationId.set(id); this.loadHistory();
  }

  async createConversation(): Promise<void> {
    if (this.isManagingChats()) return;
    const version = this.sessionVersion; this.isManagingChats.set(true);
    try {
      const item = await firstValueFrom(this.http.post<AiConversation>(`${this.apiUrl}/conversations`, { title: 'Nuevo chat' }));
      if (version !== this.sessionVersion) return;
      this.conversations.update(items => [item, ...items]); this.conversationsReady.set(true);
      this.selectConversation(item.id);
    } catch { if (version === this.sessionVersion) this.historyError.set('No se pudo crear el chat.'); }
    finally { if (version === this.sessionVersion) this.isManagingChats.set(false); }
  }

  async renameConversation(title: string): Promise<void> {
    const id = this.activeConversationId(); const version = this.sessionVersion;
    await firstValueFrom(this.http.patch(`${this.apiUrl}/conversations/${id}`, { title }));
    if (version === this.sessionVersion) this.conversations.update(items => items.map(item => item.id === id ? { ...item, title } : item));
  }

  async deleteConversation(): Promise<void> {
    const id = this.activeConversationId(); const version = this.sessionVersion;
    await firstValueFrom(this.http.delete(`${this.apiUrl}/conversations/${id}`));
    if (version !== this.sessionVersion) return;
    this.resetSession(true);
    this.conversations.update(items => items.filter(item => item.id !== id));
    this.activeConversationId.set(this.conversations()[0]?.id ?? '');
    if (this.activeConversationId()) this.loadHistory();
  }

  private nextBefore: number | null = null;
  private sessionVersion = 0;
  private messageSequence = 0;
  private historySubscription?: Subscription;
  private chatSubscription?: Subscription;

  toggleSidebar(): void {
    const next = !this.isSidebarOpen();
    this.isSidebarOpen.set(next);
    this.savePreference(STORAGE_KEY_OPEN, next);
    if (next) this.initialize();
  }

  openSidebar(): void {
    this.isSidebarOpen.set(true);
    this.savePreference(STORAGE_KEY_OPEN, true);
    this.initialize();
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
    this.savePreference(STORAGE_KEY_OPEN, false);
  }

  toggleIncludeDocumentContext(): void {
    const next = !this.includeDocumentContext();
    this.includeDocumentContext.set(next);
    this.savePreference(STORAGE_KEY_INCLUDE_DOC, next);
  }

  toggleKeepAttachmentsInConversation(): void {
    const next = !this.keepAttachmentsInConversation();
    this.keepAttachmentsInConversation.set(next);
    this.savePreference(STORAGE_KEY_PIN_ATTACHMENTS, next);
  }

  toggleIncludeWorkspaceIndex(): void {
    const next = !this.includeWorkspaceIndex();
    this.includeWorkspaceIndex.set(next);
    this.savePreference(STORAGE_KEY_WORKSPACE_INDEX, next);
  }

  pinAttachments(items: AiAttachment[]): void {
    if (!items.length) return;
    const chatId = this.activeConversationId() || 'default';
    this.pinnedAttachmentsByChat.update((map) => {
      const next = new Map(map);
      const current = next.get(chatId) ?? [];
      const byName = new Map<string, AiAttachment>();
      for (const item of current) byName.set(item.name, item);
      for (const item of items) byName.set(item.name, item);
      next.set(chatId, Array.from(byName.values()).slice(-MAX_CHAT_ATTACHMENTS));
      return next;
    });
  }

  unpinAttachment(name: string): void {
    const chatId = this.activeConversationId() || 'default';
    this.pinnedAttachmentsByChat.update((map) => {
      const next = new Map(map);
      const filtered = (next.get(chatId) ?? []).filter(a => a.name !== name);
      if (filtered.length) next.set(chatId, filtered);
      else next.delete(chatId);
      return next;
    });
  }

  clearPinnedAttachments(chatId = this.activeConversationId() || 'default'): void {
    this.pinnedAttachmentsByChat.update((map) => {
      const next = new Map(map);
      next.delete(chatId);
      return next;
    });
  }

  removeQueuedPrompt(id: string): void {
    this.queuedPrompts.update(items => items.filter(item => item.id !== id));
  }

  clearQueue(): void {
    this.queuedPrompts.set([]);
  }

  cancelGeneration(): void {
    if (!this.isGenerating()) return;
    this.cancelledInFlight = true;
    this.chatSubscription?.unsubscribe();
    this.chatSubscription = undefined;
    this.isGenerating.set(false);
    this.editStatus.set('Generación cancelada.');
  }

  /** Recupera mensajes persistidos en FastAPI; el navegador no conserva una copia durable. */
  loadHistory(older = false): void {
    if (this.isLoadingHistory() || this.isGenerating() || this.isClearingHistory()) return;
    if (older && this.nextBefore === null) return;
    if (!this.activeConversationId()) return;
    const version = this.sessionVersion;
    this.isLoadingHistory.set(true);
    this.historyError.set(null);
    this.historySubscription = this.http.get<AiHistoryPage>(`${this.apiUrl}/history`, {
      params: {
        ...(older ? { before: String(this.nextBefore) } : {}),
        ...(this.activeConversationId() !== 'default' ? { conversationId: this.activeConversationId() } : {}),
      },
    }).pipe(
      tap((page) => {
        if (version !== this.sessionVersion) return;
        const incoming = page.messages.map((message) => this.toViewMessage(message));
        const messages = older ? [...incoming, ...this.messages()] : incoming;
        const seen = new Set<string>();
        this.messages.set(messages.filter((message) => {
          if (seen.has(message.id)) return false;
          seen.add(message.id);
          return true;
        }));
        this.hasMoreHistory.set(page.hasMore);
        this.nextBefore = page.nextBefore;
        this.historyReady.set(true);
      }),
      catchError(() => {
        if (version === this.sessionVersion) this.historyError.set('No se pudo cargar el historial. Vuelve a intentarlo.');
        return of(null);
      }),
      finalize(() => { if (version === this.sessionVersion) this.isLoadingHistory.set(false); }),
    ).subscribe();
  }

  clearHistory(): void {
    if (this.isClearingHistory() || this.isLoadingHistory()) return;
    const version = this.sessionVersion;
    this.isClearingHistory.set(true);
    this.historyError.set(null);
    this.http.delete<{ cleared: boolean }>(`${this.apiUrl}/history`, {
      params: this.activeConversationId() !== 'default' ? { conversationId: this.activeConversationId() } : {},
    }).pipe(
      tap(() => {
        if (version !== this.sessionVersion) return;
        this.resetSession(true);
        this.clearPinnedAttachments();
        this.historyReady.set(true);
      }),
      catchError(() => {
        if (version === this.sessionVersion) this.historyError.set('No se pudo borrar el historial. Tus mensajes se conservan.');
        return of(null);
      }),
      finalize(() => { if (version === this.sessionVersion) this.isClearingHistory.set(false); }),
    ).subscribe();
  }

  /** Limpia solo la sesión local al cambiar de cuenta; el historial del servidor se conserva. */
  resetSession(keepConversations = false): void {
    this.conversationSubscription?.unsubscribe();
    this.isManagingChats.set(false); this.editStatus.set('');
    this.queuedPrompts.set([]);
    this.cancelledInFlight = true;
    if (!keepConversations) {
      this.conversations.set([]); this.conversationsReady.set(false);
      this.activeConversationId.set('default'); this.editMode.set(false);
      this.pinnedAttachmentsByChat.set(new Map());
    }
    this.sessionVersion++;
    this.historySubscription?.unsubscribe();
    this.chatSubscription?.unsubscribe();
    this.messages.set([]);
    this.historyReady.set(false);
    this.historyError.set(null);
    this.hasMoreHistory.set(false);
    this.nextBefore = null;
    this.isGenerating.set(false);
    this.isLoadingHistory.set(false);
    this.isClearingHistory.set(false);
    this.documentContextTruncated.set(false);
  }

  private toViewMessage(message: StoredAiMessage): AiChatMessage {
    return { ...message, timestamp: new Date(message.timestamp) };
  }

  private mergeUniqueAttachments(...groups: (readonly AiAttachment[])[]): AiAttachment[] {
    const byName = new Map<string, AiAttachment>();
    for (const group of groups) {
      for (const item of group) {
        if (item?.name) byName.set(item.name, item);
      }
    }
    return Array.from(byName.values()).slice(0, MAX_CHAT_ATTACHMENTS);
  }

  private collectWorkspaceAttachments(userPrompt: string, existing: readonly AiAttachment[]): AiAttachment[] {
    if (!this.includeWorkspaceIndex()) return [];
    const list = this.notesService.notesList?.();
    if (!list?.length || existing.length >= MAX_CHAT_ATTACHMENTS) return [];
    const lowerPrompt = userPrompt.toLowerCase();
    const activeId = this.notesService.currentNote()?._id;
    const seen = new Set(existing.map(a => a.name));
    const discovered: AiAttachment[] = [];

    for (const summary of list) {
      if (existing.length + discovered.length >= MAX_CHAT_ATTACHMENTS) break;
      if (summary._id === activeId) continue;
      const title = (summary.title || '').trim();
      if (title.length < 4 || !lowerPrompt.includes(title.toLowerCase())) continue;
      const cached = this.notesService.getCachedNote?.(summary._id);
      if (!cached) continue;
      const att = noteToAiAttachment(cached);
      if (att && !seen.has(att.name)) {
        seen.add(att.name);
        discovered.push(att);
      }
    }
    return discovered;
  }

  private appendWorkspaceIndex(content: string): string {
    if (!this.includeWorkspaceIndex()) return content;
    const list = this.notesService.notesList?.();
    if (!list || list.length <= 1) return content;
    const activeId = this.notesService.currentNote()?._id;
    const entries = list
      .filter(item => item._id !== activeId)
      .slice(0, 60)
      .map(item => `- ${item.title || 'Sin título'} (${item.docType || 'block'}, id: ${item._id})`);
    if (!entries.length) return content;
    const indexBlock = `\n\n[Documentos en tu espacio (${entries.length}):\n${entries.join('\n')}\n]`;
    return boundedAiText(content + indexBlock, AI_REQUEST_LIMITS.document);
  }

  /**
   * Envía un mensaje al agente de IA con o sin el contexto del documento actual.
   */
  sendMessage(userPrompt: string, attachments: AiAttachment[] = []): boolean {
    const trimmed = userPrompt.trim() + (attachments.length ? '\n\n[Adjuntos: ' + attachments.map(a => a.name).join(', ') + ']' : '');
    if (!trimmed || this.isLoadingHistory() || this.isClearingHistory()) return false;

    if (trimmed.length > AI_REQUEST_LIMITS.message) {
      this.addErrorMessage('El mensaje supera los 250 000 caracteres. Divide tu consulta en partes para enviarla.');
      return false;
    }

    if (this.isGenerating()) {
      const queueItem = {
        id: `q-${Date.now()}-${++this.messageSequence}`,
        prompt: userPrompt,
        attachments: [...attachments],
      };
      this.queuedPrompts.update(prev => [...prev, queueItem]);
      this.editStatus.set(`Mensaje en cola (${this.queuedPrompts().length}). Se enviará al terminar el actual.`);
      return true;
    }

    if (!this.historyReady()) { this.loadHistory(); return false; }

    let editSnapshot: EditSnapshot | undefined;
    if (this.editMode()) {
      if (!this.includeDocumentContext()) { this.editStatus.set('Vincula el documento para editarlo.'); return false; }
      try { editSnapshot = this.documents.capture(); }
      catch (error) { this.editStatus.set(error instanceof Error ? error.message : 'No se pudo preparar el documento.'); return false; }
    }
    this.editStatus.set('');
    this.cancelledInFlight = false;

    const pinned = this.keepAttachmentsInConversation() ? this.activePinnedAttachments() : [];
    const baseAttachments = this.mergeUniqueAttachments(pinned, attachments);
    const workspaceMatched = this.collectWorkspaceAttachments(userPrompt, baseAttachments);
    const effectiveAttachments = this.mergeUniqueAttachments(baseAttachments, workspaceMatched);
    const attachmentPayloadChars = effectiveAttachments.reduce((sum, item) => sum + (item.data?.length || item.text?.length || 0), 0);
    const attachmentTextChars = effectiveAttachments.reduce((sum, item) => sum + (item.text?.length || 0), 0);
    if (effectiveAttachments.length > 10 || attachmentPayloadChars > 32 * 1024 * 1024 || attachmentTextChars > 2_400_000) {
      this.addErrorMessage('Los adjuntos superan el límite combinado de 32 MiB o 2,4 millones de caracteres de texto. Quita archivos o envíalos en varios mensajes.');
      return false;
    }
    if (this.keepAttachmentsInConversation() && attachments.length) {
      this.pinAttachments(attachments);
    }

    const version = this.sessionVersion;
    const userMsgId = `user-${Date.now()}-${++this.messageSequence}`;
    const userMsg: AiChatMessage = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    // Agregar mensaje del usuario a la lista
    this.messages.update((prev) => [...prev, userMsg]);
    this.isGenerating.set(true);

    // Preparar el contexto del documento activo
    const docContext = this.includeDocumentContext()
      ? this.extractCurrentDocumentContext(editSnapshot)
      : undefined;

    const requestPayload: AiChatRequest = {
      message: trimmed,
      ...(effectiveAttachments.length ? { attachments: effectiveAttachments } : {}),
      model: this.selectedModel(),
      conversationId: this.activeConversationId(),
      ...(editSnapshot ? { editTargets: editSnapshot.targets } : {}),
      persistHistory: true,
      documentContext: docContext,
      includeDocumentContext: this.includeDocumentContext(),
    };

    if (editSnapshot?.truncated) this.documentContextTruncated.set(true);
    this.chatSubscription = this.http
      .post<AiChatResponse>(`${this.apiUrl}/chat`, requestPayload)
      .pipe(
        tap((res) => {
          if (version !== this.sessionVersion) return;
          if (res.model) this.activeModel.set(res.model);
          if (res.edits?.length && editSnapshot) {
            try {
              this.documents.apply(editSnapshot, res.edits);
              this.editStatus.set(`${res.edits.length} cambio(s) aplicado(s). El autoguardado del documento está en curso.`);
            } catch (error) { this.editStatus.set(error instanceof Error ? error.message : 'No se pudieron aplicar los cambios.'); }
          } else if (editSnapshot) this.editStatus.set('La respuesta no contiene cambios para aplicar.');
          if (this.conversationsReady()) this.loadConversations();
          const assistantMsg = res.assistantMessage ? this.toViewMessage(res.assistantMessage) : {
            id: `assistant-${Date.now()}-${++this.messageSequence}`,
            role: 'assistant' as const, content: res.reply,
            timestamp: new Date(res.timestamp || Date.now()),
          };
          this.messages.update((previous) => [
            ...previous.map((message) => message.id === userMsgId && res.userMessage
              ? this.toViewMessage(res.userMessage) : message),
            assistantMsg,
          ]);
        }),
        catchError((err) => {
          if (version !== this.sessionVersion) return of(null);
          console.error('[AiService] Fallo de chat HTTP:', err.status);
          if (err.status === 409) {
            this.historyError.set('La conversación cambió o tiene una respuesta pendiente. Vuelve a cargar el historial.');
            return of(null);
          }
          this.addErrorMessage(err.status === 413
            ? 'La solicitud es demasiado grande. Desactiva el contexto del documento o divide el mensaje e inténtalo de nuevo.'
            : err.status === 400
              ? this.safeRequestError(err.error?.message) || 'La consulta o sus adjuntos superan los límites del chat. Divide los archivos o la solicitud e inténtalo de nuevo.'
              : err.status === 502 || err.status === 503
                ? 'El servicio de IA no pudo completar la generación o validar sus cambios. No se aplicaron cambios de esta respuesta. Intenta de nuevo o divide la petición en secciones.'
                : 'No se pudo completar la respuesta de IA. Verifica la conexión o inténtalo de nuevo.');
          return of(null);
        }),
        finalize(() => {
          if (version !== this.sessionVersion) return;
          this.isGenerating.set(false);
          const shouldDispatch = !this.cancelledInFlight;
          this.cancelledInFlight = false;
          if (shouldDispatch) {
            const next = this.queuedPrompts()[0];
            if (next) {
              this.queuedPrompts.update(items => items.slice(1));
              this.sendMessage(next.prompt, next.attachments);
            }
          }
        })
      )
      .subscribe();
    return true;
  }

  /** Expone diagnósticos de validación del API, que solo incluyen campos y reglas, nunca valores. */
  private safeRequestError(value: unknown): string | null {
    const messages = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : typeof value === 'string' ? [value] : [];
    const result = messages.join('; ').replace(/[\r\n\t]+/g, ' ').trim();
    return result ? result.slice(0, 320) : null;
  }

  /**
   * Extrae el contenido representativo legible del documento actualmente abierto.
   */
  extractCurrentDocumentContext(editSnapshot?: EditSnapshot): DocumentContextPayload | undefined {
    this.documentContextTruncated.set(false);
    const note = this.notesService.currentNote();
    if (!note) return undefined;

    const parts: string[] = [];
    let remaining: number = AI_REQUEST_LIMITS.document;
    let truncated = false;
    const append = (value: unknown, html = false): boolean => {
      if (typeof value !== 'string' || !value) return remaining > 0;
      if (remaining <= 0) { truncated = true; return false; }
      const excerpt = html ? htmlToAiExcerpt(value, remaining)
        : { text: boundedAiText(value, remaining), truncated: value.length > remaining };
      truncated ||= excerpt.truncated;
      if (excerpt.text) {
        const separator = parts.length ? '\n\n' : '';
        truncated ||= separator.length + excerpt.text.length > remaining;
        const text = boundedAiText(separator + excerpt.text, remaining);
        parts.push(text);
        remaining -= text.length;
      }
      if (excerpt.truncated) remaining = 0;
      return remaining > 0;
    };
    const docType = note.docType || 'block';
    if (this.documents.supported()) {
      try {
        const snapshot = editSnapshot ?? this.documents.capture(true);
        for (const target of snapshot.targets) if (!append(`${target.id}: ${target.text}`)) break;
        truncated ||= snapshot.truncated;
        this.documentContextTruncated.set(truncated);
        const coverage = truncated
          ? '[COBERTURA PARCIAL: hay contenido omitido. No se puede concluir que una sección no exista por no aparecer en este extracto.]\n'
          : '[Contenido disponible del documento activo.]\n';
        return {
          title: boundedAiText(note.title, AI_REQUEST_LIMITS.title),
          docType,
          content: this.appendWorkspaceIndex(boundedAiText(coverage + parts.join(''), AI_REQUEST_LIMITS.document)),
        };
      } catch { /* Durante la carga se conserva el extractor de datos persistidos. */ }
    }
    if (docType === 'block') {
      for (const block of note.blocks || []) {
        if (remaining <= 0) { truncated = true; break; }
        const content = block.content || {};
        switch (block.type) {
          case 'text': append(typeof content === 'string' ? content : content['html'], true); break;
          case 'code': append(content['code']); break;
          case 'latex': append(content['formula']); break;
          case 'mermaid': append(content['chart']); break;
          case 'image': append(content['caption']); break;
          case 'file': append(content['originalName'] || content['fileName'] || 'Archivo adjunto'); break;
          case 'sheet': append('[Tabla de cálculo en bloque]'); break;
        }
      }
    } else if (docType === 'latex') {
      append(note.docData?.source);
    } else if (docType === 'doc') {
      const pages = note.docData?.pages;
      if (Array.isArray(pages)) {
        for (const page of pages) {
          if (!append(page?.html, true)) { truncated = true; break; }
        }
      } else append(note.docData?.body?.dataStream);
    } else if (docType === 'sheet') {
      append('Libro de cálculo');
      for (const name in note.docData?.sheets ?? {}) {
        if (!append(name)) { truncated = true; break; }
      }
    } else if (docType === 'slide') append('Presentación de diapositivas');
    else if (docType === 'canvas') append('Pizarra digital con dibujos y diagramas');

    this.documentContextTruncated.set(truncated);
    return {
      title: boundedAiText(note.title || 'Documento sin título', AI_REQUEST_LIMITS.title),
      docType: boundedAiText(docType, AI_REQUEST_LIMITS.docType),
      content: this.appendWorkspaceIndex(parts.join('')),
    };
  }

  private addErrorMessage(content: string): void {
    this.messages.update((messages) => [...messages, {
      id: `err-${Date.now()}`, role: 'assistant', content, timestamp: new Date(), error: true,
    }]);
  }

  private readStringPreference(key: string, fallback: string): string {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  private readPreference(key: string, fallback: boolean): boolean {
    try {
      const value = localStorage.getItem(key);
      return value === 'true' ? true : value === 'false' ? false : fallback;
    } catch { return fallback; }
  }

  private savePreference(key: string, value: boolean): void {
    try { localStorage.setItem(key, String(value)); } catch { /* Keep the in-memory preference. */ }
  }
}
