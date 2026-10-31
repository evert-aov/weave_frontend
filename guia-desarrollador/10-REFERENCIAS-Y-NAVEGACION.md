# 10 — Referencias y navegación entre documentos

[Volver al índice](README.md)

## Flujo del usuario

En Word, abrir la pestaña **Insertar** y pulsar **Referencia**. En el texto enriquecido de un
documento por bloques, usar **Referencia** en la barra del bloque. El selector permite buscar
por nombre o carpeta y elegir cualquier tipo de documento accesible al usuario. Si había texto
seleccionado, ese texto se convierte en enlace; con el cursor vacío se inserta el título del destino.

| Acción | Resultado |
| --- | --- |
| Clic sobre la referencia | Abre el destino dentro de Weave y conserva las pestañas existentes. |
| Ctrl+O sobre la referencia | Abre el enlace bajo el cursor de texto, el enlace enfocado o el señalado por el ratón. |
| Ctrl+I | Vuelve al documento anterior del historial de saltos. |
| Flechas de la cabecera | Retrocede o avanza por el historial. |
| Copiar enlace de la cabecera | Copia una URL que identifica el documento activo. |

También se admite Cmd en lugar de Ctrl. Estos atajos siguen la asignación solicitada para Weave.
Ctrl+I tiene prioridad sobre cursiva cuando existe un documento anterior; sin historial se
conserva el comportamiento del editor. Los campos de formularios, el chat y los diálogos
conservan sus atajos. Los enlaces externos conservan el comportamiento anterior.

El estilo compartido de [document-links](../src/app/shared/styles/_document-links.scss) muestra
los enlaces azules y subrayados, con azul claro sobre fondos oscuros, resaltado al pasar el
puntero y contorno de foco al navegar con teclado. Se aplica en ambos editores, también dentro
de texto con formato, para que las referencias se distingan del contenido normal.

## Representación y persistencia

Una referencia es un enlace HTML ordinario:

```html
<a href="/?document=507f1f77bcf86cd799439011">Documento relacionado</a>
```

El ID mantiene el destino después de renombrar o mover un archivo; el texto del enlace conserva
la etiqueta elegida al insertarlo. Word lo guarda en `docData.pages[].html` y Tiptap en
`blocks[].content.html`, usando el autoguardado existente. No se añaden colecciones ni copias de
documentos al historial de navegación. El selector lee únicamente `GET /api/notes?view=summary`
y no cambia la carpeta activa ni descarga el contenido de todos los archivos.

Al abrir un destino se consulta su detalle mediante la API autenticada habitual. Una respuesta
fallida conserva el archivo actual y muestra un aviso; no añade una entrada al historial.
El parámetro `document` permite abrir URLs copiadas y se conserva durante login/registro.
La validación de enlaces internos comprueba origen, ruta e ID; un enlace de otro sitio no se
convierte en una petición interna.

## Responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| [document-link.ts](../src/app/core/utils/document-link.ts) | Crear y reconocer URLs de documentos. |
| [DocumentReferenceService](../src/app/core/services/document-reference.service.ts) | Coordinar selección/cancelación sin importar motores de edición. |
| [DocumentReferencePickerComponent](../src/app/shared/components/document-reference-picker/document-reference-picker.component.ts) | Buscar metadatos, teclado, foco y selección del destino. |
| [DocumentHistoryService](../src/app/core/services/document-history.service.ts) | Lista de saltos, índice, posiciones y ramas del historial. |
| [DocumentNavigationService](../src/app/core/services/document-navigation.service.ts) | Abrir archivos, retroceder/avanzar y comunicar errores. |
| [DocumentReferencesDirective](../src/app/shared/directives/document-references.directive.ts) | Interceptar clic y atajos antes de los motores y gestionar el retorno. |
| [document-position.ts](../src/app/shared/utils/document-position.ts) | Capturar y restaurar selección y desplazamiento sin almacenar nodos DOM. |

`NotesService` registra una entrada después de cargar un documento correctamente, incluyendo
selecciones desde la navegación normal. Volver/avanzar mueve el índice sin añadir entradas;
seguir un destino nuevo después de volver descarta la rama futura. El historial conserva como
máximo 100 entradas en memoria y se limpia al cerrar sesión. Es independiente de la lista de
pestañas y del deshacer/rehacer del contenido.

El retorno conserva desplazamiento y posiciones de texto dentro de páginas o bloques, con IDs
y offsets de texto. Un observador espera al montaje/hidratación de Angular para restaurarlos,
sin forzar la descarga de motores especializados. Se libera al completar el retorno, navegar
de nuevo o destruir el editor, con un límite de espera de 15 segundos. Si una edición o una
redistribución eliminó el contenedor original, la navegación funciona aunque no pueda recuperar
esa posición exacta. El historial no se persiste entre sesiones del navegador.

La selección para insertar referencias se captura antes de abrir el selector. El texto
enriquecido conserva también el ID del documento propietario al guardar: una notificación tardía
de desenfoque o destrucción no debe aplicar contenido al archivo de destino ni perder la edición
del origen. `updateBlockContent` admite ese ID y solo usa documentos completos de la caché.

## Verificación

Desde `frontend/`:

```sh
npm test -- --watch=false
npm run build
```

Las pruebas cubren enlaces válidos/externos, selector, inserción y serialización en Word/Tiptap,
clic, Ctrl+O, prioridad de Ctrl+I, retorno de selección/scroll, historial con ramas, errores de
acceso, URLs directas, login y guardado pendiente del origen. Los contratos HTTP se verifican
con `HttpTestingController`; no usan una conexión real a MongoDB.

Comprobar manualmente con dos documentos: crear una referencia, seguirla con clic, volver con
Ctrl+I y repetir con Ctrl+O. Probar desde edición y lectura, desde carpetas distintas y después
de recargar la URL. La interacción con un navegador real y los atajos reservados por el sistema
no se deducen de la compilación ni de JSDOM.
