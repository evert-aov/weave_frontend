# Home y estilos del documento Word

La cinta agrupa la importación y todas las exportaciones en **Archivo / File**, antes de Home.
Conserva importar Word/HTML/Markdown/TXT y exportar DOCX, DOC, HTML, Markdown, TXT y PDF.
Los grupos comparten un contenedor con scroll horizontal cuando no caben; las pestañas
Importar y Exportar ya no se muestran por separado. Los eventos y motores siguen siendo los mismos.

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
| `pure-doc-editor.component.ts` | Coordinación Angular, señales compartidas, ciclo de vida, puente de IA y delegación de eventos. |
| `controllers/word-formatting.controller.ts` | Selección, comandos de Home, estilos, plantillas y formato pendiente. |
| `controllers/word-persistence.controller.ts` | Hidratación, autoguardado, serialización y deshacer/rehacer. |
| `controllers/word-flow.controller.ts` | Mapas DOM, medición, publicación de páginas y repaginación. |
| `controllers/word-input.controller.ts` | Entrada, composición, teclado y borrado en los límites entre páginas. |
| `controllers/word-layout.controller.ts` | Columnas, configuración de página, saltos, encabezados y pies. |
| `controllers/word-insert.controller.ts` | Inserción de texto, enlaces, referencias y bloques HTML. |
| `controllers/word-media.controller.ts` | Imágenes, pegado, arrastre, formas, iconos y fórmulas LaTeX. |
| `controllers/word-tables.controller.ts` | Inserción, selección, modificación y redimensionado de tablas. |
| `controllers/word-navigation.controller.ts` | Índice, navegación, lectura en voz alta y controles de vista. |
| `controllers/word-search.controller.ts` | Búsqueda y reemplazo, con estado por editor. |
| `controllers/word-files.controller.ts` | Importación y exportaciones de Archivo. |
| `controllers/word-editor-hooks.ts` | Contrato tipado de operaciones y recursos privados compartidos. |
| `models/word-editor-state.model.ts` | Estado persistido v2, instantáneas de historial y estado de redimensionado. |

Los controladores se componen por instancia; no son servicios globales ni clases base. Cada uno
declara un `Pick` del contrato público del coordinador y de sus hooks privados, con importaciones
de tipo que no crean ciclos en ejecución. Los callbacks y getters consultan el estado vigente:
no capturan copias antiguas de las páginas ni de la selección. Historial, cachés, temporizadores,
rangos y transacciones DOM pertenecen a su controlador. El componente sigue gestionando los
listeners, observers y cancelaciones en su ciclo de vida, sin cambiar el contrato de la plantilla.
El registro de IA conserva su propietario y la persistencia permanece en las capas existentes.

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

Al desactivar numeración o viñetas, `utils/list-editing.ts` convierte los elementos seleccionados
sin delegar su reconstrucción a `execCommand`. Todos los runs inline y espacios de cada `li`
se mantienen en un párrafo, con sus enlaces y énfasis. Los párrafos internos ya existentes y las
sublistas conservan su estructura. Una selección parcial divide el contenedor de lista, respeta
los elementos no seleccionados y conserva sus números iniciales. El cambio mantiene la selección
y se deshace/rehace como una sola operación; no crea un párrafo por palabra del DOCX importado.

## Listas de la plantilla APA 7

Las seis variantes APA 7 incluyen `StyleTemplate.listRules`, opcional para mantener compatibles
las plantillas antiguas. Sus reglas de listas ordenadas y no ordenadas heredan la fuente y tamaño
de Normal (Times New Roman 12 pt por defecto), alinean a la izquierda y aplican interlineado doble
sin espacios adicionales entre elementos. La implementación elige un marcador a 36 pt y texto a
54 pt, con 18 pt de sangría francesa; estas medidas son el preset visual del editor, no una
exigencia de medida única de APA. Las listas numeradas usan números arábigos con punto y las
viñetas usan disco por defecto; los símbolos elegidos después desde Home se conservan.

