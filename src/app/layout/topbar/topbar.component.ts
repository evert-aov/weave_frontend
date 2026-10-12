import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

/**
 * Barra superior de Weave.
 * Muestra información 100% funcional y conectada a la base de datos,
 * sin elementos estáticos o ficticios (sin avatares falsos de presencia).
 */
@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <header class="topbar">
      <!-- Migas de pan y control de barra lateral -->
      <div class="breadcrumbs">
        <button
          type="button"
          class="icon-btn"
          (click)="toggleSidebar()"
          title="Toggle sidebar"
        >
          <app-icon name="panel" [size]="17"></app-icon>
        </button>
        <span>{{ notesService.activeSpace() || 'Notes' }}</span>
        <b>/</b>
        <strong>{{ notesService.currentNote()?.title || 'Untitled' }}</strong>
      </div>

      <!-- Acciones de cabecera -->
      <div class="actions">
        <!-- Indicador de estado de guardado en tiempo real -->
        <span class="saved">
          @switch (notesService.saveStatus()) {
            @case ('saved') {
              <i class="dot-saved"></i>
              {{ i18n.t('topbar.saved') }}
            }
            @case ('saving') {
              <i class="dot-saving"></i>
              {{ i18n.t('topbar.saving') }}
            }
            @case ('unsaved') {
              <i class="dot-unsaved"></i>
              {{ i18n.t('topbar.unsaved') }}
            }
          }
        </span>

        <!-- Botón de selector de idioma i18n -->
        <button
          type="button"
          class="lang-btn"
          (click)="i18n.toggleLanguage()"
          [title]="i18n.t('lang.toggle')"
        >
          {{ i18n.currentLang().toUpperCase() }}
        </button>

        <!-- Botón de alternar tema claro / oscuro -->
        <button
          type="button"
          class="icon-btn"
          (click)="themeService.toggleTheme()"
          [title]="i18n.t('theme.toggle')"
        >
          <app-icon [name]="themeService.isDark() ? 'sun' : 'moon'" [size]="16"></app-icon>
        </button>

        <!-- Botón funcional para compartir o copiar enlace del documento -->
        <button
          type="button"
          class="share-btn"
          (click)="copyDocumentLink()"
          title="Copiar enlace del documento"
        >
          <app-icon name="share" [size]="14"></app-icon>
          {{ isCopiedLink() ? '¡Copiado!' : i18n.t('topbar.share') }}
        </button>

        <!-- Botón para eliminar nota activa en MongoDB -->
        <button
          type="button"
          class="icon-btn delete-note-btn"
          (click)="deleteCurrentNote()"
          title="Eliminar documento"
        >
          <app-icon name="trash" [size]="15"></app-icon>
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      .topbar {
        height: 58px;
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 22px;
        background: color-mix(in srgb, var(--bg) 92%, transparent);
        backdrop-filter: blur(8px);
      }
      .breadcrumbs,
      .actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .breadcrumbs span,
      .breadcrumbs b {
        color: var(--faint);
        font-size: 11px;
      }
      .breadcrumbs strong {
        font-size: 11px;
        font-weight: 600;
        color: var(--text);
        max-width: 280px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .icon-btn {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        border-radius: 7px;
        color: var(--muted);
      }
      .icon-btn:hover {
        background: var(--soft);
        color: var(--text);
      }
      .delete-note-btn:hover {
        color: #ef4444;
      }
      .actions {
        gap: 8px;
      }
      .saved {
        font-size: 10px;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 6px;
        margin-right: 6px;
      }
      .dot-saved {
        width: 6px;
        height: 6px;
        background: #28b787;
        border-radius: 50%;
      }
      .dot-saving {
        width: 6px;
        height: 6px;
        background: #f59e0b;
        border-radius: 50%;
        animation: pulse 1s infinite;
      }
      .dot-unsaved {
        width: 6px;
        height: 6px;
        background: #ef4444;
        border-radius: 50%;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .lang-btn {
        height: 28px;
        padding: 0 8px;
        border-radius: 5px;
        border: 1px solid var(--border);
        font-size: 10px;
        font-weight: 700;
        color: var(--muted);
        letter-spacing: 0.05em;
      }
      .lang-btn:hover {
        background: var(--soft);
        color: var(--accent);
      }
      .share-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 31px;
        padding: 0 12px;
        background: var(--accent);
        color: white;
        border-radius: 7px;
        font-size: 11px;
        font-weight: 600;
        box-shadow: 0 3px 10px rgba(91, 80, 230, 0.22);
      }
      .share-btn:hover {
        opacity: 0.95;
      }
    `,
  ],
})
export class TopbarComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly themeService = inject(ThemeService);

  readonly isCopiedLink = signal<boolean>(false);

  toggleSidebar(): void {
    this.notesService.isSidebarCollapsed.update((v) => !v);
  }

  copyDocumentLink(): void {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.isCopiedLink.set(true);
      setTimeout(() => this.isCopiedLink.set(false), 2000);
    });
  }

  deleteCurrentNote(): void {
    if (confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      this.notesService.deleteCurrentNote().subscribe();
    }
  }
}
