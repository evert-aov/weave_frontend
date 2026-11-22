import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { AiAssistantSidebarComponent } from './ai-assistant-sidebar.component';
import { AiService } from '../../core/services/ai.service';
import { NotesService } from '../../core/services/notes.service';
import { NoteSummary } from '../../core/models/note.model';
import { WorkspaceLayoutService } from '../../core/services/workspace-layout.service';

describe('minimal assistant navigation', () => {
  it('opens, filters and selects conversations while keeping model and editing controls in the composer', async () => {
    const ai = {
      initialize: vi.fn(), isSidebarOpen: signal(true), activeConversationId: signal('a'),
      conversations: signal([{ id: 'a', title: 'Mi informe' }, { id: 'b', title: 'Otro trabajo' }]),
      messages: signal([]), isManagingChats: signal(false), isGenerating: signal(false),
      isLoadingHistory: signal(false), isClearingHistory: signal(false), historyError: signal(''), hasMoreHistory: signal(false),
      editStatus: signal(''), editMode: signal(false), includeDocumentContext: signal(true), documentContextTruncated: signal(false),
      selectedModel: signal('test'), availableModels: [{ id: 'test', name: 'Test model' }],
      documents: { supported: () => true, isReadingLocked: () => false },
      selectConversation: vi.fn(), createConversation: vi.fn(),
      sendMessage: vi.fn(() => true),
      dbNotePickerOpen: signal(false),
      attachDbNoteRequested: signal<NoteSummary | null>(null),
      openDbNotePicker() { this.dbNotePickerOpen.set(true); },
      closeDbNotePicker() { this.dbNotePickerOpen.set(false); },
      requestAttachDbNote(note: NoteSummary) { this.attachDbNoteRequested.set(note); this.closeDbNotePicker(); },
    };
    TestBed.configureTestingModule({ providers: [
      { provide: AiService, useValue: ai },
      {
        provide: NotesService,
        useValue: {
          currentNote: signal({ title: 'Informe', docType: 'doc' }),
          notesList: signal([
            { _id: 'n1', title: 'Presupuesto 2026', docType: 'sheet', space: 'Finanzas' },
            { _id: 'n2', title: 'Plan de Trabajo', docType: 'doc', space: 'Proyectos' },
          ]),
          loadNotes: vi.fn(() => of([])),
          getAllNotesSummary: vi.fn(() => of([
            { _id: 'n1', title: 'Presupuesto 2026', docType: 'sheet', space: 'Finanzas' },
            { _id: 'n2', title: 'Plan de Trabajo', docType: 'doc', space: 'Proyectos' },
          ])),
          getNoteById: vi.fn((id: string) => of({
            _id: id,
            title: id === 'n1' ? 'Presupuesto 2026' : 'Plan de Trabajo',
            docType: id === 'n1' ? 'sheet' : 'doc',
            docData: id === 'n1' ? {
              sheets: [{ id: 's1', name: 'Costos', data: { A1: { raw: 'Total: 5000' } } }]
            } : {
              pages: [{ id: 'p1', html: '<p>Contenido del plan</p>' }]
            },
          })),
        },
      },
      { provide: WorkspaceLayoutService, useValue: { assistantWidth: signal(336), assistantMinWidth: 240, assistantMaxWidth: 700 } },
    ] });
    const fixture = TestBed.createComponent(AiAssistantSidebarComponent);
    vi.spyOn(fixture.componentInstance as any, 'scrollToBottom').mockImplementation(() => {}); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.ai-conversations')).toBeNull();
    (host.querySelector('[aria-controls="ai-conversations"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(host.querySelectorAll('.ai-conversation')).toHaveLength(2);
    fixture.componentInstance.chatSearch.set('otro'); fixture.detectChanges();
    expect(host.querySelectorAll('.ai-conversation')).toHaveLength(1);
    (host.querySelector('.ai-conversation') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(ai.selectConversation).toHaveBeenCalledWith('b');
    expect(host.querySelector('.ai-conversations')).toBeNull();
    expect(host.querySelector('.ai-input-footer .ai-model-select')).not.toBeNull();
    expect(host.querySelector('.ai-input-footer .ai-edit-toggle')).not.toBeNull();
    expect(host.querySelector('[appProofreading]')).toBeNull();
    const image={name:'capture.png',type:'image/png',size:8,arrayBuffer:async()=>new Uint8Array([137,80,78,71,13,10,26,10]).buffer} as File;
    const pasted={clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>image}]},preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as ClipboardEvent;
    await fixture.componentInstance.pasteAttachments(pasted);fixture.detectChanges();
    expect(pasted.preventDefault).toHaveBeenCalled();
    expect(fixture.componentInstance.attachments()[0].mimeType).toBe('image/png');
    expect(host.querySelector<HTMLImageElement>('.ai-attachment-preview')!.src).toContain('data:image/png;base64,');
    await fixture.componentInstance.attachFiles({target:{files:[image],value:'capture.png'}} as unknown as Event);
    expect(fixture.componentInstance.attachments()).toHaveLength(2);
    const textPaste={clipboardData:{items:[],files:[]},preventDefault:vi.fn()} as unknown as ClipboardEvent;
    await fixture.componentInstance.pasteAttachments(textPaste);expect(textPaste.preventDefault).not.toHaveBeenCalled();
    fixture.componentInstance.onSend();
    expect(ai.sendMessage).toHaveBeenCalledWith('Analiza los archivos adjuntos.',expect.arrayContaining([expect.objectContaining({mimeType:'image/png',data:'iVBORw0KGgo='})]));
    expect(fixture.componentInstance.attachments()).toHaveLength(0);
    fixture.destroy(); TestBed.resetTestingModule();
  });

  it('allows picking, attaching, and sending notes from the database to interact with both Word and Excel', async () => {
    const ai = {
      initialize: vi.fn(), isSidebarOpen: signal(true), activeConversationId: signal('chat-1'),
      conversations: signal([{ id: 'chat-1', title: 'Chat financiero' }]),
      messages: signal([]), isManagingChats: signal(false), isGenerating: signal(false),
      isLoadingHistory: signal(false), isClearingHistory: signal(false), historyError: signal(''), hasMoreHistory: signal(false),
      editStatus: signal(''), editMode: signal(false), includeDocumentContext: signal(true), documentContextTruncated: signal(false),
      selectedModel: signal('test'), availableModels: [{ id: 'test', name: 'Test model' }],
      documents: { supported: () => true, isReadingLocked: () => false },
      selectConversation: vi.fn(), createConversation: vi.fn(),
      sendMessage: vi.fn(() => true),
      dbNotePickerOpen: signal(false),
      attachDbNoteRequested: signal<NoteSummary | null>(null),
      openDbNotePicker() { this.dbNotePickerOpen.set(true); },
      closeDbNotePicker() { this.dbNotePickerOpen.set(false); },
      requestAttachDbNote(note: NoteSummary) { this.attachDbNoteRequested.set(note); this.closeDbNotePicker(); },
    };
    const mockNotes = {
      currentNote: signal({ _id: 'word-active', title: 'Informe Word', docType: 'doc', space: 'ECO449-SA' }),
      notesList: signal([
        { _id: 'sheet-db', title: 'Presupuesto Excel', docType: 'sheet', space: 'ECO449-SA' },
      ]),
      loadNotes: vi.fn(() => of([])),
      getAllNotesSummary: vi.fn(() => of([
        { _id: 'sheet-db', title: 'Presupuesto Excel', docType: 'sheet', space: 'ECO449-SA' },
        { _id: 'doc-other', title: 'Tesis Eco300', docType: 'doc', space: 'Eco300' },
        { _id: 'doc-physics', title: 'Lab Fisica', docType: 'latex', space: 'Fisica 3' },
      ])),
      getNoteById: vi.fn((id: string) => of({
        _id: id,
        title: id === 'sheet-db' ? 'Presupuesto Excel' : 'Tesis Eco300',
        docType: id === 'sheet-db' ? 'sheet' : 'doc',
        space: id === 'sheet-db' ? 'ECO449-SA' : 'Eco300',
        docData: id === 'sheet-db' ? {
          sheets: [
            {
              id: 's1',
              name: 'Ingresos',
              data: {
                A1: { raw: 'Ingresos' },
                B1: { raw: 50000 },
              },
            },
          ],
        } : {
          pages: [{ id: 'p1', html: '<p>Contenido de tesis</p>' }],
        },
      })),
    };

    TestBed.configureTestingModule({ providers: [
      { provide: AiService, useValue: ai },
      { provide: NotesService, useValue: mockNotes },
      { provide: WorkspaceLayoutService, useValue: { assistantWidth: signal(336), assistantMinWidth: 240, assistantMaxWidth: 700 } },
    ] });

    const fixture = TestBed.createComponent(AiAssistantSidebarComponent);
    vi.spyOn(fixture.componentInstance as any, 'scrollToBottom').mockImplementation(() => {});
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const aiService = TestBed.inject(AiService);

    // 1. Initially picker is closed
    expect(aiService.dbNotePickerOpen()).toBe(false);

    // 2. Open database note picker delegates to aiService
    component.openDatabaseNotePicker();
    expect(aiService.dbNotePickerOpen()).toBe(true);

    // 3. Requesting an attachment via aiService triggers attachDatabaseNote
    const excelNote: NoteSummary = {
      _id: 'sheet-db',
      userId: 'u1',
      title: 'Presupuesto Excel',
      space: 'ECO449-SA',
      docType: 'sheet',
      tags: [],
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    };
    aiService.requestAttachDbNote(excelNote);
    fixture.detectChanges();
    await fixture.whenStable();

    // 4. Modal closed and attachment added
    expect(aiService.dbNotePickerOpen()).toBe(false);
    expect(component.attachments()).toHaveLength(1);
    expect(component.attachments()[0].name).toBe('Presupuesto Excel (Excel)');
    expect(component.attachments()[0].mimeType).toBe('text/plain');
    expect(component.attachments()[0].text).toContain('[Hoja de cálculo: "Presupuesto Excel"]');
    expect(component.attachments()[0].text).toContain('A: Ingresos | B: 50000');

    // 5. Send message with the attached database note
    component.inputText.set('Compara los ingresos del Excel con este documento Word.');
    component.onSend();
    fixture.detectChanges();

    expect(ai.sendMessage).toHaveBeenCalledWith(
      'Compara los ingresos del Excel con este documento Word.',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Presupuesto Excel (Excel)',
          mimeType: 'text/plain',
        }),
      ])
    );
    expect(component.inputText()).toBe('');
    expect(component.attachments()).toHaveLength(0);

    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
