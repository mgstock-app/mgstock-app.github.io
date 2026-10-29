-- Mi Gusto: una foto privada y opcional por cierre, sin tocar importes ni los cierres históricos.
-- El bucket se crea exclusivamente mediante la API de Storage de Supabase en Edge Function.
alter table gestlok_mg_online_private.shifts
 add column if not exists photo_path text,
 add column if not exists photo_at timestamptz,
 add column if not exists photo_by uuid;

create or replace function gestlok_mg_online_private.payload(s gestlok_mg_online_private.shifts)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',s.id,'local',s.local,'day',s.day,'turno',s.turno,'status',s.status,
  'started_at',s.started_at,'closed_at',s.closed_at,
  'photo_path',s.photo_path,'photo_at',s.photo_at,
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



-- Autorización de dueño/gerente, local y turno, validada en servidor.
-- En particular solo se pueden adjuntar fotos a turnos CERRADOS.
create function public.gestlok_mg_online_photo_access(p_local text,p_shift uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin acceso a este local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local;
 if s.id is null or s.status<>'cerrado' then
  raise exception 'Solo puede acceder a fotos de turnos cerrados de su local' using errcode='42501';
 end if;
 return jsonb_build_object(
  'id',s.id,'day',s.day,'turno',s.turno,'status',s.status,
  'photo_path',s.photo_path,'local',s.local);
end $$;

-- Registrar en la planilla solo tras confirmar que el archivo está realmente almacenado.
create function public.gestlok_mg_online_photo_register(p_local text,p_shift uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        path text;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin acceso a este local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null or s.status<>'cerrado' then
  raise exception 'El turno debe estar cerrado' using errcode='42501';
 end if;
 path:=p_local||'/'||s.id::text||'/cierre.jpg';
 if s.photo_path is not null then
  if s.photo_path=path then return gestlok_mg_online_private.payload(s); end if;
  raise exception 'Ya existe otra foto registrada para este turno' using errcode='23505';
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='mg-online-closures' and o.name=path) then
  raise exception 'No se encontró la fotografía en el almacenamiento privado' using errcode='22023';
 end if;
 update gestlok_mg_online_private.shifts set photo_path=path,photo_at=now(),photo_by=auth.uid()
  where id=s.id returning * into s;
 return gestlok_mg_online_private.payload(s);
end $$;
revoke all on function public.gestlok_mg_online_photo_access(text,uuid),
 public.gestlok_mg_online_photo_register(text,uuid)
 from public,anon;
grant execute on function public.gestlok_mg_online_photo_access(text,uuid),
 public.gestlok_mg_online_photo_register(text,uuid)
 to authenticated;
