-- Caja app: reglas de negocio y seguridad (base.sql + migración). Cada ASSERT que falle corta la prueba.
-- Los valores entre bloques se pasan con set_config('prueba.*', ..., false).

-- 1) Alta de comercios y configuración.
do $$
declare v jsonb; ca uuid; cb uuid;
begin
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de($q$select public.caja_app_crear_comercio('Almacén', 'Centro', 'Sofía', '12a4')$q$) like '22023%', 'PIN de 4 números';
  assert prueba.error_de($q$select public.caja_app_crear_comercio('A', 'Centro', 'Sofía', '1234')$q$) like '22023%', 'Nombre corto';
  v := public.caja_app_crear_comercio('Almacén La Esquina', 'Centro', 'Sofía', '1234');
  ca := (v->>'comercio_id')::uuid;
  perform set_config('prueba.ca', ca::text, false);
  perform set_config('prueba.centro', v->>'local_id', false);
  perform set_config('prueba.sofia', v->>'persona_id', false);
  v := public.caja_app_guardar_local(ca, null, 'Norte', true);
  perform set_config('prueba.norte', (select x->>'id' from jsonb_array_elements(v->'locales') x where x->>'nombre' = 'Norte'), false);
  assert jsonb_array_length(public.caja_app_mis_comercios()) = 1, 'Ve su comercio';
  assert prueba.error_de(format($q$select public.caja_app_guardar_config(%L, '{"medios":["Transferencia"]}')$q$, ca)) like '22023%', 'Efectivo obligatorio';
  assert prueba.error_de(format($q$select public.caja_app_guardar_config(%L, '{"medios":["Efectivo","efectivo"]}')$q$, ca)) like '22023%', 'Sin repetidos';
  assert prueba.error_de(format($q$select public.caja_app_guardar_config(%L, '{"hora_cierre":"24:10"}')$q$, ca)) like '22023%', 'Hora válida';
  v := public.caja_app_guardar_config(ca, '{"medios":["Efectivo","Transferencia","Débito","PedidosYa"],"caja_inicial_habitual":20000,
    "fotos":[{"id":"efectivo","nombre":"Efectivo contado","obligatoria":true},{"id":"planilla","nombre":"Planilla","obligatoria":false}]}');
  assert (v->>'caja_inicial_habitual')::numeric = 20000 and jsonb_array_length(v->'fotos') = 2, 'Config guardada';
  v := public.caja_app_guardar_persona(ca, null, 'Lucía', 'cajero', array[(current_setting('prueba.centro'))::uuid], '4321', true, 30000);
  perform set_config('prueba.lucia', (select x->>'id' from jsonb_array_elements(v->'personas') x where x->>'nombre' = 'Lucía'), false);
  v := public.caja_app_guardar_persona(ca, null, 'Martín', 'cajero', array[(current_setting('prueba.norte'))::uuid], '5555', true, null);
  perform set_config('prueba.martin', (select x->>'id' from jsonb_array_elements(v->'personas') x where x->>'nombre' = 'Martín'), false);
  assert prueba.error_de(format($q$select public.caja_app_guardar_persona(%L, null, 'Sin PIN', 'cajero', null, null, true, null)$q$, ca)) like '22023%', 'PIN obligatorio al crear';
  assert public.caja_app_config(ca)::text not like '%pin_hash%', 'Nunca devuelve el PIN';
  perform prueba.como('duena.b@example.com');
  v := public.caja_app_crear_comercio('Perfumería', 'Percam', 'Cami', '9999');
  perform set_config('prueba.cb', v->>'comercio_id', false);
  perform set_config('prueba.percam', v->>'local_id', false);
  perform set_config('prueba.cami', v->>'persona_id', false);
end $$;

