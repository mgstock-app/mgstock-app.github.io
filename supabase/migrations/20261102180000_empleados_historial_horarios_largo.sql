-- Historial horarios: el dueño busca en todo el historial (pedido de la usuaria del 02/11/2026: «un historial prolijo
-- y fácil de buscar»). Se devuelven hasta 520 semanas (10 años) en vez de 60. Mismo control de acceso que antes
-- (dueño, creadora y gerentes del local). Solo reemplaza la función; no toca datos.
create or replace function public.rm_horarios_historial(p_local text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rm_test_private.horarios_puede_ver(p_local) then
    raise exception 'No tenés acceso al historial de horarios de este local' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'desde', s.semana_desde, 'hasta', s.semana_hasta, 'filas', s.filas,
        'recibido_at', s.recibido_at, 'actualizaciones', s.actualizaciones,
        'pagos', coalesce((select jsonb_object_agg(p.colaborador, jsonb_build_object('pagado', p.pagado, 'marcado_at', p.marcado_at))
                           from rm_test_private.horarios_pagos p
                           where p.local_id = s.local_id and p.semana_desde = s.semana_desde), '{}'::jsonb))
      order by s.semana_desde desc)
    from (select * from rm_test_private.horarios_semanas where local_id = p_local
          order by semana_desde desc limit 520) s), '[]'::jsonb);
end $$;
revoke all on function public.rm_horarios_historial(text) from public, anon;
grant execute on function public.rm_horarios_historial(text) to authenticated;
