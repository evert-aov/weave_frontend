# 16 — Chats y edición desde la IA principal

[Volver al índice](README.md)

## Interfaz y persistencia

El selector del asistente permite crear, cambiar, renombrar y eliminar chats. El nombre de un
chat nuevo toma el primer mensaje; puede modificarse con el modal compartido. El historial
anterior sigue disponible como «Chat principal». Cada chat conserva mensajes y paginación
independientes en MongoDB, gestionados por FastAPI. Angular no guarda mensajes ni IDs de chat
en localStorage. Al cambiar de cuenta se cancela HTTP y se limpia la identidad local.

La cabecera del agente incluye un selector de modelo que permite alternar dinámicamente entre
`Gemini 3.8 Flash` (rápido y multimodal con 1M tokens), `Gemini 2.5 Flash` (ligero y veloz)
y `Gemini 4 Argon` (razonamiento profundo). La preferencia se almacena en el cliente y viaja
en `AiChatRequest.model`.

`AiService` envía `conversationId` en chat y en las consultas de historial. Cambiar de chat
cancela la suscripción local de generación: el servidor puede terminar y conservar su respuesta
en el chat de origen, pero Angular nunca la inserta ni aplica en el nuevo chat. Borrar historial
vacía solo el seleccionado; eliminar chat además lo retira de la lista.

## Edición del documento activo

Activar «Editar documento directamente» con el contexto vinculado y el documento en modo edición
(Word, Excel y Presentaciones permiten activarlo directamente en el panel de IA sin interruptor
superior de lectura). En conversación normal, una respuesta nunca se aplica al documento. En modo edición,
FastAPI devuelve `edits` estructurados; el editor los valida y aplica automáticamente, sin copiar
texto desde el chat. El estado del panel distingue aplicación, conflicto y ausencia de cambios.
El indicador de guardado habitual sigue siendo la confirmación de persistencia en NestJS.

| Documento | Operaciones disponibles |
| --- | --- |
| Bloques | Texto enriquecido y tablas (contenido de celdas), código, fórmulas LaTeX, Mermaid, celdas de hojas y nuevos bloques de texto. |
| Word | Texto existente y nuevos párrafos por página; conserva estilos, tablas e imágenes. Participa del flujo de páginas y del historial deshacer de Word. |
| LaTeX | Reemplazos de código y adición de fuente; requiere recompilar para actualizar el PDF. |
| Hoja de cálculo | Valores, fórmulas, estilos, hojas, filas/columnas, combinaciones, gráficos, tablas y configuración del libro mediante operaciones estructurales validadas con historial. |
| Presentación | Editor temporalmente deshabilitado; conserva el archivo guardado. |
| Lienzo | Conversación sin edición automática. |

Esta versión modifica contenido textual, no diseña temas o estructuras arbitrarias de Word/PPTX,
no transforma imágenes y no cambia objetos de lienzo. El adaptador de hojas admite el modelo Angular y mantiene una rama de compatibilidad para
fachadas anteriores; solo en esa rama omite celdas enriquecidas del antiguo motor. Para el modelo
actual expone celdas existentes y, si hay pocas, posiciones vacías de un área inicial de 10 × 6,
priorizando la hoja activa, con hasta 1900 destinos de celda más `workbook:control`. El contexto sigue teniendo presupuesto; las operaciones estructurales pueden actuar sobre todas las hojas. Ver [Hojas de cálculo](18-HOJAS-DE-CALCULO.md).

## Adaptadores y conflictos

[AiDocumentService](../src/app/core/services/ai-document.service.ts) es un registro ligero de
adaptadores. Cada editor registra `owner`, `fields` y `apply` al montarse y se retira al destruirse.
El chat no importa los editores especializados; sus adaptadores operan sobre el estado del documento.
El adaptador de texto obtiene el contenido vivo, incluso antes del debounce del autoguardado.

Un destino expone `{ id, text }`. Word y Tiptap usan nodos de texto, sin atributos ni imágenes.
Cada cambio contiene `{ target, before, after }`: reemplazo literal único, o adición si `before`
está vacío. Los destinos `:append` añaden párrafos, bloques o cajas de texto. El modelo de hojas actual usa
`cell:<sheetId>:<cellId>`, por ejemplo `cell:sheet1:B3`. La fachada anterior mantiene el formato
`cell:<sheetId>:<row>:<column>` con coordenadas desde 1. Nunca se inserta HTML crudo del modelo: Word y
Tiptap convierten estructura Markdown residual en nodos DOM semánticos nativos, mientras que
Excel, PowerPoint, LaTeX, código y Mermaid normalizan el contenido a su formato propio.
Mermaid se renderiza con `securityLevel: strict`.

