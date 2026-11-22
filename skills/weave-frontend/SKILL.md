---
name: weave-frontend
description: Modificar y mejorar visualmente la interfaz Angular de Weave respetando su sistema de diseño, convenciones visuales, rendimiento y separación de responsabilidades con NestJS y FastAPI.
---

# Frontend de Weave

## 1. Dirección visual e identidad
Weave es un espacio de trabajo de bloques conectados (documentos, lienzos, hojas de cálculo, código e IA). Su interfaz debe sentirse **editorial, serena y precisa**:
- **El contenido es el protagonista**: la navegación, las barras de herramientas y los paneles laterales deben ser discretos y ligeros para no competir con el documento o el lienzo.
- **Limpieza estructural**: evitar cajas anidadas innecesarias, bordes dobles y ruido visual. Usar contraste de superficies y espaciado antes que líneas divisorias extra.
- **Consistencia en modo claro y oscuro**: todo componente nuevo o modificado debe verse cuidado tanto en tema claro (`:root`) como en tema oscuro (`body.dark` / `.app.dark`).

## 2. Sistema de tokens y colores
Usar siempre las variables CSS definidas en `src/styles.scss` en lugar de colores fijos:
- **Jerarquía de superficies**:
  - `--canvas`: fondo base de la aplicación.
  - `--panel`: barras laterales, cabeceras y paneles auxiliares.
  - `--bg`: superficies elevadas principales (hoja de documento, tarjetas, modales, popovers).
  - `--soft`: estados `hover`, fondos de controles secundarios, chips e inputs sutiles.
  - `--code`: bloques de código y vistas técnicas.
- **Bordes y separadores**: `--border` para divisiones sutiles; `--border-strong` para bordes interactivos, inputs en foco o contraste en modo oscuro.
- **Texto**: `--text` (primario), `--muted` (secundario/etiquetas), `--faint` (placeholders, metadatos, atajos).
- **Acento**: `--accent` y `--accent-soft` para acciones primarias, elementos activos y estados seleccionados. Reservar el color de acento para lo importante; no saturar la pantalla.
- **Modo oscuro**: reducir la dependencia de sombras oscuras y apoyarse en bordes sutiles (`--border`) y diferencia tonal entre `--canvas`, `--panel` y `--bg`.

## 3. Tipografía y jerarquía
Respetar las familias cargadas en el proyecto (`src/index.html` y `tailwind.config.js`):
- **UI y cuerpo (`DM Sans`)**: fuente por defecto para navegación, botones, formularios y lectura general.
- **Editorial / Display (`.font-display` — `Libre Caslon Display`)**: reservar para títulos principales de documentos, encabezados de bienvenida o estados vacíos destacados. No usarla en botones ni controles densos.
- **Código y datos (`.font-mono` — `JetBrains Mono`)**: usar en código, fórmulas, atajos, identificadores y cifras alineadas (`font-variant-numeric: tabular-nums`).
- **Jerarquía clara**:
  - Usar un máximo de 3 niveles visuales por vista (título, contenido/control, metadato).
  - Etiquetas de sección pequeñas (`11px–12px`, `font-weight: 600`, `color: var(--muted)`) con espaciado ligeramente abierto; títulos grandes con `letter-spacing` ligeramente negativo y `line-height` compacto (`1.15–1.25`).

## 4. Espaciado, proporciones y elevación
- **Escala de espaciado**: usar múltiplos de `4px` (`4, 8, 12, 16, 24, 32`). Mantener padding generoso en contenedores principales (`16px–24px`) y compacto pero respirable en listas y toolbars (`6px–10px`).
- **Radios de borde**:
  - `4px–6px`: botones pequeños, items de menú, badges, `kbd`.
  - `8px–10px`: inputs, tarjetas, menús desplegables, botones principales.
  - `12px–16px`: modales, diálogos y paneles flotantes.
- **Sombras**: en modo claro usar sombras suaves y difusas (ej. `0 1px 2px rgba(0,0,0,0.04)` para tarjetas y `0 10px 25px -5px rgba(0,0,0,0.12)` para popovers/modales). Evitar sombras duras.

## 5. Iconografía
- **Nunca usar emojis** como iconos, adornos, indicadores o etiquetas de la interfaz. Esta regla aplica solo a la UI desarrollada, sin alterar los emojis escritos por el usuario en su contenido.
- Usar SVG o iconos de Heroicons / `@lucide/angular`. Reutilizar el componente SVG de iconos existente cuando tenga el símbolo necesario; no agregar una librería completa para un solo icono.
- Mantener tamaños y trazos consistentes (`14px–16px` junto a texto, `18px–20px` en acciones principales, alineados ópticamente con el texto).

## 6. Interacción, estados y accesibilidad
- **Estados obligatorios**: todo elemento interactivo debe definir estilos claros para `hover`, `active`, `focus-visible` (anillo visible con `--accent`) y `disabled`.
- **Micro-interacciones**: transiciones breves y naturales (`120ms–180ms ease`) en `background-color`, `border-color`, `color`, `opacity` y `transform`. Respetar `@media (prefers-reduced-motion: reduce)`.
- **Estados vacíos y de carga**:
  - Diseñar *empty states* con título claro, una línea explicativa en `--muted` y una acción principal directa.
  - Preferir *skeletons* sutiles con `--soft` en lugar de spinners genéricos cuando se carguen listas o paneles.
- **CSS limpio**: evitar `!important` salvo para sobrescribir estilos inyectados por librerías externas (por ejemplo, Tippy o editores embebidos). Mantener cada hoja de estilos de componente ligera (respetando el presupuesto de `angular.json`).

## 7. Arquitectura, rendimiento y responsabilidades
- Mantener los motores de documentos y exportación en sus límites de carga diferida. Consultar la [guía de rendimiento](../../guia-desarrollador/07-RENDIMIENTO-Y-PRUEBAS.md) antes de cambiar imports del arranque.
- El historial persistente del chat pertenece a FastAPI. Angular conserva únicamente el estado de presentación; no guardar conversaciones en `localStorage` ni implementar almacenamiento de mensajes en NestJS.
- Consultar la [guía de IA](../../guia-desarrollador/06-IA-Y-EXPORTACION.md) al cambiar el chat y actualizar los contratos y pruebas de las capas afectadas.

## 8. Checklist rápido antes de cerrar un cambio visual
- [ ] Usa tokens CSS (`--bg`, `--panel`, `--text`, `--border`, `--accent`, etc.) sin colores hardcodeados innecesarios.
- [ ] Se ve bien y tiene buen contraste tanto en modo claro como en modo oscuro.
- [ ] No introduce emojis en la interfaz ni librerías de iconos redundantes.
- [ ] Tiene estados `hover`, `focus-visible` y `disabled` bien definidos.
- [ ] Respeta la carga diferida y el presupuesto de estilos de componente.
