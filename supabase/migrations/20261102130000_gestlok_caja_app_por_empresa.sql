-- GESTLOK Caja por empresa: habilita la app de caja (public/caja/, esquema caja_app) desde el inicio de GESTLOK
-- para las empresas elegidas. Reemplaza a la «Caja diaria» (#200) donde la dueña lo pida.
-- Mismo control de acceso que la caja diaria: membresía verificada, empresa habilitada y rol dueño o
-- gerente/editor con local. No modifica tablas ni funciones existentes (Mi Gusto, docs, Pagos Online, caja diaria).
-- Qué empresas la tienen se decide aparte (supabase/operaciones/gestlok-caja-app-perfumes.sql): esta migración no
-- habilita a nadie.

create table if not exists gestlok_caja_private.caja_app_empresas (
  tenant_id uuid primary key,
  habilitada boolean not null default true,
  habilitada_at timestamptz not null default now(),
  nota text check (nota is null or char_length(nota) <= 200)
);
alter table gestlok_caja_private.caja_app_empresas enable row level security;
revoke all on table gestlok_caja_private.caja_app_empresas from public, anon, authenticated;

-- Empresa de la sesión, solo si tiene GESTLOK Caja y la persona es dueña o gerente/editor con local.
create function gestlok_caja_private.empresa_caja_app() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id
  from (select gestlok_tenancy.current_tenant_id() as id) t
  where auth.uid() is not null and t.id is not null
    and gestlok_platform.support_tenant() is null
    and exists (select 1 from gestlok_caja_private.caja_app_empresas c where c.tenant_id = t.id and c.habilitada)
    and exists (
      select 1 from public.docs e
      where e.col = 'equipo' and e.tenant_id = t.id
        and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email()
        and (e.data->>'rol' = 'dueno'
          or (e.data->>'rol' in ('gerente','editor') and exists (
            select 1 from public.docs l
            where l.col = 'locales' and l.tenant_id = t.id
              and coalesce(e.data->'locales', '[]'::jsonb) ? l.id))))
$$;
revoke all on function gestlok_caja_private.empresa_caja_app() from public, anon, authenticated;

-- Para la tarjeta del inicio: si corresponde, devuelve la dirección de la app y los nombres para precargar el alta.
create function public.gestlok_caja_app_acceso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when x.t is null then jsonb_build_object('habilitada', false)
    else jsonb_build_object('habilitada', true, 'tenant_id', x.t, 'url', '/caja/',
      'locales', coalesce((select jsonb_agg(l.data->>'nombre' order by l.data->>'orden', l.id)
        from public.docs l where l.col = 'locales' and l.tenant_id = x.t and coalesce(l.data->>'nombre', '') <> ''), '[]'::jsonb),
      'yo', (select e.data->>'nombre' from public.docs e
        where e.col = 'equipo' and e.tenant_id = x.t
          and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email() limit 1)) end
  from (select gestlok_caja_private.empresa_caja_app() as t) x
$$;
revoke all on function public.gestlok_caja_app_acceso() from public, anon;
grant execute on function public.gestlok_caja_app_acceso() to authenticated;
