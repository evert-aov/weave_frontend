/**
 * Modelo de Espacio (Directorio de notas) en Weave.
 * Todo espacio se persiste y administra en MongoDB.
 */
export interface Space {
  _id: string;
  name: string;
  color: string;
  icon?: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}
