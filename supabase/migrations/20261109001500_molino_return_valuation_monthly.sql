-- El Molino Café · Devoluciones 33% y conciliación diaria/mensual.
-- Solo tenant Molino, sin alterar las tablas ni permisos de otras empresas.
-- No recalcular retroactivamente movimientos históricos: congelar los importes al registrar.
alter table public.gestlok_molino_prices
 add column if not exists price_basis text not null default 'unidad'
 check (price_basis in ('unidad','kg'));
alter table public.gestlok_molino_price_changes
 add column if not exists previous_basis text,
 add column if not exists price_basis text;
alter table public.gestlok_molino_movements
 alter column quantity type numeric(12,3),
 add column if not exists unit text not null default 'unidad'
 check (unit in ('unidad','kg','g')),
 add column if not exists unit_price numeric(14,2),
 add column if not exists price_basis text,
 add column if not exists gross_total numeric(16,2),
 add column if not exists discount_rate numeric(5,4),
 add column if not exists discount_amount numeric(16,2),
 add column if not exists net_total numeric(16,2);
alter table public.gestlok_molino_movements
 drop constraint if exists gl_molino_return_valuation_valid;
alter table public.gestlok_molino_movements
 add constraint gl_molino_return_valuation_valid check(
  kind='envio' or
  (unit_price is null and gross_total is null and discount_rate is null and discount_amount is null and net_total is null)
  or
  (unit_price>=0 and gross_total>=0 and discount_rate=0.33
   and discount_amount>=0 and net_total>=0 and gross_total=discount_amount+net_total
   and price_basis in ('unidad','kg'))
 );

-- San Isidro guarda una sola base de precio (por unidad o por kilo).
-- La RPC existente de Precios se preserva; esta nueva añade la base de medida.
create or replace function public.gestlok_molino_save_price_basis(
 p_id uuid,p_product text,p_amount numeric,p_basis text
) returns jsonb language plpgsql security definer set search_path=''
as $molino$
declare v_scope text:=public.gestlok_molino_scope();
 v_old numeric(14,2); v_old_basis text; v_row public.gestlok_molino_prices%rowtype;
 v_product text:=btrim(coalesce(p_product,''));
begin
 if v_scope not in ('admin','dueno','san_isidro') then raise exception 'Solo San Isidro puede modificar Precios' using errcode='42501';end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59' then
  raise exception 'El día ya cerró a las 23:59' using errcode='22023';
 end if;
 if p_basis not in ('unidad','kg') or length(v_product) not between 1 and 140
 or p_amount is null or p_amount<0 or p_amount>999999999 or p_amount<>round(p_amount,2)
 then raise exception 'Producto, precio o unidad de venta inválidos' using errcode='22023';end if;
 if p_id is null then
  insert into public.gestlok_molino_prices(product,amount,price_basis,updated_by)
  values(v_product,p_amount,p_basis,auth.uid()) returning * into v_row;
 else
  select amount,price_basis into v_old,v_old_basis from public.gestlok_molino_prices
  where id=p_id and active for update;
  if not found then raise exception 'Producto no encontrado' using errcode='22023';end if;
  update public.gestlok_molino_prices
   set product=v_product,amount=p_amount,price_basis=p_basis,updated_at=now(),updated_by=auth.uid()
   where id=p_id and active returning * into v_row;
 end if;
 insert into public.gestlok_molino_price_changes(price_id,day,product,previous_amount,amount,changed_by,previous_basis,price_basis)
 values(v_row.id,(now() at time zone 'America/Argentina/Buenos_Aires')::date,
 v_product,v_old,p_amount,auth.uid(),v_old_basis,p_basis);
 return to_jsonb(v_row)-'tenant_id';
end;$molino$;

-- Acassuso escribe: el precio vigente se busca en el servidor y queda congelado.
-- g usa precio por kg y convierte la cantidad /1000; kg acepta tres decimales.
create or replace function public.gestlok_molino_save_return(
 p_id uuid,p_product text,p_quantity numeric,p_unit text,p_note text
) returns jsonb language plpgsql security definer set search_path=''
as $molino$
declare v_scope text:=public.gestlok_molino_scope();
 v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_price public.gestlok_molino_prices%rowtype;
 v_row public.gestlok_molino_movements%rowtype;
 v_product text:=btrim(coalesce(p_product,''));
 v_qty numeric(12,3);v_gross numeric(16,2);v_discount numeric(16,2);
