-- Regresión aislada de GESTLOK Chat público: no tocar datos reales de empresas.
-- El bloque se revierte por completo. Un error detiene la ejecución.
begin;
do $gc_test$
declare
  v_t uuid;
  v_s uuid;
  v_c uuid;
  v_reclamo uuid;
  v_hash bytea := digest('gestlok-chat-qa-24h-test-20261122','sha256');
  v_r jsonb;
  v_m integer;
  v_ciclo integer;
begin
  select tenant_id,id into v_t,v_s from gestlok_chat_private.sucursales order by id limit 1;
  if v_s is null then raise exception 'No hay sucursal en la semilla'; end if;

  insert into gestlok_chat_private.conversaciones(
    tenant_id,sucursal_id,token_hash,ip_hash,estado,mensajes,creada_at,ultima_at)
  values(v_t,v_s,v_hash,'qa-chat-24h','{"paso":"prueba"}'::jsonb,1,
         now()-interval '25 hours',now()-interval '25 hours')
  returning id into v_c;
  insert into gestlok_chat_private.mensajes(conversacion_id,rol,texto,creado_at)
  values(v_c,'cliente','Mensaje temporal a limpiar',now()-interval '25 hours');
  insert into gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,tipo,detalle)
  values(v_t,v_s,v_c,'otro','El cliente informó un problema en su pedido')
  returning id into v_reclamo;

  if not gestlok_chat_private.limpiar_conversacion_expirada(v_c) then
    raise exception 'No limpió conversación vencida';
  end if;
  select count(*) into v_m from gestlok_chat_private.mensajes where conversacion_id=v_c;
  if v_m<>0 then raise exception 'Conservó mensajes vencidos'; end if;
  select ciclo into v_ciclo from gestlok_chat_private.conversaciones where id=v_c;
  if v_ciclo<>2 then raise exception 'No inició un ciclo independiente'; end if;
  if not exists(select 1 from gestlok_chat_private.reclamos
      where id=v_reclamo and estado='pendiente' and ciclo=1) then
    raise exception 'El reclamo anterior desapareció';
  end if;

  v_r:=public.gestlok_chat_srv_respuestas(v_c,v_hash,0);
  if coalesce((v_r->>'soporte_pendiente')::boolean,false) then
    raise exception 'Reclamo anterior contaminó el chat nuevo';
  end if;
  insert into gestlok_chat_private.reclamos(
    tenant_id,sucursal_id,conversacion_id,tipo,detalle,ciclo)
  values(v_t,v_s,v_c,'otro','Reclamo nuevo, mismo tipo',2);
  if (select count(*) from gestlok_chat_private.reclamos
       where conversacion_id=v_c and tipo='otro')<>2 then
    raise exception 'Se mezclaron los reclamos entre ciclos';
  end if;

  -- Una conversación todavía nueva no debe ser limpiada.
  if gestlok_chat_private.limpiar_conversacion_expirada(v_c) then
    raise exception 'Se limpió una conversación vigente';
  end if;
end $gc_test$;
rollback;
