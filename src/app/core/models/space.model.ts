/**
 * Modelo de Espacio (Directorio de notas) en Weave.
 * Todo espacio se persiste y administra en MongoDB.
 */
export interface Space {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
  order?: number;
  color: string;
  icon?: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
  // Propiedades calculadas en el frontend para el árbol de directorios
  children?: Space[];
  level?: number;
  isExpanded?: boolean;
}
