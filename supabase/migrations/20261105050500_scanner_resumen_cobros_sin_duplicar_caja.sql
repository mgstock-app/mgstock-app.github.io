-- Plan Scanner · libro de ventas del POS para conciliación de Caja, solo lectura.
-- No duplica movimientos en caja_app ni modifica ventas, stock ni otras empresas.
create or replace function public.gestlok_scanner_pos_resumen(
  p_tenant uuid, p_day date
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reg record;
begin
  if p_tenant is null or p_day is null or v_uid is null
    or not exists (
      select 1 from public.gestlok_pilot_access a
      where a.tenant_id = p_tenant
        and a.owner_uid = v_uid and a.enabled and a.plan_code = 'scanner'
    ) then
    raise exception 'Acceso no autorizado al resumen Scanner' using errcode = '42501';
  end if;

  select count(*)::integer as quantity,
         coalesce(sum(s.total),0)::numeric(14,2) as total,
         coalesce(sum(s.total) filter (where s.payment_method='efectivo'),0)::numeric(14,2) as efectivo,
         coalesce(sum(s.total) filter (where s.payment_method='transferencia'),0)::numeric(14,2) as transferencia
  into v_reg
  from public.gestlok_pilot_pos_sales s
  where s.tenant_id=p_tenant and s.operator_uid=v_uid
    and s.created_at >= (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and s.created_at < ((p_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');

  return jsonb_build_object(
    'day',p_day,'sales',v_reg.quantity,'total',v_reg.total,
    'efectivo',v_reg.efectivo,'transferencia',v_reg.transferencia,
    'source','scanner_pos','synced_to_caja',false
  );
end $$;

revoke all on function public.gestlok_scanner_pos_resumen(uuid,date) from public,anon;
grant execute on function public.gestlok_scanner_pos_resumen(uuid,date) to authenticated;
comment on function public.gestlok_scanner_pos_resumen(uuid,date) is
  'Resumen diario de ventas Scanner, AR UTC-03 (zona Argentina). Solo lectura, no suma montos en GESTLOK Caja.';
