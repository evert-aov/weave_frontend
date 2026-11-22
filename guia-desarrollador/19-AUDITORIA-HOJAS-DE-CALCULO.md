# Auditoría de las etapas de hojas de cálculo

**Fecha de revisión:** 16 de noviembre de 2026  
**Alcance:** revisión estática del código actual del editor, Canvas, modelo, importación/exportación `.xlsx` y pruebas existentes. No se ejecutaron pruebas ni se abrieron archivos en Excel o LibreOffice durante esta revisión.

## Resultado general

Los cambios recientes cerraron varias brechas de la auditoría anterior: el exportador ahora escribe imágenes, AutoFilter y metadatos de tablas dinámicas nativas; la barra de pestañas está limitada a una fila y conserva un selector de hojas. Las seis etapas tienen implementación parcial o completa en el código. Quedan por confirmar interoperabilidad externa de OOXML y accesibilidad real con lectores de pantalla.

| Etapa | Estado | Resultado revisado |
|---|---|---|
| 1. Herramientas de datos, búsqueda, validación y tablas dinámicas | **Parcial** | Búsqueda/reemplazo, validaciones y operaciones de datos están implementadas. Hay tablas dinámicas con definición y caché OOXML, pero la compatibilidad y actualización en Excel/LibreOffice no se verificaron externamente; el modelo admite una configuración acotada de campos y agregación. |
| 2. Formato condicional, notas y minigráficos | **Implementada en código** | Hay edición, renderizado y serialización de reglas condicionales, comentarios/notas y sparklines. Hay pruebas de ciclo de exportación e importación para los tipos principales. Falta comprobar otros archivos y consumidores OOXML. |
| 3. Edición multilínea, pegado especial, filas/columnas ocultas y pestañas | **Implementada** | Se admiten edición multilínea, pegado especial y ocultar/mostrar filas y columnas. Las pestañas usan una fila sin ajuste de línea, desplazamiento horizontal y selector desplegable. |
| 4. Fidelidad OOXML, hipervínculos y rotación en Canvas | **Parcial** | Hipervínculos y rotación se representan y se serializan/importan en los casos soportados. La fidelidad general de `.xlsx` no está garantizada para extensiones u objetos OOXML que no tengan modelo propio en Weave. |
| 5. Protección y esquema nativo en Canvas | **Implementada en código** | Se aplican celdas bloqueadas en hojas protegidas y se muestran/operan grupos de filas y columnas. La importación/exportación conserva protección y niveles de esquema en los escenarios cubiertos por pruebas existentes. |
| 6. Cuadrícula, recálculo, exportación y accesibilidad | **Parcial** | Cuadrícula inicial 1000 × 100 con expansión dinámica; recálculo con Web Worker y respaldo; exportación de gráficos, imágenes y AutoFilter. Canvas anuncia la celda activa mediante una capa accesible, pero la cobertura completa con lectores de pantalla no está comprobada. |

## Hallazgos por etapa

### 1. Herramientas de datos, búsqueda, validación y tablas dinámicas

El editor contiene herramientas de datos, búsqueda y reemplazo, validaciones y generación/actualización de resultados dinámicos. `xlsx-ooxml.ts` ahora escribe y lee definiciones de PivotTable, caché y registros, además de relaciones OOXML. La prueba de integración de código comprueba que se creen esas partes y que Weave las vuelva a leer.

La implementación de pivotes expone un conjunto limitado de campos (campo de fila, campo de columna opcional, un campo de valores y una agregación). La prueba actual valida el ciclo Weave → XLSX → Weave, no que Excel o LibreOffice abran, actualicen y conserven la tabla dinámica. Por eso la etapa queda parcial hasta validar interoperabilidad.

### 2. Formato condicional, notas y minigráficos

El modelo y la interfaz incluyen reglas condicionales, comentarios/notas y minigráficos. Hay renderizado de Canvas y manejo OOXML de reglas y comentarios; los minigráficos se importan y exportan como `x14:sparklineGroups`. Las pruebas existentes cubren importación y exportación de reglas de varios tipos y configuraciones de minigráficos.

La funcionalidad solicitada está presente en el código. La compatibilidad de todos los formatos de archivo y variantes OOXML no se puede afirmar sin probar documentos de Excel/LibreOffice.

### 3. Edición e interfaz de hojas

El editor admite edición multilínea (incluido el salto de línea de edición), pegado especial y operaciones para ocultar y mostrar filas/columnas. Las pruebas del componente cubren estas operaciones.

