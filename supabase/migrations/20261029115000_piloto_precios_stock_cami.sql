-- Precios y Stock: SOLO catálogo privado del piloto Perfumes.
-- No modifica public.docs, Mi Gusto, ReciboNet ni los pedidos históricos.
-- El recargo porcentual es sobre el COSTO (no margen sobre precio final).
alter table public.gestlok_pilot_products
  add column if not exists cost_price numeric(12,2),
  add column if not exists markup_percent numeric(7,2),
  add column if not exists stock_quantity integer,
  add column if not exists stock_minimum integer not null default 3;

alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_cost_nonnegative;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_cost_nonnegative check
  (cost_price is null or cost_price between 0 and 9999999999.99);
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_markup_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_markup_valid check
  (markup_percent is null or markup_percent between 0 and 5000);
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_stock_quantity_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_stock_quantity_valid check
  (stock_quantity is null or stock_quantity between 0 and 100000000);
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_stock_minimum_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_stock_minimum_valid check
  (stock_minimum between 0 and 100000000);
alter table public.gestlok_pilot_products
  drop constraint if exists gl_pilot_pricing_pair_valid;
alter table public.gestlok_pilot_products
  add constraint gl_pilot_pricing_pair_valid check
  ((cost_price is null and markup_percent is null)
   or (cost_price is not null and markup_percent is not null));

create or replace function public.gl_pilot_product_calculate_prices()
returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.tenant_id <> '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid then
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

revoke all on function public.gl_pilot_product_calculate_prices() from public,anon,authenticated;
drop trigger if exists gl_pilot_product_calculate_prices on public.gestlok_pilot_products;
create trigger gl_pilot_product_calculate_prices
  before insert or update on public.gestlok_pilot_products
  for each row execute function public.gl_pilot_product_calculate_prices();

comment on column public.gestlok_pilot_products.markup_percent is
  'Recargo % aplicado al costo; ganancia bruta unitaria=precio venta-costo.';
comment on column public.gestlok_pilot_products.stock_quantity is
  'Conteo manual. NULL significa todavía no registrado; no descuenta Pedidos.';
