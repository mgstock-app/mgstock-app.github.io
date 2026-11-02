-- Fotos adicionales y observaciones por cierre: Mi Gusto, Munro y Don Torcuato.
-- Mantiene photo_path original y no altera importes ni movimientos.
create table if not exists gestlok_mg_online_private.shift_photos (
 id uuid primary key default gen_random_uuid(),
 shift_id uuid not null references gestlok_mg_online_private.shifts(id) on delete cascade,
 path text not null unique,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid()
);
create index if not exists mg_online_shift_photos_shift_idx on gestlok_mg_online_private.shift_photos(shift_id,created_at);
alter table gestlok_mg_online_private.shifts add column if not exists cierre_observacion text;
-- La función de registro valida permisos, turno y existencia real en Storage.
create or replace function public.gestlok_mg_online_photo_add(p_local text,p_shift uuid,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
begin
 if not gestlok_mg_online_private.authorized(p_local) then
  raise exception 'Sin acceso al local' using errcode='42501';
 end if;
 select * into s from gestlok_mg_online_private.shifts where id=p_shift and local=p_local for update;
 if s.id is null then raise exception 'Turno no autorizado' using errcode='42501'; end if;
 if p_path !~ ('^'||p_local||'/'||p_shift::text||'/cierre-[0-9a-f-]{36}\\.jpg$') then
  raise exception 'Ruta inválida' using errcode='22023';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='mg-online-closures' and name=p_path) then
  raise exception 'Imagen no almacenada' using errcode='22023';
 end if;
 insert into gestlok_mg_online_private.shift_photos(shift_id,path) values(p_shift,p_path)
 on conflict(path) do nothing;
 if s.photo_path is null then
  update gestlok_mg_online_private.shifts set photo_path=p_path,photo_at=now(),photo_by=auth.uid()
  where id=p_shift;
 end if;
 return jsonb_build_object('ok',true,'path',p_path);
end $$;
create or replace function public.gestlok_mg_online_close_note(p_local text,p_shift uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s gestlok_mg_online_private.shifts;
begin
 if not gestlok_mg_online_private.authorized(p_local) then raise exception 'Sin acceso' using errcode='42501'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Observación demasiado larga' using errcode='22023'; end if;
 update gestlok_mg_online_private.shifts set cierre_observacion=nullif(trim(p_note),'')
 where id=p_shift and local=p_local returning * into s;
 if s.id is null then raise exception 'Turno inexistente' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'observacion',s.cierre_observacion);
end $$;
revoke all on function public.gestlok_mg_online_photo_add(text,uuid,text),public.gestlok_mg_online_close_note(text,uuid,text) from public,anon;
grant execute on function public.gestlok_mg_online_photo_add(text,uuid,text),public.gestlok_mg_online_close_note(text,uuid,text) to authenticated;
