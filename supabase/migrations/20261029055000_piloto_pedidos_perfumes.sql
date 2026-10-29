-- GESTLOK · Pedidos del piloto privado Perfumes.
-- Aislado por tenant y auth.uid(); no altera ni lee Mi Gusto, ReciboNet ni docs.
-- No hay productos precargados ni integración ficticia con Tiendanube.
create table if not exists public.gestlok_pilot_products (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 owner_uid uuid not null default auth.uid(),
 name text not null check (char_length(btrim(name)) between 2 and 140),
 category text not null default '' check (char_length(category)<=80),
 sku text not null default '' check (char_length(sku)<=80),
 unit_price numeric(12,2) check (unit_price is null or unit_price>=0),
 in_stock boolean not null default true,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists gl_pilot_products_owner_name_idx
 on public.gestlok_pilot_products(tenant_id,owner_uid,name);
alter table public.gestlok_pilot_products enable row level security;
revoke all on public.gestlok_pilot_products from public,anon,authenticated;
grant select,insert,update on public.gestlok_pilot_products to authenticated;
create policy gl_pilot_products_read on public.gestlok_pilot_products
 for select to authenticated using (
 owner_uid=(select auth.uid()) and exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_products.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled
 ));
create policy gl_pilot_products_add on public.gestlok_pilot_products
 for insert to authenticated with check (
 owner_uid=(select auth.uid()) and exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_products.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled
 ));
create policy gl_pilot_products_change on public.gestlok_pilot_products
 for update to authenticated using (
 owner_uid=(select auth.uid()) and exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_products.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled
 ))
 with check (
 owner_uid=(select auth.uid()) and exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_products.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled
 ));

