-- Mi Gusto Munro + Don Torcuato: PYA es una marca simbólica por comanda.
-- No afecta ningún cobro ni cantidad existente: las filas previas arrancan con pya=false.
-- Totales por pago, APP, ventas online, Online Local y efectivo EXCLUYEN los marcados PYA.
-- Se mantiene la auditoría, la segregación por sucursal y el control de roles existente.

alter table gestlok_mg_online_private.movements
  add column if not exists pya boolean not null default false;

CREATE OR REPLACE FUNCTION gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'id',s.id,'local',s.local,'day',s.day,'turno',s.turno,'status',s.status,
  'started_at',s.started_at,'closed_at',s.closed_at,
  'photo_path',s.photo_path,'photo_at',s.photo_at,'cierre_observacion',s.cierre_observacion,'sin_movimientos',s.sin_movimientos,
  'movements',coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'comanda',m.comanda,'method',m.method,'amount',m.amount,
   'gross_amount',m.gross_amount,'discount_amount',m.discount_amount,'ok',m.cash_checked,'app',m.app,'pya',m.pya,'observacion',m.observacion,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.created_at,m.id) from gestlok_mg_online_private.movements m where m.shift_id=s.id),'[]'::jsonb),
  'transferencia',z.transferencia,'getnet',z.getnet,'mercado_pago',z.mercado_pago,'efectivo',z.efectivo,
  'total_app',z.total_app,'total_ventas',z.total_ventas,'total_pya',z.total_pya,
  'online_local',z.total_ventas-z.total_app,'comandas',z.comandas
 )
 from (
   select coalesce(sum(m.amount) filter(where m.method='transferencia' and not m.pya),0) as transferencia,
     coalesce(sum(m.amount) filter(where m.method='getnet' and not m.pya),0) as getnet,
     coalesce(sum(m.amount) filter(where m.method='mercado_pago' and not m.pya),0) as mercado_pago,
     coalesce(sum(m.amount) filter(where m.method='efectivo' and not m.pya),0) as efectivo,
     coalesce(sum(m.amount) filter(where m.app and m.method<>'efectivo' and not m.pya),0) as total_app,
     coalesce(sum(m.amount) filter(where m.method<>'efectivo' and not m.pya),0) as total_ventas,
     coalesce(sum(m.amount) filter(where m.pya),0) as total_pya,
     count(*) as comandas
   from gestlok_mg_online_private.movements m where m.shift_id=s.id
 ) z
$function$;


-- RPC v2 con p_pya explícito: se conserva save_note original para clientes en caché.
-- Al editar desde un cliente anterior la marca pya NO se borra accidentalmente.
CREATE OR REPLACE FUNCTION public.gestlok_mg_online_save_note_pya(p_local text, p_shift uuid, p_id uuid, p_comanda text, p_method text, p_amount numeric, p_app boolean, p_observacion text, p_pya boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_mg_online_private.shifts;
        m gestlok_mg_online_private.movements;
        old_m gestlok_mg_online_private.movements;
        note text := btrim(coalesce(p_observacion,''));
        discount numeric(14,2);
        net numeric(14,2);
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then
  raise exception 'El turno ya está cerrado o no pertenece al local' using errcode='22023'; end if;
 if coalesce(p_comanda,'') !~ '^[0-9]{1,10}$'
   or p_method not in ('transferencia','getnet','mercado_pago','efectivo')
   or p_amount is null or p_amount <=0 or p_amount>=100000000000
   or p_app is null or p_pya is null or length(note)>300 then
   raise exception 'Revisá comanda, monto, forma de pago, APP y observación (máximo 300 caracteres)'
     using errcode='22023'; end if;
 discount := case when p_method='efectivo' then round(p_amount * 0.10,2) else 0 end;
 net := p_amount-discount;
 if p_id is null then
  insert into gestlok_mg_online_private.movements(
    shift_id,comanda,method,amount,gross_amount,discount_amount,app,pya,observacion,created_by,updated_by)
  values(s.id,p_comanda,p_method,net,p_amount,discount,p_app,p_pya,note,auth.uid(),auth.uid())
  returning * into m;
 else
  select * into old_m from gestlok_mg_online_private.movements
   where id=p_id and shift_id=s.id for update;
  if old_m.id is null then
   raise exception 'Movimiento no encontrado en este turno' using errcode='22023'; end if;
  update gestlok_mg_online_private.movements set
    comanda=p_comanda,method=p_method,amount=net,gross_amount=p_amount,discount_amount=discount,app=p_app,pya=p_pya,
    observacion=note,updated_at=now(),updated_by=auth.uid()
   where id=old_m.id returning * into m;
 end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,movement_id,action,actor,before_data,after_data)
  values(p_local,s.id,m.id,case when p_id is null then 'creado' else 'editado' end,
    auth.uid(),case when p_id is null then null else to_jsonb(old_m) end,to_jsonb(m));
 return gestlok_mg_online_private.payload(s);
end $function$;


-- Las comandas simbólicas PYA no son movimientos reales de Posnet.
CREATE OR REPLACE FUNCTION public.gestlok_mg_online_close_sin_movimientos(p_local text, p_shift uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 s gestlok_mg_online_private.shifts;
 n gestlok_mg_online_private.shifts;
 next_day date;
 next_turno text;
begin
 if p_local not in ('munro','torcuato')
    or auth.uid() is null
    or not gestlok_mg_online_private.authorized(p_local) then
   raise exception 'Sin permiso para este local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts
    where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then
   raise exception 'Turno inexistente, cerrado o de otro local' using errcode='22023';
 end if;
 if exists(select 1 from gestlok_mg_online_private.movements where shift_id=s.id and method in ('getnet','mercado_pago') and not pya) then
   raise exception 'El turno tiene movimientos de Posnet (Getnet o Mercado Pago). Subí la foto para cerrar.' using errcode='22023';
 end if;
 update gestlok_mg_online_private.shifts
 set status='cerrado',closed_at=now(),closed_by=auth.uid(),sin_movimientos=true
 where id=s.id returning * into s;
 insert into gestlok_mg_online_private.audit(local,shift_id,action,actor,after_data)
 values(p_local,s.id,'cerrado',auth.uid(),gestlok_mg_online_private.payload(s));
 next_turno:=case when s.turno='manana' then 'tarde' else 'manana' end;
 next_day:=s.day+case when s.turno='tarde' then 1 else 0 end;
 insert into gestlok_mg_online_private.shifts(local,day,turno,started_by)
 values(p_local,next_day,next_turno,auth.uid())
 on conflict(local,day,turno) do nothing;
 select * into n from gestlok_mg_online_private.shifts
 where local=p_local and day=next_day and turno=next_turno and status='abierto';
 if n.id is null then
   raise exception 'No se pudo abrir el turno siguiente' using errcode='22023';
 end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,action,actor)
 values(p_local,n.id,'iniciado',auth.uid());
 return jsonb_build_object('closed',gestlok_mg_online_private.payload(s),
     'active',gestlok_mg_online_private.payload(n));
end $function$;


revoke all on function public.gestlok_mg_online_save_note_pya(text,uuid,uuid,text,text,numeric,boolean,text,boolean) from public,anon;
grant execute on function public.gestlok_mg_online_save_note_pya(text,uuid,uuid,text,text,numeric,boolean,text,boolean) to authenticated;
