-- ZAYRO · Mis Productos: conexión a la IA gratuita de fotos (Cloudflare Workers AI).
-- Migración aditiva. No toca stock, caja, ventas, Mi Gusto, El Molino ni otras empresas.
-- El token se guarda en Vault y SOLO lo lee la función gestlok-cami-foto-ia (service_role).
-- Sin sentencias de borrado: «quitar conexión» la desactiva y pisa el secreto.
create schema if not exists gestlok_cami_ai_private;
revoke all on schema gestlok_cami_ai_private from public,anon,authenticated;

create table if not exists gestlok_cami_ai_private.conexion(
 id boolean primary key default true check (id),
 account_id text not null check (account_id ~ '^[0-9a-f]{32}$'),
 token_secret_id uuid not null,
 activa boolean not null default true,
 connected_at timestamptz not null default now(),
 connected_by uuid
);
-- Cupo de Cloudflare: se renueva 00:00 UTC (21:00 en Argentina).
create table if not exists gestlok_cami_ai_private.uso_diario(
 dia date primary key,
 ediciones integer not null default 0 check (ediciones>=0),
 fallos integer not null default 0 check (fallos>=0),
 ultimo_error text check (ultimo_error is null or char_length(ultimo_error)<=300),
 updated_at timestamptz not null default now()
);
alter table gestlok_cami_ai_private.conexion enable row level security;
alter table gestlok_cami_ai_private.uso_diario enable row level security;
revoke all on all tables in schema gestlok_cami_ai_private from public,anon,authenticated;

create or replace function public.gestlok_cami_foto_ia_guardar(p_account text,p_token text,p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_account text:=lower(btrim(coalesce(p_account,''))); v_token text:=btrim(coalesce(p_token,''));
begin
 if v_account !~ '^[0-9a-f]{32}$' then raise exception 'Account ID inválido'; end if;
 if char_length(v_token)<20 or char_length(v_token)>200 or v_token ~ '\s' then raise exception 'Token inválido'; end if;
 select s.id into v_id from vault.secrets s where s.name='gestlok_cami_foto_ia_cloudflare_token';
 if v_id is null then
  v_id:=vault.create_secret(v_token,'gestlok_cami_foto_ia_cloudflare_token','ZAYRO · Mis Productos · token de Cloudflare Workers AI');
 else
  perform vault.update_secret(v_id,v_token);
 end if;
 insert into gestlok_cami_ai_private.conexion(id,account_id,token_secret_id,activa,connected_at,connected_by)
 values(true,v_account,v_id,true,now(),p_user)
 on conflict(id) do update set account_id=excluded.account_id,token_secret_id=excluded.token_secret_id,
  activa=true,connected_at=now(),connected_by=excluded.connected_by;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.gestlok_cami_foto_ia_credenciales()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('account_id',c.account_id,
  'token',(select d.decrypted_secret from vault.decrypted_secrets d where d.id=c.token_secret_id))
 from gestlok_cami_ai_private.conexion c where c.id and c.activa;
$$;

create or replace function public.gestlok_cami_foto_ia_estado()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'connected',coalesce((select c.activa from gestlok_cami_ai_private.conexion c where c.id),false),
  'account_hint',(select right(c.account_id,4) from gestlok_cami_ai_private.conexion c where c.id and c.activa),
  'connected_at',(select c.connected_at from gestlok_cami_ai_private.conexion c where c.id and c.activa),
  'hoy',coalesce((select u.ediciones from gestlok_cami_ai_private.uso_diario u where u.dia=(now() at time zone 'utc')::date),0),
  'ultimo_error',(select u.ultimo_error from gestlok_cami_ai_private.uso_diario u where u.dia=(now() at time zone 'utc')::date)
 );
$$;

create or replace function public.gestlok_cami_foto_ia_quitar()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 select c.token_secret_id into v_id from gestlok_cami_ai_private.conexion c where c.id;
 if v_id is not null then perform vault.update_secret(v_id,'revocado-'||gen_random_uuid()::text); end if;
 update gestlok_cami_ai_private.conexion set activa=false where id;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.gestlok_cami_foto_ia_registrar(p_ok boolean,p_error text default null)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_total integer;
begin
 insert into gestlok_cami_ai_private.uso_diario(dia,ediciones,fallos,ultimo_error,updated_at)
 values((now() at time zone 'utc')::date,case when p_ok then 1 else 0 end,case when p_ok then 0 else 1 end,
  case when p_ok then null else left(p_error,300) end,now())
 on conflict(dia) do update set
  ediciones=gestlok_cami_ai_private.uso_diario.ediciones+case when p_ok then 1 else 0 end,
  fallos=gestlok_cami_ai_private.uso_diario.fallos+case when p_ok then 0 else 1 end,
  ultimo_error=case when p_ok then gestlok_cami_ai_private.uso_diario.ultimo_error else left(p_error,300) end,
  updated_at=now()
 returning ediciones into v_total;
 return v_total;
end $$;

revoke all on function public.gestlok_cami_foto_ia_guardar(text,text,uuid) from public,anon,authenticated;
revoke all on function public.gestlok_cami_foto_ia_credenciales() from public,anon,authenticated;
revoke all on function public.gestlok_cami_foto_ia_estado() from public,anon,authenticated;
revoke all on function public.gestlok_cami_foto_ia_quitar() from public,anon,authenticated;
revoke all on function public.gestlok_cami_foto_ia_registrar(boolean,text) from public,anon,authenticated;
grant execute on function public.gestlok_cami_foto_ia_guardar(text,text,uuid) to service_role;
grant execute on function public.gestlok_cami_foto_ia_credenciales() to service_role;
grant execute on function public.gestlok_cami_foto_ia_estado() to service_role;
grant execute on function public.gestlok_cami_foto_ia_quitar() to service_role;
grant execute on function public.gestlok_cami_foto_ia_registrar(boolean,text) to service_role;
