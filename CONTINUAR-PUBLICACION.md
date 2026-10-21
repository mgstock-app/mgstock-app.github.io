# Continuar publicación de mgstock

Última actualización: 21/10/2026 (hora de Buenos Aires).

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

## Seguridad y datos personales
- Historial revisado: sin claves de servicio, tokens ni contraseñas. La única clave es la anon pública de `public/stock/config.js`.
- El historial privado contiene el seed original con correos y catálogo: por eso se publicó una copia sin historial. Los commits públicos usan el autor genérico "MGStock".
- Pruebas con correos `@example.com` y productos "Producto de prueba". `supabase/seed.sql` sin datos.
- La app ya no muestra el email de la administradora en las pantallas de "ingreso pendiente" y "sin local asignado".
- El email de la administradora sigue en el código (`CREADORA` en `auth.js` y `app.js`, y en las pruebas): la app lo usa como respaldo para reconocer a la administradora. No se ve en pantalla.
- Cambios en archivos con huella (`tests/source-hashes.json`): `APP_URL` en `app.js` (enlace para invitar desde Equipo) y los dos textos que mostraban el email. Huellas actualizadas después de revisar que solo cambiaron esas líneas.
- Supabase Advisor: 8 avisos WARN por funciones SECURITY DEFINER ejecutables por usuarios con sesión (solo devuelven datos de quien consulta) y "Leaked password protection" desactivado. No bloquean.

## Verificado el 21/10
- `npm test` 9/9; lint y build en GitHub Actions.
- Sin sesión: 401 en la tabla `docs` y en las funciones.
- Google: flujo correcto con el cliente MGStock; la administradora entró y ve Munro y Torcuato (33 productos cada uno), "En vivo".
- Simulación SQL con permisos reales y sin cambiar datos: gerente de Munro ve y edita solo Munro; usuario fuera del Equipo no ve nada.
- Vista móvil 375 px sin desplazamiento horizontal. La librería de Excel carga y genera .xlsx en memoria.
- No se modificaron datos reales de stock.

## Pendientes
1. Celulares físicos (iPhone Safari y Android Chrome): instalar, ingresar con Google, cerrar/reabrir, sin conexión y actualización de versión.
2. Probar con usuarios reales de gerente, lectura y dueño. Los roles gerente, editor y lectura solo ven los locales asignados en Equipo.
3. Recomendar ingreso con Google: los correos de confirmación por email salen por el servidor de Supabase, con límites bajos. Si hace falta, configurar SMTP propio.
4. Hacer una descarga real de Excel desde la app y abrirla.
5. Opcional, pago: la pantalla de Google muestra "Ir a vgsepaaewbctjsjcpeta.supabase.co". Para mostrar un nombre propio hace falta un dominio personalizado de Supabase (complemento pago).

No hay porcentaje verificable de cuota disponible. Continuar en bloques cortos.
