
-- Staff Mi Gusto Munro: cierre manual y atómico de semana, snapshot inmutable.
-- NO cierra ninguna semana durante la migración; solo agrega infraestructura.
create table if not exists rm_test_private.munro_horarios_semanas_cerradas (
 semana date primary key check (extract(isodow from semana)=1),
 registros jsonb not null check (jsonb_typeof(registros)='array'),
 feriados jsonb not null default '[]'::jsonb check (jsonb_typeof(feriados)='array'),
 cerrado_at timestamptz not null default now(),
 cerrado_por uuid not null
);
alter table rm_test_private.munro_horarios_semanas_cerradas enable row level security;
revoke all on rm_test_private.munro_horarios_semanas_cerradas from public,anon,authenticated;

-- Una semana siguiente solo puede editarse tras el cierre manual de la anterior.
create or replace function rm_test_private.munro_horarios_semana_editable(p_semana date)
returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(
   p_semana is not null and extract(isodow from p_semana)=1
   and not exists (select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=p_semana)
   and (
     p_semana <= (now() at time zone 'America/Argentina/Buenos_Aires')::date
       - (extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires')::date)::integer - 1)
     or (
       p_semana = (now() at time zone 'America/Argentina/Buenos_Aires')::date
         - (extract(isodow from (now() at time zone 'America/Argentina/Buenos_Aires')::date)::integer - 1) + 7
       and exists (select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=p_semana-7)
     )
   ),false)
$$;
revoke all on function rm_test_private.munro_horarios_semana_editable(date) from public,anon,authenticated;

-- El historial no se puede sobrescribir, ni siquiera mediante viejos clientes.
create or replace function rm_test_private.munro_horarios_no_editar_cerrada()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_semana date;
begin
 v_semana:=case when tg_op='DELETE' then old.semana else new.semana end;
 if exists (select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=v_semana) then
   raise exception 'Esta semana está finalizada y guardada en Historial' using errcode='22023';
 end if;
 if tg_op='UPDATE' and old.semana<>new.semana and
   exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=old.semana) then
   raise exception 'No se puede modificar el origen de una semana cerrada' using errcode='22023';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function rm_test_private.munro_horarios_no_editar_cerrada() from public,anon,authenticated;
create trigger mhs_planillas_no_editar_cerrada
 before insert or update or delete on rm_test_private.munro_horarios_planillas
 for each row execute function rm_test_private.munro_horarios_no_editar_cerrada();
create trigger mhs_feriados_no_editar_cerrada
 before insert or update or delete on rm_test_private.munro_horarios_feriados
 for each row execute function rm_test_private.munro_horarios_no_editar_cerrada();

-- Añadir el cierre al motor de guardado EXISTENTE sin alterar sus validaciones.
do $patch$
declare d text; before text; after text;
begin
 d:=pg_get_functiondef('public.rm_munro_horarios_guardar(integer,date,text,text,jsonb,integer)'::regprocedure);
 before:=E'  if p_semana is null or extract(isodow from p_semana)<>1 or\n     p_semana>(v_now::date-((extract(isodow from v_now::date)::integer)-1)) then\n    raise exception ''Solo podés editar la semana actual o una anterior'' using errcode=''22023'';\n  end if;';
 after:=E'  if not rm_test_private.munro_horarios_semana_editable(p_semana) then\n    raise exception ''Esta semana está cerrada o todavía no se habilitó la siguiente'' using errcode=''22023'';\n  end if;';
 if position(before in d)=0 then raise exception 'Motor Guardar cambió: no se pudo aplicar cierre de manera segura'; end if;
 d:=replace(d,before,after);
 execute d;
 d:=pg_get_functiondef('public.rm_munro_horarios_feriados_guardar(date,jsonb,integer)'::regprocedure);
 before:=E'   p_semana>(v_ahora-((extract(isodow from v_ahora)::integer)-1)) or';
 after:=E'   not rm_test_private.munro_horarios_semana_editable(p_semana) or';
 if position(before in d)=0 then raise exception 'Motor Feriados cambió: no se pudo aplicar cierre de manera segura'; end if;
 d:=replace(d,before,after);
 execute d;
