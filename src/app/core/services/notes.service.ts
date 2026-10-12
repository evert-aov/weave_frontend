import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, Subject, debounceTime, switchMap } from 'rxjs';
import { Note } from '../models/note.model';
import { Block, BlockType } from '../models/block.model';
import { DocumentTab } from '../models/tab.model';

/**
 * Servicio de Gestión de Notas y Bloques.
 * Administra el documento activo, la lista de notas, pestañas abiertas en simultáneo,
 * el autoguardado y la sincronización con el backend.
 */
@Injectable({
  providedIn: 'root',
})
export class NotesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/notes';
  private readonly assetsUrl = 'http://localhost:3000/api/assets';

  readonly notesList = signal<Note[]>([]);
  readonly currentNote = signal<Note | null>(null);
  readonly activeSpace = signal<string>('Research');
  readonly saveStatus = signal<'saved' | 'saving' | 'unsaved'>('saved');
  readonly isSidebarCollapsed = signal<boolean>(false);
  readonly isReadingMode = signal<boolean>(true);
  readonly documentZoom = signal<number>(1.0);

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

  private readonly autoSaveSubject = new Subject<Note>();
  private lastSavedPayload = '';

  constructor() {
    // Pipeline de autoguardado con debounce de 800ms
    this.autoSaveSubject
      .pipe(
        debounceTime(800),
        tap(() => this.saveStatus.set('saving')),
        switchMap((note) =>
          this.http
            .put<Note>(`${this.apiUrl}/${note._id}`, {
              title: note.title,
              lead: note.lead,
              space: note.space,
              tags: note.tags,
              blocks: note.blocks,
            })
            .pipe(
              tap((updated) => {
                this.lastSavedPayload = this.getNotePayload(updated);
                this.saveStatus.set('saved');
                // Actualizar la nota en la lista general
                this.notesList.update((list) =>
                  list.map((n) => (n._id === updated._id ? updated : n)),
                );
              }),
              catchError((err) => {
                console.error('Error during auto-save:', err);
                this.saveStatus.set('unsaved');
                return of(null);
              }),
            ),
        ),
      )
      .subscribe();
  }

  /**
   * Limpia el estado reactivo en memoria al cambiar de usuario o cerrar sesión.
   */
  clearState(): void {
    this.notesList.set([]);
    this.currentNote.set(null);
    this.openTabs.set([]);
    this.activeSpace.set('Research');
    this.lastSavedPayload = '';
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
        },
      ]);
    } else if (existing.title !== note.title) {
      this.openTabs.update((prev) =>
        prev.map((t) => (t.noteId === note._id ? { ...t, title: note.title || 'Untitled' } : t)),
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
  loadNotes(space?: string): Observable<Note[]> {
    const targetSpace = space !== undefined ? space : this.activeSpace();
    const queryParam =
      targetSpace && targetSpace !== 'all'
        ? `?space=${encodeURIComponent(targetSpace)}`
        : '';

    return this.http.get<Note[]>(`${this.apiUrl}${queryParam}`).pipe(
      tap((notes) => {
        this.notesList.set(notes);
        if (notes.length > 0) {
          const current = this.currentNote();
          if (!current || !notes.some((n) => n._id === current._id)) {
            this.currentNote.set(notes[0]);
            this.lastSavedPayload = this.getNotePayload(notes[0]);
            this.saveStatus.set('saved');
            this.isReadingMode.set(true);
            this.openTab(notes[0]);
          } else {
            this.openTab(current);
          }
        } else {
          this.currentNote.set(null);
          this.lastSavedPayload = '';
          this.saveStatus.set('saved');
          this.openTabs.set([]);
        }
      }),
    );
  }

  /**
   * Selecciona o carga una nota por su ID.
   */
  loadNoteById(id: string): Observable<Note> {
    return this.http.get<Note>(`${this.apiUrl}/${id}`).pipe(
      tap((note) => {
        this.currentNote.set(note);
        this.lastSavedPayload = this.getNotePayload(note);
        this.saveStatus.set('saved');
        this.isReadingMode.set(true);
        this.openTab(note);
      }),
    );
  }

  /**
   * Crea una nueva nota en el espacio activo.
   */
  createNote(title?: string, space?: string): Observable<Note> {
    const s = space || this.activeSpace();
    const t = title || 'Untitled note';

    return this.http
      .post<Note>(this.apiUrl, {
        title: t,
        space: s,
        lead: '',
        tags: [],
        blocks: [
          {
            id: `b-${Date.now()}-1`,
            type: 'text',
            order: 0,
            content: { html: '<p>Start writing your thoughts...</p>' },
            metadata: {},
          },
        ],
      })
      .pipe(
        tap((created) => {
          this.notesList.update((list) => [created, ...list]);
          this.currentNote.set(created);
          this.lastSavedPayload = this.getNotePayload(created);
          this.saveStatus.set('saved');
          this.openTab(created);
        }),
      );
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
  updateBlockContent(blockId: string, contentUpdate: Record<string, any>): void {
    const note = this.currentNote();
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

    this.currentNote.set(updatedNote);
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
   * Elimina la nota completa.
   */
  deleteCurrentNote(): Observable<any> {
    const note = this.currentNote();
    if (!note) return of(null);

    const noteIdToDelete = note._id;
    return this.http.delete(`${this.apiUrl}/${noteIdToDelete}`).pipe(
      tap(() => {
        this.closeTab(noteIdToDelete);
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
        return { html: '<p></p>' };
      case 'code':
        return {
          language: 'python',
          code: 'def attention(query, key, value):\n    scores = query @ key.transpose(-2, -1)\n    weights = scores.softmax(dim=-1)\n    return weights @ value',
        };
      case 'latex':
        return {
          formula: 'Attention(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
        };
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
      tags: note.tags,
      blocks: note.blocks,
    });
  }

  private triggerAutoSave(note: Note): void {
    const payload = this.getNotePayload(note);
    if (payload === this.lastSavedPayload) {
      return; // El contenido es idéntico al guardado: no activar guardado en base de datos
    }
    this.saveStatus.set('unsaved');
    this.autoSaveSubject.next(note);
  }
}
