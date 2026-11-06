-- Invitations remain separate from ordinary GESTLOK memberships.
alter table public.gestlok_scanner_invites add column invited_email text;
update public.gestlok_scanner_invites set permissions='{"caja":false,"ventas":false,"stock":false,"precios":false,"historial":false,"reportes":false}'::jsonb||permissions
where not (permissions ?& array['caja','ventas','stock','precios','historial','reportes']);
alter table public.gestlok_scanner_invites add constraint scanner_all_permissions_present
 check (permissions ?& array['caja','ventas','stock','precios','historial','reportes']);
revoke insert,update,delete on public.gestlok_scanner_invites from public,anon,authenticated;
alter policy scanner_invites_owner_select on public.gestlok_scanner_invites to authenticated using (
 owner_uid=(select auth.uid()) and (select public.mi_rol())='dueno'
 and exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_scanner_invites.tenant_id
 and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner'
 and a.tenant_id<>'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid)
);

create schema gestlok_scanner_private;
revoke all on schema gestlok_scanner_private from public,anon,authenticated;
create table gestlok_scanner_private.invite_tokens (
 invite_id uuid primary key references public.gestlok_scanner_invites(id),
 digest bytea not null unique,
 expires_at timestamptz not null
);
alter table gestlok_scanner_private.invite_tokens enable row level security;
revoke all on gestlok_scanner_private.invite_tokens from public,anon,authenticated;

