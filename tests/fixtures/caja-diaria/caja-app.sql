-- GESTLOK Caja por empresa (02/11/2026): acceso desde el inicio de GESTLOK. Se corre DESPUÉS de base.sql, de las dos
-- migraciones (#200 y 20261102130000) y de supabase/operaciones/gestlok-caja-app-perfumes.sql.

-- 1) Configuración: solo Perfumes tiene GESTLOK Caja; su caja diaria quedó apagada sin borrar nada.
do $$
begin
  perform set_config('role', 'postgres', true);
  assert (select array_agg(tenant_id) from gestlok_caja_private.caja_app_empresas where habilitada)
         = array['2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid], 'Solo Perfumes tiene GESTLOK Caja';
  assert not (select habilitada from gestlok_caja_private.empresas where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'),
         'La caja diaria de Perfumes queda apagada';
  assert exists (select 1 from gestlok_caja_private.empresas where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'),
         'La fila de la caja diaria se conserva (no se borra)';
  assert not exists (select 1 from gestlok_caja_private.caja_app_empresas where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'),
         'Mi Gusto no tiene GESTLOK Caja';
end $$;

-- 2) Quién la ve.
do $$
declare v jsonb;
begin
  perform prueba.como('duena@perfumes.example');
  v := public.gestlok_caja_app_acceso();
  assert (v->>'habilitada')::boolean and v->>'tenant_id' = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'La dueña de Perfumes la ve';
  assert v->>'url' = '/caja/', 'Dirección de la app';
  assert v->'locales' = '["Percam"]'::jsonb, 'Nombres de los locales para precargar el alta';
  assert not (public.gestlok_caja_acceso()->>'habilitada')::boolean, 'La caja diaria ya no aparece';
  perform prueba.como('gerente@perfumes.example');
  assert (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Gerente con local la ve';
  perform prueba.como('gerente.sinlocal@perfumes.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Gerente sin local no la ve';
  perform prueba.como('lectura@perfumes.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Solo lectura no la ve';
  perform prueba.como('colaborador@perfumes.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Colaborador no la ve';
  perform prueba.como('sinverificar@perfumes.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Email sin verificar no la ve';
  perform prueba.como('dueno@migusto.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Mi Gusto no la ve';
  perform prueba.como('gerente.munro@migusto.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Gerente de Munro no la ve';
  perform prueba.como('dueno@otra.example');
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Otra empresa no la ve';
end $$;

-- 3) Soporte de la creadora, visitantes y acceso directo a la tabla: nada.
do $$
declare e text;
begin
  perform prueba.como('creadora@gestlok.example');
  perform set_config('prueba.soporte', '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', true);
  assert not (public.gestlok_caja_app_acceso()->>'habilitada')::boolean, 'Modo soporte no abre la caja de la empresa';
  perform set_config('prueba.soporte', '', true);
  perform prueba.como(null);
  e := prueba.error_de('select public.gestlok_caja_app_acceso()');
  assert e like '42501%', 'Visitante sin sesión rechazado: ' || coalesce(e, 'sin error');
  perform prueba.como('duena@perfumes.example');
  e := prueba.error_de('select count(*) from gestlok_caja_private.caja_app_empresas');
  assert e like '42501%', 'Sin acceso directo a la tabla: ' || coalesce(e, 'sin error');
  e := prueba.error_de('select gestlok_caja_private.empresa_caja_app()');
  assert e like '42501%', 'Función interna no expuesta: ' || coalesce(e, 'sin error');
end $$;

-- 4) Mi Gusto y sus locales intactos.
do $$
begin
  perform set_config('role', 'postgres', true);
  assert (select count(*) from public.docs where tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670') = 5, 'Documentos de Mi Gusto intactos';
  assert (select data->>'stock' from public.docs where col = 'munro/productos' and id = 'p-001') = '3', 'Stock de Munro intacto';
end $$;

select 'GESTLOK CAJA: OK' as resultado;
