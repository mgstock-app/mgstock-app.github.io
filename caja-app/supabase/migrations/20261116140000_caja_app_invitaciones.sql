-- GESTLOK Caja · invitar al equipo (16/11/2026). Era el pendiente de la etapa 6 del plan: «si otra persona carga en
-- la caja necesita su propia cuenta». El dueño crea una invitación (un código de un solo uso, vence a los 7 días) y la
-- persona la acepta con su propia cuenta: queda con acceso a la caja de ese comercio, sin ver el panel del dueño.
-- Solo agrega una tabla y funciones. No borra ni modifica datos existentes; no toca GESTLOK ni otros esquemas.

create table if not exists caja_app.invitaciones(
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references caja_app.comercios(id),
  codigo_hash text not null unique,                  -- nunca se guarda el código, solo su huella
  nombre text not null check (char_length(nombre) between 2 and 50 and nombre = btrim(nombre)),
  rol text not null check (rol in ('encargado','cajero')),
  locales uuid[] not null default '{}',              -- vacío = todos los locales
  creado_por uuid not null,
  creado_at timestamptz not null default now(),
  expira_at timestamptz not null,
  usado_por uuid,
  usado_at timestamptz,
  anulada_at timestamptz
);
create index if not exists caja_app_invitaciones_comercio on caja_app.invitaciones (comercio_id, creado_at desc);
alter table caja_app.invitaciones enable row level security;
revoke all on table caja_app.invitaciones from public, anon, authenticated;

-- Equipo del comercio: personas (con o sin cuenta) e invitaciones pendientes. Solo el dueño.
create or replace function public.caja_app_equipo(p_comercio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform caja_app.exigir_dueno(p_comercio);
  return jsonb_build_object(
    'personas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'activo', p.activo,
        'locales', to_jsonb(p.locales), 'con_cuenta', p.user_id is not null,
        'yo', p.user_id is not null and p.user_id = auth.uid()) order by (p.rol = 'dueno') desc, p.nombre)
      from caja_app.personas p where p.comercio_id = p_comercio), '[]'::jsonb),
    'invitaciones', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'rol', i.rol,
        'locales', to_jsonb(i.locales), 'expira_at', i.expira_at) order by i.creado_at desc)
      from caja_app.invitaciones i
      where i.comercio_id = p_comercio and i.usado_at is null and i.anulada_at is null and i.expira_at > now()), '[]'::jsonb));
end $$;

-- Crear una invitación. Devuelve el código una sola vez (después solo queda su huella).
create or replace function public.caja_app_invitar(p_comercio uuid, p_nombre text, p_rol text, p_locales uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_locales uuid[] := coalesce(p_locales, '{}'); v_nombre text := btrim(coalesce(p_nombre, ''));
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v_bytes bytea; v_codigo text; v_id uuid; v_expira timestamptz;
begin
  perform caja_app.exigir_dueno(p_comercio);
  if char_length(v_nombre) not between 2 and 50 or p_rol is null or p_rol not in ('encargado','cajero') then
    raise exception 'Revisá el nombre y el rol' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_locales) x where x not in (select id from caja_app.locales where comercio_id = p_comercio)) then
    raise exception 'Hay locales que no son de tu comercio' using errcode = '42501';
  end if;
  if (select count(*) from caja_app.invitaciones where comercio_id = p_comercio and usado_at is null and anulada_at is null
      and expira_at > now()) >= 20 then
    raise exception 'Ya hay 20 invitaciones sin usar. Anulá alguna antes de crear otra.' using errcode = '22023';
  end if;
  if (select count(*) from caja_app.personas where comercio_id = p_comercio) >= 60 then
    raise exception 'Máximo 60 personas' using errcode = '22023';
  end if;
  v_bytes := extensions.gen_random_bytes(12);
  select string_agg(substr(v_alfabeto, 1 + (get_byte(v_bytes, g) % 31), 1), '' order by g) into v_codigo from generate_series(0, 11) g;
  v_expira := now() + interval '7 days';
  insert into caja_app.invitaciones (comercio_id, codigo_hash, nombre, rol, locales, creado_por, expira_at)
  values (p_comercio, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), v_nombre, p_rol, v_locales, auth.uid(), v_expira)
  returning id into v_id;
  perform caja_app.auditar(p_comercio, null, 'invitacion', null, jsonb_build_object('id', v_id, 'nombre', v_nombre, 'rol', p_rol));
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'expira_at', v_expira, 'equipo', public.caja_app_equipo(p_comercio));
end $$;

