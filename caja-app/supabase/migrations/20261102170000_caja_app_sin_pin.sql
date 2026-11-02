-- GESTLOK Caja sin PIN (pedido de la usuaria, 02/11/2026: «No ponerle pin a Gestlok!!»).
-- Cada persona entra con su propia cuenta (la misma de GESTLOK): la sesión de caja se abre con la cuenta,
-- sin elegir persona ni escribir PIN. Solo agrega una columna, un índice y funciones, y cambia el texto del
-- aviso de sesión vencida. No borra ni modifica datos existentes.

alter table caja_app.personas add column if not exists user_id uuid;
create unique index if not exists caja_app_personas_cuenta on caja_app.personas (comercio_id, user_id) where user_id is not null;

-- Entrar con la cuenta: usa la persona de esa cuenta en el comercio. Quien creó el comercio usa la persona dueña
-- del alta; otra cuenta con acceso recibe su propia persona con el rol de la cuenta (y un PIN al azar que nadie usa).
create or replace function public.caja_app_entrar_cuenta(p_local uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c uuid; v_rol text; p caja_app.personas; v_token text; v_u jsonb; v_nombre text; v_final text; n int := 1;
begin
  select comercio_id into v_c from caja_app.locales where id = p_local and activo;
  if v_c is not null then v_rol := caja_app.rol(v_c); end if;
  if v_rol is null then raise exception 'Sin acceso a este local' using errcode = '42501'; end if;
  -- Una entrada por comercio a la vez: dos equipos que entran juntos no crean dos personas para la misma cuenta.
  perform pg_advisory_xact_lock(hashtext('caja_app_entrar_cuenta'), hashtext(v_c::text));
  select * into p from caja_app.personas where comercio_id = v_c and user_id = auth.uid();
  if p.id is null and exists (select 1 from caja_app.comercios where id = v_c and creado_por = auth.uid()) then
    update caja_app.personas set user_id = auth.uid()
    where id = (select x.id from caja_app.personas x where x.comercio_id = v_c and x.rol = 'dueno' and x.user_id is null
                order by x.creado_at, x.id limit 1)
    returning * into p;
  end if;
  if p.id is null then
    select to_jsonb(u) into v_u from auth.users u where u.id = auth.uid();
    v_nombre := left(btrim(coalesce(nullif(btrim(v_u->'raw_user_meta_data'->>'full_name'), ''),
      nullif(btrim(v_u->'raw_user_meta_data'->>'name'), ''), split_part(coalesce(v_u->>'email', ''), '@', 1))), 50);
    if char_length(v_nombre) < 2 then v_nombre := 'Cuenta'; end if;
    v_final := v_nombre;
    while exists (select 1 from caja_app.personas where comercio_id = v_c and nombre = v_final) loop
      n := n + 1; v_final := v_nombre || ' ' || n;
    end loop;
    insert into caja_app.personas (comercio_id, nombre, rol, pin_hash, user_id)
    values (v_c, v_final, v_rol, extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', 8)), auth.uid())
    returning * into p;
    perform caja_app.auditar(v_c, null, 'persona_cuenta', p.id, jsonb_build_object('nombre', p.nombre, 'rol', p.rol));
  end if;
  if not p.activo then raise exception 'Tu usuario está desactivado en esta caja. Hablá con el dueño.' using errcode = '42501'; end if;
  if cardinality(p.locales) > 0 and not (p_local = any(p.locales)) then
    raise exception 'Tu usuario no trabaja en este local' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into caja_app.sesiones (token_hash, persona_id, comercio_id, local_id, user_id, expira_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p.id, v_c, p_local, auth.uid(), now() + interval '14 hours');
  return jsonb_build_object('ok', true, 'token', v_token,
    'persona', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'gasto_maximo', p.gasto_maximo));
end $$;

-- Salir: la sesión de ese equipo vence en el momento (no se borra nada).
create or replace function public.caja_app_salir(p_token text) returns void
language sql security definer set search_path = '' as $$
  update caja_app.sesiones set expira_at = least(expira_at, now())
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and user_id = auth.uid()
$$;

-- Mismo control de sesión; el aviso ya no menciona el PIN (la app vuelve a entrar sola con la cuenta).
create or replace function caja_app.operador(p_token text) returns caja_app.sesiones
language plpgsql stable security definer set search_path = '' as $$
declare s caja_app.sesiones;
begin
  select x.* into s
  from caja_app.sesiones x
  join caja_app.personas p on p.id = x.persona_id and p.activo
  join caja_app.miembros m on m.comercio_id = x.comercio_id and m.user_id = auth.uid()
  join caja_app.comercios c on c.id = x.comercio_id and c.estado = 'activo'
  join caja_app.locales l on l.id = x.local_id and l.activo
  where auth.uid() is not null and x.user_id = auth.uid() and x.expira_at > now()
    and x.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and (cardinality(p.locales) = 0 or x.local_id = any(p.locales));
  if s.token_hash is null then
    raise exception 'Tu sesión de caja venció. Volvé a entrar.' using errcode = '42501';
  end if;
  return s;
end $$;

revoke all on function public.caja_app_entrar_cuenta(uuid) from public, anon;
grant execute on function public.caja_app_entrar_cuenta(uuid) to authenticated;
revoke all on function public.caja_app_salir(text) from public, anon;
grant execute on function public.caja_app_salir(text) to authenticated;
revoke all on function caja_app.operador(text) from public, anon, authenticated;
