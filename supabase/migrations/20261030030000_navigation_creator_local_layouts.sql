-- Preferencias del menú por empresa/local: las edita solo la creadora.
-- No se borran datos operativos ni se alteran permisos de categorías reales.
create table if not exists gestlok_platform.navigation_layouts(
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 local_id text not null,
 items jsonb not null default '[]'::jsonb,
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,local_id),
 constraint nav_items_array check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=35)
);
alter table gestlok_platform.navigation_layouts enable row level security;
revoke all on gestlok_platform.navigation_layouts from public,anon,authenticated;
create or replace function public.gestlok_navigation_read(p_tenant uuid,p_local text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or (
   gestlok_tenancy.current_tenant_id() is distinct from p_tenant
   and not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid())
 ) then raise exception 'Sin acceso a ese menú' using errcode='42501'; end if;
 if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local) then
   raise exception 'Local inexistente' using errcode='22023'; end if;
 return coalesce((select n.items from gestlok_platform.navigation_layouts n where n.tenant_id=p_tenant and n.local_id=p_local),'[]'::jsonb);
end $$;
create or replace function public.gestlok_navigation_save(p_tenant uuid,p_local text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; v_id text; v_name text; v_target text; v_seen text[]:='{}';
begin
 perform gestlok_platform.require_admin();
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>35 then
   raise exception 'Máximo 35 categorías' using errcode='22023';end if;
 if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local) then
   raise exception 'Local inexistente' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(p_items) loop
   v_id:=v->>'id';v_name:=btrim(coalesce(v->>'label',''));v_target:=v->>'target';
   if v_id is null or (v_id<>all(v_seen)) is false or
    char_length(v_name) not between 2 and 45 or
    v_name ~ '[<>]' or
    v_id !~ '^(inicio|stock|proveedores|chat|vencimientos|avisos|motos|resenas|reclamos-internos|cierre-online|pedidos-online|tienda-online|adm-local|pedido|conteo|fabrica|historial|ingreso|custom-[a-z0-9-]{1,36})$'
   then raise exception 'Categoría duplicada o inválida' using errcode='22023';end if;
   if v_id like 'custom-%' and (v_target is null or v_target not in ('stock','proveedores','chat','vencimientos','avisos','pedido','conteo','historial')) then
     raise exception 'Un acceso nuevo debe abrir una pantalla existente y autorizada' using errcode='22023';end if;
   v_seen:=array_append(v_seen,v_id);
 end loop;
 insert into gestlok_platform.navigation_layouts(tenant_id,local_id,items,updated_by)
 values(p_tenant,p_local,p_items,auth.uid())
 on conflict(tenant_id,local_id) do update set items=excluded.items,updated_by=auth.uid(),updated_at=now();
 return p_items;
end $$;
revoke all on function public.gestlok_navigation_read(uuid,text) from public,anon;
revoke all on function public.gestlok_navigation_save(uuid,text,jsonb) from public,anon;
grant execute on function public.gestlok_navigation_read(uuid,text) to authenticated;
grant execute on function public.gestlok_navigation_save(uuid,text,jsonb) to authenticated;
