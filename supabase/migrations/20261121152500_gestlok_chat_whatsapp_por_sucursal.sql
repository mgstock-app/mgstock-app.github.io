-- GESTLOK Chat · cada sucursal muestra exclusivamente su WhatsApp propio.
-- No hay conexión de chats/pedidos a WhatsApp ni Meta; es solo un enlace externo.
alter table gestlok_chat_private.sucursales
  add column if not exists whatsapp_local text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='gestlok_chat_private.sucursales'::regclass
      and conname='gestlok_chat_whatsapp_local_formato'
  ) then
    alter table gestlok_chat_private.sucursales
      add constraint gestlok_chat_whatsapp_local_formato
      check (whatsapp_local = '' or whatsapp_local ~ '^[1-9][0-9]{7,14}$');
  end if;
end $$;

-- Números informados por la encargada para cada local. Nunca usar el contacto
-- corporativo de Mi Gusto ni reemplazar teléfonos editados por el dueño.
update gestlok_chat_private.sucursales
   set whatsapp_local = case slug
       when 'mi-gusto-munro' then '5491171446654'
       when 'mi-gusto-torcuato' then '5491176617182'
     end
 where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
   and slug in ('mi-gusto-munro','mi-gusto-torcuato')
   and whatsapp_local = '';

-- Se devuelve únicamente el número del local al abrir SU chat público.
-- Mantener todos los campos de la última versión de sucursal_publica.
create or replace function gestlok_chat_private.sucursal_publica(s gestlok_chat_private.sucursales)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object('slug', s.slug, 'nombre', s.nombre,
    'empresa', (select e.nombre_publico from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id),
    'bienvenida', s.bienvenida, 'horario', s.horario, 'direccion', s.direccion,
    'acepta_retiro', s.acepta_retiro, 'acepta_envio', s.acepta_envio, 'envio_costo', s.envio_costo,
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'descuento_efectivo_pct', s.descuento_efectivo_pct,
    'medios_pago', to_jsonb(s.medios_pago),
    'medios_pago_retiro', coalesce(to_jsonb(s.medios_pago_retiro), to_jsonb(s.medios_pago)),
    'medios_pago_envio', coalesce(to_jsonb(s.medios_pago_envio), to_jsonb(s.medios_pago)),
    'demora_retiro', s.demora_retiro, 'demora_envio', s.demora_envio,
    'atencion', gestlok_chat_private.estado_atencion(s),
    'asistente', s.ia_nombre, 'menu_interactivo', s.menu_interactivo,
    'whatsapp_local', s.whatsapp_local)
$function$;

-- Edición separada de los ajustes comerciales: solo dueño/creadora,
-- validada por tenancy/rol y versión. Ningún cliente puede invocarla.
create or replace function public.gestlok_chat_panel_whatsapp_guardar(
  p_sucursal uuid, p_whatsapp text, p_version integer)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_num text; v_s gestlok_chat_private.sucursales;
begin
  perform gestlok_chat_private.exigir(p_sucursal,'configurar');
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

revoke all on function public.gestlok_chat_panel_whatsapp_guardar(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.gestlok_chat_panel_whatsapp_guardar(uuid,text,integer)
  to authenticated;
