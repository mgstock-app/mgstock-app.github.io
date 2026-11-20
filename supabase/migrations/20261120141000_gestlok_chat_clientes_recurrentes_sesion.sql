-- Clientes frecuentes por navegador anónimo: sin registro y sin revelar direcciones por número.
-- La clave estable se guarda solo en el navegador del cliente; el servidor almacena su SHA-256.
-- La cuenta de pedidos para el gerente se calcula siempre dentro de su sucursal.
create table if not exists gestlok_chat_private.clientes_frecuentes (
 tenant_id uuid not null,
 sucursal_id uuid not null,
 navegador_hash bytea not null check (length(navegador_hash)=32),
 telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
 nombre text not null check (length(btrim(nombre)) between 2 and 80),
 direccion text not null default '' check (length(direccion)<=200),
 visitas integer not null default 1 check (visitas between 1 and 1000000),
 ultimo_pedido_at timestamptz not null default now(),
 primary key(sucursal_id,navegador_hash,telefono),
 foreign key (tenant_id,sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict
);
create index if not exists gestlok_chat_clientes_recientes_idx
 on gestlok_chat_private.clientes_frecuentes(sucursal_id,ultimo_pedido_at desc);
alter table gestlok_chat_private.clientes_frecuentes enable row level security;
revoke all on gestlok_chat_private.clientes_frecuentes from public,anon,authenticated;

create or replace function public.gestlok_chat_srv_recordar(
 p_conversacion uuid,p_token_hash bytea,p_navegador_hash bytea,p_telefono text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_chat_private.conversaciones; perfil gestlok_chat_private.clientes_frecuentes;
  anterior gestlok_chat_private.pedidos; v_telefono text; v_cantidad integer;
begin
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 if c.cerrada_at is not null then return jsonb_build_object('encontrado',false); end if;
 v_telefono:=regexp_replace(coalesce(p_telefono,''),'[^0-9]','','g');
 if length(p_navegador_hash) <> 32 or v_telefono !~ '^[0-9]{8,15}$'
 then raise exception 'Datos de consulta inválidos' using errcode='22023'; end if;
 if not gestlok_chat_private.consumir('perfil:conv:'||c.id::text,'minuto',12)
 then raise exception 'Espere antes de volver a consultar los datos' using errcode='P0001'; end if;
 select * into perfil from gestlok_chat_private.clientes_frecuentes cf
 where cf.sucursal_id=c.sucursal_id and cf.tenant_id=c.tenant_id
   and cf.navegador_hash=p_navegador_hash and cf.telefono=v_telefono
   and cf.ultimo_pedido_at > now()-interval '24 months';
 if perfil.sucursal_id is not null then
   return jsonb_build_object('encontrado',true,'nombre',perfil.nombre,
     'direccion',perfil.direccion,'visitas',perfil.visitas);
 end if;
 -- Compatibilidad: el mismo dispositivo ya tenía una conversación abierta
 -- antes de esta actualización. La clave anterior acredita esa conversación.
 select * into anterior from gestlok_chat_private.pedidos p
 where p.conversacion_id=c.id and p.sucursal_id=c.sucursal_id
   and p.tenant_id=c.tenant_id and p.cliente_telefono=v_telefono
 order by p.creado_at desc limit 1;
 if anterior.id is null then return jsonb_build_object('encontrado',false); end if;
 select count(*) into v_cantidad from gestlok_chat_private.pedidos p
 where p.conversacion_id=c.id and p.sucursal_id=c.sucursal_id and p.cliente_telefono=v_telefono;
 insert into gestlok_chat_private.clientes_frecuentes
 (tenant_id,sucursal_id,navegador_hash,telefono,nombre,direccion,visitas,ultimo_pedido_at)
 values(c.tenant_id,c.sucursal_id,p_navegador_hash,v_telefono,anterior.cliente_nombre,
   (select coalesce(p.direccion,'') from gestlok_chat_private.pedidos p
    where p.conversacion_id=c.id and p.sucursal_id=c.sucursal_id
      and p.cliente_telefono=v_telefono and p.entrega='envio'
    order by p.creado_at desc limit 1),
   greatest(v_cantidad,1),anterior.creado_at)
 on conflict (sucursal_id,navegador_hash,telefono) do nothing;
 return jsonb_build_object('encontrado',true,'nombre',anterior.cliente_nombre,
   'direccion',(select coalesce(p.direccion,'') from gestlok_chat_private.pedidos p
    where p.conversacion_id=c.id and p.sucursal_id=c.sucursal_id
      and p.cliente_telefono=v_telefono and p.entrega='envio'
    order by p.creado_at desc limit 1),
   'visitas',v_cantidad);
end $$;
revoke all on function public.gestlok_chat_srv_recordar(uuid,bytea,bytea,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_recordar(uuid,bytea,bytea,text) to service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_pedido(p_conversacion uuid, p_token_hash bytea, p_pedido jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales; p gestlok_chat_private.productos;
  it jsonb; g jsonb; sel jsonb; v jsonb; items jsonb := '[]'::jsonb; elegidas jsonb; nombres jsonb;
  v_cant integer; v_extra numeric; v_unit numeric; v_sub numeric := 0; v_envio numeric := 0; v_total numeric; v_descuento numeric := 0; v_abona numeric; v_cambio numeric;
  v_nombre text; v_tel text; v_entrega text; v_dir text; v_pago text; v_num integer; v_ped gestlok_chat_private.pedidos;
  v_ids text[]; v_unidades integer; v_agotada text;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  select * into c from gestlok_chat_private.conversaciones where id=c.id for update;
  if c.cerrada_at is not null then raise exception 'La conversación está cerrada. Iniciá una nueva.' using errcode = 'P0001'; end if;
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' or jsonb_typeof(p_pedido->'items') is distinct from 'array'
     or jsonb_array_length(p_pedido->'items') not between 1 and 30 then
    raise exception 'El pedido no tiene productos' using errcode = '22023';
  end if;
  if exists (select 1 from gestlok_chat_private.pedidos x where x.conversacion_id = c.id and x.estado = 'pendiente') then
    raise exception 'Ya tenés un pedido esperando confirmación del local' using errcode = 'P0001';
  end if;

  v_nombre := btrim(regexp_replace(coalesce(p_pedido->>'nombre', ''), '\s+', ' ', 'g'));
  v_tel := regexp_replace(coalesce(p_pedido->>'telefono', ''), '[^0-9]', '', 'g');
  v_entrega := coalesce(p_pedido->>'entrega', '');
  v_dir := btrim(coalesce(p_pedido->>'direccion', ''));
  v_pago := coalesce(p_pedido->>'medio_pago', '');
  if length(v_nombre) not between 2 and 80 then raise exception 'Falta el nombre' using errcode = '22023'; end if;
  if v_tel !~ '^[0-9]{8,15}$' then raise exception 'El teléfono no es válido' using errcode = '22023'; end if;
  if v_entrega not in ('retiro','envio') or (v_entrega = 'retiro' and not s.acepta_retiro)
     or (v_entrega = 'envio' and not s.acepta_envio) then
    raise exception 'Esa forma de entrega no está disponible' using errcode = '22023';
  end if;
  if v_entrega = 'envio' and length(v_dir) < 5 then raise exception 'Falta la dirección de envío' using errcode = '22023'; end if;
  if not (v_pago = any(s.medios_pago)) then raise exception 'Ese medio de pago no está disponible' using errcode = '22023'; end if;
  -- Cada sucursal define qué medios admite según retiro o delivery.
  if v_entrega = 'envio' and s.medios_pago_envio is not null
     and not (v_pago = any(s.medios_pago_envio)) then
    raise exception 'Ese medio de pago no está disponible para delivery' using errcode = '22023';
  end if;
  if v_entrega = 'retiro' and s.medios_pago_retiro is not null
     and not (v_pago = any(s.medios_pago_retiro)) then
    raise exception 'Ese medio de pago no está disponible para retiro en el local' using errcode = '22023';
  end if;

  for it in select value from jsonb_array_elements(p_pedido->'items') loop
    v_cant := case when jsonb_typeof(it->'cantidad') = 'number' then (it->>'cantidad')::numeric::integer end;
    if v_cant is null or v_cant not between 1 and 50 or (it->>'cantidad')::numeric <> v_cant then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;
    select x.* into p from gestlok_chat_private.productos x
      left join gestlok_chat_private.categorias k on k.id = x.categoria_id
     where x.id = case when coalesce(it->>'producto_id','') ~ '^[0-9a-f-]{36}$' then (it->>'producto_id')::uuid end
       and x.sucursal_id = s.id and x.activo and coalesce(k.activa, true);
    if p.id is null then raise exception 'Un producto ya no está en la carta' using errcode = 'P0001'; end if;
    if not p.disponible then raise exception '% no está disponible ahora', p.nombre using errcode = 'P0001'; end if;
    sel := coalesce(it->'opciones', '{}'::jsonb);
    if jsonb_typeof(sel) <> 'object' then raise exception 'Opciones inválidas' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_object_keys(sel) k
               where not exists (select 1 from jsonb_array_elements(p.opciones) gg where gg->>'id' = k)) then
      raise exception 'Opciones inválidas para %', p.nombre using errcode = '22023';
    end if;
    v_extra := 0; elegidas := '[]'::jsonb;
    for g in select value from jsonb_array_elements(p.opciones) loop
      -- Promo / combo: {variedad: cantidad} que suma exactamente el total del grupo.
      if g->>'tipo' = 'cantidad' then
        v := coalesce(sel->(g->>'id'), '{}'::jsonb);
        if jsonb_typeof(v) <> 'object' or exists (
             select 1 from jsonb_each(v) e
             where not exists (select 1 from jsonb_array_elements(g->'valores') vv where vv->>'id' = e.key)
                or jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric < 0
                or (e.value #>> '{}')::numeric <> floor((e.value #>> '{}')::numeric) or (e.value #>> '{}')::numeric > 50) then
          raise exception 'Elegí bien «%» en %', g->>'nombre', p.nombre using errcode = '22023';
        end if;
        select coalesce(sum((e.value #>> '{}')::integer), 0) into v_unidades from jsonb_each(v) e;
        if v_unidades <> (g->>'total')::integer then
          raise exception 'En «%» de % elegí % (elegiste %)', g->>'nombre', p.nombre, g->>'total', v_unidades using errcode = '22023';
        end if;
        select vv->>'nombre' into v_agotada
          from jsonb_each(v) e join jsonb_array_elements(g->'valores') vv on vv->>'id' = e.key
         where (e.value #>> '{}')::integer > 0 and (
               exists (select 1 from gestlok_chat_private.opciones_stock st
                        where st.sucursal_id = s.id and st.grupo_id = g->>'id' and st.valor_id = e.key and not st.disponible)
            or (vv ? 'producto_id' and not exists (select 1 from gestlok_chat_private.productos x
                        where x.id = (vv->>'producto_id')::uuid and x.sucursal_id = s.id and x.activo and x.disponible)))
         limit 1;
        if v_agotada is not null then
          raise exception '% no está disponible ahora. Elegí otra variedad para %.', v_agotada, p.nombre using errcode = 'P0001';
        end if;
        select coalesce(sum(coalesce((vv->>'extra')::numeric, 0) * (e.value #>> '{}')::integer), 0),
               jsonb_agg(((e.value #>> '{}')::integer)::text || ' ' || (vv->>'nombre') order by vv->>'nombre')
          into v_unit, nombres
          from jsonb_each(v) e join jsonb_array_elements(g->'valores') vv on vv->>'id' = e.key
         where (e.value #>> '{}')::integer > 0;
        v_extra := v_extra + v_unit;
        elegidas := elegidas || jsonb_build_array(jsonb_build_object('grupo', g->>'nombre', 'valores', nombres));
        continue;
      end if;
      v := coalesce(sel->(g->>'id'), '[]'::jsonb);
      if jsonb_typeof(v) <> 'array' then raise exception 'Opciones inválidas' using errcode = '22023'; end if;
      select array_agg(value) into v_ids from jsonb_array_elements_text(v);
      v_ids := coalesce(v_ids, '{}');
      if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x)
         or exists (select 1 from unnest(v_ids) x
                    where not exists (select 1 from jsonb_array_elements(g->'valores') vv where vv->>'id' = x))
         or (coalesce((g->>'obligatorio')::boolean, false) and cardinality(v_ids) = 0)
         or (g->>'tipo' = 'una' and cardinality(v_ids) > 1)
         or (g->>'tipo' = 'varias' and cardinality(v_ids) > (g->>'max')::integer) then
        raise exception 'Elegí bien «%» en %', g->>'nombre', p.nombre using errcode = '22023';
      end if;
      -- Un adicional deshabilitado por el gerente no puede cobrarse ni enviarse.
      if exists (
        select 1 from unnest(v_ids) as elegido(id)
        join gestlok_chat_private.opciones_stock st
          on st.sucursal_id=s.id and st.grupo_id=g->>'id' and st.valor_id=elegido.id
        where not st.disponible
      ) then
        raise exception 'Un adicional de % está agotado. Volvé a revisar tu selección.', p.nombre using errcode='P0001';
      end if;
      if cardinality(v_ids) > 0 then
        select coalesce(sum(coalesce((vv->>'extra')::numeric, 0)), 0), jsonb_agg(vv->>'nombre' order by vv->>'nombre')
          into v_unit, nombres
          from jsonb_array_elements(g->'valores') vv where vv->>'id' = any(v_ids);
        v_extra := v_extra + v_unit;
        elegidas := elegidas || jsonb_build_array(jsonb_build_object('grupo', g->>'nombre', 'valores', nombres));
      end if;
    end loop;
    v_unit := p.precio + v_extra;
    v_sub := v_sub + v_unit * v_cant;
    items := items || jsonb_build_array(jsonb_build_object('producto_id', p.id, 'nombre', p.nombre, 'cantidad', v_cant,
      'precio_unitario', v_unit, 'opciones', elegidas, 'nota', left(btrim(coalesce(it->>'nota', '')), 200),
      'importe', v_unit * v_cant));
  end loop;

  if v_sub < s.pedido_minimo then
    raise exception 'El pedido mínimo es de $ %', replace(to_char(round(s.pedido_minimo), 'FM999,999,990'), ',', '.') using errcode = 'P0001';
  end if;
  if v_entrega = 'envio' then v_envio := s.envio_costo; end if;
  v_descuento := case when v_entrega='envio' and v_pago='efectivo'
     then round(v_sub * s.descuento_efectivo_pct / 100, 2) else 0 end;
  v_total := v_sub - v_descuento + v_envio;
  if v_entrega='envio' and v_pago='efectivo' then
    if nullif(btrim(coalesce(p_pedido->>'efectivo_abona','')),'') IS NOT NULL AND coalesce(p_pedido->>'efectivo_abona','') !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' then
      raise exception 'Indique con cuánto va a abonar en efectivo' using errcode='22023';
    end if;
    -- Compatibilidad durante despliegue: cliente antiguo sin monto significa pago justo.
    v_abona := coalesce(nullif(p_pedido->>'efectivo_abona','')::numeric, v_total);
    if v_abona < v_total then raise exception 'El efectivo indicado no alcanza para cubrir el total' using errcode='22023'; end if;
    v_cambio := round(v_abona - v_total, 2);
  end if;

  if not gestlok_chat_private.consumir('ped:suc:' || s.id::text, 'dia', s.tope_pedidos_dia)
     or not gestlok_chat_private.consumir('ped:tel:' || s.id::text || ':' || v_tel, 'dia', 5)
     or not gestlok_chat_private.consumir('ped:conv:' || c.id::text, 'dia', 5) then
    raise exception 'Se alcanzó el límite de pedidos por hoy. Comunicate con el local.' using errcode='P0001';
  end if;

  update gestlok_chat_private.sucursales set ultimo_numero=ultimo_numero+1 where id=s.id returning ultimo_numero into v_num;
  insert into gestlok_chat_private.pedidos(tenant_id,sucursal_id,conversacion_id,numero,codigo,cliente_nombre,
    cliente_telefono,entrega,direccion,horario,medio_pago,nota,items,subtotal,envio,total,descuento,efectivo_abona,efectivo_cambio)
  values(s.tenant_id,s.id,c.id,v_num,s.prefijo||'-'||lpad(v_num::text,4,'0'),v_nombre,v_tel,v_entrega,
    case when v_entrega='envio' then left(v_dir,200) else '' end,left(btrim(coalesce(p_pedido->>'horario','')),60),
    v_pago,left(btrim(coalesce(p_pedido->>'nota','')),500),items,v_sub,v_envio,v_total,v_descuento,v_abona,v_cambio)
  returning * into v_ped;
  insert into gestlok_chat_private.pedido_eventos(pedido_id,evento) values(v_ped.id,'creado');
  -- Solo la función Edge aporta esta huella de navegador (jamás el número por sí solo).
  -- Los datos se guardan únicamente después de crear correctamente el pedido.
  if coalesce(p_pedido->>'perfil_hash','') ~ '^[0-9a-f]{64}
  return jsonb_build_object('ok',true,'pedido',gestlok_chat_private.pedido_publico(v_ped));
end $function$
 then
    insert into gestlok_chat_private.clientes_frecuentes
       (tenant_id,sucursal_id,navegador_hash,telefono,nombre,direccion,visitas,ultimo_pedido_at)
    values(s.tenant_id,s.id,decode(p_pedido->>'perfil_hash','hex'),v_tel,v_nombre,
       case when v_entrega='envio' then v_dir else '' end,1,now())
    on conflict (sucursal_id,navegador_hash,telefono) do update
       set nombre=excluded.nombre,
           direccion=case when btrim(excluded.direccion)<>'' then excluded.direccion
                          else gestlok_chat_private.clientes_frecuentes.direccion end,
           visitas=gestlok_chat_private.clientes_frecuentes.visitas+1,
           ultimo_pedido_at=now();
  end if;
  return jsonb_build_object('ok',true,'pedido',gestlok_chat_private.pedido_publico(v_ped));
end $function$;

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
      'total', p.total, 'programado_para', p.programado_para, 'es_prueba',to_jsonb(p)->'es_prueba', 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $function$;

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
       from (select * from gestlok_chat_private.mensajes where conversacion_id = c.id order by id desc limit 400) m), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(gestlok_chat_private.pedido_publico(p) order by p.creado_at desc)
       from (select * from gestlok_chat_private.pedidos where conversacion_id = c.id order by creado_at desc limit 5) p), '[]'::jsonb));
end $function$;

-- Los perfiles que lleven más de 24 meses sin compras no se reidentifican.
-- El borrado físico se ejecuta con el cron de limpieza existente.
