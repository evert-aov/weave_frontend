import { Block } from './block.model';

export type DocType = 'block' | 'sheet' | 'doc' | 'canvas' | 'slide' | 'latex';

/**
 * Modelo de documento / nota en Weave.
 */
export interface Note {
  _id: string;
  userId: string;
  title: string;
  lead?: string;
  space: string;
  docType?: DocType;
  docUrl?: string;
  docData?: any;
  tags: string[];
  blocks: Block[];
  createdAt?: string;
  updatedAt?: string;
}

/** Metadatos de navegación: nunca se usan como documento editable ni como payload de guardado. */
export type NoteSummary = Omit<Note, 'blocks' | 'docData'>;
