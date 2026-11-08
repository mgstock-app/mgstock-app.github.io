-- Restaurar la validación previa del trigger de precios/stock sin tocar datos.
CREATE OR REPLACE FUNCTION public.gl_pilot_product_calculate_prices()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Conservar el control original por dueña/dueño y empresa Scanner habilitada.
  if not exists (
    select 1 from public.gestlok_pilot_access a
    where a.tenant_id=new.tenant_id
      and a.owner_uid=(select auth.uid())
      and a.enabled and a.plan_code='scanner'
  ) then
    if not coalesce((tg_op='UPDATE' and new.tenant_id=old.tenant_id and new.owner_uid=old.owner_uid and (
      gestlok_scanner_private.guest_owner(new.tenant_id,'stock')=new.owner_uid
      or gestlok_scanner_private.guest_owner(new.tenant_id,'precios')=new.owner_uid
      or gestlok_scanner_private.guest_owner(new.tenant_id,'ventas')=new.owner_uid
    )),false) then
      raise exception 'Precios y stock solo están disponibles para la empresa piloto.' using errcode='42501';
    end if;
  end if;

  if new.manual_sale_price is not null then
    if new.cost_price is null then
      raise exception 'Ingresá el costo para poder registrar un precio final.';
    end if;
    -- El precio de venta escrito se guarda exacto; no se reconstruye con el
    -- recargo de dos decimales porque eso cambiaría centavos al confirmar.
    new.unit_price := new.manual_sale_price;
    if new.cost_price > 0 then
      new.markup_percent := round((new.manual_sale_price / new.cost_price - 1) * 100, 2);
      if new.markup_percent > 5000 or new.markup_percent < -100 then
        raise exception 'El precio final supera el límite de recargo permitido.';
      end if;
    else
      new.markup_percent := null;
    end if;
  else
    if (new.cost_price is null) <> (new.markup_percent is null) then
      raise exception 'Completá costo y porcentaje juntos.';
    end if;
    if new.cost_price is not null then
      new.unit_price := round(new.cost_price * (1 + new.markup_percent / 100), 2);
      if new.unit_price > 9999999999.99 then
        raise exception 'El precio de venta supera el máximo permitido.';
      end if;
    elsif tg_op = 'UPDATE' and old.cost_price is not null then
      new.unit_price := null;
    end if;
  end if;

  if new.stock_quantity is not null then
    new.in_stock := (new.stock_quantity > 0);
  end if;
  return new;
end $function$;
