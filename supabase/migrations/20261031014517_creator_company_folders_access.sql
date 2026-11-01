-- Administradora verificada: mismas funciones operativas en la empresa activa.
-- No altera membresías, políticas de aislamiento ni datos de negocio.
create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = ''
as $$ select case when gestlok_platform.creator_write_active() then 'creadora' else coalesce(
  (select d.data->>'rol' from public.docs d
   where d.col = 'equipo' and d.tenant_id = (select gestlok_tenancy.current_tenant_id())
     and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), '')) limit 1),
  case when gestlok_platform.support_tenant() is not null then 'lectura' end) end $$;

create or replace function public.mi_acceso()
returns jsonb
language sql stable security definer set search_path = ''
as $$ select case when gestlok_platform.creator_write_active() then
 jsonb_build_object('rol','creadora','tenant_id',gestlok_tenancy.current_tenant_id(),
 'support',gestlok_platform.support_tenant() is not null,
 'locales',coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
 where l.col='locales' and l.tenant_id=gestlok_tenancy.current_tenant_id()),'[]'::jsonb))
 else coalesce(
  (select jsonb_build_object('rol', d.data->>'rol',
     'locales', case when d.data->>'rol' in ('creadora', 'dueno') then
         coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
                   where l.col = 'locales' and l.tenant_id = d.tenant_id), '[]'::jsonb)
       else coalesce(d.data->'locales', '[]'::jsonb) end,
     'tenant_id', d.tenant_id)
   from public.docs d
   where d.col = 'equipo' and d.tenant_id = (select gestlok_tenancy.current_tenant_id())
     and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), '')) limit 1),
  (select jsonb_build_object('rol', 'lectura', 'tenant_id', s.t, 'support', true,
     'locales', coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
                          where l.col = 'locales' and l.tenant_id = s.t), '[]'::jsonb))
   from (select gestlok_platform.support_tenant() as t) s where s.t is not null)) end $$;


create or replace function public.puede_editar_local(p text)
returns boolean language sql stable security definer set search_path=''
as $$ select
 (gestlok_platform.creator_write_active() and exists(select 1 from public.docs l
 where l.col='locales' and l.id=p and l.tenant_id=gestlok_tenancy.current_tenant_id()))
 or exists(select 1 from public.docs l
 join public.docs e on e.col='equipo' and e.tenant_id=l.tenant_id
 where l.col='locales' and l.id=p and l.tenant_id=gestlok_tenancy.current_tenant_id()
 and lower(e.data->>'email')=lower(coalesce(auth.jwt()->>'email',''))
 and (e.data->>'rol' in ('creadora','dueno') or
 (e.data->>'rol' in ('gerente','editor') and coalesce(e.data->'locales','[]'::jsonb) ? p))) $$;
