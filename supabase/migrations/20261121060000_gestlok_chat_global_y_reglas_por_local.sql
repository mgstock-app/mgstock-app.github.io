-- GESTLOK Chat (21/11/2026) · función GLOBAL y personalización de cada LOCAL (pedido de la dueña).
-- Lo propio de un comercio deja de estar escrito en el código y pasa a ser configuración:
--   · sucursales.menu_interactivo: pedidos por el menú interactivo (antes: fijo para Mi Gusto). Nuevos locales: sí.
--   · productos.reglas (jsonb): {cuando: {dia_semana 1-7, semana 'todas'|'ultima', desde 'HH:MM', hasta 'HH:MM'},
--     nombre, aviso, exclusiva, solo_efectivo, sin_descuento, compartir}. La base controla día/horario, efectivo y descuento.
-- Además: la foto de un reclamo se suma al mismo caso (Faltante en mi pedido / Otro reclamo) en vez de abrir otro.
-- Datos: Mi Gusto Munro y Don Torcuato quedan igual que hoy, ahora como configuración propia.
alter table gestlok_chat_private.productos add column if not exists reglas jsonb not null default '{}'::jsonb;
alter table gestlok_chat_private.productos drop constraint if exists productos_reglas_check;
alter table gestlok_chat_private.productos add constraint productos_reglas_check check (jsonb_typeof(reglas) = 'object');
alter table gestlok_chat_private.sucursales add column if not exists menu_interactivo boolean not null default false;
alter table gestlok_chat_private.sucursales alter column menu_interactivo set default true;

create or replace function gestlok_chat_private.producto_json(p gestlok_chat_private.productos)
returns jsonb language sql stable set search_path to '' as $function$
  select jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
    'descripcion', p.descripcion, 'precio', p.precio, 'activo', p.activo, 'disponible', p.disponible,
    'orden', p.orden, 'opciones', p.opciones, 'reglas', p.reglas)
$function$;

