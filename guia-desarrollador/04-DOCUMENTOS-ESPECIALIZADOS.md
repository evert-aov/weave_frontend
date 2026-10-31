# 04 — Documentos especializados

[Volver al índice](README.md)

Los tipos `doc`, `sheet`, `canvas` y `slide` abren editores completos. El host los instancia
mediante un `@defer` por tipo. El shell y las notas comunes no importan sus motores por adelantado.

| Tipo | Entrada | Responsabilidad |
| --- | --- | --- |
| `doc` | `editor/pure-doc-editor` | Páginas, formato, tablas, imágenes, fórmulas, TOC y compatibilidad DOCX. |
| `sheet` | `editor/pure-sheet-editor` | Univer y presets de fórmulas, filtros, orden, formatos y dibujos. |
| `canvas` | `editor/pure-canvas-editor` | Pizarra Excalidraw completa y adaptación React/Angular. |
| `slide` | `editor/pure-slide-editor` | Visor/editor PPTX y serialización binaria. |

## Editor Word

`pure-doc-editor.component` coordina el documento; los controles de cinta y modales viven en
`components/`. `models/` y `constants/` describen páginas y configuración. `services/` separa
parseo DOCX, compatibilidad, fórmulas, imágenes y generación asistida; `utils/` contiene cálculo
y análisis de páginas. Mantener nuevas operaciones en la responsabilidad correspondiente.

Las hojas de Word son fragmentos de un flujo de texto: escribir, pegar o borrar redistribuye
el contenido en ambos sentidos. `DocumentFlowService` mide el HTML con la tipografía y el ancho
del editor; el componente conserva la selección, aplica los fragmentos y guarda el resultado.
Los saltos manuales se distinguen con `DocumentPage.breakBefore`. Ver
[paginación y edición Word](09-PAGINACION-Y-EDICION-WORD.md) antes de modificar el lienzo.

La pestaña Home incluye una galería de estilos que se pueden actualizar a partir de una
selección y aplicar en todas las páginas. Sus controles, selección, historial y persistencia
se detallan en [Home y estilos Word](12-HOME-Y-ESTILOS-WORD.md).

El servicio de imágenes transforma referencias a archivos servidos por el backend y conserva
compatibilidad con referencias anteriores. No reemplazar archivos persistidos por URLs Blob
temporales al guardar un documento.

## Hojas y pizarra

Univer y Excalidraw reciben el snapshot completo de `note.docData`. Cada adaptación convierte
los eventos del motor en cambios de `NotesService`; no guarda directamente en MongoDB. Las
instancias de motores pertenecen al componente activo y deben destruirse al salir.

## PPTX y estilos

`PureSlideEditorComponent` acepta `docData` con Base64 o carga `docUrl` cuando corresponde.
Existe una presentación inicial para nuevos documentos. El componente coordina traducciones,
tema y guardado del contenido serializado del visor.

[EditorStylesService](../src/app/core/services/editor-styles.service.ts) carga
`pptx-angular-viewer.css` al abrir esta herramienta y reutiliza su promesa. Esa hoja se copia
como asset durante el build, pero ya no bloquea el HTML inicial.

Los datos de estos documentos se leen por `GET /api/notes/:id`. El listado resumido no contiene
`docData`; tampoco debe iniciar lecturas de todos los PPTX o JSON desde el servidor.

## Documento LaTeX

El tipo `latex` usa un editor diferido de código y vista previa PDF. Persiste
`docData: {version: 1, source: string}` en Mongo a través de NestJS y comparte autocompletado
con los bloques. Ver [LaTeX avanzado](13-LATEX-AVANZADO.md).
