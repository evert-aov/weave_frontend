# 04 — Documentos especializados

[Volver al índice](README.md)

Los tipos `doc`, `sheet`, `canvas` y `slide` abren editores completos. El host los instancia
mediante un `@defer` por tipo. El shell y las notas comunes no importan sus motores por adelantado.

| Tipo | Entrada | Responsabilidad |
| --- | --- | --- |
| `doc` | `editor/pure-doc-editor` | Páginas, formato, tablas, imágenes, fórmulas, TOC y compatibilidad DOCX. |
| `sheet` | `editor/pure-sheet-editor` | Cuadrícula Angular, fórmulas entre hojas, gráficos SVG, formatos y dibujo flotante. |
| `canvas` | `editor/pure-canvas-editor` | Pizarra Excalidraw completa y adaptación React/Angular. |
| `slide` | `editor/pure-slide-editor` | Aviso temporal de editor deshabilitado; conserva los documentos guardados. |

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

## Hojas de cálculo

`PureSheetEditorComponent` coordina un libro `{ sheets: Sheet[], activeSheetId }`. El modelo
propio conserva celdas, gráficos y objetos flotantes; el evaluador resuelve referencias locales
y entre hojas. Los gráficos usan SVG y separan datos, apariencia y colores por serie.

Los cambios se publican mediante `NotesService`; el componente mantiene historial y debounce.
No se guarda una instancia de motor externo como representación del libro. El bloque de hoja
comparte el modelo y el evaluador, con controles reducidos.

La arquitectura, los flujos de selección, las fórmulas, el rastreo, los gráficos y sus pruebas
se detallan en [Hojas de cálculo](18-HOJAS-DE-CALCULO.md).

## Pizarra

Excalidraw recibe el snapshot de `note.docData`. Su adaptación convierte los eventos del motor
en cambios de `NotesService`; no guarda directamente en MongoDB. La instancia pertenece al
componente activo y se destruye al salir. `EditorStylesService` carga `canvas-vendor.css` al abrirla.

## Presentaciones

El componente de presentaciones muestra actualmente un aviso de editor temporalmente deshabilitado.
Los archivos guardados se conservan para un próximo editor. El visor PPTX y su CSS se retiraron;
no describirlos como una dependencia activa de esta versión.

Los datos completos se leen por `GET /api/notes/:id`. El listado resumido no contiene `docData`
ni debe iniciar lecturas de todos los documentos desde el servidor.

## Documento LaTeX

El tipo `latex` usa un editor diferido de código y vista previa PDF. Persiste
`docData: {version: 1, source: string}` en Mongo a través de NestJS y comparte autocompletado
con los bloques. Ver [LaTeX avanzado](13-LATEX-AVANZADO.md).
