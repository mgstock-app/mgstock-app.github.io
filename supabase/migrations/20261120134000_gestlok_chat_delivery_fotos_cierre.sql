-- GESTLOK Chat: delivery, transferencia de gerente, comprobantes privados y cierre manual.
-- Aislamiento: RLS en Storage, token público solo en funciones service_role y permiso gestionar en panel.
ALTER TABLE gestlok_chat_private.sucursales ADD COLUMN IF NOT EXISTS descuento_efectivo_pct numeric(5,2) NOT NULL DEFAULT 0
  CHECK (descuento_efectivo_pct BETWEEN 0 AND 100);
ALTER TABLE gestlok_chat_private.sucursales ADD COLUMN IF NOT EXISTS datos_transferencia text NOT NULL DEFAULT ''
  CHECK (length(datos_transferencia)<=700);
ALTER TABLE gestlok_chat_private.pedidos ADD COLUMN IF NOT EXISTS descuento numeric(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0);
ALTER TABLE gestlok_chat_private.pedidos ADD COLUMN IF NOT EXISTS efectivo_abona numeric(12,2) CHECK (efectivo_abona > 0);
ALTER TABLE gestlok_chat_private.pedidos ADD COLUMN IF NOT EXISTS efectivo_cambio numeric(12,2) CHECK (efectivo_cambio >= 0);
ALTER TABLE gestlok_chat_private.conversaciones ADD COLUMN IF NOT EXISTS cerrada_at timestamptz;
ALTER TABLE gestlok_chat_private.conversaciones ADD COLUMN IF NOT EXISTS cerrada_por uuid;

-- El descuento es exclusivo de delivery Mi Gusto en efectivo, aplicado a productos (no envío).
UPDATE gestlok_chat_private.sucursales SET descuento_efectivo_pct=10,
 datos_transferencia = CASE slug
  WHEN 'mi-gusto-torcuato' THEN E'Le envio los datos para transferir!\nAlias: migusto.torcuato\nTitular: Gisela Alejandra Oppenheimer\nCuando pueda necesitamos que nos envie el comprobante por este medio! Muchas gracias'
  WHEN 'mi-gusto-munro' THEN E'Le envio los datos para transferir!\nAlias: migustomunro\nTitular: Gisela Alejandra Oppenheimer\nCuando pueda necesitamos que nos envie el comprobante por este medio! Muchas gracias'
  ELSE datos_transferencia END
WHERE slug IN ('mi-gusto-torcuato','mi-gusto-munro');

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('gestlok-chat-adjuntos','gestlok-chat-adjuntos',false,2000000,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestlok_chat_private.adjuntos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mensaje_id bigint UNIQUE NOT NULL REFERENCES gestlok_chat_private.mensajes(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL, sucursal_id uuid NOT NULL,
 conversacion_id uuid NOT NULL REFERENCES gestlok_chat_private.conversaciones(id) ON DELETE CASCADE,
 path text UNIQUE NOT NULL,
 mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
 bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 2000000),
 creado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gchat_adjuntos_conv ON gestlok_chat_private.adjuntos(conversacion_id,creado_at);
ALTER TABLE gestlok_chat_private.adjuntos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gestlok_chat_private.adjuntos FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_chat_puede_ver_foto(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM gestlok_chat_private.adjuntos a WHERE a.path=p_path
   AND gestlok_chat_private.nivel(a.sucursal_id) IN ('gestionar','configurar')
 )
$$;
REVOKE ALL ON FUNCTION public.gestlok_chat_puede_ver_foto(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_chat_puede_ver_foto(text) TO authenticated;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='gestlok_chat_manager_read_own_photos') THEN
  CREATE POLICY gestlok_chat_manager_read_own_photos ON storage.objects FOR SELECT TO authenticated
   USING (bucket_id='gestlok-chat-adjuntos' AND public.gestlok_chat_puede_ver_foto(name));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_adjunto(
 p_conversacion uuid,p_token_hash bytea,p_ip_hash text,p_path text,p_mime text,p_bytes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones; mid bigint;
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
 -- La foto alerta al gerente aunque la conversación no tenga un reclamo previo.
 INSERT INTO gestlok_chat_private.reclamos(tenant_id,sucursal_id,conversacion_id,tipo,detalle)
 VALUES(c.tenant_id,c.sucursal_id,c.id,'otro','El cliente envió una foto o comprobante')
 ON CONFLICT (conversacion_id,tipo) WHERE estado='pendiente'
 DO UPDATE SET actualizado_at=now(),detalle=EXCLUDED.detalle;
 RETURN jsonb_build_object('ok',true,'mensaje_id',mid);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_mis_adjuntos(p_conversacion uuid,p_token_hash bytea)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones;
BEGIN
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('mensaje_id',a.mensaje_id,'path',a.path) ORDER BY a.mensaje_id)
 FROM (SELECT mensaje_id,path FROM gestlok_chat_private.adjuntos WHERE conversacion_id=c.id ORDER BY mensaje_id DESC LIMIT 40) a),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_cierre(p_conversacion uuid,p_token_hash bytea)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones;
