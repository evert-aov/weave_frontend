# 18 — Hojas de cálculo, gráficos y referencias

[Volver al índice](README.md)

## Alcance y entradas

El documento `sheet` usa una cuadrícula virtualizada Canvas (`ExcelCanvasGridComponent` /
`SheetCanvasRenderer`) coordinada por Angular y un motor de fórmulas propio. Los gráficos,
trazos de dibujo y formas flotantes todavía se dibujan con SVG/HTML; el editor no depende de Univer ni monta el frontend React de referencia.
El bloque `sheet` comparte el modelo de celdas y el evaluador, pero tiene una interfaz reducida:
las pestañas de libro, los gráficos configurables y el rastreo descritos aquí pertenecen al editor completo.

| Archivo o directorio | Responsabilidad |
| --- | --- |
| [pure-sheet-editor.component.ts](../src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts) | Coordinador Angular: ciclo de vida, estado compartido, plantilla y delegación de acciones. |
| [controllers/sheet-workbook.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-workbook.controller.ts) | Hojas del libro, historial, guardado, contexto de cálculo, estadísticas, XLSX/CSV y configuración de página. |
| [controllers/sheet-editing.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-editing.controller.ts) | Edición, autocompletado, referencias entre hojas, rastreo, nombres y tablas. |
| [controllers/sheet-interaction.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts) | Ratón, teclado, selección, desplazamientos de objetos y zoom. |
| [controllers/sheet-viewport.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-viewport.controller.ts) | Dimensiones dispersas, virtualización, posición de scroll y fragmentos de celdas combinadas. |
| [controllers/sheet-formatting.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-formatting.controller.ts) | Formato de celdas, bordes, combinaciones y estilos predefinidos. |
| [controllers/sheet-data.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-data.controller.ts) | Portapapeles, relleno, ordenación, filtros e inserción/eliminación de filas y columnas. |
| [controllers/sheet-charts.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-charts.controller.ts) | Inserción, configuración, colores, orden y resaltado de datos de gráficos. |
| [controllers/sheet-artwork.controller.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-artwork.controller.ts) | Formas, iconos, herramientas de dibujo y reproducción de trazos. |
| [models/excel.model.ts](../src/app/editor/pure-sheet-editor/models/excel.model.ts) | Celdas, hojas, gráficos, configuración de datos, apariencia y objetos flotantes. |
| [services/formula-engine.service.ts](../src/app/editor/pure-sheet-editor/services/formula-engine.service.ts) | Evaluación, referencias locales y entre hojas, rangos, F4 y desplazamiento de referencias. |
| [services/formula-parser.ts](../src/app/editor/pure-sheet-editor/services/formula-parser.ts) | Tokenización, árbol de expresiones y operadores; no ejecuta JavaScript de las fórmulas. |
| [services/calc-functions.ts](../src/app/editor/pure-sheet-editor/services/calc-functions.ts) | Funciones y alias, cálculos financieros, fechas, búsquedas, texto y matrices. |
| [services/formula-completion.ts](../src/app/editor/pure-sheet-editor/services/formula-completion.ts) | Sugerencias de funciones, nombres, tablas y texto de la columna. |
| [services/xlsx-charts.ts](../src/app/editor/pure-sheet-editor/services/xlsx-charts.ts) | Lectura OOXML de relaciones, nombres definidos y gráficos compatibles. |
| [components/excel-names-modal](../src/app/editor/pure-sheet-editor/components/excel-names-modal/excel-names-modal.component.ts) | Administrador de nombres y tablas. |
| [services/clipboard.service.ts](../src/app/editor/pure-sheet-editor/services/clipboard.service.ts) | Lectura de tablas HTML y TSV; escritura de ambos formatos al portapapeles. |
| [components/excel-ribbon](../src/app/editor/pure-sheet-editor/components/excel-ribbon/excel-ribbon.component.ts) | Pestañas, herramientas y acciones contextuales de Chart Design. |
| [components/excel-chart-renderer](../src/app/editor/pure-sheet-editor/components/excel-chart-renderer/excel-chart-renderer.component.ts) | Extracción de datos, geometría SVG, escala, animación, leyenda y tooltips. |
| [components/excel-chart-modal](../src/app/editor/pure-sheet-editor/components/excel-chart-modal/excel-chart-modal.component.ts) | Tipo y subtipo de gráfico, miniaturas y preview. |
| [components/excel-chart-data-modal](../src/app/editor/pure-sheet-editor/components/excel-chart-data-modal/excel-chart-data-modal.component.ts) | Datos, eje X, series, título, leyenda, colores y preview antes de aplicar. |
| [components/excel-ink-layer](../src/app/editor/pure-sheet-editor/components/excel-ink-layer/excel-ink-layer.component.ts) | Dibujo, selección, movimiento, redimensionado y borrado de trazos. |
| [components/excel-floating-artwork](../src/app/editor/pure-sheet-editor/components/excel-floating-artwork/excel-floating-artwork.component.ts) | Formas e iconos flotantes. |

Los controladores se crean por instancia del editor, mediante composición: no son servicios
globales ni clases base del componente. Cada uno declara las propiedades públicas que necesita
con un contrato `Pick` de tipo; la importación del componente es `import type`, sin dependencia
circular en ejecución. [sheet-editor-hooks.ts](../src/app/editor/pure-sheet-editor/controllers/sheet-editor-hooks.ts)
expone las operaciones privadas compartidas con callbacks y getters que leen el estado vigente.
El componente conserva las entradas de la plantilla y los `HostListener`, y delega la ejecución.
Las cachés, historial y temporizadores pertenecen a su controlador; el ciclo de destrucción
del componente sigue cancelando guardados, reproducción y registro de IA. XLSX continúa mediante
imports dinámicos y Worker: separar responsabilidades no adelanta la carga de ExcelJS.

## Modelo y persistencia

El documento completo guarda `note.docData = { sheets: Sheet[], activeSheetId }`. Cada hoja
contiene `data: SheetGrid`, indexado por identificadores como `A1`. `CellData.raw` conserva el
texto o la fórmula, y `CellData.style` conserva el formato. El valor mostrado se obtiene del evaluador.

Los gráficos se guardan en `Sheet.charts`, las formas e iconos en `Sheet.artwork` y los trazos
en `Sheet.inkStrokes`. Sus coordenadas pertenecen al espacio de la hoja: mover o redimensionar
un objeto no escribe en las celdas que quedan debajo.

Los cambios pasan por el historial del editor y `NotesService.updateDocData`, con debounce de
400 ms. El historial conserva hasta 50 instantáneas en memoria. La selección, los diálogos,
el rastreo y el contexto de evaluación son estado de presentación; no forman parte del archivo guardado.

