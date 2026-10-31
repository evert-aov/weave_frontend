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
- Fuentes con carga no bloqueante y CSS PPTX solo al abrir presentaciones.
- Una inicialización de la navegación y listado `view=summary`, sin leer archivos pesados.
- Estados visibles de bootstrap, navegación, carga de editor y errores.

La primera apertura de una herramienta sigue descargando su propio motor. La carga diferida
reduce el trabajo inicial; no vuelve pequeños los motores externos ni elimina la compilación
inicial del servidor de desarrollo.

La compilación posterior midió **685,77 kB iniciales** (JS + CSS) y unos **344,4 kB de
JavaScript** en el grafo estático. La reducción del tamaño inicial es de aproximadamente
96,8 %. Son tamaños de artefactos de producción, no tiempos de primera pintura medidos
en un navegador; volver a medir al cambiar dependencias.

Las hojas globales de KaTeX, Excalidraw y hojas de cálculo siguen incluidas en `styles.css`.
El control del bundle distingue ese CSS de los motores JavaScript; no afirma que todos los
assets de terceros se hayan vuelto diferidos.

## Verificación automática

```sh
npm test -- --watch=false
npm run test:startup
npm run build
npm run check:startup
```

`npm run build` crea `dist/frontend/browser-stats.json`. Su hook `postbuild` ejecuta
[check-startup-bundle.mjs](../scripts/check-startup-bundle.mjs), que recorre imports estáticos
de `src/main.ts` y falla si encuentra JavaScript de Univer, Excalidraw, PPTX, Monaco, Mermaid
o motores de exportación. Las hojas CSS globales no se confunden con motores JavaScript.

El presupuesto inicial de producción avisa a 750 kB y falla a 1 MB, en lugar de tolerar
decenas de MB. El reporte del build incluye JS y CSS iniciales; el verificador informa el
grafo estático de entrada. No confundir tamaño raw con tamaño transferido comprimido.

Las pruebas cubren carga de metadatos, apertura solo del documento seleccionado, respuestas
fuera de orden, limpieza de sesión, uso de almacenamiento local, árbol y teclado de separadores.
Se conservan las pruebas de imágenes del editor Word. Los tests de HTTP usan dobles.

## Medir en el navegador

1. Esperar a que `npm start` termine de compilar antes de medir una navegación.
2. En Network, desactivar caché y recargar `/login` sin sesión: no deben descargarse motores especializados.
3. Con sesión, verificar una petición de espacios, un listado resumido y el detalle seleccionado.
4. Abrir una hoja o presentación: su chunk debe aparecer en ese momento, no antes.
5. Capturar Performance en una máquina y conexión representativas si se requiere un tiempo de primera pintura.

Para comparar producción, servir `dist/frontend/browser` con compresión y fallback SPA. El
tiempo de compilación de Angular CLI, la transferencia de archivos y la ejecución del motor
en el navegador son mediciones distintas.
