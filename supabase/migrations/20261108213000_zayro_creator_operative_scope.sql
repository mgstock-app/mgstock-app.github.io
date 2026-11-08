-- GESTLOK/ZAYRO: administración real con rol de creadora VERIFICADA por auth.users + admins.
-- Única empresa admitida por gestlok_tenancy.zayro_scanner_creator_can_read().
-- No modifica permisos existentes de dueña, gerentes, colaboradores e invitados.
-- Conservar owner_uid real, auditoría y bloqueo de cambios de empresa.
-- Requiere migración 20261108195810_zayro_scanner_creator_readonly.

create policy "zayro_creator_manage_gestlok_pilot_products_insert" on public.gestlok_pilot_products for insert to authenticated with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_products.tenant_id and a.enabled and a.plan_code='scanner')));

create policy "zayro_creator_manage_gestlok_pilot_products_update" on public.gestlok_pilot_products for update to authenticated using (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_products.tenant_id and a.enabled and a.plan_code='scanner'))) with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_products.tenant_id and a.enabled and a.plan_code='scanner')));

create policy "zayro_creator_manage_gestlok_pilot_orders_insert" on public.gestlok_pilot_orders for insert to authenticated with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_orders.tenant_id and a.enabled and a.plan_code='scanner')));

create policy "zayro_creator_manage_gestlok_pilot_orders_update" on public.gestlok_pilot_orders for update to authenticated using (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_orders.tenant_id and a.enabled and a.plan_code='scanner'))) with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_orders.tenant_id and a.enabled and a.plan_code='scanner')));

create policy "zayro_creator_manage_records_insert" on public.gestlok_pilot_records for insert to authenticated with check ((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and created_by=auth.uid());

create policy "zayro_creator_manage_records_update" on public.gestlok_pilot_records for update to authenticated using (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and created_by in (auth.uid(),(select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_records.tenant_id and a.enabled and a.plan_code='scanner')))) with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and created_by in (auth.uid(),(select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_records.tenant_id and a.enabled and a.plan_code='scanner'))));

create policy "zayro_creator_manage_records_delete" on public.gestlok_pilot_records for delete to authenticated using (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and created_by in (auth.uid(),(select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_records.tenant_id and a.enabled and a.plan_code='scanner'))));

create policy "zayro_creator_manage_closures_insert" on public.gestlok_pilot_order_closures for insert to authenticated with check (((select gestlok_tenancy.zayro_scanner_creator_can_read(tenant_id)) and owner_uid = (select a.owner_uid from public.gestlok_pilot_access a
    where a.tenant_id=gestlok_pilot_order_closures.tenant_id and a.enabled and a.plan_code='scanner')) and day <= (now() at time zone 'America/Argentina/Buenos_Aires')::date);

CREATE OR REPLACE FUNCTION public.gestlok_pilot_orders_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  -- No permitir revivir pedidos cancelados/sin realizar, ni borrar el
  -- motivo de una anulación de venta entregada.
  if old.status in ('cancelado','sin_realizar')
     and new.status is distinct from old.status then
   raise exception 'No se puede reabrir este pedido.';
  end if;
  if old.status='entregado' and new.status is distinct from old.status then
   if new.status<>'cancelado' or char_length(btrim(new.reason))<3 then
    raise exception 'Para anular una entrega necesitás indicar un motivo.';
   end if;
  end if;
  if new.status in ('pendiente','preparado','entregado')
     and jsonb_array_length(new.items)=0 then
   raise exception 'Seleccioná productos antes de preparar o entregar.';
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
 if new.owner_uid is distinct from auth.uid() and not (gestlok_tenancy.zayro_scanner_creator_can_read(new.tenant_id)
   and new.owner_uid=(select a.owner_uid from public.gestlok_pilot_access a where a.tenant_id=new.tenant_id and a.enabled and a.plan_code='scanner')) then
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
end $function$


