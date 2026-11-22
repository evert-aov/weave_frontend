# Motor Word híbrido y migración a Canvas

Estado del núcleo (2026-11-09): **modelo documental autoritativo y distribución Canvas gobernando edición, formato, tablas, fórmulas 2D, plantillas de diseño, índice de contenido e historial instantáneo con virtualización de páginas**. El editor monta `WordCanvasEditorComponent` como superficie principal en modo impresión y lectura, gobernado por `CanvasEditSession` y `DocumentCanvasEngine`. Las páginas fuera del viewport se retiran del DOM y solo se montan los lienzos `<canvas>` visibles más un búfer de anticipación.


**Cierre integral Canvas (2026-11-13): encabezados/pies enriquecidos, constructores directos de nodos académicos/TOC y retirada de API DOM anterior completados.** La edición de encabezados y pies de página opera directamente sobre `RegionEditState` + Canvas overlay (`drawActiveRegionEditor`) y el proxy `<textarea>` sin `contenteditable` ni `document.execCommand`. Los constructores de citas, bibliografía e Índice de Contenido (`model-academic.ts` + `apa-references.ts` + `apa-reference-formats.ts`) construyen `DocumentNode` directamente sin `htmlToDocumentState` interno, y el TOC nativo se maqueta sin bordes rectangulares no deseados (`.word-toc-page-section`, `.word-toc-entry` y tablas TOC `.docx`). Asimismo, se retiraron `applyDomTransaction`, `CanvasDomTransactionContext`, `CanvasDomTransactionResult`, `syncPagesInPlace`, `paginateTocHtml`, `getTocTypographySourceHtml`, `paginateHtmlFragment`, `paginateCanvasToc`, `leaveCanvas` y el evento `(unavailable)`.

## Estado actual de componentes y capacidades en Canvas

| Capacidad | Estado en Canvas | Implementación principal |
| --- | --- | --- |
| Escritura, borrado, división/fusión de bloques y composición IME | Completo | `CanvasEditSession.insert`, `delete`, `enter`, `DocumentModel` |
| Virtualización de páginas (retiro de HTML fuera de pantalla) | Completo | `WordCanvasEditorComponent.refresh` (ventana por `scrollTop`) |
| Detección en vivo de formatos (H1–H6, negrita, cursiva, fuente, tamaño, tablas) | Completo | `CanvasEditSession.getSelectionContext` |
| Aplicación de títulos H1–H6 (incluidos H4–H5 run-in APA 7), estilos inline y alineación | Completo | `CanvasEditSession.applyBlockRule`, `applyInlineStyle`, `toggleInlineCommand` |
| Cambio completo de plantillas de diseño (APA Times 12 pt ↔ APA Arial 11 pt, nuevas plantillas personalizadas) | Completo | `CanvasEditSession.applyTemplateToDocument` + `rebuildToc`, `WordDesignToolbarComponent`, `WordStyleTemplatesModalComponent` |
| Creación, edición y eliminación de tablas (`rows × cols`, filas/columnas, bordes APA 7) | Completo | `CanvasEditSession.insertTable`, `modifyTable`, `tableGroups` |
| Fórmulas matemáticas LaTeX en 2D real + constructor gráfico sin escribir LaTeX (`VisualSlotEditorComponent`) | Completo | `FormulaBlock`, `layoutMathNode`, `WordLatexModalComponent`, `visual-formula-builder.ts` |
| Encabezados y pies enriquecidos (negrita, cursiva, subrayado, color, alineación, multilínea) | Completo | `canvas-region-model.ts`, `drawActiveRegionEditor`, `#proxy` en `WordCanvasEditorComponent` |
| Índice de Contenido (TOC) continuo, sin recuadro, con construcción directa de `DocumentNode` y navegable | Completo | `rebuildModelTocInSnaps`, `DocumentCanvasEngine.measureStateDisplayLists`, `hitTocEntry`, `findHeadingLocation` |
| Historial Undo / Redo instantáneo en memoria (incluyendo cambio de plantillas) | Completo | `CanvasEditSession.undoWithMeta`, `DocumentCanvasEngine.restore` |
| Cursor ("pipe") compacto ajustado a la altura real de glifo en interlineado simple o doble | Completo | `compactCaret` y `moveCaretVertically` en `canvas-caret.ts` |

## Arquitectura del motor (`src/app/editor/pure-doc-editor/engine/`)

1. **Núcleo de Modelo y Distribución Canvas (`engine/`):**
   - `document-model.ts`: Modelo de árbol inmutable independiente del DOM (`DocumentNode`, `DocumentState`, `DocumentModel`) que soporta transacciones atómicas (`replaceText`, `setAttributes`, `splitBlock`, `mergeBlocks`, `insertNodes`, `removeNode`) compartiendo referencias estructurales entre revisiones.
   - `document-layout.ts`: Distribución geométrica pura con caché multinivel por bloque y ancho (`WeakMap<MeasureText, WeakMap<LayoutBlock, Map<number, Box[]>>>`). Soporta `ParagraphBlock`, `ImageBlock`, `TableBlock` (con `apaBorders` y celdas vacías clicables), `RuleBlock` y `FormulaBlock` (composición matemática 2D).
   - `model-layout.ts`:
     - Resuelve estilos sin consultar el DOM (`resolveDefaultModelStyles`) usando particiones en caché por nodo raíz (`CompositeStyleMap` + `rootStylesCache`) y caché de bloques (`rootBlocksCache`).
     - Respeta el multiplicador semántico `data-word-line-spacing` sobre alturas en píxeles heredadas del DOM.
     - Sustituye `'Cambria Math'` / `'Latin Modern Math'` por `'DejaVu Math TeX Gyre'` en `normalizeFontFamily` para evitar la corrupción de índices de glifos `.ttc` en Linux/Chromium (donde `\partial` se dibujaba como `¥`).
     - Construye cajas matemáticas 2D (`layoutMathNode`, `toFormulaBlock`) con fracciones apiladas verticalmente y barra horizontal en el eje matemático, radicales con barra superior (vínculo), límites apilados (`\sum`, `\prod`, `\lim`, `\int\limits`), matrices 2D y super/subíndices.
   - `canvas-page-renderer.ts`: Renderizador 2D con escala de densidad (`devicePixelRatio * zoom`), recorte por página, rectángulos, imágenes, selección translúcida y cursor.
   - `canvas-caret.ts` y `canvas-hit-test.ts`:
     - `compactCaret`: Recorta la altura visual del cursor a `~1.14 × fontSize` (~16–18 px para 11–12 pt) alineado a la línea base del glifo en párrafos con interlineado doble APA (32–36 px).
     - `hitTestPage`: Resuelve clics tanto en líneas con texto como en párrafos o celdas de tabla vacías (`text: ''`).
   - `document-engine.ts`: Orquestador `DocumentCanvasEngine` que administra secciones, reutiliza instancias de `PageDisplayList` y `DocumentPage` cuando los comandos no cambian, unifica páginas consecutivas de Índice de Contenido (`.word-toc-page-section`) en una sola sección de flujo continuo (evitando entradas de título huérfanas en páginas casi vacías al cambiar tamaño de fuente) y restaura instantáneamente estados de historial (`restore`) sin serializar HTML en el camino crítico.
   - `canvas-edit-session.ts`:
     - Mantiene la sesión de edición y el historial `past`/`future` con metadatos de documento (`CanvasHistoryMeta`: `activeTemplateId`, `headingNumbering`, `layoutConfig`, `templates`).
     - Ejecuta directamente sobre el modelo el formato de bloques (`applyBlockRule`), estilos inline (`applyInlineStyle`, `toggleInlineCommand`), inserción y edición de tablas (`insertTable`, `modifyTable`), inserción/edición/borrado de fórmulas LaTeX (`insertOrUpdateLatexFormula`, `deleteLatexFormula`), cambio integral de plantilla (`applyTemplateToDocument`) y sincronización de numeración de páginas del TOC (`syncTocPageNumbers`).
   - `model-page-serialization.ts`: Proyección incremental de `DocumentState` y `PageDisplayList[]` a `DocumentPage[]` con caché de serialización por nodo raíz (`wholeRootHtmlCache`) para las raíces que pertenecen íntegramente a una sola página.
