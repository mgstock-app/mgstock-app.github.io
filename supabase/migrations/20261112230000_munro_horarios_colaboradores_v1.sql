-- Mi Gusto · Munro: nueva planilla nativa de Horarios de colaboradores.
-- No reemplaza ni borra los archivos anteriores de Google Sheets.
-- Toda la información queda en esquema privado y se accede solo mediante RPC autenticados.
create table if not exists rm_test_private.munro_horarios_colaboradores (
  id integer primary key,
  nombre text not null default '' check (char_length(nombre) <= 80),
  modalidad text not null check (modalidad in ('turno','hora')),
  estado text not null default 'activo' check (estado in ('activo','refuerzo','inactivo')),
  actualizado_at timestamptz not null default now()
);
create table if not exists rm_test_private.munro_horarios_planillas (
  colaborador_id integer not null references rm_test_private.munro_horarios_colaboradores(id),
  semana date not null check (extract(isodow from semana) = 1),
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  nombre_semana text not null,
  modalidad_semana text not null check (modalidad_semana in ('turno','hora')),
  version integer not null default 1 check (version > 0),
  actualizado_por uuid,
  actualizado_at timestamptz not null default now(),
  primary key (colaborador_id,semana)
);
create index if not exists munro_horarios_planillas_semana_idx
  on rm_test_private.munro_horarios_planillas(semana desc);
alter table rm_test_private.munro_horarios_colaboradores enable row level security;
alter table rm_test_private.munro_horarios_planillas enable row level security;
revoke all on rm_test_private.munro_horarios_colaboradores,rm_test_private.munro_horarios_planillas
  from public,anon,authenticated;

-- Tres puestos fijos por turno y cinco por hora. Nadie recibe nombre ficticio.
insert into rm_test_private.munro_horarios_colaboradores(id,modalidad)
  select i,case when i<=3 then 'turno' else 'hora' end
  from generate_series(1,8) as i
on conflict (id) do nothing;

create or replace function public.rm_munro_horarios_obtener(p_semana date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actual date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_semana date;
  v_personas jsonb;
  v_planillas jsonb;
  v_historial jsonb;
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
  return jsonb_build_object('semana',v_semana,'personas',v_personas,'planillas',v_planillas,
    'historial',v_historial,'puede_editar',rm_test_private.horarios_puede_archivar('munro'));
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
  if p_persona is null or p_persona<1 or p_version<0 or
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
  -- Horarios parciales son válidos hasta el domingo 23:30, como en Motos Agencia.
  v_cierre := p_semana<(v_now::date-((extract(isodow from v_now::date)::integer)-1))
    or (extract(isodow from v_now::date)=7 and
        (extract(hour from v_now)::integer*60+extract(minute from v_now)::integer)>=1410);
  for v_dia,v_celda in select key,value from jsonb_each(p_datos) loop
    if v_dia !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} or
      v_dia::date<p_semana or v_dia::date>p_semana+6 or
      jsonb_typeof(v_celda)<>'object' then
      raise exception 'Día fuera de la semana' using errcode='22023';
    end if;
    for v_campo,v_hora in select key, value#>>'{}' from jsonb_each(v_celda) loop
      if v_campo not in ('tm_e','tm_s','tt_e','tt_s','feriado') then
        raise exception 'Campo horario no permitido' using errcode='22023';
      end if;
      if v_campo='feriado' then
        if jsonb_typeof(v_celda->v_campo)<>'boolean' then
          raise exception 'El feriado debe ser sí o no' using errcode='22023';
        end if;
      elsif coalesce(v_hora,'')<>'' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Usá horas HH:MM válidas' using errcode='22023';
      end if;
    end loop;
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
  select * into v_prev from rm_test_private.munro_horarios_planillas
    where colaborador_id=p_persona and semana=p_semana for update;
  v_ver:=case when found then v_prev.version else 0 end;
  if v_ver<>p_version then
    raise exception 'Otra persona modificó esta semana. Actualizá antes de guardar.' using errcode='40001';
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
  return jsonb_build_object('ok',true,'version',v_ver,'id',p_persona);
