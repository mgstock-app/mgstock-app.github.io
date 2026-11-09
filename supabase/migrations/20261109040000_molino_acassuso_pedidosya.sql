-- El Molino Café · Acassuso · PedidosYa (09/11/2026).
-- Planilla de precios para PedidosYa, exclusiva de Acassuso. Aditiva: no toca otras tablas.
-- Lectura y escritura solo por RPC SECURITY DEFINER con gestlok_molino_scope():
--   admin (kmu15lopez verificada): categorías, productos, orden, porcentaje y «ya actualizado».
--   admin, dueño y gerente de Acassuso: precios locales y sincronización con San Isidro.
--   San Isidro, otras empresas y anónimos: sin acceso.
-- Los precios de San Isidro (gestlok_molino_prices) solo se leen; nunca se modifican.

create table if not exists public.gestlok_molino_pya_settings (
  tenant_id uuid primary key,
  percent numeric(6,2) not null default 50 check (percent >= 0 and percent <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists public.gestlok_molino_pya_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gestlok_molino_pya_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  category_id uuid not null references public.gestlok_molino_pya_categories(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position integer not null default 0,
  price_local numeric(12,2) check (price_local is null or (price_local >= 0 and price_local <= 99999999)),
  price_source text not null default 'manual' check (price_source in ('manual','san_isidro')),
  linked_price_id uuid,
  pending_pya boolean not null default false,
  price_changed_at timestamptz,
  pya_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gestlok_molino_pya_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_id uuid not null references public.gestlok_molino_pya_products(id) on delete cascade,
  old_price numeric(12,2),
  new_price numeric(12,2),
  old_pya numeric(12,2),
  new_pya numeric(12,2),
  reason text not null default 'manual' check (reason in ('manual','san_isidro','porcentaje')),
  changed_at timestamptz not null default clock_timestamp(),
  changed_by uuid
);
create index if not exists gestlok_molino_pya_products_cat_idx on public.gestlok_molino_pya_products (category_id, position);
create index if not exists gestlok_molino_pya_changes_product_idx on public.gestlok_molino_pya_changes (product_id, changed_at desc);

alter table public.gestlok_molino_pya_settings enable row level security;
alter table public.gestlok_molino_pya_categories enable row level security;
alter table public.gestlok_molino_pya_products enable row level security;
alter table public.gestlok_molino_pya_changes enable row level security;
-- Sin políticas: el acceso directo queda cerrado. Todo pasa por las RPC de abajo.
revoke all on public.gestlok_molino_pya_settings, public.gestlok_molino_pya_categories,
  public.gestlok_molino_pya_products, public.gestlok_molino_pya_changes from anon, authenticated;

create or replace function public.gestlok_molino_pya_scope()
returns text language sql stable security definer set search_path = '' as $$
  select case when public.gestlok_molino_scope() in ('admin','dueno','acassuso')
              and gestlok_tenancy.current_tenant_id() = '6c8717ea-5f78-426b-9458-74a5dcac6e4e'::uuid
         then public.gestlok_molino_scope() else 'none' end;
$$;

create or replace function public.gestlok_molino_pya_round(p numeric, pct numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case when p is null then null else round(p * (1 + coalesce(pct,50) / 100.0), 0) end;
$$;

create or replace function public.gestlok_molino_pya_require(p_admin boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
declare s text := public.gestlok_molino_pya_scope();
begin
  if s = 'none' or (p_admin and s <> 'admin') then
    raise exception 'Sin autorización para PedidosYa de Acassuso' using errcode = '42501';
  end if;
end $$;

create or replace function public.gestlok_molino_pya_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; pct numeric; s text;
begin
  perform public.gestlok_molino_pya_require(false);
  s := public.gestlok_molino_pya_scope();
  select percent into pct from public.gestlok_molino_pya_settings where tenant_id = t;
  pct := coalesce(pct, 50);
  return jsonb_build_object(
    'scope', s, 'can_admin', s = 'admin', 'percent', pct,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'position',c.position) order by c.position, c.created_at)
      from public.gestlok_molino_pya_categories c where c.tenant_id = t), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'category_id',p.category_id,'name',p.name,'position',p.position,'price_local',p.price_local,
        'price_source',p.price_source,'linked_price_id',p.linked_price_id,'pending_pya',p.pending_pya,
        'price_changed_at',p.price_changed_at,'pya_updated_at',p.pya_updated_at,
        'san_isidro_product',sp.product,'san_isidro_amount',sp.amount,
        'last_change',(select jsonb_build_object('old_price',ch.old_price,'new_price',ch.new_price,'old_pya',ch.old_pya,'new_pya',ch.new_pya,'reason',ch.reason,'changed_at',ch.changed_at)
           from public.gestlok_molino_pya_changes ch where ch.product_id = p.id order by ch.changed_at desc limit 1)
      ) order by p.position, p.created_at)
      from public.gestlok_molino_pya_products p
      left join public.gestlok_molino_prices sp on sp.id = p.linked_price_id and sp.tenant_id = t
      where p.tenant_id = t), '[]'::jsonb),
    'san_isidro_prices', coalesce((select jsonb_agg(jsonb_build_object('id',sp.id,'product',sp.product,'amount',sp.amount) order by sp.product)
      from public.gestlok_molino_prices sp where sp.tenant_id = t and coalesce(sp.active, true)), '[]'::jsonb)
  );
