-- Precios y Stock generales: nuevos locales de empresas NO Mi Gusto.
-- Locales existentes al despliegue: Belisa Parfum conserva el piloto,
-- Mi Gusto (Munro/Torcuato) y TODOS sus futuros locales quedan excluidos.
-- Autorización siempre desde gestlok_owner_area_context(), NO metadatos del cliente.
create or replace function public.gestlok_future_pricing_scope()
returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v jsonb; v_ids jsonb;
begin
  if auth.uid() is null or public.mi_rol() is distinct from 'dueno' then
    return jsonb_build_object('enabled',false,'local_ids','[]'::jsonb);
  end if;
  v:=public.gestlok_owner_area_context();
  if v->>'role' <> 'dueno'
   or v->>'tenant_id' is distinct from gestlok_tenancy.current_tenant_id()::text
   or v->>'tenant_id' = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'
   or coalesce(v->>'logo_id','')='mi-gusto'
   or lower(btrim(coalesce(v->>'company_name','')))='mi gusto'
  then return jsonb_build_object('enabled',false,'local_ids','[]'::jsonb); end if;
  -- No habilitar esta nueva pantalla sobre el local piloto preexistente de Cami.
  -- Todos los otros locales nuevos habilitados por su membresía serán incluidos.
  select coalesce(jsonb_agg(i.id),'[]'::jsonb) into v_ids
  from jsonb_array_elements_text(coalesce(v->'local_ids','[]'::jsonb)) as i(id)
  where not (
    v->>'tenant_id'='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'
    and i.id='loc-2a97bf8d7d084aa7b051'
  );
  return jsonb_build_object('enabled',jsonb_array_length(v_ids)>0,
    'tenant_id',v->>'tenant_id','company_name',v->>'company_name','local_ids',v_ids);
end $$;
revoke all on function public.gestlok_future_pricing_scope() from public,anon;
grant execute on function public.gestlok_future_pricing_scope() to authenticated;

create or replace function public.gestlok_future_pricing_allowed(p_tenant uuid,p_local text)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare s jsonb;
begin
 if auth.uid() is null or public.mi_rol() is distinct from 'dueno'
    or p_tenant is distinct from gestlok_tenancy.current_tenant_id()
    or p_tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
 then return false;end if;
 s:=public.gestlok_future_pricing_scope();
 return coalesce((s->>'enabled')::boolean,false)
  and s->>'tenant_id'=p_tenant::text
  and coalesce(s->'local_ids','[]'::jsonb) ? p_local;
exception when insufficient_privilege then return false;
end $$;
revoke all on function public.gestlok_future_pricing_allowed(uuid,text) from public,anon;
grant execute on function public.gestlok_future_pricing_allowed(uuid,text) to authenticated;

create table if not exists public.gestlok_future_local_prices_stock (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null default gestlok_tenancy.current_tenant_id(),
 local_id text not null check(char_length(local_id) between 1 and 120),
 created_by uuid not null default auth.uid(),
 name text not null check(char_length(btrim(name)) between 2 and 140),
 category text not null default '' check(char_length(category)<=80),
 sku text not null default '' check(char_length(sku)<=80),
 cost_price numeric(12,2) check(cost_price is null or cost_price between 0 and 9999999999.99),
 markup_percent numeric(7,2) check(markup_percent is null or markup_percent between 0 and 5000),
 sale_price numeric(12,2) check(sale_price is null or sale_price between 0 and 9999999999.99),
 stock_quantity integer check(stock_quantity is null or stock_quantity between 0 and 100000000),
 stock_minimum integer not null default 3 check(stock_minimum between 0 and 100000000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint gestlok_future_price_pair check(
   (cost_price is null and markup_percent is null) or
   (cost_price is not null and markup_percent is not null))
);
create index if not exists gestlok_future_local_products_idx
 on public.gestlok_future_local_prices_stock(tenant_id,local_id,name);
alter table public.gestlok_future_local_prices_stock enable row level security;
revoke all on public.gestlok_future_local_prices_stock from public,anon,authenticated;
grant select,insert,update on public.gestlok_future_local_prices_stock to authenticated;
create policy gestlok_future_product_select on public.gestlok_future_local_prices_stock
 for select to authenticated
 using (public.gestlok_future_pricing_allowed(tenant_id,local_id));
create policy gestlok_future_product_insert on public.gestlok_future_local_prices_stock
 for insert to authenticated
 with check (created_by=(select auth.uid()) and
   public.gestlok_future_pricing_allowed(tenant_id,local_id));
create policy gestlok_future_product_update on public.gestlok_future_local_prices_stock
 for update to authenticated
 using (created_by=(select auth.uid()) and
   public.gestlok_future_pricing_allowed(tenant_id,local_id))
 with check (created_by=(select auth.uid()) and
   public.gestlok_future_pricing_allowed(tenant_id,local_id));

create or replace function public.gestlok_future_product_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (
   new.tenant_id is distinct from old.tenant_id or
   new.local_id is distinct from old.local_id or
   new.created_by is distinct from old.created_by
 ) then raise exception 'No se puede mover el producto de empresa o local.';end if;
 if not public.gestlok_future_pricing_allowed(new.tenant_id,new.local_id)
    or new.created_by is distinct from auth.uid() then
   raise exception 'Acceso no autorizado a esta empresa/local.' using errcode='42501';
 end if;
 if (new.cost_price is null) <> (new.markup_percent is null) then
   raise exception 'Completá costo y recargo juntos.';end if;
 if new.cost_price is not null then
   new.sale_price:=round(new.cost_price*(1+new.markup_percent/100),2);
   if new.sale_price>9999999999.99 then
      raise exception 'Precio fuera del límite permitido.';end if;
 else new.sale_price:=null;end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function public.gestlok_future_product_guard() from public,anon;
drop trigger if exists gestlok_future_product_guard on public.gestlok_future_local_prices_stock;
create trigger gestlok_future_product_guard
 before insert or update on public.gestlok_future_local_prices_stock
 for each row execute function public.gestlok_future_product_guard();

comment on table public.gestlok_future_local_prices_stock is
 'Catálogo manual por local; nuevos negocios, excluyendo permanentemente Mi Gusto y su marca. No modifica Pedidos ni descuenta stock automáticamente.';
