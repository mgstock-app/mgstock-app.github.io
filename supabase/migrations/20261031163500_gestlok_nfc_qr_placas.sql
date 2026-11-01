-- NFC y QR: placas reutilizables de la creadora.
-- Cada placa lleva un código fijo (QR y chip NFC apuntan a https://gestlok.com.ar/r/?CODIGO).
-- El destino se cambia desde el panel de la creadora sin volver a imprimir ni a grabar la placa.
-- No pertenece a ninguna empresa ni local: no toca datos de Mi Gusto, Munro ni Torcuato.
-- Lectura y edición: exclusivas de la creadora verificada. Público: solo resolver un código a su destino.

create schema if not exists gestlok_nfc_private;
revoke all on schema gestlok_nfc_private from public, anon, authenticated;

create table if not exists gestlok_nfc_private.placas (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  numero integer not null unique check (numero > 0),
  cliente text not null default '' check (char_length(cliente) <= 120),
  destino text check (destino is null or (destino ~* '^https?://[^[:space:]<>"]+$' and char_length(destino) <= 1000)),
  nota text not null default '' check (char_length(nota) <= 300),
  activa boolean not null default false,
  escaneos integer not null default 0 check (escaneos >= 0),
  ultimo_escaneo timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not activa or destino is not null)
);

create table if not exists gestlok_nfc_private.escaneos (
  id bigint generated always as identity primary key,
  code text not null references gestlok_nfc_private.placas(code) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists escaneos_code_at_idx on gestlok_nfc_private.escaneos (code, at desc);

create table if not exists gestlok_nfc_private.ajustes (
  id boolean primary key default true check (id),
  destino_sin_activar text not null default 'https://belisaparfum.mitiendanube.com/'
    check (destino_sin_activar ~* '^https?://[^[:space:]<>"]+$' and char_length(destino_sin_activar) <= 1000),
  updated_at timestamptz not null default now()
);
insert into gestlok_nfc_private.ajustes (id) values (true) on conflict (id) do nothing;

alter table gestlok_nfc_private.placas enable row level security;
alter table gestlok_nfc_private.escaneos enable row level security;
alter table gestlok_nfc_private.ajustes enable row level security;
revoke all on gestlok_nfc_private.placas, gestlok_nfc_private.escaneos, gestlok_nfc_private.ajustes from public, anon, authenticated;

-- Misma verificación que el inicio de la creadora: administradora registrada, correo confirmado y propio.
create or replace function gestlok_nfc_private.require_creator()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_admin uuid := gestlok_platform.require_admin();
  v_mail  text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if v_mail <> 'kmu15lopez@gmail.com'
     or not exists (select 1 from auth.users u
                    where u.id = v_admin and u.email_confirmed_at is not null and lower(u.email) = v_mail) then
    raise exception 'Acceso exclusivo de la creadora' using errcode = '42501';
  end if;
  return v_admin;
end $$;

-- Código de 6 caracteres sin O/0/I/1 (no se confunden al leerlos), con azar de gen_random_uuid.
create or replace function gestlok_nfc_private.new_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  r text := '';
begin
  for i in 0..5 loop
    r := r || substr(a, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function gestlok_nfc_private.clean_url(p text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is null then return null; end if;
  if v !~* '^https?://[^[:space:]<>"]+$' or char_length(v) > 1000 then
    raise exception 'El destino tiene que ser un link completo que empiece con https://' using errcode = '22023';
  end if;
  return v;
end $$;

create or replace function gestlok_nfc_private.placa_json(p gestlok_nfc_private.placas)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'code', p.code, 'numero', p.numero, 'cliente', p.cliente, 'destino', p.destino, 'nota', p.nota,
    'activa', p.activa, 'escaneos', p.escaneos, 'ultimo_escaneo', p.ultimo_escaneo,
    'escaneos_30d', (select count(*) from gestlok_nfc_private.escaneos e
                     where e.code = p.code and e.at >= now() - interval '30 days'),
    'created_at', p.created_at, 'updated_at', p.updated_at)
$$;

create or replace function public.gestlok_nfc_list()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform gestlok_nfc_private.require_creator();
  return jsonb_build_object(
    'scope', 'nfc_list',
    'generated_at', now(),
    'destino_sin_activar', (select a.destino_sin_activar from gestlok_nfc_private.ajustes a where a.id),
    'placas', coalesce((select jsonb_agg(gestlok_nfc_private.placa_json(p) order by p.numero)
                        from gestlok_nfc_private.placas p), '[]'::jsonb));
end $$;

create or replace function public.gestlok_nfc_create(p_cantidad integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_start integer;
  v_code  text;
  v_tries integer;
begin
  perform gestlok_nfc_private.require_creator();
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 200 then
    raise exception 'Podés crear entre 1 y 200 placas por vez' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('gestlok_nfc_create'));
  select coalesce(max(p.numero), 0) + 1 into v_start from gestlok_nfc_private.placas p;
  for i in 0..p_cantidad - 1 loop
    v_tries := 0;
    loop
      v_tries := v_tries + 1;
      v_code := gestlok_nfc_private.new_code();
      insert into gestlok_nfc_private.placas (code, numero) values (v_code, v_start + i)
        on conflict (code) do nothing;
      exit when found;
      if v_tries >= 20 then
        raise exception 'No se pudo generar un código único' using errcode = 'P0001';
      end if;
    end loop;
  end loop;
  return jsonb_build_object('creadas', p_cantidad, 'desde', v_start, 'hasta', v_start + p_cantidad - 1);
end $$;

create or replace function public.gestlok_nfc_update(
  p_code text, p_cliente text, p_destino text, p_nota text, p_activa boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_dest text;
  v_row  gestlok_nfc_private.placas;
begin
  perform gestlok_nfc_private.require_creator();
  v_dest := gestlok_nfc_private.clean_url(p_destino);
  if coalesce(p_activa, false) and v_dest is null then
    raise exception 'Para activar la placa cargá el link de destino' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_cliente, ''))) > 120 or char_length(btrim(coalesce(p_nota, ''))) > 300 then
    raise exception 'El cliente admite hasta 120 caracteres y la nota hasta 300' using errcode = '22023';
  end if;
  update gestlok_nfc_private.placas p
     set cliente = btrim(coalesce(p_cliente, '')), destino = v_dest, nota = btrim(coalesce(p_nota, '')),
         activa = coalesce(p_activa, false), updated_at = now()
   where p.code = v_code
  returning p.* into v_row;
  if not found then
    raise exception 'La placa no existe' using errcode = 'P0002';
  end if;
  return gestlok_nfc_private.placa_json(v_row);
