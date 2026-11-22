-- Mensajes de contacto de la web pública (gestlok.com.ar).
-- Cualquier visitante puede ENVIAR un mensaje (nombre, teléfono opcional, email y mensaje),
-- pero solo la creadora (kmu15lopez@gmail.com, correo confirmado y administradora registrada)
-- puede leerlos, marcarlos y borrarlos. La tabla no se expone: todo pasa por funciones.

create schema if not exists gestlok_contacto_private;
revoke all on schema gestlok_contacto_private from public, anon, authenticated;

create table if not exists gestlok_contacto_private.mensajes (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 2 and 80),
  telefono text check (telefono is null or char_length(telefono) between 6 and 30),
  email text not null check (char_length(email) between 6 and 120),
  mensaje text not null check (char_length(mensaje) between 5 and 2000),
  consentimiento boolean not null check (consentimiento),
  origen text not null default '',
  leido boolean not null default false,
  leido_en timestamptz
);
create index if not exists mensajes_creado_idx on gestlok_contacto_private.mensajes (creado desc);
create index if not exists mensajes_origen_idx on gestlok_contacto_private.mensajes (origen, creado desc);
alter table gestlok_contacto_private.mensajes enable row level security;
revoke all on gestlok_contacto_private.mensajes from public, anon, authenticated;

-- Misma verificación que el inicio de la creadora y NFC y QR.
create or replace function gestlok_contacto_private.require_creator()
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
revoke all on function gestlok_contacto_private.require_creator() from public, anon, authenticated;

-- Envío desde la web. Valida todo en el servidor y limita la cantidad de mensajes:
-- 5 por hora desde una misma conexión, 3 por hora por email y 60 cada 10 minutos en total.
-- La conexión se guarda solo como huella (md5), nunca la dirección IP.
create or replace function public.gestlok_contacto_enviar(
  p_nombre text, p_telefono text, p_email text, p_mensaje text, p_consentimiento boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_tel    text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_msg    text := btrim(coalesce(p_mensaje, ''));
  v_hdr    json;
  v_ip     text;
  v_origen text;
begin
  if p_consentimiento is distinct from true then
    raise exception 'Para enviar el mensaje tenés que aceptar el uso de tus datos.' using errcode = '22023';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    raise exception 'Escribí tu nombre (entre 2 y 80 caracteres).' using errcode = '22023';
  end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Revisá el email.' using errcode = '22023';
  end if;
  if v_tel is not null and v_tel !~ '^[0-9+() .-]{6,30}$' then
    raise exception 'Revisá el teléfono: solo números, espacios, guiones o +.' using errcode = '22023';
  end if;
  if char_length(v_msg) < 5 or char_length(v_msg) > 2000 then
    raise exception 'Escribí tu mensaje (entre 5 y 2000 caracteres).' using errcode = '22023';
  end if;

  begin
    v_hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_hdr := null;
  end;
  v_ip := coalesce(v_hdr->>'cf-connecting-ip', v_hdr->>'x-real-ip',
                   btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), '');
  v_origen := md5('gestlok-contacto:' || v_ip);

  if v_ip <> '' and (select count(*) from gestlok_contacto_private.mensajes m
                     where m.origen = v_origen and m.creado > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos tus mensajes. Probá de nuevo más tarde.' using errcode = 'P0001';
  end if;
  if (select count(*) from gestlok_contacto_private.mensajes m
      where m.email = v_email and m.creado > now() - interval '1 hour') >= 3 then
    raise exception 'Ya recibimos tus mensajes. Probá de nuevo más tarde.' using errcode = 'P0001';
  end if;
  if (select count(*) from gestlok_contacto_private.mensajes m
      where m.creado > now() - interval '10 minutes') >= 60 then
    raise exception 'Hay muchos mensajes en este momento. Probá en unos minutos.' using errcode = 'P0001';
  end if;

  insert into gestlok_contacto_private.mensajes (nombre, telefono, email, mensaje, consentimiento, origen)
  values (v_nombre, v_tel, v_email, v_msg, true, v_origen);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.gestlok_contacto_enviar(text, text, text, text, boolean) from public;
grant execute on function public.gestlok_contacto_enviar(text, text, text, text, boolean) to anon, authenticated;

-- Bandeja de la creadora.
create or replace function public.gestlok_contacto_listar(p_limite integer default 200)
returns table (id uuid, creado timestamptz, nombre text, telefono text, email text, mensaje text, leido boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform gestlok_contacto_private.require_creator();
  return query
    select m.id, m.creado, m.nombre, m.telefono, m.email, m.mensaje, m.leido
    from gestlok_contacto_private.mensajes m
    order by m.creado desc
    limit least(greatest(coalesce(p_limite, 200), 1), 500);
end $$;
revoke all on function public.gestlok_contacto_listar(integer) from public, anon;
grant execute on function public.gestlok_contacto_listar(integer) to authenticated;

create or replace function public.gestlok_contacto_marcar(p_id uuid, p_leido boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform gestlok_contacto_private.require_creator();
  update gestlok_contacto_private.mensajes m
     set leido = coalesce(p_leido, true),
         leido_en = case when coalesce(p_leido, true) then now() else null end
   where m.id = p_id;
  if not found then raise exception 'Mensaje inexistente' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.gestlok_contacto_marcar(uuid, boolean) from public, anon;
grant execute on function public.gestlok_contacto_marcar(uuid, boolean) to authenticated;

create or replace function public.gestlok_contacto_borrar(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform gestlok_contacto_private.require_creator();
  delete from gestlok_contacto_private.mensajes m where m.id = p_id;
  if not found then raise exception 'Mensaje inexistente' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.gestlok_contacto_borrar(uuid) from public, anon;
grant execute on function public.gestlok_contacto_borrar(uuid) to authenticated;
