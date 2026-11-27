-- Preserve the previous scheduled-order record while making a new cart independent.
alter table gestlok_chat_private.wai_programaciones drop constraint if exists wai_programaciones_estado_check;
alter table gestlok_chat_private.wai_programaciones add constraint wai_programaciones_estado_check check(estado in ('ofrecido','aceptado','rechazado','completado'));
CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_cerrar_tras_resena(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype; a gestlok_chat_private.wai_atencion_hilos%rowtype; aviso timestamptz;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found then return;end if;
 for o in select * from gestlok_chat_private.wai_pedidos x where x.hilo_id=a.hilo_id and x.ciclo_id=a.ciclo_id and x.atencion_finalizada_at is null and x.creado_at>now()-interval '4 hours' order by x.creado_at for update loop
  select max(coalesce(m.reservado_at,m.creado_at)) into aviso from gestlok_chat_private.wai_mensajes m where m.estado='aceptado' and m.cancelada_at is null and (
   m.evento='pedido:'||o.id||':resena' or m.evento='pedido:'||o.id||':preparacion' and (not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) or strpos(m.texto,o.resena_enlace)>0));
  if aviso is null then
   if o.piloto_id=p.id and gestlok_chat_private.url_resena_valida(o.resena_enlace) and exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento='pedido:'||o.id||':preparacion' and m.estado='aceptado') and not gestlok_chat_private.wai_resena_invitar(p,o) then
    update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;
   end if;
   continue;
  end if;
  update gestlok_chat_private.wai_pedidos set atencion_finalizada_at=clock_timestamp(),consulta_at=null,consulta_cancelada_at=coalesce(consulta_cancelada_at,now()),actualizado_at=now() where id=o.id;
  -- Keep this cycle open for after-sales. Preserve the confirmed order in
  -- wai_pedidos; clear only the completed draft so a new request is independent.
  if not a.pendiente and not a.manual and coalesce(a.ficha->>'estado','confirmado')='confirmado' then
   update gestlok_chat_private.wai_atencion_hilos
   set ficha=null,modalidad=null,espera_modalidad=false,ultima_carta=null,pedido_solicitado_at=null,pedido_texto=null,actualizado_at=clock_timestamp()
   where hilo_id=a.hilo_id and ciclo_id=a.ciclo_id;
   update gestlok_chat_private.wai_programaciones set estado='completado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id and estado='aceptado';
  end if;
 end loop;
end$function$
;
CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_postventa_texto(p gestlok_chat_private.wai_pilotos, entrada uuid, t text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype; n text:=gestlok_chat_private.wai_normalizar(t); msg text; a gestlok_chat_private.wai_atencion_hilos; problema boolean;
begin
 select * into o from gestlok_chat_private.wai_pedido_reciente(p);
 if o.id is null then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=o.hilo_id;
 -- Recognize natural complaint phrasing even when preceded by a greeting.
 problema=(n ~ '\m(tuve un problema|tengo un problema|hay un problema|reclamo|queja|pedido equivocado|pedido incompleto|pedido (llego|vino) (mal|incompleto|frio|equivocado|sin)|faltante|no (me )?llego|no recibi|no me (trajeron|mandaron|enviaron)|me (llego|mandaron|trajeron) (mal|frio|equivocado|otra cosa))\M'
   or ((a.ficha is null or a.ficha->>'estado' in ('confirmado','cancelado')) and n ~ '\m(me falt(o|an|aba)|falt(o|an|aron)|vino (sin|incompleto|frio)|llego (sin|incompleto|frio)|no vino|no estaban)\M'));
 if n in ('resena','dejar resena','dejar resena en google') then
  if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then return false;end if;
  perform gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||o.resena_enlace);
 elsif problema then
  perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
  if o.valoracion='problema' and o.resuelto_at is null then
   update gestlok_chat_private.wai_pedidos set detalle=left(concat_ws(chr(10),nullif(detalle,''),btrim(t)),1000),actualizado_at=now() where id=o.id;
  else
   update gestlok_chat_private.wai_pedidos set valoracion='problema',valorado_at=now(),resuelto_at=null,actualizado_at=now(),respuesta_encolada_at=null,detalle=left(btrim(t),1000) where id=o.id and (valoracion is distinct from 'problema' or resuelto_at is not null);
  end if;
  update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=o.hilo_id;
  -- Stop old automatic messages while keeping order/transfer notices and history.
  update gestlok_chat_private.wai_mensajes set cancelada_at=now() where ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=o.hilo_id) and estado='pendiente' and cancelada_at is null and evento like 'agente:%';
 elsif o.valoracion='problema' and o.resuelto_at is null and coalesce(a.manual,false) then
  -- The original complaint and later detail remain in the thread; update
  -- the manager's private incident summary without sending repeated apologies.
  perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
  update gestlok_chat_private.wai_pedidos set detalle=left(concat_ws(chr(10),nullif(detalle,''),btrim(t)),1000),actualizado_at=now() where id=o.id;
 else return false;end if;
 update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
 return true;
end$function$
;
-- Repair only current TEST conversations closed prematurely by the former review rule.
-- An expired/cancelled grant stays expired/cancelled; no message is sent by this migration.
with reabrir as (
 update gestlok_chat_private.wai_ciclos c set cerrado_at=null,motivo=null
 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_pilotos p on p.id=h.hilo_id
 join gestlok_chat_private.sucursales s on s.id=p.sucursal_id
 join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
 where c.id=h.ciclo_id and c.hilo_id=h.hilo_id and c.motivo='resena' and c.cerrado_at is not null
 and e.nombre_publico ilike '%(prueba)%' and s.slug in ('mi-gusto-munro','mi-gusto-torcuato')
 and gestlok_chat_private.wai_postventa_hasta(h.hilo_id,c.id)>clock_timestamp()
 and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 returning c.id,c.hilo_id
), limpio as (
 update gestlok_chat_private.wai_atencion_hilos w
 set ficha=null,modalidad=null,espera_modalidad=false,ultima_carta=null,pedido_solicitado_at=null,pedido_texto=null,actualizado_at=clock_timestamp()
 from reabrir r where w.hilo_id=r.hilo_id and w.ciclo_id=r.id and not w.pendiente and not w.manual and coalesce(w.ficha->>'estado','confirmado')='confirmado' returning w.ciclo_id
)
update gestlok_chat_private.wai_programaciones z set estado='completado',actualizado_at=clock_timestamp() from limpio l where z.ciclo_id=l.ciclo_id and z.estado='aceptado';

