-- Bandeja manual de prueba, un número de cliente consentido y una sola respuesta.
-- No crea pedidos, no usa IA, no cobra ni activa el canal de otros clientes.
create table if not exists gestlok_chat_private.whatsapp_bandeja_pilotos(
 id uuid primary key default gen_random_uuid(),
 habilitacion_id uuid not null references gestlok_chat_private.whatsapp_premium_habilitaciones(id) on delete restrict,
 tenant_id uuid not null,
 sucursal_id uuid not null,
 tester text not null check(tester ~ '^\+[1-9][0-9]{7,14}$'),
 creado_por uuid not null,
 creado_at timestamptz not null default now(),
 vence_at timestamptz not null default now()+interval '2 hours',
 cancelado boolean not null default false,
 evento_id text unique,
 mensaje_id text unique,
 recibido_at timestamptz,
 cliente_texto text check(length(cliente_texto)<=1000),
 respuesta_texto text check(length(respuesta_texto)<=1000),
 respuesta_por uuid,
 respuesta_at timestamptz,
 respuesta_estado text check(respuesta_estado in ('procesando','aceptada','bloqueada','error','incierta')),
 proveedor_id text,
 foreign key(tenant_id,sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict,
 check(vence_at>creado_at and vence_at<=creado_at+interval '2 hours')
);
create index if not exists whatsapp_bandeja_piloto_local_idx on gestlok_chat_private.whatsapp_bandeja_pilotos(sucursal_id,creado_at desc);
alter table gestlok_chat_private.whatsapp_bandeja_pilotos enable row level security;
revoke all on gestlok_chat_private.whatsapp_bandeja_pilotos from public,anon,authenticated,service_role;
-- The administrator explicitly grants one time-limited attempt; the provider
-- and the exact matching phone must already have been verified.
create or replace function public.gestlok_chat_admin_whatsapp_piloto(p_id uuid,p_tester text default null,p_accion text default 'autorizar')
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=gestlok_platform.require_admin(); h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 s uuid; v uuid; c gestlok_chat_private.whatsapp_premium_conexiones%rowtype;
begin
 select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p_id for update;
 if not found then raise exception 'Número inexistente' using errcode='22023'; end if;
 if p_accion='cancelar' then
  update gestlok_chat_private.whatsapp_bandeja_pilotos set cancelado=true where habilitacion_id=p_id and not cancelado and vence_at>now();
  return null;
 end if;
 if p_accion<>'autorizar' or not h.habilitada or p_tester is null or p_tester !~ '^\+[1-9][0-9]{7,14}$'
  or gestlok_chat_private.whatsapp_exclusion_key(p_tester)=gestlok_chat_private.whatsapp_exclusion_key(h.numero)
 then raise exception 'Número de prueba inválido o no habilitado' using errcode='22023'; end if;
 select sc.id into s from gestlok_chat_private.sucursales sc join gestlok_chat_private.empresas e using(tenant_id)
   where sc.tenant_id=h.tenant_id and sc.local_id=h.local_id and e.habilitada;
 select * into c from gestlok_chat_private.whatsapp_premium_conexiones where habilitacion_id=p_id;
 if s is null or c.verificado_at is null or c.verificado_at<now()-interval '15 minutes' or c.waba_id is null or c.telefono_proveedor is null
  or not exists(select 1 from public.docs d where d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id)
 then raise exception 'Comprobá el número oficial del comercio antes de autorizar la prueba' using errcode='22023'; end if;
 if public.gestlok_chat_srv_whatsapp_excluido(s,p_tester) then raise exception 'Este contacto está excluido' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.whatsapp_bandeja_pilotos where habilitacion_id=p_id and not cancelado and vence_at>now()) then
  raise exception 'Ya hay una prueba vigente. Cancelala antes de autorizar otra.' using errcode='22023';
 end if;
 insert into gestlok_chat_private.whatsapp_bandeja_pilotos(habilitacion_id,tenant_id,sucursal_id,tester,creado_por)
 values(p_id,h.tenant_id,s,p_tester,a) returning id into v;
 return v;
