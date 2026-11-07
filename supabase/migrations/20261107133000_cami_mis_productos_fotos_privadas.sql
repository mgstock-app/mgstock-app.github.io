-- Fotos manuales para Mis Productos, solo para la cuenta dueña de Perfumería.
-- Sin cambios a catálogo Scanner, Caja, Mi Gusto o datos existentes.
alter table public.gestlok_cami_product_items
 add column if not exists photo_path text;

alter table public.gestlok_cami_product_items
 add constraint gestlok_cami_items_photo_path_check check (
  photo_path is null or (
   split_part(photo_path,'/',1) = owner_uid::text
   and split_part(photo_path,'/',2) = id::text
   and split_part(photo_path,'/',3) ~ '^[0-9]+-[a-zA-Z0-9-]+[.]jpg$'
   and array_length(string_to_array(photo_path,'/'),1) = 3
   and char_length(photo_path) <= 250
  )
 );

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('gestlok-cami-product-photos','gestlok-cami-product-photos',false,3145728,array['image/jpeg'])
 on conflict(id) do nothing;

-- Los archivos se sirven solo con URLs firmadas temporales.
-- La RLS valida el UID real de Auth y la carpeta del propietario.
create policy gl_cami_product_photos_select on storage.objects
 for select to authenticated
 using (
  bucket_id='gestlok-cami-product-photos'
  and (select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
  and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'
 );
create policy gl_cami_product_photos_insert on storage.objects
 for insert to authenticated
 with check (
  bucket_id='gestlok-cami-product-photos'
  and (select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
  and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'
 );
create policy gl_cami_product_photos_delete on storage.objects
 for delete to authenticated
 using (
  bucket_id='gestlok-cami-product-photos'
  and (select auth.uid())='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid
  and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'
 );
