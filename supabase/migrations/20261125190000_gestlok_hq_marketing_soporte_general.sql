-- GESTLOK HQ · nuevas áreas pedidas por la administradora (25/11/2026):
--   · Marketing de GESTLOK Chat (Valentina, «difusion»): investiga cómo publicitar la micro app y dónde publicarla.
--   · Soporte general (Lucas, «soporte_general»): altas de comercios, gerentes, mensajes de la web y suscripciones.
-- Las misiones pasan a tener nueve sectores. Mapa de difusión con sitios verificados (todos gratuitos).
-- Todo es de solo lectura para la IA; los cambios los decide la administradora.

alter table gestlok_hq_private.tasks drop constraint if exists tasks_agent_check;
alter table gestlok_hq_private.tasks add constraint tasks_agent_check check (agent in
  ('desarrollo','calidad','testing','atencion','marketing','datos','soporte','difusion','soporte_general','lider'));

-- Mapa de difusión de GESTLOK Chat: dónde publicar, cómo y en qué estado está.
create table if not exists gestlok_hq_private.difusion_canales (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  nombre text not null check (char_length(nombre) between 2 and 80),
  url text not null check (url ~ '^https://'),
  tipo text not null,
  costo text not null default 'Gratis',
  como text not null,
  prioridad integer not null default 2 check (prioridad between 1 and 3),
  estado text not null default 'pendiente' check (estado in ('pendiente','publicado','descartado')),
  verificado_at date not null default current_date,
  actualizado_at timestamptz not null default now()
);
alter table gestlok_hq_private.difusion_canales enable row level security;
revoke all on gestlok_hq_private.difusion_canales from public, anon, authenticated;

insert into gestlok_hq_private.difusion_canales(id, nombre, url, tipo, como, prioridad) values
 ('search-console', 'Google Search Console', 'https://search.google.com/search-console', 'Buscadores (SEO)',
  'Alta gratis de gestlok.com.ar, enviar el sitemap y revisar con qué búsquedas llegan los comercios.', 1),
 ('instagram', 'Instagram de GESTLOK', 'https://www.instagram.com/', 'Red social',
  'Perfil profesional gratis. Publicar las 6 pantallas de «Así funciona GESTLOK Chat» (local de ejemplo) y el link a gestlok.com.ar/demo/.', 1),
 ('facebook', 'Página y grupos de Facebook', 'https://www.facebook.com/', 'Red social y comunidades',
  'Página gratis de GESTLOK y publicaciones en grupos de comerciantes y gastronómicos de la zona, respetando las reglas de cada grupo (sin spam) y sin exponer el número personal.', 1),
 ('tiktok', 'TikTok de GESTLOK', 'https://www.tiktok.com/', 'Red social',
  'Cuenta gratis. Videos cortos verticales grabando la demo: el cliente pide por chat y el pedido llega al panel del local.', 2),
 ('youtube', 'Canal de YouTube', 'https://www.youtube.com/', 'Video',
  'Canal gratis con un video corto de la demo, para insertar en la web y en los directorios.', 2),
 ('linkedin', 'Página de empresa en LinkedIn', 'https://www.linkedin.com/', 'Red profesional',
  'Página gratis de GESTLOK. Publicar casos de uso y la demo para dueños y gerentes.', 2),
 ('capterra', 'Capterra (también GetApp y Software Advice)', 'https://www.capterra.es/company/vendors', 'Directorio de software',
  'Listado básico gratis; el pago por clic es opcional y no se usa. Requiere producto disponible al público y fuera de beta.', 2),
 ('g2', 'G2', 'https://www.g2.com/', 'Directorio de software',
  'Perfil gratis del producto con capturas y descripción; pedir opiniones a comercios que ya lo usan.', 2),
 ('alternativeto', 'AlternativeTo', 'https://alternativeto.net/', 'Directorio de alternativas',
  'Listado gratis como alternativa para tomar pedidos por chat sin comisión por pedido.', 2),
 ('iproup', 'iProUP · Startups', 'https://www.iproup.com/startups', 'Prensa de emprendimientos',
  'Enviar una gacetilla con la historia de GESTLOK Chat: pedidos por chat sin comisión por pedido, en uso real en comercios de Zona Norte.', 2),
 ('google-perfil', 'Perfil de Empresa de Google', 'https://business.google.com/es/business-profile/', 'Búsqueda y Maps',
  'Gratis, pero Google no admite empresas que solo operan online: solo es apto si GESTLOK visita a los comercios en persona (instalación o capacitación) y lo declara como zona de servicio. Confirmarlo antes del alta.', 3),
 ('saashub', 'SaaSHub', 'https://www.saashub.com/', 'Directorio de software', 'Listado gratis del producto.', 3),
 ('saasworthy', 'SaaSworthy', 'https://www.saasworthy.com/', 'Directorio de software', 'Listado gratis; los planes pagos son opcionales y no se usan.', 3),
 ('producthunt', 'Product Hunt', 'https://www.producthunt.com/', 'Lanzamiento de productos',
  'Lanzamiento gratis; público mayormente global y en inglés: dejarlo para cuando haya versión en inglés.', 3),
 ('betalist', 'BetaList', 'https://betalist.com/', 'Lanzamiento de productos', 'Envío gratis con lista de espera; público global.', 3)
