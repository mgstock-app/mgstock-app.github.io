-- GESTLOK Chat público: conversaciones efímeras (24 h desde la última actividad).
-- Las comandas/pedidos reales y los clientes frecuentes son independientes.
-- Los reclamos se mantienen como expedientes por sucursal aun después de limpiar el hilo.
alter table gestlok_chat_private.conversaciones
  add column if not exists reiniciada_at timestamptz;
update gestlok_chat_private.conversaciones
set reiniciada_at=creada_at where reiniciada_at is null;
alter table gestlok_chat_private.conversaciones
  alter column reiniciada_at set default now(),
  alter column reiniciada_at set not null;
alter table gestlok_chat_private.reclamos
  add column if not exists evidencia_paths text[] not null default '{}'::text[];
-- Cada limpieza inicia un ciclo independiente de chat: un reclamo viejo
-- no se sobreescribe con otro nuevo del mismo tipo.
alter table gestlok_chat_private.conversaciones
  add column if not exists ciclo integer not null default 1;
alter table gestlok_chat_private.reclamos
  add column if not exists ciclo integer not null default 1;
drop index if exists gestlok_chat_private.gchat_reclamo_abierto;
create unique index gchat_reclamo_abierto
  on gestlok_chat_private.reclamos(conversacion_id,tipo,ciclo) where estado='pendiente';

-- Bloquea el registro antes de limpiar. No interrumpe comandas pendientes o en preparación.
-- Se conserva evidencia de los reclamos; no se arrastra el historial de la charla.
create or replace function gestlok_chat_private.limpiar_conversacion_expirada(p_conversacion uuid)
returns boolean language plpgsql security definer set search_path='' as $gc_24h$
declare
  c gestlok_chat_private.conversaciones;
  v_fotos text[] := '{}'::text[];
begin
  select * into c from gestlok_chat_private.conversaciones
    where id=p_conversacion for update;
  if c.id is null or c.ultima_at > now()-interval '24 hours'
     or (c.mensajes=0 and c.estado='{}'::jsonb) then
    return false;
  end if;
  if exists(select 1 from gestlok_chat_private.pedidos p
            where p.conversacion_id=c.id and p.estado in ('pendiente','confirmado')) then
    return false;
  end if;
  select coalesce(array_agg(distinct a.path),'{}'::text[]) into v_fotos
    from gestlok_chat_private.adjuntos a where a.conversacion_id=c.id;
  if cardinality(v_fotos)>0 then
    update gestlok_chat_private.reclamos r
      set evidencia_paths=(select array(select distinct ruta
          from unnest(r.evidencia_paths || v_fotos) as t(ruta)
          where ruta is not null limit 30))
      where r.conversacion_id=c.id;
  end if;
  -- Los mensajes y metadatos temporales de adjuntos se eliminan, no los reclamos.
  delete from gestlok_chat_private.mensajes where conversacion_id=c.id;
  update gestlok_chat_private.conversaciones
    set estado='{}'::jsonb, mensajes=0, reiniciada_at=now(),
        ciclo=ciclo+1, cerrada_at=null, cerrada_por=null
    where id=c.id;
  return true;
end $gc_24h$;
revoke all on function gestlok_chat_private.limpiar_conversacion_expirada(uuid)
  from public,anon,authenticated;

