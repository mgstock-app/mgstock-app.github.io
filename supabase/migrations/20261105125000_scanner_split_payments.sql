-- Solo Plan Scanner. No toca Caja ni los datos de Mi Gusto.
create table if not exists public.gestlok_scanner_payment_methods (
 tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
 method_id text not null check (method_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
 label text not null check (length(label) between 1 and 60),
 enabled boolean not null default true,
 primary key (tenant_id,method_id)
);
alter table public.gestlok_scanner_payment_methods enable row level security;
revoke all on public.gestlok_scanner_payment_methods from public, anon, authenticated;
drop policy if exists scanner_payment_methods_read on public.gestlok_scanner_payment_methods;
create policy scanner_payment_methods_read on public.gestlok_scanner_payment_methods
 for select to authenticated using (exists (
 select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_payment_methods.tenant_id
 and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'));
grant select on public.gestlok_scanner_payment_methods to authenticated;
insert into public.gestlok_scanner_payment_methods(tenant_id,method_id,label)
select a.tenant_id,m.id,m.label from public.gestlok_pilot_access a
cross join (values ('efectivo','Efectivo'),('transferencia','Transferencia')) m(id,label)
where a.enabled and a.plan_code='scanner'
on conflict do nothing;
alter table public.gestlok_pilot_pos_sales add column if not exists payment_breakdown jsonb;
-- Conservar compatibilidad de reintentos de ventas individuales previas.
update public.gestlok_pilot_pos_sales set payment_breakdown=jsonb_build_object(payment_method,total)
where payment_breakdown is null and payment_method in ('efectivo','transferencia');
alter table public.gestlok_pilot_pos_sales drop constraint if exists gestlok_pilot_pos_sales_payment_method_check;
alter table public.gestlok_pilot_pos_sales add constraint gestlok_pilot_pos_sales_payment_method_check
 check (payment_method ~ '^[a-z][a-z0-9_-]{1,39}$');
create or replace function public.gestlok_pos_checkout_split(
  p_tenant uuid, p_request uuid, p_payments jsonb, p_lines jsonb
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
  v_old_payments jsonb;
  v_payment jsonb;
  v_method text;
  v_amount numeric(14,2);
  v_paid numeric(14,2) := 0;
  v_split jsonb := '{}'::jsonb;
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

  if jsonb_typeof(p_payments) is distinct from 'array'
    or case when jsonb_typeof(p_payments)='array' then jsonb_array_length(p_payments) not between 1 and 20 else true end
    or jsonb_typeof(p_lines) is distinct from 'array'
    or case when jsonb_typeof(p_lines)='array' then jsonb_array_length(p_lines) not between 1 and 100 else true end
  then
    raise exception 'Venta invalida' using errcode='22023';
  end if;

  -- El servidor valida métodos habilitados por tenant y montos exactos.
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if jsonb_typeof(v_payment) is distinct from 'object'
      or (v_payment - 'method' - 'amount') <> '{}'::jsonb
      or jsonb_typeof(v_payment->'method') is distinct from 'string'
      or jsonb_typeof(v_payment->'amount') is distinct from 'number'
    then
      raise exception 'Pago combinado inválido' using errcode='22023';
    end if;
    v_method := v_payment->>'method';
    if not exists (select 1 from public.gestlok_scanner_payment_methods m
      where m.tenant_id = p_tenant and m.method_id = v_method and m.enabled)
    then
      raise exception 'Medio de pago no habilitado' using errcode='22023';
    end if;
    begin
      v_amount := (v_payment->>'amount')::numeric(14,2);
    exception when others then
      raise exception 'Importe inválido' using errcode='22023';
    end;
    if v_amount is null or v_amount <= 0 or v_amount > 999999999999.99
      or v_amount <> (v_payment->>'amount')::numeric then
      raise exception 'Importe inválido' using errcode='22023';
    end if;
    if v_paid + v_amount > 999999999999.99 then
    raise exception 'Importe fuera de rango' using errcode='22023';
  end if;
  v_paid := v_paid + v_amount;
    v_split := jsonb_set(v_split,array[v_method],to_jsonb(coalesce((v_split->>v_method)::numeric,0)+v_amount),true);
  end loop;

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
  select s.id,s.request_lines,s.payment_breakdown into v_existing,v_old_lines,v_old_payments
    from public.gestlok_pilot_pos_sales s
    where s.tenant_id = p_tenant and s.request_id = p_request;
  if found then
    if v_old_payments is distinct from v_split or v_old_lines <> v_canonical then
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

  if v_paid <> v_total then
    raise exception 'Los pagos no coinciden con el total del servidor' using errcode='22023';
  end if;
  insert into public.gestlok_pilot_pos_sales (
    tenant_id, operator_uid, request_id, payment_method, payment_breakdown,
    total, request_lines, items
  ) values (
    p_tenant, v_user, p_request, case when (select count(*) from jsonb_object_keys(v_split))=1 then (select key from jsonb_each(v_split) limit 1) else 'combinado' end, v_split,
    v_total, v_canonical, v_details
  ) returning id into v_existing;
  return v_existing;
end $$;

revoke all on function public.gestlok_pos_checkout_split(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.gestlok_pos_checkout_split(uuid,uuid,jsonb,jsonb) to authenticated;
