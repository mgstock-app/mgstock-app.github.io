-- Chat público → revisión del gerente → preparación interna en la Central de GESTLOK.
-- Conserva pedidos históricos. No toca caja, stock ni integraciones externas.
alter table gestlok_chat_private.pedidos add column if not exists confirmado_at timestamptz;
alter table gestlok_chat_private.pedidos add column if not exists confirmado_por uuid;
alter table gestlok_chat_private.pedidos drop constraint if exists pedidos_estado_check;
alter table gestlok_chat_private.pedidos add constraint pedidos_estado_check
  check (estado in ('pendiente','confirmado','terminado','rechazado','cancelado'));
alter table gestlok_chat_private.pedido_eventos drop constraint if exists pedido_eventos_evento_check;
alter table gestlok_chat_private.pedido_eventos add constraint pedido_eventos_evento_check
  check (evento in ('creado','confirmado','terminado','rechazado','cancelado'));
create unique index if not exists gchat_confirmacion_unica on gestlok_chat_private.pedido_eventos(pedido_id)
  where evento = 'confirmado';

create or replace function public.gestlok_chat_panel_pedidos(p_sucursal uuid, p_estado text default 'pendiente', p_limite integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver');
begin
  if coalesce(p_estado, '') not in ('pendiente','confirmado','terminado','rechazado','cancelado','todos') then
    raise exception 'Filtro inválido' using errcode = '22023';
  end if;
  return jsonb_build_object('nivel', v_nivel, 'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'cliente_nombre', p.cliente_nombre,
      'cliente_telefono', p.cliente_telefono, 'entrega', p.entrega, 'direccion', p.direccion, 'horario', p.horario,
      'medio_pago', p.medio_pago, 'nota', p.nota, 'items', p.items, 'subtotal', p.subtotal, 'envio', p.envio,
      'total', p.total, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $$;

create or replace function public.gestlok_chat_panel_decidir(p_pedido uuid, p_decision text, p_motivo text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_suc uuid; v_ped gestlok_chat_private.pedidos;
begin
  select sucursal_id into v_suc from gestlok_chat_private.pedidos where id = p_pedido;
  perform gestlok_chat_private.exigir(v_suc, 'gestionar');
  if auth.uid() is null then raise exception 'Se requiere una sesión del gerente' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('confirmado','terminado','rechazado') then
    raise exception 'Decisión inválida' using errcode = '22023';
  end if;
  if p_decision = 'rechazado' and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí el motivo del rechazo para el cliente' using errcode = '22023';
  end if;
  -- El UPDATE condicional serializa confirmaciones, cancelaciones y dobles clics.
  update gestlok_chat_private.pedidos
     set estado = p_decision, motivo = left(btrim(coalesce(p_motivo, '')), 300),
         decidido_at = now(), decidido_por = auth.uid(),
         confirmado_at = case when p_decision = 'confirmado' then now() else confirmado_at end,
         confirmado_por = case when p_decision = 'confirmado' then auth.uid() else confirmado_por end
   where id = p_pedido and (
     (estado = 'pendiente' and p_decision in ('confirmado','rechazado')) or
     (estado = 'confirmado' and p_decision in ('terminado','rechazado')))
   returning * into v_ped;
  if v_ped.id is null then
    raise exception 'El pedido cambió de estado. Revisalo: primero debe confirmarse antes de terminarlo' using errcode = 'P0001';
  end if;
  insert into gestlok_chat_private.pedido_eventos(pedido_id, evento, actor, detalle)
  values (v_ped.id, p_decision, auth.uid(), left(btrim(coalesce(p_motivo, '')), 300));
  return jsonb_build_object('ok', true, 'codigo', v_ped.codigo, 'estado', v_ped.estado);
end $$;
revoke all on function public.gestlok_chat_panel_decidir(uuid,text,text) from public, anon, service_role;
grant execute on function public.gestlok_chat_panel_decidir(uuid,text,text) to authenticated;
