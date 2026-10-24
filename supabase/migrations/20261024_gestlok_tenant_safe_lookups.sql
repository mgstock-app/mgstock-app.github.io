-- Make privileged role and branch lookups tenant-aware.
create or replace function public.mi_rol() returns text language sql stable security definer set search_path=''
as $$ select d.data->>'rol' from public.docs d
 where d.col='equipo' and d.tenant_id=(select gestlok_tenancy.current_tenant_id())
 and lower(d.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),'')) limit 1 $$;

create or replace function public.mi_acceso() returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('rol',d.data->>'rol',
 'locales',case when d.data->>'rol' in ('creadora','dueno') then
 coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
 where l.col='locales' and l.tenant_id=d.tenant_id),'[]'::jsonb)
 else coalesce(d.data->'locales','[]'::jsonb) end)
 from public.docs d where d.col='equipo' and d.tenant_id=(select gestlok_tenancy.current_tenant_id())
 and lower(d.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),'')) limit 1 $$;

create or replace function public.puede_ver_local(p text) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.docs l
 join public.docs e on e.col='equipo' and e.tenant_id=l.tenant_id
 where l.col='locales' and l.id=p and l.tenant_id=(select gestlok_tenancy.current_tenant_id())
 and lower(e.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),''))
 and (e.data->>'rol' in ('creadora','dueno') or coalesce(e.data->'locales','[]'::jsonb) ? p)) $$;

create or replace function public.puede_editar_local(p text) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.docs l
 join public.docs e on e.col='equipo' and e.tenant_id=l.tenant_id
 where l.col='locales' and l.id=p and l.tenant_id=(select gestlok_tenancy.current_tenant_id())
 and lower(e.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),''))
 and (e.data->>'rol' in ('creadora','dueno') or
 (e.data->>'rol' in ('gerente','editor') and coalesce(e.data->'locales','[]'::jsonb) ? p))) $$;

create or replace function public.comparte_local(p_locales jsonb) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.docs e
 cross join lateral jsonb_array_elements_text(
 case when jsonb_typeof(e.data->'locales')='array' then e.data->'locales' else '[]'::jsonb end
 ) x(local_id)
 where e.col='equipo' and e.tenant_id=(select gestlok_tenancy.current_tenant_id())
 and lower(e.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),''))
 and (case when jsonb_typeof(p_locales)='array' then p_locales else '[]'::jsonb end) ? x.local_id) $$;
