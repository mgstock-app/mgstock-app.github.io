-- Prueba de la migración ingreso_mercaderia en la base real SIN dejar cambios:
-- todo corre en un único bloque que termina con RAISE EXCEPTION, así se deshace la función, la regla y los datos ficticios (sucursal qa-prueba).
-- Resultado esperado (22/10): a=MGS:sin_permiso a_lee=0 b=ok aplicados 2 p1=3.5/false/5 f1=1.25 c=ok:true p1c=3.5 d=duplicado e=ok p1e=5.0
-- f=conflicto:2 p1f=5.0 g=ok p2=4/h-qa h=MGS:cantidad i=MGS:destino j=faltan k=MGS:repetidos l=MGS:sucursal duena_lee=3 gerente_lee=0 gerente_escribe=no

do $T$
declare r text := ''; j jsonb; n int;
  items1 jsonb := '[{"col":"productos","id":"qa-p1","campo":"stock","cantidad":1.5,"antes":2,"nombre":"Jamón QA","nombreHoja":"Stock Sugerido","lineas":["Jamon cocido 1 1/2"]},{"col":"fabrica","id":"qa-f1","campo":"local","cantidad":0.25,"antes":1,"nombre":"Manteca QA","nombreHoja":"Conteo Fábrica"}]';
  arch jsonb := '{"nombre":"remito-qa.csv","tipo":"text/csv","hash":"h-qa-1","contenido":"c-qa-1","ignorados":["Producto desconocido 10"]}';
  claims text;
begin
  execute $F$ -- Ingreso de mercadería: la dueña o la administradora cargan cantidades en UNA sucursal, todo junto o nada, con registro.
