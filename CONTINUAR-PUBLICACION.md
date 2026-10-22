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
- 21/10, 16:40: hoja Stock (renombrada «Stock Sugerido» desde la app) con dos columnas a la derecha: «Local» (lo que carga el gerente con − y +) y «Sugerido» (lo carga la dueña o la administradora; el resto lo ve). Muestra si faltan, sobran o está justo. Campo `sugerido` en `<local>/productos`; la base lo protege con el trigger `docs_proteger_sugerido` (migración `proteger_stock_sugerido`): si otro rol intenta cambiarlo, se conserva el valor anterior. Gerentes siguen pudiendo agregar, editar y borrar productos. Pruebas: 11/11 y 3 suites de navegador en verde; simulación SQL: dueña y administradora guardan el sugerido, gerente no.
- 21/10, 17:10: estados por sugerido en la hoja Stock, visibles para todos y en ambos locales: «Sin stock» (rojo, local en 0 o tildado), «Poco stock» (amarillo, hasta el umbral `poco`; si está vacío es la mitad del sugerido), «Stock ideal» (verde, entre el umbral y el sugerido) y «Exceso de stock» (naranja, más que el sugerido). Sin sugerido se mantiene el estado de siempre. Filtros de la hoja: Todos, Sin stock, Poco stock, Stock ideal, Exceso y Sin contar. El umbral `poco` lo cambian solo dueña y administradora (trigger `proteger_sugerido`, migración `proteger_sugerido_y_poco`). Nueva prueba de navegador `tests/test_sugerido.py`.
- 21/10, 17:30: botón «Estados» por producto (solo dueña y administradora, en Munro y Torcuato): fija stock sugerido, «poco stock hasta» y «exceso desde más de» (campo nuevo `exceso`; vacío = sugerido), con vista previa. Todos ven el estado y, al pasar el mouse sobre él, los rangos. El trigger protege `sugerido`, `poco` y `exceso` (migración `proteger_sugerido_poco_exceso`). Ambas hojas Stock se llaman «Stock Sugerido» (renombradas por la usuaria).
- 21/10, 17:25: «Stock Cajas» pasa a ser una hoja propia (tipo Lista de stock) en Munro (`h-s5t5njmbw7`) y Torcuato (`h-owgl0bi32j`), con sus propios productos y categorías: antes era la hoja fija Pedido renombrada y compartía los productos de Stock Sugerido. Pedido queda quitada del menú con su nombre original (se puede volver a mostrar desde Hojas → Editar). Interruptor «Stock sugerido» por hoja, solo para dueña y administradora (campo `sugerido` en el documento de la hoja; Stock Sugerido lo trae activado, las hojas nuevas desactivado): apagado, la hoja muestra solo Local y los estados de siempre; prendido, columna Sugerido, botón Estados y estados por color para todo el equipo. El trigger `proteger_sugerido` ahora también cubre `<local>/hojas` (migración `proteger_sugerido_hojas`, verificada con gerente y dueña y deshecha). Ajustes aclara que una categoría nueva se escribe en el campo Categoría y no arrastra la categoría de otra hoja. Nueva prueba `tests/test_cajas.py`.
- 21/10, 17:50: en Stock Sugerido, Stock Cajas y Conteo Fábrica (y cualquier hoja nueva de lista o de fábrica), en ambos locales: «+ Observación» debajo de cada producto para que el gerente le deje un mensaje a la dueña (campos `nota`, `notaPor`, `notaFecha` en el producto o fila; Enter guarda, Escape cancela, vacío la borra; Solo ver la lee pero no escribe). Botón «Borrar datos» por hoja (gerente, dueña y administradora; con confirmación): borra cantidades (`stock` o `local`/`fabrica`), Sin stock y observaciones de esa hoja y descarta lo cargado sin guardar. No toca productos, categorías, mínimo, observación fija del producto, sugerido, poco ni exceso; el Historial queda intacto. Sin cambios en la base (los gerentes ya podían editar esos campos). Nueva prueba `tests/test_notas.py`.
- 21/10, 20:55: revisión general. Inicio ya no lleva a hojas quitadas del menú: sin Pedido no muestra «A pedir», y sin Conteo el botón pasa a «Cargar stock» (va a Stock). Política `docs_leer` optimizada con `(select auth.jwt())` (migración `docs_leer_jwt_una_vez`); se comparó lo que ve cada usuario real antes y después y es idéntico. Asesor de rendimiento de Supabase sin avisos. Avisos de seguridad que quedan: las funciones auxiliares de permisos se pueden llamar con sesión (es intencional: las usan las reglas y solo devuelven el acceso propio) y la protección contra contraseñas filtradas, que en Supabase requiere el plan Pro.
- 21/10, 22:50: cuartos de unidad, pedido por los gerentes de ambos locales. En la hoja Stock (Stock Sugerido) hay botones ¼ ½ ¾ debajo de − y +: eligen la fracción de la cantidad (tocar la misma otra vez la saca; − y + cambian de a 1 y mantienen la fracción). Las hojas de lista como Stock Cajas siguen sin esos botones. En Conteo Fábrica (y hojas de fábrica nuevas) las casillas Local y Fábrica aceptan 0,25 · 0,5 · 0,75 y también 1/4, 3/4, 2 3/4, ¾. Conteo (oculta, mismos productos que Stock) acepta cuartos para no redondear. Sugerido, mínimo y estados siguen en enteros o medios. Nueva prueba `tests/test_cuartos.py`.
- 21/10, 23:00: Conteo Fábrica también tiene ¼ ½ ¾ debajo de la casilla Local (pedido de los gerentes): eligen la fracción, tocar la misma otra vez la saca, y suman al Total. La columna Fábrica no tiene botones. En el celular la columna Local pasa a 84 px. No se imprimen.
- 21/10, 23:15: Conteo Fábrica permite agregar, modificar y eliminar productos desde la misma planilla (ambos locales; gerente, dueña y administradora): botón «Agregar producto» arriba y al final de la planilla (cuadro que queda listo para cargar varios seguidos), y tocar el nombre abre «Modificar producto» (nombre, bloque, resaltar en amarillo) con «Eliminar» y confirmación. Solo ver no puede. Corregido el orden al agregar o cambiar de bloque: el producto queda al final de su bloque sin mezclarse con el siguiente (`fOrdenFin`; antes el +0,5 podía chocar con el bloque siguiente). Ajustes sigue funcionando igual. Nueva prueba `tests/test_fab_productos.py`.
- Video tutorial para gerentes (local Torcuato, 50 s, vertical): grabado sobre una copia local con datos de ejemplo; no se guarda en el repositorio.

