-- Invitación privadamente emitida, de un uso, exclusivamente para el ensayo Prueba.
alter table gestlok_ensayo_bridge.sessions add column if not exists guest_panel_hash text check(guest_panel_hash ~ '^[a-f0-9]{64}$');
create table if not exists gestlok_ensayo_bridge.invites(invite_hash text primary key check(invite_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,redeemed_at timestamptz);
alter table gestlok_ensayo_bridge.invites enable row level security;
revoke all on gestlok_ensayo_bridge.invites from public,anon,authenticated;
create or replace function gestlok_ensayo_bridge.guest_impl(p_action text,p_id uuid,p_token text,p_local text,p_invite text,p_hash text,p_cipher text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_ensayo_bridge.sessions%rowtype; token_hash text;
begin
 if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 token_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex');
 if p_action='create' then
  if p_local is null or p_local not in ('munro','torcuato') or p_invite is null or p_invite !~ '^[a-f0-9]{32}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_hash=token_hash then raise exception 'Datos de ensayo inválidos' using errcode='42501'; end if;
  update gestlok_ensayo_bridge.invites set redeemed_at=now() where invite_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_invite,'UTF8')),'hex') and redeemed_at is null and expires_at>now();
  if not found then raise exception 'Invitación no disponible' using errcode='42501'; end if;
  insert into gestlok_ensayo_bridge.sessions(id,owner_id,local_code,key_hash,guest_panel_hash,expires_at) values(p_id,gen_random_uuid(),p_local,p_hash,token_hash,now()+interval '25 minutes');
 end if;
 select * into r from gestlok_ensayo_bridge.sessions where id=p_id and guest_panel_hash=token_hash for update;
 if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if r.expires_at<=now() or p_action='close' then
  update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where id=r.id returning * into r;
 elsif p_action='command' then
  if not r.active or r.heartbeat_at is null or r.heartbeat_at<now()-interval '15 seconds' or r.command_id is not null or p_cipher is null or length(p_cipher) not between 20 and 5000 then raise exception 'Conector sin disponibilidad'; end if;
  update gestlok_ensayo_bridge.sessions set command_id=gen_random_uuid(),cipher_command=p_cipher where id=r.id returning * into r;
 elsif p_action not in ('create','read') then raise exception 'Acción inválida'; end if;
 return jsonb_build_object('active',r.active,'expires',r.expires_at,'local',r.local_code,'heartbeat',r.heartbeat_at,'state',r.cipher_state,'pending',r.command_id is not null);
end $$;
revoke all on function gestlok_ensayo_bridge.guest_impl(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function gestlok_ensayo_bridge.guest_impl(text,uuid,text,text,text,text,text) to anon;
create or replace function public.gestlok_ensayo_bridge_guest(p_action text,p_id uuid,p_token text,p_local text default null,p_invite text default null,p_hash text default null,p_cipher text default null)
returns jsonb language sql security invoker set search_path='' as $$select gestlok_ensayo_bridge.guest_impl(p_action,p_id,p_token,p_local,p_invite,p_hash,p_cipher)$$;
revoke all on function public.gestlok_ensayo_bridge_guest(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_ensayo_bridge_guest(text,uuid,text,text,text,text,text) to anon;

create or replace function gestlok_ensayo_bridge.device_impl(p_id uuid,p_token text,p_cipher text,p_close boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r gestlok_ensayo_bridge.sessions%rowtype; result jsonb;
begin
  if p_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  select * into r from gestlok_ensayo_bridge.sessions where id=p_id and key_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex') for update;
  if not found then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if r.expires_at<=now() or not r.active or coalesce(p_close,false) or (r.guest_panel_hash is null and not gestlok_ensayo_bridge.creator_allowed(r.owner_id)) then
    update gestlok_ensayo_bridge.sessions set active=false,cipher_state=null,cipher_command=null,command_id=null where id=r.id;
    return jsonb_build_object('active',false);
  end if;
  if p_cipher is null or length(p_cipher) not between 20 and 200000 then raise exception 'Estado de ensayo inválido'; end if;
  result:=jsonb_build_object('active',true,'local',r.local_code,'command',r.cipher_command,'command_id',r.command_id,'expires',r.expires_at);
  -- Consume once. No replay or retry on uncertain delivery.
  update gestlok_ensayo_bridge.sessions set heartbeat_at=now(),cipher_state=p_cipher,command_id=null,cipher_command=null where id=r.id;
  return result;
end $$;
