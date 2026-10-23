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
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { Note, DocType } from '../../core/models/note.model';
import { Space } from '../../core/models/space.model';

export interface DraggedItem {
  type: 'note' | 'space';
  id: string;
  name: string;
}

export interface MovingTarget {
  type: 'note' | 'space';
  id: string;
  name: string;
  currentSpace?: string;
}

/**
 * Barra lateral navegable y jerárquica de Weave.
 * Soporta árbol de directorios anidados (ej: uagrm -> sw -> notas),
 * arrastrar y soltar notas entre directorios, mover directorios dentro de otros,
 * búsqueda y acciones contextuales con iconografía SVG limpia sin emojis.
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

  // Estados de arrastrar y soltar (Drag and Drop)
  readonly draggedItem = signal<DraggedItem | null>(null);
  readonly dragOverSpaceId = signal<string | null>(null);
  readonly isDragOverRoot = signal<boolean>(false);

  // Estados del modal interactivo "Mover a..."
  readonly showMoveModal = signal<boolean>(false);
  readonly movingTarget = signal<MovingTarget | null>(null);
  readonly selectedDestinationId = signal<string | null>(null);

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

  /**
   * Lista de destinos válidos para el modal de mover, filtrando el nodo actual y sus descendientes si es carpeta.
   */
  readonly availableDestinations = computed<Space[]>(() => {
    const target = this.movingTarget();
    const all = this.spacesService.spacesList();
    if (!target) return all;
    if (target.type === 'note') return all;
    return all.filter((s) => !this.isDescendant(target.id, s._id));
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

  // Estados del modal interactivo de creación de documento especializado
  readonly showCreateDocModal = signal<boolean>(false);
  readonly targetSpaceForNewDoc = signal<Space | null>(null);
  readonly newDocTitle = signal<string>('');

  openCreateDocModal(space?: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.targetSpaceForNewDoc.set(space || null);
    this.newDocTitle.set('');
    this.showCreateDocModal.set(true);
  }

  closeCreateDocModal(): void {
    this.showCreateDocModal.set(false);
    this.targetSpaceForNewDoc.set(null);
    this.newDocTitle.set('');
  }

  createSpecializedDoc(docType: DocType): void {
    const title = this.newDocTitle().trim();
    if (!title) {
      // El nombre es obligatorio: enfocar el campo para que el usuario lo ingrese.
      document.getElementById('new-doc-title-input')?.focus();
      return;
    }

    const space = this.targetSpaceForNewDoc();
    const targetPath = space
      ? space.path || space.name
      : this.notesService.activeSpace() && this.notesService.activeSpace() !== 'all'
      ? this.notesService.activeSpace()
      : 'Research';

    this.notesService.createNote(title, targetPath, docType).subscribe({
      next: () => {
        if (space) {
          this.expandedSpaces.update((prev) => {
            const next = new Set(prev);
            next.add(space._id);
            return next;
          });
        }
        this.closeCreateDocModal();
      },
    });
  }

  getNoteIcon(docType?: string): IconName {
    switch (docType) {
      case 'sheet':
        return 'sheet';
      case 'doc':
        return 'file-text';
      case 'canvas':
        return 'canvas';
      case 'slide':
        return 'presentation';
      default:
        return 'file-text';
    }
  }

  createNoteInActiveSpace(): void {
    this.openCreateDocModal();
  }

  createNoteInSpace(space: Space, event?: MouseEvent): void {
    this.openCreateDocModal(space, event);
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

  // ==========================================
  // ARRASTRAR Y SOLTAR (DRAG & DROP)
  // ==========================================

  onDragStartNote(note: Note, event: DragEvent): void {
    event.stopPropagation();
    this.draggedItem.set({
      type: 'note',
      id: note._id,
      name: note.title || 'Untitled',
    });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `note:${note._id}`);
    }
  }

  onDragStartSpace(space: Space, event: DragEvent): void {
    event.stopPropagation();
    this.draggedItem.set({
      type: 'space',
      id: space._id,
      name: space.name,
    });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `space:${space._id}`);
    }
  }

  onDragEnd(): void {
    this.draggedItem.set(null);
    this.dragOverSpaceId.set(null);
    this.isDragOverRoot.set(false);
  }

  onDragOverSpace(space: Space, event: DragEvent): void {
    const dragged = this.draggedItem();
    if (!dragged) return;

    // Si se arrastra una carpeta sobre sí misma o sus descendientes, ignorar
    if (dragged.type === 'space') {
      if (dragged.id === space._id || this.isDescendant(dragged.id, space._id)) {
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverSpaceId.set(space._id);
  }

  onDragLeaveSpace(space: Space, event: DragEvent): void {
    event.stopPropagation();
    if (this.dragOverSpaceId() === space._id) {
      this.dragOverSpaceId.set(null);
    }
  }

  onDropOnSpace(targetSpace: Space, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const dragged = this.draggedItem();
    this.dragOverSpaceId.set(null);
    this.draggedItem.set(null);

    if (!dragged) return;

    if (dragged.type === 'note') {
      const targetPath = targetSpace.path || targetSpace.name;
      this.notesService.moveNoteToSpace(dragged.id, targetPath).subscribe({
        next: () => {
          this.expandedSpaces.update((prev) => new Set(prev).add(targetSpace._id));
        },
      });
    } else if (dragged.type === 'space') {
      if (dragged.id === targetSpace._id) return;
      if (this.isDescendant(dragged.id, targetSpace._id)) {
        alert(
          this.i18n.currentLang() === 'es'
            ? 'No puedes mover una carpeta dentro de sí misma o de sus subcarpetas.'
            : 'Cannot move a folder into itself or its subfolders.',
        );
        return;
      }
      this.spacesService.moveSpace(dragged.id, targetSpace._id).subscribe({
        next: () => {
          this.expandedSpaces.update((prev) => new Set(prev).add(targetSpace._id));
        },
      });
    }
  }

  onDragOverRoot(event: DragEvent): void {
    const dragged = this.draggedItem();
    if (!dragged || dragged.type !== 'space') return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.isDragOverRoot.set(true);
  }

  onDragLeaveRoot(event: DragEvent): void {
    event.stopPropagation();
    this.isDragOverRoot.set(false);
  }

  onDropOnRoot(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const dragged = this.draggedItem();
    this.isDragOverRoot.set(false);
    this.draggedItem.set(null);

    if (!dragged || dragged.type !== 'space') return;

    this.spacesService.moveSpace(dragged.id, null).subscribe();
  }

  // ==========================================
  // MODAL / DIÁLOGO "MOVER A..."
  // ==========================================

  openMoveNoteModal(note: Note, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.movingTarget.set({
      type: 'note',
      id: note._id,
      name: note.title || 'Untitled',
      currentSpace: note.space,
    });
    this.selectedDestinationId.set(null);
    this.showMoveModal.set(true);
  }

  openMoveSpaceModal(space: Space, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.movingTarget.set({
      type: 'space',
      id: space._id,
      name: space.name,
      currentSpace: space.path || space.name,
    });
    this.selectedDestinationId.set(space.parentId ? space.parentId.toString() : null);
    this.showMoveModal.set(true);
  }

  closeMoveModal(): void {
    this.showMoveModal.set(false);
    this.movingTarget.set(null);
    this.selectedDestinationId.set(null);
  }

  confirmModalMove(): void {
    const target = this.movingTarget();
    if (!target) return;

    const destId = this.selectedDestinationId();

    if (target.type === 'note') {
      let targetPath = 'Research';
      if (destId) {
        const destSpace = this.spacesService.spacesList().find((s) => s._id === destId);
        if (destSpace) {
          targetPath = destSpace.path || destSpace.name;
        }
      }
      this.notesService.moveNoteToSpace(target.id, targetPath).subscribe({
        next: () => {
          if (destId) {
            this.expandedSpaces.update((prev) => new Set(prev).add(destId));
          }
          this.closeMoveModal();
        },
      });
    } else if (target.type === 'space') {
      if (destId === target.id) {
        alert(
          this.i18n.currentLang() === 'es'
            ? 'Una carpeta no puede ser su propio padre.'
            : 'A directory cannot be its own parent.',
        );
        return;
      }
      if (destId && this.isDescendant(target.id, destId)) {
        alert(
          this.i18n.currentLang() === 'es'
            ? 'No puedes mover una carpeta dentro de sí misma o de sus subcarpetas.'
            : 'Cannot move a folder into itself or its subfolders.',
        );
        return;
      }
      this.spacesService.moveSpace(target.id, destId).subscribe({
        next: () => {
          if (destId) {
            this.expandedSpaces.update((prev) => new Set(prev).add(destId));
          }
          this.closeMoveModal();
        },
      });
    }
  }

  /**
   * Determina si candidateId es igual a ancestorId o es uno de sus descendientes.
   */
  isDescendant(ancestorId: string, candidateId: string): boolean {
    if (ancestorId === candidateId) return true;
    const all = this.spacesService.spacesList();
    let curr = all.find((s) => s._id === candidateId);
    while (curr && curr.parentId) {
      const pid = curr.parentId.toString();
      if (pid === ancestorId) return true;
      curr = all.find((s) => s._id === pid);
    }
    return false;
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
