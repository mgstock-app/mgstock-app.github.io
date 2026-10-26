-- Administración de empleados (ex ReciboNet) dentro de GESTLOK: aislamiento entre espacios,
-- identidad verificada por correo y permisos por rol. Datos ficticios; todo se revierte.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000a1','owner-a@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a2','owner-b@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a3','emp-a@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a4','emp-b@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a5','mgr-a@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a6','sin-confirmar@example.invalid',null),
 ('00000000-0000-4000-8000-0000000000a7','vinculado@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000a8','intruso@example.invalid',now());
insert into rm_test_private.identity_map(email,old_user_id) values
 ('vinculado@example.invalid','00000000-0000-4000-8000-0000000000f7');
insert into public.rm_organizations(id,name,owner_id,created_by) values
 ('00000000-0000-4000-8000-0000000000b1','Espacio A ficticio','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1'),
 ('00000000-0000-4000-8000-0000000000b2','Espacio B ficticio','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a2');
insert into public.rm_companies(id,organization_id,name) values
 ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1','Empresa A'),
 ('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000b2','Empresa B');
insert into public.rm_app_local(id,name,cycle,owner_id,organization_id,company_id) values
 ('fix-local-a','Local A','mensual','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000c1'),
 ('fix-local-b','Local B','mensual','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000c2');
insert into public.rm_app_directory(user_id,email,display_name,status) values
 ('00000000-0000-4000-8000-0000000000a1','owner-a@example.invalid','Dueña A','approved'),
 ('00000000-0000-4000-8000-0000000000a2','owner-b@example.invalid','Dueño B','approved'),
 ('00000000-0000-4000-8000-0000000000a3','emp-a@example.invalid','Empleada A','approved'),
 ('00000000-0000-4000-8000-0000000000a4','emp-b@example.invalid','Empleada B','approved'),
 ('00000000-0000-4000-8000-0000000000a5','mgr-a@example.invalid','Gerente A','approved'),
 ('00000000-0000-4000-8000-0000000000f7','vinculado@example.invalid','Vinculada','approved');
insert into public.rm_organization_members(user_id,organization_id) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1'),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b2'),
 ('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000b1'),
 ('00000000-0000-4000-8000-0000000000a4','00000000-0000-4000-8000-0000000000b2'),
 ('00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000b1'),
 ('00000000-0000-4000-8000-0000000000f7','00000000-0000-4000-8000-0000000000b1');
insert into public.rm_test_documents(path,data,organization_id) values
 ('hojas/fix-sheet-a','{"nombre":"Empleada A","local":"fix-local-a","puesto":"staff"}','00000000-0000-4000-8000-0000000000b1'),
 ('hojas/fix-sheet-v','{"nombre":"Vinculada","local":"fix-local-a","puesto":"staff"}','00000000-0000-4000-8000-0000000000b1'),
 ('hojas/fix-sheet-b','{"nombre":"Empleada B","local":"fix-local-b","puesto":"staff"}','00000000-0000-4000-8000-0000000000b2');
insert into public.rm_test_members(user_id,role,sheet_id,local_id) values
 ('00000000-0000-4000-8000-0000000000a1','owner',null,null),
 ('00000000-0000-4000-8000-0000000000a2','owner',null,null),
 ('00000000-0000-4000-8000-0000000000a3','employee','fix-sheet-a','fix-local-a'),
 ('00000000-0000-4000-8000-0000000000a4','employee','fix-sheet-b','fix-local-b'),
 ('00000000-0000-4000-8000-0000000000a5','manager',null,null),
 ('00000000-0000-4000-8000-0000000000f7','employee','fix-sheet-v','fix-local-a');
insert into public.rm_manager_permissions(user_id,company_id,organization_id,can_edit,can_publish,can_comment) values
 ('00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1',true,false,true);

-- 1. Dueña A: ve solo su espacio y no puede operar sobre el espacio B.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a1","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ declare n int; r jsonb; begin
 r:=public.rm_app_me();
 if r->>'role'<>'owner' or r->>'organization_id'<>'00000000-0000-4000-8000-0000000000b1' then raise exception 'Owner identity wrong: %',r;end if;
 select count(*) into n from public.rm_test_documents where organization_id='00000000-0000-4000-8000-0000000000b2';
 if n<>0 then raise exception 'Owner A reads documents of space B';end if;
 select count(*) into n from public.rm_app_local where organization_id='00000000-0000-4000-8000-0000000000b2';
 if n<>0 then raise exception 'Owner A reads locals of space B';end if;
 select count(*) into n from public.rm_companies where organization_id='00000000-0000-4000-8000-0000000000b2';
 if n<>0 then raise exception 'Owner A reads companies of space B';end if;
 begin select count(*) into n from public.rm_app_directory where user_id in ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a4');
 if n<>0 then raise exception 'Owner A reads directory of space B';end if;exception when insufficient_privilege then null;end;
 begin perform public.rm_app_schedule_context('00000000-0000-4000-8000-0000000000c2');raise exception 'Owner A opened schedule of B';exception when insufficient_privilege then null;end;
 begin perform public.rm_app_save_schedule('00000000-0000-4000-8000-0000000000c2','semanal',date '2026-10-26','[{"name":"X","unit":"horas","worked":1,"off":0,"holiday":0,"justified":0,"unjustified":0}]'::jsonb,'',false,0);raise exception 'Owner A saved schedule in B';exception when insufficient_privilege then null;end;
 begin insert into public.rm_test_documents(path,data,organization_id) values('hojas/fix-intruso','{"local":"fix-local-b"}','00000000-0000-4000-8000-0000000000b2');raise exception 'Owner A inserted in B';exception when insufficient_privilege then null;end;
 select count(*) into n from jsonb_array_elements(public.rm_app_users()) u where u->>'organization_id'='00000000-0000-4000-8000-0000000000b2';
 if n<>0 then raise exception 'Owner A lists users of B';end if;