end $$;

create or replace function public.rm_munro_horarios_agregar(p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id integer;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para agregar colaboradores' using errcode='42501';
 end if;
 if nullif(btrim(coalesce(p_nombre,'')),'') is null or char_length(btrim(p_nombre))>80 then
   raise exception 'Ingresá un nombre de hasta 80 caracteres' using errcode='22023';
 end if;
 lock table rm_test_private.munro_horarios_colaboradores in share row exclusive mode;
 select coalesce(max(id),8)+1 into v_id from rm_test_private.munro_horarios_colaboradores;
 if v_id>120 then raise exception 'Límite de colaboradores alcanzado' using errcode='22023';end if;
 insert into rm_test_private.munro_horarios_colaboradores(id,nombre,modalidad,estado)
 values(v_id,btrim(p_nombre),'hora','activo');
 return jsonb_build_object('id',v_id,'nombre',btrim(p_nombre),'modalidad','hora','estado','activo');
end $$;
revoke all on function public.rm_munro_horarios_obtener(date),
  public.rm_munro_horarios_guardar(integer,date,text,text,jsonb,integer),
  public.rm_munro_horarios_agregar(text) from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_obtener(date),
  public.rm_munro_horarios_guardar(integer,date,text,text,jsonb,integer),
  public.rm_munro_horarios_agregar(text) to authenticated;
 or
      v_dia::date<p_semana or v_dia::date>p_semana+6 or
      jsonb_typeof(v_celda)<>'object' then
      raise exception 'Día fuera de la semana' using errcode='22023';
    end if;
    for v_campo,v_hora in select key, value#>>'{}' from jsonb_each(v_celda) loop
      if v_campo not in ('tm_e','tm_s','tt_e','tt_s','feriado') then
        raise exception 'Campo horario no permitido' using errcode='22023';
      end if;
      if v_campo='feriado' then
        if jsonb_typeof(v_celda->v_campo)<>'boolean' then
          raise exception 'El feriado debe ser sí o no' using errcode='22023';
        end if;
      elsif coalesce(v_hora,'')<>'' and v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Usá horas HH:MM válidas' using errcode='22023';
      end if;
    end loop;
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
  select * into v_prev from rm_test_private.munro_horarios_planillas
    where colaborador_id=p_persona and semana=p_semana for update;
  v_ver:=case when found then v_prev.version else 0 end;
  if v_ver<>p_version then
    raise exception 'Otra persona modificó esta semana. Actualizá antes de guardar.' using errcode='40001';
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
  return jsonb_build_object('ok',true,'version',v_ver,'id',p_persona);
end $$;

create or replace function public.rm_munro_horarios_agregar(p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id integer;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para agregar colaboradores' using errcode='42501';
 end if;
 if nullif(btrim(coalesce(p_nombre,'')),'') is null or char_length(btrim(p_nombre))>80 then
   raise exception 'Ingresá un nombre de hasta 80 caracteres' using errcode='22023';
 end if;
 lock table rm_test_private.munro_horarios_colaboradores in share row exclusive mode;
 select coalesce(max(id),8)+1 into v_id from rm_test_private.munro_horarios_colaboradores;
 if v_id>120 then raise exception 'Límite de colaboradores alcanzado' using errcode='22023';end if;
 insert into rm_test_private.munro_horarios_colaboradores(id,nombre,modalidad,estado)
 values(v_id,btrim(p_nombre),'hora','activo');
 return jsonb_build_object('id',v_id,'nombre',btrim(p_nombre),'modalidad','hora','estado','activo');
end $$;
revoke all on function public.rm_munro_horarios_obtener(date),
  public.rm_munro_horarios_guardar(integer,date,text,text,jsonb,integer),
  public.rm_munro_horarios_agregar(text) from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_obtener(date),
  public.rm_munro_horarios_guardar(integer,date,text,text,jsonb,integer),
  public.rm_munro_horarios_agregar(text) to authenticated;