`utils/list-formatting.ts` aplica las reglas al elegir la plantilla, crear listas, cambiar su tipo
y continuar con Enter. El formato de párrafo dentro de `li` no añade otra sangría de primera línea.
Se conservan `ol`/`ul`/`li`, listas anidadas, inicios de numeración, citas y texto.
El formato normaliza también las fuentes/tamaños internos de `span` y `font` importados y los
párrafos dentro de cada elemento: una lista Times New Roman no conserva tramos Arial directos.
Se preservan énfasis, citas y caracteres; no se intentan reconstruir espacios ausentes del texto
ya guardado. DOCX resuelve la herencia de esos tramos sin exportar `inherit` como nombre de fuente.
El diseñador muestra una guía ES/EN: números para secuencias; viñetas para elementos sin orden; oraciones completas con
mayúscula y puntuación final; palabras o frases con minúscula salvo nombres propios, con puntuación
opcional según la estructura. No se corrigen automáticamente mayúsculas, citas ni puntuación.
Ver las guías de [listas numeradas](https://apastyle.apa.org/style-grammar-guidelines/lists/numbered)
y [viñetas](https://apastyle.apa.org/style-grammar-guidelines/lists/bulleted) de APA Style.

Duplicar y guardar plantillas conserva estas reglas; el historial y `customTemplates` las incluyen.
La exportación DOCX usa `services/docx-list-numbering.ts` y `word/numbering.xml` para listas nativas,
en lugar de números/viñetas escritos como texto. Conserva sangría, interlineado, inicio de numeración
y elementos anidados, también en tablas. DOC/PDF conservan el HTML con estilos de lista.

`utils/list-formatting.spec.ts` comprueba el DOM y el OOXML exportado; `word-home.spec.ts` cubre
aplicación entre páginas, deshacer, duplicación y continuación con Enter.

### Variantes tipográficas APA 7

`constants/apa-style-templates.ts` genera seis plantillas independientes a partir de las reglas
comunes, según la página 26 de `Guia-Normas-APA-7ma-edicion.pdf` proporcionada para este proyecto:

| Identificador | Fuente | Tamaño |
| --- | --- | --- |
| `apa-times-12` | Times New Roman | 12 pt |
| `apa-calibri-11` | Calibri | 11 pt |
| `apa-arial-11` | Arial | 11 pt |
| `apa-lucida-10` | Lucida Sans Unicode | 10 pt |
| `apa-georgia-11` | Georgia | 11 pt |
| `apa-computer-modern-10` | Computer Modern | 10 pt |

El selector de plantillas muestra todas las variantes. P y todos los niveles H del editor
usan la misma familia y tamaño; las listas heredan esa tipografía. Se conserva `apa-times-12`
para documentos anteriores, las reglas compartidas no comparten objetos mutables y las plantillas
corporativa y técnica siguen disponibles. Lucida Sans Unicode y Computer Modern también aparecen
en el selector de fuentes. El navegador y Word necesitan la fuente instalada para su representación
exacta; el proyecto no incorpora los binarios ni descarga nuevas fuentes al arrancar. DOCX conserva
la familia y tamaño solicitados. Las pruebas parametrizadas cubren cada variante y su exportación.

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

## Zoom y celdas nuevas de tablas

El deslizador, los controles de la cinta y Ctrl + rueda usan `WordNavigationController.setDocumentZoom`.
Se conserva la posición relativa de un punto de la página visible y se compensa el scroll tras el
cambio de escala; no se navega a otra hoja por conservar un desplazamiento en píxeles de otra escala.
Ctrl + rueda se intercepta solo dentro de `.word-page-sheet` (50–160 %), incluso al alcanzar los
límites; sin Ctrl y fuera del papel se mantiene el comportamiento normal del navegador. El ajuste
de scroll pendiente y la desactivación temporal de scroll anchoring se limpian al destruir el editor.

Añadir filas o columnas deja todas las celdas nuevas sin contenido, con un `<br>` editable en lugar
de «Dato», «Columna» o contenido clonado. Las filas mantienen el formato y eliminan identificadores
copiados. Insertar columnas recorre las filas de la tabla activa sin alterar tablas anidadas.

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

## Imágenes y combinación de celdas

Al pulsar una imagen aparece un marco con un tirador inferior derecho. Arrastrarlo cambia
su tamaño manteniendo la proporción y respetando el zoom del documento. La operación
crea un único paso de deshacer; las dimensiones se guardan en el HTML de la imagen.
Los controles quedan fuera del contenido editable y no se guardan ni imprimen.

Para combinar celdas, arrastrar el ratón desde la primera hasta la última celda (también
funciona con celdas vacías), seleccionar su contenido o pulsar la primera celda y,
con Shift, la última. La barra contextual ofrece **Combinar celdas** y resalta el rectángulo
afectado. Se conserva el contenido, sus formatos y enlaces en orden de lectura. También
se admiten celdas previamente combinadas. Si la selección cruza encabezado y cuerpo,
se unifican sus grupos de filas, conservando los elementos TH, para permitir el rowspan.
La exportación DOCX representa las combinaciones mediante gridSpan y vMerge.

`word-images.controller.ts` gestiona la selección y el arrastre; `word-tables.controller.ts`
gestiona la selección rectangular. `utils/table-cell-grid.ts` calcula la cuadrícula lógica
compartida con la exportación y la paginación, incluyendo rowspan y colspan.

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

La pestaña Referencias incorpora fuentes bibliográficas, citas y leyendas APA. Véase
[APA: tablas, figuras y referencias](13-APA-TABLAS-FIGURAS-Y-REFERENCIAS.md).

## Revisión de escritura en español e inglés

`appProofreading` activa revisión nativa en el cuerpo, encabezado y pie de Word. El control
**ES/EN · ABC** de la barra inferior selecciona idioma y activa/desactiva la autocorrección.
Estas preferencias son locales al navegador y no guardan texto del documento.

La corrección local usa una lista conservadora de erratas frecuentes (`proofreading.ts`):
se ejecuta al terminar una palabra con espacio, conserva mayúsculas, formato y cursor y
permite revertir la última corrección si su texto sigue intacto. No procesa pegados, composición
IME ni código/enlaces/regiones protegidas, ni recorre el documento completo en cada pulsación.
Las palabras ambiguas no se cambian automáticamente. Las repeticiones consecutivas generan
un aviso sin eliminar texto. El cambio emite `input` para participar del guardado y flujo de Word.

Para errores fuera de la lista, se usa el subrayado y menú contextual del corrector nativo.
Su disponibilidad y diccionarios español/inglés dependen del navegador; no hay un diccionario
completo propio ni revisión gramatical remota. El texto no se envía a IA para esta función;
la configuración de revisión del navegador puede usar sus propios servicios. El panel de chat
no utiliza esta autocorrección.