end $$;

-- 2. Empleada A: solo su hoja; sin funciones de gestión ni escritura directa.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a3","email":"emp-a@example.invalid","role":"authenticated"}';
do $$ declare n int; begin
 if public.rm_app_me()->>'role'<>'employee' then raise exception 'Employee identity wrong';end if;
 select count(*) into n from public.rm_test_documents where path='hojas/fix-sheet-b';
 if n<>0 then raise exception 'Employee reads other space sheet';end if;
 begin perform public.rm_app_users();raise exception 'Employee listed users';exception when insufficient_privilege then null;end;
 begin update public.rm_test_members set role='owner' where user_id='00000000-0000-4000-8000-0000000000a3';get diagnostics n=row_count;if n>0 then raise exception 'Employee escalated role';end if;exception when insufficient_privilege then null;end;
 begin insert into public.rm_test_documents(path,data,organization_id) values('hojas/fix-sheet-a2','{"local":"fix-local-a"}','00000000-0000-4000-8000-0000000000b1');raise exception 'Employee inserted document';exception when insufficient_privilege then null;end;
 begin delete from public.rm_test_documents where path='hojas/fix-sheet-a';get diagnostics n=row_count;if n>0 then raise exception 'Employee deleted document';end if;exception when insufficient_privilege then null;end;
end $$;

-- 3. Gerente A: ve la planilla de su empresa, no la del espacio B y no publica sin permiso.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a5","email":"mgr-a@example.invalid","role":"authenticated"}';
do $$ declare c jsonb; begin
 c:=public.rm_app_schedule_context('00000000-0000-4000-8000-0000000000c1');
 if (c->'permissions'->>'edit')::boolean is not true or (c->'permissions'->>'publish')::boolean is not false then raise exception 'Manager permissions wrong: %',c;end if;
 begin perform public.rm_app_schedule_context('00000000-0000-4000-8000-0000000000c2');raise exception 'Manager opened schedule of B';exception when insufficient_privilege then null;end;
 begin perform public.rm_app_save_schedule('00000000-0000-4000-8000-0000000000c1','semanal',date '2026-10-26','[{"name":"X","unit":"horas","worked":1,"off":0,"holiday":0,"justified":0,"unjustified":0}]'::jsonb,'',true,0);raise exception 'Manager published without permission';exception when insufficient_privilege then null;end;
end $$;

-- 4. Cuenta sin confirmar: sin identidad ni datos.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a6","email":"sin-confirmar@example.invalid","role":"authenticated"}';
do $$ declare n int; begin
 begin perform public.rm_app_me();raise exception 'Unconfirmed account got identity';exception when insufficient_privilege then null;end;
 select count(*) into n from public.rm_test_documents; if n<>0 then raise exception 'Unconfirmed account reads documents';end if;
end $$;

-- 5. Vinculación por correo verificado: toma el id histórico solo con el correo confirmado y coincidente.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a7","email":"vinculado@example.invalid","role":"authenticated"}';
do $$ begin
 if rm_test_private.uid()<>'00000000-0000-4000-8000-0000000000f7' then raise exception 'Linked account did not get historical id';end if;
 if public.rm_app_me()->>'role'<>'employee' then raise exception 'Linked account lost its role';end if;
end $$;
-- Un token con el correo ajeno en la declaración no hereda la identidad vinculada.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a8","email":"vinculado@example.invalid","role":"authenticated"}';
do $$ begin
 if rm_test_private.uid()<>'00000000-0000-4000-8000-0000000000a8' then raise exception 'Impostor token inherited a linked identity';end if;
 begin perform public.rm_app_me();raise exception 'Impostor got identity';exception when insufficient_privilege then null;end;
end $$;
-- Una cuenta confirmada pero sin vínculo no se mezcla con ningún espacio.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a8","email":"intruso@example.invalid","role":"authenticated"}';
do $$ declare n int; begin
 if rm_test_private.uid()<>'00000000-0000-4000-8000-0000000000a8' then raise exception 'Unlinked account got another id';end if;
 select count(*) into n from public.rm_test_documents; if n<>0 then raise exception 'Unlinked account reads documents';end if;
 select count(*) into n from public.rm_organizations; if n<>0 then raise exception 'Unlinked account reads organizations';end if;
end $$;

-- 6. Anónimo: nada.
reset role;
set local role anon;
do $$ declare n int; begin
 begin select count(*) into n from public.rm_test_documents; if n<>0 then raise exception 'Anon reads documents';end if;exception when insufficient_privilege then null;end;
 begin perform public.rm_app_me();raise exception 'Anon executed rm_app_me';exception when insufficient_privilege then null;end;
 begin perform public.rm_app_users();raise exception 'Anon executed rm_app_users';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
