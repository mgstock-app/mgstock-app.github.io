-- Asistencia de configuración: la creadora verificada puede editar sólo el catálogo de comercios habilitados.
-- Mantiene los controles de sucursal, validaciones, auditoría, grants y permisos operativos existentes.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_catalogo(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nivel text := gestlok_chat_private.nivel_config(p_sucursal, 'ver');
begin
  return gestlok_chat_private.catalogo(p_sucursal, false) || jsonb_build_object('nivel', v_nivel);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_categoria_guardar(p_sucursal uuid, p_id uuid, p_nombre text, p_orden integer DEFAULT 0, p_activa boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; v_id uuid;
begin
  perform gestlok_chat_private.nivel_config(p_sucursal, 'gestionar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  if p_id is null then
    insert into gestlok_chat_private.categorias(tenant_id, sucursal_id, nombre, orden, activa)
    values (s.tenant_id, s.id, btrim(p_nombre), coalesce(p_orden, 0), coalesce(p_activa, true)) returning id into v_id;
  else
    update gestlok_chat_private.categorias set nombre = btrim(p_nombre), orden = coalesce(p_orden, 0), activa = coalesce(p_activa, true)
     where id = p_id and sucursal_id = s.id returning id into v_id;
    if v_id is null then raise exception 'Categoría no encontrada' using errcode = 'P0002'; end if;
  end if;
  perform gestlok_chat_private.auditar(s.id, 'categoria_guardar', jsonb_build_object('id', v_id, 'nombre', btrim(p_nombre)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_producto_guardar(p_sucursal uuid, p_producto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; v_id uuid; v_cat uuid; v_antes jsonb; v_precio numeric;
begin
  perform gestlok_chat_private.nivel_config(p_sucursal, 'gestionar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  if p_producto is null or jsonb_typeof(p_producto) <> 'object' then raise exception 'Datos inválidos' using errcode = '22023'; end if;
  v_cat := case when coalesce(p_producto->>'categoria_id', '') ~ '^[0-9a-f-]{36}$' then (p_producto->>'categoria_id')::uuid end;
  if v_cat is not null and not exists (select 1 from gestlok_chat_private.categorias where id = v_cat and sucursal_id = s.id) then
    raise exception 'Categoría de otra sucursal' using errcode = '42501';
  end if;
  v_precio := case when jsonb_typeof(p_producto->'precio') = 'number' then (p_producto->>'precio')::numeric end;
  if v_precio is null then raise exception 'Falta el precio' using errcode = '22023'; end if;
  if coalesce(p_producto->>'id', '') ~ '^[0-9a-f-]{36}$' then
    select gestlok_chat_private.producto_json(p) into v_antes from gestlok_chat_private.productos p
     where p.id = (p_producto->>'id')::uuid and p.sucursal_id = s.id;
    if v_antes is null then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
    update gestlok_chat_private.productos set categoria_id = v_cat, nombre = btrim(p_producto->>'nombre'),
      descripcion = btrim(coalesce(p_producto->>'descripcion', '')), precio = round(v_precio, 2),
      activo = coalesce((p_producto->>'activo')::boolean, true), disponible = coalesce((p_producto->>'disponible')::boolean, true),
      orden = coalesce((p_producto->>'orden')::integer, 0), opciones = coalesce(p_producto->'opciones', '[]'::jsonb),
      reglas = case when p_producto ? 'reglas' then gestlok_chat_private.reglas_limpias(p_producto->'reglas') else reglas end,
      actualizado_at = now()
     where id = (p_producto->>'id')::uuid and sucursal_id = s.id returning id into v_id;
  else
    insert into gestlok_chat_private.productos(tenant_id, sucursal_id, categoria_id, nombre, descripcion, precio, activo, disponible, orden, opciones, reglas)
    values (s.tenant_id, s.id, v_cat, btrim(p_producto->>'nombre'), btrim(coalesce(p_producto->>'descripcion', '')), round(v_precio, 2),
      coalesce((p_producto->>'activo')::boolean, true), coalesce((p_producto->>'disponible')::boolean, true),
      coalesce((p_producto->>'orden')::integer, 0), coalesce(p_producto->'opciones', '[]'::jsonb),
      gestlok_chat_private.reglas_limpias(p_producto->'reglas'))
    returning id into v_id;
  end if;
  perform gestlok_chat_private.auditar(s.id, 'producto_guardar', jsonb_build_object('id', v_id, 'antes', v_antes,
    'despues', (select gestlok_chat_private.producto_json(p) from gestlok_chat_private.productos p where p.id = v_id)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;
