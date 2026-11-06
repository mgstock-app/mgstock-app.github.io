-- Scanner: owner-controlled invitation drafts. No guest access until server-side redemption is implemented.
create table if not exists public.gestlok_scanner_invites (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 owner_uid uuid not null,
 first_name text not null check (char_length(trim(first_name)) between 1 and 80),
 last_name text not null check (char_length(trim(last_name)) between 1 and 80),
 phone text not null check (char_length(phone) between 7 and 30),
 permissions jsonb not null default '{"caja":false,"ventas":false,"stock":false,"precios":false,"historial":false,"reportes":false}'::jsonb,
 status text not null default 'draft' check (status in ('draft','pending','accepted','revoked')),
 invited_uid uuid unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint scanner_invites_permission_shape check (
   jsonb_typeof(permissions)='object'
   and (permissions - 'caja' - 'ventas' - 'stock' - 'precios' - 'historial' - 'reportes')='{}'::jsonb
   and jsonb_typeof(permissions->'caja')='boolean'
   and jsonb_typeof(permissions->'ventas')='boolean'
   and jsonb_typeof(permissions->'stock')='boolean'
   and jsonb_typeof(permissions->'precios')='boolean'
   and jsonb_typeof(permissions->'historial')='boolean'
   and jsonb_typeof(permissions->'reportes')='boolean'
 )
);
create index if not exists scanner_invites_owner_idx on public.gestlok_scanner_invites(tenant_id,owner_uid);
alter table public.gestlok_scanner_invites enable row level security;
revoke all on public.gestlok_scanner_invites from anon;
grant select,insert,update,delete on public.gestlok_scanner_invites to authenticated;
create policy scanner_invites_owner_select on public.gestlok_scanner_invites for select to authenticated
 using (owner_uid=(select auth.uid()) and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'));
create policy scanner_invites_owner_insert on public.gestlok_scanner_invites for insert to authenticated
 with check (owner_uid=(select auth.uid()) and status='draft' and invited_uid is null and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'));
create policy scanner_invites_owner_update on public.gestlok_scanner_invites for update to authenticated
 using (owner_uid=(select auth.uid()) and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'))
 with check (owner_uid=(select auth.uid()) and status in ('draft','revoked') and invited_uid is null and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'));
create policy scanner_invites_owner_delete on public.gestlok_scanner_invites for delete to authenticated
 using (owner_uid=(select auth.uid()) and status='draft' and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'));
