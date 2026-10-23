import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotesService } from '../../../core/services/notes.service';
import { environment } from '../../../../environments/environment';

interface StoredImage {
  id: string;
  dataUrl: string;
  updatedAt: number;
}

const DB_NAME = 'weave-word-images';
const STORE_NAME = 'images';
const SCHEME = 'weave-img://';

/**
 * Placeholder SVG amigable si una imagen referenciada localmente en una versión previa
 * no existe en este dispositivo/navegador.
 */
const MISSING_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120"><rect width="320" height="120" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="2" rx="8"/><text x="50%" y="45%" text-anchor="middle" fill="%2364748b" font-family="system-ui,sans-serif" font-size="13" font-weight="600">Imagen local no disponible</text><text x="50%" y="68%" text-anchor="middle" fill="%2394a3b8" font-family="system-ui,sans-serif" font-size="11">Referencia local no encontrada en este navegador</text></svg>';

/**
 * Servicio de almacenamiento y persistencia física de imágenes para el editor de Word (PureDocEditor).
 * 
 * En lugar de retener imágenes únicamente en IndexedDB local (lo que provocaba que desaparecieran
 * al cambiar de navegador, sesión o equipo), este servicio se asegura de que:
 * 1. Cualquier imagen embebida (data URL / blob) se suba físicamente al backend (`/uploads/`) vía `uploadBase64Image`.
 * 2. Las notas en MongoDB guarden referencias URL permanentes y portables (`/uploads/...`).
 * 3. En tiempo de ejecución se resuelvan las URLs con el host de la API (`environment.serverBaseUrl`).
 * 4. Las imágenes antiguas almacenadas bajo el esquema `weave-img://<id>` se migren automáticamente
 *    a archivos físicos en el servidor si aún residen en el caché local.
 */
