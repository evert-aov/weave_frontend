/**
 * Modelo de Usuario autenticado en el cliente.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

/**
 * Respuesta del servidor tras login o registro.
 */
export interface AuthResponse {
  accessToken: string;
  user: User;
}
