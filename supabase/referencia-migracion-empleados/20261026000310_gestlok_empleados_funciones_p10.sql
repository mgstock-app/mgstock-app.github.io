-- GESTLOK · Administración de empleados: funciones, parte 10 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.schedule_permission(p_company uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(p_action in ('view','edit','publish','comment') and exists(select 1 from public.rm_companies c where c.id=p_company and
 (rm_test_private.manages_organization(c.organization_id) or (rm_test_private.app_role()='manager' and exists(select 1 from public.rm_manager_permissions p where p.user_id=rm_test_private.uid() and p.company_id=c.id and p.organization_id=c.organization_id and
 (p_action='view' or (p_action='edit' and p.can_edit) or (p_action='publish' and p.can_publish) or (p_action='comment' and p.can_comment)))))),false)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.set_branch_schedule_link(p_local text, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 clean_url text := nullif(btrim(p_url),'');
 target_org uuid;
begin
 select l.organization_id into target_org from public.rm_app_local l
 join public.rm_companies c
   on c.id=l.company_id and c.organization_id=l.organization_id
 where l.id=p_local;
 if target_org is null or rm_test_private.app_role()<>'owner'
   or not rm_test_private.manages_organization(target_org) then
   raise exception 'No tenés permiso para configurar los horarios de este local'
     using errcode='42501';
 end if;
 if clean_url is not null and (
   length(clean_url)>2048 or
   clean_url !~ '^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+/edit([?#].*)?$'
 ) then
   raise exception 'Ingresá una URL válida de Google Sheets' using errcode='22023';
 end if;
 insert into rm_test_private.branch_schedule_links(local_id,url,enabled)
 values(p_local,clean_url,true)
 on conflict(local_id) do update set url=excluded.url, enabled=true;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.sheet_local(p_path text, p_data jsonb, p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select l.id from public.rm_app_local l where (p_org is null or l.organization_id=p_org) and l.id=case
 when coalesce(p_data->>'local','')<>'' then p_data->>'local'
 when p_path ~ '^hojas/(enc[1-3]|staff[1-6])$' then 'dt' end
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.stamp_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin if new.data is distinct from old.data then new.updated_at=clock_timestamp(); end if; return new; end $function$;

CREATE OR REPLACE FUNCTION public.rm_app_access_requests()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_access_requests()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_access_state()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_access_state()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_admin_access(p_org uuid, p_email text, p_enable boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_admin_access(p_org,p_email,p_enable)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_allow_owner(p_email text, p_enable boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_allow_owner(p_email,p_enable)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_assign(p_user uuid, p_role text, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_assign(p_user,p_role,p_local,p_sheet)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_assign_manager(p_user uuid, p_company uuid, p_edit boolean, p_publish boolean, p_comment boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_assign_manager(p_user,p_company,p_edit,p_publish,p_comment)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_assign_manager_report(p_user uuid, p_company uuid, p_edit boolean, p_publish boolean, p_comment boolean, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select rm_test_private.rm_app_assign_manager_report(p_user,p_company,p_edit,p_publish,p_comment,p_local,p_sheet)
$function$;

CREATE OR REPLACE FUNCTION public.rm_app_branch_schedule_links(p_local text DEFAULT NULL::text, p_company uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select rm_test_private.branch_schedule_links(p_local,p_company)
$function$;

CREATE OR REPLACE FUNCTION public.rm_app_collaborator_preauthorizations()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_collaborator_preauthorizations()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_create_branch(p_company uuid, p_name text, p_cycle text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_create_branch(p_company,p_name,p_cycle)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_create_company(p_org uuid, p_name text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_create_company(p_org,p_name)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_create_join_link(p_company uuid, p_local text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_create_join_link(p_company,p_local)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_create_local(p_name text, p_cycle text, p_owner uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_create_local(p_name,p_cycle,p_owner)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_create_owner(p_email text, p_name text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_create_owner(p_email,p_name)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_invite(p_org uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_invite(p_org,p_email)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_join_as_owner(p_number text, p_code text, p_accept boolean)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_join_as_owner(p_number,p_code,p_accept)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_join_by_link(p_token text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_join_by_link(p_token)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_join_links(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_join_links(p_company)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_join_preview(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_join_preview(p_token)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_linked_companies(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select rm_test_private.linked_companies(p_company) $function$;

CREATE OR REPLACE FUNCTION public.rm_app_locals()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_locals()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_me()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_me()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_open_report()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_open_report()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_organizations()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_organizations()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_owner_count()
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_owner_count()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_owner_invitations()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_owner_invitations()$function$;

CREATE OR REPLACE FUNCTION public.rm_app_owner_join_code(p_org uuid, p_rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_owner_join_code(p_org,p_rotate)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_preauthorize_collaborator(p_company uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.rm_app_preauthorize_collaborator(p_company,p_email)$function$;

CREATE OR REPLACE FUNCTION public.rm_app_publish_private_report(p_sheet text, p_image text, p_version timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select rm_test_private.publish_private_report(p_sheet,p_image,p_version)$function$;
