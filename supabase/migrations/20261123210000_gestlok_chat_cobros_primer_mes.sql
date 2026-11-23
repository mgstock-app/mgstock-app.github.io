-- GESTLOK Chat · promo de lanzamiento: el primer mes de la cuota con descuento (15 % por defecto, editable).
-- La suscripción de Mercado Pago se crea con el monto del primer mes; cuando Mercado Pago aprueba ese primer pago,
-- la función gestlok-cobros sube la suscripción a la cuota completa (si falla, lo reintenta con el pago siguiente).

alter table gestlok_chat_private.cobro_ajustes
  add column if not exists descuento_primer_mes numeric(5,2) not null default 15 check (descuento_primer_mes between 0 and 90);

create or replace function gestlok_chat_private.cobro_primer_mes(p_tenant uuid)
returns numeric language sql stable security definer set search_path to '' as $function$
  select case when exists (select 1 from gestlok_chat_private.cobros c where c.tenant_id = p_tenant and c.tipo = 'cuota' and c.estado = 'approved')
              then a.cuota else round(a.cuota * (100 - a.descuento_primer_mes) / 100, 0) end
  from gestlok_chat_private.cobro_ajustes a where a.id
$function$;

create or replace function gestlok_chat_private.cobro_json(p_tenant uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object('tenant_id', p_tenant,
    'requiere_cobro', coalesce(s.requiere_cobro, false), 'estado', coalesce(s.estado, 'sin_cobro'),
    'cuota', a.cuota, 'adaptacion', a.adaptacion, 'gracia_dias', a.gracia_dias,
    'descuento_primer_mes', a.descuento_primer_mes, 'primer_mes', gestlok_chat_private.cobro_primer_mes(p_tenant),
    'link_cuota', s.link_cuota, 'link_adaptacion', s.link_adaptacion, 'adaptacion_pagada', s.adaptacion_pagada_at is not null,
    'proximo_cobro', s.proximo_cobro, 'ultimo_pago_at', s.ultimo_pago_at, 'pausada', coalesce(s.pausada_por_cobro, false),
    'vence', case when s.estado <> 'activa' and s.mora_desde is not null and not s.pausada_por_cobro
                  then s.mora_desde + make_interval(days => a.gracia_dias) end,
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'estado', c.estado, 'monto', c.monto,
        'fecha', coalesce(c.pagado_at, c.creado_at)) order by c.creado_at desc)
      from (select * from gestlok_chat_private.cobros where tenant_id = p_tenant order by creado_at desc limit 12) c), '[]'::jsonb))
  from gestlok_chat_private.cobro_ajustes a
  left join gestlok_chat_private.suscripciones s on s.tenant_id = p_tenant
  where a.id
$function$;

-- El link de la cuota se arma con el monto del primer mes (con descuento) si la empresa todavía no pagó ninguno.
do $parche$
declare d text;
begin
  d := pg_get_functiondef('public.gestlok_chat_cobro_preparar(uuid,text,text)'::regprocedure);
  if position('gestlok_chat_private.cobro_primer_mes' in d) = 0 then
    if position('''monto'', case when p_tipo = ''cuota'' then a.cuota else a.adaptacion end' in d) = 0 then
      raise exception 'gestlok_chat_cobro_preparar cambió: revisar antes de aplicar';
    end if;
    d := replace(d, '''monto'', case when p_tipo = ''cuota'' then a.cuota else a.adaptacion end',
      '''monto'', case when p_tipo = ''cuota'' then gestlok_chat_private.cobro_primer_mes(p_tenant) else a.adaptacion end, ''cuota'', a.cuota');
    execute d;
  end if;
end $parche$;

-- Para la función: la cuota completa vigente (para subir la suscripción después del primer mes).
create or replace function public.gestlok_cobros_srv_cuota()
returns numeric language sql stable security definer set search_path to '' as $function$
  select cuota from gestlok_chat_private.cobro_ajustes where id
$function$;
revoke all on function public.gestlok_cobros_srv_cuota() from public, anon, authenticated;
grant execute on function public.gestlok_cobros_srv_cuota() to service_role;
revoke all on function gestlok_chat_private.cobro_primer_mes(uuid) from public, anon, authenticated;
