-- WAI pilot: persistent order tracking and explicit customer feedback.
-- Scope is the authorized test line/recipient, never a commercial broadcast.
create table if not exists gestlok_chat_private.wai_pedidos (
 id uuid primary key default gen_random_uuid(),
 hilo_id uuid not null references gestlok_chat_private.wai_pilotos(id),
 piloto_id uuid not null references gestlok_chat_private.wai_pilotos(id),
 modalidad text not null check(modalidad in ('retiro','delivery')),
 estado text not null default 'preparacion' check(estado in ('preparacion','listo','en_camino','entregado')),
 demora_min integer not null check(demora_min between 1 and 20),
 creado_at timestamptz not null default now(),
 actualizado_at timestamptz not null default now(),
 consulta_at timestamptz,
 consulta_enviada_at timestamptz,
 token_hash text unique,
 valoracion text check(valoracion in ('bien','problema')),
 valorado_at timestamptz,
 respuesta_encolada_at timestamptz,
 resuelto_at timestamptz,
 detalle text check(length(detalle)<=1000),
 foto text check(length(foto)<=400000),
 detalles_at timestamptz,
 revision_evento uuid not null unique
);
create index if not exists wai_pedidos_hilo_idx on gestlok_chat_private.wai_pedidos(hilo_id,creado_at desc);
create index if not exists wai_pedidos_piloto_idx on gestlok_chat_private.wai_pedidos(piloto_id,consulta_at);
alter table gestlok_chat_private.wai_pedidos enable row level security;
revoke all on gestlok_chat_private.wai_pedidos from public,anon,authenticated;

-- Contact consent without requiring the socket to be online: a customer can
-- report a problem while the connector is temporarily offline.
create or replace function gestlok_chat_private.wai_pedido_consentimiento(p gestlok_chat_private.wai_pilotos)
returns boolean language sql stable set search_path='' as $$
 select p.vence_at>now() and not p.cancelado
  and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$$;
revoke all on function gestlok_chat_private.wai_pedido_consentimiento(gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

-- All outbound actions share the existing 10-message pilot limit. Caller
-- already holds the authorized pilot row lock. Idempotence precedes quota.
create or replace function gestlok_chat_private.wai_pedido_encolar(p_piloto uuid,p_evento text,p_texto text)
returns boolean language plpgsql set search_path='' as $$
begin
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.evento=p_evento) then return true;end if;
 if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.origen is distinct from 'telefono')>=10 then return false;end if;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,origen)
 values(p_piloto,'salida',p_texto,'pendiente',p_evento,'wai') on conflict(piloto_id,direccion,evento) do nothing;
 return true;
end$$;
revoke all on function gestlok_chat_private.wai_pedido_encolar(uuid,text,text) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_pedido_tick(p gestlok_chat_private.wai_pilotos)
returns void language plpgsql set search_path='' as $$
declare o gestlok_chat_private.wai_pedidos%rowtype; secreto text; mensaje text;
begin
 -- Only the current, verified connector calls this function. No jobs are
 -- migrated to a renewed pilot without explicit new authorization.
 for o in select x.* from gestlok_chat_private.wai_pedidos x
  where x.piloto_id=p.id and (x.consulta_at<=now() and x.consulta_enviada_at is null or x.valoracion is not null and x.respuesta_encolada_at is null)
  order by x.creado_at for update
 loop
  if o.valoracion is not null and o.respuesta_encolada_at is null then
   mensaje=case o.valoracion when 'bien' then '¡Muchas gracias por elegirnos! Nos alegra que hayas recibido bien tu pedido.'
    else 'Lamentamos mucho el inconveniente. Por favor contanos qué pasó con tu pedido. Si podés, adjuntá una foto en el enlace de la consulta. El gerente va a revisar tu reclamo.' end;
   if gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':respuesta',mensaje) then
    update gestlok_chat_private.wai_pedidos set respuesta_encolada_at=now() where id=o.id;
   end if;
  elsif o.consulta_enviada_at is null and o.valoracion is null
   and exists(select 1 from gestlok_chat_private.wai_mensajes m
    where m.piloto_id=p.id and m.estado='aceptado'
      and m.evento in ('pedido:'||o.id||':listo','pedido:'||o.id||':en_camino','pedido:'||o.id||':entregado')
      and m.reservado_at+make_interval(mins=>o.demora_min)<=now()) then
   secreto=encode(extensions.gen_random_bytes(32),'hex');
   mensaje='¿Cómo llegó tu pedido? Elegí una de las dos opciones en este enlace: Recibí bien mi pedido / Tuve un problema con mi pedido. https://gestlok-prueba.vercel.app/chat/wai/valoracion/#'||secreto;
   if gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':consulta',mensaje) then
    update gestlok_chat_private.wai_pedidos set consulta_enviada_at=now(),token_hash=encode(sha256(convert_to(secreto,'UTF8')),'hex') where id=o.id;
   end if;
  end if;
 end loop;
