-- Caja app sobre el Supabase REAL (con la migración ya aplicada). Usa cuentas ficticias (solo el JWT:
-- caja_app no lee auth.users) y termina con una excepción a propósito: no deja comercios, cajas ni registros.
do $t$
declare
  r text := ''; v jsonb; ca uuid; cb uuid; la uuid; lb uuid; pa uuid; pb uuid; ta text; tb text; caja uuid; cajab uuid; n int;
  ua constant text := '{"sub":"0a0a0a0a-0000-4000-8000-00000000000a","role":"authenticated"}';
  ub constant text := '{"sub":"0b0b0b0b-0000-4000-8000-00000000000b","role":"authenticated"}';
  ok_ boolean; gestlok_antes text; gestlok_despues text;
begin
  select md5(string_agg(d.col || d.id || d.data::text, '|' order by d.tenant_id, d.col, d.id)) into gestlok_antes from public.docs d;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', ua, true);
  v := public.caja_app_crear_comercio('Prueba A', 'Centro', 'Ana', '1234'); ca := v->>'comercio_id'; la := v->>'local_id'; pa := v->>'persona_id';
  perform public.caja_app_guardar_config(ca, '{"caja_inicial_habitual":20000,"fotos":[{"id":"efectivo","nombre":"Efectivo contado","obligatoria":true}]}');
  ta := public.caja_app_entrar(la, pa, '1234')->>'token';
  r := r || E'\n' || case when length(ta) = 48 then 'OK' else 'FALLA' end || ' alta de comercio y PIN';
  v := public.caja_app_abrir(ta, 20000, true); caja := v->'caja'->>'id';
  perform public.caja_app_registrar(ta, caja, 'e0000000-0000-4000-8000-000000000001', 'cobro', 'Efectivo', 1500.50, null, '');
  v := public.caja_app_registrar(ta, caja, 'e0000000-0000-4000-8000-000000000001', 'cobro', 'Efectivo', 1500.50, null, '');
  r := r || E'\n' || case when (v->>'repetida')::boolean then 'OK' else 'FALLA' end || ' doble envío no duplica';
  perform public.caja_app_registrar(ta, caja, gen_random_uuid(), 'gasto', 'Efectivo', 4500, 'Delivery', '');
  perform public.caja_app_registrar(ta, caja, gen_random_uuid(), 'ingreso', 'Efectivo', 10000, 'Aporte de cambio', '');
  v := public.caja_app_registrar(ta, caja, gen_random_uuid(), 'retiro', 'Efectivo', 5000, 'Retiro del dueño', '');
  r := r || E'\n' || case when (v->'caja'->'totales'->>'saldo_teorico')::numeric = 22000.50 then 'OK' else 'FALLA' end || ' saldo teórico';
  begin perform public.caja_app_cerrar(ta, caja, 22000, null, null, null, 2000, 'Ana', null); r := r || E'\nFALLA cerró sin la foto obligatoria';
  exception when others then r := r || E'\nOK foto obligatoria antes de cerrar (' || sqlstate || ')'; end;
  perform public.caja_app_registrar_foto(ta, caja, 'efectivo', ca || '/' || caja || '/foto12345678.jpg');
  v := public.caja_app_cerrar(ta, caja, 22000, null, null, null, 2000, 'Ana', null);
  r := r || E'\n' || case when (v->'caja'->>'diferencia')::numeric = -0.50 and (v->'caja'->>'queda_para_manana')::numeric = 20000 then 'OK' else 'FALLA' end || ' cierre: diferencia y caja para mañana';
  v := public.caja_app_cerrar(ta, caja, 1, null, null, null, 0, null, null);
  r := r || E'\n' || case when (v->>'ya_cerrada')::boolean then 'OK' else 'FALLA' end || ' doble cierre idempotente';

  -- Comercio B en modo totales con la planilla del 22/8.
  perform set_config('request.jwt.claims', ub, true);
  v := public.caja_app_crear_comercio('Prueba B', 'Percam', 'Cami', '9999'); cb := v->>'comercio_id'; lb := v->>'local_id'; pb := v->>'persona_id';
  perform public.caja_app_guardar_config(cb, '{"modo_carga":"totales","medios":["Efectivo","Posnet","Mercado Pago","PedidosYa"]}');
  tb := public.caja_app_entrar(lb, pb, '9999')->>'token';
  cajab := public.caja_app_abrir(tb, 981200, true)->'caja'->>'id';
  perform public.caja_app_registrar(tb, cajab, gen_random_uuid(), 'gasto', 'Efectivo', 890260, 'Proveedores', '');
  perform public.caja_app_registrar(tb, cajab, gen_random_uuid(), 'retiro', 'Efectivo', 36000, 'Adelanto a empleado', '');
  v := public.caja_app_cerrar(tb, cajab, 733900, 1493400, '{"Posnet":376600,"Mercado Pago":350000,"PedidosYa":98350}', null, 0, null, null);
  r := r || E'\n' || case when (v->'caja'->>'saldo_teorico')::numeric = 723390 or (v->'caja'->'totales'->>'saldo_teorico')::numeric = 723390 then 'OK' else 'FALLA' end || ' totales al cierre: saldo 723.390';
  r := r || E'\n' || case when (v->'caja'->>'diferencia')::numeric = 10510 then 'OK' else 'FALLA' end || ' totales al cierre: sobrante 10.510';

  -- Aislamiento.
  begin perform public.caja_app_config(ca); r := r || E'\nFALLA B vio la config de A';
  exception when others then r := r || E'\nOK B no ve la config de A (' || sqlstate || ')'; end;
  begin perform public.caja_app_estado(ta); r := r || E'\nFALLA B usó el token de A';
  exception when others then r := r || E'\nOK token de A no sirve en B (' || sqlstate || ')'; end;
  begin perform public.caja_app_detalle(ca, caja); r := r || E'\nFALLA B vio una caja de A';
  exception when others then r := r || E'\nOK B no ve cajas de A (' || sqlstate || ')'; end;
  begin perform count(*) from caja_app.cajas; r := r || E'\nFALLA acceso directo a tablas';
  exception when others then r := r || E'\nOK sin acceso directo a tablas (' || sqlstate || ')'; end;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.caja_app_mis_comercios(); r := r || E'\nFALLA visitante sin sesión';
  exception when others then r := r || E'\nOK visitante sin sesión rechazado (' || sqlstate || ')'; end;

  -- Cierre automático y arqueo tardío.
  perform set_config('role', 'postgres', true);
  insert into caja_app.cajas (comercio_id, local_id, dia, modo_carga, caja_inicial, inicial_coincide, abierta_por, abierta_por_user)
  values (ca, la, date '2000-01-01', 'cobro', 1000, true, pa, '0a0a0a0a-0000-4000-8000-00000000000a') returning id into caja;
  n := caja_app.cerrar_vencidos(ca);
  select tipo_cierre = 'automatico' and arqueo is null into ok_ from caja_app.cajas where id = caja;
  r := r || E'\n' || case when n = 1 and ok_ then 'OK' else 'FALLA' end || ' cierre automático';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', ua, true);
  v := public.caja_app_completar_arqueo(ca, caja, 900, null, null, 900);
  r := r || E'\n' || case when (v->>'arqueo_tardio')::boolean and (v->>'diferencia')::numeric = -100 then 'OK' else 'FALLA' end || ' arqueo tardío';
  perform set_config('role', 'postgres', true);
  r := r || E'\n' || case when exists (select 1 from cron.job where jobname = 'caja-app-cierre-automatico' and active) then 'OK' else 'FALLA' end || ' cierre automático programado';
  select md5(string_agg(d.col || d.id || d.data::text, '|' order by d.tenant_id, d.col, d.id)) into gestlok_despues from public.docs d;
  r := r || E'\n' || case when gestlok_antes = gestlok_despues then 'OK' else 'FALLA' end || ' GESTLOK intacto';
  raise exception 'INFORME%', r;
end $t$;
