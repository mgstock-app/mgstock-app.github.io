-- Independent, auditable hiring decision. Approval records intent, not credentials or provisioning.
alter table gestlok_hq_private.agent_runs add column hire_request jsonb, add column hire_decision text check(hire_decision in ('approved','rejected')), add column hire_decided_at timestamptz;
create or replace function gestlok_hq_private.list_runs() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select id,task_id,state,result,created_at,finished_at,hire_request,hire_decision,hire_decided_at from gestlok_hq_private.agent_runs where creator_id=v order by created_at desc limit 200) r),'[]'::jsonb); end $$;
create function gestlok_hq_private.finish_director(p_user uuid,p_run uuid,p_state text,p_result text,p_hire jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state is null or p_state not in ('review','error') then raise exception 'Estado inválido'; end if;
 if p_hire is not null and (p_state<>'review' or jsonb_typeof(p_hire)<>'object' or length(p_hire::text)>6000 or coalesce(length(btrim(p_hire->>'specialty')),0)=0 or coalesce(length(btrim(p_hire->>'reason')),0)=0) then raise exception 'Solicitud inválida'; end if;
 update gestlok_hq_private.agent_runs r set state=p_state,result=left(p_result,16000),finished_at=now(),hire_request=p_hire
 where r.id=p_run and r.creator_id=p_user and r.state='working' and exists(select 1 from gestlok_hq_private.tasks t where t.id=r.task_id and t.creator_id=p_user and t.agent='lider');
 return found;
end $$;
revoke all on function gestlok_hq_private.finish_director(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function gestlok_hq_private.finish_director(uuid,uuid,text,text,jsonb) to service_role;
create function public.gestlok_hq_finish_director(p_user uuid,p_run uuid,p_state text,p_result text,p_hire jsonb) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.finish_director(p_user,p_run,p_state,p_result,p_hire) $$;
revoke all on function public.gestlok_hq_finish_director(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_hq_finish_director(uuid,uuid,text,text,jsonb) to service_role;
create function gestlok_hq_private.decide_hire(p_run uuid,p_decision text) returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Decisión inválida'; end if;
 update gestlok_hq_private.agent_runs r set hire_decision=p_decision,hire_decided_at=now()
 where r.id=p_run and r.creator_id=v and r.state='review' and r.hire_request is not null and r.hire_decision is null and exists(select 1 from gestlok_hq_private.tasks t where t.id=r.task_id and t.creator_id=v and t.agent='lider');
 return found;
end $$;
revoke all on function gestlok_hq_private.decide_hire(uuid,text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.decide_hire(uuid,text) to authenticated;
create function public.gestlok_hq_decide_hire(p_run uuid,p_decision text) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.decide_hire(p_run,p_decision) $$;
revoke all on function public.gestlok_hq_decide_hire(uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_decide_hire(uuid,text) to authenticated;
