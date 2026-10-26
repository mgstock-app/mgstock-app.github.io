-- GESTLOK · Administración de empleados: funciones, parte 3 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.record_delivery(p_sheet text, p_version timestamp with time zone, p_channel text, p_contact jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.rm_test_documents; sent timestamptz=clock_timestamp(); version timestamptz; snapshot jsonb; total numeric;
begin
 if not coalesce(rm_test_private.manages_sheet(p_sheet),false) then raise exception 'Delivery not permitted' using errcode='42501'; end if;
 if p_channel not in ('Aplicación','WhatsApp') or p_channel is null then raise exception 'Invalid delivery channel'; end if;
 select * into d from public.rm_test_documents where path='hojas/'||p_sheet for update;
 if d.path is null or d.updated_at is distinct from p_version then raise exception 'El reporte cambió. Actualizá antes de compartir.'; end if;
 if p_contact is not null and (jsonb_typeof(p_contact)<>'object' or length(p_contact::text)>500) then raise exception 'Invalid contact'; end if;
 select coalesce(sum(case when key='aus' then -abs(coalesce((value->>'i')::numeric,0)) else coalesce((value->>'i')::numeric,0) end),0)
 into total from jsonb_each(coalesce(d.data->'items','{}'))
 where key in ('trab','off','fer') or
 (key='aus' and coalesce((d.data->>'ausente')::boolean,false) and not coalesce((d.data->>'ausJust')::boolean,false)) or
 (key='vac' and coalesce((d.data->>'vac')::boolean,false)) or
 (key='agu' and coalesce((d.data->>'agu')::boolean,false));
 snapshot=d.data||jsonb_build_object('registrado',sent,'enviadoA',p_channel,'total',round(total,2),
 'periodo',case when coalesce(d.data->>'semDesde','')<>'' then concat(d.data->>'semDesde',' al ',d.data->>'semHasta') else concat_ws(' ',d.data->>'mes',d.data->>'anio') end);
 insert into public.rm_test_documents(path,data,organization_id)
 values('hojas/'||p_sheet||'/historial/'||gen_random_uuid()::text,snapshot,d.organization_id);
 update public.rm_test_documents set data=data||jsonb_build_object('ultimaExport',sent,'envioMedio',p_channel)||
 case when p_contact is null then '{}'::jsonb else jsonb_build_object('contacto',p_contact) end
 where path=d.path returning updated_at into version;
 -- Sending via another medium does not invalidate an unchanged published image.
 update public.rm_app_images set report_version=version where sheet_id=p_sheet and report_version=p_version;
 return version;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.record_whatsapp(p_sheet text, p_version timestamp with time zone, p_contact jsonb)
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select rm_test_private.record_delivery(p_sheet,p_version,'WhatsApp',p_contact)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_access_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() not in ('admin','owner') then
  raise exception 'Manager required' using errcode='42501';
 end if;
 return (select coalesce(jsonb_agg(row_to_json(t) order by t.requested_at desc),'[]') from (
  select a.user_id,d.display_name,l.name local_name,a.requested_at
  from public.rm_test_report_access a
  join public.rm_app_directory d using(user_id)
  join public.rm_test_members m using(user_id)
  join public.rm_app_local l on l.id=m.local_id
  where a.requested_at is not null and rm_test_private.manages_local(m.local_id)
 ) t);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_access_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sheet text; version timestamptz; a public.rm_test_report_access; state text;
begin
 if rm_test_private.app_role() not in ('employee','manager') then raise exception 'Employee required' using errcode='42501'; end if;
 sheet=rm_test_private.app_sheet();
 select i.published_at into version from public.rm_app_images i join public.rm_test_documents d on d.path='hojas/'||i.sheet_id and d.updated_at=i.report_version where i.sheet_id=sheet;
 select * into a from public.rm_test_report_access where user_id=rm_test_private.uid() and sheet_id=sheet;
 state=case when version is null then 'unavailable' when a.report_version is distinct from version or a.opened_at is null then 'ready' when a.expires_at>clock_timestamp() then 'active' when a.requested_at is not null then 'requested' else 'expired' end;
 return jsonb_build_object('status',state,'server_now',clock_timestamp(),'expires_at',case when a.report_version=version then a.expires_at end,'can_request',state='expired');
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_admin_access(p_org uuid, p_email text, p_enable boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid;
begin
 if not rm_test_private.manages_organization(p_org) or p_enable is null then raise exception 'Authorization not permitted' using errcode='42501'; end if;
 if not exists(select 1 from public.rm_organizations where id=p_org and ((rm_test_private.app_role()='owner' and rm_test_private.manages_organization(id)) or created_by=rm_test_private.uid())) then raise exception 'Solo el dueño o creador puede autorizar' using errcode='42501'; end if;
 select d.user_id into target from public.rm_app_directory d join public.rm_test_members m using(user_id) where lower(d.email)=lower(btrim(p_email)) and m.role='admin' and d.status='approved';
 if target is null then raise exception 'Administrador no disponible'; end if;
 if p_enable then insert into public.rm_organization_admins values(p_org,target,rm_test_private.uid()) on conflict do nothing;
 else delete from public.rm_organization_admins where organization_id=p_org and user_id=target; end if;
 insert into rm_test_private.account_audit(actor,target,action,after_value) values(rm_test_private.uid(),target,'organization_admin',jsonb_build_object('organization_id',p_org,'enabled',p_enable));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_allow_owner(p_email text, p_enable boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_enable is null or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo inválido'; end if;
 if p_enable then insert into rm_test_private.personal_owner_allowlist(email,granted_by) values(lower(btrim(p_email)),rm_test_private.uid()) on conflict do nothing;
 else delete from rm_test_private.personal_owner_allowlist where email=lower(btrim(p_email)); end if;
end $function$;