-- Verifica rol, sucursal y destinos; bloquea los productos; si alguno cambió desde la vista previa no guarda nada;
-- detecta archivos ya importados; la misma clave no se aplica dos veces (reintentos por falta de internet).
create or replace function public.importar_mercaderia(p_local text, p_operacion text, p_items jsonb, p_archivo jsonb, p_clave text, p_forzar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.mi_rol();
  v_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_hash text := left(coalesce(p_archivo ->> 'hash', ''), 128);
  v_chash text := left(coalesce(p_archivo ->> 'contenido', ''), 128);
  v_prev jsonb; v_it jsonb; v_doc jsonb; v_col text; v_campo text; v_id text;
  v_cant numeric; v_antes numeric; v_actual numeric; v_nuevo numeric;
  v_conf jsonb := '[]'::jsonb; v_falt jsonb := '[]'::jsonb; v_reg jsonb := '[]'::jsonb; v_ign jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or coalesce(v_rol, '') not in ('creadora', 'dueno') then
    raise exception 'MGS:sin_permiso' using errcode = '42501';
  end if;
  if p_local is null or not exists (select 1 from public.docs where col = 'locales' and id = p_local) then
    raise exception 'MGS:sucursal' using errcode = '22023';
  end if;
  if coalesce(p_operacion, '') not in ('ingreso', 'conteo') then raise exception 'MGS:operacion' using errcode = '22023'; end if;
  if coalesce(p_clave, '') !~ '^[A-Za-z0-9-]{8,64}$' then raise exception 'MGS:clave' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'MGS:items' using errcode = '22023';
  end if;
  if (select count(*) from (select distinct e ->> 'col', e ->> 'id', e ->> 'campo' from jsonb_array_elements(p_items) e) t) <> jsonb_array_length(p_items) then
    raise exception 'MGS:repetidos' using errcode = '22023';
  end if;

  -- Reintento con la misma clave: ya está guardado, no se aplica de nuevo
  select data into v_prev from public.docs where col = 'importaciones' and id = p_clave;
  if found then
    return jsonb_build_object('estado', 'ok', 'repetida', true, 'aplicados', jsonb_array_length(coalesce(v_prev -> 'items', '[]'::jsonb)), 'fecha', v_prev -> 'fecha');
  end if;

  -- El mismo archivo (o el mismo contenido) ya se importó en esta sucursal
  if not coalesce(p_forzar, false) and (v_hash <> '' or v_chash <> '') then
    select data into v_prev from public.docs
      where col = 'importaciones' and data ->> 'local' = p_local
        and ((v_hash <> '' and data -> 'archivo' ->> 'hash' = v_hash) or (v_chash <> '' and data -> 'archivo' ->> 'contenido' = v_chash))
      order by (data ->> 'fecha')::bigint desc limit 1;
    if found then
      return jsonb_build_object('estado', 'duplicado', 'fecha', v_prev -> 'fecha', 'por', v_prev -> 'por', 'archivo', v_prev -> 'archivo' -> 'nombre');
    end if;
  end if;

  -- Primero se valida y se bloquea todo; recién después se cambia
  for v_it in select * from jsonb_array_elements(p_items) loop
    v_col := v_it ->> 'col'; v_campo := v_it ->> 'campo'; v_id := v_it ->> 'id';
    if not ((v_col = 'productos' and v_campo = 'stock') or (v_col = 'fabrica' and v_campo in ('local', 'fabrica'))) or coalesce(v_id, '') = '' then
      raise exception 'MGS:destino' using errcode = '22023';
    end if;
    begin v_cant := (v_it ->> 'cantidad')::numeric; exception when others then raise exception 'MGS:cantidad' using errcode = '22023'; end;
    if v_cant is null or v_cant < 0 or v_cant > 100000 or v_cant * 4 <> trunc(v_cant * 4) then raise exception 'MGS:cantidad' using errcode = '22023'; end if;
    select data into v_doc from public.docs where col = p_local || '/' || v_col and id = v_id for update;
    if not found then v_falt := v_falt || jsonb_build_array(left(coalesce(v_it ->> 'nombre', v_id), 120)); continue; end if;
    begin v_actual := (v_doc ->> v_campo)::numeric; exception when others then v_actual := null; end;
    begin v_antes := (v_it ->> 'antes')::numeric; exception when others then v_antes := null; end;
    if v_actual is distinct from v_antes then
      v_conf := v_conf || jsonb_build_array(jsonb_build_object('col', v_col, 'id', v_id, 'campo', v_campo, 'nombre', coalesce(v_doc ->> 'nombre', v_it ->> 'nombre'), 'antes', v_antes, 'ahora', v_actual));
    end if;
  end loop;
  if jsonb_array_length(v_falt) > 0 then return jsonb_build_object('estado', 'faltan', 'productos', v_falt); end if;
  if jsonb_array_length(v_conf) > 0 then return jsonb_build_object('estado', 'conflicto', 'cambios', v_conf); end if;

  -- Aplicar todo junto (una sola transacción)
  for v_it in select * from jsonb_array_elements(p_items) loop
    v_col := v_it ->> 'col'; v_campo := v_it ->> 'campo'; v_id := v_it ->> 'id'; v_cant := (v_it ->> 'cantidad')::numeric;
    select data into v_doc from public.docs where col = p_local || '/' || v_col and id = v_id;
    begin v_actual := (v_doc ->> v_campo)::numeric; exception when others then v_actual := null; end;
    v_nuevo := case when p_operacion = 'ingreso' then coalesce(v_actual, 0) + v_cant else v_cant end;
    if v_nuevo > 1000000 then raise exception 'MGS:cantidad' using errcode = '22023'; end if;
    update public.docs
      set data = data || jsonb_build_object(v_campo, v_nuevo, 'actualizado', v_now)
                 || case when v_col = 'productos' then jsonb_build_object('sinStock', v_nuevo <= 0)
                         when v_campo = 'local' then jsonb_build_object('sinStock', v_nuevo = 0)
                         else '{}'::jsonb end,
          updated_at = now(), updated_by = v_email
      where col = p_local || '/' || v_col and id = v_id;
    v_reg := v_reg || jsonb_build_array(jsonb_build_object(
      'col', v_col, 'id', v_id, 'campo', v_campo, 'nombre', coalesce(v_doc ->> 'nombre', ''),
      'hoja', case when v_col = 'productos' then coalesce(nullif(v_doc ->> 'hoja', ''), 'stock') else coalesce(nullif(v_doc ->> 'hoja', ''), 'fabrica') end,
      'nombreHoja', left(coalesce(v_it ->> 'nombreHoja', ''), 60),
      'antes', v_actual, 'cantidad', v_cant, 'despues', v_nuevo,
      'lineas', case when jsonb_typeof(v_it -> 'lineas') = 'array' then (select coalesce(jsonb_agg(left(x, 160)), '[]'::jsonb) from (select jsonb_array_elements_text(v_it -> 'lineas') x limit 20) s) else '[]'::jsonb end));
  end loop;
  if jsonb_typeof(p_archivo -> 'ignorados') = 'array' then
    select coalesce(jsonb_agg(left(x, 160)), '[]'::jsonb) into v_ign from (select jsonb_array_elements_text(p_archivo -> 'ignorados') x limit 300) s;
  end if;
  insert into public.docs (col, id, data, updated_at, updated_by) values ('importaciones', p_clave, jsonb_build_object(
    'local', p_local, 'operacion', p_operacion, 'fecha', v_now, 'por', v_email, 'forzada', coalesce(p_forzar, false),
    'archivo', jsonb_build_object('nombre', left(coalesce(p_archivo ->> 'nombre', ''), 200), 'tipo', left(coalesce(p_archivo ->> 'tipo', ''), 80), 'hash', v_hash, 'contenido', v_chash),
    'items', v_reg, 'ignorados', v_ign), now(), v_email);
  return jsonb_build_object('estado', 'ok', 'aplicados', jsonb_array_length(v_reg), 'fecha', v_now);
end $$; $F$;
  execute $F$ alter policy "docs_leer" on public.docs using (
    (col = 'locales' and public.es_miembro())
    or (col = 'equipo' and public.es_miembro() and (
          public.mi_rol() in ('creadora', 'dueno')
          or lower(data ->> 'email') = lower(coalesce((select auth.jwt()) ->> 'email', ''))
          or data ->> 'rol' in ('creadora', 'dueno')
          or public.comparte_local(data -> 'locales')))
    or (col = 'solicitudes' and (public.es_creadora() or id = lower(coalesce((select auth.jwt()) ->> 'email', ''))))
    or (col = 'importaciones' and public.mi_rol() in ('creadora', 'dueno'))
    or (position('/' in col) > 0 and public.puede_ver_local(split_part(col, '/', 1)))
  ) $F$;
  insert into public.docs (col, id, data) values
    ('locales', 'qa-prueba', '{"nombre":"QA Prueba"}'),
    ('equipo', 'qa-duena@example.com', '{"email":"qa-duena@example.com","rol":"dueno"}'),
    ('equipo', 'qa-gerente@example.com', '{"email":"qa-gerente@example.com","rol":"gerente","locales":["qa-prueba"]}'),
    ('qa-prueba/productos', 'qa-p1', '{"nombre":"Jamón QA","stock":2,"sinStock":false,"sugerido":5}'),
    ('qa-prueba/productos', 'qa-p2', '{"nombre":"Caja QA","stock":null,"hoja":"h-qa"}'),
    ('qa-prueba/fabrica', 'qa-f1', '{"nombre":"Manteca QA","local":1,"fabrica":0,"bloque":1}');
  execute 'set local role authenticated';
  -- a) gerente
  perform set_config('request.jwt.claims', '{"email":"qa-gerente@example.com","role":"authenticated"}', true);
  begin j := public.importar_mercaderia('qa-prueba', 'ingreso', items1, arch, 'qa-clave-0001', false); r := r || ' a=' || j::text;
  exception when others then r := r || ' a=' || sqlerrm; end;
  select count(*) into n from public.docs where col = 'importaciones'; r := r || ' a_lee=' || n;
  -- b) dueña: ingreso
  perform set_config('request.jwt.claims', '{"email":"qa-duena@example.com","role":"authenticated"}', true);
  j := public.importar_mercaderia('qa-prueba', 'ingreso', items1, arch, 'qa-clave-0001', false); r := r || ' b=' || j::text;
  select data ->> 'stock' || '/' || (data ->> 'sinStock') || '/' || (data ->> 'sugerido') into claims from public.docs where col = 'qa-prueba/productos' and id = 'qa-p1'; r := r || ' p1=' || claims;
  select data ->> 'local' into claims from public.docs where col = 'qa-prueba/fabrica' and id = 'qa-f1'; r := r || ' f1=' || claims;
  -- c) reintento con la misma clave
  j := public.importar_mercaderia('qa-prueba', 'ingreso', items1, arch, 'qa-clave-0001', false); r := r || ' c=' || (j ->> 'estado') || ':' || coalesce(j ->> 'repetida', '');
  select data ->> 'stock' into claims from public.docs where col = 'qa-prueba/productos' and id = 'qa-p1'; r := r || ' p1c=' || claims;
  -- d) mismo archivo, otra clave
  j := public.importar_mercaderia('qa-prueba', 'ingreso', jsonb_set(jsonb_set(items1, '{0,antes}', '3.5'), '{1,antes}', '1.25'), arch, 'qa-clave-0002', false); r := r || ' d=' || (j ->> 'estado');
  -- e) forzar
  j := public.importar_mercaderia('qa-prueba', 'ingreso', jsonb_set(jsonb_set(items1, '{0,antes}', '3.5'), '{1,antes}', '1.25'), arch, 'qa-clave-0003', true); r := r || ' e=' || (j ->> 'estado');
  select data ->> 'stock' into claims from public.docs where col = 'qa-prueba/productos' and id = 'qa-p1'; r := r || ' p1e=' || claims;
  -- f) conflicto (antes viejo)
  j := public.importar_mercaderia('qa-prueba', 'ingreso', items1, '{"nombre":"otro.csv","hash":"h-qa-2"}', 'qa-clave-0004', false); r := r || ' f=' || (j ->> 'estado') || ':' || jsonb_array_length(j -> 'cambios');
  select data ->> 'stock' into claims from public.docs where col = 'qa-prueba/productos' and id = 'qa-p1'; r := r || ' p1f=' || claims;
  -- g) conteo en producto sin contar
  j := public.importar_mercaderia('qa-prueba', 'conteo', '[{"col":"productos","id":"qa-p2","campo":"stock","cantidad":4,"antes":null}]', '{"nombre":"c.csv","hash":"h-qa-3"}', 'qa-clave-0005', false); r := r || ' g=' || (j ->> 'estado');
  select data ->> 'stock' || '/' || (data ->> 'hoja') into claims from public.docs where col = 'qa-prueba/productos' and id = 'qa-p2'; r := r || ' p2=' || claims;
  -- h) cantidad inválida
  begin j := public.importar_mercaderia('qa-prueba', 'conteo', '[{"col":"productos","id":"qa-p2","campo":"stock","cantidad":1.3,"antes":4}]', '{}', 'qa-clave-0006', false); r := r || ' h=' || j::text;
  exception when others then r := r || ' h=' || sqlerrm; end;
  -- i) destino no permitido
  begin j := public.importar_mercaderia('qa-prueba', 'conteo', '[{"col":"equipo","id":"qa-gerente@example.com","campo":"rol","cantidad":1,"antes":null}]', '{}', 'qa-clave-0007', false); r := r || ' i=' || j::text;
  exception when others then r := r || ' i=' || sqlerrm; end;
  -- j) producto de otra sucursal
  j := public.importar_mercaderia('qa-prueba', 'conteo', '[{"col":"productos","id":"no-existe","campo":"stock","cantidad":1,"antes":null}]', '{}', 'qa-clave-0008', false); r := r || ' j=' || (j ->> 'estado');
  -- k) repetidos
  begin j := public.importar_mercaderia('qa-prueba', 'conteo', '[{"col":"productos","id":"qa-p2","campo":"stock","cantidad":1,"antes":4},{"col":"productos","id":"qa-p2","campo":"stock","cantidad":2,"antes":4}]', '{}', 'qa-clave-0009', false); r := r || ' k=' || j::text;
  exception when others then r := r || ' k=' || sqlerrm; end;
  -- l) sucursal inexistente
  begin j := public.importar_mercaderia('no-existe', 'conteo', items1, '{}', 'qa-clave-0010', false); r := r || ' l=' || j::text;
  exception when others then r := r || ' l=' || sqlerrm; end;
  -- m) lectura del historial
  select count(*) into n from public.docs where col = 'importaciones'; r := r || ' duena_lee=' || n;
  select jsonb_array_length(data -> 'items') || '/' || (data ->> 'por') || '/' || (data -> 'ignorados' ->> 0) into claims from public.docs where col = 'importaciones' and id = 'qa-clave-0001'; r := r || ' reg=' || claims;
  perform set_config('request.jwt.claims', '{"email":"qa-gerente@example.com","role":"authenticated"}', true);
  select count(*) into n from public.docs where col = 'importaciones'; r := r || ' gerente_lee=' || n;
  select count(*) into n from public.docs where col = 'qa-prueba/productos'; r := r || ' gerente_ve_productos=' || n;
  begin insert into public.docs (col, id, data) values ('importaciones', 'qa-trucho', '{}'); r := r || ' gerente_escribe=SI';
  exception when others then r := r || ' gerente_escribe=no'; end;
  raise exception 'PRUEBA (se deshace todo):%', r;
end $T$;
