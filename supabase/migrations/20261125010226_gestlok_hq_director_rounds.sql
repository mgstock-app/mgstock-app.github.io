-- Dirección de IA: reunión con seis propuestas y una evaluación. No habilita ejecución de cambios.
alter table gestlok_hq_private.tasks drop constraint tasks_agent_check, add constraint tasks_agent_check check(agent in ('desarrollo','calidad','testing','atencion','marketing','datos','lider'));
create or replace function gestlok_hq_private.claim_run(p_user uuid,p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t gestlok_hq_private.tasks%rowtype; v uuid; units integer;
begin
 if not exists(select 1 from auth.users u join gestlok_platform.admins a on a.user_id=u.id where u.id=p_user and lower(u.email)='kmu15lopez@gmail.com' and u.email_confirmed_at is not null) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select * into t from gestlok_hq_private.tasks where id=p_task and creator_id=p_user and status='pendiente' for update;
 if not found then raise exception 'Tarea no disponible' using errcode='22023'; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task) then raise exception 'La tarea ya fue ejecutada' using errcode='22023'; end if;
 units:=case when t.agent='lider' then 7 else 1 end;
 if (select coalesce(sum(case when q.agent='lider' then 7 else 1 end),0) from gestlok_hq_private.agent_runs r join gestlok_hq_private.tasks q on q.id=r.task_id where r.creator_id=p_user and r.created_at>now()-interval '24 hours')+units>10 then raise exception 'Límite de 10 consultas de IA por 24 horas' using errcode='22023'; end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id) values(p_task,p_user) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',t.instruction);
end $$;
