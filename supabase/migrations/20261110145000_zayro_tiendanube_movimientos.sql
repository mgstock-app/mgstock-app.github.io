-- ZAYRO / TiendaNube: espejo de movimientos de pedidos (solo lectura desde GESTLOK).
-- No modifica stock, caja, ventas ni otros tenants. Sin datos personales de compradores.
-- El token de la TiendaNube nunca se guarda en tablas públicas ni en el frontend.
create table if not exists public.gestlok_zayro_tn_state (
  tenant_id uuid primary key default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    check (tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
  connection_state text not null default 'pending'
    check (connection_state in ('pending','connected','error')),
  store_domain text not null default 'zayroparfum.mitiendanube.com',
  last_sync_at timestamptz,
  last_sync_count integer not null default 0 check (last_sync_count >= 0),
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.gestlok_zayro_tn_orders (
  tenant_id uuid not null default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    check (tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
  order_id text not null check (length(order_id) between 1 and 64),
  order_number text not null,
  order_status text not null default 'open',
  payment_status text not null default 'pending',
  fulfillment_status text,
  total_amount numeric(14,2) not null default 0 check(total_amount >= 0),
  currency text not null default 'ARS',
  shipping_method text,
  item_count integer not null default 0 check(item_count >= 0),
  created_at_tn timestamptz,
  updated_at_tn timestamptz,
  synced_at timestamptz not null default now(),
  primary key (tenant_id, order_id),
  foreign key (tenant_id) references public.gestlok_zayro_tn_state (tenant_id)
);
create index if not exists gl_zayro_tn_orders_created
  on public.gestlok_zayro_tn_orders (tenant_id, created_at_tn desc);

alter table public.gestlok_zayro_tn_state enable row level security;
alter table public.gestlok_zayro_tn_orders enable row level security;
revoke all on public.gestlok_zayro_tn_state from public, anon, authenticated;
revoke all on public.gestlok_zayro_tn_orders from public, anon, authenticated;
grant select on public.gestlok_zayro_tn_state to authenticated;
grant select on public.gestlok_zayro_tn_orders to authenticated;

-- Nunca confiar en el rol visual ni en user_metadata. Se valida el UUID real,
-- y la creadora se comprueba mediante la función de plataforma ya existente.
create policy gl_zayro_tn_state_read on public.gestlok_zayro_tn_state
 for select to authenticated using (
   tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
   and ((select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
        or (select public.gestlok_cami_creator_authorized()))
 );
create policy gl_zayro_tn_orders_read on public.gestlok_zayro_tn_orders
 for select to authenticated using (
   tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
   and ((select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
        or (select public.gestlok_cami_creator_authorized()))
 );

insert into public.gestlok_zayro_tn_state(tenant_id,connection_state)
values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103','pending')
on conflict (tenant_id) do nothing;
