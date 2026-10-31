import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, tap, catchError, of, Subject, debounceTime, groupBy, mergeMap, concatMap, map, EMPTY, takeUntil, defer, finalize, throwError } from 'rxjs';
import { Note, NoteSummary, DocType } from '../models/note.model';
import { Block, BlockType } from '../models/block.model';
import { DocumentTab } from '../models/tab.model';
import { DocumentHistoryService } from './document-history.service';

import { environment } from '../../../environments/environment';

/**
 * Servicio de Gestión de Notas y Bloques.
 * Administra el documento activo, la lista de notas, pestañas abiertas en simultáneo,
 * el autoguardado y la sincronización con el backend.
 */
@Injectable({
  providedIn: 'root',
})
export class NotesService {
  private readonly documentHistory = inject(DocumentHistoryService);
  private readonly http = inject(HttpClient);
  private readonly serverBaseUrl = environment.serverBaseUrl;
  private readonly apiUrl = `${environment.apiUrl}/notes`;
  private readonly assetsUrl = `${environment.apiUrl}/assets`;

  readonly notesList = signal<NoteSummary[]>([]);
  readonly currentNote = signal<Note | null>(null);
  readonly isLoadingNote = signal(false);
  readonly isLoadingList = signal(false);
  readonly noteLoadFailed = signal(false);
  private readonly loadedNotes = new Map<string, Note>();
  private noteLoadVersion = 0;
  private listLoadVersion = 0;
  readonly activeSpace = signal<string>('Research');
  readonly saveStatus = signal<'saved' | 'saving' | 'unsaved'>('saved');
  readonly isSidebarCollapsed = signal<boolean>(false);
  readonly isReadingMode = signal<boolean>(true);
  readonly documentZoom = signal<number>(1.0);

  /** Determina si el documento actual es un editor especializado (Word, Excel, Slide, Canvas) */
  readonly isSpecializedDoc = computed<boolean>(() => {
    const docType = this.currentNote()?.docType;
    return !!docType && ['doc', 'sheet', 'slide', 'canvas'].includes(docType);
  });

  // Gestión de pestañas simultáneas (Multi-tab)
  readonly openTabs = signal<DocumentTab[]>([]);

  readonly hasPreviousTab = computed<boolean>(() => {
    const currentId = this.currentNote()?._id;
    if (!currentId) return false;
    const tabs = this.openTabs();
    const idx = tabs.findIndex((t) => t.noteId === currentId);
    return idx > 0;
  });

  readonly hasNextTab = computed<boolean>(() => {
    const currentId = this.currentNote()?._id;
    if (!currentId) return false;
    const tabs = this.openTabs();
    const idx = tabs.findIndex((t) => t.noteId === currentId);
    return idx >= 0 && idx < tabs.length - 1;
  });

  /**
   * Alterna entre el modo edición y el modo lectura inmersivo.
   */
  toggleReadingMode(): void {
    this.isReadingMode.update((v) => !v);
  }

  zoomIn(): void {
    const next = Math.min(Math.round((this.documentZoom() + 0.1) * 10) / 10, 2.0);
    this.documentZoom.set(next);
  }

  zoomOut(): void {
    const next = Math.max(Math.round((this.documentZoom() - 0.1) * 10) / 10, 0.5);
    this.documentZoom.set(next);
  }

  resetZoom(): void {
    this.documentZoom.set(1.0);
  }

  private readonly autoSaveSubject = new Subject<{ note: Note; session: number }>();
  private readonly stopAutoSave = new Subject<void>();
  private saveSession = 0;
  private readonly savedPayloads = new Map<string, string>();
  private readonly pendingSaveIds = new Set<string>();

