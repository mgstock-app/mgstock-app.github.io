-- POS owner-only checkout for Zayro pilot. Review and apply through migrations.
-- Existing products remain the sole inventory source.
create or replace function public.gestlok_pos_checkout(
 p_request uuid, p_payment text, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
 v_tenant constant uuid := '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 v_owner uuid := auth.uid();
 v_line record;
 v_price numeric;
 v_stock integer;
 v_total numeric := 0;
 v_id uuid;
begin
 if v_owner is null or not exists (
  select 1 from public.gestlok_pilot_access
  where tenant_id=v_tenant and owner_uid=v_owner and enabled
 ) then raise exception 'Acceso denegado'; end if;
 if p_request is null or p_payment not in ('efectivo','transferencia')
 or jsonb_typeof(p_lines) is distinct from 'array'
 or jsonb_array_length(p_lines) not between 1 and 100
 then raise exception 'Venta inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_tenant::text));
 select id into v_id from public.gestlok_pilot_pos_sales
 where tenant_id=v_tenant and request_id=p_request;
 if found then return v_id; end if;
 for v_line in
  select (value->>'product_id')::uuid product_id,
         sum((value->>'quantity')::integer) quantity
  from jsonb_array_elements(p_lines)
  group by (value->>'product_id')::uuid
  order by (value->>'product_id')::uuid
 loop
  if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 999
  then raise exception 'Cantidad inválida'; end if;
  select unit_price,stock_quantity into v_price,v_stock
  from public.gestlok_pilot_products
  where tenant_id=v_tenant and owner_uid=v_owner
  and id=v_line.product_id and active for update;
  if not found or v_price is null or v_price < 0 or v_stock is null
  or v_stock < v_line.quantity then raise exception 'Producto o stock inválido'; end if;
  v_total:=v_total+(v_price*v_line.quantity);
  update public.gestlok_pilot_products
  set stock_quantity=stock_quantity-v_line.quantity,
      in_stock=(stock_quantity-v_line.quantity)>0
  where tenant_id=v_tenant and id=v_line.product_id;
 end loop;
 insert into public.gestlok_pilot_pos_sales
 (tenant_id,owner_uid,request_id,payment_method,total,items)
 values (v_tenant,v_owner,p_request,p_payment,v_total,p_lines)
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.gestlok_pos_checkout(uuid,text,jsonb) from public,anon;
grant execute on function public.gestlok_pos_checkout(uuid,text,jsonb) to authenticated;
