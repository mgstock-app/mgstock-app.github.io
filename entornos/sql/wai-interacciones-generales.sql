-- General-purpose WAI interactions. No tenant names, catalogs or answers hard-coded.
-- Experimental native single-select polls, available only in the authorized pilot.
alter table gestlok_chat_private.wai_sesiones add column if not exists opciones_at timestamptz;
alter table gestlok_chat_private.wai_mensajes add column if not exists interaccion jsonb;
alter table gestlok_chat_private.wai_mensajes add column if not exists opcion_elegida text;
alter table gestlok_chat_private.wai_mensajes add column if not exists opcion_at timestamptz;
alter table gestlok_chat_private.wai_mensajes add column if not exists opcion_respuesta_at timestamptz;
alter table gestlok_chat_private.wai_mensajes add column if not exists cancelada_at timestamptz;

create table if not exists gestlok_chat_private.wai_atencion_config (
 sucursal_id uuid primary key references gestlok_chat_private.sucursales(id),
 pregunta text not null check(length(pregunta) between 2 and 120),
 opciones jsonb not null,
 bienvenida_auto boolean not null default false,
 pedidos boolean not null default true,
 actualizado_at timestamptz not null default now()
);
create table if not exists gestlok_chat_private.wai_atencion_hilos (
 hilo_id uuid primary key references gestlok_chat_private.wai_pilotos(id),
 manual boolean not null default false,
 pendiente boolean not null default false,
 actualizado_at timestamptz not null default now()
);
alter table gestlok_chat_private.wai_atencion_config enable row level security;
alter table gestlok_chat_private.wai_atencion_hilos enable row level security;
revoke all on gestlok_chat_private.wai_atencion_config,gestlok_chat_private.wai_atencion_hilos from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_hilo(p gestlok_chat_private.wai_pilotos)
returns uuid language sql stable set search_path='' as $$
 select q.id from gestlok_chat_private.wai_pilotos q where q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by q.creado_at,q.id limit 1
$$;
revoke all on function gestlok_chat_private.wai_hilo(gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_atencion_ajustes(p_sucursal uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select jsonb_build_object('pregunta',c.pregunta,'opciones',c.opciones,'bienvenida_auto',c.bienvenida_auto,'pedidos',c.pedidos) from gestlok_chat_private.wai_atencion_config c where c.sucursal_id=p_sucursal),
 '{"pregunta":"¿En qué podemos ayudarte?","opciones":[{"id":"op1","label":"Consultar productos o servicios","respuesta":"","humano":true},{"id":"op2","label":"Consultar horarios y ubicación","respuesta":"","humano":true},{"id":"op3","label":"Hablar con una persona","respuesta":"","humano":true}],"bienvenida_auto":false,"pedidos":true}'::jsonb)
$$;
revoke all on function gestlok_chat_private.wai_atencion_ajustes(uuid) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_atencion_config(p_sucursal uuid,p_config jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare opciones jsonb;v jsonb;k int:=0;pregunta text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_config is null then return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);end if;
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_config->'pregunta') is distinct from 'string' or jsonb_typeof(p_config->'opciones') is distinct from 'array' or jsonb_typeof(p_config->'bienvenida_auto') is distinct from 'boolean' or jsonb_typeof(p_config->'pedidos') is distinct from 'boolean' then raise exception 'Configuración inválida';end if;
 pregunta=btrim(p_config->>'pregunta');
 if length(pregunta) not between 2 and 120 or jsonb_array_length(p_config->'opciones') not between 2 and 6 then raise exception 'Completá una pregunta y entre 2 y 6 opciones';end if;
 opciones='[]'::jsonb;
 for v in select value from jsonb_array_elements(p_config->'opciones') loop
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) not between 1 and 60 or jsonb_typeof(v->'respuesta') is distinct from 'string' or length(v->>'respuesta')>400 or jsonb_typeof(v->'humano') is distinct from 'boolean' then raise exception 'Opción inválida';end if;
  if not (v->>'humano')::boolean and nullif(btrim(v->>'respuesta'),'') is null then raise exception 'Completá la respuesta automática o elegí atención humana';end if;
  if exists(select 1 from jsonb_array_elements(opciones) x where lower(x->>'label')=lower(btrim(v->>'label'))) then raise exception 'Las opciones deben ser diferentes';end if;
  k=k+1;opciones=opciones||jsonb_build_array(jsonb_build_object('id','op'||k,'label',btrim(v->>'label'),'respuesta',btrim(v->>'respuesta'),'humano',(v->>'humano')::boolean));
 end loop;
 insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,bienvenida_auto,pedidos) values(p_sucursal,pregunta,opciones,(p_config->>'bienvenida_auto')::boolean,(p_config->>'pedidos')::boolean)
 on conflict(sucursal_id) do update set pregunta=excluded.pregunta,opciones=excluded.opciones,bienvenida_auto=excluded.bienvenida_auto,pedidos=excluded.pedidos,actualizado_at=now();
 return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);