-- Anular una invitación que todavía nadie usó (no se borra: queda anulada).
create or replace function public.caja_app_anular_invitacion(p_comercio uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform caja_app.exigir_dueno(p_comercio);
  update caja_app.invitaciones set anulada_at = now()
  where id = p_id and comercio_id = p_comercio and usado_at is null and anulada_at is null returning id into v;
  if v is null then raise exception 'Esa invitación ya no está pendiente' using errcode = '22023'; end if;
  perform caja_app.auditar(p_comercio, null, 'invitacion_anulada', null, jsonb_build_object('id', v));
  return public.caja_app_equipo(p_comercio);
end $$;

-- Aceptar con la propia cuenta. Un código sirve una sola vez; el mensaje de error no distingue el motivo.
create or replace function public.caja_app_aceptar_invitacion(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i caja_app.invitaciones; p caja_app.personas; v_final text; n int := 1; v_locales uuid[];
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para aceptar la invitación' using errcode = '42501'; end if;
  select x.* into i from caja_app.invitaciones x join caja_app.comercios c on c.id = x.comercio_id and c.estado = 'activo'
  where char_length(v_codigo) = 12 and x.codigo_hash = encode(extensions.digest(v_codigo, 'sha256'), 'hex')
    and x.usado_at is null and x.anulada_at is null and x.expira_at > now()
  for update of x;
  if i.id is null then
    raise exception 'Esta invitación no existe, venció o ya se usó. Pedile una nueva al dueño.' using errcode = '22023';
  end if;
  if exists (select 1 from caja_app.miembros where comercio_id = i.comercio_id and user_id = auth.uid() and rol = 'dueno') then
    raise exception 'Esta cuenta ya es dueña de este comercio. La invitación es para otra persona.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('caja_app_entrar_cuenta'), hashtext(i.comercio_id::text));
  -- Solo los locales de la invitación que siguen existiendo en el comercio.
  select coalesce(array_agg(l.id), '{}') into v_locales from caja_app.locales l where l.comercio_id = i.comercio_id and l.id = any(i.locales);
  if cardinality(i.locales) > 0 and cardinality(v_locales) = 0 then
    raise exception 'Esta invitación no existe, venció o ya se usó. Pedile una nueva al dueño.' using errcode = '22023';
  end if;
  insert into caja_app.miembros (comercio_id, user_id, rol) values (i.comercio_id, auth.uid(), 'encargado')
  on conflict (comercio_id, user_id) do nothing;
  select * into p from caja_app.personas where comercio_id = i.comercio_id and user_id = auth.uid();
  if p.id is null then
    v_final := i.nombre;
    while exists (select 1 from caja_app.personas where comercio_id = i.comercio_id and nombre = v_final) loop
      n := n + 1; v_final := i.nombre || ' ' || n;
    end loop;
    insert into caja_app.personas (comercio_id, nombre, rol, locales, pin_hash, user_id)
    values (i.comercio_id, v_final, i.rol, v_locales,
      extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', 8)), auth.uid())
    returning * into p;
  else
    update caja_app.personas set rol = i.rol, locales = v_locales, activo = true where id = p.id returning * into p;
  end if;
  update caja_app.invitaciones set usado_por = auth.uid(), usado_at = now() where id = i.id;
  perform caja_app.auditar(i.comercio_id, null, 'invitacion_aceptada', p.id, jsonb_build_object('id', i.id, 'nombre', p.nombre, 'rol', p.rol));
  return jsonb_build_object('ok', true, 'comercio_id', i.comercio_id,
    'comercio', (select c.nombre from caja_app.comercios c where c.id = i.comercio_id), 'persona', p.nombre, 'rol', p.rol);
end $$;

-- Quitar o devolver el acceso de una persona del equipo (nunca del dueño). Al quitarlo, sus sesiones vencen al instante.
create or replace function public.caja_app_acceso_persona(p_comercio uuid, p_persona uuid, p_activo boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p caja_app.personas;
begin
  perform caja_app.exigir_dueno(p_comercio);
  if p_activo is null then raise exception 'Indicá si tiene acceso' using errcode = '22023'; end if;
  select * into p from caja_app.personas where id = p_persona and comercio_id = p_comercio for update;
  if p.id is null then raise exception 'Persona inexistente' using errcode = '22023'; end if;
  if p.rol = 'dueno' or exists (select 1 from caja_app.miembros m where m.comercio_id = p_comercio and m.user_id = p.user_id and m.rol = 'dueno') then
    raise exception 'El acceso del dueño no se puede quitar' using errcode = '22023';
  end if;
  update caja_app.personas set activo = p_activo where id = p.id;
  if not p_activo then
    update caja_app.sesiones set expira_at = least(expira_at, now()) where persona_id = p.id;
  end if;
  perform caja_app.auditar(p_comercio, null, 'persona_acceso', p.id, jsonb_build_object('nombre', p.nombre, 'activo', p_activo));
  return public.caja_app_equipo(p_comercio);
end $$;

revoke all on function public.caja_app_equipo(uuid) from public, anon;
revoke all on function public.caja_app_invitar(uuid, text, text, uuid[]) from public, anon;
revoke all on function public.caja_app_anular_invitacion(uuid, uuid) from public, anon;
revoke all on function public.caja_app_aceptar_invitacion(text) from public, anon;
revoke all on function public.caja_app_acceso_persona(uuid, uuid, boolean) from public, anon;
grant execute on function public.caja_app_equipo(uuid) to authenticated;
grant execute on function public.caja_app_invitar(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.caja_app_anular_invitacion(uuid, uuid) to authenticated;
grant execute on function public.caja_app_aceptar_invitacion(text) to authenticated;
grant execute on function public.caja_app_acceso_persona(uuid, uuid, boolean) to authenticated;
