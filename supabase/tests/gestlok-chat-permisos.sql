-- GESTLOK Chat: aislamiento entre empresas y sucursales, permisos por rol, pedidos y seguridad.
-- Corre sobre PostgreSQL local/CI (tests/fixtures/chat/base.sql + migración). Termina SIEMPRE con la excepción
-- «INFORME» para deshacer todo. Cada línea empieza con OK o FALLA; la prueba pasa si no hay ninguna FALLA.
create function public.prueba_como(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  if p_email is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    return;
  end if;
  if p_email = 'service_role' then
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    return;
  end if;
  perform set_config('role', 'postgres', true);
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
-- Ejecuta una consulta y devuelve 'ok:<resultado>' o 'error:<código>:<mensaje>'.
create function public.prueba_q(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return 'ok:' || coalesce(v, '');
exception when others then
  return 'error:' || sqlstate || ':' || sqlerrm;
end $$;
grant execute on function public.prueba_como(text), public.prueba_q(text) to anon, authenticated, service_role;

do $t$
declare
  r text := ''; v text; n integer; j jsonb;
  ta uuid := 'a0000000-0000-4000-8000-00000000000a'; tb uuid := 'b0000000-0000-4000-8000-00000000000b';
  s_munro uuid; s_torc uuid; s_centro uuid; cat uuid; p_emp uuid; p_pizza uuid; p_torc uuid; p_b uuid; p_pack uuid; h9 bytea := digest('token-cliente-9', 'sha256'); conv9 uuid;
  h1 bytea := digest('token-cliente-1', 'sha256'); h2 bytea := digest('token-cliente-2', 'sha256');
  h3 bytea := digest('token-cliente-3', 'sha256'); hb bytea := digest('token-cliente-b', 'sha256');
  conv1 uuid; conv2 uuid; conv3 uuid; convb uuid; ped1 uuid; ticket1 uuid; ver integer;
  pizza_ok text;
  procedure_ok boolean;
begin
  -- Estructura y privilegios ----------------------------------------------------------------------------------
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'gestlok_chat_private' and c.relkind = 'r' and not c.relrowsecurity;
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' RLS activa en todas las tablas (' || n || ' sin RLS)';
  select count(*) into n from information_schema.role_table_grants g
   where g.table_schema = 'gestlok_chat_private' and g.grantee in ('anon','authenticated','PUBLIC');
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' tablas sin permisos para la app (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'gestlok_chat_private'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute'));
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' funciones internas no ejecutables desde afuera (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'gestlok\_chat\_%' and has_function_privilege('anon', p.oid, 'execute');
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' anónimo no ejecuta ninguna función del chat (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'gestlok\_chat\_srv\_%'
     and (has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'));
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' funciones del público solo para la función segura (' || n || ')';
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname like 'gestlok\_chat\_%'
     and (not p.prosecdef or not ('search_path=""' = any(coalesce(p.proconfig, '{}'))));
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' funciones públicas con search_path vacío (' || n || ')';

  -- Alta de empresas (solo creadora) ---------------------------------------------------------------------------
  perform prueba_como('duena.a@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('a0000000-0000-4000-8000-00000000000a', 'Empresa A', '[{"local_id":"munro","slug":"empa-munro","nombre":"Munro"}]')::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' una dueña no puede habilitar el módulo · ' || left(v, 60);
  perform prueba_como('creadora@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('a0000000-0000-4000-8000-00000000000a', 'Empresa A', '[{"local_id":"centro","slug":"robado","nombre":"X"}]')::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' no se puede usar un local de otra empresa · ' || left(v, 60);
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('a0000000-0000-4000-8000-00000000000a', 'Empresa A',
      '[{"local_id":"munro","slug":"empa-munro","nombre":"Munro","prefijo":"MM"},{"local_id":"torcuato","slug":"empa-torcuato","nombre":"Don Torcuato","prefijo":"MT"}]')::text $q$);
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' creadora habilita empresa A · ' || left(v, 60);
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('b0000000-0000-4000-8000-00000000000b', 'Empresa B', '[{"local_id":"centro","slug":"empb-centro","nombre":"Centro","prefijo":"BC"}]')::text $q$);
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' creadora habilita empresa B · ' || left(v, 60);
  perform set_config('role', 'postgres', true);
  select id into s_munro from gestlok_chat_private.sucursales where slug = 'empa-munro';
  select id into s_torc from gestlok_chat_private.sucursales where slug = 'empa-torcuato';
  select id into s_centro from gestlok_chat_private.sucursales where slug = 'empb-centro';
  select count(*) into n from gestlok_chat_private.sucursales where activa;
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' las sucursales nacen apagadas';

  -- Panel: quién ve qué ----------------------------------------------------------------------------------------
  perform prueba_como('duena.a@prueba.example');
  j := public.gestlok_chat_panel_inicio();
  r := r || E'\n' || case when jsonb_array_length(j->'sucursales') = 2 then 'OK' else 'FALLA' end || ' dueña A ve sus 2 sucursales';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_inicio();
  r := r || E'\n' || case when jsonb_array_length(j->'sucursales') = 1 and j->'sucursales'->0->>'nombre' = 'Munro'
    and j->'sucursales'->0->>'nivel' = 'configurar' and j->'sucursales'->0->>'local_id' = 'munro' then 'OK' else 'FALLA' end || ' gerente de Munro ve solo Munro';
  perform prueba_como('colaborador.a@prueba.example');
  j := public.gestlok_chat_panel_inicio();
  r := r || E'\n' || case when jsonb_array_length(j->'sucursales') = 0 then 'OK' else 'FALLA' end || ' colaborador no ve sucursales';
  perform prueba_como('duena.b@prueba.example');
  j := public.gestlok_chat_panel_inicio();
  r := r || E'\n' || case when j->>'empresa' = 'Empresa B' and jsonb_array_length(j->'sucursales') = 1 then 'OK' else 'FALLA' end || ' dueña B ve solo su empresa';
  v := prueba_q(format('select public.gestlok_chat_panel_config(%L)::text', s_munro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' dueña B no lee la configuración de A';
  perform prueba_como('sinverificar@prueba.example');
  v := prueba_q(format('select public.gestlok_chat_panel_pedidos(%L)::text', s_munro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' correo sin verificar no entra';
  perform prueba_como(null);
  v := prueba_q('select public.gestlok_chat_panel_inicio()::text');
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' anónimo no entra al panel';

  -- Configuración (dueña) ---------------------------------------------------------------------------------------
  perform prueba_como('gerente.munro@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"activa":true}', 1)::text $q$, s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Munro no abre chat de Torcuato';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"ia_instrucciones":"Hola","envio_costo":0}', 999)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:40001%' then 'OK' else 'FALLA' end || ' gerente puede configurar pero respeta versiones';
  perform prueba_como('duena.a@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L,
     '{"activa":true,"acepta_envio":true,"envio_costo":500,"pedido_minimo":1500,"medios_pago":["efectivo","transferencia"],"bienvenida":"Hola"}', 1)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' dueña configura Munro · ' || left(v, 60);
  -- Regresión CHECK 23514: al quitar un pago global se actualizan retiro y envío.
  -- Se prueba dentro de una subtransacción que revierte TODAS las escrituras de este escenario.
  procedure_ok := false;
  begin
    perform set_config('role', 'postgres', true);
    update gestlok_chat_private.sucursales
      set medios_pago_retiro = array['efectivo','transferencia'],
          medios_pago_envio = array['transferencia']
      where id = s_munro;
    perform prueba_como('duena.a@prueba.example');
    v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(
      %L, '{"medios_pago":["efectivo"]}', 2)::text $q$, s_munro));
    if v like 'ok:%' then
      perform set_config('role', 'postgres', true);
      select medios_pago = array['efectivo']::text[]
         and medios_pago_retiro = array['efectivo']::text[]
         and medios_pago_envio = array['efectivo']::text[]
        into procedure_ok
        from gestlok_chat_private.sucursales where id=s_munro;
    end if;
    raise exception 'revertir prueba aislada de pagos' using errcode='ZX001';
  exception when sqlstate 'ZX001' then
    r := r || E'\n' || case when procedure_ok then 'OK' else 'FALLA' end
      || ' retirar medios globales mantiene retiro/envío consistentes · ' || left(v, 45);
  end;
  perform prueba_como('duena.a@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"horario":"x"}', 1)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:40001%' then 'OK' else 'FALLA' end || ' versión vieja no pisa cambios';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"medios_pago":["bitcoin"]}', 2)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:%' then 'OK' else 'FALLA' end || ' medio de pago desconocido rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"ia_nombre":"Sofi","ia_instrucciones":"Tono cálido","ia_info":"Tenemos opciones sin TACC","mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","rechazado":"   "}}', 2)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' dueña configura mensajes e instrucciones de la IA · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config(%L)->'mensajes' ? 'rechazado' $q$, s_munro));
  r := r || E'\n' || case when v = 'ok:false' then 'OK' else 'FALLA' end || ' un mensaje vacío vuelve al texto sugerido';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"hackeo":"x"}}', 3)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:%' then 'OK' else 'FALLA' end || ' clave de mensaje desconocida rechazada';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, jsonb_build_object('mensajes', jsonb_build_object('recibido', repeat('x', 601))), 3)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:%' then 'OK' else 'FALLA' end || ' mensaje demasiado largo rechazado';
  perform prueba_como('gerente.munro@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"ia_instrucciones":"Tono cálido","bienvenida":"Hola","mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","despedida":"¡Gracias por elegirnos!"}}', 3)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro edita los mensajes del bot · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L,
    '{"horario":"11:00 a 14:40 / 19:00 a 23:15","envio_costo":500}', 4)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente puede editar ajustes completos de su local';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"recibido":"x"}}', 1)::text $q$, s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Munro no edita los mensajes de Torcuato';

  -- Reseña y cierre al terminar el pedido ---------------------------------------------------------------------
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","despedida":"¡Gracias por elegirnos!","resena_url":"https://g.page/r/CT9jkvArEGhFEBM/review","resena":"Cuéntenos su experiencia","cierre":"¡Gracias por elegirnos!"}}', 5)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente carga el link de reseñas de Google y el cierre · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"resena_url":"https://g.page.estafa.example/review"}}', 6)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' link de reseñas que no es de Google rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"resena_url":"http://g.page/r/x"}}', 6)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' link de reseñas sin https rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","despedida":"¡Gracias por elegirnos!"}}', 6)::text $q$, s_munro));
  v := prueba_q(format($q$ select (public.gestlok_chat_panel_config(%L)->'mensajes')::text $q$, s_munro));
  r := r || E'\n' || case when v like '%"resena_url": "https://g.page/r/CT9jkvArEGhFEBM/review"%' and v like '%"cierre": "¡Gracias por elegirnos!"%'
    and v like '%Recibimos tu pedido {codigo}%' then 'OK' else 'FALLA' end || ' guardar desde un panel anterior no borra la reseña ni el cierre';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","despedida":"¡Gracias por elegirnos!","resena_url":"","resena":"","cierre":"¡Gracias por elegirnos!"}}', 7)::text $q$, s_munro));
  v := prueba_q(format($q$ select (public.gestlok_chat_panel_config(%L)->'mensajes' ? 'resena_url')::text $q$, s_munro));
  r := r || E'\n' || case when v = 'ok:false' then 'OK' else 'FALLA' end || ' borrar el link deja de ofrecer la reseña';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"sugerencia":"¿Le sumamos un postre o una bebida?"}}', 8)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente edita la pregunta de la venta sugerida · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"mensajes":{"recibido":"Recibimos tu pedido {codigo}","terminado_retiro":"Listo {codigo}, pasá a buscarlo","pausado":"Volvemos a las 19","despedida":"¡Gracias por elegirnos!"}}', 9)::text $q$, s_munro));
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config(%L)->'mensajes'->>'sugerencia' $q$, s_munro));
  r := r || E'\n' || case when v = 'ok:¿Le sumamos un postre o una bebida?' then 'OK' else 'FALLA' end || ' un panel anterior no borra la venta sugerida';
  perform set_config('role', 'postgres', true);
  r := r || E'\n' || case when not gestlok_chat_private.mensajes_validos('{"resena_url":"https://evil.example/x"}')
      and gestlok_chat_private.mensajes_validos('{"resena_url":"https://maps.app.goo.gl/abc","cierre":"Gracias"}')
    then 'OK' else 'FALLA' end || ' la base solo guarda links de reseñas de Google';
  perform prueba_como('duena.a@prueba.example');

  -- Catálogo ---------------------------------------------------------------------------------------------------
  v := prueba_q(format($q$ select public.gestlok_chat_panel_categoria_guardar(%L, null, 'Empanadas', 1, true)->>'id' $q$, s_munro));
  cat := substr(v, 4)::uuid;
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, jsonb_build_object('nombre','Empanada de carne','precio',1000,'categoria_id',%L))->>'id' $q$, s_munro, cat));
  p_emp := substr(v, 4)::uuid;
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Pizza","precio":3000,"opciones":[
     {"id":"tam","nombre":"Tamaño","tipo":"una","obligatorio":true,"valores":[{"id":"chica","nombre":"Chica"},{"id":"grande","nombre":"Grande","extra":2000}]},
     {"id":"ext","nombre":"Extras","tipo":"varias","max":2,"valores":[{"id":"acei","nombre":"Aceitunas","extra":300},{"id":"huevo","nombre":"Huevo","extra":400},{"id":"jam","nombre":"Jamón","extra":500}]}]}')->>'id' $q$, s_munro));
  pizza_ok := v; p_pizza := case when v like 'ok:%' then substr(v, 4)::uuid end;
  r := r || E'\n' || case when p_emp is not null and p_pizza is not null then 'OK' else 'FALLA' end || ' dueña carga productos con opciones · ' || left(pizza_ok, 50);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Mala","precio":10,"opciones":[{"id":"X Y","nombre":"a","tipo":"una","valores":[]}]}')::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:%' then 'OK' else 'FALLA' end || ' opciones mal armadas rechazadas';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Gratis","precio":0}')::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:%' then 'OK' else 'FALLA' end || ' precio cero rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Tarta","precio":2500}')->>'id' $q$, s_torc));
  p_torc := substr(v, 4)::uuid;
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Intruso","precio":100}')::text $q$, s_centro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' dueña A no carga productos en la empresa B';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, jsonb_build_object('nombre','Cruzado','precio',100,'categoria_id',%L))::text $q$, s_torc, cat));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' no se usa una categoría de otra sucursal';
  perform prueba_como('duena.b@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Sanguche","precio":1500}')->>'id' $q$, s_centro));
  p_b := substr(v, 4)::uuid;
  v := prueba_q(format($q$ select public.gestlok_chat_panel_config_guardar(%L, '{"activa":true}', 1)::text $q$, s_centro));
  v := prueba_q(format($q$ select public.gestlok_chat_panel_catalogo(%L)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' dueña B no ve el catálogo de A';

  perform prueba_como('gerente.munro@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Del gerente","precio":100,"activo":false}')::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro carga productos · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, jsonb_build_object('id',%L,'nombre','Empanada de carne','precio',1000,'descripcion','Cortada a cuchillo','categoria_id',%L))::text $q$, s_munro, p_emp, cat));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro edita producto y precio · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_categoria_guardar(%L, null, 'Bebidas', 5, true)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro crea categorías · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_producto_guardar(%L, '{"nombre":"Del gerente","precio":100}')::text $q$, s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Munro no carga productos en Torcuato';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_disponible(%L, false)::text $q$, p_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Munro no toca Torcuato';
  -- Botonera de stock: acción masiva, opción adicional y aislamiento estricto.
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_categoria(%L, %L, false)::text $q$, s_munro, cat));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente apaga una categoría propia';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_categoria(%L, %L, true)::text $q$, s_munro, cat));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente vuelve a encender sin perder productos';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_categoria(%L, %L, false)::text $q$, s_torc, cat));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente no apaga categoría de otra sucursal';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_adicional(%L, 'ext', 'acei', false)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente apaga adicional de su local';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_adicionales(%L)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' and v like '%"disponible": false%' then 'OK' else 'FALLA' end || ' adicional aparece agotado en botonera';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_adicional(%L, 'ext', 'acei', true)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente repone adicional sin cambiar precio';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_adicional(%L, 'ext', 'acei', false)::text $q$, s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente no apaga adicionales de Torcuato';
  perform prueba_como('colaborador.a@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_stock_categoria(%L, %L, false)::text $q$, s_munro, cat));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' colaborador no accede a la botonera';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_disponible(%L, false)::text $q$, p_emp));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' colaborador no marca agotado';

  -- Público (solo la función segura) ---------------------------------------------------------------------------
  perform prueba_como(null);
  v := prueba_q($q$ select public.gestlok_chat_srv_sucursal('empa-munro')::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' anónimo no llama directo a la base';
  perform prueba_como('duena.a@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_srv_sucursal('empa-munro')::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' una sesión de GESTLOK tampoco';
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_sucursal('empa-munro');
  r := r || E'\n' || case when (j->>'ok')::boolean and jsonb_array_length(j->'catalogo'->'productos') = 2
    and j->'sucursal'->>'bienvenida' = 'Hola' and not (j ? 'tenant_id') then 'OK' else 'FALLA' end || ' carta pública de Munro (2 productos)';
  r := r || E'\n' || case when j->'sucursal'->>'asistente' = 'Sofi' and not (j->'sucursal' ? 'ia_instrucciones')
    and j->'privado'->>'ia_instrucciones' = 'Tono cálido' and j->'privado'->'mensajes'->>'recibido' = 'Recibimos tu pedido {codigo}'
    then 'OK' else 'FALLA' end || ' instrucciones de la IA solo en la parte privada (para la función)';
  j := public.gestlok_chat_srv_sucursal('empa-torcuato');
  r := r || E'\n' || case when j->>'motivo' = 'pausado' and not (j ? 'privado') then 'OK' else 'FALLA' end || ' Torcuato apagada se muestra en pausa';
  j := public.gestlok_chat_srv_sucursal('no-existe');
  r := r || E'\n' || case when j->>'motivo' = 'no_existe' then 'OK' else 'FALLA' end || ' sucursal inexistente';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_conversacion(%L, %L::bytea, 'ip1')::text $q$, s_torc, h1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' no se chatea con una sucursal apagada';
  j := public.gestlok_chat_srv_conversacion(s_munro, h1, 'ip1'); conv1 := (j->>'id')::uuid;
  j := public.gestlok_chat_srv_conversacion(s_munro, h1, 'ip1');
  r := r || E'\n' || case when (j->>'id')::uuid = conv1 then 'OK' else 'FALLA' end || ' la conversación se retoma con el mismo token';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_conversacion(%L, %L::bytea, 'ip1')::text $q$, s_centro, h1));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' un token no salta a otra empresa';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_turno(%L, %L::bytea, 'ip1', 'hola', 'Hola, ¿qué te preparo?', '{"paso":"inicio"}')::text $q$, conv1, h1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' se guarda el turno';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_turno(%L, %L::bytea, 'ip1', 'hola', 'x', '{}')::text $q$, conv1, h2));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' token ajeno no escribe en la conversación';

  -- Pedidos: validaciones -----------------------------------------------------------------------------------------
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','11 5555-1234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1))))::text $q$, conv1, h1, p_b));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' producto de otra empresa rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones',jsonb_build_object('ext',jsonb_build_array('acei'))))))::text $q$, conv1, h1, p_pizza));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' falta una opción obligatoria';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones',jsonb_build_object('tam',jsonb_build_array('chica','grande'))))))::text $q$, conv1, h1, p_pizza));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' dos valores en una opción única rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones',jsonb_build_object('tam',jsonb_build_array('chica'),'ext',jsonb_build_array('acei','huevo','jam'))))))::text $q$, conv1, h1, p_pizza));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' más extras que el máximo rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',0))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' cantidad cero rechazada';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1.5))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' cantidad con decimales rechazada';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:P0001%' and v like '%mínimo%' then 'OK' else 'FALLA' end || ' pedido mínimo respetado · ' || left(v, 70);
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','envio','direccion','','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',2))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' envío sin dirección rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','credito',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',2))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' medio de pago no habilitado rechazado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','12','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',2))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' teléfono inválido rechazado';

  -- Promos y combos: «elegir N unidades» (cualquier rubro) ---------------------------------------------------------
  perform set_config('role', 'postgres', true);
  r := r || E'\n' || case when not gestlok_chat_private.opciones_validas('[{"id":"emp","nombre":"Empanadas","tipo":"cantidad","valores":[{"id":"a","nombre":"A"}]}]')
    then 'OK' else 'FALLA' end || ' una promo sin total es inválida';
  r := r || E'\n' || case when not gestlok_chat_private.opciones_validas('[{"id":"emp","nombre":"E","tipo":"cantidad","total":3,"valores":[{"id":"a","nombre":"A","producto_id":"x"}]}]')
    then 'OK' else 'FALLA' end || ' una variedad con producto_id mal formado es inválida';
  insert into gestlok_chat_private.productos(tenant_id, sucursal_id, nombre, precio, activo, opciones)
  select tenant_id, id, 'Pack 3 empanadas + 1 salsa', 3000, true, jsonb_build_array(
    jsonb_build_object('id','emp','nombre','Empanadas','tipo','cantidad','total',3,'obligatorio',true,'valores', jsonb_build_array(
      jsonb_build_object('id','carne','nombre','Carne','extra',0,'producto_id',p_emp), jsonb_build_object('id','humita','nombre','Humita','extra',0))),
    jsonb_build_object('id','salsa','nombre','Salsas','tipo','cantidad','total',1,'obligatorio',true,'valores', jsonb_build_array(
      jsonb_build_object('id','criolla','nombre','Criolla','extra',0), jsonb_build_object('id','ajo','nombre','Crema de ajo','extra',100))))
  from gestlok_chat_private.sucursales where id = s_munro returning id into p_pack;
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_conversacion(s_munro, h9, 'ip9'); conv9 := (j->>'id')::uuid;
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones','{"emp":{"carne":2},"salsa":{"criolla":1}}'::jsonb))))::text $q$, conv9, h9, p_pack));
  r := r || E'\n' || case when v like 'error:22023%' and v like '%elegí 3 (elegiste 2)%' then 'OK' else 'FALLA' end || ' promo incompleta rechazada · ' || left(v, 80);
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones','{"emp":{"carne":2,"pollo":1},"salsa":{"criolla":1}}'::jsonb))))::text $q$, conv9, h9, p_pack));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' variedad que no está en la promo rechazada';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones','{"emp":["carne","humita"],"salsa":{"criolla":1}}'::jsonb))))::text $q$, conv9, h9, p_pack));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' promo mandada como lista rechazada';
  j := public.gestlok_chat_srv_sucursal('empa-munro');
  r := r || E'\n' || case when (select count(*) from jsonb_array_elements(j->'catalogo'->'productos') x where x->>'nombre' = 'Pack 3 empanadas + 1 salsa'
      and jsonb_array_length(x->'opciones'->0->'valores') = 2) = 1 then 'OK' else 'FALLA' end || ' la carta pública ofrece las variedades de la promo';
  -- Pedido correcto (se deshace al final del bloque para no alterar las pruebas siguientes).
  begin
    j := public.gestlok_chat_srv_pedido(conv9, h9, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id', p_pack, 'cantidad', 2, 'opciones', '{"emp":{"carne":2,"humita":1},"salsa":{"ajo":1}}'::jsonb))));
    r := r || E'\n' || case when (j->'pedido'->>'total')::numeric = 6200 and (j->'pedido'->'items'->0->'opciones')::text like '%2 Carne%'
        and (j->'pedido'->'items'->0->'opciones')::text like '%1 Humita%' then 'OK' else 'FALLA' end
      || ' promo armada: precio de la base (2 × (3000 + 100)) y detalle de variedades · ' || coalesce(j->'pedido'->>'total', '');
    raise exception 'deshacer' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
  perform set_config('role', 'postgres', true);
  update gestlok_chat_private.productos set disponible = false where id = p_emp;
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_sucursal('empa-munro');
  r := r || E'\n' || case when (select jsonb_array_length(x->'opciones'->0->'valores') from jsonb_array_elements(j->'catalogo'->'productos') x
      where x->>'nombre' = 'Pack 3 empanadas + 1 salsa') = 1 then 'OK' else 'FALLA' end || ' una variedad cuyo producto se agotó deja de ofrecerse';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',1,'opciones','{"emp":{"carne":3},"salsa":{"criolla":1}}'::jsonb))))::text $q$, conv9, h9, p_pack));
  r := r || E'\n' || case when v like 'error:P0001%' and v like '%Carne no está disponible%' then 'OK' else 'FALLA' end || ' y no se puede pedir · ' || left(v, 70);
  perform set_config('role', 'postgres', true);
  update gestlok_chat_private.productos set disponible = true where id = p_emp;
  delete from gestlok_chat_private.productos where id = p_pack;
  perform prueba_como('service_role');

  -- Pedido válido: precios siempre de la base -------------------------------------------------------------------
  j := public.gestlok_chat_srv_pedido(conv1, h1, jsonb_build_object('nombre', '  Ana   Pérez ', 'telefono', '+54 9 11 5555-1234',
    'entrega', 'envio', 'direccion', 'Av. Maipú 1234', 'medio_pago', 'transferencia', 'nota', 'Timbre B', 'total', 1,
    'items', jsonb_build_array(
      jsonb_build_object('producto_id', p_emp, 'cantidad', 2, 'precio', 1, 'nota', 'bien cocidas'),
      jsonb_build_object('producto_id', p_pizza, 'cantidad', 1, 'opciones', jsonb_build_object('tam', jsonb_build_array('grande'), 'ext', jsonb_build_array('acei'))))));
  r := r || E'\n' || case when j->'pedido'->>'codigo' = 'MM-0001' and (j->'pedido'->>'subtotal')::numeric = 7300
    and (j->'pedido'->>'envio')::numeric = 500 and (j->'pedido'->>'total')::numeric = 7800 and j->'pedido'->>'estado' = 'pendiente'
    then 'OK' else 'FALLA' end || ' pedido MM-0001 con totales de la base (7300 + 500) · ' || coalesce(j->'pedido'->>'total', j::text);
  perform set_config('role', 'postgres', true);
  select id into ped1 from gestlok_chat_private.pedidos where codigo = 'MM-0001';
  select count(*) into n from gestlok_chat_private.pedidos where id = ped1 and cliente_nombre = 'Ana Pérez' and cliente_telefono = '5491155551234';
  r := r || E'\n' || case when n = 1 then 'OK' else 'FALLA' end || ' nombre y teléfono normalizados';
  perform prueba_como('service_role');
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',2))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' un solo pedido pendiente por conversación';
  j := public.gestlok_chat_srv_estado(conv1, h1);
  r := r || E'\n' || case when j->'pedidos'->0->>'estado' = 'pendiente' then 'OK' else 'FALLA' end || ' el cliente ve «pendiente»';

  -- Confirmación manual del gerente ----------------------------------------------------------------------------
  perform prueba_como('gerente.torcuato@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'terminado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Torcuato no termina pedidos de Munro';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_pedidos(%L)::text $q$, s_munro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' gerente de Torcuato no ve pedidos de Munro';
  perform prueba_como('duena.b@prueba.example');
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'terminado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' dueña B no termina pedidos de A';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_pedidos(s_munro);
  r := r || E'\n' || case when jsonb_array_length(j->'pedidos') = 1 and j->'pedidos'->0->>'cliente_telefono' = '5491155551234' then 'OK' else 'FALLA' end || ' gerente de Munro ve el pedido pendiente';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'rechazado', '')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:22023%' then 'OK' else 'FALLA' end || ' rechazar exige motivo';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'terminado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' no termina sin confirmación manual';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'confirmado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente confirma antes de preparación';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'confirmado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' no duplica confirmación';
  perform prueba_como('service_role');
  v := prueba_q(format($q$ select public.gestlok_chat_srv_cancelar(%L, %L::bytea)::text $q$, conv1, h1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' cliente no cancela preparación confirmada';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_pedidos(s_munro, 'confirmado');
  r := r || E'\n' || case when jsonb_array_length(j->'pedidos') = 1 then 'OK' else 'FALLA' end || ' pedido llega a preparación interna';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'terminado')::text $q$, ped1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro marca terminado · ' || left(v, 60);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_decidir(%L, 'rechazado', 'tarde')::text $q$, ped1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end || ' un pedido resuelto no cambia';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_disponible(%L, false)::text $q$, p_emp));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' gerente de Munro marca agotado';
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_estado(conv1, h1);
  r := r || E'\n' || case when j->'pedidos'->0->>'estado' = 'terminado' then 'OK' else 'FALLA' end || ' el cliente ve «terminado»';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_pedido(%L, %L::bytea, jsonb_build_object('nombre','Ana','telefono','1155551234','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id',%L,'cantidad',2))))::text $q$, conv1, h1, p_emp));
  r := r || E'\n' || case when v like 'error:P0001%' and v like '%disponible%' then 'OK' else 'FALLA' end || ' producto agotado no se pide';

  -- Cancelación del cliente y numeración por sucursal -------------------------------------------------------------
  j := public.gestlok_chat_srv_conversacion(s_munro, h2, 'ip2'); conv2 := (j->>'id')::uuid;
  j := public.gestlok_chat_srv_pedido(conv2, h2, jsonb_build_object('nombre','Beto','telefono','1144443333','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id', p_pizza, 'cantidad', 1, 'opciones', jsonb_build_object('tam', jsonb_build_array('chica'))))));
  r := r || E'\n' || case when j->'pedido'->>'codigo' = 'MM-0002' and (j->'pedido'->>'total')::numeric = 3000 then 'OK' else 'FALLA' end || ' segundo pedido MM-0002 retiro sin envío';
  j := public.gestlok_chat_srv_cancelar(conv2, h2);
  r := r || E'\n' || case when j->'pedido'->>'estado' = 'cancelado' then 'OK' else 'FALLA' end || ' el cliente cancela mientras está pendiente';
  j := public.gestlok_chat_srv_conversacion(s_centro, hb, 'ip3'); convb := (j->>'id')::uuid;
  j := public.gestlok_chat_srv_pedido(convb, hb, jsonb_build_object('nombre','Caro','telefono','1133332222','entrega','retiro','medio_pago','efectivo',
       'items', jsonb_build_array(jsonb_build_object('producto_id', p_b, 'cantidad', 1))));
  r := r || E'\n' || case when j->'pedido'->>'codigo' = 'BC-0001' then 'OK' else 'FALLA' end || ' la empresa B numera aparte (BC-0001)';

  -- Modo soporte de la creadora ----------------------------------------------------------------------------------
  perform prueba_como('creadora@prueba.example');
  perform set_config('prueba.soporte', ta::text, true);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_pedidos(%L, 'todos')->>'nivel' $q$, s_munro));
  r := r || E'\n' || case when v = 'ok:ver' then 'OK' else 'FALLA' end || ' creadora en soporte ve en solo lectura · ' || v;
  v := prueba_q(format($q$ select public.gestlok_chat_panel_disponible(%L, true)::text $q$, p_emp));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' creadora en solo lectura no cambia nada';
  perform set_config('prueba.escritura', 'on', true);
  v := prueba_q(format($q$ select public.gestlok_chat_panel_disponible(%L, true)::text $q$, p_emp));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' creadora con escritura activa sí';
  perform set_config('prueba.escritura', '', true);
  perform set_config('prueba.soporte', '', true);


  -- Horarios y reportes por sucursal, usando fechas de prueba (sin afectar pedidos reales).
  perform set_config('role','postgres',true);
  update gestlok_chat_private.sucursales set
    turnos_chat='[{"inicio":"11:00","fin":"14:40"},{"inicio":"19:00","fin":"23:15"}]'::jsonb
  where id=s_munro;
  select gestlok_chat_private.estado_atencion(s,'2026-11-20 15:30'::timestamp)
  into j from gestlok_chat_private.sucursales s where s.id=s_munro;
  r:=r || E'\n' || case when j->>'abierto'='false' and j->>'proximo_texto'='hoy a las 19:00'
    then 'OK' else 'FALLA' end || ' entre turnos, siguiente apertura a las 19:00';
  select gestlok_chat_private.estado_atencion(s,'2026-11-20 23:30'::timestamp)
  into j from gestlok_chat_private.sucursales s where s.id=s_munro;
  r:=r || E'\n' || case when j->>'abierto'='false' and j->>'proximo_texto'='mañana a las 11:00'
    then 'OK' else 'FALLA' end || ' después del turno noche, abre al día siguiente';
  perform prueba_como('gerente.munro@prueba.example');
  j:=public.gestlok_chat_panel_reporte_diario(s_munro,7);
  r:=r || E'\n' || case when jsonb_array_length(j)=7
     and (j->0->>'fecha') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then 'OK' else 'FALLA' end || ' reporte diario con fechas locales ISO';
  v:=prueba_q(format('select public.gestlok_chat_panel_reporte_diario(%L,7)::text',s_torc));
  r:=r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' el gerente de Munro no ve reportes de Torcuato';
  perform prueba_como('duena.b@prueba.example');
  v:=prueba_q(format('select public.gestlok_chat_panel_reporte_diario(%L,7)::text',s_munro));
  r:=r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' otra empresa no ve el historial diario de Mi Gusto';
  perform set_config('role','postgres',true);

  -- Topes, auditoría y borrado ---------------------------------------------------------------------------------------
  perform set_config('role', 'postgres', true);
  procedure_ok := gestlok_chat_private.consumir('prueba:x', 'minuto', 2) and gestlok_chat_private.consumir('prueba:x', 'minuto', 2)
                  and not gestlok_chat_private.consumir('prueba:x', 'minuto', 2);
  r := r || E'\n' || case when procedure_ok then 'OK' else 'FALLA' end || ' los topes cortan al pasarse';
  select count(*) into n from gestlok_chat_private.auditoria where accion in ('producto_guardar','config_guardar','producto_disponible');
  r := r || E'\n' || case when n >= 5 then 'OK' else 'FALLA' end || ' los cambios quedan auditados (' || n || ')';
  select count(*) into n from gestlok_chat_private.pedido_eventos where pedido_id = ped1;
  r := r || E'\n' || case when n = 3 then 'OK' else 'FALLA' end || ' historial: creado, confirmado y terminado';

  -- Soporte: reclamos reales del cliente y respuesta humana sin salir del mismo chat.
  perform prueba_como('service_role');
  v := prueba_q(format($q$ select public.gestlok_chat_srv_reclamo(%L,%L::bytea,'ip1','faltante','Me falta una empanada')::text $q$,conv1,h1));
  r := r || E'\n' || case when v like 'ok:%' and v like '%gerente%' then 'OK' else 'FALLA' end
    || ' el cliente avisa faltante; queda una alerta para el gerente · ' || left(v,85);
  perform set_config('role','postgres',true);
  select id into ticket1 from gestlok_chat_private.reclamos where conversacion_id=conv1 and estado='pendiente';
  r := r || E'\n' || case when ticket1 is not null then 'OK' else 'FALLA' end || ' alerta persistente en sucursal Munro';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_inicio();
  r := r || E'\n' || case when (j->'sucursales'->0->>'reclamos')::int=1 then 'OK' else 'FALLA' end
    || ' el gerente ve el aviso en la Central de GESTLOK';
  j := public.gestlok_chat_panel_soporte(s_munro);
  r := r || E'\n' || case when jsonb_array_length(j)=1 and j->0->>'tipo'='faltante' then 'OK' else 'FALLA' end
    || ' alerta de faltante se abre desde el local correcto';
  v := prueba_q(format('select public.gestlok_chat_panel_soporte(%L)::text',s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' gerente de Munro no ve reclamos de Torcuato';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_responder(%L,'Revisamos el faltante y te contactamos acá',%L)::text $q$,conv1,ticket1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end
    || ' gerente responde por el mismo chat de cliente';
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_respuestas(conv1,h1,0);
  r := r || E'\n' || case when j->>'soporte_pendiente'='true'
      and j->>'tipo_soporte'='faltante'
      and (j->'mensajes_local'->0->>'texto') like '%Revisamos el faltante%' then 'OK' else 'FALLA' end
    || ' la respuesta humana llega al cliente y el hilo sigue abierto';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_reclamo(%L,%L::bytea,'ip1','faltante','Todavía falta la salsa')::text $q$,conv1,h1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end
    || ' cliente responde en el mismo hilo y vuelve a avisar';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_soporte(s_munro);
  r := r || E'\n' || case when jsonb_array_length(j)=1 and (j->0->>'detalle')='Todavía falta la salsa'
    and j->0->>'respondido_at' is null then 'OK' else 'FALLA' end
    || ' reclamo vuelve a esperar respuesta sin duplicar la alerta';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_responder(%L,'También revisamos la salsa',%L)::text $q$,conv1,ticket1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end
    || ' gerente puede continuar la conversación';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_cerrar_reclamo(%L)::text $q$,ticket1));
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end
    || ' gerente resuelve y cierra el reclamo manualmente';
  v := prueba_q(format($q$ select public.gestlok_chat_panel_cerrar_reclamo(%L)::text $q$,ticket1));
  r := r || E'\n' || case when v like 'error:P0001%' then 'OK' else 'FALLA' end
    || ' un reclamo cerrado no puede cerrarse dos veces';
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_respuestas(conv1,h1,0);
  r := r || E'\n' || case when j->>'soporte_pendiente'='false'
      and jsonb_array_length(j->'mensajes_local')=2 then 'OK' else 'FALLA' end
    || ' el cliente ve las dos respuestas del gerente y el reclamo queda cerrado';
  v := prueba_q(format($q$ select public.gestlok_chat_srv_respuestas(%L,%L::bytea,0)::text $q$,conv1,h2));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' otro cliente no lee la conversación de soporte';
  perform prueba_como('gerente.munro@prueba.example');
  j := public.gestlok_chat_panel_clientes(s_munro);
  r := r || E'\n' || case when jsonb_typeof(j)='array' then 'OK' else 'FALLA' end
    || ' gerente solo consulta clientes frecuentes de su sucursal';
  v := prueba_q(format('select public.gestlok_chat_panel_clientes(%L)::text',s_torc));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' gerente de Munro no consulta clientes de Torcuato';
  perform prueba_como(null);
  v := prueba_q(format('select public.gestlok_chat_panel_clientes(%L)::text',s_munro));
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end
    || ' público no accede a lista de clientes';
  perform set_config('role','postgres',true);
  update gestlok_chat_private.conversaciones set ultima_at = now() - interval '61 days' where id = conv1;
  j := gestlok_chat_private.purgar();
  select count(*) into n from gestlok_chat_private.conversaciones where id=conv1;
  r := r || E'\n' || case when (j->>'conversaciones')::int=0 and n=1 then 'OK' else 'FALLA' end
    || ' conversación abierta no desaparece aunque pasen 60 días';
  update gestlok_chat_private.conversaciones set cerrada_at = now() - interval '61 days' where id=conv1;
  j := gestlok_chat_private.purgar();
  select count(*) into n from gestlok_chat_private.pedidos where id = ped1 and conversacion_id is null;
  r := r || E'\n' || case when (j->>'conversaciones')::int=1 and n=1 then 'OK' else 'FALLA' end
    || ' conversación cerrada antigua se elimina y pedido permanece';
  select count(*) into n from gestlok_chat_private.mensajes where conversacion_id = conv1;
  r := r || E'\n' || case when n = 0 then 'OK' else 'FALLA' end || ' sin mensajes huérfanos';


  -- Micro app general: la administradora la enciende para un comercio nuevo desde su panel --------------------------
  perform set_config('role', 'postgres', true);
  insert into gestlok_tenancy.tenants (id, code) values ('d0000000-0000-4000-8000-00000000000d', 'LOLA');
  insert into public.docs (tenant_id, col, id, data) values
    ('d0000000-0000-4000-8000-00000000000d', 'locales', 'sur', '{"nombre":"Café Sur"}'),
    ('d0000000-0000-4000-8000-00000000000d', 'locales', 'norte', '{"nombre":"Norte"}');
  perform prueba_como('duena.a@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_admin_empresas()::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' una dueña no ve el listado de empresas';
  v := prueba_q($q$ select public.gestlok_chat_admin_estado('a0000000-0000-4000-8000-00000000000a', false)::text $q$);
  r := r || E'\n' || case when v like 'error:42501%' then 'OK' else 'FALLA' end || ' una dueña no pausa la micro app';
  perform prueba_como('creadora@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('d0000000-0000-4000-8000-00000000000d', 'Café Lola')->>'sucursales' $q$);
  r := r || E'\n' || case when v = 'ok:2' then 'OK' else 'FALLA' end || ' alta en un clic: un chat por cada local · ' || v;
  v := prueba_q($q$ select public.gestlok_chat_admin_habilitar('d0000000-0000-4000-8000-00000000000d', 'Café Lola', null)->>'sucursales' $q$);
  r := r || E'\n' || case when v = 'ok:0' then 'OK' else 'FALLA' end || ' repetir el alta no duplica chats';
  perform set_config('role', 'postgres', true);
  select string_agg(slug || '/' || prefijo || '/' || nombre || '/' || activa, ' ' order by slug) into v
    from gestlok_chat_private.sucursales where tenant_id = 'd0000000-0000-4000-8000-00000000000d';
  r := r || E'\n' || case when v = 'cafe-lola-cafe-sur/CS/Café Sur/false cafe-lola-norte/N/Norte/false' then 'OK' else 'FALLA' end
    || ' enlaces y prefijos automáticos, chats apagados · ' || coalesce(v, '');
  r := r || E'\n' || case when gestlok_chat_private.slug_libre('Empa Munro') = 'empa-munro-2' then 'OK' else 'FALLA' end || ' un enlace ocupado no se repite';
  perform prueba_como('creadora@prueba.example');
  j := public.gestlok_chat_admin_empresas();
  r := r || E'\n' || case when jsonb_array_length(j) = 3 and not (j::text ~ 'cliente_|telefono') then 'OK' else 'FALLA' end || ' la administradora ve las 3 empresas sin datos de clientes';
  v := prueba_q($q$ select public.gestlok_chat_admin_estado('d0000000-0000-4000-8000-00000000000d', false)::text $q$);
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' la administradora pausa la micro app de una empresa';
  perform prueba_como('service_role');
  j := public.gestlok_chat_srv_sucursal('cafe-lola-norte');
  r := r || E'\n' || case when j->>'motivo' = 'no_existe' then 'OK' else 'FALLA' end || ' empresa pausada: su chat no existe para el público';
  perform prueba_como('creadora@prueba.example');
  v := prueba_q($q$ select public.gestlok_chat_admin_estado('d0000000-0000-4000-8000-00000000000d', true)::text $q$);
  r := r || E'\n' || case when v like 'ok:%' then 'OK' else 'FALLA' end || ' y la vuelve a activar';
  perform set_config('role', 'postgres', true);
  raise exception 'INFORME%', r;
end $t$;
