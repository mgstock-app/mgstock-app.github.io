-- GESTLOK WAI: first valid vote is definitive; old questions cannot affect the current step.
-- This closes a selection in WAI, not the native WhatsApp poll. No WhatsApp protocol mutation.
create or replace function gestlok_chat_private.wai_votacion_estado(m gestlok_chat_private.wai_mensajes)
returns text language plpgsql stable set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_atencion_hilos%rowtype; tipo text:=m.interaccion->>'tipo'; momento timestamptz;
begin
 if m.interaccion is null then return null;end if;
 -- The original confirmed decision is always displayed, even after a new cycle or authorization.
 if m.opcion_elegida is not null then return 'seleccionada';end if;
 if m.cancelada_at is not null or m.eliminado_at is not null then return 'cancelada';end if;
 if m.estado='incierto' or (m.estado='reservado' and m.reservado_at<now()-interval '45 seconds') then return 'sin_confirmar';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=m.piloto_id;
 if not found or p.cancelado or p.vence_at<=now() then return 'vencida';end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p);
 if tipo='resena' then
  -- The review invitation itself closes attention. Its own optional decision stays available
  -- until the contact returns, asks for the link by text, or the authorization expires.
  if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.evento=m.evento||':link' and x.direccion='salida' and x.cancelada_at is null) then return 'respondida';end if;
  if a.ciclo_id is distinct from m.ciclo_id then return 'reemplazada';end if;
 elsif tipo in ('agente','salsas','menu','pedido') then
  if m.ciclo_id is not null and (a.ciclo_id is distinct from m.ciclo_id or exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is not null)) then return 'finalizada';end if;
  if tipo in ('agente','salsas') then
   if m.ciclo_id is null or a.manual or a.ciclo_id is null then return 'finalizada';end if;
   if a.ficha is not null and a.ficha->>'espera' is distinct from m.evento then return 'reemplazada';end if;
   if tipo='salsas' and (a.ficha->>'estado' is distinct from 'grupo' or a.ficha->>'espera' is distinct from m.evento) then return 'reemplazada';end if;
  end if;
  if tipo in ('agente','salsas','menu') then
   momento=greatest(m.creado_at,coalesce(m.reservado_at,m.creado_at));
   -- A later typed answer or another question replaces an unanswered older prompt;
   -- transfer and order status messages are not questions.
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='entrada' and x.agente_procesado_at is not null and x.creado_at>momento) then return 'respondida';end if;
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='salida' and x.id<>m.id and x.interaccion->>'tipo' in ('agente','salsas','menu') and x.creado_at>m.creado_at) then return 'reemplazada';end if;
  end if;
 else return 'finalizada';end if;
 return case when m.estado='aceptado' then 'abierta' else 'pendiente' end;