end $patch$;

-- Archivo atómico: congela el estado por empleado, turnos y feriados.
create or replace function public.rm_munro_horarios_finalizar_semana(p_semana date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_lunes date;
 v_registros jsonb;
 v_feriados jsonb;
 v_pendientes integer;
 v_total integer;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'No tenés permiso para finalizar Horarios de Munro' using errcode='42501';
 end if;
 v_lunes:=v_hoy-(extract(isodow from v_hoy)::integer-1);
 if p_semana is null or extract(isodow from p_semana)<>1 or p_semana>v_lunes then
   raise exception 'Solo se puede finalizar la semana actual o una anterior' using errcode='22023';
 end if;

 -- Bloquea modificaciones concurrentes antes de tomar el snapshot.
 lock table rm_test_private.munro_horarios_planillas in share row exclusive mode;
 lock table rm_test_private.munro_horarios_colaboradores in share row exclusive mode;
 lock table rm_test_private.munro_horarios_feriados in share row exclusive mode;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('munro_semana_finalizada'),pg_catalog.hashtext(p_semana::text));
 if exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas where semana=p_semana) then
   raise exception 'Esta semana ya fue finalizada. Consultala en Historial.' using errcode='22023';
 end if;
 select count(*) into v_total from rm_test_private.munro_horarios_planillas
   where semana=p_semana and btrim(nombre_semana)<>'';
 if v_total=0 then raise exception 'Todavía no hay horarios guardados para finalizar esta semana' using errcode='22023'; end if;
 select count(*) into v_pendientes
 from rm_test_private.munro_horarios_planillas p,
 lateral jsonb_each(p.datos) d,
 lateral (select d.value->>'tm_e' te,d.value->>'tm_s' ts,
                d.value->>'tt_e' ae,d.value->>'tt_s' asu) h
 where p.semana=p_semana
   and (
     (coalesce(h.te,'')='' and coalesce(h.ts,'')<>'') or
     (coalesce(h.te,'')<>'' and coalesce(h.ts,'')='') or
     (coalesce(h.ae,'')='' and coalesce(h.asu,'')<>'') or
     (coalesce(h.ae,'')<>'' and coalesce(h.asu,'')='')
   );
 if v_pendientes>0 then
   raise exception 'Hay entradas o salidas incompletas. Completalas antes de finalizar la semana' using errcode='22023';
 end if;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'nombre',coalesce(nullif(p.nombre_semana,''),c.nombre),
  'modalidad',coalesce(p.modalidad_semana,c.modalidad),
  'estado',c.estado,'inactivo_desde',c.inactivo_desde,
  'semana',p_semana,'datos',coalesce(p.datos,'{}'::jsonb),
  'version',coalesce(p.version,0)
 ) order by c.id),'[]'::jsonb) into v_registros
 from rm_test_private.munro_horarios_colaboradores c
 left join rm_test_private.munro_horarios_planillas p
   on p.colaborador_id=c.id and p.semana=p_semana
 where btrim(c.nombre)<>'' or p.colaborador_id is not null;

 select coalesce(f.dias,'[]'::jsonb) into v_feriados
 from rm_test_private.munro_horarios_feriados f where f.semana=p_semana;
 insert into rm_test_private.munro_horarios_semanas_cerradas(semana,registros,feriados,cerrado_por)
 values(p_semana,v_registros,coalesce(v_feriados,'[]'::jsonb),auth.uid());
 return jsonb_build_object('ok',true,'semana',p_semana,'siguiente_semana',p_semana+7,
   'colaboradores',jsonb_array_length(v_registros),'archivado',true);
end $$;
revoke all on function public.rm_munro_horarios_finalizar_semana(date) from public,anon;
grant execute on function public.rm_munro_horarios_finalizar_semana(date) to authenticated;

