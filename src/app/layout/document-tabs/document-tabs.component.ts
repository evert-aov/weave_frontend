import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { DocumentTab } from '../../core/models/tab.model';

/**
 * Barra de Pestañas de Documentos en Simultáneo.
 * Permite abrir, cambiar, navegar y cerrar múltiples notas en pestañas al estilo navegador/IDE.
 */
@Component({
  selector: 'app-document-tabs',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './document-tabs.component.html',
  styleUrl: './document-tabs.component.scss',
})
export class DocumentTabsComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

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

  createNewTab(): void {
    const defaultTitle = this.i18n.currentLang() === 'es' ? 'Nueva pestaña' : 'New tab';
    this.notesService.createNote(defaultTitle).subscribe();
  }
}
