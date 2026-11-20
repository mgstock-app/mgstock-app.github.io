-- Soporte reutilizable de aperturas temporales para pruebas sin modificar horarios.
-- Para habilitar la prueba de una sucursal, asignar prueba_hasta desde una acción autorizada;
-- al vencer, el horario normal vuelve automáticamente.
alter table gestlok_chat_private.sucursales add column if not exists prueba_hasta timestamptz;
alter table gestlok_chat_private.pedidos add column if not exists es_prueba boolean not null default false;

CREATE OR REPLACE FUNCTION gestlok_chat_private.estado_atencion(s gestlok_chat_private.sucursales, p_ahora timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ahora timestamp :=coalesce(p_ahora,clock_timestamp() at time zone 'America/Argentina/Buenos_Aires');
  v_abierto boolean:=false; v_prox timestamp; v_prueba boolean:=false;
begin
  if jsonb_array_length(s.turnos_chat)=0 then return jsonb_build_object('habilitado',false); end if;
  select exists(select 1 from jsonb_array_elements(s.turnos_chat) slot
    where v_ahora::time >= (slot->>'inicio')::time and v_ahora::time < (slot->>'fin')::time)
    into v_abierto;
  v_prueba := s.prueba_hasta is not null and clock_timestamp()<s.prueba_hasta;
  select min(d.dia::date+(slot->>'inicio')::time) into v_prox
    from generate_series(v_ahora::date,v_ahora::date+1,interval '1 day') d(dia)
    cross join jsonb_array_elements(s.turnos_chat) slot
    where d.dia::date+(slot->>'inicio')::time>v_ahora;
  return jsonb_build_object('habilitado',true,'abierto',(v_abierto or v_prueba),'modo_prueba',v_prueba,
      'proxima_apertura',v_prox at time zone 'America/Argentina/Buenos_Aires',
      'proximo_texto',case when v_prox::date=v_ahora::date then 'hoy a las ' else 'mañana a las ' end || to_char(v_prox,'HH24:MI'));
end $function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.validar_programado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; c gestlok_chat_private.conversaciones;
  v jsonb;
begin
  select * into s from gestlok_chat_private.sucursales where id=new.sucursal_id;
  new.es_prueba := s.prueba_hasta is not null and clock_timestamp()<s.prueba_hasta;
  v:=gestlok_chat_private.estado_atencion(s);
  if coalesce((v->>'habilitado')::boolean,false) and not coalesce((v->>'abierto')::boolean,false) then
    if new.conversacion_id is null then
      raise exception 'El pedido programado necesita la conversación del cliente' using errcode='22023';
    end if;
    select * into c from gestlok_chat_private.conversaciones where id=new.conversacion_id and sucursal_id=s.id;
    if c.id is null or coalesce((c.estado->>'programado')::boolean,false) is not true then
      raise exception 'El local está cerrado. Primero elija dejar el pedido para la próxima apertura.' using errcode='P0001';
    end if;
    new.programado_para:=(v->>'proxima_apertura')::timestamptz;
    new.horario:='Próxima apertura · '||(v->>'proximo_texto');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_eliminar_prueba(p_pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ped gestlok_chat_private.pedidos;
begin
  if auth.uid() is null then raise exception 'Debe ingresar a GESTLOK' using errcode='42501'; end if;
  select * into v_ped from gestlok_chat_private.pedidos where id=p_pedido for update;
  if v_ped.id is null then raise exception 'Pedido inexistente' using errcode='P0001'; end if;
  perform gestlok_chat_private.exigir(v_ped.sucursal_id,'gestionar');
  if v_ped.es_prueba is not true then
    raise exception 'Solo se permite eliminar pedidos de prueba' using errcode='42501';
  end if;
  perform gestlok_chat_private.auditar(v_ped.sucursal_id,'pedido_prueba_eliminado',
    jsonb_build_object('pedido',v_ped.id,'codigo',v_ped.codigo,'actor',auth.uid()));
  delete from gestlok_chat_private.pedido_eventos where pedido_id=v_ped.id;
  delete from gestlok_chat_private.pedidos where id=v_ped.id and es_prueba=true;
  return jsonb_build_object('ok',true,'eliminado',true);
end $function$
;

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
      'cliente_telefono', p.cliente_telefono, 'entrega', p.entrega, 'direccion', p.direccion, 'horario', p.horario,
      'medio_pago', p.medio_pago, 'nota', p.nota, 'items', p.items, 'subtotal', p.subtotal, 'envio', p.envio,
      'total', p.total, 'programado_para', p.programado_para, 'es_prueba',p.es_prueba, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $function$
;

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
 where p.sucursal_id=p_sucursal and not p.es_prueba and p.creado_at>=v_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'
 group by 1) a on a.fecha=d.fecha),'[]'::jsonb);
end $function$
;

-- Privilegios mínimos: funciones privadas accesibles solo desde su lógica interna.
revoke all on function gestlok_chat_private.estado_atencion(gestlok_chat_private.sucursales,timestamp without time zone),
gestlok_chat_private.validar_programado() from public,anon,authenticated,service_role;
revoke all on function public.gestlok_chat_panel_eliminar_prueba(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_eliminar_prueba(uuid) to authenticated;
