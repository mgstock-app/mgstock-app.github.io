-- Exigir evidencia fotográfica antes de cerrar cualquier turno de Pagos Online.
-- La aplicación ya guarda la imagen en el bucket privado y la vincula al turno.
create or replace function gestlok_mg_online_private.require_photo_before_close()
returns trigger
language plpgsql
set search_path=''
as $$
begin
 if old.status='abierto' and new.status='cerrado' and new.photo_path is null then
  raise exception 'Subí la foto del cierre antes de cerrar el turno' using errcode='22023';
 end if;
 return new;
end
$$;

drop trigger if exists gl_mg_online_photo_before_close on gestlok_mg_online_private.shifts;
create trigger gl_mg_online_photo_before_close
before update of status on gestlok_mg_online_private.shifts
for each row execute function gestlok_mg_online_private.require_photo_before_close();

revoke all on function gestlok_mg_online_private.require_photo_before_close() from public,anon,authenticated;
