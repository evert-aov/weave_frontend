# 14 — Monaco y Vim en LaTeX

[Volver al índice](README.md)

## Experiencia de edición

Los bloques LaTeX y el documento LaTeX puro usan el mismo
[componente Monaco](../src/app/shared/latex/monaco-latex-editor.component.ts). Las fórmulas
conservan su vista previa inmediata con KaTeX y los documentos completos conservan la
compilación PDF explícita. Monaco reemplaza la entrada de texto, no el motor de composición.

En **Editar**, el botón **Vim** activa o desactiva el teclado modal. Se muestra la barra
de estado del adaptador. La preferencia se guarda en `weave_latex_vim`; el contenido continúa
guardándose mediante NotesService y el backend. En modo lectura se desconecta el adaptador
y Monaco pasa a `readOnly`/`domReadOnly`. Volver a editar recupera la preferencia.

Atajos para comprobar manualmente al activar Vim:

- `i` entra en inserción; `Esc` vuelve al modo normal.
- `h`, `j`, `k`, `l`, `w` y `b` navegan; `v` activa selección visual.
- `dd`, `y`, `p`, `u`, `Ctrl+R` realizan las operaciones del adaptador Vim.
- `/` abre la búsqueda en la barra Vim.
- En inserción, `\fr` propone `\frac{}{}`; Tab acepta y recorre sus argumentos.
- Ctrl+Enter conserva la acción del editor: confirmar el bloque o compilar el documento.

La persistencia sigue siendo automática; el adaptador no está conectado a un sistema de
archivos ni a un shell del servidor. No se ha definido un comando Ex `:w` propio.

Las fórmulas básicas ofrecen botones SVG para izquierda, centro y derecha. Se guarda
`content.alignment` (`left | center | right`); los valores ausentes o inválidos se normalizan
a centro. La vista previa, la lectura y HTML/PDF aplican el valor al contenedor y lo heredan
en los dos niveles de KaTeX que antes forzaban centrado. En LaTeX avanzado la alineación la
define el código fuente.

## Carga y dependencias

[MonacoRuntimeService](../src/app/shared/monaco/monaco-runtime.service.ts) comparte una única
promesa de inicialización con el bloque de código. `angular.json` publica
`node_modules/monaco-editor/min/vs` en `assets/monaco/vs`. El loader apunta a esa ruta del
mismo origen y no al CDN que traía por defecto. Si se cambia `angular.json` con `ng serve`
en ejecución, reiniciar el servidor para que publique los assets nuevos.

El editor permanece dentro de los límites `@defer` de documentos y bloques. Los archivos
estáticos de Monaco se copian al build, pero se descargan al abrir la herramienta, no al
arrancar el login. El control del bundle debe seguir pasando.

Vim se integra mediante **monaco-vim 0.4.2**, cargado por AMD al activarlo. Primero se comprueba
la copia local `vendor/monaco-vim/monaco-vim.js`; si no existe, se usa la distribución fijada
en jsDelivr. Para servirlo también localmente:

```sh
cd frontend
npm run vendor:vim
npm run build
```

[El script](../scripts/vendor-monaco-vim.mjs) descarga el JavaScript y ambas licencias a
`public/vendor/monaco-vim/`. Requiere conexión durante esta preparación; no modifica el lockfile.
Con esos archivos publicados, el navegador no necesita el CDN para activar Vim.

La versión instalada de Monaco 0.57 reorganizó los módulos AMD. El runtime proporciona los
alias que usa monaco-vim para `editor.api` y `shiftCommand`. El segundo usa la implementación
local de Monaco con indentación simple (`autoIndent: 0`), ya que el adaptador antiguo no
inyecta el servicio de configuración de lenguaje que el comando actual requiere.
Revisar estos alias y las pruebas manuales al actualizar cualquiera de las dos versiones.

Si falla Monaco, queda el textarea de respaldo con autocompletado y autoguardado. Si falla
Vim, Monaco sigue editable, el botón no aparece activado y se muestra el error con opción
de reintentar. No se emula parcialmente Vim para ocultar un fallo de carga de la librería.

## Responsabilidades y ciclo de vida

- [monaco-latex-language.ts](../src/app/shared/latex/monaco-latex-language.ts): registro
  idempotente de los lenguajes de fórmula y documento, comentarios, colores y sugerencias.
  Convierte el catálogo compartido en snippets, escapando barras, dólares y llaves sin
  perder las llaves de los argumentos. Monaco administra el recorrido de placeholders.
- [Componente compartido](../src/app/shared/latex/monaco-latex-editor.component.ts): modelo
  independiente por editor, readonly, Vim, foco, altura y cambios inmediatos hacia el padre.
  No reemplaza el modelo al recibir el eco del mismo texto; conserva el historial de deshacer.
- [Preferencia de teclado](../src/app/shared/monaco/editor-keybindings.service.ts): preferencia
  visual local, compartida entre editores LaTeX. No almacena documentos ni chats.
- Padres LaTeX: mantienen el ID de nota propietario, fuente y vista previa. El bloque guarda
  al escribir además de al confirmar/desmontar; el documento usa la cola de autoguardado existente.

Al destruir se liberan adaptador Vim, listeners, editor y modelo. Las promesas tardías
comprueban el estado del componente antes de crear editores o conectar Vim. La fuente escrita
en el respaldo durante la carga es la que se entrega al modelo. Al cambiar de modo de lectura
se desconecta Vim aunque la carga de la librería aún esté pendiente.

La directiva de referencias de documentos deja pasar Ctrl+I/Ctrl+O dentro de `.monaco-editor`,
incluyendo sus nodos EditContext, para que los gestione el editor. Fuera de él conserva la
navegación interna existente. Ctrl+Enter se registra antes del adaptador Vim; Tab da prioridad
a sugerencias y argumentos cuando Vim está en inserción.

## Texto enriquecido y vista previa

Los bloques de texto usan Tiptap/ProseMirror con su barra de herramientas y una vista previa
renderizada de solo lectura. No usan Vim ni CodeMirror en el workspace. LaTeX conserva Monaco
con su configuración de teclado independiente. Consultar [Texto enriquecido y vista previa](15-MARKDOWN-Y-VISTA-EN-VIVO.md).

## Pruebas y alcance de validación

```sh
npm test -- --watch=false
npm run build
```

Se prueban persistencia/alineación/exportación, fuente durante la carga, destrucción tardía,
readonly, preferencia Vim, fallos/reintentos, exclusión de atajos globales y prioridades de Tab
y Ctrl+Enter. El parser **real** de snippets de Monaco verifica que la fórmula y los argumentos
no se alteran. Las pruebas del editor y adaptador usan sustitutos de sus APIs; no equivalen
a ejecutar Monaco y monaco-vim completos en un navegador.

La instalación local de monaco-vim no se pudo ejecutar en el entorno de desarrollo de esta
tarea por un fallo de DNS. Queda pendiente verificar la distribución real en el navegador:
abrir ambos editores, activar Vim, probar los atajos anteriores, desactivar/activar lectura,
cambiar de nota, cerrar y volver a abrir, y comprobar que no hay peticiones de motores al login.

Referencias:

- [Monaco Editor](https://github.com/microsoft/monaco-editor).
- [Uso, teclado y AMD de monaco-vim](https://github.com/brijeshb42/monaco-vim).
- [Extensiones de editor de Obsidian (documentación oficial)](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Editor%20extensions.md).