end$$;
revoke all on function gestlok_chat_private.wai_votacion_estado(gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

-- Defense in depth: no future RPC or worker may rewrite a recorded decision.
create or replace function gestlok_chat_private.wai_voto_inmutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.opcion_elegida is not null and new.opcion_elegida is distinct from old.opcion_elegida then
  raise exception 'La selección registrada es definitiva' using errcode='23514';
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_voto_inmutable() from public,anon,authenticated;
drop trigger if exists wai_voto_inmutable on gestlok_chat_private.wai_mensajes;
create trigger wai_voto_inmutable before update of opcion_elegida on gestlok_chat_private.wai_mensajes for each row execute function gestlok_chat_private.wai_voto_inmutable();

create or replace function gestlok_chat_private.wai_recibir_voto(p gestlok_chat_private.wai_pilotos,p_jid text,p_evento text,p_opcion text)
returns jsonb language plpgsql set search_path='' as $$
declare m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;pedido gestlok_chat_private.wai_pedidos%rowtype;h uuid;entrada uuid; ids text[]; elegidas jsonb; cantidad int; esperado int; detalle text; estado_voto text;
begin
 if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
 select x.* into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.wa_id=p_evento and x.direccion='salida' and x.estado='aceptado' and x.interaccion is not null for update;
 if not found then return null;end if;
 estado_voto=gestlok_chat_private.wai_votacion_estado(m);
 -- Valid contact and original sent poll, but no longer actionable. Acknowledge
 -- silently, so a repeated/retracted/late vote cannot create a false sync error.
 if estado_voto<>'abierta' then return jsonb_build_object('ok',true,'ignorada',true,'cerrada',true);end if;
 if m.interaccion->>'tipo'='salsas' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and not a.manual and ci.cerrado_at is null and ci.id=m.ciclo_id and a.ficha->>'estado'='grupo' and a.ficha->>'espera'=m.evento) then return jsonb_build_object('ok',true);end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  if p_opcion is null or p_opcion !~ '^sm_[12]_[1-6](,sm_[12]_[1-6]){0,11}$' then return null;end if;
  ids=string_to_array(p_opcion,',');
  if cardinality(ids)<>(select count(distinct i) from unnest(ids) i) then return null;end if;
  select jsonb_agg(v),sum((v->>'cantidad')::int) into elegidas,cantidad from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=any(ids);
  if coalesce(jsonb_array_length(elegidas),0)<>cardinality(ids) then return null;end if;
  esperado=(m.interaccion->>'cantidad')::int;
  -- Partial or excessive snapshots do not change the order or send another poll.
  if cantidad<>esperado then return jsonb_build_object('ok',true,'completo',false);end if;
  select string_agg(q::text||' '||nombre,', ' order by nombre) into detalle from (select v->>'nombre' as nombre,sum((v->>'cantidad')::int) q from jsonb_array_elements(elegidas) v group by v->>'nombre') a;
  if detalle is null or length(detalle)>1000 then return null;end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=array_to_string(ids,','),opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada',detalle,'recibido','agente-voto:'||m.id||':salsas',p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);end if;
  return jsonb_build_object('ok',true,'completo',true,'cerrada',true);
 end if;
 select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=p_opcion;
 if o is null then return null;end if;
 if m.interaccion->>'tipo'='resena' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento='pedido:'||x.id||':resena' and x.estado in ('preparacion','listo','en_camino','entregado') for update;
  if not found or p_opcion not in ('resena_si','resena_no') then return null;end if;
  if p_opcion='resena_si' and gestlok_chat_private.url_resena_valida(pedido.resena_enlace) then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||pedido.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||pedido.resena_enlace) then return null;end if;
  end if;
 elsif m.interaccion->>'tipo'='pedido' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' for update;
  if not found then return null;end if;
  -- Old satisfaction polls are single-use, too. Customers can still report a new issue by text.
  if p_opcion not in ('bien','problema') then return null;end if;
  if pedido.valoracion='problema' and p_opcion<>'problema' then return jsonb_build_object('ok',true);end if;
  if p_opcion is distinct from pedido.valoracion then
  update gestlok_chat_private.wai_pedidos set valoracion=p_opcion,valorado_at=now(),actualizado_at=now(),respuesta_encolada_at=null where id=pedido.id;
  if p_opcion='problema' then update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=pedido.hilo_id;end if;
  end if;
 elsif m.interaccion->>'tipo'='agente' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null and ci.id=m.ciclo_id) then return null;end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido','agente-voto:'||m.id||':'||p_opcion,p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada,case when p_opcion in ('retiro','delivery') then p_opcion end);
   if coalesce((select manual from gestlok_chat_private.wai_atencion_hilos where hilo_id=h),false) then
    update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
   end if;
  end if;
  return jsonb_build_object('ok',true,'cerrada',true);
 elsif m.interaccion->>'tipo'='menu' then
  if m.ciclo_id is not null and not exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is null) then return null;end if;
  -- Immediately mark a request for a person, even if no reply quota remains.
  if (o->>'humano')::boolean then
   h=gestlok_chat_private.wai_hilo(p);
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
   on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set cancelada_at=now() where piloto_id=p.id and estado='pendiente' and cancelada_at is null and (evento like 'menu:auto:%' or evento like 'menu:respuesta:%');
  end if;
 else return null;end if;
 update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=null where id=m.id;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido',case when m.interaccion->>'tipo'='pedido' then 'pedido:'||pedido.id||':voto:'||p_opcion else 'voto:'||m.id||':'||p_opcion end,p_jid) on conflict(piloto_id,direccion,evento) do nothing;
 return jsonb_build_object('ok',true,'cerrada',true);
