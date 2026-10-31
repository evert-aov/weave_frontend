import { Injectable, inject, signal } from '@angular/core';
import { NotesService } from './notes.service';
import type { DocumentEdit, EditTarget } from '../models/ai.model';

export interface AiEditorAdapter {
  owner(): string | undefined;
  fields(): Iterable<EditTarget>;
  apply(values: Map<string, string>): void;
}
export interface EditSnapshot {
  noteId: string;
  fields: Map<string, { text: string; adapter: AiEditorAdapter }>;
  targets: EditTarget[];
  truncated: boolean;
}

const ALWAYS_EDITABLE_DOC_TYPES = new Set(['doc', 'sheet', 'slide']);

/** Puente ligero: cada motor registra sus campos sin cargarse desde el chat. */
@Injectable({ providedIn: 'root' })
export class AiDocumentService {
  private readonly notes = inject(NotesService);
  private readonly adapters = new Set<AiEditorAdapter>();
  readonly revision = signal(0);

  register(adapter: AiEditorAdapter): () => void {
    this.adapters.add(adapter); this.revision.update(n => n + 1);
    return () => { this.adapters.delete(adapter); this.revision.update(n => n + 1); };
  }
  supported(): boolean {
    this.revision();
    const id = this.notes.currentNote()?._id;
    let ready = false;
    for (const adapter of this.adapters) {
      if (adapter.owner() === id) ready = true;
    }
    return !!id && ready;
  }
  /** Word, Excel y Presentaciones no tienen interruptor de modo lectura en la barra superior. */
  isReadingLocked(): boolean {
    const note = this.notes.currentNote();
    if (!note) return false;
    if (note.docType && ALWAYS_EDITABLE_DOC_TYPES.has(note.docType)) return false;
    return this.notes.isReadingMode();
  }
  capture(readOnly = false): EditSnapshot {
    const note = this.notes.currentNote();
    if (!note || (!readOnly && this.isReadingLocked())) throw new Error('Activa la edición del documento antes de pedir cambios.');
    const fields: EditSnapshot['fields'] = new Map();
    const targets: EditTarget[] = [];
    let budget = 24_000; let truncated = false;
    for (const adapter of this.adapters) {
      if (adapter.owner() !== note._id) continue;
      if (targets.length >= 200 || budget <= 0) { truncated = true; break; }
      for (const field of adapter.fields()) {
        if (fields.has(field.id)) throw new Error('Destino de edición duplicado.');
        if (targets.length >= 200 || budget <= field.id.length) { truncated = true; break; }
        const text = field.text.slice(0, Math.min(15_000, budget - field.id.length));
        truncated ||= text.length !== field.text.length;
        fields.set(field.id, { text: field.text, adapter });
        targets.push({ id: field.id, text }); budget -= field.id.length + text.length;
      }
    }
    if (!targets.length) throw new Error('El editor todavía no está listo para recibir cambios.');
    return { noteId: note._id, fields, targets, truncated };
  }
  apply(snapshot: EditSnapshot, edits: DocumentEdit[]): void {
    if (!edits.length) return;
    if (edits.length > 30 || edits.reduce((n, e) => n + e.before.length + e.after.length, 0) > 30_000) throw new Error('Los cambios superan el límite permitido.');
    if (this.isReadingLocked() || this.notes.currentNote()?._id !== snapshot.noteId) throw new Error('Cambiaste de documento o activaste la lectura. No se aplicaron cambios.');
    const groups = new Map<AiEditorAdapter, Map<string, string>>();
    const current = new Map<AiEditorAdapter, Map<string, string>>();
    for (const edit of edits) {
      const field = snapshot.fields.get(edit.target);
      if (!field || !this.adapters.has(field.adapter) || field.adapter.owner() !== snapshot.noteId) throw new Error('El destino ya no está disponible. No se aplicaron cambios.');
      if (!current.has(field.adapter)) current.set(field.adapter, new Map(Array.from(field.adapter.fields(), f => [f.id, f.text])));
      if (current.get(field.adapter)?.get(edit.target) !== field.text) throw new Error('El contenido cambió mientras respondía la IA. Envía de nuevo la petición.');
      const values = groups.get(field.adapter) ?? new Map<string, string>(); groups.set(field.adapter, values);
      const value = values.get(edit.target) ?? field.text;
      if (edit.before && (value.indexOf(edit.before) < 0 || value.indexOf(edit.before) !== value.lastIndexOf(edit.before))) throw new Error('El fragmento a reemplazar no es único. No se aplicaron cambios.');
      const next = edit.before ? value.replace(edit.before, () => edit.after) : value + edit.after;
      if (next.length > 300_000) throw new Error('El resultado supera el tamaño permitido.');
      values.set(edit.target, next);
    }
    // Todos los destinos y conflictos se validan antes de modificar el primer motor.
    try { for (const [adapter, values] of groups) adapter.apply(values); }
    catch { throw new Error('No se completaron todos los cambios. Revisa el documento antes de reintentar.'); }
  }
}
