-- GESTLOK · Administración de empleados: funciones, parte 1 de 11 (adaptadas de ReciboNet: identidad por correo confirmado).
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION rm_test_private.activate_preapproved_shared_owner()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := rm_test_private.uid();
  validated_email text;
  target_organization uuid;
  existing_organization uuid;
  existing_role text;
begin
  if auth.uid() is null or current_user_id is null then return false; end if;

  -- Never trust the email, role, or company from the browser or profile metadata.
  -- The confirmed GESTLOK account email must match the directory email.
  select lower(btrim(u.email)) into validated_email
  from auth.users u join public.rm_app_directory d on d.user_id=current_user_id
  where u.id=auth.uid() and u.email_confirmed_at is not null
    and d.status<>'rejected'
    and lower(btrim(d.email))=lower(btrim(u.email))
    and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email',''));
  if validated_email is null then return false; end if;

  -- Normal sign-ins do not take the lock. Only an outstanding, exact-match
  -- authorization reaches the privileged part of the flow.
  if not exists(select 1 from rm_test_private.preapproved_shared_owners
                where email=validated_email and activated_at is null) then
    return false;
  end if;
  perform pg_advisory_xact_lock(216103);
  select a.organization_id into target_organization
  from rm_test_private.preapproved_shared_owners a
  join public.rm_organizations o on o.id=a.organization_id and o.owner_id is not null
  where a.email=validated_email and a.activated_at is null
  for update of a;
  if target_organization is null then return false; end if;

  select m.organization_id into existing_organization
  from public.rm_organization_members m where m.user_id=current_user_id for update;
  select m.role into existing_role
  from public.rm_test_members m where m.user_id=current_user_id for update;

  -- No takeover/transfer of an already-assigned account.
  -- An account already a co-owner of this same organization is idempotent.
  if existing_organization is not null or existing_role is not null then
    if existing_organization=target_organization and existing_role='owner' then
      update rm_test_private.preapproved_shared_owners
      set activated_by=current_user_id, activated_at=clock_timestamp()
      where email=validated_email;
    end if;
    return false;
  end if;

  insert into public.rm_organization_members(user_id,organization_id)
    values(current_user_id,target_organization);
  insert into public.rm_test_members(user_id,role)
    values(current_user_id,'owner');
  update public.rm_app_directory set status='approved',account_kind='owner'
    where user_id=current_user_id;
  update rm_test_private.preapproved_shared_owners
    set activated_by=current_user_id,activated_at=clock_timestamp()
    where email=validated_email;

  insert into rm_test_private.account_audit(actor,target,action,after_value)
    values(current_user_id,current_user_id,'activate_verified_shared_owner',
      jsonb_build_object('organization_id',target_organization,
        'registration_method','approved_google_email'));
  return true;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.allowed(p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(rm_test_private.uid() is not null and (rm_test_private.app_role()='admin' or
 (rm_test_private.app_role()='owner' and p_action in ('view_reports','view_history','edit_reports','delete_reports','manage_collaborators','reopen_access','export_reports','backups')) or
 (rm_test_private.app_role()='employee' and p_action in ('view_reports','reopen_access'))),false)
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select m.role from public.rm_test_members m join public.rm_app_directory d using(user_id)
 where m.user_id=rm_test_private.uid() and d.status='approved' and rm_test_private.verified_email(d.email)
 and (m.role='admin' or (m.role='owner' and exists(select 1 from public.rm_organizations o join public.rm_organization_members om on om.organization_id=o.id where om.user_id=m.user_id))
 or (m.role='manager' and exists(select 1 from public.rm_manager_permissions p where p.user_id=m.user_id))
 or (m.role='employee' and exists(select 1 from public.rm_organization_members om join public.rm_app_local l on l.organization_id=om.organization_id where om.user_id=m.user_id and l.id=m.local_id)))),'')
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.app_sheet()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select m.sheet_id from public.rm_test_members m
 join public.rm_organization_members om using(user_id)
 join public.rm_app_local l on l.id=m.local_id and l.organization_id=om.organization_id
 join public.rm_test_documents d on d.path='hojas/'||m.sheet_id
   and d.organization_id=om.organization_id and rm_test_private.sheet_local(d.path,d.data,d.organization_id)=m.local_id
 where m.user_id=rm_test_private.uid() and (
   rm_test_private.app_role()='employee' or
   (rm_test_private.app_role()='manager' and exists(
     select 1 from public.rm_manager_permissions p where p.user_id=m.user_id
       and p.company_id=l.company_id and p.organization_id=om.organization_id)))
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.assign_owner_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare y integer; n integer;
begin
 if tg_op='UPDATE' and old.owner_number is not null then
  if new.owner_number is distinct from old.owner_number or new.owner_id is distinct from old.owner_id then raise exception 'El ID del dueño es permanente'; end if;
  return new;
 end if;
 if new.owner_id is null then new.owner_number=null; return new; end if;
 y=extract(year from new.created_at at time zone 'America/Argentina/Buenos_Aires');
 insert into rm_test_private.owner_code_counters(year,last_number) values(y,1)
 on conflict(year) do update set last_number=owner_code_counters.last_number+1 returning last_number into n;
 new.owner_number=y::text||lpad(n::text,3,'0');
 return new;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into rm_test_private.change_audit(actor,entity,operation,before_value,after_value)
 values(rm_test_private.uid(),tg_table_schema||'.'||tg_table_name,tg_op,
 case when tg_op<>'INSERT' then to_jsonb(old)-'image' end,
 case when tg_op<>'DELETE' then to_jsonb(new)-'image' end);
 return null;
end $function$;

CREATE OR REPLACE FUNCTION rm_test_private.branch_schedule_links(p_local text, p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(
   jsonb_build_object('local_id',l.id,'local_name',l.name,'url',s.url)
   order by l.name,l.id),'[]'::jsonb)
 from public.rm_app_local l
 left join rm_test_private.branch_schedule_links s on s.local_id=l.id
 where (s.local_id is null or s.enabled)
   and (p_local is not null or p_company is not null)
   and (p_local is null or l.id=p_local)
   and (p_company is null or l.company_id=p_company)
   and (
     ((rm_test_private.app_role()='owner' or rm_test_private.is_general_administrator())
       and rm_test_private.manages_organization(l.organization_id))
     or (rm_test_private.app_role()='manager' and exists(
       select 1 from public.rm_manager_permissions p
       join public.rm_organization_members m
         on m.user_id=p.user_id and m.organization_id=p.organization_id
       where p.user_id=rm_test_private.uid() and p.company_id=l.company_id
         and p.organization_id=l.organization_id and p.can_edit
     ))
   );
$function$;
