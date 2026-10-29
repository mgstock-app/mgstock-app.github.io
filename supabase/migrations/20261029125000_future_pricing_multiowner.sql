-- Dueños de una misma empresa/local pueden colaborar en Precios/Stock.
-- Únicamente propietarios verificados por RPC, con RLS local y tenant;
-- la identidad del creador se conserva y es inmutable.
drop policy if exists gestlok_future_product_update on public.gestlok_future_local_prices_stock;
create policy gestlok_future_product_update
 on public.gestlok_future_local_prices_stock
 for update to authenticated
 using (public.gestlok_future_pricing_allowed(tenant_id,local_id))
 with check (public.gestlok_future_pricing_allowed(tenant_id,local_id));

create or replace function public.gestlok_future_product_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (
   new.tenant_id is distinct from old.tenant_id or
   new.local_id is distinct from old.local_id or
   new.created_by is distinct from old.created_by
 ) then raise exception 'No se puede mover el producto de empresa o local.';end if;
 if not public.gestlok_future_pricing_allowed(new.tenant_id,new.local_id)
    or (tg_op='INSERT' and new.created_by is distinct from auth.uid()) then
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
