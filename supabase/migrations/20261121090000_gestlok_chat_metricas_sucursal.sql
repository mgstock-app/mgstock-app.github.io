-- GESTLOK Chat: indicadores de pedidos por sucursal para el panel interno.
-- Sin datos personales en la respuesta; no se exponen tablas al cliente público.
-- Se consideran pedidos aceptados, no ventas cobradas: GESTLOK Chat no procesa pagos.
create or replace function public.gestlok_chat_panel_metricas(
  p_sucursal uuid, p_dias integer default 30
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'gestionar');
  if p_dias not in (7, 30, 90) then
    raise exception 'Período de reporte inválido' using errcode = '22023';
  end if;

  with base as (
    select p.estado, p.cliente_telefono, p.total, p.items,
           p.creado_at, p.confirmado_at
    from gestlok_chat_private.pedidos p
    where p.sucursal_id = p_sucursal
      and p.creado_at >= now() - make_interval(days => p_dias)
      and not p.es_prueba
  ),
  totales as (
    select count(*) as recibidos,
           count(*) filter (where estado in ('confirmado','terminado')) as aceptados,
           coalesce(sum(total) filter (where estado in ('confirmado','terminado')), 0) as monto,
           round(avg(extract(epoch from (confirmado_at - creado_at)) / 60)
             filter (where confirmado_at is not null and confirmado_at >= creado_at))::integer as minutos
    from base
  ),
  clientes as (
    select count(*) as recurrentes from (
      select cliente_telefono from base
      where estado in ('confirmado','terminado')
      group by cliente_telefono having count(*) >= 2
    ) x
  ),
  productos as (
    select left(btrim(i.item->>'nombre'),120) as nombre,
           sum(case when (i.item->>'cantidad') ~ '^[0-9]{1,3}$'
                    then (i.item->>'cantidad')::integer else 0 end)::bigint as unidades
    from base b
    cross join lateral jsonb_array_elements(b.items) as i(item)
    where b.estado in ('confirmado','terminado')
      and nullif(btrim(i.item->>'nombre'),'') is not null
    group by left(btrim(i.item->>'nombre'),120)
    order by unidades desc, nombre
    limit 5
  )
  select jsonb_build_object(
    'pedidos_recibidos', t.recibidos,
    'pedidos_aceptados', t.aceptados,
    'monto_aceptados', t.monto,
    'tiempo_confirmacion_min', t.minutos,
    'clientes_frecuentes', c.recurrentes,
    'productos_top', coalesce((select jsonb_agg(
      jsonb_build_object('nombre',nombre,'unidades',unidades)
      order by unidades desc, nombre) from productos),'[]'::jsonb)
  )
  into v
  from totales t cross join clientes c;
  return v;
end;
$$;

revoke all on function public.gestlok_chat_panel_metricas(uuid,integer) from public, anon, authenticated;
grant execute on function public.gestlok_chat_panel_metricas(uuid,integer) to authenticated;
