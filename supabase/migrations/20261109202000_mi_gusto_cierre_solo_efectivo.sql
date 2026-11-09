-- Permitir cierre sin foto cuando solo existen controles de efectivo.
-- No borra comandas ni modifica montos; el servidor verifica ausencia de pagos online.
create or replace function gestlok_mg_online_private.require_photo_before_close()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='abierto' and new.status='cerrado' then
   if new.sin_movimientos then
     if exists(select 1 from gestlok_mg_online_private.movements m where m.shift_id=new.id and m.method<>'efectivo') then
       raise exception 'El turno contiene movimientos online: se requiere foto' using errcode='22023';
     end if;
   elsif new.photo_path is null then
     raise exception 'Subí la foto del cierre antes de cerrar el turno' using errcode='22023';
   end if;
 end if;
 return new;
end $$;


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
 if exists(select 1 from gestlok_mg_online_private.movements where shift_id=s.id and method<>'efectivo') then
   raise exception 'El turno tiene movimientos online. Subí la foto para cerrar.' using errcode='22023';
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

-- La columna histórica sin_movimientos identifica ahora cierres sin movimientos ONLINE.
