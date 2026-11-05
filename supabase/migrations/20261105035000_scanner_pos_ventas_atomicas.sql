-- GESTLOK Scanner: cobro registrado + descuento de stock en una transaccion.
-- Inactivo por defecto; se habilita explicitamente por tenant despues de la validacion.
alter table public.gestlok_pilot_access
  add column if not exists pos_live_enabled boolean not null default false;

create table if not exists public.gestlok_pilot_pos_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
  operator_uid uuid not null,
  request_id uuid not null,
  payment_method text not null check (payment_method in ('efectivo','transferencia')),
  total numeric(14,2) not null check (total > 0),
  request_lines jsonb not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, request_id)
);
create index if not exists gestlok_pos_sales_recent_idx
  on public.gestlok_pilot_pos_sales(tenant_id, created_at desc);

alter table public.gestlok_pilot_pos_sales enable row level security;
revoke all on table public.gestlok_pilot_pos_sales from public, anon, authenticated;
drop policy if exists gestlok_pos_owner_read on public.gestlok_pilot_pos_sales;
create policy gestlok_pos_owner_read on public.gestlok_pilot_pos_sales
  for select to authenticated
  using (
    operator_uid = (select auth.uid())
    and exists (
      select 1 from public.gestlok_pilot_access a
      where a.tenant_id = gestlok_pilot_pos_sales.tenant_id
        and a.owner_uid = (select auth.uid())
        and a.enabled and a.plan_code = 'scanner'
    )
  );
grant select on public.gestlok_pilot_pos_sales to authenticated;

-- Solo un titular autorizado puede confirmar pagos ya recibidos. El servidor toma
-- el precio actual; el navegador no puede actualizar stock ni fijar importes.
create or replace function public.gestlok_pos_checkout(
  p_tenant uuid, p_request uuid, p_payment text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item jsonb;
  v_text text;
  v_qty integer;
  v_count integer;
  v_cart jsonb := '{}'::jsonb;
  v_canonical jsonb;
  v_row record;
  v_name text;
  v_price numeric;
  v_stock integer;
  v_total numeric := 0;
  v_details jsonb := '[]'::jsonb;
  v_existing uuid;
  v_old_lines jsonb;
  v_old_payment text;
begin
  if p_tenant is null or p_request is null or v_user is null then
    raise exception 'Sesion o local no valido' using errcode='42501';
  end if;

  -- Desactivado hasta autorizar una sucursal real; Mi Gusto no es elegible.
  if not exists (
    select 1 from public.gestlok_pilot_access a
    where a.tenant_id = p_tenant
      and a.owner_uid = v_user
      and a.enabled
      and a.plan_code = 'scanner'
      and a.pos_live_enabled
  ) then
    raise exception 'Ventas reales no habilitadas para este local' using errcode='42501';
  end if;

  if p_payment is null or p_payment not in ('efectivo','transferencia')
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 100
  then
    raise exception 'Venta invalida' using errcode='22023';
  end if;

  -- Normalizar y sumar duplicados. Ningun precio o tenant proviene del carrito.
  for v_item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or (v_item - 'product_id' - 'quantity') <> '{}'::jsonb
      or jsonb_typeof(v_item->'product_id') is distinct from 'string'
      or jsonb_typeof(v_item->'quantity') is distinct from 'number'
      or (v_item->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_item->>'quantity') !~ '^[1-9][0-9]{0,2}$'
    then
      raise exception 'Producto o cantidad invalida' using errcode='22023';
    end if;
    v_text := ((v_item->>'product_id')::uuid)::text;
    v_qty := (v_item->>'quantity')::integer + coalesce((v_cart->>v_text)::integer,0);
    if v_qty > 999 then
      raise exception 'Cantidad excesiva' using errcode='22023';
    end if;
    v_cart := jsonb_set(v_cart, array[v_text], to_jsonb(v_qty), true);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('product_id',key,'quantity',value::integer) order by key),'[]'::jsonb)
    into v_canonical from jsonb_each_text(v_cart);

  -- Mismo comprobante reintentado: nunca se descuentan dos veces las unidades.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_tenant::text || ':' || p_request::text));
  select s.id,s.request_lines,s.payment_method into v_existing,v_old_lines,v_old_payment
    from public.gestlok_pilot_pos_sales s
    where s.tenant_id = p_tenant and s.request_id = p_request;
  if found then
    if v_old_payment is distinct from p_payment or v_old_lines <> v_canonical then
      raise exception 'Este intento de venta corresponde a otro carrito' using errcode='22023';
    end if;
    return v_existing;
  end if;

  -- Orden estable + FOR UPDATE para resistir dos cajas vendiendo lo mismo.
  for v_row in select key as product_id,value::integer as quantity
    from jsonb_each_text(v_cart) order by key
  loop
    select p.name,p.unit_price,p.stock_quantity into v_name,v_price,v_stock
      from public.gestlok_pilot_products p
      where p.id = v_row.product_id::uuid and p.tenant_id = p_tenant
        and p.owner_uid = v_user and p.active
      for update;
    if not found or v_price is null or v_price <= 0 or v_stock is null
      or v_stock < v_row.quantity then
      raise exception 'Producto sin precio o stock suficiente' using errcode='22023';
    end if;
    v_total := v_total + v_price * v_row.quantity;
    if v_total > 999999999999.99 then
      raise exception 'Total de venta fuera de rango' using errcode='22023';
    end if;
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'product_id',v_row.product_id, 'name',v_name,
      'quantity',v_row.quantity,'unit_price',v_price,
      'line_total',v_price * v_row.quantity
    ));
    update public.gestlok_pilot_products
      set stock_quantity = stock_quantity - v_row.quantity
      where id = v_row.product_id::uuid and tenant_id = p_tenant;
  end loop;

  insert into public.gestlok_pilot_pos_sales (
    tenant_id, operator_uid, request_id, payment_method,
    total, request_lines, items
  ) values (
    p_tenant, v_user, p_request, p_payment,
    v_total, v_canonical, v_details
  ) returning id into v_existing;
  return v_existing;
end $$;

revoke all on function public.gestlok_pos_checkout(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.gestlok_pos_checkout(uuid,uuid,text,jsonb) to authenticated;
comment on function public.gestlok_pos_checkout(uuid,uuid,text,jsonb) is
  'Scanner POS: confirma pago recibido y descuenta stock atomicamente, solo para tenant y titular habilitados.';
