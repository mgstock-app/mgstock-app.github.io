-- Multi-contact laboratory: one verified line, up to five consenting contacts.
-- No automatic granting of arbitrary customers, no production transport.
alter table gestlok_chat_private.wai_sesiones add column if not exists multi_at timestamptz;
alter table gestlok_chat_private.wai_sesiones add column if not exists multi_revision uuid;
create or replace function public.gestlok_chat_wai_ensayos_autorizados(p_id uuid,p_clave text,p_revision uuid,p_activo boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w gestlok_chat_private.wai_sesiones; grants jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then return null;end if;
 select x.* into w from gestlok_chat_private.wai_sesiones x join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=x.habilitacion_id and h.habilitada
 where x.habilitacion_id=p_id and x.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and x.revision=p_revision and (not coalesce(p_activo,false) or x.senal_at>=h.actualizada_at);
 if not found then return null;end if;
 if p_activo then
  if w.estado<>'conectado' or w.senal_at<=now()-interval '30 seconds' or w.wa_verificada_at<=now()-interval '35 seconds' or w.senal_at is null or w.wa_verificada_at is null then return null;end if;
  update gestlok_chat_private.wai_sesiones set multi_at=now(),multi_revision=p_revision where habilitacion_id=p_id and revision=p_revision;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp()) order by p.creado_at,p.id),'[]'::jsonb)
 into grants from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=p_id and gestlok_chat_private.wai_pedido_consentimiento(p) and (not p_activo or gestlok_chat_private.wai_piloto_vigente(p));
 return jsonb_build_object('hora_servidor',clock_timestamp(),'ensayos',grants);
end$$;
revoke all on function public.gestlok_chat_wai_ensayos_autorizados(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_ensayos_autorizados(uuid,text,uuid,boolean) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid, p_id uuid, p_tester text DEFAULT NULL::text, p_accion text DEFAULT 'autorizar'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype; v uuid;
begin
 if not gestlok_chat_private.es_creadora_chat() or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Solo administradora' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id where x.id=p_id and s.id=p_sucursal for update of x;
 if not found then raise exception 'Número no disponible' using errcode='42501';end if;
 if p_accion='cancelar' then
   update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now(); return null;
 end if;
 if p_accion is distinct from 'autorizar' or not h.habilitada or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 or p_tester is null or p_tester !~ '^\+[1-9][0-9]{7,14}$'
 or gestlok_chat_private.whatsapp_exclusion_key(h.numero)=gestlok_chat_private.whatsapp_exclusion_key(p_tester)
 or public.gestlok_chat_srv_whatsapp_excluido(p_sucursal,p_tester)
 or not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=h.id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds')
 then raise exception 'Prueba no autorizada o conexión no verificada' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now() and gestlok_chat_private.whatsapp_exclusion_key(tester)=gestlok_chat_private.whatsapp_exclusion_key(p_tester)) then raise exception 'Ese contacto ya tiene una prueba vigente' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now()) and not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=h.id and w.multi_revision=w.revision and w.multi_at>now()-interval '30 seconds') then raise exception 'Actualizá el conector privado para probar varios contactos simultáneos' using errcode='22023';end if;
 if (select count(*) from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now())>=5 then raise exception 'Máximo de cinco contactos simultáneos en ensayo' using errcode='22023';end if;
 insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por) values(h.id,p_sucursal,p_tester,auth.uid()) returning id into v;
 return v;
