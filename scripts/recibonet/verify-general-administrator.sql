-- Run only on the confirmed ReciboNet project. Read-only diagnostic, not login.
begin transaction read only;
do $$ declare v_id uuid;v_email text;begin
 if (select count(*) from rm_test_private.general_administrator)<>1 then raise exception 'Administrator identity is not unambiguous';end if;
 select a.user_id,u.email into v_id,v_email from rm_test_private.general_administrator a join auth.users u on u.id=a.user_id where u.email_confirmed_at is not null;
 if v_id is null then raise exception 'Administrator identity not verified';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_id,'email',v_email,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare n integer;begin
 if not rm_test_private.is_general_administrator() then raise exception 'No server-side administrator authorization';end if;
 select count(*) into n from public.rm_test_documents d join public.rm_organizations o on o.id=d.organization_id
 where o.owner_number='2026002' and d.collection='hojas';
 if n<>17 then raise exception 'Expected 17 authorized sheets';end if;
end $$;
rollback;
select 'PASS: verified general administrator reads 17 sheets; no owner login or data write' as verification;
