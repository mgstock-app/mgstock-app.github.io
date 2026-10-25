-- Pruebas del módulo de empleados por empresa. Datos ficticios; todo se revierte al final.
begin;
insert into gestlok_tenancy.tenants(id,code) values
 ('00000000-0000-4000-8000-0000000000a1','employee-module-fixture-a'),('00000000-0000-4000-8000-0000000000a2','employee-module-fixture-b');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
 ('00000000-0000-4000-8000-0000000000a3','owner-a@example.invalid',now(),'{"modules":["recibos_personal"],"role":"creadora"}','{}'),
 ('00000000-0000-4000-8000-0000000000a4','manager-a@example.invalid',now(),'{}','{}'),
 ('00000000-0000-4000-8000-0000000000a5','owner-b@example.invalid',now(),'{}','{}'),
 ('00000000-0000-4000-8000-0000000000a6','platform-admin@example.invalid',now(),'{}','{}');
insert into gestlok_platform.admins(user_id) values('00000000-0000-4000-8000-0000000000a6');
insert into public.docs(col,id,data,tenant_id) values
 ('locales','emp-fixture-munro','{"nombre":"Munro ficticio"}','00000000-0000-4000-8000-0000000000a1'),
 ('locales','emp-fixture-otro','{"nombre":"Otro negocio"}','00000000-0000-4000-8000-0000000000a2'),
 ('equipo','owner-a@example.invalid','{"email":"owner-a@example.invalid","rol":"dueno","logoId":"mi-gusto"}','00000000-0000-4000-8000-0000000000a1'),
 ('equipo','manager-a@example.invalid','{"email":"manager-a@example.invalid","rol":"gerente","locales":["emp-fixture-munro"]}','00000000-0000-4000-8000-0000000000a1'),
 ('equipo','owner-b@example.invalid','{"email":"owner-b@example.invalid","rol":"dueno"}','00000000-0000-4000-8000-0000000000a2');

-- 1. Sin vínculo verificado: ni los metadatos del registro ni la creadora pueden habilitar empleados.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a3","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_owner_area_context();
 if x->'modules'->'recibos_personal'->>'authorized'<>'false' or x->'modules'->'recibos_personal'->>'reason'<>'company_not_linked' then raise exception 'Unlinked company exposed employee module: %',x;end if;
 if x->'recibonet' <> 'null'::jsonb then raise exception 'Link data exposed while disabled';end if;
 begin perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',true);raise exception 'Owner enabled own module';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a6","email":"platform-admin@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',true);raise exception 'Enabled without verified link';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','otro_modulo',true);raise exception 'Unknown module accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;

-- 2. El vínculo lo registra solo el operador; es idempotente y no acepta un segundo vínculo distinto.
do $$ declare x jsonb; begin
 x:=gestlok_platform.link_recibonet_verified('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','2099001','Fixture interna','00000000-0000-4000-8000-0000000000a6','{"fixture":true}');
 if x->>'status'<>'linked' then raise exception 'Link failed';end if;
 x:=gestlok_platform.link_recibonet_verified('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1','2099001','Fixture interna','00000000-0000-4000-8000-0000000000a6','{}');
 if x->>'status'<>'already_linked' then raise exception 'Link not idempotent';end if;
 begin perform gestlok_platform.link_recibonet_verified('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000b1','2099002','Otra','00000000-0000-4000-8000-0000000000a6','{}');raise exception 'Organization linked twice';exception when raise_exception then null;end;
 if has_function_privilege('authenticated','gestlok_platform.link_recibonet_verified(uuid,uuid,text,text,uuid,jsonb)','EXECUTE') then raise exception 'Operator link exposed';end if;
 if has_table_privilege('authenticated','gestlok_platform.company_modules','SELECT') or has_table_privilege('authenticated','gestlok_platform.admin_audit','SELECT') then raise exception 'Private tables exposed';end if;
end $$;

-- 3. Vinculada pero no habilitada: sigue cerrada. La creadora la habilita y queda auditado.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a3","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_owner_area_context();
 if x->'modules'->'recibos_personal'->>'authorized'<>'false' or x->'modules'->'recibos_personal'->>'reason'<>'module_not_enabled' then raise exception 'Linked but not enabled exposed module';end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a6","email":"platform-admin@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',true);
 if (x->>'enabled')::boolean is not true or (x->>'changed')::boolean is not true then raise exception 'Enable failed';end if;
 x:=public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',true);
 if (x->>'changed')::boolean then raise exception 'Repeated enable not idempotent';end if;
 x:=public.gestlok_creator_companies_index();
 if not exists(select 1 from jsonb_array_elements(x->'companies') c where c->>'tenant_id'='00000000-0000-4000-8000-0000000000a1' and (c->'modules'->>'recibos_personal')::boolean and c->'recibonet'->>'organization_number'='2099001') then raise exception 'Registry does not show module';end if;
 if x::text like '%owner-a@example.invalid%' then raise exception 'Registry leaked contact data';end if;
 x:=public.gestlok_creator_audit();
 if (select count(*) from jsonb_array_elements(x) a where a->>'action'='module_enabled' and a->>'tenant_id'='00000000-0000-4000-8000-0000000000a1')<>1 then raise exception 'Audit missing or duplicated';end if;
end $$;

-- 4. Solo la empresa habilitada lo ve; otra empresa, un gerente y un visitante no.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a3","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_owner_area_context();
 if x->'modules'->'recibos_personal'->>'authorized'<>'true' or x->'recibonet'->>'organization_number'<>'2099001' or x->>'company_name'<>'Mi Gusto' then raise exception 'Enabled module not visible: %',x;end if;
 begin perform public.gestlok_creator_audit();raise exception 'Owner read admin audit';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a5","email":"owner-b@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_owner_area_context();
 if x->'modules'->'recibos_personal'->>'authorized'<>'false' or x->'recibonet'<>'null'::jsonb then raise exception 'Other company inherited module';end if;
 if x->'local_ids' ? 'emp-fixture-munro' then raise exception 'Other company saw foreign local';end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a4","email":"manager-a@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_owner_area_context();raise exception 'Manager got owner context';exception when insufficient_privilege then null;end;
 begin perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',false);raise exception 'Manager changed module';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',false);raise exception 'Anonymous changed module';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- 5. Deshabilitar cierra el acceso de inmediato y también queda auditado.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a6","email":"platform-admin@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 perform public.gestlok_creator_set_module('00000000-0000-4000-8000-0000000000a1','recibos_personal',false);
 x:=public.gestlok_creator_audit();
 if not exists(select 1 from jsonb_array_elements(x) a where a->>'action'='module_disabled') then raise exception 'Disable not audited';end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000a3","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ begin
 if public.gestlok_owner_area_context()->'modules'->'recibos_personal'->>'authorized'<>'false' then raise exception 'Disabled module still visible';end if;
end $$;
reset role;
rollback;
select 'PASS: employee module requires verified ReciboNet link + explicit creator grant; audited; isolated by company; owner/manager/anon cannot change it; fixtures rolled back' as verification;
