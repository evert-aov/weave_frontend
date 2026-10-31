import { Component, OnDestroy, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../layout/sidebar/sidebar.component';
import { DocumentEditorComponent } from '../../editor/document-editor/document-editor.component';
import { DocumentTabsComponent } from '../../layout/document-tabs/document-tabs.component';
import { AiAssistantSidebarComponent } from '../../layout/ai-assistant-sidebar/ai-assistant-sidebar.component';
import { NotesService } from '../../core/services/notes.service';
import { I18nService } from '../../core/services/i18n.service';
import { LazyLoadStateComponent } from '../../shared/components/lazy-load-state/lazy-load-state.component';
import { DocumentReferencesDirective } from '../../shared/directives/document-references.directive';
import { DocumentReferencePickerComponent } from '../../shared/components/document-reference-picker/document-reference-picker.component';
import { DocumentReferenceService } from '../../core/services/document-reference.service';
import { DocumentNavigationService } from '../../core/services/document-navigation.service';
import { isDocumentId } from '../../core/utils/document-link';
import { DialogService } from '../../core/services/dialog.service';
import { AppDialogComponent } from '../../shared/components/app-dialog/app-dialog.component';

/**
 * Vista principal del Espacio de Trabajo de Weave.
 * Integra la barra lateral colapsable, la barra de navegación superior,
 * la barra de pestañas simultáneas y el editor dinámico con el Asistente de IA.
 */
@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    DocumentTabsComponent,
    DocumentEditorComponent,
    AiAssistantSidebarComponent,
    LazyLoadStateComponent,
    DocumentReferencesDirective,
    DocumentReferencePickerComponent,
    AppDialogComponent,
  ],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent implements OnDestroy {
  readonly notesService = inject(NotesService);
  readonly i18n = inject(I18nService);
  readonly references = inject(DocumentReferenceService);
  readonly navigation = inject(DocumentNavigationService);
  readonly dialogs = inject(DialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    let displayedDocument = false;
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('document');
      if (isDocumentId(id) && this.notesService.currentNote()?._id !== id) this.navigation.open(id);
    });
    effect(() => {
      const id = this.notesService.currentNote()?._id ?? null;
      if (id) displayedDocument = true;
      if (this.notesService.isLoadingNote()) return;
      const requested = this.route.snapshot.queryParamMap.get('document');
      if (requested === id || (!id && requested && !displayedDocument)) return;
      void this.router.navigate([], { relativeTo: this.route, queryParams: { document: id }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  ngOnDestroy(): void { this.references.close(); this.dialogs.close(true); }
}