  constructor() {
    // Cada documento tiene su debounce y sus escrituras se completan en orden.
    this.autoSaveSubject
      .pipe(
        groupBy((job) => `${job.session}:${job.note._id}`, { duration: () => this.stopAutoSave }),
        mergeMap((jobs) =>
          jobs.pipe(
            debounceTime(800),
            concatMap(({ note, session }) => {
              if (session !== this.saveSession || !this.loadedNotes.has(note._id)) return EMPTY;
              this.saveStatus.set('saving');
              return this.http
                .put<Note>(`${this.apiUrl}/${note._id}`, {
                  title: note.title,
                  lead: note.lead,
                  space: note.space,
                  docType: note.docType,
                  docUrl: note.docUrl,
                  docData: note.docData,
                  tags: note.tags,
                  blocks: note.blocks,
                })
                .pipe(
                  takeUntil(this.stopAutoSave),
                  tap((updated) => {
                    this.savedPayloads.set(updated._id, this.getNotePayload(updated));
                    // Una respuesta anterior no sustituye una edición local más reciente.
                    if (this.loadedNotes.get(note._id) === note) {
                      this.loadedNotes.set(updated._id, updated);
                      this.pendingSaveIds.delete(updated._id);
                      if (this.currentNote()?._id === updated._id) this.currentNote.set(updated);
                      this.notesList.update((list) =>
                        list.map((n) => (n._id === updated._id ? this.summarize(updated) : n)),
                      );
                    }
                    this.saveStatus.set(this.pendingSaveIds.size ? 'unsaved' : 'saved');
                  }),
                  catchError((err) => {
                    console.error('Error during auto-save:', err);
                    this.saveStatus.set('unsaved');
                    return of(null);
                  }),
                );
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * Limpia el estado reactivo en memoria al cambiar de usuario o cerrar sesión.
   */
  clearState(): void {
    this.documentHistory.clear();
    this.saveSession++;
    this.stopAutoSave.next();
    this.noteLoadVersion++;
    this.listLoadVersion++;
    this.loadedNotes.clear();
    this.isLoadingNote.set(false);
    this.isLoadingList.set(false);
    this.noteLoadFailed.set(false);
    this.notesList.set([]);
    this.currentNote.set(null);
    this.openTabs.set([]);
    this.activeSpace.set('Research');
    this.savedPayloads.clear();
    this.pendingSaveIds.clear();
    this.saveStatus.set('saved');
    this.isReadingMode.set(true);
  }

  /**
   * Abre o enfoca una pestaña con la nota indicada.
   */
  openTab(note: Note): void {
    const tabs = this.openTabs();
    const existing = tabs.find((t) => t.noteId === note._id);
    if (!existing) {
      this.openTabs.update((prev) => [
        ...prev,
        {
          noteId: note._id,
          title: note.title || 'Untitled',
          space: note.space,
          docType: note.docType || 'block',
        },
      ]);
    } else if (existing.title !== note.title || existing.docType !== note.docType) {
      this.openTabs.update((prev) =>
        prev.map((t) =>
          t.noteId === note._id
            ? { ...t, title: note.title || 'Untitled', docType: note.docType || 'block' }
            : t,
        ),
      );
    }
  }

  /**
   * Cierra una pestaña abierta. Si es la pestaña activa, cambia automáticamente
   * a la pestaña vecina más próxima.
   */
  closeTab(noteId: string, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    const currentTabs = this.openTabs();
    const index = currentTabs.findIndex((t) => t.noteId === noteId);
    if (index === -1) return;

    const updatedTabs = currentTabs.filter((t) => t.noteId !== noteId);
    this.openTabs.set(updatedTabs);

    if (this.currentNote()?._id === noteId) {
      if (updatedTabs.length > 0) {
        const nextIndex = Math.min(index, updatedTabs.length - 1);
        const nextTab = updatedTabs[nextIndex];
        this.loadNoteById(nextTab.noteId).subscribe();
      } else {
        this.currentNote.set(null);
      }
    }
  }

  /**
   * Cambia a una pestaña específica.
   */
  switchTab(noteId: string): void {
    if (this.currentNote()?._id === noteId) return;
    this.loadNoteById(noteId).subscribe();
  }

  /**
   * Navega a la pestaña anterior en el orden de pestañas.
   */
  goToPreviousTab(): void {
    const currentId = this.currentNote()?._id;
    if (!currentId) return;
    const tabs = this.openTabs();
    const idx = tabs.findIndex((t) => t.noteId === currentId);
    if (idx > 0) {
      this.loadNoteById(tabs[idx - 1].noteId).subscribe();
    }
  }

  /**
   * Navega a la siguiente pestaña en el orden de pestañas.
   */
  goToNextTab(): void {
    const currentId = this.currentNote()?._id;
    if (!currentId) return;
    const tabs = this.openTabs();
    const idx = tabs.findIndex((t) => t.noteId === currentId);
    if (idx >= 0 && idx < tabs.length - 1) {
      this.loadNoteById(tabs[idx + 1].noteId).subscribe();
    }
  }

  /**
   * Carga la lista de notas de un espacio.
   */
  loadNotes(space?: string): Observable<NoteSummary[]> {
    const targetSpace = space !== undefined ? space : this.activeSpace();
    const queryParam =
      targetSpace && targetSpace !== 'all'
        ? `&space=${encodeURIComponent(targetSpace)}`
        : '';

    return defer(() => {
      const version = ++this.listLoadVersion;
      this.isLoadingList.set(true);
      this.noteLoadFailed.set(false);
      return this.http.get<NoteSummary[]>(`${this.apiUrl}?view=summary${queryParam}`).pipe(
        tap((notes) => {
          if (version !== this.listLoadVersion) return;
          this.notesList.set(notes);
        }),
        finalize(() => {
          if (version === this.listLoadVersion) this.isLoadingList.set(false);
        }),
        catchError(error => {
          if (version === this.listLoadVersion) this.noteLoadFailed.set(true);
          return throwError(() => error);
        }),
      );
    });
  }

  /**
   * Selecciona o carga una nota por su ID.
   */
  loadNoteById(id: string, historyIndex?: number): Observable<Note> {
    return defer(() => {
      const version = ++this.noteLoadVersion;
      this.isLoadingNote.set(true);
      this.noteLoadFailed.set(false);
      return this.http.get<Note>(`${this.apiUrl}/${id}`).pipe(
        // La API puede seguir devolviendo la versión anterior mientras hay un guardado pendiente.
        map((note) => this.pendingSaveIds.has(id) ? (this.loadedNotes.get(id) ?? note) : note),
        tap((note) => {
          if (version !== this.noteLoadVersion) return;
          this.documentHistory.record(note._id, historyIndex);
          this.loadedNotes.set(note._id, note);
          this.currentNote.set(note);
          if (!this.pendingSaveIds.has(id)) this.savedPayloads.set(id, this.getNotePayload(note));
          this.saveStatus.set(this.pendingSaveIds.size ? 'unsaved' : 'saved');
          this.isReadingMode.set(true);
          this.openTab(note);
        }),
        catchError(error => {
          if (version === this.noteLoadVersion) this.noteLoadFailed.set(true);
          return throwError(() => error);
        }),
        finalize(() => {
          if (version === this.noteLoadVersion) this.isLoadingNote.set(false);
        }),
      );
    });
  }

  /**
   * Crea una nueva nota en el espacio activo del tipo especificado (bloque, hoja, doc, lienzo).
   */
  createNote(title?: string, space?: string, docType: DocType = 'block'): Observable<Note> {
    const s = space || this.activeSpace();
    const defaultTitles: Record<DocType, string> = {
      block: 'Untitled note',
      sheet: 'Nueva Hoja de Cálculo',
      doc: 'Nuevo Documento',
      canvas: 'Nueva Pizarra Excalidraw',
      slide: 'Nueva Presentación PowerPoint',
      latex: 'Nuevo documento LaTeX',
    };
    const t = title || defaultTitles[docType] || 'Untitled note';

    const initialBlocks: Block[] =
      docType === 'block'
        ? [
            {
              id: `b-${Date.now()}-1`,
              type: 'text',
              order: 0,
              content: { format: 'richtext', html: '<p></p>' },
              metadata: {},
            },
          ]
        : [];

    return this.http
      .post<Note>(this.apiUrl, {
        title: t,
        space: s,
        docType,
        docData: null,
        lead: '',
        tags: [],
        blocks: initialBlocks,
      })
      .pipe(
        tap((created) => {
          this.documentHistory.record(created._id);
          this.loadedNotes.set(created._id, created);
          this.notesList.update((list) => [this.summarize(created), ...list]);
          this.currentNote.set(created);
          this.savedPayloads.set(created._id, this.getNotePayload(created));
          this.saveStatus.set(this.pendingSaveIds.size ? 'unsaved' : 'saved');
          this.openTab(created);
        }),
      );
  }

  /**
   * Actualiza los datos especializados del documento (Univer Sheet, Univer Doc o Lienzo) y dispara el autoguardado.
   * Si se especifica targetNoteId, asegura que sólo se modifique si la nota activa coincide con la nota emisora,
   * evitando que eventos asíncronos o retrasados de una pestaña sobrescriban otra pestaña abierta.
   */
  updateDocData(docData: any, targetNoteId?: string): void {
    const note = this.currentNote();
    if (targetNoteId && note?._id !== targetNoteId) {
      // Actualizar la nota en la lista general en segundo plano si existe
      const cached = this.loadedNotes.get(targetNoteId);
      if (cached) {
        const summary = this.notesList().find(item => item._id === targetNoteId);
        const updatedTarget: Note = { ...cached, space: summary?.space ?? cached.space, docData };
        this.triggerAutoSave(updatedTarget);
      }
      return;
    }
    if (!note) return;

    const updatedNote: Note = {
      ...note,
      docData,
    };
    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Fuerza el guardado manual e inmediato de la nota actual en la base de datos sin esperar el debounce.
   */
  saveCurrentNote(): void {
    const note = this.currentNote();
    if (!note) return;
    this.saveStatus.set('saving');
    this.http
      .put<Note>(`${this.apiUrl}/${note._id}`, {
        title: note.title,
        lead: note.lead,
        space: note.space,
        tags: note.tags,
        docType: note.docType,
        docData: note.docData,
        blocks: note.blocks,
      })
      .pipe(
        takeUntil(this.stopAutoSave),
        tap((updated) => {
          this.savedPayloads.set(updated._id, this.getNotePayload(updated));
          this.loadedNotes.set(updated._id, updated);
          this.pendingSaveIds.delete(updated._id);
          if (this.currentNote()?._id === updated._id) this.currentNote.set(updated);
          this.notesList.update((list) =>
            list.map((n) => (n._id === updated._id ? this.summarize(updated) : n)),
          );
          this.saveStatus.set('saved');
        }),
        catchError((err) => {
          console.error('Error during manual save:', err);
          this.saveStatus.set('unsaved');
          return of(null);
        }),
      )
      .subscribe();
  }

  /**
   * Actualiza el título o encabezado de la nota activa si existen cambios reales.
   */
  updateMeta(updates: { title?: string; lead?: string; tags?: string[] }): void {
    const note = this.currentNote();
    if (!note) return;

    let hasChanged = false;
    if (updates.title !== undefined && updates.title !== note.title) {
      hasChanged = true;
      this.openTabs.update((tabs) =>
        tabs.map((t) => (t.noteId === note._id ? { ...t, title: updates.title! } : t)),
      );
    }
    if (updates.lead !== undefined && updates.lead !== note.lead) hasChanged = true;
    if (updates.tags !== undefined && JSON.stringify(updates.tags) !== JSON.stringify(note.tags)) hasChanged = true;

    if (!hasChanged) return;

    const updatedNote: Note = {
      ...note,
      ...updates,
    };
    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Añade un bloque en una posición determinada.
   */
  addBlock(type: BlockType, afterIndex?: number): void {
    const note = this.currentNote();
    if (!note) return;

    const newBlock: Block = {
      id: `b-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      order: 0,
      content: this.getDefaultContentForType(type),
      metadata: {},
    };

    const currentBlocks = [...note.blocks];
    const insertAt =
      afterIndex !== undefined && afterIndex >= 0
        ? afterIndex + 1
        : currentBlocks.length;

    currentBlocks.splice(insertAt, 0, newBlock);

    // Normalizar órdenes
    currentBlocks.forEach((b, idx) => (b.order = idx));

    const updatedNote: Note = {
      ...note,
      blocks: currentBlocks,
    };

    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Actualiza el contenido de un bloque si existen cambios reales y activa el guardado.
   */
  updateBlockContent(blockId: string, contentUpdate: Record<string, any>, targetNoteId?: string): void {
    const current = this.currentNote();
    const note = targetNoteId && current?._id !== targetNoteId ? this.loadedNotes.get(targetNoteId) : current;
    if (!note) return;

    const currentBlock = note.blocks.find((b) => b.id === blockId);
    if (!currentBlock) return;

    // Verificar si el contenido realmente cambió
    let hasChanged = false;
    for (const key of Object.keys(contentUpdate)) {
      const oldVal = currentBlock.content?.[key];
      const newVal = contentUpdate[key];
      if (typeof newVal === 'object' && newVal !== null) {
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          hasChanged = true;
          break;
        }
      } else if (oldVal !== newVal) {
        hasChanged = true;
        break;
      }
    }

    if (!hasChanged) {
      return; // Sin cambios reales: no disparar guardado automático innecesario
    }

    const updatedBlocks = note.blocks.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          content: { ...b.content, ...contentUpdate },
        };
      }
      return b;
    });

    const updatedNote: Note = {
      ...note,
      blocks: updatedBlocks,
    };

    if (this.currentNote()?._id === note._id) this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Elimina un bloque por ID.
   */
  removeBlock(blockId: string): void {
    const note = this.currentNote();
    if (!note) return;

    const updatedBlocks = note.blocks
      .filter((b) => b.id !== blockId)
      .map((b, idx) => ({ ...b, order: idx }));

    const updatedNote: Note = {
      ...note,
      blocks: updatedBlocks,
    };

    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Mueve un bloque arriba o abajo en la jerarquía.
   */
  moveBlock(blockId: string, direction: 'up' | 'down'): void {
    const note = this.currentNote();
    if (!note) return;

    const index = note.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= note.blocks.length) return;

    const blocks = [...note.blocks];
    const temp = blocks[index];
    blocks[index] = blocks[targetIndex];
    blocks[targetIndex] = temp;

    blocks.forEach((b, idx) => (b.order = idx));

    const updatedNote: Note = {
      ...note,
      blocks,
    };

    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Mueve un bloque de un índice a otro en la lista de bloques (arrastrar y soltar).
   */
  moveBlockTo(fromIndex: number, toIndex: number): void {
    const note = this.currentNote();
    if (!note) return;
    if (fromIndex < 0 || fromIndex >= note.blocks.length) return;
    if (toIndex < 0 || toIndex >= note.blocks.length) return;
    if (fromIndex === toIndex) return;

    const blocks = [...note.blocks];
    const [movedBlock] = blocks.splice(fromIndex, 1);
    blocks.splice(toIndex, 0, movedBlock);

    blocks.forEach((b, idx) => (b.order = idx));

    const updatedNote: Note = {
      ...note,
      blocks,
    };

    this.currentNote.set(updatedNote);
    this.triggerAutoSave(updatedNote);
  }

  /**
   * Elimina la nota completa.
   */
  deleteCurrentNote(): Observable<any> {
    const note = this.currentNote();
    if (!note) return of(null);
    return this.deleteNote(note._id);
  }

  /** El ID queda fijado al abrir la confirmación, aunque después cambie el archivo activo. */
  deleteNote(noteIdToDelete: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${noteIdToDelete}`).pipe(
      tap(() => {
        this.loadedNotes.delete(noteIdToDelete);
        this.documentHistory.remove(noteIdToDelete);
        this.savedPayloads.delete(noteIdToDelete);
        this.pendingSaveIds.delete(noteIdToDelete);
        this.closeTab(noteIdToDelete);
        if (this.currentNote()?._id === noteIdToDelete) this.currentNote.set(null);
        const remaining = this.notesList().filter((n) => n._id !== noteIdToDelete);
        this.notesList.set(remaining);
      }),
    );
  }

  /**
   * Mueve una nota a un directorio o espacio destino.
   */
  moveNoteToSpace(noteId: string, targetSpace: string): Observable<Note> {
    return this.http
      .put<Note>(`${this.apiUrl}/${noteId}`, { space: targetSpace })
      .pipe(
        tap((updated) => {
          this.loadedNotes.set(updated._id, updated);
          this.notesList.update((list) =>
            list.map((n) => (n._id === noteId ? { ...n, space: targetSpace } : n)),
          );
          if (this.currentNote()?._id === noteId) {
            this.currentNote.update((curr) => (curr ? { ...curr, space: targetSpace } : null));
          }
        }),
      );
  }

  /**
   * Sube una imagen al servidor de activos.
   */
  uploadImage(file: File): Observable<{ url: string; originalName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string; originalName: string }>(
      `${this.assetsUrl}/upload`,
      formData,
    );
  }

  /**
   * Sube una imagen codificada en base64 / Data URL al servidor, guardándola
   * físicamente en disco y retornando la URL física persistente.
   */
  uploadBase64Image(dataUrl: string, filename?: string): Observable<{ url: string; filename: string }> {
    return this.http.post<{ url: string; filename: string }>(
      `${this.assetsUrl}/upload-base64`,
      { dataUrl, filename },
    );
  }

  /**
   * Carga el contenido binario de un documento especializado desde su URL de
   * referencia física (por ejemplo, el archivo .pptx guardado en disco en 'docUrl').
   */
  loadDocFile(url: string): Observable<ArrayBuffer> {
    const fullUrl = /^https?:\/\//i.test(url)
      ? url
      : this.serverBaseUrl
      ? `${this.serverBaseUrl}${url}`
      : url;
    return this.http.get(fullUrl, { responseType: 'arraybuffer' });
  }

  /**
   * Sube un archivo o documento (PDF, Word, Excel, PPTX, etc.) al servidor de activos.
   */
  uploadAsset(file: File): Observable<{ url: string; originalName: string; mimeType: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string; originalName: string; mimeType: string; size: number }>(
      `${this.assetsUrl}/upload`,
      formData,
    );
  }

  /**
   * Contenido inicial según el tipo de bloque.
   */
  private getDefaultContentForType(type: BlockType): Record<string, any> {
    switch (type) {
      case 'text':
        return { format: 'richtext', html: '<p></p>' };
      case 'code':
        return {
          language: 'python',
          code: 'def attention(query, key, value):\n    scores = query @ key.transpose(-2, -1)\n    weights = scores.softmax(dim=-1)\n    return weights @ value',
        };
      case 'latex':
        return { formula: '' };
      case 'sheet':
        return {
          cells: [
            ['Layer', 'Heads', 'Dimension', 'Score'],
            ['Baseline', '8', '512', '0.842'],
            ['Optimized', '12', '768', '0.917'],
            ['Sparse', '16', '1024', '0.901'],
          ],
        };
      case 'canvas':
        return { snapshot: null };
      case 'mermaid':
        return {
          chart: 'graph TD\n    A[Input tokens] --> B[Transformer Encoder]\n    B --> C[Attention Context]\n    C --> D[Output Projection]',
        };
      case 'image':
        return {
          url: '',
          caption: '',
        };
      case 'file':
        return {
          url: '',
          name: '',
          size: 0,
          mimeType: '',
          extension: '',
        };
    }
  }

  private getNotePayload(note: Note): string {
    return JSON.stringify({
      title: note.title,
      lead: note.lead,
      space: note.space,
      docType: note.docType,
      docData: note.docData,
      tags: note.tags,
      blocks: note.blocks,
    });
  }

  private triggerAutoSave(note: Note): void {
    this.loadedNotes.set(note._id, note);
    const payload = this.getNotePayload(note);
    if (payload === this.savedPayloads.get(note._id) && !this.pendingSaveIds.has(note._id)) {
      return; // El contenido es idéntico al guardado: no activar guardado en base de datos
    }
    this.saveStatus.set('unsaved');
    this.pendingSaveIds.add(note._id);
    this.autoSaveSubject.next({ note, session: this.saveSession });
  }

  private summarize(note: Note): NoteSummary {
    const { blocks, docData, ...summary } = note;
    return summary;
  }

  /** Solo metadatos para referencias; no cambia selección, pestañas ni espacio activo. */
  listDocumentReferences(): Observable<NoteSummary[]> {
    return this.http.get<NoteSummary[]>(`${this.apiUrl}?view=summary`);
  }
}
