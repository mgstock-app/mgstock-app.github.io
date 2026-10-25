-- GestLok · catálogo exclusivamente interno: búsqueda y paginación por cursor.
-- No crea tienda pública, pagos, carrito ni cambia las planillas Stock existentes.
-- Diseñado para evitar cargar todo el catálogo en celulares.
create extension if not exists pg_trgm with schema extensions;

alter table public.gestlok_productos_tienda
  add column if not exists subcategoria text not null default '' check(length(subcategoria)<=80),
  add column if not exists marca text not null default '' check(length(marca)<=80),
  add column if not exists variante text not null default '' check(length(variante)<=120),
  add column if not exists codigo_barras text not null default '' check(length(codigo_barras)<=80);

alter table public.gestlok_productos_tienda
  add column if not exists busqueda text generated always as (
    lower(
      coalesce(nombre,'') || ' ' || coalesce(sku,'') || ' ' ||
      coalesce(categoria,'') || ' ' || coalesce(proveedor,'') || ' ' ||
      coalesce(ubicacion,'') || ' ' || coalesce(subcategoria,'') || ' ' ||
      coalesce(marca,'') || ' ' || coalesce(variante,'') || ' ' ||
      coalesce(codigo_barras,'')
    )
  ) stored;

create unique index if not exists gl_tienda_barras_unico
  on public.gestlok_productos_tienda(tenant_id,tienda_id,lower(codigo_barras))
  where btrim(codigo_barras)<>'';

create index if not exists gl_tienda_buscador_gin
  on public.gestlok_productos_tienda using gin (busqueda extensions.gin_trgm_ops);
create index if not exists gl_tienda_paginado_idx
  on public.gestlok_productos_tienda(tenant_id,tienda_id,nombre,id);
create index if not exists gl_tienda_categorias_idx
  on public.gestlok_productos_tienda(tenant_id,tienda_id,categoria,nombre,id);
create index if not exists gl_tienda_proveedores_idx
  on public.gestlok_productos_tienda(tenant_id,tienda_id,proveedor,nombre,id);
create unique index if not exists gl_tienda_sku_unico
  on public.gestlok_productos_tienda(tenant_id,tienda_id,lower(sku))
  where btrim(sku) <> '';

-- Refuerzo de RLS: cada producto debe pertenecer a la tienda de su misma empresa.
-- La clave foránea compuesta sigue protegiendo tienda_id + tenant_id.
drop policy if exists gestlok_productos_read_private on public.gestlok_productos_tienda;
create policy gestlok_productos_read_private on public.gestlok_productos_tienda
 for select to authenticated
 using (
   tenant_id=(select gestlok_tenancy.current_tenant_id()) and
   exists(select 1 from public.gestlok_tiendas t
     where t.id=gestlok_productos_tienda.tienda_id
       and t.tenant_id=gestlok_productos_tienda.tenant_id
       and public.puede_ver_local(t.local_id))
 );
drop policy if exists gestlok_productos_insert on public.gestlok_productos_tienda;
create policy gestlok_productos_insert on public.gestlok_productos_tienda
 for insert to authenticated
 with check (
   tenant_id=(select gestlok_tenancy.current_tenant_id()) and
   exists(select 1 from public.gestlok_tiendas t
     where t.id=gestlok_productos_tienda.tienda_id
       and t.tenant_id=gestlok_productos_tienda.tenant_id
       and public.puede_editar_local(t.local_id))
 );
drop policy if exists gestlok_productos_update on public.gestlok_productos_tienda;
create policy gestlok_productos_update on public.gestlok_productos_tienda
 for update to authenticated
 using (
   tenant_id=(select gestlok_tenancy.current_tenant_id()) and
   exists(select 1 from public.gestlok_tiendas t
     where t.id=gestlok_productos_tienda.tienda_id
       and t.tenant_id=gestlok_productos_tienda.tenant_id
       and public.puede_editar_local(t.local_id))
 )
 with check (
   tenant_id=(select gestlok_tenancy.current_tenant_id()) and
   exists(select 1 from public.gestlok_tiendas t
     where t.id=gestlok_productos_tienda.tienda_id
       and t.tenant_id=gestlok_productos_tienda.tenant_id
       and public.puede_editar_local(t.local_id))
 );
drop policy if exists gestlok_productos_delete on public.gestlok_productos_tienda;
create policy gestlok_productos_delete on public.gestlok_productos_tienda
 for delete to authenticated
 using (
   tenant_id=(select gestlok_tenancy.current_tenant_id()) and
   exists(select 1 from public.gestlok_tiendas t
     where t.id=gestlok_productos_tienda.tienda_id
       and t.tenant_id=gestlok_productos_tienda.tenant_id
       and public.puede_editar_local(t.local_id))
 );

-- SECURITY INVOKER conserva RLS. El cursor (nombre,id) permite ir avanzando
-- sin recorrer 500.000 filas ni bajar productos fuera de la página.
create or replace function public.gestlok_catalogo_pagina(
 p_tienda uuid,p_consulta text default '',p_categoria text default '',
 p_proveedor text default '',p_estado text default 'activos',
 p_cursor_nombre text default null,p_cursor_id uuid default null,
 p_limite integer default 50
)
returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare
 v_tenant uuid := gestlok_tenancy.current_tenant_id();
 v_query text := lower(btrim(coalesce(p_consulta,'')));
 v_results jsonb := '[]'::jsonb;
 v_more boolean := false;
 v_row record;
 v_count integer := 0;
