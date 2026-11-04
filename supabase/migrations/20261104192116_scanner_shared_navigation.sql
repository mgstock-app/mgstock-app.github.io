-- Scanner enrollment is server-managed; existing private pilot owners retain their access.
-- No inventory, history, memberships or other plans are changed.
alter table public.gestlok_pilot_access add column plan_code text not null default 'scanner' check (plan_code='scanner');
create or replace function public.gl_pilot_product_calculate_prices()
returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (select 1 from public.gestlok_pilot_access a where a.tenant_id=new.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner') then
    raise exception 'Precios y stock solo están disponibles para la empresa piloto.';
  end if;
  if (new.cost_price is null) <> (new.markup_percent is null) then
    raise exception 'Completá costo y porcentaje juntos.';
  end if;
  if new.cost_price is not null then
    new.unit_price:=round(new.cost_price * (1 + new.markup_percent / 100), 2);
    if new.unit_price > 9999999999.99 then
      raise exception 'El precio de venta supera el máximo permitido.';
    end if;
  elsif tg_op = 'UPDATE' and old.cost_price is not null then
    -- Nunca dejar un precio calculado anterior cuando se borran sus datos base.
    new.unit_price:=null;
  end if;
  if new.stock_quantity is not null then
    new.in_stock:=(new.stock_quantity > 0);
  end if;
  return new;
end $$;
