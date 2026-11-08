-- PRUEBA DE ROLES. Ejecutar solo contra staging o una transacción reversible.
-- Nunca confirma ventas, mueve stock ni cambia permisos fuera de un ROLLBACK.
-- Requiere la migración de creadora operativa.
begin;
select set_config('test.zayro_admin_uid',a.user_id::text,true),
       set_config('test.zayro_admin_jwt',
         jsonb_build_object('sub',a.user_id,'email',u.email,'role','authenticated')::text,true)
from gestlok_platform.admins a join auth.users u on u.id=a.user_id
where u.email_confirmed_at is not null limit 1;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.zayro_admin_uid'),true),
       set_config('request.jwt.claims',current_setting('test.zayro_admin_jwt'),true);
select public.gestlok_creator_open_company(
 '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid,'Validación de roles con rollback',5);
do $$
declare changed integer;
begin
 if public.mi_rol()<>'creadora' then raise exception 'No se verificó el rol creadora';end if;
 update public.gestlok_pilot_products set name=name
 where id=(select id from public.gestlok_pilot_products
   where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid limit 1);
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'La creadora no pudo modificar exactamente un producto';end if;
 update public.gestlok_pilot_products set name=name
 where tenant_id<>'2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Fuga de escritura entre empresas';end if;
end $$;
rollback;

-- Cuenta ajena / gerente de otra empresa: no obtiene autorización de creadora.
begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true),
       set_config('request.jwt.claims',
       '{"sub":"11111111-1111-4111-8111-111111111111","email":"prueba@invalid.example","role":"authenticated"}',true);
set local role authenticated;
do $$
declare changed integer;
begin
 if gestlok_tenancy.zayro_scanner_creator_can_read('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103') then
  raise exception 'Usuario ajeno recibió privilegios de creadora';
 end if;
 update public.gestlok_pilot_products set name=name
 where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Usuario ajeno logró escribir';end if;
end $$;
rollback;

-- La dueña conserva el mismo acceso. Rollback evita cambios de stock.
begin;
select set_config('test.zayro_owner_uid',a.owner_uid::text,true),
       set_config('test.zayro_owner_jwt',
         jsonb_build_object('sub',a.owner_uid,'email',u.email,'role','authenticated')::text,true)
from public.gestlok_pilot_access a join auth.users u on u.id=a.owner_uid
where a.tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.zayro_owner_uid'),true),
       set_config('request.jwt.claims',current_setting('test.zayro_owner_jwt'),true);
do $$
declare n integer;
begin
 select count(*) into n from public.gestlok_pilot_products
 where tenant_id='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
 if n=0 then raise exception 'Dueña perdió catálogo';end if;
 if gestlok_tenancy.zayro_scanner_creator_can_read('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103') then
  raise exception 'Dueña fue interpretada incorrectamente como creadora';
 end if;
end $$;
rollback;
