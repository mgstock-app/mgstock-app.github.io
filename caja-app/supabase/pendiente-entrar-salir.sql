-- YA NO HACE FALTA (02/11/2026): la usuaria pidió GESTLOK Caja sin PIN. Lo reemplaza
-- supabase/migrations/20261102170000_caja_app_sin_pin.sql (caja_app_entrar_cuenta y caja_app_salir sin borrar).
-- No aplicar. Se deja como registro.
-- Caja app · las 2 funciones que faltan en Supabase (entrar con PIN y salir).
-- Mismo contenido que en 20261102050000_caja_app_base.sql. Solo crea estas dos funciones: no borra ni cambia datos.
-- (Adentro tienen «delete» de sesiones vencidas del PIN; por eso Supabase pide confirmación.)
-- Cómo aplicarlo: Supabase → proyecto vgsepaaewbctjsjcpeta → SQL Editor → New query → pegar todo → Run.
create function public.caja_app_entrar(p_local uuid, p_persona uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c uuid; p caja_app.personas; v_token text;
begin
  select comercio_id into v_c from caja_app.locales where id = p_local and activo;
  if v_c is null or caja_app.rol(v_c) is null then raise exception 'Sin acceso a este local' using errcode = '42501'; end if;
  select * into p from caja_app.personas where id = p_persona and comercio_id = v_c and activo
    and (cardinality(locales) = 0 or p_local = any(locales)) for update;
  if p.id is null then raise exception 'Esa persona no trabaja en este local' using errcode = '42501'; end if;
  if p.bloqueado_hasta is not null and p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Probá de nuevo en unos minutos.' using errcode = '42501';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or extensions.crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update caja_app.personas set
      intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
      bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '10 minutes' else bloqueado_hasta end
    where id = p.id;
    perform caja_app.auditar(v_c, null, 'pin_incorrecto', p.id, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'mensaje', 'PIN incorrecto');
  end if;
  update caja_app.personas set intentos_fallidos = 0, bloqueado_hasta = null where id = p.id;
  delete from caja_app.sesiones where persona_id = p.id and (expira_at < now() or user_id = auth.uid());
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into caja_app.sesiones (token_hash, persona_id, comercio_id, local_id, user_id, expira_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p.id, v_c, p_local, auth.uid(), now() + interval '14 hours');
  return jsonb_build_object('ok', true, 'token', v_token,
    'persona', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'gasto_maximo', p.gasto_maximo));
end $$;
create function public.caja_app_salir(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from caja_app.sesiones
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and user_id = auth.uid()
$$;
revoke all on function public.caja_app_entrar(uuid, uuid, text) from public, anon;
grant execute on function public.caja_app_entrar(uuid, uuid, text) to authenticated;
revoke all on function public.caja_app_salir(text) from public, anon;
grant execute on function public.caja_app_salir(text) to authenticated;
