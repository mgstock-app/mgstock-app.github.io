-- GESTLOK Chat: corregir CHECK 23514 al guardar medios de pago del local.
-- Mantiene control por rol, sucursal, versión y auditoría sin cambiar filas existentes.
-- Ajusta solo el RPC de guardado, sin reducir RLS ni ampliar permisos.

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_config_guardar(p_sucursal uuid, p_config jsonb, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; v_medios text[]; v_nivel text;
begin
  v_nivel := gestlok_chat_private.exigir(p_sucursal, 'gestionar');
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Datos inválidos' using errcode = '22023'; end if;
  -- El gerente edita los mensajes del asistente; los ajustes del local quedan para el dueño y la administradora.
  if v_nivel <> 'configurar' and exists (select 1 from jsonb_object_keys(p_config) k
       where k not in ('mensajes','bienvenida','ia_activa','ia_nombre','ia_instrucciones','ia_info')) then
    raise exception 'Los ajustes del local (estado, entrega, pagos, horario) los cambia el dueño' using errcode = '42501';
  end if;
  if jsonb_typeof(p_config->'mensajes'->'resena_url') = 'string' and length(btrim(p_config->'mensajes'->>'resena_url')) > 0
     and not gestlok_chat_private.url_resena_valida(p_config->'mensajes'->>'resena_url') then
    raise exception 'El link de reseñas tiene que ser de Google (g.page, maps.app.goo.gl o google.com) y empezar con https://'
      using errcode = '22023';
  end if;
  -- Validar el cambio global antes del UPDATE para informar un error útil.
  if p_config ? 'medios_pago' then
    if jsonb_typeof(p_config->'medios_pago') <> 'array' then
      raise exception 'Seleccioná los medios de pago válidos' using errcode = '22023';
    end if;
    select array_agg(distinct x) into v_medios from jsonb_array_elements_text(p_config->'medios_pago') x;
    if v_medios is null or cardinality(v_medios) not between 1 and 5 or not
       (v_medios <@ array['efectivo','transferencia','mercado_pago','debito','credito']::text[]) then
      raise exception 'Seleccioná al menos un medio de pago válido' using errcode = '22023';
    end if;
  end if;
  update gestlok_chat_private.sucursales set
    activa = coalesce((p_config->>'activa')::boolean, activa),
    bienvenida = coalesce(left(p_config->>'bienvenida', 500), bienvenida),
    horario = coalesce(left(p_config->>'horario', 300), horario),
    direccion = coalesce(left(p_config->>'direccion', 200), direccion),
    acepta_retiro = coalesce((p_config->>'acepta_retiro')::boolean, acepta_retiro),
    acepta_envio = coalesce((p_config->>'acepta_envio')::boolean, acepta_envio),
    envio_costo = coalesce((p_config->>'envio_costo')::numeric, envio_costo),
    envio_zona = coalesce(left(p_config->>'envio_zona', 300), envio_zona),
    pedido_minimo = coalesce((p_config->>'pedido_minimo')::numeric, pedido_minimo),
    medios_pago = coalesce(v_medios, medios_pago),
    -- Reconciliar opciones de retiro/envío con los medios generales.
    medios_pago_retiro = case when v_medios is null or medios_pago_retiro is null then medios_pago_retiro
      else coalesce((select array_agg(u.metodo order by u.orden)
        from unnest(medios_pago_retiro) with ordinality as u(metodo, orden)
        where u.metodo = any(v_medios)), v_medios) end,
    medios_pago_envio = case when v_medios is null or medios_pago_envio is null then medios_pago_envio
      else coalesce((select array_agg(u.metodo order by u.orden)
        from unnest(medios_pago_envio) with ordinality as u(metodo, orden)
        where u.metodo = any(v_medios)), v_medios) end,
    mensajes = case when jsonb_typeof(p_config->'mensajes') = 'object'
      then (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p_config->'mensajes') e
            where jsonb_typeof(e.value) = 'string' and length(btrim(e.value #>> '{}')) > 0)
        || (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) from jsonb_each(mensajes) k
            where k.key in ('resena_url','resena','cierre','sugerencia') and not (p_config->'mensajes' ? k.key))
      else mensajes end,
    ia_activa = coalesce((p_config->>'ia_activa')::boolean, ia_activa),
    ia_nombre = coalesce(left(btrim(p_config->>'ia_nombre'), 40), ia_nombre),
    ia_instrucciones = coalesce(left(p_config->>'ia_instrucciones', 2000), ia_instrucciones),
    ia_info = coalesce(left(p_config->>'ia_info', 4000), ia_info),
    version = version + 1, actualizada_at = now(), actualizada_por = auth.uid()
   where id = p_sucursal and version = p_version returning * into s;
  if s.id is null then raise exception 'Otra persona cambió la configuración. Volvé a abrirla.' using errcode = '40001'; end if;
  perform gestlok_chat_private.auditar(s.id, 'config_guardar', p_config);
  return jsonb_build_object('ok', true, 'version', s.version);
end $function$
;
