-- Espacios nativos de Empleados para empresas GESTLOK, sin depender de ReciboNet.
-- No reemplaza vínculos históricos ni asignaciones importadas. Solo agrega espacios propios.
create table gestlok_platform.employee_owners (
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 email text not null check(email=lower(btrim(email))),
 user_id uuid not null unique default gen_random_uuid(),
 primary key(tenant_id,email)
);
alter table gestlok_platform.employee_owners enable row level security;
revoke all on gestlok_platform.employee_owners from public,anon,authenticated;

-- Conservar intacta la resolución de identidad histórica como alternativa.
create function rm_test_private.uid_historical()
returns uuid language sql stable security definer set search_path=''
as $$
 select coalesce((select m.old_user_id from auth.users u
 join rm_test_private.identity_map m on m.email=lower(btrim(u.email))
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email',''))),auth.uid())
$$;
revoke all on function rm_test_private.uid_historical() from public,anon,authenticated;

create or replace function rm_test_private.uid()
returns uuid language sql stable security definer set search_path=''
as $$
 select coalesce((select e.user_id
 from auth.users u join gestlok_platform.employee_owners e on e.email=lower(btrim(u.email))
 join gestlok_platform.recibonet_links k on k.tenant_id=e.tenant_id
 join gestlok_platform.company_modules cm on cm.tenant_id=e.tenant_id and cm.module='recibos_personal'
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and lower(btrim(u.email))=lower(coalesce(auth.jwt()->>'email',''))
 and e.tenant_id=gestlok_tenancy.current_tenant_id() and public.mi_rol()='dueno'
 and exists(select 1 from public.docs d where d.tenant_id=e.tenant_id and d.col='equipo'
   and lower(d.data->>'email')=e.email and d.data->>'rol'='dueno')),
 rm_test_private.uid_historical())
$$;
revoke all on function rm_test_private.uid() from public,anon;
grant execute on function rm_test_private.uid() to authenticated;

create function gestlok_platform.ensure_employee_space(p_tenant uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare c gestlok_platform.companies; k gestlok_platform.recibonet_links;
 v_owner uuid; v_org uuid; v_company uuid; v_number text; e record; v_user uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('employee-space:'||p_tenant::text,0));
 select * into c from gestlok_platform.companies where tenant_id=p_tenant;
 if not found then return;end if;
 select * into k from gestlok_platform.recibonet_links where tenant_id=p_tenant;
 -- Mi Gusto y cualquier vínculo importado se conservan exactamente como están.
 if found and k.evidence->>'source' is distinct from 'gestlok_native' then return;end if;
 if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='equipo'
  and d.data->>'rol'='dueno' and lower(d.data->>'email')=c.owner_email) then
  raise exception 'Empresa sin dueño autorizado';end if;
 insert into gestlok_platform.employee_owners(tenant_id,email) values(p_tenant,c.owner_email) on conflict do nothing;
 select user_id into v_owner from gestlok_platform.employee_owners where tenant_id=p_tenant and email=c.owner_email;
 if k.tenant_id is null then
  insert into public.rm_organizations(name,owner_id,created_by) values(c.name,v_owner,c.created_by) returning id,owner_number into v_org,v_number;
  insert into public.rm_companies(organization_id,name) values(v_org,c.name) returning id into v_company;
  insert into gestlok_platform.recibonet_links(tenant_id,organization_id,organization_number,internal_name,verified_by,evidence)
  values(p_tenant,v_org,v_number,left(c.name,80),c.created_by,jsonb_build_object('source','gestlok_native'));
  insert into gestlok_platform.company_modules(tenant_id,module,enabled,changed_by)
  values(p_tenant,'recibos_personal',true,c.created_by) on conflict do nothing;
  insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
  values(c.created_by,'employee_space_created',p_tenant,jsonb_build_object('organization_id',v_org,'source','gestlok_native'));
 else
  v_org:=k.organization_id;
  select id into v_company from public.rm_companies where organization_id=v_org order by id limit 1;
  if v_company is null then raise exception 'Espacio nativo incompleto';end if;
 end if;
 for e in select lower(d.data->>'email') email,coalesce(nullif(d.data->>'nombre',''),c.name) name
   from public.docs d where d.tenant_id=p_tenant and d.col='equipo' and d.data->>'rol'='dueno'
 loop
  insert into gestlok_platform.employee_owners(tenant_id,email) values(p_tenant,e.email) on conflict do nothing;
  select user_id into v_user from gestlok_platform.employee_owners where tenant_id=p_tenant and email=e.email;
  insert into public.rm_app_directory(user_id,email,display_name,status,account_kind) values(v_user,e.email,left(e.name,120),'approved','owner') on conflict do nothing;
  insert into public.rm_organization_members(user_id,organization_id) values(v_user,v_org) on conflict do nothing;
  insert into public.rm_test_members(user_id,role) values(v_user,'owner') on conflict do nothing;
 end loop;
 insert into public.rm_app_local(id,name,cycle,owner_id,organization_id,company_id)
 select d.id,left(coalesce(nullif(d.data->>'nombre',''),c.local_name),80),'mensual',v_owner,v_org,v_company
 from public.docs d where d.tenant_id=p_tenant and d.col='locales'
 on conflict do nothing;
end $$;
revoke all on function gestlok_platform.ensure_employee_space(uuid) from public,anon,authenticated;

create function gestlok_platform.provision_company_employees()
returns trigger language plpgsql security definer set search_path=''
as $$begin perform gestlok_platform.ensure_employee_space(new.tenant_id);return new;end$$;
revoke all on function gestlok_platform.provision_company_employees() from public,anon,authenticated;
create trigger gestlok_company_employees after insert on gestlok_platform.companies
for each row execute function gestlok_platform.provision_company_employees();

create function gestlok_platform.sync_employee_members()
returns trigger language plpgsql security definer set search_path=''
as $$begin
 if new.col in ('equipo','locales') and exists(select 1 from gestlok_platform.recibonet_links k
   where k.tenant_id=new.tenant_id and k.evidence->>'source'='gestlok_native') then
  perform gestlok_platform.ensure_employee_space(new.tenant_id);
 end if;
 return new;
end$$;
revoke all on function gestlok_platform.sync_employee_members() from public,anon,authenticated;
create trigger gestlok_employee_members after insert or update on public.docs
for each row execute function gestlok_platform.sync_employee_members();

-- Empresas ya creadas: aditivo e idempotente, nunca vincular PerCam con Alessandro/Juegosgame.
do $$declare t uuid;begin
 for t in select tenant_id from gestlok_platform.companies loop
  perform gestlok_platform.ensure_employee_space(t);
 end loop;
end$$;

CREATE OR REPLACE FUNCTION rm_test_private.app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select m.role from public.rm_test_members m join public.rm_app_directory d using(user_id)
 where m.user_id=rm_test_private.uid() and d.status='approved' and rm_test_private.verified_email(d.email)
 and not exists (select 1 from gestlok_platform.employee_owners e where e.user_id=m.user_id and not exists(select 1 from gestlok_platform.company_modules cm where cm.tenant_id=e.tenant_id and cm.module='recibos_personal' and cm.enabled))
 and (m.role='admin' or (m.role='owner' and exists(select 1 from public.rm_organizations o join public.rm_organization_members om on om.organization_id=o.id where om.user_id=m.user_id))
 or (m.role='manager' and exists(select 1 from public.rm_manager_permissions p where p.user_id=m.user_id))
 or (m.role='employee' and exists(select 1 from public.rm_organization_members om join public.rm_app_local l on l.organization_id=om.organization_id where om.user_id=m.user_id and l.id=m.local_id)))),'')
