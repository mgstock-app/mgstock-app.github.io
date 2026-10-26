-- GESTLOK · Administración de empleados: funciones, parte 9 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_open_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text;v timestamptz;a public.rm_test_report_access;t timestamptz;
begin
 if rm_test_private.uid() is null or rm_test_private.app_role()<>'employee' or not rm_test_private.allowed('view_reports') then raise exception 'Opening not permitted' using errcode='42501'; end if;
 s=rm_test_private.app_sheet();select updated_at into v from public.rm_test_documents where path='hojas/'||s for share;
 if v is null then raise exception 'Report unavailable'; end if;
 insert into public.rm_test_report_access(user_id,sheet_id,report_version) values(rm_test_private.uid(),s,v) on conflict(user_id) do nothing;
 select * into a from public.rm_test_report_access where user_id=rm_test_private.uid() for update;
 if a.sheet_id<>s or a.report_version is distinct from v or a.opened_at is null then
  t=clock_timestamp();update public.rm_test_report_access set sheet_id=s,report_version=v,opened_at=t,expires_at=t+interval '24 hours',requested_at=null where user_id=rm_test_private.uid();
  
 elsif a.expires_at<=clock_timestamp() then raise exception 'A new approval is required' using errcode='42501';
 end if;
 return public.rm_test_access_state();
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_request_access()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.uid() is null or rm_test_private.app_role()<>'employee' or not rm_test_private.allowed('reopen_access') then raise exception 'Request not permitted' using errcode='42501'; end if;
 update public.rm_test_report_access set requested_at=coalesce(requested_at,clock_timestamp()) where user_id=rm_test_private.uid() and sheet_id=rm_test_private.app_sheet() and expires_at<=clock_timestamp();
 if not found then raise exception 'Only expired access can be requested'; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_restore_report_data(p_copy jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h jsonb;r jsonb;
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() not in ('admin','owner') or not rm_test_private.allowed('restore') or not rm_test_private.allowed('backups') then raise exception 'Restoration not permitted' using errcode='42501'; end if;
 if jsonb_typeof(p_copy->'hojas') is distinct from 'array' or jsonb_array_length(p_copy->'hojas')>1000 then raise exception 'Invalid backup'; end if;
 insert into rm_test_private.restore_snapshots(actor,documents) select rm_test_private.uid(),coalesce(jsonb_agg(jsonb_build_object('path',path,'data',data)),'[]') from public.rm_test_documents where collection='hojas' or collection like 'hojas/%/historial' or path='ajustes/tema';
 for h in select value from jsonb_array_elements(p_copy->'hojas') loop
  if h->>'id' is null or h->>'id' !~ '^[A-Za-z0-9_-]+$' or jsonb_typeof(h->'datos') is distinct from 'object' or jsonb_typeof(h->'historial') is distinct from 'array' then raise exception 'Invalid backup sheet'; end if;
  insert into public.rm_test_documents(path,data) values('hojas/'||(h->>'id'),h->'datos') on conflict(path) do update set data=excluded.data;
  for r in select value from jsonb_array_elements(h->'historial') loop
   if r->>'id' is null or r->>'id' !~ '^[A-Za-z0-9_-]+$' or jsonb_typeof(r->'datos') is distinct from 'object' then raise exception 'Invalid history'; end if;
   insert into public.rm_test_documents(path,data) values('hojas/'||(h->>'id')||'/historial/'||(r->>'id'),r->'datos') on conflict(path) do update set data=excluded.data;
  end loop;
 end loop;
 if p_copy->'ajustes'->'tema'->>'tono' in ('marino','petroleo','verde','bordo','grafito') then insert into public.rm_test_documents(path,data) values('ajustes/tema',p_copy->'ajustes'->'tema') on conflict(path) do update set data=excluded.data; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_review_access(p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.uid() is null or rm_test_private.app_role() not in ('admin','owner') or not rm_test_private.allowed('reopen_access') then raise exception 'Reviewer required' using errcode='42501'; end if;
 update public.rm_test_report_access set opened_at=case when p_approve then null else opened_at end,expires_at=case when p_approve then null else expires_at end,requested_at=null,reviewed_by=rm_test_private.uid(),reviewed_at=clock_timestamp() where user_id=p_user and requested_at is not null;
 if not found then raise exception 'Pending request not found'; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_review_registration(p_user uuid, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not rm_test_private.allowed('manage_collaborators') then raise exception 'Review not permitted' using errcode='42501'; end if;
 perform rm_test_private.rm_test_review_registration_internal(p_user,p_local,p_sheet);
 delete from public.rm_test_report_access where user_id=p_user and sheet_id<>p_sheet;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_review_registration_internal(p_user uuid, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare reviewer uuid:=rm_test_private.uid(); previous public.rm_test_registrations; sheet_local text;
begin
 if reviewer is null or coalesce(rm_test_private.app_role(),'') not in ('owner','admin') then raise exception 'Reviewer required' using errcode='42501'; end if;
 if p_local is null or p_local not in ('dt','munro') then raise exception 'Invalid local'; end if;
 select * into previous from public.rm_test_registrations where user_id=p_user for update;
 if not found then raise exception 'Registration not found'; end if;
 if exists(select 1 from public.rm_test_members where user_id=p_user and role in ('owner','admin')) then raise exception 'Privileged account cannot be reassigned' using errcode='42501'; end if;
 select data->>'local' into sheet_local from public.rm_test_documents where path='hojas/'||p_sheet for update;
 if sheet_local is distinct from p_local then raise exception 'Sheet does not belong to selected local'; end if;
 insert into public.rm_test_members(user_id,role,sheet_id) values(p_user,'employee',p_sheet)
 on conflict(user_id) do update set sheet_id=excluded.sheet_id where public.rm_test_members.role='employee';
 update public.rm_test_registrations set status='approved',approved_local=p_local,sheet_id=p_sheet,reviewed_by=reviewer,reviewed_at=now() where user_id=p_user;
 insert into rm_test_private.registration_audit(user_id,reviewer,previous_local,approved_local,previous_sheet,sheet_id)
 values(p_user,reviewer,previous.approved_local,p_local,previous.sheet_id,p_sheet);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_set_permission(p_role text, p_action text, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.uid() is null or rm_test_private.app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_role='employee' and p_action not in ('view_reports','reopen_access','export_reports') then raise exception 'Employees cannot receive privileged actions'; end if;
 update public.rm_test_permissions set enabled=p_enabled where target_role=p_role and action=p_action;
 if not found then raise exception 'Invalid permission'; end if;
 insert into rm_test_private.permission_audit(actor,target_role,action,enabled) values(rm_test_private.uid(),p_role,p_action,p_enabled);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_test_submit_registration(p_name text, p_local text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=rm_test_private.uid(); e text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_local not in ('dt','munro') or p_local is null or length(trim(p_name)) not between 1 and 120 or p_name is null then raise exception 'Invalid registration'; end if;
 select email into e from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if e is null then raise exception 'Confirmed account required' using errcode='42501'; end if;
 if exists(select 1 from public.rm_test_members where user_id=u) then raise exception 'Account already assigned' using errcode='42501'; end if;
 insert into public.rm_test_registrations(user_id,email,display_name,requested_local)
 values(u,e,trim(p_name),p_local) on conflict(user_id) do nothing;
end $function$;
