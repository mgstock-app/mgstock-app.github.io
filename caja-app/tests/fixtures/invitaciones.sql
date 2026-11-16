-- Caja app: invitar al equipo (base.sql + migraciones). Cada ASSERT que falle corta la prueba.
do $$
declare v jsonb; ca uuid; cb uuid; centro uuid; norte uuid; lb uuid; cod text; cod2 text; cod3 text; pers uuid; tok text; inv uuid;
begin
  -- Dos comercios distintos.
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_crear_comercio('Almacén La Esquina', 'Centro', 'Sofía', '1234');
  ca := (v->>'comercio_id')::uuid; centro := (v->>'local_id')::uuid;
  v := public.caja_app_guardar_local(ca, null, 'Norte', true);
  norte := (select (x->>'id')::uuid from jsonb_array_elements(v->'locales') x where x->>'nombre' = 'Norte');
  perform prueba.como('duena.b@example.com');
  v := public.caja_app_crear_comercio('Kiosco B', 'Único', 'Bea', '1234');
  cb := (v->>'comercio_id')::uuid; lb := (v->>'local_id')::uuid;

  -- Solo el dueño de ESE comercio invita o mira el equipo.
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, null)', ca, 'Lucía', 'cajero')) like '42501%', 'Otra dueña no invita en comercio ajeno';
  assert prueba.error_de(format('select public.caja_app_equipo(%L)', ca)) like '42501%', 'Otra dueña no ve equipo ajeno';
  perform prueba.como(null);
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, null)', ca, 'Lucía', 'cajero')) like '42501%', 'Sin sesión no invita';
  assert prueba.error_de($q$select public.caja_app_aceptar_invitacion('ABCDEFGHJKMN')$q$) like '42501%', 'Sin sesión no acepta';

  -- Validaciones al invitar.
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, null)', ca, 'L', 'cajero')) like '22023%', 'Nombre corto';
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, null)', ca, 'Lucía', 'dueno')) like '22023%', 'No se invita a un dueño';
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, array[%L]::uuid[])', ca, 'Lucía', 'cajero', lb)) like '42501%', 'Local de otro comercio';
  v := public.caja_app_invitar(ca, ' Lucía ', 'cajero', array[centro]);
  cod := v->>'codigo';
  assert cod ~ '^[A-HJKMNP-Z2-9]{12}$', 'Código de 12 caracteres sin letras confusas';
  assert jsonb_array_length(v->'equipo'->'invitaciones') = 1 and v->'equipo'->'invitaciones'->0->>'nombre' = 'Lucía', 'Queda pendiente';
  assert v::text not like '%codigo_hash%', 'No devuelve la huella';
  perform set_config('role', 'postgres', true);
  assert not exists (select 1 from caja_app.invitaciones where codigo_hash = cod), 'El código no se guarda en claro';
  assert (select count(*) from caja_app.auditoria where comercio_id = ca and accion = 'invitacion') = 1, 'Invitación auditada';

  -- La dueña no puede usar su propia invitación; un código mal escrito no sirve.
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de(format('select public.caja_app_aceptar_invitacion(%L)', cod)) like '22023%dueña%', 'La dueña no la usa';
  perform prueba.como('intruso@example.com');
  assert prueba.error_de($q$select public.caja_app_aceptar_invitacion('ZZZZZZZZZZZZ')$q$) like '22023%no existe%', 'Código inexistente';
  assert prueba.error_de($q$select public.caja_app_aceptar_invitacion('')$q$) like '22023%', 'Código vacío';
  assert jsonb_array_length(public.caja_app_mis_comercios()) = 0, 'Todavía sin comercios';
  assert prueba.error_de(format('select public.caja_app_entrar_cuenta(%L)', centro)) like '42501%', 'Sin invitación no entra';

  -- Aceptar: acepta minúsculas, espacios y guiones; entra solo a su local; no ve el panel.
  v := public.caja_app_aceptar_invitacion(' ' || lower(substr(cod, 1, 4)) || '-' || substr(cod, 5, 4) || ' ' || substr(cod, 9) || ' ');
  assert v->>'comercio_id' = ca::text and v->>'persona' = 'Lucía' and v->>'rol' = 'cajero', 'Aceptada';
  assert jsonb_array_length(public.caja_app_mis_comercios()) = 1, 'Ahora ve el comercio';
  v := public.caja_app_entrar_cuenta(centro);
  tok := v->>'token'; pers := (v->'persona'->>'id')::uuid;
  assert v->'persona'->>'nombre' = 'Lucía' and v->'persona'->>'rol' = 'cajero', 'Entra con la persona de la invitación';
  assert prueba.error_de(format('select public.caja_app_entrar_cuenta(%L)', norte)) like '42501%no trabaja%', 'Solo el local invitado';
  assert prueba.error_de(format('select public.caja_app_equipo(%L)', ca)) like '42501%', 'La cajera no ve el equipo';
  assert prueba.error_de(format('select public.caja_app_invitar(%L, %L, %L, null)', ca, 'Otro', 'cajero')) like '42501%', 'La cajera no invita';
  assert prueba.error_de(format('select public.caja_app_hoy(%L)', ca)) like '42501%', 'La cajera no ve el panel del dueño';
  assert prueba.error_de(format('select public.caja_app_acceso_persona(%L, %L, false)', ca, pers)) like '42501%', 'La cajera no quita accesos';
  assert prueba.error_de(format('select public.caja_app_entrar_cuenta(%L)', lb)) like '42501%', 'No entra a otro comercio';
  assert (public.caja_app_estado(tok)) is not null, 'Su sesión de caja funciona';
  -- Un solo uso.
  assert prueba.error_de(format('select public.caja_app_aceptar_invitacion(%L)', cod)) like '22023%', 'No se usa dos veces';
  perform prueba.como('duena.b@example.com');
  assert prueba.error_de(format('select public.caja_app_aceptar_invitacion(%L)', cod)) like '22023%', 'Otra cuenta tampoco';

  -- La dueña ve el equipo y quita el acceso: la sesión deja de servir en el momento.
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_equipo(ca);
  assert jsonb_array_length(v->'invitaciones') = 0, 'Sin pendientes';
  assert (select count(*) from jsonb_array_elements(v->'personas') x where x->>'nombre' = 'Lucía' and (x->>'con_cuenta')::boolean and (x->>'activo')::boolean) = 1, 'Lucía en el equipo';
  assert (select (x->>'yo')::boolean from jsonb_array_elements(v->'personas') x where x->>'rol' = 'dueno' limit 1) is not null, 'Marca a la dueña';
  assert prueba.error_de(format('select public.caja_app_acceso_persona(%L, %L, false)', ca,
    (select x->>'id' from jsonb_array_elements(v->'personas') x where x->>'rol' = 'dueno' limit 1))) like '22023%dueño%', 'No se quita a la dueña';
  assert prueba.error_de(format('select public.caja_app_acceso_persona(%L, %L, false)', cb, pers)) like '42501%', 'No en comercio ajeno';
  v := public.caja_app_acceso_persona(ca, pers, false);
  assert (select (x->>'activo')::boolean from jsonb_array_elements(v->'personas') x where x->>'id' = pers::text) = false, 'Acceso quitado';
  perform prueba.como('intruso@example.com');
  assert prueba.error_de(format('select public.caja_app_estado(%L)', tok)) like '42501%', 'La sesión abierta deja de servir';
  assert prueba.error_de(format('select public.caja_app_entrar_cuenta(%L)', centro)) like '42501%desactivado%', 'No vuelve a entrar';
  perform prueba.como('duena.a@example.com');
  perform public.caja_app_acceso_persona(ca, pers, true);
  perform prueba.como('intruso@example.com');
  assert (public.caja_app_entrar_cuenta(centro)->'persona'->>'id')::uuid = pers, 'Acceso devuelto: misma persona';

  -- Anular y vencer.
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_invitar(ca, 'Martín', 'encargado', null);
  cod2 := v->>'codigo'; inv := (v->'equipo'->'invitaciones'->0->>'id')::uuid;
  assert prueba.error_de(format('select public.caja_app_anular_invitacion(%L, %L)', cb, inv)) like '42501%', 'No se anula desde otro comercio';
  v := public.caja_app_anular_invitacion(ca, inv);
  assert jsonb_array_length(v->'invitaciones') = 0, 'Anulada';
  assert prueba.error_de(format('select public.caja_app_anular_invitacion(%L, %L)', ca, inv)) like '22023%', 'No se anula dos veces';
  v := public.caja_app_invitar(ca, 'Lucía', 'encargado', null);
  cod3 := v->>'codigo';
  perform set_config('role', 'postgres', true);
  assert (select count(*) from caja_app.invitaciones where comercio_id = ca) = 3, 'Nada se borra';
  update caja_app.invitaciones set expira_at = now() - interval '1 minute' where codigo_hash = encode(extensions.digest(cod3, 'sha256'), 'hex');
  perform prueba.como('duena.b@example.com');
  assert prueba.error_de(format('select public.caja_app_aceptar_invitacion(%L)', cod2)) like '22023%', 'Anulada no sirve';
  assert prueba.error_de(format('select public.caja_app_aceptar_invitacion(%L)', cod3)) like '22023%', 'Vencida no sirve';
  assert jsonb_array_length(public.caja_app_mis_comercios()) = 1, 'La dueña B sigue solo con su comercio';

  -- Nombre repetido: la persona nueva recibe un nombre distinto. Una dueña de otro comercio puede ser encargada acá.
  perform prueba.como('duena.a@example.com');
  cod := public.caja_app_invitar(ca, 'Lucía', 'encargado', null)->>'codigo';
  perform prueba.como('duena.b@example.com');
  v := public.caja_app_aceptar_invitacion(cod);
  assert v->>'persona' = 'Lucía 2' and v->>'rol' = 'encargado', 'Nombre sin repetir';
  assert jsonb_array_length(public.caja_app_mis_comercios()) = 2, 'Ve los dos comercios';
  assert (public.caja_app_entrar_cuenta(norte)->'persona'->>'nombre') = 'Lucía 2', 'Encargada entra a cualquier local';
  assert prueba.error_de(format('select public.caja_app_hoy(%L)', ca)) like '42501%', 'Encargada invitada no ve el panel del dueño';
  assert (public.caja_app_hoy(cb)) is not null, 'Sigue siendo dueña del suyo';

  -- Permisos de ejecución y tabla cerrada.
  perform set_config('role', 'postgres', true);
  assert not has_table_privilege('authenticated', 'caja_app.invitaciones', 'select') and not has_table_privilege('anon', 'caja_app.invitaciones', 'select'), 'Tabla sin acceso directo';
  assert not has_function_privilege('anon', 'public.caja_app_aceptar_invitacion(text)', 'execute'), 'anon no ejecuta';
  assert not has_function_privilege('anon', 'public.caja_app_invitar(uuid, text, text, uuid[])', 'execute'), 'anon no invita';
  assert (select count(*) from caja_app.auditoria where comercio_id = ca and accion in ('invitacion_aceptada','invitacion_anulada','persona_acceso')) = 5, 'Todo auditado';
end $$;

select 'CAJA APP INVITACIONES: OK' as resultado;