create or replace function gestlok_chat_private.sucursal_publica(s gestlok_chat_private.sucursales)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object('slug', s.slug, 'nombre', s.nombre,
    'empresa', (select e.nombre_publico from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id),
    'bienvenida', s.bienvenida, 'horario', s.horario, 'direccion', s.direccion,
    'acepta_retiro', s.acepta_retiro, 'acepta_envio', s.acepta_envio, 'envio_costo', s.envio_costo,
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'descuento_efectivo_pct', s.descuento_efectivo_pct, 'medios_pago', to_jsonb(s.medios_pago),
    'medios_pago_retiro', coalesce(to_jsonb(s.medios_pago_retiro), to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(to_jsonb(s.medios_pago_envio), to_jsonb(s.medios_pago)),
    'demora_retiro', s.demora_retiro, 'demora_envio', s.demora_envio,
    'atencion', gestlok_chat_private.estado_atencion(s),
    'asistente', s.ia_nombre, 'menu_interactivo', s.menu_interactivo)
$function$;

-- ¿Rige ahora la regla «cuando» de un producto? (hora de Argentina; igual que reglaVigente en motor.js)
create or replace function gestlok_chat_private.regla_vigente(p_reglas jsonb, p_ahora timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
  select case when jsonb_typeof(c) is distinct from 'object' then true else
    (coalesce(c->>'dia_semana', '') !~ '^[1-7]$' or extract(isodow from l) = (c->>'dia_semana')::int)
    and (coalesce(c->>'semana', 'todas') <> 'ultima' or extract(month from (l::date + 7)) <> extract(month from l::date))
    and (extract(hour from l) * 60 + extract(minute from l)) between
        (case when c->>'desde' ~ '^\d{1,2}:\d{2}$' then split_part(c->>'desde', ':', 1)::int * 60 + split_part(c->>'desde', ':', 2)::int else 0 end)
        and (case when c->>'hasta' ~ '^\d{1,2}:\d{2}$' then split_part(c->>'hasta', ':', 1)::int * 60 + split_part(c->>'hasta', ':', 2)::int else 1439 end)
  end
  from (select p_ahora at time zone 'America/Argentina/Buenos_Aires' as l, p_reglas->'cuando' as c) x
$$;
revoke all on function gestlok_chat_private.regla_vigente(jsonb, timestamptz) from public;

-- Foto del cliente: si espera la descripción de un reclamo (Faltante / Otro), va a ese mismo caso; si ya hay un
-- reclamo pendiente, se suma a él sin pisar lo que escribió el cliente.
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_adjunto(
 p_conversacion uuid,p_token_hash bytea,p_ip_hash text,p_path text,p_mime text,p_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones; mid bigint; v_tipo text;
BEGIN
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=c.id FOR UPDATE;
 IF c.cerrada_at IS NOT NULL THEN RAISE EXCEPTION 'La conversación está cerrada' USING errcode='P0001'; END IF;
 IF c.mensajes>=400 THEN RAISE EXCEPTION 'La conversación llegó a su límite' USING errcode='P0001'; END IF;
 IF p_mime NOT IN ('image/jpeg','image/png','image/webp') OR p_bytes NOT BETWEEN 1 AND 2000000
 THEN RAISE EXCEPTION 'Archivo de imagen inválido' USING errcode='22023'; END IF;
 IF p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
   OR p_path NOT LIKE (c.sucursal_id::text||'/'||c.id::text||'/%')
 THEN RAISE EXCEPTION 'Ruta de adjunto inválida' USING errcode='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='gestlok-chat-adjuntos' AND name=p_path)
 THEN RAISE EXCEPTION 'Archivo no disponible' USING errcode='P0001'; END IF;
 IF NOT gestlok_chat_private.consumir('foto:conv:'||c.id::text,'minuto',4)
 THEN RAISE EXCEPTION 'Espere antes de enviar otra imagen' USING errcode='P0001'; END IF;
 INSERT INTO gestlok_chat_private.mensajes(conversacion_id,rol,texto)
 VALUES(c.id,'cliente','Foto enviada por el cliente') RETURNING id INTO mid;
 INSERT INTO gestlok_chat_private.adjuntos(mensaje_id,tenant_id,sucursal_id,conversacion_id,path,mime,bytes)
 VALUES(mid,c.tenant_id,c.sucursal_id,c.id,p_path,p_mime,p_bytes);
 UPDATE gestlok_chat_private.conversaciones SET mensajes=mensajes+1,ultima_at=now() WHERE id=c.id;
 v_tipo := CASE WHEN c.estado->'reclamo_espera'->>'tipo' IN ('faltante','otro') THEN c.estado->'reclamo_espera'->>'tipo' END;
 IF v_tipo IS NULL AND EXISTS (SELECT 1 FROM gestlok_chat_private.reclamos r WHERE r.conversacion_id=c.id AND r.estado='pendiente') THEN
   UPDATE gestlok_chat_private.reclamos SET actualizado_at=now()
    WHERE id=(SELECT r.id FROM gestlok_chat_private.reclamos r WHERE r.conversacion_id=c.id AND r.estado='pendiente'
              ORDER BY r.actualizado_at DESC NULLS LAST LIMIT 1);
 ELSE
   -- La foto alerta al gerente aunque la conversación no tenga un reclamo previo.
   INSERT INTO gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,tipo,detalle)
   VALUES(c.tenant_id,c.sucursal_id,c.id,coalesce(v_tipo,'otro'),
     CASE v_tipo WHEN 'faltante' THEN 'Foto del pedido (faltante). El cliente está escribiendo qué le faltó.'
                 WHEN 'otro' THEN 'Foto del reclamo. El cliente está escribiendo qué sucedió.'
                 ELSE 'El cliente envió una foto o comprobante' END)
   ON CONFLICT (conversacion_id,tipo) WHERE estado='pendiente'
   DO UPDATE SET actualizado_at=now();
 END IF;
 RETURN jsonb_build_object('ok',true,'mensaje_id',mid);
END $$;

-- Pedido: igual que 20261121050000 pero con las reglas del producto en lugar del nombre «Jueves On Fire».
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
    -- Reglas de cada local (productos.reglas): día y horario de la promo, y pago solo en efectivo.
    if jsonb_typeof(p.reglas->'cuando') = 'object' and not gestlok_chat_private.regla_vigente(p.reglas, now()) then
      raise exception '% no está vigente ahora.', p.nombre using errcode = 'P0001';
    end if;
    if coalesce(p.reglas->>'solo_efectivo', '') = 'true' and v_pago <> 'efectivo' then
      raise exception '% se abona solo en efectivo.', p.nombre using errcode = '22023';
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
    -- Promo a precio final (regla sin_descuento del local): no lleva el descuento por efectivo.
    if coalesce(p.reglas->>'sin_descuento', '') = 'true' then v_sin_descuento := v_sin_descuento + v_unit * v_cant; end if;
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

drop function if exists gestlok_chat_private.es_noche_on_fire(timestamptz);

-- Configuración de Mi Gusto (Munro y Don Torcuato): lo que antes estaba fijo en el código.
update gestlok_chat_private.sucursales set menu_interactivo = true
 where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and local_id in ('munro','torcuato');
update gestlok_chat_private.productos p set reglas = jsonb_build_object(
    'cuando', jsonb_build_object('dia_semana', 4, 'semana', 'ultima', 'desde', '18:00'),
    'nombre', 'Jueves On Fire', 'aviso', '🔥 Hoy es Jueves On Fire',
    'exclusiva', true, 'solo_efectivo', true, 'sin_descuento', true), actualizado_at = now()
  from gestlok_chat_private.sucursales s
 where s.id = p.sucursal_id and s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'
   and p.nombre = 'Jueves On Fire · 12 empanadas + 3 salsas';
update gestlok_chat_private.productos p set reglas = jsonb_build_object('compartir', true), actualizado_at = now()
  from gestlok_chat_private.sucursales s
 where s.id = p.sucursal_id and s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'
   and (p.nombre like 'Promo Pareja%' or p.nombre like 'Promo Clásica%');