-- Limpiar al retomar es obligatorio: ni cron atrasado ni un navegador viejo
-- pueden reconstruir mensajes vencidos. Mismo token, sesión de charla vacía.
create or replace function public.gestlok_chat_srv_conversacion(
  p_sucursal uuid,p_token_hash bytea,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $gc_session$
declare
  s gestlok_chat_private.sucursales;
  c gestlok_chat_private.conversaciones;
  v_expirada boolean := false;
begin
  s := gestlok_chat_private.sucursal_abierta(p_sucursal);
  if p_token_hash is null or length(p_token_hash)<>32 then
    raise exception 'Sesión inválida' using errcode='22023';
  end if;
  select * into c from gestlok_chat_private.conversaciones
    where token_hash=p_token_hash;
  if c.id is not null and c.sucursal_id<>s.id then
    raise exception 'Sesión de otra sucursal' using errcode='42501';
  end if;
  if c.id is null then
    if not gestlok_chat_private.consumir('conv:ip:'||left(coalesce(p_ip_hash,''),64),'dia',30) then
      raise exception 'Demasiadas conversaciones nuevas. Probá más tarde.' using errcode='P0001';
    end if;
    insert into gestlok_chat_private.conversaciones(tenant_id,sucursal_id,token_hash,ip_hash)
    values(s.tenant_id,s.id,p_token_hash,left(coalesce(p_ip_hash,''),64))
    returning * into c;
  else
    v_expirada:=gestlok_chat_private.limpiar_conversacion_expirada(c.id);
    if v_expirada then
      select * into c from gestlok_chat_private.conversaciones where id=c.id;
    end if;
  end if;
  return jsonb_build_object(
    'id',c.id,'estado',c.estado,'nueva',c.mensajes=0,'expirada',v_expirada,
    'mensajes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'rol',m.rol,'texto',m.texto,'at',m.creado_at) order by m.id)
      from (select * from gestlok_chat_private.mensajes
            where conversacion_id=c.id and creado_at>=c.reiniciada_at
            order by id desc limit 400) m),'[]'::jsonb),
    'pedidos',coalesce((select jsonb_agg(gestlok_chat_private.pedido_publico(p)
      order by p.creado_at desc)
      from (select * from gestlok_chat_private.pedidos
            where conversacion_id=c.id and creado_at>=c.reiniciada_at
            order by creado_at desc limit 5) p),'[]'::jsonb)
  );
end $gc_session$;
revoke all on function public.gestlok_chat_srv_conversacion(uuid,bytea,text)
  from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_conversacion(uuid,bytea,text)
  to service_role;

-- Un reclamo de la conversación anterior no secuestra la atención de una compra nueva.
create or replace function public.gestlok_chat_srv_respuestas(
  p_conversacion uuid,p_token_hash bytea,p_desde bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_response$
declare c gestlok_chat_private.conversaciones; v_desde bigint:=greatest(coalesce(p_desde,0),0);
begin
  c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  return jsonb_build_object(
    'mensajes_local',coalesce((select jsonb_agg(jsonb_build_object(
      'id',x.id,'texto',x.texto,'at',x.creado_at) order by x.id)
      from (select id,texto,creado_at from gestlok_chat_private.mensajes
            where conversacion_id=c.id and rol='local' and id>v_desde
              and creado_at>=c.reiniciada_at order by id limit 40) x),'[]'::jsonb),
    'soporte_pendiente',exists(select 1 from gestlok_chat_private.reclamos r
      where r.conversacion_id=c.id and r.estado='pendiente'
        and r.ciclo=c.ciclo),
    'tipo_soporte',(select r.tipo from gestlok_chat_private.reclamos r
      where r.conversacion_id=c.id and r.estado='pendiente'
        and r.ciclo=c.ciclo
      order by actualizado_at desc limit 1)
  );
end $gc_response$;
revoke all on function public.gestlok_chat_srv_respuestas(uuid,bytea,bigint)
  from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_respuestas(uuid,bytea,bigint)
  to service_role;

-- Los gerentes dejan de ver la charla vencida. Reclamos: panel independiente.
create or replace function public.gestlok_chat_panel_conversaciones(p_sucursal uuid,p_limite integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_panel_list$
begin
  perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'creada_at',c.reiniciada_at,'ultima_at',c.ultima_at,
    'mensajes',c.mensajes,
    'ultimo',(select m.texto from gestlok_chat_private.mensajes m
      where m.conversacion_id=c.id and m.creado_at>=c.reiniciada_at
      order by m.id desc limit 1),
    'pedido',(select p.codigo||' · '||p.estado from gestlok_chat_private.pedidos p
      where p.conversacion_id=c.id and p.creado_at>=c.reiniciada_at
      order by p.creado_at desc limit 1)) order by c.ultima_at desc)
    from (select * from gestlok_chat_private.conversaciones x
      where x.sucursal_id=p_sucursal and x.mensajes>0
        and x.ultima_at>now()-interval '24 hours'
      order by x.ultima_at desc limit least(greatest(coalesce(p_limite,30),1),100)) c),'[]'::jsonb);
