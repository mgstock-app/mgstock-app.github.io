-- GESTLOK · Administración de empleados: funciones, parte 5 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_create_local(p_name text, p_cycle text, p_owner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin raise exception 'Elegí una empresa para crear su sucursal' using errcode='42501'; end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_create_owner(p_email text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid; org uuid;
begin
 if rm_test_private.app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(216103);
 select d.user_id into target from public.rm_app_directory d where lower(d.email)=lower(btrim(p_email)) and d.status<>'rejected';
 if target is null or exists(select 1 from public.rm_organization_members where user_id=target) or exists(select 1 from public.rm_test_members where user_id=target) then raise exception 'La cuenta debe registrarse en GESTLOK y estar disponible para un espacio nuevo'; end if;
 insert into public.rm_organizations(name,owner_id,created_by) values(btrim(p_name),target,rm_test_private.uid()) returning id into org;
 insert into public.rm_organization_admins values(org,rm_test_private.uid(),rm_test_private.uid());
 insert into public.rm_organization_members(user_id,organization_id) values(target,org);
 insert into public.rm_test_members(user_id,role) values(target,'owner');
 update public.rm_app_directory set status='approved' where user_id=target;
 insert into rm_test_private.account_audit(actor,target,action,after_value) values(rm_test_private.uid(),target,'create_owner',jsonb_build_object('organization_id',org));
 return org;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not rm_test_private.ensure_directory() then raise exception 'Google account required' using errcode='42501'; end if;
 select jsonb_build_object('user_id',d.user_id,'email',d.email,'display_name',d.display_name,'status',d.status,'created_at',d.created_at,'role',m.role,'local_id',m.local_id,'local_name',l.name,'sheet_id',m.sheet_id,'organization_id',om.organization_id,'owner_public_id',case when m.role='owner' then o.owner_number end,
 'manager_company_id',p.company_id,'schedule_permissions',case when m.role='manager' then jsonb_build_object('edit',p.can_edit,'publish',p.can_publish,'comment',p.can_comment) end) into result
 from public.rm_app_directory d left join public.rm_test_members m using(user_id) left join public.rm_app_local l on l.id=m.local_id left join public.rm_organization_members om on om.user_id=d.user_id left join public.rm_organizations o on o.id=om.organization_id left join public.rm_manager_permissions p on p.user_id=d.user_id where d.user_id=rm_test_private.uid();
 if result is null then raise exception 'Confirmed account required' using errcode='42501'; end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_invite(p_org uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid;
begin
 if not rm_test_private.manages_organization(p_org) then raise exception 'Invitation not permitted' using errcode='42501'; end if;
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Correo inválido'; end if;
 perform pg_advisory_xact_lock(216103);
 select user_id into target from public.rm_app_directory where lower(email)=lower(btrim(p_email));
 if exists(select 1 from public.rm_organization_members where user_id=target and organization_id<>p_org) or exists(select 1 from public.rm_test_members where user_id=target and role in ('owner','admin')) or exists(select 1 from rm_test_private.organization_invitations where email=lower(btrim(p_email)) and organization_id<>p_org) then raise exception 'No se puede vincular esa cuenta'; end if;
 insert into rm_test_private.organization_invitations(email,organization_id,invited_by) values(lower(btrim(p_email)),p_org,rm_test_private.uid()) on conflict(email) do nothing;
 if target is not null then insert into public.rm_organization_members(user_id,organization_id) values(target,p_org) on conflict(user_id) do nothing; end if;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_join_as_owner(p_number text, p_code text, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid; existing_org uuid; assigned_role text;
begin
 if not rm_test_private.ensure_directory()
 or not exists(select 1 from public.rm_app_directory where user_id=rm_test_private.uid() and status<>'rejected')
 then raise exception 'Cuenta Google habilitada requerida' using errcode='42501'; end if;
 if p_accept is distinct from true then raise exception 'Confirmá tu incorporación como dueño'; end if;
 perform pg_advisory_xact_lock(216103);
 select o.id into org from public.rm_organizations o join rm_test_private.owner_join_codes c on c.organization_id=o.id
 where o.owner_number=btrim(p_number) and c.token=btrim(p_code) and c.expires_at>clock_timestamp();
 if org is null then raise exception 'El ID o código no es válido, fue renovado o venció'; end if;
 select organization_id into existing_org from public.rm_organization_members where user_id=rm_test_private.uid() for update;
 select role into assigned_role from public.rm_test_members where user_id=rm_test_private.uid() for update;
 if existing_org=org and assigned_role='owner' then return; end if;
 if assigned_role is not null or existing_org is not null then raise exception 'Tu cuenta ya tiene una asignación. Usá una cuenta nueva para incorporarte como dueño.' using errcode='42501'; end if;
 insert into public.rm_organization_members(user_id,organization_id) values(rm_test_private.uid(),org);
 insert into public.rm_test_members(user_id,role) values(rm_test_private.uid(),'owner');
 update public.rm_app_directory set account_kind='owner',status='approved' where user_id=rm_test_private.uid();
 insert into rm_test_private.account_audit(actor,target,action,after_value)
 values(rm_test_private.uid(),rm_test_private.uid(),'join_as_owner',jsonb_build_object('organization_id',org));
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_join_by_link(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare link rm_test_private.join_links; existing_org uuid;
begin
 if not rm_test_private.ensure_directory() then raise exception 'Google account required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(216103);
 select * into link from rm_test_private.join_links where token=p_token for update;
 if not found or link.revoked_at is not null or link.expires_at<=clock_timestamp() then raise exception 'El enlace venció, fue revocado o no es válido'; end if;
 if exists(select 1 from public.rm_test_members where user_id=rm_test_private.uid() and role in ('admin','owner')) then raise exception 'Una cuenta de dueño o administración no puede incorporarse como colaborador'; end if;
 select organization_id into existing_org from public.rm_organization_members where user_id=rm_test_private.uid() for update;
 if existing_org is not null and existing_org<>link.organization_id then raise exception 'Ya pertenecés a otro espacio privado' using errcode='42501'; end if;
 if exists(select 1 from rm_test_private.join_redemptions where link_id=link.id and user_id=rm_test_private.uid()) then return; end if;
 if link.uses>=link.max_uses then raise exception 'El enlace alcanzó su límite'; end if;
 insert into public.rm_organization_members(user_id,organization_id) values(rm_test_private.uid(),link.organization_id) on conflict(user_id) do nothing;
 update public.rm_app_directory set account_kind='collaborator' where user_id=rm_test_private.uid();
 insert into rm_test_private.join_redemptions(link_id,user_id) values(link.id,rm_test_private.uid());
 update rm_test_private.join_links set uses=uses+1 where id=link.id;
 insert into rm_test_private.account_audit(actor,target,action,after_value) values(rm_test_private.uid(),rm_test_private.uid(),'join_request',jsonb_build_object('organization_id',link.organization_id,'company_id',link.company_id,'local_id',link.local_id));
end $function$;
