-- Historial por fecha de Conteo, Mi Gusto Munro.
-- Incluye tanto borradores como turnos finalizados del mes, sin inventar horarios ni conteos.
-- Solo acceden creadora, dueños y gerentes autorizados por require_access.
create or replace function public.gestlok_munro_conteo_history(p_month date)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
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
     where s.day>=p_month and s.day<(p_month+interval '1 month')::date),
    '[]'::jsonb);
end $$;
revoke all on function public.gestlok_munro_conteo_history(date) from public,anon;
grant execute on function public.gestlok_munro_conteo_history(date) to authenticated;