end $$;

create or replace function public.gestlok_nfc_set_fallback(p_destino text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare v_dest text;
begin
  perform gestlok_nfc_private.require_creator();
  v_dest := gestlok_nfc_private.clean_url(p_destino);
  if v_dest is null then
    raise exception 'Cargá el link al que van las placas sin activar' using errcode = '22023';
  end if;
  update gestlok_nfc_private.ajustes a set destino_sin_activar = v_dest, updated_at = now() where a.id;
  return v_dest;
end $$;

-- Público (anónimo): la página /r/ convierte el código en su destino y suma el escaneo.
-- Solo devuelve un link; nunca el cliente, la nota ni los conteos.
create or replace function public.gestlok_nfc_resolve(p_code text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text := upper(left(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'), 12));
  v_dest text;
  v_fb   text;
begin
  select a.destino_sin_activar into v_fb from gestlok_nfc_private.ajustes a where a.id;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return v_fb;
  end if;
  update gestlok_nfc_private.placas p
     set escaneos = p.escaneos + 1, ultimo_escaneo = now()
   where p.code = v_code
  returning case when p.activa then p.destino end into v_dest;
  if found then
    insert into gestlok_nfc_private.escaneos (code) values (v_code);
  end if;
  return coalesce(v_dest, v_fb);
end $$;

revoke all on all functions in schema gestlok_nfc_private from public, anon, authenticated;
revoke all on function public.gestlok_nfc_list(), public.gestlok_nfc_create(integer),
  public.gestlok_nfc_update(text, text, text, text, boolean), public.gestlok_nfc_set_fallback(text),
  public.gestlok_nfc_resolve(text) from public, anon, authenticated;
grant execute on function public.gestlok_nfc_list(), public.gestlok_nfc_create(integer),
  public.gestlok_nfc_update(text, text, text, text, boolean), public.gestlok_nfc_set_fallback(text) to authenticated;
grant execute on function public.gestlok_nfc_resolve(text) to anon, authenticated;
