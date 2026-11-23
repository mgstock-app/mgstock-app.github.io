-- GESTLOK Chat (todas las empresas) · 23/11/2026
-- 1) El dueño, el gerente del local y la administradora editan desde Carta las reglas de cada producto
--    (promo por día y horario, última semana del mes, exclusiva, solo efectivo, precio final, para compartir).
--    La base limpia las reglas (solo claves y formatos conocidos) y conserva las de antes si no se mandan.
-- 2) Clientes: todos los que pidieron en la sucursal (frecuente = 2 o más), con el total de pedidos aceptados.
--    Sin pedidos de prueba. Solo personal que gestiona el local.

create or replace function gestlok_chat_private.reglas_limpias(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare r jsonb := '{}'::jsonb; c jsonb; cc jsonb := '{}'::jsonb; k text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  c := p->'cuando';
  if jsonb_typeof(c) = 'object' then
    if coalesce(c->>'dia_semana', '') ~ '^[1-7]$' then cc := cc || jsonb_build_object('dia_semana', (c->>'dia_semana')::int); end if;
    if c->>'semana' = 'ultima' then cc := cc || jsonb_build_object('semana', 'ultima'); end if;
    if coalesce(c->>'desde', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then cc := cc || jsonb_build_object('desde', c->>'desde'); end if;
    if coalesce(c->>'hasta', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then cc := cc || jsonb_build_object('hasta', c->>'hasta'); end if;
    r := r || jsonb_build_object('cuando', cc);
  end if;
  if jsonb_typeof(p->'nombre') = 'string' and length(btrim(p->>'nombre')) > 0 then
    r := r || jsonb_build_object('nombre', left(btrim(p->>'nombre'), 60)); end if;
  if jsonb_typeof(p->'aviso') = 'string' and length(btrim(p->>'aviso')) > 0 then
    r := r || jsonb_build_object('aviso', left(btrim(p->>'aviso'), 200)); end if;
  foreach k in array array['exclusiva', 'solo_efectivo', 'sin_descuento', 'compartir'] loop
    if p->k = 'true'::jsonb then r := r || jsonb_build_object(k, true); end if;
  end loop;
  return r;
end $$;
revoke all on function gestlok_chat_private.reglas_limpias(jsonb) from public;

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_producto_guardar(p_sucursal uuid, p_producto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s gestlok_chat_private.sucursales; v_id uuid; v_cat uuid; v_antes jsonb; v_precio numeric;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'gestionar');
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

CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_clientes(p_sucursal uuid, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 return coalesce((select jsonb_agg(jsonb_build_object(
   'nombre',x.nombre,'telefono',x.telefono,'pedidos',x.pedidos,
   'ultimo_at',x.ultimo_at,'direccion',x.direccion,'gastado',x.gastado)
   order by x.pedidos desc,x.ultimo_at desc)
 from (
   select p.cliente_telefono as telefono,
      (array_agg(p.cliente_nombre order by p.creado_at desc))[1] as nombre,
      (array_agg(p.direccion order by p.creado_at desc)
         filter(where p.entrega='envio' and btrim(p.direccion)<>''))[1] as direccion,
      count(*) as pedidos,max(p.creado_at) as ultimo_at,
      coalesce(sum(p.total) filter(where p.estado in ('confirmado','terminado')),0) as gastado
   from gestlok_chat_private.pedidos p
   where p.sucursal_id=p_sucursal and not p.es_prueba
   group by p.cliente_telefono
   order by count(*) desc,max(p.creado_at) desc
   limit least(greatest(coalesce(p_limite,50),1),200)
 ) x),'[]'::jsonb);
end $function$;
