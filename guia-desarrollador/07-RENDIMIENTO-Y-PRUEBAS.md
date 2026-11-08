# 07 — Rendimiento y pruebas

[Volver al índice](README.md)

## Qué provocaba la espera inicial

La compilación de producción anterior a esta optimización cargaba aproximadamente **21,58 MB
iniciales**. Las rutas importaban el workspace directamente y su editor importaba todos los
motores, aunque el usuario solo abriera el login o una nota de texto. El HTML esperaba además
hojas externas de fuentes y PPTX. El listado de notas leía todos los documentos especializados
y dos componentes repetían las consultas al montar la pantalla.

Las correcciones son:

- Rutas mediante `loadComponent` y comprobación de sesión mediante `canMatch`.
- Shell antes que el editor y `@defer` por tipo de documento/bloque.
- Exportación PDF fuera de la carga inicial.
- Fuentes con carga no bloqueante y CSS de pizarra/hojas solo al abrir esas herramientas.
- Una inicialización de la navegación y listado `view=summary`, sin leer archivos pesados.
- Estados visibles de bootstrap, navegación, carga de editor y errores.

La primera apertura de una herramienta sigue descargando su propio motor. La carga diferida
reduce el trabajo inicial; no vuelve pequeños los motores externos ni elimina la compilación
inicial del servidor de desarrollo.

La compilación posterior midió **685,77 kB iniciales** (JS + CSS) y unos **344,4 kB de
JavaScript** en el grafo estático. La reducción del tamaño inicial es de aproximadamente
96,8 %. Son tamaños de artefactos de producción, no tiempos de primera pintura medidos
en un navegador; volver a medir al cambiar dependencias.

Actualización de noviembre de 2026: se retiraron `pptx-angular-viewer`, `pptx-viewer-core`,
sus assets y el proveedor global `@ngx-translate/core` (117 paquetes eliminados). El tipo de
presentación conserva los documentos almacenados y muestra un aviso hasta incorporar el próximo editor.
Excalidraw genera `canvas-vendor.css` con `inject: false`; sus editores, completo y por bloques,
esperan a `EditorStylesService` antes de montar el motor. `sheet-vendor.scss` conserva un archivo
de compatibilidad sin estilos de Univer: la cuadrícula de hojas actual usa Angular y SCSS propios.
KaTeX sigue global porque se comparte con texto y fórmulas.

La medición de producción registrada tras retirar el visor PPTX dio **438,62 kB iniciales** (JS + CSS), frente a **731,21 kB** antes de estos
cambios: reducción de **40 %** en bytes raw. El grafo JavaScript de arranque mide **369,5 kB**.
Esto mide artefactos; no sustituye una medición de latencia en el navegador.

## Libros XLSX con varias hojas

La lectura y conversión de XLSX se ejecuta en un Web Worker. El editor de hojas virtualiza filas
y columnas, de modo que una celda con formato en `XFD1048576` no crea un rectángulo de miles de
millones de elementos. La geometría usa tamaños por defecto y excepciones dispersas; conserva las
coordenadas de los objetos flotantes y la posición de scroll por hoja.

El cálculo visible comparte resultados por revisión del libro y las estadísticas de selecciones
grandes recorren celdas existentes. Cambiar datos, renombrar hojas o recalcular invalida los resultados.
Las pruebas incluyen navegación entre 14 hojas, scroll en ambos ejes y rastreo a una celda fuera del
viewport. Son verificaciones del modelo y DOM en JSDOM; no son mediciones de latencia de un archivo
real en navegador. Ver [la guía de hojas](18-HOJAS-DE-CALCULO.md#libros-grandes-y-navegación).

## Verificación automática

```sh
npm test -- --watch=false
npm run test:startup
npm run build
npm run check:startup
```

`npm run build` crea `dist/frontend/browser-stats.json`. Su hook `postbuild` ejecuta
[check-startup-bundle.mjs](../scripts/check-startup-bundle.mjs), que recorre imports estáticos
de `src/main.ts` y falla si encuentra JavaScript de Excalidraw, PPTX, CodeMirror, Monaco, Mermaid
o motores de exportación. Las hojas CSS globales no se confunden con motores JavaScript.

El presupuesto inicial de producción avisa a 750 kB y falla a 1 MB, en lugar de tolerar
decenas de MB. El reporte del build incluye JS y CSS iniciales; el verificador informa el
grafo estático de entrada. No confundir tamaño raw con tamaño transferido comprimido.

Las pruebas cubren carga de metadatos, apertura solo del documento seleccionado, respuestas
fuera de orden, limpieza de sesión, uso de almacenamiento local, árbol y teclado de separadores.
Se conservan las pruebas de imágenes del editor Word. Los tests de HTTP usan dobles.

## Pruebas del editor de hojas

La [guía de hojas de cálculo](18-HOJAS-DE-CALCULO.md#verificación-y-puntos-de-extensión)
reúne comandos focalizados y una lista de comprobaciones en navegador. Las pruebas cubren
selección de datos de gráficos, columnas no contiguas, escala, colores, animaciones, objetos
flotantes, portapapeles y referencias entre hojas con navegación al origen.

Las animaciones comparan los datos utilizados por cada gráfico. Una revisión de otra hoja
puede forzar recálculo, pero no debe reconstruir el SVG si no cambian esos datos. Conservar la
carga diferida del editor y evitar importar el editor Word completo para reutilizar sus catálogos.
Las cifras de bundle anteriores son mediciones históricas; volver a medir producción tras cambiar dependencias.

## Medir en el navegador

1. Esperar a que `npm start` termine de compilar antes de medir una navegación.
2. En Network, desactivar caché y recargar `/login` sin sesión: no deben descargarse motores especializados.
3. Con sesión, verificar una petición de espacios, un listado resumido y el detalle seleccionado.
4. Abrir una hoja o pizarra: su componente debe cargarse en ese momento; la pizarra carga además su CSS de proveedor.
5. Capturar Performance en una máquina y conexión representativas si se requiere un tiempo de primera pintura.

Para comparar producción, servir `dist/frontend/browser` con compresión y fallback SPA. El
tiempo de compilación de Angular CLI, la transferencia de archivos y la ejecución del motor
en el navegador son mediciones distintas.

## Peso de los documentos nativos

El backend optimiza el archivo físico de las hojas mediante estilos compartidos y compresión sin
pérdida; la API mantiene el modelo editable completo. La reducción de disco no implica que la
cuadrícula deje de reconstruir estilos ni que el transporte HTTP esté comprimido. No eliminar
celdas con formato para reducir el tamaño. Ver [almacenamiento del backend](../../backend/guia-desarrollador/04-DOCUMENTOS-Y-ARCHIVOS.md#almacenamiento-compacto-de-hojas).
