import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { DocumentTab } from '../../core/models/tab.model';
import { DocType } from '../../core/models/note.model';
import { WorkspaceActionsService } from '../../core/services/workspace-actions.service';
import { AiService } from '../../core/services/ai.service';
import { ThemeService } from '../../core/services/theme.service';
import { ExportModalComponent } from '../../export/components/export-modal/export-modal.component';
import { LazyLoadStateComponent } from '../../shared/components/lazy-load-state/lazy-load-state.component';
import { documentHref } from '../../core/utils/document-link';

/**
 * Barra de Pestañas y Cabecera Principal de Weave.
 * Integra las pestañas simultáneas y las acciones globales en recuadros:
 * [ Save ] [ IA ] [ Export ] [ Settings ] [ Delete ].
 */
@Component({
  selector: 'app-document-tabs',
  standalone: true,
  imports: [CommonModule, IconComponent, ExportModalComponent, LazyLoadStateComponent],
  templateUrl: './document-tabs.component.html',
  styleUrl: './document-tabs.component.scss',
})
export class DocumentTabsComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly aiService = inject(AiService);
  readonly themeService = inject(ThemeService);
  private readonly actions = inject(WorkspaceActionsService);

  readonly showExportModal = signal<boolean>(false);
  readonly showSettingsMenu = signal<boolean>(false);
  readonly isCopiedLink = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  /** Muestra la opción de lectura/edición para documentos de bloques y el lienzo */
  readonly showReadingToggle = computed<boolean>(
    () => !this.notesService.isSpecializedDoc() || this.notesService.currentNote()?.docType === 'canvas',
  );

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', () => {
        this.isFullscreen.set(!!document.fullscreenElement);
      });
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.header-settings-container')) {
      this.showSettingsMenu.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveCurrentNote();
    }
  }

  onTabClick(tab: DocumentTab): void {
    this.notesService.switchTab(tab.noteId);
  }

  onTabClose(tab: DocumentTab, event: MouseEvent): void {
    event.stopPropagation();
    this.notesService.closeTab(tab.noteId, event);
  }

  onAuxClick(tab: DocumentTab, event: MouseEvent): void {
    // Clic con la rueda central del ratón cierra la pestaña
    if (event.button === 1) {
      event.preventDefault();
      this.notesService.closeTab(tab.noteId, event);
    }
  }

  createNewDocument(event: MouseEvent): void {
    event.stopPropagation();
    this.actions.createDocument();
  }

  saveCurrentNote(): void {
    this.notesService.saveCurrentNote();
  }

  toggleAi(): void {
    this.aiService.toggleSidebar();
  }

  openExport(): void {
    if (this.notesService.currentNote()) {
      this.showExportModal.set(true);
    }
  }

  toggleSettings(): void {
    this.showSettingsMenu.update((v) => !v);
  }

  deleteCurrentNote(): void {
    const note = this.notesService.currentNote();
    if (note) {
      this.actions.deleteDocument(note);
    }
  }

  copyDocumentLink(): void {
    const id = this.notesService.currentNote()?._id;
    if (!id || typeof window === 'undefined') return;
    const url = new URL(documentHref(id), window.location.origin).href;
    navigator.clipboard.writeText(url).then(() => {
      this.isCopiedLink.set(true);
      setTimeout(() => this.isCopiedLink.set(false), 2000);
    });
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  getTabIcon(docType?: DocType): IconName {
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
}