end$$;
revoke all on function public.gestlok_chat_admin_whatsapp_piloto(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_admin_whatsapp_piloto(uuid,text,text) to authenticated;

-- Read only after the panel has verified the real session and local permission.
create or replace function public.gestlok_chat_panel_whatsapp_bandeja(p_sucursal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 if coalesce(public.mi_rol(),'') not in ('gerente','dueno','creadora') then raise exception 'No tenés permiso para leer WhatsApp' using errcode='42501'; end if;
 return jsonb_build_object('pilotos',coalesce((select jsonb_agg(jsonb_build_object(
  'id',p.id,'numero',h.numero,'cliente',p.tester,'texto',p.cliente_texto,'recibido_at',p.recibido_at,
  'respuesta',p.respuesta_texto,'estado',p.respuesta_estado,'vence_at',p.vence_at,
  'puede_responder',p.recibido_at is not null and p.respuesta_estado is null and p.vence_at>now() and not p.cancelado and h.habilitada
    and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
  ) order by p.creado_at desc) from gestlok_chat_private.whatsapp_bandeja_pilotos p join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=p.habilitacion_id
   where p.sucursal_id=p_sucursal and not p.cancelado and p.vence_at>now()),'[]'::jsonb));
end$$;
revoke all on function public.gestlok_chat_panel_whatsapp_bandeja(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_whatsapp_bandeja(uuid) to authenticated;

-- Only a signature-verified inbound event, scoped to a specific approved
-- test number, can populate the conversation. Deduplicate webhook retries.
create or replace function public.gestlok_chat_srv_whatsapp_piloto_recibir(p_waba text,p_to text,p_from text,p_evento text,p_mensaje text,p_texto text,p_fecha timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare h uuid; v uuid; s uuid;
begin
 if p_evento is null or length(p_evento) not between 1 and 200 or p_mensaje is null or length(p_mensaje) not between 1 and 200
  or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_fecha is null or p_fecha>now()+interval '5 minutes' or p_fecha<now()-interval '2 hours' then return false;end if;
 select x.habilitacion_id into h from gestlok_chat_private.whatsapp_premium_conexiones x
  where x.waba_id=p_waba and x.telefono_proveedor=p_to and x.verificado_at is not null;
 if h is null then return false;end if;
 perform 1 from gestlok_chat_private.whatsapp_premium_habilitaciones where id=h and habilitada for update;
 if not found then return false;end if;
 select p.id,p.sucursal_id into v,s from gestlok_chat_private.whatsapp_bandeja_pilotos p
 join gestlok_chat_private.whatsapp_premium_habilitaciones a on a.id=p.habilitacion_id and a.tenant_id=p.tenant_id
 join gestlok_chat_private.sucursales sc on sc.id=p.sucursal_id and sc.tenant_id=p.tenant_id and sc.local_id=a.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=p.tenant_id and e.habilitada
 where p.habilitacion_id=h and p.tester=p_from and p.vence_at>now() and not p.cancelado and p.creado_at<=p_fecha+interval '5 seconds' and p.recibido_at is null
 and exists(select 1 from public.docs d where d.tenant_id=a.tenant_id and d.col='locales' and d.id=a.local_id)
 for update of p;
 if v is null or public.gestlok_chat_srv_whatsapp_excluido(s,p_from) then return false;end if;
 update gestlok_chat_private.whatsapp_bandeja_pilotos set evento_id=p_evento,mensaje_id=p_mensaje,cliente_texto=p_texto,recibido_at=p_fecha where id=v and recibido_at is null;
 return found;
exception when unique_violation then return false;
end$$;
revoke all on function public.gestlok_chat_srv_whatsapp_piloto_recibir(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_whatsapp_piloto_recibir(text,text,text,text,text,text,timestamptz) to service_role;

-- Confirm local access through the user's JWT, not a browser-supplied role.
-- Returning the server-derived route requires an atomic claim; no retry.
create or replace function public.gestlok_chat_panel_whatsapp_piloto_reservar(p_sucursal uuid,p_id uuid,p_texto text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.whatsapp_bandeja_pilotos%rowtype;
 h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 c gestlok_chat_private.whatsapp_premium_conexiones%rowtype;
begin
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 if coalesce(public.mi_rol(),'') not in ('gerente','dueno','creadora') then raise exception 'No tenés permiso para responder WhatsApp' using errcode='42501'; end if;
 if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 then raise exception 'Escribí una respuesta de hasta 1000 caracteres' using errcode='22023';end if;
 select * into p from gestlok_chat_private.whatsapp_bandeja_pilotos where id=p_id and sucursal_id=p_sucursal;
 if not found then return null;end if;
 select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p.habilitacion_id for update;
 select * into p from gestlok_chat_private.whatsapp_bandeja_pilotos where id=p_id and sucursal_id=p_sucursal for update;
 select * into c from gestlok_chat_private.whatsapp_premium_conexiones where habilitacion_id=h.id;
 if not h.habilitada or h.tenant_id<>p.tenant_id or c.waba_id is null or c.verificado_at is null or c.telefono_proveedor is null
  or p.cancelado or p.vence_at<=now() or p.recibido_at is null or p.recibido_at<now()-interval '24 hours' or p.recibido_at>now()+interval '5 minutes' or p.respuesta_estado is not null
  or public.gestlok_chat_srv_whatsapp_excluido(p_sucursal,p.tester)
  or not exists(select 1 from public.docs d join gestlok_chat_private.sucursales sc on sc.tenant_id=d.tenant_id and sc.local_id=d.id where d.col='locales' and d.tenant_id=h.tenant_id and d.id=h.local_id and sc.id=p_sucursal)
 then return null;end if;
 update gestlok_chat_private.whatsapp_bandeja_pilotos set respuesta_texto=btrim(p_texto),respuesta_por=auth.uid(),respuesta_at=now(),respuesta_estado='procesando' where id=p_id;
 return jsonb_build_object('id',p.id,'from',c.telefono_proveedor,'to',p.tester,'text',btrim(p_texto),'waba',c.waba_id);
end$$;
revoke all on function public.gestlok_chat_panel_whatsapp_piloto_reservar(uuid,uuid,text) from public,anon,authenticated;
-- A direct call by an authorized manager can only consume the single approved
-- slot; the provider credential and the external send exist only in the Edge Function.
grant execute on function public.gestlok_chat_panel_whatsapp_piloto_reservar(uuid,uuid,text) to authenticated;

create or replace function public.gestlok_chat_srv_whatsapp_piloto_validar(p_id uuid)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from gestlok_chat_private.whatsapp_bandeja_pilotos p
 join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=p.habilitacion_id and h.habilitada
 join gestlok_chat_private.whatsapp_premium_conexiones c on c.habilitacion_id=h.id and c.verificado_at is not null
 join gestlok_chat_private.sucursales sc on sc.id=p.sucursal_id and sc.tenant_id=h.tenant_id and sc.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 where p.id=p_id and not p.cancelado and p.vence_at>now() and p.respuesta_estado='procesando'
  and p.recibido_at>now()-interval '24 hours' and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
  and exists(select 1 from public.docs d where d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id))
$$;
revoke all on function public.gestlok_chat_srv_whatsapp_piloto_validar(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_whatsapp_piloto_validar(uuid) to service_role;
create or replace function public.gestlok_chat_srv_whatsapp_piloto_finalizar(p_id uuid,p_estado text,p_proveedor text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_estado not in ('aceptada','bloqueada','error','incierta') or (p_proveedor is not null and (length(p_proveedor)>200 or p_proveedor !~ '^[a-zA-Z0-9_.:-]+$')) then return false;end if;
 update gestlok_chat_private.whatsapp_bandeja_pilotos set respuesta_estado=p_estado,proveedor_id=p_proveedor where id=p_id and respuesta_estado='procesando';
 return found;
end$$;
revoke all on function public.gestlok_chat_srv_whatsapp_piloto_finalizar(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_whatsapp_piloto_finalizar(uuid,text,text) to service_role;
