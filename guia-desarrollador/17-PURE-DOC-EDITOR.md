# Editor Pure Doc (Word Studio) de Weave

El componente `app-pure-doc-editor` (`frontend/src/app/editor/pure-doc-editor/`) proporciona un entorno de procesamiento de texto estructurado y multipágina inspirado en Microsoft Word. Opera de forma independiente sobre `note.docData` sin requerir dependencias pesadas externas ni servidores propietarios.

---

## 1. Arquitectura de Componentes

```
pure-doc-editor/
├── components/
│   ├── word-ribbon/               # Cinta superior con pestañas y colapso interactivo
│   ├── word-home-toolbar/         # Pestaña Inicio: Formato, Fuente, Párrafo, Estilos, Edición
│   ├── word-insert-toolbar/       # Pestaña Insertar: Páginas, Tablas, Ilustraciones, etc.
│   ├── word-smartart-modal/       # Diálogo modal de SmartArt en 3 columnas
│   ├── word-icons-modal/          # Selector modal de biblioteca de iconos vectoriales
│   ├── word-table-picker/         # Selector matricial interactivo para tablas
│   ├── word-latex-modal/          # Editor y visualizador de fórmulas LaTeX
│   ├── word-search-panel/         # Panel flotante de búsqueda y reemplazo
│   ├── word-toc-sidebar/          # Panel lateral de navegación (Índice y Tablas)
│   ├── word-docx-banner/          # Banner de propiedades y metadatos extraídos de .docx
│   └── word-style-templates-modal/# Diseñador avanzado de plantillas tipográficas
├── constants/
│   ├── word-document.constants.ts # Formatos de papel, fuentes, tamaños, márgenes
│   └── word-insert.constants.ts   # Catálogo de SmartArt, Formas, Símbolos, WordArt e Iconos SVG
├── models/
│   ├── word-document.model.ts     # Tipos de página, reglas de estilo, estado del editor
│   └── word-insert.model.ts       # Modelos de SmartArt, Formas vectoriales y WordArt
├── services/
│   ├── document-flow.service.ts   # Control de flujo y continuaciones entre páginas
│   ├── image-store.service.ts     # Resolución de URLs y blobs de imágenes persistidas
│   ├── latex-renderer.service.ts  # Renderizado y compilación KaTeX de fórmulas
│   └── word-compatibility.service.ts # Parseo e interoperabilidad con documentos .docx
└── utils/
    ├── document-formatting.ts     # Aplicación de reglas CSS, selección e inspección
    ├── document-selection.ts      # Marcadores y restauración precisa del cursor
    ├── heading-numbering.ts       # Numeración automática jerárquica H1–H6
    ├── home-editing.ts            # Transformaciones atómicas de formato inline y párrafo
    └── word-editor.utils.ts       # Análisis léxico rápido de palabras, caracteres y nodos
```

---

## 2. Barra de Herramientas de la Cinta (Ribbon)

### Colapso y Expansión con Doble Clic
* La cinta superior (`word-ribbon`) admite colapsar la barra inferior de botones haciendo **doble clic** sobre la fila de pestañas o sobre la pestaña activa.
* Al hacer clic en cualquier pestaña mientras la cinta está contraída, o haciendo doble clic de nuevo, el panel se despliega automáticamente.
* Incluye un conmutador manual (`chevron-up` / `chevron-down`) situado en la esquina derecha junto al botón del Índice.

### Internacionalización Completa (i18n)
* Todos los títulos de pestaña, grupos de herramientas, botones, descripciones emergentes (`title`), etiquetas de accesibilidad (`aria-label`) y modales están integrados en `I18nService`.
* Soporta alternar fluidamente entre español e inglés sin recargar el editor.

---

## 3. Pestaña Insertar (`WordInsertToolbarComponent`)

Organizada en grupos funcionales estándar de Microsoft Word, respetando las exclusiones arquitectónicas del sistema:

