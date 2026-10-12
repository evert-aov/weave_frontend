import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor HTTP funcional para inyectar el token Bearer en cada petición a la API.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('weave_token');
  if (token) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(cloned);
  }
  return next(req);
};
