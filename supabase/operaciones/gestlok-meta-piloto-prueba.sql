-- SOLO GESTLOK Prueba. Límite absoluto para el número de sandbox de Meta.
do $guard$ begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control') or
 not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private' and table_name='pedidos' and column_name='es_prueba' and column_default='true') then
  raise exception 'Solo se permite instalar en Pruebas';
 end if;
end $guard$;
create schema if not exists gestlok_meta_pilot_private;
revoke all on schema gestlok_meta_pilot_private from public,anon,authenticated;
grant usage on schema gestlok_meta_pilot_private to service_role;
create table if not exists gestlok_meta_pilot_private.attempts (
 event_hash text primary key check(event_hash ~ '^[a-f0-9]{64}$'),
 reserved_at timestamptz not null default now(),
 outcome text not null default 'reserved' check (outcome in ('reserved','accepted','failed','uncertain','excluded','no_reply'))
);
alter table gestlok_meta_pilot_private.attempts enable row level security;
revoke all on table gestlok_meta_pilot_private.attempts from public,anon,authenticated;
grant select,insert,update on table gestlok_meta_pilot_private.attempts to service_role;
create or replace function public.gestlok_meta_pilot_reserve(p_event_hash text)
returns text language plpgsql security invoker set search_path='' as $$
begin
 if p_event_hash is null or p_event_hash !~ '^[a-f0-9]{64}$' then raise exception 'Evento inválido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(1411333342066531);
 if exists(select 1 from gestlok_meta_pilot_private.attempts where event_hash=p_event_hash) then return 'duplicate'; end if;
 if (select count(*) from gestlok_meta_pilot_private.attempts)>=5 then return 'paused'; end if;
 insert into gestlok_meta_pilot_private.attempts(event_hash) values(p_event_hash);
 return 'reserved';
end $$;
revoke all on function public.gestlok_meta_pilot_reserve(text) from public,anon,authenticated;
grant execute on function public.gestlok_meta_pilot_reserve(text) to service_role;
create or replace function public.gestlok_meta_pilot_outcome(p_event_hash text,p_outcome text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_outcome not in ('accepted','failed','uncertain','excluded','no_reply') then raise exception 'Estado inválido'; end if;
 update gestlok_meta_pilot_private.attempts set outcome=p_outcome where event_hash=p_event_hash and outcome='reserved';
 return found;
end $$;
revoke all on function public.gestlok_meta_pilot_outcome(text,text) from public,anon,authenticated;
grant execute on function public.gestlok_meta_pilot_outcome(text,text) to service_role;