create table if not exists public.gestlok_pilot_orders (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 owner_uid uuid not null default auth.uid(),
 day date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
 customer text not null default '' check (char_length(customer)<=120),
 reference text not null default '' check (char_length(reference)<=100),
 status text not null default 'pendiente'
   check (status in ('pendiente','preparado','entregado','sin_realizar','cancelado')),
 reason text not null default '' check (char_length(reason)<=300),
 notes text not null default '' check (char_length(notes)<=800),
 items jsonb not null default '[]'::jsonb
   check (jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists gl_pilot_orders_day_idx
 on public.gestlok_pilot_orders(tenant_id,owner_uid,day,created_at desc);
alter table public.gestlok_pilot_orders enable row level security;
revoke all on public.gestlok_pilot_orders from public,anon,authenticated;
grant select,insert,update on public.gestlok_pilot_orders to authenticated;
create policy gl_pilot_orders_read on public.gestlok_pilot_orders for select to authenticated
 using (owner_uid=(select auth.uid()) and exists
 (select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_orders.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled));
create policy gl_pilot_orders_add on public.gestlok_pilot_orders for insert to authenticated
 with check (owner_uid=(select auth.uid()) and exists
 (select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_orders.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled));
create policy gl_pilot_orders_change on public.gestlok_pilot_orders for update to authenticated
 using (owner_uid=(select auth.uid()) and exists
 (select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_orders.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled))
 with check (owner_uid=(select auth.uid()) and exists
 (select 1 from public.gestlok_pilot_access a
  where a.tenant_id=gestlok_pilot_orders.tenant_id
    and a.owner_uid=(select auth.uid()) and a.enabled));

create table if not exists public.gestlok_pilot_order_closures (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 owner_uid uuid not null default auth.uid(),
 day date not null,
 closed_at timestamptz not null default now(),
 unique (tenant_id,day)
);
alter table public.gestlok_pilot_order_closures enable row level security;
revoke all on public.gestlok_pilot_order_closures from public,anon,authenticated;
grant select,insert on public.gestlok_pilot_order_closures to authenticated;
create policy gl_pilot_closures_read on public.gestlok_pilot_order_closures
 for select to authenticated using (
 owner_uid=(select auth.uid()) and exists
  (select 1 from public.gestlok_pilot_access a
   where a.tenant_id=gestlok_pilot_order_closures.tenant_id
     and a.owner_uid=(select auth.uid()) and a.enabled)
 );
create policy gl_pilot_closures_add on public.gestlok_pilot_order_closures
 for insert to authenticated with check (
 owner_uid=(select auth.uid()) and
 day <= ((now() at time zone 'America/Argentina/Buenos_Aires')::date)
 and exists
  (select 1 from public.gestlok_pilot_access a
   where a.tenant_id=gestlok_pilot_order_closures.tenant_id
     and a.owner_uid=(select auth.uid()) and a.enabled)
 );

-- Reconstruye los artículos desde el catálogo privado para guardar un precio
-- histórico confiable y no aceptar precios/IDs de otro tenant.
create or replace function public.gestlok_pilot_orders_validate()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 raw jsonb;
 product_id uuid;
 qty int;
 p public.gestlok_pilot_products%rowtype;
 normalized jsonb:='[]'::jsonb;
 seen uuid[]:='{}'::uuid[];
begin
 if tg_op='UPDATE' and exists(
  select 1 from public.gestlok_pilot_order_closures c
  where c.tenant_id=old.tenant_id and c.day=old.day
 ) then raise exception 'El día está cerrado; no se pueden modificar sus pedidos.';
 end if;
 if exists(
  select 1 from public.gestlok_pilot_order_closures c
  where c.tenant_id=new.tenant_id and c.day=new.day
 ) then raise exception 'El día está cerrado; no se pueden agregar pedidos.';
 end if;
 if tg_op='UPDATE' then
  if new.tenant_id is distinct from old.tenant_id or
     new.owner_uid is distinct from old.owner_uid or new.day is distinct from old.day then
   raise exception 'No se puede trasladar un pedido a otro día o cuenta.';
  end if;
  -- Cambiar solo el estado NO debe alterar precios históricos ni cantidades.
  if new.items=old.items then
   new.updated_at:=now();
   return new;
  end if;
  if old.status in ('entregado','cancelado') then
   raise exception 'No se puede modificar el contenido de un pedido ya entregado o cancelado.';
  end if;
 end if;
 if new.owner_uid is distinct from auth.uid() then
  raise exception 'Sin permiso para modificar pedidos.';
 end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items)>100 then
  raise exception 'Lista de productos inválida.';
 end if;
 for raw in select value from jsonb_array_elements(new.items) loop
  if coalesce(raw->>'product_id','') !~ '^[0-9a-fA-F-]{36}$'
    or coalesce(raw->>'quantity','') !~ '^[1-9][0-9]{0,2}$' then
   raise exception 'Producto o cantidad inválidos.';
  end if;
  product_id:=(raw->>'product_id')::uuid;
  qty:=(raw->>'quantity')::int;
  if qty>999 or product_id=any(seen) then
   raise exception 'Producto repetido o cantidad excesiva.';
  end if;
  seen:=array_append(seen,product_id);
  select * into p from public.gestlok_pilot_products
   where id=product_id and tenant_id=new.tenant_id
     and owner_uid=new.owner_uid and active;
  if not found then raise exception 'El producto no corresponde a esta tienda.'; end if;
  if not p.in_stock and new.status not in ('sin_realizar','cancelado') then
   raise exception 'Uno de los productos está marcado sin stock.';
  end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object(
   'product_id',p.id,'name',p.name,'category',p.category,
   'unit_price',p.unit_price,'quantity',qty
  ));
 end loop;
 if new.status in ('pendiente','preparado','entregado') and jsonb_array_length(normalized)=0 then
  raise exception 'Seleccioná al menos un producto para este pedido.';
 end if;
 new.items:=normalized;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function public.gestlok_pilot_orders_validate() from public,anon,authenticated;
create trigger gl_pilot_orders_validate
 before insert or update on public.gestlok_pilot_orders
 for each row execute function public.gestlok_pilot_orders_validate();

create or replace function public.gestlok_pilot_products_touch()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.updated_at:=now();
 return new;
end $$;
revoke all on function public.gestlok_pilot_products_touch() from public,anon,authenticated;
create trigger gl_pilot_products_touch before update on public.gestlok_pilot_products
for each row execute function public.gestlok_pilot_products_touch();
