-- POS privado: fase 1, solo titular autorizado del piloto.
-- Pendiente de revisión y despliegue; no ejecutar en otros tenants.
create table if not exists public.gestlok_pilot_pos_sales (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 owner_uid uuid not null,
 request_id uuid not null,
 payment_method text not null check(payment_method in ('efectivo','transferencia')),
 total numeric(14,2) not null check(total>=0),
 items jsonb not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,request_id)
);
alter table public.gestlok_pilot_pos_sales enable row level security;
revoke all on public.gestlok_pilot_pos_sales from public,anon,authenticated;
create policy gl_pos_owner_read on public.gestlok_pilot_pos_sales
 for select to authenticated using (
 owner_uid=(select auth.uid()) and exists (
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_pos_sales.tenant_id
 and a.owner_uid=(select auth.uid()) and a.enabled
 ));
grant select on public.gestlok_pilot_pos_sales to authenticated;
