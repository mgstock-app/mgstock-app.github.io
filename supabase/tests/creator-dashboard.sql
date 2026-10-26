-- Inicio de la creadora: la función de resumen solo responde a kmu15lopez@gmail.com verificada.
-- Solo lee; el bloque termina con una excepción a propósito que devuelve el informe. No deja datos.
do $t$
declare
  r text := ''; v jsonb;
  cre uuid := 'c684640a-c594-44b7-a41f-bac07eef4c3b'; cre_mail text := 'kmu15lopez@gmail.com';
  due uuid := '85ff3a8f-ddff-417c-8ebc-f2d7b947a19c'; due_mail text := 'giselaopenheimer@hotmail.com';
  munro uuid := '35b524bb-bd78-4197-8716-e259de7e0821'; munro_mail text := 'grupointerno.munro@gmail.com';
begin
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
