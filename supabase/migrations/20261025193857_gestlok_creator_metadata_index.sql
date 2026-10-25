-- Registry metadata only: never returns receipts, payroll, products, contacts or credentials.
create function public.gestlok_creator_companies_index()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform gestlok_platform.registration_email();
 if not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
  raise exception 'Acceso exclusivo de administradora autorizada' using errcode='42501';
 end if;
 return jsonb_build_object('scope','metadata_only','companies',coalesce((select jsonb_agg(
  jsonb_build_object('tenant_id',t.id,'name',coalesce(
    (select c.name from gestlok_platform.companies c where c.tenant_id=t.id),
    case when exists(select 1 from public.docs e where e.col='equipo' and e.tenant_id=t.id and e.data->>'logoId'='mi-gusto') then 'Mi Gusto' end,'Empresa'),
    'owners',(select count(*) from public.docs e where e.col='equipo' and e.tenant_id=t.id and e.data->>'rol'='dueno'),
    'locals',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.data->>'nombre') order by l.id) from public.docs l where l.col='locales' and l.tenant_id=t.id),'[]'::jsonb))
  order by t.created_at,t.id) from gestlok_tenancy.tenants t),'[]'::jsonb));
end $$;
revoke all on function public.gestlok_creator_companies_index() from public,anon;
grant execute on function public.gestlok_creator_companies_index() to authenticated;
