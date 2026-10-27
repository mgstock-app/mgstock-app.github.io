# Reseñas · Mi Gusto (Munro y Torcuato)

Base: propuesta de Codex en `codex/munro-resenas` (PR #94, solo Munro, nunca aplicada). Claude la amplió a las dos sucursales de Mi Gusto con información independiente, como pidió la usuaria el 27/10/2026.

## Comportamiento

- Administración de local → Reseñas, en Munro y en Torcuato. Cada sucursal ve solo sus cupones, contadores e historial.
- Nombre y teléfono argentino normalizado (10 dígitos, sin 0 ni 15; acepta +54, +54 9 y 0054). Las variantes del mismo número no permiten repetir el beneficio en la misma sucursal y mes.
- Código aleatorio de 6 caracteres de un alfabeto de 32 símbolos sin O, 0, I ni 1, generado exclusivamente en PostgreSQL. Único para siempre (índice único, reintento de colisiones); no se recicla.
- Beneficio fijo 10% OFF, un cupón por teléfono, mes y sucursal. El cupón solo se puede usar en la sucursal que lo emitió.
- Emisión y uso del 1 al 12 inclusive (America/Argentina/Buenos_Aires). Desde las 00:00 del 13 todo pendiente del mes queda «Cupón Vencido». El estado se calcula en el servidor al consultar; no depende de cron ni del reloj del teléfono.
- Estados automáticos: Pendiente, Usado y Cupón Vencido.
- Marcar utilizado exige confirmar con la tilde, es irreversible, atómico (dos usos simultáneos: uno solo gana) y queda auditado; un índice único impide registrar dos usos del mismo cupón.
- Buscador por nombre, teléfono o cupón; contadores Total, Pendientes, Usados y Vencidos; historial completo de la sucursal.
- El descuento es independiente de publicar, calificar o demostrar una reseña en Google.

## Permisos

- Dueños de Mi Gusto (Gisela, Martín y Federico) y la creadora: ambas sucursales.
- Gerentes: solo la sucursal que tienen autorizada para editar (registran clientes y marcan cupones usados).
- Solo lectura, otras empresas y otros locales: sin acceso (ni pantalla ni RPC).

Datos y eventos en el esquema privado `gestlok_resenas_private` con RLS y sin acceso directo para anon/authenticated. Tres RPC públicas (`gestlok_resenas_list/create/redeem`, todas con `p_local`) comprueban sesión, empresa, sucursal y rol en el servidor.

## Sin conexión

- Se puede consultar y buscar la última lista descargada de la sucursal (copia por cuenta en el equipo, como el resto de GESTLOK).
- Emitir y marcar usado necesitan conexión y no se ponen en cola: así el servidor garantiza que no haya cupones duplicados ni doble uso.

## Pruebas

- `tests/mi-gusto-resenas.test.mjs`: permisos de pantalla y, con PostgreSQL real aislado (PGlite), sucursales independientes, cupón exclusivo de su sucursal, 62 códigos únicos con el formato, teléfonos equivalentes, doble uso simultáneo, día 12/13, cambio de mes, roles sin acceso y anon.
- `qa/cypress/e2e/mi-gusto-resenas.cy.js`: alta, duplicado, búsqueda, uso único, vencimiento, separación Munro/Torcuato, gerentes, lectura, otra empresa y celular.
- `node tests/preview-resenas.mjs`: vista local ficticia de Codex para QA visual.

## Reversión

Para retirar la interfaz, revertir el PR. No borrar tablas ni códigos emitidos: conservar historial.
