-- GESTLOK Chat: recepción confirmada por el cliente. Aplicar antes de desplegar función y web.
-- No altera el estado interno 'terminado', que sigue significando listo o enviado.
alter table gestlok_chat_private.pedidos
  add column if not exists recibido_at timestamptz;

create or replace function gestlok_chat_private.pedido_publico(p gestlok_chat_private.pedidos)
returns jsonb language sql stable set search_path = '' as $$
 select jsonb_build_object(
   'estado', p.estado, 'motivo', p.motivo, 'total', p.total,
   'subtotal', p.subtotal, 'envio', p.envio, 'items', p.items,
   'entrega', p.entrega, 'direccion', p.direccion,
   'nombre', split_part(p.cliente_nombre, ' ', 1),
   'medio_pago', p.medio_pago, 'programado_para', p.programado_para,
   'creado_at', p.creado_at, 'decidido_at', p.decidido_at,
   'recibido_at', p.recibido_at)
$$;
revoke all on function gestlok_chat_private.pedido_publico(gestlok_chat_private.pedidos)
  from public, anon, authenticated;

-- Solo es accesible a través de Edge Function con service_role; token vinculado a la conversación.
create or replace function public.gestlok_chat_srv_recibido(p_conversacion uuid, p_token_hash bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c gestlok_chat_private.conversaciones;
  p gestlok_chat_private.pedidos;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  select * into p from gestlok_chat_private.pedidos
    where conversacion_id = c.id order by creado_at desc limit 1 for update;
  if p.id is null then
    raise exception 'No hay pedido para recibir' using errcode='P0001';
  end if;
  if p.estado <> 'terminado' then
    raise exception 'Todavía no se puede marcar como recibido' using errcode='P0001';
  end if;
  if p.recibido_at is null then
    update gestlok_chat_private.pedidos set recibido_at = clock_timestamp()
      where id=p.id returning * into p;
  end if;
  return jsonb_build_object('ok',true,'pedido',gestlok_chat_private.pedido_publico(p));
end $$;
revoke all on function public.gestlok_chat_srv_recibido(uuid,bytea)
  from public, anon, authenticated;
grant execute on function public.gestlok_chat_srv_recibido(uuid,bytea) to service_role;

-- Dueños, administradora y gerentes ven cuándo el cliente confirmó la recepción.
create or replace function public.gestlok_chat_panel_pedidos(
 p_sucursal uuid, p_estado text default 'pendiente', p_limite integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver');
begin
  if coalesce(p_estado,'') not in ('pendiente','confirmado','terminado','rechazado','cancelado','todos') then
    raise exception 'Filtro inválido' using errcode='22023';
  end if;
  return jsonb_build_object('nivel',v_nivel,'pedidos',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'codigo',p.codigo,'estado',p.estado,'motivo',p.motivo,
    'cliente_nombre',p.cliente_nombre,'cliente_telefono',p.cliente_telefono,
    'entrega',p.entrega,'direccion',p.direccion,'horario',p.horario,
    'medio_pago',p.medio_pago,'nota',p.nota,'items',p.items,
    'subtotal',p.subtotal,'envio',p.envio,'total',p.total,
    'programado_para',p.programado_para,'recibido_at',p.recibido_at,
    'es_prueba',p.es_prueba,'creado_at',p.creado_at,
    'decidido_at',p.decidido_at,'confirmado_at',p.confirmado_at
  ) order by case when p.estado='pendiente' then p.creado_at end asc nulls last,p.creado_at desc)
  from (select * from gestlok_chat_private.pedidos x
    where x.sucursal_id=p_sucursal and (p_estado='todos' or x.estado=p_estado)
    order by x.creado_at desc limit least(greatest(coalesce(p_limite,50),1),200)) p),'[]'::jsonb));
end $$;
