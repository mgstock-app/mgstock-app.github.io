-- GESTLOK Chat · al terminar el pedido (listo para retirar o enviado): invitación a reseñar y mensaje de cierre.
-- Por sucursal, dentro de «mensajes»: resena_url (link de reseñas de Google del local, opcional), resena (invitación)
-- y cierre («¡Gracias por elegirnos!»). Los edita el dueño, la administradora o el gerente del local (pestaña Mensajes).
-- El link solo puede ser https y de Google, para que el chat nunca lleve al cliente a un sitio engañoso.

create or replace function gestlok_chat_private.url_resena_valida(p text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select p is not null and length(p) <= 300
    and p ~ '^https://(g\.page|maps\.app\.goo\.gl|goo\.gl|g\.co|search\.google\.com|maps\.google\.com|(www\.)?google\.com(\.ar)?)(/[^[:space:]<>"'']*)?$'
$function$;
revoke all on function gestlok_chat_private.url_resena_valida(text) from public, anon, authenticated;

create or replace function gestlok_chat_private.mensajes_validos(p jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select p is not null and jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_each(p) e
      where e.key not in ('recibido','terminado_retiro','terminado_envio','rechazado','pausado','despedida',
                          'resena_url','resena','cierre')
         or jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 600
         or (e.key = 'resena_url' and not gestlok_chat_private.url_resena_valida(e.value #>> '{}')))
$function$;
revoke all on function gestlok_chat_private.mensajes_validos(jsonb) from public, anon, authenticated;

-- Igual que antes, más: aviso claro si el link no es de Google, y los paneles anteriores (que no envían la reseña
-- ni el cierre) no los borran al guardar.
create or replace function public.gestlok_chat_panel_config_guardar(p_sucursal uuid, p_config jsonb, p_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s gestlok_chat_private.sucursales; v_medios text[]; v_nivel text;
begin
  v_nivel := gestlok_chat_private.exigir(p_sucursal, 'gestionar');
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
  if jsonb_typeof(p_config->'medios_pago') = 'array' then
    select array_agg(distinct x) into v_medios from jsonb_array_elements_text(p_config->'medios_pago') x;
  end if;
  update gestlok_chat_private.sucursales set
    activa = coalesce((p_config->>'activa')::boolean, activa),
    bienvenida = coalesce(left(p_config->>'bienvenida', 500), bienvenida),
    horario = coalesce(left(p_config->>'horario', 300), horario),
    direccion = coalesce(left(p_config->>'direccion', 200), direccion),
    acepta_retiro = coalesce((p_config->>'acepta_retiro')::boolean, acepta_retiro),
    acepta_envio = coalesce((p_config->>'acepta_envio')::boolean, acepta_envio),
    envio_costo = coalesce((p_config->>'envio_costo')::numeric, envio_costo),
    envio_zona = coalesce(left(p_config->>'envio_zona', 300), envio_zona),
    pedido_minimo = coalesce((p_config->>'pedido_minimo')::numeric, pedido_minimo),
    medios_pago = coalesce(v_medios, medios_pago),
    mensajes = case when jsonb_typeof(p_config->'mensajes') = 'object'
      then (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p_config->'mensajes') e
            where jsonb_typeof(e.value) = 'string' and length(btrim(e.value #>> '{}')) > 0)
        || (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) from jsonb_each(mensajes) k
            where k.key in ('resena_url','resena','cierre') and not (p_config->'mensajes' ? k.key))
      else mensajes end,
    ia_activa = coalesce((p_config->>'ia_activa')::boolean, ia_activa),
    ia_nombre = coalesce(left(btrim(p_config->>'ia_nombre'), 40), ia_nombre),
    ia_instrucciones = coalesce(left(p_config->>'ia_instrucciones', 2000), ia_instrucciones),
    ia_info = coalesce(left(p_config->>'ia_info', 4000), ia_info),
    version = version + 1, actualizada_at = now(), actualizada_por = auth.uid()
   where id = p_sucursal and version = p_version returning * into s;
  if s.id is null then raise exception 'Otra persona cambió la configuración. Volvé a abrirla.' using errcode = '40001'; end if;
  perform gestlok_chat_private.auditar(s.id, 'config_guardar', p_config);
  return jsonb_build_object('ok', true, 'version', s.version);
end $function$;
