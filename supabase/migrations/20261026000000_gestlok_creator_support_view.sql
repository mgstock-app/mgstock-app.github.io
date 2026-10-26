-- Creadora: navegar otras empresas en SOLO LECTURA, con motivo, tiempo limitado y auditoría.
-- Mientras hay una sesión de soporte vigente, la creadora (y solo ella, verificada por correo) ve la
-- empresa elegida con el rol «lectura»: no puede escribir. Al vencer o cerrar, vuelve a su empresa.
-- No modifica datos de ninguna empresa.

create table if not exists gestlok_platform.creator_support_sessions(
  id bigint generated always as identity primary key,
  user_id uuid not null,
  tenant_id uuid not null,
  reason text not null check (length(reason) between 3 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists creator_support_sessions_active
  on gestlok_platform.creator_support_sessions(user_id, expires_at desc);
alter table gestlok_platform.creator_support_sessions enable row level security;
revoke all on gestlok_platform.creator_support_sessions from public, anon, authenticated;

-- Empresa en soporte vigente de quien consulta (null si no hay, o si no es administradora verificada).
create or replace function gestlok_platform.support_tenant()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.tenant_id
  from gestlok_platform.creator_support_sessions s
  where s.user_id = auth.uid() and s.revoked_at is null and s.expires_at > now()
    and exists (select 1 from gestlok_platform.admins a where a.user_id = auth.uid())
    and exists (select 1 from auth.users u
                where u.id = auth.uid() and u.email_confirmed_at is not null
                  and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')))
  order by s.id desc limit 1
$$;
revoke all on function gestlok_platform.support_tenant() from public, anon;
grant execute on function gestlok_platform.support_tenant() to authenticated;

-- Empresa activa: la de soporte si hay sesión; si no, la de siempre.
create or replace function gestlok_tenancy.current_tenant_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    gestlok_platform.support_tenant(),
    (select case when count(distinct d.tenant_id) = 1 then (array_agg(d.tenant_id))[1] else null::uuid end
     from public.docs d
     where d.col = 'equipo'
       and (select auth.uid()) is not null
       and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), ''))
       and d.data->>'rol' in ('creadora', 'dueno', 'gerente', 'editor', 'lectura')))
$$;

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(
  (select d.data->>'rol' from public.docs d
   where d.col = 'equipo' and d.tenant_id = (select gestlok_tenancy.current_tenant_id())
     and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), '')) limit 1),
  case when gestlok_platform.support_tenant() is not null then 'lectura' end) $$;

create or replace function public.mi_acceso()
returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(
  (select jsonb_build_object('rol', d.data->>'rol',
     'locales', case when d.data->>'rol' in ('creadora', 'dueno') then
         coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
                   where l.col = 'locales' and l.tenant_id = d.tenant_id), '[]'::jsonb)
       else coalesce(d.data->'locales', '[]'::jsonb) end,
     'tenant_id', d.tenant_id)
   from public.docs d
   where d.col = 'equipo' and d.tenant_id = (select gestlok_tenancy.current_tenant_id())
     and lower(d.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), '')) limit 1),
  (select jsonb_build_object('rol', 'lectura', 'tenant_id', s.t, 'support', true,
     'locales', coalesce((select jsonb_agg(l.id order by l.id) from public.docs l
                          where l.col = 'locales' and l.tenant_id = s.t), '[]'::jsonb))
   from (select gestlok_platform.support_tenant() as t) s where s.t is not null)) $$;

create or replace function public.puede_ver_local(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.docs l
    join public.docs e on e.col = 'equipo' and e.tenant_id = l.tenant_id
  where l.col = 'locales' and l.id = p and l.tenant_id = (select gestlok_tenancy.current_tenant_id())
    and lower(e.data->>'email') = lower(coalesce((select auth.jwt()->>'email'), ''))
    and (e.data->>'rol' in ('creadora', 'dueno') or coalesce(e.data->'locales', '[]'::jsonb) ? p))
  or (gestlok_platform.support_tenant() is not null and exists (select 1 from public.docs l
    where l.col = 'locales' and l.id = p and l.tenant_id = gestlok_platform.support_tenant())) $$;

