import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface LatexCompileResult { success: boolean; pdf?: string; log: string }
@Injectable({ providedIn: 'root' })
export class LatexCompilerService {
  private readonly http = inject(HttpClient);
  compile(source: string, mode: 'document' | 'fragment' = 'document') {
    return this.http.post<LatexCompileResult>(`${environment.apiUrl}/latex/compile`, { source, mode });
  }
}

export function latexPdfBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Respuesta PDF inválida.');
  return new Blob([bytes], { type: 'application/pdf' });
}

export function latexError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('\n');
    if (error.status === 0) return 'No se pudo conectar al compilador. Comprueba que el backend esté iniciado.';
  }
  return error instanceof Error ? error.message : 'No se pudo compilar el documento.';
}

export function downloadLatexFile(blob: Blob, title: string, extension: 'tex' | 'pdf'): void {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `${(title || 'documento').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.${extension}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
