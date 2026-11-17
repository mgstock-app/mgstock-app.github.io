-- Mi Gusto Munro: correcciones auditadas de semanas manualmente finalizadas.
-- No reabre el cierre, no cambia el personal actual ni toca otros locales.
create table if not exists rm_test_private.munro_horarios_correcciones_cierre (
 id bigint generated always as identity primary key,
 semana date not null references rm_test_private.munro_horarios_semanas_cerradas(semana),
 colaborador_id integer not null,
 version_anterior integer not null,
 version_nueva integer not null,
 datos_antes jsonb not null,
 datos_despues jsonb not null,
 motivo text not null check (char_length(btrim(motivo)) between 5 and 200),
 corregido_por uuid not null,
 corregido_at timestamptz not null default now(),
 check (version_nueva=version_anterior+1)
);
alter table rm_test_private.munro_horarios_correcciones_cierre enable row level security;
revoke all on rm_test_private.munro_horarios_correcciones_cierre from public,anon,authenticated;

-- Las filas activas conservan su bloqueo. Únicamente se puede corregir el
-- snapshot archivado a través de este RPC con permisos y trazabilidad.
create or replace function public.rm_munro_horarios_corregir_cierre(
 p_persona integer, p_semana date, p_datos jsonb, p_version integer, p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_archivo rm_test_private.munro_horarios_semanas_cerradas%rowtype;
 v_registro jsonb;
 v_pos bigint;
 v_anterior jsonb;
 v_registros jsonb;
 v_modalidad text;
 v_ver integer;
 v_dia text;v_celda jsonb;v_campo text;v_hora text;
 v_e text;v_s text;v_tm_e integer;v_tm_s integer;v_tt_e integer;v_tt_s integer;
 v_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
 v_cierre boolean := true;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para corregir Horarios de Munro' using errcode='42501';
 end if;
 if p_persona is null or p_persona<1 or p_semana is null or
   extract(isodow from p_semana)<>1 or p_version is null or p_version<0 or
   coalesce(jsonb_typeof(p_datos),'')<>'object' or
   p_motivo is null or char_length(btrim(p_motivo)) not between 5 and 200 then
   raise exception 'Datos de corrección incorrectos' using errcode='22023';
 end if;
 select * into v_archivo from rm_test_private.munro_horarios_semanas_cerradas
 where semana=p_semana for update;
 if not found then
   raise exception 'Esta semana no tiene un cierre archivado; modificá los horarios de la semana directamente' using errcode='22023';
 end if;
 select j.value,j.ordinality into v_registro,v_pos
 from jsonb_array_elements(v_archivo.registros) with ordinality as j(value,ordinality)
 where (j.value->>'id')::integer=p_persona;
 if not found then raise exception 'Colaborador no incluido en el cierre de esta semana' using errcode='22023'; end if;
 v_modalidad:=v_registro->>'modalidad';
 if v_modalidad not in ('hora','turno') then
   raise exception 'Modalidad del cierre incorrecta' using errcode='22023';
 end if;
 v_ver:=coalesce((v_registro->>'version')::integer,0);
 if p_version<>v_ver then
   raise exception 'La semana fue corregida desde otro dispositivo. Actualizá para continuar' using errcode='40001';
 end if;

 -- Misma validación de horarios, descansos y extras que el guardado normal,
 -- pero siempre exigir turnos completos en semanas finalizadas.
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
        elsif v_modalidad='turno' then
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

 v_anterior:=coalesce(v_registro->'datos','{}'::jsonb);
 if v_anterior=p_datos then
   return jsonb_build_object('ok',true,'version',v_ver,'id',p_persona,'sin_cambios',true);
 end if;
 v_registros:=jsonb_set(v_archivo.registros,array[(v_pos-1)::text,'datos'],p_datos,false);
 v_registros:=jsonb_set(v_registros,array[(v_pos-1)::text,'version'],to_jsonb(v_ver+1),false);
 update rm_test_private.munro_horarios_semanas_cerradas
 set registros=v_registros where semana=p_semana;
 insert into rm_test_private.munro_horarios_correcciones_cierre
 (semana,colaborador_id,version_anterior,version_nueva,datos_antes,datos_despues,motivo,corregido_por)
 values(p_semana,p_persona,v_ver,v_ver+1,v_anterior,p_datos,btrim(p_motivo),auth.uid());
 return jsonb_build_object('ok',true,'version',v_ver+1,'id',p_persona,'corregido',true);
end $$;
revoke all on function public.rm_munro_horarios_corregir_cierre(integer,date,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_corregir_cierre(integer,date,jsonb,integer,text) to authenticated;
