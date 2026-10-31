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
import { NoteSummary } from '../../core/models/note.model';
import { Space } from '../../core/models/space.model';
import { WorkspaceLayoutService } from '../../core/services/workspace-layout.service';
import { ResizePanelDirective } from '../../shared/directives/resize-panel.directive';
import { SidebarItemActionsComponent, SidebarItemAction } from './components/item-actions/item-actions.component';
import { buildSpaceTree } from './space-tree';
import { WorkspaceActionsService } from '../../core/services/workspace-actions.service';
import { DialogService } from '../../core/services/dialog.service';

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
  imports: [CommonModule, FormsModule, IconComponent, ResizePanelDirective, SidebarItemActionsComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  readonly notesService = inject(NotesService);
  readonly authService = inject(AuthService);
  readonly spacesService = inject(SpacesService);
  readonly i18n = inject(I18nService);
  readonly layout = inject(WorkspaceLayoutService);
  private readonly actions = inject(WorkspaceActionsService);
  private readonly dialogs = inject(DialogService);

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
  readonly rootSpaces = computed(() => buildSpaceTree(this.spacesService.spacesList()));

  readonly spaceActions = computed<SidebarItemAction[]>(() => [
    { id: 'create-note', icon: 'file', label: this.i18n.t('nav.new_document') },
    { id: 'create-folder', icon: 'folder', label: this.i18n.t('nav.create_subspace') },
    { id: 'rename', icon: 'pen', label: this.i18n.t('nav.rename') },
    { id: 'move', icon: 'folder-input', label: this.i18n.t('nav.move') },
    { id: 'delete', icon: 'trash', label: this.i18n.t('nav.delete_space'), destructive: true },
  ]);

  readonly noteActions = computed<SidebarItemAction[]>(() => [
    { id: 'move', icon: 'folder-input', label: this.i18n.t('nav.move') },
    { id: 'delete', icon: 'trash', label: this.i18n.currentLang() === 'es' ? 'Eliminar documento' : 'Delete document', destructive: true },
  ]);

  onNoteAction(note: NoteSummary, action: string): void {
    if (action === 'delete') this.actions.deleteDocument(note);
    else if (action === 'move') this.openMoveNoteModal(note);
  }

  onSpaceAction(space: Space, action: string): void {
    switch (action) {
      case 'create-note': this.createNoteInSpace(space); break;
      case 'create-folder': this.createSubdirectory(space); break;
      case 'rename': this.renameSpace(space); break;
      case 'move': this.openMoveSpaceModal(space); break;
      case 'delete': this.deleteSpace(space); break;
    }
  }

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
  getNotesForSpace(space: Space): NoteSummary[] {
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

  openNote(note: NoteSummary): void {
    this.notesService.loadNoteById(note._id).subscribe();
  }

  openCreateDocModal(space?: Space, event?: MouseEvent): void {
    event?.stopPropagation();
    this.actions.createDocument(space, () => {
      if (space) this.expandedSpaces.update((previous) => new Set(previous).add(space._id));
    });
  }

  getNoteIcon(docType?: string): IconName {
    switch (docType) {
      case 'latex':
        return 'sigma';
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

  createDirectory(): void {
    this.actions.createDirectory(null, (created) => {
      this.expandedSpaces.update((previous) => new Set(previous).add(created._id));
      this.selectSpace(created);
    });
  }

  createSubdirectory(parentSpace: Space, event?: MouseEvent): void {
    event?.stopPropagation();
    this.actions.createDirectory(parentSpace, (created) => {
      this.expandedSpaces.update((previous) => new Set(previous).add(parentSpace._id).add(created._id));
      this.selectSpace(created);
    });
  }

  renameSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.actions.renameDirectory(space, (updated) => {
      if (this.notesService.activeSpace() === (space.path || space.name)) this.notesService.activeSpace.set(updated.path || updated.name);
      this.notesService.loadNotes().subscribe();
    });
  }

  deleteSpace(space: Space, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.actions.deleteDirectory(space, () => this.showAllNotes());
  }

  // ==========================================
  // ARRASTRAR Y SOLTAR (DRAG & DROP)
  // ==========================================

  onDragStartNote(note: NoteSummary, event: DragEvent): void {
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
        this.dialogs.notice(this.i18n.t('nav.move'),
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

  openMoveNoteModal(note: NoteSummary, event?: MouseEvent): void {
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
        this.dialogs.notice(this.i18n.t('nav.move'),
          this.i18n.currentLang() === 'es'
            ? 'Una carpeta no puede ser su propio padre.'
            : 'A directory cannot be its own parent.',
        );
        return;
      }
      if (destId && this.isDescendant(target.id, destId)) {
        this.dialogs.notice(this.i18n.t('nav.move'),
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
