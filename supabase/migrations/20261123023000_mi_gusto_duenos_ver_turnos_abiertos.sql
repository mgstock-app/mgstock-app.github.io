-- Mi Gusto · Visibilidad de los turnos abiertos, Munro y Don Torcuato.
-- Únicamente RPC de lectura. No se modifican registros ni permisos de escritura.
-- require_access(false,false) conserva autenticación, tenant y local autorizados.

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_history(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_munro_conteo_private.pack_rate_snapshots ps where ps.day=s.day and ps.shift=s.shift),'{}'::jsonb)) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_munro_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date),
    '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_state(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'position',c.position) order by c.position,c.name)
                     from gestlok_munro_conteo_private.categories c),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_munro_conteo_private.products p),'[]'::jsonb),
  -- La dueña ve también las cantidades del turno abierto; sigue sin poder editar.
  'counts',coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_munro_conteo_private.shifts s where s.day=d),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_munro_conteo_private.pack_rate_snapshots ps where ps.day=q.day and ps.shift=q.shift),'{}'::jsonb)) order by q.day desc,q.shift) from
            (select * from gestlok_munro_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_munro_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_history(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 if p_month is null
   or p_month < date '2025-01-01'
   or p_month <> date_trunc('month',p_month::timestamp)::date
   or p_month > date_trunc('month',(now() at time zone 'America/Argentina/Buenos_Aires'))::date
 then raise exception 'Mes del historial no válido'; end if;
 return coalesce(
    (select jsonb_agg(to_jsonb(s)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_torcuato_conteo_private.pack_rate_snapshots ps where ps.day=s.day and ps.shift=s.shift),'{}'::jsonb)) order by s.day desc,
        case s.shift when 'manana_entrada' then 1 when 'manana_salida' then 2 else 3 end)
     from gestlok_torcuato_conteo_private.shifts s
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date),
    '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_torcuato_conteo_state(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_torcuato_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'categories',coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'position',c.position) order by c.position,c.name)
                     from gestlok_torcuato_conteo_private.categories c),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_torcuato_conteo_private.products p),'[]'::jsonb),
  -- La dueña ve también las cantidades del turno abierto; sigue sin poder editar.
  'counts',coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
              from gestlok_torcuato_conteo_private.shifts s where s.day=d),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('pack_rates',coalesce((select jsonb_object_agg(ps.product_id,ps.units_per_pack) from gestlok_torcuato_conteo_private.pack_rate_snapshots ps where ps.day=q.day and ps.shift=q.shift),'{}'::jsonb)) order by q.day desc,q.shift) from
            (select * from gestlok_torcuato_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_torcuato_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $function$;

-- Evitar lectura anónima. Estos grants no amplían acceso a otros locales.
revoke all on function public.gestlok_munro_conteo_history(date) from public, anon;
grant execute on function public.gestlok_munro_conteo_history(date) to authenticated;
revoke all on function public.gestlok_munro_conteo_state(date) from public, anon;
grant execute on function public.gestlok_munro_conteo_state(date) to authenticated;
revoke all on function public.gestlok_torcuato_conteo_history(date) from public, anon;
grant execute on function public.gestlok_torcuato_conteo_history(date) to authenticated;
revoke all on function public.gestlok_torcuato_conteo_state(date) from public, anon;
grant execute on function public.gestlok_torcuato_conteo_state(date) to authenticated;
