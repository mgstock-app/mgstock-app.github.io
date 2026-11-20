
-- GESTLOK Chat: soporte directo de reclamos por sucursal (no vincula mensajería externa).
-- Un gerente contesta por el mismo hilo del cliente; sin confirmación automática ni cambios en pedidos.
alter table gestlok_chat_private.sucursales
  add column if not exists demora_retiro text,
  add column if not exists demora_envio text;
update gestlok_chat_private.sucursales
set demora_retiro='15 a 20 minutos', demora_envio='35 a 40 minutos'
where tenant_id='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
  and local_id in ('munro','torcuato');
create table if not exists gestlok_chat_private.reclamos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sucursal_id uuid not null,
  conversacion_id uuid not null references gestlok_chat_private.conversaciones(id) on delete cascade,
  pedido_id uuid references gestlok_chat_private.pedidos(id) on delete set null,
  tipo text not null check(tipo in ('demora','faltante','otro')),
  detalle text not null check(length(detalle) between 1 and 600),
  estado text not null default 'pendiente' check(estado in ('pendiente','respondido')),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  respondido_at timestamptz,
  respondido_por uuid,
  foreign key (tenant_id,sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict
);
create unique index if not exists gchat_reclamo_abierto on gestlok_chat_private.reclamos(conversacion_id,tipo) where estado='pendiente';
create index if not exists gchat_reclamo_sucursal on gestlok_chat_private.reclamos(sucursal_id,estado,creado_at desc);
alter table gestlok_chat_private.reclamos enable row level security;
revoke all on gestlok_chat_private.reclamos from public,anon,authenticated;

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
    'asistente', s.ia_nombre)
$function$
;
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_inicio()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_t uuid := gestlok_tenancy.current_tenant_id(); e gestlok_chat_private.empresas;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode = '42501'; end if;
  select * into e from gestlok_chat_private.empresas where tenant_id = v_t and habilitada;
  if e.tenant_id is null then return jsonb_build_object('habilitado', false); end if;
  return jsonb_build_object('habilitado', true, 'empresa', e.nombre_publico,
    'sucursales', coalesce((select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'slug', s.slug, 'local_id', s.local_id, 'activa', s.activa,
        'nivel', gestlok_chat_private.nivel(s.id),
        'pendientes', (select count(*) from gestlok_chat_private.pedidos p where p.sucursal_id = s.id and p.estado = 'pendiente'),
        'reclamos', (select count(*) from gestlok_chat_private.reclamos r where r.sucursal_id=s.id and r.estado='pendiente')) x
      from gestlok_chat_private.sucursales s where s.tenant_id = e.tenant_id and gestlok_chat_private.nivel(s.id) is not null) q), '[]'::jsonb));
end $function$
;
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_conversacion(p_sucursal uuid, p_token_hash bytea, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; c gestlok_chat_private.conversaciones;
begin
  s := gestlok_chat_private.sucursal_abierta(p_sucursal);
  if p_token_hash is null or length(p_token_hash) <> 32 then
    raise exception 'Sesión inválida' using errcode = '22023';
  end if;
  select * into c from gestlok_chat_private.conversaciones where token_hash = p_token_hash;
  if c.id is not null and c.sucursal_id <> s.id then
    raise exception 'Sesión de otra sucursal' using errcode = '42501';
  end if;
  if c.id is null then
    if not gestlok_chat_private.consumir('conv:ip:' || left(coalesce(p_ip_hash, ''), 64), 'dia', 30) then
      raise exception 'Demasiadas conversaciones nuevas. Probá más tarde.' using errcode = 'P0001';
    end if;
    insert into gestlok_chat_private.conversaciones(tenant_id, sucursal_id, token_hash, ip_hash)
    values (s.tenant_id, s.id, p_token_hash, left(coalesce(p_ip_hash, ''), 64)) returning * into c;
  end if;
  return jsonb_build_object('id', c.id, 'estado', c.estado, 'nueva', c.mensajes = 0,
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'rol', m.rol, 'texto', m.texto, 'at', m.creado_at) order by m.id)
       from (select * from gestlok_chat_private.mensajes where conversacion_id = c.id order by id desc limit 40) m), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(gestlok_chat_private.pedido_publico(p) order by p.creado_at desc)
       from (select * from gestlok_chat_private.pedidos where conversacion_id = c.id order by creado_at desc limit 5) p), '[]'::jsonb));
end $function$
;

