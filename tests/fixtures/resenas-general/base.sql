-- Base mínima para probar Reseñas general en PostgreSQL local o CI: imita la sesión de Supabase y las funciones de
-- GESTLOK que usa la migración (empresa de la sesión, rol y permiso sobre el local). Datos 100 % ficticios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
create table public.docs (col text not null, id text not null, data jsonb not null default '{}'::jsonb, tenant_id uuid not null, primary key (tenant_id, col, id));
alter table public.docs enable row level security;
create schema gestlok_tenancy;
grant usage on schema gestlok_tenancy to authenticated;
-- Empresa de la sesión: la del equipo donde figura el correo (una sola por cuenta en esta prueba).
create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable security definer set search_path = '' as $$
  select e.tenant_id from public.docs e where e.col = 'equipo' and lower(e.data->>'email') = lower(coalesce(auth.jwt()->>'email', '')) limit 1
$$;
create function public.mi_rol() returns text language sql stable security definer set search_path = '' as $$
  select e.data->>'rol' from public.docs e where e.col = 'equipo' and e.tenant_id = gestlok_tenancy.current_tenant_id()
    and lower(e.data->>'email') = lower(coalesce(auth.jwt()->>'email', '')) limit 1
$$;
create function public.puede_editar_local(p text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.docs l join public.docs e on e.col = 'equipo' and e.tenant_id = l.tenant_id
    where l.col = 'locales' and l.id = p and l.tenant_id = gestlok_tenancy.current_tenant_id()
      and lower(e.data->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
      and (e.data->>'rol' in ('creadora','dueno') or (e.data->>'rol' in ('gerente','editor') and coalesce(e.data->'locales','[]'::jsonb) ? p)))
$$;
grant execute on all functions in schema public, gestlok_tenancy to authenticated, anon;
-- Empresa A (habilitada), empresa B (habilitada), empresa C (sin habilitar) y Mi Gusto (nunca).
insert into public.docs (tenant_id, col, id, data) values
 ('aaaaaaaa-0000-4000-8000-000000000001','locales','centro','{"nombre":"Centro","orden":1}'),
 ('aaaaaaaa-0000-4000-8000-000000000001','locales','norte','{"nombre":"Norte","orden":2}'),
 ('aaaaaaaa-0000-4000-8000-000000000001','equipo','1','{"email":"duena.a@example.com","rol":"dueno"}'),
 ('aaaaaaaa-0000-4000-8000-000000000001','equipo','2','{"email":"gerente.a@example.com","rol":"gerente","locales":["centro"]}'),
 ('aaaaaaaa-0000-4000-8000-000000000001','equipo','3','{"email":"lectura.a@example.com","rol":"lectura","locales":["centro"]}'),
 ('bbbbbbbb-0000-4000-8000-000000000001','locales','centro','{"nombre":"Centro B"}'),
 ('bbbbbbbb-0000-4000-8000-000000000001','equipo','1','{"email":"duena.b@example.com","rol":"dueno"}'),
 ('cccccccc-0000-4000-8000-000000000001','locales','unico','{"nombre":"Único"}'),
 ('cccccccc-0000-4000-8000-000000000001','equipo','1','{"email":"duena.c@example.com","rol":"dueno"}'),
 ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670','locales','munro','{"nombre":"Munro"}'),
 ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670','equipo','1','{"email":"duena.mg@example.com","rol":"dueno"}');
create schema prueba;
grant usage on schema prueba to public;
create function prueba.como(p_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  if p_email is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('role', 'anon', true); return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', md5(p_email)::uuid, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function prueba.error_de(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on all functions in schema prueba to public;
