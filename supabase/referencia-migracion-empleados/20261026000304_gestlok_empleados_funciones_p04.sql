-- GESTLOK · Administración de empleados: funciones, parte 4 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_assign(p_user uuid, p_role text, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.rm_test_members; org uuid; target_org uuid; assigned_sheet text:=p_sheet; name_value text;
begin
 if rm_test_private.app_role() not in ('admin','owner') or p_user is null or p_user=rm_test_private.uid() then raise exception 'Assignment not permitted' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(216103);
 select * into previous from public.rm_test_members where user_id=p_user for update;
 select organization_id into target_org from public.rm_organization_members where user_id=p_user for update;
 select organization_id into org from public.rm_app_local where id=p_local;
 if p_role is distinct from 'employee' or (previous.role is not null and previous.role not in ('employee','manager')) or org is distinct from target_org or not rm_test_private.manages_organization(org) then raise exception 'Solo se asignan colaboradores del mismo espacio' using errcode='42501'; end if;
 select display_name into name_value from public.rm_app_directory where user_id=p_user for update;
 if assigned_sheet is null or assigned_sheet='' then
  assigned_sheet=replace(gen_random_uuid()::text,'-','');
  insert into public.rm_test_documents(path,data) values('hojas/'||assigned_sheet,jsonb_build_object('nombre',name_value,'nombreHoja',name_value,'local',p_local,'puesto','staff','orden',extract(epoch from clock_timestamp())*1000,'items','{}'::jsonb,'tarifas','{}'::jsonb));
 elsif not exists(select 1 from public.rm_test_documents where path='hojas/'||assigned_sheet and organization_id=org and rm_test_private.sheet_local(path,data,organization_id)=p_local) then raise exception 'La hoja no pertenece al local'; end if;
 if exists(select 1 from public.rm_test_members where user_id<>p_user and sheet_id=assigned_sheet and role in ('employee','manager')) then raise exception 'La hoja ya está asignada a otra persona'; end if;
 delete from public.rm_manager_permissions where user_id=p_user; insert into public.rm_test_members(user_id,role,sheet_id,local_id) values(p_user,'employee',assigned_sheet,p_local) on conflict(user_id) do update set role=excluded.role,sheet_id=excluded.sheet_id,local_id=excluded.local_id;
 update public.rm_app_directory set status='approved' where user_id=p_user;
 if previous.sheet_id is distinct from assigned_sheet or previous.local_id is distinct from p_local then delete from public.rm_test_report_access where user_id=p_user; end if;
 insert into rm_test_private.account_audit(actor,target,action,before_value,after_value) values(rm_test_private.uid(),p_user,'assign',to_jsonb(previous),jsonb_build_object('organization_id',org,'local',p_local,'sheet',assigned_sheet));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_assign_manager(p_user uuid, p_company uuid, p_edit boolean, p_publish boolean, p_comment boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; target_org uuid; previous public.rm_test_members;
begin
 perform pg_advisory_xact_lock(216103);
 select organization_id into org from public.rm_companies where id=p_company;
 select organization_id into target_org from public.rm_organization_members where user_id=p_user for update;
 select * into previous from public.rm_test_members where user_id=p_user for update;
 if not rm_test_private.manages_organization(org) or org is distinct from target_org or p_user=rm_test_private.uid() or previous.role in ('owner','admin') or p_edit is null or p_publish is null or p_comment is null or (p_publish and not p_edit) then raise exception 'No podés asignar ese gerente o esos permisos' using errcode='42501'; end if;
 insert into public.rm_manager_permissions(user_id,company_id,organization_id,can_edit,can_publish,can_comment) values(p_user,p_company,org,true,p_publish,p_comment) on conflict(user_id) do update set company_id=excluded.company_id,can_edit=excluded.can_edit,can_publish=excluded.can_publish,can_comment=excluded.can_comment;
 insert into public.rm_test_members(user_id,role) values(p_user,'manager') on conflict(user_id) do update set role='manager',local_id=case when exists(select 1 from public.rm_app_local l where l.id=previous.local_id and l.company_id=p_company) then previous.local_id end,sheet_id=case when exists(select 1 from public.rm_app_local l where l.id=previous.local_id and l.company_id=p_company) then previous.sheet_id end;
 update public.rm_app_directory set status='approved' where user_id=p_user;
 delete from public.rm_test_report_access a where a.user_id=p_user and not exists(select 1 from public.rm_test_members m where m.user_id=p_user and m.sheet_id=a.sheet_id);
 insert into rm_test_private.account_audit(actor,target,action,before_value,after_value) values(rm_test_private.uid(),p_user,'assign_manager',to_jsonb(previous),jsonb_build_object('company_id',p_company,'edit',p_edit,'publish',p_publish,'comment',p_comment));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_assign_manager_report(p_user uuid, p_company uuid, p_edit boolean, p_publish boolean, p_comment boolean, p_local text, p_sheet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(216103);
 if p_edit is distinct from true or not exists(
   select 1 from public.rm_app_local l where l.id=p_local and l.company_id=p_company
     and rm_test_private.manages_organization(l.organization_id)
 ) then raise exception 'Elegí un local de la empresa del gerente' using errcode='42501'; end if;
 perform rm_test_private.rm_app_assign(p_user,'employee',p_local,p_sheet);
 perform rm_test_private.rm_app_assign_manager(p_user,p_company,true,p_publish,p_comment);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_collaborator_preauthorizations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() is distinct from 'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('email',i.email,'company_id',c.id,'company_name',c.name,'created_at',i.created_at,
 'registered',exists(select 1 from public.rm_app_directory d where lower(d.email)=i.email)) order by i.created_at desc),'[]')
 from rm_test_private.organization_invitations i join public.rm_companies c on c.id=i.company_id
 where rm_test_private.manages_organization(i.organization_id));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_create_branch(p_company uuid, p_name text, p_cycle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; owner_uid uuid;
begin
 select c.organization_id,o.owner_id into org,owner_uid from public.rm_companies c join public.rm_organizations o on o.id=c.organization_id where c.id=p_company;
 if not rm_test_private.manages_organization(org) then raise exception 'Local not permitted' using errcode='42501'; end if;
 insert into public.rm_app_local(id,name,cycle,owner_id,organization_id,company_id) values(replace(gen_random_uuid()::text,'-',''),btrim(p_name),p_cycle,owner_uid,org,p_company);
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_create_company(p_org uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not rm_test_private.manages_organization(p_org) then raise exception 'Company not permitted' using errcode='42501'; end if;
 insert into public.rm_companies(organization_id,name) values(p_org,btrim(p_name));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_create_join_link(p_company uuid, p_local text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; result rm_test_private.join_links;
begin
 select organization_id into org from public.rm_companies where id=p_company;
 if not rm_test_private.manages_organization(org) then raise exception 'Invitation not permitted' using errcode='42501'; end if;
 if p_local is not null and not exists(select 1 from public.rm_app_local where id=p_local and company_id=p_company and organization_id=org) then raise exception 'Sucursal inválida'; end if;
 insert into rm_test_private.join_links(token,organization_id,company_id,local_id,created_by) values(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),org,p_company,p_local,rm_test_private.uid()) returning * into result;
 return jsonb_build_object('id',result.id,'token',result.token,'expires_at',result.expires_at,'company_id',result.company_id,'local_id',result.local_id,'uses',0,'max_uses',result.max_uses);
end $function$;
