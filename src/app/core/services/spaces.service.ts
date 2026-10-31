import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Space } from '../models/space.model';
import { environment } from '../../../environments/environment';

/**
 * Servicio de Espacios (Directorios).
 * Administra la creación, consulta y eliminación de espacios persistidos en MongoDB.
 */
@Injectable({
  providedIn: 'root',
})
export class SpacesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/spaces`;

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
   * Actualiza el nombre o propiedades de un espacio existente.
   */
  updateSpace(
    id: string,
    updates: { name?: string; parentId?: string | null; color?: string; icon?: string } | string,
  ): Observable<Space> {
    const payload = typeof updates === 'string' ? { name: updates.trim() } : updates;
    return this.http
      .put<Space>(`${this.apiUrl}/${id}`, payload)
      .pipe(
        tap((updated) => {
          this.spacesList.update((prev) =>
            prev.map((s) => (s._id === updated._id ? updated : s)),
          );
        }),
      );
  }

  /**
   * Mueve un directorio a un nuevo directorio padre (o a la raíz si targetParentId es null).
   */
  moveSpace(id: string, targetParentId: string | null): Observable<Space> {
    return this.updateSpace(id, { parentId: targetParentId }).pipe(
      tap(() => {
        this.loadSpaces().subscribe();
      }),
    );
  }

  /**
   * Elimina un espacio/directorio de la base de datos.
   */
  deleteSpace(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        const removed = new Set([id]);
        const spaces = this.spacesList();
        let changed = true;
        while (changed) {
          changed = false;
          for (const space of spaces) {
            if (space.parentId && removed.has(space.parentId.toString()) && !removed.has(space._id)) {
              removed.add(space._id); changed = true;
            }
          }
        }
        this.spacesList.update((prev) => prev.filter((space) => !removed.has(space._id)));
      }),
    );
  }
}
