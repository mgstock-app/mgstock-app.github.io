-- GestLok · modalidad de tienda compartida por empresa.
-- public.docs ya tiene RLS y la política RESTRICTIVE gestlok_tenant_fence:
-- estas políticas sólo conceden operaciones dentro del tenant autenticado.
-- El documento (col='configuracion_negocio', id='empresa-<tenant_uuid>') se comparte
-- entre sucursales y sólo la creadora y la dueña pueden editarlo.
drop policy if exists gestlok_config_read on public.docs;
create policy gestlok_config_read on public.docs
  for select to authenticated
  using (col = 'configuracion_negocio'
         and id = 'empresa-' || (select gestlok_tenancy.current_tenant_id())::text
         and public.es_miembro());

drop policy if exists gestlok_config_owner_insert on public.docs;
create policy gestlok_config_owner_insert on public.docs
  for insert to authenticated
  with check (col = 'configuracion_negocio'
              and id = 'empresa-' || (select gestlok_tenancy.current_tenant_id())::text
              and public.mi_rol() in ('creadora','dueno')
              and data ->> 'tipo' in ('fisica','online','mixta'));

drop policy if exists gestlok_config_owner_update on public.docs;
create policy gestlok_config_owner_update on public.docs
  for update to authenticated
  using (col = 'configuracion_negocio'
         and id = 'empresa-' || (select gestlok_tenancy.current_tenant_id())::text
         and public.mi_rol() in ('creadora','dueno'))
  with check (col = 'configuracion_negocio'
              and id = 'empresa-' || (select gestlok_tenancy.current_tenant_id())::text
              and public.mi_rol() in ('creadora','dueno')
              and data ->> 'tipo' in ('fisica','online','mixta'));

-- Los pedidos siguen la política existente de documentos por local:
-- <local>/pedidos_online: creadora/dueña y gerentes de ese local.
-- Ningún pedido se crea en modo demo ni se afecta el stock existente.
