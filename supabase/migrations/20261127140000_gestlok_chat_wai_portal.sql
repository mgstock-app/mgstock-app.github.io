-- Portal WAI por sucursal; reutiliza la configuración existente. Bandeja de ensayo
-- cerrada por defecto en todas las bases. No habilita tráfico comercial.
create or replace function gestlok_chat_private.wai_portal_nivel(p_sucursal uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare n text;
begin
 if auth.uid() is null then return null; end if;
 if not exists(select 1 from gestlok_chat_private.sucursales s
   join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada
   join public.docs d on d.tenant_id=s.tenant_id and d.col='locales' and d.id=s.local_id
   join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.tenant_id=s.tenant_id and h.local_id=s.local_id
   where s.id=p_sucursal) then return null; end if;
 if gestlok_chat_private.es_creadora_chat() then
   perform gestlok_platform.require_admin(); return 'configurar';
 end if;
 if coalesce(public.mi_rol(),'') not in ('dueno','gerente') then return null; end if;
 n:=gestlok_chat_private.nivel(p_sucursal);
 if n in ('gestionar','configurar') then return n; end if;
 return null;
end$$;
revoke all on function gestlok_chat_private.wai_portal_nivel(uuid) from public,anon,authenticated;

create table if not exists gestlok_chat_private.wai_piloto_entorno (
 id boolean primary key default true check(id),
 habilitado boolean not null default false
);
insert into gestlok_chat_private.wai_piloto_entorno(id) values(true) on conflict do nothing;
alter table gestlok_chat_private.wai_piloto_entorno enable row level security;
revoke all on gestlok_chat_private.wai_piloto_entorno from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_portal_inicio(p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode='42501'; end if;
 if p_slug is not null and p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Enlace inválido' using errcode='22023'; end if;
 return jsonb_build_object('administradora',gestlok_chat_private.es_creadora_chat(),
 'piloto_disponible',(select habilitado from gestlok_chat_private.wai_piloto_entorno where id),
 'locales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'local_id',s.local_id,'slug',s.slug,'nombre',s.nombre,'empresa',e.nombre_publico,
  'nivel',gestlok_chat_private.wai_portal_nivel(s.id)) order by e.nombre_publico,s.nombre)
 from gestlok_chat_private.sucursales s join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
 where (p_slug is null or s.slug=p_slug) and gestlok_chat_private.wai_portal_nivel(s.id) is not null),'[]'::jsonb));
end$$;
revoke all on function public.gestlok_chat_wai_portal_inicio(text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_portal_inicio(text) to authenticated;

create table if not exists gestlok_chat_private.wai_pilotos (
 id uuid primary key default gen_random_uuid(),
 habilitacion_id uuid not null references gestlok_chat_private.whatsapp_premium_habilitaciones(id) on delete restrict,
 sucursal_id uuid not null references gestlok_chat_private.sucursales(id) on delete restrict,
 tester text not null check(tester ~ '^\+[1-9][0-9]{7,14}$'),
 creado_at timestamptz not null default now(),
 vence_at timestamptz not null default now()+interval '25 minutes',
 creado_por uuid not null,
 cancelado boolean not null default false,
 check(vence_at>creado_at and vence_at<=creado_at+interval '25 minutes')
);
create index if not exists wai_pilotos_linea_idx on gestlok_chat_private.wai_pilotos(habilitacion_id,vence_at desc);
create table if not exists gestlok_chat_private.wai_mensajes (
 id uuid primary key default gen_random_uuid(),
 piloto_id uuid not null references gestlok_chat_private.wai_pilotos(id) on delete cascade,
 direccion text not null check(direccion in ('entrada','salida')),
 texto text not null check(length(btrim(texto)) between 1 and 1000),
 evento text,
 jid text,
 estado text not null check(estado in ('recibido','pendiente','reservado','aceptado','incierto')),
 creado_at timestamptz not null default now(),
 reservado_at timestamptz,
 creado_por uuid,
 unique(piloto_id,direccion,evento)
);
create index if not exists wai_mensajes_piloto_idx on gestlok_chat_private.wai_mensajes(piloto_id,creado_at);
alter table gestlok_chat_private.wai_pilotos enable row level security;
alter table gestlok_chat_private.wai_mensajes enable row level security;
revoke all on gestlok_chat_private.wai_pilotos,gestlok_chat_private.wai_mensajes from public,anon,authenticated;

-- Eligibility checked every time, including exclusions, paused subscription and last
-- genuine heartbeat. No history from outside the explicitly authorized test.
create or replace function gestlok_chat_private.wai_piloto_vigente(p gestlok_chat_private.wai_pilotos)
returns boolean language sql stable security definer set search_path='' as $$
 select (select habilitado from gestlok_chat_private.wai_piloto_entorno where id)
  and p.vence_at>now() and not p.cancelado
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$$;
revoke all on function gestlok_chat_private.wai_piloto_vigente(gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid,p_id uuid,p_tester text default null,p_accion text default 'autorizar')
returns uuid language plpgsql security definer set search_path='' as $$
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
 or not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=h.id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
 then raise exception 'Prueba no autorizada o conexión no verificada' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now()) then raise exception 'Ya hay una prueba vigente' using errcode='22023';end if;
 insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por) values(h.id,p_sucursal,p_tester,auth.uid()) returning id into v;
 return v;
