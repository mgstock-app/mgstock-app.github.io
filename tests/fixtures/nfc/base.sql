-- Base mínima para probar NFC y QR en PostgreSQL local o CI. Reproduce las funciones de sesión de Supabase
-- (auth.uid/jwt leen request.jwt.claims) y la verificación de administradora de GESTLOK. Datos 100 % ficticios,
-- salvo el correo de la creadora, que es la regla real que exige la migración.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create extension if not exists pgcrypto;

create schema auth;
create table auth.users (id uuid primary key, email text not null, email_confirmed_at timestamptz, created_at timestamptz not null default now());
create function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

create table public.docs (col text not null, id text not null, data jsonb not null default '{}'::jsonb,
  tenant_id uuid not null default gen_random_uuid(), primary key (tenant_id, col, id));

create schema gestlok_platform;
create table gestlok_platform.admins (user_id uuid primary key references auth.users(id), created_at timestamptz not null default now());
create function gestlok_platform.registration_email() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select lower(u.email) into v from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null and lower(u.email) = lower(coalesce(auth.jwt()->>'email', ''));
  if v is null then raise exception 'Sesión no verificada' using errcode = '42501'; end if;
  return v;
end $$;
create function gestlok_platform.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  perform gestlok_platform.registration_email();
  if not exists (select 1 from gestlok_platform.admins a where a.user_id = auth.uid()) then
    raise exception 'Acceso exclusivo de administradora autorizada' using errcode = '42501';
  end if;
  return auth.uid();
end $$;
grant usage on schema gestlok_platform to anon, authenticated;
grant execute on all functions in schema gestlok_platform to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('c0000000-0000-4000-8000-000000000001', 'kmu15lopez@gmail.com', now()),
  ('c0000000-0000-4000-8000-000000000002', 'duena@comercio.example', now()),
  ('c0000000-0000-4000-8000-000000000003', 'otra.admin@example.com', now());
insert into gestlok_platform.admins (user_id) values
  ('c0000000-0000-4000-8000-000000000001'), ('c0000000-0000-4000-8000-000000000003');
insert into public.docs (col, id, data) values ('equipo', 'duena', '{"email":"duena@comercio.example","rol":"dueno"}');
