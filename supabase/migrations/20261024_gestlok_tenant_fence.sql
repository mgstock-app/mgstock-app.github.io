-- GestLok: tenant fence. Existing inventory and users remain unchanged.
create schema if not exists gestlok_tenancy;
revoke all on schema gestlok_tenancy from public, anon, authenticated;
grant usage on schema gestlok_tenancy to authenticated, service_role;

create table if not exists gestlok_tenancy.tenants (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
 created_at timestamptz not null default now()
);
alter table gestlok_tenancy.tenants enable row level security;
revoke all on gestlok_tenancy.tenants from public, anon, authenticated;
grant all on gestlok_tenancy.tenants to service_role;
insert into gestlok_tenancy.tenants (code) values ('gestlok-original')
on conflict (code) do nothing;

alter table public.docs add column if not exists tenant_id uuid;
update public.docs set tenant_id=(select id from gestlok_tenancy.tenants where code='gestlok-original') where tenant_id is null;
alter table public.docs alter column tenant_id set not null;
alter table public.docs add constraint gestlok_docs_tenant_fk foreign key (tenant_id) references gestlok_tenancy.tenants(id) on delete restrict;
create index if not exists idx_gestlok_docs_tenant_col on public.docs(tenant_id,col);

-- Fail closed for a user approved in multiple tenants until a tenant picker exists.
-- The email originates in the signed Auth JWT, never editable user_metadata.
create or replace function gestlok_tenancy.current_tenant_id() returns uuid
language sql stable security definer set search_path=''
as $tenant$
  select case when count(distinct d.tenant_id)=1
     then (array_agg(d.tenant_id))[1]
     else null::uuid end
  from public.docs d
  where d.col='equipo'
    and (select auth.uid()) is not null
    and lower(d.data->>'email')=lower(coalesce((select auth.jwt()->>'email'),''))
    and d.data->>'rol' in ('creadora','dueno','gerente','editor','lectura');
$tenant$;
revoke all on function gestlok_tenancy.current_tenant_id() from public, anon;
grant execute on function gestlok_tenancy.current_tenant_id() to authenticated, service_role;

-- Legacy JS does not pass tenant_id. Stamp inserts and reject reassignment.
create or replace function gestlok_tenancy.stamp_docs_tenant() returns trigger
language plpgsql security invoker set search_path=''
as $stamp$
begin
 if tg_op='INSERT' then
   if new.tenant_id is null then new.tenant_id := gestlok_tenancy.current_tenant_id(); end if;
   if new.tenant_id is null then
     raise exception 'No approved company for this session' using errcode='42501';
   end if;
 elsif tg_op='UPDATE' then
   if new.tenant_id is distinct from old.tenant_id then
     raise exception 'Document company cannot be changed' using errcode='42501';
   end if;
 end if;
 return new;
end;
$stamp$;
revoke all on function gestlok_tenancy.stamp_docs_tenant() from public, anon;
grant execute on function gestlok_tenancy.stamp_docs_tenant() to authenticated, service_role;
drop trigger if exists trg_gestlok_docs_tenant on public.docs;
create trigger trg_gestlok_docs_tenant before insert or update on public.docs
for each row execute function gestlok_tenancy.stamp_docs_tenant();

-- Intersect with every existing policy, including owner and creator permissions.
create policy gestlok_tenant_fence on public.docs as restrictive for all to authenticated
 using (tenant_id=(select gestlok_tenancy.current_tenant_id()))
 with check (tenant_id=(select gestlok_tenancy.current_tenant_id()));

alter default privileges in schema gestlok_tenancy revoke all on tables from public, anon, authenticated;