create function gestlok_scanner_private.enrolled(p_tenant uuid,p_owner uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists (select 1 from public.gestlok_pilot_access a
 where a.tenant_id=p_tenant and a.owner_uid=p_owner and a.enabled and a.plan_code='scanner'
 and a.tenant_id<>'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid)
$$;

create function public.gestlok_scanner_invite_save(
 p_tenant uuid,p_id uuid,p_first text,p_last text,p_phone text,p_email text,p_permissions jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_email text:=lower(btrim(p_email));
begin
 if v_uid is null or public.mi_rol() is distinct from 'dueno' or not gestlok_scanner_private.enrolled(p_tenant,v_uid) then
  raise exception 'Acceso denegado' using errcode='42501';
 end if;
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' or v_email is null
    or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Ingresá teléfono internacional y correo válidos' using errcode='22023';
 end if;
 if p_id is null then
  insert into public.gestlok_scanner_invites(tenant_id,owner_uid,first_name,last_name,phone,invited_email,permissions)
  values(p_tenant,v_uid,btrim(p_first),btrim(p_last),p_phone,v_email,p_permissions) returning id into v_id;
 else
  update public.gestlok_scanner_invites set first_name=btrim(p_first),last_name=btrim(p_last),phone=p_phone,
   invited_email=v_email,permissions=p_permissions,updated_at=now()
  where id=p_id and tenant_id=p_tenant and owner_uid=v_uid and status<>'revoked'
    and (status='draft' or invited_email=v_email) returning id into v_id;
 end if;
 if v_id is null then raise exception 'Invitación no editable' using errcode='42501'; end if;
 return v_id;
end $$;

create function public.gestlok_scanner_invite_issue(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 update public.gestlok_scanner_invites i set status='pending',updated_at=now()
 where i.id=p_id and i.owner_uid=auth.uid() and i.status in ('draft','pending') and i.invited_email is not null
 and public.mi_rol()='dueno' and gestlok_scanner_private.enrolled(i.tenant_id,i.owner_uid);
 if not found then raise exception 'Invitación no disponible' using errcode='42501'; end if;
 insert into gestlok_scanner_private.invite_tokens values(p_id,sha256(convert_to(v_token,'UTF8')),now()+interval '48 hours')
 on conflict(invite_id) do update set digest=excluded.digest,expires_at=excluded.expires_at;
 return v_token;
end $$;

create function public.gestlok_scanner_invite_revoke(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.gestlok_scanner_invites i set status='revoked',updated_at=now()
 where i.id=p_id and i.owner_uid=auth.uid() and public.mi_rol()='dueno' and gestlok_scanner_private.enrolled(i.tenant_id,i.owner_uid);
 if not found then raise exception 'Invitación no disponible' using errcode='42501'; end if;
 delete from gestlok_scanner_private.invite_tokens where invite_id=p_id;
end $$;

create function public.gestlok_scanner_invite_redeem(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_tenant uuid; v_invite uuid;
begin
 if v_uid is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
  raise exception 'Invitación no disponible' using errcode='42501';
 end if;
 select t.invite_id into v_invite from gestlok_scanner_private.invite_tokens t where t.digest=sha256(convert_to(p_token,'UTF8'));
 perform 1 from public.gestlok_scanner_invites where id=v_invite for update;
 update public.gestlok_scanner_invites i set status='accepted',invited_uid=v_uid,updated_at=now()
 where i.id=v_invite and i.status='pending' and i.invited_uid is null and i.owner_uid<>v_uid
 and gestlok_scanner_private.enrolled(i.tenant_id,i.owner_uid)
 and exists(select 1 from auth.users u where u.id=v_uid and u.email_confirmed_at is not null and lower(u.email)=i.invited_email)
 and exists(select 1 from gestlok_scanner_private.invite_tokens t where t.invite_id=i.id
   and t.expires_at>now() and t.digest=sha256(convert_to(p_token,'UTF8')))
 returning i.tenant_id into v_tenant;
 if v_tenant is null then raise exception 'Invitación no disponible' using errcode='42501'; end if;
 delete from gestlok_scanner_private.invite_tokens t using public.gestlok_scanner_invites i
 where t.invite_id=i.id and i.invited_uid=v_uid;
 return v_tenant;
end $$;

create function public.gestlok_scanner_guest_context() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tenant_id',i.tenant_id,'first_name',i.first_name,'permissions',i.permissions)
 from public.gestlok_scanner_invites i where i.invited_uid=auth.uid() and i.status='accepted'
 and gestlok_scanner_private.enrolled(i.tenant_id,i.owner_uid)
$$;

revoke all on all functions in schema gestlok_scanner_private from public,anon,authenticated;
revoke all on function public.gestlok_scanner_invite_save(uuid,uuid,text,text,text,text,jsonb),
 public.gestlok_scanner_invite_issue(uuid),public.gestlok_scanner_invite_revoke(uuid),
 public.gestlok_scanner_invite_redeem(text),public.gestlok_scanner_guest_context() from public,anon;
grant execute on function public.gestlok_scanner_invite_save(uuid,uuid,text,text,text,text,jsonb),
 public.gestlok_scanner_invite_issue(uuid),public.gestlok_scanner_invite_revoke(uuid),
 public.gestlok_scanner_invite_redeem(text),public.gestlok_scanner_guest_context() to authenticated;

create function gestlok_scanner_private.guest_owner(p_tenant uuid,p_module text) returns uuid
language sql stable security invoker set search_path='' as $$
 select i.owner_uid from public.gestlok_scanner_invites i where i.invited_uid=auth.uid()
 and i.tenant_id=p_tenant and i.status='accepted' and i.permissions->p_module='true'::jsonb
 and gestlok_scanner_private.enrolled(i.tenant_id,i.owner_uid)
$$;
revoke all on function gestlok_scanner_private.guest_owner(uuid,text) from public,anon,authenticated;

create function public.gestlok_scanner_guest_module(p_tenant uuid,p_module text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=gestlok_scanner_private.guest_owner(p_tenant,p_module); v_data jsonb;
begin
 if v_owner is null then raise exception 'Módulo no autorizado' using errcode='42501'; end if;
 case p_module
 when 'stock' then
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into v_data from (
   select id,name,sku,stock_quantity,stock_minimum,updated_at from public.gestlok_pilot_products
   where tenant_id=p_tenant and owner_uid=v_owner and active order by name limit 500
  ) p;
 when 'precios' then
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into v_data from (
   select id,name,sku,cost_price,markup_percent,unit_price,updated_at from public.gestlok_pilot_products
   where tenant_id=p_tenant and owner_uid=v_owner and active order by name limit 500
  ) p;
 when 'ventas' then
  select jsonb_build_object('live',a.pos_live_enabled,'products',coalesce((select jsonb_agg(to_jsonb(p)) from (
   select id,name,sku,unit_price,stock_quantity,active from public.gestlok_pilot_products
   where tenant_id=p_tenant and owner_uid=v_owner and active order by name limit 500
  ) p),'[]'),'methods',coalesce((select jsonb_agg(jsonb_build_object('method_id',m.method_id,'label',m.label,'enabled',m.enabled))
   from public.gestlok_scanner_payment_methods m where m.tenant_id=p_tenant and m.enabled),'[]')) into v_data
  from public.gestlok_pilot_access a where a.tenant_id=p_tenant and a.owner_uid=v_owner;
 when 'historial' then
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into v_data from (
   select id,created_at,total,payment_method,items from public.gestlok_pilot_pos_sales
   where tenant_id=p_tenant order by created_at desc limit 100
  ) s;
 when 'reportes' then
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into v_data from (
   select (created_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,count(*) as ventas,sum(total) as total
   from public.gestlok_pilot_pos_sales where tenant_id=p_tenant and created_at>=now()-interval '31 days'
   group by 1 order by 1 desc
  ) s;
 else raise exception 'Módulo no disponible' using errcode='42501';
 end case;
 return v_data;
end $$;

create function public.gestlok_scanner_guest_update_product(p_tenant uuid,p_module text,p_id uuid,p_version timestamptz,p_value numeric,p_cost numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=gestlok_scanner_private.guest_owner(p_tenant,p_module);
begin
 if v_owner is null or p_module not in ('stock','precios') then raise exception 'Módulo no autorizado' using errcode='42501'; end if;
 if p_module='stock' then
  if p_value is null or p_value<>trunc(p_value) or p_value not between 0 and 100000000 then raise exception 'Cantidad inválida' using errcode='22023'; end if;
  update public.gestlok_pilot_products set stock_quantity=p_value::integer
  where id=p_id and tenant_id=p_tenant and owner_uid=v_owner and active and updated_at=p_version;
 else
  if p_value is null or p_cost is null or p_value not between 0 and 9999999999.99 or p_cost not between 0 and 9999999999.99 then
   raise exception 'Precio inválido' using errcode='22023';
  end if;
  update public.gestlok_pilot_products set cost_price=p_cost,manual_sale_price=p_value
  where id=p_id and tenant_id=p_tenant and owner_uid=v_owner and active and updated_at=p_version;
 end if;
 if not found then raise exception 'El producto cambió o no está disponible. Volvé a cargarlo.' using errcode='40001'; end if;
end $$;

revoke all on function public.gestlok_scanner_guest_module(uuid,text),public.gestlok_scanner_guest_update_product(uuid,text,uuid,timestamptz,numeric,numeric) from public,anon;
grant execute on function public.gestlok_scanner_guest_module(uuid,text),public.gestlok_scanner_guest_update_product(uuid,text,uuid,timestamptz,numeric,numeric) to authenticated;

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
end $$;


create or replace function public.gestlok_pos_checkout_split(
  p_tenant uuid, p_request uuid, p_payments jsonb, p_lines jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $scanner_body$
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
      and (a.owner_uid=v_user or a.owner_uid=gestlok_scanner_private.guest_owner(p_tenant,'ventas'))
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
end; $scanner_body$;

-- Scanner: resumen por medio real de pago, sin escribir en Caja ni otras empresas.
create or replace function public.gestlok_scanner_pos_resumen(
 p_tenant uuid,p_day date
) returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
 v_uid uuid := (select auth.uid());
 v_sales integer;
 v_total numeric(14,2);
 v_methods jsonb;
begin
 if p_tenant is null or p_day is null or v_uid is null or not exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=p_tenant and a.owner_uid=v_uid
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
end $$;

-- Owners continue seeing their tenant sales, including sales attributed to guests.
drop policy gestlok_pos_owner_read on public.gestlok_pilot_pos_sales;
create policy gestlok_pos_owner_read on public.gestlok_pilot_pos_sales for select to authenticated using (
 exists(select 1 from public.gestlok_pilot_access a where a.tenant_id=gestlok_pilot_pos_sales.tenant_id
  and a.owner_uid=(select auth.uid()) and a.enabled and a.plan_code='scanner')
);

create table gestlok_scanner_private.caja_links (
 tenant_id uuid primary key references public.gestlok_pilot_access(tenant_id),
 comercio_id uuid not null unique references caja_app.comercios(id)
);
alter table gestlok_scanner_private.caja_links enable row level security;
revoke all on gestlok_scanner_private.caja_links from public,anon,authenticated;

create function gestlok_scanner_private.guest_caja(p_comercio uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from gestlok_scanner_private.caja_links l
 join gestlok_caja_private.caja_app_empresas e on e.tenant_id=l.tenant_id and e.habilitada
 join caja_app.comercios c on c.id=l.comercio_id and c.estado='activo'
 join caja_app.miembros m on m.comercio_id=c.id and m.user_id=c.creado_por and m.rol='dueno'
 where l.comercio_id=p_comercio and c.creado_por=gestlok_scanner_private.guest_owner(l.tenant_id,'caja'))
$$;
revoke all on function gestlok_scanner_private.guest_caja(uuid) from public,anon,authenticated;

create function public.gestlok_scanner_caja_options(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if public.mi_rol() is distinct from 'dueno' or not gestlok_scanner_private.enrolled(p_tenant,auth.uid()) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 return jsonb_build_object('selected',(select comercio_id from gestlok_scanner_private.caja_links where tenant_id=p_tenant),
 'options',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre) order by c.nombre)
 from caja_app.comercios c join caja_app.miembros m on m.comercio_id=c.id and m.user_id=auth.uid() and m.rol='dueno'
 where c.creado_por=auth.uid() and c.estado='activo' and exists(select 1 from gestlok_caja_private.caja_app_empresas e where e.tenant_id=p_tenant and e.habilitada)
 and not exists(select 1 from gestlok_scanner_private.caja_links l where l.comercio_id=c.id and l.tenant_id<>p_tenant)),'[]'));
end $$;

create function public.gestlok_scanner_caja_link(p_tenant uuid,p_comercio uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.mi_rol() is distinct from 'dueno' or not gestlok_scanner_private.enrolled(p_tenant,auth.uid()) or not exists(
  select 1 from jsonb_array_elements(public.gestlok_scanner_caja_options(p_tenant)->'options') o where o->>'id'=p_comercio::text
 ) then raise exception 'Caja no autorizada' using errcode='42501'; end if;
 insert into gestlok_scanner_private.caja_links values(p_tenant,p_comercio)
 on conflict(tenant_id) do update set comercio_id=excluded.comercio_id;
end $$;
revoke all on function public.gestlok_scanner_caja_options(uuid),public.gestlok_scanner_caja_link(uuid,uuid) from public,anon;
grant execute on function public.gestlok_scanner_caja_options(uuid),public.gestlok_scanner_caja_link(uuid,uuid) to authenticated;

create or replace function public.caja_app_entrar_cuenta(p_local uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c uuid; v_rol text; p caja_app.personas; v_token text; v_u jsonb; v_nombre text; v_final text; n int := 1;
begin
  select comercio_id into v_c from caja_app.locales where id = p_local and activo;
  if v_c is not null then v_rol := caja_app.rol(v_c); end if;
  if v_rol is null and gestlok_scanner_private.guest_caja(v_c) then v_rol:='cajero'; end if;
  if v_rol is null then raise exception 'Sin acceso a este local' using errcode = '42501'; end if;
  -- Una entrada por comercio a la vez: dos equipos que entran juntos no crean dos personas para la misma cuenta.
  perform pg_advisory_xact_lock(hashtext('caja_app_entrar_cuenta'), hashtext(v_c::text));
  select * into p from caja_app.personas where comercio_id = v_c and user_id = auth.uid();
  if p.id is null and exists (select 1 from caja_app.comercios where id = v_c and creado_por = auth.uid()) then
    update caja_app.personas set user_id = auth.uid()
    where id = (select x.id from caja_app.personas x where x.comercio_id = v_c and x.rol = 'dueno' and x.user_id is null
                order by x.creado_at, x.id limit 1)
    returning * into p;
  end if;
  if p.id is null then
    select to_jsonb(u) into v_u from auth.users u where u.id = auth.uid();
    v_nombre := left(btrim(coalesce(nullif(btrim(v_u->'raw_user_meta_data'->>'full_name'), ''),
      nullif(btrim(v_u->'raw_user_meta_data'->>'name'), ''), split_part(coalesce(v_u->>'email', ''), '@', 1))), 50);
    if char_length(v_nombre) < 2 then v_nombre := 'Cuenta'; end if;
    v_final := v_nombre;
    while exists (select 1 from caja_app.personas where comercio_id = v_c and nombre = v_final) loop
      n := n + 1; v_final := v_nombre || ' ' || n;
    end loop;
    insert into caja_app.personas (comercio_id, nombre, rol, pin_hash, user_id)
    values (v_c, v_final, v_rol, extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', 8)), auth.uid())
    returning * into p;
    perform caja_app.auditar(v_c, null, 'persona_cuenta', p.id, jsonb_build_object('nombre', p.nombre, 'rol', p.rol));
  end if;
  if v_rol='cajero' and caja_app.rol(v_c) is null and p.rol<>'cajero' then
    raise exception 'La persona existente no es compatible con el acceso de invitado' using errcode='42501';
  end if;
  if not p.activo then raise exception 'Tu usuario está desactivado en esta caja. Hablá con el dueño.' using errcode = '42501'; end if;
  if cardinality(p.locales) > 0 and not (p_local = any(p.locales)) then
    raise exception 'Tu usuario no trabaja en este local' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into caja_app.sesiones (token_hash, persona_id, comercio_id, local_id, user_id, expira_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p.id, v_c, p_local, auth.uid(), now() + interval '14 hours');
  return jsonb_build_object('ok', true, 'token', v_token,
    'persona', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'gasto_maximo', p.gasto_maximo));
end $$;

create or replace function caja_app.operador(p_token text) returns caja_app.sesiones
language plpgsql stable security definer set search_path = '' as $$
declare s caja_app.sesiones;
begin
  select x.* into s
  from caja_app.sesiones x
  join caja_app.personas p on p.id = x.persona_id and p.activo
  join caja_app.comercios c on c.id = x.comercio_id and c.estado = 'activo'
  join caja_app.locales l on l.id = x.local_id and l.activo
  where auth.uid() is not null and x.user_id = auth.uid() and x.expira_at > now()
    and (caja_app.rol(x.comercio_id) is not null or (p.rol='cajero' and gestlok_scanner_private.guest_caja(x.comercio_id)))
    and x.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and (cardinality(p.locales) = 0 or x.local_id = any(p.locales));
  if s.token_hash is null then
    raise exception 'Tu sesión de caja venció. Volvé a entrar.' using errcode = '42501';
  end if;
  return s;
end $$;

create or replace function public.caja_app_mis_comercios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rol', m.rol,
    'locales', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre) order by l.nombre)
      from caja_app.locales l where l.comercio_id = c.id and l.activo), '[]'::jsonb)) order by c.nombre), '[]'::jsonb)
  from caja_app.comercios c join lateral (
    select existing.rol from caja_app.miembros existing where existing.comercio_id=c.id and existing.user_id=auth.uid()
    union all select 'cajero' where gestlok_scanner_private.guest_caja(c.id)
     and not exists(select 1 from caja_app.miembros existing where existing.comercio_id=c.id and existing.user_id=auth.uid())
  ) m on true where c.estado='activo'
$$;

create function public.gestlok_scanner_guest_caja(p_tenant uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select l.comercio_id from gestlok_scanner_private.caja_links l where l.tenant_id=p_tenant
 and gestlok_scanner_private.guest_caja(l.comercio_id)
$$;
create function public.gestlok_scanner_guest_receipt(p_tenant uuid,p_sale uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'total',s.total,'items',s.items,'payment_method',s.payment_method,
 'payment_breakdown',s.payment_breakdown,'created_at',s.created_at)
 from public.gestlok_pilot_pos_sales s where s.tenant_id=p_tenant and s.id=p_sale and s.operator_uid=auth.uid()
 and s.created_at>now()-interval '10 minutes' and gestlok_scanner_private.guest_owner(p_tenant,'ventas') is not null
$$;
revoke all on function public.gestlok_scanner_guest_caja(uuid),public.gestlok_scanner_guest_receipt(uuid,uuid) from public,anon;
grant execute on function public.gestlok_scanner_guest_caja(uuid),public.gestlok_scanner_guest_receipt(uuid,uuid) to authenticated;
