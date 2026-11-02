# Caja app (nombre comercial pendiente)

Micro app para que **cualquier comercio controle su caja**: medios de pago, caja inicial, gastos,
ingresos, retiros, fotos antes del cierre y arqueo. **No factura ni es un sistema de ventas.**

- Es una app **propia, separada de GESTLOK** (plan B del 02/11/2026). Vive en esta carpeta solo hasta tener
  repositorio y dominio propios: no comparte código con GESTLOK.
- Base: esquema `caja_app` en el mismo proyecto de Supabase que GESTLOK, sin tocar nada de GESTLOK.
  Multiempresa desde el primer día (cada comercio ve solo lo suyo).
- Diseño aprobado: lienzo «Caja · control de medios de pago» (15 pantallas).
- Plan por etapas y pendientes: [`docs/PLAN.md`](docs/PLAN.md).

## Carpetas
- `supabase/migrations/` — base de datos.
- `tests/` — pruebas: `fixtures/logica.sql` (reglas y seguridad) y `db.test.mjs` (lo mismo + varios celulares a la vez).

## Probar
```
CAJA_PG_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node --test caja-app/tests/*.test.mjs
```
En GitHub corre solo el flujo «Caja app · pruebas».
