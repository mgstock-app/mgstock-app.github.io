-- Ejecutar dentro de BEGIN/ROLLBACK (junto a la migración para preflight).
-- Nuevas empresas y colisión con identidad histórica: solo datos ficticios.
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); actor uuid;
 ca jsonb; cb jsonb; orga uuid; orgb uuid; uid_a uuid; uid_b uuid; me jsonb; ctx jsonb; n int;
 legacy_org uuid:=gen_random_uuid(); legacy_uid uuid:=gen_random_uuid();
begin
 select user_id into actor from gestlok_platform.admins order by user_id limit 1;
 insert into auth.users(id,email,email_confirmed_at) values(a,'native-owner-a@example.invalid',now()),(b,'native-owner-b@example.invalid',now());
 -- La misma cuenta ya tiene una asignación histórica que debe conservarse.
 insert into rm_test_private.identity_map(email,old_user_id) values('native-owner-a@example.invalid',legacy_uid);
 insert into public.rm_organizations(id,name,owner_id,created_by) values(legacy_org,'Histórico ficticio',legacy_uid,actor);
 insert into public.rm_app_directory(user_id,email,display_name,status) values(legacy_uid,'native-owner-a@example.invalid','Histórico','approved');
 insert into public.rm_organization_members(user_id,organization_id) values(legacy_uid,legacy_org);
 insert into public.rm_test_members(user_id,role) values(legacy_uid,'owner');
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'email',(select email from auth.users where id=actor),'role','authenticated')::text,true);
 ca:=public.gestlok_creator_prepare_company('Empresa A ficticia','native-owner-a@example.invalid','fisica','Local A');
 cb:=public.gestlok_creator_prepare_company('Empresa B ficticia','native-owner-b@example.invalid','online','Local B');
 select organization_id into orga from gestlok_platform.recibonet_links where tenant_id=(ca->>'tenant_id')::uuid;
 select organization_id into orgb from gestlok_platform.recibonet_links where tenant_id=(cb->>'tenant_id')::uuid;
 if orga is null or orgb is null or orga=orgb or orga=legacy_org then raise exception 'Espacios no aislados';end if;
 select user_id into uid_a from gestlok_platform.employee_owners where tenant_id=(ca->>'tenant_id')::uuid;
 select user_id into uid_b from gestlok_platform.employee_owners where tenant_id=(cb->>'tenant_id')::uuid;
 if uid_a=legacy_uid or uid_a=a then raise exception 'Se reutilizó identidad histórica';end if;
 perform gestlok_platform.ensure_employee_space((ca->>'tenant_id')::uuid);
 select count(*) into n from public.rm_app_local where organization_id=orga;
 if n<>1 then raise exception 'Provisionamiento no idempotente';end if;
 insert into public.docs(col,id,data,tenant_id) values('locales','native-second-local','{"nombre":"Segundo local ficticio"}',(ca->>'tenant_id')::uuid);
 select count(*) into n from public.rm_app_local where organization_id=orga;
 if n<>2 then raise exception 'Nuevo local sin sincronizar';end if;
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'email','native-owner-a@example.invalid','role','authenticated')::text,true);
 ctx:=public.gestlok_owner_area_context();
 if (ctx->'modules'->'recibos_personal'->>'authorized')::boolean is not true then raise exception 'Tarjeta A deshabilitada';end if;
 me:=public.rm_app_me();
 if me->>'role'<>'owner' or (me->>'organization_id')::uuid<>orga then raise exception 'Inicio A equivocado';end if;
 if rm_test_private.manages_organization(orgb) or rm_test_private.manages_organization(legacy_org) then raise exception 'Acceso ajeno A';end if;
 select count(*) into n from public.rm_app_local where organization_id<>orga;
 if n<>0 then raise exception 'A lee locales ajenos';end if;
 perform public.rm_app_set_branch_schedule_link(ca->>'local_id','https://docs.google.com/spreadsheets/d/FICTICIO_123/edit');
 begin perform public.rm_app_set_branch_schedule_link(cb->>'local_id','https://docs.google.com/spreadsheets/d/FICTICIO_123/edit');raise exception 'A escribe B';exception when insufficient_privilege then null;end;
 perform public.rm_app_create_company(orga,'Empresa adicional ficticia');
 begin perform public.rm_app_create_company(orgb,'Intruso');raise exception 'A administra B';exception when insufficient_privilege then null;end;
 -- Correo ajeno en token no selecciona la identidad del dueño B.
 perform set_config('request.jwt.claims',json_build_object('sub',a,'email','native-owner-b@example.invalid','role','authenticated')::text,true);
 if rm_test_private.uid()=uid_b or rm_test_private.app_role()<>'' then raise exception 'Suplantación';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',b,'email','native-owner-b@example.invalid','role','authenticated')::text,true);
 me:=public.rm_app_me();if (me->>'organization_id')::uuid<>orgb then raise exception 'Inicio B equivocado';end if;
 perform set_config('role','postgres',true);
 -- El espacio histórico y sus permisos nunca se transfieren ni sobrescriben.
 if not exists(select 1 from public.rm_organization_members where user_id=legacy_uid and organization_id=legacy_org) then raise exception 'Histórico alterado';end if;
 update gestlok_platform.company_modules set enabled=false where tenant_id=(ca->>'tenant_id')::uuid and module='recibos_personal';
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'email','native-owner-a@example.invalid','role','authenticated')::text,true);
 if rm_test_private.uid()<>uid_a or rm_test_private.app_role()<>'' then raise exception 'Módulo apagado hereda permisos históricos';end if;
 begin perform public.rm_app_me();raise exception 'Módulo apagado permite inicio';exception when insufficient_privilege then null;end;
 perform set_config('role','postgres',true);
 raise notice 'OK: futuras empresas, tarjetas, inicio owner, aislamiento, escritura propia, idempotencia, identidad histórica y módulo apagado';
end $test$;