end$$;
revoke all on function public.gestlok_chat_wai_atencion_config(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_atencion_config(uuid,jsonb) to authenticated;

-- Snapshot the options at send time. Later changes cannot reinterpret a vote.
create or replace function gestlok_chat_private.wai_encolar_menu(p gestlok_chat_private.wai_pilotos,p_evento text,c jsonb)
returns boolean language plpgsql set search_path='' as $$
declare texto text;
begin
 texto=(c->>'pregunta')||chr(10)||(select string_agg('• '||(x->>'label'),chr(10)) from jsonb_array_elements(c->'opciones') x);
 if not gestlok_chat_private.wai_pedido_encolar(p.id,p_evento,texto) then return false;end if;
 update gestlok_chat_private.wai_mensajes set interaccion=jsonb_build_object('tipo','menu','pregunta',c->>'pregunta','opciones',c->'opciones') where piloto_id=p.id and direccion='salida' and evento=p_evento and estado='pendiente' and interaccion is null;
 return true;
end$$;
revoke all on function gestlok_chat_private.wai_encolar_menu(gestlok_chat_private.wai_pilotos,text,jsonb) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_atencion_accion(p_sucursal uuid,p_hilo uuid,p_accion text,p_evento uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found or a.id is distinct from gestlok_chat_private.wai_hilo(a) then raise exception 'Conversación no disponible';end if;
 if p_accion in ('manual','asistido','atendido') then
  -- Serialize takeover with the connector's claims. A message already in flight
  -- cannot be recalled, but pending non-order automatic replies are canceled.
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  if p_accion='atendido' then update gestlok_chat_private.wai_atencion_hilos set pendiente=false,actualizado_at=now() where hilo_id=a.id;return true;end if;
  insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual) values(a.id,p_accion='manual')
  on conflict(hilo_id) do update set manual=excluded.manual,actualizado_at=now();
  if p_accion='manual' then
   update gestlok_chat_private.wai_mensajes m set cancelada_at=now() from gestlok_chat_private.wai_pilotos q
    where m.piloto_id=q.id and q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester)
      and m.estado='pendiente' and m.cancelada_at is null and (m.evento like 'menu:auto:%' or m.evento like 'menu:respuesta:%');
  end if;
  return true;
 end if;
 if p_accion is distinct from 'enviar' or p_evento is null then raise exception 'Acción inválida';end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 if not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then raise exception 'Actualizá el conector para enviar opciones de WhatsApp';end if;
 if not gestlok_chat_private.wai_encolar_menu(p,'menu:'||p_evento,gestlok_chat_private.wai_atencion_ajustes(p_sucursal)) then raise exception 'Límite de respuestas de prueba';end if;
 return true;
end$$;
revoke all on function public.gestlok_chat_wai_atencion_accion(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_atencion_accion(uuid,uuid,text,uuid) to authenticated;

create or replace function gestlok_chat_private.wai_atencion_tick(p gestlok_chat_private.wai_pilotos)
returns void language plpgsql set search_path='' as $$
declare c jsonb;h uuid;manual boolean;m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;
begin
 h=gestlok_chat_private.wai_hilo(p);
 manual=coalesce((select a.manual from gestlok_chat_private.wai_atencion_hilos a where a.hilo_id=h),false);
 c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 -- Explicit opt-in only, once per authorized trial. Never a broadcast.
 if not manual and (c->>'bienvenida_auto')::boolean and exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='entrada' and x.jid is not null and x.interaccion is null)
  and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu') then
  perform gestlok_chat_private.wai_encolar_menu(p,'menu:auto:'||p.id,c);
 end if;
 for m in select x.* from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu' and x.opcion_elegida is not null and x.opcion_respuesta_at is null for update loop
  select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=m.opcion_elegida;
  if manual or (o->>'humano')::boolean then
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
    on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
   manual=true;
  elsif gestlok_chat_private.wai_pedido_encolar(p.id,'menu:respuesta:'||m.id,o->>'respuesta') then
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
  end if;
 end loop;
