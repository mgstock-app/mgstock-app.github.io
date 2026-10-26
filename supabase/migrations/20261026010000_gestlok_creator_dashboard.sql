-- Inicio de la creadora: resumen de toda la plataforma (solo lectura, solo agregados y metadatos).
-- Exclusivo de la administradora verificada kmu15lopez@gmail.com. No devuelve recibos, sueldos, hojas
-- ni contenido de las empresas; los correos de otras personas salen abreviados. No modifica datos.

create or replace function public.gestlok_creator_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_admin uuid := gestlok_platform.require_admin();
  v_mail  text := lower(coalesce(auth.jwt()->>'email', ''));
  v_now   timestamptz := now();
  v_week  timestamptz := now() - interval '7 days';
  v_from  timestamptz := now() - interval '30 days';
  v_out   jsonb;
begin
  if v_mail <> 'kmu15lopez@gmail.com'
     or not exists (select 1 from auth.users u
                    where u.id = v_admin and u.email_confirmed_at is not null and lower(u.email) = v_mail) then
    raise exception 'Acceso exclusivo de la creadora' using errcode = '42501';
  end if;

  with t as (
    select x.id, x.created_at,
           coalesce((select c.name from gestlok_platform.companies c where c.tenant_id = x.id),
                    case when exists (select 1 from public.docs e where e.col = 'equipo' and e.tenant_id = x.id
                                      and e.data->>'logoId' = 'mi-gusto') then 'Mi Gusto' end,
                    'Empresa') as name
    from gestlok_tenancy.tenants x
  ),
  people as (
    select d.tenant_id, lower(d.data->>'email') as email, d.data->>'rol' as rol,
           nullif(btrim(d.data->>'nombre'), '') as nombre,
           case when jsonb_typeof(d.data->'agregado') = 'number'
                then to_timestamp((d.data->>'agregado')::numeric / 1000) end as agregado
    from public.docs d
    where d.col = 'equipo' and d.data->>'rol' in ('creadora', 'dueno', 'gerente', 'editor', 'lectura')
  ),
  acct as (
    select p.*, u.last_sign_in_at, (u.id is not null) as has_account, (u.email_confirmed_at is not null) as confirmed
    from people p left join auth.users u on lower(u.email) = p.email
  ),
  dir as (select created_at, status from public.rm_app_directory),
  mods as (select m.tenant_id from gestlok_platform.company_modules m where m.module = 'recibos_personal' and m.enabled),
  pts as (select g as days_ago from unnest(array[30, 25, 20, 15, 10, 5, 0]) g),
  events as (
    select a.at, 'audit'::text as kind, a.action as what, a.tenant_id, null::text as who
    from (select * from gestlok_platform.admin_audit order by at desc limit 8) a
    union all
    select p.last_sign_in_at, 'login', 'login', p.tenant_id,
           coalesce(p.nombre, left(p.email, 3) || '***@' || split_part(p.email, '@', 2))
    from acct p where p.last_sign_in_at is not null
  )
  select jsonb_build_object(
    'scope', 'creator_dashboard',
    'generated_at', v_now,
    'totals', jsonb_build_object(
      'companies', (select count(*) from t),
      'companies_new_week', (select count(*) from t where created_at >= v_week),
      'users', (select count(distinct email) from people),
      'users_with_login', (select count(distinct email) from acct where last_sign_in_at is not null),
      'users_never', (select count(distinct email) from acct where last_sign_in_at is null),
      'users_new_week', (select count(*) from people where agregado >= v_week),
      'locals', (select count(*) from public.docs where col = 'locales'),
      'employees', (select count(*) from dir where status = 'approved'),
      'employees_new_week', (select count(*) from dir where created_at >= v_week),
      'employees_pending', (select count(*) from dir where status <> 'approved'),
      'modules_enabled', (select count(*) from mods),
      'audit', (select count(*) from gestlok_platform.admin_audit)),
    'roles', jsonb_build_object(
      'creadora', (select count(*) from people where rol = 'creadora'),
      'dueno', (select count(*) from people where rol = 'dueno'),
      'gerente', (select count(*) from people where rol = 'gerente'),
      'editor', (select count(*) from people where rol = 'editor'),
      'lectura', (select count(*) from people where rol = 'lectura')),
    'employees_roles', jsonb_build_object(
      'owner', (select count(*) from public.rm_test_members where role = 'owner'),
      'manager', (select count(*) from public.rm_test_members where role = 'manager'),
      'employee', (select count(*) from public.rm_test_members where role = 'employee'),
      'gestlok_gerentes', (select count(*) from people p where p.rol in ('gerente', 'editor')
                            and p.tenant_id in (select tenant_id from mods))),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', (v_now - make_interval(days => s.days_ago))::date,
        'empresas', (select count(*) from t where t.created_at <= v_now - make_interval(days => s.days_ago)),
        'usuarios', (select count(*) from people p where coalesce(p.agregado, v_from) <= v_now - make_interval(days => s.days_ago)),
        'empleados', (select count(*) from dir where dir.created_at <= v_now - make_interval(days => s.days_ago))
      ) order by s.days_ago desc), '[]'::jsonb) from pts s),
    'period', jsonb_build_object(
      'companies', (select count(*) from t where created_at >= v_from),
      'users', (select count(*) from people where agregado >= v_from),
      'employees', (select count(*) from dir where created_at >= v_from),
      'modules', (select count(*) from gestlok_platform.admin_audit where action = 'module_enabled' and at >= v_from)),
    'recent_companies', (select coalesce(jsonb_agg(jsonb_build_object(
        'tenant_id', r.id, 'name', r.name, 'created_at', r.created_at,
        'locals', (select count(*) from public.docs l where l.col = 'locales' and l.tenant_id = r.id),
        'people', (select count(*) from people p where p.tenant_id = r.id),
        'employees_module', exists (select 1 from mods m where m.tenant_id = r.id)
      ) order by r.created_at desc), '[]'::jsonb)
      from (select * from t order by created_at desc limit 5) r),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', e.at, 'kind', e.kind, 'what', e.what, 'who', e.who,
        'company', (select t2.name from t t2 where t2.id = e.tenant_id)
      ) order by e.at desc), '[]'::jsonb)
      from (select * from events order by at desc limit 8) e),
    'system', jsonb_build_object(
      'confirmed_accounts', (select count(distinct email) from acct where confirmed),
      'accounts', (select count(distinct email) from acct where has_account),
      'verified_links', (select count(*) from gestlok_platform.recibonet_links),
      'editing_open', exists (select 1 from gestlok_platform.creator_write_grants g
                              where g.user_id = v_admin and g.revoked_at is null and g.expires_at > v_now),
      'support_open', exists (select 1 from gestlok_platform.creator_support_sessions s
                              where s.user_id = v_admin and s.revoked_at is null and s.expires_at > v_now))
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.gestlok_creator_dashboard() from public, anon;
grant execute on function public.gestlok_creator_dashboard() to authenticated;