| Grupo | Herramientas disponibles | Exclusiones deliberadas |
| --- | --- | --- |
| **Páginas** | Página en blanco (`addNewPage`), Salto de página manual (`insertPageBreak`). | *Cover page* (Portadas predefinidas). |
| **Tablas** | Selector visual de cuadrícula filas × columnas (`WordTablePickerComponent`). | — |
| **Ilustraciones** | Imágenes (`insertImage`), Formas (`shapes-dropdown`), Iconos (`WordIconsModalComponent`), Modelos 3D (`insert3dModel`), SmartArt (`WordSmartArtModalComponent`), Gráficos de métricas (`insertChartTable`), Captura (`insertScreenshot`). | — |
| **Multimedia** | — | *Videos en línea*. |
| **Vínculos** | Hipervínculo externo o enlace a notas de Weave (`insertLink`). | *Marcadores (Bookmarks)*, *Referencias cruzadas*. |
| **Comentarios** | Insignia editable de revisión inline destacada en amarillo (`insertComment`). | — |
| **Encabezado y Pie** | Foco en encabezado (`focusHeaderArea`), foco en pie (`focusFooterArea`), campo de número de página (`insertPageNumber`). | — |
| **Texto** | Cuadro de texto flotante, WordArt artístico con degradados/sombras, Letra capital (*Drop Cap*), Línea de firma formal con cargo, Fecha y hora automática. | *Quick Parts*, *Objetos OLE*. |
| **Símbolos** | Ecuación matemática en LaTeX (`WordLatexModalComponent`), Paleta de símbolos especiales ($\Omega$, $\pi$, $\mu$, $\sum$, $\infty$, ©, ®, ™, etc.). | — |

---

## 4. Selector de Formas Vectoriales (Shapes)

El menú desplegable de Formas reproduce el catálogo visual de Microsoft Word clasificado en categorías:
1. **Formas usadas recientemente:** Acceso directo a las formas frecuentes (líneas, flechas, rectángulos, óvalos).
2. **Líneas:** Línea recta, flecha simple, doble flecha, conector acodado y conector curvo.
3. **Rectángulos:** Rectángulo normal, redondeado y con esquinas cortadas diagonalmente.
4. **Formas básicas:** Cuadro de texto `[A]`, óvalo, triángulo isósceles, rombo, cilindro, cubo 3D, corazón, rayo, nube, carita sonriente.
5. **Flechas de bloque:** Flechas anchas en 4 direcciones, bidireccionales y cheurones.
6. **Formas de ecuación:** $+$, $-$, $\times$, $\div$, $=$, $\ne$.
7. **Diagrama de flujo:** Proceso, decisión, datos y documento.
8. **Cintas y estrellas:** Estrellas de 5 puntas y banners de cinta.
9. **Llamadas:** Bocadillos de diálogo redondeados y rectangulares con puntero.
10. **Nuevo lienzo de dibujo:** Inserta un área delimitada para agrupar composiciones.

### Mecanismo de Inserción
Los botones de formas incorporan prevención de pérdida de foco (`(mousedown)="$event.preventDefault()"`) y admiten tanto un **clic simple** como **doble clic** (`(click)` y `(dblclick)`), garantizando que la forma se inserte inmediatamente en el cursor del documento o en la página activa.

---

## 5. Gráficos SmartArt (`WordSmartArtModalComponent`)

Diálogo modal de 3 columnas idéntico al asistente de Office:
* **Columna 1 (Categorías):** *Todos*, *Lista*, *Proceso*, *Ciclo*, *Jerarquía*, *Relación*, *Matriz*, *Pirámide* e *Imagen*.
* **Columna 2 (Galería de diagramas):** Tarjetas con iconos de cada diseño (*Lista de bloques básica*, *Hexágonos*, *Lista con viñetas*, *Proceso paso a paso*, *Línea de tiempo*, *Ciclo continuo PDCA*, *Organigrama empresarial*, *Diagrama de Venn*, *Matriz 2x2 FODA*, *Pirámide escalonada*, *Lista con fotos*).
* **Columna 3 (Previsualización y descripción):** Tarjeta con bloques cromáticos de maqueta (naranja, gris, amarillo, azul y verde), título en negrita y explicación de uso recomendado.
* **Inserción en el documento:** Genera bloques estructurados donde los textos son directamente editables (`contenteditable="true"`), manteniendo un esquema cromático sobrio y apto para exportación o impresión.

