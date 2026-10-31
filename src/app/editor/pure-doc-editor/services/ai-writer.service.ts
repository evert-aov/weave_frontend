import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AI_REQUEST_LIMITS, htmlToAiExcerpt } from '../../../core/utils/ai-request';

interface AiChatResponse {
  reply: string;
}

@Injectable({ providedIn: 'root' })
export class AiWriterService {
  private readonly http = inject(HttpClient);

  async generateDocumentContentWithAI(
    prompt: string,
    selectedOrCurrentHtml: string
  ): Promise<string> {
    const message = `Eres un asistente experto en redacción ejecutiva y edición de documentos en Microsoft Word.
Devuelve ÚNICAMENTE código HTML limpio y semántico listo para insertarse dentro de un editor rico (sin bloques \`\`\`html ni etiquetas <html> o <body>).
Usa adecuadamente etiquetas <h1>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td> y <blockquote> cuando corresponda.

Solicitud del usuario: "${prompt}"`;
    if (message.length > AI_REQUEST_LIMITS.message) {
      throw new Error('La solicitud de redacción es demasiado larga. Divide las instrucciones en partes.');
    }
    const response = await firstValueFrom(
      this.http.post<AiChatResponse>(`${environment.apiUrl}/ai/chat`, {
        message,
        persistHistory: false,
        documentContext: {
          title: 'Documento activo',
          docType: 'word',
          content: htmlToAiExcerpt(selectedOrCurrentHtml, AI_REQUEST_LIMITS.document).text,
        },
        includeDocumentContext: true,
      })
    );
    return response.reply
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }
}
