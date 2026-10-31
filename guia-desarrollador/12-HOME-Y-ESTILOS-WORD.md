# Home y estilos del documento Word

Home reúne los grupos Formato, Fuente, Párrafo, Estilos y Edición. La galería incluye
Normal y Título 1–6. El botón principal aplica el estilo a los párrafos seleccionados;
la flecha de cada tarjeta, o su menú contextual, ofrece **Actualizar para que coincida
con la selección** y acceso al diseñador de estilos.

## Actualizar un encabezado desde una muestra

1. Escribir o seleccionar un texto y darle el formato deseado: por ejemplo, Arial Black,
   18 pt y negrita.
2. Abrir las opciones de H1 y pulsar «Actualizar H1 para que coincida con la selección».
3. Todos los H1 del documento reciben la nueva definición, también los de otras páginas,
   tablas y secciones. H2–H6 conservan sus propias definiciones.
4. Al aplicar H1 a otro párrafo se utiliza el estilo actualizado.

La selección puede ser una muestra en un párrafo normal. Actualizar la definición no
cambia por sí mismo ese párrafo a H1: para hacerlo, pulsar después la tarjeta Título 1.
La captura toma el formato del primer texto de la selección; conviene usar una muestra
con formato uniforme. Las fuentes usan las disponibles en el equipo y sus alternativas
CSS; seleccionar una fuente no instala sus archivos.

## Responsabilidades

| Archivo | Función |
| --- | --- |
| `components/word-home-toolbar/` | Galería, menús y controles; emite acciones sin escribir el documento. |
| `components/word-search-panel/` | Campos, opciones y acciones del panel de búsqueda. |
| `components/word-ribbon/` | Integra Home con el resto de pestañas del editor. |
| `utils/document-formatting.ts` | Captura del estilo, aplicación uniforme, párrafos seleccionados e índice de búsqueda. |
| `utils/heading-numbering.ts` | Contador jerárquico H1–H6 y prefijos generados, continuaciones y títulos importados. |
| `utils/home-editing.ts` | Transformaciones de texto y formato de párrafos conservando el DOM. |
| `pure-doc-editor.component.ts` | Selección, transacciones, historial, paginación y autoguardado. |

No se añade otro motor ni dependencias de ejecución. Los componentes siguen dentro del
editor Word cargado de forma diferida.

## Definiciones y persistencia

`ElementStyleRule` describe fuente, tamaño exacto en puntos, peso, cursiva, subrayado,
tachado, color, fondo, alineación, interlineado, espaciados y sangrías. Los campos nuevos
son opcionales para mantener la compatibilidad con documentos guardados.

Las plantillas incorporadas son inmutables. Actualizar una de ellas crea
`document-styles`, una plantilla personalizada del documento; las siguientes
actualizaciones reutilizan esa definición. Si la plantilla activa ya es personalizada,
se actualiza su propia copia. `docData.customTemplates` y `activeTemplateId` se guardan
junto a las páginas mediante el autoguardado existente y se restauran al abrir el archivo.
No se escriben preferencias globales ni se cambian otros documentos.

La aplicación recorre todos los elementos del nivel correspondiente en las páginas vivas.
Los formatos directos en `span`, `font`, `strong`, `em` y otros elementos de texto se
normalizan para que no oculten el nuevo estilo. Se conservan el texto, los identificadores,
las imágenes, las tablas y los destinos de enlaces. La actualización vuelve a calcular la
paginación; los saltos manuales mantienen su significado.

## Selección, historial y controles

La cinta recuerda el rango del documento antes de que un selector o campo numérico tome
el foco. Se valida que siga perteneciendo al documento abierto antes de ejecutar la acción.
Los comentarios temporales de selección permiten modificar el DOM y recuperar el rango;
no se incluyen en el JSON persistido.

Deshacer y rehacer guardan tanto las páginas como la colección de plantillas y su ID
activo. Redefinir un estilo se revierte en una sola operación, incluso cuando todavía no
existe ningún encabezado de ese nivel.

Fuente permite tamaños de 1–400 pt, incrementos y decrementos, mayúsculas/minúsculas,
formato de caracteres, colores, resaltado, sombra y contorno. Los efectos actúan sobre
texto seleccionado. Los cambios de fuente o tamaño con el cursor sin selección se
conservan para el siguiente carácter, sin insertar texto de ejemplo ni caracteres ocultos.

Párrafo incorpora listas, variantes de viñetas/numeración, listas multinivel con sangría,
alineación, interlineado, espaciados, sombreado y bordes. Ordenar actúa sobre párrafos
hermanos de una misma sección para conservar la estructura de tablas y columnas. Las
marcas de párrafo son presentación mediante CSS: no se guardan ni exportan o imprimen.

## Estado real de la fuente y subíndices

La barra y los botones de aumentar/reducir tamaño usan `selectionStyle()` con el mismo
rango. `selectionElement()` busca el primer texto editable seleccionado dentro de sus
marcas y resuelve el formato del carácter cuando el cursor está entre elementos.
Ignora los textos vacíos creados por los marcadores de selección y los prefijos de
numeración. Esto evita mostrar la fuente del contenedor cuando el texto usa otra
familia o volver al tamaño del párrafo al aumentar varias veces un fragmento.

