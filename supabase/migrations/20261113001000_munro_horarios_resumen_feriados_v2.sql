-- Etapa 2: resumen semanal vinculado a la misma planilla de Munro.
-- No se modifican horarios anteriores, recibos ni el historial de Google Sheets.
-- Feriados elegidos por semana (sin inferir calendarios oficiales).
create table if not exists rm_test_private.munro_horarios_feriados (
 semana date primary key check (extract(isodow from semana)=1),
 dias jsonb not null default '[]'::jsonb check (jsonb_typeof(dias)='array' and jsonb_array_length(dias)<=7),
 version integer not null default 1 check (version>0),
 actualizado_por uuid,
 actualizado_at timestamptz not null default now()
);
create table if not exists rm_test_private.munro_horarios_feriados_auditoria (
 id bigint generated always as identity primary key,
 semana date not null,
 dias_antes jsonb not null,
 dias_despues jsonb not null,
 version_anterior integer not null,
 version_nueva integer not null,
 editado_por uuid not null,
 editado_at timestamptz not null default now()
);
alter table rm_test_private.munro_horarios_feriados enable row level security;
alter table rm_test_private.munro_horarios_feriados_auditoria enable row level security;
revoke all on rm_test_private.munro_horarios_feriados,
 rm_test_private.munro_horarios_feriados_auditoria from public,anon,authenticated;

create or replace function public.rm_munro_horarios_obtener(p_semana date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actual date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_semana date;
  v_personas jsonb;
  v_planillas jsonb;
  v_historial jsonb;
  v_feriados jsonb;
  v_feriados_version integer;
  v_feriados_historial jsonb;
begin
  if auth.uid() is null or not rm_test_private.horarios_puede_ver('munro') then
    raise exception 'Sin permiso para Horarios de Munro' using errcode='42501';
  end if;
  v_semana := coalesce(p_semana,v_actual-((extract(isodow from v_actual)::integer)-1));
  if extract(isodow from v_semana) <> 1 then
    raise exception 'Elegí el lunes de la semana' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
     'id',c.id,'nombre',c.nombre,'modalidad',c.modalidad,'estado',c.estado
  ) order by c.id),'[]'::jsonb)
    into v_personas from rm_test_private.munro_horarios_colaboradores c;
  select coalesce(jsonb_agg(jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana,'version',p.version
  ) order by p.colaborador_id),'[]'::jsonb)
    into v_planillas from rm_test_private.munro_horarios_planillas p where p.semana=v_semana;
  select coalesce(jsonb_agg(jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana,'version',p.version
  ) order by p.semana desc,p.colaborador_id),'[]'::jsonb)
    into v_historial from (select * from rm_test_private.munro_horarios_planillas
      where semana<v_actual-((extract(isodow from v_actual)::integer)-1)
      order by semana desc,colaborador_id limit 1500) p;
  select coalesce(f.dias,'[]'::jsonb),coalesce(f.version,0)
    into v_feriados,v_feriados_version from rm_test_private.munro_horarios_feriados f
    where f.semana=v_semana;
  select coalesce(jsonb_object_agg(f.semana::text,f.dias),'{}'::jsonb)
    into v_feriados_historial from rm_test_private.munro_horarios_feriados f
    where f.semana<v_actual-((extract(isodow from v_actual)::integer)-1);
  return jsonb_build_object('semana',v_semana,'personas',v_personas,'planillas',v_planillas,
    'historial',v_historial,'puede_editar',rm_test_private.horarios_puede_archivar('munro'),
    'feriados',coalesce(v_feriados,'[]'::jsonb),
    'feriados_version',coalesce(v_feriados_version,0),
    'feriados_historial',coalesce(v_feriados_historial,'{}'::jsonb));
end $$;

