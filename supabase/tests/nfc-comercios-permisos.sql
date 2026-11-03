-- NFC y QR por comercio y sucursal: reglas, permisos y seguridad.
-- Sirve en la base real (Supabase) y en PostgreSQL local/CI (tests/fixtures/nfc/base.sql + migraciones).
-- Termina SIEMPRE con una excepción a propósito que devuelve el informe: se deshace todo, no deja datos.
-- Cada línea del informe empieza con OK u FALLA; la prueba pasa si no hay ninguna FALLA.
do $t$
declare
  r text := ''; v jsonb; d text; n integer; fb text;
  cre uuid; cre_mail text; due uuid; due_mail text; adm uuid; adm_mail text;
  ca uuid; cb uuid; a1 uuid; a2 uuid; b1 uuid;
  pa1 text; pa2 text; pa3 text; pb1 text; pb2 text; pl text;
  t_list text;
  cre_claims text; ok boolean;
begin
  select a.user_id, lower(u.email) into cre, cre_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id
    where u.email_confirmed_at is not null and lower(u.email) = 'kmu15lopez@gmail.com' limit 1;
  select u.id, lower(u.email) into due, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null
      and lower(u.email) <> 'kmu15lopez@gmail.com' order by u.created_at limit 1;
  select a.user_id, lower(u.email) into adm, adm_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id
    where u.email_confirmed_at is not null and lower(u.email) <> 'kmu15lopez@gmail.com' limit 1;
  select a.destino_sin_activar into fb from gestlok_nfc_private.ajustes a where a.id;
  r := r || E'\n' || case when cre is not null and due is not null then 'OK' else 'FALLA' end || ' cuentas de prueba encontradas';

  -- Estructura y privilegios (como postgres) ------------------------------------------------------------------
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'gestlok_nfc_private' and c.relkind = 'r' and not c.relrowsecurity;
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' RLS activa en todas las tablas privadas (' || n || ' sin RLS)';
  select count(*) into n from information_schema.role_table_grants g
   where g.table_schema = 'gestlok_nfc_private' and g.grantee in ('anon', 'authenticated', 'PUBLIC');
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' tablas privadas sin permisos para anon/authenticated (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'gestlok_nfc_private'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' funciones internas no ejecutables desde la app (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'gestlok_nfc%' and p.proname not in ('gestlok_nfc_resolve', 'gestlok_nfc_abrir')
     and has_function_privilege('anon', p.oid, 'execute');
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' anónimo solo puede abrir códigos (' || n || ' funciones de más)';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'gestlok_nfc%' and (not p.prosecdef or not ('search_path=""' = any(coalesce(p.proconfig, '{}'))));
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' funciones públicas con search_path fijo (' || n || ')';

  -- Creadora --------------------------------------------------------------------------------------------------
  cre_claims := json_build_object('sub', cre, 'email', cre_mail, 'role', 'authenticated')::text;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', cre_claims, true);

  ca := (public.gestlok_nfc_comercio_guardar(null, 'Café <b>Prueba</b> NFC', 'https://example.com/comercio-a', 'nota'))->>'id';
  cb := (public.gestlok_nfc_comercio_guardar(null, 'Heladería Prueba NFC', null, ''))->>'id';
  r := r || E'\n' || case when ca is not null and cb is not null then 'OK' else 'FALLA' end || ' crea dos comercios (uno sin link)';
  begin perform public.gestlok_nfc_comercio_guardar(null, '  café <B>PRUEBA</B>   nfc ', null, ''); r := r || E'\nFALLA nombre de comercio repetido aceptado';
  exception when others then r := r || E'\n' || case when sqlstate = '23505' then 'OK' else 'FALLA' end || ' nombre de comercio repetido rechazado (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_comercio_guardar(null, 'Otro', 'javascript:alert(1)', ''); r := r || E'\nFALLA link inválido de comercio aceptado';
  exception when others then r := r || E'\nOK link inválido de comercio rechazado (' || sqlstate || ')'; end;

  a1 := (public.gestlok_nfc_sucursal_guardar(null, ca, 'Centro', 'https://example.com/a-centro'))->>'id';
  a2 := (public.gestlok_nfc_sucursal_guardar(null, ca, 'Norte', null))->>'id';
  b1 := (public.gestlok_nfc_sucursal_guardar(null, cb, 'Centro', null))->>'id';
  r := r || E'\n' || case when a1 is not null and a2 is not null and b1 is not null then 'OK' else 'FALLA' end || ' crea sucursales (mismo nombre en otro comercio permitido)';
  begin perform public.gestlok_nfc_sucursal_guardar(null, ca, 'centro', null); r := r || E'\nFALLA sucursal repetida aceptada';
  exception when others then r := r || E'\nOK sucursal repetida en el mismo comercio rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_sucursal_guardar(a1, cb, 'Centro', null); r := r || E'\nFALLA sucursal pasada a otro comercio';
  exception when others then r := r || E'\nOK una sucursal no cambia de comercio (' || sqlstate || ')'; end;

  v := public.gestlok_nfc_crear_placas(3, ca, a1, true);
  select v->'codes'->>0, v->'codes'->>1, v->'codes'->>2 into pa1, pa2, pa3;
  r := r || E'\n' || case when (v->>'creadas')::int = 3 and pa3 ~ '^[A-HJ-NP-Z2-9]{6}$' and pa1 <> pa2 then 'OK' else 'FALLA' end || ' crea 3 placas activas en Comercio A · Centro con códigos únicos';
  begin perform public.gestlok_nfc_crear_placas(2, cb, null, true); r := r || E'\nFALLA creó activas sin ningún link';
  exception when others then r := r || E'\nOK no crea activas sin link (' || sqlstate || ')'; end;
  v := public.gestlok_nfc_crear_placas(2, cb, b1, false);
  select v->'codes'->>0, v->'codes'->>1 into pb1, pb2;
  begin perform public.gestlok_nfc_crear_placas(1, null, a1, false); r := r || E'\nFALLA sucursal sin comercio aceptada';
  exception when others then r := r || E'\nOK sucursal sin comercio rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_crear_placas(1, cb, a1, false); r := r || E'\nFALLA sucursal de otro comercio aceptada';
  exception when others then r := r || E'\nOK sucursal de otro comercio rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_crear_placas(201, ca, null, false); r := r || E'\nFALLA aceptó más de 200';
  exception when others then r := r || E'\nOK máximo 200 por vez (' || sqlstate || ')'; end;

  -- Público: destino según placa, sucursal o comercio ---------------------------------------------------------
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v := public.gestlok_nfc_abrir(lower(pa1));
  r := r || E'\n' || case when v->>'url' = 'https://example.com/a-centro' and v->>'estado' = 'ok' then 'OK' else 'FALLA' end || ' anónimo abre placa → link de la sucursal';
  r := r || E'\n' || case when (select array_agg(k order by k) from jsonb_object_keys(v) k) = array['estado', 'url'] then 'OK' else 'FALLA' end || ' la respuesta pública no trae datos del comercio';
  begin perform public.gestlok_nfc_list(); r := r || E'\nFALLA anónimo vio la lista';
  exception when others then r := r || E'\nOK anónimo sin lista (' || sqlstate || ')'; end;
  begin select count(*) into n from gestlok_nfc_private.comercios; r := r || E'\nFALLA anónimo leyó comercios';
  exception when others then r := r || E'\nOK anónimo no lee tablas (' || sqlstate || ')'; end;
  v := public.gestlok_nfc_abrir(pb1);
  r := r || E'\n' || case when v->>'estado' = 'inactiva' and v->>'url' is null then 'OK' else 'FALLA' end || ' placa sin activar de un comercio nuevo → «no activa», nunca Belisa';
  r := r || E'\n' || case when public.gestlok_nfc_resolve(pb1) is null then 'OK' else 'FALLA' end || ' la función anterior tampoco manda a Belisa';
  v := public.gestlok_nfc_abrir('ZZZZZZ');
  r := r || E'\n' || case when v->>'estado' = 'no_existe' then 'OK' else 'FALLA' end || ' código inexistente → «no existe»';
  v := public.gestlok_nfc_abrir('<script>');
  r := r || E'\n' || case when v->>'estado' = 'no_existe' then 'OK' else 'FALLA' end || ' código inválido → «no existe»';

  -- Cambiar destinos sin tocar el código ----------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', cre_claims, true);
  v := public.gestlok_nfc_update(pa1, 'Mesa 4', 'https://example.com/propio', 'n', true);
  r := r || E'\n' || case when v->>'origen' = 'placa' and v->>'destino_efectivo' = 'https://example.com/propio' then 'OK' else 'FALLA' end || ' link propio de la placa';
  perform public.gestlok_nfc_sucursal_guardar(a1, ca, 'Centro', 'https://example.com/a-centro-2');
  perform set_config('role', 'anon', true);
  r := r || E'\n' || case when public.gestlok_nfc_abrir(pa2)->>'url' = 'https://example.com/a-centro-2' then 'OK' else 'FALLA' end || ' cambiar el link de la sucursal cambia sus placas (mismo QR)';
  r := r || E'\n' || case when public.gestlok_nfc_abrir(pa1)->>'url' = 'https://example.com/propio' then 'OK' else 'FALLA' end || ' el link propio tiene prioridad';
  perform set_config('role', 'authenticated', true);
  perform public.gestlok_nfc_sucursal_guardar(a1, null, 'Centro', '');
  perform set_config('role', 'anon', true);
  r := r || E'\n' || case when public.gestlok_nfc_abrir(pa2)->>'url' = 'https://example.com/comercio-a' then 'OK' else 'FALLA' end || ' sin link de sucursal usa el del comercio';
  perform set_config('role', 'authenticated', true);
  begin perform public.gestlok_nfc_comercio_guardar(ca, 'Café <b>Prueba</b> NFC', '', 'nota'); r := r || E'\nFALLA dejó placas activas sin link';
  exception when others then r := r || E'\nOK no deja placas activas sin link (' || sqlstate || ')'; end;

  -- Activar, desactivar y reasignar ---------------------------------------------------------------------------
  v := public.gestlok_nfc_activar(array[pb1, pb2, 'QQQQQQ'], true);
  r := r || E'\n' || case when (v->>'cambiadas')::int = 0 and jsonb_array_length(v->'sin_link') = 2 and v->'no_existen' = '["QQQQQQ"]' then 'OK' else 'FALLA' end || ' no activa placas sin link e informa cuáles';
  v := public.gestlok_nfc_activar(array[pa2], false);
  perform set_config('role', 'anon', true);
  r := r || E'\n' || case when (v->>'cambiadas')::int = 1 and public.gestlok_nfc_abrir(pa2)->>'estado' = 'inactiva' then 'OK' else 'FALLA' end || ' placa desactivada → «no activa» (sin Belisa)';
  perform set_config('role', 'authenticated', true);
  begin perform public.gestlok_nfc_activar('{}', true); r := r || E'\nFALLA aceptó lista vacía';
  exception when others then r := r || E'\nOK lista vacía rechazada (' || sqlstate || ')'; end;
  v := public.gestlok_nfc_reasignar(array[pa1, pa3], cb, b1);
  r := r || E'\n' || case when (v->>'movidas')::int = 2 and (v->>'desactivadas')::int = 2 then 'OK' else 'FALLA' end || ' reasigna a otro comercio y desactiva las que quedan sin link';
  v := public.gestlok_nfc_list();
  select x into v from jsonb_array_elements(v->'placas') x where x->>'code' = pa1;
  r := r || E'\n' || case when v->>'comercio_id' = cb::text and v->>'sucursal_id' = b1::text and v->>'destino' is null and v->>'etiqueta' = '' and not (v->>'activa')::boolean then 'OK' else 'FALLA' end || ' al reasignar se quita el link propio y la etiqueta del cliente anterior';
  v := public.gestlok_nfc_reasignar(array[pa1], cb, b1);
  r := r || E'\n' || case when (v->>'movidas')::int = 0 then 'OK' else 'FALLA' end || ' reasignar al mismo lugar no cambia nada';
  begin perform public.gestlok_nfc_reasignar(array[pa1], null, a1); r := r || E'\nFALLA reasignó a sucursal sin comercio';
  exception when others then r := r || E'\nOK reasignar exige sucursal del comercio (' || sqlstate || ')'; end;
  v := public.gestlok_nfc_reasignar(array[pa3], ca, a2);
  r := r || E'\n' || case when (v->>'movidas')::int = 1 then 'OK' else 'FALLA' end || ' vuelve a reasignar a otra sucursal';

  -- Placas sin comercio (las de antes) y link general ---------------------------------------------------------
  v := public.gestlok_nfc_create(1);
  pl := (select x->>'code' from jsonb_array_elements(public.gestlok_nfc_list()->'placas') x where (x->>'numero')::int = (v->>'desde')::int);
  perform set_config('role', 'anon', true);
  d := public.gestlok_nfc_abrir(pl)->>'url';
  r := r || E'\n' || case when d is not distinct from fb then 'OK' else 'FALLA' end || ' placa sin comercio conserva el link general guardado';
  perform set_config('role', 'authenticated', true);
  perform public.gestlok_nfc_set_fallback('');
  perform set_config('role', 'anon', true);
  r := r || E'\n' || case when public.gestlok_nfc_abrir(pl)->>'estado' = 'inactiva' then 'OK' else 'FALLA' end || ' quitar el link general → «no activa»';
  perform set_config('role', 'authenticated', true);
  perform public.gestlok_nfc_set_fallback(coalesce(fb, ''));

  -- Historial ------------------------------------------------------------------------------------------------
  v := public.gestlok_nfc_historial(pa1, null, 50);
  select string_agg(distinct x->>'accion', ',') into t_list from jsonb_array_elements(v) x;
  r := r || E'\n' || case when t_list like '%placa_creada%' and t_list like '%placa_editada%' and t_list like '%placa_reasignada%' and t_list like '%placa_desactivada%' then 'OK' else 'FALLA' end || ' historial de la placa: creada, editada, reasignada, desactivada';
  v := public.gestlok_nfc_historial(null, cb, 50);
  r := r || E'\n' || case when exists (select 1 from jsonb_array_elements(v) x where x->>'accion' = 'placa_reasignada' and x->>'code' = pa1)
                      and exists (select 1 from jsonb_array_elements(v) x where x->>'accion' = 'comercio_creado') then 'OK' else 'FALLA' end || ' historial del comercio incluye placas que llegaron';
  v := public.gestlok_nfc_historial(null, ca, 50);
  r := r || E'\n' || case when exists (select 1 from jsonb_array_elements(v) x where x->>'accion' = 'placa_reasignada' and x->>'code' = pa1) then 'OK' else 'FALLA' end || ' historial del comercio anterior registra la salida';
  v := public.gestlok_nfc_list();
  r := r || E'\n' || case when (v->>'version')::int = 2 and jsonb_array_length(v->'comercios') >= 2
                      and exists (select 1 from jsonb_array_elements(v->'comercios') c where c->>'id' = ca::text and jsonb_array_length(c->'sucursales') = 2)
                      then 'OK' else 'FALLA' end || ' la lista trae comercios con sus sucursales';

  -- Tope de escaneos -----------------------------------------------------------------------------------------
  perform set_config('role', 'anon', true);
  for i in 1..35 loop perform public.gestlok_nfc_abrir(pb2); end loop;
  perform set_config('role', 'postgres', true);
  select p.escaneos into n from gestlok_nfc_private.placas p where p.code = pb2;
  r := r || E'\n' || case when n = 30 then 'OK' else 'FALLA' end || ' tope de 30 escaneos por minuto por placa (' || n || ')';

  -- Otras cuentas --------------------------------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', due_mail, 'role', 'authenticated')::text, true);
  ok := true;
  begin perform public.gestlok_nfc_list(); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_comercio_guardar(null, 'De la dueña', null, ''); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_sucursal_guardar(null, ca, 'De la dueña', null); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_crear_placas(1, ca, null, false); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_activar(array[pa3], true); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_reasignar(array[pa3], cb, null); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_update(pa3, 'x', 'https://example.org', '', true); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_historial(null, null, 10); ok := false; exception when others then null; end;
  begin perform public.gestlok_nfc_set_fallback('https://example.org'); ok := false; exception when others then null; end;
  r := r || E'\n' || case when ok then 'OK' else 'FALLA' end || ' una dueña no puede usar ninguna función de NFC y QR';
  if adm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'email', adm_mail, 'role', 'authenticated')::text, true);
    ok := true;
    begin perform public.gestlok_nfc_list(); ok := false; exception when others then null; end;
    begin perform public.gestlok_nfc_comercio_guardar(null, 'De otra admin', null, ''); ok := false; exception when others then null; end;
    r := r || E'\n' || case when ok then 'OK' else 'FALLA' end || ' otra administradora (no la creadora) queda afuera';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', cre_mail, 'role', 'authenticated')::text, true);
  ok := true;
  begin perform public.gestlok_nfc_comercio_guardar(null, 'Token falso', null, ''); ok := false; exception when others then null; end;
  r := r || E'\n' || case when ok then 'OK' else 'FALLA' end || ' token con el correo de la creadora pero otra cuenta: rechazado';

  perform set_config('role', 'postgres', true);
  select count(*) into n from gestlok_nfc_private.comercios c where c.nombre in ('De la dueña', 'De otra admin', 'Token falso');
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' ningún intento rechazado dejó datos';
  raise exception 'INFORME%', r;
end $t$;
