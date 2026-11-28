-- Pausa de atención de 5 segundos antes de reservar una respuesta del bot.
-- Mantiene el orden y la reserva atómica: no salta al siguiente mensaje de un contacto.
-- Conserva el resto del motor instalado; si cambia su forma, aborta en vez de sobrescribirlo.
do $migration$
declare
 motor regprocedure := 'public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,text,uuid,text,text,text,uuid,text)'::regprocedure;
 def text := pg_get_functiondef(motor);
 marker constant text := '  update gestlok_chat_private.wai_mensajes set estado=''reservado'',reservado_at=now() where id=m.id;';
 guard constant text := '  if m.origen=''wai'' and m.creado_at>clock_timestamp()-interval ''5 seconds'' then return null;end if;';
begin
 if strpos(def,guard)>0 then return;end if;
 if (length(def)-length(replace(def,marker,'')))/length(marker)<>1
   or strpos(def,'elsif p_accion=''tomar'' then')=0 then
  raise exception 'Motor WAI diferente: revisar la reserva antes de aplicar la pausa';
 end if;
 execute replace(def,marker,guard||chr(10)||marker);
end
$migration$;
