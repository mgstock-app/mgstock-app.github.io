-- Corrección puntual de una comanda histórica, sin reabrir ni avanzar turnos.
-- Conserva ID, fecha de cierre, creadores, fotos y las demás comandas.
CREATE OR REPLACE FUNCTION public.gestlok_mg_online_edit_closed(
 p_local text, p_shift uuid, p_id uuid, p_expected_updated_at timestamptz,
 p_comanda text, p_method text, p_amount numeric, p_app boolean, p_observacion text, p_pya boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 s gestlok_mg_online_private.shifts;
 old_m gestlok_mg_online_private.movements;
 m gestlok_mg_online_private.movements;
 note text := btrim(coalesce(p_observacion,''));
 discount numeric(14,2);
 gross numeric(14,2);
begin
 if auth.uid() is null or p_local is null or not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local and status='cerrado' for update;
 if s.id is null then
  raise exception 'Cierre no encontrado en este local' using errcode='22023';
 end if;
 if coalesce(p_comanda,'') !~ '^[0-9]{1,10}$' or p_method is null
    or p_method not in ('transferencia','getnet','mercado_pago','efectivo')
    or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount <=0 or p_amount>=100000000000 or p_amount<>round(p_amount,2)
    or p_app is null or p_pya is null or length(note)>300 then
  raise exception 'Revisá comanda, forma de pago, monto y observación' using errcode='22023';
 end if;
 select * into old_m from gestlok_mg_online_private.movements
  where id=p_id and shift_id=s.id for update;
 if old_m.id is null then
  raise exception 'Movimiento no encontrado en este cierre' using errcode='22023';
 end if;
 if p_expected_updated_at is null or old_m.updated_at is distinct from p_expected_updated_at then
  raise exception 'Otra persona modificó esta comanda. Cancelá la edición y volvé a abrir el reporte.' using errcode='40001';
 end if;
 -- Si la corrección introduce un movimiento de Posnet, conservar el requisito de evidencia.
 if not p_pya and p_method in ('getnet','mercado_pago')
    and (old_m.pya or old_m.method not in ('getnet','mercado_pago'))
    and s.photo_path is null then
  raise exception 'Subí la foto del Posnet a este cierre antes de guardar ese medio de pago.' using errcode='22023';
 end if;
 gross:=p_amount;
 discount:=case when p_method='efectivo' then round(gross*0.10,2) else 0 end;
 update gestlok_mg_online_private.movements set
  comanda=p_comanda,method=p_method,amount=gross-discount,gross_amount=gross,
  discount_amount=discount,app=p_app,pya=p_pya,observacion=note,
  cash_checked=case when p_method='efectivo' and old_m.method='efectivo'
     and old_m.gross_amount=gross and old_m.pya=p_pya then old_m.cash_checked else false end,
  updated_at=clock_timestamp(),updated_by=auth.uid()
 where id=old_m.id and shift_id=s.id returning * into m;
 if s.sin_movimientos and not p_pya and p_method in ('getnet','mercado_pago') then
  update gestlok_mg_online_private.shifts set sin_movimientos=false
   where id=s.id returning * into s;
 end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,movement_id,action,actor,before_data,after_data)
  values(p_local,s.id,m.id,'editado',auth.uid(),to_jsonb(old_m),to_jsonb(m));
 return gestlok_mg_online_private.payload(s);
end $function$;

revoke all on function public.gestlok_mg_online_edit_closed(text,uuid,uuid,timestamptz,text,text,numeric,boolean,text,boolean) from public,anon;
grant execute on function public.gestlok_mg_online_edit_closed(text,uuid,uuid,timestamptz,text,text,numeric,boolean,text,boolean) to authenticated;
