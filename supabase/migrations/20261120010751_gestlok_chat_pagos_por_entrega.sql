-- GESTLOK Chat: medios de pago configurables por retiro y delivery.
-- Validación en servidor, además del selector visual.
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
    'medios_pago_retiro', coalesce(s.mensajes->'medios_pago_retiro', to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(s.mensajes->'medios_pago_envio', to_jsonb(s.medios_pago)),
    'asistente', s.ia_nombre)
$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_pedido(p_conversacion uuid, p_token_hash bytea, p_pedido jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales; p gestlok_chat_private.productos;
  it jsonb; g jsonb; sel jsonb; v jsonb; items jsonb := '[]'::jsonb; elegidas jsonb; nombres jsonb;
  v_cant integer; v_extra numeric; v_unit numeric; v_sub numeric := 0; v_envio numeric := 0; v_total numeric;
  v_nombre text; v_tel text; v_entrega text; v_dir text; v_pago text; v_num integer; v_ped gestlok_chat_private.pedidos;
  v_ids text[];
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
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
  -- La configuración opcional de cada sucursal restringe pagos según entrega.
  if jsonb_typeof(s.mensajes->('medios_pago_' || v_entrega)) = 'array'
     and not (s.mensajes->('medios_pago_' || v_entrega) ? v_pago) then
    raise exception 'Ese medio de pago no está disponible para %',
      case when v_entrega = 'envio' then 'delivery' else 'retiro en el local' end using errcode = '22023';
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
  v_total := v_sub + v_envio;

  if not gestlok_chat_private.consumir('ped:suc:' || s.id::text, 'dia', s.tope_pedidos_dia)
     or not gestlok_chat_private.consumir('ped:tel:' || s.id::text || ':' || v_tel, 'dia', 5)
     or not gestlok_chat_private.consumir('ped:conv:' || c.id::text, 'dia', 5) then
    raise exception 'Se alcanzó el límite de pedidos por hoy. Comunicate con el local.' using errcode = 'P0001';
  end if;

  update gestlok_chat_private.sucursales set ultimo_numero = ultimo_numero + 1 where id = s.id returning ultimo_numero into v_num;
  insert into gestlok_chat_private.pedidos(tenant_id, sucursal_id, conversacion_id, numero, codigo, cliente_nombre,
    cliente_telefono, entrega, direccion, horario, medio_pago, nota, items, subtotal, envio, total)
  values (s.tenant_id, s.id, c.id, v_num, s.prefijo || '-' || lpad(v_num::text, 4, '0'), v_nombre, v_tel, v_entrega,
    case when v_entrega = 'envio' then left(v_dir, 200) else '' end, left(btrim(coalesce(p_pedido->>'horario', '')), 60),
    v_pago, left(btrim(coalesce(p_pedido->>'nota', '')), 500), items, v_sub, v_envio, v_total)
  returning * into v_ped;
  insert into gestlok_chat_private.pedido_eventos(pedido_id, evento) values (v_ped.id, 'creado');
  return jsonb_build_object('ok', true, 'pedido', gestlok_chat_private.pedido_publico(v_ped));
end $function$
;