end $gc_panel_list$;
revoke all on function public.gestlok_chat_panel_conversaciones(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_conversaciones(uuid,integer)
  to authenticated;

create or replace function public.gestlok_chat_panel_conversacion(p_conversacion uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_panel_thread$
declare c gestlok_chat_private.conversaciones;
begin
  select * into c from gestlok_chat_private.conversaciones where id=p_conversacion;
  perform gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object(
    'rol',m.rol,'texto',m.texto,'at',m.creado_at,'adjunto',
    (select jsonb_build_object('path',a.path) from gestlok_chat_private.adjuntos a
      where a.mensaje_id=m.id)) order by m.id)
    from (select * from gestlok_chat_private.mensajes
          where conversacion_id=p_conversacion
            and creado_at>=c.reiniciada_at
            and creado_at>now()-interval '24 hours'
          order by id desc limit 200) m),'[]'::jsonb);
end $gc_panel_thread$;
revoke all on function public.gestlok_chat_panel_conversacion(uuid)
  from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_conversacion(uuid)
  to authenticated;

-- El detalle del reclamo permanece visible sin depender de los mensajes temporales.
create or replace function public.gestlok_chat_panel_soporte(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_claim_panel$
begin
  perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'conversacion_id',r.conversacion_id,'tipo',r.tipo,
    'detalle',r.detalle,'creado_at',r.creado_at,'respondido_at',r.respondido_at,
    'pedido',p.codigo,'evidencia_paths',r.evidencia_paths,
    'historial_expirado',c.reiniciada_at>r.creado_at,
    'ultimo',(select m.texto from gestlok_chat_private.mensajes m
      where m.conversacion_id=r.conversacion_id
        and m.creado_at>=c.reiniciada_at order by m.id desc limit 1))
    order by r.actualizado_at desc)
    from (select * from gestlok_chat_private.reclamos
      where sucursal_id=p_sucursal and estado='pendiente'
      order by actualizado_at desc limit 80) r
    left join gestlok_chat_private.pedidos p on p.id=r.pedido_id
    join gestlok_chat_private.conversaciones c on c.id=r.conversacion_id),'[]'::jsonb);
