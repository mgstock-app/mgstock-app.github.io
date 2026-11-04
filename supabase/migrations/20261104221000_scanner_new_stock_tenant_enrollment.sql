-- Scanner provisioning for NEW Stock tenants only.
-- Existing tenants, Mi Gusto and all existing grants remain untouched.
create table if not exists gestlok_platform.scanner_new_tenant_enrollment (
 tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete cascade,
 owner_email text not null,
 created_at timestamptz not null default now(),
 claimed_at timestamptz
);
alter table gestlok_platform.scanner_new_tenant_enrollment enable row level security;
revoke all on gestlok_platform.scanner_new_tenant_enrollment from public, anon, authenticated;

create or replace function gestlok_platform.scanner_capture_new_company()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Only the creator-controlled provisioning function inserts platform companies.
 -- Do not update or backfill preexisting companies.
 insert into gestlok_platform.scanner_new_tenant_enrollment(tenant_id,owner_email)
 values(new.tenant_id,lower(btrim(new.owner_email)));
 return new;
end $$;
revoke all on function gestlok_platform.scanner_capture_new_company() from public,anon,authenticated;
drop trigger if exists scanner_capture_new_company on gestlok_platform.companies;
create trigger scanner_capture_new_company
after insert on gestlok_platform.companies
for each row execute function gestlok_platform.scanner_capture_new_company();

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