on conflict (id) do nothing;

create or replace function gestlok_hq_private.difusion_estado(p_id text, p_estado text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid := gestlok_hq_private.require_creator();
begin
  if p_estado is null or p_estado not in ('pendiente','publicado','descartado') then raise exception 'Estado inválido' using errcode = '22023'; end if;
  update gestlok_hq_private.difusion_canales set estado = p_estado, actualizado_at = now() where id = p_id;
  return found;
end $$;
revoke all on function gestlok_hq_private.difusion_estado(text, text) from public, anon, authenticated;
grant execute on function gestlok_hq_private.difusion_estado(text, text) to authenticated;
create or replace function public.gestlok_hq_difusion_estado(p_id text, p_estado text) returns boolean
language sql security invoker set search_path = '' as $$ select gestlok_hq_private.difusion_estado(p_id, p_estado) $$;
revoke all on function public.gestlok_hq_difusion_estado(text, text) from public, anon, authenticated;
grant execute on function public.gestlok_hq_difusion_estado(text, text) to authenticated;

-- El pulso suma la plataforma (soporte general) y el mapa de difusión. Sin datos personales: solo cantidades.
create or replace function gestlok_hq_private.pulso_plataforma() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'empresas_chat', (select count(*) from gestlok_chat_private.empresas e where e.habilitada),
    'locales_activos', (select count(*) from gestlok_chat_private.sucursales s where s.activa),
    'locales_apagados', (select count(*) from gestlok_chat_private.sucursales s where not s.activa),
    'locales_sin_carta', (select count(*) from gestlok_chat_private.sucursales s
                           where not exists(select 1 from gestlok_chat_private.productos p where p.sucursal_id = s.id and p.activo)),
    'altas_pendientes', (select count(*) from gestlok_platform.registration_requests r where r.status = 'pending' and r.kind = 'dueno'),
    'gerentes_pendientes', (select count(*) from gestlok_platform.registration_requests r where r.status = 'pending' and r.kind = 'colaborador'),
    'mensajes_web_sin_leer', (select count(*) from gestlok_contacto_private.mensajes m where not m.leido),
    'suscripciones_activas', (select count(*) from gestlok_chat_private.suscripciones x where x.estado = 'activa'),
    'suscripciones_en_mora', (select count(*) from gestlok_chat_private.suscripciones x where x.estado = 'en_mora'),
    'suscripciones_pendientes', (select count(*) from gestlok_chat_private.suscripciones x where x.estado = 'pendiente'))
$$;
revoke all on function gestlok_hq_private.pulso_plataforma() from public, anon, authenticated;

create or replace function gestlok_hq_private.pulso_difusion() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'url', c.url, 'tipo', c.tipo, 'costo', c.costo,
           'como', c.como, 'prioridad', c.prioridad, 'estado', c.estado, 'verificado', c.verificado_at)
         order by c.estado <> 'pendiente', c.prioridad, c.nombre), '[]'::jsonb)
  from gestlok_hq_private.difusion_canales c
