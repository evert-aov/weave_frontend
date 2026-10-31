import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { isDocumentId } from '../utils/document-link';

/**
 * Guard funcional para proteger rutas autenticadas.
 * Redirige a /login si no hay token en localStorage.
 */
function checkSession() {
  const router = inject(Router);
  const token = localStorage.getItem('weave_token');

  if (token) {
    return true;
  }

  const documentId = router.currentNavigation()?.extractedUrl.queryParams['document'];
  return router.createUrlTree(['/login'], { queryParams: isDocumentId(documentId) ? { document: documentId } : undefined });
}

export const authGuard: CanActivateFn = checkSession;

/** Evita descargar el espacio de trabajo antes de comprobar la sesión. */
export const authMatchGuard: CanMatchFn = checkSession;
