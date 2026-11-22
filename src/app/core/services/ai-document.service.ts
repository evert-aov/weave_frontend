import { Injectable, inject, signal } from '@angular/core';
import { NotesService } from './notes.service';
import type { DocumentEdit, EditTarget } from '../models/ai.model';
import { applyWorkbookOperations } from '../../shared/utils/ai-workbook-control';
import { cleanLatexSource, cleanSheetCellText } from '../utils/ai-edit-text';

export interface AiEditorAdapter {
  owner(): string | undefined;
  fields(): Iterable<EditTarget>;
  apply(values: Map<string, string>): void;
}
export interface EditSnapshot {
  noteId: string;
  docType?: string;
  fields: Map<string, { text: string; adapter: AiEditorAdapter; ownerId: string; rawId: string }>;
  targets: EditTarget[];
  truncated: boolean;
}

const ALWAYS_EDITABLE_DOC_TYPES = new Set(['doc', 'sheet', 'slide']);
const MAX_CAPTURE_BUDGET = 1_500_000;
const MAX_CAPTURE_TARGETS = 10_000;
const MAX_FIELD_SLICE = 100_000;
const MAX_APPLY_EDITS = 1_000;
const MAX_APPLY_EDIT_CHARS = 1_000_000;
const MAX_APPLY_RESULT_CHARS = 4_000_000;

