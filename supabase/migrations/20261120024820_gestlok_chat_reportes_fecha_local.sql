-- Reporte diario: fecha ISO local en formato YYYY-MM-DD para el panel móvil.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_reporte_diario(p_sucursal uuid, p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_desde date:=(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date
   - (least(greatest(coalesce(p_dias,30),1),90)-1);
begin
 perform gestlok_chat_private.exigir(p_sucursal,'ver');
 return coalesce((select jsonb_agg(jsonb_build_object(
 'fecha',d.fecha::date,'total',coalesce(a.total,0),'retiro',coalesce(a.retiro,0),
 'delivery',coalesce(a.delivery,0),'pendientes',coalesce(a.pendientes,0),
 'confirmados',coalesce(a.confirmados,0),'terminados',coalesce(a.terminados,0),
 'rechazados',coalesce(a.rechazados,0),'cancelados',coalesce(a.cancelados,0),
 'programados',coalesce(a.programados,0),'importe_confirmado',coalesce(a.importe_confirmado,0))
 order by d.fecha desc)
 from generate_series(v_desde,(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date,interval '1 day') d(fecha)
 left join (select (p.creado_at at time zone 'America/Argentina/Buenos_Aires')::date as fecha,
 count(*) total,
 count(*) filter(where p.entrega='retiro') retiro,
 count(*) filter(where p.entrega='envio') delivery,
 count(*) filter(where p.estado='pendiente') pendientes,
 count(*) filter(where p.estado='confirmado') confirmados,
 count(*) filter(where p.estado='terminado') terminados,
 count(*) filter(where p.estado='rechazado') rechazados,
 count(*) filter(where p.estado='cancelado') cancelados,
 count(*) filter(where p.programado_para is not null) programados,
 coalesce(sum(p.total) filter(where p.estado in ('confirmado','terminado')),0) importe_confirmado
 from gestlok_chat_private.pedidos p
 where p.sucursal_id=p_sucursal and p.creado_at>=v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'
 group by 1) a on a.fecha=d.fecha),'[]'::jsonb);
end $function$
;