end$$;

create or replace function public.gestlok_chat_wai_piloto_motor(p_id uuid,p_clave text,p_revision uuid,p_accion text,p_piloto uuid default null,p_jid text default null,p_evento text default null,p_texto text default null,p_mensaje uuid default null,p_estado text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text; entrada uuid; voto jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then
  update gestlok_chat_private.wai_sesiones set opciones_at=case when p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then now() else null end,imagenes_at=case when p_estado in ('opciones_imagen_v1','opciones_imagen_v2') then now() else null end,salsas_at=case when p_estado='opciones_imagen_v2' then now() else null end where habilitacion_id=p_id;
  perform gestlok_chat_private.wai_pedido_tick(p);
  perform gestlok_chat_private.wai_cierre_tick(p);
  if p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then perform gestlok_chat_private.wai_atencion_tick(p);perform gestlok_chat_private.wai_agente_tick(p);end if; return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='alerta' then
  if p_estado not in ('voto_no_descifrado','voto_no_registrado','entrada_no_registrada','cola_llena','sincronizacion_pendiente') or p_estado is null then return null;end if;
  update gestlok_chat_private.wai_pilotos set alerta_sync=p_estado,alerta_sync_at=clock_timestamp() where id=p.id;
  return jsonb_build_object('ok',true);
 elsif p_accion='voto' then
  voto=gestlok_chat_private.wai_recibir_voto(p,p_jid,p_evento,p_texto);
  if coalesce((voto->>'ok')::boolean,false) and not coalesce((voto->>'ignorada')::boolean,false) and coalesce((voto->>'completo')::boolean,true) then
   if not exists(select 1 from gestlok_chat_private.wai_mensajes z where z.piloto_id=p.id and z.wa_id=p_evento and z.interaccion->>'tipo' in ('pedido','resena')) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   begin
    perform gestlok_chat_private.wai_pedido_tick(p);
   exception when others then
    update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;
   end;
  end if;
  return voto;
 elsif p_accion='agenda' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_texto is null or length(btrim(p_texto)) not between 1 and 100 or p_texto ~ '[[:cntrl:]]' then return null;end if;
  insert into gestlok_chat_private.wai_nombres_agenda(habilitacion_id,numero_clave,nombre,sincronizado_at)
  values(p.habilitacion_id,gestlok_chat_private.whatsapp_exclusion_key(p.tester),btrim(p_texto),now())
  on conflict(habilitacion_id,numero_clave) do update set nombre=excluded.nombre,sincronizado_at=excluded.sincronizado_at;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=40 then return null;end if;
  perform gestlok_chat_private.wai_cierre_tick(p);
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado) values(p.id,'entrada',p_texto,p_evento,p_jid,'recibido') on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   if gestlok_chat_private.wai_postventa_texto(p,entrada,p_texto) then
    update gestlok_chat_private.wai_mensajes set ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p)) where id=entrada;
    perform gestlok_chat_private.wai_pedido_tick(p);
    return jsonb_build_object('ok',true);
   end if;
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
   if not (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'agente_activo')::boolean or coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=gestlok_chat_private.wai_hilo(p)),false) then update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;end if;
   if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   perform gestlok_chat_private.wai_pedido_tick(p);
  end if;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir_salida' then
  -- Authenticated fromMe event, mirrored from the linked phone; never enqueue a send.
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_estado is null or p_estado not in ('enviado','entregado')
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and origen='telefono')>=20 then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,wa_id,wa_ruta,origen,entregado_at)
  values(p.id,'salida',p_texto,p_evento,p_jid,'aceptado',p_evento,p_jid,'telefono',case when p_estado='entregado' then now() end)
  on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif p_accion='tomar' then
  perform gestlok_chat_private.wai_pedido_tick(p);
  select x.jid into jid from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_pilotos q on q.id=x.piloto_id where x.direccion='entrada' and x.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by x.creado_at desc,x.id desc limit 1;
  if jid is null then return null;end if;
  update gestlok_chat_private.wai_mensajes x set cancelada_at=clock_timestamp() where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.interaccion is not null and gestlok_chat_private.wai_votacion_estado(x) not in ('pendiente','abierta');
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.evento not like 'pedido:%:consulta' and (x.interaccion is null or p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2')) and (x.imagen_url is null or p_estado in ('opciones_imagen_v1','opciones_imagen_v2')) and (x.interaccion->>'tipo' is distinct from 'salsas' or p_estado='opciones_imagen_v2') order by x.creado_at,x.id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',case when m.imagen_url is not null then '' else m.texto end,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v)) end);
 elsif p_accion='entrega' then
  if p_evento is null then return null; end if;
  update gestlok_chat_private.wai_mensajes set entregado_at=coalesce(entregado_at,now()) where piloto_id=p.id and direccion='salida' and wa_id=p_evento and estado='aceptado';
  if found then return jsonb_build_object('ok',true); end if;
  update gestlok_chat_private.wai_mensajes set accion_entregada_at=coalesce(accion_entregada_at,now()) where piloto_id=p.id and direccion='salida' and wa_accion_id=p_evento and accion_estado='enviado';
  return jsonb_build_object('ok',found);
 elsif p_accion='tomar_accion' then
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.accion_estado='pendiente' and x.interaccion is null and x.wa_id is not null order by x.accion_solicitada_at,x.id limit 1 for update;
  if not found then return null;end if;
  -- No reintentar una corrección vencida ni una acción ya reservada.
  if (m.accion_tipo='editar' and m.creado_at<=now()-interval '15 minutes') or m.accion_solicitada_at<=now()-interval '60 seconds' then
    update gestlok_chat_private.wai_mensajes set accion_estado='incierto' where id=m.id;return null;
  end if;
  update gestlok_chat_private.wai_mensajes set accion_estado='reservado',accion_reservada_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'wa_id',m.wa_id,'ruta',m.wa_ruta,'tipo',m.accion_tipo,'texto',m.accion_texto);
 elsif p_accion='resultado_accion' then
  if p_estado not in ('aceptado','incierto') or p_estado is null or (p_estado='aceptado' and (p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$')) then return null; end if;
  update gestlok_chat_private.wai_mensajes
   set texto=case when p_estado='aceptado' then case when accion_tipo='editar' then accion_texto else 'Mensaje eliminado' end else texto end,
       editado_at=case when p_estado='aceptado' and accion_tipo='editar' then now() else editado_at end,
       eliminado_at=case when p_estado='aceptado' and accion_tipo='eliminar' then now() else eliminado_at end,
       accion_estado=case when p_estado='aceptado' then 'enviado' else 'incierto' end,
       wa_accion_id=case when p_estado='aceptado' then p_evento else null end,accion_texto=null
   where id=p_mensaje and piloto_id=p.id and direccion='salida' and accion_estado='reservado';
  return jsonb_build_object('ok',found);
 elsif p_accion='resultado' then
  if p_estado is null or p_estado not in ('aceptado','incierto') then return null;end if;
  if p_estado='aceptado' and (p_evento is not null or p_jid is not null) then
    if p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_jid is null
      or not (p_jid ~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or p_jid ~ '^[0-9]{1,20}@lid$')
      or (p_jid like '%@s.whatsapp.net' and gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then return null;end if;
  end if;
  update gestlok_chat_private.wai_mensajes set estado=p_estado,wa_id=case when p_estado='aceptado' then p_evento end,wa_ruta=case when p_estado='aceptado' then p_jid end where id=p_mensaje and piloto_id=p.id and direccion='salida' and estado='reservado' returning * into m;
  if not found then return jsonb_build_object('ok',false);end if;
  if p_estado='aceptado' and m.continuar_texto is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_pedido_encolar(p.id,'agente:continuar:'||m.id,m.continuar_texto);
  end if;
  if p_estado='aceptado' and m.evento like 'pedido:%:preparacion' then
   perform gestlok_chat_private.wai_resena_invitar(p,o) from gestlok_chat_private.wai_pedidos o where o.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento in ('pedido:'||o.id||':preparacion','pedido:'||o.id||':entregado') and o.estado in ('preparacion','listo','en_camino','entregado');
  end if;
  if p_estado='aceptado' and (m.evento like 'pedido:%:preparacion' or m.evento like 'pedido:%:resena') then perform gestlok_chat_private.wai_cerrar_tras_resena(p);end if;
  if p_estado='incierto' and m.evento like 'pedido:%:resena' then update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;end if;
  -- Only append the next choices when the photo/link was accepted. No caption and no poll after an uncertain send.
  if p_estado='aceptado' and m.continuar_carta is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_agente_poll(p,'agente:continuar:'||m.id,'¿Qué te gustaría hacer ahora?',jsonb_build_object('opciones',m.continuar_carta)->'opciones');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$$;

create or replace function public.gestlok_chat_wai_bandeja(p_sucursal uuid,p_accion text default 'listar',p_piloto uuid default null,p_texto text default null,p_evento text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_pilotos%rowtype; resultado jsonb;
begin
 if gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_accion='listar' then
  -- Also evaluate inactive cycles when the manager visits while the connector is offline.
  for p in select q.* from gestlok_chat_private.wai_pilotos q where q.sucursal_id=p_sucursal and not exists(select 1 from gestlok_chat_private.wai_pilotos pv where pv.sucursal_id=q.sucursal_id and pv.habilitacion_id=q.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(pv.tester)=gestlok_chat_private.whatsapp_exclusion_key(q.tester) and gestlok_chat_private.wai_piloto_vigente(pv)) and q.id=gestlok_chat_private.wai_hilo(q) and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=gestlok_chat_private.wai_hilo(q)) order by q.id for update skip locked loop
   perform gestlok_chat_private.wai_cierre_tick(p);
  end loop;
 end if;
 if p_accion='responder' then
  select * into a from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
  if not found then raise exception 'Conversación no disponible' using errcode='22023';end if;
  select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
  if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
  if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.cerrado_at is not null) then raise exception 'Conversación finalizada. Esperá un mensaje nuevo';end if;
  if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_evento is null or p_evento !~ '^[a-f0-9-]{36}$' then raise exception 'Respuesta inválida' using errcode='22023';end if;
  if not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
    or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then raise exception 'Esperá un mensaje de prueba y una conexión activa' using errcode='22023';end if;
  if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='salida' and m.origen is distinct from 'telefono') >=40 then raise exception 'Límite de respuestas de prueba' using errcode='22023';end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,creado_por,origen) values(p.id,'salida',btrim(p_texto),'pendiente',p_evento,auth.uid(),'wai') on conflict(piloto_id,direccion,evento) do nothing;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida' using errcode='22023';end if;
 with candidatos as (
   select x.*,gestlok_chat_private.whatsapp_exclusion_key(x.tester) as numero_clave
   from gestlok_chat_private.wai_pilotos x where x.sucursal_id=p_sucursal
 ), hilos as (
   select x.habilitacion_id,x.numero_clave,(array_agg(x.id order by x.creado_at,x.id))[1] as id,
     (array_agg(x.tester order by x.creado_at desc,x.id desc))[1] as cliente,
     max(x.creado_at) as fecha
   from candidatos x group by x.habilitacion_id,x.numero_clave
   having bool_or(exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id)
       or (not x.cancelado and x.vence_at>now() and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)))
 ), datos as (
   select h.id,h.habilitacion_id,h.numero_clave,h.cliente,h.fecha,cur.id as piloto_activo,cur.vence_at,
       coalesce(cur.vigente,false) as conexion_activa,
       coalesce(cur.vigente,false)
        and exists(select 1 from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and m.direccion='entrada')
        and (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=cur.id and m.direccion='salida' and m.origen is distinct from 'telefono')<40 as puede_responder
   from hilos h left join lateral (
    select q.id,q.vence_at,gestlok_chat_private.wai_piloto_vigente(x) as vigente from candidatos q join gestlok_chat_private.wai_pilotos x on x.id=q.id
    where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and not q.cancelado and q.vence_at>now()
    order by q.creado_at desc,q.id desc limit 1
   ) cur on true
 )
 select jsonb_build_object('chats',coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'linea',d.habilitacion_id,'cliente',d.cliente,'piloto_activo',d.piloto_activo,'vence_at',d.vence_at,
   'conexion_activa',d.conexion_activa,
   'alerta_sync',(select q.alerta_sync from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave and q.alerta_sync_at is not null order by q.alerta_sync_at desc limit 1),
   'alerta_sync_at',(select max(q.alerta_sync_at) from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave),
   'aviso_cierre',(select ci.aviso_cierre from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'aviso_cierre_estado',(select case when m.estado='aceptado' and m.entregado_at is not null then 'entregado' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' else m.estado end from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id join gestlok_chat_private.wai_atencion_hilos wh on wh.hilo_id=d.id and m.evento='cierre:'||wh.ciclo_id where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave order by m.creado_at desc limit 1),'archivado',d.piloto_activo is null,'puede_operar_pedido',d.puede_responder,'puede_responder',d.puede_responder and not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id and ci.cerrado_at is not null),
   'agente_activo',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'agente_activo')::boolean,
   'seguimiento_min',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::int,
   'pedido_pendiente',exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id and wh.pedido_solicitado_at is not null),
   'ficha',(select wh.ficha from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'pedido_texto',(select wh.pedido_texto from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'imagenes_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at),
   'modalidad_detectada',(select wh.modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'ciclo_activo',(select wh.ciclo_id from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'cerrado_at',(select ci.cerrado_at from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'ciclos',coalesce((select jsonb_agg(jsonb_build_object('id',ci.id,'inicio_at',ci.inicio_at,'cerrado_at',ci.cerrado_at,'motivo',ci.motivo) order by ci.inicio_at) from gestlok_chat_private.wai_ciclos ci where ci.hilo_id=d.id),'[]'::jsonb),
   'alias',(select ac.alias from gestlok_chat_private.wai_alias_contactos ac where ac.sucursal_id=p_sucursal and ac.numero_clave=d.numero_clave),
   'nombre_agenda',(select ac.nombre from gestlok_chat_private.wai_nombres_agenda ac where ac.habilitacion_id=d.habilitacion_id and ac.numero_clave=d.numero_clave),
   'opciones_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at),
   'atencion_manual',coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'atencion_pendiente',coalesce((select wh.pendiente from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'pedidos_habilitados',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean,
   'resena_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url')),
   'transferencia_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and length(btrim(s.datos_transferencia))>0),
   'reclamo_pendiente',exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=d.id and o.valoracion='problema' and o.resuelto_at is null),
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'ficha',o.ficha,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'atencion_finalizada_at',o.atencion_finalizada_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null and o.consulta_cancelada_at is null,'consulta_cancelada',o.consulta_cancelada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'ciclo_id',m.ciclo_id,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v),'seleccion',m.opcion_elegida,'estado_votacion',gestlok_chat_private.wai_votacion_estado(m),'multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'cantidad',m.interaccion->'cantidad') end,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' when m.direccion='entrada' and (m.evento like 'voto:%' or m.evento like 'agente-voto:%') then 'opcion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',m.interaccion is null and m.imagen_url is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',m.interaccion is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
     'leido',case when m.direccion='entrada' then exists(select 1 from gestlok_chat_private.wai_lecturas l where l.mensaje_id=m.id and l.usuario_id=auth.uid()) else true end,
     'evento',case when m.direccion='salida' then m.evento end,
     'estado',case when m.cancelada_at is not null then 'cancelado' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' else m.estado end,
     'fecha',m.creado_at
   ) order by m.creado_at,m.id),'[]'::jsonb) as mensajes,max(m.creado_at) as ultima_fecha
   from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id
   where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave
 ) hist;
 return resultado;