function isControlTarget(target: string): boolean {
  return target === 'word:control'
    || target === 'workbook:control'
    || target.endsWith(':word:control')
    || target.endsWith(':workbook:control');
}

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
  /** Verifica si un documento específico tiene bloqueada la edición (solo modo lectura). */
  isNoteReadingLocked(noteId?: string): boolean {
    if (!noteId || this.notes.currentNote()?._id === noteId) {
      return this.isReadingLocked();
    }
    const cached = this.notes.getCachedNote?.(noteId);
    if (cached?.docType && ALWAYS_EDITABLE_DOC_TYPES.has(cached.docType)) return false;
    return false;
  }

  capture(readOnly = false): EditSnapshot {
    const note = this.notes.currentNote();
    if (!note || (!readOnly && this.isReadingLocked())) throw new Error('Activa la edición del documento antes de pedir cambios.');
    const fields: EditSnapshot['fields'] = new Map();
    const targets: EditTarget[] = [];
    let budget = MAX_CAPTURE_BUDGET; let truncated = false;

    const addAdapterFields = (adapter: AiEditorAdapter, ownerId: string, prefix = '') => {
      if (targets.length >= MAX_CAPTURE_TARGETS || budget <= 0) { truncated = true; return; }
      for (const field of adapter.fields()) {
        const externalId = prefix ? `${prefix}${field.id}` : field.id;
        if (fields.has(externalId)) throw new Error('Destino de edición duplicado.');
        if (targets.length >= MAX_CAPTURE_TARGETS || budget <= externalId.length) { truncated = true; break; }
        const text = field.text.slice(0, Math.min(MAX_FIELD_SLICE, budget - externalId.length));
        truncated ||= text.length !== field.text.length;
        fields.set(externalId, { text: field.text, adapter, ownerId, rawId: field.id });
        targets.push({ id: externalId, text }); budget -= externalId.length + text.length;
      }
    };

    // Prioriza siempre los adaptadores del documento activo y expone pestañas abiertas en segundo plano con prefijo doc:<id>:
    for (const adapter of this.adapters) {
      if (adapter.owner() !== note._id) continue;
      addAdapterFields(adapter, note._id);
    }
    for (const adapter of this.adapters) {
      const ownerId = adapter.owner();
      if (!ownerId || ownerId === note._id) continue;
      addAdapterFields(adapter, ownerId, `doc:${ownerId}:`);
    }

    if (!targets.length) throw new Error('El editor todavía no está listo para recibir cambios.');
    return { noteId: note._id, docType: note.docType, fields, targets, truncated };
  }

  apply(snapshot: EditSnapshot, edits: DocumentEdit[]): void {
    if (!edits.length) return;
    if (edits.length > MAX_APPLY_EDITS || edits.reduce((n, e) => n + e.before.length + e.after.length, 0) > MAX_APPLY_EDIT_CHARS) {
      throw new Error('Los cambios superan el límite permitido.');
    }
    const touchedOwners = new Set<string>();
    for (const edit of edits) {
      const field = snapshot.fields.get(edit.target);
      if (field) touchedOwners.add(field.ownerId);
    }
    for (const ownerId of touchedOwners) {
      if (this.isNoteReadingLocked(ownerId)) {
        throw new Error('Activaste el modo lectura. No se aplicaron cambios.');
      }
    }

    const groups = new Map<AiEditorAdapter, Map<string, string>>();
    const fallbackGroups = new Map<string, Map<string, string>>();
    const current = new Map<AiEditorAdapter, Map<string, string>>();

    for (const edit of edits) {
      const field = snapshot.fields.get(edit.target);
      if (!field) throw new Error('El destino ya no está disponible. No se aplicaron cambios.');

      const adapterLive = this.adapters.has(field.adapter) && field.adapter.owner() === field.ownerId;
      if (!adapterLive) {
        // Si el usuario cambió de pestaña desde un editor desmontable (p.ej. Excel o LaTeX), intenta persistir directo en NotesService
        const cachedNote = this.notes.getCachedNote?.(field.ownerId);
        if (!cachedNote || !['sheet', 'latex'].includes(cachedNote.docType || '')) {
          throw new Error('El destino ya no está disponible. No se aplicaron cambios.');
        }
        const fbValues = fallbackGroups.get(field.ownerId) ?? new Map<string, string>();
        fallbackGroups.set(field.ownerId, fbValues);
        const value = fbValues.get(field.rawId) ?? field.text;
        const next = isControlTarget(edit.target) && edit.after.trim().startsWith('{')
          ? edit.after
          : edit.before
            ? value.replace(edit.before, () => edit.after)
            : value + edit.after;
        if (next.length > MAX_APPLY_RESULT_CHARS) throw new Error('El resultado supera el tamaño permitido.');
        fbValues.set(field.rawId, next);
        continue;
      }

      if (!current.has(field.adapter)) current.set(field.adapter, new Map(Array.from(field.adapter.fields(), f => [f.id, f.text])));
      const liveText = current.get(field.adapter)?.get(field.rawId);
      const values = groups.get(field.adapter) ?? new Map<string, string>(); groups.set(field.adapter, values);

      if (isControlTarget(edit.target) && edit.after.trim().startsWith('{') && liveText !== undefined) {
        values.set(field.rawId, edit.after);
        continue;
      }

      if (liveText !== field.text) {
        // Resolución inteligente de conflictos: permite aplicar si el fragmento exacto sigue siendo único
        const canReconcile = Boolean(
          edit.before &&
          liveText !== undefined &&
          liveText.indexOf(edit.before) >= 0 &&
          liveText.indexOf(edit.before) === liveText.lastIndexOf(edit.before)
        );
        if (!canReconcile) {
          throw new Error('El contenido cambió mientras respondía la IA. Envía de nuevo la petición.');
        }
      }

      const value = values.get(field.rawId) ?? liveText ?? field.text;
      if (edit.before && (value.indexOf(edit.before) < 0 || value.indexOf(edit.before) !== value.lastIndexOf(edit.before))) {
        throw new Error('El fragmento a reemplazar no es único. No se aplicaron cambios.');
      }
      const next = edit.before ? value.replace(edit.before, () => edit.after) : value + edit.after;
      if (next.length > MAX_APPLY_RESULT_CHARS) throw new Error('El resultado supera el tamaño permitido.');
      values.set(field.rawId, next);
    }
    // Todos los destinos y conflictos se validan antes de modificar el primer motor.
    try {
      for (const [adapter, values] of groups) adapter.apply(values);
      for (const [noteId, values] of fallbackGroups) this.applyFallbackNoteValues(noteId, values);
    } catch {
      throw new Error('No se completaron todos los cambios. Revisa el documento antes de reintentar.');
    }
  }

  private applyFallbackNoteValues(noteId: string, values: Map<string, string>): void {
    const applied = this.notes.applyBackgroundPatch?.(noteId, (note) => {
      if (note.docType === 'latex') {
        const nextSource = values.get('latex:source');
        if (nextSource === undefined) return note;
        return { ...note, docData: { ...(note.docData || {}), version: 1, source: cleanLatexSource(nextSource, true) } };
      }
      if (note.docType === 'sheet') {
        let nextBook = JSON.parse(JSON.stringify(note.docData?.sheets ? note.docData : { activeSheetId: 'sheet1', sheets: Array.isArray(note.docData) ? note.docData : [] }));
        const control = values.get('workbook:control');
        if (control !== undefined) nextBook = applyWorkbookOperations(nextBook, control);
        for (const [key, rawVal] of values) {
          if (!key.startsWith('cell:')) continue;
          const parts = key.split(':');
          if (parts.length < 3) continue;
          const sheetId = parts[1], cellId = parts.slice(2).join(':');
          const targetSheet = (nextBook.sheets || []).find((s: any) => s.id === sheetId);
          if (targetSheet) {
            if (!targetSheet.data) targetSheet.data = {};
            const cleaned = cleanSheetCellText(rawVal);
            targetSheet.data[cellId] = { ...(targetSheet.data[cellId] || {}), raw: cleaned };
          }
        }
        return { ...note, docData: nextBook };
      }
      return note;
    });
    if (!applied) throw new Error('No se pudo persistir el documento en segundo plano.');
  }
}
