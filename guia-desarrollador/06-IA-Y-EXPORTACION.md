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
el JSON: mensaje actual de hasta 250 000 caracteres y documento de hasta 1 500 000. El historial
no se retransmite desde el navegador: FastAPI aplica su ventana y presupuesto configurable (60 000 caracteres por defecto)
al contexto recuperado. La conversación visible conserva las respuestas completas.
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


## PDF del editor Word

La exportación toma una copia de las hojas visibles con estilos calculados, incluyendo tamaños
reales de filas, columnas y párrafos. El zoom del workspace no cambia las dimensiones físicas:
se convierten píxeles CSS a puntos PDF (72/96). No se agregan márgenes ni padding a las tablas.
`word-pdf-export.ts` carga jsPDF al exportar; el render utiliza SVG foreignObject
para conservar la composición del texto y bordes del navegador. El PDF contiene imágenes de
las hojas, no texto seleccionable.

La captura convierte la copia XHTML con estilos en una imagen SVG y la dibuja en un canvas.
No crea iframes ni vuelve a cargar las hojas CSS de la aplicación. No modifica el DOM editable
ni restaura una posición de scroll antigua. Las cargas de recursos y el dibujo tienen un
límite de espera; el progreso por página y los errores aparecen junto a la barra de herramientas. El botón muestra el estado de
exportación y bloquea solicitudes simultáneas. La exportación requiere vista de páginas.

### Documentos Word largos

El adaptador recorre primero los encabezados H1–H6 y APA 4/5 de todas las páginas y después
el cuerpo. Conserva los IDs originales por nodo: cambiar la prioridad no cambia los destinos
ni permite alterar estilos o imágenes. Así, los primeros 2 000 destinos no quedan ocupados
solo por las páginas iniciales. Los límites siguen vigentes; el contexto incluye una advertencia
explícita si es parcial y no permite inferir que una sección omitida no existe. En edición,
el texto contextual y los destinos se construyen desde la misma captura. FastAPI valida toda
la salida y admite un único intento correctivo; consultar su guía de proveedores y errores.

## Edición estructural de tablas Word

El adaptador Word publica destinos `word-table:<pageId>:<index>` antes de los fragmentos textuales. Cada destino contiene filas, textos de celdas, combinaciones y la tabla siguiente. La IA reemplaza el JSON completo por `{"action":"mergeNext"}` o `{"action":"setCell","row":0,"column":0,"text":"..."}`. El protocolo confiable de FastAPI (`ia/app/edits.py`) describe ambas operaciones. Esto permite localizar tablas aunque el cuerpo textual haya quedado fuera del extracto; siguen aplicándose los presupuestos de contexto.

El frontend valida acciones y dimensiones sobre copias antes de publicar. Unir mueve filas conservando contenido y atributos de las celdas, mantiene el estilo de la primera tabla y retira la segunda; no elimina automáticamente encabezados repetidos. Tablas con distinto número de columnas se rechazan. `setCell` escribe texto seguro. El destino incluye también el contenido de la tabla siguiente para que la comprobación de conflictos detecte modificaciones durante la respuesta.

En Canvas se reemplazan las páginas mediante una transacción con historial; en el editor HTML se conserva el historial anterior. Guardado y distribución siguen el flujo normal. Verificación focalizada: 30 pruebas frontend aprobadas, incluyendo unión, texto de celda, incompatibilidad y conflictos del adaptador.

## Control estructural del libro Excel

El adaptador de hojas expone `workbook:control` además de los destinos de celda. Ese destino incluye un resumen de todas las hojas y una huella del modelo completo, de modo que cambios en celdas no incluidas en el extracto también invalidan una respuesta pendiente. La IA reemplaza el JSON completo por `{"operations":[...]}`; el servicio FastAPI define el protocolo confiable.

Operaciones: `setCells`, `addSheet`, `removeSheet`, `renameSheet`, `selectSheet`, `moveSheet`, `configureSheet`, `replaceSheet`, `insertRows`, `deleteRows`, `insertColumns`, `deleteColumns`. La configuración admite combinaciones, tamaños, paneles inmovilizados, reglas condicionales, gráficos, tablas, nombres definidos, objetos y diseño de impresión. Los cambios de filas/columnas actualizan direcciones, referencias entre hojas, rangos y metadatos asociados. Renombrar y eliminar hojas también reescribe referencias y nombres. Las operaciones se validan sobre una copia; se publican con un solo paso de deshacer y se guarda la hoja activa.

