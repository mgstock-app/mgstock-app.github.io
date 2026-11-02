-- Base mínima de prueba para la caja app: reproduce lo que Supabase ya trae (roles, auth.uid(),
-- pgcrypto en el esquema extensions). Solo para Postgres local y CI. Datos ficticios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text not null, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001', 'duena.a@example.com', now()),
  ('b1000000-0000-4000-8000-000000000001', 'duena.b@example.com', now()),
  ('c1000000-0000-4000-8000-000000000001', 'intruso@example.com', now());

create schema prueba;
grant usage on schema prueba to public;
create function prueba.como(p_email text) returns void language plpgsql as $$
declare v uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_email is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    return;
  end if;
  select id into v from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function prueba.error_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on all functions in schema prueba to public;
