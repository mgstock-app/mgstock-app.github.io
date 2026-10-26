-- Ingreso de mercadería: ninguna empresa puede leer ni sumar ingresos en locales de otra.
-- Sin datos personales: las cuentas se eligen por rol y empresa dentro de la base.
-- Solo usa un producto inexistente (respuesta «faltan»), así que nunca escribe; además,
-- el bloque termina con una excepción a propósito que devuelve el informe y revierte todo.
do $t$
declare
  r text := ''; v jsonb; fallas int := 0;
  orig uuid; otra uuid; otra_local text;
  due_id uuid; due_mail text; ger_id uuid; ger_mail text; ext_id uuid; ext_mail text;
  antes text; despues text;
  items jsonb := '[{"col":"fabrica","campo":"fabrica","id":"fixture-no-existe-tenant-guard","cantidad":1,"nombre":"Producto ficticio"}]';
  caso record;
begin
  select id into orig from gestlok_tenancy.tenants where code = 'gestlok-original';
  select id into otra from gestlok_tenancy.tenants where code <> 'gestlok-original' order by created_at limit 1;
  select id into otra_local from public.docs where col = 'locales' and tenant_id = otra limit 1;
  select u.id, lower(u.email) into due_id, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = orig and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into ger_id, ger_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = orig and d.data->>'rol' in ('gerente','editor') and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into ext_id, ext_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = otra and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null limit 1;
  if due_id is null or otra is null then raise exception 'Faltan cuentas de prueba (dueño original / otra empresa)'; end if;

  select md5(string_agg(col || '|' || id || '|' || data::text, ',' order by col, id)) into antes
    from public.docs where col like 'munro/%' or col like 'torcuato/%' or col in ('locales', 'equipo', 'importaciones');

  for caso in
    select * from (values
      ('Dueño original en Munro',            due_id, due_mail, 'munro',    'faltan'),
      ('Dueño original en Torcuato',         due_id, due_mail, 'torcuato', 'faltan'),
      ('Dueño original en local de otra',    due_id, due_mail, otra_local, 'MGS:sucursal'),
      ('Dueño de otra empresa en Munro',     ext_id, ext_mail, 'munro',    'MGS:sucursal'),
      ('Dueño de otra empresa en Torcuato',  ext_id, ext_mail, 'torcuato', 'MGS:sucursal'),
      ('Dueño de otra empresa en su local',  ext_id, ext_mail, otra_local, 'faltan'),
      ('Gerente original en Munro',          ger_id, ger_mail, 'munro',    'MGS:sin_permiso')
    ) as c(nombre, uid, mail, local, esperado)
  loop
    if caso.uid is null then r := r || E'\nOMITIDO ' || caso.nombre || ' (sin cuenta)'; continue; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', caso.uid, 'email', caso.mail, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      v := public.importar_mercaderia(caso.local, 'ingreso', items, '{}'::jsonb, 'fixture-tenant-guard-01', false);
      if v->>'estado' = caso.esperado then r := r || E'\nOK ' || caso.nombre || ' -> ' || (v->>'estado');
      else fallas := fallas + 1; r := r || E'\nFALLA ' || caso.nombre || ' -> ' || coalesce(v->>'estado', v::text) || ' (esperado ' || caso.esperado || ')'; end if;
    exception when others then
      if sqlerrm = caso.esperado then r := r || E'\nOK ' || caso.nombre || ' -> ' || sqlerrm;
      else fallas := fallas + 1; r := r || E'\nFALLA ' || caso.nombre || ' -> ' || sqlerrm || ' (esperado ' || caso.esperado || ')'; end if;
    end;
    perform set_config('role', 'postgres', true);
  end loop;

  -- Sin sesión: anon no puede ejecutar ninguna de las dos funciones.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform public.importar_mercaderia('munro', 'ingreso', items, '{}'::jsonb, 'fixture-tenant-guard-02', false);
    fallas := fallas + 1; r := r || E'\nFALLA anon ejecutó importar_mercaderia';
  exception when insufficient_privilege then r := r || E'\nOK anon rechazado';
  end;
  perform set_config('role', 'authenticated', true);
  begin
    perform public.importar_mercaderia_internal('munro', 'ingreso', items, '{}'::jsonb, 'fixture-tenant-guard-03', false);
    fallas := fallas + 1; r := r || E'\nFALLA authenticated ejecutó la función interna';
  exception
    when insufficient_privilege then r := r || E'\nOK función interna cerrada a clientes';
    when undefined_function then fallas := fallas + 1; r := r || E'\nFALLA no existe la función interna (migración sin aplicar)';
  end;
  perform set_config('role', 'postgres', true);

  select md5(string_agg(col || '|' || id || '|' || data::text, ',' order by col, id)) into despues
    from public.docs where col like 'munro/%' or col like 'torcuato/%' or col in ('locales', 'equipo', 'importaciones');
  if antes is distinct from despues then fallas := fallas + 1; r := r || E'\nFALLA cambió la huella de Munro/Torcuato';
  else r := r || E'\nOK huella de Munro y Torcuato idéntica'; end if;

  raise exception 'INFORME (% fallas):%', fallas, r;
end
$t$;