end $gc_claim_panel$;
revoke all on function public.gestlok_chat_panel_soporte(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_soporte(uuid) to authenticated;

-- Trabajo de mantenimiento: no tocar pedidos, stocks ni registros de clientes.
create or replace function gestlok_chat_private.purgar()
returns jsonb language plpgsql security definer set search_path='' as $gc_purge$
declare n_hilos integer:=0; n_lim integer; n_clientes integer; v_id uuid;
begin
  for v_id in
    select c.id from gestlok_chat_private.conversaciones c
    where c.ultima_at<=now()-interval '24 hours'
      and (c.mensajes>0 or c.estado<>'{}'::jsonb)
      and not exists(select 1 from gestlok_chat_private.pedidos p
        where p.conversacion_id=c.id and p.estado in ('pendiente','confirmado'))
    order by c.ultima_at limit 500
  loop
    if gestlok_chat_private.limpiar_conversacion_expirada(v_id) then
      n_hilos:=n_hilos+1;
    end if;
  end loop;
  delete from gestlok_chat_private.clientes_frecuentes
    where ultimo_pedido_at<now()-interval '24 months';
  get diagnostics n_clientes=row_count;
  delete from gestlok_chat_private.limites
    where ventana<now()-interval '2 days';
  get diagnostics n_lim=row_count;
  return jsonb_build_object('hilos_limpiados',n_hilos,
    'limites',n_lim,'clientes_inactivos',n_clientes);
end $gc_purge$;
revoke all on function gestlok_chat_private.purgar() from public,anon,authenticated;

-- Se ejecuta cada 15 minutos; la apertura y la consulta ya hacen cumplir el vencimiento
-- sin esperar a la tarea programada. pg_cron puede no estar activo en entornos de prueba.
do $gc_schedule$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('gestlok-chat-publico-limpiar-24h','*/15 * * * *',
      'select gestlok_chat_private.purgar()');
  end if;
end $gc_schedule$;


-- Tickets de distintos ciclos nunca colisionan ni se pisan.
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_reclamo(p_conversacion uuid, p_token_hash bytea, p_ip_hash text, p_tipo text, p_detalle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
  v_pedido uuid; v_respuesta text; v_id uuid; v_ya boolean;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  select * into c from gestlok_chat_private.conversaciones where id=c.id for update;
  if c.cerrada_at is not null then raise exception 'La conversación está cerrada. Iniciá una nueva.' using errcode='P0001'; end if;
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_tipo not in ('demora','faltante','otro','consulta') or length(btrim(coalesce(p_detalle,''))) not between 3 and 600 then
    raise exception 'Consulta inválida' using errcode='22023';
  end if;
  select id into v_pedido from gestlok_chat_private.pedidos
  where conversacion_id=c.id and creado_at>=c.reiniciada_at order by creado_at desc limit 1;

  select exists(select 1 from gestlok_chat_private.reclamos r
    where r.conversacion_id=c.id and r.ciclo=c.ciclo and r.tipo=p_tipo and r.estado='pendiente') into v_ya;
  v_respuesta := case
    when v_ya then 'Gracias por ampliar la información. Su mensaje se agregó al caso que está revisando el gerente. Le responderá por este mismo chat.'
    when p_tipo='consulta' then 'Gracias por contactarnos. Esta consulta requiere la atención del gerente de ' || s.nombre || '. Le hemos enviado un aviso y se comunicará con usted por este mismo chat.'
    when p_tipo='demora' then 'Le pedimos disculpas por la demora. Entendemos su preocupación y vamos a revisar lo sucedido para darle una solución. Avisamos al gerente de ' || s.nombre || ', quien le responderá por este mismo chat.'
    when p_tipo='faltante' then 'Le pedimos disculpas por el faltante en su pedido. Vamos a revisar lo sucedido y trabajar para darle una solución. El gerente de ' || s.nombre || ' fue avisado y se comunicará con usted por este mismo chat.'
    else 'Lamentamos el inconveniente y le pedimos disculpas. Vamos a revisar su reclamo para darle una solución. Avisamos al gerente de ' || s.nombre || ', quien le responderá por este mismo chat.'
  end;
  if not v_ya and p_tipo='demora' and (s.demora_retiro is not null or s.demora_envio is not null) then
    v_respuesta := v_respuesta || E'\nLos tiempos habituales son orientativos: ' ||
      concat_ws(' · ',case when s.demora_retiro is not null then 'Retiro '||s.demora_retiro end,
                case when s.demora_envio is not null then 'Delivery '||s.demora_envio end) ||
      '. El gerente verificará el estado real de su pedido.';
  end if;
  -- Misma transacción: guardar mensajes y alerta, o no guardar ninguno.
  perform public.gestlok_chat_srv_turno(c.id,p_token_hash,p_ip_hash,
     left(btrim(p_detalle),600),left(v_respuesta,2000),c.estado);
  insert into gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,pedido_id,tipo,detalle,ciclo)
    values(s.tenant_id,s.id,c.id,v_pedido,p_tipo,left(btrim(p_detalle),600),c.ciclo)
    on conflict (conversacion_id,tipo,ciclo) where estado='pendiente'
    do update set detalle=excluded.detalle, actualizado_at=now(),
       respondido_at=null,respondido_por=null,
       pedido_id=coalesce(excluded.pedido_id,gestlok_chat_private.reclamos.pedido_id)
    returning id into v_id;
  return jsonb_build_object('ok',true,'reclamo',v_id,'tipo',p_tipo,'texto',v_respuesta);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_adjunto(
 p_conversacion uuid,p_token_hash bytea,p_ip_hash text,p_path text,p_mime text,p_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones; mid bigint; v_tipo text;
BEGIN
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=c.id FOR UPDATE;
 IF c.cerrada_at IS NOT NULL THEN RAISE EXCEPTION 'La conversación está cerrada' USING errcode='P0001'; END IF;
 IF c.mensajes>=400 THEN RAISE EXCEPTION 'La conversación llegó a su límite' USING errcode='P0001'; END IF;
 IF p_mime NOT IN ('image/jpeg','image/png','image/webp') OR p_bytes NOT BETWEEN 1 AND 2000000
 THEN RAISE EXCEPTION 'Archivo de imagen inválido' USING errcode='22023'; END IF;
 IF p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
   OR p_path NOT LIKE (c.sucursal_id::text||'/'||c.id::text||'/%')
 THEN RAISE EXCEPTION 'Ruta de adjunto inválida' USING errcode='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='gestlok-chat-adjuntos' AND name=p_path)
 THEN RAISE EXCEPTION 'Archivo no disponible' USING errcode='P0001'; END IF;
 IF NOT gestlok_chat_private.consumir('foto:conv:'||c.id::text,'minuto',4)
 THEN RAISE EXCEPTION 'Espere antes de enviar otra imagen' USING errcode='P0001'; END IF;
 INSERT INTO gestlok_chat_private.mensajes(conversacion_id,rol,texto)
 VALUES(c.id,'cliente','Foto enviada por el cliente') RETURNING id INTO mid;
 INSERT INTO gestlok_chat_private.adjuntos(mensaje_id,tenant_id,sucursal_id,conversacion_id,path,mime,bytes)
 VALUES(mid,c.tenant_id,c.sucursal_id,c.id,p_path,p_mime,p_bytes);
 UPDATE gestlok_chat_private.conversaciones SET mensajes=mensajes+1,ultima_at=now() WHERE id=c.id;
 v_tipo := CASE WHEN c.estado->'reclamo_espera'->>'tipo' IN ('faltante','otro') THEN c.estado->'reclamo_espera'->>'tipo' END;
 IF v_tipo IS NULL AND EXISTS (SELECT 1 FROM gestlok_chat_private.reclamos r WHERE r.conversacion_id=c.id AND r.ciclo=c.ciclo AND r.estado='pendiente') THEN
   UPDATE gestlok_chat_private.reclamos SET actualizado_at=now()
    WHERE id=(SELECT r.id FROM gestlok_chat_private.reclamos r WHERE r.conversacion_id=c.id AND r.ciclo=c.ciclo AND r.estado='pendiente'
              ORDER BY r.actualizado_at DESC NULLS LAST LIMIT 1);
 ELSE
   -- La foto alerta al gerente aunque la conversación no tenga un reclamo previo.
   INSERT INTO gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,tipo,detalle,ciclo)
   VALUES(c.tenant_id,c.sucursal_id,c.id,coalesce(v_tipo,'otro'),
     CASE v_tipo WHEN 'faltante' THEN 'Foto del pedido (faltante). El cliente está escribiendo qué le faltó.'
                 WHEN 'otro' THEN 'Foto del reclamo. El cliente está escribiendo qué sucedió.'
                 ELSE 'El cliente envió una foto o comprobante' END,c.ciclo)
   ON CONFLICT (conversacion_id,tipo,ciclo) WHERE estado='pendiente'
   DO UPDATE SET actualizado_at=now();
 END IF;
 RETURN jsonb_build_object('ok',true,'mensaje_id',mid);
END $$;


-- Al cerrar una charla nueva, nunca cerrar los reclamos conservados de ciclos anteriores.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_cerrar_conversacion(p_conversacion uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones;
BEGIN
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=p_conversacion FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Conversación inexistente' USING errcode='P0002'; END IF;
 PERFORM gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 IF c.cerrada_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_cerrada',true); END IF;
 UPDATE gestlok_chat_private.conversaciones SET cerrada_at=now(),cerrada_por=auth.uid(),
   ultima_at=now(),mensajes=mensajes+1 WHERE id=c.id;
 INSERT INTO gestlok_chat_private.mensajes(conversacion_id,rol,texto)
 VALUES(c.id,'local','La conversación fue finalizada por el local. Puede iniciar una nueva consulta cuando lo necesite.');
 UPDATE gestlok_chat_private.reclamos SET estado='respondido',actualizado_at=now(),
  respondido_at=coalesce(respondido_at,now()),respondido_por=coalesce(respondido_por,auth.uid())
 WHERE conversacion_id=c.id AND ciclo=c.ciclo AND estado='pendiente';
 PERFORM gestlok_chat_private.auditar(c.sucursal_id,'cerrar_conversacion',jsonb_build_object('conversacion',c.id));
 RETURN jsonb_build_object('ok',true,'cerrada',true);
END $$;


-- Al consultar el estado de un pedido no se deben mostrar pedidos del ciclo vencido.
create or replace function public.gestlok_chat_srv_estado(p_conversacion uuid,p_token_hash bytea)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_order_state$
declare c gestlok_chat_private.conversaciones;
begin
  c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  return jsonb_build_object('pedidos',coalesce((
    select jsonb_agg(gestlok_chat_private.pedido_publico(p) order by p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos
      where conversacion_id=c.id and creado_at>=c.reiniciada_at
      order by creado_at desc limit 5) p
  ),'[]'::jsonb));
end $gc_order_state$;
revoke all on function public.gestlok_chat_srv_estado(uuid,bytea) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_estado(uuid,bytea) to service_role;
