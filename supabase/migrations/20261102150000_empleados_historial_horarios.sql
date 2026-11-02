-- Administración de empleados → «Historial horarios» (Mi Gusto · Munro, pedido de la usuaria del 02/11/2026).
-- El Google Sheets del local sigue siendo donde se cargan los horarios. Un script del propio Sheets manda el
-- Resumen de la semana con un código de conexión y GESTLOK guarda una copia por semana (se puede pisar la hoja
-- cada lunes sin perder nada). La dueña marca Pagado/Pendiente por colaborador.
-- Ven el historial: dueño, creadora (administradora general) y gerentes del local (misma regla que Horarios).
-- Marcan pagos y generan el código: dueño y creadora. Solo locales habilitados: Munro. Torcuato no cambia.

create table rm_test_private.horarios_conexiones (
  local_id text primary key references public.rm_app_local(id) on delete cascade,
  token_hash text unique,
  codigo_at timestamptz,
  codigo_por uuid,
  ultimo_envio_at timestamptz,
  envios integer not null default 0
);
create table rm_test_private.horarios_semanas (
  local_id text not null references rm_test_private.horarios_conexiones(local_id) on delete cascade,
  semana_desde date not null,
  semana_hasta date not null,
  filas jsonb not null check (jsonb_typeof(filas) = 'array'),
  primer_envio_at timestamptz not null default now(),
  recibido_at timestamptz not null default now(),
  actualizaciones integer not null default 1,
  primary key (local_id, semana_desde),
  check (extract(isodow from semana_desde) = 1 and semana_hasta = semana_desde + 6)
);
create table rm_test_private.horarios_pagos (
  local_id text not null,
  semana_desde date not null,
  colaborador text not null check (char_length(colaborador) between 1 and 60),
  pagado boolean not null,
  marcado_at timestamptz not null default now(),
  marcado_por uuid,
  primary key (local_id, semana_desde, colaborador),
  foreign key (local_id, semana_desde) references rm_test_private.horarios_semanas (local_id, semana_desde) on delete cascade
);
alter table rm_test_private.horarios_conexiones enable row level security;
alter table rm_test_private.horarios_semanas enable row level security;
alter table rm_test_private.horarios_pagos enable row level security;
revoke all on table rm_test_private.horarios_conexiones, rm_test_private.horarios_semanas, rm_test_private.horarios_pagos
  from public, anon, authenticated;

-- Local habilitado: Munro (sin código todavía; lo genera la dueña desde «Historial horarios»).
insert into rm_test_private.horarios_conexiones (local_id)
select id from public.rm_app_local where id = 'munro'
on conflict (local_id) do nothing;

-- Quién ve: misma regla que las tarjetas de Horarios, solo en locales habilitados.
create function rm_test_private.horarios_puede_ver(p_local text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select ((rm_test_private.app_role() = 'owner' or rm_test_private.is_general_administrator())
             and rm_test_private.manages_organization(l.organization_id))
        or (rm_test_private.app_role() = 'manager' and exists (
             select 1 from public.rm_manager_permissions p
             join public.rm_organization_members m on m.user_id = p.user_id and m.organization_id = p.organization_id
             where p.user_id = rm_test_private.uid() and p.company_id = l.company_id
               and p.organization_id = l.organization_id and p.can_edit))
        or l.id = any (rm_test_private.gestlok_gerente_locals())
    from public.rm_app_local l
    join rm_test_private.horarios_conexiones h on h.local_id = l.id
    where l.id = p_local), false)
$$;
-- Quién marca pagos y genera el código: dueño o creadora que gestionan la organización del local.
create function rm_test_private.horarios_puede_administrar(p_local text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (rm_test_private.app_role() = 'owner' or rm_test_private.is_general_administrator())
       and rm_test_private.manages_organization(l.organization_id)
    from public.rm_app_local l
    join rm_test_private.horarios_conexiones h on h.local_id = l.id
    where l.id = p_local), false)
$$;
-- Fechas del Sheets: «19/10/2026» o «2026-10-19».
create function rm_test_private.horarios_fecha(p text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p ~ '^\d{4}-\d{2}-\d{2}$' then return p::date; end if;
  if p ~ '^\d{1,2}/\d{1,2}/\d{4}$' then return to_date(p, 'DD/MM/YYYY'); end if;
  return null;
exception when others then return null;
end $$;
revoke all on function rm_test_private.horarios_puede_ver(text), rm_test_private.horarios_puede_administrar(text),
  rm_test_private.horarios_fecha(text) from public, anon, authenticated;

-- Locales con historial que la persona puede ver.
create function public.rm_horarios_locales() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'local_id', l.id, 'local_name', l.name, 'conectado', h.token_hash is not null,
      'ultimo_envio_at', h.ultimo_envio_at, 'codigo_at', h.codigo_at,
      'puede_administrar', rm_test_private.horarios_puede_administrar(l.id)) order by l.name), '[]'::jsonb)
  from rm_test_private.horarios_conexiones h
  join public.rm_app_local l on l.id = h.local_id
  where rm_test_private.horarios_puede_ver(l.id)
$$;

-- Semanas guardadas (las últimas 60), con las marcas de pago.
create function public.rm_horarios_historial(p_local text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rm_test_private.horarios_puede_ver(p_local) then
    raise exception 'No tenés acceso al historial de horarios de este local' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'desde', s.semana_desde, 'hasta', s.semana_hasta, 'filas', s.filas,
        'recibido_at', s.recibido_at, 'actualizaciones', s.actualizaciones,
        'pagos', coalesce((select jsonb_object_agg(p.colaborador, jsonb_build_object('pagado', p.pagado, 'marcado_at', p.marcado_at))
                           from rm_test_private.horarios_pagos p
                           where p.local_id = s.local_id and p.semana_desde = s.semana_desde), '{}'::jsonb))
      order by s.semana_desde desc)
    from (select * from rm_test_private.horarios_semanas where local_id = p_local
          order by semana_desde desc limit 60) s), '[]'::jsonb);