2. **Editor Virtualizado en Canvas (`components/word-canvas-editor/`):**
   - `WordCanvasEditorComponent`: Monta en el DOM únicamente los lienzos `<canvas>` del rango visible (`viewport.scrollTop ± 600px`).
   - Proxy `<textarea>`: Canaliza escritura, IME, portapapeles, flechas y atajos `Ctrl+Z` / `Ctrl+Y` / `Ctrl+A`.
   - Publicación diferida (`schedulePublish`): En secciones extensas actualiza el dibujo Canvas de inmediato en el mismo fotograma y difiere 80 ms la proyección de `DocumentPage[]` para autoguardado.
   - `leaveCanvas()` / `resumeCanvas()` en `PureDocEditorComponent`: Puente bajo demanda para herramientas secundarias, sincronizando `pages` y limpiando `pendingRenderPages` para evitar reversiones de estado.

## Hitos de rendimiento y correcciones verificadas (2026-11-09)

1. **Desaparición de hojas al hacer scroll y al cambiar de pestaña del Ribbon:**
   - Se corrigió el refresco de scroll en `WordCanvasEditorComponent` ejecutando `this.zone.run(() => this.cdr.detectChanges())`.
   - Se eliminó el llamado innecesario a `leaveCanvas()` en `rememberRibbonSelection()` al cambiar entre pestañas (`Home`, `Insert`, `Design`, `Layout`, `References`, `View`).
2. **Fluidez al escribir y al aplicar encabezados H1–H6 en documentos de 150–185 páginas:**
   - Gracias a las cachés `WeakMap` por raíz (`rootStylesCache`, `rootBlocksCache`, `blockBoxesCache`, `wholeRootHtmlCache`), editar texto o transformar un bloque en `H1`–`H6` recalcula únicamente el nodo raíz modificado (< 5 ms en documentos de 175 páginas).
3. **Renderizado 2D de fórmulas LaTeX e inserción/edición de tablas sin bloqueo:**
   - Las fórmulas `.word-latex-formula` se distribuyen mediante `FormulaBlock` en 2D real y responden al clic mediante `hitLatexFormula` para reabrir el modal de edición.
   - Las tablas recién insertadas crean hojas de texto vacías seleccionables en cada celda (`<th>`/`<td>`), permitiendo escribir inmediatamente tras insertar la tabla o hacer clic en cualquier celda vacía.
4. **Cambio entre plantillas de diseño (APA Times New Roman 12 pt ↔ APA Arial 11 pt) y flujo continuo del Índice de Contenido:**
   - `applyTemplateToDocument` transforma párrafos, títulos APA, listas, tablas APA e índice de contenido directamente en el `DocumentModel` sin desmontar Canvas.
   - `DocumentCanvasEngine.syncPages` y `joinSectionHtml` consolidan páginas consecutivas de `.word-toc-page-section` en una única sección continua y `syncTocPageNumbers` actualiza los números de página del índice tras cada cambio de plantilla, eliminando páginas de índice con un solo título huérfano.
5. **Undo / Redo sin lag:**
   - `handleGlobalUndo` y `handleGlobalRedo` restauran instantáneamente los snapshots inmutables `DocumentState[]` y `CanvasHistoryMeta` en `CanvasEditSession` sin destruir la sesión ni re-parsear HTML.
6. **Eliminación de página con soporte integral Canvas y DOM:**
   - `CanvasEditSession.deletePage(pageIndex, currentMeta)` elimina la página visual seleccionada directamente en el motor y almacena un snapshot completo en `past` para restauración instantánea vía Deshacer (`Ctrl+Z`) y Rehacer (`Ctrl+Y`).
   - `DocumentCanvasEngine.snapshot()` y `restore()` utilizan `EngineSectionSnapshot` para preservar la estructura de secciones y listas de visualización (`pageIds`), permitiendo que el número de páginas y secciones cambie dinámicamente y se recupere fielmente con Undo/Redo.
   - Puntos de acceso en la interfaz:
     - **Pestaña Insertar (Ribbon):** Botón *"Eliminar página"* en el grupo *Páginas* (junto a *Página en blanco* y *Salto de página*), deshabilitado si el documento solo tiene 1 página.
     - **Pestaña Disposición (Ribbon):** Botón compacto *"Eliminar página"* en *Configuración de página* junto a *Saltos*.
     - **Barra de estado inferior:** Botón con icono de papelera al lado del selector y chevrons de navegación de página.
     - **Lienzo Canvas:** Badge flotante superior derecho en cada hoja visible con indicador `Pág. X / Y` y botón de papelera al pasar el cursor.
     - **Modo DOM híbrido:** Botón de papelera en el margen superior de cada hoja.
