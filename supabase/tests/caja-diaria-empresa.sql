-- Caja diaria exclusiva (issue #200) sobre la base REAL. Usa cuentas reales sin mostrar sus correos.
-- El bloque termina con una excepción a propósito que devuelve el informe: todo se deshace
-- (no deja cajas, ventas, permisos ni registros). Cada línea dice OK o FALLA.
do $t$
declare
  r text := ''; v jsonb; e text; t uuid; old_t uuid; mov uuid; n int;
  perf constant uuid := '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
  mg constant uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  due_perf uuid; due_perf_mail text; due_mg uuid; due_mg_mail text; ger_mg uuid; ger_mg_mail text; cre uuid; cre_mail text;
  mg_antes text; mg_despues text;
  ok_ boolean;
  procedure_line text;
begin
  select u.id, lower(u.email) into due_perf, due_perf_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = perf and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into due_mg, due_mg_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = mg and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null
      and not exists (select 1 from gestlok_platform.admins a where a.user_id = u.id) order by u.created_at limit 1;
  select u.id, lower(u.email) into ger_mg, ger_mg_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = mg and d.data->>'rol' = 'gerente' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select a.user_id, lower(u.email) into cre, cre_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id
    where u.email_confirmed_at is not null order by a.user_id limit 1;
  r := r || E'\nCuentas encontradas: dueña Perfumes=' || (due_perf is not null) || ' dueño MG=' || (due_mg is not null)
         || ' gerente MG=' || (ger_mg is not null) || ' creadora=' || (cre is not null);

  -- Huella de Mi Gusto antes (documentos y Pagos Online).
  select md5(coalesce(string_agg(d.col || '/' || d.id || '=' || d.data::text, '|' order by d.col, d.id), ''))
    || ':' || (select count(*) from gestlok_mg_online_private.shifts) || ':' || (select count(*) from gestlok_mg_online_private.movements)
    into mg_antes from public.docs d where d.tenant_id = mg;

  r := r || E'\n' || case when (select array_agg(tenant_id) from gestlok_caja_private.empresas) = array[perf] then 'OK' else 'FALLA' end
         || ' solo Perfumes habilitada';
  r := r || E'\n' || case when exists (select 1 from cron.job where jobname = 'gestlok-caja-diaria-cierre-2359-ar'
                                         and schedule = '59 * * * *' and active) then 'OK' else 'FALLA' end || ' cierre automático programado en pg_cron';

  -- Dueña de Perfumes: flujo completo.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', due_perf, 'email', due_perf_mail, 'role', 'authenticated')::text, true);
  v := public.gestlok_caja_acceso();
  r := r || E'\n' || case when (v->>'habilitada')::boolean and (v->>'tenant_id')::uuid = perf then 'OK' else 'FALLA' end || ' dueña de Perfumes accede';
  v := public.gestlok_caja_estado();
  if v->'turno' <> 'null'::jsonb then
    r := r || E'\nAVISO ya hay una caja real hoy: se omite el escenario de escritura';
  else
    v := public.gestlok_caja_abrir('Prueba automática');
    t := (v->'turno'->>'id')::uuid;
    r := r || E'\n' || case when (v->>'nuevo')::boolean then 'OK' else 'FALLA' end || ' abre con responsable';
    v := public.gestlok_caja_registrar(t, 'efectivo', 1000, 'prueba', 'f0000000-0000-4000-8000-000000000001');
    v := public.gestlok_caja_registrar(t, 'efectivo', 1000, 'prueba', 'f0000000-0000-4000-8000-000000000001');
    r := r || E'\n' || case when (v->>'repetida')::boolean and (v->'turno'->>'ventas')::int = 1 then 'OK' else 'FALLA' end || ' doble envío no duplica';
    v := public.gestlok_caja_registrar(t, 'transferencia', 2500.75, '', 'f0000000-0000-4000-8000-000000000002');
    v := public.gestlok_caja_registrar(t, 'efectivo', 50, '', 'f0000000-0000-4000-8000-000000000003');
    mov := (v->>'movimiento_id')::uuid;
    v := public.gestlok_caja_anular(t, mov);
    r := r || E'\n' || case when (v->'turno'->>'efectivo')::numeric = 1000 and (v->'turno'->>'transferencia')::numeric = 2500.75
                              and (v->'turno'->>'total')::numeric = 3500.75 and (v->'turno'->>'ventas')::int = 2 then 'OK' else 'FALLA' end
           || ' efectivo, transferencia y total (con una venta anulada)';
    begin perform public.gestlok_caja_cerrar(t, ' '); r := r || E'\nFALLA cerró sin responsable';
    exception when others then r := r || E'\nOK responsable obligatorio al cerrar (' || sqlstate || ')'; end;
    v := public.gestlok_caja_cerrar(t, 'Prueba automática');
    r := r || E'\n' || case when not (v->>'ya_cerrado')::boolean and v->'turno'->>'tipo_cierre' = 'manual'
                              and v->'turno'->>'cerrado_por' = due_perf_mail then 'OK' else 'FALLA' end || ' cierre manual con usuario';
    v := public.gestlok_caja_cerrar(t, 'Otra');
    r := r || E'\n' || case when (v->>'ya_cerrado')::boolean then 'OK' else 'FALLA' end || ' doble clic de cierre: idempotente';
    v := public.gestlok_caja_abrir('Otra');
    r := r || E'\n' || case when not (v->>'nuevo')::boolean and v->'turno'->>'estado' = 'cerrado' then 'OK' else 'FALLA' end || ' no se reabre el mismo día';
    begin perform public.gestlok_caja_registrar(t, 'efectivo', 1, '', gen_random_uuid()); r := r || E'\nFALLA vendió con la caja cerrada';
    exception when others then r := r || E'\nOK caja cerrada no acepta ventas (' || sqlstate || ')'; end;
  end if;

  -- Cierre automático (servidor) de una caja vieja sin ventas: fecha sin datos reales.
  perform set_config('role', 'postgres', true);
  insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por)
  values (perf, date '2000-01-01', 'Prueba vieja', due_perf) returning id into old_t;
  n := gestlok_caja_private.cerrar_vencidos();
  select (estado = 'cerrado' and tipo_cierre = 'automatico' and total = 0 and ventas = 0
          and cerrado_at = gestlok_caja_private.limite(dia)) into ok_ from gestlok_caja_private.turnos where id = old_t;
  r := r || E'\n' || case when ok_ then 'OK' else 'FALLA' end || ' cierre automático 23:59, sin ventas = 0';
  r := r || E'\n' || case when gestlok_caja_private.cerrar_vencidos() = 0 then 'OK' else 'FALLA' end || ' repetir el cierre automático no hace nada';
  begin update gestlok_caja_private.turnos set total = 1 where id = old_t; r := r || E'\nFALLA se modificó un cierre';
  exception when others then r := r || E'\nOK cierre inmutable (' || sqlstate || ')'; end;

  -- Otras cuentas: Mi Gusto, creadora, email ajeno en el token y sin sesión.
  perform set_config('role', 'authenticated', true);
  foreach procedure_line in array array['dueño Mi Gusto', 'gerente Mi Gusto', 'creadora', 'token con email ajeno'] loop
    perform set_config('request.jwt.claims', case procedure_line
      when 'dueño Mi Gusto' then json_build_object('sub', due_mg, 'email', due_mg_mail, 'role', 'authenticated')
      when 'gerente Mi Gusto' then json_build_object('sub', ger_mg, 'email', ger_mg_mail, 'role', 'authenticated')
      when 'creadora' then json_build_object('sub', cre, 'email', cre_mail, 'role', 'authenticated')
      else json_build_object('sub', due_mg, 'email', due_perf_mail, 'role', 'authenticated') end::text, true);
    r := r || E'\n' || case when not (public.gestlok_caja_acceso()->>'habilitada')::boolean then 'OK' else 'FALLA' end || ' ' || procedure_line || ' sin acceso';
    begin perform public.gestlok_caja_estado(); r := r || E'\nFALLA ' || procedure_line || ' leyó la caja';
    exception when others then r := r || E'\nOK ' || procedure_line || ' no lee la caja (' || sqlstate || ')'; end;
    begin perform public.gestlok_caja_detalle(old_t); r := r || E'\nFALLA ' || procedure_line || ' leyó un cierre';
    exception when others then r := r || E'\nOK ' || procedure_line || ' no lee cierres (' || sqlstate || ')'; end;
    begin perform public.gestlok_caja_registrar(coalesce(t, old_t), 'efectivo', 1, '', gen_random_uuid()); r := r || E'\nFALLA ' || procedure_line || ' registró';
    exception when others then r := r || E'\nOK ' || procedure_line || ' no registra (' || sqlstate || ')'; end;
    begin perform count(*) from gestlok_caja_private.turnos; r := r || E'\nFALLA ' || procedure_line || ' leyó la tabla directo';
    exception when others then r := r || E'\nOK ' || procedure_line || ' sin acceso directo (' || sqlstate || ')'; end;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin perform public.gestlok_caja_acceso(); r := r || E'\nFALLA visitante sin sesión';
  exception when others then r := r || E'\nOK visitante sin sesión rechazado (' || sqlstate || ')'; end;

  -- RLS por empresa (segunda barrera) con permisos de lectura otorgados solo dentro de este bloque.
  perform set_config('role', 'postgres', true);
  begin
    grant usage on schema gestlok_caja_private to authenticated;
    grant select on all tables in schema gestlok_caja_private to authenticated;
    grant execute on function gestlok_caja_private.empresa_autorizada() to authenticated;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', due_mg, 'email', due_mg_mail, 'role', 'authenticated')::text, true);
    select count(*) into n from gestlok_caja_private.turnos;
    r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' RLS: Mi Gusto ve ' || n || ' cajas';
    perform set_config('request.jwt.claims', json_build_object('sub', due_perf, 'email', due_perf_mail, 'role', 'authenticated')::text, true);
    select count(*) into n from gestlok_caja_private.turnos where tenant_id <> perf;
    r := r || E'\n' || case when n = 0 and exists (select 1 from gestlok_caja_private.turnos) then 'OK' else 'FALLA' end || ' RLS: Perfumes ve solo lo suyo';
    raise exception using errcode = 'P0001', message = 'deshacer-permisos';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'deshacer-permisos' then raise; end if;
  end;

  perform set_config('role', 'postgres', true);
  select md5(coalesce(string_agg(d.col || '/' || d.id || '=' || d.data::text, '|' order by d.col, d.id), ''))
    || ':' || (select count(*) from gestlok_mg_online_private.shifts) || ':' || (select count(*) from gestlok_mg_online_private.movements)
    into mg_despues from public.docs d where d.tenant_id = mg;
  r := r || E'\n' || case when mg_antes = mg_despues then 'OK' else 'FALLA' end || ' Mi Gusto intacto (documentos y Pagos Online)';
  raise exception 'INFORME%', r;
end $t$;
