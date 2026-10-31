# Guía del desarrollador — frontend Angular de Weave

El frontend combina navegación por espacios, documentos por bloques y editores especializados.
Angular administra rutas, estado y persistencia; Tiptap, Univer, Excalidraw, Monaco y el visor
PPTX aportan capacidades concretas. Cada motor se descarga al abrir el documento o bloque que
lo necesita. Las credenciales de proveedores de IA pertenecen a FastAPI.

## Contenido

| Capítulo | Tema |
| --- | --- |
| [00 — Arquitectura y configuración](00-ARQUITECTURA-Y-CONFIGURACION.md) | Dependencias, rutas, entornos y arranque. |
| [01 — Sesión y servicios centrales](01-SESION-Y-SERVICIOS-CENTRALES.md) | JWT, HTTP, Signals, idioma y tema. |
| [02 — Notas, pestañas y guardado](02-NOTAS-PESTANAS-Y-GUARDADO.md) | Metadatos, carga de contenido y autoguardado. |
| [03 — Editor por bloques](03-EDITOR-POR-BLOQUES.md) | Tipos de bloque, carga diferida y reordenamiento. |
| [04 — Documentos especializados](04-DOCUMENTOS-ESPECIALIZADOS.md) | Word, hojas, pizarras y presentaciones. |
| [05 — Navegación y diseño](05-NAVEGACION-Y-DISENO.md) | Espacios, acciones, tamaños y ventanas pequeñas. |
| [06 — IA y exportación](06-IA-Y-EXPORTACION.md) | Chat, redacción asistida y estrategias de exportación. |
| [07 — Rendimiento y pruebas](07-RENDIMIENTO-Y-PRUEBAS.md) | Diagnóstico de pantalla blanca y control del bundle. |
| [08 — Directorios y flujos](08-MAPA-DE-DIRECTORIOS-Y-FLUJOS.md) | Mapa de responsabilidades y puntos de extensión. |
| [09 — Paginación y edición Word](09-PAGINACION-Y-EDICION-WORD.md) | Flujo entre hojas, selección, historial y saltos manuales. |
| [10 — Referencias y navegación](10-REFERENCIAS-Y-NAVEGACION.md) | Enlaces internos, selector, Ctrl+O, Ctrl+I y posiciones de retorno. |
| [11 — Diálogos y creación](11-DIALOGOS-Y-CREACION.md) | Modal reutilizable, tipo antes de nombre, directorios y confirmación de eliminación. |
| [12 — Home y estilos Word](12-HOME-Y-ESTILOS-WORD.md) | Controles de formato, estilos desde la selección y búsqueda/reemplazo. |
| [13 — LaTeX avanzado](13-LATEX-AVANZADO.md) | Fórmulas, documentos completos, autocompletado, guardado y compilación PDF. |
| [14 — Monaco y Vim](14-MONACO-Y-VIM.md) | Editor LaTeX compartido, carga local, autocompletado y teclado modal. |
| [15 — Texto enriquecido y vista previa](15-MARKDOWN-Y-VISTA-EN-VIVO.md) | Tiptap, preview sin Vim, compatibilidad con notas Markdown y alineación por línea en fórmulas. |

| [16 — Chats y edición IA](16-CHATS-Y-EDICION-IA.md) | Conversaciones independientes, adaptadores de edición y pantalla completa LaTeX. |
| [17 — Editor Pure Doc (Word Studio)](17-PURE-DOC-EDITOR.md) | Arquitectura de componentes Word, pestañas Home e Insertar, SmartArt, Formas, Iconos SVG y selección. |

## Inicio rápido

Desde `frontend/`:

```sh
npm ci
npm start
```

La web de desarrollo usa `http://localhost:4200`; el backend debe estar disponible en
`http://localhost:3000`. Revisar [package.json](../package.json) y las dependencias instaladas
para elegir una versión de Node admitida por Angular CLI. No usar un número histórico de Node
como sustituto de comprobar los requisitos de la versión instalada.

## Verificación

```sh
npm test -- --watch=false
npm run test:startup
npm run build
```

El build genera estadísticas y ejecuta automáticamente el control de dependencias de arranque.
Las pruebas HTTP usan respuestas simuladas. La compilación no prueba por sí sola MongoDB,
credenciales de Google, cámara, portapapeles ni el comportamiento visual de todos los editores.

La integración completa se describe también en las guías de
[NestJS](../../backend/guia-desarrollador/README.md) y
[FastAPI](../../ia/guia-desarrollador/README.md).