end$$;

create or replace function gestlok_chat_private.wai_resena_invitar(p gestlok_chat_private.wai_pilotos,o gestlok_chat_private.wai_pedidos)
returns boolean language plpgsql set search_path='' as $$
declare e text:='pedido:'||o.id||':resena';ok boolean;
begin
 if o.hilo_id is distinct from gestlok_chat_private.wai_hilo(p) or not gestlok_chat_private.wai_pedido_consentimiento(p) then return false;end if;
 if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento='pedido:'||o.id||':preparacion' and m.estado='aceptado' and strpos(m.texto,o.resena_enlace)>0) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento=e and m.cancelada_at is null) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¡Gracias por elegirnos! Si querés compartir tu experiencia, te invitamos a dejar una reseña en Google. Es opcional.', '[{"id":"resena_si","label":"Dejar reseña en Google"},{"id":"resena_no","label":"Ahora no"}]'::jsonb);
  if ok then update gestlok_chat_private.wai_mensajes set interaccion=jsonb_set(interaccion,'{tipo}','"resena"'),ciclo_id=o.ciclo_id where piloto_id=p.id and evento=e and direccion='salida';end if;
 else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias por elegirnos! Si te gustaría compartir tu experiencia, te invitamos a dejar una reseña en Google. Es totalmente opcional: '||o.resena_enlace);end if;
 return ok;
