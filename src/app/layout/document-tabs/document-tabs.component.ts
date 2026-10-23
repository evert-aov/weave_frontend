import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { DocumentTab } from '../../core/models/tab.model';
import { DocType } from '../../core/models/note.model';

/**
 * Barra de Pestañas de Documentos en Simultáneo.
 * Permite abrir, cambiar, navegar y cerrar múltiples notas en pestañas al estilo navegador/IDE,
 * con soporte para documentos especializados puros (hojas de cálculo, word, canvas, bloques).
 */
@Component({
  selector: 'app-document-tabs',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './document-tabs.component.html',
  styleUrl: './document-tabs.component.scss',
})
export class DocumentTabsComponent {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);

  readonly showTypeMenu = signal<boolean>(false);
  readonly newTabTitle = signal<string>('');

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

  toggleTypeMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.showTypeMenu()) {
      this.newTabTitle.set('');
    }
    this.showTypeMenu.update((v) => !v);
  }

  createNewTabOfType(docType: DocType): void {
    const title = this.newTabTitle().trim();
    if (!title) {
      // El nombre es obligatorio: enfocar el campo para que el usuario lo ingrese.
      document.getElementById('new-tab-title-input')?.focus();
      return;
    }

    this.notesService.createNote(title, undefined, docType).subscribe({
      next: () => {
        this.newTabTitle.set('');
        this.showTypeMenu.set(false);
      },
    });
  }

  getTabIcon(docType?: DocType): IconName {
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
}
