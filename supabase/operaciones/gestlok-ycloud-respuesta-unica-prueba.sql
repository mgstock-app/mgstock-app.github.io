-- Operación exclusiva de la base aislada Prueba. Sin datos de clientes ni credenciales.
do $$begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control')
   or not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private'
    and table_name='pedidos' and column_name='es_prueba' and column_default='true')
 then raise exception 'Solo Gestlok Prueba'; end if;
end$$;
create table if not exists gestlok_ycloud_pilot_private.one_reply_approval (
 id uuid primary key default gen_random_uuid(),
 marker text not null unique check(marker ~ '^GESTLOK PRUEBA [A-F0-9]{8}$'),
 route_key text not null check(route_key ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 claimed_at timestamptz,
 event_key text unique check(event_key ~ '^[0-9a-f]{64}$'),
 status text not null default 'armed' check(status in ('armed','claimed','accepted','blocked','error','unknown')),
 http_status integer,
 provider_id text,
 check(expires_at>created_at and expires_at<=created_at+interval '2 hours')
);
alter table gestlok_ycloud_pilot_private.one_reply_approval enable row level security;
revoke all on gestlok_ycloud_pilot_private.one_reply_approval from public,anon,authenticated,service_role;
grant select,update on gestlok_ycloud_pilot_private.one_reply_approval to service_role;
create or replace function public.gestlok_ycloud_one_reply_claim(p_marker text,p_route_key text,p_event_key text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if p_event_key is null or p_event_key !~ '^[0-9a-f]{64}$' then return null; end if;
 update gestlok_ycloud_pilot_private.one_reply_approval
 set status='claimed',claimed_at=clock_timestamp(),event_key=p_event_key
 where marker=p_marker and route_key=p_route_key and status='armed'
   and created_at<=clock_timestamp() and expires_at>clock_timestamp()
 returning id into v_id;
 return v_id;
exception when unique_violation then return null;
end$$;
revoke all on function public.gestlok_ycloud_one_reply_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_ycloud_one_reply_claim(text,text,text) to service_role;
create or replace function public.gestlok_ycloud_one_reply_finish(p_id uuid,p_state text,p_http integer,p_provider_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('accepted','blocked','error','unknown') or (p_http is not null and p_http not between 100 and 599)
  or (p_provider_id is not null and (length(p_provider_id)>200 or p_provider_id !~ '^[A-Za-z0-9_.:-]+$')) then return false; end if;
 update gestlok_ycloud_pilot_private.one_reply_approval
 set status=p_state,http_status=p_http,provider_id=p_provider_id
 where id=p_id and status='claimed';
 return found;
end$$;
revoke all on function public.gestlok_ycloud_one_reply_finish(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.gestlok_ycloud_one_reply_finish(uuid,text,integer,text) to service_role;
