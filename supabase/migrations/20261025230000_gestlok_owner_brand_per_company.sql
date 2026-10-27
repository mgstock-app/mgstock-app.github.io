-- La marca de la empresa (logo y nombre) pertenece a la empresa, no a la ficha de cada dueño.
-- Hasta ahora solo veían el logo «Mi Gusto» los dueños cuya ficha tenía logoId='mi-gusto'; un dueño
-- nuevo de la misma empresa veía «Mi empresa» sin logo. Ahora la marca vale para todos los dueños
-- de la empresa que ya tiene un dueño con esa marca asignada. No cambia datos ni permisos: solo la
-- respuesta de gestlok_owner_area_context (misma forma que antes).
create or replace function public.gestlok_owner_area_context()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_tenant uuid:=gestlok_tenancy.current_tenant_id();
 v_member jsonb; v_name text; v_locals jsonb; v_link gestlok_platform.recibonet_links; v_staff boolean; v_brand boolean;
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
 v_brand:=v_member->>'logoId'='mi-gusto' or exists(
   select 1 from public.docs d where d.col='equipo' and d.tenant_id=v_tenant
     and d.data->>'rol'='dueno' and d.data->>'logoId'='mi-gusto');
 if v_brand then v_name:='Mi Gusto';end if;
 select * into v_link from gestlok_platform.recibonet_links l where l.tenant_id=v_tenant;
 v_staff:=v_link.tenant_id is not null and exists(select 1 from gestlok_platform.company_modules m
   where m.tenant_id=v_tenant and m.module='recibos_personal' and m.enabled);
 return jsonb_build_object('role','dueno','tenant_id',v_tenant,'company_name',coalesce(v_name,'Mi empresa'),
  'logo_id',case when v_brand then 'mi-gusto' else null end,
  'local_ids',v_locals,
  'recibonet',case when v_staff then jsonb_build_object('organization_number',v_link.organization_number,'internal_name',v_link.internal_name) else null end,
  'modules',jsonb_build_object(
    'comercial',jsonb_build_object('authorized',jsonb_array_length(v_locals)>0,'operational',true,'authority','existing_company_membership'),
    'recibos_personal',case when v_staff
      then jsonb_build_object('authorized',true,'operational',true,'authority','creator_module_grant')
      else jsonb_build_object('authorized',false,'operational',v_link.tenant_id is not null,'reason',
        case when v_link.tenant_id is null then 'company_not_linked' else 'module_not_enabled' end) end));
end $$;
