-- Reversión del permiso EXTRA de lectura: conserva las políticas de dueña y el inventario.
begin;
drop policy if exists "zayro_creator_read_access" on public.gestlok_pilot_access;
drop policy if exists "zayro_creator_read_products" on public.gestlok_pilot_products;
drop policy if exists "zayro_creator_read_pos_sales" on public.gestlok_pilot_pos_sales;
drop policy if exists "zayro_creator_read_orders" on public.gestlok_pilot_orders;
drop policy if exists "zayro_creator_read_order_closures" on public.gestlok_pilot_order_closures;
drop policy if exists "zayro_creator_read_records" on public.gestlok_pilot_records;
drop policy if exists "zayro_creator_read_scanner_payment_methods" on public.gestlok_scanner_payment_methods;
drop policy if exists "zayro_creator_read_audit" on public.gestlok_pilot_audit;
drop function if exists gestlok_tenancy.zayro_scanner_creator_can_read(uuid);
commit;
