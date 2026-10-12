/**
 * Tipos de bloques soportados en el documento de Weave.
 */
export type BlockType =
  | 'text'
  | 'canvas'
  | 'latex'
  | 'image'
  | 'sheet'
  | 'code'
  | 'mermaid'
  | 'file';

/**
 * Interfaz que define un bloque dentro de un documento.
 */
export interface Block {
  id: string;
  type: BlockType;
  order: number;
  content: Record<string, any>;
  metadata?: Record<string, any>;
}
