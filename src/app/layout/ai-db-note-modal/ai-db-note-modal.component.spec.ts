import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AiDbNoteModalComponent } from './ai-db-note-modal.component';
import { NotesService } from '../../core/services/notes.service';
import { NoteSummary } from '../../core/models/note.model';

describe('AiDbNoteModalComponent', () => {
  let fixture: ComponentFixture<AiDbNoteModalComponent>;
  let component: AiDbNoteModalComponent;

  const mockNotes: NoteSummary[] = [
    {
      _id: 'n1',
      userId: 'u1',
      title: 'Tesis Eco300',
      space: 'Eco300',
      docType: 'doc',
      tags: [],
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    },
    {
      _id: 'n2',
      userId: 'u1',
      title: 'Presupuesto Excel',
      space: 'ECO449-SA',
      docType: 'sheet',
      tags: [],
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    },
    {
      _id: 'n3',
      userId: 'u1',
      title: 'Guía de laboratorio',
      space: 'Fisica 3',
      docType: 'block',
      tags: [],
      createdAt: '2026-03-01',
      updatedAt: '2026-03-01',
    },
  ];

  beforeEach(async () => {
    const mockNotesService = {
      notesList: () => mockNotes,
      getAllNotesSummary: () => of(mockNotes),
    };

    await TestBed.configureTestingModule({
      imports: [AiDbNoteModalComponent],
      providers: [
        { provide: NotesService, useValue: mockNotesService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiDbNoteModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders modal dialog and loads all documents', () => {
    expect(component.dbNotesList()).toHaveLength(3);
    expect(component.availableSpaces()).toEqual(['ECO449-SA', 'Eco300', 'Fisica 3']);
    const dialog = fixture.nativeElement.querySelector('.ai-db-modal-dialog');
    expect(dialog).not.toBeNull();
  });

  it('filters documents by space/directory', () => {
    component.selectedSpace.set('Eco300');
    fixture.detectChanges();
    expect(component.filteredNotes()).toHaveLength(1);
    expect(component.filteredNotes()[0].title).toBe('Tesis Eco300');
  });

  it('filters documents by search query', () => {
    component.searchQuery.set('excel');
    fixture.detectChanges();
    expect(component.filteredNotes()).toHaveLength(1);
    expect(component.filteredNotes()[0].title).toBe('Presupuesto Excel');
  });

  it('filters documents by docType (sheet vs doc vs block)', () => {
    component.selectedDocType.set('sheet');
    fixture.detectChanges();
    expect(component.filteredNotes()).toHaveLength(1);
    expect(component.filteredNotes()[0].docType).toBe('sheet');

    component.selectedDocType.set('doc');
    fixture.detectChanges();
    expect(component.filteredNotes()).toHaveLength(1);
    expect(component.filteredNotes()[0].docType).toBe('doc');
  });

  it('emits select event when clicking a document card', () => {
    let selectedNote: NoteSummary | undefined;
    component.select.subscribe((n) => (selectedNote = n));

    const card = fixture.nativeElement.querySelector('.ai-db-modal-card') as HTMLButtonElement;
    card.click();

    expect(selectedNote).toBeDefined();
    expect(selectedNote?._id).toBe('n1');
  });

  it('emits close event on escape or close button click', () => {
    let closed = false;
    component.close.subscribe(() => (closed = true));

    component.onEscape();
    expect(closed).toBe(true);

    closed = false;
    const closeBtn = fixture.nativeElement.querySelector('.ai-db-modal-close-btn') as HTMLButtonElement;
    closeBtn.click();
    expect(closed).toBe(true);
  });
});
