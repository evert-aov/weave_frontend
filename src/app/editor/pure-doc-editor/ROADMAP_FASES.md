# Plan de Evolución de Word (`pure-doc-editor`) por Fases

Documento de seguimiento continuo para medir el avance de las 7 fases de mejora del editor Word.

## Resumen de Progreso

| Fase | Nombre | Estado | Avance |
|---|---|---|---|
| **Fase 1** | Notificaciones flotantes unificadas (`showToast` + exportaciones) | Completada | Toast flotante unificado, autocierre y pruebas aprobadas |
| **Fase 2** | Encabezados, pies y numeración avanzada por sección | Completada | Primera página diferente, saltos de sección (`roman`/`decimal`/horizontal), `{{page}}`/`{{totalPages}}` y 65 pruebas aprobadas |
| **Fase 3** | Paridad del motor Canvas con herramientas de *Insertar* (sin emojis) | Completada | Iconos vectoriales SVG sin emojis, SVGs inline/block en Canvas, `word-textbox`, alineación/pie/drop de imágenes en Canvas y 134 pruebas aprobadas |
| **Fase 4** | Tablas profesionales multipágina y menú contextual | Completada | Encabezados `<thead>` repetidos multipágina, `<w:cantSplit/>`, menú contextual en celdas, sombreado/alineación vertical, listas multinivel (`Tab`/`Shift+Tab`) y 150 pruebas aprobadas |
| **Fase 5** | Índices complementarios (Tablas/Figuras) y notas al pie en página | Completada | Índice de tablas y figuras autogenerados y actualizados, enlaces clicables y marcadores en PDF, notas al pie por página en Canvas/PDF y 188 pruebas aprobadas |
| **Fase 6** | Revisión, comentarios anclados y control de cambios | Completada | Pestaña Revisar, panel lateral de comentarios anclados (crear/responder/resolver/ocultar en export), control de cambios (`<ins>`/`<del>`) y 182 pruebas aprobadas |
| **Fase 7** | Regla interactiva y buscador visual con resaltado múltiple | Completada | Regla horizontal interactiva con marcadores arrastrables y toggle APA `36pt`, buscador visual múltiple Canvas/DOM y 193 pruebas aprobadas |

---

## Detalle por Fase

### Fase 1 — Notificaciones flotantes unificadas (`showToast` + exportaciones)
- **Objetivo**: Dar visibilidad real a todos los avisos de `showToast(...)` (acciones de edición, plantillas, saltos de página, deshacer/rehacer, importación) y mostrar el progreso/resultado de exportaciones en un toast flotante que **no empuje el lienzo verticalmente** y desaparezca solo.
- **Entregables**:
  - [x] Temporizador de autocierre para mensajes de exportación (`PDF`, `.docx`, `.doc`, `.html`, `.md`, `.txt`) y botón de cierre manual.
  - [x] Conectar `showToast()` a señal reactiva visible (`toastMessage` / `toastTone` / `activeFeedbackToast`) con autocierre (3.5 s) en `PureDocEditorComponent`.
  - [x] Reemplazar la franja estática bajo la cinta por un contenedor toast flotante superpuesto (compatible con modo claro/oscuro, sin emojis, con SVG para carga/éxito/error).
  - [x] Limpieza de temporizadores en `ngOnDestroy` y cambio de documento (`ngOnChanges`), más pruebas unitarias en `pure-doc-editor.component.spec.ts`.

### Fase 2 — Encabezados, pies y numeración avanzada por sección
- **Objetivo**: Permitir documentos académicos y tesis con portada sin numeración, preliminares en números romanos (`i, ii, iii`) y cuerpo principal reiniciando en arábigos (`1, 2, 3`), además de páginas puntuales horizontales.
- **Entregables**:
  - [x] Opción **"Primera página diferente"** en disposición/encabezados (Canvas, DOM, PDF y DOCX).
  - [x] Propiedades por sección (`sectionBreak`): reinicio de numeración, formato (`roman-lower`, `roman-upper`, `decimal`) y orientación por sección.
  - [x] Campos dinámicos reales `{{page}}` y `{{totalPages}}` en regiones Canvas/PDF/DOCX (`PAGE` / `NUMPAGES` OOXML).
  - [x] Pruebas unitarias de paginación, renderizado y exportación DOCX por sección (`page-section-layout.spec.ts`, `docx-export.spec.ts`, `pure-doc-editor.component.spec.ts`).