-- Abrir una empresa en soporte (solo lectura). Registra motivo y duración.
create or replace function public.gestlok_creator_open_company(p_tenant uuid, p_reason text, p_minutes integer default 30)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_admin uuid := gestlok_platform.require_admin(); v_exp timestamptz;
        v_reason text := btrim(coalesce(p_reason, '')); v_own uuid; v_name text;
begin
  if p_minutes is null or p_minutes < 5 or p_minutes > 60 then raise exception 'Duración inválida' using errcode = '22023'; end if;
  if length(v_reason) < 3 or length(v_reason) > 200 then raise exception 'Indicá el motivo de la consulta' using errcode = '22023'; end if;
  if not exists (select 1 from gestlok_tenancy.tenants t where t.id = p_tenant) then raise exception 'Empresa inexistente' using errcode = '22023'; end if;
  select e.tenant_id into v_own from public.docs e
   where e.col = 'equipo' and e.data->>'rol' = 'creadora'
     and lower(e.data->>'email') = lower(coalesce(auth.jwt()->>'email', '')) limit 1;
  if p_tenant = v_own then raise exception 'Ya estás en tu propia empresa' using errcode = '22023'; end if;
  update gestlok_platform.creator_support_sessions set revoked_at = now()
   where user_id = v_admin and revoked_at is null and expires_at > now();
  v_exp := now() + make_interval(mins => p_minutes);
  insert into gestlok_platform.creator_support_sessions(user_id, tenant_id, reason, expires_at)
  values (v_admin, p_tenant, v_reason, v_exp);
  insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
  values (v_admin, 'support_view_opened', p_tenant, jsonb_build_object('minutes', p_minutes, 'reason', v_reason, 'mode', 'read_only'));
  select c.name into v_name from gestlok_platform.companies c where c.tenant_id = p_tenant;
  return jsonb_build_object('active', true, 'tenant_id', p_tenant, 'name', coalesce(v_name, 'Empresa'), 'expires_at', v_exp);
end $$;

create or replace function public.gestlok_creator_close_company()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_admin uuid := gestlok_platform.require_admin(); v_t uuid;
begin
  select tenant_id into v_t from gestlok_platform.creator_support_sessions
   where user_id = v_admin and revoked_at is null and expires_at > now() order by id desc limit 1;
  update gestlok_platform.creator_support_sessions set revoked_at = now()
   where user_id = v_admin and revoked_at is null and expires_at > now();
  if v_t is not null then
    insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
    values (v_admin, 'support_view_closed', v_t, '{}'::jsonb);
  end if;
  return jsonb_build_object('active', false);
end $$;

create or replace function public.gestlok_creator_support_state()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_admin uuid := gestlok_platform.require_admin(); s record; v_name text;
begin
  select * into s from gestlok_platform.creator_support_sessions
   where user_id = v_admin and revoked_at is null and expires_at > now() order by id desc limit 1;
  if s.id is null then return jsonb_build_object('active', false); end if;
  select c.name into v_name from gestlok_platform.companies c where c.tenant_id = s.tenant_id;
  return jsonb_build_object('active', true, 'tenant_id', s.tenant_id, 'name', coalesce(v_name, 'Empresa'), 'expires_at', s.expires_at);
end $$;

revoke all on function public.gestlok_creator_open_company(uuid, text, integer) from public, anon;
revoke all on function public.gestlok_creator_close_company() from public, anon;
revoke all on function public.gestlok_creator_support_state() from public, anon;
grant execute on function public.gestlok_creator_open_company(uuid, text, integer) to authenticated;
grant execute on function public.gestlok_creator_close_company() to authenticated;
grant execute on function public.gestlok_creator_support_state() to authenticated;
