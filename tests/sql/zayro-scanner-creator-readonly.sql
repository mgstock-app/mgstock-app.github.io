-- Ejecutar con un rol administrador de base (no desde la web).
-- Cada bloque termina en ROLLBACK: no altera sesiones, empresas ni productos.
-- Requiere la migración de permisos en staging o entorno de prueba.

-- CREADORA verificada, tenant ZAYRO activo. Probar todos los SELECT y exclusión.
begin;
select set_config('test.zayro_creator_uid',a.user_id::text,true),
       set_config('test.zayro_creator_claims',
         jsonb_build_object('sub',a.user_id,'email',u.email,'role','authenticated')::text,true)
  from gestlok_platform.admins a join auth.users u on u.id=a.user_id
  where u.email_confirmed_at is not null limit 1;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.zayro_creator_uid'),true),
       set_config('request.jwt.claims',current_setting('test.zayro_creator_claims'),true);
-- La creación de una sesión de diagnóstico queda revertida.
select public.gestlok_creator_open_company(
  '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid,
  'Prueba transaccional reversible de solo lectura',5);
do $$
declare n integer;
begin
  if not (select gestlok_tenancy.zayro_scanner_creator_can_read(
      '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)) then
    raise exception 'Creadora válida sin acceso SELECT';
  end if;
  select count(*) into n from public.gestlok_pilot_access
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  if n<>1 then raise exception 'Debe aparecer exactamente un plan de ZAYRO'; end if;
  select count(*) into n from public.gestlok_pilot_products
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  if n<1 then raise exception 'Creadora no puede leer el catálogo real'; end if;
  perform count(*) from public.gestlok_pilot_pos_sales
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  perform count(*) from public.gestlok_pilot_orders
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  perform count(*) from public.gestlok_pilot_order_closures
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  perform count(*) from public.gestlok_pilot_records
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  perform count(*) from public.gestlok_scanner_payment_methods
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  perform count(*) from public.gestlok_pilot_audit
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  select count(*) into n from public.gestlok_pilot_products
   where tenant_id<>'2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  if n<>0 then raise exception 'Fuga de datos hacia otro tenant'; end if;
end $$;
-- Una actualización sin permisos de propietaria debe afectar exactamente cero filas.
do $$
declare changed int;
begin
  update public.gestlok_pilot_products set name=name
    where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Creadora logró editar productos'; end if;
  update public.gestlok_pilot_orders set status=status
    where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Creadora logró editar pedidos'; end if;
end $$;
rollback;

-- DUEÑA: políticas anteriores intactas y catálogo disponible.
begin;
select set_config('test.zayro_owner_uid',a.owner_uid::text,true),
       set_config('test.zayro_owner_claims',
         jsonb_build_object('sub',a.owner_uid,'email',u.email,'role','authenticated')::text,true)
  from public.gestlok_pilot_access a join auth.users u on u.id=a.owner_uid
  where a.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.zayro_owner_uid'),true),
       set_config('request.jwt.claims',current_setting('test.zayro_owner_claims'),true);
do $$
begin
 if (select count(*) from public.gestlok_pilot_products
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)<1 then
   raise exception 'La dueña perdió acceso a su catálogo';
 end if;
 if (select gestlok_tenancy.zayro_scanner_creator_can_read(
   '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)) then
   raise exception 'La función de creadora autorizó erróneamente a la dueña';
 end if;
end $$;
rollback;

-- GERENTE u otra cuenta no administradora: sin lecturas de Plan Scanner.
begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true),
       set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"gerente-de-prueba@example.invalid","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.gestlok_pilot_access
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)<>0 then
   raise exception 'Usuario ajeno con acceso al plan';
 end if;
 if (select count(*) from public.gestlok_pilot_products
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid)<>0 then
   raise exception 'Usuario ajeno con acceso al catálogo';
 end if;
end $$;
rollback;

-- ANÓNIMO: sin permiso SQL SELECT en tablas privadas ni EXECUTE de helper.
select has_table_privilege('anon','public.gestlok_pilot_products','SELECT') as anon_can_read_products,
       has_table_privilege('anon','public.gestlok_pilot_access','SELECT') as anon_can_read_access,
       has_function_privilege('anon','gestlok_tenancy.zayro_scanner_creator_can_read(uuid)','EXECUTE') as anon_can_use_helper;
-- Todos los tres valores deben ser FALSE.
