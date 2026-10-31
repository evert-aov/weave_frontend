---
name: weave-frontend
description: Modificar la interfaz Angular de Weave respetando sus convenciones visuales y la separación de responsabilidades con NestJS y FastAPI.
---

# Frontend de Weave

- Nunca usar emojis como iconos, adornos, indicadores o etiquetas de la interfaz. Usar SVG o iconos de Heroicons. Reutilizar el componente SVG de iconos existente cuando tenga el símbolo necesario; no agregar una librería completa para un solo icono.
- Esta regla se aplica a la interfaz que se desarrolla, sin alterar los emojis que formen parte del contenido escrito por el usuario.
- Mantener los motores de documentos y exportación en sus límites de carga diferida. Consultar la [guía de rendimiento](../../guia-desarrollador/07-RENDIMIENTO-Y-PRUEBAS.md) antes de cambiar imports del arranque.
- El historial persistente del chat pertenece a FastAPI. Angular conserva únicamente el estado de presentación; no guardar conversaciones en localStorage ni implementar almacenamiento de mensajes en NestJS.
- Consultar la [guía de IA](../../guia-desarrollador/06-IA-Y-EXPORTACION.md) al cambiar el chat y actualizar los contratos y pruebas de las capas afectadas.
