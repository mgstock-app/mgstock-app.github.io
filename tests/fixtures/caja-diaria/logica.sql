-- Caja diaria (issue #200): reglas de negocio y seguridad sobre la base de prueba (base.sql + migración).
-- Cada bloque fija su propio rol. Cualquier ASSERT que falle detiene la prueba.

-- 1) Configuración: solo Perfumes habilitada; Mi Gusto y el resto no.
do $$
begin
  perform set_config('role', 'postgres', true);
  assert (select array_agg(tenant_id) from gestlok_caja_private.empresas)
         = array['2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid], 'Solo Perfumes debe quedar habilitada';
  assert not exists (select 1 from gestlok_caja_private.empresas where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'),
         'Mi Gusto no debe tener caja diaria';
  -- Sin foto: ninguna columna de la caja guarda imágenes o archivos.
  assert not exists (select 1 from information_schema.columns
                     where table_schema = 'gestlok_caja_private' and column_name ~ '(foto|photo|imagen|archivo|path)'),
         'La caja no debe pedir ni guardar fotos';
end $$;

-- 2) Acceso: membresía verificada + empresa habilitada + rol.
do $$
declare v jsonb;
begin
  perform prueba.como('duena@perfumes.example');
  v := public.gestlok_caja_acceso();
  assert (v->>'habilitada')::boolean and v->>'tenant_id' = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'La dueña de Perfumes accede';
  perform prueba.como('gerente@perfumes.example');
  assert (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Gerente con local de Perfumes accede';
  perform prueba.como('gerente.sinlocal@perfumes.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Gerente sin local no accede';
  perform prueba.como('lectura@perfumes.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Solo lectura no accede';
  perform prueba.como('colaborador@perfumes.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Colaborador no accede';
  perform prueba.como('sinverificar@perfumes.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Email sin verificar no accede';
  perform prueba.como('dueno@migusto.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Dueño de Mi Gusto no accede';
  assert prueba.error_de('select public.gestlok_caja_estado()') = '42501', 'Mi Gusto: estado rechazado';
  perform prueba.como('gerente.munro@migusto.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Gerente de Mi Gusto no accede';
  perform prueba.como('dueno@otra.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Otra empresa sin habilitar no accede';
  -- Token con el email de la dueña pero de otra cuenta: el email no alcanza.
  perform prueba.como('dueno@migusto.example', 'duena@perfumes.example');
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Email ajeno en el token no autoriza';
  -- Consulta de soporte de la creadora: no habilita la caja.
  perform prueba.como('creadora@gestlok.example');
  perform set_config('prueba.soporte', '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', true);
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'Soporte de la creadora no accede';
  perform set_config('prueba.soporte', '', true);
  perform prueba.como(null);
  assert prueba.error_de('select public.gestlok_caja_acceso()') = '42501', 'Sin sesión: sin permiso de ejecución';
  assert prueba.error_de('select public.gestlok_caja_estado()') = '42501', 'Sin sesión: estado rechazado';
end $$;

-- 3) Apertura única, responsable obligatorio, ventas, idempotencia y anulación.
do $$
declare v jsonb; t uuid; op uuid := 'e0000000-0000-4000-8000-000000000001'; mov uuid;
begin
  perform prueba.como('duena@perfumes.example');
  v := public.gestlok_caja_estado();
  assert v->'turno' = 'null'::jsonb and (v->>'puede_abrir')::boolean, 'Sin caja abierta todavía';
  assert prueba.error_de($q$select public.gestlok_caja_abrir('  ')$q$) = '22023', 'Responsable obligatorio al abrir';
  v := public.gestlok_caja_abrir('  Ana Pérez ');
  assert (v->>'nuevo')::boolean and v->'turno'->>'responsable' = 'Ana Pérez' and v->'turno'->>'estado' = 'abierto', 'Abre con responsable';
  assert v->'turno'->>'abierto_por' = 'duena@perfumes.example', 'Registra quién abrió';
  t := (v->'turno'->>'id')::uuid;
  -- Segundo equipo: no crea otra caja ni cambia el responsable.
  perform prueba.como('gerente@perfumes.example');
  v := public.gestlok_caja_abrir('Beto');
  assert not (v->>'nuevo')::boolean and (v->'turno'->>'id')::uuid = t and v->'turno'->>'responsable' = 'Ana Pérez', 'Una sola caja por día';
  v := public.gestlok_caja_registrar(t, 'efectivo', 1500.50, 'Mostrador', op);
  assert not (v->>'repetida')::boolean, 'Primera venta';
  v := public.gestlok_caja_registrar(t, 'efectivo', 1500.50, 'Mostrador', op);
  assert (v->>'repetida')::boolean and (v->'turno'->>'ventas')::int = 1, 'Doble envío no duplica';
  v := public.gestlok_caja_registrar(t, 'transferencia', 2000, '', 'e0000000-0000-4000-8000-000000000002');
  v := public.gestlok_caja_registrar(t, 'efectivo', 100, null, 'e0000000-0000-4000-8000-000000000003');
  mov := (v->>'movimiento_id')::uuid;
  assert (v->'turno'->>'efectivo')::numeric = 1600.50 and (v->'turno'->>'transferencia')::numeric = 2000
     and (v->'turno'->>'total')::numeric = 3600.50 and (v->'turno'->>'ventas')::int = 3, 'Totales por medio y total diario';
  assert v->'turno'->'movimientos'->0->>'registrado_por' = 'gerente@perfumes.example', 'Trazabilidad de quién registró';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 0, null, gen_random_uuid())', t, 'efectivo')) = '22023', 'Monto 0';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, -5, null, gen_random_uuid())', t, 'efectivo')) = '22023', 'Monto negativo';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 1.005, null, gen_random_uuid())', t, 'efectivo')) = '22023', 'Más de 2 decimales';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 10, null, gen_random_uuid())', t, 'tarjeta')) = '22023', 'Medio no permitido';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 10, null, null)', t, 'efectivo')) = '22023', 'Sin clave de operación';
  v := public.gestlok_caja_anular(t, mov);
  assert (v->'turno'->>'efectivo')::numeric = 1500.50 and (v->'turno'->>'ventas')::int = 2, 'Anular descuenta la venta';
  v := public.gestlok_caja_anular(t, mov);
  assert (v->>'repetida')::boolean, 'Anular dos veces es idempotente';
  v := public.gestlok_caja_responsable(t, 'Ana Pérez y Beto');
  assert v->'turno'->>'responsable' = 'Ana Pérez y Beto', 'Cambio de responsable con la caja abierta';
  perform set_config('prueba.turno', t::text, false);
end $$;

-- 4) Otras empresas y accesos directos: nunca ven ni tocan la caja de Perfumes.
do $$
declare t text := current_setting('prueba.turno');
begin
  perform prueba.como('dueno@migusto.example');
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 10, null, gen_random_uuid())', t, 'efectivo')) = '42501', 'Mi Gusto no registra';
  assert prueba.error_de(format('select public.gestlok_caja_cerrar(%L, %L)', t, 'Intruso')) = '42501', 'Mi Gusto no cierra';
  assert prueba.error_de(format('select public.gestlok_caja_detalle(%L)', t)) = '42501', 'Mi Gusto no lee el detalle';
  assert prueba.error_de(format('select public.gestlok_caja_anular(%L, gen_random_uuid())', t)) = '42501', 'Mi Gusto no anula';
  assert prueba.error_de('select count(*) from gestlok_caja_private.turnos') = '42501', 'Sin acceso directo a las tablas';
  perform prueba.como('duena@perfumes.example');
  assert prueba.error_de('select count(*) from gestlok_caja_private.movimientos') = '42501', 'Ni siquiera la dueña lee las tablas directo';
  assert prueba.error_de('select gestlok_caja_private.cerrar_vencidos()') = '42501', 'El cierre automático no se llama desde la app';
  assert prueba.error_de($q$insert into gestlok_caja_private.empresas(tenant_id) values ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670')$q$) = '42501',
         'La app no puede habilitar empresas';
end $$;

-- 5) Inmutabilidad en la base, incluso fuera de las RPC.
do $$
declare t uuid := current_setting('prueba.turno')::uuid;
begin
  perform set_config('role', 'postgres', true);
  assert prueba.error_de(format('update gestlok_caja_private.movimientos set monto = 1 where turno_id = %L', t)) = '42501', 'No se cambia el importe';
  assert prueba.error_de(format('delete from gestlok_caja_private.movimientos where turno_id = %L', t)) = '42501', 'No se borran ventas';
  assert prueba.error_de(format('delete from gestlok_caja_private.turnos where id = %L', t)) = '42501', 'No se borran cajas';
  assert prueba.error_de(format('update gestlok_caja_private.turnos set dia = dia - 1 where id = %L', t)) = '42501', 'No se cambia la fecha';
  assert prueba.error_de('truncate gestlok_caja_private.auditoria') = '42501', 'Auditoría sin truncate';
  assert prueba.error_de('delete from gestlok_caja_private.auditoria') = '42501', 'Auditoría solo agrega';
