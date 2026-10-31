import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DialogRequest } from '../models/dialog.model';
import { DocType, Note, NoteSummary } from '../models/note.model';
import { Space } from '../models/space.model';
import { DialogService } from './dialog.service';
import { I18nService } from './i18n.service';
import { NotesService } from './notes.service';
import { SpacesService } from './spaces.service';

/** Flujos compartidos de creación, nombres y eliminación. No duplica formularios en el shell. */
@Injectable({ providedIn: 'root' })
export class WorkspaceActionsService {
  private readonly dialogs = inject(DialogService);
  private readonly notes = inject(NotesService);
  private readonly spaces = inject(SpacesService);
  private readonly i18n = inject(I18nService);
  private text(es: string, en: string): string { return this.i18n.currentLang() === 'es' ? es : en; }

  createDocument(space?: Space, onCreated?: (note: Note) => void): void {
    const path = space ? (space.path || space.name) : (this.notes.activeSpace() === 'all' ? 'Research' : this.notes.activeSpace() || 'Research');
    this.dialogs.open(this.documentTypes(path, onCreated));
  }

  private documentTypes(path: string, onCreated?: (note: Note) => void): DialogRequest {
    return {
      kind: 'choice', title: this.text('Nuevo documento', 'New document'), icon: 'file',
      step: this.text('Paso 1 de 2 · Tipo', 'Step 1 of 2 · Type'),
      message: this.text('Elige el tipo de documento que quieres crear.', 'Choose the type of document to create.'),
      choices: [
        { value: 'block', icon: 'file-text', label: this.i18n.t('doc_type.block_title'), description: this.i18n.t('doc_type.block_desc') },
        { value: 'doc', icon: 'file-text', label: this.i18n.t('doc_type.doc_title'), description: this.i18n.t('doc_type.doc_desc') },
        { value: 'latex', icon: 'sigma', label: this.i18n.t('doc_type.latex_title'), description: this.i18n.t('doc_type.latex_desc') },
        { value: 'sheet', icon: 'sheet', label: this.i18n.t('doc_type.sheet_title'), description: this.i18n.t('doc_type.sheet_desc') },
        { value: 'canvas', icon: 'canvas', label: this.i18n.t('doc_type.canvas_title'), description: this.i18n.t('doc_type.canvas_desc') },
        { value: 'slide', icon: 'presentation', label: this.i18n.t('doc_type.slide_title'), description: this.i18n.t('doc_type.slide_desc') },
      ],
      onSubmit: (type) => this.documentName(type as DocType, path, onCreated),
    };
  }

  private documentName(type: DocType, path: string, onCreated?: (note: Note) => void): DialogRequest {
    return {
      kind: 'input', title: this.text('Nombre del documento', 'Document name'), icon: 'file-text',
      step: this.text('Paso 2 de 2 · Nombre', 'Step 2 of 2 · Name'),
      message: `${this.i18n.t(`doc_type.${type}_title`)} · ${path}`,
      label: this.text('Nombre', 'Name'), placeholder: this.text('Escribe un nombre…', 'Enter a name…'),
      requiredMessage: this.text('Escribe un nombre para el documento.', 'Enter a document name.'),
      submitLabel: this.text('Crear documento', 'Create document'),
      errorMessage: this.text('No se pudo crear el documento. Inténtalo de nuevo.', 'Could not create the document. Try again.'),
      back: () => this.documentTypes(path, onCreated),
      onSubmit: async (name) => { const note = await firstValueFrom(this.notes.createNote(name, path, type)); onCreated?.(note); },
    };
  }

  createDirectory(parent: Space | null = null, onCreated?: (space: Space) => void): void {
    this.dialogs.open({
      kind: 'input', title: this.text(parent ? 'Crear subdirectorio' : 'Crear directorio', parent ? 'Create subdirectory' : 'Create directory'), icon: 'folder',
      message: parent ? (parent.path || parent.name) : this.text('Directorio principal del espacio de trabajo.', 'Root directory in the workspace.'),
      label: this.text('Nombre del directorio', 'Directory name'), submitLabel: this.text('Crear directorio', 'Create directory'),
      requiredMessage: this.text('Escribe un nombre para el directorio.', 'Enter a directory name.'),
      validate: (name) => this.validateDirectoryName(name),
      errorMessage: this.text('No se pudo crear el directorio. Inténtalo de nuevo.', 'Could not create the directory. Try again.'),
      onSubmit: async (name) => {
        const created = await firstValueFrom(this.spaces.createSpace(name, parent?.color || 'indigo', parent?._id ?? null));
        onCreated?.(created);
      },
    });
  }

  renameDirectory(space: Space, onRenamed?: (space: Space) => void): void {
    this.dialogs.open({
      kind: 'input', title: this.text('Renombrar directorio', 'Rename directory'), icon: 'pen',
      message: space.path || space.name, initialValue: space.name, label: this.text('Nuevo nombre', 'New name'),
      submitLabel: this.text('Guardar nombre', 'Save name'),
      validate: (name) => this.validateDirectoryName(name),
      onSubmit: async (name) => {
        if (name === space.name) return;
        const updated = await firstValueFrom(this.spaces.updateSpace(space._id, name)); onRenamed?.(updated);
      },
    });
  }

  deleteDocument(note: NoteSummary): void {
    this.dialogs.open({
      kind: 'confirm', title: this.text('Eliminar documento', 'Delete document'), icon: 'trash', destructive: true,
      message: this.text(`¿Eliminar “${note.title}”? Esta acción no se puede deshacer.`, `Delete “${note.title}”? This action cannot be undone.`),
      submitLabel: this.text('Eliminar documento', 'Delete document'),
      errorMessage: this.text('No se pudo eliminar el documento. Inténtalo de nuevo.', 'Could not delete the document. Try again.'),
      onSubmit: async () => { await firstValueFrom(this.notes.deleteNote(note._id)); },
    });
  }

  deleteDirectory(space: Space, onDeleted?: () => void): void {
    this.dialogs.open({
      kind: 'confirm', title: this.text('Eliminar directorio', 'Delete directory'), icon: 'trash', destructive: true,
      message: this.text(`¿Eliminar “${space.name}” y sus subdirectorios? Esta acción no se puede deshacer.`, `Delete “${space.name}” and its subdirectories? This action cannot be undone.`),
      submitLabel: this.text('Eliminar directorio', 'Delete directory'),
      errorMessage: this.text('No se pudo eliminar el directorio. Inténtalo de nuevo.', 'Could not delete the directory. Try again.'),
      onSubmit: async () => { await firstValueFrom(this.spaces.deleteSpace(space._id)); onDeleted?.(); },
    });
  }

  private validateDirectoryName(name: string): string | null {
    return /[/\\]/.test(name) ? this.text('El nombre no puede contener / ni \\.', 'The name cannot contain / or \\.') : null;
  }
}
