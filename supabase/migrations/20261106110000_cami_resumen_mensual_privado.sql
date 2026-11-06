-- Resumen mensual privado: únicamente identidad Auth de Camila; sin acceso para invitados.
create table if not exists public.gestlok_cami_monthly_movements (
 id uuid primary key default gen_random_uuid(),
 owner_uid uuid not null default auth.uid() check(owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid),
 tenant_id uuid not null default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid check(tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
 movement_date date not null default current_date,
 category text not null check(category in ('venta','ingreso','gasto','reinversion')),
 concept text not null check(length(btrim(concept)) between 1 and 180),
 amount numeric(14,2) not null check(amount>0),
 note text not null default '' check(length(note)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists gestlok_cami_monthly_date on public.gestlok_cami_monthly_movements(owner_uid,movement_date);
alter table public.gestlok_cami_monthly_movements enable row level security;
revoke all on public.gestlok_cami_monthly_movements from public,anon,authenticated;
grant select,insert,update,delete on public.gestlok_cami_monthly_movements to authenticated;
create policy cami_monthly_select on public.gestlok_cami_monthly_movements for select to authenticated using(owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy cami_monthly_insert on public.gestlok_cami_monthly_movements for insert to authenticated with check(owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy cami_monthly_update on public.gestlok_cami_monthly_movements for update to authenticated using(owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid) with check(owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy cami_monthly_delete on public.gestlok_cami_monthly_movements for delete to authenticated using(owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
