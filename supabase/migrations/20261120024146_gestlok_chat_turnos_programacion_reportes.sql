
-- GESTLOK Chat: horarios estructurados, pedidos para próxima apertura, escalamiento humano y demanda diaria.
alter table gestlok_chat_private.sucursales add column if not exists turnos_chat jsonb not null default '[]'::jsonb;
alter table gestlok_chat_private.sucursales drop constraint if exists sucursales_turnos_chat_check;
alter table gestlok_chat_private.sucursales add constraint sucursales_turnos_chat_check check (
  jsonb_typeof(turnos_chat)='array' and jsonb_array_length(turnos_chat)<=3);
alter table gestlok_chat_private.pedidos add column if not exists programado_para timestamptz;
create index if not exists gchat_programados_sucursal on gestlok_chat_private.pedidos(sucursal_id,programado_para)
  where programado_para is not null and estado='pendiente';
update gestlok_chat_private.sucursales
set horario='Lunes a lunes de 11:00 a 14:40 y de 19:00 a 23:15',
    turnos_chat='[{"inicio":"11:00","fin":"14:40"},{"inicio":"19:00","fin":"23:15"}]'::jsonb
where tenant_id='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
  and local_id in ('munro','torcuato');

-- Función privada de reloj: 100% hora Argentina, con dos turnos y apertura del día siguiente.
create or replace function gestlok_chat_private.estado_atencion(
  s gestlok_chat_private.sucursales,p_ahora timestamp without time zone default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ahora timestamp :=coalesce(p_ahora,clock_timestamp() at time zone 'America/Argentina/Buenos_Aires');
  v_abierto boolean:=false; v_prox timestamp;
begin
  if jsonb_array_length(s.turnos_chat)=0 then return jsonb_build_object('habilitado',false); end if;
  select exists(select 1 from jsonb_array_elements(s.turnos_chat) slot
    where v_ahora::time >= (slot->>'inicio')::time and v_ahora::time < (slot->>'fin')::time)
    into v_abierto;
  select min(d.dia::date+(slot->>'inicio')::time) into v_prox
    from generate_series(v_ahora::date,v_ahora::date+1,interval '1 day') d(dia)
    cross join jsonb_array_elements(s.turnos_chat) slot
    where d.dia::date+(slot->>'inicio')::time>v_ahora;
  return jsonb_build_object('habilitado',true,'abierto',v_abierto,
      'proxima_apertura',v_prox at time zone 'America/Argentina/Buenos_Aires',
      'proximo_texto',case when v_prox::date=v_ahora::date then 'hoy a las ' else 'mañana a las ' end || to_char(v_prox,'HH24:MI'));
end $$;

-- Seguridad de la programación en DB, no depende de un horario calculado en el navegador.
create or replace function gestlok_chat_private.validar_programado()
returns trigger language plpgsql security definer set search_path='' as $$
declare s gestlok_chat_private.sucursales; c gestlok_chat_private.conversaciones;
  v jsonb;
begin
  select * into s from gestlok_chat_private.sucursales where id=new.sucursal_id;
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
end $$;
drop trigger if exists gchat_orden_programada on gestlok_chat_private.pedidos;
create trigger gchat_orden_programada before insert on gestlok_chat_private.pedidos
  for each row execute function gestlok_chat_private.validar_programado();

create or replace function gestlok_chat_private.validar_apertura_pedido()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.estado='pendiente' and new.estado='confirmado'
     and old.programado_para is not null and clock_timestamp()<old.programado_para then
    raise exception 'Pedido programado: estará disponible para confirmar cuando abra el local.' using errcode='P0001';
  end if;
  return new;
end $$;
drop trigger if exists gchat_confirmacion_apertura on gestlok_chat_private.pedidos;
create trigger gchat_confirmacion_apertura before update of estado on gestlok_chat_private.pedidos
 for each row execute function gestlok_chat_private.validar_apertura_pedido();

CREATE OR REPLACE FUNCTION gestlok_chat_private.sucursal_publica(s gestlok_chat_private.sucursales)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('slug', s.slug, 'nombre', s.nombre,
    'empresa', (select e.nombre_publico from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id),
    'bienvenida', s.bienvenida, 'horario', s.horario, 'direccion', s.direccion,
    'acepta_retiro', s.acepta_retiro, 'acepta_envio', s.acepta_envio, 'envio_costo', s.envio_costo,
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'medios_pago', to_jsonb(s.medios_pago),
    'medios_pago_retiro', coalesce(to_jsonb(s.medios_pago_retiro), to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(to_jsonb(s.medios_pago_envio), to_jsonb(s.medios_pago)),
    'demora_retiro', s.demora_retiro, 'demora_envio', s.demora_envio,
    'atencion', gestlok_chat_private.estado_atencion(s),
    'asistente', s.ia_nombre)
$function$
;
CREATE OR REPLACE FUNCTION gestlok_chat_private.pedido_publico(p gestlok_chat_private.pedidos)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'total', p.total,
    'subtotal', p.subtotal, 'envio', p.envio, 'items', p.items, 'entrega', p.entrega, 'direccion', p.direccion,
    'nombre', split_part(p.cliente_nombre, ' ', 1),
    'medio_pago', p.medio_pago, 'programado_para', p.programado_para, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at)
$function$
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
      'total', p.total, 'programado_para', p.programado_para, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $function$
;

-- Escalamiento de consultas ajenas al comercio. El gerente recibe el caso en Soporte.
alter table gestlok_chat_private.reclamos drop constraint if exists reclamos_tipo_check;
alter table gestlok_chat_private.reclamos add constraint reclamos_tipo_check
  check(tipo in ('demora','faltante','otro','consulta'));
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_reclamo(p_conversacion uuid, p_token_hash bytea, p_ip_hash text, p_tipo text, p_detalle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
  v_pedido uuid; v_respuesta text; v_id uuid; v_ya boolean;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_tipo not in ('demora','faltante','otro','consulta') or length(btrim(coalesce(p_detalle,''))) not between 3 and 600 then
    raise exception 'Consulta inválida' using errcode='22023';
  end if;
  select id into v_pedido from gestlok_chat_private.pedidos
  where conversacion_id=c.id order by creado_at desc limit 1;

  select exists(select 1 from gestlok_chat_private.reclamos r
    where r.conversacion_id=c.id and r.tipo=p_tipo and r.estado='pendiente') into v_ya;
  v_respuesta := case
    when v_ya then 'Gracias por ampliar la información. Su mensaje se agregó al caso que está revisando el gerente. Le responderá por este mismo chat.'
    when p_tipo='consulta' then 'Gracias por contactarnos. Esta consulta requiere la atención del gerente de ' || s.nombre || '. Le hemos enviado un aviso y se comunicará con usted por este mismo chat.'
    when p_tipo='demora' then 'Le pedimos disculpas por la demora. Entendemos su preocupación y vamos a revisar lo sucedido para darle una solución. Avisamos al gerente de ' || s.nombre || ', quien le responderá por este mismo chat.'
    when p_tipo='faltante' then 'Le pedimos disculpas por el faltante en su pedido. Vamos a revisar lo sucedido y trabajar para darle una solución. El gerente de ' || s.nombre || ' fue avisado y se comunicará con usted por este mismo chat.'
    else 'Lamentamos el inconveniente y le pedimos disculpas. Vamos a revisar su reclamo para darle una solución. Avisamos al gerente de ' || s.nombre || ', quien le responderá por este mismo chat.'
  end;
  if not v_ya and p_tipo='demora' and (s.demora_retiro is not null or s.demora_envio is not null) then
    v_respuesta := v_respuesta || E'\nLos tiempos habituales son orientativos: ' ||
      concat_ws(' · ',case when s.demora_retiro is not null then 'Retiro '||s.demora_retiro end,
                case when s.demora_envio is not null then 'Delivery '||s.demora_envio end) ||
      '. El gerente verificará el estado real de su pedido.';
  end if;
  -- Misma transacción: guardar mensajes y alerta, o no guardar ninguno.
  perform public.gestlok_chat_srv_turno(c.id,p_token_hash,p_ip_hash,
     left(btrim(p_detalle),600),left(v_respuesta,2000),c.estado);
  insert into gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,pedido_id,tipo,detalle)
    values(s.tenant_id,s.id,c.id,v_pedido,p_tipo,left(btrim(p_detalle),600))
    on conflict (conversacion_id,tipo) where estado='pendiente'
    do update set detalle=excluded.detalle, actualizado_at=now(),
       respondido_at=null,respondido_por=null,
       pedido_id=coalesce(excluded.pedido_id,gestlok_chat_private.reclamos.pedido_id)
    returning id into v_id;
  return jsonb_build_object('ok',true,'reclamo',v_id,'tipo',p_tipo,'texto',v_respuesta);
end $function$
;

-- Historial de demanda: no expone nombres ni teléfonos; cada sucursal ve solo sus propios pedidos.
create or replace function public.gestlok_chat_panel_reporte_diario(
 p_sucursal uuid,p_dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_desde date:=(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date
   - (least(greatest(coalesce(p_dias,30),1),90)-1);
begin
 perform gestlok_chat_private.exigir(p_sucursal,'ver');
 return coalesce((select jsonb_agg(jsonb_build_object(
 'fecha',d.fecha,'total',coalesce(a.total,0),'retiro',coalesce(a.retiro,0),
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
end $$;
revoke all on function public.gestlok_chat_panel_reporte_diario(uuid,integer) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_reporte_diario(uuid,integer) to authenticated;
