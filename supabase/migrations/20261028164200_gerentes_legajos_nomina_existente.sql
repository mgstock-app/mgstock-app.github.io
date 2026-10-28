-- La nómina previa de planillas se ofrece como sugerencia de legajo al gerente,
-- SIN revelar sueldo, tarifas, teléfono, alias, firma ni reportes privados.
create or replace function rm_test_private.rm_employee_profile_roster()
returns jsonb language sql stable security definer set search_path = '' as $roster$
select coalesce(jsonb_agg(distinct jsonb_build_object(
  'organization_id',l.organization_id,
  'local_id',l.id,
  'source_id',d.path,
  'full_name',left(btrim(d.data->>'nombre'),200),
  'status',case when d.data->>'estadoColab' in ('activo','refuerzo','inactivo')
       then d.data->>'estadoColab' else 'activo' end
)),'[]'::jsonb)
from public.rm_test_documents d
join public.rm_app_local l on l.organization_id=d.organization_id
  and (
    d.data->>'local'=l.id
    or (coalesce(d.data->>'local','')='' and
      (
        d.path like 'hojas/' || l.id || '-%'
        or (l.id='dt' and d.path ~ '^hojas/(?:enc|staff)[0-9]+$')
      )
    )
  )
where d.collection='hojas'
  and d.path ~ '^hojas/[^/]+$'
  and length(btrim(coalesce(d.data->>'nombre',''))) > 0
  and rm_test_private.rm_employee_profile_scope(l.organization_id,l.id)
$roster$;
revoke all on function rm_test_private.rm_employee_profile_roster() from public,anon;
grant execute on function rm_test_private.rm_employee_profile_roster() to authenticated;
create or replace function public.rm_employee_profile_roster()
returns jsonb language sql stable set search_path = '' as $roster$
select rm_test_private.rm_employee_profile_roster()
$roster$;
revoke all on function public.rm_employee_profile_roster() from public,anon;
grant execute on function public.rm_employee_profile_roster() to authenticated;