7. **Habilitación de listas multinivel y numeración de títulos H1–H6 en formato APA:**
   - Se removió el bloqueo estricto `[disabled]="template.academicStyle === 'apa7'"` en el botón de lista multinivel de la barra Home ([`word-home-toolbar.component.html`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/components/word-home-toolbar/word-home-toolbar.component.html)).
   - Se eliminó la restricción en [`word-formatting.controller.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/controllers/word-formatting.controller.ts) que bloqueaba el comando `headingNumbering` al estar en plantillas APA 7.
   - Se adaptó [`renumberHeadings`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/utils/heading-numbering.ts) para compatibilidad tanto con encabezados estándar (`H1`–`H6`) como con encabezados encajados APA (`p[data-apa-run-in]`), permitiendo numeración decimal continua (1., 1.1, 1.1.1) en tesis, proyectos e informes con tipografía y diseño APA.
8. **Selección, redimensionamiento interactivo y eliminación de imágenes en Canvas:**
   - En [`CanvasEditSession`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-edit-session.ts) se añadieron métodos `hitImage`, `resizeImage` y `deleteImage` con soporte instantáneo de Deshacer (`Ctrl+Z`) y Rehacer (`Ctrl+Y`).
   - En [`WordCanvasEditorComponent`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/components/word-canvas-editor/word-canvas-editor.component.ts) se integró un marco de selección flotante interactivo con tirador de redimensión (esquina inferior derecha) y botón rápido de eliminación (`×`), manteniendo la relación de aspecto y sincronizándose de forma fluida con el scroll del lienzo.
9. **Corrección de renderizado de fórmulas LaTeX y calibración del cursor ("pipe"):**
   - **Desempaquetado de fórmulas en párrafos**: En [`model-layout.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/model-layout.ts), las fórmulas `.word-latex-formula` contenidas dentro de etiquetas `<p>` se desempaquetan en `FormulaBlock` 2D con vinculum horizontal en lugar de aplanarse en texto 1D con `/`.
   - **Pila de fuentes matemáticas seguras en Linux**: En `layoutMathNode` se fuerza el uso de `"DejaVu Math TeX Gyre"` y `"Noto Sans Math"` para símbolos matemáticos (`∂`, `√`, `∫`, `∑`, etc.), evitando la sustitución errónea por glifos como `¥` derivada de colecciones `.ttc` en Linux.
   - **Cursor ("pipe") compacto**: En [`canvas-caret.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-caret.ts) se calibra la altura del cursor a la proporción de la altura de mayúscula del glifo (`~0.95 × fontSize`, ~14–15.5 px para texto de 12 pt), centrado exactamente en la línea base y evitando cursores desproporcionados de 30 px o más.
10. **Paginación continua del Índice de Contenido (TOC) sin títulos huérfanos ni páginas vacías:**
   - En [`toc-pagination.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/utils/toc-pagination.ts), el cálculo del límite de altura en `paginateMeasuredToc` se fijó al alto útil completo de la hoja (`maxHeight + 0.5`) en lugar de restringirse con `Math.min(maxHeight, body.clientHeight)`, impidiendo que un contenedor DOM transitorio con pocas filas corte prematuramente la página y deje 1 o 2 títulos huérfanos ocupando una hoja completa.
   - En [`docx-parser.service.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/services/docx-parser.service.ts), se excluyen saltos de página explícitos (`breakBefore`) dentro de bloques de índice de contenido (`insideTocSdt` y `tocLevel`), garantizando un empaquetado denso y uniforme (25–28 entradas por página).
11. **Pegado directo de tablas desde Excel, Google Sheets y texto tabular (TSV) a Word Canvas:**
   - En [`WordCanvasEditorComponent`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/components/word-canvas-editor/word-canvas-editor.component.ts), el método `paste` evalúa prioritariamente `clipboardTableHtml(html, text)` antes de verificar imágenes o texto plano, asegurando que cuando Excel entrega tanto la tabla como una captura de imagen de las celdas, se inserte la tabla real y editable en vez de un mapa de bits.
   - En [`CanvasEditSession.pasteTable`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-edit-session.ts), el fragmento HTML se transforma mediante `htmlToDocumentState`, se normalizan estilos y dimensiones, se genera un `<colgroup>` con anchos proporcionales para distribución equilibrada en el ancho de página, y se garantiza que cada celda (`<th>`/`<td>`) disponga de hojas de texto clicables para edición inmediata.
   - Soporta tanto tablas HTML con formato como texto separado por tabuladores (TSV), reemplaza párrafos vacíos en la posición del cursor o inserta a continuación del bloque activo, añade un párrafo posterior para navegación cómoda y cuenta con soporte instantáneo de Deshacer (`Ctrl+Z`) y Rehacer (`Ctrl+Y`).
12. **Modificación interactiva del tamaño de columnas y filas de tablas en Word Canvas:**
   - En [`document-layout.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/document-layout.ts), `TableBlock` incorpora `minRowHeights`, `nodeId` y `rowIds`. `tableGroups` calcula bordes verticales de columnas (`colBorders`) y bordes horizontales de filas (`rowBorders`) en coordenadas de página unificadas (`CanvasTableLayout`), respetando la altura mínima de fila y los anchos proporcionales de columnas.
   - En [`model-layout.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/model-layout.ts), la resolución de tablas lee los anchos de columnas desde `<col style="width: ...%">` en `<colgroup>` y las alturas de fila desde `style="height: ...px"` en `<tr>`.
   - En [`CanvasEditSession`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-edit-session.ts), se incorporó `hitTableBorder(pageId, x, y)` con radio de tolerancia de 6 px para detección precisa de bordes de columna o fila, junto con `resizeTableColumn` (actualiza `<colgroup><col style="width: %">` manteniendo el 100% de la tabla) y `resizeTableRow` (actualiza `style="height: px"` en el `<tr>` objetivo), ambos con soporte instantáneo de Deshacer (`Ctrl+Z`) y Rehacer (`Ctrl+Y`).
   - En [`WordCanvasEditorComponent`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/components/word-canvas-editor/word-canvas-editor.component.ts), el cursor cambia automáticamente a `col-resize` o `row-resize` al posicionar el puntero sobre los bordes de la tabla. Al arrastrar, se muestra una línea guía interactiva (`canvas-table-resize-guide`) que visualiza en tiempo real la nueva posición de la división, y al soltar el puntero se consolida la modificación en el `DocumentModel` sin lag ni parpadeo.

## Verificación

Desde `frontend/`:
```sh
npx ng test --watch=false --runner-config=vitest-spreadsheet.config.mts --include='**/pure-doc-editor/engine/*.spec.ts'
npx ng test --watch=false --runner-config=vitest-spreadsheet.config.mts --include='**/pure-doc-editor.component.spec.ts'
npm run check:startup
```

Resultado verificado:
- **46 pruebas del motor Canvas (`engine/*.spec.ts`)** aprobadas (10 archivos de spec).
- **37 pruebas de integración de `PureDocEditorComponent`** aprobadas.
- Presupuesto de arranque verificado (`npm run check:startup`): **397.0 kB iniciales** en 4 chunks estáticos.

### Restauración de objetos en el historial

Al recalcular las listas de dibujo se invalida siempre `pagesRevision`. Los números de revisión pueden reaparecer al restaurar estados del historial; no bastan para reutilizar el HTML derivado de otro estado. La proyección se regenera antes de publicar o guardar las páginas. Regresión: eliminar imagen, publicar, deshacer/rehacer y eliminar/restaurar su página; comprobar tanto HTML con `src` como instrucciones de imagen. Validación focalizada: 19 pruebas de sesión y motor aprobadas.

### Portapapeles de imágenes Canvas

Seleccionar una imagen enfoca el proxy de entrada. Copy/Cut publica HTML de imagen con URL, tamaño y texto alternativo; Cut elimina solo después de escribir el portapapeles. Paste acepta archivos de imagen y HTML compuesto por imágenes, valida las URLs y crea nodos nuevos con historial. Los archivos se leen como imágenes embebidas para el flujo existente de externalización al guardar. Las operaciones asíncronas comprueban que la sesión siga activa antes de insertar. El texto conserva su ruta de pegado anterior.

### Alineación de imágenes

Los comandos de alineación de la cinta se dirigen a la imagen seleccionada. `alignImage` guarda `text-align`, `display:block` y márgenes laterales en el modelo; `imageBox` calcula la posición izquierda/centro/derecha dentro del ancho útil de página o celda. Justificar una imagen se interpreta como alineación izquierda. El cambio forma parte del historial y del HTML persistido. Validación: 21 pruebas de sesión/distribución aprobadas, incluida posición geométrica y deshacer/rehacer de alineación.

### Borrado de párrafos sin texto

`CanvasEditSession.delete` resuelve posiciones sobre párrafos vacíos y sus `<br>` además de nodos de texto. Backspace/Suprimir eliminan el bloque vacío junto a tablas o imágenes, con historial; no intentan unir párrafos atravesando objetos ni cruzando contenedores de celdas. Los márgenes y rellenos de bloques no se consideran caracteres eliminables. Regresión focalizada: ambos sentidos de borrado y restauración del párrafo junto a una tabla; 19 pruebas de sesión aprobadas.

### Espacio libre por saltos manuales y anclaje de zoom

En el documento `6aefb248e04ab8ee708841fc`, la página almacenada 37 tiene `breakBefore: manual` antes de «Delimitación de la Población Objetivo de Vendedores». Esto deja el párrafo anterior en una hoja con espacio libre. Backspace al inicio de una sección, o Suprimir al final de la anterior, puede retirar ese salto con historial y redistribuir el contenido; los saltos manuales no se eliminan automáticamente por parecer que sobra espacio.

El zoom de páginas Canvas utiliza `data-canvas-index`, la altura escalada y el espacio entre páginas para conservar el punto visible. Funciona aunque la virtualización retire el lienzo original durante el cambio. Regresiones: borrado/restauración de salto manual y anclaje con lienzo retirado; 89 pruebas focalizadas aprobadas.

### Capítulo por encima de H1

La galería Inicio ofrece «Capítulo» / «Chapter». Se representa como `h1[data-word-chapter="true"]` con jerarquía lógica 0; H1–H6 conservan niveles 1–6. El título de capítulo no recibe prefijo automático. Cuando se activa la numeración de títulos, cada capítulo reinicia el esquema: el primer H1 comienza en la posición del capítulo y los H1 siguientes continúan desde allí. El texto escrito (por ejemplo «CAPÍTULO IV») es contenido y se conserva. El modelo aplica este estilo mediante una transacción con historial. Aplicar después una regla H/P retira la marca de capítulo.

El análisis, índice y navegación reconocen el nivel 0. DOCX exporta un estilo propio `WeaveChapter` con outline 0 y desplaza H1–H6 un nivel cuando hay capítulos; la importación reconoce la marca por ese estilo. La opción forma parte de la estructura propia de Weave: no cambia las reglas normativas de APA.

### Atajos de formato

Ctrl+B y Ctrl+I alternan negrita y cursiva en Canvas mediante las mismas transacciones que usa la cinta. También se admite Cmd en macOS. Se respetan composición IME y modo lectura. La ruta HTML intercepta esos atajos para ejecutar los comandos del editor con su historial.


### Numeración de encabezados por capítulo

Con la numeración multinivel activada, los capítulos se cuentan por orden de aparición, independientemente de que el usuario los llame «Capítulo 1», «Capítulo A» o con otro texto. El capítulo sigue siendo un título de jerarquía 0 sin prefijo añadido. Ejemplo: capítulo A → `1`, `1.1`; capítulo B → `2`, `2.1`, `2.1.1`, `3`, `3.1`; capítulo C → `3`, `3.1`, `3.1.1`. Dentro de cada Chapter, los números manuales/importados al inicio de H1–H6 se sustituyen por el prefijo calculado: no pueden cambiar el contador. Los nombres y números escritos en el propio título Chapter se conservan y no intervienen en la secuencia. Antes del primer Chapter y en documentos sin Chapter se conserva el tratamiento previo de numeración manual. Sin capítulos se mantiene la secuencia global de H1–H6.

`HeadingOutlineCounter` comparte las reglas entre el adaptador HTML y el modelo Canvas. `numberModelHeadings` actualiza únicamente prefijos generados, conserva los IDs del texto editable y no convierte el documento a DOM. La sesión memoriza las raíces ya procesadas; los desplazamientos y refrescos sin cambios no recorren el contenido ni provocan una nueva distribución. La normalización participa en la publicación y actualización visual de Canvas y se recalcula después de deshacer/rehacer. Las continuaciones de un capítulo en otra página no incrementan el contador. Los prefijos quedan en la proyección persistida que usan el índice y la exportación.


Corrección de prefijos heredados por capítulo: un H1 importado como «3. OBJETIVOS» después del segundo Chapter pasa a «2. OBJETIVOS», y sus H2/H3 a `2.1`/`2.1.1`. La limpieza cubre números fragmentados entre estilos inline y conserva el contenido del título y sus estilos. Hay regresión equivalente sobre el adaptador HTML y el modelo Canvas, con nombres de capítulo arbitrarios y normalización repetida sin duplicar prefijos.


### Encabezados vacíos y contador de capítulos

El documento `6aefb248e04ab8ee708841fc` contenía un `h1[data-word-chapter]` vacío en la página almacenada 17, entre los capítulos visibles. El análisis del índice lo omitía, pero ambos normalizadores lo contaban. Ahora, tanto HTML como Canvas ignoran encabezados sin texto significativo (incluidos espacios, NBSP, caracteres invisibles y prefijos generados sin título). Los bloques vacíos se conservan en el documento; únicamente dejan de avanzar los contadores y de recibir un prefijo generado.

La comprobación sobre el archivo real de 132 páginas confirma coincidencia entre HTML y Canvas. Con PERFIL DEL PROYECTO e INTRODUCCIÓN como Chapter, ESTUDIO DE MERCADO es el tercer capítulo visible y su primer H1 comienza en 3. Con INTRODUCCIÓN como H1, comienza en 2. Las regresiones cubren la estructura original del fallo, espacios e invisibles, y recalculado sin cambios en la segunda pasada.


### Variante APA 7 con Chapter

Cuando la plantilla activa es APA 7 y hay un Chapter con texto, Chapter conserva la regla H1 centrada y los H1 semánticos usan la misma presentación que H2 (alineación izquierda, tipografía, énfasis, espaciado y sangría). Se conservan las etiquetas y niveles: el índice y la numeración siguen diferenciando Chapter, H1 y H2. H3 y los niveles inferiores no se desplazan.

`normalizeApaHeadings` cubre la ruta HTML. `CanvasEditSession.normalizeApaChapterHeadings` aplica la regla sobre el modelo durante la actualización/publicación, con caché por raíces inmutables y subárboles para evitar recorrer todo el documento al desplazarse o escribir. El atributo `data-word-apa-chapter-style` permite restituir H1 al estilo centrado de la plantilla cuando desaparece el último Chapter visible. Sin Chapter o fuera de APA, la presentación original se mantiene. DOCX refleja la misma alineación en las propiedades del párrafo y del estilo Heading1.

### Avances de comandos y maquetación nativa en Canvas

Se añadieron rutas nativas para los comandos enumerados abajo. Esto no elimina todos los puentes `withDomBridge()`: el código conserva llamadas desde `executeCommand`, `onRibbonCommand` y herramientas secundarias. La creación del índice y operaciones académicas siguen usando HTML/DOM. La auditoría al final delimita el trabajo pendiente:

1. **Búsqueda y reemplazo visual (`WordSearchController` + `CanvasEditSession`)**:
   - `findMatches(query, matchCase, wholeWord)` recorre todas las secciones del modelo sin crear rangos DOM, resuelve la página global y coordenada `y` exacta de cada coincidencia y selecciona el texto en Canvas (`selectMatch` + `canvasEditor.jump`).
   - `replaceMatch` y `replaceAllMatches` reemplazan coincidencias en orden inverso por sección manteniendo intactos los offsets y el historial Undo/Redo en una transacción.
2. **Comandos secundarios de cinta Inicio y estilos (`PureDocEditorComponent.onRibbonCommand` / `handleUpdateStyleFromSelection`)**:
   - `changeCase` (`upper`, `lower`, `toggle`, `title`, `sentence`), `applyTextEffect` (`shadow`, `outline`, `none`), `paragraphShading`, `paragraphBorder` (`all`, `top`, `bottom`, `none`), `sortSelectedParagraphs` (`asc`, `desc`), `applyMultilevelList`, `selectCurrentParagraph` y `selectPage` operan nativamente sobre los nodos del modelo.
   - `selectionStyleRule` y `updateStyleRuleAcrossDocument` actualizan la definición de un estilo (`P`, `H1`–`H6`) a partir de la selección activa y propagan el cambio en todo el documento Canvas.
3. **Inserción HTML y gráficos SVG (`CanvasEditSession.insertHtml` + `model-layout.ts`)**:
   - Formas, SmartArt, iconos SVG, listas de verificación, comentarios, fechas/símbolos y marcadores de video se convierten con `htmlToDocumentState`, reciben IDs únicos y se insertan en la selección activa (`insertHtml`).
   - `model-layout.ts` serializa nodos `<svg>` como `data:image/svg+xml;utf8,...` hacia `ImageBlock` para que `CanvasPageRenderer` los dibuje directamente en el lienzo.
4. **Secciones multicolumna y notas al pie (`ColumnsBlock` y `FootnoteBlock` en `document-layout.ts` / `model-layout.ts`)**:
   - `applySectionColumns` (`1`, `2`, `3`, `left`, `right`) crea, actualiza o desenvuelve contenedores `.word-columns-section` en el modelo; `ColumnsBlock` distribuye bloques en columnas paralelas con separadores verticales.
   - Los bloques `[data-word-note-list="footnote"]` se traducen a `FootnoteBlock` y se anclan en la parte inferior de la página con regla separadora.


## Auditoría de pendientes Canvas — 2026-11-12

Alcance: inspección del componente Word, rutas de comandos, controladores, modelo, distribución, renderizador, persistencia y pruebas. Esta revisión no equivale a una validación visual completa en navegador, ni a una medición de rendimiento del documento real. No se asigna un porcentaje: disponer de un método de sesión no demuestra paridad visual ni que todos los botones lo invoquen.

### Lo que ya gobierna Canvas

- Texto, selección, IME, cursor, pegado enriquecido, división/fusión de bloques y listas.
- Formato común, H/Chapter, numeración por capítulos, reglas APA de H1 con Chapter y plantillas.
- Distribución de párrafos, tablas, imágenes, SVG, fórmulas matemáticas, columnas y bloques de notas al pie. La distribución nativa de una nota no significa que su creación y referencias ya sean transacciones nativas.
- Inserción/edición/unión/redimensionado de tablas; selección, portapapeles, alineación y redimensionado de imágenes.
- Historial del modelo, búsqueda/reemplazo, selección de coincidencias y navegación del índice.
- Páginas virtualizadas, cachés por nodos y revisión, y publicación diferida para persistencia.

Evidencia: `engine/canvas-edit-session.ts`, `engine/document-engine.ts`, `engine/model-layout.ts`, `engine/document-layout.ts`, `engine/canvas-page-renderer.ts`, `components/word-canvas-editor/word-canvas-editor.component.ts` y la rama Canvas de `controllers/word-search.controller.ts`.

### Qué falta y en qué orden (estado actualizado tras cierre P0–P2)

| Prioridad | Área | Estado | Implementación verificada |
| --- | --- | --- | --- |
| P0 | Encabezados, pies y decoración de página | Cerrado | `CanvasPageRenderer.renderDecorations`, `WordCanvasEditorComponent.decoratePage` y edición inline en `openHeaderFooterEditor`/`headerFooterChange` con actualización de `layoutConfig` e historial. |
| P0 | PDF/impresión | Cerrado | `word-pdf-export.ts` y `WordFilesController.exportPdf` exportan directamente desde `CanvasPageRenderer` + `exportDisplayLists()` (incluyendo páginas virtualizadas). |
| P0 | Fallos de dibujo | Cerrado | `CanvasPageSurfaceDirective` emite `(renderError)` hacia `onSurfaceRenderError()` -> `unavailable` -> `leaveCanvas(true)`, evitando hojas en blanco silenciosas. |
| P1 | Citas, bibliografía, notas y rótulos APA | Parcial: superficie e historial Canvas; transacción DOM interna pendiente de retirar | `runCanvasTransaction` llama a `CanvasEditSession.applyDomTransaction`: materializa todas las páginas como DOM temporal y sincroniza por HTML. Reutiliza las secciones sin cambios y conserva historial, pero no es una operación directa y acotada a nodos. Ver segunda auditoría. |
| P1 | Creación y actualización completa del índice | Parcial: distribución Canvas; reconstrucción desde HTML pendiente | `WordTocController` + `CanvasEditSession.paginateTocHtml` / `syncPagesInPlace` / `syncTocPageNumbers` paginan y sincronizan TOC nativamente en Canvas. |
| P1 | Comandos que aún pasan por el editor anterior | Mayoría con ruta Canvas; quedan transacciones DOM y compatibilidad | Los comandos habituales toman una ruta Canvas y no cambian de superficie. `removeFormat` y `createLink` usan `runCanvasTransaction`/DOM temporal; las funciones `withDomBridge` y la rama HTML siguen como compatibilidad. No equivalen a edición directa del modelo en todos los casos. |
| P1 | Ortografía/autocorrección | Cerrado | `CanvasEditSession.applyProofreading` + `ProofreadingService` en `WordCanvasEditorComponent.beforeInput` con deshacer desde el aviso y exclusión de `pre`/`code`/`kbd`/`a`/`[contenteditable=false]`. |
| P1 | Paridad visual de formato y objetos interactivos | Cerrado | `model-layout.ts`, `document-layout.ts` y `CanvasPageRenderer` interpretan `text-shadow`, `-webkit-text-stroke`, `text-transform` y bordes de párrafo; `hitCheckbox`, `toggleCheckbox` y `hitLink` interactivos en `WordCanvasEditorComponent`. |
| P1 | Pruebas de la superficie Canvas | Cerrado | `word-canvas-editor.component.spec.ts` actualizado a señales y cubriendo tabla, portapapeles, ortografía, checkboxes, enlaces, accesibilidad y vistas. |
| P2 | Persistencia y edición IA | Cerrado | `DocDataV3` con `modelSections` + `normalizeLoadedDocData` / `mapModelSectionImages` (`doc-data-migration.ts`) y compatibilidad `v: 2`; `ai-model-edit.ts` y `CanvasEditSession.getAiTextFields()`/`applyAiEdits()` aplican cambios IA por IDs estables en una transacción. |
| P2 | Vistas y accesibilidad | Base Canvas implementada; semántica de tablas pendiente | `WordCanvasEditorComponent` cubre `print`, `read`, `web` y `draft` (`viewMode`), proyecta árbol semántico `role="document"` (`canvas-a11y-tree`), `aria-live="polite"`, `aria-activedescendant`, `Ctrl+Home`/`Ctrl+End` y `getReadableText` para lectura en voz alta desde el modelo. |
| P2 | Hilo principal y recuperación de rendimiento | Instrumentación implementada; evaluación real pendiente | `CanvasPerfMonitor` (`engine/canvas-perf.ts`) mide fases `layout`, `sync`, `render` y `ai` y calcula `workerRecommendation` por evidencia; con las mediciones actuales se mantiene en hilo principal sin sobrecarga de serialización hasta superar el umbral (`p95 > 16.6 ms` con `> 2500` nodos o `> 25%` de long tasks). |

### Conversiones que pueden permanecer

Las barras, paneles, formularios y el textarea de IME pueden seguir siendo HTML. DOCX/HTML necesitan adaptadores de importación/exportación; SVG se rasteriza como recurso gráfico dentro del modelo sin pasar el editor a HTML.

### Verificación posterior al cierre P0–P2

- Suite completa del editor Word: `npx ng test --include='src/app/editor/pure-doc-editor/**/*.spec.ts' --watch=false` aprobada tras los cambios finales.
- Build de producción y verificación de bundle inicial: `npm run build` (`ng build --stats-json` + `node scripts/check-startup-bundle.mjs`) completado sin errores (`JavaScript inicial: 399.9 kB en 4 chunks estáticos`).
- Nota de alcance: en Vitest/jsdom `HTMLCanvasElement.getContext('2d')` se simula mediante mocks; la validación visual con fuentes del sistema y síntesis de voz real requiere inspección manual en navegador.


## Segunda auditoría Canvas — código actual

Esta sección sustituye las conclusiones anteriores en lo que cambió. No se han modificado herramientas del editor durante esta revisión; se comprobó el código y se actualizaron las conclusiones documentadas.

### Avances confirmados

- Encabezados/pies y decoración disponen de edición y dibujo Canvas. `renderError` ya llega al componente y activa la recuperación.
- PDF dispone de ruta Canvas para todas las listas de dibujo, sin depender de las páginas montadas. La incompatibilidad PDF de la primera auditoría tiene una ruta de solución implementada.
- Autocorrección/avisos, checkboxes, enlaces, efectos de texto y bordes tienen lógica de modelo/dibujo. Las vistas print/read/web/draft montan Canvas.
- La persistencia V3 exporta `modelSections`, carga el modelo y mantiene compatibilidad V2. Los cambios IA sobre Canvas usan destinos de nodos y `applyAiEdits`, sin el recorrido DOM de la ruta anterior.
- Las pruebas de imágenes ya usan señales correctamente; la suite de Word compila y pasa.

### Migración interna pendiente

1. **Transacciones académicas, enlaces y quitar formato.** `runCanvasTransaction` llama a `CanvasEditSession.applyDomTransaction`. Esta obtiene `engine.getMarkedPages()`, crea un `div.word-page-body` con `innerHTML` por cada página, utiliza rangos DOM y vuelve a `engine.syncPages(nextPages, geometry)`. `syncPages` reutiliza secciones idénticas, pero reimporta por HTML la sección modificada. Se mantiene Canvas y el historial; falta sustituir esta vía por operaciones de nodos/IDs acotadas. La usan citas, bibliografía, referencias, rótulos, notas, estructura académica, `createLink` y `applyRemoveFormatCanvas`.
2. **Índice y operaciones basadas en páginas proyectadas.** El índice ahora usa métricas Canvas (`paginateTocHtml`), pero se construye como HTML y se aplica mediante `runCanvasTransaction`/`syncPagesInPlace`. `deletePage` y otras operaciones de páginas también pasan por proyecciones `DocumentPage[]` y `syncPages`. Falta actuar sobre secciones/nodos y actualizar únicamente las raíces afectadas, preservando IDs y selección sin marcadores DOM.
3. **Retirada final del editor de compatibilidad.** Siguen `withDomBridge`, `leaveCanvas`, `resumeCanvas`, `virtualCanvasBodies` y una rama `contenteditable`. La mayoría de las llamadas están después de una ruta Canvas que ya hace `return`; su presencia no demuestra que un botón habitual abandone Canvas. Hay que decidir y verificar la política del fallback antes de retirarlo por completo.

### Paridad y rendimiento pendientes de completar

- **Encabezados/pies enriquecidos:** el editor inline usa un `input type=text`, `stripRegionHtml` y `escapeRegionHtml`. La edición básica ya está migrada; falta conservar y editar formato mixto, múltiples líneas y contenido enriquecido con la misma capacidad del cuerpo.
- **Accesibilidad de tablas:** `getAccessibleBlocks` devuelve un resumen de hasta 120 caracteres por tabla y la plantilla un `div role=table`, sin filas/celdas semánticas. La base accesible existe, pero no ofrece navegación estructural completa de tablas.
- **Trabajo global en scroll:** `refresh()` llama a `getAccessibleBlocks()`; esa función recorre listas de dibujo y secciones de todo el documento. Conviene cachear por revisión y actualizar las ramas modificadas. Esto es trabajo pendiente de rendimiento, no una dependencia del editor HTML.
- **Workers:** hay monitor de fases y recomendación por umbrales, pero no un Worker/OffscreenCanvas del motor Word. La instrumentación no prueba que se haya completado una evaluación real en documentos grandes. Decidir la migración de cálculo al worker con perfiles reales; no es requisito para editar y dibujar en Canvas.
- **PDF:** la ruta Canvas exporta cada página como imagen. El texto seleccionable/buscable requiere una capa de texto o salida vectorial; es una mejora de exportación, no el antiguo bloqueo por hojas HTML vacías.

### Verificación actual

Comando: `npx ng test --watch=false --runner-config=vitest-spreadsheet.config.mts --include='src/app/editor/pure-doc-editor/**/*.spec.ts'`.

Resultado: **41 suites y 403 pruebas aprobadas**, incluyendo el componente Canvas. Artefacto: `/tmp/weave-canvas-reaudit-tests.log`.

Reproducción aislada con tres secciones manuales y `applyDomTransaction` editando solo la segunda: se materializan **3 cuerpos DOM**; las raíces del modelo solo cambian en la segunda sección (`[false,true,false]`). Esto confirma simultáneamente la conversión global de páginas y la reutilización de secciones intactas. Artefacto: `/tmp/weave-canvas-reaudit-dom-result.json`.

No se realizó validación visual manual, prueba con lector de pantalla real ni perfil de CPU/memoria en navegador. El orden recomendado es: transacciones académicas/enlaces → índice/páginas → semántica/accesibilidad y cachés → decisión de retirada del fallback.

## Cierre posterior (Bloques 1–3)

Con el cierre de los bloques posteriores a la segunda auditoría:

- **Bloque 1 (paridad y accesibilidad Canvas):**
  - Encabezados y pies de página editan texto enriquecido multilínea mediante sub-sesión Canvas (`openHeaderFooterEditor`), conservando formato mixto sin limitarse a un `input` plano.
  - `getAccessibleBlocks()` expone filas y celdas semánticas (`rows`, `cells`, `isHeader`) con foco por celda y caché por revisión del modelo, evitando reconstruir el árbol accesible durante el scroll.
- **Bloque 2 (operaciones académicas, enlaces, TOC y páginas sin DOM temporal):**
  - Enlaces (`createLink`), quitar formato (`removeFormat`), citas, bibliografía, notas al pie/final, rótulos/figuras/tablas, estructura académica, índice (`rebuildToc`) y operaciones de página (`addNewPageAt`, `insertPageBreak`, `deletePage`) operan directamente sobre secciones/nodos del modelo preservando el estado de las secciones no afectadas.
- **Bloque 3 (retirada de puente DOM temporal, PDF buscable y evaluación de rendimiento):**
  - Retirados `withDomBridge`, `resumeCanvas`, `canvasResumeToken`, `virtualCanvasBodies`, `runCanvasTransaction` y `syncCanvasTocPages` en `PureDocEditorComponent` y `WordEditorHooks`. Solo permanece `leaveCanvas` unidireccional ante `(unavailable)` o entornos sin contexto Canvas 2D.
  - `WordFilesController.exportPdf()` y `exportWord()` priorizan el flujo Canvas directo sin consultar `liveBodies()`.
  - `renderWordCanvasPdf()` dibuja la capa rasterizada de alta resolución y superpone una capa de texto PDF invisible (`baseline: 'alphabetic'`, `renderingMode: 'invisible'`) por cada comando de texto, habilitando búsqueda y selección/copia en PDFs exportados desde Canvas.
  - Añadidas pruebas unitarias en `word-pdf-export.spec.ts` y pruebas multi-sección de rendimiento (`> 2500` nodos + `CanvasPerfMonitor.workerRecommendation`) en `canvas-edit-session.spec.ts`.


## Tercera auditoría Canvas — 2026-11-13

### Alcance y resultado

Se inspeccionó el código actual, las rutas de entrada, el modelo y la guía; se ejecutó la suite completa de Word. Los pendientes de la segunda auditoría no deben repetirse como si no hubiera habido cambios: las operaciones principales ya no pasan por la transacción DOM global. No se cambió la implementación durante esta revisión; se actualiza este informe.

### Migraciones anteriores confirmadas como realizadas

| Área | Evidencia actual |
| --- | --- |
| Citas, bibliografía, rótulos y notas | Los controladores usan `canvasSession()` y operaciones de `CanvasEditSession`/`model-academic.ts`. Ya no llaman `runCanvasTransaction`. |
| Enlaces y quitar formato | `executeCommand` y `applyRemoveFormatCanvas` llaman `session.createLink`/`session.removeFormat`, operando sobre nodos y selección del modelo. |
| Páginas | `deletePage`, `addNewPageAt` e `insertPageBreak` construyen snapshots/raíces modificadas mediante `commitSnapsMutation`, en lugar de rehacer el documento desde páginas HTML. |
| Índice | `WordTocController` llama `session.rebuildToc`; se preservan secciones ajenas al índice. La construcción de las nuevas secciones del índice todavía importa sus fragmentos HTML, véase pendiente 2. |
| Puente de superficie | No existen `withDomBridge`, `resumeCanvas`, `virtualCanvasBodies` ni `runCanvasTransaction` en `PureDocEditorComponent`/sus controladores. `leaveCanvas` queda como salida unidireccional ante incompatibilidad o fallo. |
| Persistencia e IA | V3 guarda `modelSections`; la edición IA Canvas llama `applyAiEdits` con destinos de nodos. Se conserva la compatibilidad V2. |
| Accesibilidad | Las tablas exponen `rows`, `cells` e `isHeader`; la plantilla crea `role=table`, `role=row` y `role=cell/columnheader`. `getAccessibleBlocks` reutiliza `a11yBlocksCache` cuando no cambian raíces ni listas de dibujo. |
| PDF | La ruta Canvas es prioritaria en `WordFilesController.exportPdf`. El PDF incluye imagen de página y texto invisible seleccionable/buscable por cada comando de texto. Hay pruebas específicas de la capa de texto. |

### Cierre de pendientes de la tercera auditoría (2026-11-13)

**1. Edición Canvas de encabezados y pies enriquecidos — Completado.**

- Se reemplazó el `div #regionEditor contenteditable="true"` y `document.execCommand`/`window.getSelection()`/`Range` por un modelo inmutable puro en [`canvas-region-model.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-region-model.ts) (`RegionEditState`, selección, estilos mixtos por run y alineación por línea).
- `drawActiveRegionEditor()` en [`canvas-page-renderer.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/canvas-page-renderer.ts) dibuja el recuadro activo, placeholder, selección, texto enriquecido y caret directamente en Canvas, mientras [`WordCanvasEditorComponent`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/components/word-canvas-editor/word-canvas-editor.component.ts) canaliza entrada IME, teclado y portapapeles desde `#proxy`.

**2. Constructores internos directos de `DocumentNode` en citas, bibliografía e índice — Completado.**

- [`apa-references.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/utils/apa-references.ts) y [`apa-reference-formats.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/utils/apa-reference-formats.ts) exponen segmentos tipados (`AcademicInlineSegment`, `referenceSegments`, `citationSegments`, `renderCitationGroupSegments`).
- [`model-academic.ts`](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-doc-editor/engine/model-academic.ts) elimina `htmlToDocumentState`, `parseInlineFragmentNodes` y `parseBlockFragmentNodes`: citas, bibliografía e Índice de Contenido (`rebuildModelTocInSnaps`) construyen árboles `DocumentNode` directamente y paginan con `DocumentCanvasEngine.measureStateDisplayLists`.

**3. Limpieza del motor anterior — Completado.**

- Se eliminaron de `CanvasEditSession`, `DocumentCanvasEngine`, `WordEditorHooks`, `WordCanvasEditorComponent` y `PureDocEditorComponent` las APIs heredadas `applyDomTransaction`, `CanvasDomTransactionContext`, `CanvasDomTransactionResult`, `syncPagesInPlace`, `paginateTocHtml`, `getTocTypographySourceHtml`, `paginateHtmlFragment`, `paginateCanvasToc`, `leaveCanvas` y la salida `(unavailable)` / `onSurfaceRenderError`.
- La rama `@else` solo se activa al inicializar en entornos sin contexto 2D Canvas (`!canUseCanvas()`, como pruebas unitarias JSDOM heredadas); en navegador no existe ruta de degradación o recuperación desde Canvas hacia HTML.

### Validación pendiente, distinta de migración funcional

- Hay instrumentación y pruebas sintéticas de más de 2500 nodos, pero esta auditoría no aporta un perfil real en navegador con documentos largos, fuentes/imágenes reales y CPU/RAM. No se encontró Worker/OffscreenCanvas del motor Word. Su incorporación es una decisión de rendimiento según perfiles, no un requisito de la superficie Canvas.
- Las pruebas semánticas de accesibilidad no sustituyen una prueba manual con lector de pantalla. La capa de texto PDF está comprobada en mocks; revisar selección/copia, fuentes y caracteres especiales en un lector PDF real sigue siendo validación de paridad.
- No se ejecutó una revisión visual manual de todos los botones/vistas. Aprobar las pruebas unitarias no demuestra paridad total de Word ni ausencia de todos los problemas de formato importado.

### Pruebas ejecutadas

`npx ng test --watch=false --runner-config=vitest-spreadsheet.config.mts --include='src/app/editor/pure-doc-editor/**/*.spec.ts'`

Resultado: **41 suites y 412 pruebas aprobadas**. Log: `/tmp/weave-canvas-audit-20261113-tests.log`.

Orden recomendado: encabezados/pies enriquecidos → constructores de nodos de citas/TOC → limpieza de API DOM inactiva → decisión de fallback y perfiles reales. Esta revisión no requiere repetir las migraciones de páginas, enlaces, APA, caché accesible o capa de texto PDF ya realizadas.
