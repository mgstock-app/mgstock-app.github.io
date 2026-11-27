-- Configuración por comercio: conserva los valores existentes, no conecta WhatsApp.
alter table gestlok_chat_private.sucursales
 add column if not exists dias_apertura smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
 add column if not exists carta_texto text not null default '',
 add column if not exists carta_imagen_url text not null default '',
 add column if not exists reservas_info text not null default '',
 add column if not exists ubicacion_url text not null default '';

create or replace function gestlok_chat_private.es_creadora_chat() returns boolean
 language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or lower(coalesce(auth.jwt()->>'email','')) <> 'kmu15lopez@gmail.com' then return false; end if;
 return gestlok_platform.registration_email() = 'kmu15lopez@gmail.com'
 and exists(select 1 from gestlok_platform.admins where user_id=auth.uid());
end $$;
revoke all on function gestlok_chat_private.es_creadora_chat() from public,anon,authenticated;
create or replace function gestlok_chat_private.nivel_config(p_sucursal uuid,p_minimo text) returns text
 language plpgsql stable security definer set search_path='' as $$
begin
 if gestlok_chat_private.es_creadora_chat() and exists(select 1 from gestlok_chat_private.sucursales s join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada where s.id=p_sucursal) then return 'configurar'; end if;
 return gestlok_chat_private.exigir(p_sucursal,p_minimo);
end $$;
revoke all on function gestlok_chat_private.nivel_config(uuid,text) from public,anon,authenticated;

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
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'descuento_efectivo_pct', s.descuento_efectivo_pct,
    'descuento_efectivo_entrega', s.descuento_efectivo_entrega, 'precio_efectivo_en_carta', s.precio_efectivo_en_carta,
    'medios_pago', to_jsonb(s.medios_pago),
    'medios_pago_retiro', coalesce(to_jsonb(s.medios_pago_retiro), to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(to_jsonb(s.medios_pago_envio), to_jsonb(s.medios_pago)),
    'demora_retiro', s.demora_retiro, 'demora_envio', s.demora_envio,
    'atencion', gestlok_chat_private.estado_atencion(s),
    'asistente', s.ia_nombre, 'menu_interactivo', s.menu_interactivo,
    'dias_apertura', s.dias_apertura, 'carta_texto', s.carta_texto, 'carta_imagen_url', s.carta_imagen_url, 'reservas_info', s.reservas_info, 'ubicacion_url', s.ubicacion_url,
    'whatsapp_local', s.whatsapp_local, 'carta_visual_marca', case when gestlok_chat_private.es_marca_mi_gusto(s.tenant_id) then 'mi-gusto' else null end)
