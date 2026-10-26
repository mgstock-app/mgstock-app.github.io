-- Creadora: consulta de otras empresas en solo lectura (sesión de soporte).
-- Usa cuentas reales solo para LEER roles; todo se revierte (el bloque termina con una excepción a
-- propósito que devuelve el informe). Esperado: ver supabase/tests/creator-support.esperado.txt
do $t$
declare
  r text := ''; n int; m int; v jsonb; roles text;
  cre uuid := 'c684640a-c594-44b7-a41f-bac07eef4c3b'; cre_m text := 'kmu15lopez@gmail.com';
  gis uuid := '85ff3a8f-ddff-417c-8ebc-f2d7b947a19c'; gis_m text := 'giselaopenheimer@hotmail.com';
  cam uuid := '8ddf2c6c-8d62-44de-8ce8-27eb5759daa3'; cam_m text := 'camilab.lopez99@gmail.com';
  mun uuid := '35b524bb-bd78-4197-8716-e259de7e0821'; mun_m text := 'grupointerno.munro@gmail.com';
  own uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'; per uuid := '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
  perloc text := 'loc-2a97bf8d7d084aa7b051';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', gis, 'email', gis_m, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_creator_open_company(per, 'prueba', 30); r := r || E'\nFALLA: dueña abrió soporte';
  exception when others then r := r || E'\nOK dueña no puede abrir soporte (' || sqlstate || ')'; end;
  begin insert into gestlok_platform.creator_support_sessions(user_id, tenant_id, reason, expires_at) values (gis, per, 'xxx', now() + interval '1 hour'); r := r || E'\nFALLA: insert directo';
  exception when others then r := r || E'\nOK insert directo bloqueado (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_m, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_creator_open_company(per, 'ab', 30); r := r || E'\nFALLA: motivo corto'; exception when others then r := r || E'\nOK motivo corto rechazado (' || sqlstate || ')'; end;
  begin perform public.gestlok_creator_open_company(per, 'revisión visual', 500); r := r || E'\nFALLA: duración larga'; exception when others then r := r || E'\nOK duración larga rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_creator_open_company(own, 'revisión visual', 30); r := r || E'\nFALLA: propia empresa'; exception when others then r := r || E'\nOK propia empresa rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_creator_open_company(gen_random_uuid(), 'revisión visual', 30); r := r || E'\nFALLA: inexistente'; exception when others then r := r || E'\nOK empresa inexistente rechazada (' || sqlstate || ')'; end;
  v := public.gestlok_creator_open_company(per, 'revisión visual', 30); r := r || E'\nABRIÓ: ' || v::text;
  r := r || E'\nSOPORTE: tenant=' || (gestlok_tenancy.current_tenant_id())::text || ' rol=' || public.mi_rol() || ' acceso=' || (public.mi_acceso())::text;
  select count(distinct tenant_id), count(*) into n, m from public.docs; r := r || E'\n  tenants_visibles=' || n || ' filas=' || m;
  r := r || E'\n  ve_munro=' || public.puede_ver_local('munro') || ' ve_perf=' || public.puede_ver_local(perloc) || ' edita_perf=' || public.puede_editar_local(perloc) || ' es_creadora=' || public.es_creadora();
  begin insert into public.docs(id, col, data, tenant_id) values ('x-soporte', perloc || '/productos', '{"a":1}'::jsonb, per); r := r || E'\n  FALLA: insertó producto';
  exception when others then r := r || E'\n  OK insertar producto bloqueado (' || sqlstate || ')'; end;
  update public.docs set data = data || '{"x":1}'::jsonb where tenant_id = per; get diagnostics n = row_count; r := r || E'\n  update filas afectadas=' || n;
  begin insert into public.docs(id, col, data, tenant_id) values ('x-equipo', 'equipo', '{"email":"kmu15lopez@gmail.com","rol":"creadora"}'::jsonb, per); r := r || E'\n  FALLA: se agregó al equipo';
  exception when others then r := r || E'\n  OK no puede agregarse al equipo (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cam, 'email', cam_m, 'role', 'authenticated')::text, true);
  r := r || E'\nCamila durante soporte: rol=' || public.mi_rol() || ' ve_munro=' || public.puede_ver_local('munro');
  perform set_config('request.jwt.claims', json_build_object('sub', mun, 'email', mun_m, 'role', 'authenticated')::text, true);
  r := r || E'\nMunro durante soporte: rol=' || public.mi_rol() || ' ve_perf=' || public.puede_ver_local(perloc);
  perform set_config('role', 'anon', true);
  begin perform public.gestlok_creator_support_state(); r := r || E'\nFALLA: anónimo'; exception when others then r := r || E'\nOK anónimo rechazado (' || sqlstate || ')'; end;
  perform set_config('role', 'postgres', true);
  update gestlok_platform.creator_support_sessions set expires_at = now() - interval '1 minute' where user_id = cre and revoked_at is null;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_m, 'role', 'authenticated')::text, true);
  r := r || E'\nVENCIDA: tenant=' || (gestlok_tenancy.current_tenant_id())::text || ' rol=' || public.mi_rol();
  perform public.gestlok_creator_open_company(per, 'otra revisión', 15);
  perform public.gestlok_creator_close_company();
  r := r || E'\nCERRADA: rol=' || public.mi_rol() || ' estado=' || (public.gestlok_creator_support_state())::text;
  raise exception 'INFORME%', r;
end $t$;
