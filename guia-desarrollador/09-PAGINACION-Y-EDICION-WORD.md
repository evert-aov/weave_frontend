# 09 — Paginación y edición Word

[Volver al índice](README.md)

## Responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| [DocumentFlowService](../src/app/editor/pure-doc-editor/services/document-flow.service.ts) | Recomponer fragmentos y distribuir párrafos, listas y filas según el espacio disponible. |
| [document-selection.ts](../src/app/editor/pure-doc-editor/utils/document-selection.ts) | Conservar la selección y resolver el borrado en el límite entre hojas. |
| [PureDocEditorComponent](../src/app/editor/pure-doc-editor/pure-doc-editor.component.ts) | Eventos de edición, medición, renderizado Angular, historial y persistencia. |
| [DocxParserService](../src/app/editor/pure-doc-editor/services/docx-parser.service.ts) | Distinguir saltos explícitos de estimaciones y marcas de renderizado de DOCX. |
| [clipboard-table.ts](../src/app/shared/utils/clipboard-table.ts) | Reconocer y normalizar tablas HTML, texto tabulado y Markdown al pegar, compartido con el editor por bloques. |

## Las hojas pertenecen a un mismo flujo

`note.docData.v` continúa siendo `2`. Cada página contiene `id`, `html` y, opcionalmente,
`breakBefore: 'manual'`. Las páginas sin esa propiedad se redistribuyen juntas. Las páginas
antiguas, que no distinguían los saltos, se interpretan como páginas automáticas.

Un documento nuevo parte de una sola página con `<p><br></p>` y encabezado/pie vacíos.
El título pertenece a los metadatos; no se inserta automáticamente como texto del documento.
Los datos existentes y sus encabezados/pies guardados se conservan al abrirlos.

Un salto manual inicia una sección del flujo y conserva incluso una página vacía. El botón
para insertar una hoja reserva esa hoja separándola también del contenido posterior.
`Ctrl/Cmd+Enter` corta en la posición exacta del cursor, conservando el formato del texto.
Backspace al inicio de una hoja con salto manual elimina primero ese salto.

No debe inferirse un salto manual por el número de página, el tamaño de un párrafo o una
estimación del importador. En DOCX, `w:br` de tipo `page`, `w:pageBreakBefore` y los saltos
de sección admitidos son explícitos. `w:lastRenderedPageBreak` es una referencia del último
renderizado de Word y no impide que el contenido vuelva a la hoja anterior.

La exportación HTML incluye `data-break-before` para conservar la distinción al importar.
La exportación `.doc` existente sigue representando la distribución visual con saltos de hoja.

## Medición y división

En las vistas paginadas, la hoja tiene altura fija y un cuerpo flexible con `min-height: 0`.
Encabezado, pie y márgenes consumen su espacio real. El paginador recibe el `clientHeight`
del cuerpo, sin reservar un espacio adicional arbitrario.

La medición se hace con un lienzo temporal fuera de la pantalla, con el mismo ancho y
tipografía. Se adjunta a `document.body`, fuera de la transformación de zoom: comparar un
rectángulo escalado con una altura sin escalar provoca saltos prematuros o desbordamiento.
Cambiar el zoom no debe cambiar la cantidad de texto que cabe en una hoja.

El servicio recompone cada sección y la distribuye de principio a fin. Así, una eliminación
puede devolver contenido a la hoja anterior y quitar hojas automáticas sobrantes. Una pegada
extensa puede generar varias hojas en una sola redistribución.

Los bloques se dividen conservando sus nodos y estilos. El texto se mide mediante búsqueda
binaria, prefiere cortes entre palabras y respeta grafemas para conservar emoji y acentos.
Las listas mantienen la numeración; una continuación del mismo elemento no dibuja otra viñeta.
Las tablas se dividen por filas, conservando columnas y encabezados.

## Tablas pegadas

`onPagePaste` reconoce primero tablas HTML del portapapeles, antes de procesar imágenes:
algunos programas incluyen una imagen de vista previa de la misma tabla. Se inserta contenido
editable, conservando texto alrededor de la tabla, encabezados, combinaciones y formato básico.
El detector descarta scripts, atributos de eventos, alturas y metadatos ajenos al documento.
También convierte cuadrículas tabuladas de Excel/Sheets y tablas Markdown con encabezado y
separador. No usa espacios como separadores de columnas.

La inserción pasa por `executeCommand`: captura el estado anterior, inserta en la selección de
la página activa, actualiza `pages` y solicita la redistribución habitual. Deshacer/rehacer y
guardado usan las mismas rutas que el resto del documento; no se almacena otra representación
paralela de la tabla. Si termina en una tabla se añade un párrafo para continuar escribiendo.
Las herramientas de tabla existentes siguen disponibles al seleccionar una celda.

El pegado de texto normal y de imágenes solas conserva su procesamiento habitual. El formato
tabulado debe ser rectangular, y las tablas Markdown necesitan al menos dos columnas. Las
reglas comunes están documentadas en [editor por bloques](03-EDITOR-POR-BLOQUES.md).

Los atributos `data-word-flow` y `data-word-continuation` identifican las partes de un mismo
bloque. Solo esos bloques se vuelven a unir. Dos tablas consecutivas con la misma cantidad
de columnas siguen siendo tablas independientes. No eliminar estos atributos al guardar HTML.

## Cursor, entrada e historial