end$$;
revoke all on function gestlok_chat_private.wai_atencion_tick(gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_recibir_voto(p gestlok_chat_private.wai_pilotos,p_jid text,p_evento text,p_opcion text)
returns jsonb language plpgsql set search_path='' as $$
declare m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;pedido gestlok_chat_private.wai_pedidos%rowtype;h uuid;
begin
 if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
 select x.* into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.wa_id=p_evento and x.direccion='salida' and x.estado='aceptado' and x.interaccion is not null for update;
 if not found then return null;end if;
 select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=p_opcion;
 if o is null then return null;end if;
 if m.interaccion->>'tipo'='pedido' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' for update;
  if not found then return null;end if;
  -- A subsequent complaint is never ignored, even after a positive vote.
  if pedido.valoracion='problema' or p_opcion=pedido.valoracion then return jsonb_build_object('ok',true);end if;
  if p_opcion not in ('bien','problema') then return null;end if;
  update gestlok_chat_private.wai_pedidos set valoracion=p_opcion,valorado_at=now(),actualizado_at=now(),respuesta_encolada_at=null where id=pedido.id;
 elsif m.interaccion->>'tipo'='menu' then
  if m.opcion_elegida is not null and (m.opcion_elegida=p_opcion or not (o->>'humano')::boolean or exists(select 1 from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=m.opcion_elegida and (v->>'humano')::boolean)) then return jsonb_build_object('ok',true);end if;
  -- Immediately mark a request for a person, even if no reply quota remains.
  if (o->>'humano')::boolean then
   h=gestlok_chat_private.wai_hilo(p);
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
   on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set cancelada_at=now() where piloto_id=p.id and estado='pendiente' and cancelada_at is null and (evento like 'menu:auto:%' or evento like 'menu:respuesta:%');
  end if;
 else return null;end if;
 update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=null where id=m.id;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido','voto:'||m.id||':'||p_opcion,p_jid) on conflict(piloto_id,direccion,evento) do nothing;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function gestlok_chat_private.wai_recibir_voto(gestlok_chat_private.wai_pilotos,text,text,text) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_pedido_tick(p gestlok_chat_private.wai_pilotos)
returns void language plpgsql set search_path='' as $$
declare o gestlok_chat_private.wai_pedidos%rowtype; secreto text; mensaje text; nativa boolean; enlace text;
begin
 nativa=exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at);
 -- Only the current, verified connector calls this function. No jobs are
 -- migrated to a renewed pilot without explicit new authorization.
 for o in select x.* from gestlok_chat_private.wai_pedidos x
  where x.piloto_id=p.id and (x.consulta_at<=now() and x.consulta_enviada_at is null or x.valoracion is not null and x.respuesta_encolada_at is null)
  order by x.creado_at for update
 loop
  if o.valoracion is not null and o.respuesta_encolada_at is null then
   mensaje=case o.valoracion when 'bien' then '¡Muchas gracias por elegirnos! Nos alegra que hayas recibido bien tu pedido.'
    else 'Lamentamos mucho el inconveniente. Por favor contanos qué pasó con tu pedido. Si podés, adjuntá una foto en el enlace de la consulta. El gerente va a revisar tu reclamo.' end;
   if o.valoracion='problema' then
    select substring(m.texto from 'https://gestlok-prueba[.]vercel[.]app/chat/wai/valoracion/#([a-f0-9]{64})') into enlace from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.evento='pedido:'||o.id||':consulta';
    if enlace is not null then mensaje='Lamentamos mucho el inconveniente. Contanos por WhatsApp qué pasó con tu pedido. Si podés, adjuntá una foto en este enlace: https://gestlok-prueba.vercel.app/chat/wai/valoracion/#'||enlace;end if;
   end if;
   if gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':respuesta:'||o.valoracion,mensaje) then
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
    if nativa then
     update gestlok_chat_private.wai_mensajes set interaccion='{"tipo":"pedido","pregunta":"¿Cómo llegó tu pedido? Elegí una opción","opciones":[{"id":"bien","label":"Recibí bien mi pedido"},{"id":"problema","label":"Tuve un problema con mi pedido"}]}'::jsonb where piloto_id=p.id and evento='pedido:'||o.id||':consulta' and estado='pendiente' and interaccion is null;
    end if;
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
  if not (gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean then raise exception 'El seguimiento de pedidos está desactivado en Ajustes WAI';end if;
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


create or replace function public.gestlok_chat_wai_piloto_motor(p_id uuid,p_clave text,p_revision uuid,p_accion text,p_piloto uuid default null,p_jid text default null,p_evento text default null,p_texto text default null,p_mensaje uuid default null,p_estado text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then
  update gestlok_chat_private.wai_sesiones set opciones_at=case when p_estado='opciones_v1' then now() else null end where habilitacion_id=p_id;
  perform gestlok_chat_private.wai_pedido_tick(p);
  if p_estado='opciones_v1' then perform gestlok_chat_private.wai_atencion_tick(p);end if; return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='voto' then return gestlok_chat_private.wai_recibir_voto(p,p_jid,p_evento,p_texto);
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
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and (x.interaccion is null or p_estado='opciones_v1') order by x.creado_at,x.id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',m.texto,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v)) end);
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
   'opciones_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at),
   'atencion_manual',coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'atencion_pendiente',coalesce((select wh.pendiente from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'pedidos_habilitados',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean,
   'resena_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url')),
   'transferencia_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and length(btrim(s.datos_transferencia))>0),
   'reclamo_pendiente',exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=d.id and o.valoracion='problema' and o.resuelto_at is null),
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v),'seleccion',m.opcion_elegida) end,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' when m.direccion='entrada' and m.evento like 'voto:%' then 'opcion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
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
revoke all on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) to authenticated;
