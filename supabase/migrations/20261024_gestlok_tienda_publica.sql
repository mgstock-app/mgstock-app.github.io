-- GestLok: vidriera pública optativa con aislamiento estricto por empresa.
-- No modifica public.docs ni los registros de Mi Gusto.
create or replace function public.gestlok_modo_tienda_publico(p_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.docs d
    where d.tenant_id = p_tenant
      and d.col = 'configuracion_negocio'
      and d.id = 'empresa-' || p_tenant::text
      and d.data ->> 'tipo' in ('online', 'mixta')
  )
$$;
revoke all on function public.gestlok_modo_tienda_publico(uuid) from public;
grant execute on function public.gestlok_modo_tienda_publico(uuid) to anon, authenticated;

create table if not exists public.gestlok_tiendas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default gestlok_tenancy.current_tenant_id(),
 local_id text not null,
 slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,55}$'),
 nombre text not null check (length(trim(nombre)) between 2 and 100),
 descripcion text not null default '' check (length(descripcion) <= 800),
 whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^[1-9][0-9]{7,14}$'),
 direccion text not null default '' check (length(direccion) <= 240),
 permite_retiro boolean not null default true,
 permite_envio boolean not null default false,
 visible boolean not null default false,
 moneda text not null default 'ARS' check (moneda = 'ARS'),
 actualizado timestamptz not null default now(),
 unique(tenant_id, local_id),
 unique(id, tenant_id)
);
create table if not exists public.gestlok_productos_tienda (
 id uuid primary key default gen_random_uuid(),
 tienda_id uuid not null,
 tenant_id uuid not null default gestlok_tenancy.current_tenant_id(),
 nombre text not null check (length(trim(nombre)) between 2 and 140),
 categoria text not null default 'General' check (length(categoria) between 1 and 80),
 descripcion text not null default '' check (length(descripcion) <= 1000),
 sku text not null default '' check (length(sku) <= 80),
 precio numeric(12,2) not null check (precio >= 0 and precio <= 9999999999),
 precio_anterior numeric(12,2) check (precio_anterior is null or precio_anterior > precio),
 stock integer not null default 0 check (stock between 0 and 100000000),
 imagen_url text not null default '' check (imagen_url = '' or (length(imagen_url) <= 600 and imagen_url ~* '^https://[^[:space:]]+$')),
 publicado boolean not null default false,
 destacado boolean not null default false,
 actualizado timestamptz not null default now(),
 foreign key (tienda_id,tenant_id) references public.gestlok_tiendas(id,tenant_id) on delete restrict
);
create index if not exists gestlok_tienda_productos_idx on public.gestlok_productos_tienda(tienda_id,publicado,categoria);

alter table public.gestlok_tiendas enable row level security;
alter table public.gestlok_productos_tienda enable row level security;
revoke all on public.gestlok_tiendas, public.gestlok_productos_tienda from anon, authenticated;
grant select on public.gestlok_tiendas, public.gestlok_productos_tienda to anon, authenticated;
grant insert,update,delete on public.gestlok_tiendas, public.gestlok_productos_tienda to authenticated;

-- Anónimo no puede acceder al esquema privado gestlok_tenancy: política separada.
drop policy if exists gestlok_tiendas_read on public.gestlok_tiendas;
drop policy if exists gestlok_tiendas_read_public on public.gestlok_tiendas;
create policy gestlok_tiendas_read_public on public.gestlok_tiendas for select to anon, authenticated
using (visible and public.gestlok_modo_tienda_publico(tenant_id));
drop policy if exists gestlok_tiendas_read_private on public.gestlok_tiendas;
create policy gestlok_tiendas_read_private on public.gestlok_tiendas for select to authenticated
using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and public.puede_ver_local(local_id));
drop policy if exists gestlok_tiendas_insert on public.gestlok_tiendas;
create policy gestlok_tiendas_insert on public.gestlok_tiendas for insert to authenticated
with check (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and public.mi_rol() in ('creadora','dueno') and public.puede_ver_local(local_id)
);
drop policy if exists gestlok_tiendas_update on public.gestlok_tiendas;
create policy gestlok_tiendas_update on public.gestlok_tiendas for update to authenticated
using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and public.mi_rol() in ('creadora','dueno') and public.puede_ver_local(local_id))
with check (tenant_id = (select gestlok_tenancy.current_tenant_id()) and public.mi_rol() in ('creadora','dueno') and public.puede_ver_local(local_id));
drop policy if exists gestlok_tiendas_delete on public.gestlok_tiendas;
create policy gestlok_tiendas_delete on public.gestlok_tiendas for delete to authenticated
using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and public.mi_rol() in ('creadora','dueno') and public.puede_ver_local(local_id));

drop policy if exists gestlok_productos_read on public.gestlok_productos_tienda;
drop policy if exists gestlok_productos_read_public on public.gestlok_productos_tienda;
create policy gestlok_productos_read_public on public.gestlok_productos_tienda for select to anon, authenticated
using (
 publicado and exists (
   select 1 from public.gestlok_tiendas t
   where t.id = tienda_id and t.tenant_id = tenant_id
     and t.visible and public.gestlok_modo_tienda_publico(t.tenant_id)
 )
);
drop policy if exists gestlok_productos_read_private on public.gestlok_productos_tienda;
create policy gestlok_productos_read_private on public.gestlok_productos_tienda for select to authenticated
using (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and exists (select 1 from public.gestlok_tiendas t where t.id = tienda_id and t.tenant_id = tenant_id and public.puede_ver_local(t.local_id))
);
drop policy if exists gestlok_productos_insert on public.gestlok_productos_tienda;
create policy gestlok_productos_insert on public.gestlok_productos_tienda for insert to authenticated
with check (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and exists (select 1 from public.gestlok_tiendas t where t.id = tienda_id and t.tenant_id = tenant_id and public.puede_editar_local(t.local_id))
);
drop policy if exists gestlok_productos_update on public.gestlok_productos_tienda;
create policy gestlok_productos_update on public.gestlok_productos_tienda for update to authenticated
using (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and exists (select 1 from public.gestlok_tiendas t where t.id = tienda_id and t.tenant_id = tenant_id and public.puede_editar_local(t.local_id))
)
with check (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and exists (select 1 from public.gestlok_tiendas t where t.id = tienda_id and t.tenant_id = tenant_id and public.puede_editar_local(t.local_id))
);
drop policy if exists gestlok_productos_delete on public.gestlok_productos_tienda;
create policy gestlok_productos_delete on public.gestlok_productos_tienda for delete to authenticated
using (
 tenant_id = (select gestlok_tenancy.current_tenant_id())
 and exists (select 1 from public.gestlok_tiendas t where t.id = tienda_id and t.tenant_id = tenant_id and public.puede_editar_local(t.local_id))
);
