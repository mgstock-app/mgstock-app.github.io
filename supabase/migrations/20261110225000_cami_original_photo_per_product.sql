-- Mis Productos / Perfumería: conservar el original al lado de su foto procesada.
-- Privado, exclusivo del producto específico (id+owner), sin modificar Scanner.
ALTER TABLE public.gestlok_cami_product_items
 ADD COLUMN IF NOT EXISTS original_photo_path text;

DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname='gestlok_cami_items_original_photo_path_check'
   AND conrelid='public.gestlok_cami_product_items'::regclass
 ) THEN
  ALTER TABLE public.gestlok_cami_product_items
   ADD CONSTRAINT gestlok_cami_items_original_photo_path_check CHECK (
    original_photo_path IS NULL OR (
     split_part(original_photo_path,'/',1)=owner_uid::text
     AND split_part(original_photo_path,'/',2)=id::text
     AND split_part(original_photo_path,'/',3) ~ '^[0-9]+-[a-zA-Z0-9-]+[.]jpg$'
     AND array_length(string_to_array(original_photo_path,'/'),1)=3
     AND char_length(original_photo_path)<=250
    )
   );
 END IF;
END $$;
