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
  template: `
    <aside class="sidebar" [class.collapsed]="notesService.isSidebarCollapsed()">
      <!-- Cabecera del espacio de trabajo -->
      <div class="workspace">
        <div class="brand-mark">W</div>
        @if (!notesService.isSidebarCollapsed()) {
          <div class="workspace-copy">
            <strong>{{ i18n.t('app.name') }}</strong>
            <span>{{ authService.currentUser()?.name || 'Workspace' }}</span>
          </div>
          <button
            type="button"
            class="plain"
            (click)="createNoteInActiveSpace()"
            [title]="i18n.t('topbar.new_note')"
          >
            <app-icon name="plus" [size]="14"></app-icon>
          </button>
        }
      </div>

      <!-- Barra de búsqueda funcional -->
      @if (!notesService.isSidebarCollapsed()) {
        <div class="search-box">
          <app-icon name="search" [size]="14"></app-icon>
          <input
            type="text"
            [(ngModel)]="searchQuery"
            [placeholder]="i18n.t('nav.search') + '...'"
            class="search-input"
          />
          @if (searchQuery) {
            <button type="button" class="clear-search" (click)="searchQuery = ''">×</button>
          }
        </div>
      }

      <!-- Navegación primaria: Todas las notas -->
      <nav class="nav-primary">
        <button
          type="button"
          [class.active]="!notesService.activeSpace() || notesService.activeSpace() === 'all'"
          (click)="showAllNotes()"
        >
          <app-icon name="file" [size]="15"></app-icon>
          @if (!notesService.isSidebarCollapsed()) {
            <span>{{ i18n.t('nav.all_documents') }}</span>
            <small class="count-badge">{{ totalNotesCount() }}</small>
          }
        </button>
      </nav>

      <!-- Sección de Espacios (Directorios reales en MongoDB) -->
      @if (!notesService.isSidebarCollapsed()) {
        <div class="sidebar-section">
          <div class="section-label">
            <span>{{ i18n.t('nav.spaces') }}</span>
            <button
              type="button"
              (click)="promptCreateSpace()"
              title="Crear nuevo directorio/espacio"
            >
              <app-icon name="plus" [size]="13"></app-icon>
            </button>
          </div>

          <!-- Listado de directorios / espacios de la base de datos -->
          <div class="spaces-list">
            @for (space of spacesService.spacesList(); track space._id) {
              <div class="space-item" [class.selected-space]="notesService.activeSpace() === space.name">
                <button
                  type="button"
                  class="tree-row"
                  (click)="selectSpace(space)"
                >
                  <span class="dot" [ngClass]="space.color || 'indigo'"></span>
                  <span
                    class="space-title"
                    (dblclick)="renameSpace(space, $event)"
                    [title]="i18n.currentLang() === 'es' ? 'Doble clic para renombrar' : 'Double click to rename'"
                  >{{ space.name }}</span>
                  <app-icon name="chevron" [size]="11"></app-icon>
                </button>

                <!-- Acciones del directorio: crear nota, renombrar o borrar espacio -->
                <div class="space-actions">
                  <button
                    type="button"
                    class="space-action-btn"
                    (click)="createNoteInSpace(space.name); $event.stopPropagation()"
                    [title]="i18n.currentLang() === 'es' ? 'Nueva nota en este espacio' : 'New note in space'"
                  >
                    <app-icon name="plus" [size]="11"></app-icon>
                  </button>
                  <button
                    type="button"
                    class="space-action-btn"
                    (click)="renameSpace(space, $event)"
                    [title]="i18n.currentLang() === 'es' ? 'Renombrar directorio' : 'Rename directory'"
                  >
                    <app-icon name="pen" [size]="11"></app-icon>
                  </button>
                  <button
                    type="button"
                    class="space-action-btn delete-space"
                    (click)="deleteSpace(space); $event.stopPropagation()"
                    [title]="i18n.currentLang() === 'es' ? 'Eliminar directorio' : 'Delete directory'"
                  >
                    <app-icon name="trash" [size]="11"></app-icon>
                  </button>
                </div>
              </div>

              <!-- Notas dentro del directorio activo -->
              @if (notesService.activeSpace() === space.name) {
                <div class="notes-tree">
                  @for (note of filteredNotes(); track note._id) {
                    <button
                      type="button"
                      class="tree-row child"
                      [class.selected]="notesService.currentNote()?._id === note._id"
                      (click)="openNote(note)"
                    >
                      <app-icon name="file" [size]="13"></app-icon>
                      <span class="note-tree-title">{{ note.title || 'Untitled' }}</span>
                    </button>
                  } @empty {
                    <div class="empty-space-hint">
                      <small>Sin notas en este espacio</small>
                    </div>
                  }
                </div>
              }
            } @empty {
              <div class="empty-space-hint">
                <small>No hay espacios creados</small>
              </div>
            }
          </div>
        </div>
      }

      <!-- Pie de la barra lateral con perfil real del usuario -->
      <div class="sidebar-bottom">
        <div class="user-card" (click)="$event.stopPropagation()">
          <div class="avatar">
            {{ userInitials() }}
          </div>
          @if (!notesService.isSidebarCollapsed()) {
            <div class="user-details">
              <strong>{{ authService.currentUser()?.name || 'User' }}</strong>
              <span>{{ authService.currentUser()?.email || '' }}</span>
            </div>
            <button
              type="button"
              (click)="toggleUserMenu($event)"
              [title]="i18n.currentLang() === 'es' ? 'Opciones de cuenta' : 'Account options'"
              class="user-more-btn"
              [class.active]="showUserMenu()"
            >
              <app-icon name="more" [size]="14"></app-icon>
            </button>
          }

          <!-- Menú flotante de usuario -->
          @if (showUserMenu()) {
            <div class="user-menu-popover" (click)="$event.stopPropagation()">
              <div class="user-menu-header">
                <span class="user-menu-name">{{ authService.currentUser()?.name || 'User' }}</span>
                <span class="user-menu-email">{{ authService.currentUser()?.email || '' }}</span>
              </div>
              <div class="user-menu-divider"></div>
              <button type="button" class="user-menu-item logout-item" (click)="logout()">
                <app-icon name="close" [size]="13"></app-icon>
                <span>{{ i18n.t('nav.logout') }}</span>
              </button>
            </div>
          }
        </div>
      </div>
    </aside>
  `,
  styles: [
    `
      .sidebar {
        width: 240px;
        flex: 0 0 240px;
        min-height: 100vh;
        border-right: 1px solid var(--border);
        background: var(--panel);
        padding: 14px 10px;
        display: flex;
        flex-direction: column;
        transition: width 0.25s ease, flex-basis 0.25s ease;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .sidebar.collapsed {
        width: 62px;
        flex-basis: 62px;
        align-items: center;
        padding: 14px 6px;
      }
      .workspace {
        display: flex;
        align-items: center;
        height: 40px;
        padding: 0 6px 10px;
        gap: 10px;
      }
      .brand-mark {
        width: 28px;
        height: 28px;
        flex: 0 0 28px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        color: white;
        font-weight: 700;
        font-family: serif;
        background: linear-gradient(145deg, #6458f1, #8c45e5);
        box-shadow: 0 4px 12px rgba(106, 91, 234, 0.22);
      }
      .workspace-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .workspace-copy strong {
        font-size: 13px;
        line-height: 15px;
      }
      .workspace-copy span {
        color: var(--muted);
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .plain {
        color: var(--muted);
        padding: 3px;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
        margin: 4px 0 10px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--muted);
      }
      .search-input {
        border: none;
        background: transparent;
        font-size: 11px;
        color: var(--text);
        width: 100%;
        outline: none;
      }
      .clear-search {
        font-size: 14px;
        color: var(--muted);
        padding: 0 2px;
      }
      .nav-primary {
        border-bottom: 1px solid var(--border);
        padding: 4px 0 10px;
        margin-bottom: 10px;
      }
      .nav-primary button {
        width: 100%;
        display: flex;
        height: 32px;
        padding: 0 9px;
        align-items: center;
        gap: 10px;
        border-radius: 6px;
        color: var(--muted);
        font-size: 12px;
        text-align: left;
        white-space: nowrap;
      }
      .nav-primary button:hover {
        background: var(--soft);
        color: var(--text);
      }
      .nav-primary button.active {
        color: var(--text);
        background: var(--soft);
        font-weight: 600;
      }
      .count-badge {
        font-size: 9.5px;
        color: var(--faint);
        margin-left: auto;
      }
      .sidebar-section {
        flex: 1;
      }
      .section-label {
        padding: 2px 8px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-transform: uppercase;
        color: var(--faint);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .section-label button {
        color: var(--muted);
      }
      .spaces-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .space-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-radius: 6px;
      }
      .space-item:hover {
        background: var(--soft);
      }
      .space-item.selected-space {
        background: color-mix(in srgb, var(--soft) 70%, var(--accent-soft));
      }
      .tree-row {
        flex: 1;
        min-width: 0;
        height: 30px;
        padding: 0 8px;
        display: flex;
        gap: 8px;
        align-items: center;
        color: var(--muted);
        font-size: 12px;
        text-align: left;
        white-space: nowrap;
      }
      .tree-row.selected {
        background: var(--soft);
        color: var(--text);
        font-weight: 600;
      }
      .space-title {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .space-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        padding-right: 4px;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .space-item:hover .space-actions {
        opacity: 1;
      }
      .space-action-btn {
        width: 18px;
        height: 18px;
        display: grid;
        place-items: center;
        border-radius: 4px;
        color: var(--faint);
      }
      .space-action-btn:hover {
        color: var(--text);
        background: var(--bg);
      }
      .delete-space:hover {
        color: #ef4444;
      }
      .notes-tree {
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-bottom: 4px;
      }
      .tree-row.child {
        padding-left: 24px;
        height: 28px;
        font-size: 11px;
      }
      .note-tree-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .empty-space-hint {
        padding: 4px 0 4px 24px;
        color: var(--faint);
        font-size: 10px;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 3px;
        flex: 0 0 7px;
      }
      .dot.indigo { background: #635bde; }
      .dot.violet { background: #9a5be6; }
      .dot.teal { background: #26a8a1; }
      .dot.amber { background: #f59e0b; }
      .dot.rose { background: #f43f5e; }
      .sidebar-bottom {
        margin-top: auto;
        border-top: 1px solid var(--border);
        padding-top: 10px;
        width: 100%;
      }
      .user-card {
        position: relative;
        padding: 4px 4px 2px;
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #d8d4ff;
        color: #4338ca;
        display: grid;
        place-items: center;
        font-size: 10px;
        font-weight: 700;
        flex: 0 0 28px;
      }
      .user-details {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .user-details strong {
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-details span {
        font-size: 8.5px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-more-btn {
        color: var(--muted);
        padding: 4px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .user-more-btn:hover,
      .user-more-btn.active {
        color: var(--text);
        background: var(--soft);
      }
      .user-menu-popover {
        position: absolute;
        bottom: 38px;
        right: 0;
        width: 200px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        padding: 8px;
        z-index: 100;
      }
      .user-menu-header {
        display: flex;
        flex-direction: column;
        padding: 2px 4px 6px;
      }
      .user-menu-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
      }
      .user-menu-email {
        font-size: 9px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-menu-divider {
        height: 1px;
        background: var(--border);
        margin: 4px 0 6px;
      }
      .user-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        border-radius: 5px;
        font-size: 11px;
        color: var(--muted);
        background: transparent;
        cursor: pointer;
        transition: all 0.12s ease;
      }
      .user-menu-item:hover {
        background: var(--soft);
        color: var(--text);
      }
      .user-menu-item.logout-item:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.08);
      }
    `,
  ],
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
