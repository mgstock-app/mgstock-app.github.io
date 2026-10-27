begin;
insert into gestlok_tenancy.tenants(id,code) values
 ('00000000-0000-4000-8000-000000000091','owner-area-fixture-a'),('00000000-0000-4000-8000-000000000092','owner-area-fixture-b');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
 ('00000000-0000-4000-8000-000000000093','owner-a@example.invalid',now(),'{"role":"creadora","modules":["recibos_personal"]}','{}'),
 ('00000000-0000-4000-8000-000000000094','coowner-a@example.invalid',now(),'{}','{}'),
 ('00000000-0000-4000-8000-000000000095','manager-a@example.invalid',now(),'{}','{}');
insert into public.docs(col,id,data,tenant_id) values
 ('locales','owner-fixture-munro','{"nombre":"Munro ficticio"}','00000000-0000-4000-8000-000000000091'),
 ('locales','owner-fixture-torcuato','{"nombre":"Torcuato ficticio"}','00000000-0000-4000-8000-000000000091'),
 ('locales','owner-fixture-foreign','{"nombre":"Otro negocio"}','00000000-0000-4000-8000-000000000092'),
 ('equipo','owner-a@example.invalid','{"email":"owner-a@example.invalid","rol":"dueno","logoId":"mi-gusto"}','00000000-0000-4000-8000-000000000091'),
 ('equipo','coowner-a@example.invalid','{"email":"coowner-a@example.invalid","rol":"dueno","logoId":"mi-gusto"}','00000000-0000-4000-8000-000000000091'),
 ('equipo','manager-a@example.invalid','{"email":"manager-a@example.invalid","rol":"gerente","locales":["owner-fixture-munro"]}','00000000-0000-4000-8000-000000000091');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000093","email":"owner-a@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; n integer; begin
 x:=public.gestlok_owner_area_context();
 if x->>'company_name'<>'Mi Gusto' or x->>'logo_id'<>'mi-gusto' or jsonb_array_length(x->'local_ids')<>2 then raise exception 'Owner company context incorrect';end if;
 if x->'modules'->'recibos_personal'->>'authorized'<>'false' then raise exception 'Signup metadata granted employee module';end if;
 begin perform public.gestlok_creator_companies_index();raise exception 'Visual creator metadata granted global registry';exception when insufficient_privilege then null;end;
 if x->'local_ids' ? 'owner-fixture-foreign' then raise exception 'Foreign local in context';end if;
 select count(*) into n from public.docs where col='locales' and id='owner-fixture-foreign';if n<>0 then raise exception 'RLS leaked foreign local';end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000094","email":"coowner-a@example.invalid","role":"authenticated"}';
do $$ declare x jsonb;begin
 x:=public.gestlok_owner_area_context();
 if x->>'tenant_id'<>'00000000-0000-4000-8000-000000000091' or jsonb_array_length(x->'local_ids')<>2 then raise exception 'Co-owner duplicated or changed company';end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000095","email":"manager-a@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_owner_area_context();raise exception 'Manager acquired owner area context';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000096','registry-admin@example.invalid',now());
insert into gestlok_platform.admins(user_id) values('00000000-0000-4000-8000-000000000096');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000096","email":"registry-admin@example.invalid","role":"authenticated"}';
do $$ declare x jsonb;begin
 x:=public.gestlok_creator_companies_index();
 if x->>'scope'<>'metadata_only' or not exists(select 1 from jsonb_array_elements(x->'companies') c where c->>'tenant_id'='00000000-0000-4000-8000-000000000091') then raise exception 'Registry scope incorrect';end if;
 if x::text like '%owner-a@example.invalid%' then raise exception 'Registry leaked contact data';end if;
end $$;
reset role;
do $$ declare v_snapshot uuid;v_owner jsonb;x jsonb;begin
 insert into gestlok_integration_backup.snapshots(source,reason,routines,views,verified) values('gestlok','Synthetic co-owner fixture','[]','[]',true) returning id into v_snapshot;
 select to_jsonb(d) into v_owner from public.docs d where d.col='equipo' and d.id='owner-a@example.invalid';
 insert into gestlok_integration_backup.entities(snapshot_id,schema_name,table_name,row_count,sha256,payload,structure,verified)
 values(v_snapshot,'public','docs',1,'synthetic',jsonb_build_array(v_owner),'{}',true);
 x:=gestlok_integration_backup.preauthorize_verified_coowner('owner-a@example.invalid','new-coowner@example.invalid','00000000-0000-4000-8000-000000000091',array['owner-fixture-munro','owner-fixture-torcuato']);
 if x->>'status'<>'preauthorized_verified_login_required' or x->>'company_created'<>'false' then raise exception 'Co-owner invitation failed';end if;
 x:=gestlok_integration_backup.preauthorize_verified_coowner('owner-a@example.invalid','new-coowner@example.invalid','00000000-0000-4000-8000-000000000091',array['owner-fixture-munro','owner-fixture-torcuato']);
 if x->>'status'<>'already_authorized' then raise exception 'Co-owner not idempotent';end if;
 if (select count(*) from public.docs where col='equipo' and data->>'email'='new-coowner@example.invalid')<>1 then raise exception 'Duplicate co-owner';end if;
 if has_function_privilege('authenticated','gestlok_integration_backup.preauthorize_verified_coowner(text,text,uuid,text[])','EXECUTE') then raise exception 'Operator function exposed';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.gestlok_owner_area_context();raise exception 'Anonymous access';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: owner context, shared company, branding, tenant isolation, manager/anonymous denial, no employee grant from metadata; fixtures rolled back' as verification;