CREATE OR REPLACE FUNCTION public.gestlok_pilot_record_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.gestlok_pilot_records;
begin
 if tg_op='DELETE' then
  v:=old;
 else
  v:=new;
 end if;
 if tg_op='UPDATE' then
  if new.tenant_id is distinct from old.tenant_id or new.created_by is distinct from old.created_by then
    raise exception 'No se puede cambiar la empresa ni el autor del registro.' using errcode='42501';
  end if;
  new.updated_at:=now();
  v:=new;
 end if;
 insert into public.gestlok_pilot_audit(tenant_id,record_id,module,action,actor_uid)
 values(v.tenant_id,v.id,v.module,
   case tg_op when 'INSERT' then 'creado' when 'UPDATE' then 'actualizado' else 'eliminado' end,
   auth.uid());
 if tg_op='DELETE' then return old;end if;
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.gestlok_pos_checkout(p_tenant uuid, p_request uuid, p_payment text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (a.owner_uid = v_user or gestlok_tenancy.zayro_scanner_creator_can_read(p_tenant))
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
        and p.owner_uid = (select a.owner_uid from public.gestlok_pilot_access a where a.tenant_id=p_tenant and a.enabled and a.plan_code='scanner') and p.active
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
end $function$


CREATE OR REPLACE FUNCTION public.gestlok_pos_checkout_split(p_tenant uuid, p_request uuid, p_payments jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_owner uuid;
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
  select a.owner_uid into v_owner from public.gestlok_pilot_access a
    where a.tenant_id = p_tenant
      and (a.owner_uid=v_user or a.owner_uid=gestlok_scanner_private.guest_owner(p_tenant,'ventas')
           or gestlok_tenancy.zayro_scanner_creator_can_read(p_tenant))
      and a.enabled
      and a.plan_code = 'scanner'
      and a.pos_live_enabled;
  if v_owner is null then
    raise exception 'Ventas reales no habilitadas para este local' using errcode='42501';
  end if;

  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Venta invalida' using errcode='22023';
  end if;
  if jsonb_array_length(p_payments) not between 1 and 20 or jsonb_array_length(p_lines) not between 1 and 100 then
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
    where s.tenant_id = p_tenant and s.request_id = p_request and s.operator_uid=v_user;
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
        and p.owner_uid = v_owner and p.active
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
end; $function$


CREATE OR REPLACE FUNCTION public.gestlok_scanner_pos_resumen(p_tenant uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_uid uuid := (select auth.uid());
 v_sales integer;
 v_total numeric(14,2);
 v_methods jsonb;
begin
 if p_tenant is null or p_day is null or v_uid is null or not exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=p_tenant and (a.owner_uid=v_uid or gestlok_tenancy.zayro_scanner_creator_can_read(p_tenant))
   and a.enabled and a.plan_code='scanner'
 ) then
  raise exception 'Acceso no autorizado al resumen Scanner' using errcode='42501';
 end if;
 select count(*)::integer,coalesce(sum(s.total),0)::numeric(14,2)
 into v_sales,v_total from public.gestlok_pilot_pos_sales s
 where s.tenant_id=p_tenant
 and s.created_at >= (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and s.created_at < ((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
 select coalesce(jsonb_object_agg(method,amount),'{}'::jsonb)
 into v_methods from (
  select method,sum(amount)::numeric(14,2) as amount from (
   select e.key as method,e.value::numeric as amount
   from public.gestlok_pilot_pos_sales s
   cross join lateral jsonb_each_text(coalesce(s.payment_breakdown,
    case when s.payment_method in ('efectivo','transferencia')
     then jsonb_build_object(s.payment_method,s.total) else '{}'::jsonb end)) e
   where s.tenant_id=p_tenant
    and s.created_at >= (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and s.created_at < ((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ) p group by method
 ) totals;
 return jsonb_build_object(
  'day',p_day,'sales',v_sales,'total',v_total,
  'efectivo',coalesce((v_methods->>'efectivo')::numeric,0),
  'transferencia',coalesce((v_methods->>'transferencia')::numeric,0),
  'methods',v_methods,'source','scanner_pos','synced_to_caja',false);
end $function$