-- Lectura compatible con las planillas y el historial anteriores (Google Sheets intacto).
create or replace function public.rm_munro_horarios_obtener(p_semana date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_actual date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_lunes date;
 v_semana date;
 v_personas jsonb;
 v_planillas jsonb;
 v_historial jsonb;
 v_feriados jsonb;
 v_feriados_version integer;
 v_feriados_historial jsonb;
 v_cerrada boolean;
 v_cierres jsonb;
 v_ultima_cerrada date;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_ver('munro') then
   raise exception 'Sin permiso para Horarios de Munro' using errcode='42501';
 end if;
 v_lunes:=v_actual-(extract(isodow from v_actual)::integer-1);
 v_semana:=coalesce(p_semana,v_lunes);
 if extract(isodow from v_semana)<>1 then
   raise exception 'Elegí el lunes de la semana' using errcode='22023';
 end if;
 select max(semana) into v_ultima_cerrada from rm_test_private.munro_horarios_semanas_cerradas;
 select exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas where semana=v_semana) into v_cerrada;
 select coalesce(jsonb_agg(c.semana order by c.semana desc),'[]'::jsonb) into v_cierres
 from rm_test_private.munro_horarios_semanas_cerradas c;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'nombre',c.nombre,'modalidad',c.modalidad,'estado',c.estado,'inactivo_desde',c.inactivo_desde
 ) order by c.id),'[]'::jsonb) into v_personas
 from rm_test_private.munro_horarios_colaboradores c
 where v_ultima_cerrada is null or v_semana<=v_ultima_cerrada
   or c.estado<>'inactivo'
   or exists(select 1 from rm_test_private.munro_horarios_planillas p where p.colaborador_id=c.id and p.semana=v_semana);

 if v_cerrada then
   select coalesce(c.registros,'[]'::jsonb) into v_planillas
   from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=v_semana;
 else
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana,'version',p.version
   ) order by p.colaborador_id),'[]'::jsonb) into v_planillas
   from rm_test_private.munro_horarios_planillas p where p.semana=v_semana;
 end if;

 -- Historial: snapshots de cierres manuales + legados de semanas anteriores,
 -- sin duplicar las semanas ya archivadas.
 with rows as (
  select c.semana as dia,(item.value->>'id')::integer as id,item.value as registro
  from rm_test_private.munro_horarios_semanas_cerradas c
  cross join lateral jsonb_array_elements(c.registros) item
  union all
  select p.semana as dia,p.colaborador_id as id,jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana,'version',p.version
  ) as registro
  from rm_test_private.munro_horarios_planillas p
  where p.semana<v_lunes
   and not exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=p.semana)
 )
 select coalesce(jsonb_agg(r.registro order by r.dia desc,r.id),'[]'::jsonb)
 into v_historial from (select * from rows order by dia desc,id limit 1500) r;

 select coalesce(f.dias,'[]'::jsonb),coalesce(f.version,0)
 into v_feriados,v_feriados_version
 from rm_test_private.munro_horarios_feriados f where f.semana=v_semana;
 select coalesce(jsonb_object_agg(f.semana::text,f.dias),'{}'::jsonb)
 into v_feriados_historial from rm_test_private.munro_horarios_feriados f
 where f.semana<v_lunes or exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=f.semana);
 return jsonb_build_object('semana',v_semana,'personas',v_personas,'planillas',v_planillas,
   'historial',v_historial,'puede_editar',rm_test_private.horarios_puede_archivar('munro'),
   'semana_cerrada',v_cerrada,'cierres',v_cierres,
   'feriados',coalesce(v_feriados,'[]'::jsonb),
   'feriados_version',coalesce(v_feriados_version,0),
   'feriados_historial',coalesce(v_feriados_historial,'{}'::jsonb));
end $$;
revoke all on function public.rm_munro_horarios_obtener(date) from public,anon;
grant execute on function public.rm_munro_horarios_obtener(date) to authenticated;
