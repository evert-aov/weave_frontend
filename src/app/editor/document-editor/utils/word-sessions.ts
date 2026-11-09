import type { Note } from '../../../core/models/note.model';

/** Dos sesiones recientes como máximo; cerrar la pestaña libera también su editor. */
export function retainWordSessions(previous: Note[], current: Note | null, openIds: ReadonlySet<string>): Note[] {
  const remaining = previous.filter(note => openIds.has(note._id));
  if (current?.docType !== 'doc' || !openIds.has(current._id)) return remaining;
  return [...remaining.filter(note => note._id !== current._id), current].slice(-2);
}
