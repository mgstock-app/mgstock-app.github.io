-- Agencia Motos: permisos por rol, local y empresa.
-- Sin datos personales: las cuentas se eligen por rol y empresa dentro de la base.
-- Escribe documentos ficticios y el bloque termina con una excepción a propósito
-- que devuelve el informe y revierte todo (no queda nada guardado).
do $t$
declare
  r text := ''; fallas int := 0; n int;
  orig uuid; otra uuid;
  due_id uuid; due_mail text; gm_id uuid; gm_mail text; gt_id uuid; gt_mail text; ext_id uuid; ext_mail text;
  lunes text := to_char(date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM-DD');
  vieja text := to_char(date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires') - interval '14 days', 'YYYY-MM-DD');
  caso record;
begin
  select id into orig from gestlok_tenancy.tenants where code = 'gestlok-original';
  select id into otra from gestlok_tenancy.tenants where code <> 'gestlok-original' order by created_at limit 1;
  select u.id, lower(u.email) into due_id, due_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = orig and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into gm_id, gm_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = orig and d.data->>'rol' = 'gerente' and d.data->'locales' ? 'munro'
      and not d.data->'locales' ? 'torcuato' and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into gt_id, gt_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = orig and d.data->>'rol' = 'gerente' and d.data->'locales' ? 'torcuato'
      and not d.data->'locales' ? 'munro' and u.email_confirmed_at is not null limit 1;
  select u.id, lower(u.email) into ext_id, ext_mail from public.docs d join auth.users u on lower(u.email) = lower(d.data->>'email')
    where d.col = 'equipo' and d.tenant_id = otra and d.data->>'rol' = 'dueno' and u.email_confirmed_at is not null limit 1;
  if due_id is null then raise exception 'Falta una cuenta de dueño de Mi Gusto confirmada'; end if;

  for caso in
    select * from (values
      ('Dueño: valores por hora',              due_id, due_mail, 'munro/agencia_motos',    'tarifas', '{"valores":{}}', true),
      ('Dueño: semana en curso',               due_id, due_mail, 'munro/agencia_motos',    'd-' || lunes || '-lucas-' || lunes, '{"semana":"' || lunes || '"}', true),
      ('Dueño: semana cerrada',                due_id, due_mail, 'munro/agencia_motos',    'd-' || vieja || '-alex-' || vieja, '{"semana":"' || vieja || '"}', true),
      ('Dueño: refuerzo',                      due_id, due_mail, 'munro/agencia_motos',    'm-' || lunes || '-rprueba1', '{"semana":"' || lunes || '","tipo":"refuerzo"}', true),
      ('Dueño: semana del id distinta',        due_id, due_mail, 'munro/agencia_motos',    'd-' || lunes || '-aye-' || lunes, '{"semana":"' || vieja || '"}', false),
      ('Dueño: id con otro formato',           due_id, due_mail, 'munro/agencia_motos',    'cualquiera', '{"semana":"' || lunes || '"}', false),
      ('Dueño: Torcuato no tiene Agencia',     due_id, due_mail, 'torcuato/agencia_motos', 'd-' || lunes || '-lucas-' || lunes, '{"semana":"' || lunes || '"}', false),
      ('Gerente Munro: semana en curso',       gm_id,  gm_mail,  'munro/agencia_motos',    'd-' || lunes || '-aye-' || lunes, '{"semana":"' || lunes || '"}', true),
      ('Gerente Munro: refuerzo',              gm_id,  gm_mail,  'munro/agencia_motos',    'm-' || lunes || '-rprueba2', '{"semana":"' || lunes || '","tipo":"refuerzo"}', true),
      ('Gerente Munro: semana cerrada',        gm_id,  gm_mail,  'munro/agencia_motos',    'd-' || vieja || '-lucas-' || vieja, '{"semana":"' || vieja || '"}', false),
      ('Gerente Munro: valores por hora',      gm_id,  gm_mail,  'munro/agencia_motos',    'tarifas', '{"valores":{}}', false),
      ('Gerente Torcuato: Munro',              gt_id,  gt_mail,  'munro/agencia_motos',    'd-' || lunes || '-alex-' || lunes, '{"semana":"' || lunes || '"}', false),
      ('Otra empresa: Munro',                  ext_id, ext_mail, 'munro/agencia_motos',    'd-' || lunes || '-lucas-' || lunes, '{"semana":"' || lunes || '"}', false)
    ) as c(nombre, uid, mail, col, id, data, permitido)
  loop
    if caso.uid is null then r := r || E'\nOMITIDO ' || caso.nombre || ' (sin cuenta)'; continue; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', caso.uid, 'email', caso.mail, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      insert into public.docs (col, id, data, updated_at, updated_by) values (caso.col, caso.id, caso.data::jsonb, now(), caso.mail)
        on conflict (col, id) do update set data = excluded.data;
      if caso.permitido then r := r || E'\nOK ' || caso.nombre || ' -> guardó';
      else fallas := fallas + 1; r := r || E'\nFALLA ' || caso.nombre || ' -> guardó (debía rechazarse)'; end if;
    exception when others then
      if not caso.permitido then r := r || E'\nOK ' || caso.nombre || ' -> rechazado';
      else fallas := fallas + 1; r := r || E'\nFALLA ' || caso.nombre || ' -> ' || sqlerrm; end if;
    end;
    perform set_config('role', 'postgres', true);
  end loop;

  -- Lecturas del gerente de Munro: ve la semana en curso, no los valores ni semanas cerradas.
  if gm_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', gm_id, 'email', gm_mail, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into n from public.docs where col = 'munro/agencia_motos' and id = 'tarifas';
    if n = 0 then r := r || E'\nOK Gerente Munro no lee valores por hora'; else fallas := fallas + 1; r := r || E'\nFALLA Gerente Munro lee valores por hora'; end if;
    select count(*) into n from public.docs where col = 'munro/agencia_motos' and id like 'd-' || vieja || '-%';
    if n = 0 then r := r || E'\nOK Gerente Munro no lee semanas cerradas'; else fallas := fallas + 1; r := r || E'\nFALLA Gerente Munro lee semanas cerradas'; end if;
    select count(*) into n from public.docs where col = 'munro/agencia_motos' and id like 'd-' || lunes || '-%';
    if n > 0 then r := r || E'\nOK Gerente Munro lee la semana en curso'; else fallas := fallas + 1; r := r || E'\nFALLA Gerente Munro no lee la semana en curso'; end if;
    perform set_config('role', 'postgres', true);
  end if;
  if gt_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', gt_id, 'email', gt_mail, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into n from public.docs where col = 'munro/agencia_motos';
    if n = 0 then r := r || E'\nOK Gerente Torcuato no lee Agencia Motos'; else fallas := fallas + 1; r := r || E'\nFALLA Gerente Torcuato lee Agencia Motos'; end if;
    perform set_config('role', 'postgres', true);
  end if;

  raise exception 'RESULTADO Agencia Motos: % fallas%', fallas, r;
end
$t$;
