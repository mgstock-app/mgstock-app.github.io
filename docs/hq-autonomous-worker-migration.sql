-- HQ autonomous worker: enable only a mission explicitly approved by the creator.
-- Deploy the dedicated worker first; enable the cron job separately after tests.
begin;
alter table gestlok_hq_private.tasks add column auto_enabled boolean not null default false;
alter table gestlok_hq_private.tasks add column auto_started_at timestamptz;
create table gestlok_hq_private.worker_control(
 id integer primary key check(id=1), token_hash text not null, paused_until timestamptz, last_tick timestamptz
);
alter table gestlok_hq_private.worker_control enable row level security;
revoke all on gestlok_hq_private.worker_control from public,anon,authenticated;
create table gestlok_hq_private.support_checks(
 id bigint generated always as identity primary key, checked_at timestamptz not null default now(),
 website_status integer, github_status integer, conclusion text not null,
 detail text not null check(char_length(detail)<=2500)
);
alter table gestlok_hq_private.support_checks enable row level security;
revoke all on gestlok_hq_private.support_checks from public,anon,authenticated;

create or replace function gestlok_hq_private.list_tasks() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select id,agent,instruction,status,created_at,updated_at,parent_task_id,auto_enabled,auto_started_at from gestlok_hq_private.tasks where creator_id=v order by created_at desc limit 200) t),'[]'::jsonb); end $$;
create function gestlok_hq_private.set_auto(p_task uuid,p_enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 if p_enabled is null then raise exception 'Estado inválido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v::text,0));
 if p_enabled and ((select count(*) from gestlok_hq_private.tasks where parent_task_id=p_task and creator_id=v)<>7 or exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task)) then raise exception 'Misión no disponible'; end if;
 update gestlok_hq_private.tasks set auto_enabled=p_enabled,auto_started_at=case when p_enabled then now() else auto_started_at end,updated_at=now() where id=p_task and creator_id=v and agent='lider' and status='pendiente';
 return found;
