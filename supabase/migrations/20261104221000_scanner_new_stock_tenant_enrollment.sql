-- Scanner provisioning for NEW Stock tenants only.
-- Existing tenants, Mi Gusto and all existing grants remain untouched.
create table if not exists gestlok_platform.scanner_new_tenant_enrollment (
 tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete cascade,
 owner_email text not null,
 created_at timestamptz not null default now(),
 claimed_at timestamptz
);
alter table gestlok_platform.scanner_new_tenant_enrollment enable row level security;
-- Immutable installation boundary: companies created before this migration are ineligible.
create table if not exists gestlok_platform.scanner_enrollment_release_gate (
 id boolean primary key default true check (id), installed_at timestamptz not null default clock_timestamp()
);
insert into gestlok_platform.scanner_enrollment_release_gate(id) values(true) on conflict do nothing;
revoke all on gestlok_platform.scanner_enrollment_release_gate from public,anon,authenticated;
revoke all on gestlok_platform.scanner_new_tenant_enrollment from public, anon, authenticated;

create or replace function gestlok_platform.scanner_capture_new_company()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Fail closed: generic company creation does not imply Scanner subscription.
 -- Entitlements must be explicitly approved by the creator, not inferred from mode or email.
 return new;
 return new;
end $$;
revoke all on function gestlok_platform.scanner_capture_new_company() from public,anon,authenticated;
drop trigger if exists scanner_capture_new_company on gestlok_platform.companies;
-- No automatic trigger: a generic new business must not receive Scanner access.
-- Enrollment is deliberately disabled until a verified plan-selection workflow exists.

create or replace function public.gestlok_scanner_approve_new_company(p_tenant uuid)
returns boolean language plpgsql security definer set search_path='' as $
declare v_email text;
begin
 if auth.uid() is null or not exists (
   select 1 from gestlok_platform.admins a where a.user_id=auth.uid()
 ) then raise exception 'Solo la creadora puede autorizar Scanner' using errcode='42501'; end if;
 select lower(btrim(c.owner_email)) into v_email
 from gestlok_platform.companies c where c.tenant_id=p_tenant
 and c.created_at > (select g.installed_at from gestlok_platform.scanner_enrollment_release_gate g where g.id=true);
 if v_email is null then return false; end if;
 insert into gestlok_platform.scanner_new_tenant_enrollment(tenant_id,owner_email)
 values(p_tenant,v_email) on conflict(tenant_id) do nothing;
 return true;
end $;
revoke all on function public.gestlok_scanner_approve_new_company(uuid) from public,anon;
grant execute on function public.gestlok_scanner_approve_new_company(uuid) to authenticated;

create or replace function public.gestlok_scanner_claim_new_company(p_tenant uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();
 v_email text;
 v_owner text;
begin
 if v_uid is null then raise exception 'Iniciá sesión' using errcode='42501'; end if;
 select lower(u.email) into v_email from auth.users u
 where u.id=v_uid and u.email_confirmed_at is not null;
 if v_email is null or v_email<>lower(coalesce(auth.jwt()->>'email','')) then
   raise exception 'Correo verificado requerido' using errcode='42501';
 end if;
 select e.owner_email into v_owner
 from gestlok_platform.scanner_new_tenant_enrollment e
 where e.tenant_id=p_tenant for update;
 if not found then return false; end if;
 if v_owner<>v_email or not exists (
   select 1 from public.docs d
   where d.tenant_id=p_tenant and d.col='equipo'
     and lower(d.data->>'email')=v_email and d.data->>'rol'='dueno'
 ) then raise exception 'Dueño no autorizado' using errcode='42501'; end if;
 if exists(select 1 from public.gestlok_pilot_access a
           where a.tenant_id=p_tenant and a.owner_uid<>v_uid) then
   raise exception 'La empresa tiene otro dueño autorizado' using errcode='42501';
 end if;
 insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
 values(p_tenant,v_uid,true,'scanner')
 on conflict(tenant_id) do nothing;
 update gestlok_platform.scanner_new_tenant_enrollment
 set claimed_at=coalesce(claimed_at,now()) where tenant_id=p_tenant;
 return exists(select 1 from public.gestlok_pilot_access a
   where a.tenant_id=p_tenant and a.owner_uid=v_uid and a.enabled and a.plan_code='scanner');
end $$;
revoke all on function public.gestlok_scanner_claim_new_company(uuid) from public,anon;
grant execute on function public.gestlok_scanner_claim_new_company(uuid) to authenticated;
