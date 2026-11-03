-- Copias PDF privadas, versionadas y persistentes. No habilita otros locales.
-- La fecha se toma de la planilla; las semanas no necesariamente empiezan un lunes.
alter table rm_test_private.horarios_semanas drop constraint horarios_semanas_check;
alter table rm_test_private.horarios_semanas add constraint horarios_semanas_siete_dias check (semana_hasta = semana_desde + 6);
create table rm_test_private.horarios_archivos (
 id uuid primary key default gen_random_uuid(),
 local_id text not null,
 semana_desde date not null,
 semana_hasta date not null,
 filas jsonb not null,
 filas_anteriores jsonb,
 resumen bytea not null check(octet_length(resumen) between 16 and 3000000),
 semana bytea not null check(octet_length(semana) between 16 and 3000000),
 archivado_at timestamptz not null default clock_timestamp(),
 foreign key(local_id,semana_desde) references rm_test_private.horarios_semanas(local_id,semana_desde)
);
create index horarios_archivos_semana on rm_test_private.horarios_archivos(local_id,semana_desde,archivado_at desc);
alter table rm_test_private.horarios_archivos enable row level security;
revoke all on rm_test_private.horarios_archivos from public,anon,authenticated;
create function rm_test_private.horarios_recibir_base(p_codigo text, p_desde text, p_hasta text, p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_local text; v_desde date; v_hasta date; v_filas jsonb := '[]'::jsonb; f jsonb;
begin
  select local_id into v_local from rm_test_private.horarios_conexiones
   where token_hash is not null
     and token_hash = encode(extensions.digest(coalesce(p_codigo, ''), 'sha256'), 'hex');
  if v_local is null then raise exception 'Código de conexión inválido' using errcode = '42501'; end if;
  v_desde := rm_test_private.horarios_fecha(btrim(coalesce(p_desde, '')));
  v_hasta := rm_test_private.horarios_fecha(btrim(coalesce(p_hasta, '')));
  if v_desde is null or v_hasta is distinct from v_desde + 6
     or v_desde < date '2025-01-01' or v_desde > current_date + 14 then
    raise exception 'La semana debe tener siete días consecutivos' using errcode = '22023';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) > 60 or length(p_filas::text) > 40000 then
    raise exception 'Resumen inválido' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    if jsonb_typeof(f) <> 'object' or btrim(coalesce(f->>'colaborador', '')) = '' then continue; end if;
    v_filas := v_filas || jsonb_build_array(jsonb_build_object(
      'colaborador', left(btrim(f->>'colaborador'), 60),
      'puesto', left(btrim(coalesce(f->>'puesto', '')), 60),
      'cobra_por', left(btrim(coalesce(f->>'cobra_por', '')), 30),
      'trabajado', left(btrim(coalesce(f->>'trabajado', '')), 30),
      'off', left(btrim(coalesce(f->>'off', '')), 30),
      'feriado', left(btrim(coalesce(f->>'feriado', '')), 30),
      'ausentes', left(btrim(coalesce(f->>'ausentes', '')), 30),
      'vacaciones', left(btrim(coalesce(f->>'vacaciones', '')), 30),
      'total', left(btrim(coalesce(f->>'total', '')), 30),
      'observaciones', left(btrim(coalesce(f->>'observaciones', '')), 120)));
  end loop;
  insert into rm_test_private.horarios_semanas (local_id, semana_desde, semana_hasta, filas)
  values (v_local, v_desde, v_hasta, v_filas)
  on conflict (local_id, semana_desde) do update
    set filas = excluded.filas, recibido_at = now(), actualizaciones = rm_test_private.horarios_semanas.actualizaciones + 1
    where rm_test_private.horarios_semanas.filas is distinct from excluded.filas;
  update rm_test_private.horarios_conexiones set ultimo_envio_at = now(), envios = envios + 1 where local_id = v_local;
  return jsonb_build_object('ok', true, 'semana', v_desde, 'colaboradores', jsonb_array_length(v_filas));
end $$;


