-- GESTLOK · Cuaderno privado de compras de Camila.
-- Independiente del Plan Scanner, del catálogo de stock, de Caja y de Mi Gusto.
-- Solo la cuenta Auth confirmada para camilab.lopez99@gmail.com en el tenant Perfumes.
create table if not exists public.gestlok_cami_product_tabs (
 id uuid primary key default gen_random_uuid(),
 owner_uid uuid not null default auth.uid()
   check (owner_uid = '8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid),
 tenant_id uuid not null default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
   check (tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
 name text not null check (char_length(btrim(name)) between 1 and 60),
 position integer not null default 0 check (position>=0),
 created_at timestamptz not null default now(),
 unique (id,owner_uid,tenant_id)
);
create unique index if not exists gestlok_cami_tabs_name_unique
 on public.gestlok_cami_product_tabs(owner_uid,lower(btrim(name)));

create table if not exists public.gestlok_cami_product_items (
 id uuid primary key default gen_random_uuid(),
 tab_id uuid not null,
 owner_uid uuid not null default auth.uid()
   check (owner_uid = '8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid),
 tenant_id uuid not null default '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
   check (tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid),
 product text not null check (char_length(btrim(product)) between 1 and 160),
 liked boolean, -- null = sin calificar, true = me gustó, false = no me gustó
 note text not null default '' check (char_length(note)<=2000),
 position integer not null default 0 check (position>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint gestlok_cami_items_tab_fk foreign key(tab_id,owner_uid,tenant_id)
   references public.gestlok_cami_product_tabs(id,owner_uid,tenant_id)
   on delete cascade
);
create index if not exists gestlok_cami_items_tab_position
 on public.gestlok_cami_product_items(tab_id,position,created_at);

alter table public.gestlok_cami_product_tabs enable row level security;
alter table public.gestlok_cami_product_items enable row level security;
revoke all on public.gestlok_cami_product_tabs from public,anon,authenticated;
revoke all on public.gestlok_cami_product_items from public,anon,authenticated;
grant select,insert,update,delete on public.gestlok_cami_product_tabs to authenticated;
grant select,insert,update,delete on public.gestlok_cami_product_items to authenticated;

-- Policies validate the *actual Auth UID*, not user_metadata or a client-supplied email.
-- No dependence on gestlok_pilot_access.enabled or plan_code.
create policy gestlok_cami_tabs_select on public.gestlok_cami_product_tabs
 for select to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_tabs_insert on public.gestlok_cami_product_tabs
 for insert to authenticated
 with check (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_tabs_update on public.gestlok_cami_product_tabs
 for update to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)
 with check (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_tabs_delete on public.gestlok_cami_product_tabs
 for delete to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);

create policy gestlok_cami_items_select on public.gestlok_cami_product_items
 for select to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_items_insert on public.gestlok_cami_product_items
 for insert to authenticated
 with check (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_items_update on public.gestlok_cami_product_items
 for update to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)
 with check (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);
create policy gestlok_cami_items_delete on public.gestlok_cami_product_items
 for delete to authenticated
 using (owner_uid=(select auth.uid()) and owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
    and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid);

-- Starter tabs are empty by design; the user can rename or delete any of them.
insert into public.gestlok_cami_product_tabs(owner_uid,tenant_id,name,position)
 values
 ('8ddf2c6c-8d62-44de-8ce8-27eb5759daa3','2a97bf8d-7d08-4aa7-b051-5d1a4dc80103','Perfume Fem',0),
 ('8ddf2c6c-8d62-44de-8ce8-27eb5759daa3','2a97bf8d-7d08-4aa7-b051-5d1a4dc80103','Perfume Masc',1),
 ('8ddf2c6c-8d62-44de-8ce8-27eb5759daa3','2a97bf8d-7d08-4aa7-b051-5d1a4dc80103','Body Splash',2)
 on conflict do nothing;
