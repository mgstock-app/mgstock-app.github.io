-- Caja app: fotos antes del cierre (base.sql + storage.sql + migraciones). Cada ASSERT que falle corta la prueba.
do $$
declare v jsonb; ca uuid; cb uuid; centro uuid; norte uuid; cajac uuid; cajan uuid; cajab uuid; tok text; tokn text; tokc text; cod text; ruta text; otra text;
begin
  perform set_config('role', 'postgres', true);
  assert (select not public and file_size_limit = 3145728 from storage.buckets where id = 'caja-app-fotos'), 'Depósito privado con límite de tamaño';

  -- Comercio A (dos locales) pide dos fotos; comercio B aparte.
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_crear_comercio('Almacén La Esquina', 'Centro', 'Sofía', '1234');
  ca := (v->>'comercio_id')::uuid; centro := (v->>'local_id')::uuid;
  v := public.caja_app_guardar_local(ca, null, 'Norte', true);
  norte := (select (x->>'id')::uuid from jsonb_array_elements(v->'locales') x where x->>'nombre' = 'Norte');
  v := public.caja_app_guardar_config(ca, '{"fotos":[{"id":"efectivo","nombre":"Efectivo contado","obligatoria":true},{"id":"posnet","nombre":"Cierre del posnet","obligatoria":false}],"bloquear_sin_fotos":true}');
  assert jsonb_array_length(v->'fotos') = 2 and (v->>'bloquear_sin_fotos')::boolean, 'Fotos pedidas';
  tok := public.caja_app_entrar_cuenta(centro)->>'token';
  cajac := (public.caja_app_abrir(tok, 1000, true)->'caja'->>'id')::uuid;
  tokn := public.caja_app_entrar_cuenta(norte)->>'token';
  cajan := (public.caja_app_abrir(tokn, 500, true)->'caja'->>'id')::uuid;
  cod := public.caja_app_invitar(ca, 'Lucía', 'cajero', array[centro])->>'codigo';
  perform prueba.como('duena.b@example.com');
  v := public.caja_app_crear_comercio('Kiosco B', 'Único', 'Bea', '1234');
  cb := (v->>'comercio_id')::uuid;
  cajab := (public.caja_app_abrir(public.caja_app_entrar_cuenta((v->>'local_id')::uuid)->>'token', 0, true)->'caja'->>'id')::uuid;
  perform prueba.como('intruso@example.com');
  perform public.caja_app_aceptar_invitacion(cod);
  tokc := public.caja_app_entrar_cuenta(centro)->>'token';

  -- Subir: la cajera en su local sí; en otro local, otro comercio, otro depósito o con un nombre raro, no.
  ruta := ca || '/' || cajac || '/abcdef0123456789.jpg';
  insert into storage.objects (bucket_id, name) values ('caja-app-fotos', ruta);
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', ca || '/' || cajan || '/abcdef0123456789.jpg')) like '42501%', 'No sube a un local donde no trabaja';
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', cb || '/' || cajab || '/abcdef0123456789.jpg')) like '42501%', 'No sube a otro comercio';
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', ca || '/' || cajab || '/abcdef0123456789.jpg')) like '42501%', 'Comercio y caja tienen que coincidir';
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', ca || '/' || cajac || '/../x.jpg')) like '42501%', 'Nombre inválido';
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', ca || '/' || cajac || '/abcdef0123456789.pdf')) like '42501%', 'Solo imágenes';
  -- Nadie modifica ni quita (sin reglas, no afecta ninguna fila).
  update storage.objects set name = name || 'x' where name = ruta;
  delete from storage.objects where name = ruta;
  assert (select count(*) from storage.objects where name = ruta) = 1, 'La foto no se modifica ni se quita';

  -- Registrar: solo fotos pedidas (u «otra»), con la ruta de ESA caja; el cierre exige la obligatoria.
  assert prueba.error_de(format('select public.caja_app_registrar_foto(%L, %L, %L, %L)', tokc, cajac, 'inventada', ruta)) like '22023%', 'Foto no pedida';
  assert prueba.error_de(format('select public.caja_app_registrar_foto(%L, %L, %L, %L)', tokc, cajac, 'posnet', ca || '/' || cajan || '/abcdef0123456789.jpg')) like '22023%', 'Ruta de otra caja';
  assert prueba.error_de(format('select public.caja_app_cerrar(%L, %L, 1000, null, null, %L, 0, null, null)', tokc, cajac, '{"Efectivo":true}')) like '22023%Faltan fotos obligatorias: Efectivo contado%', 'Sin la obligatoria no cierra';
  v := public.caja_app_registrar_foto(tokc, cajac, 'posnet', ruta);
  assert (v->>'fotos')::int = 1 and v->'fotos_detalle'->0->>'pedido' = 'posnet' and v->'fotos_detalle'->0->>'subida_por' = 'Lucía', 'Foto registrada a nombre de quien la subió';
  assert (public.caja_app_registrar_foto(tokc, cajac, 'posnet', ruta)->>'fotos')::int = 1, 'Registrar dos veces no duplica';
  assert prueba.error_de(format('select public.caja_app_cerrar(%L, %L, 1000, null, null, %L, 0, null, null)', tokc, cajac, '{"Efectivo":true}')) like '22023%Faltan fotos%', 'La opcional no alcanza';
  otra := ca || '/' || cajac || '/0123456789abcdef.jpg';
  insert into storage.objects (bucket_id, name) values ('caja-app-fotos', otra);
  perform public.caja_app_registrar_foto(tokc, cajac, 'efectivo', otra);

  -- Ver: la cajera las de su local; la dueña todas las de su comercio; otro comercio y sin sesión, nada.
  assert (select count(*) from storage.objects) = 2, 'La cajera ve las fotos de su local';
  perform prueba.como('duena.a@example.com');
  assert (select count(*) from storage.objects) = 2, 'La dueña las ve';
  insert into storage.objects (bucket_id, name) values ('caja-app-fotos', ca || '/' || cajan || '/fedcba9876543210.jpg');
  assert (select count(*) from storage.objects) = 3, 'La dueña sube en cualquier local';
  assert jsonb_array_length(public.caja_app_detalle(ca, cajac)->'fotos_detalle') = 2, 'El detalle del dueño trae las fotos';
  perform prueba.como('intruso@example.com');
  assert (select count(*) from storage.objects) = 2, 'La cajera no ve las del otro local';
  perform prueba.como('duena.b@example.com');
  assert (select count(*) from storage.objects) = 0, 'Otro comercio no ve nada';
  perform prueba.como(null);
  assert (select count(*) from storage.objects) = 0, 'Sin sesión no ve nada';

  -- Con la obligatoria cargada cierra; después no se sube ni se registra más.
  perform prueba.como('intruso@example.com');
  v := public.caja_app_cerrar(tokc, cajac, 1000, null, null, '{"Efectivo":true}', 0, null, null);
  assert v->'caja'->>'estado' = 'cerrada', 'Cierra con las fotos';
  assert prueba.error_de(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'caja-app-fotos', ca || '/' || cajac || '/aaaaaaaabbbbbbbb.jpg')) like '42501%', 'Caja cerrada: no se sube';
  assert prueba.error_de(format('select public.caja_app_registrar_foto(%L, %L, %L, %L)', tokc, cajac, 'otra', otra)) like '22023%', 'Caja cerrada: no se registra';
  assert (select count(*) from storage.objects) = 2, 'Las fotos del cierre se siguen viendo';
  -- Sin acceso: deja de verlas y de subir.
  perform prueba.como('duena.a@example.com');
  perform public.caja_app_acceso_persona(ca, (select (x->>'id')::uuid from jsonb_array_elements(public.caja_app_equipo(ca)->'personas') x where x->>'nombre' = 'Lucía'), false);
  perform prueba.como('intruso@example.com');
  assert (select count(*) from storage.objects) = 0, 'Sin acceso no ve fotos';
  perform set_config('role', 'postgres', true);
  assert not has_function_privilege('anon', 'public.caja_app_foto_permitida(text, boolean)', 'execute'), 'anon no consulta';
end $$;
select 'CAJA APP FOTOS: OK' as resultado;