$function$;

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
    where extract(isodow from v_ahora)::smallint = any(s.dias_apertura) and v_ahora::time >= (slot->>'inicio')::time and v_ahora::time < (slot->>'fin')::time)
    into v_abierto;
  v_prueba := s.prueba_hasta is not null and clock_timestamp()<s.prueba_hasta;
  select min(d.dia::date+(slot->>'inicio')::time) into v_prox
    from generate_series(v_ahora::date,v_ahora::date+7,interval '1 day') d(dia)
    cross join jsonb_array_elements(s.turnos_chat) slot
    where extract(isodow from d.dia)::smallint=any(s.dias_apertura) and d.dia::date+(slot->>'inicio')::time>v_ahora;
  return jsonb_build_object('habilitado',true,'abierto',(v_abierto or v_prueba),'modo_prueba',v_prueba,
      'proxima_apertura',v_prox at time zone 'America/Argentina/Buenos_Aires',
      'proximo_texto',case when v_prox::date=v_ahora::date then 'hoy a las ' when v_prox::date=v_ahora::date+1 then 'mañana a las ' else to_char(v_prox,'DD/MM')||' a las ' end || to_char(v_prox,'HH24:MI'));
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_config(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nivel text := gestlok_chat_private.nivel_config(p_sucursal, 'ver'); s gestlok_chat_private.sucursales;
begin
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  return gestlok_chat_private.sucursal_publica(s) || jsonb_build_object('id', s.id, 'activa', s.activa, 'prefijo', s.prefijo,
    'tope_pedidos_dia', s.tope_pedidos_dia, 'version', s.version, 'nivel', v_nivel, 'mensajes', s.mensajes,
    'turnos_chat', s.turnos_chat, 'datos_transferencia', case when v_nivel='configurar' then s.datos_transferencia else '' end, 'administradora_chat', gestlok_chat_private.es_creadora_chat(),
    'ia_activa', s.ia_activa, 'ia_nombre', s.ia_nombre, 'ia_instrucciones', s.ia_instrucciones, 'ia_info', s.ia_info);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_config_guardar(p_sucursal uuid, p_config jsonb, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; v_medios text[]; v_nivel text; v_dias smallint[]; v_turnos jsonb; v_retiro text[]; v_envio text[];
begin
  v_nivel := gestlok_chat_private.nivel_config(p_sucursal, 'gestionar');
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Datos inválidos' using errcode = '22023'; end if;
  -- El gerente edita los mensajes del asistente; los ajustes del local quedan para el dueño y la administradora.
  if v_nivel <> 'configurar' and exists (select 1 from jsonb_object_keys(p_config) k
       where k not in ('mensajes','bienvenida','ia_activa','ia_nombre','ia_instrucciones','ia_info')) then
    raise exception 'Los ajustes del local (estado, entrega, pagos, horario) los cambia el dueño' using errcode = '42501';
  end if;
  if jsonb_typeof(p_config->'mensajes'->'resena_url') = 'string' and length(btrim(p_config->'mensajes'->>'resena_url')) > 0
     and not gestlok_chat_private.url_resena_valida(p_config->'mensajes'->>'resena_url') then
    raise exception 'El link de reseñas tiene que ser de Google (g.page, maps.app.goo.gl o google.com) y empezar con https://'
      using errcode = '22023';
  end if;
  -- Validar el cambio global antes del UPDATE para informar un error útil.
  if p_config ? 'medios_pago' then
    if jsonb_typeof(p_config->'medios_pago') <> 'array' then
      raise exception 'Seleccioná los medios de pago válidos' using errcode = '22023';
    end if;
    select array_agg(distinct x) into v_medios from jsonb_array_elements_text(p_config->'medios_pago') x;
    if v_medios is null or cardinality(v_medios) not between 1 and 5 or not
       (v_medios <@ array['efectivo','transferencia','mercado_pago','debito','credito']::text[]) then
      raise exception 'Seleccioná al menos un medio de pago válido' using errcode = '22023';
    end if;
  end if;
  -- Descuento por efectivo del local (dueño y administradora).
  if p_config ? 'descuento_efectivo_pct' and (jsonb_typeof(p_config->'descuento_efectivo_pct') <> 'number'
     or (p_config->>'descuento_efectivo_pct')::numeric not between 0 and 50) then
    raise exception 'El descuento por pago en efectivo tiene que ser de 0 a 50 %%' using errcode = '22023';
  end if;
  if p_config ? 'descuento_efectivo_entrega' and coalesce(p_config->>'descuento_efectivo_entrega', '') not in ('envio', 'retiro', 'ambas') then
    raise exception 'Elegí si el descuento por efectivo vale con envío, retiro o ambos' using errcode = '22023';
  end if;
  -- Horarios de la sucursal en Argentina. Sin turnos conserva modo manual.
  if p_config ? 'dias_apertura' then
    if jsonb_typeof(p_config->'dias_apertura') <> 'array' then raise exception 'Elegí los días de apertura' using errcode='22023'; end if;
    select array_agg(distinct x::smallint order by x::smallint) into v_dias from jsonb_array_elements_text(p_config->'dias_apertura') x;
    if v_dias is null or not (v_dias <@ array[1,2,3,4,5,6,7]::smallint[]) then raise exception 'Elegí al menos un día válido' using errcode='22023'; end if;
  end if;
  if p_config ? 'turnos_chat' then
    v_turnos := p_config->'turnos_chat';
    if jsonb_typeof(v_turnos) <> 'array' or jsonb_array_length(v_turnos)>3 then raise exception 'Hasta tres turnos por día' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_turnos) t where coalesce(t->>'inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(t->>'fin','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or t->>'inicio'>=t->>'fin') then raise exception 'Cada turno debe iniciar y finalizar el mismo día, con horario válido' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_turnos) with ordinality a(x,i) join jsonb_array_elements(v_turnos) with ordinality b(y,j) on a.i<b.j where a.x->>'inicio'<b.y->>'fin' and b.y->>'inicio'<a.x->>'fin') then raise exception 'Los turnos no pueden superponerse' using errcode='22023'; end if;
  end if;
  if p_config ? 'medios_pago_retiro' then
    select array_agg(distinct x) into v_retiro from jsonb_array_elements_text(p_config->'medios_pago_retiro') x;
    if v_retiro is null or not (v_retiro <@ array['efectivo','transferencia','mercado_pago','debito','credito']::text[]) then raise exception 'Elegí pagos válidos para retiro' using errcode='22023'; end if;
  end if;
  if p_config ? 'medios_pago_envio' then
    select array_agg(distinct x) into v_envio from jsonb_array_elements_text(p_config->'medios_pago_envio') x;
    if v_envio is null or not (v_envio <@ array['efectivo','transferencia','mercado_pago','debito','credito']::text[]) then raise exception 'Elegí pagos válidos para delivery' using errcode='22023'; end if;
  end if;
  if v_medios is not null and (v_retiro is not null and not(v_retiro<@v_medios) or v_envio is not null and not(v_envio<@v_medios)) then raise exception 'Los medios de retiro y delivery deben estar habilitados' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each_text(p_config) k where k.key in ('carta_imagen_url','ubicacion_url') and k.value<>'' and (length(k.value)>1500 or k.value !~ '^https://[^[:space:]]+$')) then raise exception 'Ingresá una URL HTTPS válida' using errcode='22023'; end if;
  update gestlok_chat_private.sucursales set
    dias_apertura=coalesce(v_dias,dias_apertura), turnos_chat=coalesce(v_turnos,turnos_chat),
    carta_texto=coalesce(left(p_config->>'carta_texto',6000),carta_texto),
    carta_imagen_url=coalesce(left(p_config->>'carta_imagen_url',1500),carta_imagen_url),
    ubicacion_url=coalesce(left(p_config->>'ubicacion_url',1500),ubicacion_url),
    reservas_info=coalesce(left(p_config->>'reservas_info',500),reservas_info),
    datos_transferencia=coalesce(left(p_config->>'datos_transferencia',700),datos_transferencia),
    activa = coalesce((p_config->>'activa')::boolean, activa),
    descuento_efectivo_pct = coalesce(round((p_config->>'descuento_efectivo_pct')::numeric, 2), descuento_efectivo_pct),
    descuento_efectivo_entrega = coalesce(p_config->>'descuento_efectivo_entrega', descuento_efectivo_entrega),
    precio_efectivo_en_carta = coalesce((p_config->>'precio_efectivo_en_carta')::boolean, precio_efectivo_en_carta),
    bienvenida = coalesce(left(p_config->>'bienvenida', 500), bienvenida),
    horario = coalesce(left(p_config->>'horario', 300), horario),
    direccion = coalesce(left(p_config->>'direccion', 200), direccion),
    acepta_retiro = coalesce((p_config->>'acepta_retiro')::boolean, acepta_retiro),
    acepta_envio = coalesce((p_config->>'acepta_envio')::boolean, acepta_envio),
    envio_costo = coalesce((p_config->>'envio_costo')::numeric, envio_costo),
    envio_zona = coalesce(left(p_config->>'envio_zona', 300), envio_zona),
    pedido_minimo = coalesce((p_config->>'pedido_minimo')::numeric, pedido_minimo),
    medios_pago = coalesce(v_medios, medios_pago),
    -- Reconciliar opciones de retiro/envío con los medios generales.
    medios_pago_retiro = case when v_retiro is not null then v_retiro when v_medios is null or medios_pago_retiro is null then medios_pago_retiro
      else coalesce((select array_agg(u.metodo order by u.orden)
        from unnest(medios_pago_retiro) with ordinality as u(metodo, orden)
        where u.metodo = any(v_medios)), v_medios) end,
    medios_pago_envio = case when v_envio is not null then v_envio when v_medios is null or medios_pago_envio is null then medios_pago_envio
      else coalesce((select array_agg(u.metodo order by u.orden)
        from unnest(medios_pago_envio) with ordinality as u(metodo, orden)
        where u.metodo = any(v_medios)), v_medios) end,
    mensajes = case when jsonb_typeof(p_config->'mensajes') = 'object'
      then (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p_config->'mensajes') e
            where jsonb_typeof(e.value) = 'string' and length(btrim(e.value #>> '{}')) > 0)
        || (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) from jsonb_each(mensajes) k
            where k.key in ('resena_url','resena','cierre','sugerencia') and not (p_config->'mensajes' ? k.key))
      else mensajes end,
    ia_activa = coalesce((p_config->>'ia_activa')::boolean, ia_activa),
    ia_nombre = coalesce(left(btrim(p_config->>'ia_nombre'), 40), ia_nombre),
    ia_instrucciones = coalesce(left(p_config->>'ia_instrucciones', 2000), ia_instrucciones),
    ia_info = coalesce(left(p_config->>'ia_info', 4000), ia_info),
    version = version + 1, actualizada_at = now(), actualizada_por = auth.uid()
   where id = p_sucursal and version = p_version returning * into s;
  if s.id is null then raise exception 'Otra persona cambió la configuración. Volvé a abrirla.' using errcode = '40001'; end if;
  perform gestlok_chat_private.auditar(s.id, 'config_guardar', p_config - 'datos_transferencia');
  return jsonb_build_object('ok', true, 'version', s.version);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_admin_whatsapp_premium(p_accion text DEFAULT 'listar'::text, p_tenant uuid DEFAULT NULL::uuid, p_local text DEFAULT NULL::text, p_numeros text[] DEFAULT NULL::text[], p_id uuid DEFAULT NULL::uuid, p_habilitada boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := gestlok_platform.require_admin();
  v_raw text;
  v_num text;
  v_row gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
begin
  if not gestlok_chat_private.es_creadora_chat() then raise exception 'Habilitación exclusiva de la administradora' using errcode='42501'; end if;
  -- Esta RPC es la única vía de configuración: ni gerente ni dueño pueden habilitar Premium.
  if p_accion = 'agregar' then
    if not exists (select 1 from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local) then
      raise exception 'Seleccioná un local existente de esa empresa.' using errcode='22023';
    end if;
    if coalesce(cardinality(p_numeros),0) not between 1 and 50 then
      raise exception 'Ingresá entre 1 y 50 números por operación.' using errcode='22023';
    end if;
    foreach v_raw in array p_numeros loop
      if v_raw is null or length(v_raw)>60 or v_raw !~ '^[+0-9 ()-]+$' then
        raise exception 'Número inválido. Incluí el código de país con +.' using errcode='22023';
      end if;
      v_num := regexp_replace(v_raw, '[ ()-]', '', 'g');
      if v_num !~ '^\+[1-9][0-9]{7,14}$' or (v_num like '+54%' and v_num !~ '^\+54(9)?[0-9]{10}$') then
        raise exception 'Número inválido. Usá formato internacional, por ejemplo +54 9 11…' using errcode='22023';
      end if;
      insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
        values(p_tenant,p_local,v_num,v_admin,v_admin)
        on conflict(numero_clave) do nothing;
      if not found then
        raise exception 'Uno de los números ya está registrado. Revisá el listado antes de volver a cargar.' using errcode='23505';
      end if;
    end loop;
  elsif p_accion = 'estado' then
    if p_id is null or p_habilitada is null then raise exception 'Estado inválido.' using errcode='22023'; end if;
    select * into v_row from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p_id for update;
    if not found then raise exception 'Habilitación inexistente.' using errcode='P0002'; end if;
    if p_habilitada and not exists (select 1 from public.docs d where d.tenant_id=v_row.tenant_id and d.col='locales' and d.id=v_row.local_id) then
      raise exception 'El local ya no existe. No se puede reactivar.' using errcode='22023';
    end if;
    update gestlok_chat_private.whatsapp_premium_habilitaciones
      set habilitada=p_habilitada,actualizada_at=now(),actualizada_por=v_admin where id=p_id;
  elsif p_accion is distinct from 'listar' then
    raise exception 'Acción inválida.' using errcode='22023';
  end if;
  return jsonb_build_object(
    'locales', coalesce((select jsonb_agg(jsonb_build_object(
      'tenant_id',d.tenant_id,'local_id',d.id,
      'sucursal_id',(select s.id from gestlok_chat_private.sucursales s where s.tenant_id=d.tenant_id and s.local_id=d.id limit 1),
      'empresa',coalesce(e.nombre_publico,t.code),'nombre',coalesce(nullif(btrim(d.data->>'nombre'),''),d.id)
    ) order by coalesce(e.nombre_publico,t.code),d.data->>'nombre',d.id)
      from public.docs d join gestlok_tenancy.tenants t on t.id=d.tenant_id
      left join gestlok_chat_private.empresas e on e.tenant_id=d.tenant_id where d.col='locales'),'[]'::jsonb),
    'numeros',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'tenant_id',h.tenant_id,'local_id',h.local_id,'numero',h.numero,'habilitada',h.habilitada,
      'local_existe',d.id is not null,'nombre',coalesce(nullif(btrim(d.data->>'nombre'),''),h.local_id),
      'empresa',coalesce(e.nombre_publico,t.code),'actualizada_at',h.actualizada_at
    ) order by coalesce(e.nombre_publico,t.code),h.local_id,h.numero)
      from gestlok_chat_private.whatsapp_premium_habilitaciones h
      join gestlok_tenancy.tenants t on t.id=h.tenant_id
      left join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
      left join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id),'[]'::jsonb),
    'conexion_meta','pendiente'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_whatsapp_guardar(p_sucursal uuid, p_whatsapp text, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_num text; v_s gestlok_chat_private.sucursales;
begin
  if not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo la administradora puede cambiar el número de WhatsApp' using errcode='42501'; end if;
  perform gestlok_chat_private.nivel_config(p_sucursal,'configurar');
  v_num := regexp_replace(coalesce(p_whatsapp,''),'[^0-9]','','g');
  if v_num <> '' and v_num !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Número de WhatsApp inválido: use el código de país y de área'
      using errcode='22023';
  end if;
  update gestlok_chat_private.sucursales
     set whatsapp_local = v_num, version = version + 1,
         actualizada_at = now(), actualizada_por = auth.uid()
   where id = p_sucursal and version = p_version
   returning * into v_s;
  if v_s.id is null then
    raise exception 'Otra persona cambió la configuración. Volvé a abrirla.'
      using errcode='40001';
  end if;
  perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_guardar',
    jsonb_build_object('numero',v_num));
  return jsonb_build_object('ok',true,'version',v_s.version);
end $function$;


-- Solo imágenes de carta destinadas explícitamente al público. No usar para documentos ni comprobantes.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('gestlok-chat-cartas','gestlok-chat-cartas',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create or replace function public.gestlok_chat_puede_subir_carta(p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$' then return false; end if;
 v_id:=split_part(p_path,'/',1)::uuid;
 return gestlok_chat_private.nivel_config(v_id,'configurar')='configurar';
exception when invalid_text_representation or insufficient_privilege then return false;
end $$;
revoke all on function public.gestlok_chat_puede_subir_carta(text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_puede_subir_carta(text) to authenticated;
create policy gestlok_chat_cartas_subir on storage.objects for insert to authenticated
 with check(bucket_id='gestlok-chat-cartas' and public.gestlok_chat_puede_subir_carta(name));

