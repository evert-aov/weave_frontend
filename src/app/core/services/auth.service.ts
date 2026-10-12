import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { User, AuthResponse } from '../models/user.model';
import { NotesService } from './notes.service';
import { SpacesService } from './spaces.service';

/**
 * Servicio de Autenticación para el frontend.
 * Maneja el estado del usuario, persistencia de token JWT y operaciones de login/registro.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notesService = inject(NotesService);
  private readonly spacesService = inject(SpacesService);
  private readonly apiUrl = 'http://localhost:3000/api/auth';

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(localStorage.getItem('weave_token'));
  readonly isAuthenticated = signal<boolean>(!!localStorage.getItem('weave_token'));

  constructor() {
    if (this.token()) {
      this.fetchProfile().subscribe();
    }
  }

  /**
   * Registra un nuevo usuario en la plataforma.
   */
  register(data: { name: string; email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap((res) => this.handleAuthSuccess(res)),
    );
  }

  /**
   * Inicia sesión con credenciales de usuario.
   */
  login(data: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap((res) => this.handleAuthSuccess(res)),
    );
  }

  /**
   * Obtiene el perfil del usuario autenticado actual desde el backend.
   */
  fetchProfile(): Observable<User | null> {
    return this.http.get<User>(`${this.apiUrl}/me`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }),
      catchError(() => {
        this.logout();
        return of(null);
      }),
    );
  }

  /**
   * Cierra la sesión activa y limpia el almacenamiento local.
   */
  logout(): void {
    localStorage.removeItem('weave_token');
    this.token.set(null);
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.notesService.clearState();
    this.spacesService.clearState();
    this.router.navigate(['/login']);
  }

  /**
   * Procesa la respuesta exitosa guardando el token y actualizando señales.
   */
  private handleAuthSuccess(response: AuthResponse): void {
    localStorage.setItem('weave_token', response.accessToken);
    this.token.set(response.accessToken);
    this.currentUser.set(response.user);
    this.isAuthenticated.set(true);
    this.notesService.clearState();
    this.spacesService.clearState();
    this.router.navigate(['/'], { replaceUrl: true });
  }
}
