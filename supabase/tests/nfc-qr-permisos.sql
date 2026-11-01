-- NFC y QR: solo la creadora verificada lista, crea y edita placas; cualquiera puede resolver un código.
-- El bloque termina con una excepción a propósito que devuelve el informe: no deja placas ni escaneos.
do $t$
declare
  r text := ''; v jsonb; d text; c1 text; c2 text; fb text;
  cre uuid; cre_mail text;
  due uuid; due_mail text;
begin
  select a.user_id, lower(u.email) into cre, cre_mail from gestlok_platform.admins a join auth.users u on u.id = a.user_id
    where u.email_confirmed_at is not null and lower(u.email) = 'kmu15lopez@gmail.com' limit 1;
  select u.id, lower(u.email) into due, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null
      and lower(u.email) <> 'kmu15lopez@gmail.com' order by u.created_at limit 1;
  select a.destino_sin_activar into fb from gestlok_nfc_private.ajustes a where a.id;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', cre, 'email', cre_mail, 'role', 'authenticated')::text, true);
  v := public.gestlok_nfc_create(2);
  r := r || E'\nCreadora creó ' || (v->>'creadas') || ' (' || (v->>'desde') || '-' || (v->>'hasta') || ')';
  v := public.gestlok_nfc_list();
  select x->>'code' into c1 from jsonb_array_elements(v->'placas') x where (x->>'numero')::int = (v->'placas'->-2->>'numero')::int;
  select x->>'code' into c2 from jsonb_array_elements(v->'placas') x where (x->>'numero')::int = (v->'placas'->-1->>'numero')::int;
  r := r || E'\nLista scope=' || (v->>'scope') || ' códigos válidos=' || ((c1 ~ '^[A-HJ-NP-Z2-9]{6}$') and (c2 ~ '^[A-HJ-NP-Z2-9]{6}$'))::text;
  v := public.gestlok_nfc_update(lower(c1), 'Cliente prueba', 'https://example.com/resenas', 'nota', true);
  r := r || E'\nEditada activa=' || (v->>'activa') || ' destino=' || (v->>'destino');
  begin perform public.gestlok_nfc_update(c2, 'x', 'javascript:alert(1)', '', false); r := r || E'\nFALLA: aceptó un link inválido';
  exception when others then r := r || E'\nOK link inválido rechazado (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_update(c2, 'x', '', '', true); r := r || E'\nFALLA: activó sin destino';
  exception when others then r := r || E'\nOK activar sin destino rechazado (' || sqlstate || ')'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', due_mail, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_nfc_list(); r := r || E'\nFALLA: dueña vio las placas';
  exception when others then r := r || E'\nOK dueña rechazada (' || sqlstate || ')'; end;
  begin perform public.gestlok_nfc_update(c1, 'x', 'https://example.org', '', true); r := r || E'\nFALLA: dueña editó';
  exception when others then r := r || E'\nOK dueña no edita (' || sqlstate || ')'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', due, 'email', cre_mail, 'role', 'authenticated')::text, true);
  begin perform public.gestlok_nfc_create(1); r := r || E'\nFALLA: token con correo ajeno';
  exception when others then r := r || E'\nOK token con correo ajeno rechazado (' || sqlstate || ')'; end;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin perform public.gestlok_nfc_list(); r := r || E'\nFALLA: anónimo vio las placas';
  exception when others then r := r || E'\nOK anónimo sin lista (' || sqlstate || ')'; end;
  d := public.gestlok_nfc_resolve(c1);
  r := r || E'\nAnónimo resuelve activa -> ' || (d = 'https://example.com/resenas')::text;
  d := public.gestlok_nfc_resolve(c2);
  r := r || E'\nAnónimo resuelve sin activar -> respaldo ' || (d = fb)::text;
  d := public.gestlok_nfc_resolve('<script>');
  r := r || E'\nCódigo inválido -> respaldo ' || (d = fb)::text;

  perform set_config('role', 'postgres', true);
  select p.escaneos::text into d from gestlok_nfc_private.placas p where p.code = c1;
  r := r || E'\nEscaneos contados=' || d || ' registro=' || (select count(*) from gestlok_nfc_private.escaneos e where e.code in (c1, c2));
  raise exception 'INFORME%', r;
end $t$;
