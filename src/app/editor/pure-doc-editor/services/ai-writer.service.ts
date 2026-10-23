import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AiWriterService {
  async generateDocumentContentWithAI(
    prompt: string,
    selectedOrCurrentHtml: string
  ): Promise<string> {
    const apiKey =
      (globalThis as any)['WEAVE_GEMINI_API_KEY'] ||
      (globalThis as any)['WEAVE_AI_CONFIG']?.['apiKey'];

    if (!apiKey) {
      throw new Error('Falta configurar WEAVE_GEMINI_API_KEY para usar el asistente de IA.');
    }

    const systemPrompt = `Eres un asistente experto en redacción ejecutiva y edición de documentos en Microsoft Word.
Devuelve ÚNICAMENTE código HTML limpio y semántico listo para insertarse dentro de un editor rico (sin bloques \`\`\`html ni etiquetas <html> o <body>).
Usa adecuadamente etiquetas <h1>, <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td> y <blockquote> cuando corresponda.`;

    const userText = `Solicitud del usuario: "${prompt}"\n\nContexto actual del documento (opcional):\n${selectedOrCurrentHtml.slice(0, 3000)}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const data = await response.json();
    const output: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return output
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }
}
