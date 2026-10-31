# 11 — Diálogos y creación de documentos

[Volver al índice](README.md)

## Flujo de creación

Las entradas **Nuevo documento** de la barra lateral, **+** de las pestañas, la acción de una
carpeta y el botón de la pantalla sin documento utilizan el mismo flujo:

1. Elegir el tipo: bloques, Word, hoja de cálculo, lienzo o presentación.
2. Escribir el nombre y pulsar **Crear documento**.

Elegir un tipo solo cambia de paso; no envía un POST. El nombre es obligatorio, se recorta
antes de enviar y admite hasta 160 caracteres. **Volver** regresa a la selección de tipo y
**Cancelar** termina sin crear archivos. El destino se captura al abrir el flujo para conservar
la carpeta elegida aunque otro estado de navegación cambie mientras el diálogo está abierto.

Un documento nuevo por bloques tiene un bloque de texto con `<p></p>`, sin texto de bienvenida
persistido. Los documentos existentes conservan su contenido. La creación sigue usando
`NotesService.createNote` y abre el archivo creado; no descarga motores de otros tipos.

## Responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| [dialog.model.ts](../src/app/core/models/dialog.model.ts) | Contrato de título, mensaje, campo, opciones, validación y callbacks. |
| [DialogService](../src/app/core/services/dialog.service.ts) | Solicitud activa, transición entre pasos, bloqueo, errores y cierre. |
| [AppDialogComponent](../src/app/shared/components/app-dialog/app-dialog.component.ts) | Presentación compartida, formulario, teclado y restauración de foco. |
| [WorkspaceActionsService](../src/app/core/services/workspace-actions.service.ts) | Crear documentos/directorios, renombrar directorios y confirmar eliminaciones. |
| [WorkspaceComponent](../src/app/pages/workspace/workspace.component.ts) | Montar una sola instancia del diálogo y bloquear la interacción con el workspace de fondo. |

El componente admite cuatro variantes de `DialogRequest`: `choice`, `input`, `confirm` y
`notice`. No duplica formularios en sidebar o pestañas. Un callback `onSubmit` puede devolver
la configuración del siguiente paso, terminar sin resultado o devolver una Promise mientras
se completa la operación. Los servicios de dominio realizan las peticiones HTTP.

Durante una petición se deshabilitan botones, se bloquea el cierre y se impiden envíos
duplicados. Si falla, se conserva el formulario y su valor, se anuncia el error y se permite
reintentar. El diálogo solo se cierra después de completar correctamente la operación. Un
cierre forzado al destruir el workspace descarta resultados posteriores de ese diálogo.

## Reutilización

Para un campo simple, abrir una solicitud desde el componente o servicio correspondiente:

```ts
this.dialogs.open({
  kind: 'input',
  title: 'Nombre del elemento',
  label: 'Nombre',
  submitLabel: 'Guardar',
  onSubmit: async (value) => {
    await firstValueFrom(this.service.updateName(value));
  },
});
```

Para confirmar una eliminación, usar `kind: 'confirm'`, `destructive: true` y capturar el ID
del elemento al abrir el diálogo. No consultar nuevamente el documento activo al confirmar:
un cambio asíncrono podría hacer que se eliminara otro archivo. `NotesService.deleteNote(id)`
permite eliminar el destino capturado sin afectar una nota distinta que esté seleccionada.

Los directorios y subdirectorios usan la variante `input`; renombrar precarga y selecciona el
nombre actual. La validación impide nombres vacíos o con separadores `/` y `\`. Al eliminar
un directorio, la lista local también retira sus descendientes, como hace el endpoint.

Los avisos de movimiento, errores de exportación, impresión bloqueada y el campo de enlace de
Word también utilizan este componente. No usar `window.prompt`, `confirm` ni `alert` para estas
funciones. Los selectores del sistema para archivos y la impresión conservan su función propia.

## Accesibilidad y ciclo de vida

El diálogo expone `dialog` o `alertdialog`, título, descripción, campo etiquetado, estado de
carga y errores con `role="alert"`. El contenido del workspace recibe `inert` mientras está
abierto. El foco inicial va al primer tipo, al campo de nombre o a **Cancelar** cuando la
acción es destructiva. Tab/Shift+Tab mantienen el foco dentro del formulario y Escape cancela
si no hay una petición en curso. Al cerrar se recupera el foco anterior cuando sigue disponible,
respetando los callbacks que ya hayan devuelto el foco al editor.

Los controles emplean los iconos SVG de Weave y los colores semánticos del tema. No importar
motores de edición desde el modelo o el servicio del diálogo; deben mantenerse diferidos.

## Verificación

Desde `frontend/`:

```sh
npm test -- --watch=false
npm run build
```

[app-dialog.component.spec.ts](../src/app/shared/components/app-dialog/app-dialog.component.spec.ts)
monta el componente con servicios reales y HTTP simulado. Cubre los cinco tipos, orden de pasos,
nombre vacío, cancelación, volver, error y reintento, doble envío, directorios/subdirectorios,
renombrado, eliminación por ID, descendientes, teclado y foco. La prueba de creación por bloques
comprueba que el contenido inicial esté vacío. El build también verifica el límite de carga inicial.
