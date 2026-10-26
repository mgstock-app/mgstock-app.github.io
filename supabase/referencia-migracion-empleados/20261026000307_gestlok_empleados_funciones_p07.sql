-- GESTLOK · Administración de empleados: funciones, parte 7 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_register_choice(p_kind text, p_name text, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; current_kind text;
begin
 if not rm_test_private.ensure_directory() then raise exception 'Google account required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('owner','collaborator') or p_accept is distinct from true then raise exception 'Elegí el tipo de cuenta y confirmá la creación de tu cuenta'; end if;
 perform pg_advisory_xact_lock(216103);
 select account_kind into current_kind from public.rm_app_directory where user_id=rm_test_private.uid() for update;
 if not found then raise exception 'Confirmed account required' using errcode='42501'; end if;
 if exists(select 1 from public.rm_app_directory where user_id=rm_test_private.uid() and status='rejected') then raise exception 'Tu cuenta necesita revisión de la administración' using errcode='42501'; end if;
 if exists(select 1 from public.rm_test_members where user_id=rm_test_private.uid()) then raise exception 'Tu cuenta ya tiene un rol asignado'; end if;
 if p_kind='owner' then
  if not exists(select 1 from rm_test_private.personal_owner_allowlist a join public.rm_app_directory d on lower(d.email)=a.email where d.user_id=rm_test_private.uid()) then raise exception 'La administración debe autorizar tu correo para crear una cuenta de dueño' using errcode='42501'; end if;
  if exists(select 1 from public.rm_organization_members where user_id=rm_test_private.uid()) then raise exception 'Tu cuenta ya pertenece a un espacio'; end if;
  insert into public.rm_organizations(name,owner_id,created_by) values(btrim(p_name),rm_test_private.uid(),rm_test_private.uid()) returning id into org;
  insert into public.rm_organization_members(user_id,organization_id) values(rm_test_private.uid(),org);
  insert into public.rm_test_members(user_id,role) values(rm_test_private.uid(),'owner');
  update public.rm_app_directory set account_kind='owner',status='approved' where user_id=rm_test_private.uid();
 else update public.rm_app_directory set account_kind='collaborator' where user_id=rm_test_private.uid();
 end if;
 insert into rm_test_private.account_audit(actor,target,action,after_value) values(rm_test_private.uid(),rm_test_private.uid(),'registration_choice',jsonb_build_object('kind',p_kind,'accepted_account_creation',true,'organization_id',org));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_reject(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid;
begin
 select organization_id into org from public.rm_organization_members where user_id=p_user;
 if p_user=rm_test_private.uid() or not rm_test_private.manages_organization(org) or exists(select 1 from public.rm_test_members where user_id=p_user and role in ('owner','admin')) then raise exception 'Review not permitted' using errcode='42501'; end if;
 update public.rm_app_directory set status='rejected' where user_id=p_user;
 delete from public.rm_test_report_access where user_id=p_user;
 insert into rm_test_private.account_audit(actor,target,action) values(rm_test_private.uid(),p_user,'reject');
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_report_image()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if rm_test_private.app_role() not in ('employee','manager') then raise exception 'Employee required' using errcode='42501'; end if;
 select jsonb_build_object('image',i.image,'expires_at',a.expires_at,'server_now',clock_timestamp()) into result
 from public.rm_app_images i join public.rm_test_report_access a on a.sheet_id=i.sheet_id and a.report_version=i.published_at
 join public.rm_test_documents d on d.path='hojas/'||i.sheet_id and d.updated_at=i.report_version
 where a.user_id=rm_test_private.uid() and a.sheet_id=rm_test_private.app_sheet() and a.opened_at is not null and a.expires_at>clock_timestamp();
 if result is null then raise exception 'La consulta no está habilitada' using errcode='42501'; end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_request_access()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() not in ('employee','manager') then raise exception 'Employee required' using errcode='42501'; end if;
 update public.rm_test_report_access set requested_at=coalesce(requested_at,clock_timestamp()) where user_id=rm_test_private.uid() and sheet_id=rm_test_private.app_sheet() and expires_at<=clock_timestamp();
 if not found then raise exception 'Solo podés solicitar acceso después del vencimiento'; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_restore(p_copy jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin raise exception 'Elegí un espacio para restaurar' using errcode='42501'; end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_restore_organization(p_org uuid, p_copy jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h jsonb; r jsonb;
begin
 if not rm_test_private.manages_organization(p_org) then raise exception 'Restore not permitted' using errcode='42501'; end if;
 if jsonb_typeof(p_copy->'hojas') is distinct from 'array' or jsonb_array_length(p_copy->'hojas')>1000 then raise exception 'Invalid backup'; end if;
 for h in select value from jsonb_array_elements(p_copy->'hojas') loop
  if h->>'id' is null or h->>'id' !~ '^[A-Za-z0-9_-]+$' or jsonb_typeof(h->'datos') is distinct from 'object' or jsonb_typeof(h->'historial') is distinct from 'array' or not exists(select 1 from public.rm_app_local where id=rm_test_private.sheet_local('hojas/'||(h->>'id'),h->'datos',p_org) and organization_id=p_org) or exists(select 1 from public.rm_test_documents where path='hojas/'||(h->>'id') and organization_id<>p_org) then raise exception 'La copia contiene datos de otro espacio' using errcode='42501'; end if;
  for r in select value from jsonb_array_elements(h->'historial') loop
   if r->>'id' is null or r->>'id' !~ '^[A-Za-z0-9_-]+$' or jsonb_typeof(r->'datos') is distinct from 'object' then raise exception 'Invalid history'; end if;
  end loop;
 end loop;
 insert into rm_test_private.restore_snapshots(actor,documents) select rm_test_private.uid(),coalesce(jsonb_agg(jsonb_build_object('path',path,'data',data,'organization_id',organization_id)),'[]') from public.rm_test_documents where organization_id=p_org;
 for h in select value from jsonb_array_elements(p_copy->'hojas') loop
  insert into public.rm_test_documents(path,data,organization_id) values('hojas/'||(h->>'id'),h->'datos',p_org) on conflict(path) do update set data=excluded.data;
  for r in select value from jsonb_array_elements(h->'historial') loop
   insert into public.rm_test_documents(path,data,organization_id) values('hojas/'||(h->>'id')||'/historial/'||(r->>'id'),r->'datos',p_org) on conflict(path) do update set data=excluded.data;
  end loop;
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_review_access(p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if rm_test_private.app_role() not in ('admin','owner') or p_approve is null or not coalesce((select rm_test_private.manages_local(local_id) from public.rm_test_members where user_id=p_user),false) then raise exception 'Review not permitted' using errcode='42501'; end if;
 update public.rm_test_report_access set opened_at=case when p_approve then null else opened_at end,expires_at=case when p_approve then null else expires_at end,requested_at=null,reviewed_by=rm_test_private.uid(),reviewed_at=clock_timestamp() where user_id=p_user and requested_at is not null;
 if not found then raise exception 'No hay una solicitud pendiente'; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_revoke_join_link(p_link uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update rm_test_private.join_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_link and rm_test_private.manages_organization(organization_id);
 if not found then raise exception 'Invitation not permitted' using errcode='42501'; end if;
end $function$;
