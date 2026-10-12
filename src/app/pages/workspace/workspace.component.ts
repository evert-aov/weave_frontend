import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../layout/topbar/topbar.component';
import { DocumentEditorComponent } from '../../editor/document-editor/document-editor.component';
import { NotesService } from '../../core/services/notes.service';
import { SpacesService } from '../../core/services/spaces.service';

/**
 * Vista principal del Espacio de Trabajo de Weave.
 * Integra la barra lateral colapsable, la barra de navegación superior y el editor dinámico.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    TopbarComponent,
    DocumentEditorComponent,
  ],
  template: `
    <div class="app-layout">
      <app-sidebar></app-sidebar>
      <main class="main-content">
        <app-topbar></app-topbar>
        <app-document-editor></app-document-editor>
      </main>
    </div>
  `,
  styles: [
    `
      .app-layout {
        display: flex;
        min-height: 100vh;
        width: 100%;
        background: var(--canvas);
        color: var(--text);
        overflow: hidden;
      }
      .main-content {
        flex: 1;
        min-width: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--bg);
        overflow: hidden;
      }
    `,
  ],
})
export class WorkspaceComponent implements OnInit {
  private readonly notesService = inject(NotesService);
  private readonly spacesService = inject(SpacesService);

  ngOnInit(): void {
    this.spacesService.loadSpaces().subscribe();
    this.notesService.loadNotes('Research').subscribe();
  }
}
