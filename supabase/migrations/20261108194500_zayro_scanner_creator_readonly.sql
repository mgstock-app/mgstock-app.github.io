-- GESTLOK / ZAYRO · acceso de creadora únicamente para CONSULTAR el Plan Scanner.
-- Política aditiva: no cambia las políticas de la dueña, ni concede INSERT/UPDATE/DELETE.
-- Reversible con docs/rollback-zayro-scanner-creator-readonly.sql.
--
-- Función privada fuera de los schemas publicados por el Data API.
-- Restricciones: dueña verificada / creadora activa, tenant actual seleccionado,
-- local de ZAYRO y licencia Scanner habilitada. Nadie más, ni otro tenant.
create or replace function gestlok_tenancy.zayro_scanner_creator_can_read(p_tenant uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_tenant = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid
    and p_tenant = (select gestlok_tenancy.current_tenant_id())
    and (select gestlok_platform.creator_write_active()) is true
    and exists (
      select 1 from public.gestlok_pilot_access a
      where a.tenant_id = p_tenant
        and a.enabled is true
        and a.plan_code = 'scanner'
        and a.owner_uid is distinct from (select auth.uid())
    );
$$;
revoke all on function gestlok_tenancy.zayro_scanner_creator_can_read(uuid)
  from public, anon;
grant execute on function gestlok_tenancy.zayro_scanner_creator_can_read(uuid)
  to authenticated;

create policy "zayro_creator_read_access"
  on public.gestlok_pilot_access
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_access.tenant_id)));

create policy "zayro_creator_read_products"
  on public.gestlok_pilot_products
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_products.tenant_id)));

create policy "zayro_creator_read_pos_sales"
  on public.gestlok_pilot_pos_sales
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_pos_sales.tenant_id)));

create policy "zayro_creator_read_orders"
  on public.gestlok_pilot_orders
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_orders.tenant_id)));

create policy "zayro_creator_read_order_closures"
  on public.gestlok_pilot_order_closures
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_order_closures.tenant_id)));

create policy "zayro_creator_read_records"
  on public.gestlok_pilot_records
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_records.tenant_id)));

create policy "zayro_creator_read_scanner_payment_methods"
  on public.gestlok_scanner_payment_methods
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_scanner_payment_methods.tenant_id)));

create policy "zayro_creator_read_audit"
  on public.gestlok_pilot_audit
  for select to authenticated
  using ((select gestlok_tenancy.zayro_scanner_creator_can_read(gestlok_pilot_audit.tenant_id)));
