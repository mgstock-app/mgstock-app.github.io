-- GestLok: trasladar la verificación anónima a un esquema NO expuesto por PostgREST.
-- Solo modifica objetos creados para la nueva tienda. No actualiza public.docs.
create schema if not exists gestlok_public;
revoke all on schema gestlok_public from public;
grant usage on schema gestlok_public to anon,authenticated;

create or replace function gestlok_public.modo_tienda_publico(p_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.docs d
    where d.tenant_id=p_tenant
      and d.col='configuracion_negocio'
      and d.id='empresa-' || p_tenant::text
      and d.data ->> 'tipo' in ('online','mixta')
  )
$$;
revoke all on function gestlok_public.modo_tienda_publico(uuid) from public;
grant execute on function gestlok_public.modo_tienda_publico(uuid) to anon,authenticated;

drop policy if exists gestlok_tiendas_read_public on public.gestlok_tiendas;
create policy gestlok_tiendas_read_public on public.gestlok_tiendas
for select to anon,authenticated
using(visible and gestlok_public.modo_tienda_publico(tenant_id));

drop policy if exists gestlok_productos_read_public on public.gestlok_productos_tienda;
create policy gestlok_productos_read_public on public.gestlok_productos_tienda
for select to anon,authenticated
using(
  publicado and exists (
    select 1 from public.gestlok_tiendas t
    where t.id=tienda_id and t.tenant_id=tenant_id
      and t.visible and gestlok_public.modo_tienda_publico(t.tenant_id)
  )
);

revoke all on function public.gestlok_modo_tienda_publico(uuid) from public,anon,authenticated;
drop function if exists public.gestlok_modo_tienda_publico(uuid);
