import {
  Component,
  OnInit,
  HostListener,
  inject,
  signal,
  computed,
} from '@angular/core';
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
 * Barra lateral navegable y jerárquica de Weave.
 * Soporta árbol de directorios anidados (ej: uagrm -> sw -> notas),
 * búsqueda, creación de subcarpetas y gestión de documentos sin emojis.
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
  readonly expandedSpaces = signal<Set<string>>(new Set<string>());

  /**
   * Árbol de espacios/directorios ordenado jerárquicamente a partir de la lista plana de MongoDB.
   */
  readonly rootSpaces = computed<Space[]>(() => {
    const list = this.spacesService.spacesList();
    const map = new Map<string, Space>();
    const roots: Space[] = [];

    // Inicializar mapa de nodos clonados
    for (const s of list) {
      map.set(s._id, {
        ...s,
        children: [],
        level: 0,
      });
    }

    // Enlazar hijos con padres
    for (const s of list) {
      const current = map.get(s._id)!;
      const parentIdStr = s.parentId ? s.parentId.toString() : null;

      if (parentIdStr && map.has(parentIdStr)) {
        const parent = map.get(parentIdStr)!;
        current.level = (parent.level || 0) + 1;
        parent.children = parent.children || [];
        parent.children.push(current);
      } else {
        roots.push(current);
      }
    }

    return roots;
  });

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showUserMenu()) {
      this.showUserMenu.set(false);
    }
  }

  ngOnInit(): void {
    this.spacesService.loadSpaces().subscribe({
      next: (spaces) => {
        // Expandir por defecto todos los directorios al iniciar
        const allIds = new Set(spaces.map((s) => s._id));
        this.expandedSpaces.set(allIds);
      },
    });
    this.notesService.loadNotes().subscribe();
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

  isSpaceExpanded(spaceId: string): boolean {
    return this.expandedSpaces().has(spaceId);
  }

  toggleSpace(spaceId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.expandedSpaces.update((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  }

  /**
   * Obtiene las notas que pertenecen directamente a este espacio/directorio.
   */
  getNotesForSpace(space: Space): Note[] {
    const allNotes = this.notesService.notesList();
    const query = this.searchQuery.trim().toLowerCase();
    const spacePath = (space.path || '').toLowerCase();
    const spaceName = space.name.toLowerCase();

    return allNotes.filter((note) => {
      const noteSpace = (note.space || '').toLowerCase();
      const matchSpace =
        noteSpace === spacePath ||
        noteSpace === spaceName ||
        (noteSpace.endsWith('/' + spaceName) && (spacePath ? noteSpace === spacePath : true));

      if (!matchSpace) return false;
      if (!query) return true;
      return note.title.toLowerCase().includes(query);
    });
  }

  totalNotesCount(): number {
    return this.notesService.notesList().length;
  }

  selectSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const targetSpace = space.path || space.name;
    this.notesService.activeSpace.set(targetSpace);

    // Asegurar que el espacio esté expandido
    this.expandedSpaces.update((prev) => {
      const next = new Set(prev);
      next.add(space._id);
      return next;
    });

    // Cargar o filtrar las notas del espacio
    this.notesService.loadNotes(targetSpace).subscribe();
  }

  showAllNotes(): void {
    this.notesService.activeSpace.set('all');
    this.notesService.loadNotes().subscribe();
  }

  openNote(note: Note): void {
    this.notesService.loadNoteById(note._id).subscribe();
  }

  createNoteInActiveSpace(): void {
    const active = this.notesService.activeSpace();
    const space = active && active !== 'all' ? active : 'Research';
    this.notesService.createNote(undefined, space).subscribe();
  }

  createNoteInSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const targetPath = space.path || space.name;
    this.notesService.createNote(undefined, targetPath).subscribe({
      next: (created) => {
        // Expandir el directorio al crear una nota en él
        this.expandedSpaces.update((prev) => {
          const next = new Set(prev);
          next.add(space._id);
          return next;
        });
      },
    });
  }

  promptCreateSpace(): void {
    const promptMsg =
      this.i18n.currentLang() === 'es'
        ? 'Nombre del nuevo espacio/directorio principal:'
        : 'Name of the new root directory:';
    const name = prompt(promptMsg);
    if (name && name.trim()) {
      const colors = ['indigo', 'teal', 'violet', 'amber', 'rose'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      this.spacesService.createSpace(name.trim(), randomColor, null).subscribe({
        next: (created) => {
          this.expandedSpaces.update((prev) => {
            const next = new Set(prev);
            next.add(created._id);
            return next;
          });
          this.selectSpace(created);
        },
      });
    }
  }

  promptCreateSubspace(parentSpace: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const promptMsg =
      this.i18n.currentLang() === 'es'
        ? `Nuevo subdirectorio dentro de "${parentSpace.name}":`
        : `New subdirectory inside "${parentSpace.name}":`;
    const name = prompt(promptMsg);
    if (name && name.trim()) {
      this.spacesService
        .createSpace(name.trim(), parentSpace.color, parentSpace._id)
        .subscribe({
          next: (created) => {
            this.expandedSpaces.update((prev) => {
              const next = new Set(prev);
              next.add(parentSpace._id);
              next.add(created._id);
              return next;
            });
            this.selectSpace(created);
          },
        });
    }
  }

  renameSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const currentName = space.name;
    const newName = prompt(
      this.i18n.currentLang() === 'es'
        ? `Renombrar directorio "${currentName}":`
        : `Rename directory "${currentName}":`,
      currentName,
    );
    if (!newName || !newName.trim() || newName.trim() === currentName) {
      return;
    }
    const trimmed = newName.trim();
    this.spacesService.updateSpace(space._id, trimmed).subscribe({
      next: () => {
        const oldTarget = space.path || space.name;
        if (this.notesService.activeSpace() === oldTarget) {
          this.notesService.activeSpace.set(trimmed);
        }
        this.notesService.loadNotes().subscribe();
      },
    });
  }

  deleteSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const confirmMsg =
      this.i18n.currentLang() === 'es'
        ? `¿Eliminar el directorio "${space.name}" y todos sus subdirectorios?`
        : `Delete directory "${space.name}" and all its subdirectories?`;
    if (confirm(confirmMsg)) {
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