-- 2) Aislamiento entre comercios y accesos sin sesión.
do $$
declare ca uuid := current_setting('prueba.ca'); centro uuid := current_setting('prueba.centro');
begin
  perform prueba.como('duena.b@example.com');
  assert prueba.error_de(format('select public.caja_app_config(%L)', ca)) like '42501%', 'B no ve la config de A';
  assert prueba.error_de(format($q$select public.caja_app_guardar_config(%L, '{"nombre":"Hackeado"}')$q$, ca)) like '42501%', 'B no cambia A';
  assert prueba.error_de(format('select public.caja_app_hoy(%L)', ca)) like '42501%', 'B no ve el Hoy de A';
  assert prueba.error_de(format('select public.caja_app_personas_local(%L)', centro)) like '42501%', 'B no ve las personas de A';
  assert prueba.error_de(format($q$select public.caja_app_entrar(%L, %L, '4321')$q$, centro, current_setting('prueba.lucia'))) like '42501%', 'B no entra en A';
  assert prueba.error_de(format($q$select public.caja_app_guardar_persona(%L, null, 'Infiltrado', 'dueno', array[%L]::uuid[], '1111', true, null)$q$,
    current_setting('prueba.cb'), centro)) like '42501%', 'No asigna locales ajenos';
  perform prueba.como('intruso@example.com');
  assert public.caja_app_mis_comercios() = '[]'::jsonb, 'Intruso sin comercios';
  assert prueba.error_de(format('select public.caja_app_config(%L)', ca)) like '42501%', 'Intruso sin acceso';
  perform prueba.como(null);
  assert prueba.error_de('select public.caja_app_mis_comercios()') like '42501%', 'Sin sesión: sin permiso';
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de('select count(*) from caja_app.cajas') like '42501%', 'Sin acceso directo a tablas';
end $$;

-- 3) PIN: personas del local, intentos y sesión.
do $$
declare centro uuid := current_setting('prueba.centro'); norte uuid := current_setting('prueba.norte'); v jsonb; i int;
begin
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_personas_local(centro);
  assert (select array_agg(x->>'nombre' order by x->>'nombre') from jsonb_array_elements(v) x) = array['Lucía','Sofía'], 'Centro: Lucía y Sofía';
  v := public.caja_app_personas_local(norte);
  assert (select array_agg(x->>'nombre' order by x->>'nombre') from jsonb_array_elements(v) x) = array['Martín','Sofía'], 'Norte: Martín y Sofía';
  assert prueba.error_de(format($q$select public.caja_app_entrar(%L, %L, '5555')$q$, centro, current_setting('prueba.martin'))) like '42501%', 'Martín no trabaja en Centro';
  v := public.caja_app_entrar(centro, current_setting('prueba.lucia')::uuid, '0000');
  assert not (v->>'ok')::boolean, 'PIN incorrecto';
  for i in 1..4 loop perform public.caja_app_entrar(norte, current_setting('prueba.martin')::uuid, '0000'); end loop;
  perform public.caja_app_entrar(norte, current_setting('prueba.martin')::uuid, '0000');
  assert prueba.error_de(format($q$select public.caja_app_entrar(%L, %L, '5555')$q$, norte, current_setting('prueba.martin'))) like '42501%Demasiados%', '5 intentos bloquean';
  v := public.caja_app_entrar(centro, current_setting('prueba.lucia')::uuid, '4321');
  assert (v->>'ok')::boolean and length(v->>'token') = 48, 'Entra con PIN';
  perform set_config('prueba.token_lucia', v->>'token', false);
  v := public.caja_app_entrar(centro, current_setting('prueba.sofia')::uuid, '1234');
  perform set_config('prueba.token_sofia', v->>'token', false);
  assert prueba.error_de($q$select public.caja_app_estado('token-falso')$q$) like '42501%', 'Token falso';
  perform prueba.como('duena.b@example.com');
  assert prueba.error_de(format('select public.caja_app_estado(%L)', current_setting('prueba.token_lucia'))) like '42501%', 'Token ajeno no sirve en otra cuenta';
end $$;

