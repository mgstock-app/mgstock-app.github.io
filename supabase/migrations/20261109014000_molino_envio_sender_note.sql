-- El Molino Café: San Isidro agrega observaciones a sus envíos sin confirmar la recepción.
-- Acassuso mantiene su OK de recepción, sin modificar cantidades ni productos.
-- Este cambio no altera registros, roles, envíos históricos ni otras empresas.
create or replace function public.gestlok_molino_save_sender_note(
 p_id uuid,p_note text default ''
) returns jsonb
language plpgsql security definer set search_path=''
as $molino$
declare
 v_scope text:=public.gestlok_molino_scope();
 v_day date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_row public.gestlok_molino_movements%rowtype;
begin
 if auth.uid() is null or v_scope not in ('admin','dueno','san_isidro') then
  raise exception 'Solo San Isidro puede observar sus envíos' using errcode='42501';
 end if;
 if length(coalesce(p_note,''))>1000 then
  raise exception 'La observación supera 1000 caracteres' using errcode='22023';
 end if;
 if to_char(now() at time zone 'America/Argentina/Buenos_Aires','HH24:MI')>='23:59' then
  raise exception 'El día ya cerró a las 23:59' using errcode='22023';
 end if;
 update public.gestlok_molino_movements
  set note=coalesce(p_note,''),updated_at=now(),updated_by=auth.uid()
  where id=p_id and tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
    and day=v_day and kind='envio' and acknowledged_at is null
  returning * into v_row;
 if not found then
  raise exception 'Envío inexistente, confirmado o de otro local' using errcode='42501';
 end if;
 return to_jsonb(v_row)-'tenant_id';
end;
$molino$;
revoke all on function public.gestlok_molino_save_sender_note(uuid,text) from public,anon;
grant execute on function public.gestlok_molino_save_sender_note(uuid,text) to authenticated;
