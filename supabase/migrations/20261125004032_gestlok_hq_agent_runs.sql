-- HQ assistant runs: one explicit execution per task, bounded daily usage, private results.
create table gestlok_hq_private.agent_runs (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null unique references gestlok_hq_private.tasks(id),
 creator_id uuid not null,
 state text not null default 'working' check(state in ('working','review','error')),
 result text check(char_length(result)<=16000),
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
alter table gestlok_hq_private.agent_runs enable row level security;
revoke all on gestlok_hq_private.agent_runs from public,anon,authenticated;
create index hq_agent_runs_creator_date on gestlok_hq_private.agent_runs(creator_id,created_at);
create function gestlok_hq_private.list_runs() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)
 from (select id,task_id,state,result,created_at,finished_at from gestlok_hq_private.agent_runs where creator_id=v order by created_at desc limit 200) r),'[]'::jsonb);
end $$;
revoke all on function gestlok_hq_private.list_runs() from public,anon,authenticated;
grant execute on function gestlok_hq_private.list_runs() to authenticated;
create function public.gestlok_hq_list_runs() returns jsonb language sql stable security invoker set search_path='' as $$ select gestlok_hq_private.list_runs() $$;
revoke all on function public.gestlok_hq_list_runs() from public,anon,authenticated;
grant execute on function public.gestlok_hq_list_runs() to authenticated;
grant usage on schema gestlok_hq_private to service_role;
create function gestlok_hq_private.claim_run(p_user uuid,p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t gestlok_hq_private.tasks%rowtype; v uuid;
begin
 if not exists(select 1 from auth.users u join gestlok_platform.admins a on a.user_id=u.id where u.id=p_user and lower(u.email)='kmu15lopez@gmail.com' and u.email_confirmed_at is not null) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select * into t from gestlok_hq_private.tasks where id=p_task and creator_id=p_user and status='pendiente' for update;
 if not found then raise exception 'Tarea no disponible' using errcode='22023'; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task) then raise exception 'La tarea ya fue ejecutada' using errcode='22023'; end if;
 if (select count(*) from gestlok_hq_private.agent_runs where creator_id=p_user and created_at>now()-interval '24 hours')>=10 then raise exception 'Límite de 10 ejecuciones por 24 horas' using errcode='22023'; end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id) values(p_task,p_user) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',t.instruction);
end $$;
create function gestlok_hq_private.finish_run(p_user uuid,p_run uuid,p_state text,p_result text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_state is null or p_state not in ('review','error') then raise exception 'Estado inválido'; end if;
 update gestlok_hq_private.agent_runs set state=p_state,result=left(p_result,16000),finished_at=now()
 where id=p_run and creator_id=p_user and state='working';
 return found;
end $$;
revoke all on function gestlok_hq_private.claim_run(uuid,uuid),gestlok_hq_private.finish_run(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.claim_run(uuid,uuid),gestlok_hq_private.finish_run(uuid,uuid,text,text) to service_role;
create function public.gestlok_hq_claim_run(p_user uuid,p_task uuid) returns jsonb language sql security invoker set search_path='' as $$ select gestlok_hq_private.claim_run(p_user,p_task) $$;
create function public.gestlok_hq_finish_run(p_user uuid,p_run uuid,p_state text,p_result text) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.finish_run(p_user,p_run,p_state,p_result) $$;
revoke all on function public.gestlok_hq_claim_run(uuid,uuid),public.gestlok_hq_finish_run(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_claim_run(uuid,uuid),public.gestlok_hq_finish_run(uuid,uuid,text,text) to service_role;
