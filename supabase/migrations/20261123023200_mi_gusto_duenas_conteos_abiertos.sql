-- Dueños de Mi Gusto: consultar turnos abiertos y finalizados de ambas sucursales.
-- require_access conserva tenant, sucursal y rol; ningún permiso de escritura cambia.
-- No se altera ninguna cantidad ni fila existente.

-- gestlok_munro_conteo_history: incluye borradores guardados sin permitir su edición.
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
end $function$
revoke all on function public.gestlok_munro_conteo_history(date) from public,anon;
grant execute on function public.gestlok_munro_conteo_history(date) to authenticated;

-- gestlok_torcuato_conteo_history: incluye borradores guardados sin permitir su edición.
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
end $function$
revoke all on function public.gestlok_torcuato_conteo_history(date) from public,anon;
grant execute on function public.gestlok_torcuato_conteo_history(date) to authenticated;

