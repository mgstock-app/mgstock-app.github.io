-- Ensayo WAI: estado de lectura aislado por usuario e ID de mensaje.
create table if not exists gestlok_chat_private.wai_lecturas(
 usuario_id uuid not null,
 mensaje_id uuid not null references gestlok_chat_private.wai_mensajes(id) on delete cascade,
 leido_at timestamptz not null default now(),
 primary key(usuario_id,mensaje_id)
);
alter table gestlok_chat_private.wai_lecturas enable row level security;
revoke all on gestlok_chat_private.wai_lecturas from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_marcar_leidos(p_sucursal uuid,p_piloto uuid,p_mensajes uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; v integer;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if coalesce(cardinality(p_mensajes),0) not between 1 and 20 then raise exception 'Mensajes inválidos' using errcode='22023';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
 if exists(select 1 from unnest(p_mensajes) as i(id) where not exists(select 1 from gestlok_chat_private.wai_mensajes m where m.id=i.id and m.piloto_id=p.id and m.direccion='entrada')) then raise exception 'Mensaje no disponible' using errcode='42501';end if;
 insert into gestlok_chat_private.wai_lecturas(usuario_id,mensaje_id)
 select auth.uid(),m.id from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada' and m.id=any(p_mensajes)
 on conflict do nothing;
 select count(*) into v from gestlok_chat_private.wai_lecturas l where l.usuario_id=auth.uid() and l.mensaje_id=any(p_mensajes);
 return v;
end$$;
revoke all on function public.gestlok_chat_wai_marcar_leidos(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_marcar_leidos(uuid,uuid,uuid[]) to authenticated;

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
 'mensajes',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'direccion',m.direccion,'texto',m.texto,'leido',case when m.direccion='entrada' then exists(select 1 from gestlok_chat_private.wai_lecturas l where l.mensaje_id=m.id and l.usuario_id=auth.uid()) else true end,'evento',case when m.direccion='salida' then m.evento end,'estado',case when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' else m.estado end,'fecha',m.creado_at) order by m.creado_at,m.id)
 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id),'[]'::jsonb)) order by x.creado_at desc)
 from gestlok_chat_private.wai_pilotos x where x.sucursal_id=p_sucursal and gestlok_chat_private.wai_piloto_vigente(x)),'[]'::jsonb));
end$$;
revoke all on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_bandeja(uuid,text,uuid,text,text) to authenticated;