end $$;

-- 6) Cierre manual idempotente (doble clic) y sin reapertura.
do $$
declare t uuid := current_setting('prueba.turno')::uuid; v jsonb; n int;
begin
  perform prueba.como('gerente@perfumes.example');
  assert prueba.error_de(format('select public.gestlok_caja_cerrar(%L, %L)', t, ' ')) = '22023', 'Responsable obligatorio al cerrar';
  v := public.gestlok_caja_cerrar(t, 'Ana Pérez');
  assert not (v->>'ya_cerrado')::boolean and v->'turno'->>'estado' = 'cerrado' and v->'turno'->>'tipo_cierre' = 'manual', 'Cierre manual';
  assert v->'turno'->>'cerrado_por' = 'gerente@perfumes.example' and v->'turno'->>'responsable' = 'Ana Pérez', 'Cierre con responsable y usuario';
  assert (v->'turno'->>'efectivo')::numeric = 1500.50 and (v->'turno'->>'transferencia')::numeric = 2000
     and (v->'turno'->>'total')::numeric = 3500.50 and (v->'turno'->>'ventas')::int = 2, 'Totales del cierre';
  v := public.gestlok_caja_cerrar(t, 'Otra persona');
  assert (v->>'ya_cerrado')::boolean and v->'turno'->>'responsable' = 'Ana Pérez', 'Segundo clic: no cambia el cierre';
  perform prueba.como('duena@perfumes.example');
  v := public.gestlok_caja_abrir('Carla');
  assert not (v->>'nuevo')::boolean and v->'turno'->>'estado' = 'cerrado', 'No se reabre el mismo día';
  assert not (public.gestlok_caja_estado()->>'puede_abrir')::boolean, 'Estado: no ofrece abrir de nuevo';
  assert prueba.error_de(format('select public.gestlok_caja_registrar(%L, %L, 10, null, gen_random_uuid())', t, 'efectivo')) = '22023', 'Cerrada: no registra';
  assert prueba.error_de(format('select public.gestlok_caja_responsable(%L, %L)', t, 'Otra')) = '22023', 'Cerrada: no cambia responsable';
  perform set_config('role', 'postgres', true);
  select count(*) into n from gestlok_caja_private.auditoria where turno_id = t and accion = 'cierre_manual';
  assert n = 1, 'Un solo cierre registrado';
  assert prueba.error_de(format('update gestlok_caja_private.turnos set total = 0 where id = %L', t)) = '42501', 'Cierre inmutable';
  assert prueba.error_de(format($q$insert into gestlok_caja_private.movimientos(turno_id, tenant_id, operacion, metodo, monto, registrado_por)
    values (%L, '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', gen_random_uuid(), 'efectivo', 1, gen_random_uuid())$q$, t)) = '42501', 'Ni el servidor agrega ventas a una caja cerrada';
