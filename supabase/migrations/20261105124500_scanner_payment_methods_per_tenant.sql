-- Plan Scanner: catálogo de medios de pago por sucursal, aislado de Caja y Mi Gusto.
-- No habilita cobros mixtos hasta implementar la RPC transaccional y los reportes.
create table if not exists public.gestlok_scanner_payment_methods (
  tenant_id uuid not null references public.gestlok_pilot_access(tenant_id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  primary key (tenant_id,code)
);
alter table public.gestlok_scanner_payment_methods enable row level security;
revoke all on public.gestlok_scanner_payment_methods from public,anon,authenticated;
drop policy if exists scanner_payment_methods_owner_select on public.gestlok_scanner_payment_methods;
create policy scanner_payment_methods_owner_select on public.gestlok_scanner_payment_methods
 for select to authenticated using (exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
   and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 ));
drop policy if exists scanner_payment_methods_owner_insert on public.gestlok_scanner_payment_methods;
create policy scanner_payment_methods_owner_insert on public.gestlok_scanner_payment_methods
 for insert to authenticated with check (exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
   and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 ));
drop policy if exists scanner_payment_methods_owner_update on public.gestlok_scanner_payment_methods;
create policy scanner_payment_methods_owner_update on public.gestlok_scanner_payment_methods
 for update to authenticated using (exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
   and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 )) with check (exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
   and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 ));
drop policy if exists scanner_payment_methods_owner_delete on public.gestlok_scanner_payment_methods;
create policy scanner_payment_methods_owner_delete on public.gestlok_scanner_payment_methods
 for delete to authenticated using (exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
   and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 ));
grant select,insert,update,delete on public.gestlok_scanner_payment_methods to authenticated;
comment on table public.gestlok_scanner_payment_methods is
 'Medios configurables por sucursal Scanner. No altera Caja ni habilita pagos combinados por sí solo.';
