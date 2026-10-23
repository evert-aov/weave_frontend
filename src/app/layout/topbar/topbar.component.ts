import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { ThemeService } from '../../core/services/theme.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ExportModalComponent } from '../../export/components/export-modal/export-modal.component';

/**
 * Barra superior de Weave.
 * Muestra información 100% funcional y conectada a la base de datos.
 */
@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, IconComponent, ExportModalComponent],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly themeService = inject(ThemeService);
  readonly Math = Math;

  readonly isCopiedLink = signal<boolean>(false);
  readonly showExportModal = signal<boolean>(false);
  readonly isFullscreen = signal<boolean>(false);

  /** El lienzo (canvas) es un documento especializado que sí admite alternar edición/lectura. */
  readonly isCanvasDoc = computed<boolean>(
    () => this.notesService.currentNote()?.docType === 'canvas',
  );

  /** Muestra el botón de modo edición/lectura para documentos de bloques y el lienzo. */
  readonly showReadingToggle = computed<boolean>(
    () => !this.notesService.isSpecializedDoc() || this.isCanvasDoc(),
  );

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', () => {
        this.isFullscreen.set(!!document.fullscreenElement);
      });
    }
  }

  toggleSidebar(): void {
    this.notesService.isSidebarCollapsed.update((v) => !v);
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