La barra inferior tiene altura fija, `flex-wrap: nowrap` y una tira de pestañas con desplazamiento horizontal. El selector desplegable permite elegir una hoja de la lista. Con el código revisado, el requisito de mantener las pestañas en una sola fila está cubierto.

### 4. OOXML, hipervínculos y rotación

Las celdas admiten hipervínculos saneados y `textRotation`; el Canvas dibuja los enlaces con estilo identificable y aplica la rotación. El importador y exportador conservan esos datos en los casos cubiertos por pruebas.

La etapa se mantiene parcial porque “fidelidad OOXML” en general incluye partes y extensiones que el modelo del editor podría no conservar. La cobertura comprobada se limita a las funciones expresamente modeladas y serializadas; no equivale a preservar sin cambios cualquier paquete `.xlsx` arbitrario.

### 5. Protección y esquema de filas/columnas

La protección de hoja se aplica en Canvas: las celdas bloqueadas no se editan mientras la hoja está protegida y las celdas desbloqueadas permanecen editables. Los grupos de filas/columnas guardan rangos y estado colapsado; Canvas dibuja los controles de esquema.

El importador/exportador maneja protección, bloqueo de celdas, filas/columnas ocultas y niveles de esquema. Las pruebas existentes cubren hojas protegidas y grupos expandidos/colapsados. La revisión no verificó el comportamiento frente a archivos producidos por otras suites.

### 6. Cuadrícula, recálculo, exportación y accesibilidad

- La cuadrícula parte de `TOTAL_ROWS = 1000` y `TOTAL_COLS = 100`; el viewport amplía sus límites para incluir datos y selección.
- `FormulaRecalcClient` usa `formula-recalc.worker` y recurre a cálculo local si el Worker no está disponible o falla.
- La exportación escribe gráficos, imágenes incrustadas y AutoFilter. Pruebas existentes cubren esas partes y su lectura de vuelta por Weave.
- Canvas expone resumen, celda activa, coordenadas, valor, fórmula, enlace, protección, validación, notas y otros estados a través de atributos ARIA y una celda accesible oculta.

La parte funcional de cuadrícula, worker y exportación está implementada. La accesibilidad queda parcial: una superficie Canvas no expone de forma nativa todas las celdas como una cuadrícula navegable por lectores de pantalla, y no se hizo una evaluación con NVDA, VoiceOver u otra tecnología asistiva.

## Evidencia en el repositorio

- [Constantes iniciales de la cuadrícula](../src/app/editor/pure-sheet-editor/constants/editor.constants.ts)
- [Modelo de hojas y celdas](../src/app/editor/pure-sheet-editor/models/excel.model.ts)
- [Editor, controles y barra de pestañas](../src/app/editor/pure-sheet-editor/pure-sheet-editor.component.html)
- [Diseño de pestañas en una fila](../src/app/editor/pure-sheet-editor/pure-sheet-editor.component.scss)
- [Herramientas de datos y tablas dinámicas](../src/app/editor/pure-sheet-editor/services/sheet-data-tools.service.ts)
- [Importación y exportación `.xlsx`](../src/app/editor/pure-sheet-editor/services/xlsx.service.ts)
- [Metadatos OOXML de sparklines, pivotes, dibujos y esquema](../src/app/editor/pure-sheet-editor/services/xlsx-ooxml.ts)
- [Cliente de recálculo con Web Worker](../src/app/editor/pure-sheet-editor/services/formula-recalc-client.ts)
- [Accesibilidad de la cuadrícula Canvas](../src/app/editor/pure-sheet-editor/components/excel-canvas-grid/excel-canvas-grid.component.ts)
- [Pruebas de funciones del componente](../src/app/editor/pure-sheet-editor/pure-sheet-editor.component.spec.ts)
- [Pruebas de interoperabilidad interna OOXML](../src/app/editor/pure-sheet-editor/services/xlsx-ooxml.spec.ts)
- [Pruebas de importación/exportación XLSX](../src/app/editor/pure-sheet-editor/services/xlsx.service.spec.ts)

## Límites de la revisión

Esta auditoría inspeccionó código y pruebas existentes; no ejecutó las pruebas, no abrió los archivos generados en Excel/LibreOffice y no probó navegación asistida. “Implementada en código” describe lo encontrado en el repositorio, no certifica compatibilidad externa. Para cerrar las etapas parciales se necesita validar tablas dinámicas y fidelidad OOXML con archivos de referencia, y evaluar Canvas con lectores de pantalla.
