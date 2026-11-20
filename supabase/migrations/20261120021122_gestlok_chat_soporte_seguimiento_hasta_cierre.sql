-- Continuidad de soporte: después de responder, el hilo permanece abierto hasta que el gerente lo cierre.
-- Los mensajes posteriores del cliente vuelven a alertar al gerente y no pasan a la IA de pedidos.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_responder(p_conversacion uuid, p_texto text, p_reclamo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; v_texto text:=btrim(coalesce(p_texto,''));
begin
 select * into c from gestlok_chat_private.conversaciones where id=p_conversacion for update;
 if c.id is null then raise exception 'Conversación inexistente' using errcode='P0002';end if;
 perform gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 if length(v_texto) not between 2 and 1000 then
    raise exception 'Escribí una respuesta entre 2 y 1000 caracteres' using errcode='22023';
 end if;
 if c.mensajes>=400 then raise exception 'La conversación llegó a su límite' using errcode='P0001';end if;
 if p_reclamo is not null and not exists(select 1 from gestlok_chat_private.reclamos r
  where r.id=p_reclamo and r.conversacion_id=c.id and r.sucursal_id=c.sucursal_id
   and r.estado='pendiente') then
    raise exception 'El reclamo ya fue cerrado o no corresponde a esta conversación' using errcode='P0001';
 end if;
 insert into gestlok_chat_private.mensajes(conversacion_id,rol,texto) values(c.id,'local',v_texto);
 update gestlok_chat_private.conversaciones set ultima_at=now(),mensajes=mensajes+1 where id=c.id;
 if p_reclamo is not null then
  update gestlok_chat_private.reclamos set estado='pendiente',
    respondido_at=now(),respondido_por=auth.uid(),actualizado_at=now()
  where id=p_reclamo and sucursal_id=c.sucursal_id and conversacion_id=c.id and estado='pendiente';
 end if;
 perform gestlok_chat_private.auditar(c.sucursal_id,'soporte_respuesta',
  jsonb_build_object('conversacion',c.id,'reclamo',p_reclamo,'respuesta_enviada',p_reclamo is not null));
 return jsonb_build_object('ok',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_soporte(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'conversacion_id',r.conversacion_id,'tipo',r.tipo,'detalle',r.detalle,
    'creado_at',r.creado_at,'respondido_at',r.respondido_at,'pedido',p.codigo,
    'ultimo',(select m.texto from gestlok_chat_private.mensajes m
      where m.conversacion_id=r.conversacion_id order by m.id desc limit 1))
   order by r.actualizado_at desc)
  from (select * from gestlok_chat_private.reclamos
    where sucursal_id=p_sucursal and estado='pendiente'
    order by actualizado_at desc limit 80) r
  left join gestlok_chat_private.pedidos p on p.id=r.pedido_id),'[]'::jsonb);
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_respuestas(p_conversacion uuid, p_token_hash bytea, p_desde bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; v_desde bigint:=greatest(coalesce(p_desde,0),0);
begin
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 return jsonb_build_object(
  'mensajes_local',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'texto',x.texto,'at',x.creado_at) order by x.id)
    from (select id,texto,creado_at from gestlok_chat_private.mensajes
      where conversacion_id=c.id and rol='local' and id>v_desde order by id limit 40) x),'[]'::jsonb),
  'soporte_pendiente',exists(select 1 from gestlok_chat_private.reclamos r
   where r.conversacion_id=c.id and r.estado='pendiente'),
  'tipo_soporte',(select r.tipo from gestlok_chat_private.reclamos r
   where r.conversacion_id=c.id and r.estado='pendiente' order by actualizado_at desc limit 1)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_reclamo(p_conversacion uuid, p_token_hash bytea, p_ip_hash text, p_tipo text, p_detalle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
  v_pedido uuid; v_codigo text; v_respuesta text; v_id uuid;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_tipo not in ('demora','faltante','otro') or length(btrim(coalesce(p_detalle,''))) not between 3 and 600 then
    raise exception 'Consulta inválida' using errcode='22023';
  end if;
  select id,codigo into v_pedido,v_codigo from gestlok_chat_private.pedidos
  where conversacion_id=c.id order by creado_at desc limit 1;
  v_respuesta := case p_tipo
    when 'demora' then 'Entiendo tu consulta por la demora.'
    when 'faltante' then 'Lamento que falte algo en tu pedido.'
    else 'Lamento el inconveniente con tu pedido.'
  end || ' Ya envié el aviso al gerente de ' || s.nombre || '. Te responderá por este mismo chat.';
  if p_tipo='demora' and (s.demora_retiro is not null or s.demora_envio is not null) then
    v_respuesta := v_respuesta || E'\nTiempo habitual estimado: ' ||
      concat_ws(' · ',case when s.demora_retiro is not null then 'Retiro '||s.demora_retiro end,
                  case when s.demora_envio is not null then 'Delivery '||s.demora_envio end) ||
      '. Estos tiempos no confirman el estado de tu pedido.';
  end if;
  if v_pedido is null then
    v_respuesta := v_respuesta || E'\nSi tenés un código de pedido, podés escribirlo acá para ayudar al local a identificarlo.';
  end if;
  -- Misma transacción: guardar mensajes y alerta, o no guardar ninguno.
  perform public.gestlok_chat_srv_turno(c.id,p_token_hash,p_ip_hash,
     left(btrim(p_detalle),600),left(v_respuesta,2000),c.estado);
  insert into gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,pedido_id,tipo,detalle)
    values(s.tenant_id,s.id,c.id,v_pedido,p_tipo,left(btrim(p_detalle),600))
    on conflict (conversacion_id,tipo) where estado='pendiente'
    do update set detalle=excluded.detalle, actualizado_at=now(),
       respondido_at=null,respondido_por=null,
       pedido_id=coalesce(excluded.pedido_id,gestlok_chat_private.reclamos.pedido_id)
    returning id into v_id;
  return jsonb_build_object('ok',true,'reclamo',v_id,'tipo',p_tipo,'texto',v_respuesta);
end $function$
;

create or replace function public.gestlok_chat_panel_cerrar_reclamo(p_reclamo uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r gestlok_chat_private.reclamos;
begin
 select * into r from gestlok_chat_private.reclamos where id=p_reclamo for update;
 if r.id is null then raise exception 'Reclamo inexistente' using errcode='P0002';end if;
 perform gestlok_chat_private.exigir(r.sucursal_id,'gestionar');
 if r.estado<>'pendiente' then raise exception 'El reclamo ya fue cerrado' using errcode='P0001';end if;
 if r.respondido_at is null then raise exception 'Primero respondé al cliente antes de cerrar el reclamo' using errcode='P0001';end if;
 update gestlok_chat_private.reclamos set estado='respondido',actualizado_at=now()
 where id=r.id and sucursal_id=r.sucursal_id;
 perform gestlok_chat_private.auditar(r.sucursal_id,'soporte_cierre',jsonb_build_object('reclamo',r.id));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.gestlok_chat_panel_cerrar_reclamo(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_cerrar_reclamo(uuid) to authenticated;
