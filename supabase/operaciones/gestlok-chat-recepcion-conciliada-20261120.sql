-- GESTLOK Chat: recepción del cliente, preservando descuentos, clientes frecuentes e historial.
-- Conciliado con el esquema activo tras PR #459 y #460. Aplicar antes del despliegue.
BEGIN;
ALTER TABLE gestlok_chat_private.pedidos ADD COLUMN IF NOT EXISTS recibido_at timestamptz;

CREATE OR REPLACE FUNCTION gestlok_chat_private.pedido_publico(p gestlok_chat_private.pedidos)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'total', p.total,
    'subtotal', p.subtotal, 'envio', p.envio, 'descuento', p.descuento,
    'efectivo_abona', p.efectivo_abona, 'efectivo_cambio', p.efectivo_cambio, 'items', p.items, 'entrega', p.entrega, 'direccion', p.direccion,
    'nombre', split_part(p.cliente_nombre, ' ', 1),
    'medio_pago', p.medio_pago, 'programado_para', p.programado_para, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'recibido_at', p.recibido_at)
$function$
;
REVOKE ALL ON FUNCTION gestlok_chat_private.pedido_publico(gestlok_chat_private.pedidos) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_pedidos(p_sucursal uuid, p_estado text DEFAULT 'pendiente'::text, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver');
begin
  if coalesce(p_estado, '') not in ('pendiente','confirmado','terminado','rechazado','cancelado','todos') then
    raise exception 'Filtro inválido' using errcode = '22023';
  end if;
  return jsonb_build_object('nivel', v_nivel, 'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'cliente_nombre', p.cliente_nombre,
      'cliente_telefono', p.cliente_telefono, 'cliente_pedidos',
      (select count(*) from gestlok_chat_private.pedidos anterior
       where anterior.sucursal_id=p.sucursal_id and anterior.cliente_telefono=p.cliente_telefono),
      'conversacion_id', p.conversacion_id, 'entrega', p.entrega, 'direccion', p.direccion, 'horario', p.horario,
      'medio_pago', p.medio_pago, 'descuento', p.descuento, 'efectivo_abona', p.efectivo_abona,
      'efectivo_cambio', p.efectivo_cambio, 'nota', p.nota, 'items', p.items, 'subtotal', p.subtotal, 'envio', p.envio,
      'total', p.total, 'programado_para', p.programado_para, 'es_prueba',to_jsonb(p)->'es_prueba', 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at, 'recibido_at', p.recibido_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_recibido(p_conversacion uuid, p_token_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $recepcion$
DECLARE
  c gestlok_chat_private.conversaciones;
  p gestlok_chat_private.pedidos;
BEGIN
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  SELECT * INTO p FROM gestlok_chat_private.pedidos
    WHERE conversacion_id = c.id ORDER BY creado_at DESC LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'No hay pedido para recibir' USING errcode = 'P0001';
  END IF;
  IF p.estado <> 'terminado' THEN
    RAISE EXCEPTION 'Todavía no se puede marcar como recibido' USING errcode = 'P0001';
  END IF;
  IF p.recibido_at IS NULL THEN
    UPDATE gestlok_chat_private.pedidos SET recibido_at = clock_timestamp()
      WHERE id = p.id RETURNING * INTO p;
  END IF;
  RETURN jsonb_build_object('ok',true,'pedido',gestlok_chat_private.pedido_publico(p));
END
$recepcion$;
REVOKE ALL ON FUNCTION public.gestlok_chat_srv_recibido(uuid,bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_chat_srv_recibido(uuid,bytea) TO service_role;
COMMIT;
