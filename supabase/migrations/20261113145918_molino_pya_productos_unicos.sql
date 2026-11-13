-- Impide altas y renombres duplicados dentro de cada categoría de El Molino Café · Acassuso.
-- El índice no reescribe productos ni cambia los permisos de la RPC existente.
create unique index gestlok_molino_pya_products_name_uniq
  on public.gestlok_molino_pya_products (category_id, lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))))
  where tenant_id = '6c8717ea-5f78-426b-9458-74a5dcac6e4e'::uuid;
