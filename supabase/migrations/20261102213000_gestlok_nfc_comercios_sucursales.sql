-- NFC y QR por comercio y sucursal (02/11/2026, pedido de la creadora).
-- • Comercios y sucursales con su propio link. Una placa usa, en este orden: su link propio, el de su sucursal
--   o el de su comercio. Cambiar el link de una sucursal actualiza todas sus placas sin reimprimir ni regrabar.
-- • Placas por cantidad asignadas a un comercio/sucursal; activar, desactivar y reasignar (también en grupo).
-- • Historial de cada placa, comercio y sucursal.
-- • Las placas de un comercio NUNCA van al link de Belisa Parfum: si están desactivadas, la página /r/ muestra
--   «placa no activa». El link general (ajustes.destino_sin_activar) queda solo para placas sin comercio y se puede quitar.
-- Aditiva: no borra placas, escaneos ni ajustes, y las funciones anteriores siguen respondiendo.
-- Todo sigue siendo exclusivo de la creadora verificada; el público solo resuelve un código.

-- 1. Comercios y sucursales -------------------------------------------------------------------------------------
create table if not exists gestlok_nfc_private.comercios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  destino text check (destino is null or (destino ~* '^https?://[^[:space:]<>"]+$' and char_length(destino) <= 1000)),
  nota text not null default '' check (char_length(nota) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists comercios_nombre_uq on gestlok_nfc_private.comercios (lower(btrim(nombre)));

create table if not exists gestlok_nfc_private.sucursales (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references gestlok_nfc_private.comercios(id) on delete restrict,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  destino text check (destino is null or (destino ~* '^https?://[^[:space:]<>"]+$' and char_length(destino) <= 1000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comercio_id, id)
);
create unique index if not exists sucursales_nombre_uq on gestlok_nfc_private.sucursales (comercio_id, lower(btrim(nombre)));

-- 2. Placas: comercio y sucursal opcionales (la sucursal siempre del mismo comercio) ----------------------------
alter table gestlok_nfc_private.placas add column if not exists comercio_id uuid
  references gestlok_nfc_private.comercios(id) on delete restrict;
alter table gestlok_nfc_private.placas add column if not exists sucursal_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'placas_sucursal_del_comercio') then
    alter table gestlok_nfc_private.placas add constraint placas_sucursal_del_comercio
      foreign key (comercio_id, sucursal_id) references gestlok_nfc_private.sucursales (comercio_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'placas_sucursal_con_comercio') then
    alter table gestlok_nfc_private.placas add constraint placas_sucursal_con_comercio
      check (sucursal_id is null or comercio_id is not null);
  end if;
end $$;
create index if not exists placas_comercio_idx on gestlok_nfc_private.placas (comercio_id, sucursal_id);

-- Una placa activa ya no necesita link propio: puede usar el de su sucursal o comercio (lo controlan las funciones).
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'gestlok_nfc_private.placas'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%activa%destino%' loop
    execute format('alter table gestlok_nfc_private.placas drop constraint %I', c);
  end loop;
end $$;

-- 3. El link general deja de tener a Belisa como valor por defecto (el valor guardado no se borra) ----------------
alter table gestlok_nfc_private.ajustes alter column destino_sin_activar drop not null;
alter table gestlok_nfc_private.ajustes alter column destino_sin_activar drop default;

-- 4. Historial -----------------------------------------------------------------------------------------------------
create table if not exists gestlok_nfc_private.historial (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  accion text not null check (accion in ('placa_creada', 'placa_editada', 'placa_activada', 'placa_desactivada',
    'placa_reasignada', 'comercio_creado', 'comercio_editado', 'sucursal_creada', 'sucursal_editada', 'ajuste_editado')),
  code text references gestlok_nfc_private.placas(code) on delete cascade,
  comercio_id uuid references gestlok_nfc_private.comercios(id) on delete cascade,
  sucursal_id uuid references gestlok_nfc_private.sucursales(id) on delete cascade,
  detalle text not null default '' check (char_length(detalle) <= 2000)
);
create index if not exists historial_code_idx on gestlok_nfc_private.historial (code, at desc);
create index if not exists historial_comercio_idx on gestlok_nfc_private.historial (comercio_id, at desc);
create index if not exists historial_at_idx on gestlok_nfc_private.historial (at desc);

alter table gestlok_nfc_private.comercios enable row level security;
alter table gestlok_nfc_private.sucursales enable row level security;
alter table gestlok_nfc_private.historial enable row level security;
revoke all on gestlok_nfc_private.comercios, gestlok_nfc_private.sucursales, gestlok_nfc_private.historial
  from public, anon, authenticated;

-- 5. Ayudas internas -----------------------------------------------------------------------------------------------
create or replace function gestlok_nfc_private.log(
  p_actor uuid, p_accion text, p_code text, p_comercio uuid, p_sucursal uuid, p_detalle text)
returns void
language sql volatile set search_path = ''
as $$
  insert into gestlok_nfc_private.historial (actor, accion, code, comercio_id, sucursal_id, detalle)
  values (p_actor, p_accion, p_code, p_comercio, p_sucursal, left(coalesce(p_detalle, ''), 2000));
$$;

create or replace function gestlok_nfc_private.clean_name(p text, p_what text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 1 or char_length(v) > 80 then
    raise exception 'El nombre de % tiene que tener entre 1 y 80 caracteres', p_what using errcode = '22023';
  end if;
  return v;
end $$;

-- Link que usa la placa y de dónde sale: propio, de la sucursal o del comercio.
create or replace function gestlok_nfc_private.destino_de(p gestlok_nfc_private.placas)
returns jsonb
language sql stable set search_path = ''
as $$
  select case
    when p.destino is not null then jsonb_build_object('url', p.destino, 'origen', 'placa')
    when s.destino is not null then jsonb_build_object('url', s.destino, 'origen', 'sucursal')
    when c.destino is not null then jsonb_build_object('url', c.destino, 'origen', 'comercio')
    else jsonb_build_object('url', null, 'origen', null) end
  from (select 1) x
  left join gestlok_nfc_private.sucursales s on s.id = p.sucursal_id
  left join gestlok_nfc_private.comercios c on c.id = p.comercio_id
$$;

create or replace function gestlok_nfc_private.lugar(p_comercio uuid, p_sucursal uuid)
returns text
language sql stable set search_path = ''
as $$
  select coalesce((select c.nombre from gestlok_nfc_private.comercios c where c.id = p_comercio), 'Sin comercio')
      || coalesce(' · ' || (select s.nombre from gestlok_nfc_private.sucursales s where s.id = p_sucursal), '')
$$;

create or replace function gestlok_nfc_private.placa_json(p gestlok_nfc_private.placas)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.code, 'numero', p.numero, 'cliente', p.cliente, 'etiqueta', p.cliente, 'destino', p.destino, 'nota', p.nota,
    'activa', p.activa, 'escaneos', p.escaneos, 'ultimo_escaneo', p.ultimo_escaneo,
    'escaneos_30d', (select count(*) from gestlok_nfc_private.escaneos e
                     where e.code = p.code and e.at >= now() - interval '30 days'),
    'comercio_id', p.comercio_id, 'sucursal_id', p.sucursal_id,
    'destino_efectivo', d->>'url', 'origen', d->>'origen',
    'created_at', p.created_at, 'updated_at', p.updated_at)
  from (select gestlok_nfc_private.destino_de(p) d) x
$$;

create or replace function gestlok_nfc_private.comercio_json(c gestlok_nfc_private.comercios)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'destino', c.destino, 'nota', c.nota,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'destino', s.destino,
                              'created_at', s.created_at, 'updated_at', s.updated_at) order by lower(s.nombre), s.created_at)
                            from gestlok_nfc_private.sucursales s where s.comercio_id = c.id), '[]'::jsonb))