$$;
revoke all on function gestlok_hq_private.pulso_difusion() from public, anon, authenticated;

create or replace function gestlok_hq_private.worker_pulso(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not gestlok_hq_private.worker_auth(p_token) then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  return gestlok_hq_private.pulso_datos() || jsonb_build_object(
    'plataforma', gestlok_hq_private.pulso_plataforma(), 'difusion', gestlok_hq_private.pulso_difusion());
end $$;
revoke all on function gestlok_hq_private.worker_pulso(text) from public, anon, authenticated;
grant execute on function gestlok_hq_private.worker_pulso(text) to service_role;

create or replace function gestlok_hq_private.pulso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := gestlok_hq_private.require_creator();
begin
  return gestlok_hq_private.pulso_datos() || jsonb_build_object(
    'plataforma', gestlok_hq_private.pulso_plataforma(),
    'difusion', gestlok_hq_private.pulso_difusion(),
    'jornada', (select jsonb_build_object('activa', w.daily_enabled, 'ultima', w.daily_last,
                  'pausa_hasta', w.paused_until, 'ultimo_control', w.last_tick)
                from gestlok_hq_private.worker_control w where w.id = 1),
    'cupo', gestlok_hq_private.limites() || gestlok_hq_private.uso(v));
end $$;
revoke all on function gestlok_hq_private.pulso() from public, anon, authenticated;
grant execute on function gestlok_hq_private.pulso() to authenticated;

-- Misiones de nueve sectores (las anteriores de siete siguen siendo válidas).
create or replace function gestlok_hq_private.delegate_mission(p_task uuid, p_reuse_initial boolean)
 returns boolean language plpgsql security definer set search_path to '' as $function$
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
  ('marketing','Proponer estrategias comerciales orgánicas y gratuitas para los locales.'),
  ('datos','Definir indicadores accionables y oportunidades de análisis.'),
  ('soporte','Investigar evidencia preventiva de disponibilidad, roles y locales; elevar incidentes sin modificar sistemas.'),
  ('difusion','Proponer cómo y dónde publicitar GESTLOK Chat gratis, con textos listos y el próximo sitio del mapa de difusión.'),
  ('soporte_general','Revisar altas de comercios, gerentes, mensajes de la web y suscripciones; proponer respuestas y guías.')
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
end $function$;

create or replace function gestlok_hq_private.set_auto(p_task uuid, p_enabled boolean)
 returns boolean language plpgsql security definer set search_path to '' as $function$
declare v uuid:=gestlok_hq_private.require_creator();
begin
 if p_enabled is null then raise exception 'Estado inválido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v::text,0));
 if p_enabled and ((select count(*) from gestlok_hq_private.tasks where parent_task_id=p_task and creator_id=v)<7 or exists(select 1 from gestlok_hq_private.agent_runs where task_id=p_task)) then raise exception 'Misión no disponible'; end if;
 update gestlok_hq_private.tasks set auto_enabled=p_enabled,auto_started_at=case when p_enabled then now() else auto_started_at end,updated_at=now() where id=p_task and creator_id=v and agent='lider' and status='pendiente';
 return found;
end $function$;

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
   if (select count(*) from gestlok_hq_private.tasks where parent_task_id=t.id and creator_id=p_user)<7 or exists(select 1 from gestlok_hq_private.tasks q left join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=t.id and q.creator_id=p_user and q.status<>'cancelada' and (r.id is null or r.state='working')) then raise exception 'Sectores pendientes' using errcode='22023'; end if;
   if not exists(select 1 from gestlok_hq_private.tasks q join gestlok_hq_private.agent_runs r on r.task_id=q.id where q.parent_task_id=t.id and q.creator_id=p_user and q.status<>'cancelada' and r.state='review') then raise exception 'Sin propuestas disponibles' using errcode='22023'; end if;
   select jsonb_agg(jsonb_build_object('area',q.agent,'text',case when q.status<>'cancelada' and r.state='review' then left(r.result,1000) else 'Sin propuesta: '||case when q.status='cancelada' then 'cancelada' else coalesce(r.state,'pendiente') end end) order by q.agent) into entries from gestlok_hq_private.tasks q left join gestlok_hq_private.agent_runs r on r.task_id=q.id and r.creator_id=p_user where q.parent_task_id=t.id and q.creator_id=p_user;
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

-- Jornada diaria con los nueve sectores.
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
  if exists(select 1 from gestlok_hq_private.tasks t where t.creator_id = v and t.agent = 'lider' and t.status = 'pendiente' and t.auto_enabled
            and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id = t.id)) then return null; end if;
  insert into gestlok_hq_private.tasks(creator_id, agent, instruction, auto_enabled, auto_started_at)
  values (v, 'lider', left('Jornada diaria ' || dia || ' · GESTLOK Chat, difusión y locales activos' || E'\n' ||
    'Objetivo: con el pulso del día (locales, plataforma y mapa de difusión), reunir las propuestas de los nueve sectores y elegir las tres prioridades del día ' ||
    'con responsable y cómo validarlas en los dos locales. Solo análisis: no se modifica nada sin aprobación de la administradora.', 4000), true, now())
  returning id into m;
  for a, purpose in select * from (values
    ('soporte', 'Facundo · Guardia técnica: revisá el control del sitio, las pruebas de GitHub, el Conteo y los cierres automáticos de los dos locales. Señalá alertas con evidencia y qué vigilar hoy.'),
    ('soporte_general', 'Lucas · Soporte general: altas de comercios pendientes, gerentes esperando aprobación, mensajes del formulario web sin leer, suscripciones en mora y locales sin carta. Decí qué atender hoy y redactá las respuestas.'),
    ('atencion', 'Renata · Mesa de pedidos: pedidos sin abrir, reclamos pendientes y tiempo de confirmación por local. Decí qué revisar hoy y redactá un mensaje breve para el gerente si hace falta.'),
    ('datos', 'Santiago · Métricas: conversaciones, pedidos, conversión y ticket de 7 días por local. Compará los locales y marcá una oportunidad medible con la cuenta hecha.'),
    ('calidad', 'Camila · Calidad de la carta: productos agotados, promos por día y reglas de cada local. Señalá riesgos para el cliente y qué confirmar con el gerente.'),
    ('marketing', 'Martina · Promos de los locales: promos de hoy y de mañana, último pedido y conversión. Proponé una acción de difusión gratuita para hoy en cada local, con el texto listo.'),
    ('difusion', 'Valentina · Marketing de GESTLOK Chat: con el mapa de difusión (sitios verificados, todos gratis, con su estado), elegí el próximo sitio donde publicar GESTLOK Chat, explicá por qué y cómo, y dejá el texto listo para pegar con la pieza a usar (videos o imágenes ya hechos). No inventes sitios: si proponés uno nuevo, marcalo «a verificar».'),
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

-- Si la jornada de hoy sigue abierta (Alex todavía no cerró), se suman las dos áreas nuevas.
insert into gestlok_hq_private.tasks(creator_id, agent, instruction, parent_task_id)
select m.creator_id, x.agent, left(split_part(m.instruction, ' · ', 1) || ' · ' || x.purpose, 4000), m.id
from gestlok_hq_private.tasks m
cross join (values
  ('soporte_general', 'Lucas · Soporte general: altas de comercios pendientes, gerentes esperando aprobación, mensajes del formulario web sin leer, suscripciones en mora y locales sin carta. Decí qué atender hoy y redactá las respuestas.'),
  ('difusion', 'Valentina · Marketing de GESTLOK Chat: con el mapa de difusión (sitios verificados, todos gratis, con su estado), elegí el próximo sitio donde publicar GESTLOK Chat, explicá por qué y cómo, y dejá el texto listo para pegar con la pieza a usar (videos o imágenes ya hechos). No inventes sitios: si proponés uno nuevo, marcalo «a verificar».')
) x(agent, purpose)
where m.agent = 'lider' and m.status = 'pendiente' and m.auto_enabled and m.instruction like 'Jornada diaria %'
  and not exists(select 1 from gestlok_hq_private.agent_runs r where r.task_id = m.id)
  and not exists(select 1 from gestlok_hq_private.tasks c where c.parent_task_id = m.id and c.agent = x.agent);