end $$;

-- 7) Cambio de día y caso sin ventas: una caja de ayer que quedó abierta se cierra sola en 0.
do $$
declare v jsonb; ayer date; hoy date; lim timestamptz; h jsonb;
begin
  perform set_config('role', 'postgres', true);
  hoy := gestlok_caja_private.dia_ar();
  ayer := hoy - 1;
  lim := gestlok_caja_private.limite(ayer);
  insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por, abierto_at)
  values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', ayer, 'Turno de ayer', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day');
  perform prueba.como('duena@perfumes.example');
  v := public.gestlok_caja_estado();
  select x into h from jsonb_array_elements(v->'historial') x where x->>'dia' = ayer::text;
  assert h->>'estado' = 'cerrado' and h->>'tipo_cierre' = 'automatico' and h->>'cerrado_por' is null, 'Ayer: cierre automático';
  assert (h->>'total')::numeric = 0 and (h->>'ventas')::int = 0 and h->>'responsable' = 'Turno de ayer', 'Sin ventas: cierre en 0 con responsable';
  assert (h->>'cerrado_at')::timestamptz = lim, 'Cierre a las 23:59 de ese día';
  assert jsonb_array_length(v->'historial') = 2 and v->'historial'->0->>'dia' = hoy::text, 'Historial ordenado por fecha';
