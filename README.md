# Weave Frontend 🎨

> Cliente web SPA de alto rendimiento para **Weave**, desarrollado con **Angular 22**, arquitectura modular reactiva basada en **Signals**, e integración de suites vectoriales y de cálculo líderes en la industria.

La documentación técnica completa está en la [guía del desarrollador](guia-desarrollador/README.md).
El diagnóstico y las mediciones del arranque están en
[rendimiento y pruebas](guia-desarrollador/07-RENDIMIENTO-Y-PRUEBAS.md).

---

## 🌟 Características Principales

- 🧩 **Arquitectura Modular por Bloques**:
  - **Texto Enriquecido**: Editor basado en [Tiptap](https://tiptap.dev/) con soporte de listas de tareas, encabezados tipográficos y estilos personalizados por bloque.
  - **Hojas de Cálculo Avanzadas**: Integración completa de [Univer Sheets](https://univer.work/) con soporte de fórmulas matemáticas reales (`=SUM`, `=AVERAGE`, etc.), celdas combinadas y preservación en exportación.
  - **Lienzo Gráfico y Pizarra**: Suite vectorial interactiva de [Excalidraw](https://excalidraw.com/) (React bridge), con persistencia de trazos y formas geométricas.
  - **Fórmulas Matemáticas**: Renderizado instantáneo de expresiones LaTeX complejas mediante [KaTeX](https://katex.org/).
  - **Editor de Código Fuente**: Potenciado por [Monaco Editor](https://microsoft.github.io/monaco-editor/) (el motor de VS Code) con resaltado para múltiples lenguajes.
  - **Diagramas de Flujo y Mapas**: Renderizado de especificaciones declarativas con [Mermaid](https://mermaid.js.org/).
  - **Imágenes y Multimedia**: Bloque de carga de imágenes con arrastrar y soltar (drag & drop) y previsualización.

- 📖 **Modos de Trabajo**:
  - **Modo Edición**: Herramientas de formateo, canalón de control de bloques, reordenamiento interactivo y menú slash contextual (`/`).
  - **Modo Lectura**: Ocultación de controles de edición, barras de fórmulas de hojas de cálculo y barras de herramientas de dibujo para una lectura limpia y enfocada.

- 🔍 **Zoom Global Responsivo**:
  - Control de zoom del documento (`notesService.documentZoom`).
  - Los contenedores se ajustan al ancho y tamaño de la vista sin desbordar el entorno.
  - Los componentes interactivos (celdas de cálculo y lienzo de dibujo) preservan su resolución y escala 1:1 nativa sin distorsión ni pérdida de nitidez.

- 🖨️ **Motor de Exportación Triple**:
  - **Imprimir (Vectorial Nativo)**: Utiliza `window.print()` con reglas CSS Paged Media avanzadas (`@page`), márgenes precisos (`16mm 18mm 20mm 18mm`) y supresión de encabezados/pies automáticos del navegador.
  - **Descargar PDF Directo**: Paginación inteligente con `jsPDF` y `html2canvas`, cortes de página calculados en tiempo real para evitar elementos partidos por la mitad, encabezados huérfanos prevenidos y márgenes simétricos en cada página.
  - **Descargar HTML**: Documento completamente autónomo con fuentes web y hojas de estilo optimizadas.

- 🌗 **Diseño y Personalización**:
  - Soporte nativo para tema claro y tema oscuro con transiciones suaves.
  - Soporte multi-idioma (Español / Inglés).

---

## 🏛️ Estructura del Código

### Distribución del espacio de trabajo

La navegación se sitúa a la izquierda, el documento al centro y el asistente de IA a la
derecha. Los nombres de carpetas y documentos pueden ocupar varias líneas. Las acciones
de cada elemento se reúnen en el menú `⋯`, que también admite teclado y no se recorta
al desplazar el árbol.

Los bordes entre paneles permiten ajustar su ancho mediante arrastre o flechas del teclado;
un doble clic restablece el tamaño inicial. Las preferencias se guardan en este navegador.
Con poco espacio, el asistente se superpone al editor; en móviles la navegación es un panel
desplegable que se puede cerrar pulsando fuera.

| Área | Responsabilidad |
| --- | --- |
| `pages/workspace/` | Distribución y comportamiento adaptable de los paneles. |
| `layout/sidebar/space-tree.ts` | Reconstrucción del árbol y cálculo de profundidad. |
| `layout/sidebar/components/item-actions/` | Menú contextual, posición y navegación por teclado. |
| `shared/directives/resize-panel.directive.ts` | Interacción de arrastre y teclado para separadores. |
| `core/services/workspace-layout.service.ts` | Dimensiones y preferencias locales de los paneles. |

Las comprobaciones del frontend son `npm test -- --watch=false` y `npm run build`.

```
src/app/
├── blocks/                    # Componentes de cada tipo de bloque
│   ├── text-block/            # Editor de texto enriquecido (Tiptap)
│   ├── sheet-block/           # Hoja de cálculo interactiva (Univer Sheets)
│   ├── canvas-block/          # Pizarra y bocetos vectoriales (Excalidraw)
│   ├── latex-block/           # Fórmulas matemáticas (KaTeX)
│   ├── code-block/            # Editor de código fuente (Monaco Editor)
│   ├── mermaid-block/         # Diagramas declarativos (Mermaid)
│   └── image-block/           # Carga y renderizado de imágenes
│
├── editor/                    # Núcleo del editor de notas
│   ├── document-editor/       # Lienzo principal del documento
│   ├── block-rail/            # Canalón lateral de acciones por bloque
│   ├── slash-menu/            # Menú emergente de inserción rápida de bloques (/)
│   ├── pure-doc-editor/       # Editor Word y servicios de compatibilidad
│   ├── pure-sheet-editor/     # Hojas completas con Univer
│   ├── pure-canvas-editor/    # Pizarra completa con Excalidraw
│   └── pure-slide-editor/     # Presentaciones PPTX
│
├── export/                    # Lógica de exportación de notas
│   ├── services/
│   │   ├── pdf-export.strategy.ts    # Impresión y PDF directo
│   │   ├── html-export.strategy.ts   # Exportación a HTML limpio
│   │   └── markdown-export.strategy.ts
│   └── components/export-modal/ # Diálogo diferido de configuración de exportación
│
├── layout/                    # Componentes de estructura
│   ├── sidebar/               # Árbol de navegación y espacios de trabajo
│   ├── topbar/                # Barra superior con controles de zoom, modo y acciones
│   ├── document-tabs/         # Pestañas de documentos
│   └── ai-assistant-sidebar/  # Asistente a la derecha del editor
│
└── core/                      # Servicios centrales y modelos de datos
    ├── models/                # Interfaces de Nota, Bloque, Espacio y Usuario
    └── services/              # NotesService, AuthService, ThemeService, I18nService
```

---

## 🛠️ Tecnologías Empleadas

| Área | Tecnología |
|---|---|
| **Framework Base** | Angular 22 (Signals, Standalone Components) |
| **Integración React** | React 19 y ReactDOM Client (para Excalidraw) |
| **Estilos** | SCSS con variables CSS semánticas y diseño adaptable |
| **Texto Enriquecido** | Tiptap Core + Starter Kit + Task List |
| **Hojas de Cálculo** | `@univerjs/preset-sheets-core` |
| **Pizarra Vectorial** | `@excalidraw/excalidraw` |
| **Resaltado de Código**| `monaco-editor` |
| **Fórmulas Matemáticas** | `katex` |
| **Diagramación** | `mermaid` |
| **PDF y Captura** | `jspdf` y `html2canvas` |
| **Pruebas** | `vitest` |

---

## 🚀 Inicio y Desarrollo

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Iniciar servidor de desarrollo
```bash
npm start
# o
ng serve
```
Abre tu navegador en `http://localhost:4200/`. La aplicación se recarga automáticamente tras guardar cambios.

### 3. Compilación para producción
```bash
npm run build
```
Los artefactos compilados y optimizados se generarán en la carpeta `dist/frontend`.
Los archivos servibles están en `dist/frontend/browser`. El build genera
`dist/frontend/browser-stats.json` y comprueba que los motores grandes no estén en el grafo inicial.

### 4. Pruebas unitarias
```bash
npm test
```

Para verificar sin observación y revisar el control de arranque:

```sh
npm test -- --watch=false
npm run test:startup
npm run check:startup
```

---

## 💡 Atajos y Tips de Uso
- Presiona **`/`** en una línea nueva para abrir el **Menú Slash** e insertar cualquier tipo de bloque al instante.
- Haz clic en los botones **`[-] 100% [+]`** en la barra superior para ajustar el **zoom global** del documento según tu pantalla.
- Haz clic en el icono de **Modo Lectura** para ocultar las herramientas de edición y disfrutar de una experiencia de lectura fluida.
- En el botón **Exportar**:
  - Selecciona **Imprimir** para obtener un documento con fidelidad vectorial nativa.
  - Selecciona **Descargar PDF** para una descarga inmediata con saltos de página y márgenes automáticos.
