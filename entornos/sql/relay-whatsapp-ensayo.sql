-- Gestlok PRUEBA exclusivamente. Relay efímero: no contiene teléfonos, credenciales ni texto legible.
create schema if not exists gestlok_ensayo_bridge;
revoke all on schema gestlok_ensayo_bridge from public, anon, authenticated;
create table if not exists gestlok_ensayo_bridge.sessions(
  id uuid primary key, owner_id uuid not null, local_code text not null check(local_code in ('munro','torcuato')),
  key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, active boolean not null default true,
  heartbeat_at timestamptz, cipher_state text, command_id uuid, cipher_command text
);
alter table gestlok_ensayo_bridge.sessions enable row level security;
revoke all on gestlok_ensayo_bridge.sessions from public, anon, authenticated;
-- Dedicated test-only access; allowlist is populated privately, not in Git.
create table if not exists gestlok_ensayo_bridge.allowed_creators(email_hash text primary key check(email_hash ~ '^[a-f0-9]{64}$'), activation_hash text check(activation_hash ~ '^[a-f0-9]{64}$'), activated_user uuid);
alter table gestlok_ensayo_bridge.allowed_creators enable row level security;
revoke all on gestlok_ensayo_bridge.allowed_creators from public,anon,authenticated;
create or replace function gestlok_ensayo_bridge.creator_allowed(u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users a join gestlok_ensayo_bridge.allowed_creators c on c.email_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(lower(btrim(a.email)),'UTF8')),'hex') where a.id=u and c.activated_user=u and a.email_confirmed_at is not null);
$$;
revoke all on function gestlok_ensayo_bridge.creator_allowed(uuid) from public,anon,authenticated;
create or replace function gestlok_ensayo_bridge.panel_impl(p_action text,p_id uuid,p_local text,p_hash text,p_cipher text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r gestlok_ensayo_bridge.sessions%rowtype;
begin
  if u is null or p_id is null then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_action='activate' then
    if p_hash is null or p_hash !~ '^[a-f0-9]{32}$' then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
    update gestlok_ensayo_bridge.allowed_creators c set activated_user=u,activation_hash=null from auth.users a
      where a.id=u and a.email_confirmed_at is not null and c.activated_user is null
        and c.email_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(lower(btrim(a.email)),'UTF8')),'hex')
        and c.activation_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_hash,'UTF8')),'hex');
    if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
    return jsonb_build_object('activated',true);
  end if;
  if not gestlok_ensayo_bridge.creator_allowed(u) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_action='access' then return jsonb_build_object('activated',true); end if;
  update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where active and expires_at<=now();
  if p_action='create' then
    if p_local is null or p_local not in ('munro','torcuato') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Datos de ensayo inválidos'; end if;
    -- Serialize concurrent session creation for the same creator.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(u::text));
    update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where owner_id=u and active;
    insert into gestlok_ensayo_bridge.sessions(id,owner_id,local_code,key_hash,expires_at) values(p_id,u,p_local,p_hash,now()+interval '25 minutes');
  end if;
  select * into r from gestlok_ensayo_bridge.sessions where id=p_id and owner_id=u for update;
  if not found then raise exception 'Sesión de ensayo inexistente' using errcode='42501'; end if;
  if p_action='close' then
    update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where id=r.id returning * into r;
  elsif p_action='command' then
    if not r.active or r.heartbeat_at is null or r.heartbeat_at<now()-interval '15 seconds' or r.command_id is not null or p_cipher is null or length(p_cipher) not between 20 and 5000 then raise exception 'Conector sin disponibilidad'; end if;
    update gestlok_ensayo_bridge.sessions set command_id=gen_random_uuid(),cipher_command=p_cipher where id=r.id returning * into r;
  elsif p_action not in ('create','read') then raise exception 'Acción inválida'; end if;
  return jsonb_build_object('active',r.active,'expires',r.expires_at,'local',r.local_code,'heartbeat',r.heartbeat_at,'state',r.cipher_state,'pending',r.command_id is not null);
end $$;
create or replace function gestlok_ensayo_bridge.device_impl(p_id uuid,p_token text,p_cipher text,p_close boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_ensayo_bridge.sessions%rowtype; result jsonb;
begin
  if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  select * into r from gestlok_ensayo_bridge.sessions where id=p_id and key_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if r.expires_at<=now() or not r.active or coalesce(p_close,false) or not gestlok_ensayo_bridge.creator_allowed(r.owner_id) then
    update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where id=r.id;
    return jsonb_build_object('active',false);
  end if;
  if p_cipher is null or length(p_cipher) not between 20 and 200000 then raise exception 'Estado de ensayo inválido'; end if;
  result:=jsonb_build_object('active',true,'local',r.local_code,'command',r.cipher_command,'command_id',r.command_id,'expires',r.expires_at);
  -- Consume once. No replay or retry on uncertain delivery.
  update gestlok_ensayo_bridge.sessions set heartbeat_at=now(),cipher_state=p_cipher,command_id=null,cipher_command=null where id=r.id;
  return result;
end $$;
revoke all on function gestlok_ensayo_bridge.panel_impl(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function gestlok_ensayo_bridge.device_impl(uuid,text,text,boolean) from public,anon,authenticated;
grant usage on schema gestlok_ensayo_bridge to anon,authenticated;
grant execute on function gestlok_ensayo_bridge.panel_impl(text,uuid,text,text,text) to authenticated;
grant execute on function gestlok_ensayo_bridge.device_impl(uuid,text,text,boolean) to anon;
create or replace function public.gestlok_ensayo_bridge_panel(p_action text,p_id uuid,p_local text default null,p_hash text default null,p_cipher text default null)
returns jsonb language sql security invoker set search_path='' as $$select gestlok_ensayo_bridge.panel_impl(p_action,p_id,p_local,p_hash,p_cipher)$$;
create or replace function public.gestlok_ensayo_bridge_device(p_id uuid,p_token text,p_cipher text,p_close boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select gestlok_ensayo_bridge.device_impl(p_id,p_token,p_cipher,p_close)$$;
revoke all on function public.gestlok_ensayo_bridge_panel(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.gestlok_ensayo_bridge_device(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_ensayo_bridge_panel(text,uuid,text,text,text) to authenticated;
grant execute on function public.gestlok_ensayo_bridge_device(uuid,text,text,boolean) to anon;
