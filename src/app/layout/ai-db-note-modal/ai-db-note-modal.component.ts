import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesService } from '../../core/services/notes.service';
import { NoteSummary } from '../../core/models/note.model';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { getDocTypeLabel } from '../../core/utils/ai-note-reader';

@Component({
  selector: 'app-ai-db-note-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './ai-db-note-modal.component.html',
  styleUrls: ['./ai-db-note-modal.component.scss'],
})
export class AiDbNoteModalComponent implements OnInit {
  private readonly notesService = inject(NotesService);

  @Output() select = new EventEmitter<NoteSummary>();
  @Output() close = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;

  readonly dbNotesList = signal<NoteSummary[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly searchQuery = signal<string>('');
  readonly selectedSpace = signal<string>('all');
  readonly selectedDocType = signal<string>('all');

  readonly availableSpaces = computed(() => {
    const spaces = new Set<string>();
    for (const n of this.dbNotesList()) {
      if (n.space) spaces.add(n.space);
    }
    return Array.from(spaces).sort();
  });

  readonly filteredNotes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const space = this.selectedSpace();
    const docType = this.selectedDocType();
    let list = this.dbNotesList();

    if (space && space !== 'all') {
      list = list.filter(n => n.space === space || n.space?.startsWith(space + '/'));
    }

    if (docType && docType !== 'all') {
      list = list.filter(n => (n.docType || 'block') === docType);
    }

    if (query) {
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(query) ||
        (n.space || '').toLowerCase().includes(query) ||
        (n.docType || '').toLowerCase().includes(query)
      );
    }

    return list;
  });

  ngOnInit(): void {
    this.loadNotes();
  }

  loadNotes(): void {
    this.isLoading.set(true);
    this.notesService.getAllNotesSummary().subscribe({
      next: (notes) => {
        this.dbNotesList.set(notes);
        this.isLoading.set(false);
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 50);
      },
      error: () => {
        this.dbNotesList.set(this.notesService.notesList());
        this.isLoading.set(false);
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 50);
      },
    });
  }

  docTypeCount(type: string): number {
    return this.dbNotesList().filter(n => (n.docType || 'block') === type).length;
  }

  getDocTypeLabel(docType?: string): string {
    return getDocTypeLabel(docType);
  }

  getDocIconName(docType?: string): 'sheet' | 'file-text' | 'grid' {
    switch (docType) {
      case 'sheet': return 'sheet';
      case 'canvas': return 'grid';
      default: return 'file-text';
    }
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedSpace.set('all');
    this.selectedDocType.set('all');
    this.searchInput?.nativeElement?.focus();
  }

  chooseNote(note: NoteSummary): void {
    this.select.emit(note);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialogEl = this.dialog?.nativeElement;
    if (!dialogEl) return;
    const focusable = Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])'
      )
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