create or replace function public.rm_munro_horarios_guardar(
 p_persona integer,p_semana date,p_nombre text,p_estado text,p_datos jsonb,p_version integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_persona rm_test_private.munro_horarios_colaboradores%rowtype;
  v_prev rm_test_private.munro_horarios_planillas%rowtype;
  v_dia text; v_celda jsonb; v_campo text; v_hora text;
  v_e text;v_s text;v_tm_e integer;v_tm_s integer;v_tt_e integer;v_tt_s integer;
  v_duracion integer;v_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_cierre boolean;v_ver integer;
begin
  if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
    raise exception 'Sin permiso para modificar Horarios de Munro' using errcode='42501';
  end if;
  if p_semana is null or extract(isodow from p_semana)<>1 or
     p_semana>(v_now::date-((extract(isodow from v_now::date)::integer)-1)) then
    raise exception 'Solo podés editar la semana actual o una anterior' using errcode='22023';
  end if;
  if p_persona is null or p_persona<1 or p_version is null or p_version<0 or
    p_nombre is null or char_length(btrim(p_nombre))>80 or
    p_estado not in ('activo','refuerzo','inactivo') or
    coalesce(jsonb_typeof(p_datos),'')<>'object' then
    raise exception 'Datos de colaborador incorrectos' using errcode='22023';
  end if;
  select * into v_persona from rm_test_private.munro_horarios_colaboradores
    where id=p_persona for update;
  if not found then raise exception 'Colaborador no disponible' using errcode='22023'; end if;
  if btrim(p_nombre)='' and p_datos<>'{}'::jsonb then
    raise exception 'Ingresá el nombre antes de cargar horarios' using errcode='22023';
  end if;
  -- La revisión de colaboradores empieza el domingo 23:40 AR; Motos Agencia no cambia.
  v_cierre := p_semana<(v_now::date-((extract(isodow from v_now::date)::integer)-1))
    or (extract(isodow from v_now::date)=7 and
        (extract(hour from v_now)::integer*60+extract(minute from v_now)::integer)>=1420);
  for v_dia,v_celda in select key,value from jsonb_each(p_datos) loop
    if v_dia !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
      v_dia::date<p_semana or v_dia::date>p_semana+6 or
      jsonb_typeof(v_celda)<>'object' then
      raise exception 'Día fuera de la semana' using errcode='22023';
    end if;
    for v_campo,v_hora in select key, value#>>'{}' from jsonb_each(v_celda) loop
      if v_campo not in ('tm_e','tm_s','tt_e','tt_s','feriado','vacaciones_dia','off','vacaciones','observaciones') then
        raise exception 'Campo horario no permitido' using errcode='22023';
      end if;
      if v_campo in ('off','vacaciones','observaciones') then
        if v_dia<>p_semana::text or jsonb_typeof(v_celda->v_campo)<>'string' then
          raise exception 'Los ajustes del resumen corresponden solo a la semana' using errcode='22023';
        end if;
        if v_campo='observaciones' then
          if char_length(v_hora)>200 then
            raise exception 'Observaciones demasiado extensas' using errcode='22023';
          end if;
        elsif v_persona.modalidad='turno' then
          if v_hora !~ '^[0-9]{1,2}$' or v_hora::integer>14 then
            raise exception 'Ingresá turnos enteros (0 a 14)' using errcode='22023';
          end if;
        elsif v_hora !~ '^[0-9]{1,3}:[0-5][0-9]$' or
          split_part(v_hora,':',1)::integer>168 then
          raise exception 'Ingresá horas y minutos válidos (0:00 a 168:00)' using errcode='22023';
        end if;
      elsif v_campo in ('feriado','vacaciones_dia') then
        if jsonb_typeof(v_celda->v_campo)<>'boolean' then
          raise exception 'El feriado debe ser sí o no' using errcode='22023';
        end if;
      elsif coalesce(v_hora,'')<>'' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Usá horas HH:MM válidas' using errcode='22023';
      end if;
    end loop;
    if coalesce((v_celda->>'vacaciones_dia')::boolean,false) and
       (nullif(v_celda->>'tm_e','') is not null or
        nullif(v_celda->>'tm_s','') is not null or
        nullif(v_celda->>'tt_e','') is not null or
        nullif(v_celda->>'tt_s','') is not null) then
      raise exception 'No se pueden cargar vacaciones y turnos el mismo día' using errcode='22023';
    end if;
    v_e:=coalesce(v_celda->>'tm_e','');v_s:=coalesce(v_celda->>'tm_s','');
    if v_cierre and ((v_e='')<>(v_s='')) then
      raise exception 'Completá mañana antes del cierre semanal' using errcode='22023';
    end if;
    v_tm_e:=null;v_tm_s:=null;v_tt_e:=null;v_tt_s:=null;
    if v_e<>'' and v_s<>'' then
      v_tm_e:=split_part(v_e,':',1)::integer*60+split_part(v_e,':',2)::integer;
      v_tm_s:=split_part(v_s,':',1)::integer*60+split_part(v_s,':',2)::integer;
      if v_tm_s<=v_tm_e or v_tm_s-v_tm_e>960 then
        raise exception 'La salida de mañana debe ser posterior a la entrada' using errcode='22023';
      end if;
    end if;
    v_e:=coalesce(v_celda->>'tt_e','');v_s:=coalesce(v_celda->>'tt_s','');
    if v_cierre and ((v_e='')<>(v_s='')) then
      raise exception 'Completá tarde antes del cierre semanal' using errcode='22023';
    end if;
    if v_e<>'' and v_s<>'' then
      v_tt_e:=split_part(v_e,':',1)::integer*60+split_part(v_e,':',2)::integer;
      v_tt_s:=split_part(v_s,':',1)::integer*60+split_part(v_s,':',2)::integer;
      if v_tt_s<=v_tt_e then v_tt_s:=v_tt_s+1440;end if;
      if v_tt_s-v_tt_e>960 or v_tt_s=v_tt_e then
        raise exception 'El turno tarde tiene duración imposible' using errcode='22023';
      end if;
    end if;
    if v_tm_s is not null and v_tt_e is not null and v_tt_e<v_tm_s then
      raise exception 'Los turnos se superponen' using errcode='22023';
    end if;
    if v_tm_e is not null and v_tt_s is not null and v_tt_s>v_tm_e+1440 then
      raise exception 'La jornada supera 24 horas' using errcode='22023';
    end if;
  end loop;
  -- Serializar también el primer guardado, cuando aún no existe fila. Evita pisar
  -- la carga de otro gerente/dueño trabajando sobre el mismo colaborador y semana.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('munro_horarios_'||p_persona::text),
    pg_catalog.hashtext(p_semana::text));
  select * into v_prev from rm_test_private.munro_horarios_planillas
    where colaborador_id=p_persona and semana=p_semana for update;
  v_ver:=case when found then v_prev.version else 0 end;
  if v_ver<>p_version then
    raise exception 'Otra persona modificó esta semana. Actualizá antes de guardar.' using errcode='40001';
  end if;
  if btrim(p_nombre)<>'' and exists(
    select 1 from rm_test_private.munro_horarios_colaboradores c
    where c.id<>p_persona and lower(btrim(c.nombre))=lower(btrim(p_nombre))) then
    raise exception 'Ese nombre ya existe. Revisá que no sea un colaborador duplicado.' using errcode='22023';
  end if;
  update rm_test_private.munro_horarios_colaboradores
     set nombre=btrim(p_nombre),estado=p_estado,actualizado_at=now()
   where id=p_persona;
  if btrim(p_nombre)<>'' then
    insert into rm_test_private.munro_horarios_planillas
      (colaborador_id,semana,datos,nombre_semana,modalidad_semana,version,actualizado_por)
    values(p_persona,p_semana,p_datos,btrim(p_nombre),v_persona.modalidad,v_ver+1,auth.uid())
    on conflict(colaborador_id,semana) do update
      set datos=excluded.datos,nombre_semana=excluded.nombre_semana,
      modalidad_semana=excluded.modalidad_semana,version=excluded.version,
      actualizado_por=excluded.actualizado_por,actualizado_at=now();
    v_ver:=v_ver+1;
  end if;
  insert into rm_test_private.munro_horarios_auditoria (
    colaborador_id,semana,version_anterior,version_nueva,
    datos_antes,datos_despues,nombre_antes,nombre_despues,
    estado_antes,estado_despues,editado_por)
  values(p_persona,p_semana,coalesce(v_prev.version,0),v_ver,
    coalesce(v_prev.datos,'{}'::jsonb),p_datos,v_persona.nombre,btrim(p_nombre),
    v_persona.estado,p_estado,auth.uid());
  return jsonb_build_object('ok',true,'version',v_ver,'id',p_persona);