begin
 if v_scope not in ('admin','dueno','acassuso') then raise exception 'Solo Acassuso registra devoluciones' using errcode='42501';end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59' then
  raise exception 'El día ya cerró a las 23:59' using errcode='22023';end if;
 if p_unit not in ('unidad','kg','g') or length(v_product) not between 1 and 140
  or p_quantity is null or p_quantity<=0 or p_quantity>999999
  or p_quantity<>round(p_quantity,3)
  or (p_unit='unidad' and p_quantity<>trunc(p_quantity))
  or length(coalesce(p_note,''))>1000
 then raise exception 'Completá producto, cantidad y unidad válidos' using errcode='22023';end if;
 select * into v_price from public.gestlok_molino_prices
 where active and lower(btrim(product))=lower(v_product)
  and tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
 for share;
 if not found or v_price.amount<=0 then
  raise exception 'San Isidro debe cargar primero el precio de venta de este producto' using errcode='22023';
 end if;
 if (p_unit='unidad' and v_price.price_basis<>'unidad')
  or (p_unit in ('kg','g') and v_price.price_basis<>'kg') then
  raise exception 'La unidad elegida no coincide con el precio de venta (unidad o kg)' using errcode='22023';
 end if;
 v_qty:=p_quantity;
 v_gross:=round(v_price.amount * (case when p_unit='g' then v_qty/1000 else v_qty end),2);
 v_discount:=round(v_gross*0.33,2);
 if p_id is null then
  insert into public.gestlok_molino_movements(
   day,kind,product,quantity,unit,note,created_by,updated_by,
   unit_price,price_basis,gross_total,discount_rate,discount_amount,net_total
  ) values(v_day,'devolucion',v_price.product,v_qty,p_unit,coalesce(p_note,''),auth.uid(),auth.uid(),
   v_price.amount,v_price.price_basis,v_gross,0.33,v_discount,v_gross-v_discount)
  returning * into v_row;
 else
  update public.gestlok_molino_movements
    set product=v_price.product,quantity=v_qty,unit=p_unit,note=coalesce(p_note,''),
    updated_at=now(),updated_by=auth.uid(),unit_price=v_price.amount,price_basis=v_price.price_basis,
    gross_total=v_gross,discount_rate=0.33,discount_amount=v_discount,net_total=v_gross-v_discount
  where id=p_id and tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
   and day=v_day and kind='devolucion' and acknowledged_at is null
  returning * into v_row;
  if not found then raise exception 'Devolución ya confirmada, cerrada o inexistente' using errcode='42501';end if;
 end if;
 return to_jsonb(v_row)-'tenant_id';
end;$molino$;