No se mezclan operaciones estructurales y destinos individuales en una respuesta. Se valida que quede una hoja, que los nombres/IDs sean únicos, las coordenadas estén dentro de Excel y los rangos/gráficos sean válidos. El contexto de celdas prioriza la hoja activa y ofrece hasta 1900 celdas, frente a 250 anteriormente. **El control de operaciones alcanza todo el libro, pero el contexto sigue siendo acotado** por los límites de destinos y caracteres; no afirmar que la IA ha leído todas las celdas de cualquier libro. No se ejecutan macros ni código recibido.

## Adjuntos de chat

El compositor permite añadir y retirar hasta 10 archivos por turno. Formatos: PDF, DOCX, XLSX, TXT, MD, CSV, TSV y JSON, además de imágenes y audio admitidos; máximo 10 MB por archivo textual, 4 MiB por archivo binario, 32 MiB codificados y 2,4 millones de caracteres textuales combinados. DOCX y XLSX se leen mediante imports diferidos, con límites de expansión ZIP; el texto extraído tiene un máximo de 800 000 caracteres por archivo. Los PDF, imágenes y audios validados se envían como Base64 **en el campo `attachments`, nunca en el contexto textual del documento**.

Contrato Angular → NestJS → FastAPI: `attachments: [{name,mimeType,text?,data?}]`. Los adjuntos seleccionados explícitamente son independientes de `includeDocumentContext`: desactivar el documento abierto no elimina los archivos que se van a enviar. NestJS valida el DTO y el presupuesto; FastAPI comprueba también Base64 y las firmas binarias. Vertex recibe adjuntos binarios mediante `inlineData` y los adjuntos textuales como partes separadas del turno. Se tratan como fuentes no confiables. NestJS acepta cuerpos de IA de hasta 64 MiB; el servidor nginx permite hasta 100 MiB.

Los archivos originales no se guardan como activos ni como contenido persistente del historial: se utilizan en el turno que los envía. Para volver a consultar directamente el archivo en otro turno debe adjuntarse de nuevo. El cambio no altera la propiedad del historial: sigue en FastAPI.

### Documentos de la base de datos (interacción multidocumento Word/Excel)

El compositor incluye el selector «Documento de la base» (botón en la barra de contexto y junto al clip de adjuntos). Permite elegir cualquier documento guardado en la base de datos del espacio de trabajo (hojas de cálculo, documentos Word, notas de bloques, LaTeX, etc.) sin cambiar la pestaña o documento activo:
- [ai-note-reader.ts](../src/app/core/utils/ai-note-reader.ts) extrae el contenido estructurado de la nota:
  - **Excel (`sheet`):** Extrae todas las hojas, nombres de tablas estructuradas, gráficos configurados, filas ordenadas numéricamente y celdas con valores calculados y fórmulas (ej. `=B2*0.13`).
  - **Word (`doc`):** Extrae páginas, encabezados (`# H1` a `###### H6`), párrafos, tablas en formato Markdown y listas con viñetas o numeración.
  - **Bloques y LaTeX:** Extrae bloques de código con su lenguaje, fórmulas matemáticas y diagramas.
- El documento leído se transporta como un `AiAttachment` de tipo `text/plain` (`[Nombre] (Excel/Word)`), sujeto al límite de 800 000 caracteres por adjunto y al presupuesto textual combinado del turno.
- **Modal de selección:** Se abre en una ventana modal centrada (`role="dialog"` con fondo oscurecido y cierre con tecla Escape o clic exterior) que presenta la lista completa de documentos con tarjetas amplias, pestañas de filtrado rápido por tipo (Excel, Word, Notas, Lienzo), selector por espacio o directorio jerárquico, barra de búsqueda en tiempo real e insignias de tipo legibles, garantizando visibilidad completa sin importar el ancho o posición de la barra lateral.
- **Interacción simultánea:** Permite tener un documento activo abierto (ej. un Word con edición directa habilitada) y adjuntar simultáneamente un libro de Excel de la base (o viceversa) para que la IA lea datos del cálculo, compare proyecciones, extraiga tablas y aplique cambios o resúmenes directamente en el documento principal.


### Imágenes adjuntas al chat

El selector del clip acepta PNG, JPEG, WebP y GIF además de documentos. Pegar una imagen en el campo del mensaje añade un adjunto con miniatura; pegar texto conserva la edición nativa del campo. El usuario puede retirar cada imagen antes de enviar o enviar imágenes sin texto para solicitar su análisis. Se mantienen los límites compartidos: 10 adjuntos, 4 MiB por archivo binario y 32 MiB entre datos Base64 y texto.

El contrato `AiAttachment.mimeType` admite `image/png`, `image/jpeg`, `image/webp`, `image/gif`; las imágenes llevan `data` en Base64, sin prefijo data URL y sin `text`. Angular identifica el formato por firma binaria, NestJS valida el contrato y FastAPI comprueba Base64, tamaño y correspondencia de firma con MIME. Vertex recibe `inlineData` con el MIME real para interpretar la imagen visualmente. SVG y formatos distintos de los indicados se rechazan. La miniatura usa los bytes locales, sin carga pública intermedia.

