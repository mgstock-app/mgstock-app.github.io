-- Run only after the quota operation in the isolated test project.
-- Fixtures are synthetic and the transaction is always rolled back.
begin;
do $$
declare
 a text:=repeat('a',64); b text:=repeat('b',64); c text:=repeat('c',64);
 d text:=repeat('d',64); e text:=repeat('e',64); f text:=repeat('f',64);
 m timestamptz:=clock_timestamp()-interval '15 days'; n timestamptz:=clock_timestamp()+interval '15 days';
begin
 if exists(select 1 from gestlok_ycloud_pilot_private.quota_windows) or exists(select 1 from gestlok_ycloud_pilot_private.quota_reservations) then
  raise exception 'Expected an empty synthetic quota ledger before the rehearsal';
 end if;
 if has_table_privilege('anon','gestlok_ycloud_pilot_private.quota_windows','select') or
    has_table_privilege('authenticated','gestlok_ycloud_pilot_private.quota_reservations','insert') or
    has_function_privilege('anon','public.gestlok_ycloud_pilot_reserve_quota(text,text,integer)','execute') or
    has_function_privilege('authenticated','public.gestlok_ycloud_pilot_reserve_quota(text,text,integer)','execute') or
    has_table_privilege('service_role','gestlok_ycloud_pilot_private.quota_windows','insert,update,delete') or
    has_table_privilege('service_role','gestlok_ycloud_pilot_private.quota_reservations','update,delete') then
  raise exception 'Unexpected quota permission';
 end if;
 insert into gestlok_ycloud_pilot_private.quota_windows(sender_key,period_start,period_end,observed_at,used_upper_bound,unresolved_upper_bound,evidence_key,blocked)
 values (a,m,n,clock_timestamp(),896,1,a,false),
        (b,m,n,clock_timestamp(),0,0,b,false),
        (c,m,n,clock_timestamp()-interval '6 minutes',0,0,c,false),
        (d,m,n,clock_timestamp(),0,0,d,true),
        (e,m,n,clock_timestamp(),0,0,e,false),
        (e,m-interval '1 hour',n-interval '1 hour',clock_timestamp(),0,0,e,false),
        (f,clock_timestamp()-interval '30 days',clock_timestamp()+interval '2 minutes',clock_timestamp(),0,0,f,false),
        (a,m-interval '30 days',m,m-interval '1 day',0,0,a,false);
 -- Pending deliveries from a prior month must remain counted.
 insert into gestlok_ycloud_pilot_private.quota_reservations(sender_key,period_start,message_key,units)
 values(a,m-interval '30 days',repeat('1',64),1);
end $$;
set local role service_role;
do $$
declare a text:=repeat('a',64); b text:=repeat('b',64); r jsonb;
begin
 r:=public.gestlok_ycloud_pilot_reserve_quota(a,repeat('2',64),2);
 if r is distinct from '{"reserved":true,"reason":"simulated_reservation","simulated":true,"sendAllowed":false,"remaining":0}'::jsonb then
  raise exception 'Expected conservative ceiling: %',r;
 end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(a,repeat('2',64),2);
 if r->>'reason' is distinct from 'duplicate' or r->>'sendAllowed' is distinct from 'false' then raise exception 'Duplicate reservation: %',r; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(a,repeat('1',64),1);
 if r->>'reason' is distinct from 'duplicate' then raise exception 'Duplicate crossed a period'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(a,repeat('3',64),1);
 if r->>'reason' is distinct from 'limit_reached' or r->>'remaining' is distinct from '0' then raise exception 'Limit not enforced'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(b,repeat('2',64),1);
 if r->>'remaining' is distinct from '899' or r->>'sendAllowed' is distinct from 'false' then raise exception 'Commercial numbers are not isolated'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(repeat('c',64),repeat('4',64),1);
 if r->>'reason' is distinct from 'stale_or_boundary_evidence' then raise exception 'Stale quota accepted'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(repeat('d',64),repeat('4',64),1);
 if r->>'reason' is distinct from 'blocked' then raise exception 'Blocked quota accepted'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(repeat('e',64),repeat('4',64),1);
 if r->>'reason' is distinct from 'no_unique_current_evidence' then raise exception 'Ambiguous period accepted'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(repeat('f',64),repeat('4',64),1);
 if r->>'reason' is distinct from 'stale_or_boundary_evidence' then raise exception 'Period boundary accepted'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(repeat('0',64),repeat('4',64),1);
 if r->>'reason' is distinct from 'no_unique_current_evidence' then raise exception 'Unknown quota accepted'; end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(b,repeat('4',64),0);
 if r->>'reason' is distinct from 'invalid_request' then raise exception 'Invalid units accepted'; end if;
 if (select count(*) from gestlok_ycloud_pilot_private.quota_reservations)<>3 then raise exception 'Duplicate or denied request wrote a reservation'; end if;
end $$;
reset role;
select 'quota_limit_isolation_dedup_rls_passed' as verification;
rollback;
