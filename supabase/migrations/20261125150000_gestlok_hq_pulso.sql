-- GESTLOK HQ · Pulso de la oficina.
-- Indicadores agregados de GESTLOK Chat y del Conteo de Mi Gusto para que los empleados de HQ
-- comenten, reporten y propongan con datos reales. Solo lectura y exclusivo de la creadora.
-- No devuelve nombres, teléfonos, direcciones, conversaciones ni textos de clientes.
create or replace function gestlok_hq_private.pulso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := gestlok_hq_private.require_creator();
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  desde_hoy timestamptz := (hoy::timestamp at time zone 'America/Argentina/Buenos_Aires');
  desde_7 timestamptz := now() - interval '7 days';
begin
  return jsonb_build_object(
    'generado_at', now(),
    'hoy', hoy,
    'sucursales', coalesce((
      select jsonb_agg(x order by x->>'empresa', x->>'nombre')
      from (
        select jsonb_build_object(
          'slug', s.slug,
          'nombre', s.nombre,
          'empresa', coalesce(e.nombre_publico, ''),
          'habilitada', coalesce(e.habilitada, false),
          'activa', s.activa,
          'ia_activa', s.ia_activa,
          'menu_interactivo', s.menu_interactivo,
          'conv_hoy', (select count(*) from gestlok_chat_private.conversaciones c
                        where c.sucursal_id = s.id and c.creada_at >= desde_hoy),
          'conv_7d', (select count(*) from gestlok_chat_private.conversaciones c
                       where c.sucursal_id = s.id and c.creada_at >= desde_7),
          'ped_hoy', (select count(*) from gestlok_chat_private.pedidos p
                       where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_hoy),
          'ped_7d', (select count(*) from gestlok_chat_private.pedidos p
                      where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7),
          'aceptados_7d', (select count(*) from gestlok_chat_private.pedidos p
                            where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                              and p.estado in ('confirmado', 'terminado')),
          'rechazados_7d', (select count(*) from gestlok_chat_private.pedidos p
                             where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                               and p.estado = 'rechazado'),
          'cancelados_7d', (select count(*) from gestlok_chat_private.pedidos p
                             where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                               and p.estado = 'cancelado'),
          'pendientes', (select count(*) from gestlok_chat_private.pedidos p
                          where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.estado = 'pendiente'
                            and (p.programado_para is null or p.programado_para <= now())),
          'pendiente_max_min', (select floor(extract(epoch from (now() - min(p.creado_at))) / 60)::integer
                                 from gestlok_chat_private.pedidos p
                                 where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.estado = 'pendiente'
                                   and (p.programado_para is null or p.programado_para <= now())),
          'en_preparacion', (select count(*) from gestlok_chat_private.pedidos p
                              where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.estado = 'confirmado'),
          'min_confirmacion_7d', (select round((percentile_cont(0.5) within group (
                                      order by extract(epoch from (p.confirmado_at - p.creado_at)) / 60))::numeric, 1)
                                   from gestlok_chat_private.pedidos p
                                   where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                                     and p.confirmado_at is not null and p.confirmado_at >= p.creado_at),
          'ticket_7d', (select round(avg(p.total))::integer from gestlok_chat_private.pedidos p
                         where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                           and p.estado in ('confirmado', 'terminado')),
          'monto_7d', (select coalesce(sum(p.total), 0)::bigint from gestlok_chat_private.pedidos p
                        where p.sucursal_id = s.id and not coalesce(p.es_prueba, false) and p.creado_at >= desde_7
                          and p.estado in ('confirmado', 'terminado')),
          'ultimo_pedido_at', (select max(p.creado_at) from gestlok_chat_private.pedidos p
                                where p.sucursal_id = s.id and not coalesce(p.es_prueba, false)),
          'reclamos_pendientes', (select count(*) from gestlok_chat_private.reclamos r
                                   where r.sucursal_id = s.id and r.estado = 'pendiente'),
          'productos_activos', (select count(*) from gestlok_chat_private.productos pr
                                 where pr.sucursal_id = s.id and pr.activo),
          'productos_agotados', (select count(*) from gestlok_chat_private.productos pr
                                  where pr.sucursal_id = s.id and pr.activo and not pr.disponible),
          'promos_dia', coalesce((select jsonb_agg(jsonb_build_object(
                                     'nombre', left(coalesce(nullif(btrim(pr.reglas->>'nombre'), ''), pr.nombre), 120),
                                     'cuando', pr.reglas->'cuando') order by pr.orden, pr.nombre)
                                   from gestlok_chat_private.productos pr
                                   where pr.sucursal_id = s.id and pr.activo
                                     and jsonb_typeof(pr.reglas->'cuando') = 'object'), '[]'::jsonb)
        ) as x
        from gestlok_chat_private.sucursales s
        left join gestlok_chat_private.empresas e on e.tenant_id = s.tenant_id
      ) q
    ), '[]'::jsonb),
    'conteo', jsonb_build_object(
      'munro', (select jsonb_build_object(
                  'ultimo_cerrado', max(c.day) filter (where c.status = 'finalizado'),
                  'borrador_hoy', bool_or(c.day = hoy and c.status = 'borrador'),
                  'turnos_7d', count(*) filter (where c.day > hoy - 7),
                  'automaticos_7d', count(*) filter (where c.day > hoy - 7 and coalesce(c.cierre_automatico, false)))
                from gestlok_munro_conteo_private.shifts c),
      'torcuato', (select jsonb_build_object(
                  'ultimo_cerrado', max(c.day) filter (where c.status = 'finalizado'),
                  'borrador_hoy', bool_or(c.day = hoy and c.status = 'borrador'),
                  'turnos_7d', count(*) filter (where c.day > hoy - 7),
                  'automaticos_7d', count(*) filter (where c.day > hoy - 7 and coalesce(c.cierre_automatico, false)))
                from gestlok_torcuato_conteo_private.shifts c)
    )
  );
end $$;

revoke all on function gestlok_hq_private.pulso() from public, anon, authenticated;
grant execute on function gestlok_hq_private.pulso() to authenticated;

create or replace function public.gestlok_hq_pulso() returns jsonb
language sql stable security invoker set search_path = '' as $$ select gestlok_hq_private.pulso() $$;
revoke all on function public.gestlok_hq_pulso() from public, anon, authenticated;
grant execute on function public.gestlok_hq_pulso() to authenticated;
