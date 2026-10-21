# Continuar publicación de mgstock

Última actualización: 21/10/2026, 12:15 (hora de Buenos Aires).

## Estado
- URL: https://mgstock-app.github.io/
- Repositorio público (copia limpia, sin historial): https://github.com/mgstock-app/mgstock-app.github.io
- Respaldo privado con todo el historial: repositorio `mgstock-respaldo` en la cuenta personal de la administradora (no se borró nada y sigue privado).
- GitHub Pages: fuente "GitHub Actions". El workflow "Publish mgstock" corre npm ci, lint, test, build y deploy, solo en `mgstock-app/mgstock-app.github.io`.
- Supabase Stock: `vgsepaaewbctjsjcpeta` ("stockfabmunro"). ReciboNet y los proyectos "Reporte Mensual" no se tocaron.
- Primera dirección (21/10 a la mañana): una URL de GitHub Pages con el usuario personal. Se reemplazó por `mgstock-app.github.io` para no mostrar datos personales.

## Configuración
- Supabase Stock > Auth > URL Configuration: Site URL `https://mgstock-app.github.io/`. Redirect URLs: `https://mgstock-app.github.io/` y `https://mgstock-app.github.io/**`.
- Supabase Stock > Providers: Email con "Confirm email" activado (nadie puede registrarse con un correo del Equipo sin acceso a esa casilla). Google activado.
- Google Cloud: proyecto `mgstock` (ID `mgstock-512313`), separado de `reporte-mensual` (no se modificó). Pantalla de consentimiento "MGStock", usuarios externos, en producción, solo permisos básicos (email y perfil). Página principal y política de privacidad apuntan a `mgstock-app.github.io`.
- Cliente OAuth web "MGStock web": origen `https://mgstock-app.github.io`, URI de redirección `https://vgsepaaewbctjsjcpeta.supabase.co/auth/v1/callback`. El secreto está cargado solo en Supabase; no está en ningún archivo.
- `public/privacidad.html`: política de privacidad requerida por Google.
- Equipo por local (21/10, migración `equipo_visible_por_local`): la administradora y el dueño ven a todo el Equipo; gerentes y "solo ver" ven solo a la administradora, al dueño, a sí mismos y a quienes comparten alguno de sus locales. Lo aplica la base (política `docs_leer` y función `comparte_local`), no solo la pantalla. Verificado con simulación SQL: gerente de Torcuato ve administradora, dueña y a sí mismo; gerente de Munro ídem con Munro.
- Equipo al 21/10: administradora, dueña (entra con email y contraseña: su usuario se creó desde Supabase con "Auto confirm user", sin correo), un gerente de Torcuato y gerentes de Munro (cargados por la administradora desde la app). Queda una cuenta de la dueña con rol Editor sin locales que la usuaria pidió quitar: el borrado por SQL no se ejecutó; se quita desde Equipo en la app.
- Instalada la app de Claude en la organización `mgstock-app`, solo para el repositorio `mgstock-app.github.io` (para poder guardar cambios en `main`).

## Seguridad y datos personales
- Historial revisado: sin claves de servicio, tokens ni contraseñas. La única clave es la anon pública de `public/stock/config.js`.
- El historial privado contiene el seed original con correos y catálogo: por eso se publicó una copia sin historial. Los commits públicos usan el autor genérico "MGStock".
- Pruebas con correos `@example.com` y productos "Producto de prueba". `supabase/seed.sql` sin datos.
- La app ya no muestra el email de la administradora en las pantallas de "ingreso pendiente" y "sin local asignado".
- El email de la administradora sigue en el código (`CREADORA` en `auth.js` y `app.js`, y en las pruebas): la app lo usa como respaldo para reconocer a la administradora. No se ve en pantalla.
- Cambios en archivos con huella (`tests/source-hashes.json`): `APP_URL` en `app.js` (enlace para invitar desde Equipo) y los dos textos que mostraban el email. Huellas actualizadas después de revisar que solo cambiaron esas líneas.
- Supabase Advisor: 8 avisos WARN por funciones SECURITY DEFINER ejecutables por usuarios con sesión (solo devuelven datos de quien consulta) y "Leaked password protection" desactivado. No bloquean.

## Testing final (21/10, 12:15)
- Pruebas automáticas: `npm test` 10/10 local y en GitHub Actions; lint, build y deploy en verde para el último commit.
- Permisos reales por rol (simulación SQL con reversión automática, sin cambiar datos):
  - Administradora: ve y edita Munro y Torcuato, guarda conteos, ve y agrega Equipo.
  - Dueña: ve y edita los dos locales, guarda conteos, ve todo el Equipo, no puede agregar personas.
  - Gerente de Munro: ve y edita solo Munro; ve en Equipo a la administradora, la dueña y el personal de Munro.
  - Gerente de Torcuato: ve y edita solo Torcuato; ve en Equipo a la administradora, la dueña y a sí mismo.
  - Solo ver (rol temporal de prueba, revertido): ve Munro, no edita ni guarda conteos.
  - Miembro sin local: no ve ningún local. Fuera del Equipo: no ve nada.
- Visitante sin sesión: 401 en la tabla y en las funciones (`mi_acceso`, `comparte_local`, `doc_update`) y al intentar agregarse al Equipo.
- Web publicada: todos los archivos 200, sin errores en consola, service worker activo con ámbito `/` y caché propia `mgstock:/:…`, enlace de invitación en Equipo = `https://mgstock-app.github.io/`, sin email personal en pantalla.
- Recorrido con sesión de administradora (solo mirando): Locales, Inicio, Stock (33 productos), Conteo, Conteo Fábrica, Pedido e Historial abren sin errores; barra "Sin cambios".
- Celular (vista 375 px): ingreso, Stock y privacidad sin desplazamiento horizontal.
- Google: vuelve a `https://mgstock-app.github.io/` con el cliente MGStock.
- No se modificaron datos reales.

## Cambios posteriores
- 21/10, 12:50: se quitaron los botones de descarga en Excel de Stock, Conteo Fábrica, Pedido e Historial (pedido de la usuaria). Queda «Copia de seguridad» en Inicio. Pruebas de navegador (Playwright, 3 suites) en verde.
- Video tutorial para gerentes (local Torcuato, 50 s, vertical): grabado sobre una copia local con datos de ejemplo; no se guarda en el repositorio.

## Pendientes
1. Celulares físicos (iPhone Safari y Android Chrome): instalar, ingresar con Google, cerrar/reabrir, sin conexión y actualización de versión.
2. Revisar los emails cargados en Equipo: una dirección Gmail con guion bajo (`_`) no puede existir en Gmail, y esa persona no va a poder entrar hasta corregirla.
3. Recomendar ingreso con Google: los correos de confirmación por email salen por el servidor de Supabase, con límites bajos. Si hace falta, configurar SMTP propio.
4. Opcional, pago: la pantalla de Google muestra "Ir a vgsepaaewbctjsjcpeta.supabase.co". Para mostrar un nombre propio hace falta un dominio personalizado de Supabase (complemento pago).

No hay porcentaje verificable de cuota disponible. Continuar en bloques cortos.
