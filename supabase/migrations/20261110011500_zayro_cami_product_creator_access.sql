-- ZAYRO / Mis Productos: acceso de creadora real sin trasladar la propiedad de Camila.
-- Migración aditiva, sin cambios a stock, caja, ventas ni otros tenants.
-- La cuenta creadora debe figurar en gestlok_platform.admins y tener correo confirmado.
create or replace function public.gestlok_cami_creator_authorized()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from gestlok_platform.admins a
  join auth.users u on u.id=a.user_id
  where a.user_id=(select auth.uid())
    and u.email_confirmed_at is not null
    and lower(u.email)='kmu15lopez@gmail.com'
 );
$$;
revoke all on function public.gestlok_cami_creator_authorized() from public,anon,authenticated;
grant execute on function public.gestlok_cami_creator_authorized() to authenticated;

create policy gl_cami_tabs_creator_select on public.gestlok_cami_product_tabs for select to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_tabs_creator_insert on public.gestlok_cami_product_tabs for insert to authenticated with check (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_tabs_creator_update on public.gestlok_cami_product_tabs for update to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized())) with check (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_tabs_creator_delete on public.gestlok_cami_product_tabs for delete to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));

create policy gl_cami_items_creator_select on public.gestlok_cami_product_items for select to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_items_creator_insert on public.gestlok_cami_product_items for insert to authenticated with check (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_items_creator_update on public.gestlok_cami_product_items for update to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized())) with check (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_items_creator_delete on public.gestlok_cami_product_items for delete to authenticated using (owner_uid='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'::uuid and tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid and (select public.gestlok_cami_creator_authorized()));

create policy gl_cami_photos_creator_select on storage.objects for select to authenticated using (bucket_id='gestlok-cami-product-photos' and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3' and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_photos_creator_insert on storage.objects for insert to authenticated with check (bucket_id='gestlok-cami-product-photos' and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3' and (select public.gestlok_cami_creator_authorized()));
create policy gl_cami_photos_creator_delete on storage.objects for delete to authenticated using (bucket_id='gestlok-cami-product-photos' and (storage.foldername(name))[1]='8ddf2c6c-8d62-44de-8ce8-27eb5759daa3' and (select public.gestlok_cami_creator_authorized()));

-- Los nuevos registros creados por la administradora mantienen owner_uid de Camila;
-- la aplicación envía explícitamente ese UID para respetar FK y constraints existentes.