$$;

-- Normaliza una lista de códigos (máximo 500, sin repetidos).
create or replace function gestlok_nfc_private.codes(p text[])
returns text[]
language plpgsql immutable set search_path = ''
as $$
declare v text[];
begin
  select coalesce(array_agg(distinct upper(btrim(x))), '{}') into v
    from unnest(coalesce(p, '{}'::text[])) x where btrim(coalesce(x, '')) <> '';
  if cardinality(v) = 0 then raise exception 'Elegí al menos una placa' using errcode = '22023'; end if;
  if cardinality(v) > 500 then raise exception 'Podés cambiar hasta 500 placas por vez' using errcode = '22023'; end if;
  return v;
end $$;

-- Valida que la sucursal sea del comercio. Devuelve el comercio (o null si es «sin comercio»).
create or replace function gestlok_nfc_private.check_lugar(p_comercio uuid, p_sucursal uuid)
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if p_sucursal is not null and p_comercio is null then
    raise exception 'Elegí el comercio de la sucursal' using errcode = '22023';
  end if;
  if p_comercio is not null and not exists (select 1 from gestlok_nfc_private.comercios c where c.id = p_comercio) then
    raise exception 'El comercio no existe' using errcode = 'P0002';
  end if;
  if p_sucursal is not null and not exists (select 1 from gestlok_nfc_private.sucursales s
                                            where s.id = p_sucursal and s.comercio_id = p_comercio) then
    raise exception 'La sucursal no es de ese comercio' using errcode = '22023';
  end if;
