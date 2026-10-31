import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom, catchError, finalize, of, tap } from 'rxjs';
import { AiDocumentService, EditSnapshot } from './ai-document.service';
import { AiConversation } from '../models/ai.model';
import { NotesService } from './notes.service';
import { AI_REQUEST_LIMITS, boundedAiText, htmlToAiExcerpt } from '../utils/ai-request';
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

  // Estado de generación en curso
  readonly isGenerating = signal<boolean>(false);
  readonly documentContextTruncated = signal(false);

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
    if (!keepConversations) {
      this.conversations.set([]); this.conversationsReady.set(false);
      this.activeConversationId.set('default'); this.editMode.set(false);
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

  /**
   * Envía un mensaje al agente de IA con o sin el contexto del documento actual.
   */
  sendMessage(userPrompt: string): boolean {
    const trimmed = userPrompt.trim();
    if (!trimmed || this.isGenerating() || this.isLoadingHistory() || this.isClearingHistory()) return false;
    if (!this.historyReady()) { this.loadHistory(); return false; }

    if (trimmed.length > AI_REQUEST_LIMITS.message) {
      this.addErrorMessage('El mensaje supera los 12 000 caracteres. Divide tu consulta en partes para enviarla.');
      return false;
    }

    let editSnapshot: EditSnapshot | undefined;
    if (this.editMode()) {
      if (!this.includeDocumentContext()) { this.editStatus.set('Vincula el documento para editarlo.'); return false; }
      try { editSnapshot = this.documents.capture(); }
      catch (error) { this.editStatus.set(error instanceof Error ? error.message : 'No se pudo preparar el documento.'); return false; }
    }
    this.editStatus.set('');
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
      ? this.extractCurrentDocumentContext()
      : undefined;

    const requestPayload: AiChatRequest = {
      message: trimmed,
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
              ? 'La consulta no cumple los límites del chat. Reduce el mensaje y vuelve a intentarlo.'
              : 'No se pudo completar la respuesta de IA. Verifica la conexión o inténtalo de nuevo.');
          return of(null);
        }),
        finalize(() => { if (version === this.sessionVersion) this.isGenerating.set(false); })
      )
      .subscribe();
    return true;
  }

  /**
   * Extrae el contenido representativo legible del documento actualmente abierto.
   */
  extractCurrentDocumentContext(): DocumentContextPayload | undefined {
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
        const snapshot = this.documents.capture(true);
        for (const target of snapshot.targets) if (!append(`${target.id}: ${target.text}`)) break;
        truncated ||= snapshot.truncated;
        this.documentContextTruncated.set(truncated);
        return { title: boundedAiText(note.title, AI_REQUEST_LIMITS.title), docType, content: parts.join('') };
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
      content: parts.join(''),
    };
  }

  private addErrorMessage(content: string): void {
    this.messages.update((messages) => [...messages, {
      id: `err-${Date.now()}`, role: 'assistant', content, timestamp: new Date(), error: true,
    }]);
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
