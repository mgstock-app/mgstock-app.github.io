-- GESTLOK / Mi Gusto · Pagos Online.
-- Observaciones por movimiento, opcionales; no se alteran registros anteriores.
-- La columna privada conserva las filas actuales y sus cierres.
alter table gestlok_mg_online_private.movements
 add column if not exists observacion text not null default ''
 check(char_length(observacion)<=300);

-- Historial: mismas sumas y permisos, solo agrega campo observacion.
create or replace function gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'local',s.local,'day',s.day,'turno',s.turno,'status',s.status,
  'started_at',s.started_at,'closed_at',s.closed_at,
  'movements',coalesce((select jsonb_agg(jsonb_build_object(
   'id',m.id,'comanda',m.comanda,'method',m.method,'amount',m.amount,
   'app',m.app,'observacion',m.observacion,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.created_at,m.id) from gestlok_mg_online_private.movements m where m.shift_id=s.id),'[]'::jsonb),
  'transferencia',z.transferencia,'getnet',z.getnet,'mercado_pago',z.mercado_pago,
  'total_app',z.total_app,'total_ventas',z.total_ventas,
  'online_local',z.total_ventas-z.total_app,'comandas',z.comandas
 )
 from (
   select coalesce(sum(m.amount) filter(where m.method='transferencia'),0) as transferencia,
     coalesce(sum(m.amount) filter(where m.method='getnet'),0) as getnet,
     coalesce(sum(m.amount) filter(where m.method='mercado_pago'),0) as mercado_pago,
     coalesce(sum(m.amount) filter(where m.app),0) as total_app,
     coalesce(sum(m.amount),0) as total_ventas,
     count(*) as comandas
   from gestlok_mg_online_private.movements m where m.shift_id=s.id
 ) z
$$;


-- Guardado con observación opcional, conservando la RPC original para clientes antiguos.
create function public.gestlok_mg_online_save_note(
 p_local text,p_shift uuid,p_id uuid,p_comanda text,p_method text,
 p_amount numeric,p_app boolean,p_observacion text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        m gestlok_mg_online_private.movements;
        old_m gestlok_mg_online_private.movements;
        note text := btrim(coalesce(p_observacion,''));
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin permiso para este local' using errcode='42501'; end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'abierto' then
  raise exception 'El turno ya está cerrado o no pertenece al local' using errcode='22023'; end if;
 if coalesce(p_comanda,'') !~ '^[0-9]{1,10}$'
   or p_method not in ('transferencia','getnet','mercado_pago')
   or p_amount is null or p_amount <=0 or p_amount>=100000000000
   or p_app is null or length(note)>300 then
   raise exception 'Revisá comanda, monto, forma de pago, APP y observación (máximo 300 caracteres)'
     using errcode='22023'; end if;
 if p_id is null then
  insert into gestlok_mg_online_private.movements(
    shift_id,comanda,method,amount,app,observacion,created_by,updated_by)
  values(s.id,p_comanda,p_method,p_amount,p_app,note,auth.uid(),auth.uid())
  returning * into m;
 else
  select * into old_m from gestlok_mg_online_private.movements
   where id=p_id and shift_id=s.id for update;
  if old_m.id is null then
   raise exception 'Movimiento no encontrado en este turno' using errcode='22023'; end if;
  update gestlok_mg_online_private.movements set
    comanda=p_comanda,method=p_method,amount=p_amount,app=p_app,
    observacion=note,updated_at=now(),updated_by=auth.uid()
   where id=old_m.id returning * into m;
 end if;
 insert into gestlok_mg_online_private.audit(local,shift_id,movement_id,action,actor,before_data,after_data)
  values(p_local,s.id,m.id,case when p_id is null then 'creado' else 'editado' end,
    auth.uid(),case when p_id is null then null else to_jsonb(old_m) end,to_jsonb(m));
 return gestlok_mg_online_private.payload(s);
end $$;

revoke all on function public.gestlok_mg_online_save_note(
 text,uuid,uuid,text,text,numeric,boolean,text) from public,anon;
grant execute on function public.gestlok_mg_online_save_note(
 text,uuid,uuid,text,text,numeric,boolean,text) to authenticated;