-- 4) Apertura con caja inicial y movimientos del día.
do $$
declare t text := current_setting('prueba.token_lucia'); v jsonb; caja uuid; op uuid := 'e0000000-0000-4000-8000-000000000001';
begin
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_estado(t);
  assert v->'caja' = 'null'::jsonb and (v->>'puede_abrir')::boolean, 'Sin caja todavía';
  assert (v->'sugerida'->>'monto')::numeric = 20000 and v->'sugerida'->>'origen' = 'habitual', 'Sugerida: caja inicial habitual';
  v := public.caja_app_abrir(t, 20000, true);
  assert (v->>'nueva')::boolean and (v->'caja'->>'inicial_coincide')::boolean, 'Abre y coincide';
  caja := (v->'caja'->>'id')::uuid;
  perform set_config('prueba.caja1', caja::text, false);
  v := public.caja_app_abrir(current_setting('prueba.token_sofia'), 19000, false);
  assert not (v->>'nueva')::boolean and (v->'caja'->>'id')::uuid = caja, 'Una sola caja por local y día';
  v := public.caja_app_registrar(t, caja, op, 'cobro', 'Efectivo', 1500.50, null, 'mostrador');
  v := public.caja_app_registrar(t, caja, op, 'cobro', 'Efectivo', 1500.50, null, 'mostrador');
  assert (v->>'repetida')::boolean and (v->'caja'->'totales'->>'cobros')::int = 1, 'Doble envío no duplica';
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'cobro', 'Transferencia', 2000, null, 'pedido 1842');
  perform set_config('prueba.mov_transf', (select x->>'id' from jsonb_array_elements(v->'caja'->'movimientos') x where x->>'medio' = 'Transferencia'), false);
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'cobro', 'Crédito', 10, null, '')$q$, t, caja)) like '22023%', 'Medio no habilitado';
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'gasto', 'Efectivo', 35000, 'Proveedores', '')$q$, t, caja)) like '42501%límite%', 'Supera el límite de gasto';
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'gasto', 'Efectivo', 100, 'Inventada', '')$q$, t, caja)) like '22023%', 'Categoría inválida';
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'cobro', 'Efectivo', 1.005, null, '')$q$, t, caja)) like '22023%', 'Dos decimales';
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Efectivo', 4500, 'Delivery', '');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Transferencia', 7000, 'Servicios', 'luz');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'ingreso', 'Efectivo', 10000, 'Aporte de cambio', '');
  v := public.caja_app_registrar(current_setting('prueba.token_sofia'), caja, gen_random_uuid(), 'retiro', 'Efectivo', 5000, 'Retiro del dueño', 'Sofía');
  assert (v->'caja'->'totales'->>'gastos_efectivo')::numeric = 4500 and (v->'caja'->'totales'->>'gastos')::numeric = 11500, 'Gasto por transferencia no resta efectivo';
  assert (v->'caja'->'totales'->>'retiros_efectivo')::numeric = 5000, 'Retiro aparte de gastos';
  assert (v->'caja'->'totales'->>'saldo_teorico')::numeric = 22000.50, 'Saldo = 20000 + 1500,50 + 10000 − 4500 − 5000';
end $$;

-- 5) Corregir y anular con motivo.
do $$
declare t text := current_setting('prueba.token_lucia'); caja uuid := current_setting('prueba.caja1'); v jsonb; viejo uuid := current_setting('prueba.mov_transf');
begin
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de(format($q$select public.caja_app_anular(%L, %L, %L, '', '')$q$, t, caja, viejo)) like '22023%', 'Motivo obligatorio';
  v := public.caja_app_corregir(t, caja, viejo, 'e0000000-0000-4000-8000-000000000099', 'Débito', 2500, 'Medio de pago equivocado');
  assert (select (x->>'anulado')::boolean and x->>'motivo_anulacion' = 'Medio de pago equivocado' from jsonb_array_elements(v->'caja'->'movimientos') x where x->>'id' = viejo::text), 'Original anulado con motivo';
  assert (select x->>'corrige' = viejo::text and x->>'medio' = 'Débito' and (x->>'monto')::numeric = 2500 from jsonb_array_elements(v->'caja'->'movimientos') x where x->>'id' = v->>'movimiento_id'), 'Nuevo movimiento vinculado';
  assert (v->'caja'->'totales'->'por_medio'->>'Débito')::numeric = 2500 and not (v->'caja'->'totales'->'por_medio' ? 'Transferencia'), 'Totales corregidos';
  v := public.caja_app_corregir(t, caja, viejo, 'e0000000-0000-4000-8000-000000000099', 'Débito', 2500, 'Medio de pago equivocado');
  assert (v->>'repetida')::boolean, 'Corrección idempotente';
  v := public.caja_app_anular(t, caja, (v->>'movimiento_id')::uuid, 'Se cargó dos veces', null);
  v := public.caja_app_anular(t, caja, (select (x->>'id')::uuid from jsonb_array_elements(v->'caja'->'movimientos') x where x->>'medio' = 'Débito'), 'Se cargó dos veces', null);
  assert (v->>'repetida')::boolean, 'Anular dos veces no hace nada';
  perform set_config('role', 'postgres', true);
  assert prueba.error_de(format('update caja_app.movimientos set monto = 1 where caja_id = %L', caja)) like '42501%', 'No se cambian importes';
  assert prueba.error_de(format('delete from caja_app.movimientos where caja_id = %L', caja)) like '42501%', 'No se borran movimientos';