Antes de cambiar el primer destino se comprueba que todos existen, pertenecen al documento
capturado, conservan su texto original, admiten un reemplazo único y no exceden los límites.
Cambiar de documento, desmontar el editor o editar el mismo destino durante la generación
rechaza la respuesta. El borrado y cambio de chat invalidan también la respuesta local.
Los fallos de un motor durante la aplicación se muestran como operación incompleta; revisar
el documento antes de reintentar. No se promete una transacción distribuida entre motores.

El contexto editable admite hasta 10 000 destinos, 100 000 caracteres por destino y 1 500 000 en total
(incluyendo IDs); se informa «Contexto parcial» si hay recorte. Una respuesta contiene hasta
100 cambios y 100 000 caracteres entre fragmentos originales y nuevos. La fuente no enviada se
conserva localmente: una operación jamás sustituye el documento por un extracto truncado.
El historial guarda conversación, no instrucciones ejecutables que se vuelvan a aplicar al abrirlo.

## Pantalla completa de LaTeX

El código y el PDF tienen controles independientes. `FullscreenPanelDirective` usa la API del
navegador y, si no está disponible o se rechaza, amplía el panel a la ventana. Salir con el botón
o Escape. El componente no se recrea, por lo que conserva fuente, selección, modo Vim y PDF.
El editor compartido también ofrece esta opción dentro de bloques LaTeX.

## Verificación

```sh
npm test -- --watch=false
npm run build
```

Las pruebas cubren cambio de chat con respuesta pendiente, aislamiento, edición optativa,
conflictos, preservación de HTML/PPTX, escritura de celdas y pantalla completa sin recrear el DOM.
Usan dobles para motores y HTTP; completar una comprobación manual con los motores reales:
crear dos chats, editar en cada tipo, esperar Guardado, recargar, comprobar contenido y probar
Escape dentro de Monaco y del visor PDF. No confundir pruebas con dobles con una llamada real
al proveedor o una prueba de fidelidad visual.

### Cobertura de capítulos y errores de generación

Word prioriza encabezados de todas las páginas antes de enviar texto del cuerpo. Los IDs
siguen referidos al índice original del nodo; no son índices de la lista priorizada. El extracto
advierte cuando la cobertura es parcial. No afirmar que faltan capítulos por ausencia en un
extracto, ni considerar que una respuesta del chat confirma cambios aplicados. Los errores
502/503 muestran que falló la generación o validación y permiten reintentar por secciones.
FastAPI separa diagnósticos operativos de salidas inválidas y revalida un único intento correctivo.

### Panel compacto

La cabecera contiene el acceso a conversaciones, el título del chat, nuevo chat y cerrar.
El acceso abre una minibarra lateral con búsqueda local de títulos, selección, renombrado,
eliminación y vaciado del historial. Modelo, vinculación del documento y modo edición se
encuentran en el compositor inferior. Los avisos de contexto parcial y de aplicación siguen
visibles cuando corresponden. El panel conserva redimensionamiento y adaptación a pantallas
estrechas. La búsqueda no descarga ni indexa el contenido de los mensajes.

La revisión de escritura solicitada pertenece exclusivamente a Word, no al campo del chat;
consultar la guía de Home y estilos de Word.


El compositor admite adjuntos PDF, DOCX, XLSX y archivos de texto, así como la lectura directa de notas y libros de cálculo desde la base de datos de Weave (+ Doc de la base). Se envían como fuentes independientes del documento activo para permitir interacción y cruce entre Word y Excel. Formatos, límites y contrato de transporte: [adjuntos de chat](06-IA-Y-EXPORTACION.md#adjuntos-de-chat).


### Imágenes desde archivo o portapapeles

El campo del chat intercepta `paste` solo cuando el portapapeles contiene archivos de imagen. Reutiliza el mismo lector, estado de carga, límites y descarte al cambiar de conversación que el selector de archivos. La miniatura y el botón de retirada permiten revisar los adjuntos antes de enviarlos. PNG/JPEG/WebP/GIF viajan como `AiAttachment.data` Base64 a Vertex mediante FastAPI, incluso con el contexto del documento desactivado; no se insertan automáticamente en el documento abierto.


### Trasladar tablas de documentos adjuntos al Word

Con el Word activo y «Editar documento» habilitado, la IA puede usar un Excel adjunto (archivo o documento de la base de datos) como fuente para insertar varias tablas nativas. El destino estructural de la tabla existente admite `insertAfter`; los encabezados ofrecen `word-insert` para secciones sin tabla. La operación conserva la siguiente subsección, admite títulos/notas y usa el historial del editor. Los datos adjuntos no autorizan por sí mismos modificar otros documentos: el cambio sigue aplicándose al documento activo y a los destinos validados por la instantánea de edición.
