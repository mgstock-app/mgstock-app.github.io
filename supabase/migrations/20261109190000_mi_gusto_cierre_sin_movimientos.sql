-- Mi Gusto, Munro y Don Torcuato: permitir cierres explícitos de turnos vacíos.
-- Un cierre con movimientos mantiene la foto obligatoria sin excepciones.
alter table gestlok_mg_online_private.shifts
  add column if not exists sin_movimientos boolean not null default false;
alter table gestlok_mg_online_private.shifts
  add constraint mg_online_sin_movimientos_solo_cerrado
  check (sin_movimientos is false or status='cerrado');

create or replace function gestlok_mg_online_private.require_photo_before_close()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='abierto' and new.status='cerrado' then
   if new.sin_movimientos then
     if exists(select 1 from gestlok_mg_online_private.movements m where m.shift_id=new.id) then
       raise exception 'El turno contiene movimientos: se requiere el cierre normal con foto' using errcode='22023';
     end if;
   elsif new.photo_path is null then
     raise exception 'Subí la foto del cierre antes de cerrar el turno' using errcode='22023';
   end if;
 end if;
 return new;
end $$;

-- Nuevo endpoint separado: nunca elimina ni debilita el cierre normal.
create or replace function public.gestlok_mg_online_close_sin_movimientos(p_local text,p_shift uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from gestlok_mg_online_private.movements where shift_id=s.id) then
   raise exception 'El turno tiene movimientos. Subí la foto para hacer un cierre normal.' using errcode='22023';
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
end $$;
revoke all on function public.gestlok_mg_online_close_sin_movimientos(text,uuid)
 from public,anon,authenticated;
grant execute on function public.gestlok_mg_online_close_sin_movimientos(text,uuid)
 to authenticated;

-- Marcado explícito en los registros actuales e históricos, no en cálculos.

create or replace function gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
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
   'gross_amount',m.gross_amount,'discount_amount',m.discount_amount,'ok',m.cash_checked,'app',m.app,'observacion',m.observacion,'created_at',m.created_at,'updated_at',m.updated_at
  ) order by m.created_at,m.id) from gestlok_mg_online_private.movements m where m.shift_id=s.id),'[]'::jsonb),
  'transferencia',z.transferencia,'getnet',z.getnet,'mercado_pago',z.mercado_pago,'efectivo',z.efectivo,
  'total_app',z.total_app,'total_ventas',z.total_ventas,
  'online_local',z.total_ventas-z.total_app,'comandas',z.comandas
 )
 from (
   select coalesce(sum(m.amount) filter(where m.method='transferencia'),0) as transferencia,
     coalesce(sum(m.amount) filter(where m.method='getnet'),0) as getnet,
     coalesce(sum(m.amount) filter(where m.method='mercado_pago'),0) as mercado_pago,
     coalesce(sum(m.amount) filter(where m.method='efectivo'),0) as efectivo,
     coalesce(sum(m.amount) filter(where m.app and m.method<>'efectivo'),0) as total_app,
     coalesce(sum(m.amount) filter(where m.method<>'efectivo'),0) as total_ventas,
     count(*) as comandas
   from gestlok_mg_online_private.movements m where m.shift_id=s.id
 ) z
$function$;
revoke all on function gestlok_mg_online_private.require_photo_before_close() from public,anon,authenticated;
revoke all on function gestlok_mg_online_private.payload(gestlok_mg_online_private.shifts) from public,anon,authenticated;
