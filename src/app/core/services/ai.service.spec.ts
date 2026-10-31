import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiService } from './ai.service';
import { NotesService } from './notes.service';
import { Note } from '../models/note.model';
import { environment } from '../../../environments/environment';
import { AI_REQUEST_LIMITS, htmlToAiExcerpt } from '../utils/ai-request';

describe('bounded AI requests', () => {
  const currentNote = signal<Note | null>(null);
  let service: AiService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/ai/chat`;

  beforeEach(() => {
    currentNote.set(null);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: NotesService, useValue: { currentNote } },
    ] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AiService);
    service.includeDocumentContext.set(true);
    service.loadHistory();
    http.expectOne(`${environment.apiUrl}/ai/history`).flush({ messages: [], hasMore: false, nextBefore: null });
  });
  afterEach(() => { http?.verify(); vi.restoreAllMocks(); });

  it('skips embedded binary images and non-readable HTML while retaining the text after them', () => {
    const html = '<p>Inicio &amp; texto</p><img alt="a > b" src="data:image/png;base64,'
      + 'A'.repeat(2_000_000) + '"><style>PRIVATE_STYLE</style><script>PRIVATE_SCRIPT</script>'
      + '<svg><text>VECTOR_DATA</text></svg><p>Final legible</p>';
    const result = htmlToAiExcerpt(html, 15_000);
    expect(result.text).toContain('Inicio & texto');
    expect(result.text).toContain('Final legible');
    expect(result.text).not.toMatch(/base64|AAAA|PRIVATE_|VECTOR_DATA/);
    expect(result.text.length).toBeLessThan(100);
  });

  it('caps a large Word context before HTTP serialization and stops reading later pages', () => {
    const laterPage = { get html(): string { throw new Error('Unneeded page was read'); } };
    currentNote.set({ title: 'Word', docType: 'doc', docData: {
      pages: [{ html: `<p>${'Texto '.repeat(20_000)}</p>` }, laterPage],
    } } as Note);
    service.sendMessage('Resume el documento');
    const request = http.expectOne(url);
    expect(request.request.body.documentContext.content.length).toBeLessThanOrEqual(AI_REQUEST_LIMITS.document);
    expect(new TextEncoder().encode(JSON.stringify(request.request.body)).byteLength).toBeLessThan(100_000);
    expect(service.documentContextTruncated()).toBe(true);
    request.flush({ reply: 'Resumen' });
    expect(service.isGenerating()).toBe(false);
  });

  it('keeps visible long replies and lets FastAPI load the history without retransmitting it', () => {
    service.messages.set(Array.from({ length: 30 }, (_, index) => ({
      id: `old-${index}`, role: index % 2 ? 'assistant' : 'user',
      content: String(index).padStart(2, '0') + 'x'.repeat(50_000), timestamp: new Date(),
    })));
    service.sendMessage('Continúa');
    const request = http.expectOne(url);
    expect(request.request.body.history).toBeUndefined();
    expect(request.request.body.persistHistory).toBe(true);
    expect(service.messages()[0].content.length).toBeGreaterThan(12_000);
    request.flush({ reply: 'OK' });
  });

  it('bounds code blocks and excludes data URLs from the text context', () => {
    currentNote.set({ _id: 'code', userId: 'user', space: 'Research', tags: [],
      title: 'Code', docType: 'block', blocks: [{
        id: 'block', order: 0, metadata: {}, type: 'code',
        content: { code: 'data:application/pdf;base64,' + 'A'.repeat(2_000_000) },
      }],
    });
    const context = service.extractCurrentDocumentContext();
    expect(context!.content).not.toContain('AAAA');
    expect(context!.content!.length).toBeLessThanOrEqual(15_000);
  });

  it('never extracts the document when its context is disabled', () => {
    service.includeDocumentContext.set(false);
    const extract = vi.spyOn(service, 'extractCurrentDocumentContext');
    service.sendMessage('Hola');
    const request = http.expectOne(url);
    expect(extract).not.toHaveBeenCalled();
    expect(request.request.body.documentContext).toBeUndefined();
    request.flush({ reply: 'Hola' });
  });

  it('reports an oversized current message without silently truncating or sending it', () => {
    service.sendMessage('x'.repeat(12_001));
    http.expectNone(url);
    expect(service.isGenerating()).toBe(false);
    expect(service.messages().at(-1)!.error).toBe(true);
    expect(service.messages().at(-1)!.content).toContain('12 000');
  });

  it('shows an actionable 413 error and releases the generating state for retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    service.sendMessage('Hola');
    http.expectOne(url).flush({}, { status: 413, statusText: 'Payload Too Large' });
    expect(service.isGenerating()).toBe(false);
    expect(service.messages().at(-1)!.content).toContain('Desactiva el contexto');
    service.sendMessage('Reintentar');
    http.expectOne(url).flush({ reply: 'OK' });
  });

  it('starts empty and restores persisted messages with their original identifiers and dates', () => {
    expect(service.messages()).toEqual([]);
    const stored = [{ id: 'saved', role: 'assistant', content: 'x'.repeat(50_000),
      timestamp: '2026-10-24T12:00:00Z', error: false }];
    service.loadHistory();
    http.expectOne(`${environment.apiUrl}/ai/history`).flush({ messages: stored, hasMore: false, nextBefore: null });
    const reloaded = TestBed.runInInjectionContext(() => new AiService());
    expect(reloaded.messages()).toEqual([]);
    reloaded.loadHistory();
    http.expectOne(`${environment.apiUrl}/ai/history`).flush({ messages: stored, hasMore: false, nextBefore: null });
    expect(reloaded.messages()).toEqual(service.messages());
    expect(reloaded.messages()[0].timestamp).toBeInstanceOf(Date);
    expect(reloaded.messages()[0].content).toHaveLength(50_000);
  });

  it('uses FastAPI message IDs without duplicating the optimistic user message', () => {
    service.sendMessage('Hola');
    http.expectOne(url).flush({ reply: 'Respuesta',
      userMessage: { id: 'user-saved', role: 'user', content: 'Hola', timestamp: '2026-10-24T12:00:00Z', error: false },
      assistantMessage: { id: 'reply-saved', role: 'assistant', content: 'Respuesta', timestamp: '2026-10-24T12:00:01Z', error: false },
    });
    expect(service.messages().map((message) => message.id)).toEqual(['user-saved', 'reply-saved']);
  });

  it('loads older pages chronologically and removes overlapping message IDs', () => {
    const message = (id: string) => ({ id, role: 'user', content: id, timestamp: '2026-10-24T12:00:00Z', error: false });
    service.loadHistory();
    http.expectOne(`${environment.apiUrl}/ai/history`).flush({ messages: [message('3'), message('4')], hasMore: true, nextBefore: 3 });
    service.loadHistory(true);
    http.expectOne(`${environment.apiUrl}/ai/history?before=3`).flush({ messages: [message('1'), message('2'), message('3')], hasMore: false, nextBefore: null });
    expect(service.messages().map((item) => item.id)).toEqual(['1', '2', '3', '4']);
    expect(service.hasMoreHistory()).toBe(false);
  });

  it('deletes history on the server, cancels an in-flight reply and leaves no replacement greeting', () => {
    service.sendMessage('Pregunta pendiente');
    const pending = http.expectOne(url);
    service.clearHistory();
    expect(service.messages()).toHaveLength(1);
    http.expectOne({ method: 'DELETE', url: `${environment.apiUrl}/ai/history` }).flush({ cleared: true });
    expect(pending.cancelled).toBe(true);
    expect(service.messages()).toEqual([]);
    expect(service.isGenerating()).toBe(false);
    expect(service.historyReady()).toBe(true);
  });

  it('keeps messages when server deletion fails', () => {
    service.messages.set([{ id: 'saved', role: 'user', content: 'Conservar', timestamp: new Date() }]);
    service.clearHistory();
    http.expectOne({ method: 'DELETE', url: `${environment.apiUrl}/ai/history` }).flush({}, { status: 502, statusText: 'Bad Gateway' });
    expect(service.messages()[0].content).toBe('Conservar');
    expect(service.isClearingHistory()).toBe(false);
    expect(service.historyError()).toBeTruthy();
  });

  it('cancels pending history when changing accounts and does not delete persisted data', () => {
    service.loadHistory();
    const pending = http.expectOne(`${environment.apiUrl}/ai/history`);
    service.resetSession();
    expect(pending.cancelled).toBe(true);
    expect(service.messages()).toEqual([]);
    expect(service.historyReady()).toBe(false);
    http.expectNone((request) => request.method === 'DELETE');
  });
});
