-- Creadora: consulta de otras empresas en solo lectura (sesión de soporte).
-- Usa cuentas reales (resueltas por rol, sin datos personales en el repositorio) solo para LEER roles; todo se revierte (el bloque termina con una excepción a
-- propósito que devuelve el informe). Esperado: solo líneas OK; durante el soporte la creadora queda en «lectura».
do $t$
declare
  r text := ''; n int; m int; v jsonb; roles text;
  cre uuid; cre_m text;
  gis uuid; gis_m text;
  cam uuid; cam_m text;
  mun uuid; mun_m text;
  own uuid; per uuid;
  perloc text;
begin
  -- Cuentas resueltas por rol dentro de la base: el repositorio público no guarda correos ni IDs de personas.
  own := (select id from gestlok_tenancy.tenants where code = 'gestlok-original');
  per := (select id from gestlok_tenancy.tenants where code <> 'gestlok-original' order by created_at limit 1);
  select id into perloc from public.docs where col = 'locales' and tenant_id = per order by id limit 1;
  select a.user_id, lower(u.email) into cre, cre_m from gestlok_platform.admins a join auth.users u on u.id = a.user_id where u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into gis, gis_m from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (own) and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into cam, cam_m from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (per) and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into mun, mun_m from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (own) and d.data->>'rol' in ('gerente', 'editor') and d.data->'locales' ? 'munro' and not d.data->'locales' ? 'torcuato' and u.email_confirmed_at is not null order by u.created_at limit 1;
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
  v := public.gestlok_creator_open_company(per, 'revisión visual', 30); r := r || E'\nABRIÓ: ' || (v ? 'tenant_id')::text;
  r := r || E'\nSOPORTE: tenant_es_otra=' || (gestlok_tenancy.current_tenant_id() = per)::text || ' rol=' || public.mi_rol();
  select count(distinct tenant_id), count(*) into n, m from public.docs; r := r || E'\n  tenants_visibles=' || n || ' filas=' || m;
  r := r || E'\n  ve_munro=' || public.puede_ver_local('munro') || ' ve_perf=' || public.puede_ver_local(perloc) || ' edita_perf=' || public.puede_editar_local(perloc) || ' es_creadora=' || public.es_creadora();
  begin insert into public.docs(id, col, data, tenant_id) values ('x-soporte', perloc || '/productos', '{"a":1}'::jsonb, per); r := r || E'\n  FALLA: insertó producto';
  exception when others then r := r || E'\n  OK insertar producto bloqueado (' || sqlstate || ')'; end;
  update public.docs set data = data || '{"x":1}'::jsonb where tenant_id = per; get diagnostics n = row_count; r := r || E'\n  update filas afectadas=' || n;
  begin insert into public.docs(id, col, data, tenant_id) values ('x-equipo', 'equipo', jsonb_build_object('email', cre_m, 'rol', 'creadora'), per); r := r || E'\n  FALLA: se agregó al equipo';
  exception when others then r := r || E'\n  OK no puede agregarse al equipo (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cam, 'email', cam_m, 'role', 'authenticated')::text, true);
  r := r || E'\nDueña de la otra empresa durante soporte: rol=' || public.mi_rol() || ' ve_munro=' || public.puede_ver_local('munro');
  perform set_config('request.jwt.claims', json_build_object('sub', mun, 'email', mun_m, 'role', 'authenticated')::text, true);
  r := r || E'\nMunro durante soporte: rol=' || public.mi_rol() || ' ve_perf=' || public.puede_ver_local(perloc);
  perform set_config('role', 'anon', true);
  begin perform public.gestlok_creator_support_state(); r := r || E'\nFALLA: anónimo'; exception when others then r := r || E'\nOK anónimo rechazado (' || sqlstate || ')'; end;
  perform set_config('role', 'postgres', true);
  update gestlok_platform.creator_support_sessions set expires_at = now() - interval '1 minute' where user_id = cre and revoked_at is null;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_m, 'role', 'authenticated')::text, true);
  r := r || E'\nVENCIDA: tenant_es_propia=' || (gestlok_tenancy.current_tenant_id() = own)::text || ' rol=' || public.mi_rol();
  perform public.gestlok_creator_open_company(per, 'otra revisión', 15);
  perform public.gestlok_creator_close_company();
  r := r || E'\nCERRADA: rol=' || public.mi_rol();
  raise exception 'INFORME%', r;
end $t$;
