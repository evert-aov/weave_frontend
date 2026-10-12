import { Block } from './block.model';

/**
 * Modelo de documento / nota en Weave.
 */
export interface Note {
  _id: string;
  userId: string;
  title: string;
  lead?: string;
  space: string;
  tags: string[];
  blocks: Block[];
  createdAt?: string;
  updatedAt?: string;
}
