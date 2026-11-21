-- GESTLOK Chat · Mi Gusto (21/11/2026): control en la base de la regla «Jueves On Fire» (pedido de la dueña: «es muy
-- importante esta regla»). La promo de $39.500 solo se puede pedir el último jueves de cada mes desde las 18:00 (hora de
-- Argentina); el resto de los días la base rechaza el pedido aunque una versión vieja del chat la mostrara.
-- El chat (motor.js, carteleraDelDia) ya la oculta fuera de esa noche; esto es el doble control.
create or replace function gestlok_chat_private.es_noche_on_fire(p_ahora timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
  select extract(isodow from l) = 4 and extract(hour from l) >= 18
     and extract(month from (l::date + 7)) <> extract(month from l::date)
    from (select p_ahora at time zone 'America/Argentina/Buenos_Aires' as l) x
$$;
revoke all on function gestlok_chat_private.es_noche_on_fire(timestamptz) from public;

-- Igual a 20261121040000_gestlok_chat_on_fire_sin_descuento.sql + el control de arriba.
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_pedido(p_conversacion uuid, p_token_hash bytea, p_pedido jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales; p gestlok_chat_private.productos;
  it jsonb; g jsonb; sel jsonb; v jsonb; items jsonb := '[]'::jsonb; elegidas jsonb; nombres jsonb;
  v_cant integer; v_extra numeric; v_unit numeric; v_sub numeric := 0; v_envio numeric := 0; v_total numeric; v_descuento numeric := 0; v_sin_descuento numeric := 0; v_abona numeric; v_cambio numeric;
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
    -- Mi Gusto · «Jueves On Fire» ($39.500): solo el último jueves de cada mes desde las 18:00 (Argentina).
    if p.nombre ~* '\mjueves on fire\M' and not gestlok_chat_private.es_noche_on_fire(now()) then
      raise exception 'La promo Jueves On Fire es exclusiva del último jueves de cada mes desde las 18:00.' using errcode = 'P0001';
    end if;
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
    -- Mi Gusto · «Jueves On Fire»: precio final de promo, sin el descuento por efectivo.
    if p.nombre ~* '\mjueves on fire\M' then v_sin_descuento := v_sin_descuento + v_unit * v_cant; end if;
    items := items || jsonb_build_array(jsonb_build_object('producto_id', p.id, 'nombre', p.nombre, 'cantidad', v_cant,
      'precio_unitario', v_unit, 'opciones', elegidas, 'nota', left(btrim(coalesce(it->>'nota', '')), 200),
      'importe', v_unit * v_cant));
  end loop;

  if v_sub < s.pedido_minimo then
    raise exception 'El pedido mínimo es de $ %', replace(to_char(round(s.pedido_minimo), 'FM999,999,990'), ',', '.') using errcode = 'P0001';
  end if;
  if v_entrega = 'envio' then v_envio := s.envio_costo; end if;
  v_descuento := case when v_entrega='envio' and v_pago='efectivo'
     then round((v_sub - v_sin_descuento) * s.descuento_efectivo_pct / 100, 2) else 0 end;
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
  if length(coalesce(p_pedido->>'perfil_hash',''))=64
     and coalesce(p_pedido->>'perfil_hash','') ~ '^[0-9a-f]{64}' then
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
