-- GESTLOK HQ · la jornada diaria no espera la aprobación del informe anterior.
-- Antes, un informe de Alex pendiente de aprobación frenaba la misión del día siguiente.
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
  -- Solo espera a una misión autónoma que todavía está en curso (sin informe de Alex);
  -- un informe que espera la aprobación de la administradora no frena la jornada del día.
  if exists(select 1 from gestlok_hq_private.tasks t where t.creator_id = v and t.agent = 'lider' and t.status = 'pendiente' and t.auto_enabled
            and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id = t.id)) then return null; end if;
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
