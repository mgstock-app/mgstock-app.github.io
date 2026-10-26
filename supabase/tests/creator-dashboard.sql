-- Inicio de la creadora: la función de resumen solo responde a la administradora registrada y verificada.
-- Solo lee; el bloque termina con una excepción a propósito que devuelve el informe. No deja datos.
do $t$
declare
  r text := ''; v jsonb;
  cre uuid; cre_mail text;
  due uuid; due_mail text;
  munro uuid; munro_mail text;
begin
  -- Cuentas resueltas por rol dentro de la base: el repositorio público no guarda correos ni IDs de personas.
  select a.user_id, lower(u.email) into cre, cre_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id where u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into due, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (select id from gestlok_tenancy.tenants where code = 'gestlok-original') and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null order by u.created_at limit 1;
  select u.id, lower(u.email) into munro, munro_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = (select id from gestlok_tenancy.tenants where code = 'gestlok-original') and d.data->>'rol' in ('gerente', 'editor') and d.data->'locales' ? 'munro' and not d.data->'locales' ? 'torcuato' and u.email_confirmed_at is not null order by u.created_at limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_mail, 'role', 'authenticated')::text, true);
  v := public.gestlok_creator_dashboard();
  r := r || E'\nCreadora scope=' || (v->>'scope') || ' empresas=' || (v->'totals'->>'companies') || ' usuarios=' || (v->'totals'->>'users')
         || ' serie=' || jsonb_array_length(v->'series') || ' sin recibos=' || (not (v::text ~* 'sueldo|salary|recibo_id'))::text;
  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', due_mail, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_creator_dashboard(); r := r || E'\nFALLA: dueña vio el panel';
  exception when others then r := r || E'\nOK dueña rechazada (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', munro, 'email', munro_mail, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_creator_dashboard(); r := r || E'\nFALLA: gerente vio el panel';
  exception when others then r := r || E'\nOK gerente rechazado (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', munro, 'email', cre_mail, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_creator_dashboard(); r := r || E'\nFALLA: token con correo ajeno';
  exception when others then r := r || E'\nOK token con correo ajeno rechazado (' || sqlstate || ')'; end;
  perform set_config('role', 'anon', true);
  begin perform public.gestlok_creator_dashboard(); r := r || E'\nFALLA: anónimo';
  exception when others then r := r || E'\nOK anónimo rechazado (' || sqlstate || ')'; end;
  raise exception 'INFORME%', r;
end $t$;
