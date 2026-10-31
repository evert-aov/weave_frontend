# 06 — IA y exportación

[Volver al índice](README.md)

## Asistente

[AiService](../src/app/core/services/ai.service.ts) mantiene el estado de presentación,
la generación en curso y la preferencia de incluir contexto. El historial se guarda en FastAPI,
separado por usuario y chat. El panel comienza vacío, sin saludo automático ni sugerencias. Al abrirlo lista los chats mediante `GET /api/ai/conversations` y
recupera los mensajes del chat seleccionado mediante `GET /api/ai/history?conversationId=…`; «Ver mensajes anteriores» usa
el cursor `before`. No guardar conversaciones en localStorage.

```text
Angular -> POST /api/ai/chat (NestJS, JWT)
NestJS  -> POST /internal/chat (FastAPI, token interno)
FastAPI -> Vertex/Gemini
```

El chat envía `{ message, documentContext?, includeDocumentContext?, persistHistory: true }`;
FastAPI recupera el contexto conversacional de su almacenamiento. La respuesta contiene
`reply`, `model`, `provider`, `timestamp`, `userMessage` y `assistantMessage`. Los últimos dos
contienen los IDs y fechas canónicos que sustituyen al mensaje optimista sin duplicarlo. El frontend
no contiene `GEMINI_API_KEY`, `AI_SERVICE_TOKEN` ni una llamada directa a Google.

«Borrar historial» ejecuta `DELETE /api/ai/history?conversationId=…`. Solo vacía la vista cuando el servidor
confirma el borrado, cancela la respuesta local pendiente y no agrega otro saludo. Al cerrar
sesión o cambiar de cuenta, `AuthService` llama a `resetSession`: cancela HTTP y vacía memoria,
sin borrar los mensajes persistidos. Las respuestas tardías de otra sesión se ignoran.

### Tamaño del envío

[ai-request.ts](../src/app/core/utils/ai-request.ts) define los presupuestos antes de construir
el JSON: mensaje actual de hasta 12 000 caracteres y documento de hasta 15 000. El historial
no se retransmite desde el navegador: FastAPI aplica su ventana y presupuesto de 24 000
caracteres al contexto recuperado. La conversación visible conserva las respuestas completas.
Un mensaje actual demasiado largo se rechaza con una
indicación para dividirlo, sin recortar silenciosamente la consulta.

La extracción Word recorre páginas hasta consumir el presupuesto. La extracción HTML omite
atributos y contenido no legible sin construir un DOM que contenga imágenes Base64 grandes.
Los bloques de código se acotan antes de concatenarlos; URLs de datos binarias no forman
parte del contexto textual.

El panel indica «Contexto parcial» cuando se recortó el documento enviado. Para preguntas sobre
una sección fuera del extracto, incluir el fragmento relevante en la consulta. Esta función no
implementa búsqueda semántica ni lectura completa de adjuntos. Los editores registrados exponen
texto vivo; hojas y diapositivas aportan celdas y segmentos textuales con el mismo presupuesto.

Un `413 Payload Too Large` pertenece al transporte HTTP y sucede antes de que el proveedor
reciba el prompt. El frontend muestra una acción para reducir el mensaje o desvincular el
documento y libera el estado de generación para reintentar. Evitar registrar el error HTTP
completo, porque podría retener contexto del usuario.

Word usa el asistente principal. Se retiraron su botón y modal de redacción independientes.
Consultar [chats y edición](16-CHATS-Y-EDICION-IA.md) y
[persistencia en FastAPI](../../ia/guia-desarrollador/07-HISTORIAL-PERSISTENTE.md).

## Exportación

El modal de exportación se descarga mediante `@defer` al abrirlo desde la cabecera. De ese
modo jsPDF, html2canvas y sus dependencias no retrasan la apertura de la aplicación.

[ExportService](../src/app/export/services/export.service.ts) registra estrategias para PDF,
Markdown y HTML. Cada implementación define formato, metadatos y `export(note, options)`.
Aunque el tipo `ExportFormat` incluye `json`, no existe actualmente una estrategia registrada
para ese formato.

PDF ofrece impresión del navegador o descarga por rasterización y paginación. HTML produce
un archivo independiente; Markdown convierte los bloques a texto estructurado. Al añadir un
tipo de bloque, revisar los tres exportadores para no perder contenido.

Los cambios de impresión y captura requieren pruebas manuales de documentos largos, tablas,
imágenes, fórmulas y saltos de página. Las pruebas de estado no verifican fidelidad visual.
