-- Plan Scanner: permite fijar el precio final exacto, sin depender del redondeo del recargo.
-- Una columna NULL mantiene el modo porcentaje y todos los productos históricos.
-- Solo afecta el catálogo protegido gestlok_pilot_products; no altera Mi Gusto ni otras tablas.
alter table public.gestlok_pilot_products
  add column if not exists manual_sale_price numeric(12,2);

alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_manual_sale_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_manual_sale_valid check
  (manual_sale_price is null or manual_sale_price between 0 and 9999999999.99);

-- Un precio fijado manualmente puede ser inferior al costo (liquidaciones).
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_markup_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_markup_valid check
  (markup_percent is null or markup_percent between -100 and 5000);

-- Para costo cero, el recargo del precio manual es matemáticamente indefinido.
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_pricing_pair_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_pricing_pair_valid check
  (
    (cost_price is null and markup_percent is null and manual_sale_price is null)
    or
    (cost_price is not null and (manual_sale_price is not null or markup_percent is not null))
  );

create or replace function public.gl_pilot_product_calculate_prices()
returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Conservar el control original por dueña/dueño y empresa Scanner habilitada.
  if not exists (
    select 1 from public.gestlok_pilot_access a
    where a.tenant_id=new.tenant_id
      and a.owner_uid=(select auth.uid())
      and a.enabled and a.plan_code='scanner'
  ) then
    raise exception 'Precios y stock solo están disponibles para la empresa piloto.';
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
end $$;

revoke all on function public.gl_pilot_product_calculate_prices() from public, anon, authenticated;

comment on column public.gestlok_pilot_products.manual_sale_price is
  'Precio final fijado manualmente para Plan Scanner. NULL usa cálculo por recargo; no modifica ventas históricas.';
comment on column public.gestlok_pilot_products.markup_percent is
  'Recargo sobre costo (puede ser negativo); se calcula automáticamente cuando el precio es manual.';