---

## 6. Biblioteca de Iconos Vectoriales (`WordIconsModalComponent`)

* **Búsqueda reactiva:** Filtra en tiempo real por nombre de icono o etiquetas en español.
* **Categorías:** *Todos*, *Interfaz*, *Negocios*, *Comunicación*, *Tecnología*, *Educación*, *Flechas*.
* **Inserción limpia de vectores SVG inline:** A diferencia de envoltorios `inline-flex` que causaban colapso vertical del texto adyacente, el sistema inserta el trazado vectorial SVG real correspondiente al icono elegido (utilizando el mapa de trazados `ICON_SVG_PATHS` de Lucide) con `display: inline-block; vertical-align: -4px; pointer-events: none;`, seguido de un espacio no destructible `&nbsp;`. Esto asegura que el cursor se posicione en el flujo normal del párrafo y cualquier texto posterior se escriba horizontalmente de manera fluida y natural.

---

## 7. Manejo Robusto del Cursor y la Selección en Inserciones

La manipulación de menús y diálogos flotantes provoca que el foco del navegador se desplace fuera del elemento `contenteditable`. Para garantizar que tanto los iconos como las formas (con clic simple o doble clic) se inserten exactamente donde el usuario tenía el cursor:

1. **Captura reactiva de la selección (`captureSelection`):** Los componentes de la cinta (`WordInsertToolbarComponent`, `WordHomeToolbarComponent`, etc.) emiten `captureSelection` en el evento `mousedown` antes de abrir cualquier desplegable o modal, guardando el rango exacto mediante `rememberRibbonSelection()`.
2. **Inserción nativa con DOM Range (`insertHtmlAtCursorOrActivePage`):** Se restaura el rango con `prepareRibbonSelection()` y se inyecta el contenido usando `Range.insertNode()` en lugar de comandos obsoletos como `execCommand`:

```typescript
insertHtmlAtCursorOrActivePage(html: string): void {
  this.pushUndoSnapshot();
  const range = this.prepareRibbonSelection();
  const activeEl = this.getActivePageElement();
  if (!activeEl) return;

  let targetRange: Range | null = range;
  const sel = window.getSelection();
  if (!targetRange && sel && sel.rangeCount > 0 && activeEl.contains(sel.anchorNode)) {
    targetRange = sel.getRangeAt(0);
  }

  let insertedNode: Node | null = null;
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const fragment = template.content;
  const lastChild = fragment.lastChild;

  if (targetRange && activeEl.contains(targetRange.commonAncestorContainer)) {
    targetRange.deleteContents();
    targetRange.insertNode(fragment);
    if (lastChild) {
      insertedNode = lastChild;
      const newRange = document.createRange();
      newRange.setStartAfter(lastChild);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    }
  } else {
    // Si no había cursor activo, se anexa a la página activa
    if (activeEl.childNodes.length === 1 && activeEl.firstElementChild?.tagName === 'P' && !activeEl.firstElementChild.textContent?.trim()) {
      activeEl.replaceChildren(fragment);
    } else {
      activeEl.appendChild(fragment);
    }
    if (lastChild && activeEl.contains(lastChild)) {
      insertedNode = lastChild;
      const newRange = document.createRange();
      newRange.setStartAfter(lastChild);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    }
  }

  this.pendingRenderPages = null;
  this.commitPageDomToState(this.activePageIndex());
  this.checkAndPaginateOverflow(this.activePageIndex());
  this.scheduleAutoSave(this.collectDocData());
  this.scheduleDocumentFlow();

  setTimeout(() => {
    if (insertedNode instanceof HTMLElement) {
      insertedNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (insertedNode?.parentElement) {
      insertedNode.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 40);
}
```

---

## 8. Persistencia y Paginación