begin
 if (select auth.uid()) is null or v_tenant is null or
    p_tienda is null or p_limite not between 1 and 100 or
    p_estado not in ('todos','activos','archivados','alertas') or
    length(v_query)>80 or (length(v_query)>0 and length(v_query)<3) or
    length(coalesce(p_categoria,''))>80 or
    length(coalesce(p_proveedor,''))>120 or
    (p_cursor_nombre is null) <> (p_cursor_id is null)
 then raise exception 'Parámetros inválidos para consultar catálogo.' using errcode='22023';
 end if;
 if not exists (
  select 1 from public.gestlok_tiendas t
  where t.id=p_tienda and t.tenant_id=v_tenant and public.puede_ver_local(t.local_id)
 ) then raise exception 'No tenés acceso a este catálogo.' using errcode='42501';
 end if;
 -- Escapar comodines del texto ingresado: no permitir búsquedas involuntariamente globales.
 v_query := replace(replace(replace(v_query,chr(92),chr(92)||chr(92)),
                    '%',chr(92)||'%'),'_',chr(92)||'_');
 for v_row in
  select p.*
  from public.gestlok_productos_tienda p
  where p.tenant_id=v_tenant and p.tienda_id=p_tienda
    and (p_categoria='' or p.categoria=p_categoria)
    and (p_proveedor='' or p.proveedor=p_proveedor)
    and (p_estado='todos' or
      (p_estado='activos' and p.activo=true) or
      (p_estado='archivados' and p.activo=false) or
      (p_estado='alertas' and p.activo=true and p.minimo>0 and p.stock<=p.minimo))
    and (v_query='' or p.busqueda like '%'||v_query||'%' escape chr(92))
    and (p_cursor_id is null or (p.nombre,p.id)>(p_cursor_nombre,p_cursor_id))
  order by p.nombre,p.id
  limit p_limite+1
 loop
  v_count:=v_count+1;
  if v_count>p_limite then v_more:=true; exit; end if;
  -- No devolver la columna de búsqueda (es interna y potencialmente grande).
  v_results:=v_results || (to_jsonb(v_row)-'busqueda');
 end loop;
 return jsonb_build_object('items',v_results,'hasMore',v_more);
end
$fn$;
revoke all on function public.gestlok_catalogo_pagina(
 uuid,text,text,text,text,text,uuid,integer) from public,anon;
grant execute on function public.gestlok_catalogo_pagina(
 uuid,text,text,text,text,text,uuid,integer) to authenticated;

-- Métricas bajo demanda: la tabla real, no una muestra del dispositivo.
create or replace function public.gestlok_catalogo_resumen(p_tienda uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare
 v_tenant uuid := gestlok_tenancy.current_tenant_id();
 v_all bigint;v_active bigint;v_alert bigint;v_archived bigint;v_cats bigint;
begin
 if (select auth.uid()) is null or v_tenant is null or
  not exists(select 1 from public.gestlok_tiendas t
    where t.id=p_tienda and t.tenant_id=v_tenant and public.puede_ver_local(t.local_id))
 then raise exception 'Sin acceso al catálogo.' using errcode='42501';end if;
 select count(*),count(*) filter(where activo),
  count(*) filter(where activo and minimo>0 and stock<=minimo),
  count(*) filter(where not activo),count(distinct categoria) filter(where activo)
 into v_all,v_active,v_alert,v_archived,v_cats
 from public.gestlok_productos_tienda
 where tenant_id=v_tenant and tienda_id=p_tienda;
 return jsonb_build_object('total',v_all,'activos',v_active,'alertas',v_alert,
   'archivados',v_archived,'categorias',v_cats);
end
$fn$;
revoke all on function public.gestlok_catalogo_resumen(uuid) from public,anon;
grant execute on function public.gestlok_catalogo_resumen(uuid) to authenticated;

create or replace function public.gestlok_catalogo_categorias(
 p_tienda uuid,p_consulta text default '')
returns table(categoria text,productos bigint,alertas bigint)
language sql security invoker set search_path=''
as $fn$
 select p.categoria,count(*) as productos,
   count(*) filter(where p.minimo>0 and p.stock<=p.minimo) as alertas
 from public.gestlok_productos_tienda p
 join public.gestlok_tiendas t on t.id=p.tienda_id and t.tenant_id=p.tenant_id
 where p.tienda_id=p_tienda and p.tenant_id=gestlok_tenancy.current_tenant_id()
  and (select auth.uid()) is not null and public.puede_ver_local(t.local_id)
  and p.activo and (btrim(coalesce(p_consulta,''))='' or
    p.categoria ilike '%'||btrim(p_consulta)||'%')
 group by p.categoria order by p.categoria limit 200
$fn$;
revoke all on function public.gestlok_catalogo_categorias(uuid,text) from public,anon;
grant execute on function public.gestlok_catalogo_categorias(uuid,text) to authenticated;
