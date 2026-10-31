# 16 — Chats y edición desde la IA principal

[Volver al índice](README.md)

## Interfaz y persistencia

El selector del asistente permite crear, cambiar, renombrar y eliminar chats. El nombre de un
chat nuevo toma el primer mensaje; puede modificarse con el modal compartido. El historial
anterior sigue disponible como «Chat principal». Cada chat conserva mensajes y paginación
independientes en MongoDB, gestionados por FastAPI. Angular no guarda mensajes ni IDs de chat
en localStorage. Al cambiar de cuenta se cancela HTTP y se limpia la identidad local.

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
| Hoja de cálculo | Valores y fórmulas mediante la fachada viva de Univer; conserva formato de celda. |
| Presentación | Texto de cajas/formas, segmentos enriquecidos y nuevas cajas de texto mediante la API del visor PPTX. |
| Lienzo | Conversación sin edición automática. |

Esta versión modifica contenido textual, no diseña temas o estructuras arbitrarias de Word/PPTX,
no transforma imágenes y no cambia objetos de lienzo. Las celdas con documentos enriquecidos
internos de Univer se omiten para no sustituirlos por valores vacíos. Las hojas exponen celdas
pobladas y un área inicial vacía de 12 × 8 para agregar datos, dentro del presupuesto general.

## Adaptadores y conflictos

[AiDocumentService](../src/app/core/services/ai-document.service.ts) es un registro ligero de
adaptadores. Cada editor registra `owner`, `fields` y `apply` al montarse y se retira al destruirse.
El chat no importa Monaco, Univer ni el visor PPTX: esos motores siguen en sus chunks diferidos.
El adaptador de texto obtiene el contenido vivo, incluso antes del debounce del autoguardado.

Un destino expone `{ id, text }`. Word y Tiptap usan nodos de texto, sin atributos ni imágenes.
Cada cambio contiene `{ target, before, after }`: reemplazo literal único, o adición si `before`
está vacío. Los destinos `:append` añaden párrafos, bloques o cajas de texto. Las coordenadas
`cell:<sheetId>:<row>:<column>` empiezan en 1. Nunca se inserta HTML crudo del modelo: Word y
Tiptap convierten estructura Markdown residual en nodos DOM semánticos nativos, mientras que
Excel, PowerPoint, LaTeX, código y Mermaid normalizan el contenido a su formato propio.
Mermaid se renderiza con `securityLevel: strict`.

Antes de cambiar el primer destino se comprueba que todos existen, pertenecen al documento
capturado, conservan su texto original, admiten un reemplazo único y no exceden los límites.
Cambiar de documento, desmontar el editor o editar el mismo destino durante la generación
rechaza la respuesta. El borrado y cambio de chat invalidan también la respuesta local.
Los fallos de un motor durante la aplicación se muestran como operación incompleta; revisar
el documento antes de reintentar. No se promete una transacción distribuida entre motores.

El contexto editable admite hasta 200 destinos, 15 000 caracteres por destino y 24 000 en total
(incluyendo IDs); se informa «Contexto parcial» si hay recorte. Una respuesta contiene hasta
30 cambios y 30 000 caracteres entre fragmentos originales y nuevos. La fuente no enviada se
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