## Pendientes
1. Celulares físicos (iPhone Safari y Android Chrome): instalar, ingresar con Google, cerrar/reabrir, sin conexión y actualización de versión.
2. Revisar los emails cargados en Equipo: una dirección Gmail con guion bajo (`_`) no puede existir en Gmail, y esa persona no va a poder entrar hasta corregirla.
3. Recomendar ingreso con Google: los correos de confirmación por email salen por el servidor de Supabase, con límites bajos. Si hace falta, configurar SMTP propio.
4. Opcional, pago: la pantalla de Google muestra "Ir a vgsepaaewbctjsjcpeta.supabase.co". Para mostrar un nombre propio hace falta un dominio personalizado de Supabase (complemento pago).
5. Quitar de Equipo el acceso viejo de Gisela con Gmail (`giselaopenheimer@gmail.com`, Editor sin locales); ella entra con Hotmail como dueña. Se puede hacer desde Equipo en la app.
6. Actualizar el video tutorial: no muestra Stock Sugerido, Estados, Stock Cajas, Observaciones ni Borrar datos.
7. Conteo Fábrica tiene «Poner todo en 0» y «Borrar datos»; preguntar si se quita el primero.
8. Al pasar a Supabase Pro: activar la protección contra contraseñas filtradas.

9. Ingreso de mercadería (pedido 22/10): propuesta técnica en `docs/PROPUESTA-INGRESO-MERCADERIA.md`, rama `ingreso-mercaderia`. Esperando decisiones y autorización; no implementar ni publicar antes.

## Ideas para más adelante (no empezar sin pedido de la usuaria)
- Multi-empresa: un solo link y cada empresa aislada por la base (nombre y logo, locales, equipo, hojas y productos propios), alta manual por la administradora y Mi Gusto como primera empresa. Hacerlo en una rama aparte con pruebas de aislamiento entre empresas. Antes: Supabase Pro (copias diarias), quitar la marca Mi Gusto para otros rubros y definir condiciones de uso.
- Panel de la administradora: altas de empresas, fecha de ingreso y vencimiento mensual del abono de cada una.
- Precio orientativo charlado: US$15 por local por mes cobrado en pesos (costos fijos aprox. US$45/mes: Supabase Pro US$25 + Claude Pro US$20).

No hay porcentaje verificable de cuota disponible. Continuar en bloques cortos.
