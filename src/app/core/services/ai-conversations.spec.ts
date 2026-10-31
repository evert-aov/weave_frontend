import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiService } from './ai.service';
import { NotesService } from './notes.service';
import { AiDocumentService } from './ai-document.service';
import { environment } from '../../../environments/environment';

describe('independent assistant conversations and document edits', () => {
  const base = `${environment.apiUrl}/ai`;
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const currentNote = signal<any>({ _id: 'doc', title: 'LaTeX', docType: 'latex' });
  let ai: AiService; let http: HttpTestingController;
  beforeEach(() => {
    currentNote.set({ _id: 'doc', title: 'LaTeX', docType: 'latex' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: NotesService, useValue: { currentNote, isReadingMode: signal(false) } }] });
    ai = TestBed.inject(AiService); http = TestBed.inject(HttpTestingController);
    ai.includeDocumentContext.set(true);
  });
  afterEach(() => http.verify());
  it('creates a separate chat, cancels a pending local response on switch and paginates by conversation', async () => {
    ai.initialize();
    http.expectOne(`${base}/conversations`).flush([{ id: 'default', title: 'Anterior', updatedAt: 'now' }]);
    http.expectOne(`${base}/history`).flush({ messages: [{ id: 'old', role: 'user', content: 'Anterior', timestamp: '2026-01-01' }], hasMore: false });
    const creating = ai.createConversation();
    http.expectOne(`${base}/conversations`).flush({ id, title: 'Nuevo chat', updatedAt: 'now' });
    await creating;
    expect(ai.messages()).toEqual([]);
    http.expectOne(`${base}/history?conversationId=${id}`).flush({ messages: [], hasMore: true, nextBefore: 10 });
    ai.loadHistory(true);
    http.expectOne(`${base}/history?before=10&conversationId=${id}`).flush({ messages: [], hasMore: false });
    ai.sendMessage('Hola'); const request = http.expectOne(`${base}/chat`);
    expect(request.request.body.conversationId).toBe(id);
    ai.selectConversation('default');
    expect(request.cancelled).toBe(true);
    http.expectOne(`${base}/history`).flush({ messages: [], hasMore: false });
  });
  it('refreshes a chat deleted elsewhere without applying its pending response to the replacement', () => {
    ai.conversations.set([{ id: 'default', title: 'Anterior', updatedAt: '' }]);
    ai.conversationsReady.set(true); ai.historyReady.set(true);
    ai.sendMessage('Pendiente'); const pending = http.expectOne(`${base}/chat`);
    ai.initialize();
    http.expectOne(`${base}/conversations`).flush([{ id, title: 'Conservado', updatedAt: '' }]);
    expect(pending.cancelled).toBe(true); expect(ai.activeConversationId()).toBe(id); expect(ai.messages()).toEqual([]);
    http.expectOne(`${base}/history?conversationId=${id}`).flush({ messages: [], hasMore: false });
  });
  it('keeps other chats when deleting and clears all in-memory identities on sign out', async () => {
    ai.conversations.set([{ id: 'default', title: 'Principal', updatedAt: '' }, { id, title: 'Otro', updatedAt: '' }]);
    const deleting = ai.deleteConversation(); http.expectOne(`${base}/conversations/default`).flush({ deleted: true }); await deleting;
    expect(ai.activeConversationId()).toBe(id); expect(ai.conversations()).toHaveLength(1);
    http.expectOne(`${base}/history?conversationId=${id}`).flush({ messages: [], hasMore: false });
    ai.resetSession(); expect(ai.conversations()).toEqual([]); expect(ai.messages()).toEqual([]); expect(ai.editMode()).toBe(false);
  });
  it('applies structured changes only in edit mode and to the captured active editor', () => {
    let source = 'x+x';
    TestBed.inject(AiDocumentService).register({ owner: () => 'doc', fields: () => [{ id: 'latex:source', text: source }], apply: values => { source = values.get('latex:source')!; } });
    ai.historyReady.set(true); ai.editMode.set(true);
    ai.sendMessage('Simplifica');
    const request = http.expectOne(`${base}/chat`);
    expect(request.request.body.editTargets).toEqual([{ id: 'latex:source', text: 'x+x' }]);
    request.flush({ reply: 'Simplificación', edits: [{ target: 'latex:source', before: 'x+x', after: '2x' }] });
    expect(source).toBe('2x'); expect(ai.editStatus()).toContain('aplicado');
    ai.sendMessage('Ahora cambia a 3x'); source = 'edición manual';
    http.expectOne(`${base}/chat`).flush({ reply: 'Cambio', edits: [{ target: 'latex:source', before: '2x', after: '3x' }] });
    expect(source).toBe('edición manual'); expect(ai.editStatus()).toContain('cambió');
    ai.editMode.set(false); ai.sendMessage('Solo pregunta');
    const chat = http.expectOne(`${base}/chat`); expect(chat.request.body.editTargets).toBeUndefined();
    chat.flush({ reply: 'Sin editar', edits: [{ target: 'latex:source', before: '', after: 'mal' }] });
    expect(source).toBe('edición manual');
  });
});
