# Caja diaria — empresa de la cuenta solicitante (issue #200)

Estado: **implementado** (especificación original: PR #201). Publicación y verificación: ver «Despliegue».

## Empresa
- Se resolvió con la membresía autenticada de la cuenta solicitante (dueña, email verificado): empresa **Perfumes**, tenant `2a97bf8d-7d08-4aa7-b051-5d1a4dc80103`, local `loc-2a97bf8d7d084aa7b051` (Percam). El email no autoriza: la empresa queda habilitada en `gestlok_caja_private.empresas` y cada acción vuelve a comprobar membresía, rol y empresa en la base.
- Mi Gusto (Munro/Torcuato), Pagos Online, sus fotos de cierre y el resto de las empresas no cambian.

## Qué hace
- **Inicio de la dueña** (y de gerentes de esa empresa): tarjeta «Caja diaria · Pagos del día». Solo aparece si el servidor la habilita.
- **Abrir la caja de hoy** con el nombre del **responsable** (obligatorio). Una sola caja por empresa y fecha de Argentina; si dos equipos la abren a la vez, se crea una sola.
- **Registrar pago:** efectivo o transferencia, importe (formato argentino, hasta 2 decimales) y detalle opcional. Doble toque o reintento sin señal: no se duplica (clave de operación por envío).
- **Anular** una venta mientras la caja está abierta: deja de sumar y queda la constancia.
- Totales por medio, **total del día** y cantidad de ventas.
- **Cerrar día:** pide confirmar el responsable; doble clic o dos equipos = un solo cierre. Cerrada, **no se reabre**.
- **Cierre automático a las 23:59** (hora de Buenos Aires) desde el servidor con pg_cron, aunque nadie tenga la app abierta. También se cierra al consultar si el servidor estuvo caído. Una caja sin ventas se cierra en $ 0.
- **Historial:** fecha, responsable, efectivo, transferencia, total, ventas, tipo y hora de cierre, y «Ver ventas» del día.
- **Sin foto.** La pantalla no guarda importes en el equipo y necesita conexión para guardar.

## Base (migración `20261101190000_gestlok_caja_diaria_empresa.sql`)
- Esquema `gestlok_caja_private` sin permisos directos: `empresas`, `turnos` (UNIQUE empresa+día), `movimientos` (UNIQUE turno+operación) y `auditoria` (solo agrega).
- RLS por empresa en las cuatro tablas como segunda barrera.
- Triggers: un cierre no se modifica, las ventas no se borran (se anulan una vez), no hay TRUNCATE.
- RPC (solo con sesión): `gestlok_caja_acceso`, `gestlok_caja_estado`, `gestlok_caja_abrir`, `gestlok_caja_responsable`, `gestlok_caja_registrar`, `gestlok_caja_anular`, `gestlok_caja_cerrar`, `gestlok_caja_detalle`.
- pg_cron `gestlok-caja-diaria-cierre-2359-ar` (`59 * * * *`): cierra los turnos cuyo límite (23:59 de su día) ya pasó; el cierre real ocurre a las 23:59 y el resto de las ejecuciones son respaldo. Idempotente.
- Reversión sin borrar datos: `supabase/operaciones/caja-diaria-desactivar-o-retirar.sql`.

## Pruebas
- `tests/fixtures/caja-diaria/logica.sql` (11 bloques) en PGlite (`npm test`) y en PostgreSQL 16.
- `tests/db/caja-diaria-postgres.test.mjs`: concurrencia con sesiones simultáneas (apertura, doble envío, ventas en paralelo, ventas + cierres, cron + cierre manual). Flujo «Caja diaria · PostgreSQL».
- `supabase/tests/caja-diaria-empresa.sql`: base real con cuentas reales, todo se deshace (informe OK/FALLA).
- `qa/cypress/e2e/caja-diaria-empresa.cy.js`: flujo completo en celular y PC, cierre automático y cambio de día, corte de red, y Mi Gusto sin acceso.

## Criterios de aceptación
- [x] Efectivo y transferencia se registran y suman correctamente.
- [x] Responsable obligatorio.
- [x] Un solo turno por día, incluso con dos dispositivos.
- [x] Cierre manual idempotente.
- [x] Cierre automático real a las 23:59 hora argentina, aun sin sesión abierta.
- [x] Sin foto para esta empresa.
- [x] Historial y totales diarios correctos.
- [x] Ningún cambio visible ni funcional en Mi Gusto.
- [x] Pruebas de RLS negativas y Cypress exitosas.
- [ ] Migración aplicada y despliegue verificado (se completa al publicar).
