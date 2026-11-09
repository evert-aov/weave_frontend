# Exportación DOCX de Word

El botón Archivo → DOCX y la acción de exportar de la cabecera comparten el mismo flujo.
Se toma el HTML vivo, se preparan las imágenes y se crea un paquete OpenXML. Un fallo de
imagen cancela la descarga y se muestra al usuario; ya no se reemplaza una figura por su
texto alternativo. El texto alternativo se conserva como descripción accesible del dibujo.

## Distribución de responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| `services/docx-export.ts` | Coordinación, partes, tipos MIME, estilos, encabezado y compresión. |
| `services/docx-document-writer.ts` | Párrafos, listas, tablas, secciones, enlaces, marcadores y campos PAGEREF. |
| `services/docx-formatting.ts` | Propiedades de cada fragmento de texto y conversión de unidades. |
| `services/docx-media.ts` | Descarga/conversión de imágenes, dimensiones, binarios y DrawingML. |
| `services/docx-notes.ts` | Llamadas y partes nativas de notas al pie y finales. |
| `services/docx-package.ts` | ZIP binario para el constructor síncrono y orden de propiedades OpenXML. |
| `services/docx-flow.ts` | Unión de fragmentos creados por la paginación automática del editor. |
| `services/docx-note-import.ts` | Recuperación de notas y reconocimiento del encabezado APA al reimportar. |

`createDocxFile` es el límite asíncrono utilizado por el editor. Resuelve los recursos y
carga `fflate` mediante importación dinámica para comprimir las partes XML; los archivos de
imagen ya comprimidos se guardan sin recomprimir. `createDocxBlob` conserva una API
síncrona para activos ya preparados y pruebas estructurales, con ZIP binario sin compresión.
No se añade una biblioteca de documentos completa ni una dependencia de arranque.

## Imágenes

- PNG, JPEG, GIF y BMP se incrustan con sus bytes originales en `word/media/`.
- SVG en línea, SVG como imagen y formatos que requieran conversión, como WebP, se
  dibujan a PNG mediante el navegador. El formato debe poder ser decodificado por este.
- Se admiten fuentes `data:`, `blob:`, rutas relativas y HTTP(S). Los mismos orígenes usan
  las credenciales habituales del navegador; los recursos externos deben permitir su descarga.
- Se descarga cada URL una vez, con un máximo de cuatro tareas simultáneas y tiempo
  límite. Cada ocurrencia tiene un dibujo con su propio tamaño y descripción.
- Se conservan los tamaños del editor, convirtiendo píxeles a EMU. Los límites del área
  útil y de las celdas se aplican sin deformar la imagen; una figura con leyenda reserva
  espacio vertical para el título.
- Las relaciones `image` y los tipos de contenido apuntan a partes internas. El DOCX
  descargado puede abrirse sin conexión y no necesita la URL original para mostrar la figura.

Los encabezados y pies generales también pueden contener imágenes. El encabezado APA
usa el campo PAGE y, en modo profesional, el título abreviado; los pies generales ocultos
por el modo APA no se añaden al archivo.

## Reglas de formato

La exportación conserva fuente y tamaño, negrita/cursiva, subíndices y superíndices,
colores, alineación, doble espacio, sangrías, citas en bloque y las excepciones de portada,
resumen, notas y referencias. Los niveles 4/5 se exportan en un párrafo con título en
negrita y cuerpo normal. Sus marcadores permiten reconstruirlos como títulos en línea al
reimportar. Los encabezados normales tienen nivel de esquema; las listas usan numeración
OpenXML y las combinaciones de tabla usan gridSpan/vMerge.

Las propiedades de párrafo, caracteres y celdas se ordenan conforme a sus secuencias
OpenXML antes de empaquetar. APA usa Carta, márgenes de 1440 twips, encabezado a 720 twips,
PAGE desde 1 y separación automática de palabras desactivada. Las referencias incluyen
hipervínculos reales para DOI/URL. El índice enlaza a marcadores estables y usa campos
PAGEREF con puntos guía; sus números se pueden recalcular en Word. El índice completo también contiene un campo TOC nativo (niveles 1–5 para APA, 1–6 en general),
con estilos TOC1–TOC6: Word puede regenerar sus entradas desde los encabezados.

## Paginación y notas

Los fragmentos `data-word-flow` / `data-word-continuation` vuelven a unirse en sus
párrafos, listas y tablas originales. Se eliminan las copias de encabezados repetidos
creadas por la vista del editor. Solo los saltos manuales se exportan como saltos explícitos;
Word calcula su paginación automática con sus fuentes y las notas nativas.

Las llamadas de notas son `w:footnoteReference` / `w:endnoteReference`, con partes propias
`word/footnotes.xml` y `word/endnotes.xml`, separadores y numeración decimal. Las notas al
pie usan fuente menor e interlineado sencillo. Las notas finales usan doble espacio y la
fuente del texto, con el título Notas; una sección antes de los apéndices las sitúa después
del cuerpo/referencias. Los bloques de notas de la vista HTML no se duplican en el cuerpo.

El importador recupera las llamadas y su contenido, las dimensiones y descripciones de
imágenes y el encabezado APA sencillo. La biblioteca de fuentes bibliográficas no se
reconstruye automáticamente desde citas y referencias de un DOCX; su texto visible sí se
conserva. El motor no reproduce cada característica posible de Word; la paginación puede
variar con las fuentes instaladas en el equipo que abre el archivo.

## Verificación

