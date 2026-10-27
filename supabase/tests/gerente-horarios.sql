-- Gerente de GESTLOK -> «Horarios» de Administración de empleados.
-- Usa las cuentas reales (resueltas por rol, sin datos personales en el repositorio) solo para LEER roles; toda escritura se revierte al final (el bloque termina
-- con una excepción a propósito que devuelve el informe). No deja datos.
do $t$
declare
  r text := '';
  v text[]; n int; ok boolean;
  munro uuid; munro_mail text;
  torc  uuid; torc_mail  text;
  due   uuid; due_mail   text;
  cre   uuid; cre_mail   text;
  tenant uuid;
  good text := 'https://docs.google.com/spreadsheets/d/PRUEBA_ficticia_123/edit?gid=0#gid=0';
begin
  -- Cuentas resueltas por rol dentro de la base: el repositorio público no guarda correos ni IDs de personas.
  tenant := (select id from gestlok_tenancy.tenants where code = 'gestlok-original');
  select u.id, lower(u.email) into munro, munro_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (tenant) and d.data->>'rol' in ('gerente', 'editor') and d.data->'locales' ? 'munro' and not d.data->'locales' ? 'torcuato' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into torc, torc_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (tenant) and d.data->>'rol' in ('gerente', 'editor') and d.data->'locales' ? 'torcuato' and not d.data->'locales' ? 'munro' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into due, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (tenant) and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select a.user_id, lower(u.email) into cre, cre_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id where u.email_confirmed_at is not null order by u.created_at limit 1;
  perform set_config('role', 'authenticated', true);

  -- helper inline: login como
  perform set_config('request.jwt.claims', json_build_object('sub', munro, 'email', munro_mail, 'role', 'authenticated')::text, true);
  v := rm_test_private.gestlok_gerente_locals(); r := r || E'\nMunro locales: ' || v::text;
  r := r || E'\nMunro contexto: ' || (public.gestlok_gerente_area_context())::text;
  r := r || E'\nMunro app_role: [' || rm_test_private.app_role() || ']';
  r := r || E'\nMunro rm_app_me gestlok_gerente: ' || coalesce((public.rm_app_me())->'gestlok_gerente', 'null'::jsonb)::text || ' role=' || coalesce((public.rm_app_me())->>'role', 'null');
  r := r || E'\nMunro ve links munro: ' || jsonb_array_length(public.rm_app_branch_schedule_links('munro', null));
  r := r || E'\nMunro ve links dt: ' || jsonb_array_length(public.rm_app_branch_schedule_links('dt', null));
  r := r || E'\nMunro ve links por empresa: ' || jsonb_array_length(public.rm_app_branch_schedule_links(null, '539ef513-a865-4f8d-b6ed-160af88a066c'));
  -- modificar
  perform public.rm_app_set_branch_schedule_link('munro', good);
  r := r || E'\nMunro modificó: ' || (public.rm_app_branch_schedule_links('munro', null)->0->>'url');
  -- borrar (quitar enlace)
  perform public.rm_app_set_branch_schedule_link('munro', null);
  r := r || E'\nMunro quitó: url=' || coalesce(public.rm_app_branch_schedule_links('munro', null)->0->>'url', 'null');
  -- agregar de nuevo
  perform public.rm_app_set_branch_schedule_link('munro', good);
  r := r || E'\nMunro agregó: ' || (public.rm_app_branch_schedule_links('munro', null)->0->>'url');
  -- URL inválida
  begin perform public.rm_app_set_branch_schedule_link('munro', 'https://example.com/x'); r := r || E'\nFALLA: URL inválida aceptada';
  exception when others then r := r || E'\nOK URL inválida rechazada (' || sqlstate || ')'; end;
  -- otro local
  begin perform public.rm_app_set_branch_schedule_link('dt', good); r := r || E'\nFALLA: Munro editó Torcuato';
  exception when others then r := r || E'\nOK Munro no puede editar Torcuato (' || sqlstate || ')'; end;
  -- nada más de Empleados
  begin perform public.rm_app_users(); r := r || E'\nFALLA: Munro vio usuarios';
  exception when others then r := r || E'\nOK Munro sin rm_app_users (' || sqlstate || ')'; end;
  r := r || E'\nMunro schedule_permission view/edit empresa: ' || rm_test_private.schedule_permission('539ef513-a865-4f8d-b6ed-160af88a066c', 'view') || '/' || rm_test_private.schedule_permission('539ef513-a865-4f8d-b6ed-160af88a066c', 'edit');
  select count(*) into n from public.rm_test_documents; r := r || E'\nMunro filas visibles en rm_test_documents: ' || n;
  begin
    select count(*) into n from public.rm_app_directory;
    if n <> 0 then raise exception 'Gerente ve directorio de empleados'; end if;
    r := r || E'\nMunro filas visibles en rm_app_directory: ' || n;
  exception when insufficient_privilege then r := r || E'\nOK Munro sin acceso directo a rm_app_directory (42501)'; end;
  select count(*) into n from public.rm_schedules; r := r || E'\nMunro filas visibles en rm_schedules: ' || n;

  -- Torcuato
  perform set_config('request.jwt.claims', json_build_object('sub', torc, 'email', torc_mail, 'role', 'authenticated')::text, true);
  r := r || E'\nTorcuato locales: ' || rm_test_private.gestlok_gerente_locals()::text;
  r := r || E'\nTorcuato ve links dt/munro: ' || jsonb_array_length(public.rm_app_branch_schedule_links('dt', null)) || '/' || jsonb_array_length(public.rm_app_branch_schedule_links('munro', null));
  perform public.rm_app_set_branch_schedule_link('dt', good);
  r := r || E'\nTorcuato modificó dt: ' || (public.rm_app_branch_schedule_links('dt', null)->0->>'url');
  begin perform public.rm_app_set_branch_schedule_link('munro', good); r := r || E'\nFALLA: Torcuato editó Munro';
  exception when others then r := r || E'\nOK Torcuato no puede editar Munro (' || sqlstate || ')'; end;

  -- Dueña y creadora: no pasan por el puente de Gerente
  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', due_mail, 'role', 'authenticated')::text, true);
  r := r || E'\nDueña locales gerente: ' || rm_test_private.gestlok_gerente_locals()::text;
  begin perform public.gestlok_gerente_area_context(); r := r || E'\nFALLA: dueña con contexto de gerente';
  exception when others then r := r || E'\nOK dueña sin contexto de gerente (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_mail, 'role', 'authenticated')::text, true);
  r := r || E'\nCreadora locales gerente: ' || rm_test_private.gestlok_gerente_locals()::text;

  -- Token con correo ajeno (sub de Munro, correo de otra persona): sin acceso
  perform set_config('request.jwt.claims', json_build_object('sub', munro, 'email', torc_mail, 'role', 'authenticated')::text, true);
  r := r || E'\nSub de Munro con correo de Torcuato: ' || rm_test_private.gestlok_gerente_locals()::text;

  -- Anónimo
  perform set_config('role', 'anon', true);
  begin perform public.gestlok_gerente_area_context(); r := r || E'\nFALLA: anónimo con contexto';
  exception when others then r := r || E'\nOK anónimo rechazado (' || sqlstate || ')'; end;

  -- Módulo deshabilitado => el Gerente pierde el acceso
  perform set_config('role', 'postgres', true);
  update gestlok_platform.company_modules set enabled = false where tenant_id = tenant and module = 'recibos_personal';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', munro, 'email', munro_mail, 'role', 'authenticated')::text, true);
  r := r || E'\nMódulo apagado, Munro locales: ' || rm_test_private.gestlok_gerente_locals()::text;
  begin perform public.rm_app_set_branch_schedule_link('munro', good); r := r || E'\nFALLA: editó con módulo apagado';
  exception when others then r := r || E'\nOK sin módulo no edita (' || sqlstate || ')'; end;

  raise exception 'INFORME%', r;
end $t$;