end$$;

-- The existing connector accepts poll questions up to 120 characters.
-- Correct invitations still in queue; do not retry uncertain or sent messages.
update gestlok_chat_private.wai_mensajes m set interaccion=jsonb_set(m.interaccion,'{pregunta}',to_jsonb('¡Gracias por elegirnos! Si querés compartir tu experiencia, te invitamos a dejar una reseña en Google. Es opcional.'::text)),texto='¡Gracias por elegirnos! Si querés compartir tu experiencia, te invitamos a dejar una reseña en Google. Es opcional.'||chr(10)||'• Dejar reseña en Google'||chr(10)||'• Ahora no'
where m.interaccion->>'tipo'='resena' and m.direccion='salida' and m.estado='pendiente' and m.cancelada_at is null and length(m.interaccion->>'pregunta')>120;

create or replace function public.gestlok_chat_wai_mensaje_accion(p_sucursal uuid,p_piloto uuid,p_mensaje uuid,p_accion text,p_texto text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
 select * into m from gestlok_chat_private.wai_mensajes where id=p_mensaje and piloto_id=p.id and direccion='salida' and creado_por=auth.uid() for update;
 if not found or m.interaccion is not null or m.wa_id is null or m.wa_ruta is null or m.estado<>'aceptado' or m.eliminado_at is not null or (m.accion_estado is not null and m.accion_estado<>'enviado') then raise exception 'Este mensaje no admite modificaciones' using errcode='22023';end if;
 if p_accion is null or p_accion not in ('editar','eliminar') or (p_accion='editar' and (p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or m.creado_at<=now()-interval '15 minutes')) then raise exception 'Acción inválida o plazo de edición vencido' using errcode='22023';end if;
 update gestlok_chat_private.wai_mensajes set accion_tipo=p_accion,accion_texto=case when p_accion='editar' then btrim(p_texto) end,accion_estado='pendiente',accion_solicitada_at=now(),accion_reservada_at=null,wa_accion_id=null,accion_entregada_at=null where id=m.id;
 return true;
end$$;