end$$;
revoke all on function gestlok_chat_private.wai_pedido_tick(gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_pedido(p_sucursal uuid,p_hilo uuid,p_accion text,p_pedido uuid default null,p_modalidad text default null,p_demora integer default 2,p_evento uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;o gestlok_chat_private.wai_pedidos%rowtype;s gestlok_chat_private.sucursales%rowtype;mensaje text;v_estado text;url text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found then raise exception 'Conversación no disponible';end if;
 -- Resolve to the stable oldest thread; prevent parallel orders via aliases.
 if a.id is distinct from (select x.id from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) order by x.creado_at,x.id limit 1) then raise exception 'Conversación no disponible';end if;
 if p_accion='resolver' then
  update gestlok_chat_private.wai_pedidos set resuelto_at=coalesce(resuelto_at,now()),actualizado_at=now()
   where id=p_pedido and hilo_id=a.id and valoracion='problema';
  return found;
 end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal;
 if p_accion='transferencia' then
  if p_evento is null then raise exception 'Solicitud inválida';end if;
  if length(btrim(coalesce(s.datos_transferencia,''))) not between 1 and 700 then raise exception 'Cargá los datos de transferencia en Ajustes del local';end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'transferencia:'||p_evento,'Datos para la transferencia:'||chr(10)||s.datos_transferencia) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 elsif p_accion='aceptar' then
  if p_evento is null or p_modalidad is null or p_modalidad not in ('retiro','delivery') or p_demora is null or p_demora not between 1 and 20 then raise exception 'Elegí modalidad y demora de 1 a 20 minutos';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and (estado<>'entregado' or valoracion='problema' and resuelto_at is null)) then raise exception 'Finalizá el pedido o el reclamo anterior';end if;
  insert into gestlok_chat_private.wai_pedidos(hilo_id,piloto_id,modalidad,demora_min,revision_evento) values(a.id,p.id,p_modalidad,p_demora,p_evento) returning * into o;
  mensaje='¡Recibimos tu pedido! Ya está confirmado y en preparación. Modalidad: '||case o.modalidad when 'retiro' then 'retiro en el local.' else 'delivery.' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':preparacion',mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 end if;
 select * into o from gestlok_chat_private.wai_pedidos where id=p_pedido and hilo_id=a.id for update;
 if not found then raise exception 'Pedido no disponible';end if;
 if p_accion='listo' then
  v_estado=case o.modalidad when 'retiro' then 'listo' else 'en_camino' end;
  if o.estado=v_estado then return true;end if;
  if o.estado<>'preparacion' then raise exception 'Estado de pedido inválido';end if;
  mensaje=case o.modalidad when 'retiro' then '¡Tu pedido está listo para retirar en '||s.nombre||'!' else '¡Tu pedido está en camino!' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':'||v_estado,mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado=v_estado,piloto_id=p.id,consulta_at=now()+make_interval(mins=>o.demora_min),actualizado_at=now() where id=o.id;
 elsif p_accion='entregado' then
  if o.estado='entregado' then return true;end if;
  if o.estado not in ('listo','en_camino') then raise exception 'Primero marcá listo para retirar o en camino';end if;
  url=s.mensajes->>'resena_url';
  mensaje='Tu pedido figura como entregado. ¡Gracias por elegirnos!';
  if gestlok_chat_private.url_resena_valida(url) then
   mensaje=mensaje||chr(10)||'Nos gustaría conocer tu experiencia. Podés dejarnos una reseña aquí: '||url;
  end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':entregado',mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado='entregado',actualizado_at=now(),
   piloto_id=case when consulta_enviada_at is null then p.id else piloto_id end,
   consulta_at=case when consulta_enviada_at is null and piloto_id<>p.id then now()+make_interval(mins=>o.demora_min) else consulta_at end
   where id=o.id;
 else raise exception 'Acción inválida';end if;
 return true;
