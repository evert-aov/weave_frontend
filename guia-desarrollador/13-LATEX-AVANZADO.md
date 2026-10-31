# 13 — LaTeX avanzado y documentos completos

[Volver al índice](README.md)

## Uso

En **Nuevo documento → Documento LaTeX → Nombre** se crea un documento vacío.
El botón superior **Editar** habilita la edición, igual que en los demás documentos.
Se puede pegar una fuente completa, importar un `.tex` o pulsar **Insertar estructura**
cuando no hay contenido. La estructura incluye los paquetes del ejemplo de Física II,
pero no agrega texto de muestra al crear el archivo.

El editor muestra código fuente y vista previa PDF. **Compilar PDF** o **Ctrl+Enter**
compila explícitamente; escribir no ejecuta un proceso TeX por cada pulsación.
El registro muestra errores del compilador con referencias `main.tex:número`.
Los cambios posteriores marcan la vista previa como pendiente de recompilar y deshabilitan
la descarga del PDF anterior. `.tex` descarga exactamente el código guardado.

En documentos por bloques:

- **Fórmula** conserva KaTeX, el tamaño de fuente, la alineación izquierda/centro/derecha
  y la vista rápida local. La alineación se guarda en `content.alignment`, se restaura al
  abrir y se conserva en HTML/PDF; las fórmulas anteriores siguen centradas.
- **LaTeX avanzado** admite texto, fórmulas, secciones, listas, tablas, columnas y diagramas/circuitos (`circuitikz` con `siunitx`, `tikzpicture`) mediante
  compilación PDF. Si falta `documentclass`, el servidor envuelve el fragmento en un documento compatible.
- Pegar un documento con `documentclass`, `\usepackage` o entornos compilados como `\begin{circuitikz}` y `\begin{tikzpicture}` activa automáticamente el modo avanzado.
- Los bloques nuevos siguen vacíos. Cambiar de modo conserva el código.
- Los tamaños del modo avanzado se definen en el código (`10pt`, `LARGE`, etc.).

## Autocompletado compartido

Ambos editores usan [Monaco compartido](../src/app/shared/latex/monaco-latex-editor.component.ts),
con carga diferida, resaltado de sintaxis, autocompletado y opción Vim. El
[catálogo](../src/app/shared/latex/latex-completions.ts) contiene comandos, símbolos y
plantillas de entornos. Un textarea conserva la edición mientras carga Monaco o si falla;
en ese respaldo se usa la directiva de autocompletado nativo. Ver
[configuración y pruebas de Monaco/Vim](14-MONACO-Y-VIM.md).

1. Escribir `\fr` propone `\frac`.
2. **Tab** inserta `\frac{}{}` y coloca el cursor en el primer argumento.
3. Escribir el numerador y pulsar **Tab** pasa al denominador; el siguiente Tab sale del snippet.
4. **↑/↓** selecciona otra sugerencia, **Esc** cierra y **Shift+Tab** conserva la navegación normal.

No sugiere dentro de comentarios, selecciones, barras escapadas ni modo lectura.
Los comandos de documento se ofrecen en el editor puro y en el modo avanzado del bloque.
Los entornos KaTeX y macros locales no se envuelven artificialmente en `gathered`.

## Modelo y responsabilidades

```ts
// Documento puro: colección notes, gestionada por NestJS.
{ docType: 'latex', docData: { version: 1, source: '...' }, blocks: [] }

// Bloque: sigue usando el campo formula por compatibilidad.
{ type: 'latex', content: { formula: '...', mode: 'document', fontSizePx: 11.5 } }
```

El [editor puro](../src/app/editor/pure-latex-editor/pure-latex-editor.component.ts) carga
con `@defer`. Cada cambio actualiza `NotesService` con el ID propietario; su cola existente
agrupa y ordena el autoguardado. Una respuesta tardía o lectura de archivo de otra pestaña
no reemplaza el editor activo. El código puro vive en Mongo, no en archivos públicos de uploads.

El [servicio HTTP](../src/app/shared/latex/latex-compiler.service.ts) envía
`POST /api/latex/compile` con `{source, mode: 'document' | 'fragment'}` usando el JWT existente.
La [vista previa](../src/app/shared/latex/latex-preview.component.ts) consume
`{success, pdf?: string, log}`; `pdf` es base64. Solo las URL Blob creadas desde un PDF validado
se pasan al iframe; no se ejecuta HTML del código o del registro. Cancela peticiones obsoletas
y libera las URL Blob al reemplazar el resultado o destruir el componente.

NestJS gestiona compilación y documentos; FastAPI continúa dedicado a IA. El contexto del
asistente incluye la fuente LaTeX respetando sus límites de longitud existentes.

## Compilador y límites

La vista PDF requiere construir la imagen y permitir al backend ejecutar Docker:

```sh
cd backend
docker build -t weave-latex:1 ./latex-compiler
```

Ver [configuración, aislamiento y prueba real](../../backend/guia-desarrollador/09-LATEX.md).
KaTeX y autocompletado local funcionan sin este servicio. Si falta el compilador, se muestra
un error claro y la fuente permanece guardada.

El motor se selecciona automáticamente: pdfLaTeX para documentos tradicionales y XeLaTeX
para `fontspec`, `unicode-math`, `polyglossia` o comandos como `\setmainfont`. LuaLaTeX tiene
prioridad cuando se usa Babel con `bidi=basic`/`basic-r` o comandos propios de Lua. Admite `article`,
español, AMS, geometry, multicol, booktabs y array, entre otros paquetes TeX Live instalados.
La imagen debe reconstruirse para incorporar los motores y la caché de fuentes Lua; incluye Latin Modern, TeX Gyre, Liberation
y DejaVu. El registro de compilación indica el motor utilizado.
Se define `\hr` por compatibilidad, sin modificar el código persistido.
No calcula resultados físicos ni sustituye un sistema de álgebra: compone las ecuaciones.

Esta versión admite una fuente de hasta **300 000 caracteres**, PDF de hasta **16 MiB**,
y dos pasadas de compilación. No tiene proyectos de múltiples archivos, subida de imágenes
LaTeX, BibTeX/Biber, paquetes que requieren shell escape, ni instalación dinámica de paquetes.
Los paquetes adicionales se incorporan reconstruyendo la imagen.

La exportación del documento puro ofrece **PDF LaTeX** y **.tex**. El PDF respeta el tamaño,
márgenes y fuentes definidos en el código. Para bloques avanzados, se descarga el PDF desde
su propia vista previa: aún no se mezclan esos PDF con el PDF general de la nota. La exportación
general HTML conserva el código escapado; Markdown conserva la fuente. La exportación PDF
general avisa de esta limitación antes de producir una salida incompleta.

## Validación

```sh
npm test -- --watch=false
npm run build
```

Las pruebas cubren inserción con Tab, argumentos, teclado, comentarios, lectura, creación,
guardado/cambio de pestaña, importaciones tardías, detección de documentos en bloques,
cancelación HTTP, diagnósticos y liberación de PDF. La prueba real del motor es optativa y
requiere Docker; los dobles HTTP no demuestran una compilación TeX real.

La alineación independiente de ecuaciones del modo básico se describe en
[Alineación por línea](15-MARKDOWN-Y-VISTA-EN-VIVO.md#alineación-por-línea-en-fórmulas).
