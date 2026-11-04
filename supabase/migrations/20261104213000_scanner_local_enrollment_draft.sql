-- Draft: local-scoped Scanner enrollment. No changes to existing access grants.
-- This migration is deliberately inert until an organization is explicitly opted in.
create table if not exists public.gestlok_scanner_org_policy (
  organization_id uuid primary key references public.rm_organizations(id) on delete cascade,
  auto_enroll_new_locals boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.gestlok_scanner_local_enrollment (
  local_id text primary key references public.rm_app_local(id) on delete cascade,
  organization_id uuid not null references public.rm_organizations(id),
  company_id uuid not null references public.rm_companies(id),
  owner_uid uuid not null,
  scanner_tenant_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.gestlok_scanner_org_policy enable row level security;
alter table public.gestlok_scanner_local_enrollment enable row level security;
revoke all on public.gestlok_scanner_org_policy from anon, authenticated;
revoke all on public.gestlok_scanner_local_enrollment from anon, authenticated;
-- A SECURITY DEFINER trigger runs after the existing permission-checked branch RPC.
-- Existing locals are not backfilled. Unenrolled organizations are untouched.
create or replace function public.gl_scanner_enroll_new_local()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.gestlok_scanner_org_policy p
    where p.organization_id = new.organization_id and p.auto_enroll_new_locals
  ) then
    insert into public.gestlok_scanner_local_enrollment
      (local_id, organization_id, company_id, owner_uid)
    values (new.id, new.organization_id, new.company_id, new.owner_id)
    on conflict (local_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.gl_scanner_enroll_new_local() from public, anon, authenticated;
drop trigger if exists gl_scanner_enroll_new_local on public.rm_app_local;
create trigger gl_scanner_enroll_new_local
after insert on public.rm_app_local
for each row execute function public.gl_scanner_enroll_new_local();