end$$;
revoke all on function public.gestlok_chat_wai_pedido(uuid,uuid,text,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_pedido(uuid,uuid,text,uuid,text,integer,uuid) to authenticated;

-- Private, unguessable single-order feedback link. No phone, user or order
-- history is exposed to the anonymous caller, and GET/list never changes state.
create or replace function public.gestlok_chat_wai_valoracion(p_token text,p_accion text default 'ver',p_detalle text default null,p_foto text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o gestlok_chat_private.wai_pedidos%rowtype; p gestlok_chat_private.wai_pilotos%rowtype; k text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 k=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into o from gestlok_chat_private.wai_pedidos where token_hash=k;
 if not found then return null;end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=o.piloto_id for update;
 if not found or not coalesce(gestlok_chat_private.wai_pedido_consentimiento(p),false) then return null;end if;
 select x.* into o from gestlok_chat_private.wai_pedidos x where x.id=o.id and x.token_hash=k and exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' and m.estado='aceptado') for update;
 if not found then return null;end if;
 if p_accion in ('bien','problema') then
  if o.valoracion is null then
   update gestlok_chat_private.wai_pedidos set valoracion=p_accion,valorado_at=now(),actualizado_at=now() where id=o.id returning * into o;
   insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento)
    values(p.id,'entrada',case p_accion when 'bien' then 'Encuesta del pedido: Recibí bien mi pedido.' else 'Encuesta del pedido: Tuve un problema con mi pedido.' end,'recibido','pedido:'||o.id||':valoracion') on conflict(piloto_id,direccion,evento) do nothing;
  end if;
 elsif p_accion='detalle' then
  if o.valoracion is distinct from 'problema' or o.resuelto_at is not null then return null;end if;
  if o.detalles_at is null then
   if length(coalesce(p_detalle,''))>1000 or (p_foto is not null and (length(p_foto)>400000 or p_foto !~ '^/9j/[A-Za-z0-9+/]+={0,2}$')) or (nullif(btrim(p_detalle),'') is null and p_foto is null) then raise exception 'Detalle o foto inválidos';end if;
   update gestlok_chat_private.wai_pedidos set detalle=nullif(btrim(p_detalle),''),foto=p_foto,detalles_at=now(),actualizado_at=now() where id=o.id returning * into o;
   insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento)
    values(p.id,'entrada',left('Detalle del reclamo: '||coalesce(o.detalle,'Foto adjunta')||case when o.foto is not null then ' · Foto disponible en el pedido.' else '' end,1000),'recibido','pedido:'||o.id||':detalle') on conflict(piloto_id,direccion,evento) do nothing;
  end if;
 elsif p_accion is distinct from 'ver' then return null;end if;
 return jsonb_build_object('valoracion',o.valoracion,'detalles_enviados',o.detalles_at is not null,'resuelto',o.resuelto_at is not null);