create or replace function public.gestlok_chat_srv_reclamo(
  p_conversacion uuid,p_token_hash bytea,p_ip_hash text,p_tipo text,p_detalle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
  v_pedido uuid; v_codigo text; v_respuesta text; v_id uuid;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_tipo not in ('demora','faltante','otro') or length(btrim(coalesce(p_detalle,''))) not between 3 and 600 then
    raise exception 'Consulta inválida' using errcode='22023';
  end if;
  select id,codigo into v_pedido,v_codigo from gestlok_chat_private.pedidos
  where conversacion_id=c.id order by creado_at desc limit 1;
  v_respuesta := case p_tipo
    when 'demora' then 'Entiendo tu consulta por la demora.'
    when 'faltante' then 'Lamento que falte algo en tu pedido.'
    else 'Lamento el inconveniente con tu pedido.'
  end || ' Ya envié el aviso al gerente de ' || s.nombre || '. Te responderá por este mismo chat.';
  if p_tipo='demora' and (s.demora_retiro is not null or s.demora_envio is not null) then
    v_respuesta := v_respuesta || E'\nTiempo habitual estimado: ' ||
      concat_ws(' · ',case when s.demora_retiro is not null then 'Retiro '||s.demora_retiro end,
                  case when s.demora_envio is not null then 'Delivery '||s.demora_envio end) ||
      '. Estos tiempos no confirman el estado de tu pedido.';
  end if;
  if v_pedido is null then
    v_respuesta := v_respuesta || E'\nSi tenés un código de pedido, podés escribirlo acá para ayudar al local a identificarlo.';
  end if;
  -- Misma transacción: guardar mensajes y alerta, o no guardar ninguno.
  perform public.gestlok_chat_srv_turno(c.id,p_token_hash,p_ip_hash,
     left(btrim(p_detalle),600),left(v_respuesta,2000),c.estado);
  insert into gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,pedido_id,tipo,detalle)
    values(s.tenant_id,s.id,c.id,v_pedido,p_tipo,left(btrim(p_detalle),600))
    on conflict (conversacion_id,tipo) where estado='pendiente'
    do update set detalle=excluded.detalle, actualizado_at=now(),pedido_id=coalesce(excluded.pedido_id,gestlok_chat_private.reclamos.pedido_id)
    returning id into v_id;
  return jsonb_build_object('ok',true,'reclamo',v_id,'tipo',p_tipo,'texto',v_respuesta);
end $$;

create or replace function public.gestlok_chat_srv_respuestas(
 p_conversacion uuid,p_token_hash bytea,p_desde bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; v_desde bigint:=greatest(coalesce(p_desde,0),0);
begin
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 return jsonb_build_object(
  'mensajes_local',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'texto',x.texto,'at',x.creado_at) order by x.id)
    from (select id,texto,creado_at from gestlok_chat_private.mensajes
      where conversacion_id=c.id and rol='local' and id>v_desde order by id limit 40) x),'[]'::jsonb),
  'soporte_pendiente',exists(select 1 from gestlok_chat_private.reclamos r
   where r.conversacion_id=c.id and r.estado='pendiente')
 );
end $$;

create or replace function public.gestlok_chat_panel_soporte(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'conversacion_id',r.conversacion_id,'tipo',r.tipo,'detalle',r.detalle,
    'creado_at',r.creado_at,'pedido',p.codigo,
    'ultimo',(select m.texto from gestlok_chat_private.mensajes m
      where m.conversacion_id=r.conversacion_id order by m.id desc limit 1))
   order by r.actualizado_at desc)
  from (select * from gestlok_chat_private.reclamos
    where sucursal_id=p_sucursal and estado='pendiente'
    order by actualizado_at desc limit 80) r
  left join gestlok_chat_private.pedidos p on p.id=r.pedido_id),'[]'::jsonb);
end $$;

create or replace function public.gestlok_chat_panel_responder(
 p_conversacion uuid,p_texto text,p_reclamo uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; v_texto text:=btrim(coalesce(p_texto,''));
begin
 select * into c from gestlok_chat_private.conversaciones where id=p_conversacion for update;
 if c.id is null then raise exception 'Conversación inexistente' using errcode='P0002';end if;
 perform gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 if length(v_texto) not between 2 and 1000 then
    raise exception 'Escribí una respuesta entre 2 y 1000 caracteres' using errcode='22023';
 end if;
 if c.mensajes>=400 then raise exception 'La conversación llegó a su límite' using errcode='P0001';end if;
 if p_reclamo is not null and not exists(select 1 from gestlok_chat_private.reclamos r
  where r.id=p_reclamo and r.conversacion_id=c.id and r.sucursal_id=c.sucursal_id
   and r.estado='pendiente') then
    raise exception 'El reclamo ya fue respondido o no corresponde a esta conversación' using errcode='P0001';
 end if;
 insert into gestlok_chat_private.mensajes(conversacion_id,rol,texto) values(c.id,'local',v_texto);
 update gestlok_chat_private.conversaciones set ultima_at=now(),mensajes=mensajes+1 where id=c.id;
 if p_reclamo is not null then
  update gestlok_chat_private.reclamos set estado='respondido',
    respondido_at=now(),respondido_por=auth.uid(),actualizado_at=now()
  where id=p_reclamo and sucursal_id=c.sucursal_id and conversacion_id=c.id and estado='pendiente';
 end if;
 perform gestlok_chat_private.auditar(c.sucursal_id,'soporte_respuesta',
  jsonb_build_object('conversacion',c.id,'reclamo',p_reclamo,'respondido',p_reclamo is not null));
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.gestlok_chat_srv_reclamo(uuid,bytea,text,text,text),
  public.gestlok_chat_srv_respuestas(uuid,bytea,bigint) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_reclamo(uuid,bytea,text,text,text),
  public.gestlok_chat_srv_respuestas(uuid,bytea,bigint) to service_role;
revoke all on function public.gestlok_chat_panel_soporte(uuid),
  public.gestlok_chat_panel_responder(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_soporte(uuid),
  public.gestlok_chat_panel_responder(uuid,text,uuid) to authenticated;
