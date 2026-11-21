-- GESTLOK · base de pruebas (proyecto Supabase aparte). Núcleo mínimo que usa GESTLOK Chat,
-- tomado de tests/fixtures/chat/base.sql sin las emulaciones de auth y storage (Supabase ya los trae)
-- y sin datos. Las empresas y locales de prueba están en semilla.sql.
-- Reproduce lo que la migración usa de Supabase y de GESTLOK con la MISMA lógica que en producción:
-- auth.uid/jwt, empresas (gestlok_tenancy), equipo y locales (public.docs), mi_rol, puede_editar_local,
-- administradora (require_admin) y modo soporte. Datos 100 % ficticios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;






create table public.docs (col text not null, id text not null, data jsonb not null default '{}'::jsonb,
  tenant_id uuid not null, updated_at timestamptz not null default now(),
  updated_by text default (auth.jwt() ->> 'email'), primary key (tenant_id, col, id));

create schema gestlok_tenancy;
create table gestlok_tenancy.tenants (id uuid primary key, code text, created_at timestamptz not null default now());
create table gestlok_tenancy.account_active_tenant (user_id uuid primary key, tenant_id uuid not null, selected_at timestamptz default now());

create schema gestlok_platform;
create table gestlok_platform.admins (user_id uuid primary key references auth.users(id));
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
-- Modo soporte / escritura de la creadora: en producción salen de su sesión de soporte; acá, de ajustes de prueba.
create function gestlok_platform.support_tenant() returns uuid language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from gestlok_platform.admins a where a.user_id = auth.uid())
    then nullif(current_setting('prueba.soporte', true), '')::uuid end $$;
create function gestlok_platform.creator_write_active() returns boolean language sql stable security definer set search_path = '' as $$
  select gestlok_platform.support_tenant() is not null and coalesce(current_setting('prueba.escritura', true), '') = 'on' $$;

create function gestlok_tenancy.verified_role_context_email() returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
     and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')) $$;
create function gestlok_tenancy.current_tenant_id() returns uuid language sql stable security definer set search_path = '' as $$
 select coalesce(
   gestlok_platform.support_tenant(),
   (select a.tenant_id from gestlok_tenancy.account_active_tenant a
      join public.docs e on e.tenant_id = a.tenant_id and e.col = 'equipo'
         and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email()
         and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
      where a.user_id = auth.uid() limit 1),
   (select e.tenant_id from public.docs e
     where e.col = 'equipo' and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email()
       and e.data->>'rol' in ('dueno','gerente','editor','lectura','colaborador','creadora')
     order by case when e.data->>'rol' = 'dueno' then 0 when e.data->>'rol' = 'creadora' then 1 else 2 end, e.updated_at, e.tenant_id
     limit 1)) $$;

-- Copias exactas de producción (public.mi_rol y public.puede_editar_local).
create function public.mi_rol() returns text language sql stable security definer set search_path to '' as $$
 select case when gestlok_platform.creator_write_active() then 'creadora' else coalesce(
  (select d.data->>'rol' from public.docs d
   where d.col = 'equipo' and d.tenant_id = (select gestlok_tenancy.current_tenant_id())
     and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), '')) limit 1),
  case when gestlok_platform.support_tenant() is not null then 'lectura' end) end $$;
create function public.puede_editar_local(p text) returns boolean language sql stable security definer set search_path to '' as $$
 select
 (gestlok_platform.creator_write_active() and exists(select 1 from public.docs l
 where l.col='locales' and l.id=p and l.tenant_id=gestlok_tenancy.current_tenant_id()))
 or exists(select 1 from public.docs l
 join public.docs e on e.col='equipo' and e.tenant_id=l.tenant_id
 where l.col='locales' and l.id=p and l.tenant_id=gestlok_tenancy.current_tenant_id()
 and lower(e.data->>'email')=lower(coalesce(auth.jwt()->>'email',''))
 and (e.data->>'rol' in ('creadora','dueno') or
 (e.data->>'rol' in ('gerente','editor') and coalesce(e.data->'locales','[]'::jsonb) ? p))) $$;
grant usage on schema gestlok_tenancy, gestlok_platform to anon, authenticated, service_role;
grant execute on all functions in schema gestlok_tenancy, gestlok_platform to anon, authenticated, service_role;
grant execute on function public.mi_rol(), public.puede_editar_local(text) to anon, authenticated, service_role;

