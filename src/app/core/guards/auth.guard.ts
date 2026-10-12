import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Guard funcional para proteger rutas autenticadas.
 * Redirige a /login si no hay token en localStorage.
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('weave_token');

  if (token) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
