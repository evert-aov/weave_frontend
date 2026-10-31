# 03 — Editor por bloques

[Volver al índice](README.md)

[DocumentEditorComponent](../src/app/editor/document-editor/document-editor.component.ts)
orquesta selección, reordenamiento, inserción y renderizado. Su plantilla decide por
`note.docType` y, en documentos estándar, por `block.type`.

| Tipo | Implementación | Capacidad |
| --- | --- | --- |
| `text` | `blocks/text-block` | Tiptap, listas, tablas y texto enriquecido. |
| `image` | `blocks/image-block` | Subida, cámara y pie de imagen. |
| `file` | `blocks/file-block` | Adjuntos y previsualización de PDF. |
| `canvas` | `blocks/canvas-block` | Excalidraw mediante React. |
| `sheet` | `blocks/sheet-block` | Libro de cálculo Univer. |
| `code` | `blocks/code-block` | Monaco y selección de lenguaje. |
| `latex` | `blocks/latex-block` | Edición y renderizado KaTeX. |
| `mermaid` | `blocks/mermaid-block` | Diagramas declarativos. |

Los bloques con motores grandes están dentro de `@defer (on immediate)` en su caso concreto.
El disparador se activa cuando existe ese bloque en la plantilla; no descarga todos los tipos
al abrir una nota solo de texto. Los estados de carga/error usan
[LazyLoadStateComponent](../src/app/shared/components/lazy-load-state/lazy-load-state.component.ts).

## Inserción y orden

`SlashMenuComponent` comunica el tipo solicitado y `NotesService` crea el bloque, asigna
identificador y normaliza `order`. `BlockRailComponent` aporta botones y tirador de arrastre;
el host mantiene índices de origen, destino, indicador y auto-scroll mediante animation frames.
Las acciones de UI no deben cambiar IDs de bloques ya persistidos.

Un bloque tiene `id`, `type`, `order`, `content` y `metadata`; la estructura de `content`
pertenece a su implementación. El esquema del backend enumera los mismos tipos.

Los documentos nuevos por bloques empiezan con un bloque de texto vacío (`<p></p>`), sin texto
de ejemplo guardado. Su creación sigue el [diálogo compartido de tipo y nombre](11-DIALOGOS-Y-CREACION.md).

## Tablas dentro del texto enriquecido

Las tablas pertenecen al HTML de `block.content.html`; no constituyen otro tipo de bloque ni
requieren un nuevo contrato de backend. El guardado conserva `blockStyles` y el HTML mediante
`NotesService.updateBlockContent`, con el debounce existente de 500 ms. El componente también
envía una edición pendiente al destruirse, para conservar una pegada al cambiar de documento.