-- Entrada antigua de devoluciones: delegar al cálculo seguro, nunca crear importes nulos.
CREATE OR REPLACE FUNCTION public.gestlok_molino_save_movement(p_kind text, p_id uuid DEFAULT NULL::uuid, p_product text DEFAULT NULL::text, p_quantity numeric DEFAULT NULL::numeric, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_scope text:=public.gestlok_molino_scope();
        v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
        v_row public.gestlok_molino_movements%rowtype;
begin
 if p_kind not in ('envio','devolucion') then raise exception 'Tipo inválido' using errcode='22023'; end if;
 -- Los retornos usan la RPC con valoración congelada y descuento verificado; no permitir vía legacy sin cálculo.
 if p_kind='devolucion' then
  return public.gestlok_molino_save_return(p_id,p_product,p_quantity,'unidad',p_note);
 end if;
 if v_scope not in ('admin','dueno') and not
   (v_scope='san_isidro' and p_kind='envio' or v_scope='acassuso' and p_kind='devolucion')
 then raise exception 'Este local no puede cargar esa operación' using errcode='42501'; end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59'
 then raise exception 'El día ya cerró a las 23:59' using errcode='22023'; end if;
 if length(btrim(coalesce(p_product,''))) not between 1 and 140
    or p_quantity is null or p_quantity<=0 or p_quantity>999999
    or length(coalesce(p_note,''))>1000
 then raise exception 'Revisá producto, cantidad y observación' using errcode='22023'; end if;
 if p_id is null then
   insert into public.gestlok_molino_movements(day,kind,product,quantity,note,created_by,updated_by)
   values(v_day,p_kind,btrim(p_product),p_quantity,coalesce(p_note,''),auth.uid(),auth.uid())
   returning * into v_row;
 else
   update public.gestlok_molino_movements
      set product=btrim(p_product),quantity=p_quantity,note=coalesce(p_note,''),
          updated_at=now(),updated_by=auth.uid()
    where id=p_id and day=v_day and kind=p_kind and acknowledged_at is null
    returning * into v_row;
   if not found then raise exception 'El detalle ya fue confirmado, cerrado o no existe' using errcode='22023'; end if;
 end if;
 return to_jsonb(v_row)-'tenant_id';
end;
$function$;

-- El histórico mensual es consulta de los movimientos guardados; no reescribe cierres diarios.
create or replace function public.gestlok_molino_returns_month(p_month text)
returns jsonb language plpgsql stable security definer set search_path=''
as $molino$
declare v_month date;v_first date;v_next date;
begin
 if public.gestlok_molino_scope()='none' then raise exception 'Acceso denegado' using errcode='42501';end if;
 if coalesce(p_month,'') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
  raise exception 'Mes inválido (AAAA-MM)' using errcode='22023';
 end if;
 v_month:=to_date(p_month||'-01','YYYY-MM-DD');
 v_first:=date_trunc('month',v_month)::date;
 v_next:=(v_first+interval '1 month')::date;
 return jsonb_build_object('month',p_month,
 'total_items',(select count(*) from public.gestlok_molino_movements m where m.kind='devolucion' and m.day>=v_first and m.day<v_next),
 'unpriced_items',(select count(*) from public.gestlok_molino_movements m where m.kind='devolucion' and m.day>=v_first and m.day<v_next and m.net_total is null),
 'gross',coalesce((select sum(m.gross_total) from public.gestlok_molino_movements m where m.kind='devolucion' and m.day>=v_first and m.day<v_next),0),
 'discount',coalesce((select sum(m.discount_amount) from public.gestlok_molino_movements m where m.kind='devolucion' and m.day>=v_first and m.day<v_next),0),
 'net',coalesce((select sum(m.net_total) from public.gestlok_molino_movements m where m.kind='devolucion' and m.day>=v_first and m.day<v_next),0),
 'days',coalesce((
  select jsonb_agg(jsonb_build_object(
    'day',q.day,'items',q.items,'gross',q.gross,'discount',q.discount,'net',q.net,
    'details',(select coalesce(jsonb_agg(jsonb_build_object(
      'product',x.product,'quantity',x.quantity,'unit',x.unit,'unit_price',x.unit_price,'price_basis',x.price_basis,
      'gross',x.gross_total,'discount',x.discount_amount,'net',x.net_total,
      'acknowledged_at',x.acknowledged_at) order by x.created_at,x.id),'[]'::jsonb)
      from public.gestlok_molino_movements x where x.kind='devolucion' and x.day=q.day)
   ) order by q.day) from (
     select day,count(*) as items,coalesce(sum(gross_total),0) as gross,
     coalesce(sum(discount_amount),0) as discount,coalesce(sum(net_total),0) as net
     from public.gestlok_molino_movements
     where kind='devolucion' and day>=v_first and day<v_next group by day
   ) q
 ),'[]'::jsonb));
end;$molino$;

revoke all on function public.gestlok_molino_save_price_basis(uuid,text,numeric,text) from public,anon;
revoke all on function public.gestlok_molino_save_return(uuid,text,numeric,text,text) from public,anon;
revoke all on function public.gestlok_molino_returns_month(text) from public,anon;
grant execute on function public.gestlok_molino_save_price_basis(uuid,text,numeric,text) to authenticated;
grant execute on function public.gestlok_molino_save_return(uuid,text,numeric,text,text) to authenticated;
grant execute on function public.gestlok_molino_returns_month(text) to authenticated;
