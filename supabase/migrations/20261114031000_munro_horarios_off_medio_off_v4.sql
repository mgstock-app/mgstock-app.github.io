-- Mi Gusto · Munro. Descanso diario validado en la RPC original.
-- Cambio aditivo: p_datos jsonb admite 'descanso' por día (off|medio_off|'').
-- Sin modificar tablas, RLS, historial ni OFF de la liquidación.
-- Se conserva la validación auth.uid() + horarios_puede_archivar('munro').
create or replace function public.rm_munro_horarios_guardar(
 p_persona integer,p_semana date,p_nombre text,p_estado text,p_datos jsonb,p_version integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_persona rm_test_private.munro_horarios_colaboradores%rowtype;
  v_prev rm_test_private.munro_horarios_planillas%rowtype;
  v_dia text; v_celda jsonb; v_campo text; v_hora text;
  v_e text;v_s text;v_tm_e integer;v_tm_s integer;v_tt_e integer;v_tt_s integer;
  v_duracion integer;v_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_cierre boolean;v_ver integer;v_inactivo_desde date;
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
      if v_campo not in ('tm_e','tm_s','tt_e','tt_s','feriado','vacaciones_dia','feriados_habilitados','vacaciones_habilitadas','inactivo_desde','off','vacaciones','observaciones','descanso') then
        raise exception 'Campo horario no permitido' using errcode='22023';
      end if;
      if v_campo='descanso' then
        if jsonb_typeof(v_celda->v_campo)<>'string'
           or v_hora not in ('','off','medio_off') then
          raise exception 'Descanso válido: OFF o Medio OFF' using errcode='22023';
        end if;
      elsif v_campo='inactivo_desde' then
        if v_dia<>p_semana::text or jsonb_typeof(v_celda->v_campo)<>'string'
           or (v_hora<>'' and (v_hora !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             or v_hora::date>v_now::date)) then
          raise exception 'La fecha de inactividad debe ser válida y no futura' using errcode='22023';
        end if;
      elsif v_campo in ('off','vacaciones','observaciones') then
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
      elsif v_campo in ('feriado','vacaciones_dia','feriados_habilitados','vacaciones_habilitadas') then
        if jsonb_typeof(v_celda->v_campo)<>'boolean' or
           (v_campo in ('feriados_habilitados','vacaciones_habilitadas') and v_dia<>p_semana::text) then
          raise exception 'La opción de feriado o vacaciones debe ser semanal y sí/no' using errcode='22023';
        end if;
      elsif coalesce(v_hora,'')<>'' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Usá horas HH:MM válidas' using errcode='22023';
      end if;
    end loop;
    if coalesce((v_celda->>'feriado')::boolean,false)
       and coalesce((p_datos->p_semana::text->>'feriados_habilitados')::boolean,true)=false then
      raise exception 'Activá Feriado para marcar días en este colaborador' using errcode='22023';
    end if;
    if coalesce((v_celda->>'vacaciones_dia')::boolean,false)
       and coalesce((p_datos->p_semana::text->>'vacaciones_habilitadas')::boolean,true)=false then
      raise exception 'Activá Vacaciones para marcar días en este colaborador' using errcode='22023';
    end if;
    -- El OFF diario solo controla horarios trabajados. No modifica el OFF
    -- remunerado manual de la liquidación ni reescribe semanas anteriores.
    if coalesce(v_celda->>'descanso','')='off' and
       (nullif(v_celda->>'tm_e','') is not null or
        nullif(v_celda->>'tm_s','') is not null or
        nullif(v_celda->>'tt_e','') is not null or
        nullif(v_celda->>'tt_s','') is not null) then
      raise exception 'OFF completo no admite horarios' using errcode='22023';
    end if;
    if coalesce(v_celda->>'descanso','')='medio_off' and
       (nullif(v_celda->>'tm_e','') is not null or nullif(v_celda->>'tm_s','') is not null) and
       (nullif(v_celda->>'tt_e','') is not null or nullif(v_celda->>'tt_s','') is not null) then
      raise exception 'Medio OFF admite una sola franja de trabajo' using errcode='22023';
    end if;
    if coalesce((v_celda->>'vacaciones_dia')::boolean,false)
       and coalesce(v_celda->>'descanso','')<>'' then
      raise exception 'No se pueden combinar Vacaciones y OFF' using errcode='22023';
    end if;
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
  if p_estado='inactivo' then
    v_inactivo_desde:=nullif(p_datos->p_semana::text->>'inactivo_desde','')::date;
    v_inactivo_desde:=coalesce(v_inactivo_desde,v_persona.inactivo_desde);
    if v_inactivo_desde is null then
      raise exception 'Indicá desde qué fecha está inactivo el colaborador' using errcode='22023';
    end if;
    if v_inactivo_desde>v_now::date then
      raise exception 'La fecha de inactividad no puede ser futura' using errcode='22023';
    end if;
  else
    v_inactivo_desde:=null;
  end if;
  update rm_test_private.munro_horarios_colaboradores
     set nombre=btrim(p_nombre),estado=p_estado,inactivo_desde=v_inactivo_desde,actualizado_at=now()
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
    estado_antes,estado_despues,inactivo_desde_antes,inactivo_desde_despues,editado_por)
  values(p_persona,p_semana,coalesce(v_prev.version,0),v_ver,
    coalesce(v_prev.datos,'{}'::jsonb),p_datos,v_persona.nombre,btrim(p_nombre),
    v_persona.estado,p_estado,v_persona.inactivo_desde,v_inactivo_desde,auth.uid());
  return jsonb_build_object('ok',true,'version',v_ver,'id',p_persona);
end $$;