### Audios adjuntos al chat

El selector del clip (y pegado de archivos `audio/*`) admite también audio en Base64 hasta 4 MiB por archivo: `audio/wav`, `audio/mp3`, `audio/mpeg`, `audio/ogg`, `audio/aac`, `audio/flac`, `audio/webm` y `audio/mp4` (`.m4a`). Angular verifica la cabecera binaria y codifica a Base64 sin prefijo data URL; NestJS valida el `mimeType` y tamaño en `AiAttachmentDto`; FastAPI vuelve a comprobar Base64, el límite de 4 MiB y la firma binaria antes de enviar `inlineData` a Vertex AI.

### Generación de imágenes

`gemini-nano-banana-2.1` (predeterminado), `gemini-3.1-flash-image` y `gemini-2.5-flash-image` están disponibles en el selector de modelos de `AiService`. Además, `gemini-nano-banana-2.1` se activa automáticamente desde FastAPI cuando el usuario pide generar o crear una imagen teniendo otro modelo seleccionado (por ejemplo `gemini-3.8-flash`), sin cambiar el modelo elegido en la interfaz. Las imágenes devueltas en `images` (`[{ mimeType, data }]`) se muestran dentro de la burbuja del asistente con botón de descarga y se conservan en el historial persistente de MongoDB.

Los adjuntos son independientes del contexto del documento abierto. Como los adjuntos PDF existentes, los bytes pertenecen al envío actual: el historial persistente conserva el mensaje y los nombres, sin crear una colección o almacenamiento de imágenes en Angular/NestJS. Reiniciar backend y servicio de IA cuando se despliega este contrato.


### Inserción de tablas nativas desde la IA

Además de `setCell` y `mergeNext`, los destinos `word-table:<pageId>:<índice>` admiten `insertAfter`. La IA puede trasladar las tablas del Excel/documento adjunto al Word abierto en una sola edición, usando `after` como JSON:

```json
{"action":"insertAfter","tables":[{"title":"Muebles y Enseres","rows":[["Ítem","Cantidad","Total (Bs.)"],["Mesa",1,1500]],"header":true,"note":"Nota opcional"}]}
```

`before` debe ser el JSON completo del destino capturado. Para insertar después de un encabezado se ofrecen destinos `word-insert:<pageId>:<índice>` con la misma operación. Para «debajo de la tabla existente» se usa el destino de esa tabla, no el del encabezado: así el contenido queda antes de la siguiente subsección. Si la tabla está fragmentada entre páginas, la inserción va después de su último fragmento.

Angular valida matrices rectangulares, tipos de valores y límites (20 tablas, 500 filas por tabla, 50 columnas y 10 000 celdas en total por operación). Construye HTML nativo con `textContent`: los valores, títulos y notas no se ejecutan como HTML. Valida en copias antes de publicar el resultado. Solo reemplaza las páginas modificadas, conserva el resto del documento, aplica el estilo de tabla APA si corresponde y registra una transacción con Deshacer/Rehacer en Canvas.

Los descriptores incluyen `headingPath` que continúa entre páginas, revisión de la tabla completa y vistas previas acotadas de filas (`partial` indica recorte). La revisión permite detectar cambios aunque afecten datos fuera de la vista previa. Esto reduce el consumo del presupuesto de destinos y permite localizar secciones finales como Inversión Fija sin depender del extracto textual del cuerpo. Comprobación en el documento real: 83 tablas y 122 anclas de encabezado (205 destinos), sin truncar ningún descriptor dentro de 400 000 caracteres.

FastAPI conserva el JSON de `word-table` y `word-insert` sin aplicar limpieza Markdown a sus valores. El protocolo del sistema explica `insertAfter` y el uso de los adjuntos como fuente; NestJS mantiene el contrato existente de ediciones (target/before/after). Reiniciar IA al desplegar las instrucciones actualizadas. La edición del Word debe estar habilitada en el chat.


Límites de entrada del chat: mensaje 250 000 caracteres, contexto del documento activo y
presupuesto de edición 1 500 000, hasta 10 adjuntos con 800 000 caracteres por adjunto textual,
2 400 000 caracteres de texto y 32 MiB codificados acumulados. Los binarios mantienen su límite
individual de 4 MiB. NestJS acepta cuerpos de IA de hasta 64 MiB; nginx admite 100 MiB y espera
hasta 360 segundos. La ventana real sigue dependiendo del proveedor/modelo.
AI_MAX_DOCUMENT_CHARS permite reducir el contexto efectivo por configuración.
