-- Mis Productos (Camila): almacenar la foto sin editar junto a la foto blanca.
-- Ambas rutas siempre pertenecen al mismo owner_uid e id de producto.
alter table public.gestlok_cami_product_items add column if not exists original_photo_path text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.gestlok_cami_product_items'::regclass and conname='gestlok_cami_items_original_photo_path_check') then
    alter table public.gestlok_cami_product_items
      add constraint gestlok_cami_items_original_photo_path_check check (
        original_photo_path is null or (
          split_part(original_photo_path,'/',1)=owner_uid::text
          and split_part(original_photo_path,'/',2)=id::text
          and split_part(original_photo_path,'/',3) ~ '^[0-9]+-[a-zA-Z0-9-]+[.]jpg$'
          and array_length(string_to_array(original_photo_path,'/'),1)=3
          and char_length(original_photo_path)<=250
        )
      );
  end if;
end $$;