BEGIN
 c:=gestlok_chat_private.conversacion_de(p_conversacion,p_token_hash);
 RETURN jsonb_build_object('cerrada',c.cerrada_at IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_estado_conversacion(p_conversacion uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
BEGIN
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=p_conversacion;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Conversación inexistente' USING errcode='P0002'; END IF;
 PERFORM gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 SELECT * INTO s FROM gestlok_chat_private.sucursales WHERE id=c.sucursal_id;
 RETURN jsonb_build_object('cerrada',c.cerrada_at IS NOT NULL,
   'puede_enviar_transferencia',length(btrim(s.datos_transferencia))>0);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_enviar_transferencia(p_conversacion uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
BEGIN
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=p_conversacion FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Conversación inexistente' USING errcode='P0002'; END IF;
 PERFORM gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 IF c.cerrada_at IS NOT NULL THEN RAISE EXCEPTION 'La conversación ya está cerrada' USING errcode='P0001'; END IF;
 SELECT * INTO s FROM gestlok_chat_private.sucursales WHERE id=c.sucursal_id;
 IF length(btrim(s.datos_transferencia))<12 THEN RAISE EXCEPTION 'El local todavía no configuró los datos de transferencia' USING errcode='P0001'; END IF;
 IF c.mensajes>=400 THEN RAISE EXCEPTION 'La conversación llegó a su límite' USING errcode='P0001'; END IF;
 INSERT INTO gestlok_chat_private.mensajes(conversacion_id,rol,texto) VALUES(c.id,'local',s.datos_transferencia);
 UPDATE gestlok_chat_private.conversaciones SET mensajes=mensajes+1,ultima_at=now() WHERE id=c.id;
 PERFORM gestlok_chat_private.auditar(c.sucursal_id,'enviar_datos_transferencia',jsonb_build_object('conversacion',c.id));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_cerrar_conversacion(p_conversacion uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c gestlok_chat_private.conversaciones;
BEGIN
 SELECT * INTO c FROM gestlok_chat_private.conversaciones WHERE id=p_conversacion FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Conversación inexistente' USING errcode='P0002'; END IF;
 PERFORM gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 IF c.cerrada_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ya_cerrada',true); END IF;
 UPDATE gestlok_chat_private.conversaciones SET cerrada_at=now(),cerrada_por=auth.uid(),
   ultima_at=now(),mensajes=mensajes+1 WHERE id=c.id;
 INSERT INTO gestlok_chat_private.mensajes(conversacion_id,rol,texto)
 VALUES(c.id,'local','La conversación fue finalizada por el local. Puede iniciar una nueva consulta cuando lo necesite.');
 UPDATE gestlok_chat_private.reclamos SET estado='respondido',actualizado_at=now(),
  respondido_at=coalesce(respondido_at,now()),respondido_por=coalesce(respondido_por,auth.uid())
 WHERE conversacion_id=c.id AND estado='pendiente';
 PERFORM gestlok_chat_private.auditar(c.sucursal_id,'cerrar_conversacion',jsonb_build_object('conversacion',c.id));
 RETURN jsonb_build_object('ok',true,'cerrada',true);
END $$;

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
    if p_pedido ? 'efectivo_abona' AND coalesce(p_pedido->>'efectivo_abona','') !~ '^[0-9]{1,8}([.][0-9]{1,2})?$' then
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
  return jsonb_build_object('ok',true,'pedido',gestlok_chat_private.pedido_publico(v_ped));
end $function$;

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
    'medio_pago', p.medio_pago, 'programado_para', p.programado_para, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at)
$function$;

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
      'cliente_telefono', p.cliente_telefono, 'conversacion_id', p.conversacion_id, 'entrega', p.entrega, 'direccion', p.direccion, 'horario', p.horario,
      'medio_pago', p.medio_pago, 'descuento', p.descuento, 'efectivo_abona', p.efectivo_abona,
      'efectivo_cambio', p.efectivo_cambio, 'nota', p.nota, 'items', p.items, 'subtotal', p.subtotal, 'envio', p.envio,
      'total', p.total, 'programado_para', p.programado_para, 'es_prueba',to_jsonb(p)->'es_prueba', 'creado_at', p.creado_at, 'decidido_at', p.decidido_at, 'confirmado_at', p.confirmado_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_conversaciones(p_sucursal uuid, p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'creada_at', c.creada_at, 'ultima_at', c.ultima_at,
      'mensajes', c.mensajes, 'cerrada_at', c.cerrada_at,
      'ultimo', (select m.texto from gestlok_chat_private.mensajes m where m.conversacion_id = c.id order by m.id desc limit 1),
      'pedido', (select p.codigo || ' · ' || p.estado from gestlok_chat_private.pedidos p where p.conversacion_id = c.id order by p.creado_at desc limit 1))
      order by c.ultima_at desc)
    from (select * from gestlok_chat_private.conversaciones x where x.sucursal_id = p_sucursal and x.mensajes > 0
          order by x.ultima_at desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) c), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_conversacion(p_conversacion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from gestlok_chat_private.conversaciones where id = p_conversacion;
  perform gestlok_chat_private.exigir(v_suc, 'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object('rol', m.rol, 'texto', m.texto, 'at', m.creado_at,
      'adjunto', (select jsonb_build_object('path', a.path, 'mime', a.mime) from gestlok_chat_private.adjuntos a where a.mensaje_id=m.id)) order by m.id)
    from (select * from gestlok_chat_private.mensajes where conversacion_id = p_conversacion order by id desc limit 200) m), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_responder(p_conversacion uuid, p_texto text, p_reclamo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; v_texto text:=btrim(coalesce(p_texto,''));
begin
 select * into c from gestlok_chat_private.conversaciones where id=p_conversacion for update;
 if c.id is null then raise exception 'Conversación inexistente' using errcode='P0002';end if;
 if c.cerrada_at is not null then raise exception 'La conversación ya está cerrada' using errcode='P0001'; end if;
 perform gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 if length(v_texto) not between 2 and 1000 then
    raise exception 'Escribí una respuesta entre 2 y 1000 caracteres' using errcode='22023';
 end if;
 if c.mensajes>=400 then raise exception 'La conversación llegó a su límite' using errcode='P0001';end if;
 if p_reclamo is not null and not exists(select 1 from gestlok_chat_private.reclamos r
  where r.id=p_reclamo and r.conversacion_id=c.id and r.sucursal_id=c.sucursal_id
   and r.estado='pendiente') then
    raise exception 'El reclamo ya fue cerrado o no corresponde a esta conversación' using errcode='P0001';
 end if;
 insert into gestlok_chat_private.mensajes(conversacion_id,rol,texto) values(c.id,'local',v_texto);
 update gestlok_chat_private.conversaciones set ultima_at=now(),mensajes=mensajes+1 where id=c.id;
 if p_reclamo is not null then
  update gestlok_chat_private.reclamos set estado='pendiente',
    respondido_at=now(),respondido_por=auth.uid(),actualizado_at=now()
  where id=p_reclamo and sucursal_id=c.sucursal_id and conversacion_id=c.id and estado='pendiente';
 end if;
 perform gestlok_chat_private.auditar(c.sucursal_id,'soporte_respuesta',
  jsonb_build_object('conversacion',c.id,'reclamo',p_reclamo,'respuesta_enviada',p_reclamo is not null));
 return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_turno(p_conversacion uuid, p_token_hash bytea, p_ip_hash text, p_cliente text, p_respuesta text, p_estado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  if c.cerrada_at is not null then raise exception 'La conversación está cerrada. Iniciá una nueva.' using errcode='P0001'; end if;
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if c.mensajes >= 400 then
    raise exception 'Esta conversación llegó a su límite. Abrí una nueva.' using errcode = 'P0001';
  end if;
  if not gestlok_chat_private.consumir('msg:ip:' || left(coalesce(p_ip_hash, ''), 64), 'minuto', 20)
     or not gestlok_chat_private.consumir('msg:conv:' || c.id::text, 'minuto', 15)
     or not gestlok_chat_private.consumir('msg:suc:' || s.id::text, 'dia', s.tope_mensajes_dia) then
    raise exception 'Estás escribiendo muy rápido. Esperá un momento.' using errcode = 'P0001';
  end if;
  if p_estado is null or jsonb_typeof(p_estado) <> 'object' or pg_column_size(p_estado) >= 24000 then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_cliente, ''))) > 0 then
    insert into gestlok_chat_private.mensajes(conversacion_id, rol, texto) values (c.id, 'cliente', left(btrim(p_cliente), 2000));
  end if;
  if length(btrim(coalesce(p_respuesta, ''))) > 0 then
    insert into gestlok_chat_private.mensajes(conversacion_id, rol, texto) values (c.id, 'asistente', left(btrim(p_respuesta), 2000));
  end if;
  update gestlok_chat_private.conversaciones
     set estado = p_estado, ultima_at = now(),
         mensajes = mensajes + (case when length(btrim(coalesce(p_cliente, ''))) > 0 then 1 else 0 end)
                             + (case when length(btrim(coalesce(p_respuesta, ''))) > 0 then 1 else 0 end)
   where id = c.id;
  return jsonb_build_object('ok', true);
