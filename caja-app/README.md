# GESTLOK Caja

Micro app para que **cualquier comercio controle su caja**: medios de pago, caja inicial, gastos,
ingresos, retiros, fotos antes del cierre y arqueo. **No factura ni es un sistema de ventas.**

- Va **bajo la marca y el dominio de GESTLOK** (decisión del 02/11/2026), con base y código propios (no comparte
  código con el resto de GESTLOK). Las empresas de GESTLOK la abren desde su inicio si la tienen habilitada
  (`gestlok_caja_app_acceso`; primera: Perfumes · Belisa Parfum).
- Base: esquema `caja_app` en el mismo proyecto de Supabase que GESTLOK, sin tocar nada de GESTLOK.
  Multiempresa desde el primer día (cada comercio ve solo lo suyo).
- App web: **`public/caja/`** → se publica en **https://gestlok.com.ar/caja/**.
  Una sola app para **teléfono y PC**: detecta desde dónde se abre (`<html data-medio="telefono|pc">`) y cambia
  el armado (teléfono: una columna, botones grandes abajo, hojas desde abajo; PC: menú lateral, dos columnas,
  diálogos y atajos C/G/I/R). La vista se puede fijar a mano por equipo.
- Diseño aprobado: lienzo «Caja · control de medios de pago» (15 pantallas).
- Plan por etapas y pendientes: [`docs/PLAN.md`](docs/PLAN.md).

## Carpetas
- `supabase/migrations/` — base de datos.
- `tests/` — pruebas de la base: `fixtures/logica.sql` (reglas y seguridad) y `db.test.mjs` (lo mismo + varios celulares a la vez).
- `tests/web/` — recorrido de la app con navegador en teléfono y PC: `servidor.py` imita la API de Supabase sobre
  un Postgres local con la migración real; `recorrido.py` (Playwright) hace alta, entrada con la cuenta (sin PIN), apertura, movimientos,
  corregir, anular, cierre en los dos modos, panel del dueño y configuración, y guarda capturas.

## Probar
```
CAJA_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test caja-app/tests/*.test.mjs
CAJA_PG="-h 127.0.0.1 -p 5432 -U postgres" sh caja-app/tests/web/reiniciar-base.sh
CAJA_PG="-h 127.0.0.1 -p 5432 -U postgres" python3 caja-app/tests/web/servidor.py 8765 &
python3 caja-app/tests/web/recorrido.py http://127.0.0.1:8765 capturas
```
En GitHub corre solo el flujo «Caja app · pruebas» (trabajos `base` y `web`).

## En Supabase
La migración se aplicó en partes (`caja_app_base_p1_tablas` … `p7_movimientos_y_cierre`), con el mismo contenido
que `20261102050000_caja_app_base.sql` (verificado con huellas md5 de columnas, funciones, restricciones,
índices, disparadores, políticas y permisos), salvo `caja_app_entrar` (PIN), que nunca se aplicó.

**Sin PIN (02/11, pedido de la usuaria: «No ponerle pin a Gestlok!!»):** migración
`20261102170000_caja_app_sin_pin.sql`, aplicada. Cada persona entra con su propia cuenta: `caja_app_entrar_cuenta(local)`
abre la sesión de caja sin elegir persona ni PIN (quien creó el comercio usa la persona dueña del alta; otra cuenta con
acceso recibe su propia persona). `caja_app_salir` solo vence la sesión (no borra). Si la sesión de 14 h vence, la app
vuelve a entrar sola y reintenta. El panel (Hoy, Historial, Configuración) lo ve la cuenta dueña. La app ya no muestra
teclado de PIN, «Cambiar de persona» ni «Personas y PIN». `caja_app_entrar` (PIN) queda solo en la migración base y en
las pruebas; `supabase/pendiente-entrar-salir.sql` ya no hace falta.
