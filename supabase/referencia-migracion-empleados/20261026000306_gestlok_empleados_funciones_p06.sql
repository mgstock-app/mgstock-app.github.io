-- GESTLOK · Administración de empleados: funciones, parte 6 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_join_links(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not coalesce((select rm_test_private.manages_organization(organization_id) from public.rm_companies where id=p_company),false) then raise exception 'Invitation not permitted' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'token',token,'expires_at',expires_at,'revoked_at',revoked_at,'local_id',local_id,'uses',uses,'max_uses',max_uses) order by expires_at desc),'[]') from rm_test_private.join_links where company_id=p_company);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_join_preview(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not rm_test_private.ensure_directory() then raise exception 'Google account required' using errcode='42501'; end if;
 select jsonb_build_object('company_name',c.name,'space_name',o.name,'local_name',l.name) into result from rm_test_private.join_links j join public.rm_companies c on c.id=j.company_id join public.rm_organizations o on o.id=j.organization_id left join public.rm_app_local l on l.id=j.local_id where j.token=p_token and j.revoked_at is null and j.expires_at>clock_timestamp() and j.uses<j.max_uses;
 if result is null then raise exception 'El enlace venció, fue revocado o no es válido'; end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_locals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() not in ('admin','owner') then raise exception 'Manager required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(row_to_json(l) order by l.name),'[]') from public.rm_app_local l where rm_test_private.manages_local(l.id));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform rm_test_private.activate_preapproved_shared_owner();
  return rm_test_private.rm_app_identity()
    || jsonb_build_object('account_kind',
      (select d.account_kind from public.rm_app_directory d where d.user_id=rm_test_private.uid()));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_open_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sheet text; version timestamptz; a public.rm_test_report_access; t timestamptz;
begin
 if rm_test_private.app_role() not in ('employee','manager') then raise exception 'Employee required' using errcode='42501'; end if;
 sheet=rm_test_private.app_sheet();
 select i.published_at into version from public.rm_app_images i join public.rm_test_documents d on d.path='hojas/'||i.sheet_id and d.updated_at=i.report_version where i.sheet_id=sheet for share of i,d;
 if version is null then raise exception 'El dueño todavía no publicó el reporte'; end if;
 insert into public.rm_test_report_access(user_id,sheet_id,report_version) values(rm_test_private.uid(),sheet,version) on conflict(user_id) do nothing;
 select * into a from public.rm_test_report_access where user_id=rm_test_private.uid() for update;
 if a.sheet_id<>sheet or a.report_version is distinct from version or a.opened_at is null then
  t=clock_timestamp();
  update public.rm_test_report_access set sheet_id=sheet,report_version=version,opened_at=t,expires_at=t+interval '24 hours',requested_at=null where user_id=rm_test_private.uid();
  
 elsif a.expires_at<=clock_timestamp() then raise exception 'Necesitás una nueva habilitación' using errcode='42501'; end if;
 return rm_test_private.rm_app_access_state();
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_organizations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() not in ('admin','owner') then raise exception 'Manager required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('owner_name',d.display_name,'owner_public_id',o.owner_number) order by o.name),'[]') from public.rm_organizations o left join public.rm_app_directory d on d.user_id=o.owner_id where rm_test_private.manages_organization(o.id));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_owner_count()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 return (select count(*) from public.rm_test_members m join public.rm_app_directory d using(user_id)
 join public.rm_organization_members om using(user_id) where m.role='owner' and d.status='approved');
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_owner_invitations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('email',email,'created_at',created_at) order by created_at),'[]') from rm_test_private.personal_owner_allowlist);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_owner_join_code(p_org uuid, p_rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare code rm_test_private.owner_join_codes; number text;
begin
 if not (rm_test_private.manages_organization(p_org) or
 (rm_test_private.app_role()='manager' and exists(select 1 from public.rm_manager_permissions p where p.user_id=rm_test_private.uid() and p.organization_id=p_org)))
 then raise exception 'No podés consultar este código' using errcode='42501'; end if;
 if p_rotate is null or (p_rotate and not rm_test_private.manages_organization(p_org)) then raise exception 'Solo los dueños y la administración autorizada pueden renovar el código' using errcode='42501'; end if;
 select owner_number into number from public.rm_organizations where id=p_org;
 if number is null then raise exception 'Este espacio administrativo no admite dueños invitados'; end if;
 perform pg_advisory_xact_lock(216103);
 select * into code from rm_test_private.owner_join_codes where organization_id=p_org for update;
 if code.organization_id is null or p_rotate or code.expires_at<=clock_timestamp() then
  insert into rm_test_private.owner_join_codes(organization_id,token,expires_at,updated_by)
  values(p_org,replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),clock_timestamp()+interval '7 days',rm_test_private.uid())
  on conflict(organization_id) do update set token=excluded.token,expires_at=excluded.expires_at,updated_by=excluded.updated_by returning * into code;
 end if;
 return jsonb_build_object('company_id',number,'code',code.token,'expires_at',code.expires_at);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_preauthorize_collaborator(p_company uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid;
begin
 select organization_id into org from public.rm_companies where id=p_company;
 if rm_test_private.app_role() is distinct from 'admin' or not coalesce(rm_test_private.manages_organization(org),false)
 then raise exception 'Administración autorizada requerida' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(216103);
 perform rm_test_private.rm_app_invite(org,p_email);
 update rm_test_private.organization_invitations set company_id=p_company,invited_by=rm_test_private.uid()
 where email=lower(btrim(p_email)) and organization_id=org;
 insert into rm_test_private.account_audit(actor,target,action,after_value) values(rm_test_private.uid(),rm_test_private.uid(),'preauthorize_collaborator',jsonb_build_object('organization_id',org,'company_id',p_company,'invited_email',lower(btrim(p_email))));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_publish_report(p_sheet text, p_image text, p_version timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin raise exception 'Actualizá la página para publicar el formato privado del reporte.'; end $function$;