end $function$;

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
  if c.cerrada_at is not null then raise exception 'La conversación está cerrada. Iniciá una nueva.' using errcode='P0001'; end if;
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
end $function$;

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
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'descuento_efectivo_pct', s.descuento_efectivo_pct, 'medios_pago', to_jsonb(s.medios_pago),
    'medios_pago_retiro', coalesce(to_jsonb(s.medios_pago_retiro), to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(to_jsonb(s.medios_pago_envio), to_jsonb(s.medios_pago)),
    'demora_retiro', s.demora_retiro, 'demora_envio', s.demora_envio,
    'atencion', gestlok_chat_private.estado_atencion(s),
    'asistente', s.ia_nombre)
$function$;

REVOKE ALL ON FUNCTION public.gestlok_chat_srv_adjunto(uuid,bytea,text,text,text,integer),
  public.gestlok_chat_srv_mis_adjuntos(uuid,bytea),public.gestlok_chat_srv_cierre(uuid,bytea)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_chat_srv_adjunto(uuid,bytea,text,text,text,integer),
  public.gestlok_chat_srv_mis_adjuntos(uuid,bytea),public.gestlok_chat_srv_cierre(uuid,bytea) TO service_role;
REVOKE ALL ON FUNCTION public.gestlok_chat_panel_estado_conversacion(uuid),
  public.gestlok_chat_panel_enviar_transferencia(uuid),public.gestlok_chat_panel_cerrar_conversacion(uuid)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_chat_panel_estado_conversacion(uuid),
  public.gestlok_chat_panel_enviar_transferencia(uuid),public.gestlok_chat_panel_cerrar_conversacion(uuid) TO authenticated;
