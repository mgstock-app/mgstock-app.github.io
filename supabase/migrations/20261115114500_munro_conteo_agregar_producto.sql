-- Conteo de Mi Gusto Munro: creación segura de productos en TODAS las categorías existentes.
-- Los datos previos de shifts (incluyendo historiales finalizados) permanecen intactos.
-- Solo la creadora verificada puede administrar el catálogo (igual que renombrar/quitar).

create unique index if not exists gestlok_munro_conteo_product_name_active_idx
 on gestlok_munro_conteo_private.products (section, lower(btrim(name)))
 where active;

create or replace function public.gestlok_munro_conteo_add_product(
 p_section text, p_name text, p_units_per_chapa integer default 0
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 clean_section text:=btrim(coalesce(p_section,''));
 clean_name text:=btrim(coalesce(p_name,''));
 next_position integer;
 created_product gestlok_munro_conteo_private.products%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,true);
 if char_length(clean_section) < 3 or char_length(clean_section)>70
    or char_length(clean_name)<1 or char_length(clean_name)>100
    or p_units_per_chapa is null or p_units_per_chapa not in (0,27,30) then
   raise exception 'Completá un nombre válido y elegí unidades o chapas';
 end if;
 if not exists (
  select 1 from gestlok_munro_conteo_private.products p where p.section=clean_section
 ) then
   raise exception 'La categoría no existe en Conteo Munro';
 end if;
 if exists (
  select 1 from gestlok_munro_conteo_private.products p
   where p.section=clean_section and p.active and lower(btrim(p.name))=lower(clean_name)
 ) then
   raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
 end if;
 select max(p.position)+1 into next_position
  from gestlok_munro_conteo_private.products p where p.section=clean_section;
 insert into gestlok_munro_conteo_private.products
  (id,section,name,units_per_chapa,position,active)
 values
  ('nuevo-'||replace(pg_catalog.gen_random_uuid()::text,'-',''),clean_section,
   clean_name,p_units_per_chapa,next_position,true)
 returning * into created_product;
 return jsonb_build_object('ok',true,'product',to_jsonb(created_product));
exception when unique_violation then
 raise exception 'Ya existe un producto activo con ese nombre en esta categoría';
end $$;

revoke all on function public.gestlok_munro_conteo_add_product(text,text,integer)
 from public,anon,authenticated;
grant execute on function public.gestlok_munro_conteo_add_product(text,text,integer)
 to authenticated;