end$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_piloto_motor(p_id uuid, p_clave text, p_revision uuid, p_accion text, p_piloto uuid DEFAULT NULL::uuid, p_jid text DEFAULT NULL::text, p_evento text DEFAULT NULL::text, p_texto text DEFAULT NULL::text, p_mensaje uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text; entrada uuid; voto jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 -- Legacy connector must not choose an arbitrary customer if more than one is authorized.
 if p_piloto is null and (select count(*) from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and gestlok_chat_private.wai_piloto_vigente(x))>1 then return null;end if;
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
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=120 then return null;end if;
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
end$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_conexiones(p_sucursal uuid DEFAULT NULL::uuid, p_accion text DEFAULT 'listar'::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 a boolean := gestlok_chat_private.es_creadora_chat();
 clave text; resultado jsonb;
begin
 if auth.uid() is null then raise exception 'Sin permiso' using errcode='42501'; end if;
 if a then perform gestlok_platform.require_admin();
 elsif p_sucursal is not null then perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 else raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_accion is null or p_accion not in ('listar','preparar','rotar_clave','reconectar','qr','revalidar') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion<>'listar' then
   select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
    join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
    where x.id=p_id and x.habilitada and (p_sucursal is null or s.id=p_sucursal)
    for update of x;
   if not found then raise exception 'Número no habilitado en este local' using errcode='42501'; end if;
   if p_accion in ('preparar','rotar_clave') then
     if not a then raise exception 'Solo administradora' using errcode='42501'; end if;
     if p_accion='preparar' and exists(select 1 from gestlok_chat_private.wai_sesiones where habilitacion_id=h.id) then
       raise exception 'Conector ya preparado; no se reemplaza su clave' using errcode='22023';
     end if;
     clave:=encode(extensions.gen_random_bytes(32),'hex');
     insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash)
      values(h.id,encode(sha256(convert_to(clave,'UTF8')),'hex'))
      on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,revision=gen_random_uuid(),orden='reconectar',solicitada_at=now(),senal_at=null,estado='sin_senal',qr=null,qr_vence=null,wa_verificada_at=null;
     return jsonb_build_object('id',h.id,'clave',clave);
   elsif p_accion='revalidar' then
     if p_sucursal is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501'; end if;
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),orden='qr_forzado',solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
      where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal o solicitud reciente. Actualizá el estado.' using errcode='22023'; end if;
     update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now();
   else
     -- No desconectar una sesión sana para regenerar un QR; no duplicar solicitudes.
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),
      orden=p_accion,solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
     where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds'
       and (w.estado<>'conectado' or p_accion='reconectar' and w.senal_at<=now()-interval '45 seconds')
       and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal, recuperándose o ya conectado. Actualizá el estado.' using errcode='22023'; end if;
   end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'empresa',e.nombre_publico,'local',coalesce(d.data->>'nombre',x.local_id),
  'habilitada',x.habilitada and coalesce(e.habilitada,false) and s.id is not null and d.id is not null,'preparada',w.habilitacion_id is not null,
  'multi_ensayos',coalesce(w.multi_at>now()-interval '30 seconds' and w.multi_revision=w.revision,false),'ensayos_activos',(select count(*) from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=x.id and not p.cancelado and p.vence_at>now()),'senal_at',w.senal_at,'wa_verificada_at',w.wa_verificada_at,'estado',case when not x.habilitada or not coalesce(e.habilitada,false) or s.id is null or d.id is null then 'pausado'
    when w.habilitacion_id is null then 'sin_conector'
    when w.senal_at is null or w.senal_at<x.actualizada_at then 'sin_senal'
    when w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
    when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido'
    when w.estado='conectado' and (w.wa_verificada_at is null or w.wa_verificada_at<=now()-interval '35 seconds') then 'verificando'
    else w.estado end,
  'qr',case when x.habilitada and e.habilitada and s.id is not null and d.id is not null and w.estado='qr' and w.senal_at>=x.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.qr_vence>now() then w.qr end,
  'qr_vence',case when w.estado='qr' then w.qr_vence end
 ) order by e.nombre_publico,x.local_id,x.numero),'[]'::jsonb) into resultado
 from gestlok_chat_private.whatsapp_premium_habilitaciones x
 left join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id
 left join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 left join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=x.id
 where (p_sucursal is null and a) or s.id=p_sucursal;
 return resultado;
end$function$
;