`services/docx-export.spec.ts` descomprime los paquetes y comprueba bytes de imagen,
dimensiones, relaciones, tipos MIME, texto alternativo, errores de recursos, notas nativas,
fuentes, sangrías, hipervínculos, índices y unión de párrafos. Reimporta un paquete generado
para comprobar imágenes, notas con varias líneas, títulos en línea y encabezado APA.
Las pruebas de tablas cubren las combinaciones y las de listas su numeración real.

## Fidelidad con Word y nombre del archivo

La exportación utiliza el nombre actual de la nota/pestaña; el título interno de una importación
anterior no decide el nombre descargado. Se elimina una extensión `.doc`/`.docx` previa antes
de añadir `.docx`, evitando nombres duplicados.

`docx-live-snapshot.ts` captura estilos calculados de las páginas montadas sin modificar el
contenido editable. Esto resuelve reglas CSS `!important` de tablas y estilos heredados.
Alturas de línea físicas (px/pt) se traducen a twips con `lineRule=exact`; dibujos en línea
usan `atLeast` para no recortar imágenes. Los multiplicadores lógicos, también en la instantánea, conservan
la semántica OpenXML `auto` mediante `data-word-line-spacing`. El párrafo vacío con un único BR se exporta como una sola línea.
Los saltos manuales se aplican al párrafo siguiente; ante tablas se usa un separador de altura
mínima. Los saltos automáticos siguen bajo control del motor de Word.

Una entrada del índice flex se convierte en un único párrafo con tabulación y PAGEREF;
la sangría y el texto de título/número se conservan y la indentación del HTML no genera BR.
El campo TOC permite actualizar desde Word. El paquete declara compatibilidad Word 2013+
(modo 15, como el documento de referencia examinado). Las tablas conservan proporciones de
colgroup, combinaciones, anchos de celda, disposición fija, padding y alineación vertical.

Las pruebas validan XML, campos, tamaños y datos; no sustituyen abrir el resultado en Microsoft
Word. Fuentes disponibles y diferencias de los motores pueden cambiar la paginación restante.

## Importación de índices nativos de Microsoft Word

`docx-toc-import.ts` interpreta campos TOC complejos que cruzan párrafos, resultados de
campos anidados PAGEREF, TOC simples, controles SDT y estilos TOC/TDC localizados.
Lee solo texto visible (`w:t` y tabuladores); las instrucciones `instrText` y el texto eliminado
no pasan al contenido. Los párrafos que solo abren/cierran el campo no crean líneas vacías.
Una referencia PAGEREF normal fuera del índice no se clasifica como índice.

Las entradas importadas utilizan `.word-toc-entry` con título, puntos y número separados,
alineación izquierda, sangrías por nivel, formato de los runs y etiquetas romanas preservadas.
Los bloques se agrupan por página en `.word-toc-page-section[data-native-word-toc]`, compatibles
con Actualizar índice y con el exportador DOCX. El título del índice es un bloque de cabecera,
no un H1 que contamine la navegación de capítulos. Los bookmarks originales se vinculan con
IDs únicos del HTML y las filas apuntan al encabezado real, sin navegar a una página supuesta.

Verificación con el XML real de `Parcial_1.docx`: 88 filas nativas, 88 filas importadas con
número y destino resuelto, ninguna fila centrada ni en el formato legado `docx-toc-row`.
El archivo privado no se incluye como fixture del repositorio; las pruebas pequeñas reproducen
campos entre párrafos, SDT, referencias cruzadas, numeración romana y cursivas.

## Índice continuo y actualización tras importar

El índice muestra una sola cabecera; sus páginas siguientes no llevan «continuación».
Al exportar, los fragmentos que comparten `data-word-toc` forman un único flujo: no se
exportan sus saltos de página sintéticos ni párrafos de relleno. Se conserva el salto antes
del capítulo siguiente. Cada entrada lleva `keepLines` para mantener juntos título y número.

Después de repaginar, WordTocController compara una firma de los encabezados reales (ID,
texto, nivel y página). Si cambia y ya existe un índice, lo reconstruye desde los títulos,
también cuando procede de Word. No crea índices ausentes, no añade pasos de deshacer y
conserva la página de edición; las firmas evitan reconstruirlo al escribir en otros párrafos
sin cambios de paginación. En los índices importados se conserva la tipografía de las filas.
En Microsoft Word el campo TOC exportado se actualiza con **Actualizar toda la tabla**.
Las pruebas incluyen Word → Weave → nuevo H2 → actualizar → DOCX → reimportar.

## Aprovechamiento del área útil del índice

`toc-pagination.ts` distribuye las entradas con una copia de medida de ancho real, fuera del
contenedor transformado por zoom. Usa la altura útil de la página y la altura efectiva de
las filas, contando la cabecera solo en la primera página. No reserva 80 píxeles más dos filas
ni agrega un párrafo vacío al final de cada fragmento. Las filas permanecen indivisibles.
Al abrir un índice existente se redistribuye; también responde a cambios de tamaño/márgenes.
Si el editor todavía no tiene geometría utilizable, conserva el cálculo aproximado como respaldo.
La prueba en navegador comprueba que no quepa otra fila en cada página completa y que el
resultado sea idéntico con zoom 100 % y 50 %.

El interlineado lógico tiene prioridad sobre los píxeles de la instantánea: `data-word-line-spacing="2"` se exporta como `w:line="480" w:lineRule="auto"` (Doble nativo en Word). Los estilos TOC APA también usan 480/auto. Las alturas fijas sin multiplicador lógico mantienen la regla exacta; los márgenes APA son 1440 twips por lado.