revoke all on function rm_test_private.horarios_recibir_base(text,text,text,jsonb) from public,anon,authenticated;
-- Una planilla vaciada no puede pisar un período que ya tiene sus PDF archivados.
create or replace function public.rm_horarios_recibir(p_codigo text,p_desde text,p_hasta text,p_filas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_local text;
begin
 select local_id into v_local from rm_test_private.horarios_conexiones
 where token_hash=encode(extensions.digest(coalesce(p_codigo,''),'sha256'),'hex') for update;
 if v_local is null then raise exception 'Código de conexión inválido' using errcode='42501'; end if;
 if exists(select 1 from rm_test_private.horarios_archivos where local_id=v_local and semana_desde=rm_test_private.horarios_fecha(p_desde)) then
   return jsonb_build_object('ok',true,'archivada',true,'semana',rm_test_private.horarios_fecha(p_desde),'colaboradores',
    (select jsonb_array_length(filas) from rm_test_private.horarios_semanas where local_id=v_local and semana_desde=rm_test_private.horarios_fecha(p_desde)));
 end if;
 -- No sustituir un Resumen existente por una planilla vacía durante la limpieza.
 if p_filas='[]'::jsonb then raise exception 'Resumen vacío: no se modificó el historial' using errcode='22023'; end if;
 return rm_test_private.horarios_recibir_base(p_codigo,p_desde,p_hasta,p_filas);
end $$;
create function public.rm_horarios_archivar(p_codigo text,p_desde text,p_hasta text,p_filas jsonb,p_resumen text,p_semana text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_local text; v_id uuid; v_result jsonb; v_resumen bytea; v_semana bytea; v_anteriores jsonb;
begin
 select local_id into v_local from rm_test_private.horarios_conexiones
 where token_hash=encode(extensions.digest(coalesce(p_codigo,''),'sha256'),'hex') for update;
 if v_local is null then raise exception 'Código de conexión inválido' using errcode='42501'; end if;
 if p_resumen is null or p_semana is null or length(p_resumen)>4000000 or length(p_semana)>4000000 then
 raise exception 'Se necesitan los dos PDF completos (máximo 3 MB por hoja)' using errcode='22023'; end if;
 v_resumen:=decode(p_resumen,'base64'); v_semana:=decode(p_semana,'base64');
 if substring(v_resumen from 1 for 5)<>decode('255044462d','hex') or substring(v_semana from 1 for 5)<>decode('255044462d','hex') then
 raise exception 'Los archivos deben ser PDF' using errcode='22023'; end if;
 if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas)=0 then
 raise exception 'Resumen vacío: no se archivó nada' using errcode='22023'; end if;
 select filas into v_anteriores from rm_test_private.horarios_semanas where local_id=v_local and semana_desde=rm_test_private.horarios_fecha(p_desde);
 v_result:=rm_test_private.horarios_recibir_base(p_codigo,p_desde,p_hasta,p_filas);
 if (v_result->>'colaboradores')::integer=0 then raise exception 'Resumen sin colaboradores válidos' using errcode='22023'; end if;
 select id into v_id from rm_test_private.horarios_archivos where local_id=v_local
 and semana_desde=rm_test_private.horarios_fecha(p_desde) and resumen=v_resumen and semana=v_semana and filas=p_filas limit 1;
 if v_id is null then
 insert into rm_test_private.horarios_archivos(local_id,semana_desde,semana_hasta,filas,filas_anteriores,resumen,semana)
 values(v_local,rm_test_private.horarios_fecha(p_desde),rm_test_private.horarios_fecha(p_hasta),p_filas,v_anteriores,v_resumen,v_semana) returning id into v_id;
 end if;
 return v_result || jsonb_build_object('archivo_id',v_id);
end $$;
-- Lectura de un PDF por vez, con el mismo control de local que Historial.
create function public.rm_horarios_archivo(p_local text,p_archivo uuid,p_hoja text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_pdf bytea;
begin
 if not rm_test_private.horarios_puede_ver(p_local) then raise exception 'Sin acceso al historial del local' using errcode='42501'; end if;
 if p_hoja not in ('Resumen','Semana') or p_hoja is null then raise exception 'Hoja inválida' using errcode='22023'; end if;
 select case when p_hoja='Resumen' then resumen else semana end into v_pdf
 from rm_test_private.horarios_archivos where id=p_archivo and local_id=p_local;
 if v_pdf is null then raise exception 'Archivo no encontrado' using errcode='22023'; end if;
 return jsonb_build_object('pdf',encode(v_pdf,'base64'));
end $$;
revoke all on function public.rm_horarios_archivar(text,text,text,jsonb,text,text),public.rm_horarios_archivo(text,uuid,text) from public,anon,authenticated;
grant execute on function public.rm_horarios_archivar(text,text,text,jsonb,text,text) to anon,authenticated;
grant execute on function public.rm_horarios_archivo(text,uuid,text) to authenticated;

create or replace function public.rm_horarios_historial(p_local text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean;
begin
  if not rm_test_private.horarios_puede_ver(p_local) then
    raise exception 'No tenés acceso al historial de horarios de este local' using errcode = '42501';
  end if;
  v_admin := rm_test_private.horarios_puede_administrar(p_local);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'archivo_id', (select id from rm_test_private.horarios_archivos a where a.local_id=s.local_id and a.semana_desde=s.semana_desde order by a.archivado_at desc limit 1),
        'desde', s.semana_desde, 'hasta', s.semana_hasta, 'filas', s.filas,
        'recibido_at', s.recibido_at, 'actualizaciones', s.actualizaciones,
        'pagos', case when v_admin then coalesce((
                   select jsonb_object_agg(p.colaborador, jsonb_build_object('pagado', p.pagado, 'marcado_at', p.marcado_at))
                   from rm_test_private.horarios_pagos p
                   where p.local_id = s.local_id and p.semana_desde = s.semana_desde), '{}'::jsonb)
                 else '{}'::jsonb end)
      order by s.semana_desde desc)
    from (select * from rm_test_private.horarios_semanas where local_id = p_local
          order by semana_desde desc limit 520) s), '[]'::jsonb);
end $$;
revoke all on function public.rm_horarios_historial(text) from public, anon;
grant execute on function public.rm_horarios_historial(text) to authenticated;
