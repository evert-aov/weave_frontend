# 05 — Navegación y diseño

[Volver al índice](README.md)

`WorkspaceComponent` distribuye navegación izquierda, documento central y asistente derecho.
El componente contenedor no repite las consultas de inicialización: `SidebarComponent` carga
espacios y listado de notas al montar la navegación.

Las referencias entre archivos usan un historial de saltos independiente de las pestañas.
Ver [referencias y navegación](10-REFERENCIAS-Y-NAVEGACION.md) para el selector de destinos,
los enlaces `?document=...`, Ctrl+O y el retorno con Ctrl+I.

## Árbol de espacios

[buildSpaceTree](../src/app/layout/sidebar/space-tree.ts) enlaza padres e hijos y calcula
profundidad después de construir el árbol, independientemente del orden recibido de MongoDB.
La lista plana proviene de `SpacesService`. La expansión es estado local de la navegación.

Los nombres se parten en varias líneas y la sangría visual tiene un límite para conservar
espacio en jerarquías profundas. Se muestran contadores cuando hay notas; la selección y
las líneas verticales permiten reconocer el nivel activo.

Cada carpeta conserva crear documento/subcarpeta, renombrar, mover y eliminar en `⋯`.
[SidebarItemActionsComponent](../src/app/layout/sidebar/components/item-actions/item-actions.component.ts)
encapsula el menú con Popover API, posición dentro de la ventana, Escape, flechas y restitución
de foco. La capa superior evita que el scroll del árbol recorte sus opciones.

La búsqueda actual filtra títulos de notas dentro de los espacios. No es una búsqueda del
contenido de MongoDB. Arrastrar y soltar delega las mutaciones en servicios HTTP; el backend
comprueba la propiedad y los ciclos de directorios.

## Tamaños y accesibilidad

`WorkspaceLayoutService` conserva anchos locales: navegación inicialmente 288 px y asistente
336 px. `ResizePanelDirective` implementa captura de puntero, flechas, límites, Home/End y
doble clic para recuperar el tamaño inicial. Los separadores exponen sus valores por ARIA.

Las reglas por contenedor adaptan el header y superponen el asistente cuando falta espacio.
En móviles, la navegación es un panel con fondo de cierre. El documento tiene su propio scroll
de altura disponible, descontando cabecera y pestañas mediante el layout flexible.

## Cabecera Unificada (DocumentTabsComponent)

El antiguo `app-topbar` fue eliminado de `WorkspaceComponent` para dar paso a una barra de cabecera moderna y minimalista integrada en `DocumentTabsComponent` (altura 40 px), inspirada en IDEs y navegadores de última generación:

* **Izquierda:** Navegación por historial (`<` / `>`), contenedor de pestañas multi-documento (`tab-item`) con cierre por botón o rueda central, y botón para añadir nuevos documentos (`+`).
* **Derecha (Grupo de 5 Recuadros de Acción):**
  1. **Save:** Botón con icono de disco, etiqueta *Save* y punto de estado reactivo (verde = guardado, ámbar = sin guardar, pulsación = guardando). Permite forzar guardado inmediato (`NotesService.saveCurrentNote()`) y captura el atajo global `Ctrl+S` / `Cmd+S`.
  2. **IA:** Botón con icono `sparkles` y etiqueta *IA*, que abre/cierra el panel lateral del Asistente de IA (`aiService.toggleSidebar()`), destacándose con estilo activo al estar abierto.
  3. **Export:** Abre el modal reactivo de exportación a PDF, Markdown y HTML (`ExportModalComponent`).
  4. **Settings:** Botón que despliega un menú flotante con los controles de sistema: conmutador de tema Claro/Oscuro (`ThemeService.toggleTheme()`), selector de idioma Español/English (`I18nService.toggleLanguage()`), copiar enlace al documento con confirmación en portapapeles, pantalla completa y modo lectura/edición.
  5. **Delete:** Botón con acento de peligro en hover para eliminar la nota activa (`WorkspaceActionsService.deleteDocument()`), enlazado a confirmación modal.

Los colores se definen en variables semánticas de [styles.scss](../src/styles.scss). Usarlas en
controles nuevos para conservar el tema claro/oscuro. No introducir anchos de viewport rígidos
en controles internos de los editores sin comprobar la convivencia con ambos paneles.

La [skill del frontend](../skills/weave-frontend/SKILL.md), enlazada desde `AGENTS.md`, exige
SVG o Heroicons para la iconografía. Nunca usar emojis como controles, adornos o indicadores
de interfaz; el contenido escrito por los usuarios se conserva tal como fue enviado.
