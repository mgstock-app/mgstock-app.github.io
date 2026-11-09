-- El Molino Café · Acassuso · PedidosYa: categorías aprobadas y redondeo (09/11/2026).
-- Aditiva y solo para el tenant de El Molino. No toca San Isidro (gestlok_molino_prices) ni otras empresas.
-- 1) Precio PYA = precio local + porcentaje, redondeado hacia arriba a múltiplos de $100.
-- 2) Sin categorías duplicadas (mismo nombre sin importar mayúsculas ni espacios).
-- 3) Ordenar categorías: solo la administradora verificada (gestlok_molino_pya_require(true)).
-- 4) Alta de las 18 categorías aprobadas, vacías y en el orden pedido. Idempotente.

create or replace function public.gestlok_molino_pya_round(p numeric, pct numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case when p is null then null
              else ceil(round(p * (100 + coalesce(pct, 50)) / 100.0, 2) / 100) * 100 end;
$$;

create unique index if not exists gestlok_molino_pya_categories_name_uniq
  on public.gestlok_molino_pya_categories (tenant_id, lower(btrim(name)));

create or replace function public.gestlok_molino_pya_category_save(p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := '6c8717ea-5f78-426b-9458-74a5dcac6e4e'; v uuid;
begin
  perform public.gestlok_molino_pya_require(true);
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Nombre de categoría inválido'; end if;
  if exists(select 1 from public.gestlok_molino_pya_categories
             where tenant_id = t and lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'Ya existe una categoría con ese nombre' using errcode = '23505';
  end if;
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

-- Ordenar categorías (solo la administradora). p_ids: todas las categorías en el orden nuevo.
create or replace function public.gestlok_molino_pya_category_reorder(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare i integer := 0; x uuid;
begin
  perform public.gestlok_molino_pya_require(true);
  foreach x in array coalesce(p_ids,'{}') loop
    update public.gestlok_molino_pya_categories set position = i, updated_at = now()
     where id = x and tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e';
    i := i + 1;
  end loop;
  return i;
end $$;
revoke all on function public.gestlok_molino_pya_category_reorder(uuid[]) from public, anon;
grant execute on function public.gestlok_molino_pya_category_reorder(uuid[]) to authenticated;
revoke all on function public.gestlok_molino_pya_category_save(uuid, text) from public, anon;
grant execute on function public.gestlok_molino_pya_category_save(uuid, text) to authenticated;

-- Las 18 categorías aprobadas por la administradora, vacías y en este orden.
-- Si alguna ya existe (mismo nombre), no se duplica: solo se le asigna su lugar en la lista.
with lista(name, pos) as (
  select * from unnest(array[
    'Promociones y combos','Desayunos y meriendas','Cafetería','Pastelería','Panadería',
    'Sándwiches y tostados','Hamburguesas','Ensaladas','Entradas y para compartir','Pizzas',
    'Milanesas y supremas','Pastas','Platos principales','Guarniciones','Postres',
    'Cervezas frías','Vinos','Especiales de temporada'
  ]) with ordinality as u(name, pos)
)
insert into public.gestlok_molino_pya_categories(tenant_id, name, position)
select '6c8717ea-5f78-426b-9458-74a5dcac6e4e'::uuid, l.name, l.pos - 1
  from lista l
 where not exists (select 1 from public.gestlok_molino_pya_categories c
                    where c.tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
                      and lower(btrim(c.name)) = lower(l.name));

with lista(name, pos) as (
  select * from unnest(array[
    'Promociones y combos','Desayunos y meriendas','Cafetería','Pastelería','Panadería',
    'Sándwiches y tostados','Hamburguesas','Ensaladas','Entradas y para compartir','Pizzas',
    'Milanesas y supremas','Pastas','Platos principales','Guarniciones','Postres',
    'Cervezas frías','Vinos','Especiales de temporada'
  ]) with ordinality as u(name, pos)
)
update public.gestlok_molino_pya_categories c
   set position = l.pos - 1
  from lista l
 where c.tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e'
   and lower(btrim(c.name)) = lower(l.name)
   and c.position is distinct from l.pos - 1;
