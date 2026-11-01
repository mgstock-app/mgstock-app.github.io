-- Base mínima de prueba para la caja diaria (issue #200). Solo para Postgres local, PGlite y CI.
-- Reproduce las funciones reales de sesión de Supabase y GESTLOK que usa la migración
-- (auth.uid/jwt leen request.jwt.claims como en Supabase). Datos 100 % ficticios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text not null, email_confirmed_at timestamptz, created_at timestamptz not null default now());
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;

create table public.docs (
  col text not null, id text not null, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), updated_by text, tenant_id uuid not null,
  primary key (tenant_id, col, id)
);

create schema gestlok_platform;
-- Consulta de soporte de la creadora: en las pruebas se simula con prueba.soporte.
create function gestlok_platform.support_tenant() returns uuid language sql stable as $$
  select nullif(current_setting('prueba.soporte', true), '')::uuid
$$;
create schema gestlok_tenancy;
create function gestlok_tenancy.verified_role_context_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(btrim(u.email)) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and lower(btrim(u.email)) = lower(coalesce(auth.jwt()->>'email', ''))
  limit 1
$$;
create function gestlok_tenancy.current_tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(gestlok_platform.support_tenant(),
    (select e.tenant_id from public.docs e
     where e.col = 'equipo' and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email()
       and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
     order by case when e.data->>'rol' = 'dueno' then 0 when e.data->>'rol' = 'creadora' then 1 else 2 end, e.tenant_id
     limit 1))
$$;
grant usage on schema gestlok_platform, gestlok_tenancy to anon, authenticated;

-- Empresas ficticias: Perfumes (la del pedido), Mi Gusto (no se habilita) y otra empresa.
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-000000000001', 'duena@perfumes.example', now()),
  ('a0000000-0000-4000-8000-000000000002', 'gerente@perfumes.example', now()),
  ('a0000000-0000-4000-8000-000000000003', 'gerente.sinlocal@perfumes.example', now()),
  ('a0000000-0000-4000-8000-000000000004', 'lectura@perfumes.example', now()),
  ('a0000000-0000-4000-8000-000000000005', 'colaborador@perfumes.example', now()),
  ('a0000000-0000-4000-8000-000000000006', 'sinverificar@perfumes.example', null),
  ('b0000000-0000-4000-8000-000000000001', 'dueno@migusto.example', now()),
  ('b0000000-0000-4000-8000-000000000002', 'gerente.munro@migusto.example', now()),
  ('c0000000-0000-4000-8000-000000000001', 'dueno@otra.example', now()),
  ('d0000000-0000-4000-8000-000000000001', 'creadora@gestlok.example', now());

insert into public.docs (tenant_id, col, id, data) values
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'locales', 'loc-2a97bf8d7d084aa7b051', '{"nombre":"Percam"}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'duena@perfumes.example', '{"email":"duena@perfumes.example","rol":"dueno"}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'gerente@perfumes.example', '{"email":"gerente@perfumes.example","rol":"gerente","locales":["loc-2a97bf8d7d084aa7b051"]}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'gerente.sinlocal@perfumes.example', '{"email":"gerente.sinlocal@perfumes.example","rol":"gerente","locales":[]}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'lectura@perfumes.example', '{"email":"lectura@perfumes.example","rol":"lectura","locales":["loc-2a97bf8d7d084aa7b051"]}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'colaborador@perfumes.example', '{"email":"colaborador@perfumes.example","rol":"colaborador"}'),
  ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'equipo', 'sinverificar@perfumes.example', '{"email":"sinverificar@perfumes.example","rol":"dueno"}'),
  ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'locales', 'munro', '{"nombre":"Munro"}'),
  ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'locales', 'torcuato', '{"nombre":"Torcuato"}'),
  ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'equipo', 'dueno@migusto.example', '{"email":"dueno@migusto.example","rol":"dueno"}'),
  ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'equipo', 'gerente.munro@migusto.example', '{"email":"gerente.munro@migusto.example","rol":"gerente","locales":["munro"]}'),
  ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670', 'munro/productos', 'p-001', '{"nombre":"Producto de prueba","stock":3}'),
  ('33333333-3333-4333-8333-333333333333', 'locales', 'otro', '{"nombre":"Otro local"}'),
  ('33333333-3333-4333-8333-333333333333', 'equipo', 'dueno@otra.example', '{"email":"dueno@otra.example","rol":"dueno"}');

-- Utilidades de las pruebas (no existen en producción).
create schema prueba;
grant usage on schema prueba to public;
-- Entra como la cuenta indicada (rol authenticated con su token). NULL = visitante sin sesión.
create function prueba.como(p_email text, p_email_token text default null) returns void language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('role', 'postgres', true);
  if p_email is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    return;
  end if;
  select id into v_id from auth.users where email = p_email;
  if v_id is null then raise exception 'Cuenta de prueba inexistente: %', p_email; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'email', coalesce(p_email_token, p_email), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
-- Ejecuta SQL y devuelve el SQLSTATE del error (NULL si no falló).
create function prueba.error_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;
grant execute on all functions in schema prueba to public;