end $$;
revoke all on function gestlok_hq_private.set_auto(uuid,boolean) from public,anon,authenticated;
grant execute on function gestlok_hq_private.set_auto(uuid,boolean) to authenticated;
create function public.gestlok_hq_set_auto(p_task uuid,p_enabled boolean) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.set_auto(p_task,p_enabled) $$;
revoke all on function public.gestlok_hq_set_auto(uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_hq_set_auto(uuid,boolean) to authenticated;

-- All worker actions are callable only by the server and require the separate cron credential.
create function gestlok_hq_private.worker_auth(p_token text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(length(p_token)=64 and exists(select 1 from gestlok_hq_private.worker_control where id=1 and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')),false)
$$;
revoke all on function gestlok_hq_private.worker_auth(text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.worker_auth(text) to service_role;

create function gestlok_hq_private.worker_claim(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m gestlok_hq_private.tasks%rowtype; next_id uuid; claim jsonb;
begin
 if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(60201125) then return null; end if;
 update gestlok_hq_private.worker_control set last_tick=now() where id=1;
 -- Never repeat an uncertain provider call; retain its reservation and expose a terminal error.
 update gestlok_hq_private.agent_runs set state='error',result='Ejecución interrumpida: no se confirmó la respuesta. Cuota reservada conservada.',finished_at=now() where state='working' and created_at<now()-interval '15 minutes';
 if exists(select 1 from gestlok_hq_private.worker_control where paused_until>now()) then return null; end if;
 select t.* into m from gestlok_hq_private.tasks t where t.agent='lider' and t.status='pendiente' and t.auto_enabled and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=t.id) order by t.auto_started_at,t.id limit 1;
 if not found then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(m.creator_id::text,0));
 select * into m from gestlok_hq_private.tasks where id=m.id and status='pendiente' and auto_enabled for update;
 if not found then return null; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where creator_id=m.creator_id and state='working') then return null; end if;
 if (select coalesce(sum(quota_units),0) from gestlok_hq_private.agent_runs where creator_id=m.creator_id and created_at>now()-interval '24 hours')>=10 then return null; end if;
 select q.id into next_id from gestlok_hq_private.tasks q where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status='pendiente' and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=q.id) order by case when q.agent='soporte' then 0 else 1 end,q.created_at,q.id limit 1;
 if next_id is null then
  if not exists(select 1 from gestlok_hq_private.tasks q join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status<>'cancelada' and r.state='review') then
   update gestlok_hq_private.tasks set auto_enabled=false,updated_at=now() where id=m.id; return null;
  end if;
  next_id:=m.id;
 end if;
 claim:=gestlok_hq_private.claim_run(m.creator_id,next_id);
 return claim||jsonb_build_object('creator_id',m.creator_id,'mission_id',m.id);
end $$;
revoke all on function gestlok_hq_private.worker_claim(text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.worker_claim(text) to service_role;
create function public.gestlok_hq_worker_claim(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select gestlok_hq_private.worker_claim(p_token) $$;
revoke all on function public.gestlok_hq_worker_claim(text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_worker_claim(text) to service_role;

create function gestlok_hq_private.worker_observe(p_token text,p_site integer,p_github integer,p_conclusion text,p_detail text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 insert into gestlok_hq_private.support_checks(website_status,github_status,conclusion,detail) values(p_site,p_github,left(p_conclusion,80),left(p_detail,2500));
 delete from gestlok_hq_private.support_checks where checked_at<now()-interval '30 days';
 return true;
end $$;
revoke all on function gestlok_hq_private.worker_observe(text,integer,integer,text,text) from public,anon,authenticated;
grant execute on function gestlok_hq_private.worker_observe(text,integer,integer,text,text) to service_role;
create function public.gestlok_hq_worker_observe(p_token text,p_site integer,p_github integer,p_conclusion text,p_detail text) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.worker_observe(p_token,p_site,p_github,p_conclusion,p_detail) $$;
revoke all on function public.gestlok_hq_worker_observe(text,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_hq_worker_observe(text,integer,integer,text,text) to service_role;
create function gestlok_hq_private.worker_status(p_token text,p_pause_minutes integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if p_pause_minutes between 1 and 1440 then update gestlok_hq_private.worker_control set paused_until=greatest(coalesce(paused_until,now()),now()+make_interval(mins=>p_pause_minutes)) where id=1; end if;
 return true;
end $$;
revoke all on function gestlok_hq_private.worker_status(text,integer) from public,anon,authenticated;
grant execute on function gestlok_hq_private.worker_status(text,integer) to service_role;
create function public.gestlok_hq_worker_status(p_token text,p_pause_minutes integer) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.worker_status(p_token,p_pause_minutes) $$;
revoke all on function public.gestlok_hq_worker_status(text,integer) from public,anon,authenticated;
grant execute on function public.gestlok_hq_worker_status(text,integer) to service_role;
create function gestlok_hq_private.support_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform gestlok_hq_private.require_creator();
 return jsonb_build_object('worker',(select jsonb_build_object('last_tick',last_tick,'paused_until',paused_until) from gestlok_hq_private.worker_control where id=1),'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.checked_at desc) from (select checked_at,website_status,github_status,conclusion,detail from gestlok_hq_private.support_checks order by checked_at desc limit 10)c),'[]'::jsonb));
end $$;
revoke all on function gestlok_hq_private.support_status() from public,anon,authenticated;
grant execute on function gestlok_hq_private.support_status() to authenticated;
create function public.gestlok_hq_support_status() returns jsonb language sql stable security invoker set search_path='' as $$ select gestlok_hq_private.support_status() $$;
revoke all on function public.gestlok_hq_support_status() from public,anon,authenticated;
grant execute on function public.gestlok_hq_support_status() to authenticated;
-- Generate an isolated worker credential in Vault. Do not expose it to clients.
do $init$
declare token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if not exists(select 1 from gestlok_hq_private.worker_control where id=1) then
  perform vault.create_secret(token,'gestlok_hq_worker_secret','HQ restricted scheduler');
  insert into gestlok_hq_private.worker_control(id,token_hash) values(1,encode(sha256(convert_to(token,'UTF8')),'hex'));
 end if;
end $init$;
commit;