end $$;

-- Resolución pública: cuenta el escaneo (con tope contra abusos) y decide a dónde va.
create or replace function gestlok_nfc_private.abrir(p_code text)
returns jsonb
language plpgsql volatile set search_path = ''
as $$
declare
  v_code text := upper(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'), 12));
  v_row  gestlok_nfc_private.placas;
  v_url  text;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  select p.* into v_row from gestlok_nfc_private.placas p where p.code = v_code;
  if not found then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  -- Hasta 30 escaneos por minuto y por placa se cuentan; más que eso no suma (evita inflar los números).
  if (select count(*) from gestlok_nfc_private.escaneos e
      where e.code = v_code and e.at > now() - interval '1 minute') < 30 then
    update gestlok_nfc_private.placas p set escaneos = p.escaneos + 1, ultimo_escaneo = now() where p.code = v_code;
    insert into gestlok_nfc_private.escaneos (code) values (v_code);
  end if;
  if v_row.activa then
    v_url := gestlok_nfc_private.destino_de(v_row)->>'url';
    if v_url is not null then return jsonb_build_object('estado', 'ok', 'url', v_url); end if;
  end if;
  -- Solo las placas sin comercio pueden usar el link general (si la creadora lo dejó cargado).
  if v_row.comercio_id is null then
    select a.destino_sin_activar into v_url from gestlok_nfc_private.ajustes a where a.id;
    if v_url is not null then return jsonb_build_object('estado', 'ok', 'url', v_url); end if;
  end if;
  return jsonb_build_object('estado', 'inactiva');
end $$;

-- 6. Funciones públicas --------------------------------------------------------------------------------------------
create or replace function public.gestlok_nfc_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform gestlok_nfc_private.require_creator();
  return jsonb_build_object(
    'scope', 'nfc_list',
    'version', 2,
    'generated_at', now(),
    'destino_sin_activar', (select a.destino_sin_activar from gestlok_nfc_private.ajustes a where a.id),
    'comercios', coalesce((select jsonb_agg(gestlok_nfc_private.comercio_json(c) order by lower(c.nombre), c.created_at)
                           from gestlok_nfc_private.comercios c), '[]'::jsonb),
    'placas', coalesce((select jsonb_agg(gestlok_nfc_private.placa_json(p) order by p.numero)
                        from gestlok_nfc_private.placas p), '[]'::jsonb));
end $$;

create or replace function public.gestlok_nfc_comercio_guardar(p_id uuid, p_nombre text, p_destino text, p_nota text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_nombre text := gestlok_nfc_private.clean_name(p_nombre, 'el comercio');
  v_dest text := gestlok_nfc_private.clean_url(p_destino);
  v_nota text := btrim(coalesce(p_nota, ''));
  v_old gestlok_nfc_private.comercios;
  v_row gestlok_nfc_private.comercios;
  v_n integer;
  v_det text := '';
begin
  if char_length(v_nota) > 300 then raise exception 'La nota admite hasta 300 caracteres' using errcode = '22023'; end if;
  if p_id is null then
    begin
      insert into gestlok_nfc_private.comercios (nombre, destino, nota) values (v_nombre, v_dest, v_nota) returning * into v_row;
    exception when unique_violation then
      raise exception 'Ya existe un comercio llamado «%»', v_nombre using errcode = '23505';
    end;
    perform gestlok_nfc_private.log(v_actor, 'comercio_creado', null, v_row.id, null,
      'Comercio creado: ' || v_nombre || coalesce(' · link ' || v_dest, ' · sin link'));
    return gestlok_nfc_private.comercio_json(v_row);
  end if;

  select c.* into v_old from gestlok_nfc_private.comercios c where c.id = p_id for update;
  if not found then raise exception 'El comercio no existe' using errcode = 'P0002'; end if;
  if v_dest is null and v_old.destino is not null then
    select count(*) into v_n from gestlok_nfc_private.placas p
      left join gestlok_nfc_private.sucursales s on s.id = p.sucursal_id
     where p.comercio_id = p_id and p.activa and p.destino is null and s.destino is null;
    if v_n > 0 then
      raise exception 'Hay % placa(s) activa(s) que usan el link del comercio. Desactivalas o cargá otro link.', v_n
        using errcode = '22023';
    end if;
  end if;
  begin
    update gestlok_nfc_private.comercios c set nombre = v_nombre, destino = v_dest, nota = v_nota, updated_at = now()
     where c.id = p_id returning * into v_row;
  exception when unique_violation then
    raise exception 'Ya existe un comercio llamado «%»', v_nombre using errcode = '23505';
  end;
  if v_old.nombre is distinct from v_nombre then v_det := v_det || 'Nombre: ' || v_old.nombre || ' → ' || v_nombre || '. '; end if;
  if v_old.destino is distinct from v_dest then
    v_det := v_det || 'Link: ' || coalesce(v_old.destino, 'sin link') || ' → ' || coalesce(v_dest, 'sin link') || '. ';
  end if;
  if v_old.nota is distinct from v_nota then v_det := v_det || 'Nota actualizada. '; end if;
  if v_det <> '' then
    perform gestlok_nfc_private.log(v_actor, 'comercio_editado', null, p_id, null, btrim(v_det));
  end if;
  return gestlok_nfc_private.comercio_json(v_row);
end $$;

create or replace function public.gestlok_nfc_sucursal_guardar(p_id uuid, p_comercio uuid, p_nombre text, p_destino text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_nombre text := gestlok_nfc_private.clean_name(p_nombre, 'la sucursal');
  v_dest text := gestlok_nfc_private.clean_url(p_destino);
  v_old gestlok_nfc_private.sucursales;
  v_row gestlok_nfc_private.sucursales;
  v_n integer;
  v_det text := '';
begin
  if p_id is null then
    if p_comercio is null or not exists (select 1 from gestlok_nfc_private.comercios c where c.id = p_comercio) then
      raise exception 'El comercio no existe' using errcode = 'P0002';
    end if;
    begin
      insert into gestlok_nfc_private.sucursales (comercio_id, nombre, destino) values (p_comercio, v_nombre, v_dest)
      returning * into v_row;
    exception when unique_violation then
      raise exception 'Ese comercio ya tiene una sucursal llamada «%»', v_nombre using errcode = '23505';
    end;
    perform gestlok_nfc_private.log(v_actor, 'sucursal_creada', null, p_comercio, v_row.id,
      'Sucursal creada: ' || v_nombre || coalesce(' · link ' || v_dest, ' · sin link'));
    return jsonb_build_object('id', v_row.id, 'comercio_id', v_row.comercio_id, 'nombre', v_row.nombre, 'destino', v_row.destino);
  end if;

  select s.* into v_old from gestlok_nfc_private.sucursales s where s.id = p_id for update;
  if not found then raise exception 'La sucursal no existe' using errcode = 'P0002'; end if;
  if p_comercio is not null and p_comercio <> v_old.comercio_id then
    raise exception 'Una sucursal no se puede pasar a otro comercio' using errcode = '22023';
  end if;
  if v_dest is null and v_old.destino is not null then
    select count(*) into v_n from gestlok_nfc_private.placas p
      join gestlok_nfc_private.comercios c on c.id = p.comercio_id
     where p.sucursal_id = p_id and p.activa and p.destino is null and c.destino is null;
    if v_n > 0 then
      raise exception 'Hay % placa(s) activa(s) que usan el link de esta sucursal. Desactivalas o cargá otro link.', v_n
        using errcode = '22023';
    end if;
  end if;
  begin
    update gestlok_nfc_private.sucursales s set nombre = v_nombre, destino = v_dest, updated_at = now()
     where s.id = p_id returning * into v_row;
  exception when unique_violation then
    raise exception 'Ese comercio ya tiene una sucursal llamada «%»', v_nombre using errcode = '23505';
  end;
  if v_old.nombre is distinct from v_nombre then v_det := v_det || 'Nombre: ' || v_old.nombre || ' → ' || v_nombre || '. '; end if;
  if v_old.destino is distinct from v_dest then
    v_det := v_det || 'Link: ' || coalesce(v_old.destino, 'sin link') || ' → ' || coalesce(v_dest, 'sin link') || '. ';
  end if;
  if v_det <> '' then
    perform gestlok_nfc_private.log(v_actor, 'sucursal_editada', null, v_row.comercio_id, p_id, btrim(v_det));
  end if;
  return jsonb_build_object('id', v_row.id, 'comercio_id', v_row.comercio_id, 'nombre', v_row.nombre, 'destino', v_row.destino);
end $$;

create or replace function public.gestlok_nfc_crear_placas(
  p_cantidad integer, p_comercio uuid, p_sucursal uuid, p_activar boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_start integer;
  v_code  text;
  v_tries integer;
  v_codes text[] := '{}';
  v_act   boolean := coalesce(p_activar, false);
  v_lugar text;
begin
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 200 then
    raise exception 'Podés crear entre 1 y 200 placas por vez' using errcode = '22023';
  end if;
  perform gestlok_nfc_private.check_lugar(p_comercio, p_sucursal);
  if v_act and coalesce((select s.destino from gestlok_nfc_private.sucursales s where s.id = p_sucursal),
                        (select c.destino from gestlok_nfc_private.comercios c where c.id = p_comercio)) is null then
    raise exception 'Para crearlas activas, cargá antes el link de la sucursal o del comercio' using errcode = '22023';
  end if;
  v_lugar := gestlok_nfc_private.lugar(p_comercio, p_sucursal);
  perform pg_advisory_xact_lock(hashtext('gestlok_nfc_create'));
  select coalesce(max(p.numero), 0) + 1 into v_start from gestlok_nfc_private.placas p;
  for i in 0..p_cantidad - 1 loop
    v_tries := 0;
    loop
      v_tries := v_tries + 1;
      v_code := gestlok_nfc_private.new_code();
      insert into gestlok_nfc_private.placas (code, numero, comercio_id, sucursal_id, activa)
        values (v_code, v_start + i, p_comercio, p_sucursal, v_act)
        on conflict (code) do nothing;
      exit when found;
      if v_tries >= 20 then
        raise exception 'No se pudo generar un código único' using errcode = 'P0001';
      end if;
    end loop;
    v_codes := v_codes || v_code;
    perform gestlok_nfc_private.log(v_actor, 'placa_creada', v_code, p_comercio, p_sucursal,
      'Placa N° ' || lpad((v_start + i)::text, 3, '0') || ' creada en ' || v_lugar || case when v_act then ' (activa)' else ' (sin activar)' end);
  end loop;
  return jsonb_build_object('creadas', p_cantidad, 'desde', v_start, 'hasta', v_start + p_cantidad - 1, 'codes', to_jsonb(v_codes));
end $$;

-- Compatibilidad: la versión anterior del panel crea placas sin comercio.
create or replace function public.gestlok_nfc_create(p_cantidad integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return public.gestlok_nfc_crear_placas(p_cantidad, null, null, false);
end $$;

create or replace function public.gestlok_nfc_update(
  p_code text, p_cliente text, p_destino text, p_nota text, p_activa boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_dest text := gestlok_nfc_private.clean_url(p_destino);
  v_cli  text := btrim(coalesce(p_cliente, ''));
  v_nota text := btrim(coalesce(p_nota, ''));
  v_act  boolean := coalesce(p_activa, false);
  v_old  gestlok_nfc_private.placas;
  v_row  gestlok_nfc_private.placas;
  v_det  text := '';
begin
  if char_length(v_cli) > 120 or char_length(v_nota) > 300 then
    raise exception 'La etiqueta admite hasta 120 caracteres y la nota hasta 300' using errcode = '22023';
  end if;
  select p.* into v_old from gestlok_nfc_private.placas p where p.code = v_code for update;
  if not found then raise exception 'La placa no existe' using errcode = 'P0002'; end if;
  v_row := v_old;
  v_row.destino := v_dest;
  if v_act and gestlok_nfc_private.destino_de(v_row)->>'url' is null then
    raise exception 'Para activar la placa cargá el link de destino' using errcode = '22023';
  end if;
  update gestlok_nfc_private.placas p
     set cliente = v_cli, destino = v_dest, nota = v_nota, activa = v_act, updated_at = now()
   where p.code = v_code
  returning p.* into v_row;
  if v_old.destino is distinct from v_dest then
    v_det := v_det || 'Link propio: ' || coalesce(v_old.destino, 'ninguno') || ' → ' || coalesce(v_dest, 'ninguno (usa el de su sucursal o comercio)') || '. ';
  end if;
  if v_old.cliente is distinct from v_cli then v_det := v_det || 'Etiqueta: ' || coalesce(nullif(v_old.cliente, ''), '—') || ' → ' || coalesce(nullif(v_cli, ''), '—') || '. '; end if;
  if v_old.nota is distinct from v_nota then v_det := v_det || 'Nota actualizada. '; end if;
  if v_det <> '' then
    perform gestlok_nfc_private.log(v_actor, 'placa_editada', v_code, v_row.comercio_id, v_row.sucursal_id, btrim(v_det));
  end if;
  if v_old.activa is distinct from v_act then
    perform gestlok_nfc_private.log(v_actor, case when v_act then 'placa_activada' else 'placa_desactivada' end,
      v_code, v_row.comercio_id, v_row.sucursal_id, case when v_act then 'Activada' else 'Desactivada' end);
  end if;
  return gestlok_nfc_private.placa_json(v_row);
end $$;

-- Activar o desactivar una o varias placas. Las que no tienen ningún link no se activan y se informan.
create or replace function public.gestlok_nfc_activar(p_codes text[], p_activa boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_codes text[] := gestlok_nfc_private.codes(p_codes);
  v_act boolean := coalesce(p_activa, false);
  v_row gestlok_nfc_private.placas;
  v_n integer := 0;
  v_sin text[] := '{}';
  v_falta text[] := '{}';
begin
  select coalesce(array_agg(c), '{}') into v_falta from unnest(v_codes) c
   where not exists (select 1 from gestlok_nfc_private.placas p where p.code = c);
  for v_row in select p.* from gestlok_nfc_private.placas p where p.code = any(v_codes) order by p.numero for update loop
    continue when v_row.activa = v_act;
    if v_act and gestlok_nfc_private.destino_de(v_row)->>'url' is null then
      v_sin := v_sin || v_row.code;
      continue;
    end if;
    update gestlok_nfc_private.placas p set activa = v_act, updated_at = now() where p.code = v_row.code;
    perform gestlok_nfc_private.log(v_actor, case when v_act then 'placa_activada' else 'placa_desactivada' end,
      v_row.code, v_row.comercio_id, v_row.sucursal_id, case when v_act then 'Activada' else 'Desactivada' end);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('cambiadas', v_n, 'sin_link', to_jsonb(v_sin), 'no_existen', to_jsonb(v_falta));
end $$;

-- Reasignar a otro comercio/sucursal (o dejarlas sin comercio). La placa deja su link propio y usa el del lugar nuevo;
-- si allí no hay link, queda desactivada. Al cambiar de comercio también se borra la etiqueta.
create or replace function public.gestlok_nfc_reasignar(p_codes text[], p_comercio uuid, p_sucursal uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_codes text[] := gestlok_nfc_private.codes(p_codes);
  v_row gestlok_nfc_private.placas;
  v_new gestlok_nfc_private.placas;
  v_n integer := 0;
  v_off integer := 0;
  v_de text;
  v_a text := gestlok_nfc_private.lugar(p_comercio, p_sucursal);
  v_falta text[] := '{}';
begin
  perform gestlok_nfc_private.check_lugar(p_comercio, p_sucursal);
  select coalesce(array_agg(c), '{}') into v_falta from unnest(v_codes) c
   where not exists (select 1 from gestlok_nfc_private.placas p where p.code = c);
  for v_row in select p.* from gestlok_nfc_private.placas p where p.code = any(v_codes) order by p.numero for update loop
    continue when v_row.comercio_id is not distinct from p_comercio and v_row.sucursal_id is not distinct from p_sucursal;
    v_de := gestlok_nfc_private.lugar(v_row.comercio_id, v_row.sucursal_id);
    v_new := v_row;
    v_new.comercio_id := p_comercio; v_new.sucursal_id := p_sucursal; v_new.destino := null;
    if v_row.comercio_id is distinct from p_comercio then v_new.cliente := ''; end if;
    v_new.activa := v_row.activa and gestlok_nfc_private.destino_de(v_new)->>'url' is not null;
    update gestlok_nfc_private.placas p
       set comercio_id = v_new.comercio_id, sucursal_id = v_new.sucursal_id, destino = null,
           cliente = v_new.cliente, activa = v_new.activa, updated_at = now()
     where p.code = v_row.code;
    perform gestlok_nfc_private.log(v_actor, 'placa_reasignada', v_row.code, p_comercio, p_sucursal,
      'Reasignada de ' || v_de || ' a ' || v_a || coalesce('. Se quitó su link propio (' || v_row.destino || ')', ''));
    if v_row.comercio_id is not null and v_row.comercio_id is distinct from p_comercio then
      perform gestlok_nfc_private.log(v_actor, 'placa_reasignada', v_row.code, v_row.comercio_id, v_row.sucursal_id,
        'Reasignada de ' || v_de || ' a ' || v_a);
    end if;
    if v_row.activa and not v_new.activa then
      perform gestlok_nfc_private.log(v_actor, 'placa_desactivada', v_row.code, p_comercio, p_sucursal,
        'Desactivada al reasignar: ' || v_a || ' no tiene link');
      v_off := v_off + 1;
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('movidas', v_n, 'desactivadas', v_off, 'no_existen', to_jsonb(v_falta));
end $$;

create or replace function public.gestlok_nfc_historial(p_code text, p_comercio uuid, p_limit integer)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform gestlok_nfc_private.require_creator();
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', h.at, 'accion', h.accion, 'detalle', h.detalle, 'code', h.code,
             'numero', p.numero, 'comercio_id', h.comercio_id, 'sucursal_id', h.sucursal_id,
             'lugar', case when h.comercio_id is null and h.sucursal_id is null then null
                           else gestlok_nfc_private.lugar(h.comercio_id, h.sucursal_id) end)
           order by h.at desc, h.id desc)
      from (select * from gestlok_nfc_private.historial h
             where (v_code is null or h.code = v_code)
               and (p_comercio is null or h.comercio_id = p_comercio)
             order by h.at desc, h.id desc limit v_lim) h
      left join gestlok_nfc_private.placas p on p.code = h.code), '[]'::jsonb);
end $$;

-- El link general ahora se puede quitar (sin link: las placas sin comercio y sin activar muestran «placa no activa»).
create or replace function public.gestlok_nfc_set_fallback(p_destino text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_dest text := gestlok_nfc_private.clean_url(p_destino);
  v_old text;
begin
  select a.destino_sin_activar into v_old from gestlok_nfc_private.ajustes a where a.id for update;
  update gestlok_nfc_private.ajustes a set destino_sin_activar = v_dest, updated_at = now() where a.id;
  if v_old is distinct from v_dest then
    perform gestlok_nfc_private.log(v_actor, 'ajuste_editado', null, null, null,
      'Link de placas sin comercio: ' || coalesce(v_old, 'ninguno') || ' → ' || coalesce(v_dest, 'ninguno'));
  end if;
  return v_dest;
end $$;

-- Público (anónimo): estado y link de una placa. Nunca devuelve comercio, sucursal, etiqueta, nota ni conteos.
create or replace function public.gestlok_nfc_abrir(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return gestlok_nfc_private.abrir(p_code);
end $$;

-- Compatibilidad con la página /r/ anterior: solo el link (o null si la placa no está activa).
create or replace function public.gestlok_nfc_resolve(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return gestlok_nfc_private.abrir(p_code)->>'url';
end $$;

-- 7. Permisos ------------------------------------------------------------------------------------------------------
revoke all on all functions in schema gestlok_nfc_private from public, anon, authenticated;
revoke all on function public.gestlok_nfc_list(), public.gestlok_nfc_create(integer),
  public.gestlok_nfc_update(text, text, text, text, boolean), public.gestlok_nfc_set_fallback(text),
  public.gestlok_nfc_resolve(text), public.gestlok_nfc_abrir(text),
  public.gestlok_nfc_comercio_guardar(uuid, text, text, text), public.gestlok_nfc_sucursal_guardar(uuid, uuid, text, text),
  public.gestlok_nfc_crear_placas(integer, uuid, uuid, boolean), public.gestlok_nfc_activar(text[], boolean),
  public.gestlok_nfc_reasignar(text[], uuid, uuid), public.gestlok_nfc_historial(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.gestlok_nfc_list(), public.gestlok_nfc_create(integer),
  public.gestlok_nfc_update(text, text, text, text, boolean), public.gestlok_nfc_set_fallback(text),
  public.gestlok_nfc_comercio_guardar(uuid, text, text, text), public.gestlok_nfc_sucursal_guardar(uuid, uuid, text, text),
  public.gestlok_nfc_crear_placas(integer, uuid, uuid, boolean), public.gestlok_nfc_activar(text[], boolean),
  public.gestlok_nfc_reasignar(text[], uuid, uuid), public.gestlok_nfc_historial(text, uuid, integer)
  to authenticated;
grant execute on function public.gestlok_nfc_resolve(text), public.gestlok_nfc_abrir(text) to anon, authenticated;
