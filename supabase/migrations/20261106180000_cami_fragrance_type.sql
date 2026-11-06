-- Clasificación opcional de fragancias para el cuaderno privado de Camila.
-- Mantiene RLS, propietario y tenant originales; no modifica Plan Scanner ni Mi Gusto.
alter table public.gestlok_cami_product_items
 add column if not exists fragrance_type text;
alter table public.gestlok_cami_product_items
 drop constraint if exists gestlok_cami_product_items_fragrance_type_check;
alter table public.gestlok_cami_product_items
 add constraint gestlok_cami_product_items_fragrance_type_check
 check (fragrance_type is null or fragrance_type in ('fem','hombre','unisex'));
