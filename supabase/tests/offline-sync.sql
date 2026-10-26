-- Run with migration in BEGIN/ROLLBACK. All records below are fictional.
do $test$
declare actor uuid; account uuid:=gen_random_uuid(); company jsonb; tenant uuid; local text;
 id uuid:=gen_random_uuid(); op jsonb; first jsonb; again jsonb; actual jsonb; conflict boolean:=false;
begin
 select user_id into actor from gestlok_platform.admins order by user_id limit 1;
 insert into auth.users(id,email,email_confirmed_at) values(account,'offline-owner@example.invalid',now());
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'email',(select u.email from auth.users u where u.id=actor),'role','authenticated')::text,true);
 company:=public.gestlok_creator_prepare_company('Offline ficticia','offline-owner@example.invalid','fisica','Local de prueba');
 tenant:=(company->>'tenant_id')::uuid;local:=company->>'local_id';
 perform set_config('request.jwt.claims',json_build_object('sub',account,'email','offline-owner@example.invalid','role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 if public.gestlok_sync_context()->>'tenant' is distinct from tenant::text then raise exception 'Wrong offline identity';end if;
 op:=jsonb_build_object('kind','table','table','docs','method','POST','rows',jsonb_build_array(jsonb_build_object(
  'key',jsonb_build_object('col',local||'/productos','id','offline-product'),
  'body',jsonb_build_object('col',local||'/productos','id','offline-product','data','{"nombre":"Producto ficticio","stock":2}'::jsonb),'check',true,'exists',false)));
 first:=public.gestlok_sync_apply(id,tenant,op,true);again:=public.gestlok_sync_apply(id,tenant,op,true);
 if first is distinct from again then raise exception 'Retry changed response';end if;
 if (select count(*) from public.docs where col=local||'/productos' and docs.id='offline-product')<>1 then raise exception 'Duplicate insertion';end if;
 begin perform public.gestlok_sync_apply(id,tenant,op||'{"different":true}',true);raise exception 'Reused id accepted';exception when others then if sqlerrm='Reused id accepted' then raise;end if;end;
 op:=jsonb_build_object('kind','table','table','docs','method','PATCH','rows',jsonb_build_array(jsonb_build_object(
  'key',jsonb_build_object('col',local||'/productos','id','offline-product'),'body','{"data":{"stock":3}}'::jsonb,'merge_data',true,'check',true,'exists',true,'expected','{"nombre":"Producto ficticio","stock":2}'::jsonb)));
 perform public.gestlok_sync_apply(gen_random_uuid(),tenant,op,true);
 select data into actual from public.docs where col=local||'/productos' and docs.id='offline-product';
 if actual->>'stock'<>'3' or actual->>'nombre'<>'Producto ficticio' then raise exception 'Patch replaced unrelated data';end if;
 begin perform public.gestlok_sync_apply(gen_random_uuid(),tenant,op,true);exception when others then conflict:=sqlerrm like 'SYNC_CONFLICT%';end;
 if not conflict then raise exception 'Stale data overwrote current value';end if;
 begin perform public.gestlok_sync_apply(gen_random_uuid(),gen_random_uuid(),op,true);raise exception 'Other tenant accepted';exception when insufficient_privilege then null;end;
 begin perform public.gestlok_sync_apply(gen_random_uuid(),tenant,'{"kind":"rpc","name":"gestlok_creator_set_module","args":{}}',true);raise exception 'Unlisted RPC accepted';exception when others then if sqlerrm='Unlisted RPC accepted' then raise;end if;end;
 -- Named argument conversion and existing owner checks are preserved.
 perform public.gestlok_sync_apply(gen_random_uuid(),tenant,jsonb_build_object('kind','rpc','name','rm_app_set_branch_schedule_link','args',jsonb_build_object('p_local',local,'p_url','https://docs.google.com/spreadsheets/d/FICTICIO_123/edit'),'expected_link',null),false);
 perform set_config('role','postgres',true);
 if (select count(*) from gestlok_sync_private.receipts where user_id=account)<>3 then raise exception 'Receipts missing or failed actions committed';end if;
 perform set_config('role','anon',true);
 begin perform public.gestlok_sync_context();raise exception 'Anonymous offline access';exception when insufficient_privilege then null;end;
 perform set_config('role','postgres',true);
end $test$;
select 'OK: same-account scope, once-only retry, stable IDs, data merge, conflict, tenant denial, RPC allowlist, existing permissions, anonymous denial' as result;
