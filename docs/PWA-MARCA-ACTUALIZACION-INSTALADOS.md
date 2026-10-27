# GestLok — actualización de nombre e ícono en instalaciones existentes

**Objetivo:** mantener el acceso y los datos del usuario; NO solicitar desinstalación/reinstalación para recibir actualizaciones.

## Causa diagnosticada

El manifiesto original usado por las instalaciones antiguas era `/manifest.webmanifest`, con `id: "./"`, `start_url: "./"` y `scope: "./"`. El cambio de marca a GestLok agregó posteriormente `?brand=gestlok-20261024` a la URL del **propio manifiesto**. Chrome recomienda expresamente NO cambiar la ubicación/URL del manifest, porque eso puede impedir que el navegador reconozca la actualización de una PWA instalada.

Ahora el enlace se restaura a **`/manifest.webmanifest`** (sin parámetros) y se conservan el mismo `id`, `start_url`, `scope` y dominio. Cambian únicamente las URLs *internas* de íconos de GestLok mediante `?rev=...`, para forzar a descargar los íconos actualizados sin reemplazar el manifiesto. Los íconos PNG, el ícono maskable y el logo vectorial siguen siendo GestLok. En iOS, la referencia de Apple Touch Icon también está versionada.

El Service Worker revisa actualizaciones de forma controlada al abrir la app o regresar a primer plano. No se fuerza recarga, no se purga localStorage, no se desconecta a usuarios ni se toca información del negocio.

## Expectativa real en dispositivos

- **Android con Chrome**: las PWA WebAPK pueden recibir actualizaciones de su manifest automáticamente o requerir aceptar un cambio visible de ícono/nombre. Si aparece `App Update Available` / `Actualización de aplicación disponible`, usar la revisión de Chrome para aceptarlo. Cerrar y volver a abrir la aplicación y mantener conexión ayuda a que Chrome procese la actualización. **No desinstalar.**
- **iPhone/iPad**: las apps de pantalla de inicio las controla iOS. Una vez creado el acceso, el título elegido y el ícono guardado pueden permanecer sin cambios aunque el sitio y el contenido dentro de la app se actualicen. **Ningún Service Worker ni script web puede forzar de manera garantizada el reemplazo de ese acceso ya instalado.** Evitar falsas promesas o pedirles a los usuarios actuales que lo borren.
- **Chrome de escritorio**: los cambios importantes de nombre o ícono pueden requerir revisión del usuario; dependen de la versión del navegador.
- **Usuarios activos**: la app y sus funciones siguen actualizándose normalmente. El nombre e ícono del lanzador son metadatos administrados por el navegador/OS, no equivalen a la versión del código de GestLok.

## Criterios de validación

- En el HTML publicado, `<link rel="manifest">` apunta a `/manifest.webmanifest`, mismo nombre de ubicación original.
- `/manifest.webmanifest` presenta `name` y `short_name` como **GestLok** y `id: "./"` sin cambios.
- Todos los íconos de la nueva marca devuelven HTTP 200.
- SW se actualiza cuando la app se abre y al reanudarse, sin forzar recarga.
- Lint, pruebas de código, compilación y Cypress en verde.
- Prueba manual en Android instalado previamente bajo nombre viejo y en iPhone; anotar diferencias por versión de OS. Cypress no puede afirmar por sí mismo que el ícono de la pantalla de inicio cambió.

Referencias:
- https://developer.chrome.com/blog/improvements-to-web-app-updates
- https://web.dev/articles/manifest-updates
