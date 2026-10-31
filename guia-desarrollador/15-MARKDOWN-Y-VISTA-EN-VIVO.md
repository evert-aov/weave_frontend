# 15 — Texto enriquecido y vista previa

[Volver al índice](README.md)

## Experiencia actual

Los documentos por bloques usan **Tiptap/ProseMirror** para el texto, con la barra de herramientas
original: H1–H6, formato, listas, tareas, referencias, estilos, plantillas y edición de tablas.
Los bloques nuevos están vacíos y abren en **Editar**.

**Vista previa** muestra el contenido renderizado y desactiva la edición. Oculta la barra de
formato, los indicadores de encabezado y el placeholder, manteniendo el selector para volver
a **Editar**. No muestra HTML ni sintaxis Markdown ni ofrece Vim. Los enlaces siguen usando
la navegación documental existente. El modo lectura global mantiene todo el bloque no editable.

La vista previa reutiliza la misma instancia de Tiptap y su DOM. No hay un segundo editor ni
conversión del contenido al alternar. Antes de entrar se vacían las ediciones pendientes, se
cierra el panel de estilos y se guarda un bookmark de selección; al volver se recupera la
selección y el foco. El historial de deshacer y las celdas combinadas se conservan.

## Compatibilidad y persistencia

El formato predeterminado vuelve a ser:

```ts
{ type: 'text', content: { format: 'richtext', html: '<p></p>' } }
```

Los documentos existentes con `format: 'markdown'` se renderizan desde su fuente `markdown`
mediante Marked y DOMPurify antes de cargar Tiptap. Se usa la fuente canónica, incluso si su
campo `html` está desactualizado. Los bloques `richtext` y anteriores sin formato se cargan
desde HTML, ignorando cualquier copia Markdown obsoleta.

Abrir o alternar la vista previa no migra la nota en Mongo. Primero se estabiliza el documento
con el esquema de Tiptap (incluido su párrafo final después de una tabla) y se registra esa
línea base. Solo las ediciones posteriores o los cambios de estilos se guardan como `richtext`.
Esto también evita que las exportaciones Markdown lean una fuente anterior a la última edición.

`flushContent()` centraliza el guardado de HTML, formato y estilos. Agrupa cambios durante
500 ms y vacía la edición pendiente al perder el foco, entrar en preview o destruir el bloque.
Siempre usa el ID de la nota propietaria, aunque ya se haya seleccionado otro documento.
`NotesService` conserva su cola de guardado en la API NestJS/Mongo; el preview no usa localStorage.

## Arquitectura

- `blocks/text-block/`: editor, vista previa, barra y persistencia.
- `editor/document-editor/`: monta directamente `TextBlockComponent` para cada bloque `text`.
- `shared/markdown/markdown-document.ts`: compatibilidad con las notas Markdown anteriores.
- `core/services/notes.service.ts`: valores iniciales vacíos y guardado de notas.

La integración anterior de CodeMirror queda fuera del flujo del workspace. No se monta el
componente Markdown ni se solicitan su runtime o su adaptador Vim; se retiró su import map del
arranque. Los archivos de esa integración y los assets locales generados previamente no se
borran. LaTeX mantiene su editor Monaco independiente, descrito en la guía 14.

## Alineación por línea en fórmulas

En un bloque LaTeX básico, activar **Alineación por línea**. Cada ecuación puede heredar la
alineación del bloque o usar izquierda, centro o derecha. Se consideran separadores Enter
y `\\` a nivel superior; las líneas vacías no crean ecuaciones. Los entornos `aligned`,
`cases`, matrices y argumentos entre llaves se mantienen completos. Las definiciones de macros
mantienen todo el fragmento unido para no perder su alcance.

Se guardan `content.alignByLine` y `content.lineAlignments` (valores `left|center|right|null`).
Al insertar o eliminar ecuaciones se conservan las alineaciones de los prefijos y sufijos
sin cambios. `shared/latex/render-formula.ts` es el renderizador compartido por el bloque y
las exportaciones HTML/PDF; mantiene KaTeX sin comandos de confianza y con expansión acotada.
El tamaño de fuente continúa siendo una propiedad del bloque. El modo LaTeX avanzado usa la
alineación escrita en el propio código TeX y el compilador PDF existente.

## Verificación

```sh
npm test -- --watch=false
npm run build
```

Las pruebas del texto enriquecido cubren el selector Editar/Preview, solo lectura, conservación
de selección y deshacer, tablas combinadas, contenido Markdown anterior y guardado de cambios
con la fuente correcta. También cubren que abrir o previsualizar no escriba cambios artificiales.

En navegador: editar un título y una tabla, pasar a Vista previa, abrir una referencia, volver
a Editar y deshacer; cambiar de nota inmediatamente después de escribir y comprobar su guardado.