end$$;
revoke all on function public.gestlok_chat_wai_valoracion(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_valoracion(text,text,text,text) to anon,authenticated;

create or replace function public.gestlok_chat_wai_pedido_foto(p_sucursal uuid,p_pedido uuid)
returns text language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 return (select o.foto from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos p on p.id=o.hilo_id where o.id=p_pedido and p.sucursal_id=p_sucursal);
end$$;
revoke all on function public.gestlok_chat_wai_pedido_foto(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_pedido_foto(uuid,uuid) to authenticated;


create or replace function public.gestlok_chat_wai_piloto_motor(p_id uuid,p_clave text,p_revision uuid,p_accion text,p_piloto uuid default null,p_jid text default null,p_evento text default null,p_texto text default null,p_mensaje uuid default null,p_estado text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then perform gestlok_chat_private.wai_pedido_tick(p); return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='agenda' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_texto is null or length(btrim(p_texto)) not between 1 and 100 or p_texto ~ '[[:cntrl:]]' then return null;end if;
  insert into gestlok_chat_private.wai_nombres_agenda(habilitacion_id,numero_clave,nombre,sincronizado_at)
  values(p.habilitacion_id,gestlok_chat_private.whatsapp_exclusion_key(p.tester),btrim(p_texto),now())
  on conflict(habilitacion_id,numero_clave) do update set nombre=excluded.nombre,sincronizado_at=excluded.sincronizado_at;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=20 then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado) values(p.id,'entrada',p_texto,p_evento,p_jid,'recibido') on conflict(piloto_id,direccion,evento) do nothing;
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
  select x.jid into jid from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_pilotos q on q.id=x.piloto_id where x.direccion='entrada' and x.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by x.creado_at desc,x.id desc limit 1;
  if jid is null then return null;end if;
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' order by x.creado_at limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',m.texto);
 elsif p_accion='entrega' then
  if p_evento is null then return null; end if;
  update gestlok_chat_private.wai_mensajes set entregado_at=coalesce(entregado_at,now()) where piloto_id=p.id and direccion='salida' and wa_id=p_evento and estado='aceptado';
  if found then return jsonb_build_object('ok',true); end if;
  update gestlok_chat_private.wai_mensajes set accion_entregada_at=coalesce(accion_entregada_at,now()) where piloto_id=p.id and direccion='salida' and wa_accion_id=p_evento and accion_estado='enviado';
  return jsonb_build_object('ok',found);
 elsif p_accion='tomar_accion' then
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.accion_estado='pendiente' and x.wa_id is not null order by x.accion_solicitada_at,x.id limit 1 for update;
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
  update gestlok_chat_private.wai_mensajes set estado=p_estado,wa_id=case when p_estado='aceptado' then p_evento end,wa_ruta=case when p_estado='aceptado' then p_jid end where id=p_mensaje and piloto_id=p.id and direccion='salida' and estado='reservado';
  return jsonb_build_object('ok',found);
 end if;
 return null;
end$$;
revoke all on function public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,text,uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,text,uuid,text,text,text,uuid,text) to anon;

create or replace function public.gestlok_chat_wai_bandeja(p_sucursal uuid,p_accion text default 'listar',p_piloto uuid default null,p_texto text default null,p_evento text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_pilotos%rowtype; resultado jsonb;
begin
 if gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_accion='responder' then
  select * into a from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
  if not found then raise exception 'Conversación no disponible' using errcode='22023';end if;
  select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
  if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
  if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_evento is null or p_evento !~ '^[a-f0-9-]{36}$' then raise exception 'Respuesta inválida' using errcode='22023';end if;
  if not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
    or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then raise exception 'Esperá un mensaje de prueba y una conexión activa' using errcode='22023';end if;
  if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='salida' and m.origen is distinct from 'telefono')>=10 then raise exception 'Límite de respuestas de prueba' using errcode='22023';end if;
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
        and (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=cur.id and m.direccion='salida' and m.origen is distinct from 'telefono')<10 as puede_responder
   from hilos h left join lateral (
    select q.id,q.vence_at,gestlok_chat_private.wai_piloto_vigente(x) as vigente from candidatos q join gestlok_chat_private.wai_pilotos x on x.id=q.id
    where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and not q.cancelado and q.vence_at>now()
    order by q.creado_at desc,q.id desc limit 1
   ) cur on true
 )
 select jsonb_build_object('chats',coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'linea',d.habilitacion_id,'cliente',d.cliente,'piloto_activo',d.piloto_activo,'vence_at',d.vence_at,
   'conexion_activa',d.conexion_activa,'archivado',d.piloto_activo is null,'puede_responder',d.puede_responder,
   'alias',(select ac.alias from gestlok_chat_private.wai_alias_contactos ac where ac.sucursal_id=p_sucursal and ac.numero_clave=d.numero_clave),
   'nombre_agenda',(select ac.nombre from gestlok_chat_private.wai_nombres_agenda ac where ac.habilitacion_id=d.habilitacion_id and ac.numero_clave=d.numero_clave),
   'resena_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url')),
   'transferencia_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and length(btrim(s.datos_transferencia))>0),
   'reclamo_pendiente',exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=d.id and o.valoracion='problema' and o.resuelto_at is null),
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
     'leido',case when m.direccion='entrada' then exists(select 1 from gestlok_chat_private.wai_lecturas l where l.mensaje_id=m.id and l.usuario_id=auth.uid()) else true end,
     'evento',case when m.direccion='salida' then m.evento end,
     'estado',case when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' else m.estado end,
     'fecha',m.creado_at
   ) order by m.creado_at,m.id),'[]'::jsonb) as mensajes,max(m.creado_at) as ultima_fecha
   from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id
   where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave
 ) hist;
 return resultado;
end$$;
revoke all on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) to authenticated;
