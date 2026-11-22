-- Mi Gusto: la dueña consulta únicamente historiales de Conteo cerrados por sucursal.
-- No se copian ni modifican los turnos; Munro y Don Torcuato conservan almacenamiento independiente.
-- La administradora y los gerentes mantienen sus permisos operativos actuales.


create or replace function gestlok_munro_conteo_private.require_access(p_write boolean default false,p_catalog boolean default false)
returns void language plpgsql security definer set search_path='' as $fn$
declare r text;
begin
 if auth.uid() is null
    or gestlok_tenancy.current_tenant_id() is distinct from 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    or not public.puede_ver_local('munro') then
   raise exception 'Sin acceso a Conteo Munro' using errcode='42501';
 end if;
 r:=public.mi_rol();
 if r not in ('creadora','dueno','gerente') then
   raise exception 'Rol no autorizado' using errcode='42501';
 end if;
 if p_write and r='dueno' then
   raise exception 'Los dueños solo pueden consultar historiales de Conteo' using errcode='42501';
 end if;
 if p_write and not public.puede_editar_local('munro') then
   raise exception 'No podés modificar Conteo' using errcode='42501';
 end if;
 if p_catalog then
   if r <> 'creadora' then raise exception 'Solo la administradora puede modificar productos' using errcode='42501'; end if;
   perform gestlok_platform.require_admin();
 end if;
end $fn$;

create or replace function public.gestlok_munro_conteo_history(p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_munro_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date
       and (public.mi_rol()<>'dueno' or s.status='finalizado'
            or (s.day=date '2026-11-14' and s.shift='manana_entrada'))),
    '[]'::jsonb);
end $fn$;

create or replace function public.gestlok_munro_conteo_state(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_munro_conteo_private.products p),'[]'::jsonb),
  -- La pantalla de la dueña usa el catálogo para reconstruir el historial,
  -- pero no recibe el borrador del turno en uso.
  'counts',case when public.mi_rol()='dueno' then '[]'::jsonb
            else coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_munro_conteo_private.shifts s where s.day=d),'[]'::jsonb) end,
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
            (select * from gestlok_munro_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_munro_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $fn$;

-- Conservar el acceso a lectura sólo de sesiones autenticadas.
revoke all on function public.gestlok_munro_conteo_history(date) from public,anon;
grant execute on function public.gestlok_munro_conteo_history(date) to authenticated;
revoke all on function public.gestlok_munro_conteo_state(date) from public,anon;
grant execute on function public.gestlok_munro_conteo_state(date) to authenticated;


create or replace function gestlok_torcuato_conteo_private.require_access(p_write boolean default false,p_catalog boolean default false)
returns void language plpgsql security definer set search_path='' as $fn$
declare r text;
begin
 if auth.uid() is null
    or gestlok_tenancy.current_tenant_id() is distinct from 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    or not public.puede_ver_local('torcuato') then
   raise exception 'Sin acceso a Conteo Don Torcuato' using errcode='42501';
 end if;
 r:=public.mi_rol();
 if r not in ('creadora','dueno','gerente') then
   raise exception 'Rol no autorizado' using errcode='42501';
 end if;
 if p_write and r='dueno' then
   raise exception 'Los dueños solo pueden consultar historiales de Conteo' using errcode='42501';
 end if;
 if p_write and not public.puede_editar_local('torcuato') then
   raise exception 'No podés modificar Conteo' using errcode='42501';
 end if;
 if p_catalog then
   if r <> 'creadora' then raise exception 'Solo la administradora puede modificar productos' using errcode='42501'; end if;
   perform gestlok_platform.require_admin();
 end if;
end $fn$;

create or replace function public.gestlok_torcuato_conteo_history(p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_torcuato_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date
       and (public.mi_rol()<>'dueno' or s.status='finalizado')),
    '[]'::jsonb);
end $fn$;

create or replace function public.gestlok_torcuato_conteo_state(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_torcuato_conteo_private.products p),'[]'::jsonb),
  -- La pantalla de la dueña usa el catálogo para reconstruir el historial,
  -- pero no recibe el borrador del turno en uso.
  'counts',case when public.mi_rol()='dueno' then '[]'::jsonb
            else coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_torcuato_conteo_private.shifts s where s.day=d),'[]'::jsonb) end,
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
            (select * from gestlok_torcuato_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_torcuato_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $fn$;

-- Conservar el acceso a lectura sólo de sesiones autenticadas.
revoke all on function public.gestlok_torcuato_conteo_history(date) from public,anon;
grant execute on function public.gestlok_torcuato_conteo_history(date) to authenticated;
revoke all on function public.gestlok_torcuato_conteo_state(date) from public,anon;
grant execute on function public.gestlok_torcuato_conteo_state(date) to authenticated;