* Cada hoja del documento se aísla en su propio contenedor `.word-editor-canvas` dentro de `.word-page-sheet`.
* El servicio `DocumentFlowService` y el método `checkAndPaginateOverflow` calculan el desbordamiento vertical con respecto a las dimensiones del papel (`A4`, `Carta`, `Oficio`, etc.) y los márgenes seleccionados, distribuyendo el contenido a páginas subsiguientes y conservando los saltos de página manuales (`breakBefore: 'manual'`).
* Cualquier inserción dispara automáticamente el registro en el historial de deshacer (`pushUndoSnapshot`) y la sincronización con `notesService` en segundo plano.

---

## 9. Galería de Estilos y Menú Contextual de Encabezados (`WordHomeToolbarComponent`)

La galería de estilos en la pestaña **Inicio** emula con precisión el comportamiento de Microsoft Word:
1. **Disposición horizontal compacta con desplazamiento:** Las tarjetas de estilos (`Normal`, `Título 1`, `Título 2`, etc.) se disponen en una fila continua con scroll horizontal interactivo asistido por rueda del ratón (`(wheel)="onGalleryWheel($event)"`).
2. **Dimensionado y tipografía de tarjetas:**
   * Las tarjetas `.style-tile` cuentan con un ancho óptimo (98px) y un tamaño de fuente de previsualización acotado (11.5px a 13.5px).
   * El texto está contenido en un elemento `.style-label` con `min-width: 0` y `text-overflow: ellipsis`, evitando que títulos largos o estilos en negrita colapsen o sufran truncamiento bilateral (como el recorte que mostraba "eading" en lugar de "Título 1").
3. **Menú contextual anclado inmediatamente debajo de la tarjeta:**
   * Tanto el clic derecho sobre cualquier tarjeta (`(contextmenu)`) como el clic sobre el botón cheurón de opciones (`.style-options`) despliega el menú contextual de opciones (`Actualizar para que coincida con la selección`, `Modificar estilos…` y `Aplicar`).
   * **Posicionamiento relativo a la cinta:** El menú se posiciona con `position: absolute` dentro del contenedor relativo `.styles-group`, calculando `top` exactamente en la base de la tarjeta (`tileRect.bottom - groupRect.top + 2`) y alineando `left` con el borde izquierdo de la tarjeta activa.
   * Esto elimina por completo el desfase vertical donde el menú aparecía flotando 150px más abajo sobre la regla y el lienzo del documento.
   * El menú se cierra limpiamente al redimensionar la ventana (`window:resize`), al hacer scroll en la galería (`wheel`) o al hacer clic fuera del control (`document:mousedown`).

---

## 10. Pestaña Diseño (`WordDesignToolbarComponent`)

La pestaña **Diseño** (o *Design / Estilos*) replica la barra de diseño de Microsoft Word, dividida en 3 grupos funcionales:

```
[ Temas ▾ ] | [ Galería de Formato de Documento (Mini-hojas) | Colores ▾ | Fuentes ▾ | Espaciado ▾ | Efectos ▾ | Predeterminar ] | [ Marca de agua ▾ | Color de página ▾ | Bordes de página ▾ ]
   Temas    |                         Formato del documento                                                                   |                    Fondo de página
```

1. **Temas (`Themes`):**
   * Botón vertical con icono y selector desplegable de paletas y estilos globales (*Predeterminado de Office*, *Moderno*, *Académico IEEE*, *Ejecutivo*, *Elegante*, *Cálido*).
2. **Formato del Documento (`Document Formatting`):**
   * **Galería desplazable de miniaturas de página:** Muestra tarjetas en miniatura que simulan hojas de papel reales con su título superior, barra decorativa o línea divisoria, encabezado `Título 1` y líneas de párrafo simuladas. Al seleccionar una plantilla se sincronizan instantáneamente las reglas tipográficas de todo el documento.
   * **Controles laterales:**
     * **Colores:** Selector de paletas cromáticas primarias y secundarias.
     * **Fuentes:** Emparejamientos tipográficos profesionales (*Calibri*, *Arial*, *Times New Roman*, *Segoe UI*, *Georgia*, *Consolas*).
     * **Espaciado entre párrafos:** Preajustes (*Compacto 4pt*, *Predeterminado 6pt*, *Abierto 10pt*, *Doble 14pt*).
     * **Efectos:** Estilos visuales sutiles y ejecutivos.
     * **Establecer como predeterminado:** Guarda la combinación elegida como configuración por defecto del usuario.
