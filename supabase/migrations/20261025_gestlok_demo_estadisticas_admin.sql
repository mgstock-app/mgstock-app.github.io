-- GestLok Demo · etapa 1: estadísticas voluntarias y sin datos identificatorios.
-- La demo permanece ficticia: este esquema guarda SOLO un UUID de sesión aleatorio,
-- las modalidades elegidas y fechas. No guarda correo, IP, teléfono ni productos.
create schema if not exists gestlok_demo;
revoke all on schema gestlok_demo from public, anon, authenticated;

create table if not exists gestlok_demo.visitas (
 sesion_id uuid primary key,
 roles text[] not null default '{}',
 tiendas text[] not null default '{}',
 primera_visita timestamptz not null default now(),
 ultima_visita timestamptz not null default now(),
 constraint demo_roles_validos check (roles <@ array['dueno','gerente']::text[]),
 constraint demo_tiendas_validas check (tiendas <@ array['mercado','nova']::text[])
);
alter table gestlok_demo.visitas enable row level security;
revoke all on gestlok_demo.visitas from public, anon, authenticated;
create index if not exists gestlok_demo_visitas_fecha_idx on gestlok_demo.visitas(primera_visita desc);

-- Única escritura anónima habilitada: registrar una sesión que aceptó estadísticas.
-- SECURITY DEFINER necesario porque la tabla privada no se expone al Data API.
-- Sin SQL dinámico, sin columnas personales, con validación estricta.
create or replace function public.gestlok_demo_registrar(
 p_sesion uuid, p_rol text, p_tienda text
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is not null then return false; end if;
 if p_sesion is null or p_rol not in ('dueno','gerente') or
   p_tienda not in ('mercado','nova') then return false; end if;
 insert into gestlok_demo.visitas(sesion_id,roles,tiendas)
 values(p_sesion,array[p_rol],array[p_tienda])
 on conflict(sesion_id) do update set
  roles=case when gestlok_demo.visitas.roles @> array[excluded.roles[1]]
    then gestlok_demo.visitas.roles else array_append(gestlok_demo.visitas.roles,excluded.roles[1]) end,
  tiendas=case when gestlok_demo.visitas.tiendas @> array[excluded.tiendas[1]]
    then gestlok_demo.visitas.tiendas else array_append(gestlok_demo.visitas.tiendas,excluded.tiendas[1]) end,
  ultima_visita=now();
 return true;
end;
$$;
revoke all on function public.gestlok_demo_registrar(uuid,text,text) from public, anon, authenticated;
grant execute on function public.gestlok_demo_registrar(uuid,text,text) to anon;

-- Lectura privada agregada. Ni dueños ni gerentes ni visitantes pueden consultarla.
create or replace function public.gestlok_demo_resumen()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
 if (select auth.uid()) is null or not coalesce(public.es_creadora(),false) then
  raise exception 'Solo la administradora general puede ver las estadísticas de la demo.'
    using errcode='42501';
 end if;
 select jsonb_build_object(
  'sesiones',count(*),
  'duena',count(*) filter (where 'dueno'=any(roles)),
  'gerente',count(*) filter (where 'gerente'=any(roles)),
  'ambos',count(*) filter (where roles @> array['dueno','gerente']::text[]),
  'mercado',count(*) filter (where 'mercado'=any(tiendas)),
  'nova',count(*) filter (where 'nova'=any(tiendas)),
  'ultimos7',count(*) filter (where primera_visita>=now()-interval '7 days')
 ) into v from gestlok_demo.visitas;
 return v;
end;
$$;
revoke all on function public.gestlok_demo_resumen() from public, anon, authenticated;
grant execute on function public.gestlok_demo_resumen() to authenticated;

comment on table gestlok_demo.visitas is 'Demo pública: sesión aleatoria, roles/tiendas explorados, fechas; solo con consentimiento';
