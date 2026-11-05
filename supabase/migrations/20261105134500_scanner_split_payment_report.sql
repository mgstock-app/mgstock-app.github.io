-- Scanner: resumen por medio real de pago, sin escribir en Caja ni otras empresas.
create or replace function public.gestlok_scanner_pos_resumen(
 p_tenant uuid,p_day date
) returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
 v_uid uuid := (select auth.uid());
 v_sales integer;
 v_total numeric(14,2);
 v_methods jsonb;
begin
 if p_tenant is null or p_day is null or v_uid is null or not exists (
  select 1 from public.gestlok_pilot_access a
  where a.tenant_id=p_tenant and a.owner_uid=v_uid
   and a.enabled and a.plan_code='scanner'
 ) then
  raise exception 'Acceso no autorizado al resumen Scanner' using errcode='42501';
 end if;
 select count(*)::integer,coalesce(sum(s.total),0)::numeric(14,2)
 into v_sales,v_total from public.gestlok_pilot_pos_sales s
 where s.tenant_id=p_tenant and s.operator_uid=v_uid
 and s.created_at >= (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and s.created_at < ((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
 select coalesce(jsonb_object_agg(method,amount),'{}'::jsonb)
 into v_methods from (
  select method,sum(amount)::numeric(14,2) as amount from (
   select e.key as method,e.value::numeric as amount
   from public.gestlok_pilot_pos_sales s
   cross join lateral jsonb_each_text(coalesce(s.payment_breakdown,
    case when s.payment_method in ('efectivo','transferencia')
     then jsonb_build_object(s.payment_method,s.total) else '{}'::jsonb end)) e
   where s.tenant_id=p_tenant and s.operator_uid=v_uid
    and s.created_at >= (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and s.created_at < ((p_day+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ) p group by method
 ) totals;
 return jsonb_build_object(
  'day',p_day,'sales',v_sales,'total',v_total,
  'efectivo',coalesce((v_methods->>'efectivo')::numeric,0),
  'transferencia',coalesce((v_methods->>'transferencia')::numeric,0),
  'methods',v_methods,'source','scanner_pos','synced_to_caja',false);
end $$;
revoke all on function public.gestlok_scanner_pos_resumen(uuid,date) from public,anon;
grant execute on function public.gestlok_scanner_pos_resumen(uuid,date) to authenticated;
