-- POS Cami only. Staged migration: do not deploy before authorization review.
create table if not exists public.gestlok_pilot_pos_sales (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 operator_uid uuid not null,
 idempotency_key uuid not null,
 payment_method text not null check(payment_method in ('efectivo','transferencia')),
 total numeric(14,2) not null check(total >= 0),
 items jsonb not null,
 created_at timestamptz not null default now(),
 unique(tenant_id,idempotency_key)
);
alter table public.gestlok_pilot_pos_sales enable row level security;
revoke all on public.gestlok_pilot_pos_sales from public,anon,authenticated;
-- All sale writes must go through an audited server-side transaction/RPC.
-- Do not grant client insert/update/delete on sales or products here.