end $$;

-- 8) Cierre automático del servidor: exacto a las 23:59, idempotente y sin tocar el día siguiente.
do $$
declare hoy date; n int; t uuid; manana uuid;
begin
  perform set_config('role', 'postgres', true);
  insert into gestlok_caja_private.empresas (tenant_id, nota) values ('33333333-3333-4333-8333-333333333333', 'prueba');
  hoy := gestlok_caja_private.dia_ar();
  insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por)
  values ('33333333-3333-4333-8333-333333333333', hoy, 'Otra', 'c0000000-0000-4000-8000-000000000001') returning id into t;
  insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por)
  values ('33333333-3333-4333-8333-333333333333', hoy + 1, 'Mañana', 'c0000000-0000-4000-8000-000000000001') returning id into manana;
  insert into gestlok_caja_private.movimientos (turno_id, tenant_id, operacion, metodo, monto, registrado_por)
  values (t, '33333333-3333-4333-8333-333333333333', gen_random_uuid(), 'transferencia', 700, 'c0000000-0000-4000-8000-000000000001');
  n := gestlok_caja_private.cerrar_vencidos(null, gestlok_caja_private.limite(hoy) - interval '1 second');
  assert n = 0, '23:58:59: todavía abierta';
  n := gestlok_caja_private.cerrar_vencidos(null, gestlok_caja_private.limite(hoy));
  assert n = 1, '23:59: se cierra';
  n := gestlok_caja_private.cerrar_vencidos(null, gestlok_caja_private.limite(hoy) + interval '45 minutes');
  assert n = 0, 'Repetir el cierre no hace nada';
  assert (select estado = 'cerrado' and tipo_cierre = 'automatico' and total = 700 and ventas = 1 and cerrado_por is null
          from gestlok_caja_private.turnos where id = t), 'Totales del cierre automático';
  assert (select estado from gestlok_caja_private.turnos where id = manana) = 'abierto', 'El día siguiente no se toca';
  assert (select count(*) from gestlok_caja_private.auditoria where turno_id = t and accion = 'cierre_automatico' and actor is null) = 1,
         'Auditoría del cierre automático';
  -- La otra empresa solo ve lo suyo.
  perform prueba.como('dueno@otra.example');
  assert (select bool_and(x->>'responsable' <> 'Ana Pérez') from jsonb_array_elements(public.gestlok_caja_estado()->'historial') x),
         'Otra empresa no ve el historial de Perfumes';
  assert prueba.error_de(format('select public.gestlok_caja_detalle(%L)', current_setting('prueba.turno'))) = '42501', 'Otra empresa no lee Perfumes';
