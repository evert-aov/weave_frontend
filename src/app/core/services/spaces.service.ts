import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Space } from '../models/space.model';

/**
 * Servicio de Espacios (Directorios).
 * Administra la creación, consulta y eliminación de espacios persistidos en MongoDB.
 */
@Injectable({
  providedIn: 'root',
})
export class SpacesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:3000/api/spaces';

  readonly spacesList = signal<Space[]>([]);

  /**
   * Limpia la lista de espacios en memoria al cambiar de usuario o cerrar sesión.
   */
  clearState(): void {
    this.spacesList.set([]);
  }

  /**
   * Carga la lista de espacios del usuario desde MongoDB.
   */
  loadSpaces(): Observable<Space[]> {
    return this.http.get<Space[]>(this.apiUrl).pipe(
      tap((spaces) => {
        this.spacesList.set(spaces);
      }),
    );
  }

  /**
   * Crea un nuevo espacio/directorio o subdirectorio en MongoDB.
   */
  createSpace(name: string, color = 'indigo', parentId?: string | null): Observable<Space> {
    return this.http
      .post<Space>(this.apiUrl, {
        name: name.trim(),
        color,
        icon: 'folder',
        parentId: parentId || null,
      })
      .pipe(
        tap((newSpace) => {
          this.spacesList.update((prev) => [...prev, newSpace]);
        }),
      );
  }

  /**
   * Actualiza el nombre de un espacio existente.
   */
  updateSpace(id: string, name: string): Observable<Space> {
    return this.http
      .put<Space>(`${this.apiUrl}/${id}`, { name: name.trim() })
      .pipe(
        tap((updated) => {
          this.spacesList.update((prev) =>
            prev.map((s) => (s._id === updated._id ? updated : s)),
          );
        }),
      );
  }

  /**
   * Elimina un espacio/directorio de la base de datos.
   */
  deleteSpace(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        this.spacesList.update((prev) => prev.filter((s) => s._id !== id));
      }),
    );
  }
}
