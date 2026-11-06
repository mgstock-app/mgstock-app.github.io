-- Pedidos de clientes para Mi Gusto: Munro y Don Torcuato independientes.
-- Sin modificar Caja, Pagos Online, stock, pedidos a proveedores ni otros tenants.
-- El webhook de WhatsApp NO se activa en esta etapa: requiere números y credenciales Meta.
create schema if not exists gestlok_mg_orders_private;
revoke all on schema gestlok_mg_orders_private from public, anon, authenticated;

create table if not exists gestlok_mg_orders_private.channels (
  local text primary key check (local in ('munro','torcuato')),
  whatsapp_number text unique,
  updated_at timestamptz,
  updated_by uuid,
  constraint valid_mg_whatsapp_number check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$')
);
alter table gestlok_mg_orders_private.channels enable row level security;
revoke all on gestlok_mg_orders_private.channels from public, anon, authenticated;
insert into gestlok_mg_orders_private.channels(local) values ('munro'),('torcuato') on conflict (local) do nothing;

create table if not exists gestlok_mg_orders_private.orders (
  id uuid primary key default gen_random_uuid(),
  local text not null references gestlok_mg_orders_private.channels(local),
  customer_name text not null check(length(btrim(customer_name)) between 2 and 120),
  customer_phone text not null check(length(customer_phone) between 8 and 15),
  items_detail text not null check(length(btrim(items_detail)) between 2 and 4000),
  total numeric(12,2) not null check(total > 0 and total < 1000000000),
  payment_method text not null default 'efectivo' check(payment_method='efectivo'),
  source text not null default 'manual' check(source in ('manual','whatsapp')),
  external_message_id text,
  notes text not null default '' check(length(notes)<=1000),
  status text not null default 'nuevo' check(status in ('nuevo','recibido')),
  created_at timestamptz not null default now(),
  created_by uuid,
  received_at timestamptz,
  received_by uuid,
  constraint received_fields_consistent check (
    (status='nuevo' and received_at is null and received_by is null) or
    (status='recibido' and received_at is not null and received_by is not null)
  ),
  constraint whatsapp_reference_consistent check (
    (source='manual' and external_message_id is null) or
    (source='whatsapp' and external_message_id is not null and length(external_message_id) between 5 and 250)
  ),
  unique(local,source,external_message_id)
);
create index if not exists idx_mg_orders_local_recent on gestlok_mg_orders_private.orders(local,created_at desc);
create index if not exists idx_mg_orders_local_new on gestlok_mg_orders_private.orders(local,created_at desc) where status='nuevo';
alter table gestlok_mg_orders_private.orders enable row level security;
revoke all on gestlok_mg_orders_private.orders from public, anon, authenticated;

