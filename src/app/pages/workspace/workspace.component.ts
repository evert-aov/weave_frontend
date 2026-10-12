import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../layout/topbar/topbar.component';
import { DocumentEditorComponent } from '../../editor/document-editor/document-editor.component';
import { DocumentTabsComponent } from '../../layout/document-tabs/document-tabs.component';
import { NotesService } from '../../core/services/notes.service';
import { SpacesService } from '../../core/services/spaces.service';

/**
 * Vista principal del Espacio de Trabajo de Weave.
 * Integra la barra lateral colapsable, la barra de navegación superior,
 * la barra de pestañas simultáneas y el editor dinámico.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    TopbarComponent,
    DocumentTabsComponent,
    DocumentEditorComponent,
  ],
  templateUrl: './workspace.component.html',
})
export class WorkspaceComponent implements OnInit {
  private readonly notesService = inject(NotesService);
  private readonly spacesService = inject(SpacesService);

  ngOnInit(): void {
    this.spacesService.loadSpaces().subscribe();
    this.notesService.loadNotes().subscribe();
  }
}
