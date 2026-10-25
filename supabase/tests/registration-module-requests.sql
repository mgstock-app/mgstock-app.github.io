-- Synthetic accounts only. All fixtures and changes MUST roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values('00000000-0000-4000-8000-000000000061','registration-qa@example.invalid',now(),'{}','{"provider":"email"}'),
 ('00000000-0000-4000-8000-000000000062','registration-unconfirmed@example.invalid',null,'{}','{}');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000061","email":"registration-qa@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; v_modules text[]; begin
 foreach v_modules slice 1 in array array[['comercial'],['recibos_personal']] loop
  x:=public.gestlok_request_registration('dueno',v_modules);
  if x->>'status'<>'pending' or public.gestlok_my_registration()->'modules'<>to_jsonb(v_modules) then raise exception 'Single module request failed'; end if;
 end loop;
 x:=public.gestlok_request_registration('dueno',array['recibos_personal','comercial']);
 if x->'modules'<>'["comercial","recibos_personal"]'::jsonb then raise exception 'Both modules failed'; end if;
 if public.mi_rol() is not null then raise exception 'Request granted a role'; end if;
 begin perform public.gestlok_request_registration('creadora',array['comercial']);raise exception 'Accepted creator intent';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_request_registration('dueno',array['admin']);raise exception 'Accepted unknown module';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_request_registration('dueno',array['comercial','comercial']);raise exception 'Accepted duplicate module';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_request_registration('dueno',array[]::text[]);raise exception 'Accepted empty owner intent';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_request_registration('colaborador',array['recibos_personal']);raise exception 'Collaborator requested modules';exception when invalid_parameter_value then null;end;
 x:=public.gestlok_request_registration('colaborador',array[]::text[]);
 if x->'modules'<>'[]'::jsonb then raise exception 'Collaborator intent failed'; end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000061","email":"someone-else@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_my_registration();raise exception 'Identity spoof accepted';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000062","email":"registration-unconfirmed@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_request_registration('dueno',array['comercial']);raise exception 'Unconfirmed account accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values('00000000-0000-4000-8000-000000000063','registration-admin-qa@example.invalid',now(),'{}','{}');
insert into gestlok_platform.admins(user_id) values('00000000-0000-4000-8000-000000000063');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000061","email":"registration-qa@example.invalid","role":"authenticated"}';
do $$ begin
 begin perform public.gestlok_creator_registration_requests();raise exception 'Non-admin read all requests';exception when insufficient_privilege then null;end;
 begin perform public.gestlok_review_registration('00000000-0000-4000-8000-000000000061','assigned');raise exception 'Self-approved request';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000063","email":"registration-admin-qa@example.invalid","role":"authenticated"}';
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.gestlok_creator_registration_requests()) r where r->>'email'='registration-qa@example.invalid') then raise exception 'Creator cannot review request';end if;
 if public.gestlok_my_registration() is not null then raise exception 'Own-request endpoint exposed another account';end if;
 begin perform public.gestlok_review_registration('00000000-0000-4000-8000-000000000061','assigned');raise exception 'Marked assigned without membership';exception when insufficient_privilege then null;end;
 perform public.gestlok_review_registration('00000000-0000-4000-8000-000000000061','rejected');
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000061","email":"registration-qa@example.invalid","role":"authenticated"}';
do $$ begin
 if public.gestlok_my_registration()->>'status'<>'rejected' then raise exception 'Review status not saved';end if;
 perform public.gestlok_request_registration('dueno',array['recibos_personal']);
 if public.gestlok_my_registration()->>'status'<>'pending' then raise exception 'Explicit resubmission failed';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.gestlok_my_registration();raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;
 begin perform public.gestlok_request_registration('dueno',array['comercial']);raise exception 'Anonymous request accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: three owner choices; collaborator; invalid/duplicate/empty modules; no role grant; verified identity; anonymous denial; rolled back' as verification;