create table if not exists gestlok_mg_orders_private.events (
  id bigint generated always as identity primary key,
  order_id uuid not null references gestlok_mg_orders_private.orders(id) on delete restrict,
  local text not null check(local in ('munro','torcuato')),
  event text not null check(event in ('created','received')),
  actor uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_mg_orders_received_once on gestlok_mg_orders_private.events(order_id) where event='received';
alter table gestlok_mg_orders_private.events enable row level security;
revoke all on gestlok_mg_orders_private.events from public, anon, authenticated;

create or replace function gestlok_mg_orders_private.allowed(p_local text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_local in ('munro','torcuato')
    and coalesce(gestlok_mg_online_private.authorized(p_local),false)
$$;

create or replace function gestlok_mg_orders_private.details(o gestlok_mg_orders_private.orders)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',o.id,'local',o.local,'customer_name',o.customer_name,
  'customer_phone',o.customer_phone,'items_detail',o.items_detail,
  'total',o.total,'payment_method',o.payment_method,'source',o.source,
  'notes',o.notes,'status',o.status,'created_at',o.created_at,
  'received_at',o.received_at)
$$;

create or replace function public.gestlok_mg_orders_state(p_local text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado al local' using errcode='42501';
 end if;
 return jsonb_build_object(
   'local',p_local,
   'whatsapp_number',(select whatsapp_number from gestlok_mg_orders_private.channels where local=p_local),
   'orders',coalesce((
     select jsonb_agg(gestlok_mg_orders_private.details(q) order by q.created_at desc, q.id desc)
     from (select * from gestlok_mg_orders_private.orders where local=p_local
           order by created_at desc,id desc limit 400) q
   ),'[]'::jsonb)
 );
end $$;

create or replace function public.gestlok_mg_orders_add(
 p_local text,p_customer_name text,p_customer_phone text,
 p_items_detail text,p_total numeric,p_notes text default ''
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order gestlok_mg_orders_private.orders;
        v_phone text:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
begin
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado al local' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_customer_name,''))) not between 2 and 120
    or length(v_phone) not between 8 and 15
    or length(btrim(coalesce(p_items_detail,''))) not between 2 and 4000
    or length(coalesce(p_notes,'')) > 1000
    or p_total is null or p_total <= 0 or p_total >= 1000000000 then
   raise exception 'Revisá los datos del pedido' using errcode='22023';
 end if;
 insert into gestlok_mg_orders_private.orders(
   local,customer_name,customer_phone,items_detail,total,notes,created_by
 ) values (
   p_local,btrim(p_customer_name),v_phone,btrim(p_items_detail),
   p_total,coalesce(p_notes,''),auth.uid()
 ) returning * into v_order;
 insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
 values(v_order.id,p_local,'created',auth.uid());
 return gestlok_mg_orders_private.details(v_order);
end $$;

create or replace function public.gestlok_mg_orders_receive(p_local text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order gestlok_mg_orders_private.orders;
begin
 if not gestlok_mg_orders_private.allowed(p_local) then
   raise exception 'Acceso denegado al local' using errcode='42501';
 end if;
 update gestlok_mg_orders_private.orders
 set status='recibido',received_at=now(),received_by=auth.uid()
 where id=p_id and local=p_local and status='nuevo'
 returning * into v_order;
 if found then
   insert into gestlok_mg_orders_private.events(order_id,local,event,actor)
   values(v_order.id,p_local,'received',auth.uid());
 else
   select * into v_order from gestlok_mg_orders_private.orders
   where id=p_id and local=p_local;
   if not found then raise exception 'Pedido inexistente en esta sucursal' using errcode='22023'; end if;
 end if;
 return gestlok_mg_orders_private.details(v_order);
end $$;

create or replace function public.gestlok_mg_orders_set_whatsapp(p_local text,p_number text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_digits text:=regexp_replace(coalesce(p_number,''),'[^0-9]','','g');
begin
 if not gestlok_mg_orders_private.allowed(p_local)
    or public.mi_rol() not in ('dueno','creadora') then
   raise exception 'No podés configurar el WhatsApp de este local' using errcode='42501';
 end if;
 if length(v_digits) not between 10 and 15 then
   raise exception 'Ingresá el número completo con código de país' using errcode='22023';
 end if;
 update gestlok_mg_orders_private.channels
 set whatsapp_number=v_digits,updated_at=now(),updated_by=auth.uid()
 where local=p_local;
 return jsonb_build_object('local',p_local,'whatsapp_number',v_digits);
end $$;

-- No hay RPC pública para insertar pedidos falsos como si fueran de WhatsApp.
-- La futura Edge Function deberá validar la firma de Meta y usar credenciales solo del servidor.
revoke all on all functions in schema gestlok_mg_orders_private from public, anon, authenticated;
revoke all on function public.gestlok_mg_orders_state(text),
 public.gestlok_mg_orders_add(text,text,text,text,numeric,text),
 public.gestlok_mg_orders_receive(text,uuid),
 public.gestlok_mg_orders_set_whatsapp(text,text) from public,anon;
grant execute on function public.gestlok_mg_orders_state(text),
 public.gestlok_mg_orders_add(text,text,text,text,numeric,text),
 public.gestlok_mg_orders_receive(text,uuid),
 public.gestlok_mg_orders_set_whatsapp(text,text) to authenticated;
comment on table gestlok_mg_orders_private.orders is
 'Pedidos de clientes Mi Gusto: efectivo, control de recepción, sin acciones sobre Caja/Stock/Pagos Online.';