### Fase 3 — Paridad del motor Canvas con herramientas de *Insertar*
- **Objetivo**: Lograr que los objetos insertados desde la cinta funcionen nativamente sobre el lienzo Canvas y exporten con fidelidad a PDF/DOCX, eliminando placeholders con emojis.
- **Entregables**:
  - [x] Reemplazar emojis residuales (`🎵`, `🎬`, `💬`, `📸`, `📊`, `📷`, `💡`, `✍`) en `word-insert.controller.ts`, `word-media.controller.ts`, `word-insert.constants.ts` y `word-insert-toolbar.component.html` por iconos vectoriales SVG / Lucide limpios.
  - [x] Soporte en Canvas, PDF y DOCX para SVGs vectoriales inline/bloque (`model-layout.ts`, `docx-export.ts`), bloques destacados editables y cuadros de texto reales (`word-textbox`).
  - [x] Mejoras de imágenes en Canvas: controles flotantes de alineación (`Izq`/`Cen`/`Der`), pie de figura conectado (`insertImageCaption`) y arrastre múltiple fluido (`onCanvasDrop` / `uploadAndInsertImageFile`).
  - [x] Letra capital (*Drop Cap*), firma/fecha y verificación integral en `canvas-edit-session.spec.ts`, `word-canvas-editor.component.spec.ts`, `pure-doc-editor.component.spec.ts`, `model-layout.spec.ts` y `docx-export.spec.ts`.

### Fase 4 — Tablas profesionales multipágina y menú contextual
- **Objetivo**: Llevar las tablas al estándar de procesador de textos para documentos extensos e informes.
- **Entregables**:
  - [x] Repetición automática de filas de encabezado (`<thead>`) cuando una tabla cruza de página en Canvas y PDF.
  - [x] Menú contextual (clic derecho) en celdas: insertar fila arriba/abajo, insertar columna izquierda/derecha, dividir celdas, eliminar fila/columna.
  - [x] Sombreado de celda, alineación vertical (arriba/centro/abajo) y control para evitar dividir filas entre páginas.
  - [x] Mejoras de listas multinivel (`Tab` / `Shift+Tab` y reinicio de numeración).

### Fase 5 — Índices complementarios y notas al pie en Canvas
- **Objetivo**: Completar el flujo académico más allá del índice general.
- **Entregables**:
  - [x] Generación y actualización automática de **Índice de Tablas** e **Índice de Figuras** dentro del documento.
  - [x] Enlaces clicables y marcadores en PDF para índices de tablas y figuras.
  - [x] Renderizado de notas al pie (`footnote`) al final de la página correspondiente en el motor Canvas y PDF (no solo notas finales).

### Fase 6 — Revisión, comentarios anclados y control de cambios
- **Objetivo**: Habilitar flujos de corrección, tutoría de tesis y revisión editorial.
- **Entregables**:
  - [x] Nueva pestaña **Revisar** en `word-ribbon.component.html`.
  - [x] Panel lateral de comentarios anclados a selección (crear, responder, resolver y ocultar en exportación).
  - [x] Modo básico de **Control de cambios** (resaltar inserciones/borrados, aceptar y rechazar cambios).

### Fase 7 — Regla interactiva y buscador visual mejorado
- **Objetivo**: Pulir la ergonomía de edición directa sobre la hoja y búsqueda en documentos largos.
- **Entregables**:
  - [x] Regla horizontal interactiva con marcadores arrastrables para sangría izquierda/derecha, primera línea y sangría francesa (`36pt` APA).
  - [x] Resaltado simultáneo de todas las coincidencias visibles durante *Buscar y reemplazar* diferenciando la coincidencia activa.