end $$;

-- 6) Fotos y cierre con arqueo, retiro y caja para mañana.
do $$
declare t text := current_setting('prueba.token_lucia'); caja uuid := current_setting('prueba.caja1'); ca uuid := current_setting('prueba.ca'); v jsonb;
begin
  perform prueba.como('duena.a@example.com');
  assert prueba.error_de(format('select public.caja_app_cerrar(%L, %L, 22000, null, null, null, 2000, %L, null)', t, caja, 'Sofía')) like '22023%Efectivo contado%', 'Falta foto obligatoria';
  assert prueba.error_de(format($q$select public.caja_app_registrar_foto(%L, %L, 'efectivo', 'otro/lugar/archivo123.jpg')$q$, t, caja)) like '22023%', 'Ruta de foto ajena';
  assert prueba.error_de(format($q$select public.caja_app_registrar_foto(%L, %L, 'inventada', %L)$q$, t, caja, ca || '/' || caja || '/foto12345678.jpg')) like '22023%', 'Foto no pedida';
  v := public.caja_app_registrar_foto(t, caja, 'efectivo', ca || '/' || caja || '/foto12345678.jpg');
  assert (v->>'fotos')::int = 1, 'Foto registrada';
  assert prueba.error_de(format('select public.caja_app_cerrar(%L, %L, 22000, null, null, null, 30000, %L, null)', t, caja, 'Sofía')) like '22023%', 'Retiro mayor al arqueo';
  assert prueba.error_de(format('select public.caja_app_cerrar(%L, %L, 22000, null, null, null, 2000, null, null)', t, caja)) like '22023%', 'Destino del retiro';
  v := public.caja_app_cerrar(t, caja, 22000, null, null, '{"Débito":true}', 2000, 'Sofía', 'Faltan 50 centavos');
  assert not (v->>'ya_cerrada')::boolean and v->'caja'->>'estado' = 'cerrada' and v->'caja'->>'tipo_cierre' = 'manual', 'Cierre manual';
  assert (v->'caja'->'totales'->>'saldo_teorico')::numeric = 22000.50 and (v->'caja'->>'diferencia')::numeric = -0.50, 'Diferencia −0,50 (faltante)';
  assert (v->'caja'->>'queda_para_manana')::numeric = 20000 and v->'caja'->>'cerrada_por' = 'Lucía', 'Queda 20000 y cerró Lucía';
  v := public.caja_app_cerrar(t, caja, 1, null, null, null, 0, null, null);
  assert (v->>'ya_cerrada')::boolean and (v->'caja'->>'arqueo')::numeric = 22000, 'Doble cierre no cambia nada';
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'cobro', 'Efectivo', 10, null, '')$q$, t, caja)) like '22023%cerrada%', 'Cerrada no acepta movimientos';
  v := public.caja_app_abrir(t, 20000, true);
  assert not (v->>'nueva')::boolean and v->'caja'->>'estado' = 'cerrada', 'No se reabre el mismo día';
  perform set_config('role', 'postgres', true);
  assert (caja_app.sugerida(current_setting('prueba.centro')::uuid))->>'origen' = 'cierre', 'Mañana arranca con lo que quedó';
  assert prueba.error_de(format('update caja_app.cajas set arqueo = 1 where id = %L', caja)) like '42501%', 'Cierre inmutable';
  assert prueba.error_de('truncate caja_app.auditoria') like '42501%', 'Auditoría sin truncate';
