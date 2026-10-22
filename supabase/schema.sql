-- Stock Productos · esquema de Supabase (locales Munro y Torcuato)
-- Una sola tabla de documentos (col + id + data JSON), con permisos por la lista del Equipo.

create table if not exists public.docs (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text        default (auth.jwt() ->> 'email'),
  primary key (col, id)
);

alter table public.docs enable row level security;
alter table public.docs replica identity full;

-- Rol de quien está conectado, según la lista del Equipo (col = 'equipo')
-- Roles: creadora (administradora), dueno (todos los locales), gerente (edita sus locales), lectura (solo ver sus locales)
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select d.data ->> 'rol'
  from public.docs d
  where d.col = 'equipo'
    and lower(d.data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.es_miembro()  returns boolean language sql stable security definer set search_path = public as $$ select public.mi_rol() is not null $$;
create or replace function public.es_editor()   returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.mi_rol() in ('creadora', 'dueno', 'gerente', 'editor'), false) $$;
create or replace function public.es_creadora() returns boolean language sql stable security definer set search_path = public as $$ select coalesce(public.mi_rol() = 'creadora', false) $$;

-- Rol y locales de quien está conectado (la app lo usa al entrar)
create or replace function public.mi_acceso() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rol', d.data ->> 'rol',
    'locales', case when d.data ->> 'rol' in ('creadora', 'dueno')
      then coalesce((select jsonb_agg(l.id order by l.id) from public.docs l where l.col = 'locales'), '[]'::jsonb)
      else coalesce(d.data -> 'locales', '[]'::jsonb) end)
  from public.docs d
  where d.col = 'equipo' and lower(d.data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

-- Cada local guarda sus datos en "<local>/productos", "<local>/fabrica", "<local>/conteos" y "<local>/hojas"
create or replace function public.puede_ver_local(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select d.data ->> 'rol' in ('creadora', 'dueno') or coalesce(d.data -> 'locales', '[]'::jsonb) ? p
    from public.docs d
    where d.col = 'equipo' and lower(d.data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1), false)
$$;

create or replace function public.puede_editar_local(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select d.data ->> 'rol' in ('creadora', 'dueno') or (d.data ->> 'rol' in ('gerente', 'editor') and coalesce(d.data -> 'locales', '[]'::jsonb) ? p)
    from public.docs d
    where d.col = 'equipo' and lower(d.data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1), false)
$$;

-- ¿Quien está conectado comparte algún local con esta lista de locales? (para ver solo el equipo de sus locales)
create or replace function public.comparte_local(p_locales jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (
      select 1
      from jsonb_array_elements_text(case when jsonb_typeof(d.data -> 'locales') = 'array' then d.data -> 'locales' else '[]'::jsonb end) as m(l)
      where (case when jsonb_typeof(p_locales) = 'array' then p_locales else '[]'::jsonb end) ? m.l)
    from public.docs d
    where d.col = 'equipo' and lower(d.data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1), false)
$$;

grant execute on function public.mi_rol(), public.es_miembro(), public.es_editor(), public.es_creadora(), public.mi_acceso(), public.puede_ver_local(text), public.puede_editar_local(text), public.comparte_local(jsonb) to authenticated;

drop policy if exists "docs_leer"   on public.docs;
drop policy if exists "docs_crear"  on public.docs;
drop policy if exists "docs_editar" on public.docs;
drop policy if exists "docs_borrar" on public.docs;

-- Leer: Locales, cualquier persona del Equipo. Equipo: la administradora y el dueño ven a todos; el resto ve
-- a la administradora, al dueño, a sí mismo y a quienes comparten alguno de sus locales.
-- Pedidos de acceso: la administradora (y cada uno el suyo).
-- Ingresos de mercadería (col = 'importaciones'): solo la administradora y el dueño. Nadie los escribe directo: solo importar_mercaderia().
-- Datos de un local: quien tenga ese local (la administradora y el dueño ven todos).
create policy "docs_leer" on public.docs for select to authenticated
  using (
    (col = 'locales' and public.es_miembro())
    or (col = 'equipo' and public.es_miembro() and (
          public.mi_rol() in ('creadora', 'dueno')
          or lower(data ->> 'email') = lower(coalesce((select auth.jwt()) ->> 'email', ''))
          or data ->> 'rol' in ('creadora', 'dueno')
          or public.comparte_local(data -> 'locales')))
    or (col = 'solicitudes' and (public.es_creadora() or id = lower(coalesce((select auth.jwt()) ->> 'email', ''))))
    or (col = 'importaciones' and public.mi_rol() in ('creadora', 'dueno'))
    or (position('/' in col) > 0 and public.puede_ver_local(split_part(col, '/', 1)))
  );

-- Escribir: Equipo, pedidos de acceso y Locales solo la administradora. Datos de un local: administradora, dueño y gerentes de ese local.
create policy "docs_crear" on public.docs for insert to authenticated
  with check (
    (col in ('equipo', 'solicitudes', 'locales') and public.es_creadora())
    or (position('/' in col) > 0 and public.puede_editar_local(split_part(col, '/', 1)))
  );

create policy "docs_editar" on public.docs for update to authenticated
  using (
    (col in ('equipo', 'solicitudes', 'locales') and public.es_creadora())
    or (position('/' in col) > 0 and public.puede_editar_local(split_part(col, '/', 1))))
  with check (
    (col in ('equipo', 'solicitudes', 'locales') and public.es_creadora())
    or (position('/' in col) > 0 and public.puede_editar_local(split_part(col, '/', 1))));

create policy "docs_borrar" on public.docs for delete to authenticated
  using (
    (col in ('equipo', 'solicitudes', 'locales') and public.es_creadora())
    or (position('/' in col) > 0 and public.puede_editar_local(split_part(col, '/', 1)))
  );

-- Quien entra y no está en el Equipo queda Pendiente hasta que la Creadora lo apruebe.
create or replace function public.pedir_acceso(p_nombre text default null, p_proveedor text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_rol   text;
  v_ahora bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_email = '' then return null; end if;
  v_rol := public.mi_rol();
  if v_rol is not null then return v_rol; end if;
  insert into public.docs (col, id, data, updated_by)
  values ('solicitudes', v_email, jsonb_build_object('email', v_email, 'nombre', coalesce(p_nombre, ''), 'proveedor', coalesce(p_proveedor, ''), 'fecha', v_ahora), v_email)
  on conflict (col, id) do update
    set data = public.docs.data || jsonb_build_object('nombre', coalesce(p_nombre, ''), 'ultimo', v_ahora),
        updated_at = now();
  return 'pendiente';
end $$;
grant execute on function public.pedir_acceso(text, text) to authenticated;

grant select, insert, update, delete on public.docs to authenticated;

-- Actualizar algunos campos de un documento sin pisar el resto. Devuelve cuántas filas cambió.
create or replace function public.doc_update(p_col text, p_id text, p_patch jsonb) returns integer
language sql security invoker set search_path = public as $$
  with u as (
    update public.docs
       set data = data || p_patch, updated_at = now(), updated_by = auth.jwt() ->> 'email'
     where col = p_col and id = p_id
    returning 1
  )
  select count(*)::int from u
$$;
grant execute on function public.doc_update(text, text, jsonb) to authenticated;

-- Stock sugerido y umbrales de poco stock y exceso: solo la administradora y el dueño los cambian.
-- En las hojas, el campo "sugerido" activa o desactiva la columna Sugerido y también lo cambian solo ellas.
-- A cualquier otro rol se le conserva el valor anterior (no da error: el resto del cambio se guarda).
create or replace function public.proteger_sugerido() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if split_part(new.col, '/', 2) in ('productos', 'hojas')
     and coalesce(auth.role(), '') = 'authenticated'
     and coalesce(public.mi_rol(), '') not in ('creadora', 'dueno') then
    foreach k in array array['sugerido', 'poco', 'exceso'] loop
      if tg_op = 'INSERT' then
        new.data := new.data - k;
      elsif (new.data -> k) is distinct from (old.data -> k) then
        new.data := case when old.data ? k then jsonb_set(new.data, array[k], old.data -> k) else new.data - k end;
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.proteger_sugerido() from public, anon, authenticated;
drop trigger if exists docs_proteger_sugerido on public.docs;
create trigger docs_proteger_sugerido
  before insert or update on public.docs
  for each row execute function public.proteger_sugerido();

-- Ingreso de mercadería: la dueña o la administradora cargan cantidades en UNA sucursal, todo junto o nada, con registro.
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
    -- Solo la columna Ingreso de hojas «Local + Ingreso»: las demás hojas no se tocan
    if not (v_col = 'fabrica' and v_campo = 'fabrica') or coalesce(v_id, '') = '' then
      raise exception 'MGS:destino' using errcode = '22023';
    end if;
    begin v_cant := (v_it ->> 'cantidad')::numeric; exception when others then raise exception 'MGS:cantidad' using errcode = '22023'; end;
    if v_cant is null or v_cant < 0 or v_cant > 100000 or v_cant * 4 <> trunc(v_cant * 4) then raise exception 'MGS:cantidad' using errcode = '22023'; end if;
    select data into v_doc from public.docs where col = p_local || '/' || v_col and id = v_id for update;
    if not found then v_falt := v_falt || jsonb_build_array(left(coalesce(v_it ->> 'nombre', v_id), 120)); continue; end if;
    if not exists (select 1 from public.docs where col = p_local || '/hojas' and id = coalesce(v_doc ->> 'hoja', '') and data ->> 'tipo' = 'ingreso') then
      raise exception 'MGS:destino' using errcode = '22023';
    end if;
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
end $$;
revoke execute on function public.importar_mercaderia(text, text, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.importar_mercaderia(text, text, jsonb, jsonb, text, boolean) to authenticated;

-- Cambios en vivo para todo el equipo
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- Sin acceso para visitantes sin sesión
revoke execute on function public.mi_rol(), public.es_miembro(), public.es_editor(), public.es_creadora(), public.mi_acceso(), public.puede_ver_local(text), public.puede_editar_local(text), public.comparte_local(jsonb), public.pedir_acceso(text, text), public.doc_update(text, text, jsonb) from public, anon;
revoke all on public.docs from anon;