El backend puede almacenar las hojas como un contenedor JSON versionado con estilos compartidos
y payload gzip/base64. Es un detalle de persistencia: la API reconstruye el mismo `Sheet[]`, con
objetos de estilo independientes para cada celda. No se eliminan celdas vacías ni campos desconocidos.
Los archivos nativos antiguos siguen siendo legibles. La implementación, comprobación de integridad
y migración con respaldo se describen en [la guía del backend](../../backend/guia-desarrollador/04-DOCUMENTOS-Y-ARCHIVOS.md#almacenamiento-compacto-de-hojas).

Las coordenadas de `SelectionRange`, las columnas configuradas y los puntos de dibujo empiezan
en cero. Los identificadores de celda y los ejemplos que ve el usuario empiezan en uno.

## Cinta de herramientas

La cinta adopta el panel redondeado y las pestañas subrayadas del editor Word, conservando las
herramientas de cálculo. Home permite desplazamiento horizontal cuando los grupos no caben;
los nombres de grupo se mantienen en la parte inferior. Insertar organiza los tipos de gráfico
en dos filas. Los accesos rápidos de IA, navegación, pantalla completa y tema se retiraron de
la fila superior de esta cinta; las acciones generales del workspace siguen en su propia barra.
Un doble clic en la fila de pestañas contrae las herramientas y deja las pestañas visibles;
seleccionar una pestaña vuelve a desplegarlas, igual que en Word. El zoom del pie usa el
deslizador azul y porcentaje de Word, con rango de 50 a 200 %. Se aplica directamente sobre el mundo
y los lienzos Canvas manteniendo `#gridContainer` sin CSS `zoom` y conservando el desplazamiento
lógico (`scrollLeft / zoom`, `scrollTop / zoom`) para evitar saltos de posición o desplazamiento de barras. Ctrl + rueda sobre la cuadrícula
ajusta este zoom y cancela el zoom del navegador, también en los límites; sin Ctrl mantiene el
desplazamiento normal y fuera de la cuadrícula conserva el comportamiento del navegador. Los avisos de XLSX pueden
cerrarse con su botón de cierre una vez terminado el procesamiento, sin alterar los datos importados.

Las pestañas inferiores de las hojas se muestran en una sola fila horizontal con scroll lateral
(incluyendo desplazamiento con la rueda del ratón) cuando no caben en el ancho disponible. El botón de
añadir hoja y un botón selector en la esquina derecha (`[data-testid="sheet-list-toggle"]`)
permanecen fijos fuera del área desplazable para abrir una lista desplegable con todas las hojas del
libro. Al editar un nombre, los atajos de la cuadrícula ignoran ese campo: Enter o perder el foco
confirma, Escape cancela y un nombre vacío conserva el anterior. Renombrar actualiza las
referencias y se puede deshacer.

El estado de inmovilización de paneles (`freezePanes`) se inicia desactivado al crear, cargar o
importar libros (ignorando `freeze` entrantes de XLSX o estados guardados) y se exporta siempre
desactivado en XLSX/PDF, aunque el usuario puede activarlo temporalmente desde la pestaña `Vista`
(`Freeze Panes`, `Freeze Top Row`, `Freeze First Column` / `Unfreeze Panes`) durante su sesión.

Fórmulas reúne biblioteca, nombres definidos, auditoría y cálculo. Definir nombre, Usar en fórmula
y Crear desde la selección abren el administrador de nombres y tablas. Insertar → Tabla abre el
mismo administrador con el rango actual. Rastrear precedentes y dependientes navega por referencias
reales, incluidos nombres y tablas. Quitar flechas cierra el panel. Los controles de combinar/separar,
rastreo, XLSX y los diálogos nuevos usan las traducciones español/inglés del frontend.

## Combinación de celdas

Home → Combinar y centrar une la selección rectangular. La celda superior izquierda actúa como
ancla de texto, fórmula y formato. El botón cambia a Separar celdas al seleccionar una combinación;
funciona también seleccionando únicamente su ancla. La acción completa ocupa una sola entrada
del historial, se guarda en `Sheet.merges` y admite Deshacer/Rehacer.

En el documento nativo, los valores y estilos de las celdas cubiertas se conservan y vuelven a
mostrarse al separar. Combinar no concatena valores. Las referencias y agregados siguen viendo
los datos subyacentes; borrar contenido es una operación explícita distinta. XLSX representa la
combinación mediante sus rangos estándar y conserva su valor visible en el ancla; no utilizar
XLSX como respaldo de los valores cubiertos que mantiene el documento nativo.
Al importar XLSX se conservan los estilos propios de las celdas cubiertas, incluidos los
bordes derecho e inferior del perímetro, sin duplicar el contenido del ancla. La exportación
combina sin reemplazar esos estilos por el del ancla, para conservarlos en sucesivos intercambios.

Las selecciones parciales se amplían para no crear combinaciones superpuestas. La navegación
normal salta sus interiores; el doble clic edita el ancla y los bordes se toman del perímetro.
Las combinaciones importadas se representan con `rowspan`/`colspan`, limitados a la ventana visible,
incluso cuando el ancla está fuera de pantalla. Sus extremos forman parte de las dimensiones
de scroll aunque las celdas finales estén vacías. Dar formato a una única combinación modifica
su ancla y no materializa las celdas cubiertas.

## Selección y origen de los gráficos

1. Seleccionar las celdas de origen y usar Insertar → Gráficos.
2. Elegir directamente un subtipo o abrir el diálogo de tipos. La categoría elegida se pasa al diálogo.
3. El editor conserva una copia del rango mientras el diálogo está abierto y la usa al insertar.

Una selección vacía o no numérica muestra el estado vacío del gráfico. Una única celda numérica
se representa como tal: no se reemplaza la selección por un rango o una tabla de demostración.
La extracción automática reconoce encabezados y una primera columna de etiquetas; si todas las
columnas contienen números, también conserva la primera como serie. Los totales seleccionados
explícitamente forman parte de los datos.

La inserción y el cambio de tipo tienen estados separados: insertar crea otro gráfico; cambiar
el tipo de uno existente conserva su rango. Al seleccionar un gráfico se resalta su origen en
la cuadrícula sin sustituir la selección que el usuario puede estar preparando para otra acción.
Al deseleccionarlo desde Chart Design, la cinta vuelve a Home para evitar una barra vacía.

## Eje X y columnas separadas

Chart Design → Seleccionar datos abre la pestaña Datos del diálogo de configuración. Permite
cambiar el rango, indicar si hay encabezados, elegir la columna del eje X y marcar las series.
Las columnas no necesitan ser contiguas. Aplicar guarda la configuración; Cancelar descarta el borrador.

Ejemplo de un gráfico que utiliza A como eje X y B, D y E como series:

```ts
const chart: EmbeddedChart = {
  id: 'chart-costos',
  title: 'Line',
  chartTitle: 'Costos e ingresos',
  category: 'line',
  subType: 'line',
  range: { startCol: 0, startRow: 0, endCol: 4, endRow: 9 },
  dataConfig: { xColumn: 0, seriesColumns: [1, 3, 4], hasHeaders: true },
  appearance: { legendPosition: 'right', titlePosition: 'top', titleAlign: 'center' },
  seriesColors: { 'column:1': '#2563eb', 'column:3': '#f59e0b', 'column:4': '#ef4444' },
  x: 100, y: 80, width: 480, height: 300,
};
```

`title` identifica el tipo en datos anteriores; `chartTitle` es el título visible dentro del gráfico.
La cabecera del objeto muestra el subtipo real, para distinguir líneas independientes de apiladas.

La tabla de origen de un gráfico pertenece a una hoja. Para mostrar valores procedentes de otras
hojas, las celdas de esa tabla pueden contener referencias entre hojas.

## Renderizado, escala y animaciones

El renderizador es SVG propio. Las líneas normales conectan valores independientes; las apiladas
acumulan las series y las de 100 % normalizan respecto a la suma de sus valores absolutos. Una línea
usa categorías equidistantes en X; dispersión usa valores numéricos de X. Las variantes suaves
emplean curvas Bézier. No confundir cambiar de modo con cambiar el cálculo financiero de las celdas.

El eje de valores utiliza una escala lineal que incluye cero y admite negativos en los gráficos
cartesianos correspondientes. El intervalo automático se elige entre `1, 2, 2.5, 5, 10 × 10^n`,
con margen sobre los extremos. Por ejemplo, ingresos máximos de `1.155.984` producen un máximo de
`1.250.000` en modo independiente; apilar costos e ingresos requiere otra escala porque suma valores.

El catálogo de tipos no implica equivalencia completa con Excel o Google Sheets. Algunas categorías
comparten representaciones: superficie reutiliza áreas; cotizaciones, cajas y Pareto usan composición
barra/línea; histograma, cascada y mapa reutilizan columnas. Antes de ampliar esas categorías,
revisar sus cálculos y no presentar una aproximación como un motor estadístico o 3D completo.

El SVG responde al tamaño disponible y mantiene texto y marcadores en píxeles. Las líneas continuas
(línea estándar y dispersión) se representan de forma íntegra a cualquier escala sin cortes por `pathLength`
o desfases de trazos. En líneas, áreas y combinados, mover el puntero sobre el área localiza la categoría más cercana,
muestra una línea vertical y un tooltip con sus series.

La animación se ejecuta al montar el gráfico y cuando cambia su origen o los datos representados.
El fingerprint compara la extracción y los valores de las columnas utilizadas. Editar una columna
excluida u otra parte de la hoja no la reinicia. Cambiar título, leyenda o colores tampoco la reinicia.
Las preferencias `prefers-reduced-motion` desactivan las animaciones.

## Arrastre, redimensionamiento y persistencia de gráficos

Los gráficos incrustados se pueden arrastrar libremente mediante su barra superior y redimensionar desde
sus 8 controles perimetrales (4 esquinas `nw`, `ne`, `sw`, `se` y 4 bordes `n`, `s`, `e`, `w`). Cada cambio
registra un punto en el historial de deshacer/rehacer al comenzar la interacción (`pushUndoSnapshot`) y programa
un autoguardado (`scheduleAutoSave`) inmediatamente al soltar el puntero (`handleGlobalMouseUp`).

Si el usuario cierra la hoja o cambia de nota, `PureSheetEditorComponent.ngOnDestroy` vacía de inmediato cualquier
guardado pendiente (`flushAutoSave`), garantizando que la posición `(x, y)` y dimensiones `(width, height)` elegidas
se conserven de manera exacta sin regresar a las coordenadas por defecto. Al modificar el tipo o subtipo de un gráfico
seleccionado mediante el modal o menú, se actualizan las propiedades del gráfico existente en lugar de recrearlo.

## Título, leyenda y colores

Chart Design → Formato abre Diseño. Se puede editar el título, colocarlo arriba o abajo, ocultarlo
y alinear su texto; la leyenda admite arriba, abajo, izquierda, derecha u oculta. El preview aplica
el borrador antes de confirmar. El modo de series permite elegir independientes, apiladas o 100 %.

Colores de las series asigna un color a cada serie visible. Las claves `column:1` identifican la
columna B, por lo que renombrar encabezados o excluir otras series no reasigna ese color por posición.
En circulares, sunburst y treemap, las entradas visibles corresponden a filas: `row:1` identifica la
fila 2. Los colores se comparten entre representación, leyenda, tooltips y resaltado de origen.

El resaltado se aplica al seleccionar el gráfico y no modifica `CellStyle`. El eje X tiene un
resaltado neutro; las columnas de series o las filas de sectores usan su color correspondiente.

Chart Styles incluye Personalizar, que abre este panel. Las paletas Excel, Monochrome, Warm y Cool
sustituyen los colores personalizados, incluso al volver a elegir la paleta que ya figuraba en el
modelo. La acción elimina los overrides de `seriesColors`, actualiza el resaltado y se puede deshacer.
El botón Paleta de una serie permite restablecer solo ese color.

## Formas, iconos y dibujo flotante

Insertar → Shapes reutiliza `SHAPE_ITEMS` de Word; Icons reutiliza su selector y sus definiciones
Lucide. El objeto guarda la referencia al elemento, posición y tamaño, no HTML arbitrario de celdas.
Se puede mover, redimensionar, eliminar y recuperar con Deshacer.

Draw captura eventos de puntero sobre una capa SVG. Ofrece plumas, resaltadores, borrador y lazo.
Los trazos se seleccionan individualmente o mediante lazo; su selección permite moverlos,
redimensionarlos y eliminarlos. La conversión a formas reconoce líneas, rectángulos y elipses con
una aproximación geométrica básica. No es reconocimiento de escritura.

Las coordenadas se convierten según el tamaño real del SVG para respetar el zoom. El historial
recibe la operación terminada, no una instantánea por cada punto del puntero. Replay modifica solo
la cantidad de trazos visibles temporalmente: no vacía el contenido persistido. `switchSheet` y la destrucción del editor
cancelan el temporizador.

## Fórmulas y referencias entre hojas

Ejemplos admitidos dentro del mismo libro:

```text
=B3
=SUMA(B3:B10)
=Ventas!B3
='Ventas 2026'!$B$3
=SUMA('Ventas 2026'!B3:B10)
='Ventas 2026'!B3+Costos!C4
='O''Brien'!A1
```

El evaluador implementa un subconjunto de funciones, con alias como SUMA/SUM y PROMEDIO/AVERAGE.
No es un motor completo de compatibilidad Excel ni resuelve enlaces a archivos de cálculo externos.
La evaluación usa un parser de expresiones y un árbol de sintaxis: admite funciones anidadas,
operadores aritméticos, comparaciones, concatenación con `&`, porcentajes y constantes matriciales.
No utiliza `Function` ni `eval` para ejecutar las fórmulas.

Durante la edición, el ratón inserta una celda y el arrastre amplía el rango. Las flechas eligen
referencias y Shift + flechas las amplía cuando el cursor está en una posición de inserción válida,
por ejemplo después de `=` o dentro de `SUMA(`. F4 alterna referencias relativas y absolutas sin
modificar el nombre de la hoja. El desplazamiento de fórmulas también conserva esos nombres.

Para elegir otra hoja, escribir `=`, pulsar su pestaña y seleccionar el origen. `editOrigin` conserva
la hoja y celda de destino mientras se navega. La barra de fórmulas mantiene el borrador y un aviso
identifica la celda que se está editando. Enter confirma en el destino original; cancelar vuelve
sin escribir en las celdas consultadas. Las referencias visibles se resaltan solo en su hoja.

`bindWorkbookFormulaContext` registra las cuadrículas de un libro en un `WeakMap`; no existe una
hoja global compartida entre todos los documentos. La detección de ciclos usa hoja y celda como
identidad. Una hoja inexistente o un ciclo devuelve `#¡REF!`; los agregados no deben convertir esos
errores silenciosamente en cero. Renombrar una hoja actualiza los calificadores de las fórmulas
almacenadas y conserva las cadenas literales.

`formulaWorkbookRevision` detecta cambios de cuadrícula y actualiza los contextos. Los gráficos
reciben `dataRevision` para recalcular dependencias entre hojas. La animación sigue dependiendo
del fingerprint de cada gráfico, no de cualquier cambio de revisión del libro.

## Funciones y referencias admitidas

Los nombres canónicos son ingleses; se admiten sus alias españoles al escribir. La biblioteca y el
autocompletado insertan el nombre inglés. `FUNCTION_ALIASES` está en `calc-functions.ts` y los metadatos
de ayuda están en `constants/excel.constants.ts`.

| Familia | Funciones añadidas, además de las básicas existentes |
| --- | --- |
| Búsquedas | XLOOKUP/BUSCARX, INDEX/INDICE, MATCH/COINCIDIR, HLOOKUP/BUSCARH. VLOOKUP/BUSCARV admite coincidencia exacta y aproximada. |
| Condiciones y errores | IFERROR/SI.ERROR, IFNA/SI.ND, IFS/SI.CONJUNTO, NOT/NO, SUMIFS/SUMAR.SI.CONJUNTO, COUNTIFS/CONTAR.SI.CONJUNTO, AVERAGEIF y AVERAGEIFS. |
| Fechas | DATE/FECHA, YEAR/AÑO, MONTH/MES, DAY/DIA, EOMONTH/FIN.MES, NETWORKDAYS/DIAS.LAB. TODAY y NOW devuelven números de fecha Excel. |
| Finanzas | PMT/PAGO, PV/VA, FV/VF, NPV/VNA, IRR/TIR. |
| Texto | LEFT/IZQUIERDA, RIGHT/DERECHA, MID/EXTRAE, TEXT/TEXTO, SUBSTITUTE/SUSTITUIR y VALUE/VALOR. TRIM/ESPACIOS elimina espacios exteriores y repeticiones interiores. |
| Matrices | FILTER/FILTRAR, SORT/ORDENAR, UNIQUE/UNICOS y SEQUENCE/SECUENCIA, con resultados expandidos en la cuadrícula. |

Se conservan SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, PRODUCT, ABS, SQRT, POWER, ROUND,
CONCAT/CONCATENATE, UPPER, LOWER, LEN, RANDBETWEEN, IF, AND, OR, SUMIF y COUNTIF, con sus alias
españoles. Los criterios admiten comparaciones y comodines `*`, `?` y escape `~`. Las búsquedas
exactas distinguen identificadores de texto de números; las aproximadas seleccionan el valor vecino.

Ejemplos:

```text
=SUM(A:A)
=SUMIFS(D:D,A:A,"Producto*",B:B,">=10")
=IFERROR(INDEX(D2:D20,MATCH(A2,B2:B20,0)),"Sin datos")
=XLOOKUP(A2,Productos[Codigo],Productos[Precio],"No encontrado")
=TEXT(EOMONTH(DATE(2026,11,1),0),"yyyy-mm-dd")
=NETWORKDAYS(DATE(2026,11,1),DATE(2026,11,30),Festivos)
=PMT(8%/12,10,10000)
=NPV(10%,B2:B6)+B1
=IRR(B1:B6)
=SORT(UNIQUE(FILTER(A2:A20,B2:B20>0)))
=SEQUENCE(5,2,1,1)
=SUM(G1#)
```

NPV descuenta el primer flujo al final del primer período; un desembolso inicial en el instante
cero se suma fuera de NPV. IRR requiere flujos periódicos de ambos signos y admite una estimación
inicial; usa Newton en espacio logarítmico y búsqueda acotada como alternativa. No es XIRR para
fechas irregulares. Ver [NPV e IRR en Microsoft](https://support.microsoft.com/en-au/excel/go-with-the-cash-flow-calculate-npv-and-irr-in-excel).

PMT contempla tasa cero, valor futuro y pagos al inicio (`type = 1`) o al final (`type = 0`). Conserva
la precisión de tasas como `8%/12` y usa `log1p`/`expm1`. PV y FV siguen la convención de signos
de entradas/salidas de caja. Ver [PMT de Microsoft](https://support.microsoft.com/en-us/Excel/functions/pmt-function).

Las fechas usan el sistema de números de serie 1900. El selector numérico incluye Fecha y Fecha
y hora. TEXT admite formatos numéricos y de fecha comunes; no reproduce todo el lenguaje de formatos
personalizados y regionales de Excel. NETWORKDAYS usa fines de semana sábado/domingo y festivos opcionales.

### Autocompletado

En la celda y la barra de fórmulas, escribir un prefijo muestra funciones, nombres y tablas; dentro
de `Tabla[` aparecen columnas. Se reconocen prefijos españoles e ingleses. Las flechas eligen una
sugerencia, Tab o Enter la inserta y Esc cierra la lista conservando la edición. La inserción mantiene
el cursor entre los paréntesis y muestra la firma de la función. Para texto, se sugieren valores ya
existentes en la misma columna; aceptar conserva su capitalización y no modifica las celdas de origen.

### Nombres definidos y tablas

El administrador crea, modifica y elimina nombres con ámbito libro o hoja y permite insertarlos
en una fórmula. Los nombres de libro se guardan en `Sheet.workbookNames` de la primera hoja;
los locales en `Sheet.definedNames`. Las referencias locales introducidas en el administrador se
califican con la hoja actual. Renombrar una hoja actualiza también estas definiciones.

Una tabla se guarda en `Sheet.tables` con nombre, rango, columnas y presencia de encabezados/totales.
Se admiten referencias como `Ventas[Importe]`, `Ventas[[Producto]:[Importe]]`, `Ventas[#All]`,
`Ventas[#Headers]`, `Ventas[#Totals]`, `Ventas[@Importe]` y `[@Importe]` dentro de su fila. Los nombres
y las tablas se conservan en XLSX. El administrador no implementa todas las operaciones estructurales,
estilos, filtros o renombrados de columnas del editor de tablas de Microsoft Excel.

### Matrices dinámicas

Los resultados expandidos se calculan en memoria; solo se guarda la fórmula original. Las celdas
generadas se muestran incluso cuando el ancla está fuera del viewport. Las dimensiones de scroll
se actualizan con el resultado. Escribir, pegar o borrar una parte que excluya al ancla se rechaza;
el aviso indica dónde editar la fórmula. Un destino ocupado, combinado o dentro de una tabla
produce `#¡DESBORDAMIENTO!`. `A1#` permite referenciar el resultado expandido.

Las columnas completas se procesan como rangos dispersos para agregados, criterios y búsquedas,
conservando posiciones reales sin crear un millón de celdas. Un resultado matricial o rango rectangular
materializado sigue limitado a 250.000 celdas, y las dependencias a 128 niveles. No se implementan
referencias 3D, enlaces a otros archivos, LET/LAMBDA, intersecciones/uniones arbitrarias ni todas
las variantes de funciones y formatos de Excel. No presentar este subconjunto como compatibilidad total.

## Rastrear el origen de un valor

Rastrear en la barra de fórmulas, o Fórmulas → Rastrear precedentes, analiza las referencias directas
de la celda actual. Si hay una única referencia y su hoja existe, abre esa hoja y selecciona la celda o rango. Si hay
varias, el panel permite elegir. Volver regresa a la fórmula que inició el rastreo.

El análisis resuelve también nombres y referencias estructuradas de tablas para localizar sus rangos.
Rastrear dependientes busca fórmulas del libro que referencien la celda actual mediante esas referencias.
Las cadenas literales como `"Ventas!A1"` no se consideran dependencias. Una hoja inexistente
aparece como destino no disponible; una celda sin referencias muestra un mensaje. El rastreo
no recorre automáticamente toda la cadena recursiva ni monta un diagrama completo de dependencias.

## Portapapeles externo

`Ctrl+V` se intercepta en la grilla cuando la celda activa no está en modo de edición directa (`!isEditing`), ejecutando `handlePaste()` de forma asíncrona dentro del gesto del usuario para leer tablas HTML o texto plano/TSV (`navigator.clipboard.read()` y `readText()`). Cuando una celda o barra de fórmulas está en edición activa (`isEditing`), se preserva la inserción nativa del `<input>` salvo cuando el contenido sea una matriz multilínea o tabla.

Adicionalmente, `@HostListener('window:paste')` captura cualquier evento de pegado nativo del navegador (p. ej. desde el menú del navegador o atajos en elementos no enfocados) y lo entrega a `onGridPaste()`, priorizando tablas HTML y usando TSV como alternativa. Esto permite pegar desde Excel, Google Sheets, páginas web y editores de texto sin fallas por falta de foco.

El parser conserva valores y formato básico: encabezados, negrita, cursiva, subrayado, colores, alineación y fuente cuando el HTML los proporciona. Expande posiciones ocupadas por `rowspan` y `colspan`. Normaliza números, importes con `$` y porcentajes; las comillas protegen celdas TSV con tabuladores o saltos de línea.

El botón **Pegar** de la barra de herramientas ribbon lee ítems mediante `navigator.clipboard.read()`, procesando tanto `text/html` (si incluye `<table>`) como `text/plain` directamente desde el mismo ítem sin consumir prematuramente la activación transitoria del navegador. Si `read()` no está disponible (p. ej. en Firefox sin permisos extendidos), recurre a `readText()`. Si el navegador restringe la lectura desde botones, muestra un aviso amigable indicando usar `Ctrl+V`. Tras aplicar las celdas, reenfoca automáticamente el contenedor de la grilla para permitir navegación inmediata con el teclado. Al pegar una matriz, el rango queda seleccionado, las dimensiones visibles crecen si hace falta y la operación se integra en Deshacer.

## Importación y exportación XLSX

Archivo → Importar XLSX añade todas las hojas del archivo al libro actual, selecciona la primera
y permite deshacer la operación completa. No reemplaza las hojas existentes. Los nombres repetidos
reciben un sufijo y las referencias internas del archivo se actualizan al nombre importado.
Archivo → Exportar XLSX descarga todas las hojas del libro en un archivo Excel.

La conversión vive en [services/xlsx.service.ts](../src/app/editor/pure-sheet-editor/services/xlsx.service.ts) y usa [ExcelJS](https://github.com/exceljs/exceljs#readme). Tanto el servicio como ExcelJS se cargan mediante
`import()` al usar estas acciones; el motor queda fuera del arranque. La lectura ocurre en un Web Worker mediante `services/xlsx-import.ts` y `services/xlsx.worker.ts`,
sin subir el archivo a un servicio externo. En entornos sin Worker se utiliza la lectura local directa. Se aceptan `.xlsx` sin contraseña de hasta 100 MB y
2.000.000 de celdas con contenido o formato. Los errores se muestran sin modificar el libro existente.

Se trasladan valores, fórmulas, nombres de hojas, estilos básicos de fuente, rellenos RGB y colores de tema con tinte, alineación,
bordes, formatos numéricos compatibles, dimensiones, combinaciones y paneles inmovilizados. Las fechas
se calculan como números de serie y se muestran con su formato de fecha; conservan su tipo al exportar. Los formatos originales
sin equivalente visual se retienen para la exportación. Los alias de funciones españolas conocidos
se convierten a los nombres ingleses requeridos por XLSX; Excel recalcula al abrir el archivo.
Las fórmulas fuera del subconjunto del evaluador se conservan, pero pueden mostrar errores aquí.

La importación de gráficos lee OOXML con `fflate` y `saxes` dentro del Worker. Convierte columnas,
barras, líneas, áreas, circulares, anillos, dispersión y radar 2D cuyos valores sean rangos verticales
compatibles de una sola hoja. Admite columnas de series no contiguas; conserva título, leyenda,
nombres/colores explícitos y posición/tamaño. `sourceSheetId` permite que el gráfico esté en una hoja
y sus datos en otra; `ChartDataConfig.seriesNames` conserva etiquetas que no procedan de un encabezado.
Los tipos compuestos/3D, fuentes externas, rangos horizontales o incompatibles y series de más de
10.000 puntos se omiten y se incluyen en el contador de gráficos no compatibles. No se convierten
las cachés de gráficos en tablas de demostración.

Los nombres y tablas importados que colisionen con los existentes reciben un sufijo; sus fórmulas
se actualizan sin reescribir cadenas literales ni nombres de columnas. La exportación incluye tablas,
nombres globales/locales, fórmulas matriciales con rango/caché y los prefijos OOXML de funciones modernas.
La exportación no genera gráficos, formas, trazos, imágenes, reglas condicionales, tablas dinámicas,
validaciones ni macros. Las hojas de tipo gráfico se exportan como hojas vacías si no tienen celdas.
El formato nativo de Weave conserva sus gráficos y objetos flotantes; el XLSX no garantiza equivalencia
visual completa ni soporte de funciones modernas en versiones antiguas de Microsoft Excel.

`xlsx.service.spec.ts` y `xlsx-charts.spec.ts` comprueban archivos XLSX reales en memoria: datos,
metadatos, fórmulas, matrices, nombres, tablas, gráficos, referencias renombradas y archivos inválidos.

## Libros grandes y navegación

La cuadrícula usa un canvas dimensionado al viewport: se construye un frame de celdas visibles
y paneles inmovilizados, sin crear un `td` por celda. Un contenedor de dimensiones lógicas
conserva el tamaño del scroll y las coordenadas de gráficos y trazos. Las capas de gráficos,
artwork y tinta mantienen sus propios elementos SVG/HTML y aún no se virtualizan por viewport. `services/grid-viewport.ts` calcula posiciones con
los tamaños predeterminados y las excepciones de filas/columnas, sin crear un array de un millón
de offsets para una hoja dispersa con formato al final del archivo.

Las dimensiones se memorizan por identidad de cuadrícula. Las fórmulas visibles comparten una
caché de cálculo durante una revisión del libro, incluyendo dependencias entre hojas; cambiar
una cuadrícula o un nombre invalida esa caché. Deshacer, rehacer y recalcular también la invalidan
mediante las nuevas cuadrículas. Las estadísticas de selección recorren las celdas existentes en
selecciones grandes y se memorizan por rango/revisión. Los datos fuera de pantalla se conservan.

La navegación por teclado y el rastreo revelan las coordenadas de la celda usando los ejes
dispersos y actualizan el frame Canvas; no requieren localizar un `td` en el DOM.
El scroll se conserva por hoja. Los rangos dispersos de columnas completas evitan materializar
celdas vacías; los límites de dependencia y materialización se describen arriba. Recalcular actualiza también las
funciones volátiles, cuyos valores se reutilizan durante la revisión vigente.

## Verificación y puntos de extensión

Pruebas focalizadas (el script limita Vitest a dos workers para reducir presión de memoria):

```sh
npm run test:sheets

npx ng build --configuration development
```

Para producción, ejecutar también `npm run build` y los controles de arranque descritos en
[rendimiento y pruebas](07-RENDIMIENTO-Y-PRUEBAS.md). Las verificaciones automáticas cubren
cálculo, referencias, persistencia del modelo, eventos, escala y geometría. JSDOM no comprueba
por sí solo fidelidad visual, permisos del portapapeles del sistema ni interacción real entre aplicaciones.

Comprobaciones manuales recomendadas:

1. Crear un gráfico desde una selección desplazada y desde una única celda; comprobar que no aparezcan datos de demostración.
2. Elegir columnas no contiguas, cambiar el modo de series y verificar escala y valores frente a la tabla.
3. Cambiar colores, leyenda y título; confirmar, reabrir, probar una paleta y deshacer.
4. Editar una celda ajena al origen y comprobar que no se repita la animación; cambiar un dato utilizado y comprobar el recálculo.
5. Dibujar con zoom, mover y redimensionar el trazo; guardar y reabrir para comprobar su posición.
6. Pegar una tabla de una aplicación externa, incluyendo porcentajes y texto con saltos de línea.
7. Escribir una fórmula, cambiar de hoja, elegir un rango y confirmar; rastrear, navegar y volver a su origen.
8. Renombrar una hoja referenciada, probar un ciclo y comprobar que los errores sean visibles.
9. Cambiar entre español/inglés y comprobar combinar/separar, rastreo, XLSX y administrador de nombres.
10. Completar funciones y texto con Tab/Enter, cerrar con Esc y comprobar que las teclas normales sigan escribiendo.
11. Calcular FILTER/SEQUENCE, probar bloqueos y `A1#`, y verificar rangos con tablas y nombres después de renombrar la hoja.
12. Importar un libro con varias hojas, alternar pestañas, desplazarse por ambos ejes y rastrear una referencia fuera de pantalla; verificar que no crezca el DOM con el tamaño total de la hoja.

Mantener la extracción, los colores y la geometría en el renderizador o sus utilidades; las mutaciones
y el historial en el coordinador del editor. Los selectores de Word compartidos no deben arrastrar el
editor Word completo al arranque. No agregar motores de documentos a imports estáticos del shell.

## Operaciones de IA sobre el libro

`ai-workbook-control.ts` aplica las operaciones estructurales del asistente sobre una copia validada y `ai-workbook-structure.ts` actualiza direcciones/referencias al insertar o eliminar filas y columnas o cambiar hojas. La publicación del adaptador conserva historial y hoja activa. El control no se limita a las celdas del extracto, aunque la información enviada a la IA sí tiene presupuesto. El protocolo y los adjuntos del chat se documentan en [IA y exportación](06-IA-Y-EXPORTACION.md#control-estructural-del-libro-excel).


### Capacidad y compatibilidad del lector XLSX

Los límites de importación se centralizan en `xlsx-limits.ts`: 100 MB comprimidos, 2.000.000 de celdas con contenido/formato y 512 MB de expansión ZIP. Se verifica el tamaño declarado de las entradas antes de que ExcelJS descomprima el libro. Estos límites de importación no cambian el límite de materialización de matrices del calculador ni garantizan igual consumo de memoria para todos los libros.

ExcelJS compara nombres XML cualificados en los dibujos y puede fallar con `wsDr` en el espacio de nombres predeterminado (por ejemplo, archivos generados por otros productores XLSX). Se normalizan los prefijos en una copia de lectura; los metadatos de gráficos continúan leyéndose del archivo original. El aviso de error distingue límites de archivo, celdas y expansión; un fallo genérico ya no afirma que el archivo supera 250.000 celdas.

`xlsx-charts.ts` soporta series orientadas tanto por columnas (verticales, p. ej. `$C$26:$C$33`) como por filas (horizontales, p. ej. `$C$38:$G$38` con categorías en `$C$37:$G$37` y títulos en columna como `B38`). Para gráficos orientados a filas, se almacena `orientation: 'row'`, `xRow`, `seriesRows` y `seriesColumns` dentro de `ChartDataConfig`. El renderizador `ExcelChartRendererComponent` extrae las categorías desde las columnas del renglón `xRow` y cada serie desde su fila en `seriesRows`, asignando colores e ítems de leyenda con claves `row:${fila}`. Asimismo, en gráficos de dispersión (`scatterChart`), se reconocen automáticamente las líneas y marcadores presentes en cada `<ser>` para asignar subtipos como `scatterStraightLinesMarkers`.

Verificación con `c2make_completo_defensa.xlsx` (120.496 bytes): se importan exitosamente el gráfico de dispersión con líneas y marcadores de punto de equilibrio (`Chart 1`) y el gráfico de columnas agrupadas con series horizontales por filas del Estado de Resultados (`Chart 2`, con 4 series en filas 37, 39, 41 y 48 y categorías en fila 36 para los 5 años proyectados). Se comprobó la geometría de anclaje, títulos, extracción de valores y renderizado sin deformaciones. No se modificó el XLSX original.

Validación de esta corrección: 12 pruebas XLSX aprobadas, incluida regresión del espacio de nombres de dibujos y límites ZIP; compilación de desarrollo y comprobación de carga diferida correctas.

### Menú contextual de celdas

Clic derecho sobre una celda abre `ExcelCellContextMenuComponent` con inserción de fila arriba/abajo y columna izquierda/derecha. La celda pulsada determina la posición. El menú se ajusta al viewport, cierra con clic exterior/Escape y permite recorrer opciones con flechas, Inicio y Fin. Las etiquetas usan el idioma de la aplicación.

La inserción se prepara sobre una copia mediante las operaciones estructurales compartidas del libro: actualiza fórmulas, nombres, combinaciones, rangos de tablas/gráficos y tamaños de filas/columnas; deja las nuevas posiciones sin contenido ni estilos copiados. Se publica con un paso de historial y autoguardado. Cambiar de hoja/documento o desplazar la cuadrícula cierra el menú. Verificación: 65 pruebas focalizadas de editor y estructura aprobadas, incluyendo apertura real del menú, inserción en blanco y deshacer.


## Auditoría de migración a Canvas — 2026-11-15

### Alcance

Revisión del editor completo `pure-sheet-editor`, su renderer, eventos, edición, gráficos, tinta, objetos flotantes, exportación y pruebas. El bloque `sheet-block` se inspeccionó como superficie adicional, pero no se confunde con el editor completo. Esta auditoría no cambia la implementación ni constituye una medición visual/de rendimiento en navegador.

### Ya migrado en la cuadrícula

`ExcelCanvasGridComponent` monta el lienzo visible y `SheetCanvasRenderer.buildFrame` calcula celdas/geometría; `paint` dibuja la cuadrícula. El frame cubre:

- Valores, fórmulas visibles, colores, fuentes, alineación, wrap, bordes y desbordamiento de texto.
- Cabeceras de filas/columnas y paneles inmovilizados con cuadrantes recortados.
- Selección de rangos, relleno, rangos derramados, combinaciones, resaltado de referencias y contorno de copia/corte.
- Formato condicional, visualización de tablas, botones de filtro y checkboxes.
- Redimensionado de filas/columnas, guías de arrastre, autofit con medición Canvas, área de impresión y líneas de saltos.
- Hit testing geométrico para celdas, cabeceras, redimensionado, filtros, checkboxes y fill handle; no depende de un elemento DOM por celda.

El modelo disperso `SheetGrid`, el evaluador y el historial del libro ya existen separados del dibujo. No hace falta representar el cálculo de fórmulas en Canvas: Canvas dibuja sus resultados. Los menús, la cinta y los diálogos pueden seguir siendo HTML.

### Migraciones pendientes

| Área | Estado real y evidencia | Trabajo para cerrar |
| --- | --- | --- |
| Gráficos incrustados y hojas de gráfico | `ExcelChartRendererComponent` genera SVG; títulos, leyendas y tooltips son HTML/SVG. Las tarjetas del editor y `ExcelChartSheetViewComponent` no usan `SheetCanvasRenderer`. | Separar datos/geometría de gráficos de la plantilla SVG, añadir backend Canvas y hit testing de series/leyenda/tooltips, preservando las categorías y opciones actuales. |
| Tinta/dibujo | `ExcelInkLayerComponent` monta un SVG de dimensiones de hoja y dos paths por trazo (visible y de hit testing), además de borrador/lazo y controles. | Pintar trazos por viewport en una capa Canvas y resolver selección, borrado, lazo y transformación mediante geometría del modelo. |
| Formas e iconos flotantes | `ExcelFloatingArtworkComponent` monta un div por objeto, iconos SVG o `innerHTML` SVG, con manejadores HTML. | Backend Canvas para las formas/iconos, recursos y selección/resize del modelo. Unificar zoom, recorte y orden de capas con gráficos/tinta. |
| Objetos fuera de pantalla | `pure-sheet-editor.component.html` recorre TODOS los gráficos y artwork de la hoja; la capa de tinta recorre todos los trazos. La virtualización de celdas no se extiende a esos objetos. | Filtrar por intersección con viewport o usar una escena Canvas con culling espacial, conservando los objetos completos en el modelo. |
| Edición visual de celda | La celda activa se edita con un `input` visible superpuesto. La barra de fórmulas también es HTML. El cursor y la selección del texto pertenecen al control nativo. | Si se requiere una superficie íntegramente Canvas, usar el input como proxy IME/portapapeles y dibujar texto/caret/selección sobre la celda. El input por sí mismo no es un fallo: es una parte legítima de un enfoque híbrido. |
| PDF/impresión | El botón abre el exportador genérico, que reconstruye HTML y rasteriza mediante html2canvas. No consume el frame del renderer de hojas ni una escena conjunta de objetos. Las líneas de salto visibles no son un motor completo de impresión. | Renderizar por áreas/páginas del libro desde el mismo modelo y geometría, incluyendo gráficos, tinta y objetos fuera de pantalla, escalado/orientación y todas las hojas solicitadas. |
| Accesibilidad | Hay una base `role=grid` con número total de filas/columnas y una celda activa anunciada; no hay una proyección semántica completa de las filas/celdas visibles y rangos seleccionados. | Ampliar el espejo accesible y el anuncio de selección, combinaciones, encabezados, fórmulas y errores, conservando un DOM acotado. Validar con lector de pantalla real. |
| Hoja insertada como bloque | `src/app/blocks/sheet-block/sheet-block.component.html` sigue usando una tabla HTML con filas/celdas. Comparte datos/evaluador, no la superficie Canvas principal. | Reutilizar la superficie/renderer Canvas con un adaptador reducido si el alcance incluye también las hojas dentro de documentos por bloques. |

### Compatibilidad y rendimiento que no deben confundirse con migración de dibujo

1. **Worker:** la importación XLSX ya utiliza `xlsx.worker.ts`. No se encontró Worker/OffscreenCanvas para el cálculo de fórmulas o el dibujo cotidiano. La caché y evaluación visible siguen en el hilo principal. Decidir qué cálculo trasladar mediante perfiles de edición, recalculado y scroll en libros grandes; la mera adopción de Canvas no elimina ese coste.
2. **Exportador genérico:** además del cambio de backend gráfico, revisar el adaptador de datos. `PdfExportStrategy.renderPureDocToHtml` envuelve el `docData` como workbook, pero `renderSheetToHtmlTable` espera `sheet.cellData`; el modelo actual del editor usa `sheet.data` con claves A1. Es una incompatibilidad de contrato detectada al leer el código que requiere una prueba de exportación del libro real, no una afirmación de que XLSX esté roto. XLSX/CSV tienen rutas propias y pueden conservar su serialización independiente de Canvas.
3. **Recuperación de dibujo:** `ExcelCanvasGridComponent.renderNow` pinta si `canvas.getContext('2d')` devuelve un contexto. No se encontró una ruta de error/contextlost equivalente a la recuperación del Word. Conviene detectar pérdida de contexto, conservar datos y ofrecer recuperación explícita.
4. **Angular y repintado:** existe firma de frame y programación con requestAnimationFrame; `ngAfterViewChecked` sigue comprobando `renderNow(false)`. Esto necesita perfiles reales antes de afirmar que el coste es alto o que está resuelto completamente.

### Verificación

Comando ejecutado: `npm run test:sheets`.

Resultado: **22 suites y 206 pruebas aprobadas**, incluidas pruebas del renderer y del editor integrado: combinaciones, selecciones, filtros/checkboxes, paneles inmovilizados, bordes, área de impresión, portapapeles, autofit, fórmulas, gráficos y XLSX. Log local: `/tmp/weave-excel-canvas-audit-tests.log`.

Los contextos Canvas de las pruebas se simulan: este resultado no sustituye una comprobación visual, de portapapeles/IME real, de accesibilidad o de memoria/CPU en navegador. No se modificaron funciones ni se ejecutó un nuevo perfil de libros reales durante esta auditoría.

### Orden recomendado

1. Crear una capa de escena para tinta/formas y su virtualización por viewport.
2. Migrar gráficos incrustados y hojas de gráfico al mismo backend/escena, conservando datos y configuración.
3. Construir exportación PDF/impresión desde el modelo/escena y corregir la compatibilidad del adaptador genérico.
4. Completar accesibilidad y decidir el alcance de edición Canvas del texto de celda y del bloque reducido.
5. Medir cálculo y dibujo para decidir uso de Workers; mantener cinta, menús, formularios y adaptadores de archivos como UI/adaptadores HTML donde corresponda.

## Etapa 1: Herramientas de datos, búsqueda, validación y tablas dinámicas

La primera etapa completa las herramientas de datos de la cinta (`Data` / `Datos`) y corrige entradas
simuladas en `Insert` / `Insertar`, centralizando la lógica pura en
[sheet-data-tools.service.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-data-tools.service.ts)
y manteniendo la edición directa sobre `Sheet` con soporte completo de deshacer/rehacer y
guardado automático.

### Cinta `Datos` e integración en `Inicio` / `Insertar`

* **Barra de datos** (`ExcelDataToolbarComponent`): agrupa en una barra dedicada las acciones de
  ordenar A-Z / Z-A, abrir ordenar y filtrar, activar o limpiar autofiltros de columna, abrir
  validación de datos, quitar duplicados, texto en columnas, buscar y reemplazar y crear tabla
  dinámica.
* **Accesos compartidos**: el botón de búsqueda de la pestaña `Inicio` (`find_select`) y el botón de
  tabla dinámica de `Insertar` reutilizan los mismos modales que la pestaña `Datos`. En `Insertar` se
  eliminaron las redirecciones simuladas hacia gráficos y el botón de imágenes ahora inserta
  imágenes reales como objetos flotantes (`FloatingArtwork` con `kind: 'image'`) dibujados en
  Canvas mediante [artwork-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/artwork-canvas-renderer.ts).

### Flujo de Buscar y reemplazar (`Ctrl+F` / `Ctrl+H`)

1. **Disparadores**: atajos globales `Ctrl+F` y `Ctrl+H` en
   [sheet-interaction.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts),
   botón de la barra `Inicio` o botón de la barra `Datos`.
2. **Motor de búsqueda** (`findWorkbookMatches`): recorre únicamente hojas de tipo `grid` en la hoja
   activa o en todo el libro (`scope: 'sheet' | 'workbook'`), con soporte para coincidir mayúsculas
   (`matchCase`), celda completa (`wholeCell`) y búsqueda en contenido bruto/fórmulas, valor
   calculado o ambos (`searchIn: 'raw' | 'display' | 'both'`).
3. **Navegación y reemplazo**: permite saltar al siguiente o anterior resultado cambiando de hoja si
   es necesario, reemplazar la coincidencia activa (`replaceCurrentFindMatch`) o ejecutar un
   reemplazo masivo en un solo snapshot de deshacer (`replaceAllWorkbookMatches`), recalculando el
   contexto de fórmulas (`ensureWorkbookContext`) y re-renderizando el Canvas.

### Flujo de Validación de datos y listas desplegables en Canvas

1. **Modelo por celda** (`CellValidationRule` en `Sheet.validations`): soporta reglas `any`, `list`,
   `whole`, `decimal`, `textLength` y `date`, operadores de comparación (`between`, `notBetween`,
   `equalTo`, `notEqualTo`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`), flag
   `allowBlank` y opción `showDropdown` para listas. Se configura mediante
   `ExcelDataValidationModalComponent` sobre rangos de hasta 50,000 celdas.
2. **Resolución de listas** (`resolveValidationListOptions`): interpreta valores separados por coma o
   punto y coma, así como referencias de rango en la hoja o entre hojas (`=Hoja!A1:A10`), evaluando
   celdas con fórmulas mediante `evaluateCellValueCached`.
3. **Interacción en Canvas y teclado**:
   * [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts)
     renderiza el botón desplegable en cada celda con regla `list` (`showDropdown !== false`) y expone
     `validationButtons` para hit-testing (`validationButton`) en
     [excel-canvas-grid.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-canvas-grid/excel-canvas-grid.component.ts).
   * Hacer clic sobre el indicador de la celda o pulsar `Alt+ArrowDown` abre el popover
     `.validation-dropdown-popover` (`[data-testid="validation-cell-dropdown"]`) para elegir un
     elemento e insertarlo directamente con soporte de undo.
4. **Control al confirmar edición**: `commitCellEdit` en
   [sheet-editing.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-editing.controller.ts)
   ejecuta `validateCellValue`. Si el valor incumple la regla, cancela el guardado de la celda,
   notifica el error en `editorNotice` y conserva el dato anterior.

### Quitar duplicados y Texto en columnas

* **Quitar duplicados** (`removeDuplicatesFromRange` + `ExcelRemoveDuplicatesModalComponent`): evalúa
  el rango seleccionado respetando si la primera fila es encabezado (`hasHeaders`), compara claves
  compuestas de las columnas marcadas usando valores evaluados (case-insensitive) y compacta las
  filas únicas hacia arriba dentro del rango, limpiando las filas sobrantes en una sola operación
  deshacible.
* **Texto en columnas** (`previewTextToColumns` / `applyTextToColumns` +
  `ExcelTextToColumnsModalComponent`): toma la columna inicial del rango seleccionado, resuelve el
  texto (evaluando fórmulas si aplica), divide cada fila según delimitadores configurables (coma,
  punto y coma, tabulación, espacio, separador personalizado y agrupación de delimitadores
  consecutivos) mostrando una vista previa en vivo antes de escribir las columnas adyacentes.

### Tablas dinámicas (`buildPivotTableMatrix` + `ExcelPivotModalComponent`)

1. El asistente extrae los encabezados de la primera fila del rango (`extractPivotHeaders`) y
   permite elegir campo de **Filas**, campo opcional de **Columnas** (tabla cruzada 2D o resumen
   1D), campo de **Valores**, función de agregación (`sum`, `count`, `average`, `min`, `max`) y
   destino (`newSheet` o `currentSheet` junto al rango origen).
2. Genera una matriz de `CellData` con encabezados, subtotales por fila/columna y fila/columna de
   **Total general**, junto con anchos de columna calculados (`colWidths`), creando una hoja nueva o
   escribiendo el resultado en la hoja activa en un único snapshot de undo.

## Etapa 2: Formato condicional visual, notas en celda y minigráficos en Canvas

La Etapa 2 amplía las capacidades visuales e interactivas de la hoja dibujando barras de datos,
conjuntos de iconos, triángulos indicadores de nota y minigráficos vectoriales directamente sobre el
motor `Canvas 2D` en [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts),
reservando HTML flotante únicamente para modales de configuración y el popover anclado de
comentario/nota.

### Formato condicional avanzado en Canvas

* **Modelo y reglas** ([excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)):
  `ConditionalRuleType` incorpora `'containsText'`, `'duplicates'`, `'aboveAverage'`, `'dataBar'` e
  `'iconSet'` (`IconSetStyle = 'trafficLights' | 'arrows'`), junto a las reglas existentes
  (`greaterThan`, `lessThan`, `between`, `equalTo`, `colorScale`).
* **Pre-cálculo por frame** (`precomputeConditionalStats` + `resolveConditionalStyle`):
  en cada construcción de frame calcula estadísticas globales por rango (mínimo/máximo, promedio y
  conteo de frecuencia normalizada para duplicados) y adjunta `dataBar` (`ratio`, `color`) e
  `iconIndicator` (`level: 'high' | 'mid' | 'low'`, `style`) sobre cada `SheetRenderCell`.
* **Pintado nativo en Canvas**:
  `paintDataBar` dibuja la barra horizontal proporcional por debajo del texto, `paintCellIcon` pinta
  el indicador semaforizado (`arc`) o direccional (flechas) a la izquierda de la celda y
  `paintCellText` desplaza el margen izquierdo del texto automáticamente cuando existe un icono.
* **Gestión individual de reglas**:
  [excel-conditional-modal.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-conditional-modal/excel-conditional-modal.component.ts)
  recibe `[existingRules]` y emite `(removeRule)` junto a `(addRule)` y `(clearRangeRules)`,
  conectados en [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
  con `pushUndoSnapshot()` y refresco inmediato del Canvas (`canvasGrid?.renderNow(true)`).

### Notas y comentarios por celda (`Sheet.comments`)

1. **Indicador y hit-testing en Canvas**: cada celda presente en `Sheet.comments` marca `hasComment`
   y dibuja el triángulo indicador rojo en la esquina superior derecha mediante `paintCommentIndicator`,
   registrando su geometría en `SheetCanvasFrame.commentCorners` con target de hit-testing
   `kind: 'commentIndicator'`.
2. **Tooltip al pasar el cursor y editor anclado**:
   [excel-canvas-grid.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-canvas-grid/excel-canvas-grid.component.ts)
   notifica `hoverCommentCell` para mostrar `[data-testid="cell-comment-tooltip"]` al pasar el cursor
   y `openCellCommentEditor` al hacer clic en el triángulo indicador. También puede abrirse con
   **`Shift+F2`** ([sheet-interaction.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts))
   o desde el menú contextual de celda (`commentEdit` / `commentDelete` en
   [excel-cell-context-menu.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-cell-context-menu/excel-cell-context-menu.component.ts)).
3. **Persistencia e historial**: `saveCellComment` y `deleteCellComment` en
   [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
   registran snapshot de Undo/Redo antes de modificar `activeSheet.comments`.

### Minigráficos en celda (`Sheet.sparklines`)

1. **Asistente en cinta Insertar**: el botón `[data-testid="insert-sparkline-btn"]` en
   [excel-insert-toolbar.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-insert-toolbar/excel-insert-toolbar.component.html)
   propaga `openSparklineModal` a través de `ExcelRibbonComponent` para abrir
   [excel-sparkline-modal.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-sparkline-modal/excel-sparkline-modal.component.ts),
   permitiendo elegir tipo (`line`, `column`, `winLoss`), rango origen, celda destino y color de serie.
2. **Renderizado vectorial en celda**: `resolveCellSparkline` extrae los valores numéricos evaluados
   del `sourceRange` y `paintSparklineCell` traza la línea (con marcadores opcionales), columnas o
   barras ganancia/pérdida (`winLoss`) directamente sobre el Canvas dentro del rectángulo de la celda
   destino, evitando nodos DOM/SVG por celda.

---

## Etapa 3: Edición multilínea, pegado especial, filas/columnas ocultas y gestión de pestañas

### Edición multilínea (`Alt+Enter`) y renderizado en Canvas

1. **Entrada multilínea dinámica**: En [pure-sheet-editor.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.html),
   el editor inline alterna a `<textarea #cellEditorInput>` cuando `editingIsMultiline` es verdadero (`editingValue.includes('\n')`),
   manteniendo `<input #cellEditorInput>` para edición estándar en una línea.
2. **Atajo `Alt+Enter` y autoajuste de altura**: En
   [sheet-editing.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-editing.controller.ts),
   `onCellEditorKeyDown` intercepta `Alt+Enter` para insertar `\n` sin confirmar la celda y `commitCellEdit`
   amplía automáticamente `rowHeights[row]` según la cantidad de líneas al confirmar.
3. **Pintado Canvas multilínea**: En
   [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts),
   `paintCellText` divide saltos `\n` explícitos incluso con `wrapText` desactivado y
   `paintActiveCellEditor` dibuja las líneas activas, la selección parcial y el cursor en la línea correspondiente.

### Pegado especial (`PasteSpecialMode`)

1. **Modos soportados**: [excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)
   define `PasteSpecialMode` (`'all' | 'values' | 'formulas' | 'formats' | 'transpose'`), implementado en
   `applyPasteSpecial` dentro de
   [sheet-data.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-data.controller.ts)
   con soporte completo de Undo/Redo y actualización de fórmulas dependientes.
2. **Acceso desde Ribbon y atajo**: El desplegable `[data-testid="paste-special-toggle"]` en
   [excel-ribbon.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-ribbon/excel-ribbon.component.html)
   y el atajo `Ctrl+Shift+V` en
   [sheet-interaction.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts)
   abren el menú contextual flotante `[data-testid="paste-special-menu"]` sobre el área de trabajo.

### Filas y columnas ocultas en el motor Canvas (`GridAxis`)

1. **Ejes dispersos con ocultamiento**: `GridAxis` en
   [grid-viewport.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/grid-viewport.ts)
   acepta índices ocultos (`Sheet.hiddenCols` y `Sheet.hiddenRows`), asigna ancho/alto `0` sin desplazar los índices
   reales y resuelve `indexAt` omitiendo índices ocultos al navegar o hacer hit-testing.
2. **Costuras visuales y navegación**:
   [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts)
   expone `hiddenColBreaks` / `hiddenRowBreaks` y dibuja una doble línea indicadora en `paintHeaders`. Las acciones
   `hideRow`, `unhideRows`, `hideCol` y `unhideCols` del menú contextual en
   [excel-cell-context-menu.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-cell-context-menu/excel-cell-context-menu.component.ts)
   gestionan el estado con Undo/Redo y `moveSelection` en
   [sheet-interaction.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts)
   salta automáticamente las filas o columnas ocultas.

### Gestión de pestañas de hojas (`tabColor`, duplicar y reordenar)

1. **Operaciones en `SheetWorkbookController`**:
   [sheet-workbook.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-workbook.controller.ts)
   incorpora `duplicateSheet`, `moveSheet` y `setSheetTabColor` preservando títulos únicos e historial Undo/Redo.
2. **UI en una sola fila inferior**: Manteniendo la barra inferior de hojas en una única fila horizontal, el clic
   derecho sobre una pestaña abre el menú contextual `[data-testid="sheet-tab-menu"]` con acciones para duplicar,
   mover a izquierda/derecha, asignar color (`Sheet.tabColor`) y eliminar, reflejando además el color en la vista de
   pestañas y en el selector desplegable de todas las hojas.

---

## Etapa 4: Fidelidad OOXML (`.xlsx`), hipervínculos y rotación de texto en Canvas

### Fidelidad OOXML completa en importación y exportación (`.xlsx`)

1. **Ida y vuelta de capacidades de Etapas 1–3**:
   [xlsx.service.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx.service.ts)
   exporta e importa sobre ExcelJS (`writeXlsx` / `readXlsx`):
   - **Color de pestaña** (`Sheet.tabColor` <-> `ws.properties.tabColor`).
   - **Filas y columnas ocultas** (`Sheet.hiddenCols`, `Sheet.hiddenRows`), asignando altura explícita en filas vacías ocultas para conservar el atributo `hidden="1"` en XML.
   - **Notas/comentarios por celda** (`Sheet.comments` <-> `cell.note`, texto plano o rich text).
   - **Validaciones de datos** (`Sheet.validations` <-> `ws.dataValidations.model`), cubriendo celdas vacías y reglas `list`, `whole`, `decimal`, `textLength` y `date`.
   - **Formato condicional** (`Sheet.conditionalRules` <-> `ws.addConditionalFormatting` / `ws.model.conditionalFormattings`), incluyendo `cellIs`, `containsText`, `duplicates` (vía `COUNTIF(...)>1`), `aboveAverage`, `dataBar`, `colorScale` e `iconSet` (`3TrafficLights` / `3Arrows`).
   - **Vistas congeladas desactivadas**: se mantiene la regla de exportar siempre `freezePanes` desactivado e ignorarlo al importar.

### Hipervínculos en celda y rotación de texto en Canvas

1. **Modelo y seguridad**: [excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)
   incorpora `CellData.hyperlink` y `CellStyle.textRotation`. Tanto la UI (`saveCellHyperlink` / `openCellHyperlink` en
   [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts))
   como `sanitizeHyperlink` en [xlsx.service.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx.service.ts)
   restringen enlaces a `https://`, `http://` y `mailto:`, abriendo con `noopener,noreferrer` al usar **`Ctrl+Clic`**
   ([sheet-interaction.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-interaction.controller.ts))
   o desde el menú contextual.
2. **Atajos, cinta y renderizado Canvas**: **`Ctrl+K`** o el botón `[data-testid="insert-hyperlink-btn"]` en
   [excel-insert-toolbar.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-insert-toolbar/excel-insert-toolbar.component.html)
   abren `[data-testid="hyperlink-modal"]`; `[data-testid="text-rotation-select"]` en
   [excel-ribbon.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-ribbon/excel-ribbon.component.html)
   controla la orientación (`0°`, `±45°`, `±90°`). En
   [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts),
   `paintCellText` aplica transformación rotada (`ctx.rotate`) sin desbordar a celdas vecinas y dibuja hipervínculos subrayados en azul.

### Escalabilidad y fidelidad en exportación Canvas PDF/PNG

* **Exportación sin filas/columnas ocultas**: `buildAxesForSheet` en
  [sheet-canvas-export.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-export.ts)
  pasa `sheet.hiddenCols` y `sheet.hiddenRows` a `GridAxis` para omitirlos también en salidas Canvas PDF/PNG.
* **Sin materialización `O(N)` de ejes**: se eliminaron los getters no utilizados `colLetters` y `rowIndices` de
  [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
  para evitar construir arreglos de dimensión completa de la hoja.

---

## Etapa 5: Protección de hoja/celdas y esquema (Outline) nativo en Canvas

### Protección de hoja y bloqueo selectivo de celdas

1. **Modelo y semántica Excel OOXML**: [excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)
   incorpora `Sheet.protected` y `CellStyle.locked` (siguiendo OOXML: toda celda está bloqueada por defecto salvo `locked: false`).
2. **Guardias unificadas de edición y formato**:
   [PureSheetEditorComponent](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
   centraliza `isCellLocked`, `guardEditableCell` y `guardEditableRange` (junto con `toggleSheetProtection` y `toggleSelectionLocked`), bloqueando con aviso en `editorNotice` cualquier mutación sobre celdas bloqueadas mientras la hoja está protegida en:
   - [sheet-editing.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-editing.controller.ts) (`startCellEdit`, `commitCellEdit`, `onFormulaBarChange`)
   - [sheet-data.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-data.controller.ts) (`executeSmartFill`, `handleFillDown`, `handleFillRight`, `applyPastedCells`, `applyPasteSpecial`, `handleClearContent`, `toggleCheckboxCells`)
   - [sheet-formatting.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-formatting.controller.ts) (`applyStyleChange`) y `applyFormatPainter`
3. **Controles e indicadores visuales en Canvas**:
   [excel-view-toolbar.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-view-toolbar/excel-view-toolbar.component.html)
   expone `[data-testid="toggle-sheet-protection-btn"]` y `[data-testid="toggle-cell-lock-btn"]`. En
   [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts),
   cuando `sheetProtected` está activo se renderiza un candado en la esquina superior izquierda de los encabezados y en la celda activa bloqueada.

### Agrupación / Esquema de filas y columnas (`OutlineGroup`) en Canvas

1. **Modelo y acciones de usuario**: `Sheet.rowGroups` y `Sheet.colGroups` almacenan rangos `{ start, end, collapsed? }` manipulados mediante `groupSelection`, `ungroupSelection` y `toggleOutlineGroup` en
   [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
   y los botones `[data-testid="group-rows-btn"]`, `[data-testid="ungroup-rows-btn"]`, `[data-testid="group-cols-btn"]` y `[data-testid="ungroup-cols-btn"]` en
   [excel-data-toolbar.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-data-toolbar/excel-data-toolbar.component.ts).
2. **Motor Canvas e interacción directa**: `computeOutlineButtons`, `paintOutlineButtons` y `hitTestOutlineButton` en
   [sheet-canvas-renderer.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/sheet-canvas-renderer.ts)
   renderizan corchetes y botones interactivos `[ - ]` / `[ + ]` dentro de los encabezados de filas y columnas, evaluándolos antes del hit-test de redimensionamiento y delegando `{ kind: 'outlineToggle' }` en
   [excel-canvas-grid.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-canvas-grid/excel-canvas-grid.component.ts).

### Ida y vuelta OOXML (`.xlsx`)

* [xlsx.service.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx.service.ts)
  serializa e importa `ws.protect(...)` / `ws.sheetProtection.sheet`, `cell.protection.locked`, y los niveles de esquema (`outlineLevel = 1` + `hidden`) reconstruyendo grupos contiguos mediante `buildOutlineGroups`.

---

## Etapa 6: Capacidad base ampliada, Web Worker de fórmulas, fidelidad OOXML multimedia y accesibilidad Canvas

### Expansión de cuadrícula base (`TOTAL_ROWS = 1000`, `TOTAL_COLS = 100`)

* Se amplía el tamaño mínimo inicial del viewport en
  [editor.constants.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/constants/editor.constants.ts)
  de `100 × 26` (`A1:Z100`) a **`1000 × 100` (`A1:CV1000`)**, manteniendo expansión dinámica bajo demanda hasta el límite Excel (`1,048,576 × 16,384`) en
  [sheet-viewport.controller.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-viewport.controller.ts)
  con representación dispersa `O(1)` en memoria.

### Recálculo de fórmulas en segundo plano (`Web Worker`)

1. **Motor compartido y contrato del Worker**:
   [formula-recalc.engine.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/formula-recalc.engine.ts)
   define `buildFormulaRecalcSnapshot` (serialización ligera con `raw`/`xlsxType` y metadatos sin enviar imágenes o trazos binarios) y `computeWorkbookFormulas`, ejecutado dentro de
   [formula-recalc.worker.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/formula-recalc.worker.ts).
2. **Coordinación con cancelación por revisión**:
   [FormulaRecalcClient](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/formula-recalc-client.ts)
   descarga evaluaciones DAG fuera del hilo principal (con fallback por microtarea cuando `Worker` no está disponible) y descarta cualquier resultado obsoleto (`result.revision !== latestRevision`).
3. **Integración en el ciclo de vida**:
   [PureSheetEditorComponent](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
   y [SheetWorkbookController](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/controllers/sheet-workbook.controller.ts)
   disparan `scheduleBackgroundRecalc` al cargar libros con fórmulas, mutar la grilla o ejecutar `recalculateSheet()`, hidratando `calculationCache` y `cell.computed`, y terminando el Worker en `ngOnDestroy`.

### Fidelidad OOXML `.xlsx` de gráficos, imágenes embebidas y AutoFilter

1. **Imágenes embebidas (`FloatingArtwork` `kind: 'image'`)**:
   [xlsx.service.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx.service.ts)
   incorpora `writeWorksheetImages` (`book.addImage` + `ws.addImage` con coordenadas fraccionarias sobre `GridAxis`) y `readWorksheetImages` (`ws.getImages()` + `book.model.media`, soportando PNG, JPEG y GIF).
2. **AutoFilter por hoja (`Sheet.filtersEnabled`)**:
   [excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)
   añade `filtersEnabled?: boolean` respaldado en la propiedad `filtersEnabled` de la hoja activa; `writeXlsx` exporta `ws.autoFilter` sobre el rango de datos y `readXlsx` restaura el estado al detectar `ws.autoFilter`.
3. **Gráficos embebidos (`Sheet.charts`)**:
   [xlsx-charts.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx-charts.ts)
   añade `exportChartMetadata(files, sheets)` para escribir partes OOXML `<c:chartSpace>`, `<xdr:twoCellAnchor>`, relaciones `.rels` y `[Content_Types].xml`, reutilizando el dibujo existente si la hoja también contiene imágenes.

### Accesibilidad (`a11y`) y cursor en Canvas

* En [excel-canvas-grid.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-canvas-grid/excel-canvas-grid.component.ts),
  `cursorForHit` devuelve `'pointer'` sobre botones de esquema (`outlineToggle`), `#sheet-a11y-active-cell` expone `aria-readonly` cuando la celda está protegida y `activeCellA11yLabel` anuncia protección, hipervínculos, validación de datos, paneles inmovilizados, pertenencia a grupos `OutlineGroup` y gráfico seleccionado.

---

## Edición de fórmulas y selección de referencias

`SheetEditingController` distingue la edición del texto de la selección de referencias:

* Al reabrir una celda con F2/doble clic o enfocar la barra de fórmulas, las flechas mueven el cursor dentro del texto, sin cambiar referencias.
* Al escribir un operador o comenzar un argumento vacío, las flechas permiten elegir una celda; `Shift` + flechas amplía el rango. F2 alterna entre este modo y la edición de texto mientras la fórmula está abierta.
* Hacer clic dentro del editor, usar Inicio/Fin o navegar con Ctrl/Cmd + flechas vuelve a la edición del texto.
* Para reemplazar un operando con el mouse, colocar el cursor dentro de su referencia y seleccionar una celda o arrastrar un rango en la cuadrícula. Se sustituye el token completo (incluido un rango o nombre de hoja), conservando los demás operandos. También funciona desde la barra de fórmulas sin escribir primero.

Los cambios siguen pendientes hasta confirmar la fórmula; Escape restaura el valor anterior. La selección de referencias entre hojas conserva la celda de origen. Las pruebas del componente cubren ambos modos, referencias parciales, rangos, foco en la barra y navegación entre hojas.

## Cierre de brechas de auditoría (`19-AUDITORIA-HOJAS-DE-CALCULO.md`)

### Tablas dinámicas nativas OOXML actualizables (Etapa 1)

* **Modelo y refresco en vivo**: [excel.model.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/models/excel.model.ts)
  incorpora `PivotTableDefinition` y `Sheet.pivotTables`; `applyPivotTable` y `refreshPivotTables` en
  [pure-sheet-editor.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.ts)
  guardan la definición enlazada a `sourceSheetId` y recalculan la matriz cuando cambian los datos de origen, expuestos también con `[data-testid="refresh-pivot-btn"]` en
  [excel-data-toolbar.component.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/components/excel-data-toolbar/excel-data-toolbar.component.ts).
* **Serialización `.xlsx` nativa**: `exportPivotTableMetadata` e `importPivotTableMetadata` en
  [xlsx-ooxml.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx-ooxml.ts)
  generan y leen `pivotCacheDefinition`, `pivotCacheRecords`, `pivotTableDefinition`, `<pivotCaches>` y relaciones `.rels`.

### Minigráficos, formas flotantes y esquema OOXML (Etapas 2, 4 y 5)

* **Minigráficos `<x14:sparklineGroups>`**: `exportSparklineMetadata` e `importSparklineMetadata` en
  [xlsx-ooxml.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx-ooxml.ts)
  aseguran ida y vuelta de `line`, `column` y `winLoss` (`stacked`) en `.xlsx`.
* **Formas vectoriales (`<xdr:sp>`) y esquema (`<outlinePr>`)**: `exportDrawingShapes`, `importDrawingShapes` y `exportOutlineProperties` en
  [xlsx-ooxml.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx-ooxml.ts)
  serializan formas flotantes `kind: 'shape'` junto a imágenes/gráficos en el `<drawing>` de la hoja y habilitan `<outlinePr summaryBelow="1" summaryRight="1"/>`.

### Barra de pestañas en fila única y foco ARIA de teclado (Etapas 3 y 6)

* **Fila única estricta**: `.sheet-footer` y `.sheet-tabs-scroll` en
  [pure-sheet-editor.component.html](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.html)
  y [pure-sheet-editor.component.scss](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.scss)
  bloquean altura (`h-9 max-h-9` / `28px` en pestañas), `flex-wrap: nowrap` y scroll horizontal sin salto de línea.
* **Contrato ARIA en `#gridContainer`**: el contenedor enfocable (`tabindex="0"`) declara `role="grid"`, `aria-rowcount`, `aria-colcount` y `aria-activedescendant="sheet-a11y-active-cell"`, acompañado de una región viva `[data-testid="sheet-a11y-notice"]` (`aria-live="polite"`) validada con pruebas en [pure-sheet-editor.component.spec.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/pure-sheet-editor.component.spec.ts) y [xlsx-ooxml.spec.ts](file:///mnt/datos/personal_projects/weave/frontend/src/app/editor/pure-sheet-editor/services/xlsx-ooxml.spec.ts).