end $$;

-- 7) Modo «totales al cierre» con la planilla real del 22/8 (caja inicial, venta del sistema, otros medios).
do $$
declare cb uuid := current_setting('prueba.cb'); v jsonb; t text; caja uuid;
begin
  perform prueba.como('duena.b@example.com');
  v := public.caja_app_guardar_config(cb, '{"modo_carga":"totales","medios":["Efectivo","Posnet","Mercado Pago","PedidosYa","Rappi"]}');
  v := public.caja_app_entrar(current_setting('prueba.percam')::uuid, current_setting('prueba.cami')::uuid, '9999');
  t := v->>'token';
  v := public.caja_app_abrir(t, 981200, true);
  caja := (v->'caja'->>'id')::uuid;
  assert prueba.error_de(format($q$select public.caja_app_registrar(%L, %L, gen_random_uuid(), 'cobro', 'Efectivo', 10, null, '')$q$, t, caja)) like '22023%totales%', 'En modo totales no se cargan cobros';
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Efectivo', 200000, 'Insumos', 'aceite');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Efectivo', 350460, 'Proveedores', 'carne');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Efectivo', 106800, 'Proveedores', 'agua y corona');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'gasto', 'Efectivo', 233000, 'Proveedores', 'Suprema');
  v := public.caja_app_registrar(t, caja, gen_random_uuid(), 'retiro', 'Efectivo', 36000, 'Adelanto a empleado', 'Cristian');
  assert (v->'caja'->'totales'->>'saldo_teorico') is null, 'Sin venta total todavía no hay saldo';
  assert prueba.error_de(format($q$select public.caja_app_cerrar(%L, %L, 733900, 1493400, '{"Posnet":2000000}', null, 0, null, null)$q$, t, caja)) like '22023%más que la venta%', 'Otros medios mayores que la venta';
  assert prueba.error_de(format($q$select public.caja_app_cerrar(%L, %L, 733900, 1493400, '{"Bitcoin":1}', null, 0, null, null)$q$, t, caja)) like '22023%', 'Medio desconocido';
  v := public.caja_app_cerrar(t, caja, 733900, 1493400, '{"Posnet":376600,"Mercado Pago":350000,"PedidosYa":98350}', null, 0, null, null);
  assert (v->'caja'->'totales'->>'efectivo_ventas')::numeric = 668450, 'Ventas en efectivo = 1.493.400 − 824.950';
  assert (v->'caja'->'totales'->>'saldo_teorico')::numeric = 723390, 'Saldo teórico 723.390 (como la planilla)';
  assert (v->'caja'->>'diferencia')::numeric = 10510, 'Sobrante 10.510 (como la planilla)';
end $$;