end $$;

-- Cambia el precio local de un producto dejando registro y marcándolo pendiente en PedidosYa.
create or replace function public.gestlok_molino_pya_apply_price(p_id uuid, p_price numeric, p_source text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; cur public.gestlok_molino_pya_products; pct numeric;
begin
  select * into cur from public.gestlok_molino_pya_products where id = p_id and tenant_id = t for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if p_price is not null and (p_price < 0 or p_price > 99999999) then raise exception 'Precio inválido'; end if;
  if cur.price_local is not distinct from p_price then
    update public.gestlok_molino_pya_products set price_source = p_source, updated_at = now() where id = p_id;
    return false;
  end if;
  select coalesce((select percent from public.gestlok_molino_pya_settings where tenant_id = t), 50) into pct;
  insert into public.gestlok_molino_pya_changes(tenant_id, product_id, old_price, new_price, old_pya, new_pya, reason, changed_by)
    values (t, p_id, cur.price_local, p_price, public.gestlok_molino_pya_round(cur.price_local, pct), public.gestlok_molino_pya_round(p_price, pct), p_reason, auth.uid());
  update public.gestlok_molino_pya_products
     set price_local = p_price, price_source = p_source, pending_pya = true, price_changed_at = now(), updated_at = now()
   where id = p_id;
  return true;
end $$;
revoke all on function public.gestlok_molino_pya_apply_price(uuid, numeric, text, text) from public, anon, authenticated;

-- Guardar precios locales (admin, dueño, gerente de Acassuso). p_changes: [{id, price}]
create or replace function public.gestlok_molino_pya_save_prices(p_changes jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; n integer := 0; v numeric;
begin
  perform public.gestlok_molino_pya_require(false);
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 500 then raise exception 'Cambios inválidos'; end if;
  for item in select * from jsonb_array_elements(p_changes) loop
    v := case when item->>'price' is null or item->>'price' = '' then null else (item->>'price')::numeric end;
    if public.gestlok_molino_pya_apply_price((item->>'id')::uuid, v, 'manual', 'manual') then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Traer precios de San Isidro. Los productos con precio manual distinto solo se pisan si se
-- confirman en p_confirm (lista de ids). Nunca escribe en la lista de San Isidro.
create or replace function public.gestlok_molino_pya_sync(p_confirm uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; r record; updated integer := 0; conflicts jsonb := '[]'::jsonb;
begin
  perform public.gestlok_molino_pya_require(false);
  for r in select p.id, p.name, p.price_local, p.price_source, sp.amount
             from public.gestlok_molino_pya_products p
             join public.gestlok_molino_prices sp on sp.id = p.linked_price_id and sp.tenant_id = t
            where p.tenant_id = t and p.price_local is distinct from sp.amount loop
    if r.price_source = 'san_isidro' or r.price_local is null or r.id = any(coalesce(p_confirm,'{}')) then
      if public.gestlok_molino_pya_apply_price(r.id, r.amount, 'san_isidro', 'san_isidro') then updated := updated + 1; end if;
    else
      conflicts := conflicts || jsonb_build_object('id', r.id, 'name', r.name, 'price_local', r.price_local, 'san_isidro_amount', r.amount);
    end if;
  end loop;
  return jsonb_build_object('updated', updated, 'conflicts', conflicts);
end $$;

create or replace function public.gestlok_molino_pya_mark_updated(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.gestlok_molino_pya_require(true);
  update public.gestlok_molino_pya_products set pending_pya = false, pya_updated_at = now(), updated_at = now()
   where tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e' and id = any(coalesce(p_ids,'{}')) and pending_pya;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.gestlok_molino_pya_set_percent(p_percent numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; old numeric; r record;
begin
  perform public.gestlok_molino_pya_require(true);
  if p_percent is null or p_percent < 0 or p_percent > 500 then raise exception 'Porcentaje inválido'; end if;
  select percent into old from public.gestlok_molino_pya_settings where tenant_id = t;
  old := coalesce(old, 50);
  insert into public.gestlok_molino_pya_settings(tenant_id, percent, updated_at, updated_by) values (t, p_percent, now(), auth.uid())
    on conflict (tenant_id) do update set percent = excluded.percent, updated_at = now(), updated_by = auth.uid();
  if old <> p_percent then
    -- Cambian todos los precios PYA: quedan marcados para actualizar en PedidosYa.
    for r in select id, price_local from public.gestlok_molino_pya_products where tenant_id = t and price_local is not null loop
      insert into public.gestlok_molino_pya_changes(tenant_id, product_id, old_price, new_price, old_pya, new_pya, reason, changed_by)
        values (t, r.id, r.price_local, r.price_local, public.gestlok_molino_pya_round(r.price_local, old), public.gestlok_molino_pya_round(r.price_local, p_percent), 'porcentaje', auth.uid());
    end loop;
    update public.gestlok_molino_pya_products set pending_pya = true, price_changed_at = now(), updated_at = now()
     where tenant_id = t and price_local is not null;
  end if;
  return p_percent;
end $$;

create or replace function public.gestlok_molino_pya_category_save(p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; v uuid;
begin
  perform public.gestlok_molino_pya_require(true);
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Nombre de categoría inválido'; end if;
  if p_id is null then
    insert into public.gestlok_molino_pya_categories(tenant_id, name, position)
      values (t, btrim(p_name), coalesce((select max(position) + 1 from public.gestlok_molino_pya_categories where tenant_id = t), 0))
      returning id into v;
  else
    update public.gestlok_molino_pya_categories set name = btrim(p_name), updated_at = now() where id = p_id and tenant_id = t returning id into v;
    if v is null then raise exception 'Categoría inexistente'; end if;
  end if;
  return v;
end $$;

create or replace function public.gestlok_molino_pya_category_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestlok_molino_pya_require(true);
  delete from public.gestlok_molino_pya_categories where id = p_id and tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
  return found;
end $$;

create or replace function public.gestlok_molino_pya_product_save(p_id uuid, p_category uuid, p_name text, p_price numeric, p_linked uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; v uuid; linked uuid := p_linked; cur_cat uuid;
begin
  perform public.gestlok_molino_pya_require(true);
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Nombre de producto inválido'; end if;
  if not exists(select 1 from public.gestlok_molino_pya_categories where id = p_category and tenant_id = t) then raise exception 'Categoría inexistente'; end if;
  if linked is not null and not exists(select 1 from public.gestlok_molino_prices where id = linked and tenant_id = t) then linked := null; end if;
  if p_id is null then
    insert into public.gestlok_molino_pya_products(tenant_id, category_id, name, position, linked_price_id)
      values (t, p_category, btrim(p_name), coalesce((select max(position) + 1 from public.gestlok_molino_pya_products where category_id = p_category), 0), linked)
      returning id into v;
  else
    select category_id into cur_cat from public.gestlok_molino_pya_products where id = p_id and tenant_id = t;
    if cur_cat is null then raise exception 'Producto inexistente'; end if;
    update public.gestlok_molino_pya_products
       set name = btrim(p_name), linked_price_id = linked, updated_at = now(),
           category_id = p_category,
           position = case when cur_cat = p_category then position
                      else coalesce((select max(position) + 1 from public.gestlok_molino_pya_products where category_id = p_category), 0) end
     where id = p_id returning id into v;
  end if;
  if p_price is not null or p_id is null then perform public.gestlok_molino_pya_apply_price(v, p_price, 'manual', 'manual'); end if;
  return v;
end $$;

create or replace function public.gestlok_molino_pya_product_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.gestlok_molino_pya_require(true);
  delete from public.gestlok_molino_pya_products where id = p_id and tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
  return found;
end $$;

-- Ordenar productos dentro de una categoría (solo la administradora).
create or replace function public.gestlok_molino_pya_reorder(p_category uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare i integer := 0; x uuid;
begin
  perform public.gestlok_molino_pya_require(true);
  foreach x in array coalesce(p_ids,'{}') loop
    update public.gestlok_molino_pya_products set position = i, updated_at = now()
     where id = x and category_id = p_category and tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
    i := i + 1;
  end loop;
  return i;
end $$;

revoke all on function public.gestlok_molino_pya_scope(), public.gestlok_molino_pya_require(boolean),
  public.gestlok_molino_pya_state(), public.gestlok_molino_pya_save_prices(jsonb), public.gestlok_molino_pya_sync(uuid[]),
  public.gestlok_molino_pya_mark_updated(uuid[]), public.gestlok_molino_pya_set_percent(numeric),
  public.gestlok_molino_pya_category_save(uuid, text), public.gestlok_molino_pya_category_delete(uuid),
  public.gestlok_molino_pya_product_save(uuid, uuid, text, numeric, uuid), public.gestlok_molino_pya_product_delete(uuid),
  public.gestlok_molino_pya_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.gestlok_molino_pya_state(), public.gestlok_molino_pya_save_prices(jsonb),
  public.gestlok_molino_pya_sync(uuid[]), public.gestlok_molino_pya_mark_updated(uuid[]), public.gestlok_molino_pya_set_percent(numeric),
  public.gestlok_molino_pya_category_save(uuid, text), public.gestlok_molino_pya_category_delete(uuid),
  public.gestlok_molino_pya_product_save(uuid, uuid, text, numeric, uuid), public.gestlok_molino_pya_product_delete(uuid),
  public.gestlok_molino_pya_reorder(uuid, uuid[]) to authenticated;
