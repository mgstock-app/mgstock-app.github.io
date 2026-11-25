-- HQ staged delegation. Apply as a versioned migration after SQL testing and CI.
-- Existing records stay intact. No external requests or commercial data changes.
begin;
alter table gestlok_hq_private.tasks add column parent_task_id uuid references gestlok_hq_private.tasks(id);
create unique index hq_one_sector_per_mission on gestlok_hq_private.tasks(parent_task_id,agent) where parent_task_id is not null;
alter table gestlok_hq_private.agent_runs add column quota_units integer not null default 1 check(quota_units between 1 and 8);
update gestlok_hq_private.agent_runs r set quota_units=8 from gestlok_hq_private.tasks t where t.id=r.task_id and t.agent='lider';

create or replace function gestlok_hq_private.list_tasks() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select id,agent,instruction,status,created_at,updated_at,parent_task_id from gestlok_hq_private.tasks where creator_id=v order by created_at desc limit 200) t),'[]'::jsonb); end $$;
create or replace function gestlok_hq_private.list_runs() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator();
begin return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select id,task_id,state,result,created_at,finished_at,hire_request,hire_decision,hire_decided_at,quota_units from gestlok_hq_private.agent_runs where creator_id=v order by created_at desc limit 200) r),'[]'::jsonb); end $$;

create function gestlok_hq_private.delegate_mission(p_task uuid,p_reuse_initial boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare v uuid:=gestlok_hq_private.require_creator(); t gestlok_hq_private.tasks%rowtype; a text; purpose text; candidate uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v::text,0));
 select * into t from gestlok_hq_private.tasks where id=p_task and creator_id=v and agent='lider' and status='pendiente' for update;
 if not found or exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task) then raise exception 'Misión no disponible' using errcode='22023'; end if;
 for a,purpose in select * from (values
 ('desarrollo','Analizar mejoras técnicas reversibles y sus riesgos.'),
 ('calidad','Evaluar calidad, permisos y aislamiento multiempresa.'),
 ('testing','Proponer casos de prueba y criterios de aceptación.'),
 ('atencion','Identificar fricciones y mejoras de experiencia del cliente.'),
 ('marketing','Proponer estrategias comerciales orgánicas y gratuitas.'),
 ('datos','Definir indicadores accionables y oportunidades de análisis.'),
 ('soporte','Investigar evidencia preventiva de disponibilidad, roles y locales; elevar incidentes sin modificar sistemas.')
 ) x(agent,purpose) loop
  if exists(select 1 from gestlok_hq_private.tasks where parent_task_id=p_task and agent=a) then continue; end if;
  candidate:=null;
  if p_reuse_initial is true and t.instruction like 'Alcance: GESTLOK · empresa y nuevas microapps%' then
   select q.id into candidate from gestlok_hq_private.tasks q where q.creator_id=v and q.agent=a and q.status='pendiente' and q.parent_task_id is null and q.instruction like 'Misión inicial HQ 01 · %' and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=q.id) order by q.created_at limit 1 for update;
  end if;
  if candidate is not null then
   update gestlok_hq_private.tasks set parent_task_id=p_task,updated_at=now() where id=candidate and creator_id=v;
  else
   insert into gestlok_hq_private.tasks(creator_id,agent,instruction,parent_task_id) values(v,a,left('Asignación de Dirección · Alex. '||purpose||E'\nObjetivo: '||t.instruction,4000),p_task);
  end if;
 end loop;
 return true;
end $$;
revoke all on function gestlok_hq_private.delegate_mission(uuid,boolean) from public,anon,authenticated;
grant execute on function gestlok_hq_private.delegate_mission(uuid,boolean) to authenticated;
create function public.gestlok_hq_delegate_mission(p_task uuid,p_reuse_initial boolean default false) returns boolean language sql security invoker set search_path='' as $$ select gestlok_hq_private.delegate_mission(p_task,p_reuse_initial) $$;
revoke all on function public.gestlok_hq_delegate_mission(uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_hq_delegate_mission(uuid,boolean) to authenticated;

create or replace function gestlok_hq_private.claim_run(p_user uuid,p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t gestlok_hq_private.tasks%rowtype; v uuid; units integer:=1; entries jsonb:=null; parent_instruction text;
begin
 if not exists(select 1 from auth.users u join gestlok_platform.admins a on a.user_id=u.id where u.id=p_user and lower(u.email)='kmu15lopez@gmail.com' and u.email_confirmed_at is not null) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select * into t from gestlok_hq_private.tasks where id=p_task and creator_id=p_user and status='pendiente' for update;
 if not found then raise exception 'Tarea no disponible' using errcode='22023'; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task) then raise exception 'La tarea ya fue ejecutada' using errcode='22023'; end if;
 if t.parent_task_id is not null then
  select instruction into parent_instruction from gestlok_hq_private.tasks where id=t.parent_task_id and creator_id=p_user and status='pendiente' and agent='lider';
  if not found then raise exception 'Misión cerrada' using errcode='22023'; end if;
 end if;
 if t.agent='lider' then
  if exists(select 1 from gestlok_hq_private.tasks where parent_task_id=t.id) then
   if (select count(*) from gestlok_hq_private.tasks where parent_task_id=t.id and creator_id=p_user)<>7 or exists(select 1 from gestlok_hq_private.tasks q left join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=t.id and q.creator_id=p_user and q.status<>'cancelada' and (r.id is null or r.state='working')) then raise exception 'Sectores pendientes' using errcode='22023'; end if;
   if not exists(select 1 from gestlok_hq_private.tasks q join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=t.id and q.creator_id=p_user and q.status<>'cancelada' and r.state='review') then raise exception 'Sin propuestas disponibles' using errcode='22023'; end if;
   select jsonb_agg(jsonb_build_object('area',q.agent,'text',case when q.status<>'cancelada' and r.state='review' then left(r.result,1200) else 'Sin propuesta: '||case when q.status='cancelada' then 'cancelada' else coalesce(r.state,'pendiente') end end) order by q.agent) into entries from gestlok_hq_private.tasks q left join gestlok_hq_private.agent_runs r on r.task_id=q.id and r.creator_id=p_user where q.parent_task_id=t.id and q.creator_id=p_user;
  else
   units:=8;
  end if;
 end if;
 if (select coalesce(sum(quota_units),0) from gestlok_hq_private.agent_runs where creator_id=p_user and created_at>now()-interval '24 hours')+units>10 then raise exception 'Límite de 10 consultas de IA por 24 horas' using errcode='22023'; end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id,quota_units) values(p_task,p_user,units) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',left(t.instruction||case when parent_instruction is null then '' else E'\nObjetivo de Dirección: '||parent_instruction end,4000),'entries',entries);
end $$;
commit;