El selector de familia usa el enlace de Angular Forms, que actualiza su valor después
de registrar las opciones, incluso para fuentes importadas. `inheritedStyle()` admite
valores heredados y las etiquetas `font face` antiguas. Los formatos pendientes para
escritura se invalidan al mover el cursor a otro rango.

Subíndice y superíndice se aplican mediante `applyScript()`, con posición vertical y
un tamaño explícito del 75 % del tamaño base. `data-word-base-size` conserva el tamaño
original para volver a la línea base; `data-word-script` identifica el modo. Los modos
son excluyentes y pulsar de nuevo el botón activo lo desactiva. La transformación separa
solo la rama seleccionada de las marcas antiguas `sub`, `sup` y los estilos equivalentes,
conservando los caracteres vecinos y enlaces. También funciona sin selección para el
siguiente carácter. Las reglas CSS de `sub/sup` anulan los resets para los documentos
importados. Se conserva la transacción común de deshacer y autoguardado.

## Títulos numerados vinculados a H1–H6

En Home → Párrafo → **Lista multinivel y títulos**, elegir
**Títulos H1–H6: 1, 1.1, 1.1.1**. Cada nivel continúa en el orden del documento,
independientemente de la página. Un H1 reinicia H2–H6; un H2 reinicia H3–H6, etc.
Se pueden escribir nombres como «CAPÍTULO 1: FUNDAMENTACIÓN TEÓRICA» dentro de H1;
el prefijo numérico y la tipografía del estilo son responsabilidades independientes.
Los títulos mantienen sus etiquetas `h1`–`h6` y aparecen con sus números en el panel
de navegación y en los índices nuevos. Los índices ya insertados se regeneran usando
la acción de insertar índice, como para cualquier cambio de título.

`docData.headingNumbering` guarda la activación. Cada prefijo generado es un `span`
con `data-word-heading-number` y `contenteditable="false"`. Su contenido es HTML real,
de modo que se conserva al guardar, imprimir y exportar, y hereda la tipografía del
encabezado. No se implementa mediante contadores CSS que se reinicien en cada hoja.
Deshacer y rehacer incluyen el modo de numeración junto con páginas y estilos.

`renumberHeadings()` es idempotente: solamente modifica el DOM si hay números que
cambiar, normalizar o eliminar. Se ejecuta tras editar, aplicar estilos, restaurar páginas
y paginar. Las continuaciones automáticas de un mismo encabezado no generan otro número
ni otra entrada de navegación. Los prefijos se consideran auxiliares al mover o borrar
en los bordes entre hojas. Convertir un encabezado en párrafo elimina su prefijo generado.

**Títulos sin numeración automática** quita solamente los prefijos administrados por el
editor. Los números escritos o importados como texto se conservan: se reconocen como
puntos de partida cuando tienen tantos componentes como el nivel H correspondiente.
Por ejemplo, un H1 que comienza por `5. ` hace que el siguiente H2 automático sea `5.1`.
Esos números manuales conservan su valor al reordenarlos; para una numeración enteramente
automática, los títulos deben contener el nombre sin un prefijo numérico escrito.

## Buscar y reemplazar

Buscar funciona con texto literal, distinguiendo opcionalmente mayúsculas o palabras
completas. El índice une los fragmentos de texto de cada párrafo, de modo que una palabra
sigue siendo localizable aunque tenga varios formatos. Los límites entre párrafos no se
tratan como una palabra continua. Los resultados recorren todas las páginas.

Enter localiza el siguiente resultado; Shift+Enter, el anterior. Reemplazar localiza primero
una coincidencia si no hay una seleccionada. Reemplazar todo procesa los rangos de atrás
hacia adelante, usa nodos de texto para el reemplazo y crea una sola operación de historial.
Un reemplazo vacío elimina la coincidencia; el texto con `<` o `>` nunca se interpreta como
HTML. Ctrl+F y Ctrl+H abren los paneles dentro del editor. Ctrl+O y Ctrl+I mantienen la
[navegación de referencias](10-REFERENCIAS-Y-NAVEGACION.md).

## Verificación

`word-home.spec.ts` cubre la actualización global de H1, formatos anidados, conservación
de otros niveles y enlaces, reapertura, historial de definiciones, selección entre páginas,
tamaños exactos, recuperación del foco, escritura posterior, acciones de párrafo,
transformaciones de texto y búsqueda/reemplazo. Las pruebas de la cinta real comprueban
el valor visible del selector al cambiar la selección, aumentos repetidos y los botones
de subíndice/superíndice. Se cubren también la numeración entre páginas, los reinicios
por nivel, los números importados, las continuaciones y el guardado/reapertura del modo. La suite de autoguardado comprueba el
contrato de persistencia con `NotesService` y peticiones HTTP simuladas.

```sh
npm test -- --watch=false
npm run build
```

Las pruebas DOM no sustituyen la revisión de tipografías instaladas, renderizado visual,
entrada por composición y comandos nativos de edición en los navegadores admitidos.
