# Caja app · plan de construcción

Decisión de la usuaria (02/11/2026): **plan B** — app propia, base compartida con GESTLOK en un esquema separado.
Nombre y dominio: pendientes (los elige la usuaria). Hasta entonces el código vive en `caja-app/` y la dirección
provisoria será `https://gestlok.com.ar/caja/` (ya habilitada en Supabase Auth: `https://gestlok.com.ar/**`).

## Reglas de la caja (las hace cumplir la base, no la pantalla)
- Una caja por **local y día** (hora de Argentina). Si dos celulares la abren a la vez, se crea una sola.
- **Caja inicial**: la sugiere la base con lo que quedó al último cierre del local (o la habitual). Si el empleado
  no la confirma, queda registrada la diferencia.
- **Movimientos**: cobro (por medio de pago), gasto (con categoría y de dónde sale la plata), ingreso y **retiro**
  (no es gasto). Cada envío lleva una clave: si se repite, no se duplica.
- **Corregir/anular** con motivo: nada se borra; queda tachado con quién, cuándo y por qué.
- **PIN** por persona en celulares compartidos (5 intentos fallidos → 10 minutos bloqueado). Cada movimiento queda
  a nombre de quien lo cargó. Los cajeros pueden tener tope de gasto.
- **Dos formas de cargar ventas**: cobro por cobro, o **totales al cierre** (venta del sistema + otros medios), como la
  planilla de la usuaria. Saldo teórico = caja inicial + ventas en efectivo + ingresos − gastos − retiros (todo en efectivo).
  Diferencia = arqueo − saldo (positivo sobrante, negativo faltante).
- **Fotos** pedidas por el comercio; las obligatorias bloquean el cierre si así se configura.
- **Cierre**: arqueo, retiro (a dónde va) y lo que queda para mañana. Definitivo, idempotente.
- **Cierre automático** a la hora configurada (pg_cron cada 15 min). El dueño puede cargar después el arqueo
  («tardío»), una sola vez.

## Etapas
1. **Base de datos** — HECHO (02/11). Migración `20261102050000_caja_app_base.sql`; pruebas de reglas, seguridad,
   aislamiento entre comercios, RLS y concurrencia.
   Aplicada en Supabase el 02/11 en 7 partes (mismo contenido, verificado con huellas). **Faltan
   `caja_app_entrar` y `caja_app_salir`**: `supabase/pendiente-entrar-salir.sql`, lo aprueba la dueña (la
   confirmación de Supabase se cancela sola en su app). Sin esas dos no se puede entrar con PIN.
2. **App para teléfono y PC** — HECHO (02/11). `public/caja/` (HTML + CSS + JS sin compilación, cliente de
   Supabase de `/vendor/`, sesión propia `storageKey: caja-app-auth`). Detecta si se abre en teléfono o en PC y
   cambia el armado; la vista se puede fijar a mano por equipo. Acceso con la cuenta (email/contraseña, Google,
   crear cuenta, recuperar), alta del comercio, elegir local del equipo, PIN, abrir (sugerida / otro monto),
   cobro/gasto/ingreso/retiro, corregir, anular, cierre en 4 pasos (cobro por cobro o totales al cierre),
   caja cerrada. Recorrido con navegador en CI (trabajo `web`).
3. **Fotos** — PENDIENTE. Bucket privado de Storage `caja-app-fotos` con políticas por comercio
   (`<comercio>/<caja>/<archivo>`). Hoy no hay buckets ni políticas en el proyecto: probar primero que la
   migración pueda crear políticas sobre `storage.objects`.
4. **Panel del dueño** — HECHO lo básico (02/11): Hoy en todos los locales, cierres automáticos sin arqueo
   (arqueo tardío), Historial con descarga para Excel (CSV con `;`), Configuración (comercio, forma de carga, hora,
   caja inicial habitual, medios, categorías, locales, personas con PIN y tope, este equipo). Falta: fotos y avisos.
   **Seguridad a mejorar:** el panel se abre en la app con el PIN de un dueño, pero el servidor lo autoriza por la
   cuenta con la que está abierto el equipo. Si el equipo del local queda con la cuenta del dueño, alguien con
   conocimientos técnicos podría llamar al panel sin PIN. Solución prevista: cuentas de encargado para los equipos
   del local (etapa 6) o exigir el token de un PIN de dueño en las funciones del panel (migración nueva).
5. **Sin conexión** — PENDIENTE. Cola en el celular (IndexedDB) que reenvía con la misma clave al volver la señal.
6. **Alta de comercios y venta** — PENDIENTE (decisión de la usuaria): alta abierta o con aprobación, prueba gratis,
   precio, avisos por WhatsApp/email, cuentas de encargado (invitaciones).
7. **Mudanza** — cuando haya nombre: repositorio propio (agregarlo a la app de Claude en GitHub), dominio, y
   publicar desde ahí.

## Segunda etapa del producto (después de vender)
Conteo por billetes, pago dividido, vuelto por transferencia, devoluciones, entrega de caja entre turnos,
reportes por mes/responsable/proveedor, dólares, varias cajas por día (turnos o cajeros).
