import { DocType } from './note.model';

/**
 * Modelo de Pestaña de Documento en Weave.
 * Representa un documento abierto simultáneamente en la barra de pestañas.
 */
export interface DocumentTab {
  noteId: string;
  title: string;
  space?: string;
  docType?: DocType;
}
