-- Run ONLY on the confirmed ReciboNet project gpdrqxnqtofkkkqjsdqw.
-- No inserts, updates, deletes, restores or schema changes.
-- Baseline unaffiliated/anonymous denial; NOT a complete role isolation suite.
begin transaction read only;
set local role anon;
do $$ declare t text; n bigint; begin
 foreach t in array array['rm_test_documents','rm_app_local','rm_schedules','rm_schedule_comments','rm_app_images','rm_app_directory'] loop
  begin
   execute format('select count(*) from public.%I',t) into n;
   if n<>0 then raise exception 'Unauthenticated data exposure in %',t using errcode='22023'; end if;
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
rollback;

begin transaction read only;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000058","role":"authenticated"}';
do $$ declare t text; n bigint; begin
 foreach t in array array['rm_test_documents','rm_app_local','rm_schedules','rm_schedule_comments','rm_app_images','rm_app_directory'] loop
  begin
   execute format('select count(*) from public.%I',t) into n;
   if n<>0 then raise exception 'Unassigned account data exposure in %',t using errcode='22023'; end if;
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
rollback;