[table.extensions.ts](../src/app/blocks/text-block/table.extensions.ts) adapta el esquema
oficial de [ProseMirror Tables](https://github.com/ProseMirror/prosemirror-tables), disponible
en `@tiptap/pm/tables`. Mantener `tableRole`, atributos de combinación (`rowspan`, `colspan`)
y anchos de columna al modificar el adaptador. El plugin proporciona selección de celdas,
pegado de cuadrículas dentro de tablas y corrección de filas. No implementar esas operaciones
mediante reemplazos de cadenas HTML.

El botón **Tabla** inserta una cuadrícula vacía de 3 × 3 con encabezados. Al colocar el cursor
en una celda aparecen acciones para añadir/eliminar filas o columnas, alternar encabezados,
combinar/separar celdas y eliminar la tabla. Tab avanza entre celdas y añade una fila al final;
Shift+Tab retrocede. Las operaciones participan del historial de deshacer/rehacer de Tiptap.
En modo lectura se muestran las tablas y se desactiva la edición.

El procesamiento del portapapeles se comparte con Word mediante
[clipboard-table.ts](../src/app/shared/utils/clipboard-table.ts):

- HTML con `<table>`: conserva celdas, encabezados, combinaciones, formato básico y texto que
  acompañe la tabla; elimina scripts, manejadores de eventos, estilos externos y metadatos del
  editor de origen. El modelo Tiptap conserva el formato que admite su esquema.
- Texto tabulado de Excel/Sheets: requiere al menos dos columnas y filas con igual cantidad
  de celdas. Admite campos entre comillas, saltos de línea internos y celdas vacías.
- Markdown: requiere fila de encabezados y separador `---` por columna; conserva la alineación
  y admite `\|` dentro de una celda. El texto antes/después permanece como párrafos.

No se infieren columnas a partir de espacios ni se convierten párrafos ordinarios o ejemplos
en bloques de código. Este detector convierte tablas Markdown; no es un renderizador general
de Markdown. Al pegar una cuadrícula dentro de una tabla existente, el editor por bloques
rellena las celdas desde la selección actual en vez de insertar una tabla anidada.

Las pruebas de `text-block.component.spec.ts` usan el editor ProseMirror real sobre JSDOM:
pegado HTML/tabulado/Markdown, selección, combinación, teclado, guardado y reapertura. Las de
`clipboard-table.spec.ts` cubren reconocimiento, contenido ordinario y limpieza del HTML.

## Fórmulas LaTeX: tamaño y contenido inicial

Un bloque LaTeX nuevo contiene `formula: ''`; no se inserta una ecuación de ejemplo.
Las fórmulas vacías se muestran vacías y continúan vacías al guardar, reabrir o exportar.
El texto de ejemplo del campo es solamente un placeholder de entrada.

Al pulsar **Editar**, el control **Tamaño** permite elegir de 8 a 96 píxeles, en medios
píxeles, con botones para aumentar o reducir de dos en dos. El tamaño se aplica al
resultado de KaTeX y a su vista previa; el código fuente del textarea conserva su tamaño
de lectura. No se altera el código LaTeX ni el tamaño de los símbolos de la paleta.

El bloque guarda `{ formula, fontSizePx }` dentro de `content`. El tamaño se persiste al
confirmar el campo o pulsar un botón; **Listo**, Ctrl+Enter o salir del editor guardan
las ediciones de la fórmula. Al destruir el componente se conserva la última edición
en el documento propietario, incluso al cambiar de pestaña. Los temporizadores de foco
y renderizado se cancelan al destruirlo.

`shared/utils/latex.ts` contiene el formato multilínea y la normalización del tamaño,
compartidos con los exportadores HTML y PDF. Las fórmulas anteriores sin `fontSizePx`
conservan el tamaño de presentación de 11,5 px. Los valores inválidos no se interpolan
como CSS y se sustituyen por ese valor compatible. HTML/PDF respetan el tamaño del bloque;
Markdown conserva la fórmula original entre `$$` y no representa tamaños tipográficos.
No cambia el contrato de `Block` ni se añaden dependencias o motores al arranque.

`latex-block.component.spec.ts` prueba la creación vacía, los controles reales, lectura,
guardado y reapertura con `NotesService` y HTTP simulado, y el cambio de pestaña. La
prueba de exportación verifica el tamaño y el contenido generado con KaTeX para HTML/PDF.

## Añadir un tipo de bloque

1. Ampliar el contrato de tipo en frontend y backend y su validación.
2. Crear el componente en `blocks/<tipo>/`, con entradas por contrato y mutaciones vía servicio.
3. Incorporarlo al menú de inserción y a los valores iniciales de `NotesService`.
4. Añadir el caso de la plantilla; diferirlo si importa un motor de tamaño considerable.
5. Definir comportamiento de lectura, guardado, limpieza y exportación.

Al integrar un motor externo, liberar instancias, observadores, temporizadores, URLs Blob y
raíces React cuando el componente se destruya. Cargar una dependencia bajo demanda no elimina
la necesidad de liberar sus recursos al cambiar de documento.

## LaTeX avanzado

Los bloques comparten autocompletado con Tab con el nuevo documento LaTeX puro. El modo
Fórmula conserva KaTeX y el tamaño; el modo LaTeX avanzado compila texto, tablas y columnas
a PDF. Ver [guía completa y requisitos del compilador](13-LATEX-AVANZADO.md).