end $$;

-- 9) Zona horaria: fecha y límite siempre en Buenos Aires, cualquiera sea el huso de la sesión.
do $$
begin
  perform set_config('timezone', 'Asia/Tokyo', true);
  assert gestlok_caja_private.dia_ar('2026-11-02 02:30:00+00') = '2026-11-01', '23:30 AR sigue siendo el 01/11';
  assert gestlok_caja_private.dia_ar('2026-11-02 03:00:00+00') = '2026-11-02', '00:00 AR ya es el 02/11';
  assert gestlok_caja_private.limite('2026-11-01') = '2026-11-02 02:59:00+00'::timestamptz, 'Límite 23:59 AR = 02:59 UTC';
  perform set_config('timezone', 'UTC', true);
  assert gestlok_caja_private.limite('2026-12-31') = '2027-01-01 02:59:00+00'::timestamptz, 'Fin de año';
end $$;

-- 10) RLS por empresa (segunda barrera): con permisos de lectura otorgados a propósito,
--     cada empresa ve solo sus filas. Los permisos se deshacen al terminar el bloque.
do $$
declare n_perf int; n_otra int;
begin
  perform set_config('role', 'postgres', true);
  select count(*) filter (where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'),
         count(*) filter (where tenant_id = '33333333-3333-4333-8333-333333333333')
    into n_perf, n_otra from gestlok_caja_private.turnos;
  begin
    grant usage on schema gestlok_caja_private to authenticated;
    grant select on all tables in schema gestlok_caja_private to authenticated;
    grant execute on function gestlok_caja_private.empresa_autorizada() to authenticated;
    perform prueba.como('dueno@migusto.example');
    assert (select count(*) from gestlok_caja_private.turnos) = 0, 'RLS: Mi Gusto ve 0 cajas';
    assert (select count(*) from gestlok_caja_private.movimientos) = 0, 'RLS: Mi Gusto ve 0 ventas';
    assert (select count(*) from gestlok_caja_private.auditoria) = 0, 'RLS: Mi Gusto ve 0 registros';
    perform prueba.como('duena@perfumes.example');
    assert (select count(*) from gestlok_caja_private.turnos) = n_perf, 'RLS: Perfumes ve solo las suyas';
    assert (select count(*) from gestlok_caja_private.turnos where tenant_id <> '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103') = 0, 'RLS: nada ajeno';
    perform prueba.como('dueno@otra.example');
    assert (select count(*) from gestlok_caja_private.turnos) = n_otra, 'RLS: la otra empresa ve las suyas';
    perform prueba.como('gerente.sinlocal@perfumes.example');
    assert (select count(*) from gestlok_caja_private.turnos) = 0, 'RLS: gerente sin local ve 0';
    perform prueba.como('duena@perfumes.example');
    assert prueba.error_de($q$insert into gestlok_caja_private.empresas(tenant_id) values (gen_random_uuid())$q$) = '42501', 'RLS: sin escritura';
    raise exception using errcode = 'P0001', message = 'deshacer-permisos-de-prueba';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'deshacer-permisos-de-prueba' then raise; end if;
  end;
  perform prueba.como('dueno@migusto.example');
  assert prueba.error_de('select count(*) from gestlok_caja_private.turnos') = '42501', 'Permisos de prueba deshechos';
end $$;

-- 11) Mi Gusto intacto: sus documentos no cambiaron.
do $$
begin
  perform set_config('role', 'postgres', true);
  assert (select count(*) from public.docs where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670') = 5, 'Documentos de Mi Gusto intactos';
  assert (select data->>'stock' from public.docs where col = 'munro/productos' and id = 'p-001') = '3', 'Stock de Munro intacto';
end $$;

select 'CAJA DIARIA: OK' as resultado;
