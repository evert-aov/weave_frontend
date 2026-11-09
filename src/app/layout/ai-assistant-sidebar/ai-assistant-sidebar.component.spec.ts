import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { AiAssistantSidebarComponent } from './ai-assistant-sidebar.component';
import { AiService } from '../../core/services/ai.service';
import { NotesService } from '../../core/services/notes.service';
import { WorkspaceLayoutService } from '../../core/services/workspace-layout.service';

describe('minimal assistant navigation', () => {
  it('opens, filters and selects conversations while keeping model and editing controls in the composer', () => {
    const ai = {
      initialize: vi.fn(), isSidebarOpen: signal(true), activeConversationId: signal('a'),
      conversations: signal([{ id: 'a', title: 'Mi informe' }, { id: 'b', title: 'Otro trabajo' }]),
      messages: signal([]), isManagingChats: signal(false), isGenerating: signal(false),
      isLoadingHistory: signal(false), isClearingHistory: signal(false), historyError: signal(''), hasMoreHistory: signal(false),
      editStatus: signal(''), editMode: signal(false), includeDocumentContext: signal(true), documentContextTruncated: signal(false),
      selectedModel: signal('test'), availableModels: [{ id: 'test', name: 'Test model' }],
      documents: { supported: () => true, isReadingLocked: () => false },
      selectConversation: vi.fn(), createConversation: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: AiService, useValue: ai },
      { provide: NotesService, useValue: { currentNote: signal({ title: 'Informe', docType: 'doc' }) } },
      { provide: WorkspaceLayoutService, useValue: { assistantWidth: signal(336), assistantMinWidth: 240, assistantMaxWidth: 700 } },
    ] });
    const fixture = TestBed.createComponent(AiAssistantSidebarComponent); fixture.detectChanges();
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
    fixture.destroy(); TestBed.resetTestingModule();
  });
});
