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
-- Datos de un local: quien tenga ese local (la administradora y el dueño ven todos).
create policy "docs_leer" on public.docs for select to authenticated
  using (
    (col = 'locales' and public.es_miembro())
    or (col = 'equipo' and public.es_miembro() and (
          public.mi_rol() in ('creadora', 'dueno')
          or lower(data ->> 'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
          or data ->> 'rol' in ('creadora', 'dueno')
          or public.comparte_local(data -> 'locales')))
    or (col = 'solicitudes' and (public.es_creadora() or id = lower(coalesce(auth.jwt() ->> 'email', ''))))
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

-- Stock sugerido y umbral de poco stock: solo la administradora y el dueño los cambian.
-- A cualquier otro rol se le conserva el valor anterior (no da error: el resto del cambio se guarda).
create or replace function public.proteger_sugerido() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if split_part(new.col, '/', 2) = 'productos'
     and coalesce(auth.role(), '') = 'authenticated'
     and coalesce(public.mi_rol(), '') not in ('creadora', 'dueno') then
    foreach k in array array['sugerido', 'poco'] loop
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

-- Cambios en vivo para todo el equipo
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- Sin acceso para visitantes sin sesión
revoke execute on function public.mi_rol(), public.es_miembro(), public.es_editor(), public.es_creadora(), public.mi_acceso(), public.puede_ver_local(text), public.puede_editar_local(text), public.comparte_local(jsonb), public.pedir_acceso(text, text), public.doc_update(text, text, jsonb) from public, anon;
revoke all on public.docs from anon;