end $$;


create or replace function public.rm_munro_horarios_feriados_guardar(
 p_semana date,p_dias jsonb,p_version integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_ahora date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_previo rm_test_private.munro_horarios_feriados%rowtype;
 v_version integer;v_dia text;v_n integer;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para los feriados de Munro' using errcode='42501';
 end if;
 if p_semana is null or extract(isodow from p_semana)<>1 or
   p_semana>(v_ahora-((extract(isodow from v_ahora)::integer)-1)) or
   p_version is null or p_version<0 or
   coalesce(jsonb_typeof(p_dias),'')<>'array' or jsonb_array_length(p_dias)>7 then
   raise exception 'Semana o días feriados incorrectos' using errcode='22023';
 end if;
 for v_dia in select value#>>'{}' from jsonb_array_elements(p_dias) loop
   if v_dia !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
      v_dia::date<p_semana or v_dia::date>p_semana+6 then
     raise exception 'Feriado fuera de la semana' using errcode='22023';
   end if;
 end loop;
 select count(distinct value) into v_n from jsonb_array_elements_text(p_dias);
 if v_n<>jsonb_array_length(p_dias) then
   raise exception 'No se puede repetir un feriado' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtext('munro_feriados'),pg_catalog.hashtext(p_semana::text));
 select * into v_previo from rm_test_private.munro_horarios_feriados
   where semana=p_semana for update;
 v_version:=case when found then v_previo.version else 0 end;
 if v_version<>p_version then
   raise exception 'Los feriados cambiaron en otro dispositivo. Actualizá antes de guardar.' using errcode='40001';
 end if;
 insert into rm_test_private.munro_horarios_feriados(semana,dias,version,actualizado_por)
   values(p_semana,p_dias,v_version+1,auth.uid())
   on conflict (semana) do update set dias=excluded.dias,version=excluded.version,
     actualizado_por=excluded.actualizado_por,actualizado_at=now();
 insert into rm_test_private.munro_horarios_feriados_auditoria
   (semana,dias_antes,dias_despues,version_anterior,version_nueva,editado_por)
 values(p_semana,coalesce(v_previo.dias,'[]'::jsonb),p_dias,v_version,v_version+1,auth.uid());
 return jsonb_build_object('ok',true,'version',v_version+1,'dias',p_dias);
end $$;

revoke all on function public.rm_munro_horarios_feriados_guardar(date,jsonb,integer) from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_feriados_guardar(date,jsonb,integer) to authenticated;