3. **Fondo de Página (`Page Background`):**
   * **Marca de agua (`Watermark`):** Desplegable con opciones predefinidas (*CONFIDENCIAL*, *BORRADOR*, *NO COPIAR*, *URGENTE*, *PRIORITARIO*), opción de texto personalizado con entrada interactiva y opción para quitar la marca de agua. Se dibuja con SVG centrado semitransparente con inclinación a 45°.
   * **Color de página (`Page Color`):** Paleta de tonos suaves de lectura (*Blanco*, *Sepia / Crema*, *Gris Hielo*, *Azul Brisa*, *Menta Suave*, *Lavanda*, *Rosa Pálido*) e ingreso de color hexadecimal personalizado. Se aplica reactivamente al fondo del lienzo de todas las páginas de la nota.
   * **Bordes de página (`Page Borders`):** Selector de estilo de borde de página (*Sin borde*, *Cuadro simple continuo*, *Doble línea formal*, *Marco grueso ejecutivo*, *Línea discontinua*, *Línea punteada*).

---

## 11. Pestaña Disposición (`WordLayoutToolbarComponent`)

La pestaña **Disposición** (o *Layout*) organiza la geometría espacial del documento en 3 grupos funcionales:

```
[ Márgenes ▾ | Orientación ▾ | Tamaño ▾ | Columnas ▾ | Saltos ▾ / Números ▾ / Guiones ▾ ] | [ Sangría: Izq/Der cm | Espaciado: Antes/Después pt ] | [ Panel de selección | Alinear ▾ | Ajustar texto ▾ | Rotar ▾ ]
                                Configurar página                                         |                        Párrafo                       |                               Organizar
```

1. **Configurar Página (`Page Setup`):**
   * **Márgenes (`Margins`):** Menú desplegable con preajustes de Office (*Normal 2.5/3.0 cm*, *Estrecho 1.27 cm*, *Moderado*, *Ancho*, *Reflejado*) y formulario interactivo para márgenes personalizados (Superior, Inferior, Izquierdo, Derecho en cm) con conversión milimétrica a píxeles.
   * **Orientación (`Orientation`):** Conmutador vertical entre *Vertical (Portrait)* y *Horizontal (Landscape)*, adaptando las medidas de ancho y alto de todas las páginas al instante.
   * **Tamaño (`Paper Size`):** Catálogo completo de dimensiones estándar internacionales y americanas (*Carta*, *Oficio*, *Legal*, *A4*, *Executive*, *A5*, *B5*, *A3*, *Tabloid*).
   * **Columnas (`Columns`):** Selector de 1 columna, 2 columnas, 3 columnas, y asimétricas izquierda/derecha.
   * **Saltos, Números de línea y Guiones:** Inserción de saltos de página forzados, contador marginal numerado de líneas de texto y control de partición de palabras.
2. **Párrafo (`Paragraph`):**
   * **Sangría (`Indent`):** Spinners de precisión con pasos de `0.25 cm` para sangría izquierda y sangría derecha con enlace bidireccional a los formatos activos del cursor.
   * **Espaciado (`Spacing`):** Spinners con pasos de `2 pt` para espaciado anterior (*Before*) y posterior (*After*), además de control rápido de interlineado (*1.0*, *1.15*, *1.5*, *2.0*, etc.).
3. **Organizar (`Arrange`):**
   * **Panel de selección:** Botón vertical que abre o cierra el panel de navegación e índice (`word-toc-sidebar`).
   * **Alinear, Ajustar texto, Posición y Rotación:** Menús contextuales de distribución geométrica para objetos, tablas e imágenes insertadas.

---

## 12. Estandarización de Altura Uniforme de la Cinta (Ribbon Height Matching)

Para proporcionar una experiencia de usuario idéntica a las aplicaciones de escritorio y evitar saltos o vibraciones verticales al alternar pestañas:

* **Referencia dimensional fijada:** Se adoptó como estándar de diseño la altura de la pestaña **Insertar** (`WordInsertToolbarComponent`).
* **Especificaciones CSS unificadas en todos los componentes:**
  * **Contenedor exterior de la cinta (`.ribbon-pill-container`):** Altura fija estricta de `82px` (`min-height: 82px; height: 82px; max-height: 82px; padding: 6px 12px;`).
  * **Barras de herramientas hijas (`WordHomeToolbarComponent`, `WordInsertToolbarComponent`, `WordDesignToolbarComponent`, `WordLayoutToolbarComponent`, y las vistas de `View`, `Import`, `Export`):**
    * Altura fija de `68px` (`min-height: 68px; height: 68px; max-height: 68px;`).
    * Fila de controles interactivos (`.control-row`): `48px`.
    * Etiqueta de grupo inferior (`.group-label`): `16px` de altura, tipografía de `10px`, margen automático superior y línea de base alineada.
* **Resultado:** La transición entre cualquiera de las pestañas (`Inicio`, `Insertar`, `Diseño`, `Disposición`, `Vista`, `Importar`, `Exportar`) mantiene el lienzo del documento, las reglas y los márgenes en una posición absolutamente estática, con fluidez instantánea.

---

## 13. Arquitectura de Desplegables Flotantes Libres (Unclipped Floating Popovers)

Para replicar con precisión el comportamiento de Microsoft Word —donde los menús contextuales de estilos de títulos (H1–H6), el menú de formas vectoriales, el selector de tablas, WordArt y las opciones de diseño y disposición sobresalen de la cinta y flotan directamente sobre la regla y la hoja del documento sin ser recortados:

### Causa Raíz del Recorte Anterior
* Según la especificación W3C de CSS (*CSS Overflow Module Level 3*), cuando a un contenedor se le asigna `overflow-x: auto` y `overflow-y: visible`, el navegador computa obligatoriamente `overflow-y` como `auto` (o `scroll`).
* Como el contenedor `.ribbon-pill-container` tenía `height: 82px; max-height: 82px;`, cualquier elemento con `position: absolute` cuyo contenido superara los 82px de altura (por ejemplo, el menú de estilos de 110px de alto o el menú de formas) era recortado horizontalmente en la base de la cinta.
* El selector nativo de fuentes `<select>` funcionaba porque los menús desplegables nativos del sistema operativo son renderizados fuera del contexto de apilamiento del DOM por el motor del navegador.

### Solución Implementada
1. **Contenedor exterior de la cinta (`.ribbon-pill-container`):**
   * Configurado con `overflow: visible !important; position: relative; z-index: 40;`.
   * Las galerías de estilos internas (`.style-gallery` en Inicio y `.doc-styles-gallery` en Diseño) conservan su propio scroll horizontal localizado (`overflow-x: auto; overflow-y: hidden;`), aislando el desplazamiento dentro de sus límites.
2. **Jerarquía de Capas de Apilamiento (Z-Index):**
   * Contenedor sticky del Ribbon (`#toolbarRef`): `sticky top-0 z-40 overflow-visible`.
   * Desplegables y menús flotantes (`.floating-style-menu`, `.home-menu`, `.shapes-dropdown-menu`, `.wordart-dropdown-menu`, `.design-dropdown-menu`, `.layout-dropdown-menu`, `app-word-table-picker`): `position: absolute; z-index: 1000 !important; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.22); border: 1px solid #cbd5e1; border-radius: 8px;`.
3. **Comportamiento en pantalla:**
   * Todos los desplegables de todas las pestañas se proyectan limpiamente hacia abajo, superponiéndose a la regla horizontal y a la hoja de trabajo sin ningún recorte, y cerrándose al hacer clic fuera mediante `@HostListener('document:mousedown')`.

---

## 14. Tema Oscuro Completo (Dark Theme & Switch Modes)

El procesador de texto incorpora una implementación integral del **Tema Oscuro (Dark Mode)** inspirada en el tema oscuro/negro oficial de Microsoft Office 365:

```
[ Pestañas Negras/Grafito ] -> [ Píldora de Cinta Oscura #202024 ] -> [ Paneles Flotantes #18181b ]
[ Regla Visual Grafito ]    -> [ Escritorio #020617 / #0f172a ]   -> [ Hojas con modo Cambiar Modos ]
```

### Componentes y Estilizado del Modo Oscuro
1. **Cinta de herramientas (`WordRibbonComponent`):**
   * Encabezado superior (#toolbarRef): Fondo `#18181b`, borde `#27272a` y texto blanco suave `#f4f4f5`.
   * Pestañas: Activa con texto blanco brillante y subrayador azul; inactivas con texto `#a1a1aa`.
   * Píldora de herramientas (`.ribbon-pill-container`): Fondo grafito `#202024`, borde `#323238` y elevación suave.
   * Conmutador rápido directo en la esquina superior derecha junto al botón de Índice para alternar el tema sin necesidad de cambiar a la pestaña Vista.
2. **Barras de herramientas hijas (`WordHomeToolbar`, `WordInsertToolbar`, `WordDesignToolbar`, `WordLayoutToolbar`):**
   * Reciben reactivamente la propiedad `[darkMode]="darkMode"`.
   * Botones: Color `#e4e4e7`, hover con fondo `#27272a` y borde `#3f3f46`, activo con acento azul `#1e3a8a`.
   * Entradas y selectores: Fondo `#18181b`, borde `#3f3f46`, texto blanco `#f4f4f5`.
   * Desplegables contextuales: Fondo `#18181b`, bordes oscuros `#3f3f46`, sombras profundas `rgba(0, 0, 0, 0.6)`.
   * Selector de tablas (`WordTablePickerComponent`): Matriz de celdas oscura con realce de selección azul.
   * Galería de formas vectoriales: Inversión de luminosidad para que las siluetas vectoriales destaquen con nitidez sobre fondo oscuro.
3. **Panel de Índice y Navegación (`WordTocSidebarComponent`):**
   * Fondo `#18181b`, borde divisor `#27272a`, conmutador de Títulos/Tablas integrado en `#202024` y buscador oscuro.
4. **Regla horizontal, Barra contextual de tablas y Panel de búsqueda:**
   * Adaptación completa de colores para evitar contrastes molestos o deslumbramientos.
5. **Función «Cambiar Modos» (*Switch Modes*):**
   * Al igual que Microsoft Word, en la pestaña **Vista** bajo el grupo **Inmersivo**, los usuarios pueden alternar entre:
     * **Página oscura:** Hoja `#18181b` con tinta clara `#f4f4f5`, ideal para sesiones nocturnas o baja luminosidad.
     * **Página clara:** Hoja de papel blanco clásica con tinta oscura, manteniendo la cinta, paneles y escritorio en tema oscuro.
   * Ambas preferencias se persisten reactivamente en `note.docData` mediante autosave silencioso.
6. **Galería de Estilos y Encabezados en Modo Oscuro (Fidelidad Word 365):**
   * En la pestaña Inicio (`WordHomeToolbar`), las tarjetas de la galería de estilos (`.style-tile`) se representan como mini-tarjetas blancas de previsualización (`background: #ffffff`, borde `#52525b`, sombra suave).
   * Esto garantiza que los estilos con colores oscuros predeterminados (por ejemplo, azul marino para Título 1, negro `#0f172a` para Normal) mantengan un contraste del 100% y legibilidad perfecta sin volverse invisibles sobre fondos oscuros.
7. **Modales del Editor con Soporte Completo de Tema Oscuro e Internacionalización (i18n):**
   * **Selector de Iconos (`WordIconsModalComponent`):** Contenedor `#18181b`, inputs de búsqueda `#202024`, chips de categorías y cuadrícula de iconos en tarjetas vectoriales oscuras con textos e indicadores traducibles (ES/EN).
   * **Editor de Ecuaciones LaTeX (`WordLatexModalComponent`):** Diálogo oscuro `#18181b`, caja de código monoespaciada `#141416`, contenedor de previsualización KaTeX con renderizado matemático blanco/claro sobre fondo oscuro, pestañas de categorías temáticas (Matemáticas, Física, Química, Biología) y subcategorías de símbolos traducidas reactivamente (ES/EN).
   * **Diseñador de Plantillas de Estilos (`WordStyleTemplatesModalComponent`):** Panel lateral de plantillas `#141416`, selector de nivel H1–H6 y P, formulario de propiedades `#1c1c20`, selectores/entradas `#202024`, previsualización fiel del texto y acciones del pie traducidas de forma integral (ES/EN).
   * **SmartArt (`WordSmartArtModalComponent`):** Ventana modular oscura de tres columnas con previsualización adaptativa.
8. **Sincronización Global del Tema:**
   * El estado del tema se encuentra centralizado en `ThemeService` mediante `isDark` (Angular Signals).
   * Al alternar el tema desde el encabezado superior (icono de luna/sol en Ajustes), desde la cinta de Word o desde cualquier vista de la plataforma, el cambio se propaga de manera reactiva y sincronizada en toda la aplicación web y en el editor de documentos.

---

## 15. Renderizado Matemático LaTeX, Marcas de Agua Reactivas y Limpieza de Cinta

1. **Previsualización de Fórmulas Matemáticas en Modo Oscuro:**
   * **KaTeX con `::ng-deep`:** Se reemplazaron selectores encapsulados por `::ng-deep .katex` tanto en el modal (`WordLatexModalComponent`) como en el lienzo del documento (`pure-doc-editor.component.scss`).
   * **Visibilidad de trazos y símbolos:** Los elementos matemáticos internos (`.mord`, `.mbin`, `.frac-line`, `.sqrt-sign`, elementos SVG `path` y `line`) se renderizan en blanco de alto contraste (`#f4f4f5 !important`) garantizando máxima legibilidad sobre fondo oscuro `#141416` / `#18181b`.
   * **Tarjetas de fórmulas:** La previsualización de fórmulas y operadores en la cuadrícula de biblioteca visual adapta su color tipográfico al tema oscuro sin opacarse.
2. **Marcas de Agua (`Watermarks`) con Reactividad Instantánea:**
   * **Aplicación inmediata:** Se inyectó `ChangeDetectorRef` en `PureDocEditorComponent` para forzar la actualización de vista (`cdr.markForCheck()`) y el auto-guardado en cuanto se selecciona cualquier marca de agua predefinida (*Confidencial*, *Borrador*, *No copiar*, *Urgente*, *Prioritario*) o personalizada, eliminando la necesidad de recargar la página.
   * **Capa flotante `z-10`:** La marca de agua se posiciona en una capa superior translúcida con `pointer-events-none`, visible nítidamente sobre hojas claras (`rgba(148, 163, 184, 0.35)`) y oscuras (`rgba(244, 244, 245, 0.22)`), sin interferir con la selección de texto ni quedar oculta tras el lienzo editable.
3. **Optimización de la Pestaña Insertar:**
   * **Eliminación de botón simulado:** Se retiró el botón de «Modelos 3D» del grupo *Ilustraciones* en `WordInsertToolbarComponent`.
   * **Preservación estricta de bordes:** Se mantienen intactos los separadores divisorios de grupo (`border-right: 1px solid #e2e8f0` en modo claro y bordes oscuros en tema nocturno) y la altura uniforme estandarizada de 68px de la cinta.
4. **Inserción de Tablas en Blanco:**
   * En `PureDocEditorComponent.handleInsertTable(rows, cols)`, las celdas generadas ya no incluyen textos de muestra («Encabezado X», «Dato Y.Z»), sino que se insertan limpias con `<br/>`, listas para escribir de forma inmediata en cualquier celda.
5. **Ecuaciones LaTeX por Defecto en Blanco:**
   * En `WordLatexModalComponent`, al abrir el diálogo de nueva fórmula el campo de código LaTeX inicia vacío (`''`) en lugar de precargar una expresión de muestra, permitiendo escribir o seleccionar directamente de las categorías interactivas.




