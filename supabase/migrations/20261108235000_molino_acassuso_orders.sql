-- El Molino Café: Pedidos de Acassuso a San Isidro.
-- Aislamiento estricto: solamente el tenant fijo y usuarios que ya pasan gestlok_molino_scope().
-- Los gerentes de San Isidro no pueden crear ni modificar pedidos: solo confirmar su lectura.
-- La creadora verificada y el dueño conservan administración completa sin alterar otros roles.

create table if not exists public.gestlok_molino_orders (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
   check(tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'),
 request_id uuid not null,
 day date not null,
 origin text not null default 'acassuso' check(origin='acassuso'),
 destination text not null default 'san_isidro' check(destination='san_isidro'),
 product text not null check(length(btrim(product)) between 1 and 140),
 quantity numeric(12,2) not null check(quantity>0 and quantity<=999999),
 note text not null default '' check(length(note)<=500),
 requested_at timestamptz not null default now(),
 requested_by uuid not null,
 seen_at timestamptz,
 seen_by uuid,
 constraint molino_order_seen_pair check((seen_at is null)=(seen_by is null))
);
create index if not exists gestlok_molino_orders_latest
 on public.gestlok_molino_orders(tenant_id,requested_at desc);
create index if not exists gestlok_molino_orders_batch
 on public.gestlok_molino_orders(tenant_id,request_id);

alter table public.gestlok_molino_orders enable row level security;
revoke all on public.gestlok_molino_orders from public,anon,authenticated;
grant select on public.gestlok_molino_orders to authenticated;
drop policy if exists molino_orders_read on public.gestlok_molino_orders;
create policy molino_orders_read on public.gestlok_molino_orders
 for select to authenticated using(
  tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
  and public.gestlok_molino_scope()<>'none'
 );
-- No se conceden INSERT, UPDATE ni DELETE directos. Toda mutación usa RPC con controles de rol.

create or replace function public.gestlok_molino_orders_state()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
begin
 if v_scope='none' then
  raise exception 'No tenés permiso para ver pedidos de El Molino Café' using errcode='42501';
 end if;
 return jsonb_build_object(
  'scope',v_scope,
  'origin','acassuso','destination','san_isidro',
  'can_create',v_scope in ('admin','dueno','acassuso'),
  'can_ack',v_scope in ('admin','dueno','san_isidro'),
  'orders',coalesce((
    select jsonb_agg(to_jsonb(o)-'tenant_id' order by o.requested_at desc,o.id)
    from (
      select * from public.gestlok_molino_orders
      where tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
      order by requested_at desc,id desc limit 500
    ) o
  ),'[]'::jsonb)
 );
end;
$$;

create or replace function public.gestlok_molino_order_create(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_batch uuid:=gen_random_uuid();
        v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
        v_item jsonb;
        v_product text;v_note text;v_quantity numeric;
        v_count integer;
begin
 if v_scope not in ('admin','dueno','acassuso') then
  raise exception 'Solo Acassuso puede realizar pedidos a San Isidro' using errcode='42501';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then
  raise exception 'Ingresá productos para realizar el pedido' using errcode='22023';
 end if;
 v_count:=jsonb_array_length(p_items);
 if v_count<1 or v_count>40 then
  raise exception 'El pedido debe contener entre 1 y 40 productos' using errcode='22023';
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item)<>'object' then
   raise exception 'Detalle de pedido inválido' using errcode='22023';
  end if;
  v_product:=btrim(coalesce(v_item->>'product',''));
  v_note:=btrim(coalesce(v_item->>'note',''));
  if length(v_product) not between 1 and 140 or length(v_note)>500
    or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,6}([.][0-9]{1,2})?$' then
   raise exception 'Revisá producto, cantidad u observación' using errcode='22023';
  end if;
  v_quantity:=(v_item->>'quantity')::numeric;
  if v_quantity<=0 or v_quantity>999999 then
   raise exception 'La cantidad debe ser mayor que cero' using errcode='22023';
  end if;
  insert into public.gestlok_molino_orders(
   request_id,day,product,quantity,note,requested_by
  ) values(v_batch,v_day,v_product,v_quantity,v_note,auth.uid());
 end loop;
 return jsonb_build_object('request_id',v_batch,'items',v_count,'day',v_day::text);
end;
$$;

create or replace function public.gestlok_molino_order_ack(p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_scope text:=public.gestlok_molino_scope();
        v_row public.gestlok_molino_orders%rowtype;
begin
 if v_scope not in ('admin','dueno','san_isidro') then
  raise exception 'Solo San Isidro puede marcar OK en pedidos recibidos' using errcode='42501';
 end if;
 select * into v_row from public.gestlok_molino_orders
 where id=p_id and tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
 for update;
 if not found then
  raise exception 'Pedido inexistente o de otra empresa' using errcode='42501';
 end if;
 if v_row.seen_at is null then
  update public.gestlok_molino_orders
  set seen_at=now(),seen_by=auth.uid()
  where id=v_row.id
  returning * into v_row;
 end if;
 return to_jsonb(v_row)-'tenant_id';
end;
$$;

revoke all on function public.gestlok_molino_orders_state() from public,anon;
revoke all on function public.gestlok_molino_order_create(jsonb) from public,anon;
revoke all on function public.gestlok_molino_order_ack(uuid) from public,anon;
grant execute on function public.gestlok_molino_orders_state() to authenticated;
grant execute on function public.gestlok_molino_order_create(jsonb) to authenticated;
grant execute on function public.gestlok_molino_order_ack(uuid) to authenticated;

-- Realtime conserva la misma RLS de lectura. El polling existente sigue como respaldo.
do $$
begin
 if not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='gestlok_molino_orders')
 then
  alter publication supabase_realtime add table public.gestlok_molino_orders;
 end if;
end;
$$;
