-- Permitir adjuntar foto faltante a un turno abierto o previamente cerrado.
-- Preserva control por tenant, local y rol; una sola foto, bucket privado y sin sobrescritura.
-- No altera datos históricos ni modifica importes o estados del turno.
create or replace function public.gestlok_mg_online_photo_register(p_local text,p_shift uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
        path text;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin acceso a este local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts
  where id=p_shift and local=p_local for update;
 if s.id is null then
  raise exception 'Turno inexistente en este local' using errcode='42501';
 end if;
 if s.status not in ('abierto','cerrado') then
  raise exception 'Estado de turno no válido para cargar foto' using errcode='22023';
 end if;
 path:=p_local||'/'||s.id::text||'/cierre.jpg';
 if s.photo_path is not null then
  if s.photo_path=path then return gestlok_mg_online_private.payload(s); end if;
  raise exception 'Ya existe otra foto registrada para este turno' using errcode='23505';
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='mg-online-closures' and o.name=path) then
  raise exception 'No se encontró la fotografía en el almacenamiento privado' using errcode='22023';
 end if;
 update gestlok_mg_online_private.shifts
  set photo_path=path,photo_at=now(),photo_by=auth.uid()
  where id=s.id returning * into s;
 return gestlok_mg_online_private.payload(s);
end $$;
revoke all on function public.gestlok_mg_online_photo_register(text,uuid) from public,anon;
grant execute on function public.gestlok_mg_online_photo_register(text,uuid) to authenticated;
