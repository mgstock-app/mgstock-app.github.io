-- ONLY isolated GESTLOK Pruebas. Do not put this operation in the production
-- migration stream. All orders in this project must be marked fictitious.
do $guard$
begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control') or
    not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private' and table_name='pedidos' and column_name='es_prueba' and column_default='true') then
   raise exception 'Solo se permite instalar en Pruebas';
 end if;
end $guard$;

create schema if not exists gestlok_ycloud_pilot_private;
revoke all on schema gestlok_ycloud_pilot_private from public,anon,authenticated;
grant usage on schema gestlok_ycloud_pilot_private to service_role;
create table if not exists gestlok_ycloud_pilot_private.sessions (
 scope text primary key check (scope ~ '^[0-9a-f]{64}$'),
 sucursal uuid not null,
 revision integer not null default 0 check(revision>=0),
 state jsonb check(state is null or (jsonb_typeof(state)='object' and pg_column_size(state)<100000)),
 updated_at timestamptz not null default now()
);
create table if not exists gestlok_ycloud_pilot_private.events (
 scope text not null references gestlok_ycloud_pilot_private.sessions(scope) on delete cascade,
 event_id text not null check(length(event_id) between 1 and 200),
 message_id text not null check(length(message_id) between 1 and 200),
 wamid text check(wamid is null or length(wamid) between 1 and 200),
 reply jsonb not null check(jsonb_typeof(reply)='array' and pg_column_size(reply)<100000),
 order_code text,
 created_at timestamptz not null default now(),
 primary key(scope,event_id), unique(scope,message_id), unique(scope,wamid)
);
alter table gestlok_ycloud_pilot_private.sessions enable row level security;
alter table gestlok_ycloud_pilot_private.events enable row level security;
revoke all on all tables in schema gestlok_ycloud_pilot_private from public,anon,authenticated;
grant select,insert,update on gestlok_ycloud_pilot_private.sessions to service_role;
grant select,insert on gestlok_ycloud_pilot_private.events to service_role;

-- Only the trusted server is granted these two invoker functions. The caller
-- must verify the provider signature and choose the server-side route BEFORE use.
create or replace function public.gestlok_ycloud_pilot_load(p_slug text,p_sucursal uuid,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb; x gestlok_ycloud_pilot_private.sessions;
begin
 if p_scope is null or p_scope !~ '^[0-9a-f]{64}$' then raise exception 'Identidad inválida'; end if;
 s:=public.gestlok_chat_srv_sucursal(p_slug);
 if (s->>'ok') is distinct from 'true' or s->>'id' is distinct from p_sucursal::text then raise exception 'Sucursal no habilitada'; end if;
 select * into x from gestlok_ycloud_pilot_private.sessions where scope=p_scope;
 if x.scope is not null and x.sucursal<>p_sucursal then raise exception 'Sesión de otra sucursal' using errcode='42501'; end if;
 return jsonb_build_object('revision',coalesce(x.revision,0),'state',x.state,'sucursal',s->'sucursal','catalogo',s->'catalogo','privado',s->'privado');
end $$;
revoke all on function public.gestlok_ycloud_pilot_load(text,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_ycloud_pilot_load(text,uuid,text) to service_role;

create or replace function public.gestlok_ycloud_pilot_commit(
 p_slug text,p_sucursal uuid,p_scope text,p_revision integer,p_event text,p_message text,p_wamid text,
 p_state jsonb,p_cliente text,p_reply jsonb,p_order jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare x gestlok_ycloud_pilot_private.sessions; s jsonb; c jsonb; order_result jsonb; order_code text; h bytea;
begin
 if p_scope is null or p_scope !~ '^[0-9a-f]{64}$' or p_revision is null or p_revision<0 then raise exception 'Identidad inválida'; end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or jsonb_typeof(p_state->'engine') is distinct from 'object'
   or jsonb_typeof(p_reply) is distinct from 'array' or pg_column_size(p_state)>=100000 or pg_column_size(p_reply)>=100000
   or p_event is null or length(p_event) not between 1 and 200 or p_message is null or length(p_message) not between 1 and 200
   or (p_wamid is not null and length(p_wamid) not between 1 and 200) then raise exception 'Turno inválido'; end if;
 s:=public.gestlok_chat_srv_sucursal(p_slug);
 if (s->>'ok') is distinct from 'true' or s->>'id' is distinct from p_sucursal::text then raise exception 'Sucursal no habilitada'; end if;
 insert into gestlok_ycloud_pilot_private.sessions(scope,sucursal) values(p_scope,p_sucursal) on conflict(scope) do nothing;
 select * into x from gestlok_ycloud_pilot_private.sessions where scope=p_scope for update;
 if x.sucursal<>p_sucursal then raise exception 'Sesión de otra sucursal' using errcode='42501'; end if;
 if exists(select 1 from gestlok_ycloud_pilot_private.events where scope=p_scope and (event_id=p_event or message_id=p_message or (p_wamid is not null and wamid=p_wamid))) then
   return jsonb_build_object('status','duplicate');
 end if;
 if x.revision<>p_revision then return jsonb_build_object('status','conflict'); end if;
 if p_order is not null then
   if x.state->>'stage' is distinct from 'confirm' or p_state->>'stage' is distinct from 'submitted' then raise exception 'Falta revisión previa del cliente'; end if;
   -- Reuse the real manager-managed order pipeline, never direct INSERT or confirmation.
   h:=decode(p_scope,'hex');
   c:=public.gestlok_chat_srv_conversacion(p_sucursal,h,'wa:'||left(p_scope,60));
   perform public.gestlok_chat_srv_turno((c->>'id')::uuid,h,'wa:'||left(p_scope,60),p_cliente,'Solicitud ficticia de WhatsApp',p_state->'engine');
   order_result:=public.gestlok_chat_srv_pedido((c->>'id')::uuid,h,p_order);
   order_code:=order_result->'pedido'->>'codigo';
   if order_code is null then raise exception 'Pedido no registrado'; end if;
 end if;
 insert into gestlok_ycloud_pilot_private.events(scope,event_id,message_id,wamid,reply,order_code)
 values(p_scope,p_event,p_message,p_wamid,p_reply,order_code);
 update gestlok_ycloud_pilot_private.sessions set state=p_state,revision=revision+1,updated_at=now() where scope=p_scope;
 return jsonb_build_object('status','committed','revision',x.revision+1,'order_code',order_code);
end $$;
revoke all on function public.gestlok_ycloud_pilot_commit(text,uuid,text,integer,text,text,text,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_ycloud_pilot_commit(text,uuid,text,integer,text,text,text,jsonb,text,jsonb,jsonb) to service_role;
