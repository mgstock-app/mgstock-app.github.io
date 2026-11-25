-- GESTLOK HQ · que el equipo haga su trabajo todos los días.
-- 1) Jornada diaria automática: una misión por día desde las 08:00 (hora de Buenos Aires),
--    enfocada en GESTLOK Chat y los locales activos. Se pausa desde HQ. Solo análisis y propuestas.
-- 2) El trabajo autónomo usa el pulso agregado de los locales (sin datos personales).
-- 3) Cupo interno de 40 consultas por 24 h (Groq Free para openai/gpt-oss-20b permite
--    1.000 solicitudes y 200.000 tokens por día; el cupo anterior de 10 frenaba al equipo).
-- 4) Si Groq rechaza antes de responder (límite, clave o caída), se libera la reserva y la
--    tarea vuelve a quedar pendiente, en lugar de gastar el cupo y quedar en error.

alter table gestlok_hq_private.worker_control
  add column if not exists daily_enabled boolean not null default false,
  add column if not exists daily_last date;

-- 2) Pulso para el servidor autónomo: solo con la credencial del worker.
create or replace function gestlok_hq_private.worker_pulso(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return gestlok_hq_private.pulso_datos();
end $$;
revoke all on function gestlok_hq_private.worker_pulso(text) from public, anon, authenticated;
grant execute on function gestlok_hq_private.worker_pulso(text) to service_role;
create or replace function public.gestlok_hq_worker_pulso(p_token text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select gestlok_hq_private.worker_pulso(p_token) $$;
revoke all on function public.gestlok_hq_worker_pulso(text) from public, anon, authenticated;
grant execute on function public.gestlok_hq_worker_pulso(text) to service_role;

-- La creadora ve en el pulso el estado de la jornada diaria y el cupo.
create or replace function gestlok_hq_private.pulso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := gestlok_hq_private.require_creator();
begin
  return gestlok_hq_private.pulso_datos() || jsonb_build_object(
    'jornada', (select jsonb_build_object('activa', w.daily_enabled, 'ultima', w.daily_last,
                  'pausa_hasta', w.paused_until, 'ultimo_control', w.last_tick)
                from gestlok_hq_private.worker_control w where w.id = 1),
    'cupo', jsonb_build_object('limite', 40));
end $$;
revoke all on function gestlok_hq_private.pulso() from public, anon, authenticated;
grant execute on function gestlok_hq_private.pulso() to authenticated;

-- 1) Activar o pausar la jornada diaria (solo la creadora).
create or replace function gestlok_hq_private.set_daily(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid := gestlok_hq_private.require_creator();
begin
  if p_enabled is null then raise exception 'Estado inválido' using errcode = '22023'; end if;
  update gestlok_hq_private.worker_control set daily_enabled = p_enabled where id = 1;
  return found;
end $$;
revoke all on function gestlok_hq_private.set_daily(boolean) from public, anon, authenticated;
grant execute on function gestlok_hq_private.set_daily(boolean) to authenticated;
create or replace function public.gestlok_hq_set_daily(p_enabled boolean) returns boolean
language sql security invoker set search_path = '' as $$ select gestlok_hq_private.set_daily(p_enabled) $$;
revoke all on function public.gestlok_hq_set_daily(boolean) from public, anon, authenticated;
grant execute on function public.gestlok_hq_set_daily(boolean) to authenticated;

-- Crea la misión del día (la llama el worker). Una misión autónoma por vez.
create or replace function gestlok_hq_private.daily_mission() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c gestlok_hq_private.worker_control%rowtype;
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  hora integer := extract(hour from (now() at time zone 'America/Argentina/Buenos_Aires'))::integer;
  dia text := to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY');
  v uuid; m uuid; a text; purpose text;
begin
  select * into c from gestlok_hq_private.worker_control where id = 1 for update;
  if not found or not c.daily_enabled or hora < 8 or c.daily_last is not distinct from hoy then return null; end if;
  select u.id into v from auth.users u join gestlok_platform.admins ad on ad.user_id = u.id
   where lower(u.email) = 'kmu15lopez@gmail.com' and u.email_confirmed_at is not null limit 1;
  if v is null then return null; end if;
  if exists(select 1 from gestlok_hq_private.tasks t where t.creator_id = v and t.agent = 'lider' and t.status = 'pendiente' and t.auto_enabled) then return null; end if;
  insert into gestlok_hq_private.tasks(creator_id, agent, instruction, auto_enabled, auto_started_at)
  values (v, 'lider', left('Jornada diaria ' || dia || ' · GESTLOK Chat y locales activos' || E'\n' ||
    'Objetivo: con el pulso del día de cada local (pedidos, conversaciones, conversión, tiempos, reclamos, agotados, promos y Conteo), ' ||
    'reunir las propuestas de los siete sectores y elegir las tres prioridades del día con responsable y cómo validarlas en los dos locales. ' ||
    'Solo análisis: no se modifica nada sin aprobación de la administradora.', 4000), true, now())
  returning id into m;
  for a, purpose in select * from (values
    ('soporte', 'Facundo · Guardia técnica: revisá el control del sitio, las pruebas de GitHub, el Conteo y los cierres automáticos de los dos locales. Señalá alertas con evidencia y qué vigilar hoy.'),
    ('atencion', 'Renata · Mesa de pedidos: pedidos sin abrir, reclamos pendientes y tiempo de confirmación por local. Decí qué revisar hoy y redactá un mensaje breve para el gerente si hace falta.'),
    ('datos', 'Santiago · Métricas: conversaciones, pedidos, conversión y ticket de 7 días por local. Compará los locales y marcá una oportunidad medible con la cuenta hecha.'),
    ('calidad', 'Camila · Calidad de la carta: productos agotados, promos por día y reglas de cada local. Señalá riesgos para el cliente y qué confirmar con el gerente.'),
    ('marketing', 'Martina · Promos y ventas: promos de hoy y de mañana, último pedido y conversión. Proponé una acción de difusión gratuita para hoy en cada local, con el texto listo.'),
    ('desarrollo', 'Nicolás · Producto GESTLOK Chat: con los números del día, proponé una mejora concreta del chat (problema, solución, esfuerzo, riesgo) para probar primero en Prueba.'),
    ('testing', 'Tomás · Pruebas: con las corridas de GitHub, decí si está todo en verde y proponé el recorrido de prueba del día en los dos locales (pasos y resultado esperado).')
  ) x(agent, purpose) loop
    insert into gestlok_hq_private.tasks(creator_id, agent, instruction, parent_task_id)
    values (v, a, left('Jornada diaria ' || dia || ' · ' || purpose, 4000), m);
  end loop;
  update gestlok_hq_private.worker_control set daily_last = hoy where id = 1;
  return m;
end $$;
revoke all on function gestlok_hq_private.daily_mission() from public, anon, authenticated;

-- 4) Liberar una reserva cuando el proveedor rechazó antes de responder (solo el servidor).
create or replace function gestlok_hq_private.release_run(p_user uuid, p_run uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from gestlok_hq_private.agent_runs where id = p_run and creator_id = p_user and state = 'working';
  return found;
end $$;
revoke all on function gestlok_hq_private.release_run(uuid, uuid) from public, anon, authenticated;
grant execute on function gestlok_hq_private.release_run(uuid, uuid) to service_role;
create or replace function public.gestlok_hq_release_run(p_user uuid, p_run uuid) returns boolean
language sql security invoker set search_path = '' as $$ select gestlok_hq_private.release_run(p_user, p_run) $$;
revoke all on function public.gestlok_hq_release_run(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gestlok_hq_release_run(uuid, uuid) to service_role;

-- 3) Cupo de 40 consultas por 24 h. Mismo cuerpo que antes, solo cambia el tope.
create or replace function gestlok_hq_private.claim_run(p_user uuid, p_task uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
 if (select coalesce(sum(quota_units),0) from gestlok_hq_private.agent_runs where creator_id=p_user and created_at>now()-interval '24 hours')+units>40 then raise exception 'Límite de 40 consultas de IA por 24 horas' using errcode='22023'; end if;
 insert into gestlok_hq_private.agent_runs(task_id,creator_id,quota_units) values(p_task,p_user,units) returning id into v;
 return jsonb_build_object('id',v,'agent',t.agent,'instruction',left(t.instruction||case when parent_instruction is null then '' else E'\nObjetivo de Dirección: '||parent_instruction end,4000),'entries',entries);
end $function$;

-- El worker crea la jornada del día y respeta el cupo de 40.
create or replace function gestlok_hq_private.worker_claim(p_token text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare m gestlok_hq_private.tasks%rowtype; next_id uuid; claim jsonb;
begin
 if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(60201125) then return null; end if;
 update gestlok_hq_private.worker_control set last_tick=now() where id=1;
 -- Never repeat an uncertain provider call; retain its reservation and expose a terminal error.
 update gestlok_hq_private.agent_runs set state='error',result='Ejecución interrumpida: no se confirmó la respuesta. Cuota reservada conservada.',finished_at=now() where state='working' and created_at<now()-interval '15 minutes';
 if exists(select 1 from gestlok_hq_private.worker_control where paused_until>now()) then return null; end if;
 perform gestlok_hq_private.daily_mission();
 select t.* into m from gestlok_hq_private.tasks t where t.agent='lider' and t.status='pendiente' and t.auto_enabled and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=t.id) order by t.auto_started_at,t.id limit 1;
 if not found then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(m.creator_id::text,0));
 select * into m from gestlok_hq_private.tasks where id=m.id and status='pendiente' and auto_enabled for update;
 if not found then return null; end if;
 if exists(select 1 from gestlok_hq_private.agent_runs where creator_id=m.creator_id and state='working') then return null; end if;
 if (select coalesce(sum(quota_units),0) from gestlok_hq_private.agent_runs where creator_id=m.creator_id and created_at>now()-interval '24 hours')>=40 then return null; end if;
 select q.id into next_id from gestlok_hq_private.tasks q where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status='pendiente' and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id=q.id) order by case when q.agent='soporte' then 0 else 1 end,q.created_at,q.id limit 1;
 if next_id is null then
  if not exists(select 1 from gestlok_hq_private.tasks q join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=m.id and q.creator_id=m.creator_id and q.status<>'cancelada' and r.state='review') then
   update gestlok_hq_private.tasks set auto_enabled=false,updated_at=now() where id=m.id; return null;
  end if;
  next_id:=m.id;
 end if;
 claim:=gestlok_hq_private.claim_run(m.creator_id,next_id);
 return claim||jsonb_build_object('creator_id',m.creator_id,'mission_id',m.id);
end $function$;

-- Una reunión que falló sin respuesta del proveedor cuenta como un solo intento (antes reservaba 8).
update gestlok_hq_private.agent_runs set quota_units = 1
 where state = 'error' and result like 'No se pudo completar%' and quota_units > 1;

-- La administradora pidió que el equipo trabaje: jornada diaria activa (se pausa desde HQ).
update gestlok_hq_private.worker_control set daily_enabled = true where id = 1;

-- Ronda del worker cada 10 minutos (una consulta por ronda: respeta 30 solicitudes y 8.000 tokens por minuto).
do $$
begin
  if exists(select 1 from cron.job where jobname = 'gestlok-hq-worker') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'gestlok-hq-worker'), schedule := '*/10 * * * *');
  end if;
end $$;
