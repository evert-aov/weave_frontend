# 01 — Sesión y servicios centrales

[Volver al índice](README.md)

## Autenticación

[AuthService](../src/app/core/services/auth.service.ts) mantiene `currentUser`, `token` e
`isAuthenticated`. Lee `weave_token` del almacenamiento local y, si existe, solicita
`GET /api/auth/me`. Login y registro reciben `{ accessToken, user }`, limpian el estado de
notas/espacios y navegan al workspace. Un fallo al consultar el perfil cierra la sesión.

[auth.guard.ts](../src/app/core/guards/auth.guard.ts) devuelve un árbol de redirección a
`/login` cuando falta el token. `canMatch` permite resolver esa decisión antes de descargar
el workspace. No sustituye el control de identidad del servidor.

[authInterceptor](../src/app/core/interceptors/auth.interceptor.ts) añade `Authorization:
Bearer ...` a las solicitudes de HttpClient mientras exista el token. Su implementación
actual no filtra por dominio; considerar ese comportamiento antes de usar HttpClient contra
un nuevo servicio externo. Las bibliotecas que usan `fetch` directamente no pasan por él.

## Servicios

| Servicio | Responsabilidad |
| --- | --- |
| `NotesService` | Lista resumida, documento activo, pestañas, zoom, modo lectura y autoguardado. |
| `SpacesService` | Lista de directorios y operaciones HTTP de su jerarquía. |
| `AuthService` | Sesión y perfil. |
| `ThemeService` | Tema y clase `body.dark`. |
| `I18nService` | Diccionarios `es`/`en`, traducción y preferencia de idioma. |
| `WorkspaceLayoutService` | Anchos de navegación y asistente guardados localmente. |
| `EditorStylesService` | Hojas CSS de herramientas cargadas bajo demanda. |
| `AiService` | Chat, selección de contexto y estado del panel IA. |

La inyección de un servicio puede activar su constructor. Mantener los constructores ligeros
y evitar inicializar motores de documentos o solicitudes de proveedores cloud en esta capa.

## Preferencias y textos

El tema usa `weave_theme`, el idioma `weave_lang`, y los tamaños de panel sus propias claves.
El estado documental real vive en el backend; estas preferencias no son una copia de seguridad.
`I18nService` puede arrancar y cambiar de idioma aunque el almacenamiento local no esté disponible.

Los textos nuevos deben añadirse a ambos diccionarios en
[i18n.service.ts](../src/app/core/services/i18n.service.ts). Los editores de terceros pueden
necesitar traducciones propias: PPTX usa además `TranslateService` y Univer sus locales.
