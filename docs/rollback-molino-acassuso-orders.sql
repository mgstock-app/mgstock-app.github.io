-- Rollback no destructivo. Oculta Pedidos pero conserva los registros para recuperarlos.
-- Nunca borrar datos de clientes.
revoke all on function public.gestlok_molino_orders_state() from authenticated;
revoke all on function public.gestlok_molino_order_create(jsonb) from authenticated;
revoke all on function public.gestlok_molino_order_ack(uuid) from authenticated;
revoke select on public.gestlok_molino_orders from authenticated;
-- Para restaurar: volver a aplicar la migración y sus grants.