Antes de redistribuir se insertan comentarios temporales en los extremos de la selección.
Los comentarios viajan con los fragmentos y permiten restaurar el cursor en la hoja correcta.
`withoutSelectionMarkers` los elimina del estado que se guarda; nunca deben llegar a `docData`.
El renderizado pendiente se aplica también a la hoja activa y evita guardar un DOM intermedio
durante los eventos de desenfoque.

`beforeinput` captura el estado anterior a la edición. La escritura consecutiva se agrupa;
pegado, borrado y operaciones estructurales conservan sus transacciones. Deshacer/rehacer
restaura páginas y selección. No sobrescribir un snapshot previo con el HTML ya modificado.

Backspace al inicio y Suprimir al final conectan las hojas adyacentes. Si ambas contienen
partes del mismo párrafo, se borra un grafema; entre párrafos diferentes se elimina la separación.
Las flechas izquierda/derecha también cruzan los extremos de las hojas. Los párrafos vacíos
dentro de una hoja siguen siendo contenido editable y se borran antes de cruzar de página.

La redistribución se agrupa con `requestAnimationFrame`. Durante composición de teclado/IME
se espera a `compositionend`. Cambios de tamaño, fuentes cargadas, imágenes y configuración
de página solicitan una nueva medición. Observadores y callbacks se liberan al cerrar el editor.

La última distribución se conserva junto con el ancho, alto y tipografía de medición.
Notificaciones repetidas con HTML y geometría idénticos no vuelven a clonar ni medir el
documento. La carga de fuentes o imágenes invalida expresamente ese resultado, aunque el
HTML siga igual. El observador de tamaño solo se reconecta si cambia el elemento observado.

Aplicar el resultado del paginador no solicita otra paginación por sí mismo; las operaciones
estructurales sí solicitan una después del renderizado. Al eliminar una hoja se captura una
única instantánea para el historial y se reutiliza para publicar las hojas restantes. El
renderizado compara el HTML antes de escribir para conservar el DOM de las hojas sin cambios.
El algoritmo de corte busca límites de grafema sin crear un arreglo con todo el texto restante
por cada hoja. Estas reglas evitan trabajo repetido y asignaciones grandes al borrar páginas.

## Guardado y restauración

`documentReady` es un Signal: publica cuándo terminó la hidratación y habilita la edición.
El autoguardado observa páginas y configuración, y los eventos de entrada también programan
el guardado directamente después de actualizar el estado. Así no depende de que Angular
ejecute su efecto antes de desmontar el componente. Al cambiar o cerrar una pestaña interna,
se captura el último DOM editable y se conserva el ID del documento que produjo ese contenido.
Si hay un renderizado pendiente (deshacer, importar o redistribuir), se usa el estado nuevo y
se evita capturar un DOM anterior.

La preparación asíncrona de imágenes se completa en orden. El guardado conserva `loadedNoteId`,
sin atribuir una edición anterior al nuevo `@Input note`. La carga también conserva su versión
y documento de origen para descartar resultados de una hidratación anterior.

La hidratación usa `renderDocumentPages` y sincroniza el HTML explícitamente al terminar.
Actualizar solo el Signal `pages` deja un caso con IDs de página reutilizados en el que el
estado contiene texto guardado, pero el `contenteditable` sigue mostrando una hoja vacía.
Importar ya usaba el renderizado explícito; abrir un documento ahora utiliza la misma ruta.
La hidratación establece la referencia inicial para evitar guardar un documento sin cambios.

Las pruebas de [word-autosave.spec.ts](../src/app/editor/pure-doc-editor/word-autosave.spec.ts)
comprueban escritura sin importar, edición de archivos existentes, restauración visible al
reabrir, cierre inmediato, última pestaña interna, cambio de documento, tablas, deshacer/rehacer
y preparación lenta de imágenes. Comprueban el payload HTTP, además del estado interno.

## Verificación

Desde `frontend/`:

```sh
npm test -- --watch=false
npm run build
```

Las pruebas cubren pegadas de varias páginas, conservación del texto y formato, retorno de
contenido, listas, tablas, saltos manuales, importación DOCX, cursor y deshacer/rehacer.
JSDOM no calcula geometría tipográfica: las pruebas del algoritmo inyectan una medición
determinista; el código de producción usa la geometría real del navegador.

Para comprobar visualmente en el navegador:

1. Pegar un párrafo largo con negritas y una lista numerada. Verificar que use el espacio útil
   hasta la última línea y continúe sin perder texto ni repetir la numeración.
2. Borrar texto de la primera hoja y comprobar que el texto posterior vuelva a ocuparla.
3. Pulsar Backspace al inicio de la segunda hoja y Suprimir al final de la primera.
4. Deshacer y rehacer, comprobando contenido, páginas y posición del cursor.
5. Cambiar márgenes y orientación; repetir con zoom al 75 %, 100 % y 150 %.
6. Insertar un salto manual dentro de un párrafo, guardar, reabrir y eliminar el salto.
7. Eliminar una hoja de un documento largo y comprobar que el trabajo termine, que no se
   mantenga paginando en reposo y que deshacer recupere el contenido eliminado.

## Alcance

Las vistas web, borrador y esquema conservan su comportamiento sin paginación automática.
Una fila individual, celdas con `rowspan`, imágenes y objetos no editables se mantienen enteros.
Si un objeto indivisible supera el área útil, se conserva aunque desborde: el paginador no lo
descarta ni intenta dividirlo indefinidamente. Su ajuste requiere una operación específica.
Este motor HTML no reproduce todas las reglas de composición de Microsoft Word, como
control de viudas/huérfanas, notas al pie o división de una celda entre varias hojas.
