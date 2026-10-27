-- GestLok · convertir el módulo en organización ADMINISTRATIVA privada.
-- No se modifica public.docs, sus usuarios, stock, historial ni datos de Mi Gusto.
-- Tienda pública, carrito y ventas a clientes quedan deshabilitados.
drop policy if exists gestlok_tiendas_read_public on public.gestlok_tiendas;
drop policy if exists gestlok_productos_read_public on public.gestlok_productos_tienda;
revoke all on public.gestlok_tiendas, public.gestlok_productos_tienda from anon;
-- RLS de lectura y edición autenticada por tenant/local existente se conserva.
alter table public.gestlok_tiendas add constraint gestlok_tiendas_no_publicas check (visible is false) not valid;
alter table public.gestlok_productos_tienda add constraint gestlok_productos_no_publicos check (publicado is false) not valid;
alter table public.gestlok_tiendas validate constraint gestlok_tiendas_no_publicas;
alter table public.gestlok_productos_tienda validate constraint gestlok_productos_no_publicos;

alter table public.gestlok_productos_tienda
  add column if not exists minimo integer not null default 0 check(minimo between 0 and 100000000),
  add column if not exists costo numeric(12,2) check(costo is null or (costo >= 0 and costo <= 9999999999)),
  add column if not exists proveedor text not null default '' check(length(proveedor) <= 120),
  add column if not exists ubicacion text not null default '' check(length(ubicacion) <= 120),
  add column if not exists unidad text not null default 'unidad' check(length(unidad) between 1 and 30),
  add column if not exists activo boolean not null default true;

comment on table public.gestlok_tiendas is 'Espacios de organización administrativa privada por empresa y sucursal; NO tiendas públicas.';
comment on table public.gestlok_productos_tienda is 'Catálogo interno de control por local, separado del stock preexistente; NO disponible a visitantes.';
