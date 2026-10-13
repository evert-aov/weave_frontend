import { Block } from './block.model';

export type DocType = 'block' | 'sheet' | 'doc' | 'canvas' | 'slide';

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
