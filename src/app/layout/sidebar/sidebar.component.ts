import { Component, OnInit, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesService } from '../../core/services/notes.service';
import { AuthService } from '../../core/services/auth.service';
import { SpacesService } from '../../core/services/spaces.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { Note } from '../../core/models/note.model';
import { Space } from '../../core/models/space.model';

/**
 * Barra lateral navegable de Weave.
 * Gestiona espacios como directorios persistidos en MongoDB y elimina cualquier elemento falso o estático.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  readonly notesService = inject(NotesService);
  readonly authService = inject(AuthService);
  readonly spacesService = inject(SpacesService);
  readonly i18n = inject(I18nService);

  searchQuery = '';
  readonly showUserMenu = signal<boolean>(false);

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showUserMenu()) {
      this.showUserMenu.set(false);
    }
  }

  toggleUserMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showUserMenu.update((prev) => !prev);
  }

  logout(): void {
    this.showUserMenu.set(false);
    this.authService.logout();
  }

  renameSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const currentName = space.name;
    const newName = prompt(
      this.i18n.currentLang() === 'es'
        ? `Renombrar espacio "${currentName}":`
        : `Rename space "${currentName}":`,
      currentName,
    );
    if (!newName || !newName.trim() || newName.trim() === currentName) {
      return;
    }
    const trimmed = newName.trim();
    this.spacesService.updateSpace(space._id, trimmed).subscribe({
      next: () => {
        if (this.notesService.activeSpace() === currentName) {
          this.notesService.activeSpace.set(trimmed);
        }
        this.notesService.loadNotes(trimmed).subscribe();
      },
    });
  }

  ngOnInit(): void {
    this.spacesService.loadSpaces().subscribe();
  }

  filteredNotes(): Note[] {
    const list = this.notesService.notesList();
    if (!this.searchQuery) return list;
    return list.filter((n) =>
      n.title.toLowerCase().includes(this.searchQuery.toLowerCase()),
    );
  }

  totalNotesCount(): number {
    return this.notesService.notesList().length;
  }

  selectSpace(space: Space): void {
    this.notesService.activeSpace.set(space.name);
    this.notesService.loadNotes(space.name).subscribe();
  }

  showAllNotes(): void {
    this.notesService.activeSpace.set('all');
    this.notesService.loadNotes().subscribe();
  }

  openNote(note: Note): void {
    this.notesService.loadNoteById(note._id).subscribe();
  }

  createNoteInActiveSpace(): void {
    this.notesService.createNote(undefined, this.notesService.activeSpace()).subscribe();
  }

  createNoteInSpace(spaceName: string): void {
    this.notesService.createNote(undefined, spaceName).subscribe();
  }

  promptCreateSpace(): void {
    const name = prompt('Nombre del nuevo espacio/directorio:');
    if (name && name.trim()) {
      const colors = ['indigo', 'violet', 'teal', 'amber', 'rose'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      this.spacesService.createSpace(name.trim(), randomColor).subscribe({
        next: (created) => {
          this.selectSpace(created);
        },
      });
    }
  }

  deleteSpace(space: Space): void {
    if (confirm(`¿Eliminar el directorio "${space.name}"?`)) {
      this.spacesService.deleteSpace(space._id).subscribe({
        next: () => {
          this.showAllNotes();
        },
      });
    }
  }

  userInitials(): string {
    const name = this.authService.currentUser()?.name || 'User';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
}