end$$;
revoke all on function public.gestlok_chat_wai_piloto_autorizar(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_piloto_autorizar(uuid,uuid,text,text) to authenticated;

create or replace function public.gestlok_chat_wai_bandeja(p_sucursal uuid,p_accion text default 'listar',p_piloto uuid default null,p_texto text default null,p_evento text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype;
begin
 if gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_accion='responder' then
  select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal for update;
  if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
  if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_evento is null or p_evento !~ '^[a-f0-9-]{36}$' then raise exception 'Respuesta inválida' using errcode='22023';end if;
  if not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
    or not exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada')
    then raise exception 'Esperá un mensaje de prueba y una conexión activa' using errcode='22023';end if;
  if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='salida')>=10 then raise exception 'Límite de respuestas de prueba' using errcode='22023';end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,creado_por) values(p.id,'salida',btrim(p_texto),'pendiente',p_evento,auth.uid()) on conflict(piloto_id,direccion,evento) do nothing;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida' using errcode='22023';end if;
 return jsonb_build_object('chats',coalesce((select jsonb_agg(jsonb_build_object(
 'id',x.id,'linea',x.habilitacion_id,'cliente',x.tester,'vence_at',x.vence_at,
 'puede_responder',exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id and m.direccion='entrada')
 and exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=x.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
 and (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id and m.direccion='salida')<10,
 'mensajes',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'direccion',m.direccion,'texto',m.texto,'evento',case when m.direccion='salida' then m.evento end,'estado',case when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' else m.estado end,'fecha',m.creado_at) order by m.creado_at,m.id)
 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id),'[]'::jsonb)) order by x.creado_at desc)
 from gestlok_chat_private.wai_pilotos x where x.sucursal_id=p_sucursal and gestlok_chat_private.wai_piloto_vigente(x)),'[]'::jsonb));
end$$;
revoke all on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) to authenticated;

-- Transport authentication is a per-line capability and a recent connection
-- revision. No service-role key. A reserved message is NEVER retried on timeout.
create or replace function public.gestlok_chat_wai_piloto_motor(p_id uuid,p_clave text,p_revision uuid,p_accion text,p_piloto uuid default null,p_jid text default null,p_evento text default null,p_texto text default null,p_mensaje uuid default null,p_estado text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and h.habilitada) then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at);end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='recibir' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=20 then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado) values(p.id,'entrada',p_texto,p_evento,p_jid,'recibido') on conflict(piloto_id,direccion,evento) do nothing;
  return jsonb_build_object('ok',true);
 elsif p_accion='tomar' then
  select x.jid into jid from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='entrada' order by x.creado_at desc limit 1;
  if jid is null then return null;end if;
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' order by x.creado_at limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',m.texto);
 elsif p_accion='resultado' then
  if p_estado is null or p_estado not in ('aceptado','incierto') then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado=p_estado where id=p_mensaje and piloto_id=p.id and direccion='salida' and estado='reservado';
  return jsonb_build_object('ok',found);
 end if;
 return null;
end$$;
revoke all on function public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,text,uuid,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_piloto_motor(uuid,text,uuid,text,uuid,text,text,text,uuid,text) to anon;
