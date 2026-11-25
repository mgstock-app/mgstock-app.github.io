-- GESTLOK HQ · límites diarios para trabajar siempre dentro del plan gratuito de Groq
-- (openai/gpt-oss-20b Free: 1.000 solicitudes y 200.000 tokens por día; 30 solicitudes y 8.000 tokens por minuto).
-- Pedido de la administradora (25/11/2026): cada empleado tiene un límite por día y el equipo nunca agota el plan.
--   · Equipo: 30 consultas por 24 h.
--   · Cada empleado: 4 consultas por 24 h (Alex: 8, porque arma el informe final).
--   · Tokens: 150.000 por 24 h (75 % del plan gratis), contados con el uso real que informa Groq.
--     Antes de cada consulta se reservan 5.000 tokens; sin dato real se estima 4.000 por consulta.

alter table gestlok_hq_private.agent_runs
  add column if not exists tokens integer check (tokens between 0 and 100000);

create or replace function gestlok_hq_private.limites() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('consultas_dia', 30, 'por_empleado', 4, 'alex', 8,
    'tokens_dia', 150000, 'reserva_tokens', 5000, 'estimado_por_consulta', 4000)
$$;
revoke all on function gestlok_hq_private.limites() from public, anon, authenticated;

-- Uso real de tokens de una consulta (solo el servidor, con el dato que devuelve Groq).
create or replace function gestlok_hq_private.record_tokens(p_user uuid, p_run uuid, p_tokens integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_tokens is null or p_tokens < 0 then return false; end if;
  update gestlok_hq_private.agent_runs set tokens = least(p_tokens, 100000)
   where id = p_run and creator_id = p_user;
  return found;
end $$;
revoke all on function gestlok_hq_private.record_tokens(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function gestlok_hq_private.record_tokens(uuid, uuid, integer) to service_role;
create or replace function public.gestlok_hq_record_tokens(p_user uuid, p_run uuid, p_tokens integer) returns boolean
language sql security invoker set search_path = '' as $$ select gestlok_hq_private.record_tokens(p_user, p_run, p_tokens) $$;
revoke all on function public.gestlok_hq_record_tokens(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.gestlok_hq_record_tokens(uuid, uuid, integer) to service_role;

-- Uso de las últimas 24 h: total, por empleado y tokens.
create or replace function gestlok_hq_private.uso(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usadas', coalesce((select sum(r.quota_units) from gestlok_hq_private.agent_runs r
                        where r.creator_id = p_user and r.created_at > now() - interval '24 hours'), 0),
    'tokens_usados', coalesce((select sum(coalesce(r.tokens, r.quota_units * 4000)) from gestlok_hq_private.agent_runs r
                        where r.creator_id = p_user and r.created_at > now() - interval '24 hours'), 0),
    'por_empleado', coalesce((select jsonb_object_agg(z.agent, z.u) from (
                        select q.agent, sum(r.quota_units) u from gestlok_hq_private.agent_runs r
                        join gestlok_hq_private.tasks q on q.id = r.task_id
                        where r.creator_id = p_user and r.created_at > now() - interval '24 hours'
                        group by q.agent) z), '{}'::jsonb))
$$;
revoke all on function gestlok_hq_private.uso(uuid) from public, anon, authenticated;

-- La creadora ve límites y uso en el pulso.
create or replace function gestlok_hq_private.pulso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := gestlok_hq_private.require_creator();
begin
  return gestlok_hq_private.pulso_datos() || jsonb_build_object(
    'jornada', (select jsonb_build_object('activa', w.daily_enabled, 'ultima', w.daily_last,
                  'pausa_hasta', w.paused_until, 'ultimo_control', w.last_tick)
                from gestlok_hq_private.worker_control w where w.id = 1),
    'cupo', gestlok_hq_private.limites() || gestlok_hq_private.uso(v));
end $$;
revoke all on function gestlok_hq_private.pulso() from public, anon, authenticated;
grant execute on function gestlok_hq_private.pulso() to authenticated;

-- Reserva con los tres límites: equipo, empleado y tokens.
create or replace function gestlok_hq_private.claim_run(p_user uuid, p_task uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare t gestlok_hq_private.tasks%rowtype; v uuid; units integer:=1; entries jsonb:=null; parent_instruction text;
  lim jsonb := gestlok_hq_private.limites(); u jsonb; cap integer;
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
 u := gestlok_hq_private.uso(p_user);
 if (u->>'usadas')::integer + units > (lim->>'consultas_dia')::integer then
  raise exception 'Límite diario del equipo: % consultas de IA por 24 horas (plan gratuito)', lim->>'consultas_dia' using errcode='22023'; end if;
 cap := case when t.agent='lider' then (lim->>'alex')::integer else (lim->>'por_empleado')::integer end;
 if coalesce((u->'por_empleado'->>t.agent)::integer,0) + units > cap then
  raise exception 'Límite diario de este empleado: % consultas por 24 horas (plan gratuito)', cap using errcode='22023'; end if;
 if (u->>'tokens_usados')::bigint + (lim->>'reserva_tokens')::integer * units > (lim->>'tokens_dia')::integer then
  raise exception 'Límite diario de tokens alcanzado (plan gratuito)' using errcode='22023'; end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id,quota_units) values(p_task,p_user,units) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',left(t.instruction||case when parent_instruction is null then '' else E'\nObjetivo de Dirección: '||parent_instruction end,4000),'entries',entries);
end $function$;

-- El worker respeta los límites: si no hay lugar, espera a que se libere sin consultar a Groq.
create or replace function gestlok_hq_private.worker_claim(p_token text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare m gestlok_hq_private.tasks%rowtype; next_id uuid; claim jsonb; lim jsonb := gestlok_hq_private.limites(); u jsonb;
begin
 if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(60201125) then return null; end if;
 update gestlok_hq_private.worker_control set last_tick=now() where id=1;
 update gestlok_hq_private.agent_runs set state='error',result='Ejecución interrumpida: no se confirmó la respuesta. Cuota reservada conservada.',finished_at=now() where state='working' and created_at<now()-interval '15 minutes';
 if exists(select 1 from gestlok_hq_private.worker_control where paused_until>now()) then return null; end if;
 perform gestlok_hq_private.daily_mission();
 select t.* into m from gestlok_hq_private.tasks t where t.agent='lider' and t.status='pendiente' and t.auto_enabled and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=t.id) order by t.auto_started_at,t.id limit 1;
 if not found then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(m.creator_id::text,0));
 select * into m from gestlok_hq_private.tasks where id=m.id and status='pendiente' and auto_enabled for update;
 if not found then return null; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where creator_id=m.creator_id and state='working') then return null; end if;
 u := gestlok_hq_private.uso(m.creator_id);
 if (u->>'usadas')::integer >= (lim->>'consultas_dia')::integer
   or (u->>'tokens_usados')::bigint + (lim->>'reserva_tokens')::integer > (lim->>'tokens_dia')::integer then return null; end if;
 -- Próximo sector que todavía tenga lugar en su límite diario.
 select q.id into next_id from gestlok_hq_private.tasks q
  where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status='pendiente'
    and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=q.id)
    and coalesce((u->'por_empleado'->>q.agent)::integer,0) < (lim->>'por_empleado')::integer
  order by case when q.agent='soporte' then 0 else 1 end,q.created_at,q.id limit 1;
 if next_id is null then
  if exists(select 1 from gestlok_hq_private.tasks q where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status='pendiente'
            and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=q.id)) then return null; end if;
  if not exists(select 1 from gestlok_hq_private.tasks q join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status<>'cancelada' and r.state='review') then
   update gestlok_hq_private.tasks set auto_enabled=false,updated_at=now() where id=m.id; return null;
  end if;
  next_id:=m.id;
 end if;
 begin
  claim:=gestlok_hq_private.claim_run(m.creator_id,next_id);
 exception when sqlstate '22023' then return null;
 end;
 return claim||jsonb_build_object('creator_id',m.creator_id,'mission_id',m.id);
end $function$;