@Injectable({ providedIn: 'root' })
export class ImageStoreService {
  private readonly notesService = inject(NotesService);
  private readonly serverBaseUrl = environment.serverBaseUrl;

  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly memCache = new Map<string, string>();
  private readonly inProgressUploads = new Map<string, Promise<string>>();

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  async save(id: string, dataUrl: string): Promise<void> {
    this.memCache.set(id, dataUrl);
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ id, dataUrl, updatedAt: Date.now() } as StoredImage);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async get(id: string): Promise<string | null> {
    if (this.memCache.has(id)) return this.memCache.get(id) ?? null;
    const db = await this.openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => {
          const stored = request.result as StoredImage | undefined;
          if (stored?.dataUrl) this.memCache.set(id, stored.dataUrl);
          resolve(stored?.dataUrl ?? null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Sube una imagen base64 / dataUrl al backend y devuelve la URL del servidor,
   * evitando subidas duplicadas concurrentes mediante un caché en memoria.
   */
  async uploadAndPersist(dataUrl: string): Promise<string> {
    const id = this.hash(dataUrl);
    if (this.memCache.has(id)) {
      return this.memCache.get(id)!;
    }

    if (this.inProgressUploads.has(id)) {
      return this.inProgressUploads.get(id)!;
    }

    const uploadTask = (async () => {
      try {
        const res = await firstValueFrom(this.notesService.uploadBase64Image(dataUrl));
        const finalUrl = res.url;
        this.memCache.set(id, finalUrl);
        // Guardamos también en IndexedDB para disponibilidad offline
        void this.save(id, dataUrl);
        return finalUrl;
      } finally {
        this.inProgressUploads.delete(id);
      }
    })();

    this.inProgressUploads.set(id, uploadTask);
    return uploadTask;
  }

  /**
   * Convierte una URL a ruta relativa portable (`/uploads/...`) para ser guardada en la base de datos.
   */
  toRelativeUrl(url: string): string {
    if (!url) return url;
    if (this.serverBaseUrl && url.startsWith(this.serverBaseUrl)) {
      return url.slice(this.serverBaseUrl.length);
    }
    try {
      if (/^https?:\/\//i.test(url)) {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/uploads/')) {
          return parsed.pathname;
        }
      }
    } catch {}
    return url;
  }

  /**
   * Convierte una ruta relativa de imagen (`/uploads/...`) a una URL completa accesible
   * por el navegador usando `environment.serverBaseUrl`.
   */
  toDisplayUrl(url: string): string {
    if (!url) return url;
    if (url.startsWith('/uploads/')) {
      return this.serverBaseUrl ? `${this.serverBaseUrl}${url}` : url;
    }
    return url;
  }

  /**
   * Procesa el HTML antes de guardarlo en MongoDB:
   * 1. Detecta imágenes en base64 (`data:`) o `blob:` y las sube físicamente al backend.
   * 2. Reemplaza el src por una ruta física permanente y portable (`/uploads/img-....png`).
   * 3. Remueve prefijos absolutos de localhost/servidor para que los documentos sean portables.
   */
  async externalizeImages(html: string): Promise<string> {
    if (!html || !html.includes('<img')) return html;

    let result = html;

    // Detectar imágenes data: o blob:
    const dataOrBlobRegex = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:[^"']+|blob:[^"']+)\2/gi;
    const matches = [...result.matchAll(dataOrBlobRegex)];

    for (const match of matches) {
      const fullMatch = match[0];
      const prefix = match[1];
      const quote = match[2];
      const rawSrc = match[3];

      try {
        const dataUrl = rawSrc.startsWith('blob:')
          ? await this.blobUrlToDataUrl(rawSrc)
          : rawSrc;

        if (!dataUrl) continue;

        const serverUrl = await this.uploadAndPersist(dataUrl);
        const relativeUrl = this.toRelativeUrl(serverUrl);
        result = result.split(fullMatch).join(`${prefix}${quote}${relativeUrl}${quote}`);
      } catch (err) {
        console.error('[ImageStoreService] Error subiendo imagen embebida:', err);
      }
    }

    // Normalizar cualquier URL absoluta local a ruta relativa para la persistencia
    if (this.serverBaseUrl) {
      result = result.split(`${this.serverBaseUrl}/uploads/`).join('/uploads/');
    }

    return result;
  }

  /**
   * Procesa el HTML al cargar el documento para visualizarlo en el editor:
   * 1. Migra automáticamente referencias legacy `weave-img://<id>` subiendo los datos locales
   *    al backend para convertirlos en archivos físicos permanentes.
   * 2. Convierte rutas relativas `/uploads/...` a URLs completas que el navegador pueda cargar
   *    desde el servidor NestJS (`http://localhost:3000/uploads/...`).
   */
  async resolveImages(html: string): Promise<string> {
    if (!html || (!html.includes('<img') && !html.includes(SCHEME))) return html;

    let result = html;

    // 1. Migración de imágenes antiguas bajo weave-img://
    if (result.includes(SCHEME)) {
      const legacyRegex = /(\bsrc\s*=\s*)(["'])weave-img:\/\/([A-Za-z0-9_-]+)\2/gi;
      const matches = [...result.matchAll(legacyRegex)];

      for (const match of matches) {
        const fullMatch = match[0];
        const prefix = match[1];
        const quote = match[2];
        const legacyId = match[3];

        const localDataUrl = await this.get(legacyId);
        if (localDataUrl && localDataUrl.startsWith('data:image')) {
          try {
            // Migrar al backend físico
            const serverUrl = await this.uploadAndPersist(localDataUrl);
            const displayUrl = this.toDisplayUrl(serverUrl);
            result = result.split(fullMatch).join(`${prefix}${quote}${displayUrl}${quote}`);
          } catch (err) {
            console.error('[ImageStoreService] Error al migrar imagen legacy al servidor:', err);
            // Si la red falla temporalmente, usar el dataUrl local para que el usuario no vea la imagen rota
            result = result.split(fullMatch).join(`${prefix}${quote}${localDataUrl}${quote}`);
          }
        } else {
          // Si no existe en IndexedDB (otro navegador o almacenamiento borrado)
          result = result.split(fullMatch).join(`${prefix}${quote}${MISSING_IMAGE_PLACEHOLDER}${quote}`);
        }
      }
    }

    // 2. Resolver rutas relativas /uploads/ con serverBaseUrl para visualización en el editor
    if (this.serverBaseUrl) {
      const relativeUploadRegex = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(\/uploads\/[^"']+)\2/gi;
      result = result.replace(relativeUploadRegex, (_match, p1, p2, p3) => {
        return `${p1}${p2}${this.serverBaseUrl}${p3}${p2}`;
      });
    }

    return result;
  }

  hash(value: string): string {
    let h = 5381;
    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) + h + value.charCodeAt(i)) | 0;
    }
    return `img${(h >>> 0).toString(36)}${value.length.toString(36)}`;
  }

  private blobUrlToDataUrl(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      fetch(url)
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
        .catch(() => resolve(null));
    });
  }
}
