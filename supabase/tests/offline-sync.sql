-- Pruebas del envío de cambios sin conexión. Correr DENTRO de una transacción junto con la
-- migración y revertir al final (todos los datos son ficticios y no queda nada guardado).
do $test$
declare
  admin_id uuid; owner_id uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  company jsonb; tenant uuid; local text; v_col text; op jsonb; first jsonb; again jsonb; actual jsonb;
  id1 uuid := gen_random_uuid(); failed boolean; msg text; n int;
begin
  select user_id into admin_id from gestlok_platform.admins order by user_id limit 1;
  insert into auth.users(id, email, email_confirmed_at) values
    (owner_id, 'offline-owner@example.invalid', now()), (stranger, 'offline-stranger@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'email', (select u.email from auth.users u where u.id = admin_id), 'role', 'authenticated')::text, true);
  company := public.gestlok_creator_prepare_company('Offline ficticia', 'offline-owner@example.invalid', 'fisica', 'Local de prueba');
  tenant := (company->>'tenant_id')::uuid; local := company->>'local_id'; v_col := local || '/productos';

  -- Desde acá, todo corre como la dueña ficticia y con el rol «authenticated» (RLS activo).
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'email', 'offline-owner@example.invalid', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if public.gestlok_sync_context()->>'tenant' is distinct from tenant::text then raise exception 'FAIL contexto'; end if;

  -- 1. Alta (upsert) y reintento con el mismo id: un único registro y la misma respuesta.
  op := jsonb_build_object('kind','table','table','docs','method','POST','mode','upsert','rows', jsonb_build_array(jsonb_build_object(
    'key', jsonb_build_object('col', v_col, 'id', 'p-offline'),
    'body', jsonb_build_object('col', v_col, 'id', 'p-offline', 'data', '{"nombre":"Producto ficticio","stock":2,"temp":1}'::jsonb))));
  first := public.gestlok_sync_apply(id1, tenant, op);
  again := public.gestlok_sync_apply(id1, tenant, op);
  if first is distinct from again then raise exception 'FAIL reintento cambió la respuesta'; end if;
  select count(*) into n from public.docs where docs.col = v_col and docs.id = 'p-offline';
  if n <> 1 then raise exception 'FAIL duplicado (%)', n; end if;
  failed := false;
  begin perform public.gestlok_sync_apply(id1, tenant, op || '{"x":1}'); exception when others then failed := true; end;
  if not failed then raise exception 'FAIL id reutilizado con otro contenido'; end if;

  -- 2. doc_update (misma función que usa la app) conserva los demás campos.
  perform public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','rpc','name','doc_update','args',
    jsonb_build_object('p_col', v_col, 'p_id', 'p-offline', 'p_patch', '{"stock":5}'::jsonb)));
  select data into actual from public.docs where docs.col = v_col and docs.id = 'p-offline';
  if actual->>'stock' <> '5' or actual->>'nombre' <> 'Producto ficticio' then raise exception 'FAIL doc_update %', actual; end if;

  -- 3. PATCH con solo los campos cambiados: no pisa lo que cambió otra persona.
  update public.docs set data = data || '{"nombre":"Cambio desde otro equipo"}' where docs.col = v_col and docs.id = 'p-offline';
  perform public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','table','table','docs','method','PATCH','rows', jsonb_build_array(
    jsonb_build_object('key', jsonb_build_object('col', v_col, 'id', 'p-offline'), 'body', '{}'::jsonb,
      'data_merge', jsonb_build_object('set', '{"stock":7}'::jsonb, 'unset', '["temp"]'::jsonb)))));
  select data into actual from public.docs where docs.col = v_col and docs.id = 'p-offline';
  if actual->>'stock' <> '7' or actual->>'nombre' <> 'Cambio desde otro equipo' or actual ? 'temp' then raise exception 'FAIL merge %', actual; end if;

  -- 4. PATCH sobre algo inexistente queda para revisión.
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','rpc','name','doc_update','args', jsonb_build_object('p_col', v_col, 'p_id', 'no-existe', 'p_patch', '{"stock":1}'::jsonb)));
  exception when others then failed := sqlerrm like 'SYNC_MISSING%'; end;
  if not failed then raise exception 'FAIL cambio sobre registro inexistente'; end if;

  -- 5. Permisos: no se puede escribir en el local de otra empresa ni con otra empresa declarada.
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','table','table','docs','method','POST','mode','upsert','rows', jsonb_build_array(jsonb_build_object(
      'key', jsonb_build_object('col', 'munro/productos', 'id', 'intruso'), 'body', jsonb_build_object('col', 'munro/productos', 'id', 'intruso', 'data', '{}'::jsonb)))));
  exception when others then failed := true; end;
  if not failed then raise exception 'FAIL escribió en otra empresa'; end if;
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), gen_random_uuid(), op); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL aceptó otra empresa'; end if;

  -- 6. Solo funciones y columnas permitidas.
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), tenant, '{"kind":"rpc","name":"gestlok_creator_set_module","args":{}}'); exception when others then failed := sqlerrm like 'SYNC_UNSUPPORTED%'; end;
  if not failed then raise exception 'FAIL función no permitida'; end if;
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','table','table','docs','method','POST','rows', jsonb_build_array(jsonb_build_object(
      'key', jsonb_build_object('col', v_col, 'id', 'x'), 'body', jsonb_build_object('col', v_col, 'id', 'x', 'tenant_hack', 1)))));
  exception when others then failed := sqlerrm like 'SYNC_COLUMN%'; end;
  if not failed then raise exception 'FAIL columna inexistente'; end if;
  failed := false;
  begin perform public.gestlok_sync_apply(gen_random_uuid(), tenant, '{"kind":"table","table":"gestlok_platform_admins","method":"POST","rows":[]}'); exception when others then failed := sqlerrm like 'SYNC_UNSUPPORTED%'; end;
  if not failed then raise exception 'FAIL tabla no permitida'; end if;

  -- 7. Función sin resultado (void) con argumentos con nombre.
  first := public.gestlok_sync_apply(gen_random_uuid(), tenant, jsonb_build_object('kind','rpc','name','rm_app_set_branch_schedule_link','args',
    jsonb_build_object('p_local', local, 'p_url', 'https://docs.google.com/spreadsheets/d/FICTICIO_123/edit')));
  if first is distinct from 'null'::jsonb then raise exception 'FAIL void %', first; end if;

  -- 8. Otra cuenta no ve los recibos ni puede reutilizarlos.
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'email', 'offline-stranger@example.invalid', 'role', 'authenticated')::text, true);
  failed := false;
  begin perform public.gestlok_sync_apply(id1, tenant, op); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL otra cuenta usó el recibo'; end if;
  begin perform count(*) from gestlok_sync_private.receipts; raise exception 'FAIL recibos visibles'; exception when insufficient_privilege then null; end;

  -- 9. Sin sesión no hay acceso.
  perform set_config('role', 'anon', true);
  failed := false;
  begin perform public.gestlok_sync_context(); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL anónimo'; end if;

  perform set_config('role', 'postgres', true);
  select count(*) into n from gestlok_sync_private.receipts where user_id = owner_id;
  if n <> 4 then raise exception 'FAIL recibos esperados 4, hay %', n; end if;
  raise notice 'OK offline-sync';
end $test$;
