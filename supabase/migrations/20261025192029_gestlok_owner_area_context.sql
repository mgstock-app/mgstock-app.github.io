-- Read-only capability projection. No new role, module or cross-project access.
create function public.gestlok_owner_area_context()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_tenant uuid:=gestlok_tenancy.current_tenant_id();
 v_member jsonb; v_name text; v_locals jsonb;
begin
 if public.mi_rol() is distinct from 'dueno' then
  raise exception 'Acceso exclusivo de dueños autorizados' using errcode='42501';
 end if;
 select d.data into v_member from public.docs d
 where d.col='equipo' and d.tenant_id=v_tenant and lower(d.data->>'email')=v_email;
 if v_member is null then raise exception 'Sin empresa autorizada' using errcode='42501';end if;
 select coalesce(jsonb_agg(d.id order by d.id),'[]'::jsonb) into v_locals
 from public.docs d where d.col='locales' and d.tenant_id=v_tenant and public.puede_ver_local(d.id);
 select c.name into v_name from gestlok_platform.companies c where c.tenant_id=v_tenant;
 if v_member->>'logoId'='mi-gusto' then v_name:='Mi Gusto';end if;
 return jsonb_build_object('role','dueno','tenant_id',v_tenant,'company_name',coalesce(v_name,'Mi empresa'),
  'logo_id',case when v_member->>'logoId'='mi-gusto' then 'mi-gusto' else null end,
  'local_ids',v_locals,'modules',jsonb_build_object(
    'comercial',jsonb_build_object('authorized',jsonb_array_length(v_locals)>0,'operational',true,'authority','existing_company_membership'),
    'recibos_personal',jsonb_build_object('authorized',false,'operational',false,'reason','integration_not_ready')));
end $$;
revoke all on function public.gestlok_owner_area_context() from public,anon;
grant execute on function public.gestlok_owner_area_context() to authenticated;