$function$;

CREATE OR REPLACE FUNCTION rm_test_private.rm_app_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_locals text[]; v_name text; v_email text;
begin
  if exists(select 1 from gestlok_platform.employee_owners e where e.user_id=rm_test_private.uid()) and rm_test_private.app_role()='' then
    raise exception 'Módulo de empleados no habilitado' using errcode='42501';
  end if;
  v_locals := rm_test_private.gestlok_gerente_locals();
  if coalesce(array_length(v_locals, 1), 0) > 0
     and rm_test_private.app_role() = ''
     and not exists (select 1 from public.rm_test_members mm where mm.user_id = rm_test_private.uid()) then
    select lower(btrim(u.email)), left(coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', ''), u.email, 'Gerente'), 120)
      into v_email, v_name from auth.users u where u.id = auth.uid();
    return jsonb_build_object('user_id', auth.uid(), 'email', v_email, 'display_name', v_name,
      'status', 'approved', 'role', null, 'local_id', null, 'local_name', null, 'sheet_id', null,
      'organization_id', null, 'owner_public_id', null, 'account_kind', null,
      'gestlok_gerente', jsonb_build_object('local_ids', to_jsonb(v_locals)));
  end if;
  perform rm_test_private.activate_preapproved_shared_owner();
  return rm_test_private.rm_app_identity()
    || jsonb_build_object('account_kind',
      (select d.account_kind from public.rm_app_directory d where d.user_id = rm_test_private.uid()));
end $function$;

