# 18 — Hojas de cálculo, gráficos y referencias

[Volver al índice](README.md)

## Alcance y entradas

El documento `sheet` usa una cuadrícula Angular y un motor de fórmulas propio. Los gráficos
se dibujan con SVG; el editor no depende de Univer ni monta el frontend React de referencia.
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
deslizador azul y porcentaje de Word, con rango de 50 a 200 %. Ctrl + rueda sobre la cuadrícula
ajusta este zoom y cancela el zoom del navegador, también en los límites; sin Ctrl mantiene el
desplazamiento normal y fuera de la cuadrícula conserva el comportamiento del navegador. Los avisos de XLSX pueden
cerrarse con su botón de cierre una vez terminado el procesamiento, sin alterar los datos importados.

Las pestañas inferiores de las hojas se distribuyen en un máximo de dos filas visibles y tienen
scroll vertical cuando no caben. El botón de añadir hoja permanece fuera del área desplazable.
Al editar un nombre, los atajos de la cuadrícula ignoran ese campo: Enter o perder el foco confirma,
Escape cancela y un nombre vacío conserva el anterior. Renombrar actualiza las referencias y se
puede deshacer.

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

El SVG responde al tamaño disponible y mantiene texto y marcadores en píxeles. En líneas, áreas y
combinados, mover el puntero sobre el área localiza la categoría más cercana, muestra una línea
vertical y un tooltip con sus series.

La animación se ejecuta al montar el gráfico y cuando cambia su origen o los datos representados.
El fingerprint compara la extracción y los valores de las columnas utilizadas. Editar una columna
excluida u otra parte de la hoja no la reinicia. Cambiar título, leyenda o colores tampoco la reinicia.
Las preferencias `prefers-reduced-motion` desactivan las animaciones.

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

Ctrl+V deja que el navegador entregue un evento `paste`; `onGridPaste` prioriza tablas HTML y
usa TSV como alternativa. Esto permite pegar desde Excel, Google Sheets y tablas de páginas web
sin depender de una lectura programática del portapapeles para el atajo.

El parser conserva valores y formato básico: encabezados, negrita, cursiva, subrayado, colores,
alineación y fuente cuando el HTML los proporciona. Expande posiciones ocupadas por `rowspan`
y `colspan`, pero no garantiza una reproducción idéntica de todos los estilos ni del aspecto de
las celdas combinadas externas. Normaliza números, importes con `$` y porcentajes; las comillas protegen
celdas TSV que contienen tabuladores o saltos de línea.

El botón Pegar intenta `navigator.clipboard.read()` con HTML y después `readText()`. Su disponibilidad
depende de las capacidades y permisos del navegador. La edición normal de texto en otros inputs
no se intercepta. Al pegar una matriz, el rango queda seleccionado, las dimensiones visibles crecen
si hace falta y la operación se integra en Deshacer.

## Importación y exportación XLSX

Archivo → Importar XLSX añade todas las hojas del archivo al libro actual, selecciona la primera
y permite deshacer la operación completa. No reemplaza las hojas existentes. Los nombres repetidos
reciben un sufijo y las referencias internas del archivo se actualizan al nombre importado.
Archivo → Exportar XLSX descarga todas las hojas del libro en un archivo Excel.

La conversión vive en [services/xlsx.service.ts](../src/app/editor/pure-sheet-editor/services/xlsx.service.ts) y usa [ExcelJS](https://github.com/exceljs/exceljs#readme). Tanto el servicio como ExcelJS se cargan mediante
`import()` al usar estas acciones; el motor queda fuera del arranque. La lectura ocurre en un Web Worker mediante `services/xlsx-import.ts` y `services/xlsx.worker.ts`,
sin subir el archivo a un servicio externo. En entornos sin Worker se utiliza la lectura local directa. Se aceptan `.xlsx` sin contraseña de hasta 25 MB y
250.000 celdas con contenido o formato. Los errores se muestran sin modificar el libro existente.

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

La cuadrícula virtualiza filas y columnas: el DOM contiene la zona visible y un margen de
precarga, no el rectángulo entero hasta la última celda. Los separadores conservan el tamaño del
scroll y las coordenadas de gráficos y trazos. `services/grid-viewport.ts` calcula posiciones con
los tamaños predeterminados y las excepciones de filas/columnas, sin crear un array de un millón
de offsets para una hoja dispersa con formato al final del archivo.

Las dimensiones se memorizan por identidad de cuadrícula. Las fórmulas visibles comparten una
caché de cálculo durante una revisión del libro, incluyendo dependencias entre hojas; cambiar
una cuadrícula o un nombre invalida esa caché. Deshacer, rehacer y recalcular también la invalidan
mediante las nuevas cuadrículas. Las estadísticas de selección recorren las celdas existentes en
selecciones grandes y se memorizan por rango/revisión. Los datos fuera de pantalla se conservan.

La navegación por teclado y el rastreo desplazan el viewport antes de buscar una celda en el DOM.
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