-- 8) Cierre automático y arqueo tardío del dueño.
do $$
declare ca uuid := current_setting('prueba.ca'); norte uuid := current_setting('prueba.norte'); v jsonb; caja uuid; n int; hoy date;
begin
  perform set_config('role', 'postgres', true);
  hoy := caja_app.dia_ar();
  insert into caja_app.cajas (comercio_id, local_id, dia, modo_carga, caja_inicial, inicial_coincide, abierta_por, abierta_por_user)
  values (ca, norte, caja_app.dia_ar() - 1, 'cobro', 15000, true, current_setting('prueba.martin')::uuid, 'a1000000-0000-4000-8000-000000000001')
  returning id into caja;
  insert into caja_app.movimientos (caja_id, comercio_id, operacion, tipo, medio, monto, registrado_por, registrado_por_user)
  values (caja, ca, gen_random_uuid(), 'cobro', 'Efectivo', 7000, current_setting('prueba.martin')::uuid, 'a1000000-0000-4000-8000-000000000001');
  n := caja_app.cerrar_vencidos(null, caja_app.limite(caja_app.dia_ar() - 1, '23:59') - interval '1 second');
  assert n = 0, '23:58:59 todavía abierta';
  n := caja_app.cerrar_vencidos();
  assert n = 1 and caja_app.cerrar_vencidos() = 0, 'Cierra una vez y es idempotente';
  assert (select tipo_cierre = 'automatico' and arqueo is null and saldo_teorico = 22000 and cerrada_at = caja_app.limite(dia, '23:59')
          from caja_app.cajas where id = caja), 'Cierre automático a las 23:59 con saldo 15000 + 7000';
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_hoy(ca);
  assert exists (select 1 from jsonb_array_elements(v->'pendientes') x where x->>'caja_id' = caja::text), 'Hoy muestra el arqueo pendiente';
  assert prueba.error_de(format('select public.caja_app_completar_arqueo(%L, %L, 22000, null, null, 30000)', ca, caja)) like '22023%', 'Queda no mayor al arqueo';
  v := public.caja_app_completar_arqueo(ca, caja, 21000, null, null, 15000);
  assert (v->>'arqueo_tardio')::boolean and (v->>'diferencia')::numeric = -1000 and (v->>'queda_para_manana')::numeric = 15000, 'Arqueo tardío: faltan 1000';
  assert prueba.error_de(format('select public.caja_app_completar_arqueo(%L, %L, 22000, null, null, 0)', ca, caja)) like '22023%', 'Solo una vez';
  perform prueba.como('duena.b@example.com');
  assert prueba.error_de(format('select public.caja_app_detalle(%L, %L)', ca, caja)) like '42501%', 'Otro comercio no ve el detalle';
  perform prueba.como('duena.a@example.com');
  v := public.caja_app_historial(ca, null, hoy - 7, hoy);
  assert jsonb_array_length(v) = 2, 'Historial con las 2 cajas cerradas de A';
  assert prueba.error_de(format('select public.caja_app_historial(%L, null, %L, %L)', ca, hoy, hoy - 1)) like '22023%', 'Período inválido';
end $$;

-- 9) Persona desactivada: su sesión deja de valer.
do $$
declare ca uuid := current_setting('prueba.ca');
begin
  perform prueba.como('duena.a@example.com');
  perform public.caja_app_guardar_persona(ca, current_setting('prueba.lucia')::uuid, 'Lucía', 'cajero', array[current_setting('prueba.centro')::uuid], null, false, 30000);
  assert prueba.error_de(format('select public.caja_app_estado(%L)', current_setting('prueba.token_lucia'))) like '42501%', 'Desactivada: sin acceso';
end $$;

-- 10) RLS por comercio con permisos de lectura otorgados solo dentro del bloque.
do $$
declare ca uuid := current_setting('prueba.ca'); cb uuid := current_setting('prueba.cb');
begin
  perform set_config('role', 'postgres', true);
  begin
    grant usage on schema caja_app to authenticated;
    grant select on all tables in schema caja_app to authenticated;
    grant execute on function caja_app.mis_comercios() to authenticated;
    perform prueba.como('duena.b@example.com');
    assert (select count(*) from caja_app.cajas where comercio_id = ca) = 0, 'RLS: B no ve cajas de A';
    assert (select count(*) from caja_app.movimientos where comercio_id = ca) = 0, 'RLS: B no ve movimientos de A';
    assert (select count(*) from caja_app.cajas) = 1, 'RLS: B ve su caja';
    assert prueba.error_de('select count(*) from caja_app.personas') is null and (select count(*) from caja_app.personas) = 0, 'RLS: PIN nunca legibles';
    perform prueba.como('intruso@example.com');
    assert (select count(*) from caja_app.comercios) = 0, 'RLS: intruso 0 comercios';
    raise exception using errcode = 'P0001', message = 'deshacer';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'deshacer' then raise; end if;
  end;
end $$;

select 'CAJA APP: OK' as resultado;