end $$;

-- Pagado / Pendiente por colaborador y semana.
create function public.rm_horarios_marcar_pago(p_local text, p_desde date, p_colaborador text, p_pagado boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_nombre text := btrim(coalesce(p_colaborador, ''));
begin
  if not rm_test_private.horarios_puede_administrar(p_local) then
    raise exception 'Solo el dueño puede marcar los pagos' using errcode = '42501';
  end if;
  if p_pagado is null or char_length(v_nombre) not between 1 and 60 then
    raise exception 'Elegí a la persona y si está pagada' using errcode = '22023';
  end if;
  if not exists (select 1 from rm_test_private.horarios_semanas s, jsonb_array_elements(s.filas) f
                 where s.local_id = p_local and s.semana_desde = p_desde and f->>'colaborador' = v_nombre) then
    raise exception 'Esa persona no figura en esa semana' using errcode = '22023';
  end if;
  insert into rm_test_private.horarios_pagos (local_id, semana_desde, colaborador, pagado, marcado_por)
  values (p_local, p_desde, v_nombre, p_pagado, auth.uid())
  on conflict (local_id, semana_desde, colaborador)
  do update set pagado = excluded.pagado, marcado_at = now(), marcado_por = excluded.marcado_por;
  return jsonb_build_object('ok', true, 'pagado', p_pagado);
end $$;

-- Código de conexión para el script del Sheets (se muestra una sola vez; uno nuevo reemplaza al anterior).
create function public.rm_horarios_generar_codigo(p_local text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_codigo text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not rm_test_private.horarios_puede_administrar(p_local) then
    raise exception 'Solo el dueño puede conectar la planilla' using errcode = '42501';
  end if;
  update rm_test_private.horarios_conexiones
     set token_hash = encode(extensions.digest(v_codigo, 'sha256'), 'hex'), codigo_at = now(), codigo_por = auth.uid()
   where local_id = p_local;
  return jsonb_build_object('codigo', v_codigo, 'local_id', p_local);
end $$;

-- Recepción desde el script del Sheets (sin sesión: lo autoriza el código del local).
create function public.rm_horarios_recibir(p_codigo text, p_desde text, p_hasta text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_local text; v_desde date; v_hasta date; v_filas jsonb := '[]'::jsonb; f jsonb;
begin
  select local_id into v_local from rm_test_private.horarios_conexiones
   where token_hash is not null
     and token_hash = encode(extensions.digest(coalesce(p_codigo, ''), 'sha256'), 'hex');
  if v_local is null then raise exception 'Código de conexión inválido' using errcode = '42501'; end if;
  v_desde := rm_test_private.horarios_fecha(btrim(coalesce(p_desde, '')));
  v_hasta := rm_test_private.horarios_fecha(btrim(coalesce(p_hasta, '')));
  if v_desde is null or extract(isodow from v_desde) <> 1 or v_hasta is distinct from v_desde + 6
     or v_desde < date '2025-01-01' or v_desde > current_date + 14 then
    raise exception 'La semana del Resumen tiene que ir de lunes a domingo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) > 60 or length(p_filas::text) > 40000 then
    raise exception 'Resumen inválido' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    if jsonb_typeof(f) <> 'object' or btrim(coalesce(f->>'colaborador', '')) = '' then continue; end if;
    v_filas := v_filas || jsonb_build_array(jsonb_build_object(
      'colaborador', left(btrim(f->>'colaborador'), 60),
      'puesto', left(btrim(coalesce(f->>'puesto', '')), 60),
      'cobra_por', left(btrim(coalesce(f->>'cobra_por', '')), 30),
      'trabajado', left(btrim(coalesce(f->>'trabajado', '')), 30),
      'off', left(btrim(coalesce(f->>'off', '')), 30),
      'feriado', left(btrim(coalesce(f->>'feriado', '')), 30),
      'ausentes', left(btrim(coalesce(f->>'ausentes', '')), 30),
      'vacaciones', left(btrim(coalesce(f->>'vacaciones', '')), 30),
      'total', left(btrim(coalesce(f->>'total', '')), 30),
      'observaciones', left(btrim(coalesce(f->>'observaciones', '')), 120)));
  end loop;
  insert into rm_test_private.horarios_semanas (local_id, semana_desde, semana_hasta, filas)
  values (v_local, v_desde, v_hasta, v_filas)
  on conflict (local_id, semana_desde) do update
    set filas = excluded.filas, recibido_at = now(), actualizaciones = rm_test_private.horarios_semanas.actualizaciones + 1
    where rm_test_private.horarios_semanas.filas is distinct from excluded.filas;
  update rm_test_private.horarios_conexiones set ultimo_envio_at = now(), envios = envios + 1 where local_id = v_local;
  return jsonb_build_object('ok', true, 'semana', v_desde, 'colaboradores', jsonb_array_length(v_filas));
end $$;

revoke all on function public.rm_horarios_locales(), public.rm_horarios_historial(text),
  public.rm_horarios_marcar_pago(text, date, text, boolean), public.rm_horarios_generar_codigo(text),
  public.rm_horarios_recibir(text, text, text, jsonb) from public, anon;
grant execute on function public.rm_horarios_locales(), public.rm_horarios_historial(text),
  public.rm_horarios_marcar_pago(text, date, text, boolean), public.rm_horarios_generar_codigo(text) to authenticated;
-- El script del Sheets no tiene sesión: entra con la clave pública y lo autoriza el código del local.
grant execute on function public.rm_horarios_recibir(text, text, text, jsonb) to anon, authenticated;
