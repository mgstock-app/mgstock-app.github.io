-- Reserve one free-plan consultation for an explicit HQ conversation, including Alex.
-- All messages/results use the existing creator-only task/run ledger.
create or replace function gestlok_hq_private.claim_chat(p_user uuid, p_task uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 t gestlok_hq_private.tasks%rowtype; v uuid; msg jsonb; lim jsonb; u jsonb; cap integer;
 marker constant text := E'HQ_CHAT_V1\n';
begin
 if not exists(select 1 from auth.users u join gestlok_platform.admins a on a.user_id=u.id
  where u.id=p_user and lower(u.email)='kmu15lopez@gmail.com' and u.email_confirmed_at is not null) then
  raise exception 'Acceso denegado' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 select * into t from gestlok_hq_private.tasks where id=p_task and creator_id=p_user and status='pendiente' for update;
 if not found or left(t.instruction,length(marker))<>marker or t.parent_task_id is not null
  or t.auto_enabled or t.agent not in ('lider','desarrollo','calidad','testing','atencion','marketing','datos','soporte','difusion','soporte_general')
  or exists(select 1 from gestlok_hq_private.tasks where parent_task_id=p_task)
  or exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task) then
  raise exception 'Consulta no disponible' using errcode='22023';
 end if;
 msg:=substring(t.instruction from length(marker)+1)::jsonb;
 if jsonb_typeof(msg) is distinct from 'object' or coalesce(msg->>'mode','') not in ('private','meeting')
  or jsonb_typeof(msg->'message') is distinct from 'string' or length(btrim(msg->>'message')) not between 1 and 1200 then
  raise exception 'Consulta inválida' using errcode='22023';
 end if;
 -- Fail closed if the environment hasn't received the current free-plan protections.
 if to_regprocedure('gestlok_hq_private.limites()') is null or to_regprocedure('gestlok_hq_private.uso(uuid)') is null then
  raise exception 'Límite gratuito no configurado en este ambiente' using errcode='22023';
 end if;
 lim:=gestlok_hq_private.limites(); u:=gestlok_hq_private.uso(p_user);
 cap:=case when t.agent='lider' then (lim->>'alex')::integer else (lim->>'por_empleado')::integer end;
 if (u->>'usadas')::integer+1>(lim->>'consultas_dia')::integer then
  raise exception 'Límite diario del equipo' using errcode='22023';
 end if;
 if coalesce((u->'por_empleado'->>t.agent)::integer,0)+1>cap then
  raise exception 'Límite diario de este empleado' using errcode='22023';
 end if;
 if (u->>'tokens_usados')::bigint+(lim->>'reserva_tokens')::integer>(lim->>'tokens_dia')::integer then
  raise exception 'Límite diario de tokens' using errcode='22023';
 end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id,quota_units) values(p_task,p_user,1) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',t.instruction);
end $$;
revoke all on function gestlok_hq_private.claim_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function gestlok_hq_private.claim_chat(uuid,uuid) to service_role;
create or replace function public.gestlok_hq_claim_chat(p_user uuid,p_task uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select gestlok_hq_private.claim_chat(p_user,p_task)
$$;
revoke all on function public.gestlok_hq_claim_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_hq_claim_chat(uuid,uuid) to service_role;
